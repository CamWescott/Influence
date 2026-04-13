// Photo editor: Canvas-based with filters, adjustments, and AI-suggested edits.
(function () {
  const drop = document.getElementById("photoDrop");
  const input = document.getElementById("photoInput");
  const canvas = document.getElementById("photoCanvas");
  const emptyMsg = document.getElementById("photoEmpty");
  const suggestionsBox = document.getElementById("photoSuggestions");
  const ctx = canvas.getContext("2d");

  const sliders = {
    brightness: document.getElementById("brightness"),
    contrast: document.getElementById("contrast"),
    saturation: document.getElementById("saturation"),
    warmth: document.getElementById("warmth"),
    blur: document.getElementById("blur"),
  };

  let originalImage = null;
  let activeFilter = "none";

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

  function applyPreset(name) {
    const p = FILTERS[name] || FILTERS.none;
    sliders.brightness.value = p.b;
    sliders.contrast.value   = p.c;
    sliders.saturation.value = p.s;
    sliders.warmth.value     = p.w;
    sliders.blur.value       = p.bl;
    render();
  }

  // Builds the CSS-style filter string that Canvas2D supports.
  // Warmth: positive adds sepia for warm tones; negative simulates cool
  // tones by rotating hue toward blue.
  function buildFilterString(b, c, s, w, bl) {
    const sepia = w > 0 ? w : 0;
    const hueRotate = w < 0 ? Math.abs(w) * 2 : 0;
    return (
      "brightness(" + b + "%) " +
      "contrast(" + c + "%) " +
      "saturate(" + s + "%) " +
      "sepia(" + sepia + "%) " +
      "hue-rotate(" + hueRotate + "deg) " +
      "blur(" + bl + "px)"
    );
  }

  function render() {
    if (!originalImage) return;
    const b = sliders.brightness.value;
    const c = sliders.contrast.value;
    const s = sliders.saturation.value;
    const w = parseInt(sliders.warmth.value, 10);
    const bl = sliders.blur.value;

    ctx.filter = buildFilterString(b, c, s, w, bl);

    // Fit image into canvas preserving aspect ratio.
    const maxW = 800;
    const maxH = 500;
    let iw = originalImage.width;
    let ih = originalImage.height;
    const scale = Math.min(maxW / iw, maxH / ih, 1);
    canvas.width = Math.round(iw * scale);
    canvas.height = Math.round(ih * scale);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(originalImage, 0, 0, canvas.width, canvas.height);
  }

  // Paint every filter's preview onto its own thumbnail canvas, so users
  // can eyeball all 8 options side-by-side against their actual photo
  // before committing to one.
  function renderFilterThumbnails() {
    if (!originalImage) return;
    document.querySelectorAll(".filter-btn").forEach(function (btn) {
      const name = btn.dataset.filter;
      const p = FILTERS[name] || FILTERS.none;
      const thumbCanvas = btn.querySelector(".filter-thumb");
      if (!thumbCanvas) return;
      thumbCanvas.classList.remove("empty");

      const tctx = thumbCanvas.getContext("2d");
      const tw = thumbCanvas.width;
      const th = thumbCanvas.height;

      tctx.filter = buildFilterString(p.b, p.c, p.s, p.w, p.bl);

      // Cover-fit the image into the thumbnail so it never looks stretched.
      const iw = originalImage.width;
      const ih = originalImage.height;
      const scale = Math.max(tw / iw, th / ih);
      const dw = iw * scale;
      const dh = ih * scale;
      const dx = (tw - dw) / 2;
      const dy = (th - dh) / 2;

      tctx.clearRect(0, 0, tw, th);
      tctx.drawImage(originalImage, dx, dy, dw, dh);
    });
  }

  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = function (e) {
      const img = new Image();
      img.onload = function () {
        originalImage = img;
        canvas.classList.add("loaded");
        if (emptyMsg) emptyMsg.style.display = "none";
        applyPreset("none");
        renderFilterThumbnails();
        suggestEdits(img);
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  }

  // Before any photo is loaded, mark the thumbnail canvases with an empty
  // class so the CSS placeholder (diagonal hatch on a blue gradient) shows
  // up instead of a blank white box.
  document.querySelectorAll(".filter-thumb").forEach(function (t) {
    t.classList.add("empty");
  });

  // Look at average brightness / color balance to suggest edits.
  function suggestEdits(img) {
    const s = document.createElement("canvas");
    const sctx = s.getContext("2d");
    s.width = 60;
    s.height = 60;
    sctx.drawImage(img, 0, 0, 60, 60);
    const data = sctx.getImageData(0, 0, 60, 60).data;

    let r = 0, g = 0, b = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
    }
    const n = data.length / 4;
    r /= n; g /= n; b /= n;
    const bright = (r + g + b) / 3;

    const tips = [];
    if (bright < 90) {
      tips.push("Photo looks <strong>dark</strong> — try raising brightness to ~120 or apply the <em>Dreamy</em> filter.");
    } else if (bright > 180) {
      tips.push("Photo looks <strong>overexposed</strong> — pull brightness back to ~90 and boost contrast.");
    } else {
      tips.push("Exposure looks good. Try the <em>Vivid</em> filter to make the colors pop.");
    }

    if (b > r + 15) {
      tips.push("Lots of blue — nice for beaches/pools. The <em>Ocean</em> filter will emphasize it.");
    } else if (r > b + 15) {
      tips.push("Warm reds/oranges dominate — <em>Sunset</em> filter will make it glow.");
    } else {
      tips.push("Balanced color — <em>Tropical</em> adds a vacation feel.");
    }

    if (g > r && g > b) {
      tips.push("Lots of greens (jungle / nature shot). Try saturation ~130 and a hint of warmth.");
    }

    tips.push("Straighten the horizon and crop to 4:5 for Instagram feed.");

    suggestionsBox.innerHTML =
      "<ul><li>" + tips.join("</li><li>") + "</li></ul>";
  }

  // ---- Event wiring ----
  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    loadFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", (e) => loadFile(e.target.files[0]));

  Object.values(sliders).forEach((slider) =>
    slider.addEventListener("input", render)
  );

  document.querySelectorAll(".filter-btn").forEach((btn) =>
    btn.addEventListener("click", () => {
      document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeFilter = btn.dataset.filter;
      applyPreset(activeFilter);
    })
  );

  document.getElementById("photoReset").addEventListener("click", () => {
    document.querySelectorAll(".filter-btn").forEach((b) => b.classList.remove("active"));
    applyPreset("none");
  });

  document.getElementById("photoDownload").addEventListener("click", () => {
    if (!originalImage) return;
    // Re-draw with filter applied to a fresh canvas to bake in the filter.
    const out = document.createElement("canvas");
    out.width = canvas.width;
    out.height = canvas.height;
    const octx = out.getContext("2d");
    octx.filter = ctx.filter;
    octx.drawImage(originalImage, 0, 0, out.width, out.height);
    const link = document.createElement("a");
    link.download = "wanderlust-photo.png";
    link.href = out.toDataURL("image/png");
    link.click();
  });
})();
