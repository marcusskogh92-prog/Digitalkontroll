#!/usr/bin/env node
/*
  scripts/migrate-normalize-displayname.js

  Normalizes `displayName` for Firebase Auth users and corresponding
  Firestore documents (`users/{uid}` and `foretag/{company}/members/{uid}`).

  Usage:
    node scripts/migrate-normalize-displayname.js --serviceAccount=./konton/demo-service.json [--dryRun=true]

  WARNING: This script updates Auth displayName and Firestore documents.
  Use --dryRun=true to preview changes first.
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

function toBool(v, fallback) {
  if (v === undefined) return fallback;
  const s = String(v).trim().toLowerCase();
  if (['true','1','yes','y'].includes(s)) return true;
  if (['false','0','no','n'].includes(s)) return false;
  return fallback;
}

const formatPersonName = require('./lib/formatPersonName');

async function main() {
  const args = parseArgs();
  const sa = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  const dryRun = toBool(args.dryRun, true);

  if (!sa) {
    console.error('Provide --serviceAccount or set GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }

  const saPath = path.resolve(sa);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    process.exit(1);
  }

  const saJson = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(saJson) });
  const auth = admin.auth();
  const db = admin.firestore();

  console.log('[migrate] dryRun=%s serviceAccount=%s', dryRun, saPath);

  let nextPageToken = undefined;
  let total = 0;
  let changed = 0;
  try {
    do {
      const res = await auth.listUsers(1000, nextPageToken);
      nextPageToken = res.pageToken;
      for (const user of res.users) {
        total++;
        const uid = user.uid;
        const email = (user.email || '').trim();
        const current = (user.displayName || '').trim();
        const source = current || email || uid;
        const normalized = formatPersonName(source);

        if (!normalized || normalized === current) continue;

        console.log('[migrate] WILL UPDATE uid=%s email=%s old=%s new=%s', uid, email, current || '<empty>', normalized);
        changed++;

        if (!dryRun) {
          try {
            await auth.updateUser(uid, { displayName: normalized });
          } catch(e) {
            console.warn('[migrate] auth.updateUser failed for uid=%s: %s', uid, e?.message || e);
          }

          try {
            await db.collection('users').doc(uid).set({ displayName: normalized, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
          } catch(e) {
            console.warn('[migrate] users doc update failed for uid=%s: %s', uid, e?.message || e);
          }

          // Try to find companyId from custom claims or users doc
          let companyId = (user.customClaims && user.customClaims.companyId) || null;
          if (!companyId) {
            try {
              const udoc = await db.collection('users').doc(uid).get();
              if (udoc.exists) companyId = udoc.data()?.companyId || null;
            } catch(e) {}
          }
          if (companyId) {
            try {
              await db.collection('foretag').doc(companyId).collection('members').doc(uid).set({ displayName: normalized, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
            } catch(e) {
              console.warn('[migrate] member doc update failed for uid=%s company=%s: %s', uid, companyId, e?.message || e);
            }
          }
        }
      }
    } while (nextPageToken);

    console.log('[migrate] scanned=%d will-change=%d', total, changed);
    if (dryRun) console.log('[migrate] dry run complete — no changes applied. Re-run with --dryRun=false to apply.');
    else console.log('[migrate] migration applied.');
  } catch(e) {
    console.error('[migrate] fatal error:', e);
    process.exit(1);
  }
}

main();
