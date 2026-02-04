/**
 * Tabell för kunder – kolumner: Namn, Person-/Organisationsnummer, Adress, Postnummer, Ort, Typ av kund.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SelectDropdownChip } from '../../components/common/SelectDropdown';
import type { Customer } from './kunderService';

export type SortColumn =
  | 'name'
  | 'personalOrOrgNumber'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'customerType';
export type SortDirection = 'asc' | 'desc';

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  rowAlt: {
    backgroundColor: '#f8fafc',
  },
  rowHover: {
    backgroundColor: '#eef6ff',
  },
  detailsRow: {
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    padding: 12,
    paddingLeft: 26,
  },
  detailsInner: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
    padding: 10,
  },
  rowMenuBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginLeft: 6,
  },
  contactRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  contactRowAlt: {
    backgroundColor: '#f8fafc',
  },
  contactHeader: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 8,
  },
  contactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  chipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
  },
  contactSuggestWrap: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  contactSuggestRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  contactSuggestText: {
    fontSize: 12,
    color: '#111',
  },
  contactHint: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  contactHintText: {
    fontSize: 12,
    color: '#475569',
  },
  contactHintBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#e2e8f0',
  },
  contactHintBtnText: {
    fontSize: 12,
    color: '#334155',
    fontWeight: '500',
  },
  contactCell: {
    fontSize: 12,
    color: '#334155',
  },
  contactInput: {
    fontSize: 12,
    color: '#111',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  removeBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: 'transparent',
    marginLeft: 6,
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  inlineInput: {
    fontSize: 13,
    color: '#111',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    backgroundColor: '#fff',
  },
  cellText: {
    fontSize: 13,
    color: '#1e293b',
    fontWeight: '500',
  },
  cellMuted: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '400',
  },
});

function safeText(value?: string): string {
  const v = String(value ?? '').trim();
  return v || '—';
}

interface KunderTableProps {
  customers: Customer[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
  onRowPress: (customer: Customer) => void;
  onRowContextMenu?: (e: unknown, customer: Customer) => void;
  onRowMenu?: (e: unknown, customer: Customer) => void;
  contactRegistry?: { id: string; name: string; role?: string; email?: string; phone?: string }[];
  contactsByCustomerId?: Record<string, { id: string; name: string; role?: string; email?: string; phone?: string }[]>;
  onContactMenu?: (e: unknown, customer: Customer, contact: { id: string; name: string; role?: string; email?: string; phone?: string }) => void;
  onAddContact?: (customer: Customer, contact: { name: string; role?: string; email?: string; phone?: string }) => void;
  onRemoveContact?: (customer: Customer, contactId: string) => void;
  onLinkContact?: (
    customer: Customer,
    contactId: string,
    patch?: { role?: string; phone?: string; email?: string; contactCompanyName?: string }
  ) => void;
  inlineEnabled?: boolean;
  inlineValues?: {
    name: string;
    personalOrOrgNumber: string;
    address: string;
    postalCode: string;
    city: string;
    customerType: string;
  };
  inlineSaving?: boolean;
  onInlineChange?: (field: keyof KunderTableProps['inlineValues'], value: string) => void;
  onInlineSave?: () => void;
}

export default function KunderTable({
  customers,
  sortColumn,
  sortDirection,
  onSort,
  onRowPress,
  onRowContextMenu,
  onRowMenu,
  contactRegistry = [],
  contactsByCustomerId = {},
  onContactMenu,
  onAddContact,
  onRemoveContact,
  onLinkContact,
  inlineEnabled = false,
  inlineValues,
  inlineSaving = false,
  onInlineChange,
  onInlineSave,
}: KunderTableProps): React.ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [contactDrafts, setContactDrafts] = useState<Record<string, { name: string; role: string; email: string; phone: string }>>({});
  const [duplicatePrompt, setDuplicatePrompt] = useState<Record<string, { contactId: string; label: string }>>({});

  const contactMap = useMemo(() => contactsByCustomerId, [contactsByCustomerId]);

  const submitDraft = (customer: Customer) => {
    const draft = contactDrafts[customer.id];
    if (draft?.name?.trim()) {
      const nameLower = String(draft.name || '').trim().toLowerCase();
      const emailLower = String(draft.email || '').trim().toLowerCase();
      const existing = contactRegistry.find((c) => {
        const n = String(c?.name || '').trim().toLowerCase();
        const e = String(c?.email || '').trim().toLowerCase();
        return (nameLower && n === nameLower) || (emailLower && e === emailLower);
      });
      if (existing) {
        setDuplicatePrompt((prev) => ({
          ...prev,
          [customer.id]: { contactId: existing.id, label: existing.name || existing.email || 'Kontakt' },
        }));
        return;
      }
      onAddContact?.(customer, {
        name: draft.name.trim(),
        role: draft.role?.trim(),
        email: draft.email?.trim(),
        phone: draft.phone?.trim(),
      });
      setContactDrafts((prev) => ({
        ...prev,
        [customer.id]: { name: '', role: '', email: '', phone: '' },
      }));
      setDuplicatePrompt((prev) => {
        const next = { ...prev };
        delete next[customer.id];
        return next;
      });
    }
  };

  const SortIcon = ({ col }: { col: SortColumn }) => {
    if (sortColumn !== col) {
      return <Ionicons name="swap-vertical-outline" size={14} color="#cbd5e1" />;
    }
    return (
      <Ionicons
        name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'}
        size={14}
        color="#64748b"
      />
    );
  };

  return (
    <View style={styles.tableWrap}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 2 }]}
          onPress={() => onSort('name')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Kundnamn</Text>
          <SortIcon col="name" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 1.2 }]}
          onPress={() => onSort('personalOrOrgNumber')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Personnummer / Organisationsnummer</Text>
          <SortIcon col="personalOrOrgNumber" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 1.5 }]}
          onPress={() => onSort('address')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Adress</Text>
          <SortIcon col="address" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 0.8 }]}
          onPress={() => onSort('postalCode')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Postnummer</Text>
          <SortIcon col="postalCode" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 1.0 }]}
          onPress={() => onSort('city')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Ort</Text>
          <SortIcon col="city" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, { flex: 1.0 }]}
          onPress={() => onSort('customerType')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Kundtyp</Text>
          <SortIcon col="customerType" />
        </TouchableOpacity>
      </View>

      {inlineEnabled ? (
        <View style={styles.inlineRow}>
          <TextInput
            value={inlineValues?.name ?? ''}
            onChangeText={(v) => onInlineChange?.('name', v)}
            placeholder="Namn (ny)"
            returnKeyType="done"
            blurOnSubmit={true}
            onSubmitEditing={() => {
              if (!inlineSaving) onInlineSave?.();
            }}
            style={[styles.inlineInput, { flex: 2 }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.personalOrOrgNumber ?? ''}
            onChangeText={(v) => onInlineChange?.('personalOrOrgNumber', v)}
            placeholder="Person-/Org nr (ny)"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (Platform.OS === 'web') {
                setTimeout(() => {
                  try {
                    const nextInput = document.querySelector('input[placeholder=\"Adress (ny)\"]');
                    if (nextInput) nextInput.focus();
                  } catch (_e) {}
                }, 50);
              }
            }}
            style={[styles.inlineInput, { flex: 1.2, marginLeft: 8 }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.address ?? ''}
            onChangeText={(v) => onInlineChange?.('address', v)}
            placeholder="Adress (ny)"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (Platform.OS === 'web') {
                setTimeout(() => {
                  try {
                    const nextInput = document.querySelector('input[placeholder=\"Postnummer (ny)\"]');
                    if (nextInput) nextInput.focus();
                  } catch (_e) {}
                }, 50);
              }
            }}
            style={[styles.inlineInput, { flex: 1.5, marginLeft: 8 }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.postalCode ?? ''}
            onChangeText={(v) => onInlineChange?.('postalCode', v)}
            placeholder="Postnummer (ny)"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (Platform.OS === 'web') {
                setTimeout(() => {
                  try {
                    const nextInput = document.querySelector('input[placeholder=\"Ort (ny)\"]');
                    if (nextInput) nextInput.focus();
                  } catch (_e) {}
                }, 50);
              }
            }}
            style={[styles.inlineInput, { flex: 0.8, marginLeft: 8 }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.city ?? ''}
            onChangeText={(v) => onInlineChange?.('city', v)}
            placeholder="Ort (ny)"
            returnKeyType="next"
            blurOnSubmit={false}
            onSubmitEditing={() => {
              if (Platform.OS === 'web') {
                setTimeout(() => {
                  try {
                    const nextInput = document.querySelector('select[data-field=\"kundtyp-ny\"]');
                    if (nextInput) nextInput.focus();
                  } catch (_e) {}
                }, 50);
              }
            }}
            style={[styles.inlineInput, { flex: 1.0, marginLeft: 8 }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          {Platform.OS === 'web' ? (
            // @ts-ignore - web-only select
            <select
              style={StyleSheet.flatten([styles.inlineInput, { flex: 1.0, marginLeft: 8, height: 32 }])}
              value={inlineValues?.customerType ?? ''}
              onChange={(e) => onInlineChange?.('customerType', e.target.value)}
              data-field="kundtyp-ny"
            >
              <option value="">Välj typ</option>
              <option value="Privatperson">Privatperson</option>
              <option value="Företag">Företag</option>
            </select>
          ) : (
            <TextInput
              value={inlineValues?.customerType ?? ''}
              onChangeText={(v) => onInlineChange?.('customerType', v)}
              placeholder="Typ av kund (ny)"
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={() => {
                if (!inlineSaving) onInlineSave?.();
              }}
              style={[styles.inlineInput, { flex: 1.0, marginLeft: 8 }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
            />
          )}
        </View>
      ) : null}

      {customers.map((customer, idx) => (
        <View key={customer.id}>
          <TouchableOpacity
            style={[
              styles.row,
              idx % 2 === 1 ? styles.rowAlt : null,
              hoveredId === customer.id ? styles.rowHover : null,
            ]}
            onPress={() => {
              setExpandedIds((prev) => ({ ...prev, [customer.id]: !prev[customer.id] }));
              onRowPress(customer);
            }}
            onLongPress={(e) => onRowContextMenu?.(e, customer)}
            activeOpacity={0.7}
            {...(Platform.OS === 'web'
              ? {
                  cursor: 'pointer',
                  onMouseEnter: () => setHoveredId(customer.id),
                  onMouseLeave: () => setHoveredId(null),
                }
              : {})}
          >
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons
                name="chevron-forward"
                size={14}
                color="#94a3b8"
                style={{
                  transform: [{ rotate: expandedIds[customer.id] ? '90deg' : '0deg' }],
                }}
              />
              <Text style={styles.cellText} numberOfLines={1}>
                {customer.name || '—'}
              </Text>
            </View>
            <Text style={[styles.cellMuted, { flex: 1.2 }]} numberOfLines={1}>
              {safeText(customer.personalOrOrgNumber)}
            </Text>
            <Text style={[styles.cellMuted, { flex: 1.5 }]} numberOfLines={1}>
              {safeText(customer.address)}
            </Text>
            <Text style={[styles.cellMuted, { flex: 0.8 }]} numberOfLines={1}>
              {safeText(customer.postalCode)}
            </Text>
            <Text style={[styles.cellMuted, { flex: 1.0 }]} numberOfLines={1}>
              {safeText(customer.city)}
            </Text>
            <View style={[styles.chipRow, { flex: 1.0 }]}>
              <SelectDropdownChip
                label={safeText(customer.customerType)}
                removable={false}
              />
            </View>
            <TouchableOpacity
              style={styles.rowMenuBtn}
              onPress={(e) => onRowMenu?.(e, customer)}
              activeOpacity={0.8}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
            </TouchableOpacity>
          </TouchableOpacity>
          {expandedIds[customer.id] ? (
            <View style={styles.detailsRow}>
              <View style={styles.detailsInner}>
                <View style={styles.contactHeaderRow}>
                  <Text style={styles.contactHeader}>Kontaktpersoner</Text>
                  <View style={styles.chipRow}>
                    {(contactMap[customer.id] || []).map((contact) => (
                      <SelectDropdownChip
                        key={`chip-${contact.id}`}
                        label={contact.name}
                        removable
                        onRemove={() => onRemoveContact?.(customer, contact.id)}
                      />
                    ))}
                  </View>
                </View>
                {(contactMap[customer.id] || []).map((contact, cIdx) => (
                  <View key={contact.id} style={[styles.contactRow, cIdx % 2 === 1 ? styles.contactRowAlt : null]}>
                    <Text style={[styles.contactCell, { flex: 1.2 }]} numberOfLines={1}>
                      {contact.name}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1 }]} numberOfLines={1}>
                      {contact.role || '—'}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1.2 }]} numberOfLines={1}>
                      {contact.email || '—'}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1 }]} numberOfLines={1}>
                      {contact.phone || '—'}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={(e) => onContactMenu?.(e, customer, contact)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.contactRow}>
                  <TextInput
                    value={contactDrafts[customer.id]?.name ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [customer.id]: { name: v, role: prev[customer.id]?.role || '', email: prev[customer.id]?.email || '', phone: prev[customer.id]?.phone || '' },
                      }))
                    }
                    placeholder="Namn (ny kontakt)"
                    style={[styles.contactInput, { flex: 1.2 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(customer)}
                  />
                  <TextInput
                    value={contactDrafts[customer.id]?.role ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [customer.id]: { name: prev[customer.id]?.name || '', role: v, email: prev[customer.id]?.email || '', phone: prev[customer.id]?.phone || '' },
                      }))
                    }
                    placeholder="Roll"
                    style={[styles.contactInput, { flex: 1, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(customer)}
                  />
                  <TextInput
                    value={contactDrafts[customer.id]?.email ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [customer.id]: { name: prev[customer.id]?.name || '', role: prev[customer.id]?.role || '', email: v, phone: prev[customer.id]?.phone || '' },
                      }))
                    }
                    placeholder="E-post"
                    style={[styles.contactInput, { flex: 1.2, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(customer)}
                  />
                  <TextInput
                    value={contactDrafts[customer.id]?.phone ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [customer.id]: { name: prev[customer.id]?.name || '', role: prev[customer.id]?.role || '', email: prev[customer.id]?.email || '', phone: v },
                      }))
                    }
                    placeholder="Telefon"
                    style={[styles.contactInput, { flex: 1, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => submitDraft(customer)}
                  />
                </View>
                {(() => {
                  const draft = contactDrafts[customer.id] || { name: '', role: '', email: '', phone: '' };
                  const q = String(draft.name || '').trim().toLowerCase();
                  const linkedIds = new Set((contactMap[customer.id] || []).map((c) => c.id));
                  const matches = q
                    ? contactRegistry.filter((c) => {
                        const name = String(c?.name || '').toLowerCase();
                        const email = String(c?.email || '').toLowerCase();
                        return (name.includes(q) || email.includes(q)) && !linkedIds.has(c.id);
                      })
                    : [];
                  if (!matches.length) return null;
                  return (
                    <View style={styles.contactSuggestWrap}>
                      {matches.slice(0, 6).map((m) => (
                        <TouchableOpacity
                          key={`match-${m.id}`}
                          style={styles.contactSuggestRow}
                          onPress={() => {
                            onLinkContact?.(customer, m.id, {
                              role: draft.role,
                              phone: draft.phone,
                              email: draft.email,
                              contactCompanyName: customer.name || '',
                            });
                            setContactDrafts((prev) => ({
                              ...prev,
                              [customer.id]: { name: '', role: '', email: '', phone: '' },
                            }));
                          }}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                        >
                          <Text style={styles.contactSuggestText}>{m.name}</Text>
                          {m.email ? (
                            <Text style={[styles.contactSuggestText, { color: '#64748b' }]}>
                              {m.email}
                            </Text>
                          ) : null}
                        </TouchableOpacity>
                      ))}
                    </View>
                  );
                })()}
                {duplicatePrompt[customer.id] ? (
                  <View style={styles.contactHint}>
                    <Text style={styles.contactHintText}>
                      Det finns redan en kontakt som matchar. Vill du använda befintlig eller skapa ny?
                    </Text>
                    <TouchableOpacity
                      style={styles.contactHintBtn}
                      onPress={() => {
                        const dup = duplicatePrompt[customer.id];
                        if (dup) {
                          const draft = contactDrafts[customer.id] || { role: '', phone: '', email: '' };
                          onLinkContact?.(customer, dup.contactId, {
                            role: draft.role,
                            phone: draft.phone,
                            email: draft.email,
                            contactCompanyName: customer.name || '',
                          });
                        }
                        setDuplicatePrompt((prev) => {
                          const next = { ...prev };
                          delete next[customer.id];
                          return next;
                        });
                        setContactDrafts((prev) => ({
                          ...prev,
                          [customer.id]: { name: '', role: '', email: '', phone: '' },
                        }));
                      }}
                    >
                      <Text style={styles.contactHintBtnText}>Använd befintlig</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.contactHintBtn}
                      onPress={() => {
                        const draft = contactDrafts[customer.id];
                        if (draft?.name?.trim()) {
                          onAddContact?.(customer, {
                            name: draft.name.trim(),
                            role: draft.role?.trim(),
                            email: draft.email?.trim(),
                            phone: draft.phone?.trim(),
                          });
                        }
                        setDuplicatePrompt((prev) => {
                          const next = { ...prev };
                          delete next[customer.id];
                          return next;
                        });
                        setContactDrafts((prev) => ({
                          ...prev,
                          [customer.id]: { name: '', role: '', email: '', phone: '' },
                        }));
                      }}
                    >
                      <Text style={styles.contactHintBtnText}>Skapa ny</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
