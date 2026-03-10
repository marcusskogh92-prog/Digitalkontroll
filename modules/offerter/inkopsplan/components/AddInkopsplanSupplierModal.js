import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import LoadingState from '../../../../components/common/LoadingState';
import StandardModal from '../../../../components/common/StandardModal';

import {
  addInkopsplanRowSupplier,
  fetchCompanySuppliersForInkopsplan,
  fetchSupplierContactsForInkopsplan,
} from '../inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function Select({ valueLabel, disabled, open, onToggle, children }) {
  return (
    <View style={{ position: 'relative', flex: 1, minWidth: 0 }}>
      <Pressable
        onPress={onToggle}
        disabled={disabled}
        style={({ hovered, pressed }) => [
          styles.select,
          (hovered || pressed) && !disabled && styles.selectHover,
          disabled && { opacity: 0.7 },
        ]}
      >
        <Text style={styles.selectText} numberOfLines={1}>{valueLabel || 'Välj…'}</Text>
        <Text style={styles.selectChevron}>{open ? '▴' : '▾'}</Text>
      </Pressable>
      {open ? (
        <View style={styles.selectMenu}>
          {children}
        </View>
      ) : null}
    </View>
  );
}

export default function AddInkopsplanSupplierModal({
  visible,
  onClose,
  companyId,
  projectId,
  row,
}) {
  const rowId = safeText(row?.id);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [suppliersError, setSuppliersError] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');

  const [selectedSupplier, setSelectedSupplier] = useState(null);

  const [contacts, setContacts] = useState([]);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [contactsError, setContactsError] = useState('');
  const [contactOpen, setContactOpen] = useState(false);
  const [selectedContactId, setSelectedContactId] = useState('');

  const selectedContact = useMemo(() => {
    const id = safeText(selectedContactId);
    const list = Array.isArray(contacts) ? contacts : [];
    return list.find((c) => safeText(c?.id) === id) || null;
  }, [contacts, selectedContactId]);

  useEffect(() => {
    let alive = true;
    if (!visible) return;

    setSaving(false);
    setSaveError('');
    setSupplierQuery('');
    setSelectedSupplier(null);
    setContacts([]);
    setSelectedContactId('');
    setContactOpen(false);
    setSuppliersError('');
    setContactsError('');

    if (!companyId) return;
    setLoadingSuppliers(true);

    const run = async () => {
      try {
        const list = await fetchCompanySuppliersForInkopsplan(companyId);
        if (!alive) return;
        setSuppliers(Array.isArray(list) ? list : []);
      } catch (e) {
        if (!alive) return;
        setSuppliersError(String(e?.message || e || 'Kunde inte läsa leverantörsregister.'));
      } finally {
        if (!alive) return;
        setLoadingSuppliers(false);
      }
    };

    void run();
    return () => {
      alive = false;
    };
  }, [visible, companyId]);

  const isSupplierRelevant = useMemo(() => {
    const rowSourceId = safeText(row?.sourceId);
    const rowType = safeText(row?.type);
    const rowName = safeText(row?.name).toLowerCase();
    const linkedCatIds = Array.isArray(row?.linkedCategoryIds) ? row.linkedCategoryIds.map((id) => safeText(id)).filter(Boolean) : [];
    const linkedCatId = safeText(row?.linkedCategoryId);
    if (linkedCatId && !linkedCatIds.includes(linkedCatId)) linkedCatIds.push(linkedCatId);

    if (!rowSourceId && !rowName && linkedCatIds.length === 0) return () => false;

    return (supplier) => {
      const sCatIds = Array.isArray(supplier?.categoryIds) ? supplier.categoryIds : [];
      const sByggdelIds = Array.isArray(supplier?.byggdelIds) ? supplier.byggdelIds : [];
      const sKontoIds = Array.isArray(supplier?.kontoIds) ? supplier.kontoIds : [];
      const sCatNames = Array.isArray(supplier?.categoryNames) ? supplier.categoryNames : [];

      if (rowType === 'category' && rowSourceId && sCatIds.includes(rowSourceId)) return true;
      if (rowType === 'building_part' && rowSourceId && sByggdelIds.includes(rowSourceId)) return true;
      if (rowType === 'account' && rowSourceId && sKontoIds.includes(rowSourceId)) return true;

      if (linkedCatIds.length > 0 && sCatIds.some((id) => linkedCatIds.includes(id))) return true;

      if (rowName && sCatNames.length > 0) {
        const match = sCatNames.some((cn) => {
          const cnLow = cn.toLowerCase();
          return cnLow.includes(rowName) || rowName.includes(cnLow);
        });
        if (match) return true;
      }

      return false;
    };
  }, [row?.sourceId, row?.type, row?.name, row?.linkedCategoryId, row?.linkedCategoryIds]);

  const { recommended, others } = useMemo(() => {
    const q = String(supplierQuery || '').trim().toLowerCase();
    const list = Array.isArray(suppliers) ? suppliers : [];

    const filtered = q
      ? list.filter((s) => safeText(s?.companyName).toLowerCase().includes(q))
      : list;

    const rec = [];
    const rest = [];
    filtered.forEach((s) => {
      if (isSupplierRelevant(s)) rec.push(s);
      else rest.push(s);
    });

    rec.sort((a, b) => safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'));
    rest.sort((a, b) => safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'));

    return { recommended: rec, others: rest };
  }, [suppliers, supplierQuery, isSupplierRelevant]);

  const loadContactsForSupplier = async (supplier) => {
    const sid = safeText(supplier?.registryId);
    if (!companyId || !sid) {
      setContacts([]);
      return;
    }

    setLoadingContacts(true);
    setContactsError('');
    try {
      const list = await fetchSupplierContactsForInkopsplan({
        companyId,
        supplierRegistryId: sid,
        supplierCompanyId: safeText(supplier?.companyId) || null,
      });
      setContacts(Array.isArray(list) ? list : []);
    } catch (e) {
      setContactsError(String(e?.message || e || 'Kunde inte läsa kontakter.'));
      setContacts([]);
    } finally {
      setLoadingContacts(false);
    }
  };

  const handlePickSupplier = async (supplier) => {
    setSelectedSupplier(supplier);
    setSupplierQuery('');
    setSelectedContactId('');
    setContactOpen(false);
    await loadContactsForSupplier(supplier);
  };

  const canSave = Boolean(companyId && projectId && rowId && selectedSupplier && safeText(selectedContactId));

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError('');
    try {
      const party = {
        ...selectedSupplier,
        contactId: safeText(selectedContact?.id) || safeText(selectedContactId) || null,
        contactName: safeText(selectedContact?.name) || null,
        mobile: safeText(selectedContact?.mobile) || null,
        phone: safeText(selectedContact?.phone) || null,
        email: safeText(selectedContact?.email) || null,
      };

      await addInkopsplanRowSupplier({ companyId, projectId, rowId, party });
      onClose?.();
    } catch (e) {
      const msg = String(e?.message || e || 'Okänt fel');
      setSaveError(msg);
      Alert.alert('Kunde inte lägga till', msg);
    } finally {
      setSaving(false);
    }
  };

  const subtitle = `${safeText(row?.nr) ? `BD ${safeText(row?.nr)} · ` : ''}${safeText(row?.name) || 'Inköpsrad'}`;

  return (
    <StandardModal
      visible={!!visible}
      onClose={onClose}
      title="Lägg till leverantör"
      subtitle={subtitle}
      iconName="business-outline"
      saveLabel="Lägg till"
      onSave={handleSave}
      saving={saving}
      saveDisabled={!canSave}
      defaultWidth={760}
      defaultHeight={560}
      minWidth={520}
      minHeight={420}
    >
      <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {saveError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{saveError}</Text>
          </View>
        ) : null}

        <Text style={styles.sectionLabel}>Företag</Text>
        {suppliersError ? <Text style={styles.inlineError}>{suppliersError}</Text> : null}

        {selectedSupplier ? (
          <View style={styles.pickedBox}>
            <Text style={styles.pickedTitle} numberOfLines={1}>{safeText(selectedSupplier?.companyName) || '—'}</Text>
            <Pressable
              onPress={() => { setSelectedSupplier(null); setContacts([]); setSelectedContactId(''); }}
              style={({ hovered, pressed }) => [styles.linkBtn, (hovered || pressed) && styles.linkBtnHover]}
            >
              <Text style={styles.linkBtnText}>Byt</Text>
            </Pressable>
          </View>
        ) : loadingSuppliers ? (
          <LoadingState message="Laddar leverantörsregister…" size="small" minHeight={120} />
        ) : (
          <>
            <TextInput
              value={supplierQuery}
              onChangeText={setSupplierQuery}
              placeholder="Sök leverantör…"
              style={styles.input}
            />

            {recommended.length > 0 || others.length > 0 ? (
              <View style={styles.suggestBox}>
                {recommended.length > 0 ? (
                  <>
                    <View style={styles.sectionHeaderRow}>
                      <View style={styles.sectionBadge}>
                        <Text style={styles.sectionBadgeText}>Rekommenderade</Text>
                      </View>
                      <Text style={styles.sectionHeaderHint}>
                        Matchar {safeText(row?.name) || 'vald byggdel'}
                      </Text>
                    </View>
                    {recommended.map((s) => {
                      const label = safeText(s?.companyName) || '—';
                      const meta = safeText(s?.category);
                      const key = safeText(s?.key) || `rec-${label}`;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => handlePickSupplier(s)}
                          style={({ pressed, hovered }) => [
                            styles.suggestRow,
                            styles.suggestRowRecommended,
                            (pressed || hovered) && styles.suggestRowRecommendedHover,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.suggestText} numberOfLines={1}>{label}</Text>
                            <Text style={styles.suggestMeta} numberOfLines={1}>
                              {meta ? `Kategori · ${meta}` : 'Leverantör'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}
                {others.length > 0 ? (
                  <>
                    <View style={styles.sectionHeaderRow}>
                      <Text style={styles.sectionHeaderLabel}>Alla leverantörer</Text>
                    </View>
                    {others.map((s) => {
                      const label = safeText(s?.companyName) || '—';
                      const meta = safeText(s?.category);
                      const key = safeText(s?.key) || `other-${label}`;
                      return (
                        <Pressable
                          key={key}
                          onPress={() => handlePickSupplier(s)}
                          style={({ pressed, hovered }) => [
                            styles.suggestRow,
                            (pressed || hovered) && styles.suggestRowHover,
                          ]}
                        >
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={styles.suggestText} numberOfLines={1}>{label}</Text>
                            <Text style={styles.suggestMeta} numberOfLines={1}>
                              {meta ? `Kategori · ${meta}` : 'Leverantör'}
                            </Text>
                          </View>
                        </Pressable>
                      );
                    })}
                  </>
                ) : null}
              </View>
            ) : supplierQuery ? (
              <Text style={styles.muted}>Inga träffar.</Text>
            ) : null}
          </>
        )}

        <View style={styles.divider} />

        <Text style={styles.sectionLabel}>Kontaktperson</Text>
        {contactsError ? <Text style={styles.inlineError}>{contactsError}</Text> : null}
        {selectedSupplier ? (
          loadingContacts ? (
            <LoadingState message="Laddar kontakter…" size="small" minHeight={80} />
          ) : contacts.length === 0 ? (
            <Text style={styles.muted}>Inga kontakter hittades för leverantören.</Text>
          ) : (
            <Select
              valueLabel={safeText(selectedContact?.name) || 'Välj kontaktperson…'}
              open={contactOpen}
              onToggle={() => setContactOpen((v) => !v)}
              disabled={false}
            >
              {contacts.map((c) => {
                const id = safeText(c?.id);
                const active = id && id === safeText(selectedContactId);
                return (
                  <Pressable
                    key={id || safeText(c?.name) || Math.random()}
                    onPress={() => {
                      setSelectedContactId(id);
                      setContactOpen(false);
                    }}
                    style={({ hovered, pressed }) => [
                      styles.selectItem,
                      (hovered || pressed) && styles.selectItemHover,
                      active && styles.selectItemActive,
                    ]}
                  >
                    <Text style={[styles.selectItemText, active && styles.selectItemTextActive]} numberOfLines={1}>
                      {safeText(c?.name) || '—'}
                    </Text>
                    {safeText(c?.role) ? <Text style={styles.selectItemMeta} numberOfLines={1}>{safeText(c?.role)}</Text> : null}
                  </Pressable>
                );
              })}
            </Select>
          )
        ) : (
          <Text style={styles.muted}>Välj företag först.</Text>
        )}

        <View style={styles.readonlyGrid}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.readonlyLabel}>Mobil</Text>
            <TextInput style={styles.readonlyInput} value={safeText(selectedContact?.mobile)} editable={false} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.readonlyLabel}>Telefon</Text>
            <TextInput style={styles.readonlyInput} value={safeText(selectedContact?.phone)} editable={false} />
          </View>
        </View>
        <View style={{ marginTop: 8 }}>
          <Text style={styles.readonlyLabel}>Mejladress</Text>
          <TextInput style={styles.readonlyInput} value={safeText(selectedContact?.email)} editable={false} />
        </View>
      </ScrollView>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: 14,
    gap: 10,
  },

  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },

  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#334155' },
  inlineError: { fontSize: 12, color: '#b91c1c' },
  input: {
    height: 38,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#0f172a',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  muted: { fontSize: 12, color: '#64748b', marginTop: 6 },

  divider: { height: 1, backgroundColor: '#E5E7EB', marginVertical: 2 },

  pickedBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#f8fafc',
  },
  pickedTitle: { fontSize: 13, fontWeight: '700', color: '#0f172a', flex: 1, minWidth: 0 },

  linkBtn: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  linkBtnHover: { backgroundColor: 'rgba(37, 99, 235, 0.08)' },
  linkBtnText: { fontSize: 12, fontWeight: '800', color: '#2563EB' },

  suggestBox: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  suggestRow: {
    paddingVertical: 9,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  suggestRowHover: { backgroundColor: '#eef6ff' },
  suggestRowRecommended: {
    backgroundColor: '#f0fdf4',
  },
  suggestRowRecommendedHover: {
    backgroundColor: '#dcfce7',
  },
  suggestText: { fontSize: 13, fontWeight: '700', color: '#0f172a' },
  suggestMeta: { fontSize: 12, color: '#64748b', marginTop: 1 },

  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 7,
    paddingHorizontal: 10,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
  },
  sectionBadge: {
    backgroundColor: '#16a34a',
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  sectionBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#fff',
  },
  sectionHeaderHint: {
    fontSize: 11,
    color: '#64748b',
    fontWeight: '500',
  },
  sectionHeaderLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748b',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  readonlyGrid: { flexDirection: 'row', gap: 10 },
  readonlyLabel: { fontSize: 12, fontWeight: '700', color: '#475569', marginBottom: 6 },
  readonlyInput: {
    height: 38,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#f8fafc',
    color: '#0f172a',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },

  select: {
    height: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  selectHover: { backgroundColor: '#f8fafc' },
  selectText: { fontSize: 13, color: '#0f172a', fontWeight: '600', flex: 1, minWidth: 0 },
  selectChevron: { color: '#64748b', fontWeight: '800' },
  selectMenu: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '100%',
    marginTop: 4,
    maxHeight: 260,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
    zIndex: 1000,
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 10px 24px rgba(0,0,0,0.12)' }
      : {
          shadowColor: '#000',
          shadowOpacity: 0.12,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 10,
        }),
  },
  selectItem: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectItemHover: { backgroundColor: '#eef6ff' },
  selectItemActive: { backgroundColor: '#eff6ff' },
  selectItemText: { fontSize: 13, color: '#0f172a', fontWeight: '700' },
  selectItemTextActive: { color: '#1d4ed8' },
  selectItemMeta: { fontSize: 12, color: '#64748b', marginTop: 2 },
});
