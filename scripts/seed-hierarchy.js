#!/usr/bin/env node
/*
  scripts/seed-hierarchy.js

  Skapar en start-hierarki för ett företag:
  - Två huvudmappar: Byggservice, Entreprenad
  - En undermapp per admin under båda huvudmapparna
  - Några testprojekt i varje admin-undermapp

  Usage:
    node scripts/seed-hierarchy.js --serviceAccount=./konton/demo-service.json --company="MS Byggsystem"

  Notes:
    - Läser admins från foretag/{companyId}/members där role == 'admin'
    - Skriver foretag/{companyId}/hierarki/state.items
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

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'admin';
}

function titleFromMember(member) {
  const dn = member.displayName || '';
  const email = member.email || '';
  const base = dn || (email ? email.split('@')[0] : '') || 'Admin';
  return base.charAt(0).toUpperCase() + base.slice(1);
}

function mkProjects(prefix, adminLabel, adminUid, adminEmail) {
  const now = new Date();
  const iso = d => d.toISOString();
  return [
    {
      id: prefix + '-001',
      name: 'Testprojekt 1 (' + adminLabel + ')',
      type: 'project',
      status: 'ongoing',
      createdAt: iso(now),
      ansvarig: adminLabel,
      ansvarigId: adminUid || null,
      createdBy: adminEmail || null,
    },
    {
      id: prefix + '-002',
      name: 'Testprojekt 2 (' + adminLabel + ')',
      type: 'project',
      status: 'ongoing',
      createdAt: iso(new Date(now.getTime() - 86400000 * 3)),
      ansvarig: adminLabel,
      ansvarigId: adminUid || null,
      createdBy: adminEmail || null,
    },
    {
      id: prefix + '-003',
      name: 'Avslutat test (' + adminLabel + ')',
      type: 'project',
      status: 'completed',
      createdAt: iso(new Date(now.getTime() - 86400000 * 14)),
      ansvarig: adminLabel,
      ansvarigId: adminUid || null,
      createdBy: adminEmail || null,
    },
  ];
}

async function main() {
  const args = parseArgs();
  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!serviceAccount) {
    console.error('Provide service account via --serviceAccount or GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }

  const company = args.company;
  if (!company) {
    console.error('--company is required');
    process.exit(1);
  }

  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    process.exit(1);
  }

  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const membersRef = db.collection('foretag').doc(company).collection('members');
  const snap = await membersRef.where('role', '==', 'admin').get();
  const admins = [];
  snap.forEach(d => admins.push({ id: d.id, ...d.data() }));

  if (admins.length === 0) {
    console.error('No admins found in foretag/' + company + '/members (role==admin).');
    process.exit(1);
  }

  function buildMain(mainId, mainName, prefixBase) {
    return {
      id: mainId,
      name: mainName,
      expanded: false,
      children: admins.map((a, idx) => {
        const adminLabel = titleFromMember(a);
        const subId = mainId + '-sub-' + slug(a.email || a.uid || a.id) + '-' + String(idx);
        const prefix = prefixBase + '-' + String(idx + 1).padStart(2, '0');
        return {
          id: subId,
          name: adminLabel,
          expanded: false,
          children: mkProjects(prefix, adminLabel, a.uid || a.id, a.email || null),
        };
      }),
    };
  }

  const items = [
    buildMain('main-byggservice', 'Byggservice', 'BS'),
    buildMain('main-entreprenad', 'Entreprenad', 'ENT'),
  ];

  await db.doc('foretag/' + company + '/hierarki/state').set(
    {
      items,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      seededAt: admin.firestore.FieldValue.serverTimestamp(),
      seededBy: 'seed-hierarchy.js',
    },
    { merge: true }
  );

  console.log('Seeded hierarchy for company:', company);
  console.log('Admins:', admins.map(a => a.email || a.uid || a.id).join(', '));
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
