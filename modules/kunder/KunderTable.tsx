/**
 * Tabell för kunder – kolumner: Namn, Person-/Organisationsnummer, Adress, Postnummer, Ort, Typ av kund.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SelectDropdownChip } from '../../components/common/SelectDropdown';
import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';
import type { Customer } from './kunderService';

const TABLE = MODAL_DESIGN_2026;

export type SortColumn =
  | 'name'
  | 'personalOrOrgNumber'
  | 'address'
  | 'postalCode'
  | 'city'
  | 'customerType';
export type SortDirection = 'asc' | 'desc';

/** Kolumnbredder – på webb justerbara via resize-handtag. Annars fasta defaultbredder. */
const DEFAULT_COLUMN_WIDTHS = {
  name: 140,
  personalOrOrgNumber: 150,
  address: 160,
  postalCode: 90,
  city: 110,
  customerType: 110,
} as const;
const MIN_COLUMN_WIDTH = 60;
const RESIZE_HANDLE_WIDTH = 6;
type ColumnKey = keyof typeof DEFAULT_COLUMN_WIDTHS;

/** Kontakt-tabell i öppet läge: samma kolumner som Kontaktregister. */
const FLEX_CONTACT = { name: 1.2, role: 1.1, email: 2 } as const;
const FIXED_CONTACT = { mobile: 130, workPhone: 150, actions: 30 } as const;

function formatMobileDisplay(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  return [p1, p2, p3, p4].filter(Boolean).join(' ').trim();
}

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: TABLE.tableRadius,
    overflow: 'hidden',
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerGapWeb: { gap: 0 },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
    minWidth: 0,
  },
  columnContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  /** Rubrikcell: titel och sorteringsikon på samma rad */
  headerColumnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  inlineInputCell: {
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  /** Fyller ut resten av radbredden så att tabellen inte lämnar luft till höger */
  cellSpacer: { flex: 1, minWidth: 0 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    minHeight: TABLE.tableRowHeight,
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  rowGapWeb: { gap: RESIZE_HANDLE_WIDTH },
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
    paddingVertical: 8,
    paddingHorizontal: 14,
    paddingLeft: 22,
  },
  detailsInner: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f1f5f9',
    padding: 8,
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
    paddingVertical: 4,
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
    marginBottom: 6,
  },
  contactHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
    marginBottom: 6,
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
  openContactTableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  openContactTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 5,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  openContactTableHeaderCell: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
  },
  openContactTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  openContactTableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  openContactTableCell: {
    fontSize: 13,
    color: '#334155',
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
  },
  openContactTableCellMuted: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '400',
  },
  openContactTableKebabCol: {
    width: FIXED_CONTACT.actions,
    minWidth: FIXED_CONTACT.actions,
    maxWidth: FIXED_CONTACT.actions,
    flexShrink: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  openContactEmailLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '400',
  },
  openContactEmailLinkHover: {
    textDecorationLine: 'underline',
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
  inlineAddWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f0f9ff',
  },
  inlineAddLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
  },
  inlineAddLabelText: { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  inlineAddLabelHint: { fontSize: 11, color: '#64748b' },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    backgroundColor: '#f0f9ff',
  },
  inlineInput: {
    fontSize: 13,
    color: '#111',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 0,
    backgroundColor: '#fff',
    flexShrink: 0,
    minWidth: 0,
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
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  editRowActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
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
    backgroundColor: '#1976D2',
    borderColor: '#1976D2',
  },
  editRowBtnCancel: {
    borderColor: '#cbd5e1',
    backgroundColor: 'transparent',
  },
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' as const } : {}),
  },
  resizeHandleLine: {
    position: 'absolute',
    left: Math.floor(RESIZE_HANDLE_WIDTH / 2) - 1,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
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
  onRowDoubleClick?: (customer: Customer) => void;
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
  editingId?: string | null;
  inlineSavingCustomer?: boolean;
  onSaveEdit?: (
    customerId: string,
    values: {
      name: string;
      personalOrOrgNumber: string;
      address: string;
      postalCode: string;
      city: string;
      customerType: string;
    }
  ) => void;
  onCancelEdit?: () => void;
}

export default function KunderTable({
  customers,
  sortColumn,
  sortDirection,
  onSort,
  onRowPress,
  onRowContextMenu,
  onRowMenu,
  onRowDoubleClick,
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
  editingId = null,
  inlineSavingCustomer = false,
  onSaveEdit,
  onCancelEdit,
}: KunderTableProps): React.ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  const [editingContactSection, setEditingContactSection] = useState<Record<string, boolean>>({});
  const [openContactEmailHoverId, setOpenContactEmailHoverId] = useState<string | null>(null);
  const [contactDrafts, setContactDrafts] = useState<Record<string, { name: string; role: string; email: string; phone: string }>>({});
  const [duplicatePrompt, setDuplicatePrompt] = useState<Record<string, { contactId: string; label: string }>>({});
  const [editDraft, setEditDraft] = useState<{
    name: string;
    personalOrOrgNumber: string;
    address: string;
    postalCode: string;
    city: string;
    customerType: string;
  } | null>(null);

  const lastTapRef = useRef<{ customerId: string; time: number }>({ customerId: '', time: 0 });
  const DOUBLE_TAP_MS = 350;
  const contactMap = useMemo(() => contactsByCustomerId, [contactsByCustomerId]);

  const [columnWidths, setColumnWidths] = useState<Record<ColumnKey, number>>(DEFAULT_COLUMN_WIDTHS as unknown as Record<ColumnKey, number>);
  const resizeRef = useRef<{ column: ColumnKey | null; startX: number; startWidth: number }>({ column: null, startX: 0, startWidth: 0 });

  const startResize = useCallback((column: ColumnKey, e: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = (e as unknown as MouseEvent).clientX ?? (e.nativeEvent as unknown as { pageX?: number })?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column] };
  }, [columnWidths]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e: MouseEvent) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      resizeRef.current = { ...resizeRef.current, startX: clientX, startWidth: newWidth };
    };
    const onUp = () => {
      resizeRef.current = { column: null, startX: 0, startWidth: 0 };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const w = columnWidths;
  const col = (key: ColumnKey) => ({ width: w[key], minWidth: w[key], flexShrink: 0 });
  const gapBetweenCols = Platform.OS === 'web' ? RESIZE_HANDLE_WIDTH : 8;
  const totalTableWidth =
    w.name + w.personalOrOrgNumber + w.address + w.postalCode + w.city + w.customerType
    + gapBetweenCols * 5;

  const editingCustomer = editingId ? (customers.find((c) => c.id === editingId) || null) : null;
  React.useEffect(() => {
    if (editingCustomer) {
      setEditDraft({
        name: String(editingCustomer.name ?? ''),
        personalOrOrgNumber: String(editingCustomer.personalOrOrgNumber ?? ''),
        address: String(editingCustomer.address ?? ''),
        postalCode: String(editingCustomer.postalCode ?? ''),
        city: String(editingCustomer.city ?? ''),
        customerType: String(editingCustomer.customerType ?? ''),
      });
    } else {
      setEditDraft(null);
    }
  }, [editingId, editingCustomer?.id]);

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
      setContactDrafts((prev) => ({ ...prev, [customer.id]: { name: '', role: '', email: '', phone: '' } }));
      setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[customer.id]; return n; });
      setEditingContactSection((prev) => ({ ...prev, [customer.id]: false }));
    }
  };

  const handleEditKeyDown = (e: React.KeyboardEvent, customer: Customer) => {
    if (Platform.OS !== 'web') return;
    const key = (e.nativeEvent as KeyboardEvent).key;
    if (key === 'Enter') {
      e.preventDefault();
      if (editDraft?.name?.trim() && onSaveEdit && !inlineSavingCustomer) {
        onSaveEdit(customer.id, {
          name: editDraft.name.trim(),
          personalOrOrgNumber: editDraft.personalOrOrgNumber.trim(),
          address: editDraft.address.trim(),
          postalCode: editDraft.postalCode.trim(),
          city: editDraft.city.trim(),
          customerType: editDraft.customerType.trim(),
        });
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
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
    <View style={[styles.tableWrap, { minWidth: totalTableWidth, width: '100%' }]}>
      <View style={[styles.header, Platform.OS === 'web' && styles.headerGapWeb]}>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('name')]}
          onPress={() => onSort('name')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Kundnamn</Text>
            <SortIcon col="name" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('name', e as unknown as React.MouseEvent)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, col('personalOrOrgNumber')]}
          onPress={() => onSort('personalOrOrgNumber')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Personnr / Orgnr</Text>
            <SortIcon col="personalOrOrgNumber" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('personalOrOrgNumber', e as unknown as React.MouseEvent)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('address')]}
          onPress={() => onSort('address')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Adress</Text>
            <SortIcon col="address" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('address', e as unknown as React.MouseEvent)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, col('postalCode')]}
          onPress={() => onSort('postalCode')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Postnr</Text>
            <SortIcon col="postalCode" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('postalCode', e as unknown as React.MouseEvent)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('city')]}
          onPress={() => onSort('city')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Ort</Text>
            <SortIcon col="city" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('city', e as unknown as React.MouseEvent)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, col('customerType')]}
          onPress={() => onSort('customerType')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText} numberOfLines={1}>Kundtyp</Text>
            <SortIcon col="customerType" />
          </View>
        </TouchableOpacity>
        <View style={styles.cellSpacer} />
      </View>

      {inlineEnabled ? (
        <View style={styles.inlineAddWrap}>
          <View style={styles.inlineAddLabel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
              <Text style={styles.inlineAddLabelText}>Lägg till snabbt</Text>
            </View>
            <Text style={styles.inlineAddLabelHint}>Fyll i och tryck Enter för att spara</Text>
          </View>
          <View style={[styles.inlineRow, Platform.OS === 'web' && styles.rowGapWeb]}>
          <TextInput
            value={inlineValues?.name ?? ''}
            onChangeText={(v) => onInlineChange?.('name', v)}
            placeholder="Namn (ny)"
            returnKeyType="done"
            blurOnSubmit={true}
            onSubmitEditing={() => {
              if (!inlineSaving) onInlineSave?.();
            }}
            style={[styles.inlineInput, col('name')]}
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
            style={[styles.inlineInput, col('personalOrOrgNumber')]}
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
            style={[styles.inlineInput, col('address')]}
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
            style={[styles.inlineInput, col('postalCode')]}
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
            style={[styles.inlineInput, col('city')]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
          />
          {Platform.OS === 'web' ? (
            // @ts-ignore - web-only select
            <select
              style={StyleSheet.flatten([styles.inlineInput, col('customerType'), { height: 32 }])}
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
              style={[styles.inlineInput, col('customerType')]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outline: 'none' } : {})}
            />
          )}
          <View style={styles.cellSpacer} />
          </View>
        </View>
      ) : null}

      {customers.map((customer, idx) => (
        <View key={customer.id}>
          {editingId === customer.id && editDraft ? (
            <View style={[styles.editRow, Platform.OS === 'web' && styles.rowGapWeb]}>
              <TextInput
                value={editDraft.name}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, name: v } : d))}
                placeholder="Kundnamn"
                style={[styles.inlineInput, col('name')]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, customer) } : {})}
              />
              <TextInput
                value={editDraft.personalOrOrgNumber}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, personalOrOrgNumber: v } : d))}
                placeholder="Personnr/Orgnr"
                style={[styles.inlineInput, col('personalOrOrgNumber')]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, customer) } : {})}
              />
              <TextInput
                value={editDraft.address}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, address: v } : d))}
                placeholder="Adress"
                style={[styles.inlineInput, col('address')]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, customer) } : {})}
              />
              <TextInput
                value={editDraft.postalCode}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, postalCode: v } : d))}
                placeholder="Postnr"
                style={[styles.inlineInput, col('postalCode')]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, customer) } : {})}
              />
              <TextInput
                value={editDraft.city}
                onChangeText={(v) => setEditDraft((d) => (d ? { ...d, city: v } : d))}
                placeholder="Ort"
                style={[styles.inlineInput, col('city')]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, customer) } : {})}
              />
              {Platform.OS === 'web' ? (
                <select
                  style={StyleSheet.flatten([styles.inlineInput, col('customerType'), { height: 28 }])}
                  value={editDraft.customerType}
                  onChange={(e) => setEditDraft((d) => (d ? { ...d, customerType: e.target.value } : d))}
                  onKeyDown={(e: React.KeyboardEvent<HTMLSelectElement>) => handleEditKeyDown(e as unknown as React.KeyboardEvent, customer)}
                >
                  <option value="">Typ</option>
                  <option value="Privatperson">Privatperson</option>
                  <option value="Företag">Företag</option>
                </select>
              ) : (
                <TextInput
                  value={editDraft.customerType}
                  onChangeText={(v) => setEditDraft((d) => (d ? { ...d, customerType: v } : d))}
                  placeholder="Typ"
                  style={[styles.inlineInput, col('customerType')]}
                  placeholderTextColor="#94a3b8"
                  {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                />
              )}
              <View style={styles.editRowActions}>
                <TouchableOpacity
                  style={[styles.editRowBtn, styles.editRowBtnPrimary]}
                  onPress={() => {
                    if (!editDraft?.name?.trim() || !onSaveEdit) return;
                    onSaveEdit(customer.id, {
                      name: editDraft.name.trim(),
                      personalOrOrgNumber: editDraft.personalOrOrgNumber.trim(),
                      address: editDraft.address.trim(),
                      postalCode: editDraft.postalCode.trim(),
                      city: editDraft.city.trim(),
                      customerType: editDraft.customerType.trim(),
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
              <View style={styles.cellSpacer} />
            </View>
          ) : (
            <View
              style={{ alignSelf: 'stretch' }}
              {...(Platform.OS === 'web'
                ? {
                    onContextMenu: (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRowMenu?.(e, customer);
                    },
                    ...(onRowDoubleClick ? { onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); onRowDoubleClick(customer); } } : {}),
                  }
                : {})}
            >
            <TouchableOpacity
              style={[
                styles.row,
                Platform.OS === 'web' && styles.rowGapWeb,
                idx % 2 === 1 ? styles.rowAlt : null,
                hoveredId === customer.id ? styles.rowHover : null,
              ]}
              onPress={() => {
                if (Platform.OS !== 'web' && onRowDoubleClick) {
                  const now = Date.now();
                  if (lastTapRef.current.customerId === customer.id && now - lastTapRef.current.time < DOUBLE_TAP_MS) {
                    lastTapRef.current = { customerId: '', time: 0 };
                    onRowDoubleClick(customer);
                    return;
                  }
                  lastTapRef.current = { customerId: customer.id, time: now };
                }
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
              <View style={[styles.cellFlex, col('name'), { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                <View style={styles.columnContent}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
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
                </View>
              </View>
              <View style={[styles.cellFixed, col('personalOrOrgNumber')]}>
                <View style={styles.columnContent}>
                  <Text style={styles.cellMuted} numberOfLines={1}>{safeText(customer.personalOrOrgNumber)}</Text>
                </View>
              </View>
              <View style={[styles.cellFlex, col('address')]}>
                <View style={styles.columnContent}>
                  <Text style={styles.cellMuted} numberOfLines={1}>{safeText(customer.address)}</Text>
                </View>
              </View>
              <View style={[styles.cellFixed, col('postalCode')]}>
                <View style={styles.columnContent}>
                  <Text style={styles.cellMuted} numberOfLines={1}>{safeText(customer.postalCode)}</Text>
                </View>
              </View>
              <View style={[styles.cellFlex, col('city')]}>
                <View style={styles.columnContent}>
                  <Text style={styles.cellMuted} numberOfLines={1}>{safeText(customer.city)}</Text>
                </View>
              </View>
              <View style={[styles.chipRow, styles.cellFixed, col('customerType')]}>
                <View style={styles.columnContent}>
                  <SelectDropdownChip
                    label={safeText(customer.customerType)}
                    removable={false}
                  />
                </View>
              </View>
              <View style={styles.cellSpacer} />
            </TouchableOpacity>
            </View>
          )}
          {expandedIds[customer.id] ? (
            <View style={styles.detailsRow}>
              <View style={styles.detailsInner}>
                <Text style={styles.contactHeader}>Kontaktpersoner</Text>
                {(contactMap[customer.id] || []).length > 0 ? (
                  <View style={styles.openContactTableWrap}>
                    <View style={styles.openContactTableHeader}>
                      <View style={[styles.cellFlex, { flex: FLEX_CONTACT.name }]}>
                        <Text style={styles.openContactTableHeaderCell}>Namn</Text>
                      </View>
                      <View style={[styles.cellFlex, { flex: FLEX_CONTACT.role }]}>
                        <Text style={styles.openContactTableHeaderCell}>Roll</Text>
                      </View>
                      <View style={[styles.cellFixed, { width: FIXED_CONTACT.mobile }]}>
                        <Text style={styles.openContactTableHeaderCell}>Mobil</Text>
                      </View>
                      <View style={[styles.cellFixed, { width: FIXED_CONTACT.workPhone }]}>
                        <Text style={styles.openContactTableHeaderCell}>Arbete</Text>
                      </View>
                      <View style={[styles.cellFlex, { flex: FLEX_CONTACT.email }]}>
                        <Text style={styles.openContactTableHeaderCell}>E-post</Text>
                      </View>
                      <View style={styles.openContactTableKebabCol} />
                    </View>
                    {(contactMap[customer.id] || []).map((contact, cIdx) => {
                      const workPhone = (contact as { workPhone?: string }).workPhone;
                      return (
                        <View
                          key={contact.id}
                          style={[
                            styles.openContactTableRow,
                            cIdx % 2 === 1 ? styles.openContactTableRowAlt : null,
                          ]}
                        >
                          <View style={[styles.cellFlex, { flex: FLEX_CONTACT.name }]}>
                            <Text style={[styles.openContactTableCell, { fontWeight: '500' }]} numberOfLines={1}>
                              {contact.name || '—'}
                            </Text>
                          </View>
                          <View style={[styles.cellFlex, { flex: FLEX_CONTACT.role }]}>
                            <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                              {contact.role?.trim() || '—'}
                            </Text>
                          </View>
                          <View style={[styles.cellFixed, { width: FIXED_CONTACT.mobile }]}>
                            <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                              {formatMobileDisplay(contact.phone) || '—'}
                            </Text>
                          </View>
                          <View style={[styles.cellFixed, { width: FIXED_CONTACT.workPhone }]}>
                            <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                              {workPhone?.trim() || '—'}
                            </Text>
                          </View>
                          <View style={[styles.cellFlex, { flex: FLEX_CONTACT.email }]}>
                            {contact.email?.trim() ? (
                              <TouchableOpacity
                                onPress={() => Linking.openURL(`mailto:${contact.email!.trim()}`)}
                                style={{ alignSelf: 'flex-start', paddingLeft: COLUMN_PADDING_LEFT, paddingRight: COLUMN_PADDING_RIGHT }}
                                activeOpacity={0.8}
                                {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseEnter: () => setOpenContactEmailHoverId(contact.id), onMouseLeave: () => setOpenContactEmailHoverId(null) } : {})}
                              >
                                <Text
                                  style={[
                                    styles.openContactEmailLink,
                                    openContactEmailHoverId === contact.id ? styles.openContactEmailLinkHover : null,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {contact.email.trim()}
                                </Text>
                              </TouchableOpacity>
                            ) : (
                              <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                                —
                              </Text>
                            )}
                          </View>
                          <View style={styles.openContactTableKebabCol}>
                            <TouchableOpacity
                              style={styles.rowMenuBtn}
                              onPress={(e) => onContactMenu?.(e, customer, contact)}
                              activeOpacity={0.8}
                              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                            >
                              <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: '#94a3b8', fontStyle: 'italic', marginBottom: 10 }}>Inga kontakter kopplade</Text>
                )}
                {!editingContactSection[customer.id] ? (
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#f8fafc', marginBottom: 10 }}
                    onPress={() => setEditingContactSection((prev) => ({ ...prev, [customer.id]: true }))}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Ionicons name="add" size={14} color="#64748b" />
                    <Text style={{ fontSize: 13, color: '#475569', fontWeight: '500' }}>Lägg till kontakt</Text>
                  </TouchableOpacity>
                ) : null}
                {editingContactSection[customer.id] ? (
                <>
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
                            setContactDrafts((prev) => ({ ...prev, [customer.id]: { name: '', role: '', email: '', phone: '' } }));
                            setEditingContactSection((prev) => ({ ...prev, [customer.id]: false }));
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
                        setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[customer.id]; return n; });
                        setContactDrafts((prev) => ({ ...prev, [customer.id]: { name: '', role: '', email: '', phone: '' } }));
                        setEditingContactSection((prev) => ({ ...prev, [customer.id]: false }));
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
                        setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[customer.id]; return n; });
                        setContactDrafts((prev) => ({ ...prev, [customer.id]: { name: '', role: '', email: '', phone: '' } }));
                        setEditingContactSection((prev) => ({ ...prev, [customer.id]: false }));
                      }}
                    >
                      <Text style={styles.contactHintBtnText}>Skapa ny</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                <TouchableOpacity
                  style={{ marginTop: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e2e8f0', alignSelf: 'flex-start' }}
                  onPress={() => {
                    setEditingContactSection((prev) => ({ ...prev, [customer.id]: false }));
                    setContactDrafts((prev) => ({ ...prev, [customer.id]: { name: '', role: '', email: '', phone: '' } }));
                    setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[customer.id]; return n; });
                  }}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  <Text style={{ fontSize: 13, color: '#475569', fontWeight: '500' }}>Avbryt</Text>
                </TouchableOpacity>
                </>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
