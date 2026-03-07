import {
    addDoc,
    collection,
    deleteDoc,
    doc,
    getDoc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    setDoc,
    where,
    writeBatch,
} from 'firebase/firestore';

import { auth, db } from '../../../components/firebase';

function requireIds(companyId, projectId) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  if (!cid || !pid) throw new Error('companyId and projectId are required');
  return { cid, pid };
}

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function nowUserMeta() {
  const user = auth?.currentUser || null;
  const uid = user?.uid || null;
  const name = safeText(user?.displayName || user?.email) || null;
  return { uid, name };
}

function toNrNumeric(nr) {
  const s = safeText(nr);
  const n = Number.parseInt(s, 10);
  return Number.isFinite(n) ? n : null;
}

function makeRowDocId(type, sourceId) {
  const t = safeText(type).replace(/[^a-z0-9_\-]+/gi, '_');
  const sid = safeText(sourceId).replace(/[\/\\]/g, '_').replace(/\s+/g, '_');
  if (!t || !sid) return null;
  return `${t}__${sid}`;
}

function withFsContext(message, err, ctx) {
  const base = safeText(message) || 'Firestore error';
  const raw = err?.message ? String(err.message) : String(err || '');
  let suffix = '';
  try {
    const safeCtx = ctx && typeof ctx === 'object' ? ctx : null;
    suffix = safeCtx ? ` [ctx=${JSON.stringify(safeCtx)}]` : '';
  } catch (_e) {
    suffix = '';
  }
  const e = new Error(`${base}: ${raw}${suffix}`);
  e.cause = err;
  return e;
}

export const INKOPSPLAN_EMAIL_TEMPLATE_VARIABLES = [
  { token: '{{project_number}}', label: 'Projektnummer' },
  { token: '{{project_name}}', label: 'Projektnamn' },
  { token: '{{bd_name}}', label: 'Byggdelens namn' },
  { token: '{{company_name}}', label: 'Företagsnamn' },
  { token: '{{contact_name}}', label: 'Kontaktens namn' },
];

function safeString(v) {
  return String(v ?? '');
}

function normalizeVarKey(token) {
  return safeString(token).trim();
}

export function applyEmailTemplateVariables(text, vars = {}) {
  let out = safeString(text);
  for (const [key, value] of Object.entries(vars || {})) {
    const rawKey = normalizeVarKey(key);
    if (!rawKey) continue;
    const token = rawKey.includes('{{') ? rawKey : `{{${rawKey}}}`;
    out = out.split(token).join(safeString(value ?? ''));
  }
  return out;
}

function emailTemplateDocRef(companyId, projectId, templateId) {
  return doc(
    db,
    'foretag',
    companyId,
    'projects',
    projectId,
    'inkopsplanEmailTemplates',
    templateId,
  );
}

export async function ensureDefaultInkopsplanEmailTemplate(companyId, projectId) {
  if (!companyId || !projectId) return;
  const ref = emailTemplateDocRef(companyId, projectId, 'default');
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    throw withFsContext('Kunde inte läsa mailmall (default)', e, { path: ref?.path, companyId, projectId });
  }
  if (snap.exists()) return;

  try {
    await setDoc(ref, {
      name: 'Standardmall',
      subject: 'Förfrågan {{bd_name}} – {{project_number}}',
      body:
        'Hej {{contact_name}},\n\nVi vill be om offert på {{bd_name}} till projekt {{project_name}} ({{project_number}}).\n\nMed vänliga hälsningar\n{{company_name}}',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (e) {
    throw withFsContext('Kunde inte skapa standard-mailmall', e, { path: ref?.path, companyId, projectId });
  }
}

export function listenInkopsplanEmailTemplate(companyId, projectId, templateId, onData, onError) {
  if (!companyId || !projectId || !templateId) {
    onData?.(null);
    return () => {};
  }

  const ref = emailTemplateDocRef(companyId, projectId, templateId);
  return onSnapshot(
    ref,
    (snap) => {
      onData?.(snap.exists() ? { id: snap.id, ...snap.data() } : null);
    },
    (err) => {
      onError?.(withFsContext('Kunde inte lyssna på mailmall', err, { path: ref?.path, companyId, projectId, templateId }));
    },
  );
}

export async function listInkopsplanEmailTemplates(companyId, projectId) {
  if (!companyId || !projectId) return [];
  const c = collection(db, 'foretag', companyId, 'projects', projectId, 'inkopsplanEmailTemplates');
  const q = query(c, orderBy('name'));
  try {
    const snap = await getDocs(q);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() || {}) }));
  } catch (e) {
    throw withFsContext('Kunde inte lista mailmallar', e, { companyId, projectId, path: c?.path });
  }
}

export async function saveInkopsplanEmailTemplate({ companyId, projectId, templateId, subject, body, name }) {
  if (!companyId || !projectId || !templateId) {
    throw new Error('Missing companyId/projectId/templateId');
  }
  const ref = emailTemplateDocRef(companyId, projectId, templateId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    throw withFsContext('Kunde inte läsa mailmall innan spar', e, { path: ref?.path, companyId, projectId, templateId });
  }
  const payload = {
    ...(name != null ? { name: safeString(name) } : {}),
    subject: safeString(subject),
    body: safeString(body),
    updatedAt: serverTimestamp(),
  };
  try {
    await setDoc(ref, snap.exists() ? payload : { ...payload, createdAt: serverTimestamp() }, { merge: true });
  } catch (e) {
    throw withFsContext('Kunde inte spara mailmall', e, { path: ref?.path, companyId, projectId, templateId });
  }
}

export async function setInkopsplanRowEmailTemplateId({ companyId, projectId, rowId, emailTemplateId }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  if (!rid) throw new Error('rowId is required');

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);
  const { uid, name } = nowUserMeta();

  try {
    await setDoc(
      rowRef,
      {
        emailTemplateId: safeText(emailTemplateId) || null,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
        updatedByName: name,
      },
      { merge: true },
    );
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte spara mailmall på rad', e, {
      companyId: cid,
      projectId: pid,
      rowId: rid,
      path: rowRef?.path,
    });
  }
}

export const INKOPSPLAN_ROW_STATUS = {
  UTKAST: 'utkast',
  PAGAAR: 'pågår',
  SKICKAD: 'skickad',
  KLAR: 'klar',
};

export const INKOPSPLAN_ROW_TYPE = {
  MANUAL: 'manual',
  BUILDING_PART: 'building_part',
  ACCOUNT: 'account',
  CATEGORY: 'category',
};

export const INKOPSPLAN_SUPPLIER_REQUEST_STATUS = {
  EJ_SKICKAD: 'ej_skickad',
  SKICKAD: 'skickad',
  SVAR_MOTTAGET: 'svar_mottaget',
};

function normalizePartyKey(party) {
  const existing = safeText(party?.key);
  if (existing) return existing;
  const t = safeText(party?.registryType);
  const id = safeText(party?.registryId || party?.id);
  if (t && id) return `${t}:${id}`;
  return safeText(party?.id) || safeText(party?.companyName) || safeText(party?.name) || '';
}

export async function fetchCompanyPartiesForInkopsplan(companyId) {
  const cid = safeText(companyId);
  if (!cid) return [];

  try {
    const suppliersSnap = await getDocs(collection(db, 'foretag', cid, 'leverantorer'));
    const suppliers = suppliersSnap.docs.map((d) => {
      const data = d.data() || {};
      const registryId = d.id;
      const companyName = safeText(data?.companyName) || 'Leverantör';
      return {
        key: `supplier:${registryId}`,
        registryType: 'supplier',
        registryId,
        companyName,
        category: safeText(data?.category) || null,
        companyId: safeText(data?.companyId) || null,
      };
    });

    const customersSnap = await getDocs(collection(db, 'foretag', cid, 'kunder'));
    const customers = customersSnap.docs.map((d) => {
      const data = d.data() || {};
      const registryId = d.id;
      const companyName = safeText(data?.name) || 'Kund';
      return {
        key: `customer:${registryId}`,
        registryType: 'customer',
        registryId,
        companyName,
        category: safeText(data?.customerType) || null,
        companyId: safeText(data?.companyId) || null,
      };
    });

    const all = [...suppliers, ...customers];
    all.sort((a, b) => safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'));
    return all;
  } catch (e) {
    throw withFsContext('Kunde inte läsa kund/leverantörsregister', e, { companyId: cid });
  }
}

export async function fetchCompanySuppliersForInkopsplan(companyId) {
  const cid = safeText(companyId);
  if (!cid) return [];

  try {
    const suppliersSnap = await getDocs(collection(db, 'foretag', cid, 'leverantorer'));
    const suppliers = suppliersSnap.docs.map((d) => {
      const data = d.data() || {};
      const registryId = d.id;
      const companyName = safeText(data?.companyName) || 'Leverantör';
      return {
        key: `supplier:${registryId}`,
        registryType: 'supplier',
        registryId,
        companyName,
        category: safeText(data?.category) || null,
        companyId: safeText(data?.companyId) || null,
      };
    });

    suppliers.sort((a, b) => safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'));
    return suppliers;
  } catch (e) {
    throw withFsContext('Kunde inte läsa leverantörsregister', e, { companyId: cid });
  }
}

export async function fetchSupplierContactsForInkopsplan({ companyId, supplierRegistryId, supplierCompanyId = null }) {
  const cid = safeText(companyId);
  const sid = safeText(supplierRegistryId);
  const scid = safeText(supplierCompanyId) || null;
  if (!cid || !sid) return [];

  const contactsCol = collection(db, 'foretag', cid, 'kontakter');

  const normalize = (c, id) => {
    const mobile = safeText(c?.phone);
    const workPhone = safeText(c?.workPhone);
    return {
      id: safeText(id) || safeText(c?.id) || null,
      name: safeText(c?.name) || null,
      role: safeText(c?.role) || null,
      mobile: mobile || null,
      phone: workPhone || null,
      email: safeText(c?.email) || null,
      linkedSupplierId: safeText(c?.linkedSupplierId) || null,
      companyId: safeText(c?.companyId) || null,
    };
  };

  try {
    const byLink = query(contactsCol, where('linkedSupplierId', '==', sid));
    const snap1 = await getDocs(byLink);
    const out = [];
    snap1.forEach((d) => out.push(normalize(d.data() || {}, d.id)));

    if (out.length === 0 && scid) {
      const byCompany = query(contactsCol, where('companyId', '==', scid));
      const snap2 = await getDocs(byCompany);
      snap2.forEach((d) => out.push(normalize(d.data() || {}, d.id)));
    }

    const uniq = new Map();
    out.forEach((c) => {
      const key = safeText(c?.id) || `${safeText(c?.name)}|${safeText(c?.email)}|${safeText(c?.mobile)}|${safeText(c?.phone)}`;
      if (!key) return;
      if (!uniq.has(key)) uniq.set(key, c);
    });

    const list = Array.from(uniq.values());
    list.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv'));
    return list;
  } catch (e) {
    throw withFsContext('Kunde inte läsa kontaktregister för leverantör', e, { companyId: cid, supplierRegistryId: sid, supplierCompanyId: scid });
  }
}

export async function addInkopsplanRowSupplier({ companyId, projectId, rowId, party }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  if (!rid) throw new Error('rowId is required');

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);

  let snap;
  try {
    snap = await getDoc(rowRef);
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte läsa rad', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }
  const current = snap.exists() ? (snap.data() || {}) : {};
  const list = Array.isArray(current?.suppliers) ? current.suppliers : [];

  const key = normalizePartyKey(party);
  const companyName = safeText(party?.companyName || party?.name);
  if (!key || !companyName) throw new Error('Ogiltig leverantör/kund');

  const nextItem = {
    key,
    registryType: safeText(party?.registryType) || null,
    registryId: safeText(party?.registryId) || null,
    companyName,
    companyId: safeText(party?.companyId) || null,
    category: safeText(party?.category) || null,
    // Optional: chosen contact from central contact registry
    contactId: safeText(party?.contactId) || null,
    contactName: safeText(party?.contactName) || null,
    mobile: safeText(party?.mobile) || null,
    phone: safeText(party?.phone) || null,
    email: safeText(party?.email) || null,
    requestStatus: INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD,
    requestSentAt: null,
    quoteReceivedAt: null,
  };

  const exists = list.some((s) => normalizePartyKey(s) === key);
  const nextSuppliers = exists ? list : [...list, nextItem];
  const { uid, name } = nowUserMeta();

  try {
    await setDoc(
      rowRef,
      {
        suppliers: nextSuppliers,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
        updatedByName: name,
      },
      { merge: true },
    );
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte lägga till leverantör', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }
}

function normalizeSupplierRequestStatus(status) {
  const s = safeText(status).toLowerCase();
  if (s === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET) return INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET;
  if (s === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD) return INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;
  return INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;
}

async function patchInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey, patch }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  const key = safeText(supplierKey);
  if (!rid || !key) throw new Error('rowId and supplierKey are required');

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);

  let snap;
  try {
    snap = await getDoc(rowRef);
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte läsa rad (leverantör patch)', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }

  const current = snap.exists() ? (snap.data() || {}) : {};
  const list = Array.isArray(current?.suppliers) ? current.suppliers : [];
  const idx = list.findIndex((s) => normalizePartyKey(s) === key);
  if (idx < 0) return;

  const next = [...list];
  next[idx] = {
    ...(next[idx] && typeof next[idx] === 'object' ? next[idx] : {}),
    ...(patch && typeof patch === 'object' ? patch : {}),
  };

  const { uid, name } = nowUserMeta();
  try {
    await setDoc(
      rowRef,
      {
        suppliers: next,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
        updatedByName: name,
      },
      { merge: true },
    );
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte uppdatera leverantör på rad', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid, supplierKey: key });
  }
}

export async function setInkopsplanRowSupplierRequestStatus({ companyId, projectId, rowId, supplierKey, requestStatus }) {
  const status = normalizeSupplierRequestStatus(requestStatus);
  const patch = { requestStatus: status };
  if (status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD) {
    patch.requestSentAt = null;
    patch.quoteReceivedAt = null;
  }
  if (status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD) {
    patch.requestSentAt = serverTimestamp();
    patch.quoteReceivedAt = null;
  }
  if (status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET) {
    patch.requestSentAt = serverTimestamp();
    patch.quoteReceivedAt = serverTimestamp();
  }
  await patchInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey, patch });
}

export async function markInkopsplanRowSupplierRequestSent({ companyId, projectId, rowId, supplierKey }) {
  await patchInkopsplanRowSupplier({
    companyId,
    projectId,
    rowId,
    supplierKey,
    patch: {
      requestStatus: INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD,
      requestSentAt: serverTimestamp(),
      quoteReceivedAt: null,
    },
  });
}

export async function markInkopsplanRowSupplierQuoteReceived({ companyId, projectId, rowId, supplierKey }) {
  await patchInkopsplanRowSupplier({
    companyId,
    projectId,
    rowId,
    supplierKey,
    patch: {
      requestStatus: INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET,
      requestSentAt: serverTimestamp(),
      quoteReceivedAt: serverTimestamp(),
    },
  });
}

export async function resetInkopsplanRowSupplierRequest({ companyId, projectId, rowId, supplierKey }) {
  await patchInkopsplanRowSupplier({
    companyId,
    projectId,
    rowId,
    supplierKey,
    patch: {
      requestStatus: INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD,
      requestSentAt: null,
      quoteReceivedAt: null,
    },
  });
}

/** Sätter personlig AI-förfrågetext för en leverantör på en rad. */
export async function setInkopsplanRowSupplierPersonalizedInquiry({ companyId, projectId, rowId, supplierKey, personalizedInquiryText }) {
  await patchInkopsplanRowSupplier({
    companyId,
    projectId,
    rowId,
    supplierKey,
    patch: {
      personalizedInquiryText: personalizedInquiryText != null ? String(personalizedInquiryText) : null,
    },
  });
}

export async function removeInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  const key = safeText(supplierKey);
  if (!rid || !key) return;

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);

  let snap;
  try {
    snap = await getDoc(rowRef);
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte läsa rad', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }
  const current = snap.exists() ? (snap.data() || {}) : {};
  const list = Array.isArray(current?.suppliers) ? current.suppliers : [];
  const nextSuppliers = list.filter((s) => normalizePartyKey(s) !== key);
  const { uid, name } = nowUserMeta();

  try {
    await setDoc(
      rowRef,
      {
        suppliers: nextSuppliers,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
        updatedByName: name,
      },
      { merge: true },
    );
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte ta bort leverantör', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }
}

export function getInkopsplanDocRef(companyId, projectId) {
  const { cid, pid } = requireIds(companyId, projectId);
  // Projects/{pid}/inkopsplan/inkopsplan is a doc.
  return doc(db, 'foretag', cid, 'projects', pid, 'inkopsplan', 'inkopsplan');
}

export function getInkopsplanRowsCollectionRef(companyId, projectId) {
  const ref = getInkopsplanDocRef(companyId, projectId);
  return collection(ref, 'rows');
}

export async function deleteInkopsplanRow({ companyId, projectId, rowId }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  if (!rid) throw new Error('rowId is required');

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);

  try {
    await deleteDoc(rowRef);
  } catch (e) {
    throw withFsContext('Kunde inte radera inköpsrad', e, { path: rowRef?.path, companyId: cid, projectId: pid, rowId: rid });
  }
}

export function listenInkopsplanDoc(companyId, projectId, onDoc, onError) {
  const ref = getInkopsplanDocRef(companyId, projectId);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap.exists() ? snap.data() : null;
      if (typeof onDoc === 'function') onDoc(data ? { id: snap.id, ...data } : null);
    },
    (err) => {
      if (typeof onError === 'function') onError(err);
    },
  );
}

export function listenInkopsplanRows(companyId, projectId, onItems, onError) {
  const colRef = getInkopsplanRowsCollectionRef(companyId, projectId);
  // NOTE: Avoid compound orderBy that may require a composite index.
  // We only need a stable ordering; createdAt exists on all rows we create.
  const q = query(colRef, orderBy('createdAt', 'asc'));

  return onSnapshot(
    q,
    (snap) => {
      const items = [];
      snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
      if (typeof onItems === 'function') onItems(items);
    },
    (err) => {
      try {
        console.error('[inkopsplan] listenInkopsplanRows error:', err);
      } catch (_e) {}
      if (typeof onError === 'function') onError(err);
    },
  );
}

export async function ensureInkopsplanDocExists(companyId, projectId, patch) {
  const ref = getInkopsplanDocRef(companyId, projectId);
  let snap;
  try {
    snap = await getDoc(ref);
  } catch (e) {
    throw withFsContext('Kunde inte läsa inköpsplan-dokumentet', e, { path: ref?.path, companyId, projectId });
  }
  const { uid, name } = nowUserMeta();
  if (snap.exists()) {
    if (patch && typeof patch === 'object' && Object.keys(patch).length) {
      try {
        await setDoc(ref, { ...patch, updatedAt: serverTimestamp(), updatedByUid: uid, updatedByName: name }, { merge: true });
      } catch (e) {
        throw withFsContext('Kunde inte uppdatera inköpsplan-dokumentet', e, { path: ref?.path, companyId, projectId });
      }
    }
    return;
  }

  const payload = {
    createdAt: serverTimestamp(),
    createdByUid: uid,
    createdByName: name,
    updatedAt: serverTimestamp(),
    updatedByUid: uid,
    updatedByName: name,
    ...(patch && typeof patch === 'object' ? patch : {}),
  };

  try {
    await setDoc(ref, payload, { merge: false });
  } catch (e) {
    throw withFsContext('Kunde inte skapa inköpsplan-dokumentet', e, { path: ref?.path, companyId, projectId });
  }
}

function buildRowPayloadFromRegisterItem({ projectId, type, item }) {
  const pid = safeText(projectId) || null;
  const sourceId = safeText(item?.id) || null;

  if (type === INKOPSPLAN_ROW_TYPE.BUILDING_PART) {
    const nr = safeText(item?.code);
    const name = safeText(item?.name) || 'Byggdel';
    return {
      projectId: pid,
      nr: nr || null,
      nrNumeric: toNrNumeric(nr),
      name,
      type,
      sourceId,
    };
  }

  if (type === INKOPSPLAN_ROW_TYPE.ACCOUNT) {
    const nr = safeText(item?.konto);
    const name = safeText(item?.benamning) || 'Konto';
    return {
      projectId: pid,
      nr: nr || null,
      nrNumeric: toNrNumeric(nr),
      name,
      type,
      sourceId,
    };
  }

  if (type === INKOPSPLAN_ROW_TYPE.CATEGORY) {
    const name = safeText(item?.name) || 'Kategori';
    return {
      projectId: pid,
      nr: null,
      nrNumeric: null,
      name,
      type,
      sourceId,
    };
  }

  throw new Error('Unsupported register type');
}

export async function addRowsFromRegister({ companyId, projectId, registerType, items }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const type = safeText(registerType);
  if (!Object.values(INKOPSPLAN_ROW_TYPE).includes(type) || type === INKOPSPLAN_ROW_TYPE.MANUAL) {
    throw new Error('Invalid registerType');
  }

  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return;

  try {
    await ensureInkopsplanDocExists(cid, pid, { sourceType: type });
  } catch (e) {
    throw withFsContext('Inköpsplan: misslyckades att initiera dokument', e, { companyId: cid, projectId: pid });
  }

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const batch = writeBatch(db);

  const { uid, name } = nowUserMeta();

  list.forEach((item) => {
    const sourceId = safeText(item?.id);
    if (!sourceId) return;

    const rowId = makeRowDocId(type, sourceId);
    const rowRef = rowId ? doc(rowsCol, rowId) : doc(rowsCol);

    const base = buildRowPayloadFromRegisterItem({ projectId: pid, type, item });

    batch.set(
      rowRef,
      {
        ...base,
        status: INKOPSPLAN_ROW_STATUS.UTKAST,
        suppliers: [],
        emailTemplateId: null,
        requestSentAt: null,
        responses: [],
        createdAt: serverTimestamp(),
        createdByUid: uid,
        createdByName: name,
        updatedAt: serverTimestamp(),
        updatedByUid: uid,
        updatedByName: name,
      },
      { merge: true },
    );
  });

  try {
    await batch.commit();
  } catch (e) {
    throw withFsContext('Inköpsplan: misslyckades att spara rader', e, {
      companyId: cid,
      projectId: pid,
      rowsPath: rowsCol?.path,
      rowCount: list.length,
    });
  }
}

export async function addManualRow({ companyId, projectId, nr, name, manualTypeLabel = null }) {
  const { cid, pid } = requireIds(companyId, projectId);
  const n = safeText(name);
  if (!n) throw new Error('Benämning är obligatoriskt');

  try {
    await ensureInkopsplanDocExists(cid, pid, {});
  } catch (e) {
    throw withFsContext('Inköpsplan: misslyckades att initiera dokument (manuell rad)', e, { companyId: cid, projectId: pid });
  }

  const colRef = getInkopsplanRowsCollectionRef(cid, pid);
  const { uid, name: userName } = nowUserMeta();

  try {
    await addDoc(colRef, {
      projectId: pid,
      nr: safeText(nr) || null,
      nrNumeric: toNrNumeric(nr),
      name: n,
      type: INKOPSPLAN_ROW_TYPE.MANUAL,
      sourceId: null,
      manualTypeLabel: safeText(manualTypeLabel) || null,
      status: INKOPSPLAN_ROW_STATUS.UTKAST,
      suppliers: [],
      emailTemplateId: null,
      requestSentAt: null,
      responses: [],
      createdAt: serverTimestamp(),
      createdByUid: uid,
      createdByName: userName,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
      updatedByName: userName,
    });
  } catch (e) {
    throw withFsContext('Inköpsplan: misslyckades att spara manuell rad', e, { companyId: cid, projectId: pid, rowsPath: colRef?.path });
  }
}

/**
 * Uppdaterar fält på en inköpsplanrad (t.ex. nr, name). Merge med befintlig rad.
 */
export async function updateInkopsplanRowFields(companyId, projectId, rowId, patch) {
  const { cid, pid } = requireIds(companyId, projectId);
  const rid = safeText(rowId);
  if (!rid) throw new Error('rowId är obligatoriskt');

  const rowsCol = getInkopsplanRowsCollectionRef(cid, pid);
  const rowRef = doc(rowsCol, rid);
  const { uid, name: userName } = nowUserMeta();

  const payload = { updatedAt: serverTimestamp(), updatedByUid: uid, updatedByName: userName };
  if (patch && typeof patch === 'object') {
    if (Object.prototype.hasOwnProperty.call(patch, 'nr')) {
      payload.nr = safeText(patch.nr) || null;
      payload.nrNumeric = toNrNumeric(patch.nr);
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'name')) {
      payload.name = safeText(patch.name) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedAccountId')) {
      payload.linkedAccountId = safeText(patch.linkedAccountId) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedAccountKonto')) {
      payload.linkedAccountKonto = safeText(patch.linkedAccountKonto) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedAccountBenamning')) {
      payload.linkedAccountBenamning = safeText(patch.linkedAccountBenamning) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedCategoryId')) {
      payload.linkedCategoryId = safeText(patch.linkedCategoryId) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedCategoryName')) {
      payload.linkedCategoryName = safeText(patch.linkedCategoryName) || null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedCategoryIds')) {
      const arr = Array.isArray(patch.linkedCategoryIds) ? patch.linkedCategoryIds.map((id) => safeText(id)).filter(Boolean) : [];
      payload.linkedCategoryIds = arr;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'linkedCategoryNames')) {
      const arr = Array.isArray(patch.linkedCategoryNames) ? patch.linkedCategoryNames.map((n) => safeText(n)).filter(Boolean) : [];
      payload.linkedCategoryNames = arr;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'responsibleId')) {
      payload.responsibleId = patch.responsibleId != null ? safeText(patch.responsibleId) || null : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'responsibleName')) {
      payload.responsibleName = patch.responsibleName != null ? safeText(patch.responsibleName) || null : null;
    }
    if (Object.prototype.hasOwnProperty.call(patch, 'inquiryDraftText')) {
      payload.inquiryDraftText = patch.inquiryDraftText != null ? String(patch.inquiryDraftText) : null;
    }
  }

  if (Object.keys(payload).length <= 3) return;

  try {
    await setDoc(rowRef, payload, { merge: true });
  } catch (e) {
    throw withFsContext('Inköpsplan: kunde inte uppdatera rad', e, { companyId: cid, projectId: pid, rowId: rid });
  }
}
