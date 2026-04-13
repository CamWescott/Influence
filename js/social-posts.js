// Social post generator: templated captions + hashtags for IG, TikTok, X, FB.
(function () {
  const topicEl = document.getElementById("socialTopic");
  const moodEl = document.getElementById("socialMood");
  const btn = document.getElementById("socialGenerate");
  const grid = document.getElementById("socialGrid");

  const HOOKS = {
    Magical: [
      "POV: you walked into a real-life postcard",
      "The moment the sky turned pink and everything went quiet",
      "Tell me this isn't straight out of a fairytale",
    ],
    Adventurous: [
      "Chasing waterfalls > chasing deadlines",
      "Adrenaline level: unlocked",
      "Say yes, then figure it out on the way",
    ],
    Relaxing: [
      "Your reminder to book the trip",
      "The softest reset I didn't know I needed",
      "Salt in my hair, stress in the rearview",
    ],
    Funny: [
      "Me, pretending I'm a travel blogger (I am)",
      "Sunscreen: applied. Dignity: optional.",
      "If I post enough sunset pics, maybe I can work remote forever",
    ],
    Inspiring: [
      "Travel is the only thing you buy that makes you richer",
      "The best stories live outside your comfort zone",
      "Collect moments, not things",
    ],
  };

  const HASHTAGS = [
    "#travel", "#wanderlust", "#traveltheworld", "#travelgram",
    "#bucketlist", "#vacation", "#travelblogger", "#adventure",
    "#exploremore", "#passportready", "#traveldiaries", "#cruiselife",
    "#disneycruise", "#beachlife", "#sunsetchaser", "#traveltips",
  ];

  function pick(arr, n) {
    const copy = arr.slice();
    const out = [];
    while (out.length < n && copy.length) {
      out.push(copy.splice(Math.floor(Math.random() * copy.length), 1)[0]);
    }
    return out;
  }

  function generate() {
    const topic = topicEl.value.trim() || "this magical travel moment";
    const mood = moodEl.value;
    const hooks = HOOKS[mood] || HOOKS.Magical;
    const tags = pick(HASHTAGS, 10).join(" ");

    const ig = hooks[0] + " \u2728\n\n" + topic + ". " +
      "If I could bottle this feeling and carry it around all year, I would. " +
      "Saving this one in the memory bank forever \ud83d\udc99";

    const tt = hooks[1] + " \ud83d\udc47\n\n" +
      "Watch till the end \u2014 the reveal is worth it. " +
      "Save this for your next trip inspo!";

    const x = hooks[2] + ". " + topic + ". 10/10.";

    const fb = "Just got back from " + topic + " and my heart is so full. " +
      "Here's what made it unforgettable \u2014 full photo dump in the comments \ud83d\udc47 " +
      "(tag the travel buddy you want to bring back with!)";

    const cards = [
      { cls: "ig", name: "Instagram", text: ig, tags: tags },
      { cls: "tt", name: "TikTok",    text: tt, tags: pick(HASHTAGS, 8).join(" ") },
      { cls: "x",  name: "X / Twitter", text: x, tags: pick(HASHTAGS, 4).join(" ") },
      { cls: "fb", name: "Facebook",  text: fb, tags: "" },
    ];

    grid.innerHTML = cards
      .map(
        (c) => `
        <div class="social-card ${c.cls}">
          <button class="copy" data-copy="${escapeAttr(c.text + (c.tags ? "\n\n" + c.tags : ""))}">Copy</button>
          <h4>${c.name}</h4>
          <p>${escapeHtml(c.text)}</p>
          ${c.tags ? `<div class="tags">${escapeHtml(c.tags)}</div>` : ""}
        </div>`
      )
      .join("");

    grid.querySelectorAll(".copy").forEach((b) =>
      b.addEventListener("click", () => {
        navigator.clipboard.writeText(b.dataset.copy);
        b.textContent = "Copied!";
        setTimeout(() => (b.textContent = "Copy"), 1200);
      })
    );
  }

  function escapeHtml(s) {
    return s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));
  }
  function escapeAttr(s) { return escapeHtml(s).replace(/"/g, "&quot;"); }

  btn.addEventListener("click", generate);
})();
