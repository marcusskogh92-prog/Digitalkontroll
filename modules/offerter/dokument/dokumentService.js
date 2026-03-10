import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
} from 'firebase/firestore';

import { auth, db } from '../../../components/firebase';

function safeText(v) {
  return String(v ?? '').trim();
}

function nowUserMeta() {
  const user = auth?.currentUser || null;
  return {
    uid: user?.uid || null,
    name: safeText(user?.displayName || user?.email) || null,
  };
}

function getDocsCollectionRef(companyId, projectId) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return collection(db, 'foretag', cid, 'projects', pid, 'inkopDokument');
}

export function listenInkopDokument(companyId, projectId, onItems, onError) {
  const colRef = getDocsCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));
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

export async function addInkopDokument({ companyId, projectId, rowId, supplierKey, fileName, fileSize, fileType, downloadUrl }) {
  const colRef = getDocsCollectionRef(companyId, projectId);
  const { uid, name } = nowUserMeta();

  return addDoc(colRef, {
    rowId: safeText(rowId),
    supplierKey: safeText(supplierKey),
    fileName: safeText(fileName),
    fileSize: typeof fileSize === 'number' ? fileSize : null,
    fileType: safeText(fileType),
    downloadUrl: safeText(downloadUrl),
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
  });
}

export async function deleteInkopDokument(companyId, projectId, docId) {
  const colRef = getDocsCollectionRef(companyId, projectId);
  const ref = doc(colRef, docId);
  await deleteDoc(ref);
}
