import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { FILTER_ICON } from '../../../../constants/iconConstants';
import StandardModal from '../../../../components/common/StandardModal';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function ToggleRow({ label, checked, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => [
        styles.row,
        (hovered || pressed) && styles.rowHover,
      ]}
    >
      <View style={[styles.checkbox, checked && styles.checkboxChecked]} />
      <Text style={styles.rowText} numberOfLines={1}>{label}</Text>
    </Pressable>
  );
}

export default function InkopsplanColumnsModal({
  visible,
  onClose,
  columns,
  selectedColumnIds,
  onSave,
}) {
  const defs = Array.isArray(columns) ? columns : [];
  const initial = useMemo(() => {
    const arr = Array.isArray(selectedColumnIds) ? selectedColumnIds : [];
    const set = {};
    arr.forEach((id) => { const k = safeText(id); if (k) set[k] = true; });
    return set;
  }, [selectedColumnIds]);

  const [draft, setDraft] = useState(initial);

  useEffect(() => {
    if (!visible) return;
    setDraft(initial);
  }, [visible, initial]);

  const selectedCount = Object.values(draft).filter(Boolean).length;
  const canSave = selectedCount > 0;

  const toggle = (id) => {
    const k = safeText(id);
    if (!k) return;
    setDraft((prev) => {
      const next = { ...(prev || {}) };
      next[k] = !next[k];
      return next;
    });
  };

  const selectAll = () => {
    const next = {};
    defs.forEach((d) => { const k = safeText(d?.id); if (k) next[k] = true; });
    setDraft(next);
  };

  const clearAll = () => setDraft({});

  const handleSave = () => {
    if (!canSave) return;
    const out = defs
      .map((d) => safeText(d?.id))
      .filter(Boolean)
      .filter((id) => !!draft[id]);
    onSave?.(out);
  };

  return (
    <StandardModal
      visible={visible}
      onClose={onClose}
      title="Kolumner"
      subtitle="Välj vilka kolumner som ska visas"
      iconName={FILTER_ICON}
      saveLabel="Spara"
      onSave={handleSave}
      saveDisabled={!canSave}
      defaultWidth={520}
      defaultHeight={520}
      minWidth={420}
      minHeight={420}
      footerExtra={
        <View style={styles.footerExtra}>
          <Pressable
            onPress={selectAll}
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
      <View style={styles.body}>
        <Text style={styles.hint}>
          Valet sparas för dig (per projekt) och påverkar inte andra användare.
        </Text>
        <View style={styles.list}>
          {defs.map((d) => {
            const id = safeText(d?.id);
            if (!id) return null;
            const label = safeText(d?.label) || id;
            const checked = !!draft[id];
            return (
              <ToggleRow
                key={id}
                label={label}
                checked={checked}
                onPress={() => toggle(id)}
              />
            );
          })}
        </View>
      </View>
    </StandardModal>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    padding: 16,
    gap: 10,
  },
  hint: {
    fontSize: 11,
    color: '#64748b',
  },
  list: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  row: {
    height: 32,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  rowHover: {
    backgroundColor: '#F8FAFC',
  },
  checkbox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#fff',
  },
  checkboxChecked: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  rowText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#0F172A',
    flex: 1,
    minWidth: 0,
  },
  footerExtra: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  linkBtn: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  linkBtnHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  linkBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
});

