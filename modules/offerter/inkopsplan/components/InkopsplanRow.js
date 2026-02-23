import { Ionicons } from '@expo/vector-icons';
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

export default function InkopsplanRow({ row, isExpanded, onToggleExpand }) {
  const bd = safeText(row?.nr) || '—';
  const name = safeText(row?.name) || '—';
  const typ = typeLabel(row?.type, row?.manualTypeLabel);
  const suppliers = suppliersCount(row);
  const summary = summarizeSupplierStatuses(row);
  const request = requestSummaryText(summary);
  const overallStatus = overallStatusLabel(summary);
  const ind = indicatorColor(summary);

  return (
    <Pressable
      onPress={() => onToggleExpand?.(row)}
      style={({ hovered }) => [
        styles.row,
        { borderLeftColor: ind },
        hovered && styles.rowHover,
        isExpanded && styles.rowExpanded,
      ]}
    >
      <View style={[styles.cell, styles.chevron]}>
        <View
          style={[
            styles.chevronIcon,
            isExpanded && styles.chevronIconOpen,
          ]}
        >
          <Ionicons name="chevron-forward" size={16} color="#0F172A" />
        </View>
      </View>
      <View style={[styles.cell, styles.bd]}>
        <Text style={styles.cellText} numberOfLines={1}>{bd}</Text>
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
      <View style={[styles.cell, styles.request]}>
        <Text style={[styles.cellText, styles.muted]} numberOfLines={1}>{request}</Text>
      </View>
      <View style={[styles.cell, styles.status]}>
        <InkopsplanStatusBadge status={overallStatus} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    borderLeftWidth: 3,
    paddingHorizontal: 12,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  rowHover: {
    backgroundColor: '#F8F9FB',
  },
  rowExpanded: {
    borderBottomWidth: 0,
  },
  cell: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    justifyContent: 'center',
    minWidth: 0,
  },
  chevron: { width: 32, paddingHorizontal: 0, alignItems: 'center' },
  chevronIcon: {
    transform: [{ rotateZ: '0deg' }],
    ...(Platform.OS === 'web' ? { transition: 'transform 150ms ease' } : {}),
  },
  chevronIconOpen: {
    transform: [{ rotateZ: '90deg' }],
  },
  bd: { width: 70 },
  name: { flex: 1 },
  type: { width: 140 },
  suppliers: { width: 60, alignItems: 'flex-end' },
  request: { width: 120 },
  status: { width: 90 },
  cellText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  muted: {
    color: '#475569',
    fontWeight: '500',
  },
});
