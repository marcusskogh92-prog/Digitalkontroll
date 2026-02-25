/**
 * Tabell för Kategoriregister – kolumner: Kategori, Beskrivning.
 * Samma DataGrid-pattern som Kunder/Byggdel: ingen kebab (högerklick/dubbelklick), justerbara kolumner, MODAL_DESIGN_2026.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';

const TABLE = MODAL_DESIGN_2026;

const DEFAULT_COLUMN_WIDTHS = { name: 160, note: 220 };
const MIN_COLUMN_WIDTH = 60;
const RESIZE_HANDLE_WIDTH = 6;
const FIXED_SELECT = 44;

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
  headerColumnContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'stretch',
  },
  headerText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
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
  rowAlt: { backgroundColor: '#f8fafc' },
  rowHover: { backgroundColor: '#eef6ff' },
  inlineAddWrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f0f9ff',
  },
  inlineAddHint: { fontSize: 11, color: '#64748b', marginLeft: 8, flexShrink: 0 },
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
  editRowBtnPrimary: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  editRowBtnCancel: { borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  selectCol: {
    width: FIXED_SELECT,
    minWidth: FIXED_SELECT,
    maxWidth: FIXED_SELECT,
    flexShrink: 0,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 3,
  },
  selectColHeader: { backgroundColor: '#f1f5f9', paddingVertical: 5 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94a3b8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#2563eb', borderColor: '#2563eb' },
  cellText: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  cellMuted: { fontSize: 13, color: '#64748b', fontWeight: '400' },
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

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

export default function KategoriTable({
  items,
  sortColumn,
  sortDirection,
  onSort,
  editingId = null,
  saving = false,
  onSaveEdit,
  onCancelEdit,
  onRowMenu,
  onRowContextMenu,
  onRowDoubleClick,
  inlineEnabled = false,
  inlineValues,
  inlineSaving = false,
  onInlineChange,
  onInlineSave,
  inlineNameInputRef,
  selectionMode = false,
  selectedCategoryIds = [],
  onSelectionChange,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', note: '' });
  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const lastTapRef = useRef({ id: null, time: 0 });
  const DOUBLE_TAP_MS = 350;

  const w = columnWidths;
  const col = (key) => ({ width: w[key], minWidth: w[key], flexShrink: 0 });
  const gapBetweenCols = Platform.OS === 'web' ? RESIZE_HANDLE_WIDTH : 8;
  const totalTableWidth =
    (selectionMode ? FIXED_SELECT : 0) + w.name + w.note + gapBetweenCols;

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

  const editingItem = editingId ? (items.find((i) => i.id === editingId) || null) : null;
  /* eslint-disable react-hooks/exhaustive-deps */
  React.useEffect(() => {
    if (editingItem) {
      setEditDraft({
        name: String(editingItem.name ?? '').trim(),
        note: String(editingItem.note ?? '').trim(),
      });
    } else {
      setEditDraft({ name: '', note: '' });
    }
  }, [editingId, editingItem?.id]);
  /* eslint-enable react-hooks/exhaustive-deps */

  const handleEditKeyDown = (e, item) => {
    if (Platform.OS !== 'web') return;
    const key = e.key ?? e.nativeEvent?.key;
    if (key === 'Enter') {
      e.preventDefault();
      if (onSaveEdit && !saving && editDraft.name.trim()) {
        onSaveEdit(item.id, {
          name: editDraft.name.trim(),
          note: editDraft.note.trim(),
        });
      }
    } else if (key === 'Escape') {
      e.preventDefault();
      onCancelEdit?.();
    }
  };

  const SortIcon = ({ col }) =>
    sortColumn !== col ? (
      <Ionicons name="swap-vertical-outline" size={14} color="#cbd5e1" />
    ) : (
      <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />
    );

  const handleInlineEnter = (e) => {
    if (Platform.OS !== 'web') return;
    const key = e.key ?? e.nativeEvent?.key;
    const keyCode = e.keyCode ?? e.nativeEvent?.keyCode;
    const isEnter = key === 'Enter' || keyCode === 13;
    if (isEnter) {
      e.preventDefault();
      e.stopPropagation?.();
      if (!inlineSaving) requestAnimationFrame(() => onInlineSave?.());
    }
  };
  const toggleSelection = (id) => {
    if (!onSelectionChange) return;
    const set = new Set(selectedCategoryIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onSelectionChange(Array.from(set));
  };

  return (
    <View style={[styles.tableWrap, { minWidth: totalTableWidth, width: '100%' }]}>
      <View style={[styles.header, Platform.OS === 'web' && styles.headerGapWeb]}>
        {selectionMode ? (
          <View style={[styles.selectCol, styles.selectColHeader]}>
            <Text style={[styles.headerText, { fontSize: 11 }]}>Val</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('name')]}
          onPress={() => onSort('name')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText}>Kategori</Text>
            <SortIcon col="name" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('name', e)}><View style={styles.resizeHandleLine} /></View>}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, col('note')]}
          onPress={() => onSort('note')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={[styles.columnContent, styles.headerColumnContent]}>
            <Text style={styles.headerText}>Beskrivning</Text>
            <SortIcon col="note" />
          </View>
        </TouchableOpacity>
        {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('note', e)}><View style={styles.resizeHandleLine} /></View>}
        <View style={styles.cellSpacer} />
      </View>

      {inlineEnabled && (
        <View style={styles.inlineAddWrap}>
          <View
            style={[styles.inlineRow, Platform.OS === 'web' && styles.rowGapWeb]}
            {...(Platform.OS === 'web'
              ? {
                  onKeyDownCapture: (e) => {
                    const key = e.key ?? e.nativeEvent?.key;
                    const keyCode = e.keyCode ?? e.nativeEvent?.keyCode;
                    if (key === 'Enter' || keyCode === 13) {
                      e.preventDefault();
                      e.stopPropagation();
                      if (!inlineSaving) requestAnimationFrame(() => onInlineSave?.());
                    }
                  },
                }
              : {})}
          >
            {selectionMode ? <View style={[styles.selectCol, { backgroundColor: '#f0f9ff' }]} /> : null}
            <TextInput
              ref={inlineNameInputRef}
              value={inlineValues?.name ?? ''}
              onChangeText={(v) => onInlineChange?.('name', v)}
              placeholder="t.ex. Golv, Mark, Måleri"
              multiline={false}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
              style={[styles.inlineInput, col('name')]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: handleInlineEnter, onKeyPress: handleInlineEnter } : {})}
            />
            <TextInput
              value={inlineValues?.note ?? ''}
              onChangeText={(v) => onInlineChange?.('note', v)}
              placeholder="Beskrivning (valfritt)"
              multiline={false}
              returnKeyType="done"
              blurOnSubmit={false}
              onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
              style={[styles.inlineInput, col('note')]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: handleInlineEnter, onKeyPress: handleInlineEnter } : {})}
            />
            <View style={styles.cellSpacer} />
            <Text style={styles.inlineAddHint}>Fyll i och tryck Enter för att spara</Text>
          </View>
        </View>
      )}

      {items.map((item, idx) => {
        const isSelected = selectionMode && selectedCategoryIds.includes(item.id);
        return editingId === item.id && editDraft ? (
          <View key={item.id} style={[styles.editRow, Platform.OS === 'web' && styles.rowGapWeb]}>
            {selectionMode ? <View style={styles.selectCol} /> : null}
            <TextInput
              value={editDraft.name}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, name: v }))}
              placeholder="Kategori"
              style={[styles.inlineInput, col('name')]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <TextInput
              value={editDraft.note}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, note: v }))}
              placeholder="Beskrivning"
              style={[styles.inlineInput, col('note')]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <View style={styles.cellSpacer} />
            <View style={styles.editRowActions}>
              <TouchableOpacity
                style={[styles.editRowBtn, styles.editRowBtnPrimary]}
                onPress={() => {
                  if (editDraft.name.trim() && onSaveEdit) {
                    onSaveEdit(item.id, {
                      name: editDraft.name.trim(),
                      note: editDraft.note.trim(),
                    });
                  }
                }}
                disabled={saving}
                accessibilityLabel="Spara"
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="checkmark" size={14} color="#fff" />
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.editRowBtn, styles.editRowBtnCancel]}
                onPress={() => onCancelEdit?.()}
                disabled={saving}
                accessibilityLabel="Avbryt"
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={14} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          <View
            key={item.id}
            style={{ alignSelf: 'stretch' }}
            {...(Platform.OS === 'web'
              ? {
                  onContextMenu: (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onRowMenu?.(e, item);
                  },
                  ...(onRowDoubleClick ? { onDoubleClick: (e) => { e.stopPropagation(); onRowDoubleClick(item); } } : {}),
                }
              : {})}
          >
          <TouchableOpacity
            style={[styles.row, Platform.OS === 'web' && styles.rowGapWeb, idx % 2 === 1 ? styles.rowAlt : null, hoveredId === item.id ? styles.rowHover : null]}
            onPress={() => {
              if (Platform.OS !== 'web' && onRowDoubleClick) {
                const now = Date.now();
                if (lastTapRef.current.id === item.id && now - lastTapRef.current.time < DOUBLE_TAP_MS) {
                  lastTapRef.current = { id: null, time: 0 };
                  onRowDoubleClick(item);
                  return;
                }
                lastTapRef.current = { id: item.id, time: now };
              }
            }}
            onLongPress={(e) => onRowContextMenu?.(e, item)}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseEnter: () => setHoveredId(item.id), onMouseLeave: () => setHoveredId(null) } : {})}
          >
            {selectionMode ? (
              <View style={styles.selectCol}>
                <TouchableOpacity
                  onPress={() => toggleSelection(item.id)}
                  activeOpacity={0.8}
                  style={[styles.checkbox, isSelected ? styles.checkboxChecked : null]}
                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                >
                  {isSelected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </TouchableOpacity>
              </View>
            ) : null}
            <View style={[styles.cellFlex, col('name')]}>
              <View style={styles.columnContent}>
                <Text style={styles.cellText} numberOfLines={1}>{safeText(item.name)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, col('note')]}>
              <View style={styles.columnContent}>
                <Text style={styles.cellMuted} numberOfLines={1}>{safeText(item.note)}</Text>
              </View>
            </View>
            <View style={styles.cellSpacer} />
          </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}
