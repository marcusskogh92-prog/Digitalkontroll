/**
 * Tabell för Byggdelstabell – kolumner: Byggdel (1–3 siffror), Beskrivning, Anteckningar, Åtgärder (sticky kebab).
 * Samma DataGrid-pattern som Kunder/Kontaktregister: inline-redigering, Enter/Esc, diskreta ✔ ✕.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const FLEX = { beskrivning: 1.5, anteckningar: 1.5 };
const FIXED = { byggdel: 80, actions: 48 };

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
  headerText: { fontSize: 12, fontWeight: '500', color: '#475569' },
  cellFlex: { flexShrink: 0, minWidth: 0 },
  cellFixed: { flexShrink: 0 },
  cellMono: { fontFamily: Platform.OS === 'web' ? 'monospace' : undefined },
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
  cellText: { fontSize: 13, color: '#1e293b', fontWeight: '500' },
  cellMuted: { fontSize: 13, color: '#64748b', fontWeight: '400' },
});

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '—';
}

/** Validera 1–3 siffror för byggdelkod */
function normalizeCode(value) {
  const digits = String(value ?? '').replace(/\D/g, '').slice(0, 3);
  return digits;
}

export default function ByggdelTable({
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
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [editDraft, setEditDraft] = useState({ byggdel: '', beskrivning: '', anteckningar: '' });
  const kebabRefs = useRef({});

  const editingItem = editingId ? (items.find((i) => i.id === editingId) || null) : null;
  React.useEffect(() => {
    if (editingItem) {
      setEditDraft({
        byggdel: String(editingItem.moment ?? editingItem.byggdel ?? '').trim(),
        beskrivning: String(editingItem.name ?? '').trim(),
        anteckningar: String(editingItem.anteckningar ?? '').trim(),
      });
    } else {
      setEditDraft({ byggdel: '', beskrivning: '', anteckningar: '' });
    }
  }, [editingId, editingItem?.id]);

  const handleEditKeyDown = (e, item) => {
    if (Platform.OS !== 'web') return;
    const key = e.nativeEvent?.key;
    if (key === 'Enter') {
      e.preventDefault();
      if (onSaveEdit && !saving) {
        const code = normalizeCode(editDraft.byggdel);
        if (code && editDraft.beskrivning.trim()) {
          onSaveEdit(item.id, {
            byggdel: code,
            beskrivning: editDraft.beskrivning.trim(),
            anteckningar: editDraft.anteckningar.trim(),
          });
        }
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

  return (
    <View style={styles.tableWrap}>
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFixed, { width: FIXED.byggdel }]}
          onPress={() => onSort('moment')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={[styles.headerText, styles.cellMono]}>Kod</Text>
          <SortIcon col="moment" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.beskrivning }]}
          onPress={() => onSort('name')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Namn</Text>
          <SortIcon col="name" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.headerCell, styles.cellFlex, { flex: FLEX.anteckningar }]}
          onPress={() => onSort('anteckningar')}
          activeOpacity={0.7}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.headerText}>Anteckningar</Text>
          <SortIcon col="anteckningar" />
        </TouchableOpacity>
        <View style={[styles.actionsCol, styles.actionsColHeader, stickyRight]} />
      </View>

      {inlineEnabled && (
        <View style={styles.inlineRow}>
          <TextInput
            value={inlineValues?.byggdel ?? ''}
            onChangeText={(v) => onInlineChange?.('byggdel', normalizeCode(v))}
            placeholder="t.ex. 45"
            keyboardType="number-pad"
            maxLength={3}
            style={[styles.inlineInput, styles.cellFixed, styles.cellMono, { width: FIXED.byggdel }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.beskrivning ?? ''}
            onChangeText={(v) => onInlineChange?.('beskrivning', v)}
            placeholder="Beskrivning (ny)"
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.beskrivning }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <TextInput
            value={inlineValues?.anteckningar ?? ''}
            onChangeText={(v) => onInlineChange?.('anteckningar', v)}
            placeholder="Anteckningar (ny)"
            returnKeyType="done"
            blurOnSubmit={true}
            onSubmitEditing={() => { if (!inlineSaving) onInlineSave?.(); }}
            style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.anteckningar }]}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          <View style={[styles.actionsCol, styles.actionsColInline, stickyRight]} />
        </View>
      )}

      {items.map((item, idx) =>
        editingId === item.id && editDraft ? (
          <View key={item.id} style={styles.editRow}>
            <TextInput
              value={editDraft.byggdel}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, byggdel: normalizeCode(v) }))}
              placeholder="t.ex. 45"
              keyboardType="number-pad"
              maxLength={3}
              style={[styles.inlineInput, styles.cellFixed, styles.cellMono, { width: FIXED.byggdel }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <TextInput
              value={editDraft.beskrivning}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, beskrivning: v }))}
              placeholder="Beskrivning"
              style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.beskrivning }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <TextInput
              value={editDraft.anteckningar}
              onChangeText={(v) => setEditDraft((d) => ({ ...d, anteckningar: v }))}
              placeholder="Anteckningar"
              style={[styles.inlineInput, styles.cellFlex, { flex: FLEX.anteckningar }]}
              placeholderTextColor="#94a3b8"
              {...(Platform.OS === 'web' ? { outlineStyle: 'none', onKeyDown: (e) => handleEditKeyDown(e, item) } : {})}
            />
            <View style={[styles.actionsCol, styles.actionsColInline, stickyRight, { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4 }]}>
              <TouchableOpacity
                style={[styles.editRowBtn, styles.editRowBtnPrimary]}
                onPress={() => {
                  const code = normalizeCode(editDraft.byggdel);
                  if (code && editDraft.beskrivning.trim() && onSaveEdit) {
                    onSaveEdit(item.id, {
                      byggdel: code,
                      beskrivning: editDraft.beskrivning.trim(),
                      anteckningar: editDraft.anteckningar.trim(),
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
            <Text style={[styles.cellText, styles.cellFixed, styles.cellMono, { width: FIXED.byggdel }]} numberOfLines={1}>
              {safeText(item.moment ?? item.byggdel)}
            </Text>
            <Text style={[styles.cellMuted, styles.cellFlex, { flex: FLEX.beskrivning }]} numberOfLines={1}>
              {safeText(item.name)}
            </Text>
            <Text style={[styles.cellMuted, styles.cellFlex, { flex: FLEX.anteckningar }]} numberOfLines={1}>
              {safeText(item.anteckningar)}
            </Text>
            <View style={[styles.actionsCol, stickyRight]}>
              <TouchableOpacity
                ref={(r) => {
                  kebabRefs.current[item.id] = r;
                }}
                style={styles.rowMenuBtn}
                onPress={(e) => onRowMenu?.(e, item)}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer', tabIndex: 0 } : {})}
              >
                <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        )
      )}
    </View>
  );
}
