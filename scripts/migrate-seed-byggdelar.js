#!/usr/bin/env node
/**
 * Migrerar befintliga företag: seedar grundbyggdelar där de saknas.
 * Idempotent – kan köras flera gånger utan dubletter.
 *
 * Usage:
 *   node scripts/migrate-seed-byggdelar.js --serviceAccount=./konton/demo-service.json
 *   node scripts/migrate-seed-byggdelar.js --serviceAccount=./konton/demo-service.json --dryRun
 */
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');
const { ensureCompanyByggdelar } = require('./lib/seedByggdelar');

function parseArgs() {
  const args = {};
  process.argv.slice(2).forEach((a) => {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args[m[1]] = m[2];
    else if (a === '--dryRun') args.dryRun = true;
  });
  return args;
}

async function main() {
  const args = parseArgs();
  const defaultPath = path.join(__dirname, '..', 'konton', 'digitalkontroll-8fd05-firebase-adminsdk-fbsvc-4e15d45055.json');
  const serviceAccount = args.serviceAccount || process.env.GOOGLE_APPLICATION_CREDENTIALS || defaultPath;
  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) {
    console.error('Service account file not found:', saPath);
    console.error('Ange --serviceAccount=./konton/din-fil.json eller sätt GOOGLE_APPLICATION_CREDENTIALS');
    process.exit(1);
  }
  const sa = require(saPath);
  const dryRun = Boolean(args.dryRun);
  if (dryRun) console.log('Dry run – no writes.');

  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const db = admin.firestore();

  const companiesSnap = await db.collection('foretag').get();
  let totalCreated = 0;
  let totalSkipped = 0;
  const companyIds = [];
  companiesSnap.forEach((d) => companyIds.push(d.id));

  console.log('Companies to process:', companyIds.length);

  for (const companyId of companyIds) {
    const result = await ensureCompanyByggdelar(db, companyId, { dryRun });
    totalCreated += result.created;
    totalSkipped += result.skipped;
    if (result.created > 0) {
      console.log('  ', companyId, '– created', result.created, ', skipped', result.skipped);
    }
  }

  console.log('Done. Total created:', totalCreated, ', total skipped:', totalSkipped);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
