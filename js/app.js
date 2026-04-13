// App shell: auth guard, tab switching, Claude API settings.
(function () {
  // ----- Auth guard -----
  const user = window.WanderlustAuth && window.WanderlustAuth.getUser();
  if (!user) {
    window.location.href = "index.html";
    return;
  }
  document.getElementById("userName").textContent = user.name || "Captain";
  document.getElementById("signOutBtn").addEventListener("click", () => {
    window.WanderlustAuth.signOut();
  });

  // ----- Tabs -----
  const tabs = document.querySelectorAll(".tab");
  const panels = document.querySelectorAll(".panel");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      tabs.forEach((t) => t.classList.remove("active"));
      panels.forEach((p) => p.classList.remove("active"));
      tab.classList.add("active");
      document.getElementById("panel-" + tab.dataset.tab).classList.add("active");
    });
  });

  // ----- Claude API integration (optional) -----
  // User pastes their key once; it's stored in localStorage and used to power
  // blog generation and voice-over script suggestions. If no key is present,
  // the app falls back to built-in templates.
  const KEY_STORAGE = "wanderlust_claude_key";
  const MODEL = "claude-opus-4-6";

  window.WanderlustAI = {
    hasKey() { return !!localStorage.getItem(KEY_STORAGE); },
    getKey() { return localStorage.getItem(KEY_STORAGE) || ""; },
    setKey(k) { localStorage.setItem(KEY_STORAGE, k); },
    clearKey() { localStorage.removeItem(KEY_STORAGE); },
    async complete(prompt, maxTokens) {
      const key = this.getKey();
      if (!key) throw new Error("No API key set");
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
          "anthropic-dangerous-direct-browser-access": "true",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: maxTokens || 2000,
          messages: [{ role: "user", content: prompt }],
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error("Claude API error: " + res.status + " " + err);
      }
      const data = await res.json();
      const block = (data.content || []).find((b) => b.type === "text");
      return block ? block.text : "";
    },
  };

  // Small settings button in topbar to manage the key.
  const topbar = document.querySelector(".topbar .user-box");
  const aiBtn = document.createElement("button");
  aiBtn.className = "btn btn-ghost";
  aiBtn.id = "aiSettingsBtn";
  aiBtn.innerHTML = "&#10024; AI";
  aiBtn.title = "Set Claude API key (optional)";
  topbar.insertBefore(aiBtn, topbar.firstChild);

  function updateAiBtn() {
    aiBtn.innerHTML = window.WanderlustAI.hasKey() ? "&#10024; AI \u2713" : "&#10024; AI";
  }
  updateAiBtn();

  aiBtn.addEventListener("click", () => {
    const current = window.WanderlustAI.getKey();
    const next = prompt(
      "Paste your Anthropic API key to enable Claude-powered blog writing and script suggestions. Leave blank to remove the key.\n\nStored locally in your browser only.",
      current
    );
    if (next === null) return;
    if (next.trim() === "") {
      window.WanderlustAI.clearKey();
    } else {
      window.WanderlustAI.setKey(next.trim());
    }
    updateAiBtn();
  });
})();
