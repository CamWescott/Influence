// Blog generator: uses Claude API if a key is set, otherwise falls back to
// a rich client-side template that reliably produces ~1500 words.
(function () {
  const drop = document.getElementById("blogDrop");
  const photoInput = document.getElementById("blogPhotoInput");
  const preview = document.getElementById("blogPreview");
  const topicEl = document.getElementById("blogTopic");
  const kwEl = document.getElementById("blogKeywords");
  const audienceEl = document.getElementById("blogAudience");
  const toneEl = document.getElementById("blogTone");
  const generateBtn = document.getElementById("blogGenerate");
  const copyBtn = document.getElementById("blogCopy");
  const output = document.getElementById("blogOutput");

  let heroDataUrl = "";

  function loadFile(file) {
    if (!file || !file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      heroDataUrl = e.target.result;
      preview.src = heroDataUrl;
      preview.classList.add("loaded");
    };
    reader.readAsDataURL(file);
  }

  drop.addEventListener("click", () => photoInput.click());
  drop.addEventListener("dragover", (e) => { e.preventDefault(); drop.classList.add("drag"); });
  drop.addEventListener("dragleave", () => drop.classList.remove("drag"));
  drop.addEventListener("drop", (e) => {
    e.preventDefault();
    drop.classList.remove("drag");
    loadFile(e.dataTransfer.files[0]);
  });
  photoInput.addEventListener("change", (e) => loadFile(e.target.files[0]));

  // ---------- Local template generator (~1500 words) ----------
  function localGenerate(topic, keywords, audience, tone) {
    const kwList = keywords.split(",").map((k) => k.trim()).filter(Boolean);
    const primaryKw = kwList[0] || topic;

    const title = pickTitle(topic, audience);
    const metaDesc = "Planning a trip to " + topic + "? Here's a complete guide for " + audience.toLowerCase() + " covering " + kwList.slice(0, 3).join(", ") + " and more.";

    const intro = paragraphs([
      "There are places you visit, and then there are places that rearrange the furniture of your imagination. " + topic + " is firmly in the second category. The moment you arrive, the air feels softer, the colors look brighter, and every street corner starts to whisper travel-blog-worthy secrets.",
      "I put this guide together for " + audience.toLowerCase() + " who want more than just a checklist of tourist traps. Whether you're booking your first trip or your fifteenth, you'll walk away with a game plan that maximizes every hour you spend in " + topic + " — with a special focus on " + kwList.slice(0, 3).join(", ") + ".",
      "Grab a coffee (or a piña colada, I won't judge) and let's dive into everything you need to know to make this trip unforgettable.",
    ]);

    const sections = [
      {
        h: "Why " + topic + " Should Be On Your Bucket List",
        p: [
          "If you've been scrolling travel reels wondering where to go next, consider this your sign. " + topic + " manages to pack beaches, culture, food, and adventure into a single destination — the kind of place where you can start your morning snorkeling and end it watching fireworks over the water.",
          "For " + audience.toLowerCase() + " in particular, the destination punches above its weight. Activities are easy to plan, the vibe is welcoming, and the memories you'll bring home are the kind that show up uninvited years later, making you smile on a random Tuesday.",
          "One thing to keep in mind: the best way to experience " + topic + " is to balance the big-ticket sights with moments of genuine slowness. That's where the magic lives — and that's what makes it one of the most rewarding trips you can plan around " + primaryKw + ".",
        ],
      },
      {
        h: "Best Time To Visit",
        p: [
          "Timing matters. Visit " + topic + " during shoulder season and you'll get warm weather, fewer crowds, and better prices on flights and stays. Peak season has its own charm (read: energy, events, golden-hour photos), but you'll pay for it — both in dollars and patience.",
          "A good rule of thumb: aim for the sweet spot between weather and wallet. If you can be flexible with dates, check Tuesdays and Wednesdays, which are historically the cheapest days to fly. Set up fare alerts a couple months ahead and pounce when you see a drop.",
          "Whatever you pick, always double-check the local event calendar. A single festival, parade, or cruise-ship port day can completely transform the character of " + topic + " for 24 hours.",
        ],
      },
      {
        h: "How To Get There (Without Overpaying)",
        p: [
          "Flights are usually the biggest expense, so start there. Use a combination of fare trackers and flexible-date tools to sniff out deals. If your trip involves a cruise component, look into port-intensive itineraries that let you see " + topic + " as one of several stops — you'll often save hundreds versus flying to each destination.",
          "From the airport, you've got options: taxis, rideshares, shuttles, or public transit. For " + audience.toLowerCase() + ", the fastest-and-friendliest combo is usually a prebooked airport transfer to your hotel, then walking or short rideshare hops once you've settled in.",
          "Pro tip: save a screenshot of your booking confirmations offline. Airport Wi-Fi has a cruel sense of humor.",
        ],
      },
      {
        h: "Where To Stay",
        p: [
          "The right base makes or breaks a trip. In " + topic + ", the neighborhood you pick matters even more than the hotel star rating. You want walkability, safety, good food within five minutes, and transit access for the days you venture further.",
          "Boutique stays are my personal sweet spot — big enough to have a pool and proper Wi-Fi, small enough to feel like you're a guest rather than a room number. If you're traveling as a group or bringing kids, consider a vacation rental with a kitchen. Even one home-cooked breakfast saves real money over a week.",
          "Whatever you pick, read the recent reviews (last three months). Hotels can swing wildly with new management, and you don't want surprises on night one.",
        ],
      },
      {
        h: "Top Things To Do In " + topic,
        p: [
          "Here's where " + topic + " absolutely shines. You could spend a week and still leave with a list of 'next time' ideas — but if I had to name the must-dos, they'd be the classic sights, one food tour, one outdoor adventure, and at least one slow morning spent doing absolutely nothing. Don't skip that last one; it's the secret sauce of a great trip.",
          "If your interests include " + kwList.slice(0, 2).join(" and ") + ", carve out half a day for each. Book popular activities in advance — walk-up availability is a fantasy in high season. And always build in a buffer day; weather and tired feet are undefeated.",
          "For " + audience.toLowerCase() + ", I'd prioritize experiences that tell a story: a guided walking tour with a local, a cooking class, a sunset sail. These are the memories that outlast the souvenirs.",
        ],
      },
      {
        h: "What To Eat (And Where)",
        p: [
          "Food is half the reason to travel. In " + topic + ", don't leave without trying the signature dishes, the street-food staples, and at least one 'fancy' meal to celebrate the trip. Skip restaurants with a waiter outside trying to wave you in — that's usually a bad sign.",
          "Ask your hotel or Airbnb host for their actual-favorite, not-for-tourists recommendation. You'll get the best meal of your trip for half the price, and you'll have a story about the tiny place down an alley that nobody else on your feed has found yet.",
          "Hydration, hydration, hydration. Between the sun, the walking, and the cocktails, it sneaks up on you. Carry a reusable bottle — your future self will thank you.",
        ],
      },
      {
        h: "Budget Tips And Hidden Costs",
        p: [
          "A good travel budget accounts for the obvious stuff (flights, hotels, activities) and the not-so-obvious stuff (airport transfers, tips, SIM cards, laundry, souvenirs, that one impulse-buy hat). I budget roughly 20% above the 'big three' and rarely have to stress at the end of the trip.",
          "Use a no-foreign-transaction-fee card where accepted, and keep some local cash for taxis and markets. Always decline dynamic currency conversion at card terminals — it's a silent fee trap.",
          "The best budget hack of all? Walk more. Not only does it save money, it's where the best travel moments happen: the bakery you smell before you see it, the view you almost missed, the local cat that decides to join you for three blocks.",
        ],
      },
      {
        h: "What To Pack",
        p: [
          "Keep it light. You can always buy what you forget, and your shoulders will thank you. Must-haves for " + topic + ": comfortable walking shoes, a light rain layer, sunscreen (reef-safe if there's any water involved), a portable charger, and a zippered day bag.",
          "A small medical kit goes a long way. Band-aids, electrolyte tablets, and a bit of pain reliever can turn a potentially-ruined afternoon into a minor inconvenience.",
          "For outfits, pick a color palette and stick to it. Everything mixes, everything packs flat, and your photos look more cohesive on the feed. You're welcome.",
        ],
      },
      {
        h: "Safety And Local Etiquette",
        p: [
          "Most of travel safety is just paying attention. Keep valuables in your hotel safe, don't flash cash, and trust your instincts — if something feels off, it is. Share your itinerary with someone back home and check in daily.",
          "Learn a few polite phrases in the local language. 'Hello,' 'please,' 'thank you,' and 'sorry' will carry you an astonishing distance. Locals notice when you try, and the trip gets warmer because of it.",
          "Respect the dress code at religious or cultural sites. A thin scarf in your day bag solves 90% of the surprises you'll run into.",
        ],
      },
      {
        h: "Sample " + pickDuration() + "-Day Itinerary",
        p: [
          "Day one is for landing softly: check in, take a walk around your neighborhood, eat somewhere low-key, and crash early. Resist the urge to squeeze a sight into this day — jet lag always wins the fight.",
          "Day two is your headline day. Book the marquee activity, whether that's a boat tour, a park, or a full-day excursion. Start early, pack water and snacks, and give yourself the evening off.",
          "Remaining days are for balance: one local-culture day, one outdoor/active day, one slow 'beach or café' day, and one 'wildcard' you decide morning-of. Trust me — the wildcard day is the one you'll remember most.",
        ],
      },
      {
        h: "FAQ",
        p: [
          "Is " + topic + " good for " + audience.toLowerCase() + "? Absolutely — it's one of the more welcoming destinations in the region, with enough variety to suit different paces and interests.",
          "How many days do I need? A long weekend (3–4 days) will give you the highlights; a full week lets you slow down and actually live there for a minute. Anything over 10 days is bonus territory.",
          "Do I need to book in advance? For popular activities and prime-time hotels, yes. For restaurants and casual experiences, walk-ins are usually fine outside of peak season.",
        ],
      },
      {
        h: "Final Thoughts",
        p: [
          topic + " is the kind of trip that reminds you why you started traveling in the first place. It rewards planning but also rewards wandering, which is a rare and beautiful combination. Go with an open itinerary, a full phone battery, and room in your suitcase for whatever the trip insists you bring home.",
          "If you use this guide to plan your own adventure, I'd love to hear how it went — drop a comment with your favorite moment, or tag me in your photos so I can cheer you on. And if you're still in the dreaming phase, bookmark this post and come back when you're ready to book. Your future self is going to be so glad you did.",
          "Safe travels, friend. The world is waiting.",
        ],
      },
    ];

    // Render.
    let html = "<h1>" + title + "</h1>";
    html += '<p class="meta"><span class="tag">' + audience + '</span>';
    kwList.slice(0, 5).forEach((k) => (html += '<span class="tag">#' + k.replace(/\s+/g, "") + "</span>"));
    html += "</p>";
    if (heroDataUrl) html += '<img src="' + heroDataUrl + '" alt="' + topic + '" />';
    html += '<p><em>' + metaDesc + "</em></p>";
    html += intro;
    sections.forEach((s) => {
      html += "<h2>" + s.h + "</h2>";
      html += paragraphs(s.p);
    });

    return html;
  }

  function paragraphs(arr) { return arr.map((p) => "<p>" + p + "</p>").join(""); }
  function pickTitle(topic, audience) {
    const a = audience.toLowerCase();
    const options = [
      "The Ultimate " + topic + " Travel Guide for " + audience,
      "I Spent a Week in " + topic + " — Here's Everything You Should Know",
      topic + ": A Complete Guide for " + a,
      "Why " + topic + " Should Be Your Next Trip (and How to Plan It)",
    ];
    return options[Math.floor(Math.random() * options.length)];
  }
  function pickDuration() {
    return [3, 4, 5, 7][Math.floor(Math.random() * 4)];
  }

  // ---------- Loading animation ----------
  // A cartoon cruise ship sails across an animated ocean while Claude works.
  // Status text rotates so even 30-second waits feel alive.
  const LOADING_STAGES = [
    { at: 0,     text: "Boarding the ship" },
    { at: 4000,  text: "Casting off the lines" },
    { at: 9000,  text: "Setting sail" },
    { at: 15000, text: "Writing your blog post" },
    { at: 25000, text: "Polishing the prose" },
    { at: 35000, text: "Almost to port" },
    { at: 50000, text: "Just a moment longer" },
  ];
  let loadingTimer = null;

  function showLoading() {
    output.innerHTML =
      '<div class="blog-loading">' +
        '<div class="bl-sun"></div>' +
        '<div class="bl-cloud c1"></div>' +
        '<div class="bl-cloud c2"></div>' +
        '<div class="bl-cloud c3"></div>' +
        '<div class="bl-waves"></div>' +
        '<div class="bl-ship">' +
          '<div class="bl-ship-flag"></div>' +
          '<div class="bl-ship-stack s1"></div>' +
          '<div class="bl-ship-stack s2"></div>' +
          '<div class="bl-ship-stack s3"></div>' +
          '<div class="bl-ship-bridge"></div>' +
          '<div class="bl-ship-deck"></div>' +
          '<div class="bl-ship-hull"></div>' +
        '</div>' +
        '<div class="bl-text">' +
          '<strong id="blogLoadStatus">Boarding the ship</strong>' +
          '<span>Claude is writing your travel blog. This usually takes 15\u201330 seconds.</span>' +
        '</div>' +
      '</div>';

    const started = Date.now();
    if (loadingTimer) clearInterval(loadingTimer);
    loadingTimer = setInterval(function () {
      const el = document.getElementById("blogLoadStatus");
      if (!el) { clearInterval(loadingTimer); loadingTimer = null; return; }
      const elapsed = Date.now() - started;
      let stage = LOADING_STAGES[0].text;
      for (let i = 0; i < LOADING_STAGES.length; i++) {
        if (elapsed >= LOADING_STAGES[i].at) stage = LOADING_STAGES[i].text;
      }
      el.textContent = stage;
    }, 500);
  }

  function stopLoading() {
    if (loadingTimer) { clearInterval(loadingTimer); loadingTimer = null; }
  }

  // ---------- Generate button ----------
  generateBtn.addEventListener("click", async function () {
    const topic = topicEl.value.trim() || "Castaway Cay";
    const keywords = kwEl.value.trim() || "travel, cruise, vacation";
    const audience = audienceEl.value;
    const tone = toneEl.value;

    showLoading();

    if (window.WanderlustAI) {
      try {
        const prompt =
          "You are an expert travel blogger. Write a 1500-word SEO-optimized blog post about \"" + topic + "\" for " + audience + ".\n" +
          "Tone: " + tone + ".\n" +
          "Target keywords (use naturally, don't stuff): " + keywords + ".\n\n" +
          "Requirements:\n" +
          "- Format output as HTML. Use <h1> for the title, <h2> for section headings, and <p> for paragraphs.\n" +
          "- Include: intro, 'Why visit', 'Best time to go', 'How to get there', 'Where to stay', 'Top things to do', 'Where to eat', 'Budget tips', 'What to pack', 'Safety & etiquette', 'Sample itinerary', 'FAQ', and a conclusion.\n" +
          "- Approximately 1500 words total.\n" +
          "- No markdown, no code fences. Only HTML.";
        const html = await window.WanderlustAI.complete(prompt, 3000);
        let finalHtml = html.trim()
          .replace(/^```html\s*/i, "")
          .replace(/^```\s*/i, "")
          .replace(/```$/i, "");
        if (heroDataUrl) {
          finalHtml = finalHtml.replace(/<\/h1>/i, '</h1><img src="' + heroDataUrl + '" alt="' + topic + '" />');
        }
        stopLoading();
        output.innerHTML = finalHtml;
        return;
      } catch (err) {
        console.warn("Claude generation failed, falling back:", err);
      }
    }

    stopLoading();
    output.innerHTML = localGenerate(topic, keywords, audience, tone);
  });

  copyBtn.addEventListener("click", function () {
    const text = output.innerText;
    navigator.clipboard.writeText(text).then(
      () => { copyBtn.textContent = "Copied!"; setTimeout(() => (copyBtn.textContent = "Copy to clipboard"), 1500); },
      () => alert("Couldn't copy to clipboard.")
    );
  });
})();
