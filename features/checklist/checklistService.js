/**
 * Checklist service – Firestore CRUD och seed från systemmall.
 * Collection: foretag/{companyId}/projects/{projectId}/checklist_items
 */

import {
  addDoc,
  collection,
  getDocs,
  onSnapshot,
  updateDoc,
  doc,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore';
import { db } from '../../components/firebase';
import { defaultChecklistTemplate } from '../../lib/defaultChecklistTemplate';

const COLLECTION = 'checklist_items';

function itemsRef(companyId, projectId) {
  return collection(db, 'foretag', String(companyId), 'projects', String(projectId), COLLECTION);
}

/**
 * Hämta alla checklistpunkter för ett projekt.
 */
export async function getProjectChecklistItems(companyId, projectId) {
  const ref = itemsRef(companyId, projectId);
  const snap = await getDocs(ref);
  const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  list.sort((a, b) => (a.categorySortOrder || 0) - (b.categorySortOrder || 0) || (a.sortOrder || 0) - (b.sortOrder || 0));
  return list;
}

/**
 * Seed projekt med systemmall (lib/defaultChecklistTemplate).
 * Anropas vid projektcreation eller manuellt. Endast om ingen checklista redan finns.
 * Använder batch write (en commit) för snabbare och mer robust skrivning.
 */
export async function seedProjectChecklistFromTemplate(companyId, projectId, stage = 'kalkylskede') {
  const template = stage === 'kalkylskede' ? defaultChecklistTemplate : null;
  if (!template || !template.categories) return;

  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) return;

  const ref = itemsRef(cid, pid);
  const existing = await getDocs(ref);
  if (existing.size > 0) return;

  const batch = writeBatch(db);
  const ts = serverTimestamp();
  const basePath = ['foretag', cid, 'projects', pid, COLLECTION];

  for (const cat of template.categories) {
    for (const item of cat.items || []) {
      const docRef = doc(collection(db, ...basePath));
      batch.set(docRef, {
        categoryId: cat.id,
        categoryName: cat.name,
        category: cat.name,
        categorySortOrder: cat.sortOrder,
        templateItemId: item.id,
        title: item.title,
        required: true,
        isMandatory: true,
        isSystemItem: true,
        isDefault: true,
        isHidden: false,
        sortOrder: item.defaultSortOrder ?? 0,
        status: 'pending',
        isCustomItem: false,
        dueDate: null,
        assignedTo: null,
        comment: null,
        createdAt: ts,
        updatedAt: ts,
      });
    }
  }

  await batch.commit();
}

/**
 * Uppdatera en checklistpunkt (status, ansvarig, datum, kommentar).
 * Status: 'pending' | 'in_progress' | 'done' | 'not_applicable'.
 * assignedTo kan vara string[] (flera ansvariga) eller string (ensam).
 */
export async function updateProjectChecklistItem(companyId, projectId, itemId, data) {
  const d = doc(db, 'foretag', String(companyId), 'projects', String(projectId), COLLECTION, String(itemId));
  const payload = { ...data, updatedAt: serverTimestamp() };
  const status = data.status;
  if (status === 'done' || status === 'Done') {
    payload.status = 'done';
    if (payload.completedDate === undefined) payload.completedDate = new Date().toISOString().slice(0, 10);
  } else if (status === 'not_applicable' || status === 'NotRelevant') {
    payload.status = 'not_applicable';
  } else if (status === 'in_progress' || status === 'InProgress') {
    payload.status = 'in_progress';
  } else if (status === 'pending' || status === 'NotStarted') {
    payload.status = 'pending';
  }
  if (data.assignedTo !== undefined) {
    payload.assignedTo = Array.isArray(data.assignedTo) ? data.assignedTo : (data.assignedTo ? [data.assignedTo] : []);
  }
  if (data.responsibleUserId !== undefined) payload.responsibleUserId = data.responsibleUserId;
  await updateDoc(d, payload);
}

/**
 * Dölj/visa systempunkt (ej radera).
 */
export async function setProjectChecklistItemHidden(companyId, projectId, itemId, isHidden) {
  await updateProjectChecklistItem(companyId, projectId, itemId, { isHidden: !!isHidden });
}

/**
 * Prenumera på checklistpunkter (realtime).
 * @param {string} companyId
 * @param {string} projectId
 * @param {function} onUpdate - (items: array) => void
 * @param {function} [onError] - (err: Error) => void
 * @returns {function} unsubscribe
 */
export function subscribeProjectChecklistItems(companyId, projectId, onUpdate, onError) {
  const ref = itemsRef(companyId, projectId);
  const unsub = onSnapshot(
    ref,
    (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      list.sort((a, b) => (a.categorySortOrder || 0) - (b.categorySortOrder || 0) || (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
      onUpdate(list);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
      onUpdate([]);
    }
  );
  return unsub;
}

/**
 * Lägg till en anpassad punkt i en befintlig kategori.
 * @param {string} companyId
 * @param {string} projectId
 * @param {{ categoryId: string, categoryName: string, categorySortOrder: number, title: string, sortOrder?: number }} opts
 * @returns {Promise<string>} new item id
 */
export async function addCustomChecklistItem(companyId, projectId, opts) {
  const ref = itemsRef(companyId, projectId);
  const docRef = await addDoc(ref, {
    categoryId: opts.categoryId,
    categoryName: opts.categoryName || 'Övrigt',
    categorySortOrder: opts.categorySortOrder ?? 999,
    templateItemId: null,
    customTitle: opts.title,
    title: opts.title,
    isMandatory: false,
    isSystemItem: false,
    isHidden: false,
    sortOrder: opts.sortOrder ?? 999,
    status: 'pending',
    isCustomItem: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/**
 * Lägg till en ny kategori med en första punkt (båda anpassade).
 * @param {string} companyId
 * @param {string} projectId
 * @param {string} categoryName
 * @param {string} firstItemTitle
 * @returns {Promise<{ categoryId: string, itemId: string }>}
 */
export async function addCustomCategoryAndItem(companyId, projectId, categoryName, firstItemTitle) {
  const categoryId = `custom-${Date.now()}`;
  const ref = itemsRef(companyId, projectId);
  const maxCatOrder = 999;
  const docRef = await addDoc(ref, {
    categoryId,
    categoryName: categoryName || 'Ny kategori',
    categorySortOrder: maxCatOrder,
    templateItemId: null,
    customTitle: firstItemTitle,
    title: firstItemTitle,
    isMandatory: false,
    isSystemItem: false,
    isHidden: false,
    sortOrder: 1,
    status: 'pending',
    isCustomItem: true,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return { categoryId, itemId: docRef.id };
}
