Quick notes for deploying Cloud Functions (DigitalKontroll)

1) Install dependencies

```bash
cd functions
npm install
```

2) Deploy functions

```bash
# Requires firebase-tools and that you're logged in and have selected the correct project
npx firebase deploy --only functions:createUser,functions:deleteUser
```

3) Test locally (optional)

Use the Firebase emulator suite for local testing.

```bash
cd functions
npm install
npx firebase emulators:start --only functions,firestore,auth
```

4) Security notes

- The functions check that the caller has an admin-like custom claim (`admin===true` or `role==='admin'` or `globalAdmin===true`).
- Do not expose these functions to unauthenticated callers.
- For production, consider restricting superadmin list in Firestore and validating caller email against `system/admins` as an additional safeguard.
