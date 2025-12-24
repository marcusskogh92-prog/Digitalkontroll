#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

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
  const company = args.company;
  if (!company) {
    console.error('--company is required');
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
  try {
    const ref = db.collection('foretag').doc(company).collection('hierarki').doc('state');
    const snap = await ref.get();
    if (!snap.exists) {
      console.log('No hierarchy document for company:', company);
      process.exit(0);
    }
    const data = snap.data();
    console.log('Hierarchy for', company, JSON.stringify(data.items, null, 2));
    process.exit(0);
  } catch (e) {
    console.error('Error reading hierarchy:', e);
    process.exit(1);
  }
}

main();
