#!/usr/bin/env node
/*
  scripts/add-user.js

  Skapar eller hämtar en Firebase Auth-användare, sätter custom claims och skriver users/{uid}.

  Usage:
    node scripts/add-user.js --serviceAccount=./konton/demo-service.json --email=user@company.com --company=my-company --role=user --admin=false --password=Secret123!

  Notes:
    - Om --password utelämnas skapas ett slumpat lösenord och skrivs ut.
    - Sätter claims: { companyId, admin }
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
const formatPersonName = require('./lib/formatPersonName');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach(a => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
  });
  return args;
}

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(v)) return true;
  if (['false', '0', 'no', 'n'].includes(v)) return false;
  return fallback;
}

function randomPassword() {
  // enkel, men tillräcklig för onboarding (kan bytas av användaren)
  const base = Math.random().toString(36).slice(-10);
  return `${base}A!`;
}

async function main() {
  const args = parseArgs();

  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount) {
    console.error('Provide service account via --serviceAccount or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }

  const email = args.email;
  const company = args.company;
  if (!email || !company) {
    console.error('Usage: node scripts/add-user.js --serviceAccount=./konton/XXX.json --email=user@company.com --company=my-company --role=user --admin=false [--password=Secret123!]');
    process.exit(1);
  }

  const role = (args.role || 'user').trim();
  const isAdmin = toBool(args.admin, role === 'admin');
  const password = (args.password && String(args.password).trim()) || randomPassword();
  const firstName = (args.firstName || args.firstname || '').trim();
  const lastName = (args.lastName || args.lastname || '').trim();
  const displayNameArg = (args.displayName || args.displayname || '').trim();
  const desiredDisplayName = formatPersonName(displayNameArg || [firstName, lastName].filter(Boolean).join(' ').trim());

  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    process.exit(1);
  }

  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });

  const auth = admin.auth();
  const db = admin.firestore();

  try {
    // Create or get user
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(email);
      console.log('User already exists:', userRecord.uid);
    } catch(e) {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true,
        displayName: desiredDisplayName || formatPersonName(email.split('@')[0])
      });
      console.log('Created user:', userRecord.uid);
      console.log('Password (new user):', password);
    }

    // Best-effort: update displayName if we have a better one
    if (desiredDisplayName && desiredDisplayName !== userRecord.displayName) {
      try {
        await auth.updateUser(userRecord.uid, { displayName: desiredDisplayName });
        userRecord = await auth.getUser(userRecord.uid);
        console.log('Updated displayName:', userRecord.displayName);
      } catch(e) {
        console.warn('Could not update displayName:', e?.message || e);
      }
    }

    const effectiveRole = isAdmin ? 'admin' : role;
    const claims = { companyId: company, admin: isAdmin, role: effectiveRole };
    await auth.setCustomUserClaims(userRecord.uid, claims);
    console.log('Set custom claims:', claims);

    await db.collection('users').doc(userRecord.uid).set({
      companyId: company,
      role: effectiveRole,
      email,
      displayName: userRecord.displayName || formatPersonName(email.split('@')[0]),
      firstName: firstName || null,
      lastName: lastName || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    // Also write to company-scoped members directory for in-app dropdowns (ansvarig)
    await db.collection('foretag').doc(company).collection('members').doc(userRecord.uid).set({
      uid: userRecord.uid,
      companyId: company,
      role: effectiveRole,
      email,
      displayName: userRecord.displayName || formatPersonName(email.split('@')[0]),
      firstName: firstName || null,
      lastName: lastName || null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    console.log('Wrote users/{uid} document');
    console.log('Done.');
    process.exit(0);
  } catch(e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();
