/**
 * Grundregister Byggdelar – seed-data och idempotent seed per företag.
 * Används av provision-company, import-companies-users (ensureCompanyBase) och migrate-seed-byggdelar.
 * Kräver firebase-admin initialiserat och db = admin.firestore().
 *
 * Collection: foretag/{companyId}/byggdelar
 * Doc ID = code (1–3 siffror, t.ex. "06") för idempotens.
 * Fält: code, name, notes, isDefault, createdAt, updatedAt.
 */

const admin = require('firebase-admin');

/** Grundlistan – endast code + name (notes fylls i av företaget). */
const GRUNDBYGGDELAR = [
  { code: '06', name: 'Rivning' },
  { code: '10', name: 'Mark' },
  { code: '23', name: 'Markförstärkning' },
  { code: '24', name: 'Grundkonstruktioner, fundament' },
  { code: '27', name: 'Platta på mark' },
  { code: '31', name: 'Ytterväggspaneler' },
  { code: '33', name: 'Prefab betong, Betongstomme' },
  { code: '34', name: 'Bjälklag HDF' },
  { code: '35', name: 'Stålstomme, Byggsmide' },
  { code: '36', name: 'Utvändiga trappor stål' },
  { code: '39', name: 'Tätt hus, stål' },
  { code: '41', name: 'Högbärande plåt' },
  { code: '43', name: 'Takläggning, Taktäckning' },
  { code: '45', name: 'Öppningskomplettering, Takluckor' },
  { code: '48', name: 'Lösull' },
  { code: '49', name: 'Plåtarbeten' },
  { code: '53', name: 'Fasadbeklädnad' },
  { code: '54', name: 'Portar' },
  { code: '55', name: 'Fönster, Glaspartier i fasad' },
  { code: '56', name: 'Ståldörrar i fasad' },
  { code: '58', name: 'Utv. Huskomplettering' },
  { code: '62', name: 'Undergolv, flytspackling' },
  { code: '63', name: 'Innerväggar' },
  { code: '64', name: 'Innertak' },
  { code: '65', name: 'Invändiga dörrar, Glaspartier' },
  { code: '66', name: 'Invändiga trappor' },
  { code: '67', name: 'Hiss, plattformar' },
  { code: '69', name: 'Lås, Passér och Larm' },
  { code: '71', name: 'Ytskikt keramik, golv & vägg' },
  { code: '72', name: 'Ytskikt mattor, fogfritt golv & vägg' },
  { code: '74', name: 'Undertak' },
  { code: '75', name: 'Målning' },
  { code: '76', name: 'Vitvaror' },
  { code: '77', name: 'Skåp och inredning' },
  { code: '78', name: 'Rumskomplettering' },
  { code: '83', name: 'Sprinkler' },
  { code: '84', name: 'VS' },
  { code: '85', name: 'Vent' },
  { code: '86', name: 'EL' },
  { code: '88', name: 'Styr & regler' },
  { code: '91', name: 'Hyresmaskiner' },
  { code: '92', name: 'Ställning' },
  { code: '96', name: 'Bodetablering' },
  { code: '98', name: 'Konsulter' },
];

function normalizeCode(v) {
  const s = String(v ?? '').replace(/\D/g, '').slice(0, 3);
  return s || '';
}

/**
 * Idempotent: skapa alla grundbyggdelar för företaget om de saknas.
 * Skapar aldrig dubletter (unika på companyId + code).
 * @param {FirebaseFirestore.Firestore} db
 * @param {string} companyId
 * @param {{ dryRun?: boolean }} options
 * @returns {{ created: number, skipped: number }}
 */
async function ensureCompanyByggdelar(db, companyId, options = {}) {
  const dryRun = Boolean(options && options.dryRun);
  const cid = String(companyId || '').trim();
  if (!cid) return { created: 0, skipped: 0 };

  const colRef = db.collection('foretag').doc(cid).collection('byggdelar');
  let created = 0;
  let skipped = 0;

  for (const item of GRUNDBYGGDELAR) {
    const code = normalizeCode(item.code) || String(item.code || '').trim().slice(0, 3);
    if (!code) continue;
    const name = String(item.name || '').trim();
    if (!name) continue;

    const docRef = colRef.doc(code);
    if (!dryRun) {
      const snap = await docRef.get();
      if (snap.exists) {
        skipped += 1;
        continue;
      }
      const ts = admin.firestore.FieldValue.serverTimestamp();
      await docRef.set({
        code,
        name,
        notes: '',
        isDefault: true,
        createdAt: ts,
        updatedAt: ts,
      });
      created += 1;
    } else {
      const snap = await docRef.get();
      if (snap.exists) skipped += 1;
      else created += 1;
    }
  }

  return { created, skipped };
}

module.exports = {
  GRUNDBYGGDELAR,
  ensureCompanyByggdelar,
  normalizeCode,
};
