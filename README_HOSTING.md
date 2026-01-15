Firebase Hosting setup for this project

Steps to build and deploy the web app to Firebase Hosting (recommended):

Quick path (recommended)

1) Build + verify + deploy
  npm run deploy:web

1) Build the web bundle
- If using Expo (managed):
  npm run build
  Output folder: web-build

 - If you prefer running Expo directly:
  npx expo export --platform web --output-dir web-build

2) Install Firebase CLI (if not installed):
  npm install -g firebase-tools

3) Login to Firebase and initialize hosting (one-time):
  firebase login
  firebase init hosting
  - select project: digitalkontroll-8fd05
  - set public directory to: web-build
  - Configure as single-page app: Yes
  - Skip GitHub workflow when prompted (press Enter) unless you want CI

4) Deploy
  npm run deploy:web
  (or: npx firebase-tools deploy --only hosting)

5) Add custom domain
- Open Firebase Console -> Hosting -> Add custom domain -> enter www.digitalkontroll.com
- Follow DNS instructions shown by Firebase (add TXT to verify, then A/CNAME records at one.com)
- Wait for verification and SSL provisioning.

Local testing
- To test locally before DNS changes, use the Firebase preview URL returned by `firebase deploy`.

Notes
- This repo's `firebase.json` is configured with `public: "web-build"` and a SPA rewrite to `/index.html`.
- Web deploy is configured to avoid caching `/index.html`, while allowing long-term caching for hashed static assets.
- If your build outputs to `build` instead, update `firebase.json` accordingly.
