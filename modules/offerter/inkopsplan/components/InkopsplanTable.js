import { useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addManualRow } from '../inkopsplanService';
import InkopsplanRow from './InkopsplanRow';
import InkopsplanRowExpanded from './InkopsplanRowExpanded';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function isWeb() {
  return Platform.OS === 'web';
}

function SmallButton({ label, onPress, disabled, tone = 'neutral' }) {
  return (
    <Pressable
      disabled={disabled}
      onPress={onPress}
      style={({ pressed, hovered }) => [
        styles.smallBtn,
        tone === 'primary' && styles.smallBtnPrimary,
        (pressed || hovered) && !disabled && styles.smallBtnHover,
        disabled && { opacity: 0.5 },
      ]}
    >
      <Text style={[styles.smallBtnText, tone === 'primary' && styles.smallBtnTextPrimary]} numberOfLines={1}>
        {label}
      </Text>
    </Pressable>
  );
}

export default function InkopsplanTable({
  companyId,
  projectId,
  rows,
  onRowsChanged,
}) {
  const [openRowId, setOpenRowId] = useState(null);

  const [manualNr, setManualNr] = useState('');
  const [manualName, setManualName] = useState('');
  const [manualType, setManualType] = useState('Manuell');
  const [manualTypeOpen, setManualTypeOpen] = useState(false);
  const [savingManual, setSavingManual] = useState(false);

  const MANUAL_TYPE_OPTIONS = ['Manuell', 'Byggdel', 'Konto', 'Kategori'];

  const handleToggleExpand = (row) => {
    const id = safeText(row?.id);
    if (!id) return;
    setOpenRowId((prev) => (prev === id ? null : id));
  };

  const canSaveManual = Boolean(companyId && projectId && safeText(manualName));

  const handleSaveManual = async () => {
    if (!canSaveManual || savingManual) return;
    setSavingManual(true);
    try {
      await addManualRow({
        companyId,
        projectId,
        nr: manualNr,
        name: manualName,
        manualTypeLabel: manualType,
      });
      setManualNr('');
      setManualName('');
      setManualType('Manuell');
      setManualTypeOpen(false);
      try { onRowsChanged?.(); } catch (_e) {}
    } catch (e) {
      Alert.alert('Kunde inte spara', e?.message || 'Okänt fel');
    } finally {
      setSavingManual(false);
    }
  };

  const list = Array.isArray(rows) ? rows : [];

  return (
    <View style={styles.wrap}>
      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.hCell, styles.chevron]}>{' '}</Text>
          <Text style={[styles.hCell, styles.bd]}>BD</Text>
          <Text style={[styles.hCell, styles.name]}>Benämning</Text>
          <Text style={[styles.hCell, styles.type]}>Typ</Text>
          <Text style={[styles.hCell, styles.suppliers]}>Lev</Text>
          <Text style={[styles.hCell, styles.request]}>Förfrågan</Text>
          <Text style={[styles.hCell, styles.status]}>Status</Text>
        </View>

        <View style={styles.body}>
        {list.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen inköpsplan ännu</Text>
            <Text style={styles.emptyText}>Skapa inköpsplanen från register, eller lägg till en manuell rad.</Text>
          </View>
        ) : null}

        {list.map((r) => {
          const id = safeText(r?.id);
          const expanded = openRowId === id;
          return (
            <View key={id || Math.random()} style={styles.rowWrap}>
              <InkopsplanRow row={r} isExpanded={expanded} onToggleExpand={handleToggleExpand} />
              {expanded ? (
                <View style={styles.expandedWrap}>
                  <InkopsplanRowExpanded row={r} companyId={companyId} projectId={projectId} />
                </View>
              ) : null}
            </View>
          );
        })}
        </View>
      </View>

      <View style={styles.manualWrap}>
        <Text style={styles.manualTitle}>Manuell rad</Text>
        <View style={styles.manualRow}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Nr</Text>
            <TextInput
              value={manualNr}
              onChangeText={setManualNr}
              placeholder="t.ex. 10"
              style={styles.input}
            />
          </View>

          <View style={[styles.inputGroup, { flex: 1 }]}>
            <Text style={styles.label}>Benämning</Text>
            <TextInput
              value={manualName}
              onChangeText={setManualName}
              placeholder="t.ex. Mark"
              style={styles.input}
            />
          </View>

          <View style={[styles.inputGroup, { width: 220 }]}>
            <Text style={styles.label}>Typ</Text>
            <Pressable
              onPress={() => setManualTypeOpen((v) => !v)}
              style={({ hovered, pressed }) => [
                styles.input,
                styles.selectInput,
                (hovered || pressed) && styles.selectHover,
              ]}
            >
              <Text style={styles.selectText} numberOfLines={1}>{manualType}</Text>
              <Text style={styles.selectChevron}>{manualTypeOpen ? '▴' : '▾'}</Text>
            </Pressable>

            {manualTypeOpen ? (
              <View style={styles.selectMenu}>
                {MANUAL_TYPE_OPTIONS.map((opt) => {
                  const active = opt === manualType;
                  return (
                    <Pressable
                      key={opt}
                      onPress={() => {
                        setManualType(opt);
                        setManualTypeOpen(false);
                      }}
                      style={({ hovered, pressed }) => [
                        styles.selectItem,
                        (hovered || pressed) && styles.selectItemHover,
                        active && styles.selectItemActive,
                      ]}
                    >
                      <Text style={[styles.selectItemText, active && styles.selectItemTextActive]} numberOfLines={1}>
                        {opt}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
          </View>

          <View style={styles.manualActions}>
            <SmallButton
              label={savingManual ? 'Sparar…' : '+ Lägg till rad'}
              onPress={handleSaveManual}
              disabled={!canSaveManual || savingManual}
              tone="primary"
            />
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  table: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 0,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F6F7F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hCell: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  chevron: { width: 32 },
  bd: { width: 70 },
  name: { flex: 1 },
  type: { width: 140 },
  suppliers: { width: 60, textAlign: 'right' },
  request: { width: 120 },
  status: { width: 90 },
  body: {
    flex: 1,
    minHeight: 0,
  },
  rowWrap: {
    gap: 0,
  },
  expandedWrap: {
    backgroundColor: '#FAFAFA',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  empty: {
    padding: 16,
    backgroundColor: '#FFFFFF',
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  emptyText: {
    marginTop: 6,
    fontSize: 12,
    color: '#64748B',
  },
  manualWrap: {
    marginTop: 14,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
  },
  manualTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  manualRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 12,
    flexWrap: 'wrap',
  },
  inputGroup: {
    gap: 6,
  },
  label: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  input: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  selectInput: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
  manualActions: {
    paddingBottom: 2,
  },
  smallBtn: {
    height: 40,
    paddingHorizontal: 12,
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
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  smallBtnTextPrimary: {
    color: '#FFFFFF',
  },
});
