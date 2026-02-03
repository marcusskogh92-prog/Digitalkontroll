/**
 * Fråga & Svar (Status/Beslut) Service - kalkylskede
 *
 * Storage:
 * foretag/{companyId}/projects/{projectId}/phaseData/kalkylskede/fragaSvar/{docId}
 */

import {
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    runTransaction,
    serverTimestamp,
    updateDoc
} from 'firebase/firestore';

import { auth, db } from '../../../../../components/firebase';

import { enqueueFsExcelSync } from './fragaSvarExcelSyncQueue';

function isLikelyFirestoreFieldValue(value) {
  if (!value || typeof value !== 'object') return false;

  // Firestore v9 sentinels are FieldValue instances.
  const ctorName = value?.constructor?.name;
  if (ctorName === 'FieldValue') return true;

  // Some builds expose an internal method name.
  const methodName = value?._methodName;
  if (typeof methodName === 'string' && methodName) return true;

  // Some environments wrap with a delegate.
  const delegateCtor = value?._delegate?.constructor?.name;
  if (delegateCtor === 'FieldValue') return true;

  return false;
}

function assertNoFirestoreFieldValueInsideArrays(root, label = 'data') {
  const visit = (value, path, inArray) => {
    if (inArray && isLikelyFirestoreFieldValue(value)) {
      throw new Error(`Ogiltig Firestore-data: FieldValue (t.ex. serverTimestamp) får inte ligga i arrayer (${label}.${path}).`);
    }

    if (Array.isArray(value)) {
      for (let i = 0; i < value.length; i += 1) {
        visit(value[i], `${path}[${i}]`, true);
      }
      return;
    }

    if (!value || typeof value !== 'object') return;

    for (const [k, v] of Object.entries(value)) {
      visit(v, path ? `${path}.${k}` : k, inArray);
    }
  };

  visit(root, '', false);
}

function requireIds(companyId, projectId) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return { cid, pid };
}

export function getFragaSvarCollectionRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  const phaseDocRef = doc(db, 'foretag', cid, 'projects', pid, 'phaseData', 'kalkylskede');
  return collection(phaseDocRef, 'fragaSvar');
}

function getFragaSvarMetaRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  // Store counters under the phase doc (single doc) to keep per-project sequence atomic.
  return doc(db, 'foretag', cid, 'projects', pid, 'phaseData', 'kalkylskede');
}

function deriveTitle(value, maxLen = 80) {
  const s = String(value || '').replace(/\s+/g, ' ').trim();
  if (!s) return '';
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1)).trim()}…`;
}

export function listenFragaSvarItems(companyId, projectId, onItems, onError, options) {
  const colRef = getFragaSvarCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));
  const includeDeleted = options && typeof options === 'object' ? !!options.includeDeleted : false;

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      const visible = includeDeleted
        ? items
        : items.filter((it) => it?.deleted !== true);
      if (typeof onItems === 'function') onItems(visible);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function createFragaSvarItem(companyId, projectId, data) {
  const colRef = getFragaSvarCollectionRef(companyId, projectId);
  const metaRef = getFragaSvarMetaRef(companyId, projectId);

  const user = auth?.currentUser || null;
  const createdByUid = user?.uid || null;
  const createdByName = String(user?.displayName || user?.email || '').trim() || null;

  const rawQuestion = String(data?.question || '').trim();
  const rawTitle = String(data?.title || '').trim();
  const title = rawTitle || deriveTitle(rawQuestion);

  const rawAnswer = String((data?.answer ?? data?.comment) || '').trim();

  // Firestore rule: serverTimestamp() is not supported inside arrays.
  // Keep per-answer history timestamps as serializable primitives.
  const localAnswerAt = rawAnswer ? Date.now() : null;

  const created = await runTransaction(db, async (tx) => {
    const metaSnap = await tx.get(metaRef);
    const meta = metaSnap.exists() ? (metaSnap.data() || {}) : {};
    const next = Number(meta?.fragaSvarNextFsSeq || 1) || 1;

    // Pre-create doc id so we can return it deterministically.
    const docRef = doc(colRef);
    const fsSeq = next;
    const fsNumber = `FS${String(fsSeq).padStart(2, '0')}`;

    const answers = rawAnswer
      ? [{
        text: rawAnswer,
        answeredAt: localAnswerAt,
        answeredByUid: createdByUid || null,
        answeredByName: createdByName || null,
      }]
      : [];

    const payload = {
      // FS numbering
      fsSeq,
      fsNumber,

      // Human-friendly fields
      title: String(title || '').trim(),
      bd: String(data?.bd || '').trim(),
      needsAnswerBy: String(data?.needsAnswerBy || '').trim(),
      discipline: String(data?.discipline || '').trim(),
      stalledTill: String(data?.stalledTill || '').trim(),

      // Responsibility (optional)
      responsibles: Array.isArray(data?.responsibles) ? data.responsibles : [],
      responsible: (data?.responsible && typeof data.responsible === 'object') ? data.responsible : null,

      // Main content
      question: rawQuestion,
      status: String(data?.status || 'Obesvarad').trim(),

      // Answer (legacy latest answer fields) + answer history
      answer: rawAnswer,
      comment: rawAnswer,
      answers,

      answeredAt: rawAnswer ? serverTimestamp() : null,
      answeredByUid: rawAnswer ? (createdByUid || null) : null,
      answeredByName: rawAnswer ? (createdByName || null) : null,

      // SharePoint binding (will be filled by UI after folder creation)
      sharePointFolderPath: String(data?.sharePointFolderPath || '').trim() || null,
      sharePointFolderName: String(data?.sharePointFolderName || '').trim() || null,

      attachments: Array.isArray(data?.attachments) ? data.attachments : [],

      createdAt: serverTimestamp(),
      createdByUid,
      createdByName,
      updatedAt: serverTimestamp(),
      updatedByUid: createdByUid,
      updatedByName: createdByName,
    };

    // Defensive: never allow Firestore sentinels inside arrays (answers/attachments/etc).
    assertNoFirestoreFieldValueInsideArrays(payload, 'createFragaSvarItem.payload');

    tx.set(docRef, payload);

    // Bump counter atomically
    if (metaSnap.exists()) {
      tx.update(metaRef, {
        fragaSvarNextFsSeq: fsSeq + 1,
        updatedAt: serverTimestamp(),
      });
    } else {
      tx.set(metaRef, {
        fragaSvarNextFsSeq: fsSeq + 1,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });
    }

    return { id: docRef.id, ...payload };
  });

  // Non-blocking: Digitalkontroll is source of truth; Excel is a report.
  // Queue rebuild-based sync (handles SharePoint/Excel file locks with retry).
  try {
    enqueueFsExcelSync(companyId, projectId, { reason: 'create' });
  } catch (_e) {}
  return created;
}

export async function updateFragaSvarItem(companyId, projectId, id, patch) {
  const colRef = getFragaSvarCollectionRef(companyId, projectId);
  const ref = doc(colRef, String(id || '').trim());

  const user = auth?.currentUser || null;

  const next = {
    ...patch,
    updatedAt: serverTimestamp(),
    updatedByUid: user?.uid || null,
    updatedByName: String(user?.displayName || user?.email || '').trim() || null,
  };

  // If answer is updated and non-empty, audit who answered + when.
  // We treat `comment` as a legacy alias for answer.
  const answerCandidate = (patch && (patch.answer !== undefined || patch.comment !== undefined))
    ? String((patch.answer ?? patch.comment) || '').trim()
    : null;
  if (answerCandidate !== null) {
    next.answer = answerCandidate;
    next.comment = answerCandidate;
    if (answerCandidate) {
      next.answeredAt = serverTimestamp();
      next.answeredByUid = user?.uid || null;
      next.answeredByName = String(user?.displayName || user?.email || '').trim() || null;
    } else {
      next.answeredAt = null;
      next.answeredByUid = null;
      next.answeredByName = null;
    }
  }

  // Answers must be handled as objects (not arrayUnion) while still using serverTimestamp.
  // Use a transaction so we can read existing history and append deterministically.
  if (answerCandidate) {
    await runTransaction(db, async (tx) => {
      const snap = await tx.get(ref);
      const data = snap.exists() ? (snap.data() || {}) : {};
      const existing = Array.isArray(data?.answers) ? data.answers : [];
      const last = existing.length > 0 ? existing[existing.length - 1] : null;
      const lastText = (last && typeof last === 'object') ? String(last?.text || '').trim() : '';

      // Firestore rule: serverTimestamp() is not supported inside arrays.
      const localAnsweredAt = Date.now();

      const shouldAppend = String(answerCandidate || '').trim() && String(answerCandidate || '').trim() !== lastText;
      const answers = shouldAppend
        ? [...existing, {
          text: answerCandidate,
          answeredAt: localAnsweredAt,
          answeredByUid: user?.uid || null,
          answeredByName: String(user?.displayName || user?.email || '').trim() || null,
        }]
        : existing;

      const updatePayload = {
        ...next,
        answers,
      };
      // Defensive: never allow Firestore sentinels inside arrays (answers/attachments/etc).
      assertNoFirestoreFieldValueInsideArrays(updatePayload, 'updateFragaSvarItem.txUpdate');
      tx.update(ref, updatePayload);
    });

    try {
      enqueueFsExcelSync(companyId, projectId, { reason: 'update' });
    } catch (_e) {}
    return;
  }

  // Defensive: never allow Firestore sentinels inside arrays (answers/attachments/etc).
  assertNoFirestoreFieldValueInsideArrays(next, 'updateFragaSvarItem.updateDoc');
  await updateDoc(ref, next);

  try {
    enqueueFsExcelSync(companyId, projectId, { reason: 'update' });
  } catch (_e) {}
}

/**
 * Fetch all FS items once (for renumbering after delete). Returns non-deleted items sorted by fsSeq.
 */
export async function getFragaSvarItemsOnce(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  const colRef = getFragaSvarCollectionRef(cid, pid);
  const q = query(colRef, orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
  const visible = items.filter((it) => it?.deleted !== true);
  visible.sort((a, b) => {
    const sa = Number(a?.fsSeq) || 0;
    const sb = Number(b?.fsSeq) || 0;
    return sa - sb;
  });
  return visible;
}

/**
 * Set the next FS sequence number in meta (used after renumbering to close gaps).
 */
export async function setFragaSvarNextFsSeq(companyId, projectId, nextSeq) {
  const { cid, pid } = requireIds(companyId, projectId);
  const metaRef = getFragaSvarMetaRef(cid, pid);
  const num = Number(nextSeq);
  if (!Number.isInteger(num) || num < 1) throw new Error('fragaSvarNextFsSeq must be a positive integer');
  await updateDoc(metaRef, {
    fragaSvarNextFsSeq: num,
    updatedAt: serverTimestamp(),
  });
}

/**
 * Permanently delete an FS question (hard delete).
 * - Deletes the Firestore document. Related data is the document itself (no subcollections).
 * - Does NOT decrement fragaSvarNextFsSeq (FS numbers are never reused).
 * - Caller is responsible for: 1) Deleting the SharePoint folder (Frågasvar/FSxx), 2) Excel is
 *   updated by enqueueFsExcelSync (rebuild excludes this doc).
 */
export async function deleteFragaSvarItem(companyId, projectId, id) {
  const colRef = getFragaSvarCollectionRef(companyId, projectId);
  const docId = String(id || '').trim();
  if (!docId) throw new Error('FS-id krävs för radering.');
  const ref = doc(colRef, docId);

  const snap = await getDoc(ref);
  if (!snap.exists()) {
    throw new Error('Frågan finns inte eller är redan raderad.');
  }

  await deleteDoc(ref);

  try {
    enqueueFsExcelSync(companyId, projectId, { reason: 'delete' });
  } catch (e) {
    // Log but do not fail the delete; Excel will sync on next change.
    if (typeof console !== 'undefined' && console.warn) {
      console.warn('[FS delete] Excel-synk könades inte:', e?.message || e);
    }
  }
}
