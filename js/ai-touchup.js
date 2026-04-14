// AI Touchup — freehand lasso selection tool for direct photo editing.
// An overlay <canvas> sits on top of the photo canvas; it captures mouse/touch
// events only while touchup mode is active (pointer-events toggled via JS).
//
// Processing pipeline:
//   1. Try window.WanderlustImageEdit.edit(imageDataUrl, maskDataUrl, prompt)
//      if the host app provides a real inpainting API.
//   2. Fall back to a multi-pass "push from boundary" canvas inpainting that
//      fills the masked area with surrounding pixel colours.
(function () {
  "use strict";

  // ---- DOM refs ----
  const photoCanvas   = document.getElementById("photoCanvas");
  const overlay       = document.getElementById("touchupOverlay");
  const btn           = document.getElementById("aiTouchupBtn");
  const modal         = document.getElementById("aiTouchupModal");
  const promptInput   = document.getElementById("aiTouchupInput");
  const applyBtn      = document.getElementById("aiTouchupApply");
  const cancelBtn     = document.getElementById("aiTouchupCancel");
  const processingEl  = document.getElementById("aiTouchupProcessing");

  if (!photoCanvas || !overlay || !btn) return;
  const octx = overlay.getContext("2d");

  // ---- State ----
  let touchupMode      = false;
  let drawing          = false;
  let selectionClosed  = false;
  let lassoPts         = [];   // canvas-pixel coordinates
  let marchOffset      = 0;
  let marchRaf         = null;

  // ---- Sync overlay pixel dimensions to match the photo canvas ----
  function syncSize() {
    if (overlay.width !== photoCanvas.width || overlay.height !== photoCanvas.height) {
      overlay.width  = photoCanvas.width;
      overlay.height = photoCanvas.height;
    }
  }
  new MutationObserver(syncSize).observe(photoCanvas, {
    attributes: true, attributeFilter: ["width", "height"],
  });
  syncSize();

  // ---- Helpers ----
  function canvasCoords(clientX, clientY) {
    const r = overlay.getBoundingClientRect();
    return {
      x: (clientX - r.left) * (overlay.width  / r.width),
      y: (clientY - r.top)  * (overlay.height / r.height),
    };
  }

  function clearOverlay() {
    octx.clearRect(0, 0, overlay.width, overlay.height);
  }

  function fillRoundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y,     x + w, y + h, r);
    c.arcTo(x + w, y + h, x,     y + h, r);
    c.arcTo(x,     y + h, x,     y,     r);
    c.arcTo(x,     y,     x + w, y,     r);
    c.closePath();
    c.fill();
  }

  function showHint() {
    clearOverlay();
    octx.save();
    octx.font = "bold 15px 'Quicksand', sans-serif";
    octx.textAlign = "center";
    octx.textBaseline = "middle";
    const cx = overlay.width / 2, cy = overlay.height / 2;
    octx.fillStyle = "rgba(0,0,0,0.45)";
    fillRoundRect(octx, cx - 170, cy - 22, 340, 44, 10);
    octx.fillStyle = "#fff";
    octx.fillText("Draw a circle around what you want to change", cx, cy);
    octx.restore();
  }

  function drawLasso(pts, closed) {
    if (pts.length < 2) return;
    clearOverlay();
    octx.save();
    // Marching ants outer glow (dark)
    octx.lineWidth = 3.5;
    octx.strokeStyle = "rgba(0,0,0,0.5)";
    octx.setLineDash([]);
    octx.beginPath();
    octx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
    if (closed) octx.closePath();
    octx.stroke();

    // Marching ants white dashes
    octx.lineWidth = 2;
    octx.strokeStyle = "rgba(255,255,255,0.95)";
    octx.setLineDash([7, 4]);
    octx.lineDashOffset = -marchOffset;
    octx.shadowColor = "rgba(0,0,0,0.3)";
    octx.shadowBlur = 2;
    octx.beginPath();
    octx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) octx.lineTo(pts[i].x, pts[i].y);
    if (closed) octx.closePath();
    octx.stroke();

    // Fill tint for closed selection
    if (closed) {
      octx.fillStyle = "rgba(124, 58, 237, 0.12)";
      octx.fill();
    }
    octx.restore();
  }

  function startMarchingAnts() {
    if (marchRaf) return;
    (function tick() {
      marchOffset = (marchOffset + 0.6) % 11;
      if (selectionClosed) drawLasso(lassoPts, true);
      marchRaf = requestAnimationFrame(tick);
    })();
  }

  function stopMarchingAnts() {
    if (marchRaf) { cancelAnimationFrame(marchRaf); marchRaf = null; }
  }

  // ---- Activate / deactivate ----
  function activate() {
    if (!photoCanvas.classList.contains("loaded")) {
      showMiniToast("Upload a photo first!", true); return;
    }
    touchupMode = true;
    lassoPts = []; drawing = false; selectionClosed = false;
    syncSize();
    overlay.style.pointerEvents = "auto";
    overlay.style.cursor = "crosshair";
    btn.textContent = "\u2715 Cancel Touchup";
    btn.classList.add("active");
    hideModal(); hideProcessing();
    showHint();
  }

  function deactivate() {
    touchupMode = false;
    drawing = false; selectionClosed = false; lassoPts = [];
    overlay.style.pointerEvents = "none";
    overlay.style.cursor = "";
    btn.textContent = "\uD83E\uDE84 AI Touchup";
    btn.classList.remove("active");
    stopMarchingAnts(); clearOverlay();
    hideModal(); hideProcessing();
  }

  // ---- Modal ----
  function showModal() {
    if (!modal) return;
    if (promptInput) promptInput.value = "";
    modal.classList.add("visible");
    if (promptInput) promptInput.focus();
  }
  function hideModal() { modal && modal.classList.remove("visible"); }

  function showProcessing() {
    if (processingEl) processingEl.style.display = "flex";
    // Draw a spinner hint on the overlay
    const cx = overlay.width / 2, cy = overlay.height / 2;
    clearOverlay();
    octx.save();
    octx.fillStyle = "rgba(0,0,0,0.45)";
    fillRoundRect(octx, cx - 110, cy - 22, 220, 44, 10);
    octx.font = "bold 14px 'Quicksand', sans-serif";
    octx.textAlign = "center"; octx.textBaseline = "middle";
    octx.fillStyle = "#fff";
    octx.fillText("\u23F3 Applying edit\u2026", cx, cy);
    octx.restore();
  }
  function hideProcessing() { if (processingEl) processingEl.style.display = "none"; }

  // ---- Toast (reuse magic toast or create own) ----
  function showMiniToast(msg, isErr) {
    let t = document.getElementById("magicToast");
    if (!t) {
      t = document.createElement("div"); t.id = "magicToast"; t.className = "magic-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "magic-toast" + (isErr ? " error" : "") + " visible";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("visible"); }, 3200);
  }

  // ---- Lasso events ----
  function onPointerDown(cx, cy) {
    if (!touchupMode) return;
    if (selectionClosed) {
      selectionClosed = false; lassoPts = []; stopMarchingAnts(); hideModal();
    }
    drawing = true;
    lassoPts = [canvasCoords(cx, cy)];
  }
  function onPointerMove(cx, cy) {
    if (!touchupMode || !drawing) return;
    const p = canvasCoords(cx, cy);
    const last = lassoPts[lassoPts.length - 1];
    const dx = p.x - last.x, dy = p.y - last.y;
    if (dx * dx + dy * dy < 9) return;
    lassoPts.push(p);
    drawLasso(lassoPts, false);
  }
  function onPointerUp() {
    if (!touchupMode || !drawing) return;
    drawing = false;
    if (lassoPts.length < 5) { clearOverlay(); lassoPts = []; showHint(); return; }
    selectionClosed = true;
    startMarchingAnts();
    showModal();
  }

  overlay.addEventListener("mousedown",  function (e) { onPointerDown(e.clientX, e.clientY); });
  overlay.addEventListener("mousemove",  function (e) { onPointerMove(e.clientX, e.clientY); });
  overlay.addEventListener("mouseup",    function ()  { onPointerUp(); });
  overlay.addEventListener("mouseleave", function ()  { if (drawing) onPointerUp(); });

  overlay.addEventListener("touchstart", function (e) {
    const t = e.touches[0]; onPointerDown(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  overlay.addEventListener("touchmove", function (e) {
    const t = e.touches[0]; onPointerMove(t.clientX, t.clientY); e.preventDefault();
  }, { passive: false });
  overlay.addEventListener("touchend", function (e) { onPointerUp(); e.preventDefault(); }, { passive: false });

  // ---- Button wiring ----
  btn.addEventListener("click", function () {
    if (touchupMode) deactivate(); else activate();
  });
  if (applyBtn) applyBtn.addEventListener("click", function () {
    const prompt = (promptInput ? promptInput.value : "").trim();
    if (!prompt) { if (promptInput) promptInput.focus(); return; }
    applyEdit(prompt);
  });
  if (cancelBtn) cancelBtn.addEventListener("click", deactivate);
  if (promptInput) {
    promptInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); applyBtn && applyBtn.click(); }
      if (e.key === "Escape") deactivate();
    });
  }

  // ---- Point-in-polygon (ray casting) ----
  function pointInPolygon(px, py, pts) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x, yi = pts[i].y, xj = pts[j].x, yj = pts[j].y;
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) inside = !inside;
    }
    return inside;
  }

  // ---- Canvas inpainting (multi-pass push from boundary) ----
  function inpaintPixels(pixels, W, H, maskPts) {
    // Bounding box of selection for efficiency.
    let minX = W, maxX = 0, minY = H, maxY = 0;
    maskPts.forEach(function (p) {
      if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y;
    });
    minX = Math.max(0, Math.floor(minX) - 1);
    maxX = Math.min(W - 1, Math.ceil(maxX) + 1);
    minY = Math.max(0, Math.floor(minY) - 1);
    maxY = Math.min(H - 1, Math.ceil(maxY) + 1);

    // Build mask.
    const mask   = new Uint8Array(W * H);
    const filled = new Uint8Array(W * H);
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (pointInPolygon(x + 0.5, y + 0.5, maskPts)) mask[y * W + x] = 1;
      }
    }

    // Working buffer (float for accuracy across many passes).
    const buf = new Float32Array(W * H * 4);
    for (let i = 0; i < pixels.length; i++) buf[i] = pixels[i];

    // Push from boundary: repeatedly fill masked pixels that have
    // at least one non-masked or already-filled neighbour.
    const dx8 = [-1, 0, 1, -1, 1, -1, 0, 1];
    const dy8 = [-1, -1, -1, 0, 0, 1, 1, 1];

    for (let pass = 0; pass < 40; pass++) {
      let changed = false;
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const idx = y * W + x;
          if (!mask[idx] || filled[idx]) continue;
          let r = 0, g = 0, b = 0, a = 0, n = 0;
          for (let d = 0; d < 8; d++) {
            const nx = x + dx8[d], ny = y + dy8[d];
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const ni = ny * W + nx;
            if (mask[ni] && !filled[ni]) continue;
            const pi = ni * 4;
            r += buf[pi]; g += buf[pi + 1]; b += buf[pi + 2]; a += buf[pi + 3]; n++;
          }
          if (n > 0) {
            const pi = idx * 4;
            buf[pi]     = r / n;
            buf[pi + 1] = g / n;
            buf[pi + 2] = b / n;
            buf[pi + 3] = a / n;
            filled[idx] = 1;
            changed = true;
          }
        }
      }
      if (!changed) break;
    }

    // Smooth the filled region with a 3×3 box blur (3 passes).
    const smooth = new Float32Array(buf);
    for (let blurPass = 0; blurPass < 3; blurPass++) {
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const idx = y * W + x;
          if (!mask[idx]) continue;
          let r = 0, g = 0, b = 0, wt = 0;
          for (let d = 0; d < 8; d++) {
            const nx = x + dx8[d], ny = y + dy8[d];
            if (nx < 0 || nx >= W || ny < 0 || ny >= H) continue;
            const pi = (ny * W + nx) * 4;
            r += buf[pi]; g += buf[pi + 1]; b += buf[pi + 2]; wt++;
          }
          // Include centre
          const pi = idx * 4;
          r += buf[pi] * 4; g += buf[pi + 1] * 4; b += buf[pi + 2] * 4; wt += 4;
          smooth[pi]     = r / wt;
          smooth[pi + 1] = g / wt;
          smooth[pi + 2] = b / wt;
        }
      }
      for (let y = minY; y <= maxY; y++) {
        for (let x = minX; x <= maxX; x++) {
          const idx = y * W + x;
          if (!mask[idx]) continue;
          const pi = idx * 4;
          buf[pi]     = smooth[pi];
          buf[pi + 1] = smooth[pi + 1];
          buf[pi + 2] = smooth[pi + 2];
        }
      }
    }

    // Write back.
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const idx = y * W + x;
        if (!mask[idx]) continue;
        const pi = idx * 4;
        pixels[pi]     = Math.round(buf[pi]);
        pixels[pi + 1] = Math.round(buf[pi + 1]);
        pixels[pi + 2] = Math.round(buf[pi + 2]);
        pixels[pi + 3] = Math.round(buf[pi + 3]);
      }
    }
  }

  // ---- Build a black-and-white mask data URL for AI APIs ----
  function buildMaskDataUrl(pts, W, H) {
    const mc = document.createElement("canvas");
    mc.width = W; mc.height = H;
    const mctx = mc.getContext("2d");
    mctx.fillStyle = "#000";
    mctx.fillRect(0, 0, W, H);
    mctx.fillStyle = "#fff";
    mctx.beginPath();
    mctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) mctx.lineTo(pts[i].x, pts[i].y);
    mctx.closePath();
    mctx.fill();
    return mc.toDataURL("image/png");
  }

  // ---- Apply the edit ----
  async function applyEdit(prompt) {
    const api = window.PhotoMagic;
    if (!api) return;
    const slide = api.getActiveSlide();
    if (!slide) return;

    hideModal();
    showProcessing();

    const W = photoCanvas.width, H = photoCanvas.height;

    // Draw the unfiltered slide image onto a temp canvas.
    const tmp  = document.createElement("canvas");
    tmp.width  = W; tmp.height = H;
    const tctx = tmp.getContext("2d");
    tctx.drawImage(slide.image, 0, 0, W, H);

    try {
      // Try external AI inpainting API if provided.
      if (typeof window.WanderlustImageEdit === "object" &&
          typeof window.WanderlustImageEdit.edit === "function") {
        const imgUrl  = tmp.toDataURL("image/png");
        const maskUrl = buildMaskDataUrl(lassoPts, W, H);
        const result  = await window.WanderlustImageEdit.edit(imgUrl, maskUrl, prompt, W, H);
        if (result) {
          const newImg = new Image();
          await new Promise(function (res, rej) {
            newImg.onload = res; newImg.onerror = rej;
            newImg.src = result; // expect a data URL or object URL
          });
          const newSlide = Object.assign({}, slide, { image: newImg });
          api.updateActiveSlide(newSlide);
          showMiniToast("\u2728 AI edit applied!");
          deactivate();
          return;
        }
      }

      // Heuristic fallback: content-aware fill via canvas inpainting.
      // Yield to the browser so the "processing" overlay renders first.
      await new Promise(function (r) { setTimeout(r, 30); });
      const imgData = tctx.getImageData(0, 0, W, H);
      inpaintPixels(imgData.data, W, H, lassoPts);
      tctx.putImageData(imgData, 0, 0);

      const newImg = new Image();
      await new Promise(function (res, rej) { newImg.onload = res; newImg.onerror = rej; newImg.src = tmp.toDataURL("image/png"); });
      const newSlide = Object.assign({}, slide, { image: newImg });
      api.updateActiveSlide(newSlide);
      showMiniToast("Smart fill applied. (Real AI inpainting requires an HF PRO subscription or Stability AI key.)");
    } catch (err) {
      console.error("AI Touchup:", err);
      showMiniToast("Edit failed. Please try again.", true);
    } finally {
      hideProcessing();
      deactivate();
    }
  }
})();
