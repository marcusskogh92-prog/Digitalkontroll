#!/usr/bin/env node
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
  const email = args.email;
  const company = args.company;
  const roleRaw = (args.role || 'admin').trim().toLowerCase();
  const role = (roleRaw === 'admin') ? 'admin' : 'user';
  if (!email || !company) {
    console.error('Usage: node scripts/set-company-claim.js --serviceAccount=./konton/demo-service.json --email=demo@... --company=demo-service [--role=admin|user]');
    process.exit(1);
  }
  const saPath = path.resolve(serviceAccount);
  if (!fs.existsSync(saPath)) { console.error('Service account not found:', saPath); process.exit(1); }
  const sa = require(saPath);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  const auth = admin.auth();
  try {
    const user = await auth.getUserByEmail(email).catch((e) => null);
    if (!user) {
      console.error('User not found:', email);
      process.exit(1);
    }
    const claims = { companyId: company, role, admin: (role === 'admin') };
    await auth.setCustomUserClaims(user.uid, claims);
    console.log('Set custom claims for uid=%s:', user.uid, claims);
    process.exit(0);
  } catch (_e) {
    console.error('Error:', e);
    process.exit(1);
  }
}

main();

