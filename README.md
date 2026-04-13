# Wanderlust Deck

A Disney-cruise-themed travel content studio for aspiring travel bloggers and
influencers. Runs as a static site — just open `index.html` in a browser.

## Features

- **Sign in** with email/password or a simulated "Continue with Google"
  button (session stored locally).
- **Photo Studio** — upload a photo, get AI-suggested edits based on its
  brightness/color balance, apply one-click travel filters (Tropical, Sunset,
  Ocean, Vintage, B&W, Vivid, Dreamy), fine-tune brightness/contrast/
  saturation/warmth/blur, and download the result.
- **Video Studio** — upload a clip, write a voice-over script, pick a voice,
  and hit "Narrate over video." Uses the browser's built-in Web Speech API
  so AI narration works with zero setup. Optional "Suggest a script" button
  can use Claude if you've added an API key.
- **Blog Generator** — add a hero photo, destination, keywords, target
  audience, and tone, and generate a ~1500-word SEO-optimized post. Uses
  Claude (if configured) for best-quality output, with a built-in template
  fallback that always produces a full-length article.
- **Social Media Suggestions** — generate captions + hashtags for Instagram,
  TikTok, X, and Facebook with one click.

## Optional: Claude API

Click the **AI** button in the top bar to paste an Anthropic API key. When
set, the blog generator and script suggester call Claude directly from the
browser. The key is stored in `localStorage` only.

> Note: calling Anthropic directly from the browser requires the
> `anthropic-dangerous-direct-browser-access: true` header, which the app
> already includes. For a production deployment, move the API call behind
> your own backend so the key is never exposed to end users.

## Running locally

No build step required.

```
# from this directory
python3 -m http.server 8000
# then open http://localhost:8000
```

Or just double-click `index.html`.

## Deploying to Firebase Hosting

The repo is pre-configured for Firebase Hosting. `firebase.json` defines
caching + rewrites and `.firebaserc` holds the project alias.

### 1. One-time setup

```
npm install -g firebase-tools
firebase login
```

### 2. Point this repo at your Firebase project

Edit `.firebaserc` and replace `your-firebase-project-id` with the ID from
your Firebase console (Project Settings → General → Project ID). Or run:

```
firebase use --add
```

and pick the project interactively.

### 3. Deploy

```
firebase deploy --only hosting
```

Your site will be live at `https://<project-id>.web.app`. To preview locally
first:

```
firebase emulators:start --only hosting
```

### 4. (Optional) Real email + Google sign-in with Firebase Auth

Out of the box the login screen uses a simulated local-only auth, so Google
works via a prompt and email is password-less. To enable **real**
authentication:

1. In the Firebase Console, go to **Build → Authentication → Sign-in method**
   and enable **Email/Password** and **Google**.
2. Add your deploy domain (e.g. `your-project.web.app`) to
   **Authentication → Settings → Authorized domains**.
3. Copy your web app's config (Project Settings → General → Your apps → SDK
   setup and configuration) into `js/firebase-config.js`, replacing the
   `YOUR_*` placeholder values.
4. Re-deploy. The app detects a real config on load and switches the login
   form and Google button to Firebase Auth automatically.

That's it — no code changes required.
