/**
 * Tabell för leverantörer – samma DataGrid-pattern som Kunder/Kontaktregister.
 * Kolumner: Leverantörsnamn, Orgnr, Adress, Postnr, Ort, Kategori, Åtgärder (sticky kebab).
 * Inline-redigering med Enter/Esc och diskreta ✔ ✕.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SelectDropdown, { SelectDropdownChip } from '../../components/common/SelectDropdown';
import type { Supplier } from './leverantorerService';
import { LEVERANTOR_KATEGORIER } from '../../constants/leverantorKategorier';

/** Samma grid som Kunder: flexibla + fasta kolumner, sticky kebab 48px med divider. */
const FLEX = { companyName: 1.5, address: 1.6, city: 1.1 } as const;
const FIXED = { organizationNumber: 160, postalCode: 110, category: 120, actions: 48 } as const;

export type SortColumn =
  | 'companyName'
  | 'organizationNumber'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'category';
export type SortDirection = 'asc' | 'desc';

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 0,
  },
  headerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  actionsCol: {
    width: FIXED.actions,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
  },
  actionsColHeader: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 5,
  },
  actionsColInline: { backgroundColor: '#eff6ff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
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
  rowActive: {
    backgroundColor: '#f1f5f9',
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
  detailsMeta: {
    fontSize: 12,
    color: '#475569',
    marginBottom: 8,
    fontWeight: '400',
  },
  rowMenuBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
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
  chipRowCompact: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'nowrap',
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
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  inlineInput: {
    fontSize: 13,
    color: '#111',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    backgroundColor: '#fff',
    flexShrink: 0,
    minWidth: 0,
  },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  editRowBtn: {
    width: 24,
    height: 24,
    padding: 0,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editRowBtnPrimary: {
    backgroundColor: '#16a34a',
    borderColor: '#16a34a',
  },
  editRowBtnCancel: {
    borderColor: '#cbd5e1',
    backgroundColor: 'transparent',
  },
  inlineSelectField: {
    height: 32,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#fff',
  },
  inlineSelectList: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    borderTopWidth: 0,
    marginTop: 0,
    zIndex: 30,
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
  contactBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  contactBadgeText: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
});

function safeText(value?: string): string {
  const v = String(value ?? '').trim();
  return v || '—';
}

interface LeverantorerTableProps {
  suppliers: Supplier[];
  sortColumn: SortColumn;
  sortDirection: SortDirection;
  onSort: (col: SortColumn) => void;
  onRowPress: (supplier: Supplier) => void;
  onRowContextMenu?: (e: unknown, supplier: Supplier) => void;
  onRowMenu?: (e: unknown, supplier: Supplier) => void;
  categoryFilters?: string[];
  onCategoryFiltersChange?: (next: string[]) => void;
  contactRegistry?: { id: string; name: string; email?: string; phone?: string; role?: string }[];
  contactsBySupplierId?: Record<string, { id: string; name: string; role?: string; email?: string; phone?: string }[]>;
  onContactMenu?: (e: unknown, supplier: Supplier, contact: { id: string; name: string; role?: string; email?: string; phone?: string }) => void;
  onAddContact?: (supplier: Supplier, contact: { name: string; role?: string; email?: string; phone?: string }) => void;
  onRemoveContact?: (supplier: Supplier, contactId: string) => void;
  onLinkContact?: (
    supplier: Supplier,
    contactId: string,
    patch?: { role?: string; phone?: string; email?: string; contactCompanyName?: string }
  ) => void;
  inlineEnabled?: boolean;
  inlineValues?: {
    companyName: string;
    organizationNumber: string;
    address: string;
    postalCode: string;
    city: string;
    category: string;
  };
  inlineSaving?: boolean;
  onInlineChange?: (field: keyof LeverantorerTableProps['inlineValues'], value: string) => void;
  onInlineSave?: () => void;
  editingId?: string | null;
  inlineSavingCustomer?: boolean;
  onSaveEdit?: (
    supplierId: string,
    values: {
      companyName: string;
      organizationNumber: string;
      address: string;
      postalCode: string;
      city: string;
      category: string;
    }
  ) => void;
  onCancelEdit?: () => void;
}

export default function LeverantorerTable({
  suppliers,
  sortColumn,
  sortDirection,
  onSort,
  onRowPress,
  onRowContextMenu,
  onRowMenu,
  categoryFilters = [],
  onCategoryFiltersChange,
  contactRegistry = [],
  contactsBySupplierId = {},
  onContactMenu,
  onAddContact,
  onRemoveContact,
  onLinkContact,
  inlineEnabled = false,
  inlineValues,
  inlineSaving = false,
  onInlineChange,
  onInlineSave,
  editingId = null,
  inlineSavingCustomer = false,
  onSaveEdit,
  onCancelEdit,
}: LeverantorerTableProps): React.ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [contactDrafts, setContactDrafts] = useState<Record<string, { name: string; role: string; email: string; phone: string }>>({});
  const [duplicatePrompt, setDuplicatePrompt] = useState<Record<string, { contactId: string; label: string }>>({});
  const [editDraft, setEditDraft] = useState<{
    companyName: string;
    organizationNumber: string;
    address: string;
    postalCode: string;
    city: string;
    category: string;
  } | null>(null);

  const kebabRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  const contactMap = useMemo(() => contactsBySupplierId, [contactsBySupplierId]);

  const editingSupplier = editingId ? (suppliers.find((s) => s.id === editingId) || null) : null;
  React.useEffect(() => {
    if (editingSupplier) {
      const cat = Array.isArray(editingSupplier.categories) && editingSupplier.categories.length
        ? editingSupplier.categories[0]
        : editingSupplier.category ?? '';
      setEditDraft({
        companyName: String(editingSupplier.companyName ?? ''),
        organizationNumber: String(editingSupplier.organizationNumber ?? ''),
        address: String(editingSupplier.address ?? ''),
        postalCode: String(editingSupplier.postalCode ?? ''),
        city: String(editingSupplier.city ?? ''),
        category: String(cat),
      });
    } else {
      setEditDraft(null);
    }
  }, [editingId, editingSupplier?.id]);

  const formatCategories = (supplier: Supplier): { label: string; full: string } => {
    const list = Array.isArray(supplier.categories) && supplier.categories.length
      ? supplier.categories
      : supplier.category
        ? [supplier.category]
        : [];
    if (!list.length) return { label: '—', full: '' };
    if (list.length === 1) return { label: list[0], full: list[0] };
    return { label: `${list.length}+`, full: list.join(', ') };
  };

  const getCategoryList = (supplier: Supplier): string[] => {
    const list = Array.isArray(supplier.categories) && supplier.categories.length
      ? supplier.categories
      : supplier.category
        ? [supplier.category]
        : [];
    return list;
  };


  const submitDraft = (supplier: Supplier) => {
    const draft = contactDrafts[supplier.id];
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
          [supplier.id]: { contactId: existing.id, label: existing.name || existing.email || 'Kontakt' },
        }));
        return;
      }
      onAddContact?.(supplier, {
        name: draft.name.trim(),
        role: draft.role?.trim(),
        email: draft.email?.trim(),
        phone: draft.phone?.trim(),
      });
      setContactDrafts((prev) => ({
        ...prev,
        [supplier.id]: { name: '', role: '', email: '', phone: '' },
      }));
      setDuplicatePrompt((prev) => {
        const next = { ...prev };
        delete next[supplier.id];
        return next;
      });
    }
  };
  const handleEditKeyDown = (e: React.KeyboardEvent, supplier: Supplier) => {
    if (Platform.OS !== 'web') return;
    const key = (e.nativeEvent as KeyboardEvent).key;
    if (key === 'Enter') {
      e.preventDefault();
      if (editDraft?.companyName?.trim() && onSaveEdit && !inlineSavingCustomer) {
        onSaveEdit(supplier.id, {
          companyName: editDraft.companyName.trim(),
          organizationNumber: editDraft.organizationNumber.trim(),
          address: editDraft.address.trim(),
          postalCode: editDraft.postalCode.trim(),
          city: editDraft.city.trim(),
          category: editDraft.category.trim(),
        });
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      const id = editingId;
      onCancelEdit?.();
      setTimeout(() => {
        const el = id ? kebabRefs.current[id] : null;
        if (el && typeof el.focus === 'function') el.focus();
      }, 0);
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

  const stickyRight = Platform.OS === 'web' ? { position: 'sticky' as const, right: 0 } : {};

  return (
    <View style={styles.tableWrap}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.companyName }]}
          onPress={() => onSort('companyName')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Leverantörsnamn</Text>
          <SortIcon col="companyName" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.organizationNumber }]}
          onPress={() => onSort('organizationNumber')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Organisationsnummer</Text>
          <SortIcon col="organizationNumber" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.address }]}
          onPress={() => onSort('address')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Adress</Text>
          <SortIcon col="address" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.postalCode }]}
          onPress={() => onSort('postalCode')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Postnr</Text>
          <SortIcon col="postalCode" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.city }]}
          onPress={() => onSort('city')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Ort</Text>
          <SortIcon col="city" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.category }]}
          onPress={() => onSort('category')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Kategori</Text>
          <SortIcon col="category" />
        </TouchableOpacity>
        <View style={[styles.actionsCol, styles.actionsColHeader, stickyRight]} />
      </View>
      {inlineEnabled ? (
        <View style={styles.inlineRow}>
          <TextInput
            value={inlineValues?.companyName ?? ''}
            onChangeText={(v) => onInlineChange?.('companyName', v)}
            placeholder="Leverantörsnamn (ny)"
            returnKeyType="done"
            blurOnSubmit={true}
            onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.companyName }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.organizationNumber ?? ''}
            onChangeText={(v) => onInlineChange?.('organizationNumber', v)}
            placeholder="Orgnr (ny)"
            style={[styles.inlineInput, styles.cellFixed, { width: FIXED.organizationNumber }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.address ?? ''}
            onChangeText={(v) => onInlineChange?.('address', v)}
            placeholder="Adress (ny)"
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.address }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.postalCode ?? ''}
            onChangeText={(v) => onInlineChange?.('postalCode', v)}
            placeholder="Postnr (ny)"
            style={[styles.inlineInput, styles.cellFixed, { width: FIXED.postalCode }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.city ?? ''}
            onChangeText={(v) => onInlineChange?.('city', v)}
            placeholder="Ort (ny)"
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.city }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          {Platform.OS === 'web' ? (
            <View style={[styles.cellFixed, { width: FIXED.category }]}>
              <SelectDropdown
                value={inlineValues?.category ?? ''}
                options={LEVERANTOR_KATEGORIER}
                placeholder="Kategori"
                searchable
                onSelect={(next) => onInlineChange?.('category', String(next))}
                usePortal={true}
                fieldStyle={styles.inlineSelectField}
                listStyle={styles.inlineSelectList}
                inputStyle={{ fontSize: 13, color: '#111' }}
              />
            </View>
          ) : (
            <TextInput
              value={inlineValues?.category ?? ''}
              onChangeText={(v) => onInlineChange?.('category', v)}
              placeholder="Kategori"
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
              style={[styles.inlineInput, styles.cellFixed, { width: FIXED.category }]}
              placeholderTextColor="#94a3b8"
            />
          )}
          <View style={[styles.actionsCol, styles.actionsColInline, stickyRight]} />
        </View>
      ) : null}
      {suppliers.map((supplier, idx) => (
        <View key={supplier.id}>
          {editingId === supplier.id && editDraft ? (
            <View style={styles.editRow}>
              <TextInput
                value={editDraft.companyName}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, companyName: v } : d))}
                placeholder="Leverantörsnamn"
                style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.companyName }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
              />
              <TextInput
                value={editDraft.organizationNumber}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, organizationNumber: v } : d))}
                placeholder="Orgnr"
                style={[styles.inlineInput, styles.cellFixed, { width: FIXED.organizationNumber }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
              />
              <TextInput
                value={editDraft.address}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, address: v } : d))}
                placeholder="Adress"
                style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.address }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
              />
              <TextInput
                value={editDraft.postalCode}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, postalCode: v } : d))}
                placeholder="Postnr"
                style={[styles.inlineInput, styles.cellFixed, { width: FIXED.postalCode }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
              />
              <TextInput
                value={editDraft.city}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, city: v } : d))}
                placeholder="Ort"
                style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.city }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
              />
              {Platform.OS === 'web' ? (
                <View style={[styles.cellFixed, { width: FIXED.category }]}>
                  <SelectDropdown
                    value={editDraft.category}
                    options={LEVERANTOR_KATEGORIER as unknown as string[]}
                    placeholder="Kategori"
                    searchable
                    onSelect={(next) => setEditDraft((d) => (d ? { ...d, category: String(next) } : d))}
                    usePortal={true}
                    fieldStyle={[styles.inlineSelectField, { minHeight: 28 }]}
                    listStyle={styles.inlineSelectList}
                    inputStyle={{ fontSize: 13, color: '#111' }}
                  />
                </View>
              ) : (
                <TextInput
                  value={editDraft.category}
                  onChangeText={(v) => setEditDraft((d) => (d ? { ...d, category: v } : d))}
                  placeholder="Kategori"
                  style={[styles.inlineInput, styles.cellFixed, { width: FIXED.category }]}
                  placeholderTextColor="#94a3b8"
                />
              )}
              <View style={[styles.actionsCol, styles.actionsColInline, stickyRight, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
                <TouchableOpacity
                  style={[styles.editRowBtn, styles.editRowBtnPrimary]}
                  onPress={() => {
                    if (!editDraft?.companyName?.trim() || !onSaveEdit) return;
                    onSaveEdit(supplier.id, {
                      companyName: editDraft.companyName.trim(),
                      organizationNumber: editDraft.organizationNumber.trim(),
                      address: editDraft.address.trim(),
                      postalCode: editDraft.postalCode.trim(),
                      city: editDraft.city.trim(),
                      category: editDraft.category.trim(),
                    });
                  }}
                  disabled={inlineSavingCustomer}
                  accessibilityLabel="Spara"
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.editRowBtn, styles.editRowBtnCancel]}
                  onPress={() => onCancelEdit?.()}
                  disabled={inlineSavingCustomer}
                  accessibilityLabel="Avbryt"
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Ionicons name="close" size={14} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <TouchableOpacity
              style={[
                styles.row,
                idx % 2 === 1 ? styles.rowAlt : null,
                hoveredId === supplier.id ? styles.rowHover : null,
                expandedIds[supplier.id] ? styles.rowActive : null,
              ]}
              onPress={() => {
                setExpandedIds((prev) => ({ ...prev, [supplier.id]: !prev[supplier.id] }));
                onRowPress(supplier);
              }}
              onLongPress={(e) => onRowContextMenu?.(e, supplier)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web'
                ? {
                    cursor: 'pointer',
                    onMouseEnter: () => setHoveredId(supplier.id),
                    onMouseLeave: () => setHoveredId(null),
                  }
                : {})}
            >
              <View style={[styles.cellFlex, { flex: FLEX.companyName, flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                <Ionicons
                  name="chevron-forward"
                  size={14}
                  color="#94a3b8"
                  style={{ transform: [{ rotate: expandedIds[supplier.id] ? '90deg' : '0deg' }] }}
                />
                <Text style={styles.cellText} numberOfLines={1}>
                  {supplier.companyName || '—'}
                </Text>
                {(() => {
                  const list = contactMap[supplier.id] || [];
                  const count = list.length;
                  const tooltip = Platform.OS === 'web' && list.length > 0 ? `Kontakter: ${list.map((c) => c.name || '—').join(', ')}` : undefined;
                  return (
                    <View style={styles.contactBadge} {...(tooltip && Platform.OS === 'web' ? { title: tooltip } : {})}>
                      <Text style={styles.contactBadgeText}>👤 {count}</Text>
                    </View>
                  );
                })()}
              </View>
              <Text style={[styles.cellMuted, styles.cellFixed, { width: FIXED.organizationNumber }]} numberOfLines={1}>
                {supplier.organizationNumber || '—'}
              </Text>
              <Text style={[styles.cellMuted, styles.cellFlex, { flex: FLEX.address }]} numberOfLines={1}>
                {safeText(supplier.address)}
              </Text>
              <Text style={[styles.cellMuted, styles.cellFixed, { width: FIXED.postalCode }]} numberOfLines={1}>
                {safeText(supplier.postalCode)}
              </Text>
              <Text style={[styles.cellMuted, styles.cellFlex, { flex: FLEX.city }]} numberOfLines={1}>
                {safeText(supplier.city)}
              </Text>
              <View style={[styles.chipRow, styles.cellFixed, { width: FIXED.category }]}>
                <SelectDropdownChip label={formatCategories(supplier).label} removable={false} />
              </View>
              <View style={[styles.actionsCol, stickyRight]}>
                <TouchableOpacity
                  ref={(r) => { kebabRefs.current[supplier.id] = r as { focus?: () => void } | null; }}
                  style={styles.rowMenuBtn}
                  onPress={(e) => onRowMenu?.(e, supplier)}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer', tabIndex: 0 } : {})}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          )}
          {expandedIds[supplier.id] ? (
            <View style={styles.detailsRow}>
              <View style={styles.detailsInner}>
                <View style={styles.contactHeaderRow}>
                  <Text style={styles.detailsMeta}>Kategorier</Text>
                  <View style={styles.chipRow}>
                    {getCategoryList(supplier).length
                      ? getCategoryList(supplier).map((c) => (
                          <SelectDropdownChip key={c} label={c} removable={false} />
                        ))
                      : <SelectDropdownChip label="—" removable={false} />}
                  </View>
                </View>
                <Text style={styles.contactHeader}>Kontakter</Text>
                {(contactMap[supplier.id] || []).map((contact, cIdx) => (
                  <View key={contact.id} style={[styles.contactRow, cIdx % 2 === 1 ? styles.contactRowAlt : null]}>
                    <Text style={[styles.contactCell, { flex: 1.2 }]} numberOfLines={1}>
                      {contact.name}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1 }]} numberOfLines={1}>
                      {contact.role || '—'}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1 }]} numberOfLines={1}>
                      {contact.phone || '—'}
                    </Text>
                    <Text style={[styles.contactCell, { flex: 1.4 }]} numberOfLines={1}>
                      {contact.email || '—'}
                    </Text>
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={(e) => onContactMenu?.(e, supplier, contact)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
                    </TouchableOpacity>
                  </View>
                ))}
                <View style={styles.contactRow}>
                  <TextInput
                    value={contactDrafts[supplier.id]?.name ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [supplier.id]: { name: v, role: prev[supplier.id]?.role || '', email: prev[supplier.id]?.email || '', phone: prev[supplier.id]?.phone || '' },
                      }))
                    }
                    placeholder="Namn (ny kontakt)"
                    style={[styles.contactInput, { flex: 1.2 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(supplier)}
                  />
                  <TextInput
                    value={contactDrafts[supplier.id]?.role ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [supplier.id]: { name: prev[supplier.id]?.name || '', role: v, email: prev[supplier.id]?.email || '', phone: prev[supplier.id]?.phone || '' },
                      }))
                    }
                    placeholder="Roll"
                    style={[styles.contactInput, { flex: 1, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(supplier)}
                  />
                  <TextInput
                    value={contactDrafts[supplier.id]?.phone ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [supplier.id]: { name: prev[supplier.id]?.name || '', role: prev[supplier.id]?.role || '', email: prev[supplier.id]?.email || '', phone: v },
                      }))
                    }
                    placeholder="Telefon"
                    style={[styles.contactInput, { flex: 1, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="next"
                    blurOnSubmit={false}
                    onSubmitEditing={() => submitDraft(supplier)}
                  />
                  <TextInput
                    value={contactDrafts[supplier.id]?.email ?? ''}
                    onChangeText={(v) =>
                      setContactDrafts((prev) => ({
                        ...prev,
                        [supplier.id]: { name: prev[supplier.id]?.name || '', role: prev[supplier.id]?.role || '', email: v, phone: prev[supplier.id]?.phone || '' },
                      }))
                    }
                    placeholder="E-post"
                    style={[styles.contactInput, { flex: 1.4, marginLeft: 8 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
                    returnKeyType="done"
                    blurOnSubmit
                    onSubmitEditing={() => submitDraft(supplier)}
                  />
                </View>
                {(() => {
                  const draft = contactDrafts[supplier.id] || { name: '', role: '', email: '', phone: '' };
                  const q = String(draft.name || '').trim().toLowerCase();
                  const linkedIds = new Set((contactMap[supplier.id] || []).map((c) => c.id));
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
                            onLinkContact?.(supplier, m.id, {
                              role: draft.role,
                              phone: draft.phone,
                              email: draft.email,
                              contactCompanyName: supplier.companyName || '',
                            });
                            setContactDrafts((prev) => ({
                              ...prev,
                              [supplier.id]: { name: '', role: '', email: '', phone: '' },
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
                {duplicatePrompt[supplier.id] ? (
                  <View style={styles.contactHint}>
                    <Text style={styles.contactHintText}>
                      Det finns redan en kontakt som matchar. Vill du använda befintlig eller skapa ny?
                    </Text>
                    <TouchableOpacity
                      style={styles.contactHintBtn}
                      onPress={() => {
                        const dup = duplicatePrompt[supplier.id];
                        if (dup) {
                          const draft = contactDrafts[supplier.id] || { role: '', phone: '', email: '' };
                          onLinkContact?.(supplier, dup.contactId, {
                            role: draft.role,
                            phone: draft.phone,
                            email: draft.email,
                            contactCompanyName: supplier.companyName || '',
                          });
                        }
                        setDuplicatePrompt((prev) => {
                          const next = { ...prev };
                          delete next[supplier.id];
                          return next;
                        });
                        setContactDrafts((prev) => ({
                          ...prev,
                          [supplier.id]: { name: '', role: '', email: '', phone: '' },
                        }));
                      }}
                    >
                      <Text style={styles.contactHintBtnText}>Använd befintlig</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.contactHintBtn}
                      onPress={() => {
                        const draft = contactDrafts[supplier.id];
                        if (draft?.name?.trim()) {
                          onAddContact?.(supplier, {
                            name: draft.name.trim(),
                            role: draft.role?.trim(),
                            email: draft.email?.trim(),
                            phone: draft.phone?.trim(),
                          });
                        }
                        setDuplicatePrompt((prev) => {
                          const next = { ...prev };
                          delete next[supplier.id];
                          return next;
                        });
                        setContactDrafts((prev) => ({
                          ...prev,
                          [supplier.id]: { name: '', role: '', email: '', phone: '' },
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
