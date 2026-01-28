#!/usr/bin/env node
/**
 * Script to clean up test data - removes all companies and users except "MS Byggsystem"
 * 
 * Usage:
 *   node scripts/cleanup-testdata.js --dry-run    # Preview what will be deleted
 *   node scripts/cleanup-testdata.js --confirm     # Actually delete
 */

const admin = require('firebase-admin');
const readline = require('readline');

// Initialize Firebase Admin
const serviceAccount = require('../konton/digitalkontroll-8fd05-firebase-adminsdk-fbsvc-4e15d45055.json');
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: 'digitalkontroll-8fd05'
});

const db = admin.firestore();
const auth = admin.auth();
const storage = admin.storage();

const KEEP_COMPANY = 'MS Byggsystem';

function parseArgs() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirm = args.includes('--confirm');
  return { dryRun, confirm };
}

async function listAllCompanies() {
  const snapshot = await db.collection('foretag').get();
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
}

async function listAllUsers() {
  const snapshot = await db.collection('users').get();
  return snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() }));
}

async function listAuthUsers() {
  const listUsersResult = await auth.listUsers();
  return listUsersResult.users;
}

async function deleteCompany(companyId) {
  console.log(`\n🗑️  Raderar företag: ${companyId}`);
  
  // 1. Delete all subcollections
  const companyRef = db.collection('foretag').doc(companyId);
  
  // Delete members
  const membersSnapshot = await companyRef.collection('members').get();
  const memberDeletes = membersSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(memberDeletes);
  console.log(`   ✓ Raderade ${membersSnapshot.size} medlemmar`);
  
  // Delete mallar (templates)
  const mallarSnapshot = await companyRef.collection('mallar').get();
  const mallarDeletes = mallarSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(mallarDeletes);
  console.log(`   ✓ Raderade ${mallarSnapshot.size} mallar`);
  
  // Delete hierarki
  const hierarkiSnapshot = await companyRef.collection('hierarki').get();
  const hierarkiDeletes = hierarkiSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(hierarkiDeletes);
  console.log(`   ✓ Raderade ${hierarkiSnapshot.size} hierarki-dokument`);
  
  // Delete controls
  const controlsSnapshot = await companyRef.collection('controls').get();
  const controlDeletes = controlsSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(controlDeletes);
  console.log(`   ✓ Raderade ${controlsSnapshot.size} kontroller`);
  
  // Delete draft_controls
  const draftsSnapshot = await companyRef.collection('draft_controls').get();
  const draftDeletes = draftsSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(draftDeletes);
  console.log(`   ✓ Raderade ${draftsSnapshot.size} utkast`);
  
  // Delete profil
  const profilSnapshot = await companyRef.collection('profil').get();
  const profilDeletes = profilSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(profilDeletes);
  console.log(`   ✓ Raderade ${profilSnapshot.size} profil-dokument`);
  
  // Delete activity
  const activitySnapshot = await companyRef.collection('activity').get();
  const activityDeletes = activitySnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(activityDeletes);
  console.log(`   ✓ Raderade ${activitySnapshot.size} aktivitetsloggar`);
  
  // 2. Delete company logo from storage
  try {
    const bucket = storage.bucket();
    const logoPath = `foretag/${companyId}/logo.png`;
    const file = bucket.file(logoPath);
    const [exists] = await file.exists();
    if (exists) {
      await file.delete();
      console.log(`   ✓ Raderade logotyp från storage`);
    }
  } catch (err) {
    console.log(`   ⚠️  Kunde inte radera logotyp: ${err.message}`);
  }
  
  // 3. Delete main company document
  await companyRef.delete();
  console.log(`   ✓ Raderade huvuddokument`);
}

async function deleteUser(uid, email) {
  console.log(`\n🗑️  Raderar användare: ${email || uid}`);
  
  // 1. Delete from users collection
  await db.collection('users').doc(uid).delete();
  console.log(`   ✓ Raderade från users-samlingen`);
  
  // 2. Delete from Firebase Auth
  try {
    await auth.deleteUser(uid);
    console.log(`   ✓ Raderade från Firebase Auth`);
  } catch (err) {
    console.log(`   ⚠️  Kunde inte radera från Auth: ${err.message}`);
  }
}

async function main() {
  const { dryRun, confirm } = parseArgs();
  
  if (!dryRun && !confirm) {
    console.log('❌ Du måste ange --dry-run eller --confirm');
    console.log('   --dry-run: Förhandsgranska vad som kommer raderas');
    console.log('   --confirm: Raderar faktiskt data');
    process.exit(1);
  }
  
  console.log('🔍 Hämtar data...\n');
  
  // Get all companies
  const allCompanies = await listAllCompanies();
  const companiesToDelete = allCompanies.filter(c => c.id !== KEEP_COMPANY);
  
  // Get all users
  const allUsers = await listAllUsers();
  const usersToDelete = allUsers.filter(u => u.companyId !== KEEP_COMPANY);
  
  // Get auth users
  const allAuthUsers = await listAuthUsers();
  const authUsersToDelete = allAuthUsers.filter(u => {
    const userDoc = allUsers.find(ud => ud.uid === u.uid);
    return !userDoc || userDoc.companyId !== KEEP_COMPANY;
  });
  
  console.log('📊 SAMMANFATTNING:');
  console.log(`\n✅ Behåller företag: ${KEEP_COMPANY}`);
  console.log(`\n🗑️  Företag som kommer raderas (${companiesToDelete.length}):`);
  companiesToDelete.forEach(c => {
    console.log(`   - ${c.id}${c.name ? ` (${c.name})` : ''}`);
  });
  
  console.log(`\n🗑️  Användare som kommer raderas (${usersToDelete.length}):`);
  usersToDelete.forEach(u => {
    const authUser = allAuthUsers.find(au => au.uid === u.uid);
    console.log(`   - ${u.email || u.uid} (${u.companyId || 'ingen företag'})`);
  });
  
  if (dryRun) {
    console.log('\n✅ DRY RUN - Inget raderades. Kör med --confirm för att faktiskt radera.');
    process.exit(0);
  }
  
  if (!confirm) {
    console.log('\n❌ Du måste ange --confirm för att faktiskt radera data');
    process.exit(1);
  }
  
  // Final confirmation
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  
  const answer = await new Promise(resolve => {
    rl.question(`\n⚠️  ÄR DU SÄKER? Detta kommer radera ${companiesToDelete.length} företag och ${usersToDelete.length} användare. Skriv "JA" för att bekräfta: `, resolve);
  });
  
  rl.close();
  
  if (answer !== 'JA') {
    console.log('❌ Avbrutet. Inget raderades.');
    process.exit(0);
  }
  
  console.log('\n🚀 Börjar radera...\n');
  
  // Delete companies
  for (const company of companiesToDelete) {
    try {
      await deleteCompany(company.id);
    } catch (err) {
      console.error(`   ❌ Fel vid radering av ${company.id}: ${err.message}`);
    }
  }
  
  // Delete users
  for (const user of usersToDelete) {
    try {
      const authUser = allAuthUsers.find(au => au.uid === user.uid);
      await deleteUser(user.uid, authUser?.email || user.email);
    } catch (err) {
      console.error(`   ❌ Fel vid radering av ${user.uid}: ${err.message}`);
    }
  }
  
  console.log('\n✅ Klar! All testdata har raderats.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fel:', err);
  process.exit(1);
});
