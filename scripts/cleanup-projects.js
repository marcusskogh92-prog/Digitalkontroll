#!/usr/bin/env node
/**
 * Script to clean up projects and folders - removes all hierarchy/projects for all companies except "MS Byggsystem"
 * Keeps companies and users, only removes project data
 * 
 * Usage:
 *   node scripts/cleanup-projects.js --dry-run    # Preview what will be deleted
 *   node scripts/cleanup-projects.js --confirm     # Actually delete
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

async function getCompanyStats(companyId) {
  const companyRef = db.collection('foretag').doc(companyId);
  
  const [hierarkiSnap, controlsSnap, draftsSnap, activitySnap] = await Promise.all([
    companyRef.collection('hierarki').get(),
    companyRef.collection('controls').get(),
    companyRef.collection('draft_controls').get(),
    companyRef.collection('activity').limit(1).get()
  ]);
  
  // Get hierarchy data to count projects/folders
  let hierarchyItems = 0;
  if (hierarkiSnap.docs.length > 0) {
    const stateDoc = hierarkiSnap.docs.find(d => d.id === 'state');
    if (stateDoc && stateDoc.data().items) {
      const countItems = (items) => {
        let count = 0;
        items.forEach(item => {
          count++;
          if (item.children && Array.isArray(item.children)) {
            count += countItems(item.children);
          }
        });
        return count;
      };
      hierarchyItems = countItems(stateDoc.data().items);
    }
  }
  
  return {
    hierarkiDocs: hierarkiSnap.size,
    hierarchyItems,
    controls: controlsSnap.size,
    drafts: draftsSnap.size,
    hasActivity: activitySnap.size > 0
  };
}

async function cleanupCompany(companyId) {
  console.log(`\n🗑️  Rensar projektdata för: ${companyId}`);
  
  const companyRef = db.collection('foretag').doc(companyId);
  
  // 1. Delete hierarki (mappar och projekt)
  const hierarkiSnapshot = await companyRef.collection('hierarki').get();
  const hierarkiDeletes = hierarkiSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(hierarkiDeletes);
  console.log(`   ✓ Raderade ${hierarkiSnapshot.size} hierarki-dokument`);
  
  // 2. Delete controls
  const controlsSnapshot = await companyRef.collection('controls').get();
  const controlDeletes = controlsSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(controlDeletes);
  console.log(`   ✓ Raderade ${controlsSnapshot.size} kontroller`);
  
  // 3. Delete draft_controls
  const draftsSnapshot = await companyRef.collection('draft_controls').get();
  const draftDeletes = draftsSnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(draftDeletes);
  console.log(`   ✓ Raderade ${draftsSnapshot.size} utkast`);
  
  // 4. Delete activity logs (optional - you might want to keep these)
  const activitySnapshot = await companyRef.collection('activity').get();
  const activityDeletes = activitySnapshot.docs.map(doc => doc.ref.delete());
  await Promise.all(activityDeletes);
  console.log(`   ✓ Raderade ${activitySnapshot.size} aktivitetsloggar`);
  
  // 5. Delete project-related files from storage (signatures, images, etc.)
  try {
    const bucket = storage.bucket();
    const prefix = `foretag/${companyId}/`;
    const [files] = await bucket.getFiles({ prefix });
    
    // Filter out logo (keep company logos)
    const filesToDelete = files.filter(file => {
      const path = file.name;
      // Keep logo.png, delete everything else
      return !path.endsWith('logo.png');
    });
    
    await Promise.all(filesToDelete.map(file => file.delete()));
    if (filesToDelete.length > 0) {
      console.log(`   ✓ Raderade ${filesToDelete.length} filer från storage`);
    }
  } catch (err) {
    console.log(`   ⚠️  Kunde inte rensa storage: ${err.message}`);
  }
  
  console.log(`   ✅ Klar med ${companyId}`);
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
  const companiesToCleanup = allCompanies.filter(c => c.id !== KEEP_COMPANY);
  
  console.log('📊 SAMMANFATTNING:');
  console.log(`\n✅ Behåller all projektdata för: ${KEEP_COMPANY}`);
  console.log(`\n🗑️  Företag som kommer få projektdata raderad (${companiesToCleanup.length}):`);
  
  // Get stats for each company
  const stats = [];
  for (const company of companiesToCleanup) {
    const companyStats = await getCompanyStats(company.id);
    stats.push({ company, stats: companyStats });
    console.log(`\n   ${company.id}${company.name ? ` (${company.name})` : ''}:`);
    console.log(`      - Hierarki: ${companyStats.hierarkiDocs} dokument, ${companyStats.hierarchyItems} objekt (mappar/projekt)`);
    console.log(`      - Kontroller: ${companyStats.controls}`);
    console.log(`      - Utkast: ${companyStats.drafts}`);
    console.log(`      - Aktivitetsloggar: ${companyStats.hasActivity ? 'Ja' : 'Nej'}`);
  }
  
  const totalItems = stats.reduce((sum, s) => sum + s.stats.hierarchyItems, 0);
  const totalControls = stats.reduce((sum, s) => sum + s.stats.controls, 0);
  const totalDrafts = stats.reduce((sum, s) => sum + s.stats.drafts, 0);
  
  console.log(`\n📈 TOTALT som kommer raderas:`);
  console.log(`   - ${totalItems} mappar/projekt`);
  console.log(`   - ${totalControls} kontroller`);
  console.log(`   - ${totalDrafts} utkast`);
  
  console.log(`\n✅ Företag och användare behålls - endast projektdata raderas`);
  
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
    rl.question(`\n⚠️  ÄR DU SÄKER? Detta kommer radera all projektdata för ${companiesToCleanup.length} företag (${totalItems} mappar/projekt, ${totalControls} kontroller, ${totalDrafts} utkast). Företag och användare behålls. Skriv "JA" för att bekräfta: `, resolve);
  });
  
  rl.close();
  
  if (answer !== 'JA') {
    console.log('❌ Avbrutet. Inget raderades.');
    process.exit(0);
  }
  
  console.log('\n🚀 Börjar rensa projektdata...\n');
  
  // Cleanup each company
  for (const company of companiesToCleanup) {
    try {
      await cleanupCompany(company.id);
    } catch (err) {
      console.error(`   ❌ Fel vid rensning av ${company.id}: ${err.message}`);
    }
  }
  
  console.log('\n✅ Klar! All projektdata har raderats för alla företag utom MS Byggsystem.');
  console.log('✅ Företag och användare är kvar.');
  process.exit(0);
}

main().catch(err => {
  console.error('❌ Fel:', err);
  process.exit(1);
});
