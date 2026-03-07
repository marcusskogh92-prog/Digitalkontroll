import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchKontoplan, fetchCategories } from '../../../../components/firebase';

let createPortal = null;
if (typeof document !== 'undefined') {
  try {
    createPortal = require('react-dom').createPortal;
  } catch (_) {}
}
import { updateInkopsplanRowFields } from '../inkopsplanService';
import InkopsplanStatusBadge from './InkopsplanStatusBadge';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function typeLabel(type, manualTypeLabel) {
  const t = safeText(type);
  if (t === 'building_part') return 'Byggdel';
  if (t === 'account') return 'Konto';
  if (t === 'category') return 'Kategori';
  if (t === 'manual') return manualTypeLabel ? `Manuell · ${manualTypeLabel}` : 'Manuell';
  return '—';
}

function suppliersCount(row) {
  const s = Array.isArray(row?.suppliers) ? row.suppliers : [];
  return s.length;
}

function supplierStatus(supplier, row) {
  const s = safeText(supplier?.requestStatus).toLowerCase();
  if (s === 'svar_mottaget') return 'svar_mottaget';
  if (s === 'skickad') return 'skickad';
  // Backward compatible: if row has requestSentAt, assume sent
  if (row?.requestSentAt) return 'skickad';
  return 'ej_skickad';
}

function summarizeSupplierStatuses(row) {
  const list = Array.isArray(row?.suppliers) ? row.suppliers : [];
  const total = list.length;
  let sent = 0;
  let received = 0;

  list.forEach((s) => {
    const st = supplierStatus(s, row);
    if (st === 'skickad') sent += 1;
    if (st === 'svar_mottaget') {
      sent += 1;
      received += 1;
    }
  });

  // Fallback: row.responses
  const responses = Array.isArray(row?.responses) ? row.responses : [];
  const anyBid = received > 0 || responses.length > 0 || safeText(row?.status).toLowerCase() === 'klar';

  return {
    total,
    sent,
    received,
    anyBid,
  };
}

function indicatorColor(summary) {
  if (summary.total === 0) return '#FECACA'; // röd
  if (summary.anyBid) return '#86EFAC'; // grön
  if (summary.sent > 0) return '#93C5FD'; // blå
  return '#FDE68A'; // gul
}

function requestSummaryText(summary) {
  if (summary.total === 0) return '—';
  if (summary.received > 0) return `${summary.received}/${summary.total} svar`;
  if (summary.sent > 0) return `${summary.sent}/${summary.total} skickade`;
  return 'Ej skickad';
}

function overallStatusLabel(summary) {
  if (summary.total === 0) return 'utkast';
  if (summary.anyBid) return 'klar';
  if (summary.sent > 0) return 'skickad';
  return 'pågår';
}

function kontoDisplay(row) {
  const linkedK = safeText(row?.linkedAccountKonto);
  const linkedB = safeText(row?.linkedAccountBenamning);
  if (linkedK || linkedB) return linkedK ? `${linkedK}${linkedB ? ` ${linkedB}` : ''}` : linkedB;
  const t = safeText(row?.type);
  if (t === 'account') return safeText(row?.nr) || '—';
  return '—';
}

function kategoriDisplay(row) {
  const arr = Array.isArray(row?.linkedCategoryNames) ? row.linkedCategoryNames.map((n) => safeText(n)).filter(Boolean) : [];
  if (arr.length) return arr.join(', ');
  const linked = safeText(row?.linkedCategoryName);
  if (linked) return linked;
  const t = safeText(row?.type);
  if (t === 'category') return safeText(row?.name) || '—';
  return '—';
}

function capitalizeFirst(str) {
  const s = String(str ?? '').trim();
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

export default function InkopsplanRow({
  row,
  isSelected,
  isExpanded,
  onSelectRow,
  onToggleExpand,
  onRowContextMenu,
  tableStyles,
  isAlt,
  companyId,
  projectId,
  projectMembers = [],
  onRowsChanged,
  onOpenInquiryModal,
}) {
  const [editingCell, setEditingCell] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isRowHovered, setIsRowHovered] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [loadingCategories, setLoadingCategories] = useState(false);
  const [dropdownRect, setDropdownRect] = useState(null);
  const cellRefKonto = useRef(null);
  const cellRefKategori = useRef(null);
  const cellRefAnsvarig = useRef(null);
  const lastTapRef = useRef({ cell: null, time: 0 });

  const DBL_TAP_MS = 400;

  const bd = safeText(row?.nr) || '—';
  const name = safeText(row?.name) || '—';
  const konto = kontoDisplay(row);
  const kategori = kategoriDisplay(row);
  const summary = summarizeSupplierStatuses(row);
  const request = requestSummaryText(summary);
  const overallStatus = overallStatusLabel(summary);
  const ansvarig = safeText(row?.responsibleName || row?.ansvarig) || '—';
  const inquiryDraft = safeText(row?.inquiryDraftText) || '';
  const ts = tableStyles || {};
  const rowId = row?.id;
  const canEdit = Boolean(rowId && companyId && projectId);

  useEffect(() => {
    if (!companyId || editingCell !== 'konto') return;
    setLoadingAccounts(true);
    let alive = true;
    fetchKontoplan(companyId)
      .then((list) => { if (alive) setAccounts(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setAccounts([]); })
      .finally(() => { if (alive) setLoadingAccounts(false); });
    return () => { alive = false; };
  }, [companyId, editingCell]);

  useEffect(() => {
    if (!companyId || editingCell !== 'kategori') return;
    setLoadingCategories(true);
    let alive = true;
    fetchCategories(companyId)
      .then((list) => { if (alive) setCategories(Array.isArray(list) ? list : []); })
      .catch(() => { if (alive) setCategories([]); })
      .finally(() => { if (alive) setLoadingCategories(false); });
    return () => { alive = false; };
  }, [companyId, editingCell]);

  useEffect(() => {
    if (editingCell !== 'konto' && editingCell !== 'kategori' && editingCell !== 'ansvarig') {
      setDropdownRect(null);
      return;
    }
    const el = editingCell === 'konto' ? cellRefKonto.current : editingCell === 'kategori' ? cellRefKategori.current : cellRefAnsvarig.current;
    if (!el?.getBoundingClientRect) return;
    const id = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      setDropdownRect({ top: rect.bottom, left: rect.left, width: Math.max(rect.width, 200), height: 220 });
    });
    return () => cancelAnimationFrame(id);
  }, [editingCell]);

  const accountMatches = useMemo(() => {
    const q = String(editValue || '').trim().toLowerCase();
    const list = Array.isArray(accounts) ? accounts : [];
    if (!q) return list.slice(0, 15);
    return list.filter((a) => {
      const k = safeText(a?.konto).toLowerCase();
      const b = safeText(a?.benamning).toLowerCase();
      return k.includes(q) || b.includes(q) || k.startsWith(q) || b.startsWith(q);
    }).slice(0, 15);
  }, [accounts, editValue]);

  const categoryMatches = useMemo(() => {
    const q = String(editValue || '').trim().toLowerCase();
    const list = Array.isArray(categories) ? categories : [];
    if (!q) return list.slice(0, 15);
    return list.filter((c) => {
      const n = safeText(c?.name).toLowerCase();
      return n.includes(q) || n.startsWith(q);
    }).slice(0, 15);
  }, [categories, editValue]);

  const startEdit = useCallback((cell, currentValue) => {
    setEditingCell(cell);
    setEditValue(currentValue === '—' ? '' : currentValue);
  }, []);

  const handleCellPress = useCallback((cell, valueForEdit) => {
    const now = Date.now();
    const { cell: lastCell, time: lastTime } = lastTapRef.current;
    if (canEdit && lastCell === cell && (now - lastTime) < DBL_TAP_MS) {
      lastTapRef.current = { cell: null, time: 0 };
      startEdit(cell, valueForEdit);
    } else {
      onSelectRow?.(row);
      onToggleExpand?.(row);
      lastTapRef.current = { cell, time: now };
    }
  }, [canEdit, row, onSelectRow, onToggleExpand, startEdit]);

  const saveAndClose = useCallback(
    async (cell, value) => {
      setEditingCell(null);
      if (!rowId || !companyId || !projectId) return;
      const trimmed = String(value ?? '').trim();
      if (cell === 'bd') {
        const nr = trimmed || null;
        if (nr === (row?.nr ?? '') || (nr === null && !row?.nr)) return;
        try {
          await updateInkopsplanRowFields(companyId, projectId, rowId, { nr: nr || '' });
          try { onRowsChanged?.(); } catch (_e) {}
        } catch (e) {
          setEditValue(row?.nr ?? '');
        }
        return;
      }
      if (cell === 'name') {
        const nameVal = capitalizeFirst(trimmed || '');
        if (nameVal === (row?.name ?? '')) return;
        try {
          await updateInkopsplanRowFields(companyId, projectId, rowId, { name: nameVal || (row?.name ?? '') });
          try { onRowsChanged?.(); } catch (_e) {}
        } catch (e) {
          setEditValue(row?.name ?? '');
        }
      }
    },
    [rowId, companyId, projectId, row?.nr, row?.name, onRowsChanged],
  );

  const pickAccount = useCallback(
    async (account) => {
      setEditingCell(null);
      if (!rowId || !companyId || !projectId) return;
      try {
        await updateInkopsplanRowFields(companyId, projectId, rowId, {
          linkedAccountId: account?.id ?? null,
          linkedAccountKonto: safeText(account?.konto) || null,
          linkedAccountBenamning: safeText(account?.benamning) || null,
        });
        try { onRowsChanged?.(); } catch (_e) {}
      } catch (_e) {}
    },
    [rowId, companyId, projectId, onRowsChanged],
  );

  const pickCategory = useCallback(
    async (category) => {
      if (!rowId || !companyId || !projectId) return;
      const newId = category?.id ?? null;
      const newName = safeText(category?.name) || null;
      if (!newId && !newName) return;
      const prevIds = Array.isArray(row?.linkedCategoryIds) ? row.linkedCategoryIds : (row?.linkedCategoryId ? [safeText(row.linkedCategoryId)] : []);
      const prevNames = Array.isArray(row?.linkedCategoryNames) ? row.linkedCategoryNames : (row?.linkedCategoryName ? [safeText(row.linkedCategoryName)] : []);
      const already = prevIds.some((id) => id === newId) || prevNames.some((n) => safeText(n) === newName);
      if (already) return;
      const linkedCategoryIds = [...prevIds, newId].filter(Boolean);
      const linkedCategoryNames = [...prevNames, newName].filter(Boolean);
      try {
        await updateInkopsplanRowFields(companyId, projectId, rowId, { linkedCategoryIds, linkedCategoryNames });
        try { onRowsChanged?.(); } catch (_e) {}
        setEditValue('');
      } catch (_e) {}
    },
    [rowId, companyId, projectId, row?.linkedCategoryIds, row?.linkedCategoryNames, row?.linkedCategoryId, row?.linkedCategoryName, onRowsChanged],
  );

  const pickResponsible = useCallback(
    async (member) => {
      setEditingCell(null);
      if (!rowId || !companyId || !projectId) return;
      const responsibleId = member == null ? null : (member?.id ?? null);
      const responsibleName = member == null ? null : (safeText(member?.name) || null);
      try {
        await updateInkopsplanRowFields(companyId, projectId, rowId, { responsibleId, responsibleName });
        try { onRowsChanged?.(); } catch (_e) {}
      } catch (_e) {}
    },
    [rowId, companyId, projectId, onRowsChanged],
  );

  const handleBlur = useCallback(() => {
    if (editingCell) saveAndClose(editingCell, editValue);
  }, [editingCell, editValue, saveAndClose]);

  const handleSubmitBD = useCallback(() => {
    saveAndClose('bd', editValue);
  }, [editValue, saveAndClose]);

  const handleSubmitName = useCallback(() => {
    saveAndClose('name', capitalizeFirst(editValue));
  }, [editValue, saveAndClose]);

  const rowStyle = [
    ts.row,
    isAlt && ts.rowAlt,
    isSelected && ts.rowSelected,
    isRowHovered && ts.rowHover,
  ];

  const rowProps = Platform.OS === 'web' ? {
    onMouseEnter: () => setIsRowHovered(true),
    onMouseLeave: () => setIsRowHovered(false),
    onContextMenu: (e) => {
      try { e.preventDefault(); } catch (_) {}
      onRowContextMenu?.(row, e);
    },
  } : {};

  return (
    <View style={rowStyle} {...rowProps}>
      <Pressable
        style={[ts.cell, ts.colExpand]}
        onPress={() => {
          onSelectRow?.(row);
          onToggleExpand?.(row);
        }}
      >
        <View style={styles.chevronWrap}>
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color="#64748B"
          />
        </View>
      </Pressable>
      <View style={[ts.cell, ts.colBd]}>
        {canEdit && editingCell === 'bd' ? (
          <TextInput
            value={editValue}
            onChangeText={setEditValue}
            onBlur={handleBlur}
            onSubmitEditing={handleSubmitBD}
            keyboardType={Platform.OS === 'web' ? 'default' : 'number-pad'}
            style={styles.cellInput}
            autoFocus
            selectTextOnFocus
          />
        ) : (
          <Pressable
            onPress={() => handleCellPress('bd', bd)}
            style={({ hovered }) => [styles.cellInputTouch, hovered && ts.rowHover]}
          >
            <Text style={styles.cellText} numberOfLines={1}>{bd}</Text>
          </Pressable>
        )}
      </View>
      <View style={[ts.cell, ts.colName]}>
        {canEdit && editingCell === 'name' ? (
          <TextInput
            value={editValue}
            onChangeText={setEditValue}
            onBlur={handleBlur}
            onSubmitEditing={handleSubmitName}
            style={styles.cellInput}
            autoFocus
            selectTextOnFocus
            autoCapitalize="sentences"
          />
        ) : (
          <Pressable
            onPress={() => handleCellPress('name', name)}
            style={({ hovered }) => [styles.cellInputTouch, hovered && ts.rowHover]}
          >
            <Text style={styles.cellText} numberOfLines={1}>{name}</Text>
          </Pressable>
        )}
      </View>
      <View ref={cellRefKonto} style={[ts.cell, ts.colKonto, styles.cellWithDropdown]}>
        {canEdit && editingCell === 'konto' ? (
          <>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              onBlur={() => setTimeout(() => setEditingCell(null), 150)}
              placeholder="Sök konto eller benämning…"
              style={styles.cellInput}
              autoFocus
              selectTextOnFocus
            />
            {(() => {
              const content = loadingAccounts ? (
                <Text style={styles.dropdownMuted}>Laddar…</Text>
              ) : accountMatches.length === 0 ? (
                <Text style={styles.dropdownMuted}>Inga träffar</Text>
              ) : (
                <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                  {accountMatches.map((a) => (
                    <Pressable
                      key={a?.id || safeText(a?.konto)}
                      onPress={() => pickAccount(a)}
                      style={({ hovered, pressed }) => [styles.dropdownRow, (hovered || pressed) && styles.dropdownRowHover]}
                    >
                      <Text style={styles.dropdownRowMain} numberOfLines={1}>
                        {safeText(a?.konto)} {safeText(a?.benamning)}
                      </Text>
                    </Pressable>
                  ))}
                </ScrollView>
              );
              if (Platform.OS === 'web' && createPortal && dropdownRect) {
                return createPortal(
                  <View style={[styles.dropdownList, styles.dropdownListPortal, { top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, maxHeight: dropdownRect.height }]}>
                    {content}
                  </View>,
                  document.body,
                );
              }
              return <View style={styles.dropdownList}>{content}</View>;
            })()}
          </>
        ) : (
          <Pressable
            onPress={() => handleCellPress('konto', konto)}
            style={({ hovered }) => [styles.cellInputTouch, hovered && ts.rowHover]}
          >
            <Text style={[styles.cellText, ts.cellMuted]} numberOfLines={1}>{konto}</Text>
          </Pressable>
        )}
      </View>
      <View ref={cellRefKategori} style={[ts.cell, ts.colKategori, styles.cellWithDropdown]}>
        {canEdit && editingCell === 'kategori' ? (
          <>
            <TextInput
              value={editValue}
              onChangeText={setEditValue}
              onBlur={() => setTimeout(() => setEditingCell(null), 150)}
              placeholder="Sök kategori…"
              style={styles.cellInput}
              autoFocus
              selectTextOnFocus
            />
            {(() => {
              const content = loadingCategories ? (
                <Text style={styles.dropdownMuted}>Laddar…</Text>
              ) : categoryMatches.length === 0 ? (
                <Text style={styles.dropdownMuted}>Inga träffar</Text>
              ) : (
                <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                  {categoryMatches.map((c) => (
                    <Pressable
                      key={c?.id || safeText(c?.name)}
                      onPress={() => pickCategory(c)}
                      style={({ hovered, pressed }) => [styles.dropdownRow, (hovered || pressed) && styles.dropdownRowHover]}
                    >
                      <Text style={styles.dropdownRowMain} numberOfLines={1}>{safeText(c?.name)}</Text>
                    </Pressable>
                  ))}
                </ScrollView>
              );
              if (Platform.OS === 'web' && createPortal && dropdownRect) {
                return createPortal(
                  <View style={[styles.dropdownList, styles.dropdownListPortal, { top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, maxHeight: dropdownRect.height }]}>
                    {content}
                  </View>,
                  document.body,
                );
              }
              return <View style={styles.dropdownList}>{content}</View>;
            })()}
          </>
        ) : (
          <Pressable
            onPress={() => handleCellPress('kategori', kategori)}
            style={({ hovered }) => [styles.cellInputTouch, hovered && ts.rowHover]}
          >
            <Text style={[styles.cellText, ts.cellMuted]} numberOfLines={1}>{kategori}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => onSelectRow?.(row)}
        style={({ hovered }) => [ts.cell, ts.colStatus, hovered && ts.rowHover]}
      >
        <InkopsplanStatusBadge status={overallStatus} />
      </Pressable>
      <View ref={cellRefAnsvarig} style={[ts.cell, ts.colAnsvarig, styles.cellWithDropdown]}>
        {canEdit && editingCell === 'ansvarig' ? (
          (() => {
            const content = projectMembers.length === 0 ? (
              <Text style={styles.dropdownMuted}>Inga projektmedlemmar</Text>
            ) : (
              <ScrollView style={styles.dropdownScroll} keyboardShouldPersistTaps="handled">
                <Pressable
                  onPress={() => pickResponsible(null)}
                  style={({ hovered, pressed }) => [styles.dropdownRow, (hovered || pressed) && styles.dropdownRowHover]}
                >
                  <Text style={styles.dropdownRowMain}>— Ingen</Text>
                </Pressable>
                {projectMembers.map((m) => (
                  <Pressable
                    key={m?.id}
                    onPress={() => pickResponsible(m)}
                    style={({ hovered, pressed }) => [styles.dropdownRow, (hovered || pressed) && styles.dropdownRowHover]}
                  >
                    <Text style={styles.dropdownRowMain} numberOfLines={1}>{safeText(m?.name)}</Text>
                  </Pressable>
                ))}
              </ScrollView>
            );
            if (Platform.OS === 'web' && createPortal && dropdownRect) {
              return createPortal(
                <View style={[styles.dropdownList, styles.dropdownListPortal, { top: dropdownRect.top, left: dropdownRect.left, width: dropdownRect.width, maxHeight: dropdownRect.height }]}>
                  {content}
                </View>,
                document.body,
              );
            }
            return <View style={styles.dropdownList}>{content}</View>;
          })()
        ) : (
          <Pressable
            onPress={() => handleCellPress('ansvarig', ansvarig)}
            style={({ hovered }) => [styles.cellInputTouch, hovered && ts.rowHover]}
          >
            <Text style={[styles.cellText, ts.cellMuted]} numberOfLines={1}>{ansvarig}</Text>
          </Pressable>
        )}
      </View>
      <Pressable
        onPress={() => {
          if (canEdit && typeof onOpenInquiryModal === 'function') {
            onOpenInquiryModal(row);
          } else {
            onSelectRow?.(row);
          }
        }}
        style={({ hovered }) => [ts.cell, ts.colRequest, styles.requestCellWrap, hovered && ts.rowHover]}
      >
        {inquiryDraft ? (
          <Ionicons name="checkmark-circle" size={16} color="#22C55E" style={styles.requestCellIcon} />
        ) : null}
        <Text style={[styles.cellText, ts.cellMuted]} numberOfLines={1}>
          {inquiryDraft ? `${inquiryDraft.slice(0, 32)}${inquiryDraft.length > 32 ? '…' : ''}` : request}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  chevronWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'stretch',
  },
  cellText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
  },
  cellInputTouch: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'center',
  },
  cellInput: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '500',
    color: '#111',
    paddingVertical: 2,
    paddingHorizontal: 4,
    margin: -2,
    borderWidth: 1,
    borderColor: '#94A3B8',
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  cellWithDropdown: {
    position: 'relative',
  },
  dropdownList: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 2,
    minHeight: 40,
    maxHeight: 220,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    zIndex: 1000,
  },
  dropdownListPortal: {
    position: 'fixed',
    zIndex: 10000,
    marginTop: 2,
    minHeight: 40,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dropdownScroll: {
    maxHeight: 216,
  },
  dropdownRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  dropdownRowHover: {
    backgroundColor: '#F1F5F9',
  },
  dropdownRowMain: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  dropdownMuted: {
    fontSize: 12,
    color: '#64748B',
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  requestCellWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  requestCellIcon: {
    flexShrink: 0,
  },
});
