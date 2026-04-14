// Hugging Face Stable Diffusion Inpainting integration.
// Sets up window.WanderlustImageEdit so ai-touchup.js uses real AI instead of
// the canvas heuristic.  The user's HF token is saved in localStorage and
// never sent anywhere except directly to api-inference.huggingface.co.
(function () {
  "use strict";

  const TOKEN_KEY   = "wanderlust_hf_token";
  const BUILT_IN_TOKEN = "";   // intentionally empty — key is stored in localStorage via the UI
  const MODEL_URL   = "https://api-inference.huggingface.co/models/runwayml/stable-diffusion-inpainting";
  const FIT_SIZE    = 512;   // SD 1.5 inpainting optimal input resolution
  const MAX_RETRIES = 4;     // cold-start retries

  // ---- Token storage ----
  // localStorage entry (set via the UI) takes priority; BUILT_IN_TOKEN is the fallback.
  function getToken()   { return (localStorage.getItem(TOKEN_KEY) || BUILT_IN_TOKEN || "").trim(); }
  function saveToken(t) { localStorage.setItem(TOKEN_KEY, t.trim()); }

  // ---- Canvas helpers ----

  // Fit srcCanvas inside FIT_SIZE × FIT_SIZE, letterbox with black.
  // Returns { canvas, x, y, fitW, fitH } so we can extract the right region later.
  function fitCanvas(srcCanvas) {
    const sw = srcCanvas.width, sh = srcCanvas.height;
    const scale = Math.min(FIT_SIZE / sw, FIT_SIZE / sh, 1);
    const fitW  = Math.round(sw * scale);
    const fitH  = Math.round(sh * scale);
    const x     = Math.round((FIT_SIZE - fitW) / 2);
    const y     = Math.round((FIT_SIZE - fitH) / 2);
    const tc    = document.createElement("canvas");
    tc.width    = FIT_SIZE; tc.height = FIT_SIZE;
    const ctx   = tc.getContext("2d");
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, FIT_SIZE, FIT_SIZE);
    ctx.drawImage(srcCanvas, x, y, fitW, fitH);
    return { canvas: tc, x, y, fitW, fitH };
  }

  function dataUrlToCanvas(dataUrl) {
    return new Promise(function (resolve, reject) {
      const img = new Image();
      img.onload  = function () {
        const tc = document.createElement("canvas");
        tc.width = img.width; tc.height = img.height;
        tc.getContext("2d").drawImage(img, 0, 0);
        resolve(tc);
      };
      img.onerror = reject;
      img.src = dataUrl;
    });
  }

  function canvasToBase64(canvas) {
    return canvas.toDataURL("image/png").split(",")[1];
  }

  // ---- Status helper (updates the overlay while processing) ----
  function setStatus(msg) {
    const el = document.getElementById("aiTouchupProcessing");
    if (!el) return;
    // Replace everything after the spinner span
    const span = el.querySelector(".touchup-spinner");
    if (span && span.nextSibling) {
      span.nextSibling.textContent = " " + msg;
    }
  }

  // ---- HF API call with cold-start retry ----
  async function callHF(imageDataUrl, maskDataUrl, prompt, attemptsLeft) {
    const token = getToken();
    if (!token) return null;

    // Convert to FIT_SIZE canvases
    const [imgSrc, maskSrc] = await Promise.all([
      dataUrlToCanvas(imageDataUrl),
      dataUrlToCanvas(maskDataUrl),
    ]);
    const imgFit  = fitCanvas(imgSrc);
    const maskFit = fitCanvas(maskSrc);

    setStatus("Sending to Hugging Face\u2026");

    const res = await fetch(MODEL_URL, {
      method: "POST",
      headers: {
        "Authorization": "Bearer " + token,
        "Content-Type": "application/json",
        "Accept": "image/png,image/jpeg,*/*",
      },
      body: JSON.stringify({
        inputs: prompt,
        parameters: {
          image:               canvasToBase64(imgFit.canvas),
          mask_image:          canvasToBase64(maskFit.canvas),
          num_inference_steps: 25,
          guidance_scale:      7.5,
          strength:            0.99,
        },
      }),
    });

    // 503 = model cold-starting; wait then retry
    if (res.status === 503) {
      const body = await res.json().catch(function () { return {}; });
      if (attemptsLeft > 0) {
        const wait = Math.min((body.estimated_time || 20) * 1000 + 2000, 35000);
        setStatus("Warming up AI model\u2026 (~" + Math.round(wait / 1000) + "s)");
        await new Promise(function (r) { setTimeout(r, wait); });
        return callHF(imageDataUrl, maskDataUrl, prompt, attemptsLeft - 1);
      }
      throw new Error("Model is still loading. Please try again in ~30 seconds.");
    }

    if (!res.ok) {
      const body = await res.json().catch(function () { return {}; });
      // Friendly messages for common errors
      if (res.status === 401) throw new Error("Invalid API key. Check the key in AI Tools.");
      if (res.status === 400) throw new Error("Model rejected the request: " + (body.error || res.status));
      throw new Error(body.error || "Hugging Face error " + res.status);
    }

    // Success: blob → object URL
    const blob = await res.blob();
    return {
      blobUrl: URL.createObjectURL(blob),
      fit:     imgFit,   // we need this to un-letterbox the result
    };
  }

  // ---- Public edit function ----
  window.WanderlustImageEdit = {
    hasKey: function () { return !!getToken(); },

    edit: async function (imageDataUrl, maskDataUrl, prompt, W, H) {
      const token = getToken();
      if (!token) return null;   // no key → fall through to canvas fill

      const result = await callHF(imageDataUrl, maskDataUrl, prompt, MAX_RETRIES);
      if (!result) return null;

      setStatus("Applying result\u2026");

      // Load the 512×512 result image
      const resultImg = await new Promise(function (res, rej) {
        const img = new Image();
        img.onload  = function () { res(img); };
        img.onerror = rej;
        img.src     = result.blobUrl;
      });
      URL.revokeObjectURL(result.blobUrl);

      // Extract only the letterboxed region, scale back to W × H
      const { x, y, fitW, fitH } = result.fit;
      const out = document.createElement("canvas");
      out.width = W; out.height = H;
      out.getContext("2d").drawImage(resultImg, x, y, fitW, fitH, 0, 0, W, H);
      return out.toDataURL("image/jpeg", 0.92);
    },
  };

  // ---- Wire the key-entry UI ----
  function wireUI() {
    const input   = document.getElementById("hfApiKeyInput");
    const saveBtn = document.getElementById("hfApiKeySave");
    const status  = document.getElementById("hfApiKeyStatus");
    if (!input || !saveBtn) return;

    // Pre-fill with stored key (masked for display)
    const stored = getToken();
    if (stored) input.value = stored;

    saveBtn.addEventListener("click", function () {
      const val = input.value.trim();
      if (!val) {
        showStatus("Enter your HF token.", "error"); return;
      }
      if (!val.startsWith("hf_")) {
        showStatus("HF tokens start with \u2018hf_\u2019.", "error"); return;
      }
      saveToken(val);
      showStatus("\u2713 Key saved \u2014 real AI is now active!", "ok");
    });

    function showStatus(msg, type) {
      if (!status) return;
      status.textContent = msg;
      status.className   = "hf-key-status " + (type || "");
      clearTimeout(status._t);
      if (type === "ok") status._t = setTimeout(function () { status.textContent = ""; }, 3000);
    }

    // If a key is already stored, show a checkmark
    if (stored) showStatus("\u2713 AI key active", "ok");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", wireUI);
  } else {
    wireUI();
  }
})();
