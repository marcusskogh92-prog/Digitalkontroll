/**
 * Tabell för kontaktregister – referens-UI för alignment och vänsterlinjering.
 * Kolumner: Namn, Företag, Roll, Mobil, Arbete, E-post, Kebab.
 * Mobil: endast siffror, sparas som siffror, visas formaterat (xxx xxx xx xx).
 * Arbete: jobbtelefon, fritt format.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';

let createPortal = null;
try {
  createPortal = require('react-dom').createPortal;
} catch (_e) {
  createPortal = null;
}

// Standardbredder (används som default och vid icke-webb). På webb kan användaren justera via resize-handtag.
const DEFAULT_COLUMN_WIDTHS = { name: 130, company: 170, role: 100, mobile: 130, workPhone: 150, email: 200 };
const MIN_COLUMN_WIDTH = 60;
const RESIZE_HANDLE_WIDTH = 6;

/** Formatera mobil (endast siffror) till xxx xxx xx xx t.ex. 072 595 75 25 */
function formatMobileDisplay(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return '';
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  const parts = [p1, p2, p3, p4].filter(Boolean);
  return parts.join(' ').trim();
}

/** Behåll endast siffror (för lagring) */
function digitsOnly(value) {
  return String(value ?? '').replace(/\D/g, '');
}

const TABLE = MODAL_DESIGN_2026;

const styles = StyleSheet.create({
  tableWrap: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: TABLE.tableRadius,
    overflow: 'hidden',
    backgroundColor: '#fff',
    minWidth: '100%',
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
  columnContentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  headerText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  inlineInputCell: {
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
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
  rowAlt: { backgroundColor: '#f8fafc' },
  rowHover: { backgroundColor: '#eef6ff' },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  actionsCol: {
    flexShrink: 0,
    borderLeftWidth: 1,
    borderLeftColor: '#e2e8f0',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsColHeader: {
    backgroundColor: '#f1f5f9',
    paddingVertical: TABLE.tableCellPaddingVertical,
  },
  actionsColInline: { backgroundColor: 'transparent' },
  rowMenuBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingHorizontal: 14,
    paddingBottom: 4,
  },
  inlineAddLabelText: { fontSize: 12, fontWeight: '600', color: '#0369a1' },
  inlineAddLabelHint: { fontSize: 11, color: '#64748b' },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    paddingTop: 4,
    backgroundColor: '#f0f9ff',
  },
  inlineRowGapWeb: { gap: RESIZE_HANDLE_WIDTH },
  editRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 3,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: '#eef0f3',
    backgroundColor: '#eff6ff',
  },
  editRowGapWeb: { gap: RESIZE_HANDLE_WIDTH },
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
  editRowBtnPrimary: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  editRowBtnCancel: { borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  cellText: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  cellMuted: { fontSize: 13, color: '#64748b', fontWeight: '400' },
  emailLink: { color: '#2563eb', fontSize: 13, fontWeight: '400' },
  emailLinkHover: { textDecorationLine: 'underline' },
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

const companyDropdownStyles = StyleSheet.create({
  wrap: { flex: 1, alignSelf: 'stretch', minWidth: 0, position: 'relative' },
  dropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 2,
    maxHeight: 280,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    zIndex: 10000,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  dropdownItemHighlight: { backgroundColor: '#eef6ff' },
  dropdownItemLast: { borderBottomWidth: 0 },
  dropdownItemName: { fontSize: 13, color: '#1e293b', fontWeight: '500', flex: 1, minWidth: 0 },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  badge: { backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 },
  badgeText: { fontSize: 11, color: '#0369a1', fontWeight: '500' },
});

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

function CompanyRoleBadges({ roles }) {
  if (!roles) return null;
  const labels = [];
  if (roles.customer) labels.push('Kund');
  if (roles.supplier) labels.push('Leverantör');
  if (labels.length === 0) return null;
  return (
    <View style={companyDropdownStyles.badges}>
      {labels.map((l) => (
        <View key={l} style={companyDropdownStyles.badge}>
          <Text style={companyDropdownStyles.badgeText} numberOfLines={1}>{l}</Text>
        </View>
      ))}
    </View>
  );
}

export default function ContactRegistryTable({
  contacts,
  sortColumn,
  sortDirection,
  onSort,
  editingId,
  inlineSavingContact,
  onSaveEdit,
  onCancelEdit,
  onRowMenu,
  onRowDoubleClick,
  inlineEnabled,
  inlineValues,
  inlineSaving,
  onInlineChange,
  onInlineSave,
  companySearchResults = [],
  companySearchOpen,
  companySearchActive,
  setCompanySearchOpen,
  setCompanySearchActive,
  onCompanySearch,
  onSelectCompany,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [emailHoveredId, setEmailHoveredId] = useState(null);
  const [editDraft, setEditDraft] = useState(null);
  const lastTapRef = useRef({ contactId: null, time: 0 });
  const DOUBLE_TAP_MS = 350;
  const [mobileDisplayFormatted, setMobileDisplayFormatted] = useState(false);
  const [companyHighlightedIndex, setCompanyHighlightedIndex] = useState(0);
  const [companyDropdownRect, setCompanyDropdownRect] = useState(null);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const companyBlurTimerRef = useRef(null);
  const companyInlineWrapRef = useRef(null);

  const w = columnWidths;

  const startResize = useCallback((column, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column] };
  }, [columnWidths]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
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

  const triggerInlineSave = () => { if (!inlineSaving) onInlineSave?.(); };
  const onInlineEnterKeyDown = Platform.OS === 'web'
    ? (e) => { if (e?.key === 'Enter') { e.preventDefault(); triggerInlineSave(); } }
    : undefined;

  const companyList = (companySearchResults || []).slice(0, 15);
  const companyListLen = companyList.length;

  useEffect(() => {
    setCompanyHighlightedIndex(0);
  }, [companySearchResults, companySearchOpen]);

  useEffect(() => {
    if (!companySearchOpen || companySearchActive !== 'inline' || companyListLen === 0) {
      setCompanyDropdownRect(null);
      return;
    }
    if (Platform.OS !== 'web' || !createPortal) return;
    const measure = () => {
      const el = companyInlineWrapRef.current;
      if (el && typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        setCompanyDropdownRect({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 200) });
      } else {
        setCompanyDropdownRect(null);
      }
    };
    const t = setTimeout(measure, 100);
    return () => clearTimeout(t);
  }, [companySearchOpen, companySearchActive, companyListLen]);

  const closeCompanySearch = () => {
    if (companyBlurTimerRef.current) clearTimeout(companyBlurTimerRef.current);
    setCompanySearchOpen?.(false);
    setCompanySearchActive?.(null);
  };

  const selectHighlightedCompany = (context) => {
    if (companyListLen === 0) return;
    const company = companyList[Math.max(0, Math.min(companyHighlightedIndex, companyListLen - 1))];
    if (!company) return;
    if (context === 'inline') {
      onSelectCompany?.(company);
    } else {
      const name = String(company.name ?? '').trim();
      if (company.type === 'supplier') {
        setEditDraft((d) => (d ? { ...d, linkedSupplierId: company.id ?? '', customerId: '', companyId: '', contactCompanyName: name } : d));
      } else if (company.type === 'customer') {
        setEditDraft((d) => (d ? { ...d, customerId: company.id ?? '', linkedSupplierId: '', companyId: '', contactCompanyName: name } : d));
      } else {
        setEditDraft((d) => (d ? { ...d, companyId: company.id ?? '', contactCompanyName: name, linkedSupplierId: '', customerId: '' } : d));
      }
    }
    closeCompanySearch();
  };

  /** Returns true if the key was handled (caller should skip other handlers). */
  const handleCompanyKeyDown = (e, context) => {
    if (Platform.OS !== 'web') return false;
    const key = e.nativeEvent?.key;
    if (!companySearchOpen || companySearchActive !== context || companyListLen === 0) {
      if (key === 'Escape') {
        e.preventDefault();
        closeCompanySearch();
        return true;
      }
      return false;
    }
    if (key === 'ArrowDown') {
      e.preventDefault();
      setCompanyHighlightedIndex((i) => Math.min(i + 1, companyListLen - 1));
      return true;
    }
    if (key === 'ArrowUp') {
      e.preventDefault();
      setCompanyHighlightedIndex((i) => Math.max(0, i - 1));
      return true;
    }
    if (key === 'Enter' || key === 'Tab') {
      e.preventDefault();
      if (key === 'Enter' && companyListLen === 0) {
        if (!inlineSaving && context === 'inline') onInlineSave?.();
        return true;
      }
      selectHighlightedCompany(context);
      if (key === 'Tab' && context === 'inline') {
        setTimeout(() => {
          try {
            const next = document.querySelector('input[placeholder*="Roll"]');
            if (next) next.focus();
          } catch (_e) {}
        }, 50);
      }
      return true;
    }
    if (key === 'Escape') {
      e.preventDefault();
      closeCompanySearch();
      return true;
    }
    return false;
  };

  const handleCompanyBlur = () => {
    if (companyBlurTimerRef.current) clearTimeout(companyBlurTimerRef.current);
    companyBlurTimerRef.current = setTimeout(() => closeCompanySearch(), 200);
  };

  const editingContact = editingId ? (contacts.find((c) => c.id === editingId) || null) : null;
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (editingContact) {
      setEditDraft({
        name: String(editingContact.name ?? ''),
        companyId: editingContact.companyId ?? '',
        contactCompanyName: String(editingContact.contactCompanyName ?? editingContact.companyName ?? ''),
        linkedSupplierId: editingContact.linkedSupplierId ?? '',
        customerId: editingContact.customerId ?? '',
        role: String(editingContact.role ?? ''),
        phone: digitsOnly(editingContact.phone ?? ''),
        workPhone: String(editingContact.workPhone ?? ''),
        email: String(editingContact.email ?? ''),
      });
      setMobileDisplayFormatted(false);
    } else {
      setEditDraft(null);
    }
  }, [editingId, editingContact?.id]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleEditKeyDown = (e, contact) => {
    if (Platform.OS !== 'web') return;
    const key = e.nativeEvent?.key;
    if (key === 'Enter') {
      e.preventDefault();
      if (editDraft?.name?.trim() && onSaveEdit && !inlineSavingContact) {
        onSaveEdit(contact.id, editDraft);
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
    }
  };

  const SortIcon = ({ col }) => {
    if (sortColumn !== col) return <Ionicons name="swap-vertical-outline" size={14} color="#cbd5e1" />;
    return <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />;
  };

  const col = (key) => ({ width: w[key], minWidth: w[key], flexShrink: 0 });

  const gapBetweenCols = Platform.OS === 'web' ? RESIZE_HANDLE_WIDTH : 8;
  const totalTableWidth =
    w.name + w.company + w.role + w.mobile + w.workPhone + w.email
    + gapBetweenCols * 5
    + (Platform.OS === 'web' ? 5 * RESIZE_HANDLE_WIDTH : 0);

  return (
    <View style={[styles.tableWrap, { minWidth: totalTableWidth }]}>
      <View style={[styles.header, Platform.OS === 'web' && styles.headerGapWeb]}>
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, col('name')]} onPress={() => onSort('name')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Namn</Text>
            <SortIcon col="name" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('name', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, col('company')]} onPress={() => onSort('contactCompanyName')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Företag</Text>
            <SortIcon col="contactCompanyName" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('company', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, col('role')]} onPress={() => onSort('role')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Roll</Text>
            <SortIcon col="role" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('role', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity style={[styles.headerCell, styles.cellFixed, col('mobile')]} onPress={() => onSort('phone')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Mobil</Text>
            <SortIcon col="phone" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('mobile', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity style={[styles.headerCell, styles.cellFixed, col('workPhone')]} onPress={() => onSort('workPhone')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>Arbete</Text>
            <SortIcon col="workPhone" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('workPhone', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity style={[styles.headerCell, styles.cellFlex, col('email')]} onPress={() => onSort('email')} activeOpacity={0.7} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
          <View style={[styles.columnContent, styles.columnContentRow]}>
            <Text style={styles.headerText} numberOfLines={1}>E-post</Text>
            <SortIcon col="email" />
          </View>
        </TouchableOpacity>
      </View>

      {inlineEnabled && (
        <View style={[styles.inlineAddWrap, Platform.OS === 'web' && companySearchOpen && companySearchActive === 'inline' && companyListLen > 0 ? { zIndex: 9999, position: 'relative' } : null]}>
          <View style={styles.inlineAddLabel}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="add-circle-outline" size={16} color="#0369a1" />
              <Text style={styles.inlineAddLabelText}>Lägg till snabbt</Text>
            </View>
            <Text style={styles.inlineAddLabelHint}>Fyll i och tryck Enter för att spara</Text>
          </View>
          <View style={[styles.inlineRow, Platform.OS === 'web' && styles.inlineRowGapWeb]}>
          <View style={[styles.cellFlex, col('name')]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.name ?? ''} onChangeText={(v) => onInlineChange?.('name', v)} placeholder="Namn" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={triggerInlineSave} {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: onInlineEnterKeyDown } : {})} />
            </View>
          </View>
          <View style={[styles.cellFlex, col('company')]}>
            <View ref={companyInlineWrapRef} style={[styles.columnContent, companyDropdownStyles.wrap, Platform.OS === 'web' ? { overflow: 'visible' } : null]}>
              <TextInput
                value={inlineValues?.contactCompanyName ?? ''}
                onChangeText={(v) => {
                  onInlineChange?.('contactCompanyName', v);
                  onCompanySearch?.(v, 'inline');
                }}
                onFocus={() => setCompanySearchActive?.('inline')}
                onBlur={handleCompanyBlur}
                placeholder="Företag"
                style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleCompanyKeyDown(e, 'inline') } : {})}
              />
              {companySearchOpen && companySearchActive === 'inline' && companyListLen > 0 && !(Platform.OS === 'web' && createPortal && companyDropdownRect) && (
                <View style={companyDropdownStyles.dropdown}>
                  {companyList.map((company, i) => (
                    <TouchableOpacity
                      key={company.id || i}
                      style={[
                        companyDropdownStyles.dropdownItem,
                        i === companyListLen - 1 ? companyDropdownStyles.dropdownItemLast : null,
                        i === companyHighlightedIndex ? companyDropdownStyles.dropdownItemHighlight : null,
                      ]}
                      onPress={() => {
                        onSelectCompany?.(company);
                        closeCompanySearch();
                      }}
                      onMouseEnter={() => setCompanyHighlightedIndex(i)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Text style={companyDropdownStyles.dropdownItemName} numberOfLines={1}>{company.name || '—'}</Text>
                      <CompanyRoleBadges roles={company.roles} />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>
          </View>
          <View style={[styles.cellFlex, col('role')]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.role ?? ''} onChangeText={(v) => onInlineChange?.('role', v)} placeholder="Roll" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={triggerInlineSave} {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: onInlineEnterKeyDown } : {})} />
            </View>
          </View>
          <View style={[styles.cellFixed, col('mobile')]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.phone ?? ''} onChangeText={(v) => onInlineChange?.('phone', digitsOnly(v))} placeholder="Mobil" keyboardType="number-pad" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={triggerInlineSave} {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: onInlineEnterKeyDown } : {})} />
            </View>
          </View>
          <View style={[styles.cellFixed, col('workPhone')]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.workPhone ?? ''} onChangeText={(v) => onInlineChange?.('workPhone', v)} placeholder="Arbete" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={triggerInlineSave} {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: onInlineEnterKeyDown } : {})} />
            </View>
          </View>
          <View style={[styles.cellFlex, col('email')]}>
            <View style={styles.columnContent}>
              <TextInput value={inlineValues?.email ?? ''} onChangeText={(v) => onInlineChange?.('email', v)} placeholder="E-post" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" onSubmitEditing={triggerInlineSave} {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: onInlineEnterKeyDown } : {})} />
            </View>
          </View>
        </View>
        </View>
      )}

      {contacts.map((contact, idx) =>
        editingId === contact.id && editDraft ? (
          <View key={contact.id} style={[styles.editRow, Platform.OS === 'web' && styles.editRowGapWeb]}>
            <View style={[styles.cellFlex, col('name')]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.name} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, name: v } : d))} placeholder="Namn" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFlex, col('company')]}>
              <View style={[styles.columnContent, companyDropdownStyles.wrap]}>
                <TextInput
                  value={editDraft.contactCompanyName}
                  onChangeText={(v) => {
                    setEditDraft((d) => (d ? { ...d, contactCompanyName: v } : d));
                    onCompanySearch?.(v, 'edit');
                  }}
                  onFocus={() => setCompanySearchActive?.('edit')}
                  onBlur={handleCompanyBlur}
                  placeholder="Företag"
                  style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                  placeholderTextColor="#94a3b8"
                  {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => { if (!handleCompanyKeyDown(e, 'edit')) handleEditKeyDown(e, contact); } } : {})}
                />
                {companySearchOpen && companySearchActive === 'edit' && companyListLen > 0 && (
                  <View style={companyDropdownStyles.dropdown}>
                    {companyList.map((company, i) => (
                      <TouchableOpacity
                        key={company.id || i}
                        style={[
                          companyDropdownStyles.dropdownItem,
                          i === companyListLen - 1 ? companyDropdownStyles.dropdownItemLast : null,
                          i === companyHighlightedIndex ? companyDropdownStyles.dropdownItemHighlight : null,
                        ]}
                        onPress={() => {
                          const name = String(company.name ?? '').trim();
                          if (company.type === 'supplier') {
                            setEditDraft((d) => (d ? { ...d, linkedSupplierId: company.id ?? '', customerId: '', companyId: '', contactCompanyName: name } : d));
                          } else if (company.type === 'customer') {
                            setEditDraft((d) => (d ? { ...d, customerId: company.id ?? '', linkedSupplierId: '', companyId: '', contactCompanyName: name } : d));
                          } else {
                            setEditDraft((d) => (d ? { ...d, companyId: company.id ?? '', contactCompanyName: name, linkedSupplierId: '', customerId: '' } : d));
                          }
                          closeCompanySearch();
                        }}
                        onMouseEnter={() => setCompanyHighlightedIndex(i)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={companyDropdownStyles.dropdownItemName} numberOfLines={1}>{company.name || '—'}</Text>
                        <CompanyRoleBadges roles={company.roles} />
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
            <View style={[styles.cellFlex, col('role')]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.role} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, role: v } : d))} placeholder="Roll" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFixed, col('mobile')]}>
              <View style={styles.columnContent}>
                <TextInput
                  value={mobileDisplayFormatted ? formatMobileDisplay(editDraft.phone) : editDraft.phone}
                  onChangeText={(v) => {
                    const d = digitsOnly(v);
                    setEditDraft((prev) => (prev ? { ...prev, phone: d } : prev));
                    setMobileDisplayFormatted(false);
                  }}
                  onFocus={() => setMobileDisplayFormatted(false)}
                  onBlur={() => setMobileDisplayFormatted(true)}
                  placeholder="Mobil"
                  keyboardType="number-pad"
                  style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]}
                  placeholderTextColor="#94a3b8"
                  {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})}
                />
              </View>
            </View>
            <View style={[styles.cellFixed, col('workPhone')]}>
              <View style={styles.columnContent}>
                <TextInput value={editDraft.workPhone} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, workPhone: v } : d))} placeholder="Arbete" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
              </View>
            </View>
            <View style={[styles.cellFlex, col('email')]}>
              <View style={[styles.columnContent, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                <TextInput value={editDraft.email} onChangeText={(v) => setEditDraft((d) => (d ? { ...d, email: v } : d))} placeholder="E-post" style={[styles.inlineInput, styles.inlineInputCell, { flex: 1 }]} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, contact) } : {})} />
                <TouchableOpacity style={[styles.editRowBtn, styles.editRowBtnPrimary]} onPress={() => { if (editDraft?.name?.trim() && onSaveEdit) onSaveEdit(contact.id, editDraft); }} disabled={inlineSavingContact} accessibilityLabel="Spara" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                  <Ionicons name="checkmark" size={14} color="#fff" />
                </TouchableOpacity>
                <TouchableOpacity style={[styles.editRowBtn, styles.editRowBtnCancel]} onPress={() => onCancelEdit?.()} disabled={inlineSavingContact} accessibilityLabel="Avbryt" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                  <Ionicons name="close" size={14} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        ) : (
          <View
            key={contact.id}
            onContextMenu={Platform.OS === 'web' ? (e) => { e.preventDefault(); e.stopPropagation(); onRowMenu?.(e, contact); } : undefined}
            onDoubleClick={Platform.OS === 'web' && onRowDoubleClick ? (e) => { e.stopPropagation(); onRowDoubleClick(contact); } : undefined}
            style={{ alignSelf: 'stretch' }}
          >
            <TouchableOpacity
              style={[styles.row, Platform.OS === 'web' && styles.rowGapWeb, idx % 2 === 1 ? styles.rowAlt : null, hoveredId === contact.id ? styles.rowHover : null]}
              onPress={() => {
                if (Platform.OS !== 'web' && onRowDoubleClick) {
                  const now = Date.now();
                  if (lastTapRef.current.contactId === contact.id && now - lastTapRef.current.time < DOUBLE_TAP_MS) {
                    lastTapRef.current = { contactId: null, time: 0 };
                    onRowDoubleClick(contact);
                  } else {
                    lastTapRef.current = { contactId: contact.id, time: now };
                  }
                }
              }}
              onLongPress={(e) => onRowMenu?.(e, contact)}
              activeOpacity={0.7}
              {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseEnter: () => setHoveredId(contact.id), onMouseLeave: () => setHoveredId(null) } : {})}
            >
            <View style={[styles.cellFlex, col('name')]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellText, { flex: 1 }]} numberOfLines={1}>{contact.name || '—'}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, col('company')]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.contactCompanyName || contact.companyName)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, col('role')]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.role)}</Text>
              </View>
            </View>
            <View style={[styles.cellFixed, col('mobile')]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{formatMobileDisplay(contact.phone) || '—'}</Text>
              </View>
            </View>
            <View style={[styles.cellFixed, col('workPhone')]}>
              <View style={styles.columnContent}>
                <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>{safeText(contact.workPhone)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, col('email')]}>
              <View style={styles.columnContent}>
                {contact.email?.trim() ? (
                  <TouchableOpacity
                    onPress={() => Linking.openURL(`mailto:${contact.email.trim()}`)}
                    style={{ alignSelf: 'flex-start' }}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseEnter: () => setEmailHoveredId(contact.id), onMouseLeave: () => setEmailHoveredId(null) } : {})}
                  >
                    <Text
                      style={[
                        styles.emailLink,
                        emailHoveredId === contact.id ? styles.emailLinkHover : null,
                        { flex: 0 },
                      ]}
                      numberOfLines={1}
                    >
                      {contact.email.trim()}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <Text style={[styles.cellMuted, { flex: 1 }]} numberOfLines={1}>—</Text>
                )}
              </View>
            </View>
            </TouchableOpacity>
          </View>
        )
      )}
      {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && companyDropdownRect && companySearchOpen && companySearchActive === 'inline' && companyListLen > 0 &&
        createPortal(
          <View
            style={[
              companyDropdownStyles.dropdown,
              {
                position: 'fixed',
                top: companyDropdownRect.top,
                left: companyDropdownRect.left,
                width: companyDropdownRect.width,
                right: undefined,
              },
            ]}
          >
            {companyList.map((company, i) => (
              <TouchableOpacity
                key={company.id || i}
                style={[
                  companyDropdownStyles.dropdownItem,
                  i === companyListLen - 1 ? companyDropdownStyles.dropdownItemLast : null,
                  i === companyHighlightedIndex ? companyDropdownStyles.dropdownItemHighlight : null,
                ]}
                onPress={() => {
                  onSelectCompany?.(company);
                  closeCompanySearch();
                }}
                onMouseEnter={() => setCompanyHighlightedIndex(i)}
                activeOpacity={0.7}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={companyDropdownStyles.dropdownItemName} numberOfLines={1}>{company.name || '—'}</Text>
                <CompanyRoleBadges roles={company.roles} />
              </TouchableOpacity>
            ))}
          </View>,
          document.body
        )}
    </View>
  );
}
