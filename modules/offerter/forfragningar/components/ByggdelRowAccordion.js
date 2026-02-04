import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import ContextMenu from '../../../../components/ContextMenu';
import SupplierPickerInline from './SupplierPickerInline';
import SupplierTable from './SupplierTable';

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function formatCode(byggdel) {
	return safeText(byggdel?.code) || '—';
}

function formatLabel(byggdel) {
	return safeText(byggdel?.label) || '—';
}

function formatGroup(byggdel) {
	return safeText(byggdel?.group) || '—';
}

export default function ByggdelRowAccordion({
  byggdel,
  expanded,
  onToggle,
  packages,
  suppliers,
  contacts,

  onPickSupplier,
  onCreateSupplier,
  onPickContact,
  onCreateContact,
  onEditByggdel,
  onRemoveByggdel,
  onSetStatus,
  onOpenFolder,
  onRemove,
  canOpenFolder,
}) {
  const code = useMemo(() => formatCode(byggdel), [byggdel]);
  const label = useMemo(() => formatLabel(byggdel), [byggdel]);
  const group = useMemo(() => formatGroup(byggdel), [byggdel]);
  const count = Array.isArray(packages) ? packages.length : 0;
  const locked = Boolean(byggdel?.locked);
  const statusLabel = String(byggdel?.status || '').trim();
  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 0, y: 0 });

  const openMenu = (evt) => {
    const native = evt?.nativeEvent || {};
    const x = Number(native?.pageX || native?.locationX || 0);
    const y = Number(native?.pageY || native?.locationY || 0);
    setMenuPos({ x, y });
    setMenuVisible(true);
  };

  const menuItems = [
    { key: 'edit', label: 'Redigera disciplin', disabled: locked, icon: <Ionicons name="create-outline" size={16} color="#334155" /> },
    { key: 'delete', label: 'Ta bort disciplin', disabled: locked, icon: <Ionicons name="trash-outline" size={16} color="#64748b" /> },
  ];

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
        accessibilityRole="button"
      >
        <Text style={[styles.cell, styles.colNr]} numberOfLines={1}>{code}</Text>
        <Text style={[styles.cell, styles.colDesc]} numberOfLines={1}>{label}</Text>
        <Text style={[styles.cellMuted, styles.colGroup]} numberOfLines={1}>{group}</Text>
        <Text style={[styles.cellMuted, styles.colCount]} numberOfLines={1}>
          {count} leverantör{count === 1 ? '' : 'er'}
        </Text>
        <View style={[styles.colStatus, styles.statusCell]}>
          {statusLabel ? (
            <View style={styles.statusPill}>
              <Text style={styles.statusPillText} numberOfLines={1}>{statusLabel}</Text>
            </View>
          ) : null}
        </View>
        <View style={[styles.colChevron, styles.chevronCell]}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandRow}>
          <View style={styles.expandInner}>
            <SupplierPickerInline
              suppliers={suppliers}
              onPick={onPickSupplier}
              onCreate={onCreateSupplier}
            />

            <View style={styles.innerTable}>
              <SupplierTable
                packages={packages}
                suppliers={suppliers}
                contacts={contacts}
                onPickContact={onPickContact}
                onCreateContact={onCreateContact}
                onSetStatus={onSetStatus}
                onOpenFolder={onOpenFolder}
                onRemove={onRemove}
                canOpenFolder={canOpenFolder}
              />
            </View>
          </View>
        </View>
      ) : null}

      <Pressable
        onPress={openMenu}
        disabled={locked}
        style={({ pressed }) => [
          styles.menuBtn,
          locked && styles.menuBtnDisabled,
          pressed && !locked && styles.menuBtnPressed,
        ]}
      >
        <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
      </Pressable>

      <ContextMenu
        visible={menuVisible}
        x={menuPos.x}
        y={menuPos.y}
        items={menuItems}
        onClose={() => setMenuVisible(false)}
        onSelect={(item) => {
          setMenuVisible(false);
          if (item?.key === 'edit') onEditByggdel?.(byggdel);
          if (item?.key === 'delete') onRemoveByggdel?.(byggdel);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  rowPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  cell: {
    fontSize: 12,
    fontWeight: '500',
    color: '#0f172a',
  },
  cellMuted: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  colNr: {
    width: 70,
  },
  colDesc: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  colGroup: {
    width: 220,
    minWidth: 0,
  },
  colCount: {
    width: 140,
  },
  colStatus: {
    width: 110,
  },
  colChevron: {
    width: 28,
    alignItems: 'flex-end',
  },
  statusCell: {
    alignItems: 'flex-start',
  },
  chevronCell: {
    alignItems: 'flex-end',
  },
  statusPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  menuBtn: {
    position: 'absolute',
    right: 34,
    top: 6,
    width: 24,
    height: 24,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  menuBtnPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.05)',
  },
  menuBtnDisabled: {
    opacity: 0.5,
  },
  expandRow: {
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  expandInner: {
    paddingTop: 10,
    gap: 10,
  },
  innerTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
});
