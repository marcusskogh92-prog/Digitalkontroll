import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import ModalBase from '../../../../components/common/ModalBase';
import { MODAL_DESIGN_2026 as D } from '../../../../constants/modalDesign2026';
import { useDraggableResizableModal } from '../../../../hooks/useDraggableResizableModal';
import { useModalKeyboard } from '../../../../hooks/useModalKeyboard';
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

function CheckRow({ label, checked, disabled, onToggle }) {
  return (
    <Pressable
      onPress={disabled ? undefined : onToggle}
      style={({ hovered, pressed }) => [
        styles.checkRow,
        (hovered || pressed) && !disabled && styles.checkRowHover,
        disabled && styles.checkRowDisabled,
      ]}
    >
      <View style={[styles.checkBox, checked && styles.checkBoxChecked]} />
      <Text style={styles.checkLabel} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

function isExistingItem({ selectedRegisterType, effectiveExistingSet, item }) {
  const id = safeText(item?.id);
  if (!id || !selectedRegisterType) return false;
  const key = `${selectedRegisterType}:${id}`;
  return Boolean(effectiveExistingSet?.[key]);
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

  const displayItems = useMemo(() => {
    return Array.isArray(registerItems) ? registerItems : [];
  }, [registerItems]);

  const selectedCount = useMemo(() => {
    if (mode !== 'add') return Object.values(selectedItems).filter(Boolean).length;
    return displayItems.filter((it) => {
      const id = safeText(it?.id);
      if (!id) return false;
      if (isExistingItem({ selectedRegisterType, effectiveExistingSet, item: it })) return false;
      return Boolean(selectedItems?.[id]);
    }).length;
  }, [selectedItems, displayItems, mode, selectedRegisterType, effectiveExistingSet]);

  const toggleItem = (id) => {
    const sid = safeText(id);
    if (!sid) return;
    setSelectedItems((prev) => ({ ...prev, [sid]: !prev?.[sid] }));
  };

  const markAll = () => {
    const next = {};
    displayItems.forEach((it) => {
      const id = safeText(it?.id);
      if (!id) return;
      if (mode === 'add' && isExistingItem({ selectedRegisterType, effectiveExistingSet, item: it })) return;
      next[id] = true;
    });
    setSelectedItems(next);
  };

  const clearAll = () => setSelectedItems({});

  const handleSave = async () => {
    if (!canSave) return;

    const items = displayItems.filter((it) => {
      const id = safeText(it?.id);
      if (!id) return false;
      if (!selectedItems?.[id]) return false;
      if (mode === 'add' && isExistingItem({ selectedRegisterType, effectiveExistingSet, item: it })) return false;
      return true;
    });
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
  const canSave = Boolean(companyId && projectId && selectedRegisterType && selectedCount > 0 && !saving);

  useModalKeyboard(visible, onClose, handleSave, { canSave, saving, disabled: !visible });

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 920,
    defaultHeight: 680,
    minWidth: 520,
    minHeight: 420,
  });

  const footer = (
    <View style={styles.footerRow}>
      <View style={styles.footerLeft}>
        <Pressable
          onPress={markAll}
          style={({ hovered, pressed }) => [styles.footerLink, (hovered || pressed) && styles.footerLinkHover]}
        >
          <Text style={styles.footerLinkText}>Markera alla</Text>
        </Pressable>
        <Pressable
          onPress={clearAll}
          style={({ hovered, pressed }) => [styles.footerLink, (hovered || pressed) && styles.footerLinkHover]}
        >
          <Text style={styles.footerLinkText}>Avmarkera alla</Text>
        </Pressable>
      </View>
      <View style={styles.footerRight}>
        <TouchableOpacity
          style={styles.footerBtnSecondary}
          onPress={onClose}
          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
        >
          <Text style={styles.footerBtnSecondaryText}>Stäng</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.footerBtnPrimary, (!canSave || saving) && { opacity: 0.5 }]}
          onPress={handleSave}
          disabled={!canSave || saving}
          {...(Platform.OS === 'web' ? { cursor: !canSave || saving ? 'default' : 'pointer' } : {})}
        >
          <Text style={styles.footerBtnPrimaryText}>
            {saving ? 'Sparar…' : saveLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ModalBase
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle="Välj hur inköpsdiscipliner ska genereras"
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="list-outline" size={D.headerNeutralCompactIconPx} color={D.headerNeutralTextColor} />}
      boxStyle={boxStyle}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={styles.contentWrap}
    >
      <View style={styles.content}>
        {error ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}
        <Text style={styles.stepTitle}>STEG 1</Text>
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
            <Text style={styles.stepTitle}>STEG 2</Text>
            <Text style={styles.stepText}>Välj poster ({selectedCount} valda)</Text>
          </View>
        </View>

        <View style={styles.listBox}>
          {loading ? (
            <View style={styles.center}>
              <ActivityIndicator color={D.titleColor} />
            </View>
          ) : !selectedRegisterType ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Välj registertyp för att se innehåll.</Text>
            </View>
          ) : displayItems.length === 0 ? (
            <View style={styles.center}>
              <Text style={styles.muted}>Inga poster i registret.</Text>
            </View>
          ) : (
            <ScrollView
              style={isWeb() ? styles.listScrollWeb : styles.listScroll}
              contentContainerStyle={styles.listContent}
            >
              {displayItems.map((it) => {
                const id = safeText(it?.id);
                const label = formatRegisterItem(selectedRegisterType, it);
                const existing = mode === 'add' && isExistingItem({ selectedRegisterType, effectiveExistingSet, item: it });
                const checked = existing || Boolean(selectedItems[id]);
                return (
                  <CheckRow
                    key={id}
                    label={label}
                    checked={checked}
                    disabled={existing}
                    onToggle={() => {
                      if (existing) return;
                      toggleItem(id);
                    }}
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
    </ModalBase>
  );
}

const styles = StyleSheet.create({
  contentWrap: {
    flex: 1,
    minHeight: 0,
    padding: D.contentPadding,
  },
  content: {
    flex: 1,
    minHeight: 0,
    gap: D.sectionGap,
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
    borderRadius: D.buttonRadius,
    marginBottom: 12,
  },
  errorText: {
    color: '#991B1B',
    fontSize: 12,
    fontWeight: '600',
  },
  stepTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  stepText: {
    marginTop: 4,
    fontSize: 13,
    fontWeight: '600',
    color: D.titleColor,
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
    borderColor: D.tableBorderColor,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: D.buttonRadius,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  radioHover: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  radioSelected: {
    borderColor: D.titleColor,
  },
  radioDot: {
    width: 14,
    height: 14,
    borderRadius: 999,
    borderWidth: 2,
    borderColor: '#94A3B8',
  },
  radioDotSelected: {
    borderColor: D.titleColor,
    backgroundColor: D.titleColor,
  },
  radioLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: D.titleColor,
  },
  divider: {
    height: 1,
    backgroundColor: D.tableBorderColor,
    marginVertical: 6,
  },
  listBox: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: D.tableBorderColor,
    borderRadius: D.buttonRadius,
    backgroundColor: '#fff',
    overflow: 'hidden',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
  },
  listScrollWeb: {
    flex: 1,
    minHeight: 0,
    overflowY: 'scroll',
  },
  listContent: {
    padding: 10,
    gap: 6,
  },
  checkRow: {
    minHeight: 40,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: D.tableBorderColor,
    borderRadius: D.buttonRadius,
    paddingHorizontal: 12,
    backgroundColor: '#fff',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  checkRowHover: {
    borderColor: '#cbd5e1',
    backgroundColor: '#f8fafc',
  },
  checkRowDisabled: {
    opacity: 0.65,
    ...(isWeb() ? { cursor: 'default' } : {}),
  },
  checkBox: {
    width: 16,
    height: 16,
    borderRadius: D.buttonRadius,
    borderWidth: 2,
    borderColor: '#94A3B8',
    backgroundColor: '#fff',
  },
  checkBoxChecked: {
    borderColor: D.titleColor,
    backgroundColor: D.titleColor,
  },
  checkLabel: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: D.titleColor,
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
    color: D.subtitleColor,
    textAlign: 'center',
  },
  hintBox: {
    marginTop: 8,
    padding: 12,
    borderRadius: D.buttonRadius,
    backgroundColor: '#f8fafc',
    borderWidth: 1,
    borderColor: D.tableBorderColor,
  },
  hintText: {
    fontSize: 12,
    color: '#475569',
  },
  footerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  footerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  footerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  footerLink: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 8,
    borderRadius: D.buttonRadius,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerLinkHover: {
    backgroundColor: 'rgba(0,0,0,0.06)',
  },
  footerLinkText: {
    fontSize: 12,
    fontWeight: '500',
    color: D.buttonSecondaryColor,
  },
  footerBtnSecondary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#b91c1c',
  },
  footerBtnPrimary: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: 18,
    borderRadius: D.buttonRadius,
    backgroundColor: D.buttonPrimaryBg,
    minWidth: 96,
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  footerBtnPrimaryText: {
    fontSize: 12,
    fontWeight: D.buttonPrimaryFontWeight,
    color: D.buttonPrimaryColor,
  },
});
