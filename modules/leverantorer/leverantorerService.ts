/**
 * Leverantörsmodul – service för leverantörer, byggdelar och kontaktpersoner.
 * Använder firebase (foretag/{companyId}/leverantorer, kontakter) och companyDirectoryService.
 */

import {
  createCompanySupplier,
  deleteCompanySupplier,
  fetchByggdelMallar,
  fetchCompanyContacts,
  fetchCompanySuppliers,
  updateCompanyContact,
  updateCompanySupplier,
} from '../../components/firebase';
import {
  addCompanyByggdelTag,
  linkContactToCompany,
  removeCompanyByggdelTag,
  unlinkContactFromCompany,
  updateCompany,
  upsertContactInRegistry,
} from '../companyDirectory/companyDirectoryService';

export type Supplier = {
  id: string;
  companyName: string;
  organizationNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  category?: string;
  categories?: string[];
  byggdelTags?: string[];
  contactIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ByggdelMall = {
  id: string;
  huvudgrupp?: string;
  moment?: string;
  name?: string;
};

export type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  contactCompanyName?: string;
  linkedSupplierId?: string | null;
  companyId?: string | null;
  companyType?: 'supplier' | 'customer' | null;
};

function safeCompanyId(companyId: string | undefined | null): string {
  const cid = String(companyId ?? '').trim();
  if (!cid) throw new Error('Saknar företag');
  return cid;
}

export async function fetchSuppliers(companyId: string | undefined | null): Promise<Supplier[]> {
  const cid = safeCompanyId(companyId);
  const list = await fetchCompanySuppliers(cid);
  return (list || []) as Supplier[];
}

export async function createSupplier(
  companyId: string | undefined | null,
  data: {
    companyName: string;
    organizationNumber?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    category?: string;
    categories?: string[];
    byggdelTags?: string[];
    contactIds?: string[];
  }
): Promise<string> {
  const cid = safeCompanyId(companyId);
  const name = String(data.companyName ?? '').trim();
  if (!name) throw new Error('Företagsnamn är obligatoriskt.');
  return createCompanySupplier(
    {
      companyName: name,
      organizationNumber: data.organizationNumber ?? '',
      address: data.address ?? '',
      postalCode: data.postalCode ?? '',
      city: data.city ?? '',
      category: data.category ?? '',
      categories: data.categories,
      byggdelTags: data.byggdelTags,
      contactIds: data.contactIds,
    },
    cid
  );
}

export async function updateSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  patch: Partial<{
    companyName: string;
    organizationNumber: string;
    address: string;
    postalCode: string;
    city: string;
    category: string;
    categories: string[];
    byggdelTags: string[];
    contactIds: string[];
  }>
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(supplierId ?? '').trim();
  if (!id) throw new Error('Ogiltigt leverantörsid');
  await updateCompanySupplier({ id, patch }, cid);
}

export async function deleteSupplier(
  companyId: string | undefined | null,
  supplierId: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(supplierId ?? '').trim();
  if (!id) throw new Error('Ogiltigt leverantörsid');
  await deleteCompanySupplier({ id }, cid);
}

export async function fetchByggdelar(companyId: string | undefined | null): Promise<ByggdelMall[]> {
  const cid = safeCompanyId(companyId);
  const list = await fetchByggdelMallar(cid);
  return (list || []) as ByggdelMall[];
}

/** Lägg till en byggdel-tagg på leverantören (rekommendation). */
export async function addByggdelToSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  tag: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(supplierId ?? '').trim();
  const t = String(tag ?? '').trim();
  if (!id || !t) return;
  await addCompanyByggdelTag({ companyId: cid, id, tag: t });
}

/** Ta bort en byggdel-tagg från leverantören. */
export async function removeByggdelFromSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  tag: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(supplierId ?? '').trim();
  const t = String(tag ?? '').trim();
  if (!id || !t) return;
  await removeCompanyByggdelTag({ companyId: cid, id, tag: t });
}

export async function fetchContacts(companyId: string | undefined | null): Promise<Contact[]> {
  const cid = safeCompanyId(companyId);
  const list = await fetchCompanyContacts(cid);
  return (list || []) as Contact[];
}

/**
 * Skapa eller hitta kontakt i Kontaktregistret och koppla till leverantör.
 * Samma kontaktpost återanvänds (ingen dubbel lagring).
 */
export async function addContactToSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  supplierCompanyName: string,
  contact: { name: string; email?: string; phone?: string; role?: string }
): Promise<{ contactId: string; created: boolean }> {
  const cid = safeCompanyId(companyId);
  const id = String(supplierId ?? '').trim();
  if (!id) throw new Error('Ogiltigt leverantörsid');
  const existingContacts = await fetchCompanyContacts(cid);
  const result = await upsertContactInRegistry({
    companyId: cid,
    existingContacts,
    contact: {
      name: contact.name,
      email: contact.email ?? '',
      phone: contact.phone ?? '',
      role: contact.role ?? '',
    },
    contactCompanyName: supplierCompanyName,
    linkedSupplierId: supplierId,
  });
  if (result.id) {
    const patch: Record<string, unknown> = {
      companyId: supplierId,
      companyType: 'supplier',
      customerId: null,
      contactCompanyName: supplierCompanyName,
      linkedSupplierId: supplierId,
    };
    if (contact.role?.trim()) patch.role = contact.role.trim();
    if (contact.phone?.trim()) patch.phone = contact.phone.trim();
    if (contact.email?.trim()) patch.email = contact.email.trim();
    await updateCompanyContact({ id: result.id, patch }, cid);
    await linkContactToCompany({ companyId: cid, id: supplierId, contactId: result.id });
  }
  return { contactId: result.id, created: result.created };
}

/**
 * Koppla befintlig kontakt till leverantör (ingen ny kontakt skapas).
 */
export async function linkExistingContactToSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  contactId: string,
  patch?: { role?: string; phone?: string; email?: string; contactCompanyName?: string }
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const sid = String(supplierId ?? '').trim();
  const cidContact = String(contactId ?? '').trim();
  if (!sid || !cidContact) return;
  const nextPatch: Record<string, unknown> = {
    linkedSupplierId: sid,
    companyId: sid,
    companyType: 'supplier',
    customerId: null,
  };
  if (patch?.contactCompanyName) nextPatch.contactCompanyName = patch.contactCompanyName;
  if (patch?.role?.trim()) nextPatch.role = patch.role.trim();
  if (patch?.phone?.trim()) nextPatch.phone = patch.phone.trim();
  if (patch?.email?.trim()) nextPatch.email = patch.email.trim();
  await updateCompanyContact({ id: cidContact, patch: nextPatch }, cid);
  await linkContactToCompany({ companyId: cid, id: sid, contactId: cidContact });
}

/** Koppla bort en befintlig kontakt från leverantören (kontakten finns kvar i registret). */
export async function removeContactFromSupplier(
  companyId: string | undefined | null,
  supplierId: string,
  contactId: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const sid = String(supplierId ?? '').trim();
  const cid2 = String(contactId ?? '').trim();
  if (!sid || !cid2) return;
  await unlinkContactFromCompany({ companyId: cid, id: sid, contactId: cid2 });
  try {
    await updateCompanyContact({ id: cid2, patch: { linkedSupplierId: null } }, cid);
  } catch (_e) {}
}
