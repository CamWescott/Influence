// Photo editor: Canvas-based with filters, adjustments, text overlay, and
// a slide deck so users can build a multi-photo slideshow — each slide
// keeps its own filter settings and caption.
(function () {
  // Scope class-based queries to the photos panel so the video editor
  // can reuse the same class names without colliding.
  const panel = document.getElementById("panel-photos");
  const drop = document.getElementById("photoDrop");
  const input = document.getElementById("photoInput");
  const canvas = document.getElementById("photoCanvas");
  const emptyMsg = document.getElementById("photoEmpty");
  const ctx = canvas.getContext("2d");

  const sliders = {
    brightness: document.getElementById("brightness"),
    contrast: document.getElementById("contrast"),
    saturation: document.getElementById("saturation"),
    warmth: document.getElementById("warmth"),
    blur: document.getElementById("blur"),
  };

  // Text overlay controls
  const textEl = document.getElementById("photoText");
  const textFontEl = document.getElementById("photoTextFont");
  const textSizeEl = document.getElementById("photoTextSize");
  const textColorEl = document.getElementById("photoTextColor");

  // Slideshow deck
  const deckEl = document.getElementById("slideDeck");
  const deckCountEl = document.getElementById("deckCount");
  const addSlideBtn = document.getElementById("addSlideBtn");
  const playBtn = document.getElementById("playSlideshowBtn");
  const modalEl = document.getElementById("slideshowModal");
  const modalCanvas = document.getElementById("slideshowCanvas");
  const modalClose = document.getElementById("slideshowClose");
  const modalCounter = document.getElementById("slideshowCounter");
  const modalPrev = document.getElementById("slideshowPrev");
  const modalNext = document.getElementById("slideshowNext");
  const modalPause = document.getElementById("slideshowPause");
  const durationEl = document.getElementById("slideDuration");

  const FILTERS = {
    none:     { b: 100, c: 100, s: 100, w: 0,   bl: 0 },
    tropical: { b: 108, c: 115, s: 140, w: 15,  bl: 0 },
    sunset:   { b: 105, c: 110, s: 130, w: 35,  bl: 0 },
    ocean:    { b: 100, c: 115, s: 120, w: -20, bl: 0 },
    vintage:  { b: 95,  c: 90,  s: 70,  w: 20,  bl: 0 },
    bnw:      { b: 105, c: 115, s: 0,   w: 0,   bl: 0 },
    vivid:    { b: 105, c: 125, s: 150, w: 5,   bl: 0 },
    dreamy:   { b: 112, c: 95,  s: 110, w: 8,   bl: 1 },
  };

  // One entry per photo in the deck. Each slide remembers its own filter
  // and caption so clicking between slides restores their state.
  let slides = [];
  let activeIndex = 0;

  function defaultText() {
    return {
      content: "",
      font: "'Baloo 2', cursive",
      size: 48,      // pixels at a reference canvas height of 500px
      color: "#ffffff",
      x: 0.5,        // 0..1 fraction of width
      y: 0.88,       // 0..1 fraction of height
      style: "shadow",
    };
  }

  function makeSlide(image) {
    return {
      image,
      preset: "none",
      filter: { b: 100, c: 100, s: 100, w: 0, bl: 0 },
      text: defaultText(),
    };
  }

  function activeSlide() {
    return slides[activeIndex] || null;
  }

  // Builds the CSS-style filter string that Canvas2D supports.
  // Warmth: positive adds sepia for warm tones; negative simulates cool
  // tones by rotating hue toward blue.
  function buildFilterString(f) {
    const sepia = f.w > 0 ? f.w : 0;
    const hueRotate = f.w < 0 ? Math.abs(f.w) * 2 : 0;
    return (
      "brightness(" + f.b + "%) " +
      "contrast(" + f.c + "%) " +
      "saturate(" + f.s + "%) " +
      "sepia(" + sepia + "%) " +
      "hue-rotate(" + hueRotate + "deg) " +
      "blur(" + f.bl + "px)"
    );
  }

  // Draw the caption onto a canvas. Size is normalized against a
  // reference canvas height of 500px so text looks the same on the
  // editor, the slideshow viewer, and the downloaded full-resolution
  // image.
  function drawText(targetCtx, text, w, h) {
    if (!text || !text.content) return;
    const size = Math.max(8, text.size * (h / 500));
    targetCtx.save();
    targetCtx.font = "700 " + size + "px " + text.font;
    targetCtx.textAlign = "center";
    targetCtx.textBaseline = "middle";
    const x = text.x * w;
    const y = text.y * h;

    if (text.style === "shadow") {
      targetCtx.shadowColor = "rgba(0,0,0,0.75)";
      targetCtx.shadowBlur = Math.max(4, size * 0.18);
      targetCtx.shadowOffsetX = 0;
      targetCtx.shadowOffsetY = Math.max(1, size * 0.05);
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    } else if (text.style === "outline") {
      targetCtx.lineWidth = Math.max(3, size * 0.08);
      targetCtx.strokeStyle = "#000";
      targetCtx.lineJoin = "round";
      targetCtx.strokeText(text.content, x, y);
      targetCtx.fillStyle = text.color;
      targetCtx.fillText(text.content, x, y);
    } else if (text.style === "banner") {
      const metrics = targetCtx.measureText(text.content);
      const pad = size * 0.35;
      const bw = metrics.width + pad * 2;
      const bh = size + pad * 2;
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
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function render() {
    const slide = activeSlide();
    if (!slide) {
      canvas.classList.remove("loaded");
      if (emptyMsg) emptyMsg.style.display = "";
      return;
    }
    canvas.classList.add("loaded");
    if (emptyMsg) emptyMsg.style.display = "none";

    // Fit image into canvas preserving aspect ratio.
    const maxW = 800;
    const maxH = 500;
    const iw = slide.image.width;
    const ih = slide.image.height;
    const scale = Math.min(maxW / iw, maxH / ih, 1);
    canvas.width = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);

    // IMPORTANT: setting canvas.width/height above resets all context
    // state (including ctx.filter), so we must apply the filter AFTER
    // the resize, not before.
    ctx.filter = buildFilterString(slide.filter);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(slide.image, 0, 0, canvas.width, canvas.height);

    // Text overlay is drawn with no filter so the caption stays sharp.
    ctx.filter = "none";
    drawText(ctx, slide.text, canvas.width, canvas.height);
  }

  // Paint every filter's preview onto its own thumbnail canvas using the
  // currently-active slide's image, so users can eyeball all 8 options
  // side-by-side against their actual photo.
  function renderFilterThumbnails() {
    const slide = activeSlide();
    if (!slide) return;
    panel.querySelectorAll(".filter-btn").forEach(function (btn) {
      const name = btn.dataset.filter;
      const p = FILTERS[name] || FILTERS.none;
      const thumbCanvas = btn.querySelector(".filter-thumb");
      if (!thumbCanvas) return;
      thumbCanvas.classList.remove("empty");

      const tctx = thumbCanvas.getContext("2d");
      const tw = thumbCanvas.width;
      const th = thumbCanvas.height;

      tctx.filter = buildFilterString(p);

      // Cover-fit the image into the thumbnail so it never looks stretched.
      const iw = slide.image.width;
      const ih = slide.image.height;
      const scale = Math.max(tw / iw, th / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (tw - dw) / 2;
      const dy = (th - dh) / 2;

      tctx.clearRect(0, 0, tw, th);
      tctx.drawImage(slide.image, dx, dy, dw, dh);
    });
  }

  // Slide deck strip below the main stage. Re-rendered on any change so
  // thumbnails always reflect the latest filter + text state.
  function renderDeck() {
    if (!deckEl) return;
    deckEl.innerHTML = "";

    slides.forEach(function (slide, i) {
      const wrap = document.createElement("div");
      wrap.className = "slide-thumb" + (i === activeIndex ? " active" : "");

      const tc = document.createElement("canvas");
      tc.width = 140;
      tc.height = 90;
      const tctx = tc.getContext("2d");

      // Cover-fit image with its filter.
      const iw = slide.image.width;
      const ih = slide.image.height;
      const scale = Math.max(tc.width / iw, tc.height / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (tc.width - dw) / 2;
      const dy = (tc.height - dh) / 2;
      tctx.filter = buildFilterString(slide.filter);
      tctx.drawImage(slide.image, dx, dy, dw, dh);
      tctx.filter = "none";

      // Draw a mini version of the caption so the thumb previews text too.
      if (slide.text.content) {
        drawText(tctx, slide.text, tc.width, tc.height);
      }

      wrap.appendChild(tc);

      const label = document.createElement("span");
      label.className = "slide-num";
      label.textContent = i + 1;
      wrap.appendChild(label);

      const del = document.createElement("button");
      del.className = "slide-del";
      del.type = "button";
      del.title = "Remove";
      del.textContent = "\u00d7";
      del.addEventListener("click", function (e) {
        e.stopPropagation();
        removeSlide(i);
      });
      wrap.appendChild(del);

      wrap.addEventListener("click", function () {
        if (activeIndex === i) return;
        activeIndex = i;
        syncControls();
        render();
        renderFilterThumbnails();
        renderDeck();
      });

      deckEl.appendChild(wrap);
    });

    if (deckCountEl) {
      deckCountEl.textContent =
        slides.length + " photo" + (slides.length === 1 ? "" : "s");
    }
    if (playBtn) playBtn.disabled = slides.length < 2;
  }

  function removeSlide(i) {
    slides.splice(i, 1);
    if (slides.length === 0) {
      activeIndex = 0;
      canvas.classList.remove("loaded");
      if (emptyMsg) emptyMsg.style.display = "";
      // Reset filter thumbs to the empty hatched state.
      panel.querySelectorAll(".filter-thumb").forEach(function (t) {
        t.classList.add("empty");
        const c = t.getContext("2d");
        c.clearRect(0, 0, t.width, t.height);
      });
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      // Reset text input too.
      if (textEl) textEl.value = "";
    } else {
      if (activeIndex >= slides.length) activeIndex = slides.length - 1;
      syncControls();
      render();
      renderFilterThumbnails();
    }
    renderDeck();
  }

  // Push the active slide's state into the sidebar controls.
  function syncControls() {
    const slide = activeSlide();
    if (!slide) return;
    sliders.brightness.value = slide.filter.b;
    sliders.contrast.value = slide.filter.c;
    sliders.saturation.value = slide.filter.s;
    sliders.warmth.value = slide.filter.w;
    sliders.blur.value = slide.filter.bl;

    if (textEl) textEl.value = slide.text.content;
    if (textFontEl) textFontEl.value = slide.text.font;
    if (textSizeEl) textSizeEl.value = slide.text.size;
    if (textColorEl) textColorEl.value = slide.text.color;

    panel.querySelectorAll(".filter-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.filter === slide.preset);
    });
    panel.querySelectorAll(".text-style-btn").forEach((b) => {
      b.classList.toggle("active", b.dataset.style === slide.text.style);
    });
  }

  function applyPreset(name) {
    const slide = activeSlide();
    if (!slide) return;
    const p = FILTERS[name] || FILTERS.none;
    slide.preset = name;
    slide.filter = { b: p.b, c: p.c, s: p.s, w: p.w, bl: p.bl };
    syncControls();
    render();
    renderDeck();
  }

  function loadFiles(fileList) {
    const files = Array.from(fileList || []).filter(
      (f) => f && f.type && f.type.startsWith("image/")
    );
    if (files.length === 0) return;

    const startedEmpty = slides.length === 0;
    let remaining = files.length;
    const newSlides = [];

    files.forEach(function (file, idx) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const img = new Image();
        img.onload = function () {
          newSlides[idx] = makeSlide(img);
          remaining--;
          if (remaining === 0) {
            // Preserve upload order.
            newSlides.forEach((s) => {
              if (s) slides.push(s);
            });
            activeIndex = slides.length - 1;
            syncControls();
            render();
            renderFilterThumbnails();
            renderDeck();
          }
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // Before any photo is loaded, mark the thumbnail canvases with an empty
  // class so the CSS placeholder (diagonal hatch on a blue gradient) shows
  // up instead of a blank white box.
  panel.querySelectorAll(".filter-thumb").forEach(function (t) {
    t.classList.add("empty");
  });

  // ---- Text drag on main canvas ----
  // If the caption has content, any mousedown on the canvas grabs the
  // text and repositions it. Touch works the same way.
  let dragging = false;

  function pointerFraction(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (clientY - rect.top) / rect.height)),
    };
  }

  canvas.addEventListener("mousedown", function (e) {
    const slide = activeSlide();
    if (!slide || !slide.text.content) return;
    dragging = true;
    canvas.classList.add("dragging");
    const p = pointerFraction(e.clientX, e.clientY);
    slide.text.x = p.x;
    slide.text.y = p.y;
    render();
  });
  window.addEventListener("mousemove", function (e) {
    if (!dragging) return;
    const slide = activeSlide();
    if (!slide) return;
    const p = pointerFraction(e.clientX, e.clientY);
    slide.text.x = p.x;
    slide.text.y = p.y;
    render();
  });
  window.addEventListener("mouseup", function () {
    if (!dragging) return;
    dragging = false;
    canvas.classList.remove("dragging");
    renderDeck();
  });
  // Touch
  canvas.addEventListener("touchstart", function (e) {
    const slide = activeSlide();
    if (!slide || !slide.text.content) return;
    const t = e.touches[0];
    dragging = true;
    const p = pointerFraction(t.clientX, t.clientY);
    slide.text.x = p.x;
    slide.text.y = p.y;
    render();
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchmove", function (e) {
    if (!dragging) return;
    const slide = activeSlide();
    if (!slide) return;
    const t = e.touches[0];
    const p = pointerFraction(t.clientX, t.clientY);
    slide.text.x = p.x;
    slide.text.y = p.y;
    render();
    e.preventDefault();
  }, { passive: false });
  canvas.addEventListener("touchend", function () {
    if (!dragging) return;
    dragging = false;
    renderDeck();
  });

  // ---- Upload wiring ----
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    loadFiles(e.dataTransfer.files);
  });
  input.addEventListener("change", (e) => {
    loadFiles(e.target.files);
    // Allow re-selecting the same file later.
    e.target.value = "";
  });

  if (addSlideBtn) {
    addSlideBtn.addEventListener("click", () => input.click());
  }

  // ---- Slider wiring ----
  const SLIDER_KEYS = {
    brightness: "b",
    contrast: "c",
    saturation: "s",
    warmth: "w",
    blur: "bl",
  };
  Object.entries(sliders).forEach(function ([key, slider]) {
    slider.addEventListener("input", function () {
      const slide = activeSlide();
      if (!slide) return;
      slide.filter[SLIDER_KEYS[key]] = parseInt(slider.value, 10);
      // Manual adjustment breaks the preset association.
      slide.preset = "custom";
      document
        .querySelectorAll(".filter-btn")
        .forEach((b) => b.classList.remove("active"));
      render();
      renderDeck();
    });
  });

  // ---- Filter button wiring ----
  panel.querySelectorAll(".filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => applyPreset(btn.dataset.filter))
  );

  // ---- Text controls wiring ----
  if (textEl) {
    textEl.addEventListener("input", function () {
      const slide = activeSlide();
      if (!slide) return;
      slide.text.content = textEl.value;
      render();
      renderDeck();
    });
  }
  if (textFontEl) {
    textFontEl.addEventListener("change", function () {
      const slide = activeSlide();
      if (!slide) return;
      slide.text.font = textFontEl.value;
      render();
      renderDeck();
    });
  }
  if (textSizeEl) {
    textSizeEl.addEventListener("input", function () {
      const slide = activeSlide();
      if (!slide) return;
      slide.text.size = parseInt(textSizeEl.value, 10);
      render();
      renderDeck();
    });
  }
  if (textColorEl) {
    textColorEl.addEventListener("input", function () {
      const slide = activeSlide();
      if (!slide) return;
      slide.text.color = textColorEl.value;
      render();
      renderDeck();
    });
  }
  panel.querySelectorAll(".text-style-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const slide = activeSlide();
      if (!slide) return;
      document
        .querySelectorAll(".text-style-btn")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      slide.text.style = btn.dataset.style;
      render();
      renderDeck();
    });
  });
  panel.querySelectorAll(".text-pos-btn").forEach(function (btn) {
    btn.addEventListener("click", function () {
      const slide = activeSlide();
      if (!slide) return;
      const [x, y] = btn.dataset.pos.split(",").map(Number);
      slide.text.x = x;
      slide.text.y = y;
      render();
      renderDeck();
    });
  });

  // ---- Reset / Download ----
  document.getElementById("photoReset").addEventListener("click", () => {
    const slide = activeSlide();
    if (!slide) return;
    slide.text = defaultText();
    applyPreset("none");
    renderDeck();
  });

  document.getElementById("photoDownload").addEventListener("click", () => {
    const slide = activeSlide();
    if (!slide) return;
    // Re-draw with filter + text applied at full image resolution.
    const out = document.createElement("canvas");
    out.width = slide.image.width;
    out.height = slide.image.height;
    const octx = out.getContext("2d");
    octx.filter = buildFilterString(slide.filter);
    octx.drawImage(slide.image, 0, 0, out.width, out.height);
    octx.filter = "none";
    drawText(octx, slide.text, out.width, out.height);
    const link = document.createElement("a");
    link.download = "wanderlust-photo.png";
    link.href = out.toDataURL("image/png");
    link.click();
  });

  // ---- Slideshow player ----
  let slideshowTimer = null;
  let slideshowIndex = 0;
  let slideshowPaused = false;

  function getSlideDuration() {
    const v = durationEl ? parseInt(durationEl.value, 10) : 3000;
    return Number.isFinite(v) && v > 0 ? v : 3000;
  }

  function startAutoplay() {
    if (slideshowTimer) clearInterval(slideshowTimer);
    slideshowTimer = setInterval(() => advanceSlideshow(1), getSlideDuration());
  }
  function stopAutoplay() {
    if (slideshowTimer) {
      clearInterval(slideshowTimer);
      slideshowTimer = null;
    }
  }

  function showSlideshowFrame() {
    const slide = slides[slideshowIndex];
    if (!slide || !modalCanvas) return;

    // Fit the current slide into a container sized to the viewport.
    const maxW = Math.min(window.innerWidth * 0.9, 1100);
    const maxH = Math.min(window.innerHeight * 0.8, 700);
    const iw = slide.image.width;
    const ih = slide.image.height;
    const scale = Math.min(maxW / iw, maxH / ih);
    modalCanvas.width = Math.round(iw * scale);
    modalCanvas.height = Math.round(ih * scale);

    const mctx = modalCanvas.getContext("2d");
    mctx.filter = buildFilterString(slide.filter);
    mctx.clearRect(0, 0, modalCanvas.width, modalCanvas.height);
    mctx.drawImage(slide.image, 0, 0, modalCanvas.width, modalCanvas.height);
    mctx.filter = "none";
    drawText(mctx, slide.text, modalCanvas.width, modalCanvas.height);

    // Restart the CSS fade so each frame gets a soft crossfade.
    modalCanvas.classList.remove("fade-in");
    // Force reflow so the animation actually retriggers.
    void modalCanvas.offsetWidth;
    modalCanvas.classList.add("fade-in");

    if (modalCounter) {
      modalCounter.textContent =
        slideshowIndex + 1 + " / " + slides.length;
    }
  }

  function advanceSlideshow(delta) {
    slideshowIndex = (slideshowIndex + delta + slides.length) % slides.length;
    showSlideshowFrame();
  }

  function playSlideshow() {
    if (slides.length < 2 || !modalEl) return;
    modalEl.classList.add("open");
    slideshowIndex = 0;
    slideshowPaused = false;
    updatePauseBtn();
    showSlideshowFrame();
    startAutoplay();
  }

  function stopSlideshow() {
    stopAutoplay();
    if (modalEl) modalEl.classList.remove("open");
  }

  function togglePause() {
    slideshowPaused = !slideshowPaused;
    if (slideshowPaused) stopAutoplay();
    else startAutoplay();
    updatePauseBtn();
  }

  function updatePauseBtn() {
    if (!modalPause) return;
    modalPause.innerHTML = slideshowPaused ? "\u25B6" : "\u275A\u275A";
    modalPause.title = slideshowPaused ? "Play" : "Pause";
  }

  if (playBtn) playBtn.addEventListener("click", playSlideshow);
  if (modalClose) modalClose.addEventListener("click", stopSlideshow);
  if (modalPause) modalPause.addEventListener("click", togglePause);

  // Manual nav resets the autoplay interval so the new slide gets the
  // full configured duration instead of finishing the previous timer.
  function manualAdvance(delta) {
    advanceSlideshow(delta);
    if (!slideshowPaused) startAutoplay();
  }
  if (modalPrev) modalPrev.addEventListener("click", () => manualAdvance(-1));
  if (modalNext) modalNext.addEventListener("click", () => manualAdvance(1));

  // Let users change duration mid-slideshow.
  if (durationEl) {
    durationEl.addEventListener("change", () => {
      if (slideshowTimer && !slideshowPaused) startAutoplay();
    });
  }
  // Click outside the canvas or press Esc to close.
  if (modalEl) {
    modalEl.addEventListener("click", (e) => {
      if (e.target === modalEl) stopSlideshow();
    });
  }
  document.addEventListener("keydown", (e) => {
    if (!modalEl || !modalEl.classList.contains("open")) return;
    if (e.key === "Escape") stopSlideshow();
    else if (e.key === "ArrowLeft") manualAdvance(-1);
    else if (e.key === "ArrowRight") manualAdvance(1);
    else if (e.key === " ") { e.preventDefault(); togglePause(); }
  });

  // Render a single slide to a JPEG data URL (used by Album save).
  function renderSlideToDataUrl(slide, maxDim) {
    const iw = slide.image.naturalWidth  || slide.image.width  || 800;
    const ih = slide.image.naturalHeight || slide.image.height || 500;
    const scale = Math.min(maxDim / iw, maxDim / ih, 1);
    const tc  = document.createElement("canvas");
    tc.width  = Math.round(iw * scale);
    tc.height = Math.round(ih * scale);
    const tctx = tc.getContext("2d");
    tctx.filter = buildFilterString(slide.filter);
    tctx.drawImage(slide.image, 0, 0, tc.width, tc.height);
    tctx.filter = "none";
    drawText(tctx, slide.text, tc.width, tc.height);
    return tc.toDataURL("image/jpeg", 0.82);
  }

  // Initial render (empty state).
  renderDeck();

  // Public API for Magic Maker and AI Touchup
  window.PhotoMagic = {
    getSlides: function () { return slides; },
    getActiveSlide: function () { return activeSlide(); },
    getActiveIndex: function () { return activeIndex; },
    updateActiveSlide: function (newSlide) {
      if (activeIndex < 0 || activeIndex >= slides.length) return;
      slides[activeIndex] = newSlide;
      syncControls();
      render();
      renderFilterThumbnails();
      renderDeck();
    },
    setSlides: function (newSlides) {
      slides = newSlides;
      activeIndex = 0;
      syncControls();
      render();
      renderFilterThumbnails();
      renderDeck();
    },
    captureActiveFrame: function () {
      const slide = activeSlide();
      return slide ? renderSlideToDataUrl(slide, 640) : null;
    },
    captureAllFrames: function () {
      const maxDim = slides.length > 6 ? 400 : 640;
      return slides.map(function (s) { return renderSlideToDataUrl(s, maxDim); });
    },
    FILTERS: FILTERS,
    startSlideshow: function () {
      if (slides.length) playBtn && playBtn.click();
    },
  };
})();
