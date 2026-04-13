// Wanderlust Deck auth.
//
// Two modes:
//   1. If js/firebase-config.js contains a real Firebase config, we use
//      Firebase Authentication (email/password + Google provider).
//   2. Otherwise we fall back to a local-only simulated auth so the app
//      remains fully functional offline / before the user has a project.
//
// Session is mirrored to localStorage under STORAGE_KEY so the other app
// pages can read the current user synchronously.

(function () {
  const STORAGE_KEY = "wanderlust_user";

  const cfg = window.WANDERLUST_FIREBASE_CONFIG || {};
  const useFirebase =
    typeof firebase !== "undefined" &&
    cfg.apiKey &&
    !cfg.apiKey.startsWith("YOUR_");

  let fbAuth = null;
  if (useFirebase) {
    try {
      firebase.initializeApp(cfg);
      fbAuth = firebase.auth();
    } catch (e) {
      console.warn("Firebase init failed, falling back to local auth:", e);
    }
  }

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
  function clearUser() {
    localStorage.removeItem(STORAGE_KEY);
  }

  // Keep localStorage in sync with Firebase auth state.
  if (fbAuth) {
    fbAuth.onAuthStateChanged(function (u) {
      if (u) {
        saveUser({
          email: u.email,
          name: u.displayName || (u.email ? u.email.split("@")[0] : "Captain"),
          provider: (u.providerData && u.providerData[0] && u.providerData[0].providerId) || "firebase",
          uid: u.uid,
          signedInAt: new Date().toISOString(),
        });
      } else {
        clearUser();
      }
    });
  }

  // Bounce signed-in users off the login page.
  if (document.body.classList.contains("login-page") && getUser()) {
    window.location.href = "app.html";
    return;
  }

  // ----- Login form -----
  const form = document.getElementById("loginForm");
  if (form) {
    form.addEventListener("submit", async function (e) {
      e.preventDefault();
      const email = document.getElementById("email").value.trim();
      const password = document.getElementById("password").value;

      if (fbAuth) {
        let cred;
        try {
          // Try to sign in first; if the account doesn't exist, create it.
          cred = await fbAuth.signInWithEmailAndPassword(email, password);
        } catch (err) {
          if (err.code === "auth/user-not-found" || err.code === "auth/invalid-login-credentials") {
            try {
              cred = await fbAuth.createUserWithEmailAndPassword(email, password);
            } catch (createErr) {
              alert("Sign-up failed: " + createErr.message);
              return;
            }
          } else {
            alert("Sign-in failed: " + err.message);
            return;
          }
        }
        // Persist synchronously so app.html's guard sees the user immediately.
        const u = cred.user;
        saveUser({
          email: u.email,
          name: u.displayName || (u.email ? u.email.split("@")[0] : "Captain"),
          provider: "email",
          uid: u.uid,
          signedInAt: new Date().toISOString(),
        });
        window.location.href = "app.html";
        return;
      }

      // Local fallback.
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

  // ----- Google button -----
  const googleBtn = document.getElementById("googleBtn");
  if (googleBtn) {
    googleBtn.addEventListener("click", async function () {
      if (fbAuth) {
        try {
          const provider = new firebase.auth.GoogleAuthProvider();
          const cred = await fbAuth.signInWithPopup(provider);
          const u = cred.user;
          saveUser({
            email: u.email,
            name: u.displayName || (u.email ? u.email.split("@")[0] : "Traveler"),
            provider: "google",
            uid: u.uid,
            signedInAt: new Date().toISOString(),
          });
          window.location.href = "app.html";
        } catch (err) {
          alert("Google sign-in failed: " + err.message);
        }
        return;
      }

      // Local fallback (simulated).
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

  // Public API used by app.js.
  window.WanderlustAuth = {
    getUser: getUser,
    signOut: async function () {
      if (fbAuth) {
        try { await fbAuth.signOut(); } catch (e) {}
      }
      clearUser();
      window.location.href = "index.html";
    },
    usingFirebase: function () { return !!fbAuth; },
  };
})();
