/**
 * Tabell för leverantörer – samma DataGrid-pattern som Kunder/Kontaktregister.
 *
 * KOLUMNORDNING:
 * 1. Leverantör (vänster)
 * 2. Org-nr
 * 3. Ort
 * 4. Kategori
 * 5. Byggdelar
 *
 * Inline-redigering med Enter/Esc och diskreta ✔ ✕.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { type ViewStyle, Linking, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import SelectDropdownOrig from '../../components/common/SelectDropdown';
/** Cast så att SelectDropdown accepterar våra props (keepOpenOnSelect/visible/onToggleVisible är inte krävda i körning – .js-komponenten). */
const SelectDropdown = SelectDropdownOrig as unknown as React.ComponentType<Record<string, unknown>>;
import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';
import { formatOrganizationNumber } from '../../utils/formatOrganizationNumber';
import type { Supplier } from './leverantorerService';

/** Kolumnordning: Leverantör, Org-nr, Ort, Kategori, Byggdelar. På webb justerbara via resize-handtag. */
const DEFAULT_COLUMN_WIDTHS = { companyName: 220, organizationNumber: 170, city: 160, category: 200, byggdelar: 200 } as const;
const MIN_COLUMN_WIDTH = 60;
const RESIZE_HANDLE_WIDTH = 6;
const FLEX = { companyName: 0.9, category: 1, byggdelar: 1 } as const;
const FIXED = { organizationNumber: 170, city: 160, actions: 30 } as const;
/** Edit-rad (öppet läge) använder även adress och postnr. */
const FLEX_FULL = { companyName: 0.9, category: 1, byggdelar: 1, address: 1.6, city: 0.75 } as const;
const FIXED_FULL = { organizationNumber: 170, postalCode: 110, actions: 30 } as const;
/** Kontakt-tabell i öppet läge: samma kolumner som Kontaktregister (Namn, Företag, Roll, Mobil, Arbete, E-post). */
const FLEX_CONTACT = { name: 1.2, company: 1.1, role: 1.1, email: 2 } as const;
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
  | 'category'
  | 'byggdelar';
export type SortDirection = 'asc' | 'desc';

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: MODAL_DESIGN_2026.tableRadius,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minWidth: '100%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
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
  headerGapWeb: { gap: 0 },
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
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsColHeader: {
    backgroundColor: '#f1f5f9',
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
  },
  actionsColInline: { backgroundColor: 'transparent' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-start',
    gap: 8,
    minHeight: MODAL_DESIGN_2026.tableRowHeight,
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  rowAlt: {
    backgroundColor: '#f8fafc',
  },
  rowGapWeb: { gap: RESIZE_HANDLE_WIDTH },
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
    paddingVertical: 16,
    paddingHorizontal: 26,
  },
  detailsInner: {
    width: '100%',
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
  /** Små ikonknappar för Lägg till (bock) och Avbryt (x) på samma rad som kontaktfälten */
  openContactActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  openContactActionIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
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
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
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
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#fff',
  },
  openContactTableRowAlt: {
    backgroundColor: '#f8fafc',
  },
  openContactTableRowHover: {
    backgroundColor: '#eef6ff',
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
    marginBottom: 8,
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
  /** Expander-sektion: rubrik + "Lägg till kontakt" direkt till höger om rubriken */
  expanderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 8,
    paddingHorizontal: 0,
    marginBottom: 0,
  },
  expanderHeaderTouchable: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  /** "Lägg till kontakt" – extra marginal vänster så den linjerar visuellt med rubriken */
  expanderHeaderActionLink: {
    marginLeft: 8,
  },
  expanderChevron: {
    width: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  /** Tydlig avdelare mellan expanderad leverantör (kontakter) och nästa rad i listan */
  detailsDivider: {
    height: 2,
    backgroundColor: '#cbd5e1',
    marginVertical: 16,
    marginHorizontal: 0,
    borderRadius: 1,
  },
  /** Flikar Information / Kontaktpersoner */
  detailsTabsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 0,
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  detailsTab: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderBottomWidth: 2,
    borderBottomColor: 'transparent',
    marginBottom: -1,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  detailsTabActive: {
    borderBottomColor: '#2563eb',
  },
  detailsTabLabel: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
  },
  detailsTabLabelActive: {
    color: '#2563eb',
    fontWeight: '600',
  },
  /** Information-fliken: etikett-värde rader */
  infoGrid: {
    marginBottom: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 12,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
    minWidth: 130,
  },
  infoValue: {
    flex: 1,
    fontSize: 13,
    color: '#0f172a',
  },
  infoLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  /** "Ändra" som blå textlänk (samma stil som "Lägg till kontakt") */
  infoAndraLink: {
    fontSize: 13,
    color: '#2563eb',
    fontWeight: '500',
    marginTop: 2,
    alignSelf: 'flex-start' as const,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {}),
  },
  infoRowHover: {
    backgroundColor: '#f8fafc',
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
  /** Roll-dropdown: flyter över tabellinnehåll så ingen divider skär igenom */
  roleDropdownWrap: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 2,
    zIndex: 9999,
    borderWidth: 1,
    borderColor: '#cbd5e1',
    borderRadius: 8,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { boxShadow: '0 6px 16px rgba(0,0,0,0.12)' } : { elevation: 12 }),
    maxHeight: 200,
    overflow: 'hidden',
  },
  roleDropdownRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
  roleDropdownRowLast: {
    borderBottomWidth: 0,
  },
  roleDropdownRowHighlight: {
    backgroundColor: '#e0f2fe',
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
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDBA74',
    backgroundColor: '#FFF7ED',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flexWrap: 'wrap',
  },
  contactHintIcon: {
    fontSize: 18,
  },
  contactHintText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
    minWidth: 180,
  },
  contactHintBtn: {
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#0F172A',
  },
  contactHintBtnText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '600',
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
    minHeight: MODAL_DESIGN_2026.tableRowHeight,
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
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
    minHeight: MODAL_DESIGN_2026.tableRowHeight,
    paddingVertical: MODAL_DESIGN_2026.tableCellPaddingVertical,
    paddingHorizontal: MODAL_DESIGN_2026.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#f0f9ff',
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
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' } : {}),
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
  onRowDoubleClick?: (supplier: Supplier) => void;
  categoryFilters?: string[];
  onCategoryFiltersChange?: (next: string[]) => void;
  contactRegistry?: { id: string; name: string; email?: string; phone?: string; role?: string }[];
  contactsBySupplierId?: Record<string, { id: string; name: string; role?: string; email?: string; phone?: string }[]>;
  onContactMenu?: (e: unknown, supplier: Supplier, contact: { id: string; name: string; role?: string; email?: string; phone?: string }) => void;
  onAddContact?: (supplier: Supplier, contact: { name: string; role?: string; email?: string; phone?: string; workPhone?: string }) => void;
  onRemoveContact?: (supplier: Supplier, contactId: string) => void;
  onLinkContact?: (
    supplier: Supplier,
    contactId: string,
    patch?: { role?: string; phone?: string; workPhone?: string; email?: string; contactCompanyName?: string }
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
  /** Öppna "Redigera leverantör"-modalen (org.nr, adress, kategori m.m.) från Information-fliken. */
  onEditSupplier?: (supplier: Supplier) => void;
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
  /** Efter sparning från Byggdel/Konton/Kategori-modal: håll denna leverantör expanderad. */
  keepExpandedSupplierId?: string | null;
}

export default function LeverantorerTable({
  suppliers,
  sortColumn,
  sortDirection,
  onSort,
  onRowPress,
  onRowContextMenu,
  onRowMenu,
  onRowDoubleClick,
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
  onEditSupplier,
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
  keepExpandedSupplierId,
}: LeverantorerTableProps): React.ReactElement {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [hoveredContactId, setHoveredContactId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Record<string, boolean>>({});
  /** Aktiv flik i expanderad rad: Information | Kontaktpersoner */
  const [detailsTabBySupplierId, setDetailsTabBySupplierId] = useState<Record<string, 'information' | 'kontaktpersoner'>>({});
  /** Relationer-sektion expanderad (default stängd) – används ej med flikar, behålls för kompatibilitet. */
  const [relationerExpandedIds, setRelationerExpandedIds] = useState<Record<string, boolean>>({});
  /** Kontaktpersoner-sektion expanderad (default öppen) – används när flik Kontaktpersoner är vald. */
  const [kontaktpersonerExpandedIds, setKontaktpersonerExpandedIds] = useState<Record<string, boolean>>({});
  /** Vilken sektion som är i redigeringsläge per leverantör (null = alla i läsläge). */
  const [editingSection, setEditingSection] = useState<Record<string, 'categories' | 'byggdelar' | 'konton' | 'contacts' | 'address' | null>>({});
  /** E-postlänk hover (för underline) i öppet läge kontakt-tabell. */
  const [openContactEmailHoverId, setOpenContactEmailHoverId] = useState<string | null>(null);
  /** Hover på Information-flikens rader (org, address, category, byggdelar, konto) för visuell feedback + högerklick. */
  const [infoRowHover, setInfoRowHover] = useState<string | null>(null);
  const [contactDrafts, setContactDrafts] = useState<Record<string, { name: string; role: string; email: string; phone: string; workPhone: string }>>({});
  /** Highlight-index för piltangent-navigering i roll-dropdown (per leverantör). */
  const [roleDropdownHighlight, setRoleDropdownHighlight] = useState<Record<string, number>>({});
  const [duplicatePrompt, setDuplicatePrompt] = useState<Record<string, { contactId: string; label: string }>>({});
  const [editDraft, setEditDraft] = useState<{
    companyName: string;
    organizationNumber: string;
    address: string;
    postalCode: string;
    city: string;
    category: string;
  } | null>(null);

  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef<{ column: keyof typeof DEFAULT_COLUMN_WIDTHS | null; startX: number; startWidth: number }>({ column: null, startX: 0, startWidth: 0 });

  const w = columnWidths;
  const col = (key: keyof typeof DEFAULT_COLUMN_WIDTHS) => ({ width: w[key], minWidth: w[key], flexShrink: 0 });
  /** Kategori-kolumnen får flex: 1 så att den fyller resterande bredd i modalen. */
  const colCategory = () => ({ flex: 1, minWidth: w.category, flexShrink: 0 });
  /** Byggdelar-kolumnen får flex: 1 så att den fyller resterande bredd. */
  const colByggdelar = () => ({ flex: 1, minWidth: w.byggdelar, flexShrink: 0 });

  const startResize = useCallback((column: keyof typeof DEFAULT_COLUMN_WIDTHS, e: React.MouseEvent) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = (e as unknown as { clientX?: number }).clientX ?? e.nativeEvent?.pageX ?? 0;
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

  const kebabRefs = useRef<Record<string, { focus?: () => void } | null>>({});
  const lastTapRef = useRef<{ supplierId: string; time: number }>({ supplierId: '', time: 0 });
  const DOUBLE_TAP_MS = 350;
  const inlineCategoryTriggerRef = useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  const editCategoryTriggerRef = useRef<React.ComponentRef<typeof TouchableOpacity> | null>(null);
  const duplicatePromptRef = useRef<View | null>(null);
  /** När användaren stänger Kategori-modalen återförs fokus till triggern och onFocus körs igen – ignorera det. */
  const categoryModalJustOpenedRef = useRef(false);
  const contactMap = useMemo(() => contactsBySupplierId, [contactsBySupplierId]);
  /** Unika roller från kontaktregistret + alla kopplade kontakter (för autocomplete i Roll-fältet). */
  const existingRoles = useMemo(() => {
    const set = new Set<string>();
    (contactRegistry || []).forEach((c) => {
      const r = String(c?.role ?? '').trim();
      if (r) set.add(r);
    });
    Object.values(contactMap || {}).flat().forEach((c) => {
      const r = String((c as { role?: string })?.role ?? '').trim();
      if (r) set.add(r);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'sv'));
  }, [contactRegistry, contactMap]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const hasPrompt = Object.keys(duplicatePrompt).length > 0;
    if (!hasPrompt) return;
    const timer = setTimeout(() => {
      try {
        const el = duplicatePromptRef.current as unknown as HTMLElement | null;
        if (el?.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
    }, 80);
    return () => clearTimeout(timer);
  }, [duplicatePrompt]);

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
        organizationNumber: formatOrganizationNumber(String(editingSupplier.organizationNumber ?? '')),
        address: String(editingSupplier.address ?? ''),
        postalCode: String(editingSupplier.postalCode ?? ''),
        city: String(editingSupplier.city ?? ''),
        category: String(cat),
      });
    } else {
      setEditDraft(null);
    }
  }, [editingId, editingSupplier]);

  /** Efter sparning från Byggdel/Konton/Kategori-modal: håll leverantören expanderad. */
  React.useEffect(() => {
    if (keepExpandedSupplierId?.trim()) {
      setExpandedIds((prev) => ({ ...prev, [keepExpandedSupplierId]: true }));
    }
  }, [keepExpandedSupplierId]);

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

  /** Kategorinamn som lista (visas som vanlig text i tabellen, t.ex. "Bygg, Snickeri"). */
  const getCategoryList = (supplier: Supplier): string[] => getCategoryNames(supplier);

  /** Byggdelar som visningstext (code – name eller code), för tabellkolumnen. */
  const getByggdelList = (supplier: Supplier): string[] => {
    const codes = Array.isArray(supplier.byggdelTags) ? supplier.byggdelTags : [];
    if (!codes.length) return [];
    return codes.map((code) => {
      const b = companyByggdelar.find((x) => (x.code ?? x.id) === code);
      if (b) {
        const name = (b.name ?? '').trim();
        const c = (b as { code?: string }).code ?? b.id;
        return name ? `${c} – ${name}` : String(c || code);
      }
      return String(code);
    });
  };

  /** Konton som visningstext med benämning (samma format som Byggdelar: "nummer – benämning"). */
  const getKontoDisplayList = (supplier: Supplier): string[] => {
    const ids = Array.isArray(supplier.konton) ? (supplier.konton as string[]) : [];
    if (!ids.length) return [];
    return ids.map((kontoId) => {
      const item = companyKontoplan.find((x) => (x.konto ?? x.id) === kontoId);
      const num = item?.konto ?? kontoId;
      const benamning = (item?.benamning ?? '').trim();
      return benamning ? `${num} – ${benamning}` : String(num);
    });
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
        workPhone: draft.workPhone?.trim(),
      });
      setContactDrafts((prev) => ({
        ...prev,
        [supplier.id]: { name: '', role: '', email: '', phone: '', workPhone: '' },
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

  const gapBetweenCols = Platform.OS === 'web' ? RESIZE_HANDLE_WIDTH : 8;
  const numCols = 5;
  const totalTableWidth =
    w.companyName + w.organizationNumber + w.city + w.category + w.byggdelar
    + (Platform.OS === 'web' ? numCols * RESIZE_HANDLE_WIDTH : gapBetweenCols * numCols);

  return (
    <View style={[styles.tableWrap, { minWidth: totalTableWidth, width: '100%' }]}>
      {/* Kolumnordning: 1 Leverantör, 2 Org-nr, 3 Ort, 4 Kategori, 5 Byggdelar. På webb justerbara kolumner. */}
      <View style={[styles.header, Platform.OS === 'web' && styles.headerGapWeb]}>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('companyName')]}
          onPress={() => onSort('companyName')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Leverantör</Text>
            <SortIcon col="companyName" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('companyName', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, col('organizationNumber')]}
          onPress={() => onSort('organizationNumber')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Org-nr</Text>
            <SortIcon col="organizationNumber" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('organizationNumber', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, col('city')]}
          onPress={() => onSort('city')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Ort</Text>
            <SortIcon col="city" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('city', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, colCategory()]}
          onPress={() => onSort('category')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Kategori</Text>
            <SortIcon col="category" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('category', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, colByggdelar()]}
          onPress={() => onSort('byggdelar')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText}>Byggdelar</Text>
            <SortIcon col="byggdelar" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('byggdelar', e)}><View style={styles.resizeHandleLine} /></View>}
      </View>
      {inlineEnabled ? (
        <View style={[styles.inlineRow, Platform.OS === 'web' && styles.rowGapWeb]}>
          <View style={[styles.cellFlex, col('companyName')]}>
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
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!inlineSaving) onInlineSave?.(); } } } : {})}
              />
            </View>
          </View>
          <View style={[styles.cellFixed, col('organizationNumber')]}>
            <View style={styles.columnContent}>
              <TextInput
                value={inlineValues?.organizationNumber ?? ''}
                onChangeText={(v) => onInlineChange?.('organizationNumber', formatOrganizationNumber(v))}
                placeholder="xxxxxx-xxxx"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!inlineSaving) onInlineSave?.(); } } } : {})}
              />
            </View>
          </View>
          <View style={[styles.cellFixed, col('city')]}>
            <View style={styles.columnContent}>
              <TextInput
                value={inlineValues?.city ?? ''}
                onChangeText={(v) => onInlineChange?.('city', v)}
                placeholder="Ort (ny)"
                returnKeyType="done"
                blurOnSubmit={false}
                onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e: React.KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); if (!inlineSaving) onInlineSave?.(); } } } : {})}
              />
            </View>
          </View>
          {onOpenKategoriForInlineAdd ? (
            <View style={[styles.cellFlex, colCategory()]}>
              <View style={styles.columnContent}>
                <TouchableOpacity
                  ref={inlineCategoryTriggerRef}
                  style={[styles.inlineInput, styles.inlineInputCell, { flex: 1, justifyContent: 'center' }]}
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
            <View style={[styles.cellFlex, colCategory()]}>
              <View style={styles.columnContent}>
                <SelectDropdown
                  value={Array.isArray(inlineValues?.categories) ? inlineValues.categories : []}
                  options={companyCategories.map((c) => ({ value: c.id, label: c.name ?? c.id }))}
                  multiple
                  searchable
                  placeholder="Kategorier"
                  onChange={(next: string[]) => onInlineChange?.('categories', next)}
                  usePortal={true}
                  fieldStyle={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                  listStyle={styles.inlineSelectList}
                  inputStyle={{ fontSize: 13, color: '#111' }}
                />
              </View>
            </View>
          ) : (
            <View style={[styles.cellFlex, colCategory()]}>
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
          <View style={[styles.cellFlex, colByggdelar()]}>
            <View style={styles.columnContent}>
              <Text style={[styles.cellMuted, { fontSize: 13 }]}>—</Text>
            </View>
          </View>
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
                    onChangeText={(v) => setEditDraft((d) => (d ? { ...d, organizationNumber: formatOrganizationNumber(v) } : d))}
                    placeholder="xxxxxx-xxxx"
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
              {onOpenByggdelar ? (
                <View style={[styles.cellFlex, { flex: FLEX_FULL.byggdelar }]}>
                  <View style={styles.columnContent}>
                    <TouchableOpacity
                      style={[styles.inlineSelectField, { minHeight: 32, justifyContent: 'center' }]}
                      onPress={() => onOpenByggdelar(supplier)}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' as const, tabIndex: 0 } : {})}
                    >
                      <Text style={{ fontSize: 13, color: getByggdelList(supplier).length > 0 ? '#111' : '#94a3b8' }} numberOfLines={1}>
                        {getByggdelList(supplier).length > 0
                          ? getByggdelList(supplier).slice(0, 3).join(', ') + (getByggdelList(supplier).length > 3 ? '…' : '')
                          : 'Klicka för att välja byggdelar'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={[styles.cellFlex, { flex: FLEX_FULL.byggdelar }]}>
                  <View style={styles.columnContent}>
                    <Text style={[styles.cellMuted, { fontSize: 13 }]} numberOfLines={1}>
                      {getByggdelList(supplier).length > 0 ? getByggdelList(supplier).join(', ') : '—'}
                    </Text>
                  </View>
                </View>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingLeft: 12, minWidth: 80 }}>
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
            <View
              style={{ alignSelf: 'stretch' }}
              {...(Platform.OS === 'web'
                ? {
                    onContextMenu: (e: React.MouseEvent) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onRowContextMenu?.(e, supplier);
                    },
                    ...(onRowDoubleClick ? { onDoubleClick: (e: React.MouseEvent) => { e.stopPropagation(); onRowDoubleClick(supplier); } } : {}),
                  }
                : {})}
            >
            <TouchableOpacity
              style={[
                styles.row,
                Platform.OS === 'web' && styles.rowGapWeb,
                idx % 2 === 1 ? styles.rowAlt : null,
                hoveredId === supplier.id ? styles.rowHover : null,
                expandedIds[supplier.id] ? styles.rowActive : null,
              ]}
              onPress={() => {
                if (Platform.OS !== 'web' && onRowDoubleClick) {
                  const now = Date.now();
                  if (lastTapRef.current.supplierId === supplier.id && now - lastTapRef.current.time < DOUBLE_TAP_MS) {
                    lastTapRef.current = { supplierId: '', time: 0 };
                    onRowDoubleClick(supplier);
                    return;
                  }
                  lastTapRef.current = { supplierId: supplier.id, time: now };
                }
                setExpandedIds((prev) => ({ ...prev, [supplier.id]: !prev[supplier.id] }));
                onRowPress(supplier);
              }}
              onLongPress={Platform.OS === 'web' ? undefined : (e) => onRowContextMenu?.(e, supplier)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web'
                ? {
                    cursor: 'pointer',
                    onMouseEnter: () => setHoveredId(supplier.id),
                    onMouseLeave: () => setHoveredId(null),
                  }
                : {})}
            >
              <View style={[styles.cellFlex, col('companyName')]}>
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
              <View style={[styles.cellFixed, col('organizationNumber')]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {formatOrganizationNumber(supplier.organizationNumber ?? '') || '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFixed, col('city')]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {safeText(supplier.city)}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFlex, colCategory()]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {getCategoryList(supplier).length > 0 ? getCategoryList(supplier).join(', ') : '—'}
                  </Text>
                </View>
              </View>
              <View style={[styles.cellFlex, colByggdelar()]}>
                <View style={styles.columnContent}>
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>
                    {getByggdelList(supplier).length > 0 ? getByggdelList(supplier).join(', ') : '—'}
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
            </View>
          )}
          {expandedIds[supplier.id] ? (
            <View style={styles.detailsRow}>
              <View style={styles.detailsInner}>
                {(() => {
                  const activeTab = detailsTabBySupplierId[supplier.id] ?? 'information';
                  return (
                    <>
                      {/* Flikar: Information | Kontaktpersoner */}
                      <View style={styles.detailsTabsRow}>
                        <TouchableOpacity
                          style={[styles.detailsTab, activeTab === 'information' && styles.detailsTabActive]}
                          onPress={() => setDetailsTabBySupplierId((prev) => ({ ...prev, [supplier.id]: 'information' }))}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {})}
                        >
                          <Text style={[styles.detailsTabLabel, activeTab === 'information' && styles.detailsTabLabelActive]}>
                            Information
                          </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.detailsTab, activeTab === 'kontaktpersoner' && styles.detailsTabActive]}
                          onPress={() => setDetailsTabBySupplierId((prev) => ({ ...prev, [supplier.id]: 'kontaktpersoner' }))}
                          activeOpacity={0.8}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {})}
                        >
                          <Text style={[styles.detailsTabLabel, activeTab === 'kontaktpersoner' && styles.detailsTabLabelActive]}>
                            Kontaktpersoner ({(contactMap[supplier.id] || []).length})
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {activeTab === 'information' ? (
                        <View style={styles.infoGrid}>
                          {/* Org-nr – redigera öppnar leverantörsmodalen */}
                          <View
                            style={[
                              styles.infoRow,
                              Platform.OS === 'web' && infoRowHover === 'org' ? styles.infoRowHover : null,
                            ]}
                            {...(Platform.OS === 'web'
                              ? {
                                  onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onEditSupplier?.(supplier);
                                  },
                                  onMouseEnter: () => setInfoRowHover('org'),
                                  onMouseLeave: () => setInfoRowHover(null),
                                }
                              : {})}
                          >
                            <Text style={styles.infoLabel}>Org-nr</Text>
                            <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                              <Text style={styles.infoValue}>{formatOrganizationNumber(String(supplier.organizationNumber ?? '')) || '—'}</Text>
                              {onEditSupplier ? (
                                <TouchableOpacity onPress={() => onEditSupplier(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                          {/* Adress */}
                          <View
                            style={[
                              styles.infoRow,
                              Platform.OS === 'web' && infoRowHover === 'address' ? styles.infoRowHover : null,
                            ]}
                            {...(Platform.OS === 'web'
                              ? {
                                  onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onEditSupplier?.(supplier);
                                  },
                                  onMouseEnter: () => setInfoRowHover('address'),
                                  onMouseLeave: () => setInfoRowHover(null),
                                }
                              : {})}
                          >
                            <Text style={styles.infoLabel}>Adress</Text>
                            <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                              <Text style={styles.infoValue} numberOfLines={2}>
                                {[supplier.address, [supplier.postalCode, supplier.city].filter(Boolean).join(' ')].filter(Boolean).join(', ') || '—'}
                              </Text>
                              {onEditSupplier ? (
                                <TouchableOpacity onPress={() => onEditSupplier(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                          {/* Kategori */}
                          <View
                            style={[
                              styles.infoRow,
                              Platform.OS === 'web' && infoRowHover === 'category' ? styles.infoRowHover : null,
                            ]}
                            {...(Platform.OS === 'web'
                              ? {
                                  onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    if (onOpenKategorier) onOpenKategorier(supplier);
                                    else onEditSupplier?.(supplier);
                                  },
                                  onMouseEnter: () => setInfoRowHover('category'),
                                  onMouseLeave: () => setInfoRowHover(null),
                                }
                              : {})}
                          >
                            <Text style={styles.infoLabel}>Kategori</Text>
                            <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                              {getCategoryList(supplier).length > 0 ? (
                                <Text style={styles.infoValue}>{getCategoryList(supplier).join(', ')}</Text>
                              ) : (
                                <Text style={styles.infoValue}>—</Text>
                              )}
                              {(onOpenKategorier || (companyCategories.length > 0 && onCategoriesChange)) ? (
                                <TouchableOpacity onPress={() => onOpenKategorier?.(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : onEditSupplier ? (
                                <TouchableOpacity onPress={() => onEditSupplier(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                          {/* Byggdelar – högerklick på raden eller valfri byggdel öppnar byggdelar-modalen */}
                          <View
                            style={[
                              styles.infoRow,
                              Platform.OS === 'web' && infoRowHover === 'byggdelar' ? styles.infoRowHover : null,
                            ]}
                            {...(Platform.OS === 'web'
                              ? {
                                  onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onOpenByggdelar?.(supplier);
                                  },
                                  onMouseEnter: () => setInfoRowHover('byggdelar'),
                                  onMouseLeave: () => setInfoRowHover(null),
                                }
                              : {})}
                          >
                            <Text style={styles.infoLabel}>Byggdelar</Text>
                            <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                              {getByggdelList(supplier).length > 0 ? (
                                getByggdelList(supplier).map((line, idx) => (
                                  <Text key={idx} style={styles.infoValue}>{line}</Text>
                                ))
                              ) : (
                                <Text style={styles.infoValue}>—</Text>
                              )}
                              {onOpenByggdelar ? (
                                <TouchableOpacity onPress={() => onOpenByggdelar(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                          {/* Konto – högerklick öppnar konton-modalen */}
                          <View
                            style={[
                              styles.infoRow,
                              Platform.OS === 'web' && infoRowHover === 'konto' ? styles.infoRowHover : null,
                            ]}
                            {...(Platform.OS === 'web'
                              ? {
                                  onContextMenu: (e: React.MouseEvent) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    onOpenKonton?.(supplier);
                                  },
                                  onMouseEnter: () => setInfoRowHover('konto'),
                                  onMouseLeave: () => setInfoRowHover(null),
                                }
                              : {})}
                          >
                            <Text style={styles.infoLabel}>Konto</Text>
                            <View style={{ flex: 1, flexDirection: 'column', gap: 2 }}>
                              {getKontoDisplayList(supplier).length > 0 ? (
                                getKontoDisplayList(supplier).map((line, idx) => (
                                  <Text key={idx} style={styles.infoValue}>{line}</Text>
                                ))
                              ) : (
                                <Text style={styles.infoValue}>—</Text>
                              )}
                              {onOpenKonton ? (
                                <TouchableOpacity onPress={() => onOpenKonton(supplier)} activeOpacity={0.8}>
                                  <Text style={styles.infoAndraLink}>Ändra</Text>
                                </TouchableOpacity>
                              ) : null}
                            </View>
                          </View>
                        </View>
                      ) : null}

                      {activeTab === 'kontaktpersoner' ? (
                        <View style={styles.openRelationerSection}>
                          <View style={styles.expanderHeader}>
                            <View style={styles.expanderHeaderTouchable}>
                              <Text style={[styles.openRelationerTitle, { marginBottom: 0 }]}>Kontaktpersoner</Text>
                            </View>
                            {editingSection[supplier.id] !== 'contacts' ? (
                              <TouchableOpacity
                                onPress={() => setEditingSection((prev) => ({ ...prev, [supplier.id]: 'contacts' }))}
                                activeOpacity={0.8}
                                style={styles.expanderHeaderActionLink}
                                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                              >
                                <Text style={styles.openRelationerActionLink}>+ Lägg till kontakt</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                  <>
                  <View style={styles.openSectionContent}>
                    {(contactMap[supplier.id] || []).length > 0 ? (
                      <View style={styles.openContactTableWrap}>
                        <View style={styles.openContactTableHeader}>
                          <View style={[styles.cellFlex, { flex: FLEX_CONTACT.name }]}>
                            <Text style={styles.openContactTableHeaderCell}>Namn</Text>
                          </View>
                          <View style={[styles.cellFlex, { flex: FLEX_CONTACT.company }]}>
                            <Text style={styles.openContactTableHeaderCell}>Företag</Text>
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
                                Platform.OS === 'web' && hoveredContactId === contact.id ? styles.openContactTableRowHover : null,
                              ]}
                              {...(Platform.OS === 'web'
                                ? {
                                    onContextMenu: (e: React.MouseEvent) => {
                                      e.preventDefault();
                                      e.stopPropagation();
                                      onContactMenu?.(e, supplier, contact);
                                    },
                                    onMouseEnter: () => setHoveredContactId(contact.id),
                                    onMouseLeave: () => setHoveredContactId(null),
                                  }
                                : {})}
                            >
                              <View style={[styles.cellFlex, { flex: FLEX_CONTACT.name }]}>
                                <Text style={[styles.openContactTableCell, { fontWeight: '500' }]} numberOfLines={1}>
                                  {contact.name || '—'}
                                </Text>
                              </View>
                              <View style={[styles.cellFlex, { flex: FLEX_CONTACT.company }]}>
                                <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                                  {supplier.companyName || '—'}
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
                              <View style={styles.openContactTableKebabCol} />
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
                      <View style={[styles.openContactTableRow, { marginTop: 8 }]}>
                        <View style={[styles.cellFlex, { flex: FLEX_CONTACT.name }]}>
                          <TextInput
                            value={contactDrafts[supplier.id]?.name ?? ''}
                            onChangeText={(v) =>
                              setContactDrafts((prev) => ({
                                ...prev,
                                [supplier.id]: { name: v, role: prev[supplier.id]?.role ?? '', email: prev[supplier.id]?.email ?? '', phone: prev[supplier.id]?.phone ?? '', workPhone: prev[supplier.id]?.workPhone ?? '' },
                              }))
                            }
                            placeholder="Namn"
                            style={[styles.contactInput, { flex: 1 }]}
                            placeholderTextColor="#94a3b8"
                            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                          />
                        </View>
                        <View style={[styles.cellFlex, { flex: FLEX_CONTACT.company }]}>
                          <Text style={[styles.openContactTableCell, styles.openContactTableCellMuted]} numberOfLines={1}>
                            {supplier.companyName || '—'}
                          </Text>
                        </View>
                        <View style={[styles.cellFlex, { flex: FLEX_CONTACT.role, position: 'relative' as const }]}>
                          {(() => {
                            const roleDraft = String(contactDrafts[supplier.id]?.role ?? '').trim();
                            const roleSuggestions = roleDraft
                              ? existingRoles.filter((r) => r.toLowerCase().includes(roleDraft.toLowerCase())).slice(0, 8)
                              : [];
                            const isExactMatch = roleDraft && existingRoles.some((r) => r.trim().toLowerCase() === roleDraft.toLowerCase());
                            const highlightIdx = Math.min(Math.max(0, roleDropdownHighlight[supplier.id] ?? 0), Math.max(0, roleSuggestions.length - 1));
                            const selectRole = (roleStr: string) => {
                              setContactDrafts((prev) => ({
                                ...prev,
                                [supplier.id]: { name: prev[supplier.id]?.name ?? '', role: roleStr, email: prev[supplier.id]?.email ?? '', phone: prev[supplier.id]?.phone ?? '', workPhone: prev[supplier.id]?.workPhone ?? '' },
                              }));
                              setRoleDropdownHighlight((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                            };
                            const handleRoleKey = (e: React.KeyboardEvent) => {
                              if (Platform.OS !== 'web') return;
                              const key = (e.nativeEvent as KeyboardEvent).key ?? (e as unknown as { key?: string }).key;
                              if (roleSuggestions.length === 0) return;
                              if (key === 'ArrowDown') {
                                e.preventDefault();
                                e.stopPropagation();
                                setRoleDropdownHighlight((prev) => ({ ...prev, [supplier.id]: Math.min((prev[supplier.id] ?? 0) + 1, roleSuggestions.length - 1) }));
                              } else if (key === 'ArrowUp') {
                                e.preventDefault();
                                e.stopPropagation();
                                setRoleDropdownHighlight((prev) => ({ ...prev, [supplier.id]: Math.max((prev[supplier.id] ?? 0) - 1, 0) }));
                              } else if (key === 'Enter') {
                                const sel = roleSuggestions[highlightIdx];
                                if (sel != null) {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  selectRole(sel);
                                }
                              }
                            };
                            return (
                              <>
                                <View
                                  style={{ flex: 1, minWidth: 0 }}
                                  {...(Platform.OS === 'web' ? { onKeyDownCapture: handleRoleKey } : {})}
                                >
                                  <TextInput
                                    value={contactDrafts[supplier.id]?.role ?? ''}
                                    onChangeText={(v) =>
                                      setContactDrafts((prev) => ({
                                        ...prev,
                                        [supplier.id]: { name: prev[supplier.id]?.name ?? '', role: v, email: prev[supplier.id]?.email ?? '', phone: prev[supplier.id]?.phone ?? '', workPhone: prev[supplier.id]?.workPhone ?? '' },
                                      }))
                                    }
                                    placeholder="Roll (t.ex. V för VD)"
                                    style={[styles.contactInput, { flex: 1 }]}
                                    placeholderTextColor="#94a3b8"
                                    {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                  />
                                </View>
                                {roleSuggestions.length > 0 && !isExactMatch ? (
                                  <View style={styles.roleDropdownWrap}>
                                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator style={{ maxHeight: 196 }}>
                                      {roleSuggestions.map((roleStr, rIdx) => (
                                        <TouchableOpacity
                                          key={roleStr}
                                          style={[
                                            styles.roleDropdownRow,
                                            rIdx === roleSuggestions.length - 1 ? styles.roleDropdownRowLast : null,
                                            rIdx === highlightIdx ? styles.roleDropdownRowHighlight : null,
                                          ]}
                                          onPress={() => selectRole(roleStr)}
                                          activeOpacity={0.7}
                                          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                        >
                                          <Text style={[styles.openContactTableCell, { fontSize: 13 }]} numberOfLines={1}>{roleStr}</Text>
                                        </TouchableOpacity>
                                      ))}
                                    </ScrollView>
                                  </View>
                                ) : null}
                              </>
                            );
                          })()}
                        </View>
                        <View style={[styles.cellFixed, { width: FIXED_CONTACT.mobile }]}>
                          <TextInput
                            value={formatMobileDisplay(contactDrafts[supplier.id]?.phone ?? '')}
                            onChangeText={(v) => {
                              const digits = String(v ?? '').replace(/\D/g, '').slice(0, 10);
                              setContactDrafts((prev) => ({
                                ...prev,
                                [supplier.id]: { name: prev[supplier.id]?.name ?? '', role: prev[supplier.id]?.role ?? '', email: prev[supplier.id]?.email ?? '', phone: digits, workPhone: prev[supplier.id]?.workPhone ?? '' },
                              }));
                            }}
                            placeholder="Mobil"
                            style={[styles.contactInput, { width: FIXED_CONTACT.mobile }]}
                            placeholderTextColor="#94a3b8"
                            keyboardType="phone-pad"
                            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                          />
                        </View>
                        <View style={[styles.cellFixed, { width: FIXED_CONTACT.workPhone }]}>
                          <TextInput
                            value={contactDrafts[supplier.id]?.workPhone ?? ''}
                            onChangeText={(v) =>
                              setContactDrafts((prev) => ({
                                ...prev,
                                [supplier.id]: { name: prev[supplier.id]?.name ?? '', role: prev[supplier.id]?.role ?? '', email: prev[supplier.id]?.email ?? '', phone: prev[supplier.id]?.phone ?? '', workPhone: v },
                              }))
                            }
                            placeholder="Arbete"
                            style={[styles.contactInput, { width: FIXED_CONTACT.workPhone }]}
                            placeholderTextColor="#94a3b8"
                            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                          />
                        </View>
                        <View style={[styles.cellFlex, { flex: FLEX_CONTACT.email }]}>
                          <TextInput
                            value={contactDrafts[supplier.id]?.email ?? ''}
                            onChangeText={(v) =>
                              setContactDrafts((prev) => ({
                                ...prev,
                                [supplier.id]: { name: prev[supplier.id]?.name ?? '', role: prev[supplier.id]?.role ?? '', email: v, phone: prev[supplier.id]?.phone ?? '', workPhone: prev[supplier.id]?.workPhone ?? '' },
                              }))
                            }
                            placeholder="E-post"
                            style={[styles.contactInput, { flex: 1 }]}
                            placeholderTextColor="#94a3b8"
                            {...(Platform.OS === 'web' ? {
                              outlineStyle: 'none',
                              onKeyDown: (e: React.KeyboardEvent) => {
                                if ((e.nativeEvent as KeyboardEvent).key === 'Enter') {
                                  e.preventDefault();
                                  submitDraft(supplier);
                                }
                              },
                            } : {})}
                          />
                        </View>
                        <View style={[styles.openContactTableKebabCol, { flexDirection: 'row', minWidth: 76, width: undefined, maxWidth: undefined, justifyContent: 'flex-end' }]}>
                          <View style={styles.openContactActionRow}>
                            <TouchableOpacity
                              style={[styles.openContactActionIconBtn, { backgroundColor: '#e0f2fe', borderColor: '#7dd3fc' }]}
                              onPress={() => submitDraft(supplier)}
                              activeOpacity={0.8}
                              accessibilityLabel="Lägg till"
                              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                            >
                              <Ionicons name="checkmark" size={18} color="#0369a1" />
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={[styles.openContactActionIconBtn, { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' }]}
                              onPress={() => {
                                setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                                setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '', workPhone: '' } }));
                                setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                              }}
                              activeOpacity={0.8}
                              accessibilityLabel="Avbryt"
                              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                            >
                              <Ionicons name="close" size={18} color="#64748b" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                      {(() => {
                        const draft = contactDrafts[supplier.id] || { name: '', role: '', email: '', phone: '', workPhone: '' };
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
                                    workPhone: draft.workPhone,
                                    email: draft.email,
                                    contactCompanyName: supplier.companyName || '',
                                  });
                                  setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '', workPhone: '' } }));
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
                        <View ref={duplicatePromptRef} style={styles.contactHint}>
                          <Text style={styles.contactHintIcon}>⚠️</Text>
                          <Text style={styles.contactHintText}>
                            <Text style={{ fontWeight: '700' }}>{duplicatePrompt[supplier.id]?.label || 'Kontakten'}</Text> finns redan i registret. Vill du använda befintlig eller skapa ny?
                          </Text>
                          <TouchableOpacity
                            style={styles.contactHintBtn}
                            onPress={() => {
                              const dup = duplicatePrompt[supplier.id];
                              if (dup) {
                                const draft = contactDrafts[supplier.id] || { role: '', phone: '', workPhone: '', email: '' };
                                onLinkContact?.(supplier, dup.contactId, {
                                  role: draft.role,
                                  phone: draft.phone,
                                  workPhone: draft.workPhone,
                                  email: draft.email,
                                  contactCompanyName: supplier.companyName || '',
                                });
                              }
                              setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                              setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '', workPhone: '' } }));
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
                                  workPhone: draft.workPhone?.trim(),
                                });
                              }
                              setDuplicatePrompt((prev) => { const n = { ...prev }; delete n[supplier.id]; return n; });
                              setContactDrafts((prev) => ({ ...prev, [supplier.id]: { name: '', role: '', email: '', phone: '', workPhone: '' } }));
                              setEditingSection((prev) => ({ ...prev, [supplier.id]: null }));
                            }}
                          >
                            <Text style={styles.contactHintBtnText}>Skapa ny</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}
                    </>
                  ) : null}
                  </>
                        </View>
                      ) : null}
                    </>
                  );
                })()}
                <View style={styles.detailsDivider} />
              </View>
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
