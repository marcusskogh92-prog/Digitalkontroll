#!/usr/bin/env node
/*
  scripts/import-companies-users.js

  Importerar flera företag + användare (admin/user) från en CSV (export från Excel).

  Varför:
    - Återanvändbar onboarding utan att klicka i Firestore manuellt
    - Sätter Auth claims + skriver users/{uid} + foretag/{companyId}/members/{uid}
    - Skapar grundstruktur för företaget (foretag-doc + minst en mall) om den saknas

  Usage:
    node scripts/import-companies-users.js --serviceAccount=./konton/demo-service.json --file=./data/import.csv

  Valfritt:
    --delimiter=;           (Excel i Sverige använder ofta semikolon)
    --dryRun=true           (skriver inget, loggar bara)

  CSV format (rekommenderat med header):
    companyId;companyName;email;firstName;lastName;role;admin;password;logoUrl;enabledControlTypes

  Exempelrad:
    ms-bygg;MS Byggsystem;anna@msbygg.se;Anna;Andersson;admin;true;BytMig123!;https://...;Arbetsberedning,Egenkontroll

  Notes:
    - logoUrl är valfritt; bäst är att du själv lägger in den vid behov.
    - enabledControlTypes skrivs till foretag/{companyId}/profil/public.enabledControlTypes (valfritt)
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

function toBool(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  const v = String(value).trim().toLowerCase();
  if (['true', '1', 'yes', 'y', 'ja'].includes(v)) return true;
  if (['false', '0', 'no', 'n', 'nej'].includes(v)) return false;
  return fallback;
}

function randomPassword() {
  const base = Math.random().toString(36).slice(-10);
  return `${base}A!`;
}

function splitEnabledTypes(raw) {
  const s = (raw ?? '').trim();
  if (!s) return null;
  return s.split(',').map(x => x.trim()).filter(Boolean);
}

function guessDelimiter(firstLine) {
  const semi = (firstLine.match(/;/g) || []).length;
  const comma = (firstLine.match(/,/g) || []).length;
  return semi > comma ? ';' : ',';
}

function parseCsv(text, delimiter) {
  // Minimal CSV parser (supports quotes)
  const rows = [];
  let row = [];
  let cur = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];

    if (inQuotes) {
      if (ch === '"') {
        const next = text[i + 1];
        if (next === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
      continue;
    }

    if (ch === delimiter) {
      row.push(cur);
      cur = '';
      continue;
    }

    if (ch === '\n') {
      row.push(cur);
      cur = '';
      // skip empty/comment-only lines
      const joined = row.join('').trim();
      if (joined && !joined.startsWith('#')) rows.push(row);
      row = [];
      continue;
    }

    if (ch === '\r') continue;

    cur += ch;
  }

  if (cur.length || row.length) {
    row.push(cur);
    const joined = row.join('').trim();
    if (joined && !joined.startsWith('#')) rows.push(row);
  }

  return rows;
}

function normalizeHeaderKey(k) {
  return String(k || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[_-]/g, '');
}

function getCell(row, idx) {
  const v = row[idx];
  return v === undefined || v === null ? '' : String(v).trim();
}

async function ensureCompanyBase(db, companyId, companyName, dryRun) {
  const companyRef = db.collection('foretag').doc(companyId);
  if (!dryRun) {
    await companyRef.set(
      {
        name: companyName || companyId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  // Ensure at least one template exists
  const templatesRef = companyRef.collection('mallar');
  if (!dryRun) {
    const snap = await templatesRef.limit(1).get();
    if (snap.empty) {
      await templatesRef.add({
        title: 'Tom mall',
        description: 'Bas-mall att kopiera vid onboarding',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        items: [],
      });
    }
  }

  return companyRef;
}

async function upsertCompanyProfile(db, companyId, patch, dryRun) {
  if (!patch || Object.keys(patch).length === 0) return;
  const ref = db.doc(`foretag/${companyId}/profil/public`);
  if (dryRun) return;
  await ref.set(
    {
      ...patch,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true }
  );
}

async function upsertUserAndMembership({ auth, db, companyId, companyName, rowData, dryRun, createdPasswords }) {
  const email = (rowData.email || '').trim();
  if (!email) return;

  const firstName = (rowData.firstName || '').trim();
  const lastName = (rowData.lastName || '').trim();
  const displayName = (rowData.displayName || '').trim() || [firstName, lastName].filter(Boolean).join(' ').trim();

  const roleRaw = (rowData.role || 'user').trim().toLowerCase();
  const isAdmin = toBool(rowData.admin, roleRaw === 'admin');
  const effectiveRole = isAdmin ? 'admin' : (roleRaw || 'user');

  const password = (rowData.password || '').trim() || randomPassword();

  let userRecord;
  let created = false;

  if (!dryRun) {
    try {
      userRecord = await auth.getUserByEmail(email);
    } catch (e) {
      userRecord = await auth.createUser({
        email,
        password,
        emailVerified: true,
        displayName: displayName || email.split('@')[0],
      });
      created = true;
      createdPasswords.push({ email, password, companyId });
    }

    if (displayName && displayName !== userRecord.displayName) {
      try {
        await auth.updateUser(userRecord.uid, { displayName });
        userRecord = await auth.getUser(userRecord.uid);
      } catch (e) {
        // ignore
      }
    }

    const claims = { companyId, admin: isAdmin, role: effectiveRole };
    await auth.setCustomUserClaims(userRecord.uid, claims);

    await db.collection('users').doc(userRecord.uid).set(
      {
        companyId,
        role: effectiveRole,
        email,
        displayName: userRecord.displayName || displayName || email.split('@')[0],
        firstName: firstName || null,
        lastName: lastName || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    await db.collection('foretag').doc(companyId).collection('members').doc(userRecord.uid).set(
      {
        uid: userRecord.uid,
        companyId,
        role: effectiveRole,
        email,
        displayName: userRecord.displayName || displayName || email.split('@')[0],
        firstName: firstName || null,
        lastName: lastName || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  }

  const action = dryRun ? '[dryRun]' : created ? '[created]' : '[updated]';
  console.log(
    '%s user=%s role=%s company=%s (%s)',
    action,
    email,
    effectiveRole,
    companyId,
    companyName || companyId
  );
}

async function main() {
  const args = parseArgs();

  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount) {
    console.error('Provide service account via --serviceAccount or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }

  const file = args.file || args.path;
  if (!file) {
    console.error('Usage: node scripts/import-companies-users.js --serviceAccount=./konton/XXX.json --file=./data/import.csv [--delimiter=;] [--dryRun=true]');
    process.exit(1);
  }

  const dryRun = toBool(args.dryRun, false);

  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    process.exit(1);
  }

  const filePath = path.resolve(file);
  if (!fs.existsSync(filePath)) {
    console.error('CSV file not found:', filePath);
    process.exit(1);
  }

  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });

  const db = admin.firestore();
  const auth = admin.auth();

  const raw = fs.readFileSync(filePath, 'utf8');
  const firstLine = raw.split(/\r?\n/).find(l => String(l).trim().length > 0) || '';
  const delimiter = (args.delimiter || '').trim() || guessDelimiter(firstLine);

  const rows = parseCsv(raw, delimiter);
  if (rows.length === 0) {
    console.error('No rows found in file');
    process.exit(1);
  }

  // Header
  const header = rows[0].map(normalizeHeaderKey);
  const hasHeader = header.includes('companyid') && header.includes('email');

  const startIdx = hasHeader ? 1 : 0;
  const createdPasswords = [];

  const colIndex = (key) => {
    const k = normalizeHeaderKey(key);
    return header.indexOf(k);
  };

  const idx = hasHeader
    ? {
        companyId: colIndex('companyId'),
        companyName: colIndex('companyName'),
        email: colIndex('email'),
        firstName: colIndex('firstName'),
        lastName: colIndex('lastName'),
        displayName: colIndex('displayName'),
        role: colIndex('role'),
        admin: colIndex('admin'),
        password: colIndex('password'),
        logoUrl: colIndex('logoUrl'),
        enabledControlTypes: colIndex('enabledControlTypes'),
      }
    : {
        // Fallback (utan header):
        // 0 companyId, 1 companyName, 2 email, 3 firstName, 4 lastName, 5 role, 6 admin, 7 password
        companyId: 0,
        companyName: 1,
        email: 2,
        firstName: 3,
        lastName: 4,
        role: 5,
        admin: 6,
        password: 7,
        displayName: -1,
        logoUrl: -1,
        enabledControlTypes: -1,
      };

  const seenCompanies = new Set();

  for (let r = startIdx; r < rows.length; r++) {
    const row = rows[r];

    const companyId = getCell(row, idx.companyId);
    if (!companyId) continue;

    const companyName = idx.companyName >= 0 ? getCell(row, idx.companyName) : '';

    if (!seenCompanies.has(companyId)) {
      seenCompanies.add(companyId);
      console.log('%s company=%s name=%s', dryRun ? '[dryRun]' : '[upsert]', companyId, companyName || companyId);

      await ensureCompanyBase(db, companyId, companyName || companyId, dryRun);

      const profilePatch = {};
      // name i profil/public används för PDF-branding
      profilePatch.name = companyName || companyId;

      const logoUrl = idx.logoUrl >= 0 ? getCell(row, idx.logoUrl) : '';
      if (logoUrl) profilePatch.logoUrl = logoUrl;

      const enabledRaw = idx.enabledControlTypes >= 0 ? getCell(row, idx.enabledControlTypes) : '';
      const enabled = splitEnabledTypes(enabledRaw);
      if (enabled) profilePatch.enabledControlTypes = enabled;

      await upsertCompanyProfile(db, companyId, profilePatch, dryRun);
    }

    const rowData = {
      email: getCell(row, idx.email),
      firstName: idx.firstName >= 0 ? getCell(row, idx.firstName) : '',
      lastName: idx.lastName >= 0 ? getCell(row, idx.lastName) : '',
      displayName: idx.displayName >= 0 ? getCell(row, idx.displayName) : '',
      role: idx.role >= 0 ? getCell(row, idx.role) : 'user',
      admin: idx.admin >= 0 ? getCell(row, idx.admin) : '',
      password: idx.password >= 0 ? getCell(row, idx.password) : '',
    };

    await upsertUserAndMembership({ auth, db, companyId, companyName, rowData, dryRun, createdPasswords });
  }

  if (createdPasswords.length) {
    console.log('\nCreated users/passwords (save these somewhere safe):');
    createdPasswords.forEach(x => console.log(`- ${x.email} (company=${x.companyId}) password=${x.password}`));
  }

  console.log('\nDone.');
  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
