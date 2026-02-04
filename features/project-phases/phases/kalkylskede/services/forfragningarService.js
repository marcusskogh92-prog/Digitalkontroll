/**
 * Förfrågningar (Offerter) Service
 *
 * Storage:
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/byggdelar/{byggdelId}
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/paket/{paketId}
 * foretag/{companyId}/projects/{projectId}/offerter/forfragningar/paket/{paketId}/notes/{noteId}
 */

import {
    addDoc,
    collection,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
    writeBatch,
    limit,
} from 'firebase/firestore';

import { auth, db } from '../../../../../components/firebase';

function requireIds(companyId, projectId) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return { cid, pid };
}

export const RFQ_PACKAGE_STATUSES = ['Ej skickad', 'Skickad', 'Besvarad'];

const DEFAULT_BUILD_PARTS = [
  { nr: '6', name: 'Rivning' },
  { nr: '10', name: 'Mark' },
  { nr: '23', name: 'Markförstärkning' },
  { nr: '24', name: 'Grundkonstruktioner' },
  { nr: '27', name: 'Platta på mark' },
  { nr: '31', name: 'Ytterväggspaneler' },
  { nr: '34', name: 'Bjälklag HDF' },
  { nr: '35', name: 'Stålstomme' },
  { nr: '36', name: 'Utvändiga trappor stål' },
  { nr: '41', name: 'Högbärande plåt' },
  { nr: '43', name: 'UE Takläggning' },
  { nr: '49', name: 'UE Plåtslagare' },
  { nr: '54', name: 'UE Portar' },
  { nr: '55', name: 'Fönster / Glaspartier' },
  { nr: '56', name: 'Ståldörrar i fasad' },
  { nr: '58', name: 'UE Solavskärmning/Markiser' },
  { nr: '62', name: 'Undergolv, flytspackling' },
  { nr: '63', name: 'Innerväggar' },
  { nr: '64', name: 'Innertak' },
  { nr: '65', name: 'Invändiga dörrar/glaspartier' },
  { nr: '66', name: 'Invändiga trappor' },
  { nr: '67', name: 'UE Hiss' },
  { nr: '69', name: 'UE Lås & larm, beslagning' },
  { nr: '71', name: 'UE Kakel och klinkers' },
  { nr: '72', name: 'UE Ytskikt golv' },
  { nr: '74', name: 'UE Undertak' },
  { nr: '75', name: 'UE Målning' },
  { nr: '76', name: 'Vitvaror' },
  { nr: '77', name: 'Skåp och inredning' },
  { nr: '78', name: 'Rumskomplettering' },
  { nr: '84', name: 'UE VS' },
  { nr: '85', name: 'UE Vent' },
  { nr: '86', name: 'UE EL' },
  { nr: '88', name: 'Styr' },
  { nr: '91', name: 'Hyresmaskiner' },
  { nr: '92', name: 'Ställning' },
  { nr: '96', name: 'Bodetablering' },
  { nr: '981', name: 'Konsult Arkitekt' },
  { nr: '982', name: 'Konsult Konstruktör' },
  { nr: '983', name: 'Konsult Brand' },
  { nr: '984', name: 'Konsult Geoteknik' },
  { nr: '985', name: 'Konsult Ljud' },
  { nr: '986', name: 'Konsult Energi' },
  { nr: '987', name: 'Konsult Utsättare' },
  { nr: '988', name: 'Konsult Fukt' },
  { nr: '989', name: 'Konsult Tillgänglighet' },
];

function deriveCategory(name) {
  const label = String(name || '').trim();
  if (label.startsWith('UE VS')) return 'VS';
  if (label.startsWith('UE Vent')) return 'Ventilation';
  if (label.startsWith('UE EL')) return 'El';
  if (label.startsWith('Konsult')) return 'Konsult';
  return label;
}

function nowUserMeta() {
  const user = auth?.currentUser || null;
  const uid = user?.uid || null;
  const name = String(user?.displayName || user?.email || '').trim() || null;
  return { uid, name };
}

export function getForfragningarDocRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  // Projects/{pid}/offerter/forfragningar is a doc (not a collection).
  return doc(db, 'foretag', cid, 'projects', pid, 'offerter', 'forfragningar');
}

export function getRfqByggdelarCollectionRef(companyId, projectId) {
  const ref = getForfragningarDocRef(companyId, projectId);
  return collection(ref, 'byggdelar');
}

export function getRfqPackagesCollectionRef(companyId, projectId) {
  const ref = getForfragningarDocRef(companyId, projectId);
  return collection(ref, 'paket');
}

export function getRfqPackageNotesCollectionRef(companyId, projectId, packageId) {
  const pkgId = String(packageId || '').trim();
  if (!pkgId) throw new Error('packageId is required');
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
  return collection(doc(colRef, pkgId), 'notes');
}

export function listenRfqByggdelar(companyId, projectId, onItems, onError, options) {
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      const visible = includeDeleted ? items : items.filter((it) => it?.deleted !== true);
      if (typeof onItems === 'function') onItems(visible);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export function listenRfqPackages(companyId, projectId, onItems, onError, options) {
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      const visible = includeDeleted ? items : items.filter((it) => it?.deleted !== true);
      if (typeof onItems === 'function') onItems(visible);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function createRfqByggdel(companyId, projectId, data) {
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const label = String(data?.label || data?.byggdelLabel || '').trim();
  if (!label) throw new Error('Byggdel är obligatoriskt');

  const { uid, name } = nowUserMeta();
  const payload = {
    label,
    code: String(data?.code || '').trim() || null,
    group: String(data?.group || '').trim() || null,
    moment: String(data?.moment || '').trim() || null,
    locked: Boolean(data?.locked),
    status: String(data?.status || '').trim() || null,
    nr: String(data?.nr || '').trim() || null,
    name: String(data?.name || '').trim() || null,
    description: String(data?.description || '').trim() || null,
    category: String(data?.category || '').trim() || null,

    deleted: false,

    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function seedInquiryBuildParts(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  const colRef = getRfqByggdelarCollectionRef(cid, pid);

  console.log('Seeding build parts for inquiry', pid);
  const existingSnap = await getDocs(query(colRef, limit(1)));
  if (!existingSnap.empty) {
    console.log('Build parts already exist – skipping seed');
    return { created: 0, skipped: true };
  }

  const batch = writeBatch(db);
  DEFAULT_BUILD_PARTS.forEach((item) => {
    const nr = String(item.nr || '').trim();
    const name = String(item.name || '').trim();
    const category = deriveCategory(name);
    const docRef = doc(colRef);
    batch.set(docRef, {
      nr,
      name,
      description: name,
      category,
      status: 'UTKAST',
      createdAt: serverTimestamp(),
      label: name,
      code: nr,
      group: category,
      locked: true,
      deleted: false,
    });
  });

  await batch.commit();
  return { created: DEFAULT_BUILD_PARTS.length, skipped: false };
}

export async function updateRfqByggdel(companyId, projectId, byggdelId, patch) {
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const bid = String(byggdelId || '').trim();
  if (!bid) throw new Error('byggdelId is required');

  const { uid, name } = nowUserMeta();
  const next = {
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  if (Object.prototype.hasOwnProperty.call(next, 'label')) {
    const nextLabel = String(next.label || '').trim();
    if (!nextLabel) throw new Error('Byggdel är obligatoriskt');
    next.label = nextLabel;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'code')) {
    const nextCode = String(next.code || '').trim();
    next.code = nextCode || null;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'group')) {
    const nextGroup = String(next.group || '').trim();
    next.group = nextGroup || null;
  }

  await updateDoc(doc(colRef, bid), next);
  return true;
}

export async function softDeleteRfqByggdel(companyId, projectId, byggdelId) {
  const colRef = getRfqByggdelarCollectionRef(companyId, projectId);
  const bid = String(byggdelId || '').trim();
  if (!bid) throw new Error('byggdelId is required');

  const { uid, name } = nowUserMeta();
  await updateDoc(doc(colRef, bid), {
    deleted: true,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  });
  return true;
}

export async function createRfqPackage(companyId, projectId, data) {
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);

  const byggdelId = String(data?.byggdelId || '').trim();
  const byggdelLabel = String(data?.byggdelLabel || '').trim();
  const supplierId = String(data?.supplierId || '').trim() || null;
  const supplierName = String(data?.supplierName || '').trim();
  const contactId = String(data?.contactId || '').trim() || null;
  const contactName = String(data?.contactName || '').trim() || null;

  if (!byggdelId || !byggdelLabel) throw new Error('Byggdel är obligatoriskt');
  if (!supplierName && !supplierId) throw new Error('Leverantör är obligatoriskt');

  const statusCandidate = String(data?.status || 'Ej skickad').trim();
  const status = RFQ_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';

  const { uid, name } = nowUserMeta();
  const payload = {
    byggdelId,
    byggdelLabel,
    supplierId,
    supplierName: supplierName || null,
    contactId,
    contactName,

    status,

    sharePointFolderPath: String(data?.sharePointFolderPath || '').trim() || null,

    sentAt: null,
    answeredAt: null,

    deleted: false,

    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  const docRef = await addDoc(colRef, payload);
  return { id: docRef.id, ...payload };
}

export async function updateRfqPackage(companyId, projectId, packageId, patch) {
  const colRef = getRfqPackagesCollectionRef(companyId, projectId);
  const pid = String(packageId || '').trim();
  if (!pid) throw new Error('packageId is required');

  const { uid, name } = nowUserMeta();
  const next = {
    ...(patch && typeof patch === 'object' ? patch : {}),
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
  };

  if (Object.prototype.hasOwnProperty.call(next, 'status')) {
    const statusCandidate = String(next.status || '').trim();
    next.status = RFQ_PACKAGE_STATUSES.includes(statusCandidate) ? statusCandidate : 'Ej skickad';

    // Auto-stamp when reaching certain statuses.
    if (next.status === 'Skickad') {
      if (!Object.prototype.hasOwnProperty.call(next, 'sentAt')) next.sentAt = serverTimestamp();
    }
    if (next.status === 'Besvarad') {
      if (!Object.prototype.hasOwnProperty.call(next, 'answeredAt')) next.answeredAt = serverTimestamp();
    }
  }

  if (Object.prototype.hasOwnProperty.call(next, 'contactId')) {
    const nextId = String(next.contactId || '').trim();
    next.contactId = nextId || null;
  }
  if (Object.prototype.hasOwnProperty.call(next, 'contactName')) {
    const nextName = String(next.contactName || '').trim();
    next.contactName = nextName || null;
  }

  await updateDoc(doc(colRef, pid), next);
  return true;
}

export function listenRfqPackageNotes(companyId, projectId, packageId, onItems, onError) {
  const notesRef = getRfqPackageNotesCollectionRef(companyId, projectId, packageId);
  const q = query(notesRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      if (typeof onItems === 'function') onItems(items);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function addRfqPackageNote(companyId, projectId, packageId, text) {
  const notesRef = getRfqPackageNotesCollectionRef(companyId, projectId, packageId);
  const t = String(text || '').trim();
  if (!t) throw new Error('Tom kommentar');

  const { uid, name } = nowUserMeta();
  const payload = {
    text: t,
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
  };

  const docRef = await addDoc(notesRef, payload);
  return docRef.id;
}
