#!/usr/bin/env node
/*
  scripts/create-demo-user.js
  Usage:
    node scripts/create-demo-user.js --serviceAccount=./konton/demo-service.json --email=demo@demo.local --password=Demo12345! --company=demo-company
  Or set GOOGLE_APPLICATION_CREDENTIALS env var and omit --serviceAccount
*/
const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

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
  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount) {
    console.error('Service account JSON path required via --serviceAccount or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }

  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    process.exit(1);
  }

  const sa = require(saPath);

  admin.initializeApp({
    credential: admin.credential.cert(sa)
  });

  const email = args.email || 'demo@demo.local';
  const password = args.password || 'Demo12345!';
  const company = args.company || 'demo-company';

  const auth = admin.auth();
  const db = admin.firestore();

  // Create or get user
  let userRecord;
  try {
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('User already exists:', userRecord.uid);
    } catch (e) {
      userRecord = await auth.createUser({ email, password, emailVerified: true, displayName: 'Demo Admin' });
      console.log('Created user:', userRecord.uid);
    }

    // Set custom claims
    const claims = { admin: true, role: 'admin', companyId: company };
    await auth.setCustomUserClaims(userRecord.uid, claims);
    console.log('Set custom claims:', claims);

    // Create users/{uid} doc
    const userDocRef = db.collection('users').doc(userRecord.uid);
    await userDocRef.set({
      companyId: company,
      role: 'admin',
      displayName: userRecord.displayName || 'Demo Admin',
      email: userRecord.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    console.log('Wrote users/{uid} document');

    // Seed basic company structure and a template (if not exists)
    const companyRef = db.collection('foretag').doc(company);
    const companySnap = await companyRef.get();
    if (!companySnap.exists) {
      await companyRef.set({ name: 'Demo Company', createdAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log('Created foretag/{company}');
    }

    // Seed company members directory
    await companyRef.collection('members').doc(userRecord.uid).set({
      uid: userRecord.uid,
      companyId: company,
      role: 'admin',
      displayName: userRecord.displayName || 'Demo Admin',
      email: userRecord.email,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    // Seed a simple mall-template collection
    const templatesRef = companyRef.collection('mallar');
    const templatesSnap = await templatesRef.limit(1).get();
    if (templatesSnap.empty) {
      await templatesRef.add({ title: 'Tom mall', description: 'Bas-mall att kopiera vid onboarding', createdAt: admin.firestore.FieldValue.serverTimestamp(), items: [] });
      console.log('Added a mall-template');
    }

    // Seed demo hierarchy
    const hierRef = companyRef.collection('hierarki').doc('state');
    const hierSnap = await hierRef.get();
    if (!hierSnap.exists) {
      const demoHierarchy = [
        { id: 'main1', name: 'Demo Projekt', expanded: false, children: [ { id: 'P-0001', name: 'Demo Projekt 1', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() } ] }
      ];
      await hierRef.set({ items: demoHierarchy, createdAt: admin.firestore.FieldValue.serverTimestamp() });
      console.log('Seeded demo hierarchy for company');
    }

    console.log('Done. Demo user ready.');
    process.exit(0);
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

main();
