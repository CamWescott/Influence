// Video section: file upload + AI voice-over using Web Speech API.
// Plays the video (muted) alongside a synthesized narration of the user's script.
(function () {
  const drop = document.getElementById("videoDrop");
  const input = document.getElementById("videoInput");
  const player = document.getElementById("videoPlayer");
  const script = document.getElementById("voScript");
  const voiceSel = document.getElementById("voVoice");
  const rateEl = document.getElementById("voRate");
  const pitchEl = document.getElementById("voPitch");

  function loadFile(file) {
    if (!file || !file.type.startsWith("video/")) return;
    const url = URL.createObjectURL(file);
    player.src = url;
    player.classList.add("loaded");
  }

  drop.addEventListener("click", () => input.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    loadFile(e.dataTransfer.files[0]);
  });
  input.addEventListener("change", (e) => loadFile(e.target.files[0]));

  // ---- Voice loading ----
  function populateVoices() {
    if (!("speechSynthesis" in window)) {
      voiceSel.innerHTML = '<option>Speech synthesis not supported</option>';
      return;
    }
    const voices = window.speechSynthesis.getVoices();
    if (!voices.length) return;
    voiceSel.innerHTML = "";
    // Prefer English voices at the top.
    const sorted = voices.slice().sort((a, b) => {
      const ae = a.lang.startsWith("en") ? 0 : 1;
      const be = b.lang.startsWith("en") ? 0 : 1;
      return ae - be || a.name.localeCompare(b.name);
    });
    sorted.forEach((v, i) => {
      const opt = document.createElement("option");
      opt.value = v.name;
      opt.textContent = v.name + " (" + v.lang + ")";
      voiceSel.appendChild(opt);
    });
  }
  populateVoices();
  if ("speechSynthesis" in window) {
    window.speechSynthesis.onvoiceschanged = populateVoices;
  }

  function narrate() {
    const text = script.value.trim();
    if (!text) {
      alert("Write a script first, then hit Narrate.");
      return;
    }
    if (!("speechSynthesis" in window)) {
      alert("Your browser doesn't support speech synthesis.");
      return;
    }

    window.speechSynthesis.cancel();

    const utter = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const chosen = voices.find((v) => v.name === voiceSel.value);
    if (chosen) utter.voice = chosen;
    utter.rate = parseFloat(rateEl.value);
    utter.pitch = parseFloat(pitchEl.value);

    // Mute video audio so narration is clear; play them together.
    if (player.src) {
      player.muted = true;
      player.currentTime = 0;
      player.play().catch(() => {});
    }
    window.speechSynthesis.speak(utter);

    utter.onend = function () {
      if (player.src) player.pause();
    };
  }

  function stopAll() {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    if (player.src) player.pause();
  }

  document.getElementById("voPlay").addEventListener("click", narrate);
  document.getElementById("voStop").addEventListener("click", stopAll);

  // ---- Suggest a script ----
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
    // Try Claude via the Cloud Function proxy (or local key in dev).
    if (window.WanderlustAI) {
      script.value = "Generating with Claude...";
      try {
        const prompt = "Write a short 30-45 second travel vlog voice-over script for a cruise/beach destination. Make it warm, vivid, and engaging. Output only the script, no stage directions.";
        const out = await window.WanderlustAI.complete(prompt, 400);
        script.value = out.trim();
      } catch (err) {
        script.value = rand(SAMPLE_OPENERS) + " " + rand(SAMPLE_MIDDLE) + " " + rand(SAMPLE_CLOSERS);
      }
      return;
    }
    script.value = rand(SAMPLE_OPENERS) + " " + rand(SAMPLE_MIDDLE) + " " + rand(SAMPLE_CLOSERS);
  });
})();
