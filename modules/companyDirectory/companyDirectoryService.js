import {
    addDoc,
    arrayRemove,
    arrayUnion,
    collection,
    deleteDoc,
    doc,
    getDocs,
    onSnapshot,
    orderBy,
    query,
    serverTimestamp,
    updateDoc,
} from 'firebase/firestore';

import { createCompanyContact, db, fetchCompanyContacts } from '../../components/firebase';

function safeText(v) {
	if (v === null || v === undefined) return '';
	return String(v).trim();
}

function normalizeKey(value) {
	const s = safeText(value).toLowerCase();
	if (!s) return '';
	try {
		return s
			.normalize('NFD')
			.replace(/\p{Diacritic}+/gu, '')
			.replace(/\s+/g, ' ')
			.trim();
	} catch (_e) {
		return s.replace(/\s+/g, ' ').trim();
	}
}

function normalizeEmail(email) {
	return normalizeKey(email).replace(/\s+/g, '');
}

function sanitizeForFirestore(obj) {
	if (!obj || typeof obj !== 'object') return obj;
	if (Array.isArray(obj)) return obj.map(sanitizeForFirestore);
	const out = {};
	for (const [k, v] of Object.entries(obj)) {
		if (v === undefined) continue;
		out[k] = sanitizeForFirestore(v);
	}
	return out;
}

function suppliersCollectionRef(companyId) {
	return collection(db, 'foretag', companyId, 'leverantorer');
}

export function listenCompanies(companyId, onList, onError) {
	const cid = safeText(companyId);
	if (!cid) return () => {};
	const q = query(suppliersCollectionRef(cid), orderBy('companyName'));
	return onSnapshot(
		q,
		(snap) => {
			const out = [];
			snap.forEach((docSnap) => {
				const d = docSnap.data() || {};
				out.push({ ...d, id: docSnap.id });
			});
			onList?.(out);
		},
		(err) => onError?.(err),
	);
}

export async function fetchCompanies(companyId) {
	const cid = safeText(companyId);
	if (!cid) return [];
	const snap = await getDocs(query(suppliersCollectionRef(cid), orderBy('companyName')));
	const out = [];
	snap.forEach((docSnap) => {
		const d = docSnap.data() || {};
		out.push({ ...d, id: docSnap.id });
	});
	return out;
}

export async function createCompany({ companyId, role = 'supplier', company }) {
	const cid = safeText(companyId);
	if (!cid) throw new Error('Saknar företag');
	const name = safeText(company?.companyName);
	if (!name) throw new Error('Företagsnamn är obligatoriskt');

	const payload = {
		companyName: name,
		organizationNumber: safeText(company?.organizationNumber),
		address: safeText(company?.address),
		category: safeText(company?.category),
		roles: [safeText(role) || 'supplier'],
		byggdelTags: Array.isArray(company?.byggdelTags) ? company.byggdelTags.map(safeText).filter(Boolean) : [],
		contactIds: Array.isArray(company?.contactIds) ? company.contactIds.map(safeText).filter(Boolean) : [],
		createdAt: serverTimestamp(),
	};

	const docRef = await addDoc(suppliersCollectionRef(cid), sanitizeForFirestore(payload));
	return docRef.id;
}

export async function updateCompany({ companyId, id, patch }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	if (!cid || !companyIdDoc) throw new Error('Ogiltigt id');

	const safePatch = patch && typeof patch === 'object' ? { ...patch } : {};
	if (Object.prototype.hasOwnProperty.call(safePatch, 'companyName')) {
		const name = safeText(safePatch.companyName);
		if (!name) throw new Error('Företagsnamn är obligatoriskt');
		safePatch.companyName = name;
	}
	if (Object.prototype.hasOwnProperty.call(safePatch, 'organizationNumber')) safePatch.organizationNumber = safeText(safePatch.organizationNumber);
	if (Object.prototype.hasOwnProperty.call(safePatch, 'address')) safePatch.address = safeText(safePatch.address);
	if (Object.prototype.hasOwnProperty.call(safePatch, 'category')) safePatch.category = safeText(safePatch.category);
	if (Object.prototype.hasOwnProperty.call(safePatch, 'roles')) {
		const roles = Array.isArray(safePatch.roles) ? safePatch.roles.map(safeText).filter(Boolean) : [];
		safePatch.roles = roles.length ? roles : ['supplier'];
	}
	if (Object.prototype.hasOwnProperty.call(safePatch, 'byggdelTags')) {
		safePatch.byggdelTags = Array.isArray(safePatch.byggdelTags) ? safePatch.byggdelTags.map(safeText).filter(Boolean) : [];
	}
	if (Object.prototype.hasOwnProperty.call(safePatch, 'contactIds')) {
		safePatch.contactIds = Array.isArray(safePatch.contactIds) ? safePatch.contactIds.map(safeText).filter(Boolean) : [];
	}
	// Remove legacy VAT field if present in patches.
	if (Object.prototype.hasOwnProperty.call(safePatch, 'vatNumber')) delete safePatch.vatNumber;

	safePatch.updatedAt = serverTimestamp();
	await updateDoc(doc(suppliersCollectionRef(cid), companyIdDoc), sanitizeForFirestore(safePatch));
	return true;
}

export async function deleteCompany({ companyId, id }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	if (!cid || !companyIdDoc) throw new Error('Ogiltigt id');
	await deleteDoc(doc(suppliersCollectionRef(cid), companyIdDoc));
	return true;
}

export async function addCompanyByggdelTag({ companyId, id, tag }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	const t = safeText(tag);
	if (!cid || !companyIdDoc || !t) return false;
	await updateDoc(doc(suppliersCollectionRef(cid), companyIdDoc), { byggdelTags: arrayUnion(t), updatedAt: serverTimestamp() });
	return true;
}

export async function removeCompanyByggdelTag({ companyId, id, tag }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	const t = safeText(tag);
	if (!cid || !companyIdDoc || !t) return false;
	await updateDoc(doc(suppliersCollectionRef(cid), companyIdDoc), { byggdelTags: arrayRemove(t), updatedAt: serverTimestamp() });
	return true;
}

export async function linkContactToCompany({ companyId, id, contactId }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	const contact = safeText(contactId);
	if (!cid || !companyIdDoc || !contact) return false;
	await updateDoc(doc(suppliersCollectionRef(cid), companyIdDoc), { contactIds: arrayUnion(contact), updatedAt: serverTimestamp() });
	return true;
}

export async function unlinkContactFromCompany({ companyId, id, contactId }) {
	const cid = safeText(companyId);
	const companyIdDoc = safeText(id);
	const contact = safeText(contactId);
	if (!cid || !companyIdDoc || !contact) return false;
	await updateDoc(doc(suppliersCollectionRef(cid), companyIdDoc), { contactIds: arrayRemove(contact), updatedAt: serverTimestamp() });
	return true;
}

export function findExistingContact(contacts, { name, email, phone, contactCompanyName }) {
	const list = Array.isArray(contacts) ? contacts : [];
	const emailKey = normalizeEmail(email);
	if (emailKey) {
		const hit = list.find((c) => normalizeEmail(c?.email) === emailKey);
		if (hit) return hit;
	}

	const nameKey = normalizeKey(name);
	const phoneKey = normalizeKey(phone);
	const companyKey = normalizeKey(contactCompanyName);
	if (!nameKey) return null;
	return list.find((c) => {
		const cn = normalizeKey(c?.contactCompanyName);
		const nn = normalizeKey(c?.name);
		const pn = normalizeKey(c?.phone);
		if (companyKey && cn && cn !== companyKey) return false;
		if (nn !== nameKey) return false;
		if (phoneKey && pn && pn !== phoneKey) return false;
		return true;
	});
}

export async function upsertContactInRegistry({ companyId, existingContacts, contact, contactCompanyName }) {
	const cid = safeText(companyId);
	if (!cid) throw new Error('Saknar företag');
	const name = safeText(contact?.name);
	if (!name) throw new Error('Namn är obligatoriskt');

	let contacts = Array.isArray(existingContacts) ? existingContacts : null;
	if (!contacts) contacts = await fetchCompanyContacts(cid);

	const hit = findExistingContact(contacts, {
		name,
		email: safeText(contact?.email),
		phone: safeText(contact?.phone),
		contactCompanyName: safeText(contactCompanyName),
	});
	if (hit) return { id: safeText(hit?.id), contact: hit, created: false, contacts };

	const createdId = await createCompanyContact({
		name,
		companyName: '',
		contactCompanyName: safeText(contactCompanyName),
		role: safeText(contact?.role),
		phone: safeText(contact?.phone),
		email: safeText(contact?.email),
	}, cid);

	const created = {
		id: createdId,
		name,
		companyName: '',
		contactCompanyName: safeText(contactCompanyName),
		role: safeText(contact?.role),
		phone: safeText(contact?.phone),
		email: safeText(contact?.email),
	};
	return { id: createdId, contact: created, created: true, contacts: [...contacts, created] };
}
