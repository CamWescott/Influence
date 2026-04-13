// Magic Maker — uses Claude (via window.WanderlustAI) to intelligently order
// slides/clips, assign filters, write captions, and pick background music.
// Falls back to pixel-analysis heuristics when AI is unavailable.
(function () {
  "use strict";

  // ---- Filter presets (must match photo/video editors) ----
  const FILTERS = {
    none:     { b: 100, c: 100, s: 100, w:   0, bl: 0 },
    tropical: { b: 108, c: 115, s: 140, w:  15, bl: 0 },
    sunset:   { b: 105, c: 110, s: 130, w:  35, bl: 0 },
    ocean:    { b: 100, c: 115, s: 120, w: -20, bl: 0 },
    vintage:  { b: 95,  c: 90,  s: 70,  w:  20, bl: 0 },
    bnw:      { b: 105, c: 115, s: 0,   w:   0, bl: 0 },
    vivid:    { b: 105, c: 125, s: 150, w:   5, bl: 0 },
    dreamy:   { b: 112, c: 95,  s: 110, w:   8, bl: 1 },
  };

  // ---- Toast notification ----
  function showToast(msg, isError) {
    let t = document.getElementById("magicToast");
    if (!t) {
      t = document.createElement("div");
      t.id = "magicToast";
      t.className = "magic-toast";
      document.body.appendChild(t);
    }
    t.textContent = msg;
    t.className = "magic-toast" + (isError ? " error" : "") + " visible";
    clearTimeout(t._timer);
    t._timer = setTimeout(function () { t.classList.remove("visible"); }, 3500);
  }

  // ---- Pixel analysis ----
  // Returns average {r, g, b, brightness, warmth, saturation} from a canvas or image.
  function analyzeImageEl(imgEl) {
    const c = document.createElement("canvas");
    c.width  = Math.min(imgEl.naturalWidth  || imgEl.width  || 80, 80);
    c.height = Math.min(imgEl.naturalHeight || imgEl.height || 80, 80);
    const cx = c.getContext("2d");
    cx.drawImage(imgEl, 0, 0, c.width, c.height);
    return analyzeCanvas(c);
  }

  function analyzeCanvas(c) {
    const cx = c.getContext("2d");
    const data = cx.getImageData(0, 0, c.width, c.height).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] < 10) continue; // skip transparent
      r += data[i]; g += data[i + 1]; b += data[i + 2]; n++;
    }
    if (n === 0) return { r: 128, g: 128, b: 128, brightness: 50, warmth: 0, saturation: 0 };
    r /= n; g /= n; b /= n;
    const brightness = (r * 0.299 + g * 0.587 + b * 0.114) / 2.55; // 0-100
    const warmth     = (r - b) / 2.55;                               // positive = warm
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    const saturation = max > 0 ? ((max - min) / max) * 100 : 0;
    return { r, g, b, brightness, warmth, saturation };
  }

  // Describe a stats object in plain text for the Claude prompt.
  function statsToDesc(stats, i) {
    const br = stats.brightness > 65 ? "bright"  : stats.brightness < 35 ? "dark"  : "mid-toned";
    const wm = stats.warmth > 15     ? "warm"    : stats.warmth < -15    ? "cool"  : "neutral";
    const sa = stats.saturation > 55 ? "vivid"   : stats.saturation < 20 ? "muted" : "moderately colourful";
    return `Item ${i + 1}: ${br}, ${wm}, ${sa} (brightness=${Math.round(stats.brightness)}, warmth=${Math.round(stats.warmth)}, saturation=${Math.round(stats.saturation)})`;
  }

  // ---- Heuristic helpers (fallback) ----

  // Score for ordering: prefer a brightness arc (start bright → dip → end bright)
  // and warm items towards the end.
  function orderScore(stats, total, idx) {
    // ideal position in a bell-arc is idx/total ≈ 0.5 for mid-brightness
    const idealBright = idx < total / 2 ? 60 + idx * 5 : 80 - (idx - total / 2) * 4;
    return -Math.abs(stats.brightness - idealBright) + stats.warmth * 0.5;
  }

  function autoFilter(stats) {
    if (stats.saturation < 15)                        return "bnw";
    if (stats.warmth > 25 && stats.brightness > 60)  return "sunset";
    if (stats.warmth < -10 && stats.saturation > 40) return "ocean";
    if (stats.brightness > 72 && stats.saturation > 50) return "tropical";
    if (stats.brightness < 40)                        return "dreamy";
    if (stats.saturation > 60)                        return "vivid";
    if (stats.brightness < 55 && stats.warmth > 5)   return "vintage";
    return "none";
  }

  const CAPTION_POOLS = {
    bright:  ["Golden hour calling ☀️", "Chasing the light ✨", "Life is bright here 🌟", "Sun-kissed moments 🌅"],
    dark:    ["Into the mystery 🌙", "After dark adventures 🌃", "Midnight wanderings ✨", "Embracing the shadows 🖤"],
    warm:    ["Warm vibes only 🔥", "Soaking in the warmth 🌺", "Feeling the heat 🏜️", "Golden memories 🍂"],
    cool:    ["Ocean breeze state of mind 🌊", "Cool and serene 💙", "Blue hour bliss 🌊", "Lost in the cool 🩵"],
    vivid:   ["All the colours of life 🎨", "Vibrant and alive 🌈", "Full colour, full life 🎆", "Living in HD 🌺"],
    muted:   ["Timeless tones 🤍", "Soft focus, clear heart 🌫️", "Vintage soul 📷", "Faded but unforgettable 🌸"],
    default: ["Wanderlust activated ✈️", "Just another beautiful day 🌍", "Moments that matter 💫", "Travel diary 📖"],
  };

  function autoCaption(stats) {
    const pool =
      stats.brightness > 65     ? CAPTION_POOLS.bright :
      stats.brightness < 35     ? CAPTION_POOLS.dark   :
      stats.warmth > 20         ? CAPTION_POOLS.warm   :
      stats.warmth < -15        ? CAPTION_POOLS.cool   :
      stats.saturation > 60     ? CAPTION_POOLS.vivid  :
      stats.saturation < 20     ? CAPTION_POOLS.muted  : CAPTION_POOLS.default;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  function autoMusic(statsList) {
    const avg = statsList.reduce(
      (a, s) => ({ brightness: a.brightness + s.brightness, warmth: a.warmth + s.warmth, saturation: a.saturation + s.saturation }),
      { brightness: 0, warmth: 0, saturation: 0 }
    );
    const n = statsList.length || 1;
    avg.brightness /= n; avg.warmth /= n; avg.saturation /= n;
    if (avg.warmth > 20 && avg.brightness > 60) return "upbeat tropical";
    if (avg.brightness < 40 && avg.warmth < 0)  return "cinematic dramatic";
    if (avg.saturation < 20)                     return "soft acoustic";
    if (avg.brightness > 70)                     return "happy pop";
    if (avg.saturation > 60)                     return "energetic dance";
    return "chill ambient";
  }

  // ---- Rule-based fallback (no AI) ----
  function ruleBasedResult(items, statsList) {
    // Sort by a heuristic score to create a pleasing arc.
    const indexed = items.map(function (item, i) { return { item, stats: statsList[i], origIdx: i }; });
    indexed.sort(function (a, b) { return a.stats.brightness - b.stats.brightness; });
    // Interleave: put darkest at start and end, brightest in middle (‟arc").
    const sorted = [];
    let lo = 0, hi = indexed.length - 1;
    let toggle = false;
    while (lo <= hi) {
      if (toggle) sorted.push(indexed[hi--]);
      else        sorted.push(indexed[lo++]);
      toggle = !toggle;
    }

    return {
      order: sorted.map(function (_, i) { return i; }), // already sorted
      items: sorted.map(function (entry, i) {
        return {
          filter:  autoFilter(entry.stats),
          caption: autoCaption(entry.stats),
        };
      }),
      sortedItems: sorted.map(function (e) { return e.item; }),
      music: autoMusic(statsList),
    };
  }

  // ---- Claude prompt + parse ----
  function buildPrompt(type, descs) {
    return [
      `You are a ${type === "photo" ? "photo slideshow" : "video reel"} editor creating a stunning travel content piece.`,
      `You have ${descs.length} ${type}s with these pixel-analysis characteristics:`,
      descs.join("\n"),
      "",
      "Respond with ONLY a valid JSON object (no markdown fences, no explanation) in this exact shape:",
      "{",
      '  "order": [0, 2, 1, ...],',
      '  "items": [',
      '    {"filter": "tropical", "caption": "Your caption here"},',
      "    ...",
      "  ],",
      '  "music": "describe the ideal background music in 3-6 words"',
      "}",
      "",
      `The "order" array lists the original ${type} indices (0-based) in the ideal playback sequence.`,
      'The "items" array has one entry per item IN THE NEW ORDER.',
      `Valid filter names: ${Object.keys(FILTERS).join(", ")}.`,
      "Captions should be punchy, travel-themed, max 8 words, with 1-2 relevant emojis.",
      "Create a compelling narrative arc: open strong, build atmosphere, finish memorably.",
    ].join("\n");
  }

  function parseAI(raw, originalItems) {
    // Strip optional markdown fences.
    let text = raw.trim();
    const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fence) text = fence[1].trim();

    let parsed;
    try { parsed = JSON.parse(text); } catch (e) { return null; }
    if (!parsed || !Array.isArray(parsed.order) || !Array.isArray(parsed.items)) return null;
    if (parsed.order.length !== originalItems.length) return null;

    const sortedItems = parsed.order.map(function (idx) { return originalItems[idx]; });
    const items = parsed.items.map(function (item) {
      const filterName = FILTERS[item.filter] ? item.filter : "none";
      return {
        filter:  filterName,
        caption: (item.caption || "").slice(0, 120),
      };
    });

    return {
      sortedItems,
      items,
      music: typeof parsed.music === "string" ? parsed.music : "chill ambient",
    };
  }

  // ---- Apply result to slides ----
  function applyToSlides(result) {
    const api = window.PhotoMagic;
    if (!api) return;
    const slides = api.getSlides();
    const newSlides = result.sortedItems.map(function (slide, i) {
      const info   = result.items[i] || {};
      const fname  = info.filter || "none";
      const fp     = FILTERS[fname] || FILTERS.none;
      return Object.assign({}, slide, {
        preset: fname,
        filter: { b: fp.b, c: fp.c, s: fp.s, w: fp.w, bl: fp.bl },
        text:   Object.assign({}, slide.text, { content: info.caption || slide.text.content }),
      });
    });
    api.setSlides(newSlides);
  }

  // ---- Apply result to clips ----
  function applyToClips(result) {
    const api = window.VideoMagic;
    if (!api) return;
    const newClips = result.sortedItems.map(function (clip, i) {
      const info  = result.items[i] || {};
      const fname = info.filter || "none";
      const fp    = FILTERS[fname] || FILTERS.none;
      return Object.assign({}, clip, {
        preset: fname,
        filter: { b: fp.b, c: fp.c, s: fp.s, w: fp.w, bl: fp.bl },
        text:   Object.assign({}, clip.text, { content: info.caption || clip.text.content }),
      });
    });
    api.setClips(newClips);
  }

  // ---- Start music ----
  function startMusic(musicDesc) {
    if (!window.WanderlustMusic) return;
    // Reuse the panel's prompt input and Play button if present, or trigger directly.
    if (window.WanderlustMusic.start) {
      window.WanderlustMusic.start(musicDesc);
    }
  }

  // ---- Disable / re-enable a button during processing ----
  function withBtn(btn, label, fn) {
    const orig = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    fn().finally(function () {
      btn.disabled = false;
      btn.textContent = orig;
    });
  }

  // ---- Photo Magic ----
  async function runPhotoMagic(btn) {
    const api = window.PhotoMagic;
    if (!api) { showToast("Photo editor not ready.", true); return; }
    const slides = api.getSlides();
    if (!slides.length) { showToast("Add some photos first!", true); return; }

    showToast("✨ Analysing your photos…");

    // Analyse each slide's image element.
    const statsList = slides.map(function (s) { return analyzeImageEl(s.image); });
    const descs     = statsList.map(statsToDesc);

    let result = null;

    if (window.WanderlustAI) {
      try {
        showToast("✨ Claude is curating your slideshow…");
        const raw = await window.WanderlustAI.complete(buildPrompt("photo", descs), 600);
        result = parseAI(raw, slides);
        if (!result) throw new Error("Unparseable response");
      } catch (e) {
        showToast("AI unavailable — using smart heuristics…");
        result = ruleBasedResult(slides, statsList);
      }
    } else {
      result = ruleBasedResult(slides, statsList);
    }

    applyToSlides(result);

    // Start music if prompt input exists, otherwise pass music desc directly.
    const promptEl = document.getElementById("photoMusicPrompt");
    if (promptEl && window.WanderlustMusic) {
      promptEl.value = result.music;
    }
    startMusic(result.music);

    showToast("✨ Magic applied! Starting slideshow…");
    setTimeout(function () {
      if (api.startSlideshow) api.startSlideshow();
    }, 600);
  }

  // ---- Video Magic ----
  async function runVideoMagic(btn) {
    const api = window.VideoMagic;
    if (!api) { showToast("Video editor not ready.", true); return; }
    const clips = api.getClips();
    if (!clips.length) { showToast("Add some video clips first!", true); return; }

    showToast("✨ Analysing your clips…");

    // Analyse each clip's thumbnail canvas.
    const statsList = clips.map(function (c) { return analyzeCanvas(c.thumb); });
    const descs     = statsList.map(statsToDesc);

    let result = null;

    if (window.WanderlustAI) {
      try {
        showToast("✨ Claude is curating your reel…");
        const raw = await window.WanderlustAI.complete(buildPrompt("video", descs), 600);
        result = parseAI(raw, clips);
        if (!result) throw new Error("Unparseable response");
      } catch (e) {
        showToast("AI unavailable — using smart heuristics…");
        result = ruleBasedResult(clips, statsList);
      }
    } else {
      result = ruleBasedResult(clips, statsList);
    }

    applyToClips(result);

    // Start music.
    const promptEl = document.getElementById("videoMusicPrompt");
    if (promptEl && window.WanderlustMusic) {
      promptEl.value = result.music;
    }
    startMusic(result.music);

    showToast("✨ Magic applied! Starting reel…");
    setTimeout(function () {
      if (api.startReel) api.startReel();
    }, 600);
  }

  // ---- Wire buttons ----
  function wireBtn(id, fn) {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener("click", function () {
      withBtn(btn, "Working…", function () { return fn(btn).catch(function (err) { showToast("Something went wrong.", true); console.error(err); }); });
    });
  }

  // Wait for DOM ready then wire.
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", function () {
      wireBtn("photoMagicBtn", runPhotoMagic);
      wireBtn("videoMagicBtn", runVideoMagic);
    });
  } else {
    wireBtn("photoMagicBtn", runPhotoMagic);
    wireBtn("videoMagicBtn", runVideoMagic);
  }
})();
