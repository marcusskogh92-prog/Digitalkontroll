#!/usr/bin/env node
/*
  scripts/set-enabled-control-types.js

  Sets per-company visibility for control types in:
    foretag/{companyId}/profil/public.enabledControlTypes

  Usage:
    node scripts/set-enabled-control-types.js --serviceAccount=./konton/demo-service.json --company=demo-company --types=Arbetsberedning,Egenkontroll,Fuktmätning

  Notes:
    - If you pass an empty --types=, the list will be set to [].
    - If enabledControlTypes is missing in Firestore, the app shows ALL control types.
*/

const admin = require('firebase-admin');
const path = require('path');
const fs = require('fs');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS || './konton/demo-service.json';
  const company = (args.company || '').trim();
  const typesRaw = (args.types ?? '').trim();

  if (!company) {
    console.error('Usage: node scripts/set-enabled-control-types.js --serviceAccount=... --company=demo-company --types=Arbetsberedning,Egenkontroll,...');
    process.exit(1);
  }

  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account not found:', saPath);
    process.exit(1);
  }

  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });

  const db = admin.firestore();

  const enabledControlTypes = typesRaw
    ? typesRaw.split(',').map(s => s.trim()).filter(Boolean)
    : [];

  try {
    const ref = db.doc(`foretag/${company}/profil/public`);
    await ref.set(
      {
        enabledControlTypes,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    console.log('Updated enabledControlTypes for company=%s:', company, enabledControlTypes);
    process.exit(0);
  } catch (e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
