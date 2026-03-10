import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { MODAL_DESIGN_2026 } from '../../../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../../../constants/tableLayout';

import { addManualRow } from '../inkopsplanService';
import { useInkopsplanUserPrefs } from '../useInkopsplanUserPrefs';
import InkopsplanRow from './InkopsplanRow';
import InkopsplanRowExpanded from './InkopsplanRowExpanded';

const TABLE = MODAL_DESIGN_2026;
const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 600;
const RESIZE_HANDLE_WIDTH = 6;
const RESIZE_HANDLE_HIT_WIDTH = 14;
const CHARS_TO_WIDTH = 8;
const CELL_PADDING = COLUMN_PADDING_LEFT + COLUMN_PADDING_RIGHT + 12;
const COL_EXPAND_WIDTH = 36;
const DEFAULT_INKOP_WIDTHS = { bd: 72, name: 160, konto: 88, kategori: 100, status: 76, ansvarig: 90, request: 100 };

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function getInkopDisplayText(row, columnId) {
  if (columnId === 'bd' || columnId === 'nr') return safeText(row?.nr) || '—';
  if (columnId === 'name') return safeText(row?.name) || '—';
  if (columnId === 'konto') {
    const k = safeText(row?.linkedAccountKonto);
    const b = safeText(row?.linkedAccountBenamning);
    if (k || b) return k ? `${k}${b ? ` ${b}` : ''}` : b;
    return row?.type === 'account' ? (safeText(row?.nr) || '—') : '—';
  }
  if (columnId === 'kategori') {
    const arr = Array.isArray(row?.linkedCategoryNames) ? row.linkedCategoryNames.map((n) => safeText(n)).filter(Boolean) : [];
    if (arr.length) return arr.join(', ');
    const linked = safeText(row?.linkedCategoryName);
    if (linked) return linked;
    return row?.type === 'category' ? (safeText(row?.name) || '—') : '—';
  }
  if (columnId === 'ansvarig') return safeText(row?.responsibleName || row?.ansvarig) || '—';
  if (columnId === 'status' || columnId === 'request') {
    const list = Array.isArray(row?.suppliers) ? row.suppliers : [];
    const total = list.length;
    let sent = 0;
    let received = 0;
    list.forEach((s) => {
      const st = safeText(s?.requestStatus).toLowerCase();
      if (st === 'skickad') sent += 1;
      if (st === 'svar_mottaget') { sent += 1; received += 1; }
      if (row?.requestSentAt && !st) sent += 1;
    });
    if (columnId === 'status') {
      if (total === 0) return 'utkast';
      if (received > 0) return 'klar';
      if (sent > 0) return 'skickad';
      return 'pågår';
    }
    if (columnId === 'request') {
      if (total === 0) return '—';
      if (received > 0) return `${received}/${total} svar`;
      if (sent > 0) return `${sent}/${total} skickade`;
      return 'Ej skickad';
    }
  }
  return '—';
}

function contentWidthForColumn(headerLabel, cellTexts) {
  let maxLen = String(headerLabel ?? '').length;
  (cellTexts || []).forEach((t) => {
    const len = String(t ?? '').length;
    if (len > maxLen) maxLen = len;
  });
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, maxLen * CHARS_TO_WIDTH + CELL_PADDING));
}

const InkopsplanTable = forwardRef(function InkopsplanTable({
  companyId,
  projectId,
  rows,
  projectMembers = [],
  onRowsChanged,
  selectedRowId = null,
  onSelectRow,
  expandedRowId = null,
  onToggleRowExpand,
  selectedSupplierKey = null,
  onSelectSupplier,
  onSupplierContextMenu,
  onRowContextMenu,
  onOpenInquiryModal,
}, ref) {

  const [savingManual, setSavingManual] = useState(false);

  const COLUMN_DEFS = useMemo(() => ([
    { id: 'bd', label: 'BD' },
    { id: 'name', label: 'Benämning' },
    { id: 'konto', label: 'Konto' },
    { id: 'kategori', label: 'Kategori' },
    { id: 'status', label: 'Status' },
    { id: 'ansvarig', label: 'Ansvarig' },
    { id: 'request', label: 'Förfrågan' },
  ]), []);

  const { prefs, setPrefs } = useInkopsplanUserPrefs({ companyId, projectId });
  const [columnWidths, setColumnWidths] = useState(DEFAULT_INKOP_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const filteredListRef = useRef([]);

  const w = columnWidths;
  const col = useCallback((key) => ({ width: w[key], minWidth: w[key], flexShrink: 0 }), [w]);

  const startResize = useCallback((column, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column], didMove: false };
  }, [columnWidths]);

  const widenColumn = useCallback((column) => {
    if (Platform.OS !== 'web') return;
    const def = COLUMN_DEFS.find((c) => c.id === column);
    const headerLabel = def ? def.label : '';
    const list = filteredListRef.current || [];
    const cellTexts = list.map((row) => getInkopDisplayText(row, column));
    const newWidth = contentWidthForColumn(headerLabel, cellTexts);
    setColumnWidths((prev) => ({
      ...prev,
      [column]: newWidth,
    }));
  }, [COLUMN_DEFS]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      resizeRef.current.didMove = true;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      resizeRef.current = { ...resizeRef.current, startX: clientX, startWidth: newWidth };
    };
    const onUp = () => {
      const { column, didMove } = resizeRef.current;
      if (column != null && !didMove) {
        const def = COLUMN_DEFS.find((c) => c.id === column);
        const headerLabel = def ? def.label : '';
        const list = filteredListRef.current || [];
        const cellTexts = list.map((row) => getInkopDisplayText(row, column));
        const newWidth = contentWidthForColumn(headerLabel, cellTexts);
        setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      }
      resizeRef.current = { column: null, startX: 0, startWidth: 0, didMove: false };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [COLUMN_DEFS]);

  const handleAddNewManualRow = async () => {
    if (!companyId || !projectId || savingManual) return;
    setSavingManual(true);
    try {
      await addManualRow({
        companyId,
        projectId,
        nr: '',
        name: 'Ny rad',
        manualTypeLabel: 'Manuell',
      });
      try { onRowsChanged?.(); } catch (_e) {}
    } catch (e) {
      Alert.alert('Kunde inte lägga till rad', e?.message || 'Okänt fel');
    } finally {
      setSavingManual(false);
    }
  };

  useImperativeHandle(ref, () => ({
    addNewManualRow: () => {
      if (!savingManual) handleAddNewManualRow();
    },
    saveManualRow: () => {},
  }), [savingManual]);

  const list = Array.isArray(rows) ? rows : [];

  const visibleColumns = useMemo(() => {
    const listIds = Array.isArray(prefs?.visibleColumns) ? prefs.visibleColumns : [];
    const out = {};
    (COLUMN_DEFS || []).forEach((c) => { out[c.id] = listIds.includes(c.id); });
    if (!Object.values(out).some(Boolean)) out.name = true;
    return out;
  }, [prefs?.visibleColumns, COLUMN_DEFS]);

  const activeTypes = useMemo(() => {
    const t = Array.isArray(prefs?.typeFilter) ? prefs.typeFilter : [];
    return t.length ? t : ['building_part', 'account', 'category', 'manual'];
  }, [prefs?.typeFilter]);

  const tableStyles = useMemo(() => ({
    row: [styles.tableRowBase, isWeb() && styles.tableRowGapWeb],
    rowAlt: styles.tableRowAlt,
    rowHover: styles.tableRowHover,
    rowSelected: styles.tableRowSelected,
    cell: styles.tableCell,
    cellMuted: styles.tableCellMuted,
    colExpand: { width: COL_EXPAND_WIDTH, minWidth: COL_EXPAND_WIDTH, flexShrink: 0 },
    colBd: col('bd'),
    colName: col('name'),
    colKonto: col('konto'),
    colKategori: col('kategori'),
    colStatus: col('status'),
    colAnsvarig: col('ansvarig'),
    colRequest: col('request'),
  }), [col]);

  const getSortValue = useCallback((r, key) => {
    if (key === 'type') {
      const v = safeText(r?.type);
      if (v === 'building_part') return 1;
      if (v === 'account') return 2;
      if (v === 'category') return 3;
      if (v === 'manual') return 4;
      return 99;
    }
    if (key === 'bd' || key === 'nr') {
      const nn = r?.nrNumeric;
      if (Number.isFinite(nn)) return nn;
      const n = Number.parseInt(safeText(r?.nr), 10);
      return Number.isFinite(n) ? n : null;
    }
    if (key === 'name') return safeText(r?.name);
    if (key === 'konto') {
      const t = safeText(r?.type);
      return t === 'account' ? safeText(r?.nr) : '';
    }
    if (key === 'kategori') {
      const t = safeText(r?.type);
      return t === 'category' ? safeText(r?.name) : '';
    }
    if (key === 'status' || key === 'ansvarig' || key === 'request') {
      const list = Array.isArray(r?.suppliers) ? r.suppliers : [];
      let sent = 0, received = 0, anyBid = false;
      list.forEach((s) => {
        const st = safeText(s?.requestStatus).toLowerCase();
        if (st === 'svar_mottaget' || s?.quoteReceivedAt) { sent++; received++; anyBid = true; }
        else if (st === 'skickad' || r?.requestSentAt) sent++;
      });
      if (key === 'status') return anyBid ? 'klar' : sent > 0 ? 'skickad' : list.length > 0 ? 'pågår' : 'utkast';
      if (key === 'request') return received > 0 ? `${received}/${list.length} svar` : sent > 0 ? `${sent}/${list.length} skickade` : list.length > 0 ? 'Ej skickad' : '—';
      return safeText(r?.responsibleName || r?.ansvarig);
    }
    return safeText(r?.name);
  }, []);

  const filteredSorted = useMemo(() => {
    const base = list.filter((r) => {
      const t = safeText(r?.type);
      return !t || activeTypes.includes(t);
    });

    const sortKey = safeText(prefs?.sortKey) || 'nr';
    const sortDir = safeText(prefs?.sortDir) === 'desc' ? 'desc' : 'asc';
    const dirMul = sortDir === 'desc' ? -1 : 1;
    const isNumeric = sortKey === 'bd' || sortKey === 'nr' || sortKey === 'type';

    const cmp = (a, b) => {
      const va = getSortValue(a, sortKey);
      const vb = getSortValue(b, sortKey);
      if (isNumeric && va != null && vb != null && typeof va === 'number' && typeof vb === 'number') {
        return (va - vb) * dirMul;
      }
      if (isNumeric && va != null && vb == null) return -1 * dirMul;
      if (isNumeric && va == null && vb != null) return 1 * dirMul;
      const sa = typeof va === 'number' ? String(va) : String(va ?? '');
      const sb = typeof vb === 'number' ? String(vb) : String(vb ?? '');
      const c = sa.localeCompare(sb, 'sv');
      if (c !== 0) return c * dirMul;
      return safeText(a?.id).localeCompare(safeText(b?.id), 'sv');
    };

    return base.slice().sort(cmp);
  }, [list, activeTypes, prefs?.sortKey, prefs?.sortDir, getSortValue]);

  useEffect(() => {
    filteredListRef.current = filteredSorted;
  }, [filteredSorted]);

  const totalTableWidth = useMemo(() => {
    const sum = COL_EXPAND_WIDTH + (w.bd || 0) + (w.name || 0) + (w.konto || 0) + (w.kategori || 0) + (w.status || 0) + (w.ansvarig || 0) + (w.request || 0);
    return sum + 7 * RESIZE_HANDLE_HIT_WIDTH;
  }, [w]);

  const handleSort = useCallback((columnId) => {
    const key = columnId === 'bd' ? 'nr' : columnId;
    setPrefs({
      sortKey: key,
      sortDir: prefs?.sortKey === key && prefs?.sortDir === 'asc' ? 'desc' : 'asc',
    });
  }, [prefs?.sortKey, prefs?.sortDir, setPrefs]);

  const sortKey = safeText(prefs?.sortKey) || 'nr';
  const sortDir = safeText(prefs?.sortDir) === 'desc' ? 'desc' : 'asc';
  const isSorted = (colId) => (colId === 'bd' ? sortKey === 'nr' : sortKey === colId);

  return (
    <View style={[styles.wrap, isWeb() && { minWidth: totalTableWidth }]}>
      <View style={styles.tableWrap}>
        <View style={[styles.tableHeader, isWeb() && styles.tableHeaderGapWeb]}>
          <View style={[styles.headerCell, tableStyles.colExpand]} />
          {isWeb() && <View style={styles.resizeHandle}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('bd')]}>
            <Pressable onPress={() => handleSort('bd')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('bd') && styles.headerTextSorted]} numberOfLines={1}>BD</Text>
              {isSorted('bd') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('bd', e)} onDoubleClick={() => widenColumn('bd')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('name')]}>
            <Pressable onPress={() => handleSort('name')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('name') && styles.headerTextSorted]} numberOfLines={1}>Benämning</Text>
              {isSorted('name') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('name', e)} onDoubleClick={() => widenColumn('name')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('konto')]}>
            <Pressable onPress={() => handleSort('konto')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('konto') && styles.headerTextSorted]} numberOfLines={1}>Konto</Text>
              {isSorted('konto') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('konto', e)} onDoubleClick={() => widenColumn('konto')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('kategori')]}>
            <Pressable onPress={() => handleSort('kategori')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('kategori') && styles.headerTextSorted]} numberOfLines={1}>Kategori</Text>
              {isSorted('kategori') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('kategori', e)} onDoubleClick={() => widenColumn('kategori')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('status')]}>
            <Pressable onPress={() => handleSort('status')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('status') && styles.headerTextSorted]} numberOfLines={1}>Status</Text>
              {isSorted('status') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('status', e)} onDoubleClick={() => widenColumn('status')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('ansvarig')]}>
            <Pressable onPress={() => handleSort('ansvarig')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('ansvarig') && styles.headerTextSorted]} numberOfLines={1}>Ansvarig</Text>
              {isSorted('ansvarig') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('ansvarig', e)} onDoubleClick={() => widenColumn('ansvarig')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('request')]}>
            <Pressable onPress={() => handleSort('request')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('request') && styles.headerTextSorted]} numberOfLines={1}>Förfrågan</Text>
              {isSorted('request') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          <View style={styles.cellSpacer} />
        </View>

        <View style={styles.tableBody}>
          {filteredSorted.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>Ingen inköpsplan ännu</Text>
              <Text style={styles.emptyText}>Skapa inköpsplanen från register, eller lägg till en manuell rad.</Text>
            </View>
          ) : null}

          {filteredSorted.map((r, idx) => {
            const id = safeText(r?.id);
            const isSelected = selectedRowId != null && String(selectedRowId) === id;
            const isExpanded = expandedRowId != null && String(expandedRowId) === id;
            return (
              <View key={id || `row-${idx}`} style={styles.rowBlock}>
                <InkopsplanRow
                  row={r}
                  isSelected={isSelected}
                  isExpanded={isExpanded}
                  onSelectRow={onSelectRow}
                  onToggleExpand={onToggleRowExpand}
                  onRowContextMenu={onRowContextMenu}
                  tableStyles={tableStyles}
                  isAlt={idx % 2 === 1}
                  companyId={companyId}
                  projectId={projectId}
                  projectMembers={projectMembers}
                  onRowsChanged={onRowsChanged}
                  onOpenInquiryModal={onOpenInquiryModal}
                />
                {isExpanded ? (
                  <View style={styles.expandedWrap}>
                    <InkopsplanRowExpanded
                      row={r}
                      companyId={companyId}
                      projectId={projectId}
                      selectedSupplierKey={selectedSupplierKey}
                      onSelectSupplier={onSelectSupplier}
                      onSupplierContextMenu={onSupplierContextMenu}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
});

export default InkopsplanTable;

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  tableWrap: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderColor: TABLE.tableBorderColor,
    borderRadius: TABLE.tableRadius,
    overflow: 'visible',
    backgroundColor: TABLE.tableRowBackgroundColor,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    backgroundColor: TABLE.tableHeaderBackgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.tableHeaderBorderColor,
  },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
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
  headerSortable: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  headerSortableHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  headerText: {
    fontSize: TABLE.tableHeaderFontSize,
    fontWeight: TABLE.tableHeaderFontWeight,
    color: TABLE.tableHeaderColor,
  },
  headerTextSorted: {
    fontWeight: '700',
  },
  sortArrow: {
    fontSize: 10,
    color: TABLE.tableHeaderColor,
    marginLeft: 2,
  },
  tableBody: {
    minHeight: 0,
  },
  rowBlock: {
    minHeight: 0,
  },
  expandedWrap: {
    paddingLeft: COL_EXPAND_WIDTH + 8,
    paddingRight: TABLE.tableCellPaddingHorizontal,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.tableRowBorderColor,
    backgroundColor: '#FAFAFA',
  },
  tableHeaderGapWeb: { gap: 0 },
  tableRowBase: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TABLE.tableRowHeight,
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.tableRowBorderColor,
    backgroundColor: TABLE.tableRowBackgroundColor,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  tableRowGapWeb: { gap: RESIZE_HANDLE_HIT_WIDTH },
  tableRowAlt: {
    backgroundColor: TABLE.tableRowAltBackgroundColor,
  },
  tableRowHover: {
    backgroundColor: TABLE.tableRowHoverBackgroundColor,
  },
  tableRowSelected: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#BFDBFE',
  },
  tableCell: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    justifyContent: 'center',
    minWidth: 0,
  },
  tableCellMuted: {
    color: TABLE.tableCellMutedColor,
  },
  resizeHandle: {
    width: RESIZE_HANDLE_HIT_WIDTH,
    minWidth: RESIZE_HANDLE_HIT_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'col-resize' } : {}),
  },
  resizeHandleLine: {
    position: 'absolute',
    left: Math.floor(RESIZE_HANDLE_HIT_WIDTH / 2) - 1,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#94A3B8',
    borderRadius: 1,
  },
  cellSpacer: { flex: 1, minWidth: 0 },
  empty: {
    minHeight: 140,
    paddingVertical: 24,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    backgroundColor: TABLE.tableRowBackgroundColor,
    justifyContent: 'center',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 13,
    color: TABLE.tableCellMutedColor,
  },
});
