/**
 * Dev verifiering: bekräfta att `analyzeFFU`-cachen skrivs till Firestore-emulatorn.
 *
 * Körs lämpligen via:
 *   npx firebase emulators:exec --only functions,firestore,auth "node dev/analyzeFFU.dev.js && node dev/verifyFFUCache.dev.cjs"
 */

const admin = require('firebase-admin');

const PROJECT_ID = process.env.GCLOUD_PROJECT || process.env.FIREBASE_PROJECT || 'digitalkontroll-8fd05';
const FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || null;

const DOC_PATH = 'foretag/dev-company/projects/dev-project/ai/ffu_analysis';

async function main() {
  console.log('[verifyFFUCache] Firestore emulator host:', FIRESTORE_EMULATOR_HOST || '(missing)');
  console.log('[verifyFFUCache] Project:', PROJECT_ID);
  console.log('[verifyFFUCache] Doc path:', DOC_PATH);

  if (!FIRESTORE_EMULATOR_HOST) {
    console.error('[verifyFFUCache] ❌ FIRESTORE_EMULATOR_HOST is missing. This is a red flag: Admin SDK may hit production.');
    process.exit(2);
  }

  if (!admin.apps.length) {
    admin.initializeApp({ projectId: PROJECT_ID });
  }

  const db = admin.firestore();
  const snap = await db.doc(DOC_PATH).get();

  console.log('[verifyFFUCache] doc exists:', snap.exists);
  if (snap.exists) {
    console.log('[verifyFFUCache] ✅ Cache document found in emulator');
    console.dir(snap.data(), { depth: null });
    process.exit(0);
  }

  console.log('[verifyFFUCache] ⚠️ Cache document NOT found in emulator');
  console.log('[verifyFFUCache] Note: In current backend implementation, cache is only written after the AI call path executes.');
  process.exit(1);
}

main().catch((e) => {
  console.error('[verifyFFUCache] ❌ Error reading cache doc:', e && e.message ? e.message : e);
  process.exit(3);
});
