#!/usr/bin/env node
/*
  scripts/provision-company.js
  Usage:
    node scripts/provision-company.js --serviceAccount=./konton/demo-service.json --company=my-company --adminEmail=owner@company.com --adminPassword=Secret123!
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
    console.error('Provide service account via --serviceAccount or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }
  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) { console.error('Service account file not found:', saPath); process.exit(1); }
  const sa = require(saPath);

  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();
  const auth = admin.auth();
  const formatPersonName = require('./lib/formatPersonName');
  const { ensureCompanyByggdelar } = require('./lib/seedByggdelar');

  const company = args.company;
  if (!company) { console.error('--company is required'); process.exit(1); }

  const adminEmail = args.adminEmail;
  const adminPassword = args.adminPassword || Math.random().toString(36).slice(-8);

  try {
    // create company doc
    const companyRef = db.collection('foretag').doc(company);
    await companyRef.set({ name: company, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    console.log('Created or updated company doc:', company);

    // seed grundregister byggdelar (idempotent)
    const byggdelResult = await ensureCompanyByggdelar(db, company);
    console.log('Byggdelar:', byggdelResult.created, 'created,', byggdelResult.skipped, 'skipped');

    // create default templates
    const templatesRef = companyRef.collection('mallar');
    await templatesRef.add({ title: 'Tom mall', description: 'Bas-mall att kopiera vid onboarding', createdAt: admin.firestore.FieldValue.serverTimestamp(), items: [] });
    console.log('Added default template');

    // create admin user if email provided
    if (adminEmail) {
      let userRecord;
      try { userRecord = await auth.getUserByEmail(adminEmail); console.log('Admin user exists:', userRecord.uid); } catch(_e) {
        userRecord = await auth.createUser({ email: adminEmail, password: adminPassword, displayName: formatPersonName(adminEmail.split('@')[0]) });
        console.log('Created admin user:', userRecord.uid);
      }
      await auth.setCustomUserClaims(userRecord.uid, { admin: true, role: 'admin', companyId: company });
      await db.collection('users').doc(userRecord.uid).set({ companyId: company, role: 'admin', email: adminEmail, createdAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
      // Also write to company-scoped members directory for in-app dropdowns (ansvarig)
      await companyRef.collection('members').doc(userRecord.uid).set({
        uid: userRecord.uid,
        companyId: company,
        role: 'admin',
        email: adminEmail,
        displayName: userRecord.displayName || formatPersonName(adminEmail.split('@')[0]),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log('Provisioned admin user and claims. Password (if created):', adminPassword);
    }

    console.log('Provisioning complete.');
    process.exit(0);
  } catch (err) {
    console.error('Error provisioning:', err);
    process.exit(1);
  }
}

main();
