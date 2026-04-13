// Wanderlust Deck — simple client-side auth (no server).
// Stores session in localStorage so the app pages can read it.

(function () {
  const STORAGE_KEY = "wanderlust_user";

  function saveUser(user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  }

  function getUser() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch (e) {
      return null;
    }
  }

  // If already signed in on the login page, bounce to the app.
  if (document.body.classList.contains("login-page") && getUser()) {
    window.location.href = "app.html";
    return;
  }

  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const name = email.split("@")[0] || "Captain";
      saveUser({
        email: email,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        provider: "email",
        signedInAt: new Date().toISOString(),
      });
      window.location.href = "app.html";
    });
  }

  const googleBtn = document.getElementById("googleBtn");
  if (googleBtn) {
    googleBtn.addEventListener("click", function () {
      // Simulated Google sign-in. In a real build, replace with the Google
      // Identity Services flow and exchange the credential with your backend.
      const email = prompt("Sign in with Google — enter your Gmail:", "traveler@gmail.com");
      if (!email) return;
      const name = email.split("@")[0] || "Traveler";
      saveUser({
        email: email,
        name: name.charAt(0).toUpperCase() + name.slice(1),
        provider: "google",
        signedInAt: new Date().toISOString(),
      });
      window.location.href = "app.html";
    });
  }

  // Expose tiny API for the app page.
  window.WanderlustAuth = {
    getUser: getUser,
    signOut: function () {
      localStorage.removeItem(STORAGE_KEY);
      window.location.href = "index.html";
    },
  };
})();
