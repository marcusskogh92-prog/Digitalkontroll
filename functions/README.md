Quick notes for deploying Cloud Functions (DigitalKontroll)

1) Install dependencies

```bash
# Functions: provisionCompany

This folder contains Cloud Functions for Digitalkontroll.

This repo now includes a callable `provisionCompany` function that provisions a new company when invoked by an authenticated client.

Quick steps

1) Install dependencies

```bash
cd functions
npm install
```

If you want, I can help run the emulator locally (if you want me to run commands) or guide you through `firebase deploy` interactively.
Additional developer steps to resolve emulator warnings

1) Update Firebase CLI and login

```bash
npm i -g firebase-tools
firebase login
```

2) Initialize local emulators (only needs to be done once)

```bash
cd .. # project root
firebase init emulators
```

Enable `auth` and `firestore` in the init wizard so the auth emulator can start.

3) Optionally set a superadmin user (server/admin) for testing

You can run the helper script in this folder (requires credentials):

```bash
# Set environment variable to your service account JSON if needed
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
cd functions
node setSuperadmin.js marcus.skogh@msbyggsystem
```

4) Start emulators and test

```bash
cd functions
npx firebase emulators:start --only functions,firestore,auth --project digitalkontroll-8fd05
```

Then, in another terminal run the test script:

```bash
cd functions
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
node testCall.js
```

2) Run emulator for testing

```bash
cd functions
npx firebase emulators:start --only functions,firestore,auth
```

3) Deploy to Firebase

```bash
# Ensure firebase-tools is installed and you are logged in/select the correct project
npm i -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
firebase deploy --only functions:provisionCompany
```

Testing notes

- The callable expects `{ companyId, companyName }` and requires the caller to be authenticated.
- For local testing, use the emulator and call the function from the app while the emulator is running.

Security notes

- The function runs with Admin SDK privileges. Ensure your Firebase project credentials and IAM are secured.
- The client also performs an optimistic `saveCompanyProfile` write; the repo `firestore.rules` has been updated to allow authenticated users to create a new company `profil` document. Subsequent updates are restricted to company members.
- If you require stricter control over who can create companies, add server-side allowlist checks in `provisionCompany` (e.g., validate caller email against a list in Firestore).

If you want, I can help run the emulator locally or walk through `firebase deploy` on your machine.
