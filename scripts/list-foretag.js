#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.resolve('./konton/demo-service.json');
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account not found at', serviceAccountPath);
  process.exit(1);
}
const saRaw = fs.readFileSync(serviceAccountPath, 'utf8');
const sa = JSON.parse(saRaw);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  const snap = await db.collection('foretag').get();
  if (snap.empty) {
    console.log('No foretag documents found.');
    return;
  }
  for (const doc of snap.docs) {
    const id = doc.id;
    const stateRef = db.collection('foretag').doc(id).collection('hierarki').doc('state');
    const stateSnap = await stateRef.get();
    const items = stateSnap.exists ? stateSnap.data().items : undefined;
    console.log('company:', id, 'state_exists=', stateSnap.exists, 'items_len=', Array.isArray(items) ? items.length : items);
  }
}

main().then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1);});
