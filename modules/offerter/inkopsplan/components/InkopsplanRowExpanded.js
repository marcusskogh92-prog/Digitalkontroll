import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import {
    INKOPSPLAN_SUPPLIER_REQUEST_STATUS,
    markInkopsplanRowSupplierQuoteReceived,
    markInkopsplanRowSupplierRequestSent,
    removeInkopsplanRowSupplier,
    resetInkopsplanRowSupplierRequest,
} from '../inkopsplanService';
import AddInkopsplanSupplierModal from './AddInkopsplanSupplierModal';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function normalizeSupplierKeyLocal(party) {
  const existing = safeText(party?.key);
  if (existing) return existing;
  const t = safeText(party?.registryType);
  const id = safeText(party?.registryId || party?.id);
  if (t && id) return `${t}:${id}`;
  return safeText(party?.id) || safeText(party?.companyName) || safeText(party?.name) || '';
}

function formatYYYYMMDD(fsTs) {
  try {
    const dt = typeof fsTs?.toDate === 'function' ? fsTs.toDate() : null;
    if (!dt) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (_e) {
    return '';
  }
}

function isWeb() {
  return Platform.OS === 'web';
}

export default function InkopsplanRowExpanded({ row, companyId, projectId }) {
  const suppliers = Array.isArray(row?.suppliers) ? row.suppliers : [];

  const [addSupplierOpen, setAddSupplierOpen] = useState(false);
  const [supplierBusyKey, setSupplierBusyKey] = useState('');

  const handleRemoveSupplier = async (supplierKey) => {
    const rowId = safeText(row?.id);
    if (!companyId || !projectId || !rowId) return;
    const key = safeText(supplierKey);
    if (!key) return;
    try {
      await removeInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
    }
  };

  const setBusy = (key) => setSupplierBusyKey(safeText(key));

  const handleMarkSent = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await markInkopsplanRowSupplierRequestSent({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte markera skickad', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  const handleMarkQuoteReceived = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await markInkopsplanRowSupplierQuoteReceived({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte markera svar mottaget', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  const handleResetRequest = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await resetInkopsplanRowSupplierRequest({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte ångra', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  return (
    <View style={styles.wrap}>
      <View style={styles.childTable}>
        <View style={styles.childHeader}>
          <Text style={[styles.childHCell, styles.colCompany]}>Företag</Text>
          <Text style={[styles.childHCell, styles.colContact]}>Kontakt</Text>
          <Text style={[styles.childHCell, styles.colMobile]}>Mobil</Text>
          <Text style={[styles.childHCell, styles.colPhone]}>Telefon</Text>
          <Text style={[styles.childHCell, styles.colEmail]}>Email</Text>
          <Text style={[styles.childHCell, styles.colRequest]}>Förfrågan</Text>
          <View style={[styles.colStatus, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }]}
          >
            <Text style={styles.childHCell}>Status</Text>
            <Pressable
              onPress={() => setAddSupplierOpen(true)}
              disabled={!companyId || !projectId}
              style={({ hovered, pressed }) => [
                styles.addLinkWrap,
                (hovered || pressed) && styles.addLinkHover,
                (!companyId || !projectId) && { opacity: 0.6 },
              ]}
            >
              <Text style={styles.addLink}>+ Lägg till leverantör</Text>
            </Pressable>
          </View>
        </View>

        {suppliers.length === 0 ? (
          <View style={styles.childEmpty}>
            <Text style={styles.muted}>Inga leverantörer kopplade ännu.</Text>
          </View>
        ) : (
          suppliers.map((s, idx) => {
            const label = safeText(s?.companyName || s?.name || s?.id || s);
            const supplierKey = normalizeSupplierKeyLocal(s);
            const key = supplierKey || `${label}-${idx}`;

            const explicitStatus = safeText(s?.requestStatus);
            let status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;
            if (explicitStatus === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET;
            else if (explicitStatus === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;
            else if (s?.quoteReceivedAt) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET;
            else if (s?.requestSentAt) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;

            const sentDate = formatYYYYMMDD(s?.requestSentAt);
            const requestText = status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD
              ? 'Ej skickad'
              : (sentDate ? `Skickad ${sentDate}` : 'Skickad');

            const statusText = status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET
              ? 'Svar mottaget'
              : status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD
                ? 'Skickad'
                : 'Ej skickad';

            const busy = supplierKey && supplierBusyKey === supplierKey;
            const canMarkSent = !busy && supplierKey && status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;
            const canMarkQuoteReceived = !busy && supplierKey && status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;
            const canReset = !busy && supplierKey && status !== INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;

            return (
              <View key={key} style={styles.childRow}>
                <Text style={[styles.childCellText, styles.colCompany]} numberOfLines={1}>{label || '—'}</Text>
                <Text style={[styles.childCellText, styles.colContact]} numberOfLines={1}>{safeText(s?.contactName) || '—'}</Text>
                <Text style={[styles.childCellText, styles.colMobile]} numberOfLines={1}>{safeText(s?.mobile) || '—'}</Text>
                <Text style={[styles.childCellText, styles.colPhone]} numberOfLines={1}>{safeText(s?.phone) || '—'}</Text>
                <Text style={[styles.childCellText, styles.colEmail]} numberOfLines={1}>{safeText(s?.email) || '—'}</Text>
                <Text style={[styles.childCellText, styles.colRequest]} numberOfLines={1}>{requestText}</Text>
                <View style={[styles.colStatus, styles.childStatusCell]}>
                  <Text style={styles.childCellText} numberOfLines={1}>{statusText}</Text>
                  <View style={styles.childActions}>
                    {canMarkSent ? (
                      <Pressable
                        onPress={() => handleMarkSent(supplierKey)}
                        disabled={!canMarkSent}
                        style={({ hovered, pressed }) => [
                          styles.actionLinkWrap,
                          (hovered || pressed) && styles.actionLinkHover,
                        ]}
                      >
                        <Text style={styles.actionLink}>Skickad</Text>
                      </Pressable>
                    ) : null}
                    {canMarkQuoteReceived ? (
                      <Pressable
                        onPress={() => handleMarkQuoteReceived(supplierKey)}
                        disabled={!canMarkQuoteReceived}
                        style={({ hovered, pressed }) => [
                          styles.actionLinkWrap,
                          (hovered || pressed) && styles.actionLinkHover,
                        ]}
                      >
                        <Text style={styles.actionLink}>Svar</Text>
                      </Pressable>
                    ) : null}
                    {canReset ? (
                      <Pressable
                        onPress={() => handleResetRequest(supplierKey)}
                        disabled={!canReset}
                        style={({ hovered, pressed }) => [
                          styles.actionLinkWrap,
                          (hovered || pressed) && styles.actionLinkHover,
                        ]}
                      >
                        <Text style={styles.actionLinkMuted}>Ångra</Text>
                      </Pressable>
                    ) : null}

                    <Pressable
                      onPress={() => handleRemoveSupplier(supplierKey)}
                      disabled={busy}
                      style={({ hovered, pressed }) => [
                        styles.removeLinkWrap,
                        (hovered || pressed) && styles.removeLinkHover,
                        busy && { opacity: 0.6 },
                      ]}
                    >
                      <Text style={styles.removeLink}>Ta bort</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          })
        )}
      </View>

      <AddInkopsplanSupplierModal
        visible={addSupplierOpen}
        onClose={() => setAddSupplierOpen(false)}
        companyId={companyId}
        projectId={projectId}
        row={row}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingVertical: 8,
    backgroundColor: '#FAFAFA',
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 8,
    paddingHorizontal: 12,
  },
  topRowLabel: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '700',
    width: 44,
  },
  templateSelect: {
    height: 32,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  templateSelectHover: { backgroundColor: '#F8FAFC' },
  templateSelectText: { fontSize: 13, color: '#0F172A', fontWeight: '600', flex: 1, minWidth: 0 },
  templateSelectChevron: { color: '#64748B', fontWeight: '800' },

  childTable: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    backgroundColor: 'transparent',
  },
  childHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  childHCell: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    minWidth: 0,
  },
  childRow: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 44,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
  },
  childEmpty: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  childCellText: {
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    minWidth: 0,
  },
  colCompany: { flex: 1.2 },
  colContact: { flex: 1.1 },
  colMobile: { width: 110 },
  colPhone: { width: 110 },
  colEmail: { flex: 1.5 },
  colRequest: { width: 110 },
  colStatus: { width: 220, minWidth: 220, flexShrink: 0 },

  childStatusCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  childActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexShrink: 0,
  },

  actionLinkWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  actionLinkHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  actionLinkMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },

  addLinkWrap: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  addLinkHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  addLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  muted: {
    fontSize: 13,
    color: '#64748B',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 8,
  },

  templateRow: {
    gap: 8,
    marginBottom: 8,
  },
  select: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  selectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectChevron: {
    width: 18,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  selectMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  selectItem: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectItemHover: {
    backgroundColor: '#F8FAFC',
  },
  selectItemActive: {
    backgroundColor: '#0F172A',
  },
  selectItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectItemTextActive: {
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
  },

  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  supplier: {
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 2,
    flex: 1,
    minWidth: 0,
  },
  removeLinkWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  removeLinkHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  removeLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },

  addSupplierBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  addSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addSupplierInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  suggestRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  suggestRowHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  suggestText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  suggestMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
  },

  smallBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  smallBtnPrimary: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  smallBtnHover: {
    transform: [{ translateY: -1 }],
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  smallBtnTextPrimary: {
    color: '#FFFFFF',
  },
});
