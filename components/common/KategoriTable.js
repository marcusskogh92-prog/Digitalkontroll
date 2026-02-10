/**
 * Tabell för Kategoriregister – kolumner: Kategori, Anteckning, Åtgärder (sticky kebab).
 * Inline-redigering, Enter/Esc, diskreta ✔ ✕. Samma mönster som KontoplanTable.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../constants/tableLayout';

const FLEX = { name: 1, note: 1.5 };
const FIXED = { actions: 30, select: 44 };

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
  columnContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  headerText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  inlineInputCell: {
    paddingHorizontal: 0,
    margin: 0,
    flex: 1,
    alignSelf: 'stretch',
    minWidth: 0,
  },
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
    paddingVertical: 3,
    paddingLeft: 0,
    paddingRight: 0,
  },
  actionsColHeader: { backgroundColor: '#f1f5f9', paddingVertical: 5 },
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
  rowAlt: { backgroundColor: '#f8fafc' },
  rowHover: { backgroundColor: '#eef6ff' },
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
  editRowBtnPrimary: { backgroundColor: '#16a34a', borderColor: '#16a34a' },
  editRowBtnCancel: { borderColor: '#cbd5e1', backgroundColor: 'transparent' },
  rowMenuBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectCol: {
    width: FIXED.select,
    minWidth: FIXED.select,
    maxWidth: FIXED.select,
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
  inlineEnabled = false,
  inlineValues,
  inlineSaving = false,
  onInlineChange,
  onInlineSave,
  selectionMode = false,
  selectedCategoryIds = [],
  onSelectionChange,
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [editDraft, setEditDraft] = useState({ name: '', note: '' });
  const kebabRefs = useRef({});

  const editingItem = editingId ? (items.find((i) => i.id === editingId) || null) : null;
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

  const handleEditKeyDown = (e, item) => {
    if (Platform.OS !== 'web') return;
    const key = e.nativeEvent?.key;
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
      const id = editingId;
      onCancelEdit?.();
      setTimeout(() => {
        const el = id ? kebabRefs.current[id] : null;
        if (el && typeof el.focus === 'function') el.focus();
      }, 0);
    }
  };

  const SortIcon = ({ col }) =>
    sortColumn !== col ? (
      <Ionicons name="swap-vertical-outline" size={14} color="#cbd5e1" />
    ) : (
      <Ionicons name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} size={14} color="#64748b" />
    );

  const stickyRight = Platform.OS === 'web' ? { position: 'sticky', right: 0 } : {};
  const toggleSelection = (id) => {
    if (!onSelectionChange) return;
    const set = new Set(selectedCategoryIds);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    onSelectionChange(Array.from(set));
  };

  return (
    <View style={styles.tableWrap}>
      <View style={styles.header}>
        {selectionMode ? (
          <View style={[styles.selectCol, styles.selectColHeader]}>
            <Text style={[styles.headerText, { fontSize: 11 }]}>Val</Text>
          </View>
        ) : null}
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.name }]}
          onPress={() => onSort('name')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={styles.columnContent}>
            <Text style={styles.headerText}>Kategori</Text>
            <SortIcon col="name" />
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.note }]}
          onPress={() => onSort('note')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <View style={styles.columnContent}>
            <Text style={styles.headerText}>Anteckning</Text>
            <SortIcon col="note" />
          </View>
        </TouchableOpacity>
        <View style={[styles.actionsCol, styles.actionsColHeader, stickyRight]} />
      </View>

      {inlineEnabled && (
        <View style={styles.inlineRow}>
          {selectionMode ? <View style={[styles.selectCol, { backgroundColor: '#f8fafc' }]} /> : null}
          <TextInput
            value={inlineValues?.name ?? ''}
            onChangeText={(v) => onInlineChange?.('name', v)}
            placeholder="t.ex. Golv, Mark, Måleri"
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.name }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.note ?? ''}
            onChangeText={(v) => onInlineChange?.('note', v)}
            placeholder="Anteckning (valfritt)"
            returnKeyType="done"
            blurOnSubmit={true}
            onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.note }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <View style={[styles.actionsCol, styles.actionsColInline, stickyRight]} />
        </View>
      )}

      {items.map((item, idx) => {
        const isSelected = selectionMode && selectedCategoryIds.includes(item.id);
        return editingId === item.id && editDraft ? (
          <View key={item.id} style={styles.editRow}>
            {selectionMode ? <View style={styles.selectCol} /> : null}
            <TextInput
              value={editDraft.name}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, name: v }))}
              placeholder="Kategori"
              style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.name }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <TextInput
              value={editDraft.note}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, note: v }))}
              placeholder="Anteckning"
              style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.note }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <View style={[styles.actionsCol, styles.actionsColInline, stickyRight, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
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
          <TouchableOpacity
            key={item.id}
            style={[styles.row, idx % 2 === 1 ? styles.rowAlt : null, hoveredId === item.id ? styles.rowHover : null]}
            onPress={() => {}}
            activeOpacity={0.7}
            {...(Platform.OS === 'web' ? { cursor: 'default', onMouseEnter: () => setHoveredId(item.id), onMouseLeave: () => setHoveredId(null) } : {})}
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
            <View style={[styles.cellFlex, { flex: FLEX.name }]}>
              <View style={styles.columnContent}>
                <Text style={styles.cellText} numberOfLines={1}>{safeText(item.name)}</Text>
              </View>
            </View>
            <View style={[styles.cellFlex, { flex: FLEX.note }]}>
              <View style={styles.columnContent}>
                <Text style={styles.cellMuted} numberOfLines={1}>{safeText(item.note)}</Text>
              </View>
            </View>
            <View style={[styles.actionsCol, stickyRight]}>
              <TouchableOpacity
                ref={(r) => { kebabRefs.current[item.id] = r; }}
                style={styles.rowMenuBtn}
                onPress={(e) => onRowMenu?.(e, item)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer', tabIndex: 0 } : {})}
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}
