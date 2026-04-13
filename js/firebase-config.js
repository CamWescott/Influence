// Firebase configuration. Replace these placeholder values with the real
// config from your Firebase project (Project Settings -> General -> Your apps).
//
// While the apiKey still starts with "YOUR_", the app falls back to the
// simulated local-only auth. Once you paste a real apiKey, the app will
// automatically use Firebase Authentication (email/password + Google).
//
// To enable Google sign-in:
//   1. In the Firebase Console go to Build -> Authentication -> Sign-in method.
//   2. Enable "Email/Password" and "Google".
//   3. Add your hosting domain(s) to the Authorized domains list.

window.WANDERLUST_FIREBASE_CONFIG = {
  apiKey:            "YOUR_API_KEY",
  authDomain:        "YOUR_PROJECT.firebaseapp.com",
  projectId:         "YOUR_PROJECT",
  storageBucket:     "YOUR_PROJECT.appspot.com",
  messagingSenderId: "YOUR_SENDER_ID",
  appId:             "YOUR_APP_ID"
};
