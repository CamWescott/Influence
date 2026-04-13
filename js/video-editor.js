// Video editor: canvas-based playback with filters, text overlay, clip reel,
// and AI voice-over narration. Scoped to #panel-videos so filter/text class
// queries never collide with the photo editor (which scopes to #panel-photos).
(function () {
  const panel    = document.getElementById("panel-videos");
  const drop     = document.getElementById("videoDrop");
  const input    = document.getElementById("videoInput");
  const canvas   = document.getElementById("videoCanvas");
  const emptyMsg = document.getElementById("videoEmpty");
  const ctx      = canvas.getContext("2d");

  // Hidden <video> element does the decoding; the visible <canvas> paints frames.
  const vid = document.createElement("video");
  vid.style.display = "none";
  vid.playsInline   = true;
  document.body.appendChild(vid);

  // ---- Sidebar controls ----
  const sliders = {
    brightness: document.getElementById("vidBrightness"),
    contrast:   document.getElementById("vidContrast"),
    saturation: document.getElementById("vidSaturation"),
    warmth:     document.getElementById("vidWarmth"),
    blur:       document.getElementById("vidBlur"),
  };
  const textEl       = document.getElementById("videoText");
  const textFontEl   = document.getElementById("videoTextFont");
  const textSizeEl   = document.getElementById("videoTextSize");
  const textColorEl  = document.getElementById("videoTextColor");
  const playPauseBtn = document.getElementById("videoPlayPause");
  const resetBtn     = document.getElementById("videoReset");

  // Clip reel
  const reelDeckEl  = document.getElementById("reelDeck");
  const reelCountEl = document.getElementById("reelCount");
  const addClipBtn  = document.getElementById("addClipBtn");
  const playReelBtn = document.getElementById("playReelBtn");

  // Voice-over (unchanged IDs from original)
  const voScript = document.getElementById("voScript");
  const voiceSel = document.getElementById("voVoice");
  const rateEl   = document.getElementById("voRate");
  const pitchEl  = document.getElementById("voPitch");

  // ---- Filter presets (identical to photo editor) ----
  const FILTERS = {
    none:     { b: 100, c: 100, s: 100, w:   0, bl: 0 },
    tropical: { b: 108, c: 115, s: 140, w:  15, bl: 0 },
    sunset:   { b: 105, c: 110, s: 130, w:  35, bl: 0 },
    ocean:    { b: 100, c: 115, s: 120, w: -20, bl: 0 },
    vintage:  { b:  95, c:  90, s:  70, w:  20, bl: 0 },
    bnw:      { b: 105, c: 115, s:   0, w:   0, bl: 0 },
    vivid:    { b: 105, c: 125, s: 150, w:   5, bl: 0 },
    dreamy:   { b: 112, c:  95, s: 110, w:   8, bl: 1 },
  };

  // ---- State ----
  let clips       = [];
  let activeIndex = 0;
  let rafId       = null;
  let isPlaying   = false;
  let reelMode    = false;
  let reelIndex   = 0;

  // ---- Helpers (mirrors photo editor) ----
  function buildFilterString(f) {
    const sepia  = f.w > 0 ? f.w : 0;
    const hueRot = f.w < 0 ? Math.abs(f.w) * 2 : 0;
    return (
      "brightness(" + f.b + "%) " +
      "contrast("   + f.c + "%) " +
      "saturate("   + f.s + "%) " +
      "sepia("      + sepia  + "%) " +
      "hue-rotate(" + hueRot + "deg) " +
      "blur("       + f.bl   + "px)"
    );
  }

  function drawText(targetCtx, text, w, h) {
    if (!text || !text.content) return;
    const size = Math.max(8, text.size * (h / 500));
    targetCtx.save();
    targetCtx.font         = "700 " + size + "px " + text.font;
    targetCtx.textAlign    = "center";
    targetCtx.textBaseline = "middle";
    const x = text.x * w;
    const y = text.y * h;

    if (text.style === "shadow") {
      targetCtx.shadowColor   = "rgba(0,0,0,0.75)";
      targetCtx.shadowBlur    = Math.max(4, size * 0.18);
      targetCtx.shadowOffsetX = 0;
      targetCtx.shadowOffsetY = Math.max(1, size * 0.05);
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    } else if (text.style === "outline") {
      targetCtx.lineWidth   = Math.max(3, size * 0.08);
      targetCtx.strokeStyle = "#000";
      targetCtx.lineJoin    = "round";
      targetCtx.strokeText(text.content, x, y);
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    } else if (text.style === "banner") {
      const metrics = targetCtx.measureText(text.content);
      const pad = size * 0.35;
      const bw  = metrics.width + pad * 2;
      const bh  = size + pad * 2;
      targetCtx.fillStyle = "rgba(10, 35, 64, 0.55)";
      roundRect(targetCtx, x - bw / 2, y - bh / 2, bw, bh, pad * 0.5);
      targetCtx.fill();
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    } else {
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    }
    targetCtx.restore();
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y,     x + w, y + h, r);
    c.arcTo(x + w, y + h, x,     y + h, r);
    c.arcTo(x,     y + h, x,     y,     r);
    c.arcTo(x,     y,     x + w, y,     r);
    c.closePath();
  }

  function defaultText() {
    return {
      content: "",
      font:    "'Baloo 2', cursive",
      size:    48,
      color:   "#ffffff",
      x:       0.5,
      y:       0.88,
      style:   "shadow",
    };
  }

  function activeClip() {
    return clips[activeIndex] || null;
  }

  // ---- Canvas rAF loop ----
  // Runs continuously while a clip is loaded so the text drag interaction
  // works regardless of play/pause state — same pattern as photo-editor.js.
  function paintFrame() {
    rafId = requestAnimationFrame(paintFrame);
    const clip = activeClip();
    if (!clip || vid.readyState < 2) return;

    ctx.filter = buildFilterString(clip.filter);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(vid, 0, 0, canvas.width, canvas.height);
    // Text overlay is drawn without filter so the caption stays sharp.
    ctx.filter = "none";
    drawText(ctx, clip.text, canvas.width, canvas.height);
  }

  function ensureRaf() {
    if (!rafId) rafId = requestAnimationFrame(paintFrame);
  }

  function stopRaf() {
    if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  }

  // Resize canvas to fit video dimensions, then start the rAF loop.
  vid.addEventListener("loadedmetadata", function () {
    const maxW  = 800, maxH = 500;
    const scale = Math.min(maxW / (vid.videoWidth || 1), maxH / (vid.videoHeight || 1), 1);
    canvas.width  = Math.max(1, Math.round(vid.videoWidth  * scale));
    canvas.height = Math.max(1, Math.round(vid.videoHeight * scale));
    canvas.classList.add("loaded");
    if (emptyMsg) emptyMsg.style.display = "none";
    ensureRaf();
  });

  function loadClipIntoPlayer(clip) {
    vid.src = clip.url;
    vid.load();
  }

  // ---- Filter thumbnails ----
  // Paint every filter's preview using the current clip's thumbnail frame.
  function renderFilterThumbnails() {
    const clip = activeClip();
    if (!clip || !clip.thumb) return;
    panel.querySelectorAll(".filter-btn").forEach(function (btn) {
      const name        = btn.dataset.filter;
      const p           = FILTERS[name] || FILTERS.none;
      const thumbCanvas = btn.querySelector(".filter-thumb");
      if (!thumbCanvas) return;
      thumbCanvas.classList.remove("empty");
      const tctx = thumbCanvas.getContext("2d");
      const tw = thumbCanvas.width, th = thumbCanvas.height;
      const iw = clip.thumb.width,  ih = clip.thumb.height;
      const scale = Math.max(tw / iw, th / ih);
      const dw = iw * scale, dh = ih * scale;
      const dx = (tw - dw) / 2, dy = (th - dh) / 2;
      tctx.filter = buildFilterString(p);
      tctx.clearRect(0, 0, tw, th);
      tctx.drawImage(clip.thumb, dx, dy, dw, dh);
      tctx.filter = "none";
    });
  }

  // ---- Clip reel deck ----
  // Re-renders whenever clips change, mirrors the photo slideshow deck.
  function renderDeck() {
    if (!reelDeckEl) return;
    reelDeckEl.innerHTML = "";

    clips.forEach(function (clip, i) {
      const wrap = document.createElement("div");
      wrap.className = "slide-thumb" + (i === activeIndex ? " active" : "");

      const tc = document.createElement("canvas");
      tc.width  = 140;
      tc.height = 90;
      const tctx = tc.getContext("2d");
      if (clip.thumb) {
        const iw = clip.thumb.width, ih = clip.thumb.height;
        const scale = Math.max(tc.width / iw, tc.height / ih);
        const dw = iw * scale, dh = ih * scale;
        const dx = (tc.width  - dw) / 2;
        const dy = (tc.height - dh) / 2;
        tctx.filter = buildFilterString(clip.filter);
        tctx.drawImage(clip.thumb, dx, dy, dw, dh);
        tctx.filter = "none";
        if (clip.text.content) drawText(tctx, clip.text, tc.width, tc.height);
      }
      wrap.appendChild(tc);

      const label = document.createElement("span");
      label.className   = "slide-num";
      label.textContent = i + 1;
      wrap.appendChild(label);

      const del = document.createElement("button");
      del.className   = "slide-del";
      del.type        = "button";
      del.title       = "Remove";
      del.textContent = "\u00d7";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        removeClip(i);
      });
      wrap.appendChild(del);

      wrap.addEventListener("click", function () {
        if (activeIndex === i) return;
        stopPlayback();
        activeIndex = i;
        syncControls();
        loadClipIntoPlayer(clips[i]);
        renderFilterThumbnails();
        renderDeck();
      });

      reelDeckEl.appendChild(wrap);
    });

    if (reelCountEl) {
      reelCountEl.textContent = clips.length + " clip" + (clips.length === 1 ? "" : "s");
    }
    if (playReelBtn) playReelBtn.disabled = clips.length < 2;
  }

  function removeClip(i) {
    const wasActive = (i === activeIndex);
    URL.revokeObjectURL(clips[i].url);
    clips.splice(i, 1);

    if (clips.length === 0) {
      activeIndex = 0;
      stopPlayback();
      stopRaf();
      vid.src = "";
      canvas.classList.remove("loaded");
      if (emptyMsg) emptyMsg.style.display = "";
      panel.querySelectorAll(".filter-thumb").forEach(function (t) {
        t.classList.add("empty");
        t.getContext("2d").clearRect(0, 0, t.width, t.height);
      });
      panel.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      if (textEl) textEl.value = "";
    } else {
      if (activeIndex >= clips.length) activeIndex = clips.length - 1;
      if (wasActive) {
        syncControls();
        loadClipIntoPlayer(clips[activeIndex]);
        renderFilterThumbnails();
      }
    }
    renderDeck();
  }

  // Push the active clip's state into the sidebar controls.
  function syncControls() {
    const clip = activeClip();
    if (!clip) return;
    sliders.brightness.value = clip.filter.b;
    sliders.contrast.value   = clip.filter.c;
    sliders.saturation.value = clip.filter.s;
    sliders.warmth.value     = clip.filter.w;
    sliders.blur.value       = clip.filter.bl;
    if (textEl)      textEl.value      = clip.text.content;
    if (textFontEl)  textFontEl.value  = clip.text.font;
    if (textSizeEl)  textSizeEl.value  = clip.text.size;
    if (textColorEl) textColorEl.value = clip.text.color;
    panel.querySelectorAll(".filter-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.filter === clip.preset);
    });
    panel.querySelectorAll(".text-style-btn").forEach(b => {
      b.classList.toggle("active", b.dataset.style === clip.text.style);
    });
  }

  function applyPreset(name) {
    const clip = activeClip();
    if (!clip) return;
    const p    = FILTERS[name] || FILTERS.none;
    clip.preset = name;
    clip.filter = { b: p.b, c: p.c, s: p.s, w: p.w, bl: p.bl };
    syncControls();
    renderDeck();
  }

  // ---- Playback helpers ----
  function stopPlayback() {
    vid.pause();
    isPlaying = false;
    reelMode  = false;
    updatePlayPauseBtn();
    if (playReelBtn) {
      playReelBtn.textContent = "\u25B6 Play reel";
      playReelBtn.disabled    = clips.length < 2;
    }
  }

  function updatePlayPauseBtn() {
    if (!playPauseBtn) return;
    playPauseBtn.innerHTML = isPlaying ? "\u23F8 Pause" : "\u25B6 Play";
  }

  // ---- Reel: advance clips on video.ended ----
  vid.addEventListener("ended", function () {
    if (!reelMode) {
      isPlaying = false;
      updatePlayPauseBtn();
      return;
    }
    reelIndex++;
    if (reelIndex < clips.length) {
      playReelClip(reelIndex);
    } else {
      // Reel finished naturally.
      reelMode  = false;
      isPlaying = false;
      updatePlayPauseBtn();
      if (playReelBtn) {
        playReelBtn.textContent = "\u25B6 Play reel";
        playReelBtn.disabled    = clips.length < 2;
      }
    }
  });

  function playReelClip(i) {
    activeIndex = i;
    syncControls();
    renderDeck();
    renderFilterThumbnails();
    vid.src = clips[i].url;
    vid.load();
    vid.addEventListener("canplay", function () {
      vid.play().catch(function () {});
    }, { once: true });
  }

  function startReel() {
    if (clips.length < 2) return;
    reelMode  = true;
    reelIndex = 0;
    isPlaying = true;
    if (playReelBtn) {
      playReelBtn.textContent = "\u23F9 Stop reel";
      playReelBtn.disabled    = false;
    }
    updatePlayPauseBtn();
    playReelClip(0);
  }

  // ---- File loading ----
  // Capture a thumbnail still from the video by seeking to 0.1 s.
  function captureThumbnail(file, callback) {
    const tmp   = document.createElement("video");
    tmp.muted   = true;
    tmp.preload = "metadata";
    const url   = URL.createObjectURL(file);
    tmp.src     = url;

    tmp.addEventListener("loadedmetadata", function () {
      tmp.currentTime = Math.min(0.1, tmp.duration || 0.1);
    }, { once: true });

    tmp.addEventListener("seeked", function onSeeked() {
      tmp.removeEventListener("seeked", onSeeked);
      const tc  = document.createElement("canvas");
      tc.width  = tmp.videoWidth  || 320;
      tc.height = tmp.videoHeight || 180;
      tc.getContext("2d").drawImage(tmp, 0, 0, tc.width, tc.height);
      URL.revokeObjectURL(url);
      callback(tc);
    });
  }

  function loadFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      f => f && f.type && f.type.startsWith("video/")
    );
    if (!files.length) return;

    let remaining  = files.length;
    const newClips = new Array(files.length);

    files.forEach(function (file, idx) {
      captureThumbnail(file, function (thumb) {
        newClips[idx] = {
          file,
          url:    URL.createObjectURL(file),
          thumb,
          preset: "none",
          filter: { b: 100, c: 100, s: 100, w: 0, bl: 0 },
          text:   defaultText(),
        };
        remaining--;
        if (remaining === 0) {
          newClips.forEach(c => { if (c) clips.push(c); });
          activeIndex = clips.length - 1;
          syncControls();
          loadClipIntoPlayer(clips[activeIndex]);
          renderFilterThumbnails();
          renderDeck();
        }
      });
    });
  }

  // Mark all filter thumbs empty before any video is loaded.
  panel.querySelectorAll(".filter-thumb").forEach(t => t.classList.add("empty"));

  // ---- Upload wiring ----
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", e => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", e => {
    e.preventDefault();
    drop.classList.remove("drag");
    loadFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", e => {
    loadFiles(e.target.files);
    e.target.value = "";
  });

  if (addClipBtn) addClipBtn.addEventListener("click", () => input.click());

  // ---- Slider wiring ----
  const SLIDER_KEYS = { brightness: "b", contrast: "c", saturation: "s", warmth: "w", blur: "bl" };
  Object.entries(sliders).forEach(function ([key, slider]) {
    slider.addEventListener("input", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.filter[SLIDER_KEYS[key]] = parseInt(slider.value, 10);
      clip.preset = "custom";
      panel.querySelectorAll(".filter-btn").forEach(b => b.classList.remove("active"));
      renderDeck();
    });
  });

  // ---- Filter button wiring ----
  panel.querySelectorAll(".filter-btn").forEach(btn =>
    btn.addEventListener("click", () => applyPreset(btn.dataset.filter))
  );

  // ---- Text overlay wiring ----
  if (textEl) {
    textEl.addEventListener("input", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.text.content = textEl.value;
      renderDeck();
    });
  }
  if (textFontEl) {
    textFontEl.addEventListener("change", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.text.font = textFontEl.value;
      renderDeck();
    });
  }
  if (textSizeEl) {
    textSizeEl.addEventListener("input", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.text.size = parseInt(textSizeEl.value, 10);
      renderDeck();
    });
  }
  if (textColorEl) {
    textColorEl.addEventListener("input", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.text.color = textColorEl.value;
      renderDeck();
    });
  }
  panel.querySelectorAll(".text-style-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const clip = activeClip();
      if (!clip) return;
      panel.querySelectorAll(".text-style-btn").forEach(b => b.classList.remove("active"));
      btn.classList.add("active");
      clip.text.style = btn.dataset.style;
      renderDeck();
    });
  });
  panel.querySelectorAll(".text-pos-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const clip = activeClip();
      if (!clip) return;
      const [x, y] = btn.dataset.pos.split(",").map(Number);
      clip.text.x = x;
      clip.text.y = y;
      renderDeck();
    });
  });

  // ---- Play / Pause button ----
  if (playPauseBtn) {
    playPauseBtn.addEventListener("click", function () {
      if (reelMode) return; // reel has its own stop button
      const clip = activeClip();
      if (!clip) return;
      if (isPlaying) {
        vid.pause();
        isPlaying = false;
      } else {
        vid.play().catch(function () {});
        isPlaying = true;
      }
      updatePlayPauseBtn();
    });
  }

  // ---- Reset button ----
  if (resetBtn) {
    resetBtn.addEventListener("click", function () {
      const clip = activeClip();
      if (!clip) return;
      clip.text = defaultText();
      applyPreset("none");
      renderDeck();
    });
  }

  // ---- Play reel button ----
  if (playReelBtn) {
    playReelBtn.addEventListener("click", function () {
      if (reelMode) stopPlayback();
      else startReel();
    });
  }

  // ---- Text drag on canvas ----
  let dragging = false;

  function pointerFraction(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top)  / rect.height)),
    };
  }

  canvas.addEventListener("mousedown", function (e) {
    const clip = activeClip();
    if (!clip || !clip.text.content) return;
    dragging = true;
    canvas.classList.add("dragging");
    const p = pointerFraction(e.clientX, e.clientY);
    clip.text.x = p.x;
    clip.text.y = p.y;
  });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    const clip = activeClip();
    if (!clip) return;
    const p = pointerFraction(e.clientX, e.clientY);
    clip.text.x = p.x;
    clip.text.y = p.y;
  });
  window.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("dragging");
    renderDeck();
  });
  canvas.addEventListener("touchstart", function (e) {
    const clip = activeClip();
    if (!clip || !clip.text.content) return;
    const t = e.touches[0];
    dragging = true;
    const p = pointerFraction(t.clientX, t.clientY);
    clip.text.x = p.x;
    clip.text.y = p.y;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    if (!dragging) return;
    const clip = activeClip();
    if (!clip) return;
    const t = e.touches[0];
    const p = pointerFraction(t.clientX, t.clientY);
    clip.text.x = p.x;
    clip.text.y = p.y;
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchend", function () {
    if (!dragging) return;
    dragging = false;
    renderDeck();
  });

  // ---- Voice-over (unchanged from original) ----
  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      voiceSel.innerHTML = "<option>Speech synthesis not supported</option>";
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    voiceSel.innerHTML = "";
    const sorted = voices.slice().sort((a, b) => {
      const ae = a.lang.startsWith("en") ? 0 : 1;
      const be = b.lang.startsWith("en") ? 0 : 1;
      return ae - be || a.name.localeCompare(b.name);
    });
    sorted.forEach(v => {
      const opt = document.createElement("option");
      opt.value       = v.name;
      opt.textContent = v.name + " (" + v.lang + ")";
      voiceSel.appendChild(opt);
    });
  }
  populateVoices();
  if ("speechSynthesis" in window) window.speechSynthesis.onvoiceschanged = populateVoices;

  function narrate() {
    const text = voScript.value.trim();
    if (!text) { alert("Write a script first, then hit Narrate."); return; }
    if (!("speechSynthesis" in window)) { alert("Your browser doesn't support speech synthesis."); return; }
    window.speechSynthesis.cancel();

    const utter  = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const chosen = voices.find(v => v.name === voiceSel.value);
    if (chosen) utter.voice = chosen;
    utter.rate  = parseFloat(rateEl.value);
    utter.pitch = parseFloat(pitchEl.value);

    // Play the active clip (muted) alongside the narration.
    if (activeClip()) {
      vid.muted       = true;
      vid.currentTime = 0;
      vid.play().catch(function () {});
      isPlaying = true;
      updatePlayPauseBtn();
    }
    window.speechSynthesis.speak(utter);

    utter.onend = function () {
      if (activeClip()) {
        vid.pause();
        vid.muted = false;
        isPlaying = false;
        updatePlayPauseBtn();
      }
    };
  }

  function stopAll() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    stopPlayback();
    vid.muted = false;
  }

  document.getElementById("voPlay").addEventListener("click", narrate);
  document.getElementById("voStop").addEventListener("click", stopAll);

  // ---- Suggest a script (unchanged from original) ----
  const SAMPLE_OPENERS = [
    "Welcome aboard! Today we're sailing into paradise...",
    "If you've ever dreamed of a place where the water is bluer than your screensaver, keep watching.",
    "This might just be the most magical stop of our entire cruise.",
    "Three things I wish I knew before visiting this destination...",
  ];
  const SAMPLE_MIDDLE = [
    "The sand here is so soft it squeaks under your feet, and the palm trees lean in like they're posing for the camera.",
    "We started the morning snorkeling with rainbow fish, grabbed lunch at a beachfront shack, and spent the afternoon chasing sunsets.",
    "Local tip: arrive early, bring reef-safe sunscreen, and never skip the coconut ice cream.",
  ];
  const SAMPLE_CLOSERS = [
    "Follow along for more travel magic — and let me know in the comments where I should sail next!",
    "Save this one for your next trip and tag a travel buddy who needs to see it.",
    "See you on the next adventure, fellow wanderer!",
  ];
  function rand(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

  document.getElementById("voSuggest").addEventListener("click", async function () {
    if (window.WanderlustAI) {
      voScript.value = "Generating with Claude...";
      try {
        const prompt = "Write a short 30-45 second travel vlog voice-over script for a cruise/beach destination. Make it warm, vivid, and engaging. Output only the script, no stage directions.";
        const out = await window.WanderlustAI.complete(prompt, 400);
        voScript.value = out.trim();
      } catch (err) {
        voScript.value = rand(SAMPLE_OPENERS) + " " + rand(SAMPLE_MIDDLE) + " " + rand(SAMPLE_CLOSERS);
      }
      return;
    }
    voScript.value = rand(SAMPLE_OPENERS) + " " + rand(SAMPLE_MIDDLE) + " " + rand(SAMPLE_CLOSERS);
  });

  // Initial render (empty state).
  renderDeck();

  // Public API for Magic Maker
  window.VideoMagic = {
    getClips: function () { return clips; },
    setClips: function (newClips) {
      clips = newClips;
      activeIndex = 0;
      if (clips.length) {
        syncControls();
        loadClipIntoPlayer(clips[0]);
        renderFilterThumbnails();
        renderDeck();
      } else {
        renderDeck();
      }
    },
    FILTERS: FILTERS,
    startReel: function () {
      if (clips.length) playReelBtn && playReelBtn.click();
    },
  };
})();
