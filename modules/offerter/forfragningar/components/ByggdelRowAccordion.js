import { Ionicons } from '@expo/vector-icons';
import { useMemo } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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

  onPickSupplier,
  onCreateSupplier,
  onSetStatus,
  onOpenFolder,
  onRemove,
  canOpenFolder,
}) {
  const code = useMemo(() => formatCode(byggdel), [byggdel]);
  const label = useMemo(() => formatLabel(byggdel), [byggdel]);
  const group = useMemo(() => formatGroup(byggdel), [byggdel]);

  return (
    <View style={styles.wrap}>
      <Pressable
        onPress={onToggle}
        style={({ pressed }) => [styles.row, pressed ? styles.rowPressed : null]}
        accessibilityRole="button"
      >
        <View style={styles.colNr}>
			<Text style={styles.cellText} numberOfLines={1}>{code}</Text>
		</View>
		<View style={styles.colDesc}>
          <Text style={styles.cellText} numberOfLines={1}>{label}</Text>
        </View>
		<View style={styles.colGroup}>
			<Text style={styles.cellTextMuted} numberOfLines={1}>{group}</Text>
		</View>
        <View style={styles.colChevron}>
          <Ionicons name={expanded ? 'chevron-up' : 'chevron-down'} size={18} color="#64748b" />
        </View>
      </Pressable>

      {expanded ? (
        <View style={styles.expandBox}>
          <SupplierPickerInline
            suppliers={suppliers}
            onPick={onPickSupplier}
            onCreate={onCreateSupplier}
          />

          <View style={styles.innerTable}>
            <SupplierTable
              packages={packages}
              onSetStatus={onSetStatus}
              onOpenFolder={onOpenFolder}
              onRemove={onRemove}
              canOpenFolder={canOpenFolder}
            />
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  rowPressed: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
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
  colChevron: {
    width: 28,
    alignItems: 'flex-end',
  },

	cellText: {
		fontSize: 13,
		fontWeight: '400',
		color: '#0f172a',
	},
	cellTextMuted: {
		fontSize: 12,
		fontWeight: '400',
		color: '#475569',
	},

  expandBox: {
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 12,
    backgroundColor: '#fff',
    gap: 10,
  },
  innerTable: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
  },
});
