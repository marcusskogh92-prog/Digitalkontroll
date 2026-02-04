import { Pressable, StyleSheet, Text, View } from 'react-native';

import SupplierTable from './SupplierTable';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

export default function ByggdelSection({
  byggdel,
  title,
  expanded,
  onToggle,
  packages,
  onAddSupplier,
  onSetStatus,
  onOpenFolder,
  onRemove,
  canOpenFolder,
}) {
  const count = Array.isArray(packages) ? packages.length : 0;

  return (
    <View style={styles.card}>
      <Pressable onPress={onToggle} style={({ pressed }) => [styles.header, pressed && styles.headerPressed]}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {safeText(title) || safeText(byggdel?.label) || 'Byggdel'}
          </Text>
          <Text style={styles.headerMeta} numberOfLines={1}>
            {count} leverantör{count === 1 ? '' : 'er'}
          </Text>
        </View>
        <Text style={styles.chevron}>{expanded ? '−' : '+'}</Text>
      </Pressable>

      {expanded ? (
        <View style={styles.body}>
          <SupplierTable
            packages={packages}
            onAddSupplier={onAddSupplier}
            onSetStatus={onSetStatus}
            onOpenFolder={onOpenFolder}
            onRemove={onRemove}
            canOpenFolder={canOpenFolder}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    borderRadius: 14,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f8fafc',
  },
  headerPressed: {
    opacity: 0.95,
  },
  headerLeft: {
    flex: 1,
    minWidth: 0,
    paddingRight: 12,
  },
  headerTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0f172a',
  },
  headerMeta: {
    marginTop: 4,
    fontSize: 12,
    color: '#64748b',
  },
  chevron: {
    width: 28,
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: '#334155',
  },
  body: {
    padding: 14,
  },
});
