#!/usr/bin/env node
/**
 * createLocalSuperadmin.js
 * Usage: node createLocalSuperadmin.js <email> [uid]
 *
 * Creates a user in the local Auth emulator (if missing) and sets the
 * `superadmin` custom claim on that user. Intended for local/emulator bootstrapping.
 */

const admin = require('firebase-admin');

const projectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT || process.env.FIREBASE_CONFIG && (() => {
  try { return JSON.parse(process.env.FIREBASE_CONFIG).projectId; } catch (_e) { return null; }
})() || 'digitalkontroll-8fd05';

admin.initializeApp({ projectId });

const email = process.argv[2] ? String(process.argv[2]).trim().toLowerCase() : null;
const uidArg = process.argv[3] ? String(process.argv[3]).trim() : null;

if (!email && !uidArg) {
  console.error('Usage: node createLocalSuperadmin.js <email> [uid]');
  process.exit(2);
}

(async () => {
  try {
    let user = null;
    if (uidArg) {
      try { user = await admin.auth().getUser(uidArg); } catch (_e) { user = null; }
    }

    if (!user && email) {
      try { user = await admin.auth().getUserByEmail(email); } catch (_e) { user = null; }
    }

    if (!user) {
      console.log('User not found, creating user...');
      const createPayload = { email: email || undefined, displayName: email ? email.split('@')[0] : undefined };
      if (uidArg) createPayload.uid = uidArg;
      // Note: using a predictable temp password only for local emulator
      createPayload.password = 'TempPass123!';
      user = await admin.auth().createUser(createPayload);
      console.log('Created user', user.uid);
    } else {
      console.log('Found existing user', user.uid);
    }

    const claims = Object.assign({}, (user.customClaims || {}), { superadmin: true });
    await admin.auth().setCustomUserClaims(user.uid, claims);
    console.log('Set superadmin claim on', user.uid);
    process.exit(0);
  } catch (err) {
    console.error('Error setting superadmin:', err);
    process.exit(1);
  }
})();
