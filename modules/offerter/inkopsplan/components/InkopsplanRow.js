import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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

export default function InkopsplanRow({ row, isExpanded, onToggleExpand }) {
  const nr = safeText(row?.nr) || '—';
  const name = safeText(row?.name) || '—';
  const typ = typeLabel(row?.type, row?.manualTypeLabel);
  const suppliers = suppliersCount(row);

  return (
    <Pressable
      onPress={() => onToggleExpand?.(row)}
      style={({ hovered }) => [
        styles.row,
        hovered && styles.rowHover,
        isExpanded && styles.rowExpanded,
      ]}
    >
      <View style={[styles.cell, styles.nr]}>
        <Text style={styles.cellText} numberOfLines={1}>{nr}</Text>
      </View>
      <View style={[styles.cell, styles.name]}>
        <Text style={styles.cellText} numberOfLines={1}>{name}</Text>
      </View>
      <View style={[styles.cell, styles.type]}>
        <Text style={[styles.cellText, styles.muted]} numberOfLines={1}>{typ}</Text>
      </View>
      <View style={[styles.cell, styles.suppliers]}>
        <Text style={[styles.cellText, styles.muted]} numberOfLines={1}>{suppliers}</Text>
      </View>
      <View style={[styles.cell, styles.status]}>
        <InkopsplanStatusBadge status={row?.status} />
      </View>
      <View style={[styles.cell, styles.actions]}>
        <Text style={styles.actionText}>{isExpanded ? 'Dölj' : 'Expandera'}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    paddingHorizontal: 8,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  rowHover: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D1D5DB',
  },
  rowExpanded: {
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  cell: {
    paddingVertical: 10,
    paddingHorizontal: 6,
    justifyContent: 'center',
    minWidth: 0,
  },
  nr: { width: 90 },
  name: { flex: 1 },
  type: { width: 160 },
  suppliers: { width: 110 },
  status: { width: 120 },
  actions: { width: 110, alignItems: 'flex-end' },
  cellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  muted: {
    color: '#475569',
    fontWeight: '500',
  },
  actionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
});
