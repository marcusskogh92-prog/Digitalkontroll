/**
 * Tabell för leverantörer – samma DataGrid-pattern som Kunder/Kontaktregister.
 *
 * KOLUMNORDNING (LÅST – FÅR INTE ÄNDRAS):
 * 1. Leverantör (vänster)
 * 2. Org-nr
 * 3. Ort
 * 4. Kategori
 * 5. Kebab (alltid längst till höger, fast)
 *
 * Inline-redigering med Enter/Esc och diskreta ✔ ✕.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useRef, useState } from 'react';
import { type ViewStyle, Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SelectDropdownOrig, { SelectDropdownChip } from '../../components/common/SelectDropdown';
/** Cast så att SelectDropdown accepterar våra props (keepOpenOnSelect/visible/onToggleVisible är inte krävda i körning – .js-komponenten). */
const SelectDropdown = SelectDropdownOrig as unknown as React.ComponentType<Record<string, unknown>>;
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';
import type { Supplier } from './leverantorerService';

/** Kolumnordning: Leverantör, Org-nr, Ort, Kategori, Kebab. Bredder: Leverantör 0.9, Org-nr 170px, Ort 160px, Kategori 1 (huvudyta), Kebab 30px + divider. */
const FLEX = { companyName: 0.9, category: 1 } as const;
const FIXED = { organizationNumber: 170, city: 160, actions: 30 } as const;
/** Edit-rad (öppet läge) använder även adress och postnr. */
const FLEX_FULL = { companyName: 0.9, category: 1, address: 1.6, city: 0.75 } as const;
const FIXED_FULL = { organizationNumber: 170, postalCode: 110, actions: 30 } as const;
/** Max antal kategori-chips i stängt läge innan "+X"; ingen horisontell scroll. */
const MAX_VISIBLE_CATEGORY_CHIPS = 5;

/** Kontakt-tabell i öppet läge: samma kolumnbredder som Kontaktregister (utan Företag). */
const FLEX_CONTACT = { name: 1.2, role: 1.1, email: 2 } as const;
const FIXED_CONTACT = { mobile: 130, workPhone: 150, actions: 30 } as const;

function formatMobileDisplay(value: string | undefined): string {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  const parts = [p1, p2, p3, p4].filter(Boolean);
  return parts.join(' ').trim();
}

export type SortColumn =
  | 'companyName'
  | 'organizationNumber'
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
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 4,
    paddingHorizontal: 14,
    backgroundColor: '#f1f5f9',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 4,
    flexShrink: 0,
    minWidth: 0,
  },
  /** Gemensam kolumn-wrapper: padding 4/6 så rubrik, input och data har samma start-X. Ingen extra padding per kolumn. */
  columnContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  columnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 6,
    alignSelf: 'stretch',
  },
  headerText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'left',
  },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  actionsCol: {
    width: FIXED.actions,
    minWidth: FIXED.actions,
    maxWidth: FIXED.actions,
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 2,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsColHeader: {
    backgroundColor: '#f1f5f9',
    paddingVertical: 4,
  },
  actionsColInline: { backgroundColor: '#eff6ff' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 2,
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
    padding: 16,
    paddingLeft: 26,
  },
  detailsInner: {
    maxWidth: 720,
  },
  /** Öppet läge: företagets header (summary) – alltid read-only */
  openSummary: {
    marginBottom: 20,
  },
  openSummaryTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 4,
  },
  openSummaryMeta: {
    fontSize: 13,
    color: '#64748b',
    lineHeight: 20,
  },
  /** Sektion (kort) – rubrik + innehåll + action */
  openSection: {
    marginBottom: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    padding: 14,
  },
  openSectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 10,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  openSectionContent: {
    minHeight: 24,
    marginBottom: 10,
  },
  openSectionContentMuted: {
    fontSize: 13,
    color: '#94a3b8',
    fontStyle: 'italic',
  },
  openActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  openActionBtnText: {
    fontSize: 13,
    color: '#475569',
    fontWeight: '500',
  },
  /** Chips i sektioner – max 2 rader, +X */
  openChipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    maxHeight: 56,
    overflow: 'hidden',
  },
  openChip: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  openChipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '500',
  },
  /** Kontaktlista: Namn – Roll */
  openContactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 8,
  },
  openContactItemLast: {
    borderBottomWidth: 0,
  },
  openContactItemText: {
    fontSize: 13,
    color: '#334155',
  },
  openContactItemRole: {
    fontSize: 13,
    color: '#64748b',
  },
  /** Kontakt-tabell (samma radstorlek/padding som Kontaktregister) */
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
  /** Relationer – kompakt sektion med + Byggdelar / + Konton / + Kategorier */
  openRelationerSection: {
    marginBottom: 20,
  },
  openRelationerTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  openRelationerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  openRelationerRowLast: {
    borderBottomWidth: 0,
  },
  openRelationerColLeft: {
    paddingRight: 12,
    minWidth: 120,
  },
  openRelationerColRight: {
    flex: 1,
    paddingLeft: 12,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
    minHeight: 24,
    justifyContent: 'center',
  },
  openRelationerLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
  },
  openRelationerValues: {
    fontSize: 11,
    color: '#94a3b8',
    marginTop: 0,
    marginLeft: 0,
  },
  openRelationerDropdownWrap: {
    marginTop: 6,
    marginBottom: 4,
    minWidth: 200,
    maxWidth: 400,
  },
  openRelationerHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  openRelationerActionLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
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
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: 2,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  categoryChipsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    flexWrap: 'nowrap',
    gap: 4,
    minWidth: 0,
    flex: 1,
  },
  categoryChip: {
    flexShrink: 0,
    maxWidth: 120,
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
    textAlign: 'left',
  },
  /** Input i tabellcell: fyll hela kolumnytan. Ingen egen padding/margin – padding ligger på columnContent. */
  inlineInputCell: {
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    alignSelf: 'stretch',
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
    textAlign: 'left',
  },
  cellMuted: {
    fontSize: 13,
    color: '#64748b',
    fontWeight: '400',
    textAlign: 'left',
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

/** Fältnamn för inline-rad (skapa/redigera). Används så att onInlineChange inte får typen never. */
export type InlineFieldKey = 'companyName' | 'organizationNumber' | 'address' | 'postalCode' | 'city' | 'category' | 'categories';

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
  /** Företagets kategorier (companies/{id}/categories) – används i expanderad rad. */
  companyCategories?: { id: string; name?: string }[];
  /** Företagets byggdelar (foretag/{id}/byggdelar) – används i expanderad rad. */
  companyByggdelar?: { id: string; code?: string; name?: string }[];
  /** Företagets kontoplan – används i expanderad rad. */
  companyKontoplan?: { id: string; konto?: string; benamning?: string }[];
  onCategoriesChange?: (supplier: Supplier, categoryIds: string[]) => void;
  onByggdelarChange?: (supplier: Supplier, byggdelCodes: string[]) => void;
  onKontonChange?: (supplier: Supplier, konton: string[]) => void;
  /** Vid klick "+ Byggdelar" / "+ Konton" / "+ Kategorier" – om satt öppnas modal istället för inline-dropdown. */
  onOpenByggdelar?: (supplier: Supplier) => void;
  onOpenKonton?: (supplier: Supplier) => void;
  onOpenKategorier?: (supplier: Supplier) => void;
  /** Öppna Kategori-modalen från inline "lägg till"-radens kategorifält (istället för dropdown). */
  onOpenKategoriForInlineAdd?: () => void;
  inlineEnabled?: boolean;
  inlineValues?: {
    companyName: string;
    organizationNumber: string;
    address?: string;
    postalCode?: string;
    city: string;
    category?: string;
    /** Kategori-ids från kategoriregistret (create-row när companyCategories används). */
    categories?: string[];
  };
  inlineSaving?: boolean;
  onInlineChange?: (field: InlineFieldKey, value: string | string[]) => void;
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
  companyCategories = [],
  companyByggdelar = [],
  companyKontoplan = [],
  onCategoriesChange,
  onByggdelarChange,
  onKontonChange,
  onOpenByggdelar,
  onOpenKonton,
  onOpenKategorier,
  onOpenKategoriForInlineAdd,
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
  /** Vilken sektion som är i redigeringsläge per leverantör (null = alla i läsläge). */
  const [editingSection, setEditingSection] = useState<Record<string, 'categories' | 'byggdelar' | 'konton' | 'contacts' | 'address' | null>>({});
  /** E-postlänk hover (för underline) i öppet läge kontakt-tabell. */
  const [openContactEmailHoverId, setOpenContactEmailHoverId] = useState<string | null>(null);
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
  const inlineCategoryTriggerRef = useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  const editCategoryTriggerRef = useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  /** När användaren stänger Kategori-modalen återförs fokus till triggern och onFocus körs igen – ignorera det. */
  const categoryModalJustOpenedRef = useRef(false);
  const contactMap = useMemo(() => contactsBySupplierId, [contactsBySupplierId]);

  const blurTrigger = (ref: React.MutableRefObject<unknown>): void => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    setTimeout(() => {
      const el = ref.current as HTMLElement | { blur?: () => void } | null;
      if (el?.blur) el.blur();
      else if (typeof document !== 'undefined' && document.activeElement && (document.activeElement as HTMLElement).blur) {
        (document.activeElement as HTMLElement).blur();
      }
    }, 0);
  };

  const handleInlineCategoryFocus = (): void => {
    if (categoryModalJustOpenedRef.current) {
      categoryModalJustOpenedRef.current = false;
      return;
    }
    onOpenKategoriForInlineAdd?.();
    categoryModalJustOpenedRef.current = true;
    blurTrigger(inlineCategoryTriggerRef);
  };

  const handleEditCategoryFocus = (supplier: Supplier): void => {
    if (categoryModalJustOpenedRef.current) {
      categoryModalJustOpenedRef.current = false;
      return;
    }
    onOpenKategorier?.(supplier);
    categoryModalJustOpenedRef.current = true;
    blurTrigger(editCategoryTriggerRef);
  };

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
  }, [editingId, editingSupplier]);

  /** Resolverar kategori-ids till namn om companyCategories finns; annars används värden som namn (legacy). */
  const getCategoryNames = (supplier: Supplier): string[] => {
    const raw = Array.isArray(supplier.categories) && supplier.categories.length
      ? supplier.categories
      : supplier.category
        ? [supplier.category]
        : [];
    if (!raw.length) return [];
    if (companyCategories.length > 0) {
      return raw.map((id) => companyCategories.find((c) => c.id === id)?.name ?? id);
    }
    return raw;
  };

  /** I stängt läge: visa upp till MAX_VISIBLE_CATEGORY_CHIPS chips, sedan "+X" för resten. */
  const getCategoryChipsForRow = (supplier: Supplier): { visible: string[]; overflow: number } => {
    const list = getCategoryNames(supplier);
    if (!list.length) return { visible: [], overflow: 0 };
    const visible = list.slice(0, MAX_VISIBLE_CATEGORY_CHIPS);
    const overflow = Math.max(0, list.length - MAX_VISIBLE_CATEGORY_CHIPS);
    return { visible, overflow };
  };

  const getCategoryList = (supplier: Supplier): string[] => getCategoryNames(supplier);


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

  /** Web: sticky kebab-kolumn. RN ViewStyle saknar 'sticky' – cast så TS godtar det på web. */
  const stickyRight: ViewStyle = Platform.OS === 'web' ? ({ position: 'sticky', right: 0 } as unknown as ViewStyle) : {};

  return (
    <View style={styles.tableWrap}>
      {/* Kolumnordning LÅST: 1 Leverantör, 2 Org-nr, 3 Ort, 4 Kategori, 5 Kebab. columnContent = samma startpunkt för rubrik/input/cell. */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.companyName }]}
          onPress={() => onSort('companyName')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Leverantör</Text>
            <SortIcon col="companyName" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.organizationNumber }]}
          onPress={() => onSort('organizationNumber')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Org-nr</Text>
            <SortIcon col="organizationNumber" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.city }]}
          onPress={() => onSort('city')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Ort</Text>
            <SortIcon col="city" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.category }]}
          onPress={() => onSort('category')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Kategori</Text>
            <SortIcon col="category" />
          </View>
        </TouchableOpacity>
        <View style={[styles.actionsCol, styles.actionsColHeader, stickyRight]} />
      </View>
      {inlineEnabled ? (
        <View style={styles.inlineRow}>
          <View style={[styles.cellFlex, { flex: FLEX.companyName }]}>
            <View style={styles.columnContent}>
              <TextInput
                value={inlineValues?.companyName ?? ''}
                onChangeText={(v) => onInlineChange?.('companyName', v)}
                placeholder="Leverantör (ny)"
                returnKeyType="done"
                blurOnSubmit={true}
                onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
            </View>
          </View>
          <View style={[styles.cellFixed, { width: FIXED.organizationNumber }]}>
            <View style={styles.columnContent}>
              <TextInput
                value={inlineValues?.organizationNumber ?? ''}
                onChangeText={(v) => onInlineChange?.('organizationNumber', v)}
                placeholder="Org-nr (ny)"
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
            </View>
          </View>
          <View style={[styles.cellFixed, { width: FIXED.city }]}>
            <View style={styles.columnContent}>
              <TextInput
                value={inlineValues?.city ?? ''}
                onChangeText={(v) => onInlineChange?.('city', v)}
                placeholder="Ort (ny)"
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
            </View>
          </View>
          {onOpenKategoriForInlineAdd ? (
            <View style={[styles.cellFlex, { flex: FLEX.category }]}>
              <View style={styles.columnContent}>
                <TouchableOpacity
                  ref={inlineCategoryTriggerRef}
                  style={[styles.inlineSelectField, { minHeight: 32, justifyContent: 'center' }]}
                  onPress={() => {
                    onOpenKategoriForInlineAdd?.();
                    categoryModalJustOpenedRef.current = true;
                    blurTrigger(inlineCategoryTriggerRef);
                  }}
                  onFocus={handleInlineCategoryFocus}
                  activeOpacity={0.8}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' as const, tabIndex: 0 } : {})}
                >
                  <Text style={{ fontSize: 13, color: (inlineValues?.categories?.length ?? 0) > 0 ? '#111' : '#94a3b8' }} numberOfLines={1}>
                    {(inlineValues?.categories?.length ?? 0) > 0
                      ? `${inlineValues?.categories?.length ?? 0} kategorier valda`
                      : 'Klicka för att välja kategorier'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : companyCategories.length > 0 ? (
            <View style={[styles.cellFlex, { flex: FLEX.category }]}>
              <View style={styles.columnContent}>
                <SelectDropdown
                  value={Array.isArray(inlineValues?.categories) ? inlineValues.categories : []}
                  options={companyCategories.map((c) => ({ value: c.id, label: c.name ?? c.id }))}
                  multiple
                  searchable
                  placeholder="Kategorier"
                  onChange={(next: string[]) => onInlineChange?.('categories', next)}
                  usePortal={true}
                  fieldStyle={[styles.inlineSelectField, { minHeight: 32 }]}
                  listStyle={styles.inlineSelectList}
                  inputStyle={{ fontSize: 13, color: '#111' }}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.cellFlex, { flex: FLEX.category }]}>
              <View style={styles.columnContent}>
                <TextInput
                  value=""
                  editable={false}
                  placeholder="Inga kategorier i registret"
                  style={[styles.inlineInput, styles.inlineInputCell, { flex: 1, backgroundColor: '#f8fafc', color: '#94a3b8' }]}
                  placeholderTextColor="#94a3b8"
                />
              </View>
            </View>
          )}
          <View style={[styles.actionsCol, styles.actionsColInline, stickyRight]} />
        </View>
      ) : null}
      {suppliers.map((supplier, idx) => (
        <View key={supplier.id}>
          {editingId === supplier.id && editDraft ? (
            <View style={styles.editRow}>
              <View style={[styles.cellFlex, { flex: FLEX_FULL.companyName }]}>
                <View style={styles.columnContent}>
                  <TextInput
                    value={editDraft.companyName}
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, companyName: v } : d))}
                    placeholder="Leverantör"
                    style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
                  />
                </View>
              </View>
              <View style={[styles.cellFixed, { width: FIXED_FULL.organizationNumber }]}>
                <View style={styles.columnContent}>
                  <TextInput
                    value={editDraft.organizationNumber}
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, organizationNumber: v } : d))}
                    placeholder="Org-nr"
                    style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
                  />
                </View>
              </View>
              <View style={[styles.cellFlex, { flex: FLEX_FULL.address }]}>
                <View style={styles.columnContent}>
                  <TextInput
                    value={editDraft.address}
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, address: v } : d))}
                    placeholder="Adress"
                    style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
                  />
                </View>
              </View>
              <View style={[styles.cellFixed, { width: FIXED_FULL.postalCode }]}>
                <View style={styles.columnContent}>
                  <TextInput
                    value={editDraft.postalCode}
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, postalCode: v } : d))}
                    placeholder="Postnr"
                    style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
                  />
                </View>
              </View>
              <View style={[styles.cellFlex, { flex: FLEX_FULL.city }]}>
                <View style={styles.columnContent}>
                  <TextInput
                    value={editDraft.city}
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, city: v } : d))}
                    placeholder="Ort"
                    style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => handleEditKeyDown(e, supplier) } : {})}
                  />
                </View>
              </View>
              {onOpenKategorier ? (
                <View style={[styles.cellFlex, { flex: FLEX_FULL.category }]}>
                  <View style={styles.columnContent}>
                    <TouchableOpacity
                      ref={editCategoryTriggerRef}
                      style={[styles.inlineSelectField, { minHeight: 32, justifyContent: 'center' }]}
                      onPress={() => {
                        onOpenKategorier?.(supplier);
                        categoryModalJustOpenedRef.current = true;
                        blurTrigger(editCategoryTriggerRef);
                      }}
                      onFocus={() => handleEditCategoryFocus(supplier)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' as const, tabIndex: 0 } : {})}
                    >
                      <Text style={{ fontSize: 13, color: getCategoryNames(supplier).length > 0 ? '#111' : '#94a3b8' }} numberOfLines={1}>
                        {getCategoryNames(supplier).length > 0
                          ? getCategoryNames(supplier).slice(0, 3).join(', ') + (getCategoryNames(supplier).length > 3 ? '…' : '')
                          : 'Klicka för att välja kategorier'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : companyCategories.length > 0 ? (
                <View style={[styles.cellFlex, { flex: FLEX_FULL.category }]}>
                  <View style={styles.columnContent}>
                    <SelectDropdown
                      value={editDraft.category}
                      options={companyCategories.map((c) => ({ value: c.id, label: c.name ?? c.id }))}
                      placeholder="Kategori"
                      searchable
                      onSelect={(next: string) => setEditDraft((d) => (d ? { ...d, category: String(next) } : d))}
                      usePortal={true}
                      fieldStyle={[styles.inlineSelectField, { minHeight: 32 }]}
                      listStyle={styles.inlineSelectList}
                      inputStyle={{ fontSize: 13, color: '#111' }}
                    />
                  </View>
                </View>
              ) : (
                <View style={[styles.cellFlex, { flex: FLEX_FULL.category }]}>
                  <View style={styles.columnContent}>
                    <TextInput
                      value={editDraft.category}
                      onChangeText={(v) => setEditDraft((d) => (d ? { ...d, category: v } : d))}
                      placeholder="Inga kategorier i registret"
                      style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                      placeholderTextColor="#94a3b8"
                      {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                  </View>
                </View>
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
              <View style={[styles.cellFlex, { flex: FLEX.companyName }]}>
                <View style={[styles.columnContent, styles.columnContentRow]}>
                  <Ionicons
                    name="chevron-forward"
                    size={14}
                    color="#94a3b8"
                    style={{ transform: [{ rotate: expandedIds[supplier.id] ? '90deg' : '0deg' }] }}
                  />
                  <Text style={styles.cellText} numberOfLines={1}>
                    {supplier.companyName || '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFixed, { width: FIXED.organizationNumber }]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {supplier.organizationNumber || '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFixed, { width: FIXED.city }]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {safeText(supplier.city)}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFlex, { flex: FLEX.category }]}>
                <View style={[styles.columnContent, styles.categoryChipsWrap]}>
                {(() => {
                  const { visible, overflow } = getCategoryChipsForRow(supplier);
                  if (!visible.length && !overflow) {
                    return <SelectDropdownChip label="—" removable={false} onRemove={() => {}} title="—" />;
                  }
                  return (
                    <>
                      {visible.map((name) => (
                        <View key={name} style={styles.categoryChip}>
                          <SelectDropdownChip label={name} removable={false} onRemove={() => {}} title={name} />
                        </View>
                      ))}
                      {overflow > 0 ? (
                        <View style={styles.categoryChip}>
                          <SelectDropdownChip label={`+${overflow}`} removable={false} onRemove={() => {}} title={`+${overflow}`} />
                        </View>
                      ) : null}
                    </>
                  );
                })()}
                </View>
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
                {/* A. Företagets header (summary) – read-only */}
                <View style={styles.openSummary}>
                  <Text style={styles.openSummaryTitle} numberOfLines={1}>
                    {supplier.companyName || '—'}
                  </Text>
                  <Text style={styles.openSummaryMeta} numberOfLines={1}>
                    {[
                      'Leverantör',
                      getCategoryList(supplier).slice(0, 2).join(', ') || null,
                      supplier.city?.trim() || null,
                    ]
                      .filter(Boolean)
                      .join(' • ')}
                  </Text>
                </View>

                {/* Relationer – tvåkolumnslayout: vänster action, höger kopplade värden, vertikal divider */}
                <View style={styles.openRelationerSection}>
                  <Text style={styles.openRelationerTitle}>Relationer</Text>
                  <View style={styles.openRelationerRow}>
                    <View style={styles.openRelationerColLeft}>
                      <TouchableOpacity
                        onPress={() => {
                          if (onOpenByggdelar) onOpenByggdelar(supplier);
                          else setEditingSection((prev) => ({ ...prev, [supplier.id]: 'byggdelar' }));
                        }}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={styles.openRelationerLink}>+ Byggdelar</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.openRelationerColRight}>
                      {Array.isArray(supplier.byggdelTags) && supplier.byggdelTags.length > 0 ? (
                        <Text style={styles.openRelationerValues} numberOfLines={1}>
                          {(supplier.byggdelTags as string[])
                            .slice(0, 5)
                            .map((code) => {
                              const b = companyByggdelar.find((x) => (x.code ?? x.id) === code);
                              return b ? (b.name ?? b.code ?? code) : code;
                            })
                            .join(', ')}
                          {(supplier.byggdelTags?.length ?? 0) > 5 ? ` +${(supplier.byggdelTags?.length ?? 0) - 5}` : ''}
                        </Text>
                      ) : null}
                      {!onOpenByggdelar && editingSection[supplier.id] === 'byggdelar' && companyByggdelar.length > 0 && onByggdelarChange ? (
                        <View style={styles.openRelationerDropdownWrap}>
                          <SelectDropdown
                            value={Array.isArray(supplier.byggdelTags) ? supplier.byggdelTags : []}
                            options={companyByggdelar.map((b) => ({
                              value: b.code ?? b.id,
                              label: [b.code, b.name].filter(Boolean).join(' – ') || b.id,
                            }))}
                            multiple
                            searchable
                            placeholder="Välj byggdelar"
                            onChange={(next: string[]) => {
                              onByggdelarChange(supplier, next);
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            }}
                            usePortal={true}
                            fieldStyle={styles.inlineSelectField}
                            listStyle={styles.inlineSelectList}
                            inputStyle={{ fontSize: 13, color: '#111' }}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.openRelationerRow}>
                    <View style={styles.openRelationerColLeft}>
                      <TouchableOpacity
                        onPress={() => {
                          if (onOpenKonton) onOpenKonton(supplier);
                          else setEditingSection((prev) => ({ ...prev, [supplier.id]: 'konton' }));
                        }}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={styles.openRelationerLink}>+ Konton</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.openRelationerColRight}>
                      {Array.isArray(supplier.konton) && supplier.konton.length > 0 ? (
                        <Text style={styles.openRelationerValues} numberOfLines={1}>
                          {(supplier.konton as string[]).slice(0, 5).join(', ')}
                          {(supplier.konton?.length ?? 0) > 5 ? ` +${(supplier.konton?.length ?? 0) - 5}` : ''}
                        </Text>
                      ) : null}
                      {!onOpenKonton && editingSection[supplier.id] === 'konton' && companyKontoplan.length > 0 && onKontonChange ? (
                        <View style={styles.openRelationerDropdownWrap}>
                          <SelectDropdown
                            value={Array.isArray(supplier.konton) ? supplier.konton : []}
                            options={companyKontoplan.map((k) => ({
                              value: k.konto ?? k.id,
                              label: [k.konto, k.benamning].filter(Boolean).join(' – ') || k.id,
                            }))}
                            multiple
                            searchable
                            placeholder="Välj konton"
                            onChange={(next: string[]) => {
                              onKontonChange(supplier, next);
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            }}
                            usePortal={true}
                            fieldStyle={styles.inlineSelectField}
                            listStyle={styles.inlineSelectList}
                            inputStyle={{ fontSize: 13, color: '#111' }}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={[styles.openRelationerRow, styles.openRelationerRowLast]}>
                    <View style={styles.openRelationerColLeft}>
                      <TouchableOpacity
                        onPress={() => {
                          if (onOpenKategorier) onOpenKategorier(supplier);
                          else setEditingSection((prev) => ({ ...prev, [supplier.id]: 'categories' }));
                        }}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={styles.openRelationerLink}>+ Kategorier</Text>
                      </TouchableOpacity>
                    </View>
                    <View style={styles.openRelationerColRight}>
                      {getCategoryList(supplier).length > 0 ? (
                        <Text style={styles.openRelationerValues} numberOfLines={1}>
                          {getCategoryList(supplier).slice(0, 5).join(', ')}
                          {getCategoryList(supplier).length > 5 ? ` +${getCategoryList(supplier).length - 5}` : ''}
                        </Text>
                      ) : null}
                      {!onOpenKategorier && editingSection[supplier.id] === 'categories' && companyCategories.length > 0 && onCategoriesChange ? (
                        <View style={styles.openRelationerDropdownWrap}>
                          <SelectDropdown
                            value={Array.isArray(supplier.categories) ? supplier.categories : []}
                            options={companyCategories.map((c) => ({ value: c.id, label: c.name ?? c.id }))}
                            multiple
                            searchable
                            placeholder="Välj kategorier"
                            onChange={(next: string[]) => {
                              onCategoriesChange(supplier, next);
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            }}
                            usePortal={true}
                            fieldStyle={styles.inlineSelectField}
                            listStyle={styles.inlineSelectList}
                            inputStyle={{ fontSize: 13, color: '#111' }}
                          />
                        </View>
                      ) : null}
                    </View>
                  </View>
                </View>

                {/* Kontaktpersoner – rubrik och + Lägg till kontakt på samma rad, högerjusterad action */}
                <View style={styles.openRelationerSection}>
                  <View style={styles.openRelationerHeaderRow}>
                    <Text style={styles.openRelationerTitle}>Kontaktpersoner</Text>
                    {editingSection[supplier.id] !== 'contacts' ? (
                      <TouchableOpacity
                        onPress={() => setEditingSection((prev) => ({ ...prev, [supplier.id]: 'contacts' }))}
                        activeOpacity={0.8}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={styles.openRelationerActionLink}>+ Lägg till kontakt</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={styles.openSectionContent}>
                    {(contactMap[supplier.id] || []).length > 0 ? (
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
                        {(contactMap[supplier.id] || []).map((contact, cIdx) => {
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
                                  onPress={(e) => onContactMenu?.(e, supplier, contact)}
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
                      <Text style={styles.openSectionContentMuted}>Inga kontakter kopplade</Text>
                    )}
                  </View>
                  {editingSection[supplier.id] === 'contacts' ? (
                    <>
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
                        <TextInput
                          value={contactDrafts[supplier.id]?.name ?? ''}
                          onChangeText={(v) =>
                            setContactDrafts((prev) => ({
                              ...prev,
                              [supplier.id]: { name: v, role: prev[supplier.id]?.role || '', email: prev[supplier.id]?.email || '', phone: prev[supplier.id]?.phone || '' },
                            }))
                          }
                          placeholder="Namn"
                          style={[styles.contactInput, { minWidth: 140, flex: 1 }]}
                          placeholderTextColor="#94a3b8"
                          {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
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
                          style={[styles.contactInput, { minWidth: 100 }]}
                          placeholderTextColor="#94a3b8"
                          {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
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
                          style={[styles.contactInput, { minWidth: 140 }]}
                          placeholderTextColor="#94a3b8"
                          {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                        />
                        <TouchableOpacity
                          style={[styles.openActionBtn, { backgroundColor: '#e0f2fe' }]}
                          onPress={() => submitDraft(supplier)}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                        >
                          <Text style={styles.openActionBtnText}>Lägg till</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={styles.openActionBtn}
                          onPress={() => {
                            setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '' } }));
                            setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                          }}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                        >
                          <Text style={styles.openActionBtnText}>Avbryt</Text>
                        </TouchableOpacity>
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
                          <View style={[styles.contactSuggestWrap, { marginBottom: 8 }]}>
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
                                  setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '' } }));
                                  setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                                }}
                                activeOpacity={0.8}
                                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                              >
                                <Text style={styles.contactSuggestText}>{m.name}</Text>
                                {m.email ? <Text style={[styles.contactSuggestText, { color: '#64748b' }]}>{m.email}</Text> : null}
                              </TouchableOpacity>
                            ))}
                          </View>
                        );
                      })()}
                      {duplicatePrompt[supplier.id] ? (
                        <View style={styles.contactHint}>
                          <Text style={styles.contactHintText}>Det finns redan en kontakt som matchar. Vill du använda befintlig eller skapa ny?</Text>
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
                              setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                              setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '' } }));
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
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
                              setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                              setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '' } }));
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            }}
                          >
                            <Text style={styles.contactHintBtnText}>Skapa ny</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                </View>

                {/* F. Adress & metadata */}
                <View style={styles.openSection}>
                  <Text style={styles.openSectionTitle}>Adress & metadata</Text>
                  <View style={styles.openSectionContent}>
                    <Text style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
                      Org-nr: {safeText(supplier.organizationNumber)}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#334155', marginBottom: 4 }}>
                      Ort: {safeText(supplier.city)}
                    </Text>
                    <Text style={{ fontSize: 13, color: '#334155' }} numberOfLines={2}>
                      Adress: {[supplier.address, [supplier.postalCode, supplier.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    style={styles.openActionBtn}
                    onPress={() => onRowMenu?.(undefined, supplier)}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Ionicons name="pencil" size={14} color="#64748b" />
                    <Text style={styles.openActionBtnText}>Redigera</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
