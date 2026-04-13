// Cloud Function that proxies requests to the Anthropic Claude API.
//
// The Anthropic API key is stored as a Firebase secret named
// ANTHROPIC_API_KEY (see README for setup). It never reaches the browser,
// so test users can generate real Claude content without you exposing the key.

const { onRequest } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { setGlobalOptions } = require("firebase-functions/v2");

setGlobalOptions({ region: "us-central1", maxInstances: 10 });

const ANTHROPIC_API_KEY = defineSecret("ANTHROPIC_API_KEY");

const MODEL = "claude-opus-4-6";
const MAX_PROMPT_CHARS = 8000;

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

    try {
      const body = req.body || {};
      const prompt = typeof body.prompt === "string" ? body.prompt : "";
      const maxTokens = Math.min(Math.max(parseInt(body.maxTokens, 10) || 2000, 100), 4096);

      if (!prompt || prompt.length > MAX_PROMPT_CHARS) {
        res.status(400).json({ error: "Invalid prompt" });
        return;
      }

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
      res.json({ text: block ? block.text : "" });
    } catch (err) {
      console.error("Function error", err);
      res.status(500).json({ error: "Internal error" });
    }
  }
);
