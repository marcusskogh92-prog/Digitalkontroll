/**
 * SupplierTable – Premium 2026
 * Kolumner: Leverantör | Kontakt | Förfrågan skickad | Återkoppling | Status | Åtgärder
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import ContactPickerCompact from './ContactPickerCompact';
import { RFQ_ATERKOPPLING_OPTIONS } from '../../../../features/project-phases/phases/kalkylskede/services/forfragningarService';

function safeText(v) {
  return String(v ?? '').trim();
}

function formatSentDate(val) {
  if (!val) return '—';
  try {
    const d = typeof val?.toDate === 'function' ? val.toDate() : new Date(val);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit' });
  } catch (_e) {
    return '—';
  }
}

const STATUS_CONFIG = {
  'Ej skickad': { bg: '#f1f5f9', color: '#64748b', label: 'Ej skickad' },
  Skickad: { bg: '#dbeafe', color: '#1d4ed8', label: 'Skickad' },
  'Väntar svar': { bg: '#fef9c3', color: '#a16207', label: 'Väntar svar' },
  Bekräftad: { bg: '#dcfce7', color: '#166534', label: 'Bekräftad' },
  Avböjt: { bg: '#fee2e2', color: '#b91c1c', label: 'Avböjt' },
  Besvarad: { bg: '#dcfce7', color: '#166534', label: 'Bekräftad' }, // backward compat
};

function StatusBadge({ status }) {
  const s = safeText(status) || 'Ej skickad';
  const cfg = STATUS_CONFIG[s] || STATUS_CONFIG['Ej skickad'];
  return (
    <View style={[styles.badge, { backgroundColor: cfg.bg }]}>
      <Text style={[styles.badgeText, { color: cfg.color }]} numberOfLines={1}>
        {cfg.label}
      </Text>
    </View>
  );
}

function AterkopplingDropdown({ value, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const current = value && RFQ_ATERKOPPLING_OPTIONS.includes(value) ? value : null;
  const label = current || '—';

  return (
    <View>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.dropdownTrigger, disabled && styles.dropdownDisabled]}
      >
        <Text style={styles.dropdownText} numberOfLines={1}>{label}</Text>
        <Ionicons name="chevron-down" size={12} color="#64748b" />
      </Pressable>
      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.dropdownMenu} onPress={(e) => e?.stopPropagation?.()}>
            {RFQ_ATERKOPPLING_OPTIONS.map((opt) => (
              <Pressable
                key={opt}
                onPress={() => {
                  onChange?.(opt);
                  setOpen(false);
                }}
                style={({ pressed }) => [styles.dropdownItem, pressed && styles.dropdownItemPressed]}
              >
                <Text style={styles.dropdownItemText}>{opt}</Text>
              </Pressable>
            ))}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

function setStatusFromAterkoppling(aterkoppling) {
  if (!aterkoppling) return null;
  if (aterkoppling === 'Lämnar pris' || aterkoppling === 'Lämnar ej pris') return 'Väntar svar';
  if (aterkoppling === 'Avböjt') return 'Avböjt';
  if (aterkoppling === 'Osäker') return 'Väntar svar';
  return null;
}

export default function SupplierTable({
  packages,
  suppliers,
  contacts,
  onPickContact,
  onCreateContact,
  onSetStatus,
  onUpdatePackage,
  onOpenFolder,
  onRemove,
  canOpenFolder,
}) {
  const rows = Array.isArray(packages) ? packages : [];
  const supplierMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(suppliers) ? suppliers : []).forEach((s) => {
      const id = safeText(s?.id);
      if (id) map.set(id, s);
      const name = safeText(s?.companyName).toLowerCase();
      if (name) map.set(`name:${name}`, s);
    });
    return map;
  }, [suppliers]);
  const contactMap = useMemo(() => {
    const map = new Map();
    (Array.isArray(contacts) ? contacts : []).forEach((c) => {
      const id = safeText(c?.id);
      if (id) map.set(id, c);
    });
    return map;
  }, [contacts]);

  const resolveSupplier = (pkg) => {
    const sid = safeText(pkg?.supplierId);
    if (sid && supplierMap.has(sid)) return supplierMap.get(sid);
    const name = safeText(pkg?.supplierName).toLowerCase();
    if (name && supplierMap.has(`name:${name}`)) return supplierMap.get(`name:${name}`);
    return null;
  };

  const handleAterkopplingChange = (pkg, aterkoppling) => {
    onUpdatePackage?.(pkg, { aterkoppling });
    const newStatus = setStatusFromAterkoppling(aterkoppling);
    if (newStatus) onSetStatus?.(pkg, newStatus);
  };

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.th, styles.colLeverantor]}>Leverantör</Text>
        <Text style={[styles.th, styles.colKontakt]}>Kontakt</Text>
        <Text style={[styles.th, styles.colSent]}>Förfrågan skickad</Text>
        <Text style={[styles.th, styles.colAterkoppling]}>Återkoppling</Text>
        <Text style={[styles.th, styles.colStatus]}>Status</Text>
        <Text style={[styles.th, styles.colActions]}>Åtgärder</Text>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>Inga leverantörer. Klicka på "Lägg till leverantör" ovan.</Text>
        </View>
      ) : (
        rows.map((p, idx) => {
          const status = safeText(p?.status) || 'Ej skickad';
          const supplierName = safeText(p?.supplierName) || '—';
          const supplier = resolveSupplier(p);
          const contact = contactMap.get(safeText(p?.contactId));
          const contactName = safeText(p?.contactName) || safeText(contact?.name);
          const openDisabled = !canOpenFolder?.(p);
          return (
            <View key={p?.id || `pkg-${idx}`} style={styles.dataRow}>
              <View style={[styles.td, styles.colLeverantor]}>
                <Text style={styles.cellText} numberOfLines={1}>{supplierName}</Text>
              </View>
              <View style={[styles.td, styles.colKontakt]}>
                <ContactPickerCompact
                  value={contact}
                  contacts={Array.isArray(contacts) ? contacts : []}
                  supplierId={safeText(supplier?.id || p?.supplierId)}
                  onPick={(c) => onPickContact?.(p, c)}
                  onCreate={(name) => onCreateContact?.(p, name)}
                />
              </View>
              <View style={[styles.td, styles.colSent]}>
                <Text style={styles.cellMuted} numberOfLines={1}>{formatSentDate(p?.sentAt)}</Text>
              </View>
              <View style={[styles.td, styles.colAterkoppling]}>
                <AterkopplingDropdown
                  value={p?.aterkoppling}
                  onChange={(v) => handleAterkopplingChange(p, v)}
                  disabled={status === 'Ej skickad'}
                />
              </View>
              <View style={[styles.td, styles.colStatus]}>
                <StatusBadge status={status} />
              </View>
              <View style={[styles.td, styles.colActions]}>
                <View style={styles.actionRow}>
                  <Pressable
                    onPress={() => onSetStatus?.(p, 'Skickad')}
                    disabled={status !== 'Ej skickad'}
                    style={[styles.linkBtn, status !== 'Ej skickad' && styles.linkBtnDisabled]}
                  >
                    <Text style={[styles.linkBtnText, status !== 'Ej skickad' && styles.linkBtnTextDisabled]}>
                      Markera skickad
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => onOpenFolder?.(p)}
                    disabled={openDisabled}
                    style={[styles.linkBtn, openDisabled && styles.linkBtnDisabled]}
                  >
                    <Text style={[styles.linkBtnText, openDisabled && styles.linkBtnTextDisabled]}>Mapp</Text>
                  </Pressable>
                  <Pressable onPress={() => onRemove?.(p)} style={styles.linkBtn}>
                    <Text style={[styles.linkBtnText, styles.linkBtnDanger]}>Ta bort</Text>
                  </Pressable>
                </View>
              </View>
            </View>
          );
        })
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  table: {
    backgroundColor: '#fff',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
  },
  th: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    minHeight: 44,
  },
  td: {
    justifyContent: 'center',
  },
  colLeverantor: {
    flex: 1.5,
    minWidth: 140,
  },
  colKontakt: {
    flex: 1.5,
    minWidth: 140,
  },
  colSent: {
    width: 100,
  },
  colAterkoppling: {
    width: 120,
  },
  colStatus: {
    width: 90,
  },
  colActions: {
    flex: 1.2,
    minWidth: 140,
  },
  cellText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#0f172a',
  },
  cellMuted: {
    fontSize: 12,
    color: '#94a3b8',
  },
  contactCell: {
    gap: 4,
  },
  emptyRow: {
    paddingHorizontal: 12,
    paddingVertical: 16,
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '500',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  dropdownDisabled: {
    opacity: 0.6,
  },
  dropdownText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  dropdownMenu: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    minWidth: 180,
    paddingVertical: 4,
  },
  dropdownItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  dropdownItemPressed: {
    backgroundColor: 'rgba(15,23,42,0.04)',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    alignItems: 'center',
  },
  linkBtn: {
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  linkBtnDisabled: {
    opacity: 0.5,
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2563eb',
  },
  linkBtnTextDisabled: {
    color: '#94a3b8',
  },
  linkBtnDanger: {
    color: '#64748b',
  },
});
