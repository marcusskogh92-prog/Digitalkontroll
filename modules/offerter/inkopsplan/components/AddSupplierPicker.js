import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
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
} from '../inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

const FILTER_BYGGDEL = 'byggdel';
const FILTER_ALL = 'all';

export default function AddSupplierPicker({
  visible,
  onClose,
  companyId,
  projectId,
  row,
  onAdded,
}) {
  const rowId = safeText(row?.id);

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState('');

  const [suppliers, setSuppliers] = useState([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [suppliersError, setSuppliersError] = useState('');
  const [supplierQuery, setSupplierQuery] = useState('');
  const [filterMode, setFilterMode] = useState(FILTER_BYGGDEL);

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
          const cnLow = (cn || '').toLowerCase();
          return cnLow.includes(rowName) || rowName.includes(cnLow);
        });
        if (match) return true;
      }

      return false;
    };
  }, [row?.sourceId, row?.type, row?.name, row?.linkedCategoryId, row?.linkedCategoryIds]);

  const displayList = useMemo(() => {
    const q = String(supplierQuery || '').trim().toLowerCase();
    const list = Array.isArray(suppliers) ? suppliers : [];

    const filtered = q
      ? list.filter((s) => safeText(s?.companyName).toLowerCase().includes(q))
      : list;

    if (filterMode === FILTER_BYGGDEL) {
      return filtered.filter((s) => isSupplierRelevant(s));
    }
    return filtered;
  }, [suppliers, supplierQuery, filterMode, isSupplierRelevant]);

  const displayListSorted = useMemo(() => {
    return [...displayList].sort((a, b) =>
      safeText(a?.companyName).localeCompare(safeText(b?.companyName), 'sv'),
    );
  }, [displayList]);

  useEffect(() => {
    let alive = true;
    if (!visible) return;

    setAddError('');
    setSupplierQuery('');
    setFilterMode(FILTER_BYGGDEL);

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

  const handlePickSupplier = async (supplier) => {
    if (!companyId || !projectId || !rowId || adding) return;

    const party = {
      ...supplier,
      contactId: null,
      contactName: null,
      mobile: null,
      phone: null,
      email: null,
    };

    setAdding(true);
    setAddError('');
    try {
      await addInkopsplanRowSupplier({ companyId, projectId, rowId, party });
      onAdded?.();
      onClose?.();
    } catch (e) {
      const msg = String(e?.message || e || 'Okänt fel');
      setAddError(msg);
    } finally {
      setAdding(false);
    }
  };

  const rowLabel = `${safeText(row?.nr) ? `BD ${row?.nr} · ` : ''}${safeText(row?.name) || 'Inköpsrad'}`;

  return (
    <StandardModal
      visible={!!visible}
      onClose={onClose}
      title="Lägg till leverantör"
      subtitle={rowLabel}
      iconName="business-outline"
      defaultWidth={480}
      defaultHeight={380}
      minWidth={380}
      minHeight={320}
    >
      <View style={styles.content}>
        <View style={styles.toolbar}>
          <TextInput
            value={supplierQuery}
            onChangeText={setSupplierQuery}
            placeholder="Sök leverantör…"
            style={styles.input}
            editable={!loadingSuppliers}
          />
          <View style={styles.filterRow}>
            <Pressable
              onPress={() => setFilterMode(FILTER_BYGGDEL)}
              style={({ hovered, pressed }) => [
                styles.filterBtn,
                filterMode === FILTER_BYGGDEL && styles.filterBtnActive,
                (hovered || pressed) && styles.filterBtnHover,
              ]}
            >
              <Text style={[styles.filterBtnText, filterMode === FILTER_BYGGDEL && styles.filterBtnTextActive]}>
                Inom denna byggdel
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setFilterMode(FILTER_ALL)}
              style={({ hovered, pressed }) => [
                styles.filterBtn,
                filterMode === FILTER_ALL && styles.filterBtnActive,
                (hovered || pressed) && styles.filterBtnHover,
              ]}
            >
              <Text style={[styles.filterBtnText, filterMode === FILTER_ALL && styles.filterBtnTextActive]}>
                Visa alla leverantörer
              </Text>
            </Pressable>
          </View>
        </View>

        {addError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{addError}</Text>
          </View>
        ) : null}

        <View style={styles.listWrap}>
          {loadingSuppliers ? (
            <LoadingState message="Laddar leverantörer…" size="small" minHeight={120} />
          ) : suppliersError ? (
            <Text style={styles.inlineError}>{suppliersError}</Text>
          ) : displayListSorted.length === 0 ? (
            <Text style={styles.muted}>
              {supplierQuery ? 'Inga träffar.' : filterMode === FILTER_BYGGDEL ? 'Inga leverantörer matchar denna byggdel.' : 'Inga leverantörer.'}
            </Text>
          ) : (
            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
            >
              {displayListSorted.map((s) => {
                const label = safeText(s?.companyName) || '—';
                const meta = safeText(s?.category);
                const key = safeText(s?.key) || `lev-${label}-${Math.random()}`;
                const recommended = isSupplierRelevant(s);

                return (
                  <Pressable
                    key={key}
                    onPress={() => handlePickSupplier(s)}
                    disabled={adding}
                    style={({ hovered, pressed }) => [
                      styles.row,
                      recommended && styles.rowRecommended,
                      (hovered || pressed) && !adding && (recommended ? styles.rowRecommendedHover : styles.rowHover),
                      adding && { opacity: 0.7 },
                    ]}
                  >
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={styles.rowText} numberOfLines={1}>
                        {label}
                        {meta ? <Text style={styles.rowMeta}> · {meta}</Text> : null}
                      </Text>
                    </View>
                    {adding ? <ActivityIndicator size="small" color="#64748B" /> : null}
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
    padding: 12,
  },
  toolbar: {
    gap: 8,
    marginBottom: 8,
  },
  input: {
    height: 36,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  filterBtnActive: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  filterBtnHover: {
    backgroundColor: '#F8FAFC',
  },
  filterBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  filterBtnTextActive: {
    color: '#2563EB',
  },
  errorBox: {
    padding: 10,
    marginTop: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 8,
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '600',
  },
  inlineError: {
    fontSize: 12,
    color: '#B91C1C',
    padding: 12,
  },
  muted: {
    fontSize: 12,
    color: '#64748B',
    padding: 12,
  },
  listWrap: {
    minHeight: 120,
    maxHeight: 280,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  rowHover: {
    backgroundColor: '#EEF6FF',
  },
  rowRecommended: {
    backgroundColor: '#F0FDF4',
  },
  rowRecommendedHover: {
    backgroundColor: '#DCFCE7',
  },
  rowText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  rowMeta: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
  },
});
