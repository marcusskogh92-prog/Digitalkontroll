import { useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { addManualRow } from '../inkopsplanService';
import { useInkopsplanUserPrefs } from '../useInkopsplanUserPrefs';
import InkopsplanColumnsModal from './InkopsplanColumnsModal';
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

  const COLUMN_DEFS = useMemo(() => ([
    { id: 'bd', label: 'BD' },
    { id: 'name', label: 'Benämning' },
    { id: 'type', label: 'Typ' },
    { id: 'suppliers', label: 'Lev' },
    { id: 'request', label: 'Förfrågan' },
    { id: 'status', label: 'Status' },
  ]), []);

  const { prefs, setPrefs, loadingPrefs } = useInkopsplanUserPrefs({ companyId, projectId });
  const [columnsModalOpen, setColumnsModalOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

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

  const visibleColumns = useMemo(() => {
    const listIds = Array.isArray(prefs?.visibleColumns) ? prefs.visibleColumns : [];
    const out = {};
    (COLUMN_DEFS || []).forEach((c) => { out[c.id] = listIds.includes(c.id); });
    if (!Object.values(out).some(Boolean)) out.name = true;
    return out;
  }, [prefs?.visibleColumns, COLUMN_DEFS]);

  const activeTypes = useMemo(() => {
    const t = Array.isArray(prefs?.typeFilter) ? prefs.typeFilter : [];
    return t.length ? t : ['building_part', 'account', 'category', 'manual'];
  }, [prefs?.typeFilter]);

  const isTypeOn = (type) => activeTypes.includes(String(type || '').trim());

  const toggleType = (type) => {
    const t = String(type || '').trim();
    if (!t) return;
    const all = ['building_part', 'account', 'category', 'manual'];
    const current = Array.isArray(prefs?.typeFilter) ? prefs.typeFilter : all;
    const has = current.includes(t);
    const next = has ? current.filter((x) => x !== t) : [...current, t];
    setPrefs({ typeFilter: next.length ? next : all });
  };

  const SORT_OPTIONS = useMemo(() => ([
    { sortKey: 'type', sortDir: 'asc', label: 'Typ (Byggdel→Konto→Kategori)' },
    { sortKey: 'type', sortDir: 'desc', label: 'Typ (Kategori→Konto→Byggdel)' },
    { sortKey: 'nr', sortDir: 'asc', label: 'BD stigande' },
    { sortKey: 'nr', sortDir: 'desc', label: 'BD fallande' },
    { sortKey: 'name', sortDir: 'asc', label: 'Benämning A→Ö' },
    { sortKey: 'name', sortDir: 'desc', label: 'Benämning Ö→A' },
  ]), []);

  const sortLabel = useMemo(() => {
    const key = safeText(prefs?.sortKey);
    const dir = safeText(prefs?.sortDir);
    const hit = SORT_OPTIONS.find((o) => o.sortKey === key && o.sortDir === dir);
    return hit?.label || 'Sortera';
  }, [prefs?.sortKey, prefs?.sortDir, SORT_OPTIONS]);

  const filteredSorted = useMemo(() => {
    const base = list.filter((r) => {
      const t = safeText(r?.type);
      return !t || activeTypes.includes(t);
    });

    const sortKey = safeText(prefs?.sortKey) || 'type';
    const sortDir = safeText(prefs?.sortDir) === 'desc' ? 'desc' : 'asc';
    const dirMul = sortDir === 'desc' ? -1 : 1;

    const typeOrder = (t) => {
      const v = safeText(t);
      if (v === 'building_part') return 1;
      if (v === 'account') return 2;
      if (v === 'category') return 3;
      if (v === 'manual') return 4;
      return 99;
    };

    const parseNr = (r) => {
      const nn = r?.nrNumeric;
      if (Number.isFinite(nn)) return nn;
      const s = safeText(r?.nr);
      const n = Number.parseInt(s, 10);
      return Number.isFinite(n) ? n : null;
    };

    const cmp = (a, b) => {
      if (sortKey === 'type') {
        const d = typeOrder(a?.type) - typeOrder(b?.type);
        if (d !== 0) return d * dirMul;
        const an = safeText(a?.name).localeCompare(safeText(b?.name), 'sv');
        if (an !== 0) return an;
        return safeText(a?.id).localeCompare(safeText(b?.id), 'sv');
      }
      if (sortKey === 'nr') {
        const an = parseNr(a);
        const bn = parseNr(b);
        if (an != null && bn != null && an !== bn) return (an - bn) * dirMul;
        if (an != null && bn == null) return -1 * dirMul;
        if (an == null && bn != null) return 1 * dirMul;
        const as = safeText(a?.nr).localeCompare(safeText(b?.nr), 'sv');
        if (as !== 0) return as * dirMul;
        return safeText(a?.name).localeCompare(safeText(b?.name), 'sv') * dirMul;
      }
      const n = safeText(a?.name).localeCompare(safeText(b?.name), 'sv');
      if (n !== 0) return n * dirMul;
      return safeText(a?.id).localeCompare(safeText(b?.id), 'sv');
    };

    return base.slice().sort(cmp);
  }, [list, activeTypes, prefs?.sortKey, prefs?.sortDir]);

  return (
    <View style={styles.wrap}>
      <View style={styles.controlsRow}>
        <View style={styles.typeChips}>
          <Pressable
            onPress={() => toggleType('building_part')}
            style={({ hovered, pressed }) => [styles.chip, isTypeOn('building_part') && styles.chipOn, (hovered || pressed) && styles.chipHover]}
          >
            <Text style={[styles.chipText, isTypeOn('building_part') && styles.chipTextOn]}>Byggdelar</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleType('account')}
            style={({ hovered, pressed }) => [styles.chip, isTypeOn('account') && styles.chipOn, (hovered || pressed) && styles.chipHover]}
          >
            <Text style={[styles.chipText, isTypeOn('account') && styles.chipTextOn]}>Kontoplan</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleType('category')}
            style={({ hovered, pressed }) => [styles.chip, isTypeOn('category') && styles.chipOn, (hovered || pressed) && styles.chipHover]}
          >
            <Text style={[styles.chipText, isTypeOn('category') && styles.chipTextOn]}>Kategorier</Text>
          </Pressable>
          <Pressable
            onPress={() => toggleType('manual')}
            style={({ hovered, pressed }) => [styles.chip, isTypeOn('manual') && styles.chipOn, (hovered || pressed) && styles.chipHover]}
          >
            <Text style={[styles.chipText, isTypeOn('manual') && styles.chipTextOn]}>Manuell</Text>
          </Pressable>
        </View>

        <View style={styles.rightControls}>
          <Pressable
            onPress={() => setSortOpen((v) => !v)}
            style={({ hovered, pressed }) => [styles.smallAction, (hovered || pressed) && styles.smallActionHover]}
            disabled={loadingPrefs}
          >
            <Text style={styles.smallActionText} numberOfLines={1}>{sortLabel}</Text>
            <Text style={styles.smallActionChevron}>{sortOpen ? '▴' : '▾'}</Text>
          </Pressable>
          <Pressable
            onPress={() => setColumnsModalOpen(true)}
            style={({ hovered, pressed }) => [styles.smallAction, (hovered || pressed) && styles.smallActionHover]}
            disabled={loadingPrefs}
          >
            <Text style={styles.smallActionText} numberOfLines={1}>Kolumner</Text>
          </Pressable>
        </View>
      </View>

      {sortOpen ? (
        <View style={styles.sortMenu}>
          {SORT_OPTIONS.map((o) => {
            const active = o.sortKey === safeText(prefs?.sortKey) && o.sortDir === safeText(prefs?.sortDir);
            return (
              <Pressable
                key={`${o.sortKey}:${o.sortDir}`}
                onPress={() => {
                  setPrefs({ sortKey: o.sortKey, sortDir: o.sortDir });
                  setSortOpen(false);
                }}
                style={({ hovered, pressed }) => [
                  styles.sortItem,
                  (hovered || pressed) && styles.sortItemHover,
                  active && styles.sortItemActive,
                ]}
              >
                <Text style={[styles.sortItemText, active && styles.sortItemTextActive]} numberOfLines={1}>
                  {o.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      ) : null}

      <View style={styles.table}>
        <View style={styles.headerRow}>
          <Text style={[styles.hCell, styles.chevron]}>{' '}</Text>
          {visibleColumns.bd ? <Text style={[styles.hCell, styles.bd]}>BD</Text> : null}
          {visibleColumns.name ? <Text style={[styles.hCell, styles.name]}>Benämning</Text> : null}
          {visibleColumns.type ? <Text style={[styles.hCell, styles.type]}>Typ</Text> : null}
          {visibleColumns.suppliers ? <Text style={[styles.hCell, styles.suppliers]}>Lev</Text> : null}
          {visibleColumns.request ? <Text style={[styles.hCell, styles.request]}>Förfrågan</Text> : null}
          {visibleColumns.status ? <Text style={[styles.hCell, styles.status]}>Status</Text> : null}
        </View>

        <View style={styles.body}>
        {filteredSorted.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyTitle}>Ingen inköpsplan ännu</Text>
            <Text style={styles.emptyText}>Skapa inköpsplanen från register, eller lägg till en manuell rad.</Text>
          </View>
        ) : null}

        {filteredSorted.map((r) => {
          const id = safeText(r?.id);
          const expanded = openRowId === id;
          return (
            <View key={id || Math.random()} style={styles.rowWrap}>
              <InkopsplanRow row={r} isExpanded={expanded} onToggleExpand={handleToggleExpand} visibleColumns={visibleColumns} />
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

      <InkopsplanColumnsModal
        visible={columnsModalOpen}
        onClose={() => setColumnsModalOpen(false)}
        columns={COLUMN_DEFS}
        selectedColumnIds={Array.isArray(prefs?.visibleColumns) ? prefs.visibleColumns : []}
        onSave={(ids) => {
          setPrefs({ visibleColumns: ids });
          setColumnsModalOpen(false);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    minHeight: 0,
  },
  controlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingBottom: 10,
    flexWrap: 'wrap',
  },
  typeChips: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  chip: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  chipOn: {
    borderColor: '#0F172A',
    backgroundColor: '#0F172A',
  },
  chipHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  chipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  chipTextOn: {
    color: '#FFFFFF',
  },
  rightControls: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  smallAction: {
    height: 24,
    paddingHorizontal: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  smallActionHover: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D1D5DB',
  },
  smallActionText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  smallActionChevron: {
    fontSize: 10,
    fontWeight: '900',
    color: '#64748B',
  },
  sortMenu: {
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    marginBottom: 10,
  },
  sortItem: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  sortItemHover: {
    backgroundColor: '#F8FAFC',
  },
  sortItemActive: {
    backgroundColor: '#0F172A',
  },
  sortItemText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0F172A',
  },
  sortItemTextActive: {
    color: '#FFFFFF',
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
    paddingVertical: 4,
    backgroundColor: '#F6F7F9',
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  hCell: {
    fontSize: 11,
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
    marginTop: 4,
    fontSize: 11,
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
