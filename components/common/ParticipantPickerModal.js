import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import { formatMobileDisplay } from '../../utils/formatPhone';

const RESIZE_HANDLE_WIDTH = 6;
const DEFAULT_COLUMN_WIDTHS = [200, 150, 220, 260, 86]; // Namn, Företag, E-post, Telefon, Källa
const MIN_COLUMN_WIDTHS = [80, 80, 100, 90, 60];
const CHARS_TO_WIDTH = 7.5;
const CELL_PADDING = 24;

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function matchesCandidate(candidate, q) {
  if (!q) return true;
  const hay = [candidate?.name, candidate?.company, candidate?.email, candidate?.phone, candidate?.workPhone]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
}

function getPhoneText(c) {
  const mob = c?.phone ? formatMobileDisplay(c.phone) : '';
  const work = c?.workPhone ? String(c.workPhone).trim() : '';
  if (mob && work) return `Mobil: ${mob} / Arbete: ${work}`;
  if (mob) return `Mobil: ${mob}`;
  if (work) return `Arbete: ${work}`;
  return '—';
}

function getCellText(candidate, colIndex) {
  if (colIndex === 0) return String(candidate?.name || '—');
  if (colIndex === 1) return String(candidate?.company || '—');
  if (colIndex === 2) return String(candidate?.email || '—');
  if (colIndex === 3) return getPhoneText(candidate);
  if (colIndex === 4) return sourceLabelFromCandidate(candidate);
  return '—';
}

function calcAutoFitWidth(headerLabel, cellTexts) {
  const headerW = String(headerLabel || '').length * CHARS_TO_WIDTH + CELL_PADDING + 24;
  let maxCellW = 0;
  for (const txt of cellTexts) {
    const w = String(txt || '').length * CHARS_TO_WIDTH + CELL_PADDING;
    if (w > maxCellW) maxCellW = w;
  }
  return Math.max(MIN_COLUMN_WIDTHS[0], Math.min(Math.max(headerW, maxCellW), 500));
}

function normalizeSortValue(v) {
  return String(v || '').trim().toLowerCase();
}

function sourceLabelFromCandidate(c) {
  return String(c?.source || '').trim() === 'internal' ? 'Intern' : 'Kontakt';
}

function getSortValue(candidate, key) {
  const k = String(key || '').trim();
  if (k === 'name') return normalizeSortValue(candidate?.name);
  if (k === 'company') return normalizeSortValue(candidate?.company);
  if (k === 'email') return normalizeSortValue(candidate?.email);
  if (k === 'phone') return normalizeSortValue(candidate?.phone);
  if (k === 'source') return normalizeSortValue(sourceLabelFromCandidate(candidate));
  return normalizeSortValue(candidate?.name);
}

export default function ParticipantPickerModal({
  requestClose,

  title = 'Lägg till deltagare',
  subtitle = 'Sök i interna användare och kontaktregister',

  helpTextEmptySelection = 'Välj en eller flera personer i listan ovan.',
  footerTitle = 'Deltagare',

  allowInternal = true,
  allowExternal = true,
  defaultSource = 'internal',
  defaultShowInternal,
  defaultShowExternal,

  loadingInternal = false,
  loadingExternal = false,
  errorInternal = '',
  errorExternal = '',

  internalCandidates = [],
  externalCandidates = [],

  existingRowKeys,

  onRowLockedPress,
  lockedRowHelpText,

  initialSelectedEmails,

  onToggleExternal,

  showAllContactsCheckbox = false,
  showAllContacts = false,
  onShowAllContactsChange,

  onConfirm,
  confirmLabel = 'Lägg till',
}) {
  const COLORS = {
    blue: '#1976D2',
    blueHover: '#155FB5',
    blueBg: '#DBEAFE',
    blueBgHover: '#BFDBFE',
    blueBgSoftHover: '#EFF6FF',
    neutral: '#6B7280',
    border: '#E6E8EC',
    bgMuted: '#F8FAFC',
    text: '#111',
    textMuted: '#475569',
    textSubtle: '#64748b',
    inputBorder: '#E2E8F0',
    tableBorder: '#EEF0F3',
  };

  const confirmDeselect = async (candidate) => {
    const name = String(candidate?.name || '').trim() || 'denna person';
    const message = `Vill du ta bort ${name} från urvalet?`;
    if (Platform.OS === 'web') return window.confirm(message);
    return await new Promise((resolve) => {
      Alert.alert('Ta bort från urvalet?', message, [
        { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const [search, setSearch] = React.useState('');
  const [sortKey, setSortKey] = React.useState(null); // null => default sort (name A–Ö)
  const [sortDir, setSortDir] = React.useState('none'); // 'none' | 'asc' | 'desc'

  const [showInternal, setShowInternal] = React.useState(true);
  const [showExternal, setShowExternal] = React.useState(true);

  const [selectedByKey, setSelectedByKey] = React.useState(() => ({}));

  const [columnWidths, setColumnWidths] = useState(DEFAULT_COLUMN_WIDTHS);
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });
  const lastClickRef = useRef({ column: null, time: 0 });
  const filteredRef = useRef([]);

  const headerLabels = ['Namn', 'Företag', 'E-post', 'Telefon', 'Källa'];

  const autoFitColumn = useCallback((colIndex) => {
    const list = filteredRef.current;
    const cellTexts = list.slice(0, 250).map((c) => getCellText(c, colIndex));
    const newW = calcAutoFitWidth(headerLabels[colIndex], cellTexts);
    setColumnWidths((prev) => {
      const next = [...prev];
      next[colIndex] = newW;
      return next;
    });
  }, []);

  const startResize = useCallback((columnIndex, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const now = Date.now();
    const last = lastClickRef.current;
    if (last.column === columnIndex && now - last.time < 400) {
      lastClickRef.current = { column: null, time: 0 };
      autoFitColumn(columnIndex);
      return;
    }
    lastClickRef.current = { column: columnIndex, time: now };
    if (typeof document !== 'undefined') document.body.style.cursor = 'col-resize';
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = {
      column: columnIndex,
      startX: clientX,
      startWidth: columnWidths[columnIndex],
    };
  }, [columnWidths, autoFitColumn]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const minW = MIN_COLUMN_WIDTHS[column] ?? 60;
      const newWidth = Math.max(minW, startWidth + delta);
      setColumnWidths((prev) => {
        const next = [...prev];
        next[column] = newWidth;
        return next;
      });
      resizeRef.current = { column, startX: clientX, startWidth: newWidth };
    };
    const onUp = () => {
      if (resizeRef.current.column != null && typeof document !== 'undefined') {
        document.body.style.cursor = '';
      }
      resizeRef.current = { column: null, startX: 0, startWidth: 0 };
    };
    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestClose?.();
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.removeEventListener('keydown', onKeyDown);
      if (typeof document !== 'undefined') document.body.style.cursor = '';
    };
  }, [requestClose]);

  const tableGap = 10;
  const totalTableWidth =
    columnWidths.reduce((a, b) => a + b, 0) +
    (Platform.OS === 'web' ? 4 * RESIZE_HANDLE_WIDTH + 8 * tableGap : 4 * tableGap);
  const col = (i) => ({ width: columnWidths[i], minWidth: columnWidths[i], flexShrink: 0 });

  React.useEffect(() => {
    setSelectedByKey((prev) => {
      const p = prev && typeof prev === 'object' ? prev : {};
      const next = {};
      Object.keys(p).forEach((k) => {
        const c = p[k];
        const src = String(c?.source || '').trim();
        if (src === 'internal' && showInternal) next[k] = c;
        if (src === 'contact' && showExternal) next[k] = c;
      });
      return next;
    });
  }, [showInternal, showExternal]);

  React.useEffect(() => {
    const explicitInternal = typeof defaultShowInternal === 'boolean' ? defaultShowInternal : undefined;
    const explicitExternal = typeof defaultShowExternal === 'boolean' ? defaultShowExternal : undefined;
    const d = String(defaultSource || '').trim();
    const fallbackInternal = d === 'contact' || d === 'external' ? false : true;
    const fallbackExternal = d === 'contact' || d === 'external' ? true : false;

    setShowInternal(allowInternal ? (explicitInternal ?? fallbackInternal) : false);
    setShowExternal(allowExternal ? (explicitExternal ?? fallbackExternal) : false);
  }, [defaultSource, defaultShowInternal, defaultShowExternal, allowInternal, allowExternal]);

  React.useEffect(() => {
    if (!allowExternal) return;
    if (!showExternal) return;
    onToggleExternal?.(true);
  }, [allowExternal, showExternal, onToggleExternal]);

  React.useEffect(() => {
    if (!initialSelectedEmails) return;

    const set = new Set(
      (Array.isArray(initialSelectedEmails) ? initialSelectedEmails : [])
        .map((e) => String(e || '').trim().toLowerCase())
        .filter(Boolean)
    );
    if (set.size === 0) return;

    const buildKey = (c) => `${String(c?.source || '').trim()}:${String(c?.refId || '').trim()}`;

    const base = [
      ...(Array.isArray(internalCandidates) ? internalCandidates : []),
      ...(Array.isArray(externalCandidates) ? externalCandidates : []),
    ];

    const initialMap = {};
    for (const c of base) {
      const email = String(c?.email || '').trim().toLowerCase();
      if (!email) continue;
      if (!set.has(email)) continue;
      const k = buildKey(c);
      if (!k || k === ':') continue;
      initialMap[k] = c;
    }

    setSelectedByKey(initialMap);
  }, [initialSelectedEmails, internalCandidates, externalCandidates]);

  const toggleSort = (nextKey) => {
    const k = String(nextKey || '').trim();
    if (!k) return;

    setSortKey((prevKey) => {
      const prev = String(prevKey || '').trim();
      if (prev !== k) {
        setSortDir('asc');
        return k;
      }

      setSortDir((prevDir) => {
        const d = String(prevDir || 'none');
        if (d === 'none') return 'asc';
        if (d === 'asc') return 'desc';
        return 'none';
      });

      return k;
    });
  };

  React.useEffect(() => {
    if (sortDir !== 'none') return;
    setSortKey(null);
  }, [sortDir]);

  const filtered = React.useMemo(() => {
    const q = normalizeSearch(search);
    const keys = existingRowKeys && typeof existingRowKeys === 'object' ? existingRowKeys : null;

    const base = [
      ...(showInternal ? (Array.isArray(internalCandidates) ? internalCandidates : []) : []),
      ...(showExternal ? (Array.isArray(externalCandidates) ? externalCandidates : []) : []),
    ];

    return base
      .filter((c) => matchesCandidate(c, q))
      .map((c) => {
        const key = `${String(c?.source || '')}:${String(c?.refId || '')}`;
        const already = keys ? !!keys[key] : false;
        return { ...c, _key: key, _already: already };
      })
      .sort((a, b) => {
        if (a._already !== b._already) return a._already ? 1 : -1;
        const effectiveKey = sortDir === 'none' ? 'name' : sortKey;
        const va = getSortValue(a, effectiveKey);
        const vb = getSortValue(b, effectiveKey);
        const cmp = String(va || '').localeCompare(String(vb || ''), 'sv');
        if (cmp !== 0) return sortDir === 'desc' ? -cmp : cmp;
        return String(a?.name || '').localeCompare(String(b?.name || ''), 'sv');
      });
  }, [showInternal, showExternal, internalCandidates, externalCandidates, search, existingRowKeys, sortKey, sortDir]);

  filteredRef.current = filtered;

  const autoFitDoneRef = useRef(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (filtered.length === 0) return;
    if (autoFitDoneRef.current) return;
    autoFitDoneRef.current = true;
    const items = filtered.slice(0, 250);
    setColumnWidths((prev) => {
      const next = [...prev];
      for (let i = 0; i < headerLabels.length; i++) {
        const cellTexts = items.map((c) => getCellText(c, i));
        next[i] = calcAutoFitWidth(headerLabels[i], cellTexts);
      }
      return next;
    });
  }, [filtered]);

  const selectedList = React.useMemo(() => {
    const map = selectedByKey && typeof selectedByKey === 'object' ? selectedByKey : {};
    return Object.keys(map)
      .map((k) => map[k])
      .filter(Boolean);
  }, [selectedByKey]);

  const selectedCount = selectedList.length;
  const canConfirm = selectedCount > 0;

  const activeError = [showInternal ? errorInternal : '', showExternal ? errorExternal : '']
    .filter(Boolean)
    .join('\n');

  const activeLoading = (showInternal && loadingInternal) || (showExternal && loadingExternal);
  const noSourceSelected = !showInternal && !showExternal;
  const blockingLoading = activeLoading && filtered.length === 0 && !noSourceSelected;

  const getSortIndicator = (key) => {
    const k = String(key || '').trim();
    if (sortDir !== 'none' && String(sortKey || '').trim() === k) return sortDir === 'asc' ? '↑' : '↓';
    return '↕';
  };

  const defaultLockedInfo = (candidate) => {
    const name = String(candidate?.name || '').trim() || 'Personen';
    const msg = lockedRowHelpText
      ? String(lockedRowHelpText).replace(/\{name\}/g, name)
      : `${name} är redan tillagd.`;

    if (Platform.OS === 'web') {
      window.alert(msg);
      return;
    }
    Alert.alert('Redan tillagd', msg, [{ text: 'OK' }]);
  };

  const handleConfirm = async () => {
    if (!canConfirm) return;
    await onConfirm?.(selectedList);
    requestClose?.();
  };

  return (
    <View style={Platform.OS === 'web' ? styles.webOuter : null}>
      <View style={[styles.card, styles.cardFixed]}>
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
            <View style={styles.headerIconWrap}>
              <Ionicons name="person-add-outline" size={D.headerNeutralCompactIconPx || 14} color="#fff" />
            </View>
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={styles.title} numberOfLines={1}>
                {title}
                {subtitle ? ` — ${subtitle}` : ''}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={requestClose}
            title={Platform.OS === 'web' ? 'Stäng' : undefined}
            style={({ hovered, pressed }) => [
              styles.headerCloseBtn,
              (hovered || pressed) ? styles.headerCloseBtnHover : null,
              Platform.OS === 'web' ? { cursor: 'pointer' } : null,
            ]}
          >
            <Ionicons name="close" size={D.headerNeutralCompactCloseIconPx || 18} color="#fff" />
          </Pressable>
        </View>

        <View style={styles.body}>
          {activeError ? (
            <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
              <Text style={{ fontSize: 13, color: '#C62828' }}>{activeError}</Text>
            </View>
          ) : null}

          <View style={styles.searchRow}>
            <Ionicons name="search-outline" size={16} color={COLORS.neutral} />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Sök namn, företag, e-post, telefon"
              placeholderTextColor="#94A3B8"
              style={[
                styles.input,
                { flex: 1, borderColor: COLORS.inputBorder, color: COLORS.text },
                Platform.OS === 'web' ? { outline: 'none' } : null,
              ]}
              autoCapitalize="none"
            />
          </View>

          {(allowInternal || allowExternal) ? (
            <View style={styles.filterRow}>
              <Pressable
                disabled={!allowInternal}
                onPress={() => setShowInternal((v) => !v)}
                style={({ hovered, pressed }) => [
                  styles.filterPill,
                  showInternal ? styles.filterPillActive : null,
                  (hovered || pressed) ? styles.filterPillHot : null,
                  !allowInternal ? { opacity: 0.45 } : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={[styles.filterPillText, showInternal ? styles.filterPillTextActive : null]}>Interna användare</Text>
              </Pressable>

              <Pressable
                disabled={!allowExternal}
                onPress={() => {
                  setShowExternal((v) => {
                    const next = !v;
                    if (next) onToggleExternal?.(true);
                    return next;
                  });
                }}
                style={({ hovered, pressed }) => [
                  styles.filterPill,
                  showExternal ? styles.filterPillActive : null,
                  (hovered || pressed) ? styles.filterPillHot : null,
                  !allowExternal ? { opacity: 0.45 } : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={[styles.filterPillText, showExternal ? styles.filterPillTextActive : null]}>Externa kontakter</Text>
              </Pressable>
            </View>
          ) : null}

          {showAllContactsCheckbox && allowExternal && showExternal ? (
            <Pressable
              onPress={() => onShowAllContactsChange?.(!showAllContacts)}
              style={[
                { flexDirection: 'row', alignItems: 'center', marginBottom: 10, marginTop: 4 },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Ionicons
                name={!showAllContacts ? 'checkbox' : 'square-outline'}
                size={20}
                color={!showAllContacts ? COLORS.blue : COLORS.textSubtle}
                style={{ marginRight: 8 }}
              />
              <Text style={{ fontSize: 14, color: COLORS.text }}>Visa endast deltagare från valt företag</Text>
            </Pressable>
          ) : null}

          <View style={[styles.tableWrap, Platform.OS === 'web' ? { minWidth: totalTableWidth, overflowX: 'auto' } : null]}>
            <View style={[styles.tableHeader, styles.tableHeaderRow, { backgroundColor: COLORS.bgMuted, borderBottomColor: COLORS.tableBorder, width: Platform.OS === 'web' ? totalTableWidth : undefined }]}>
              <Pressable
                onPress={() => toggleSort('name')}
                style={({ hovered, pressed }) => [
                  styles.thPressable,
                  col(0),
                  (hovered || pressed) ? styles.thPressableHot : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={styles.th} numberOfLines={1}>
                  Namn <Text style={styles.sortIcon}>{getSortIndicator('name')}</Text>
                </Text>
              </Pressable>
              {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize(0, e)}><View style={styles.resizeHandleLine} /></View>}

              <Pressable
                onPress={() => toggleSort('company')}
                style={({ hovered, pressed }) => [
                  styles.thPressable,
                  col(1),
                  (hovered || pressed) ? styles.thPressableHot : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={styles.th} numberOfLines={1}>
                  Företag <Text style={styles.sortIcon}>{getSortIndicator('company')}</Text>
                </Text>
              </Pressable>
              {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize(1, e)}><View style={styles.resizeHandleLine} /></View>}

              <Pressable
                onPress={() => toggleSort('email')}
                style={({ hovered, pressed }) => [
                  styles.thPressable,
                  col(2),
                  (hovered || pressed) ? styles.thPressableHot : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={styles.th} numberOfLines={1}>
                  E-post <Text style={styles.sortIcon}>{getSortIndicator('email')}</Text>
                </Text>
              </Pressable>
              {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize(2, e)}><View style={styles.resizeHandleLine} /></View>}

              <Pressable
                onPress={() => toggleSort('phone')}
                style={({ hovered, pressed }) => [
                  styles.thPressable,
                  col(3),
                  (hovered || pressed) ? styles.thPressableHot : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={styles.th} numberOfLines={1}>
                  Telefon <Text style={styles.sortIcon}>{getSortIndicator('phone')}</Text>
                </Text>
              </Pressable>
              {Platform.OS === 'web' && <View style={styles.resizeHandle} onMouseDown={(e) => startResize(3, e)}><View style={styles.resizeHandleLine} /></View>}

              <Pressable
                onPress={() => toggleSort('source')}
                style={({ hovered, pressed }) => [
                  styles.thPressable,
                  col(4),
                  { alignItems: 'flex-end' },
                  (hovered || pressed) ? styles.thPressableHot : null,
                  Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                ]}
              >
                <Text style={[styles.th, { textAlign: 'right' }]} numberOfLines={1}>
                  Källa <Text style={styles.sortIcon}>{getSortIndicator('source')}</Text>
                </Text>
              </Pressable>
            </View>

            {blockingLoading ? (
              <View style={{ padding: 12 }}>
                <Text style={{ color: '#666', fontSize: 13 }}>Laddar…</Text>
              </View>
            ) : noSourceSelected ? (
              <View style={{ padding: 12 }}>
                <Text style={{ color: '#666', fontSize: 13 }}>Aktivera minst en källa.</Text>
              </View>
            ) : filtered.length === 0 ? (
              <View style={{ padding: 12 }}>
                <Text style={{ color: '#666', fontSize: 13 }}>Inga träffar.</Text>
              </View>
            ) : (
              <ScrollView
                style={[
                  { flex: 1 },
                  Platform.OS === 'web' ? { overflowY: 'scroll' } : null,
                ]}
                keyboardShouldPersistTaps="handled"
              >
                {filtered.slice(0, 250).map((c) => {
                  const isSelected = !!(c && c._key && selectedByKey && selectedByKey[c._key]);
                  const sourceLabel = sourceLabelFromCandidate(c);
                  const rowDisabled = !!c._already;
                  const isLocked = rowDisabled;

                  return (
                    <Pressable
                      key={c._key}
                      disabled={false}
                      accessibilityRole="button"
                      title={Platform.OS === 'web' && rowDisabled ? 'Redan tillagd (låst) – klicka för info' : undefined}
                      onPress={async () => {
                        if (rowDisabled) {
                          (onRowLockedPress || defaultLockedInfo)(c);
                          return;
                        }
                        if (isSelected) {
                          const ok = await confirmDeselect(c);
                          if (!ok) return;
                        }
                        setSelectedByKey((prev) => {
                          const p = prev && typeof prev === 'object' ? prev : {};
                          const next = { ...p };
                          if (next[c._key]) delete next[c._key];
                          else next[c._key] = c;
                          return next;
                        });
                      }}
                      style={({ hovered, pressed }) => {
                        const hot = !!(hovered || pressed);
                        const bg = isLocked
                          ? (hot ? COLORS.blueBgHover : COLORS.blueBg)
                          : isSelected
                            ? (hot ? COLORS.blueBgHover : COLORS.blueBg)
                            : (hot ? COLORS.blueBgSoftHover : '#fff');
                        return [
                          styles.row,
                          {
                            borderBottomColor: COLORS.tableBorder,
                            backgroundColor: bg,
                            opacity: 1,
                            borderLeftWidth: (isSelected || isLocked) ? 4 : 0,
                            borderLeftColor: isLocked ? '#93C5FD' : (isSelected ? COLORS.blue : 'transparent'),
                          },
                          Platform.OS === 'web' ? { width: totalTableWidth, cursor: 'pointer' } : null,
                        ];
                      }}
                    >
                      <View style={[col(0), { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 0 }]}>
                        {isLocked ? (
                          <Ionicons name="lock-closed" size={16} color={COLORS.blue} />
                        ) : isSelected ? (
                          <Ionicons name="checkmark-circle" size={16} color={COLORS.blue} />
                        ) : null}
                        <Text
                          style={[
                            styles.td,
                            { flex: 1, minWidth: 0, color: COLORS.text, fontWeight: isSelected ? '700' : '400' },
                          ]}
                          numberOfLines={1}
                        >
                          {String(c?.name || '—')}
                        </Text>
                      </View>
                      {Platform.OS === 'web' && <View style={{ width: RESIZE_HANDLE_WIDTH }} />}
                      <Text style={[styles.td, col(1), { color: COLORS.text }]} numberOfLines={1}>
                        {String(c?.company || '—')}
                      </Text>
                      {Platform.OS === 'web' && <View style={{ width: RESIZE_HANDLE_WIDTH }} />}
                      <Text style={[styles.td, col(2), { color: COLORS.text }]} numberOfLines={1}>
                        {String(c?.email || '—')}
                      </Text>
                      {Platform.OS === 'web' && <View style={{ width: RESIZE_HANDLE_WIDTH }} />}
                      <Text style={[styles.td, col(3)]} numberOfLines={1}>
                        {(() => {
                          const mob = c?.phone ? formatMobileDisplay(c.phone) : '';
                          const work = c?.workPhone ? String(c.workPhone).trim() : '';
                          if (!mob && !work) return <Text style={{ color: COLORS.text }}>—</Text>;
                          return (
                            <>
                              {mob ? <><Text style={{ color: COLORS.text }}>Mobil: </Text><Text style={{ color: '#1976D2' }}>{mob}</Text></> : null}
                              {mob && work ? <Text style={{ color: COLORS.text }}> / </Text> : null}
                              {work ? <><Text style={{ color: COLORS.text }}>Arbete: </Text><Text style={{ color: '#1976D2' }}>{work}</Text></> : null}
                            </>
                          );
                        })()}
                      </Text>
                      {Platform.OS === 'web' && <View style={{ width: RESIZE_HANDLE_WIDTH }} />}
                      <Text style={[styles.td, col(4), { fontSize: 12, color: COLORS.textMuted, textAlign: 'right' }]} numberOfLines={1}>
                        {sourceLabel}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>

        <View style={[styles.footer, { borderTopColor: COLORS.tableBorder }]}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={[styles.sectionTitle, { color: COLORS.text }]}>{footerTitle}</Text>
            {selectedCount === 0 ? (
              <Text style={[styles.helperText, { color: COLORS.textSubtle }]}>{helpTextEmptySelection}</Text>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                <Text style={[styles.td, { color: COLORS.text, flex: 1, minWidth: 0 }]} numberOfLines={1}>
                  {selectedList
                    .slice(0, 3)
                    .map((p) => String(p?.name || '—').trim())
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
                {selectedCount > 3 ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="people-outline" size={16} color={COLORS.neutral} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: COLORS.neutral }}>{selectedCount} valda</Text>
                  </View>
                ) : null}
              </View>
            )}
          </View>

          <Pressable
            onPress={handleConfirm}
            disabled={!canConfirm}
            style={({ hovered, pressed }) => {
              const disabled = !canConfirm;
              const bg = disabled ? '#9CA3AF' : (hovered || pressed ? '#3d4d5f' : (D.buttonPrimaryBg ?? '#2D3A4B'));
              return [
                styles.primaryButton,
                { backgroundColor: bg },
                Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } : null,
              ];
            }}
          >
            <Ionicons name="add-outline" size={16} color={D.buttonPrimaryColor ?? '#fff'} />
            <Text style={styles.primaryButtonLabel}>
              {selectedCount > 0 ? `${confirmLabel} (${selectedCount})` : confirmLabel}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  webOuter: {
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: D.radius ?? 8,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow ?? '0 10px 30px rgba(0,0,0,0.08)' } : { ...D.shadowNative, elevation: 8 }),
  },
  cardFixed: {
    width: Platform.OS === 'web' ? 980 : '100%',
    height: Platform.OS === 'web' ? 720 : '90%',
    maxWidth: Platform.OS === 'web' ? '92vw' : '100%',
    maxHeight: Platform.OS === 'web' ? '92vh' : '92%',
  },
  header: {
    ...D.headerNeutral,
    ...D.headerNeutralCompact,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCloseBtn: {
    ...D.closeBtn,
  },
  headerCloseBtnHover: {
    backgroundColor: D.headerNeutralCloseBtnHover,
  },
  title: {
    fontSize: D.headerNeutralCompactTitleFontSize ?? 12,
    fontWeight: D.headerNeutralCompactTitleFontWeight ?? '400',
    lineHeight: D.headerNeutralCompactTitleLineHeight ?? 16,
    color: D.headerNeutralTextColor ?? '#fff',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  body: {
    flex: 1,
    padding: 18,
    gap: 12,
    minHeight: 0,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tableWrap: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#EEF0F3',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  footer: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderTopWidth: 1,
    backgroundColor: '#fff',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '400',
    backgroundColor: '#fff',
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterPill: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  filterPillHot: {
    backgroundColor: '#F8FAFC',
  },
  filterPillActive: {
    borderColor: '#BFDBFE',
    backgroundColor: '#EFF6FF',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#1976D2',
  },
  tableHeader: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    gap: 10,
  },
  tableHeaderRow: {
    alignItems: 'center',
  },
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' } : {}),
  },
  resizeHandleLine: {
    position: 'absolute',
    left: Math.floor(RESIZE_HANDLE_WIDTH / 2) - 1,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  thPressable: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
    borderRadius: 6,
  },
  thPressableHot: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  th: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },
  sortIcon: {
    fontSize: 12,
    fontWeight: '700',
    color: '#6B7280',
  },
  row: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  td: {
    fontSize: 13,
    fontWeight: '400',
    color: '#111',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    fontWeight: '400',
  },
  secondaryButton: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  secondaryButtonHot: {
    backgroundColor: '#F8FAFC',
  },
  secondaryButtonLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  primaryButton: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonLabel: {
    color: D.buttonPrimaryColor ?? '#fff',
    fontSize: 12,
    fontWeight: D.buttonPrimaryFontWeight ?? '600',
  },
});
