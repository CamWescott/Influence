// Cloud Functions:
//   claude     — proxies the Anthropic Claude API (key: ANTHROPIC_API_KEY)
//   hfInpaint  — proxies Hugging Face SD inpainting  (key: HF_API_KEY)
//
// Keys are stored in Firebase Secret Manager and never reach the browser.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");
const HF_API_KEY        = defineSecret("HF_API_KEY");

const MODEL = "claude-haiku-4-5-20251001";
const MAX_PROMPT_CHARS = 8000;
const MAX_OUTPUT_TOKENS = 3000;

exports.claude = onRequest(
  {
    secrets: [ANTHROPIC_API_KEY],
    cors: true,
    invoker: "public",
    timeoutSeconds: 120,
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      res.status(405).json({ error: "Method not allowed" });
      return;
    }

    const started = Date.now();
    try {
      const body = req.body || {};
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 2000, 100), MAX_OUTPUT_TOKENS);

      if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
        res.status(400).json({ error: "Invalid prompt" });
        return;
      }

      console.log("Claude call start", { model: MODEL, maxTokens, promptChars: prompt.length });

      const upstream = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY.value(),
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!upstream.ok) {
        const errText = await upstream.text();
        console.error("Anthropic error", upstream.status, errText);
        res.status(502).json({ error: "Upstream error", status: upstream.status });
        return;
      }

      const data = await upstream.json();
      const block = (data.content || []).find((b) => b.type === "text");
      const elapsedMs = Date.now() - started;
      console.log("Claude call done", { elapsedMs, textChars: block ? block.text.length : 0 });
      res.json({ text: block ? block.text : "" });
    } catch (err) {
      const elapsedMs = Date.now() - started;
      console.error("Function error", { elapsedMs, message: err && err.message });
      res.status(500).json({ error: "Internal error" });
    }
  }
);

// ---------------------------------------------------------------------------
// Hugging Face Stable Diffusion Inpainting proxy
// Accepts: { image_b64: string, mask_b64: string, prompt: string }
// Returns: { result: "data:image/jpeg;base64,..." }
// ---------------------------------------------------------------------------
// FLUX.1-Fill-dev is HF's own hosted inpainting model (FLUX family).
// Fallback chain: Fill-dev → Fill-schnell → give up (SD models not on hf-inference free tier)
const HF_MODELS = [
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Fill-dev",
  "https://router.huggingface.co/hf-inference/models/black-forest-labs/FLUX.1-Fill-schnell",
];
const HF_MAX_RETRIES  = 4;
const HF_MAX_B64_BYTES = 4 * 1024 * 1024; // 4 MB per image (512×512 PNG is ~350 KB)

async function callHuggingFace(imageB64, maskB64, prompt, apiKey, retriesLeft, modelIndex) {
  const modelUrl = HF_MODELS[modelIndex || 0];
  const res = await fetch(modelUrl, {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + apiKey,
      "Content-Type": "application/json",
      "Accept": "image/png,image/jpeg,*/*",
    },
    body: JSON.stringify({
      inputs: prompt,
      parameters: {
        image:               imageB64,
        mask_image:          maskB64,
        num_inference_steps: 28,
        guidance_scale:      3.5,
      },
    }),
  });

  // Model not on this provider — try next model in the list
  if (res.status === 400) {
    const body = await res.json().catch(function () { return {}; });
    const nextIndex = (modelIndex || 0) + 1;
    if (nextIndex < HF_MODELS.length) {
      console.log("Model not supported, trying fallback model", nextIndex);
      return callHuggingFace(imageB64, maskB64, prompt, apiKey, retriesLeft, nextIndex);
    }
    throw new Error(body.error || "No supported inpainting model found on hf-inference provider");
  }

  // Model cold-start — wait the estimated time then retry
  if (res.status === 503 && retriesLeft > 0) {
    const body = await res.json().catch(function () { return {}; });
    const waitMs = Math.min((body.estimated_time || 20) * 1000 + 2000, 35000);
    console.log("HF model loading, waiting", waitMs + "ms,", retriesLeft, "retries left");
    await new Promise(function (r) { setTimeout(r, waitMs); });
    return callHuggingFace(imageB64, maskB64, prompt, apiKey, retriesLeft - 1, modelIndex);
  }

  return res;
}

exports.hfInpaint = onRequest(
  {
    secrets: [HF_API_KEY],
    cors: true,
    invoker: "public",
    timeoutSeconds: 180,   // generous — HF cold starts can take 60s+
    memory: "512MiB",
  },
  async (req, res) => {
    if (req.method === "OPTIONS") { res.status(204).send(""); return; }
    if (req.method !== "POST")    { res.status(405).json({ error: "Method not allowed" }); return; }

    const started = Date.now();
    try {
      const { image_b64, mask_b64, prompt } = req.body || {};

      if (!image_b64 || !mask_b64 || !prompt) {
        res.status(400).json({ error: "Missing image_b64, mask_b64, or prompt" });
        return;
      }
      if (image_b64.length > HF_MAX_B64_BYTES || mask_b64.length > HF_MAX_B64_BYTES) {
        res.status(400).json({ error: "Image too large" });
        return;
      }

      console.log("HF inpaint start", { promptChars: prompt.length });

      const upstream = await callHuggingFace(
        image_b64, mask_b64,
        String(prompt).slice(0, 500),
        HF_API_KEY.value(),
        HF_MAX_RETRIES
      );

      if (!upstream.ok) {
        const errText = await upstream.text();
        console.error("HF error", upstream.status, errText);
        res.status(502).json({ error: "HF upstream error", status: upstream.status });
        return;
      }

      const buffer   = await upstream.arrayBuffer();
      const mimeType = upstream.headers.get("content-type") || "image/jpeg";
      const b64      = Buffer.from(buffer).toString("base64");
      const elapsedMs = Date.now() - started;

      console.log("HF inpaint done", { elapsedMs, bytes: buffer.byteLength });
      res.json({ result: "data:" + mimeType + ";base64," + b64 });

    } catch (err) {
      const elapsedMs = Date.now() - started;
      console.error("HF function error", { elapsedMs, message: err && err.message });
      res.status(500).json({ error: "Internal error" });
    }
  }
);
