import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import StandardModal from '../../../../components/common/StandardModal';
import { fetchByggdelar, fetchCategories, fetchKontoplan } from '../../../../components/firebase';
import { addRowsFromRegister, INKOPSPLAN_ROW_TYPE } from '../inkopsplanService';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function RadioOption({ label, selected, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.radio,
        (hovered || pressed) && styles.radioHover,
        selected && styles.radioSelected,
      ]}
    >
      <View style={[styles.radioDot, selected && styles.radioDotSelected]} />
      <Text style={styles.radioLabel}>{label}</Text>
    </Pressable>
  );
}

function CheckRow({ label, checked, onToggle }) {
  return (
    <Pressable
      onPress={onToggle}
      style={({ hovered, pressed }) => [styles.checkRow, (hovered || pressed) && styles.checkRowHover]}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]} />
      <Text style={styles.checkLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function formatRegisterItem(registerType, item) {
  if (registerType === INKOPSPLAN_ROW_TYPE.BUILDING_PART) {
    const code = safeText(item?.code);
    const name = safeText(item?.name);
    return code && name ? `${code} ${name}` : (name || code || 'Byggdel');
  }
  if (registerType === INKOPSPLAN_ROW_TYPE.ACCOUNT) {
    const konto = safeText(item?.konto);
    const ben = safeText(item?.benamning);
    return konto && ben ? `${konto} ${ben}` : (ben || konto || 'Konto');
  }
  if (registerType === INKOPSPLAN_ROW_TYPE.CATEGORY) {
    return safeText(item?.name) || 'Kategori';
  }
  return safeText(item?.name || item?.label) || 'Post';
}

export default function CreateInkopsplanModal({
  visible,
  onClose,
  companyId,
  projectId,
  mode = 'create',
  existingRowKeySet,
  onCreated,
}) {
  const [selectedRegisterType, setSelectedRegisterType] = useState(null);
  const [loading, setLoading] = useState(false);
  const [registerItems, setRegisterItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setSelectedItems({});
    setRegisterItems([]);
    setLoading(false);
    setSaving(false);
    setError('');
  }, [visible]);

  useEffect(() => {
    let alive = true;
    const cid = safeText(companyId);
    if (!visible || !cid || !selectedRegisterType) return () => {};

    setLoading(true);
    setRegisterItems([]);
    setSelectedItems({});
    setError('');

    const run = async () => {
      try {
        if (selectedRegisterType === INKOPSPLAN_ROW_TYPE.BUILDING_PART) {
          const list = await fetchByggdelar(cid);
          if (!alive) return;
          setRegisterItems(Array.isArray(list) ? list : []);
          return;
        }
        if (selectedRegisterType === INKOPSPLAN_ROW_TYPE.ACCOUNT) {
          const list = await fetchKontoplan(cid);
          if (!alive) return;
          setRegisterItems(Array.isArray(list) ? list : []);
          return;
        }
        if (selectedRegisterType === INKOPSPLAN_ROW_TYPE.CATEGORY) {
          const list = await fetchCategories(cid);
          if (!alive) return;
          setRegisterItems(Array.isArray(list) ? list : []);
          return;
        }
        if (!alive) return;
        setRegisterItems([]);
      } catch (e) {
        if (!alive) return;
        const msg = String(e?.message || e || 'Kunde inte läsa register.');
        setError(msg);
        setRegisterItems([]);
      } finally {
        if (!alive) return;
        setLoading(false);
      }
    };

    void run();

    return () => {
      alive = false;
    };
  }, [visible, companyId, selectedRegisterType]);

  const effectiveExistingSet = useMemo(() => {
    return existingRowKeySet && typeof existingRowKeySet === 'object' ? existingRowKeySet : {};
  }, [existingRowKeySet]);

  const selectableItems = useMemo(() => {
    const items = Array.isArray(registerItems) ? registerItems : [];
    if (!selectedRegisterType) return items;
    if (mode !== 'add') return items;

    // When adding, hide items already in plan.
    return items.filter((it) => {
      const id = safeText(it?.id);
      if (!id) return false;
      const key = `${selectedRegisterType}:${id}`;
      return !effectiveExistingSet[key];
    });
  }, [registerItems, selectedRegisterType, effectiveExistingSet, mode]);

  const selectedCount = useMemo(() => {
    return Object.values(selectedItems).filter(Boolean).length;
  }, [selectedItems]);

  const canSave = Boolean(companyId && projectId && selectedRegisterType && selectedCount > 0 && !saving);

  const toggleItem = (id) => {
    const sid = safeText(id);
    if (!sid) return;
    setSelectedItems((prev) => ({ ...prev, [sid]: !prev?.[sid] }));
  };

  const markAll = () => {
    const next = {};
    selectableItems.forEach((it) => {
      const id = safeText(it?.id);
      if (id) next[id] = true;
    });
    setSelectedItems(next);
  };

  const clearAll = () => setSelectedItems({});

  const handleSave = async () => {
    if (!canSave) return;

    const items = selectableItems.filter((it) => selectedItems[safeText(it?.id)]);
    if (items.length === 0) return;

    setSaving(true);
    setError('');
    try {
      await addRowsFromRegister({
        companyId,
        projectId,
        registerType: selectedRegisterType,
        items,
      });
      onClose?.();
      onCreated?.();
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte skapa inköpsplan.');
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const title = mode === 'add' ? 'Lägg till från register' : 'Skapa inköpsplan';
  const saveLabel = mode === 'add' ? 'Lägg till' : 'Skapa';

  return (
    <StandardModal
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Välj hur inköpsdiscipliner ska genereras"
      iconName="list-outline"
      saveLabel={saveLabel}
      onSave={handleSave}
      saving={saving}
      saveDisabled={!canSave}
      defaultWidth={920}
      defaultHeight={680}
      minWidth={520}
      minHeight={420}
      footerExtra={
        <View style={styles.footerExtra}>
          <Pressable
            onPress={markAll}
            style={({ hovered, pressed }) => [styles.linkBtn, (hovered || pressed) && styles.linkBtnHover]}
          >
            <Text style={styles.linkBtnText}>Markera alla</Text>
          </Pressable>
          <Pressable
            onPress={clearAll}
            style={({ hovered, pressed }) => [styles.linkBtn, (hovered || pressed) && styles.linkBtnHover]}
          >
            <Text style={styles.linkBtnText}>Avmarkera alla</Text>
          </Pressable>
        </View>
      }
    >
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.stepTitle}>Steg 1</Text>
        <Text style={styles.stepText}>Välj registertyp</Text>

        <View style={styles.radioRow}>
          <RadioOption
            label="Byggdelar"
            selected={selectedRegisterType === INKOPSPLAN_ROW_TYPE.BUILDING_PART}
            onPress={() => setSelectedRegisterType(INKOPSPLAN_ROW_TYPE.BUILDING_PART)}
          />
          <RadioOption
            label="Kontoplan"
            selected={selectedRegisterType === INKOPSPLAN_ROW_TYPE.ACCOUNT}
            onPress={() => setSelectedRegisterType(INKOPSPLAN_ROW_TYPE.ACCOUNT)}
          />
          <RadioOption
            label="Kategorier"
            selected={selectedRegisterType === INKOPSPLAN_ROW_TYPE.CATEGORY}
            onPress={() => setSelectedRegisterType(INKOPSPLAN_ROW_TYPE.CATEGORY)}
          />
        </View>

        <View style={styles.divider} />

        <View style={styles.stepHeader}>
          <View style={{ flex: 1 }}>
            <Text style={styles.stepTitle}>Steg 2</Text>
            <Text style={styles.stepText}>Välj poster ({selectedCount} valda)</Text>
          </View>
        </View>

        <View style={styles.listBox}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          ) : !selectedRegisterType ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Välj registertyp för att se innehåll.</Text>
            </View>
          ) : selectableItems.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Inga nya poster att lägga till.</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.listContent}>
              {selectableItems.map((it) => {
                const id = safeText(it?.id);
                const label = formatRegisterItem(selectedRegisterType, it);
                const checked = Boolean(selectedItems[id]);
                return (
                  <CheckRow
                    key={id}
                    label={label}
                    checked={checked}
                    onToggle={() => toggleItem(id)}
                  />
                );
              })}
            </ScrollView>
          )}
        </View>

        <View style={styles.hintBox}>
          <Text style={styles.hintText}>
            SharePoint-mappar skapas automatiskt i bakgrunden när det behövs.
          </Text>
        </View>
      </View>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    minHeight: 0,
    padding: 14,
    gap: 10,
  },
  stepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    marginBottom: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  radioRow: {
    flexDirection: 'row',
    gap: 12,
    flexWrap: 'wrap',
  },
  radio: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  radioHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  radioSelected: {
    borderColor: '#0F172A',
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  radioDotSelected: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 6,
  },
  listBox: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  listContent: {
    padding: 10,
    gap: 6,
  },
  checkRow: {
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    paddingHorizontal: 12,
    backgroundColor: '#FFFFFF',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  checkRowHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  checkBox: {
    width: 16,
    height: 16,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#FFFFFF',
  },
  checkBoxChecked: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  center: {
    flex: 1,
    minHeight: 180,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  muted: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
  },
  hintBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  hintText: {
    fontSize: 12,
    color: '#475569',
  },
  footerExtra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginRight: 12,
  },
  linkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  linkBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  linkBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
