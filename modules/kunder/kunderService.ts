/**
 * Kundmodul – service för kunder och kontaktpersoner.
 */

import {
  createCompanyCustomer,
  deleteCompanyCustomer,
  fetchCompanyContacts,
  fetchCompanyCustomers,
  updateCompanyContact,
  updateCompanyCustomer,
} from '../../components/firebase';
import { upsertContactInRegistry } from '../companyDirectory/companyDirectoryService';

export type Customer = {
  id: string;
  name: string;
  personalOrOrgNumber?: string;
  address?: string;
  postalCode?: string;
  city?: string;
  customerType?: string; // Privatperson | Företag
  contactIds?: string[];
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type Contact = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  role?: string;
  contactCompanyName?: string;
  companyId?: string | null;
  companyType?: 'supplier' | 'customer' | null;
};

function safeCompanyId(companyId: string | undefined | null): string {
  const cid = String(companyId ?? '').trim();
  if (!cid) throw new Error('Saknar företag');
  return cid;
}

export async function fetchCustomers(companyId: string | undefined | null): Promise<Customer[]> {
  const cid = safeCompanyId(companyId);
  const list = await fetchCompanyCustomers(cid);
  return (list || []) as Customer[];
}

export async function createCustomer(
  companyId: string | undefined | null,
  data: {
    name: string;
    personalOrOrgNumber?: string;
    address?: string;
    postalCode?: string;
    city?: string;
    customerType?: string;
    contactIds?: string[];
  }
): Promise<string> {
  const cid = safeCompanyId(companyId);
  const n = String(data.name ?? '').trim();
  if (!n) throw new Error('Namn är obligatoriskt.');
  return createCompanyCustomer(
    {
      name: n,
      personalOrOrgNumber: data.personalOrOrgNumber ?? '',
      address: data.address ?? '',
      postalCode: data.postalCode ?? '',
      city: data.city ?? '',
      customerType: data.customerType ?? '',
      contactIds: data.contactIds,
    },
    cid
  );
}

export async function updateCustomer(
  companyId: string | undefined | null,
  customerId: string,
  patch: Partial<{
    name: string;
    personalOrOrgNumber: string;
    address: string;
    postalCode: string;
    city: string;
    customerType: string;
    contactIds: string[];
  }>
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(customerId ?? '').trim();
  if (!id) throw new Error('Ogiltigt kund-id');
  await updateCompanyCustomer({ id, patch }, cid);
}

export async function deleteCustomer(
  companyId: string | undefined | null,
  customerId: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const id = String(customerId ?? '').trim();
  if (!id) throw new Error('Ogiltigt kund-id');
  await deleteCompanyCustomer({ id }, cid);
}

export async function fetchContacts(companyId: string | undefined | null): Promise<Contact[]> {
  const cid = safeCompanyId(companyId);
  const list = await fetchCompanyContacts(cid);
  return (list || []) as Contact[];
}

export function normalizeCustomerType(value: string): 'Privatperson' | 'Företag' {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return 'Företag';
  if (v.startsWith('privat')) return 'Privatperson';
  if (v.startsWith('p')) return 'Privatperson';
  return 'Företag';
}

export async function addContactToCustomer(
  companyId: string | undefined | null,
  customer: Customer,
  contact: { name: string; email?: string; phone?: string; role?: string }
): Promise<{ contactId: string; created: boolean }> {
  const cid = safeCompanyId(companyId);
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
    contactCompanyName: customer.name,
  });
  if (result.id) {
    const patch: Record<string, unknown> = {
      customerId: customer.id,
      companyType: 'customer',
      companyId: null,
      contactCompanyName: customer.name,
    };
    if (contact.role?.trim()) patch.role = contact.role.trim();
    if (contact.phone?.trim()) patch.phone = contact.phone.trim();
    if (contact.email?.trim()) patch.email = contact.email.trim();
    await updateCompanyContact({ id: result.id, patch }, cid);
  }
  const nextIds = Array.from(
    new Set([...(customer.contactIds || []), result.id].filter(Boolean))
  );
  await updateCompanyCustomer({ id: customer.id, patch: { contactIds: nextIds } }, cid);
  return { contactId: result.id, created: result.created };
}

export async function removeContactFromCustomer(
  companyId: string | undefined | null,
  customer: Customer,
  contactId: string
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const nextIds = (customer.contactIds || []).filter((id) => id !== contactId);
  await updateCompanyCustomer({ id: customer.id, patch: { contactIds: nextIds } }, cid);
}

/**
 * Koppla befintlig kontakt till kund (ingen ny kontakt skapas).
 */
export async function linkExistingContactToCustomer(
  companyId: string | undefined | null,
  customer: Customer,
  contactId: string,
  patch?: { role?: string; phone?: string; email?: string; contactCompanyName?: string }
): Promise<void> {
  const cid = safeCompanyId(companyId);
  const nextPatch: Record<string, unknown> = {
    customerId: customer.id,
    companyType: 'customer',
    companyId: null,
  };
  if (patch?.contactCompanyName) nextPatch.contactCompanyName = patch.contactCompanyName;
  if (patch?.role?.trim()) nextPatch.role = patch.role.trim();
  if (patch?.phone?.trim()) nextPatch.phone = patch.phone.trim();
  if (patch?.email?.trim()) nextPatch.email = patch.email.trim();
  await updateCompanyContact({ id: contactId, patch: nextPatch }, cid);
  const nextIds = Array.from(new Set([...(customer.contactIds || []), contactId].filter(Boolean)));
  await updateCompanyCustomer({ id: customer.id, patch: { contactIds: nextIds } }, cid);
}
