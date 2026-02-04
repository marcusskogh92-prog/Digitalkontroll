import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import ContactPickerInline from './ContactPickerInline';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function getCategoryList(supplier) {
  if (!supplier) return [];
  if (Array.isArray(supplier.categories) && supplier.categories.length) return supplier.categories;
  if (supplier.category) return [supplier.category];
  return [];
}

function StatusPill({ status }) {
  const s = String(status || '').trim();
  const style =
    s === 'Besvarad'
      ? { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', color: '#0f172a' }
      : s === 'Skickad'
        ? { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1', color: '#334155' }
        : { backgroundColor: '#fff', borderColor: '#E2E8F0', color: '#475569' };

  return (
    <View style={[styles.statusPill, { backgroundColor: style.backgroundColor, borderColor: style.borderColor }]}>
      <Text style={[styles.statusText, { color: style.color }]} numberOfLines={1}>
        {s || 'Ej skickad'}
      </Text>
    </View>
  );
}

function SmallButton({ label, onPress, disabled, variant }) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        variant === 'primary' && styles.btnPrimary,
        variant === 'danger' && styles.btnDanger,
        disabled && styles.btnDisabled,
        pressed && !disabled && styles.btnPressed,
      ]}
    >
      <Text
        style={[
          styles.btnText,
          variant === 'primary' && styles.btnTextPrimary,
          variant === 'danger' && styles.btnTextDanger,
          disabled && styles.btnTextDisabled,
        ]}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export default function SupplierTable({
  packages,
  suppliers,
  contacts,
  onPickContact,
  onCreateContact,
  onSetStatus,
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

  const resolveContact = (pkg) => {
    const cid = safeText(pkg?.contactId);
    if (cid && contactMap.has(cid)) return contactMap.get(cid);
    return null;
  };

  return (
    <View style={styles.table}>
      <View style={styles.headerRow}>
        <Text style={[styles.th, styles.colSupplier]}>Företag</Text>
        <Text style={[styles.th, styles.colCategory]}>Kategorier</Text>
        <Text style={[styles.th, styles.colContact]}>Kontaktperson</Text>
        <Text style={[styles.th, styles.colStatus]}>Status</Text>
        <Text style={[styles.th, styles.colActions]}>Åtgärder</Text>
      </View>

      {rows.length === 0 ? (
        <View style={styles.emptyRow}>
          <Text style={styles.emptyText}>Inga leverantörer tillagda i denna disciplin.</Text>
        </View>
      ) : (
        rows.map((p) => {
          const status = safeText(p?.status) || 'Ej skickad';
          const supplierName = safeText(p?.supplierName) || '—';
          const supplier = resolveSupplier(p);
          const categories = getCategoryList(supplier);
          const visibleCategories = categories.slice(0, 3);
          const extraCategories = Math.max(0, categories.length - visibleCategories.length);
          const contact = resolveContact(p);
          const contactName = safeText(p?.contactName) || safeText(contact?.name);
          const openDisabled = !canOpenFolder?.(p);
          return (
            <View key={p.id} style={styles.dataRow}>
              <View style={[styles.td, styles.colSupplier]}>
                <Text style={styles.supplierText} numberOfLines={1}>
                  {supplierName}
                </Text>
              </View>
              <View style={[styles.td, styles.colCategory]}>
                {visibleCategories.length ? (
                  <View style={styles.chipRow}>
                    {visibleCategories.map((cat) => (
                      <View key={cat} style={styles.chip}>
                        <Text style={styles.chipText} numberOfLines={1}>{safeText(cat)}</Text>
                      </View>
                    ))}
                    {extraCategories > 0 ? (
                      <View style={styles.chipMuted}>
                        <Text style={styles.chipMutedText}>{`+${extraCategories}`}</Text>
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Text style={styles.emptyCell}>—</Text>
                )}
              </View>
              <View style={[styles.td, styles.colContact]}>
                <View style={styles.contactCell}>
                  {contactName ? (
                    <View style={styles.contactChip}>
                      <Text style={styles.contactChipText} numberOfLines={1}>{contactName}</Text>
                    </View>
                  ) : (
                    <Text style={styles.emptyCell}>Ingen kontakt</Text>
                  )}
                  <ContactPickerInline
                    contacts={contacts}
                    supplierId={safeText(supplier?.id || p?.supplierId)}
                    onPick={(c) => onPickContact?.(p, c)}
                    onCreate={(name) => onCreateContact?.(p, name)}
                  />
                </View>
              </View>
              <View style={[styles.td, styles.colStatus]}>
                <StatusPill status={status} />
              </View>
              <View style={[styles.td, styles.colActions]}>
                <View style={styles.actionRow}>
                  <SmallButton
                    label="Skickad"
                    onPress={() => onSetStatus?.(p, 'Skickad')}
                    disabled={status === 'Skickad' || status === 'Besvarad'}
                  />
                  <SmallButton
                    label="Besvarad"
                    onPress={() => onSetStatus?.(p, 'Besvarad')}
                    disabled={status === 'Besvarad'}
                  />
                  <SmallButton label="Mapp" onPress={() => onOpenFolder?.(p)} disabled={openDisabled} />
                  <SmallButton
                    label="Ta bort"
                    onPress={() => onRemove?.(p)}
                    variant="danger"
                  />
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
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 2,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    gap: 10,
  },
  th: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  dataRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
  td: {
    justifyContent: 'center',
  },
  colSupplier: {
    flex: 2,
    minWidth: 160,
  },
  colCategory: {
    flex: 2,
    minWidth: 160,
  },
  colContact: {
    flex: 2,
    minWidth: 200,
  },
  colStatus: {
    width: 120,
    alignItems: 'flex-start',
  },
  colActions: {
    flex: 3,
    minWidth: 240,
  },
  supplierText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#111827',
  },
  emptyCell: {
    fontSize: 12,
    color: '#94a3b8',
  },
  emptyRow: {
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  emptyText: {
    fontSize: 12,
    color: '#94a3b8',
  },
  actionRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F1F5F9',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#334155',
  },
  chipMuted: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  chipMutedText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
  },
  contactCell: {
    gap: 6,
  },
  contactChip: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  contactChipText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#334155',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '500',
  },
  btn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#fff',
  },
  btnPrimary: {
    borderColor: '#334155',
    backgroundColor: '#334155',
  },
  btnDanger: {
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
  },
  btnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  btnTextPrimary: {
    color: '#fff',
  },
  btnTextDanger: {
    color: '#64748b',
  },
  btnDisabled: {
    opacity: 0.5,
  },
  btnPressed: {
    opacity: 0.9,
  },
  btnTextDisabled: {
    color: '#94a3b8',
  },
});
