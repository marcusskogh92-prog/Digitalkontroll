#!/usr/bin/env node
const admin = require('firebase-admin');
const fs = require('fs');
const path = require('path');

const defaultPath = path.resolve(__dirname, '../konton/demo-service.json');
const fallbackPath = path.resolve(__dirname, '../konton/digitalkontroll-8fd05-firebase-adminsdk-fbsvc-4e15d45055.json');
const serviceAccountPath = process.env.GOOGLE_APPLICATION_CREDENTIALS
  || (fs.existsSync(defaultPath) ? defaultPath : fallbackPath);
if (!fs.existsSync(serviceAccountPath)) {
  console.error('Service account not found. Tried:', serviceAccountPath);
  console.error('Place a key at konton/demo-service.json or konton/digitalkontroll-8fd05-firebase-adminsdk-fbsvc-4e15d45055.json');
  process.exit(1);
}
const saRaw = fs.readFileSync(serviceAccountPath, 'utf8');
const sa = JSON.parse(saRaw);
admin.initializeApp({ credential: admin.credential.cert(sa) });
const db = admin.firestore();

async function main() {
  // Samma källa som appen (superadmin företagslista): collection group på "profil", endast doc id "public"
  const profilSnap = await db.collectionGroup('profil').get();
  const fromProfil = [];
  profilSnap.forEach((d) => {
    if (d.id !== 'public') return;
    const companyDoc = d.ref.parent && d.ref.parent.parent;
    const companyId = companyDoc ? companyDoc.id : null;
    if (!companyId) return;
    const profile = d.data() || {};
    const name = profile.companyName || profile.name || companyId;
    fromProfil.push({ id: companyId, name, profile });
  });
  fromProfil.sort((a, b) => String((a.name || a.id)).toLowerCase().localeCompare(String((b.name || b.id)).toLowerCase()));

  console.log('Företag som superadmin ser (från foretag/.../profil/public):', fromProfil.length);
  console.log('');

  // Top-level foretag-dokument (vårt gamla listningssätt)
  const foretagSnap = await db.collection('foretag').get();
  const topLevelIds = new Set(foretagSnap.docs.map((d) => d.id));

  for (const { id, name } of fromProfil) {
    const hasTopLevel = topLevelIds.has(id);
    const mark = hasTopLevel ? '' : '  [saknar topp-dokument foretag/' + id + ']';
    console.log('  •', id);
    if (name !== id) console.log('      visningsnamn:', name);
    if (!hasTopLevel) console.log('      ', mark.trim());
  }

  if (topLevelIds.size !== fromProfil.length) {
    console.log('');
    console.log('Notering: Endast', topLevelIds.size, 'av', fromProfil.length, 'har ett topp-dokument under foretag/.');
    console.log('Appen listar företag via profil/public; topp-dokument behövs inte för att synas i listan.');
  }
}

main().then(()=>process.exit(0)).catch(e=>{console.error(e); process.exit(1);});
