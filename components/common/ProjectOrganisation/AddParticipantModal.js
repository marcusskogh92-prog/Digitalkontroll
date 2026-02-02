import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { fetchCompanyContacts, fetchCompanyMembers } from '../../firebase';
import { useSystemModal } from '../Modals/SystemModalProvider';

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function matchesCandidate(candidate, q) {
  if (!q) return true;
  const hay = [candidate?.name, candidate?.company, candidate?.email, candidate?.phone]
    .map((x) => String(x || '').toLowerCase())
    .join(' ');
  return hay.includes(q);
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

function AddParticipantModalContent({
  requestClose,
  companyId,
  existingMemberKeys,
  onAdd,
  defaultSource = 'internal',
  defaultShowInternal,
  defaultShowExternal,
  allowInternal = true,
  allowExternal = true,
  lazyLoadExternal = false,
}) {
  const COLORS = {
    blue: '#1976D2',
    blueHover: '#155FB5',
    blueBg: '#DBEAFE',
    blueBgHover: '#BFDBFE',
    blueBgSoftHover: '#EFF6FF',
    neutral: '#6B7280',
    border: '#E6E8EC',
    borderStrong: '#D1D5DB',
    bgMuted: '#F8FAFC',
    text: '#111',
    textMuted: '#475569',
    textSubtle: '#64748b',
    inputBorder: '#E2E8F0',
    tableBorder: '#EEF0F3',
    danger: '#DC2626',
  };

  const confirmDeselect = async (candidate) => {
    const name = String(candidate?.name || '').trim() || 'denna person';
    const message = `Vill du ta bort ${name} från urvalet?`;
    if (Platform.OS === 'web') {
      return window.confirm(message);
    }
    return await new Promise((resolve) => {
      Alert.alert('Ta bort från urvalet?', message, [
        { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
        { text: 'Ta bort', style: 'destructive', onPress: () => resolve(true) },
      ]);
    });
  };

  const showLockedInfo = (candidate) => {
    const name = String(candidate?.name || '').trim() || 'Personen';
    const msg = `${name} är redan tillagd i gruppen.\n\nTa bort personen i Organisation & roller (i gruppens lista).`;
    if (Platform.OS === 'web') {
      window.alert(msg);
      return;
    }
    Alert.alert('Redan tillagd', msg, [{ text: 'OK' }]);
  };

  const cid = String(companyId || '').trim();

  const [loadingInternal, setLoadingInternal] = useState(false);
  const [loadingExternal, setLoadingExternal] = useState(false);
  const [errorInternal, setErrorInternal] = useState('');
  const [errorExternal, setErrorExternal] = useState('');
  const [search, setSearch] = useState('');

  const [sortKey, setSortKey] = useState(null); // null => default sort (name A–Ö)
  const [sortDir, setSortDir] = useState('none'); // 'none' | 'asc' | 'desc'

  const [showInternal, setShowInternal] = useState(true);
  const [showExternal, setShowExternal] = useState(true);

  const [internalCandidates, setInternalCandidates] = useState([]);
  const [externalCandidates, setExternalCandidates] = useState([]);
  const [externalLoaded, setExternalLoaded] = useState(false);

  const [selectedByKey, setSelectedByKey] = useState(() => ({}));

  useEffect(() => {
    setSearch('');
    setSelectedByKey({});
    setErrorInternal('');
    setErrorExternal('');
    setSortKey(null);
    setSortDir('none');
    setInternalCandidates([]);
    setExternalCandidates([]);
    setExternalLoaded(false);

    const explicitInternal = typeof defaultShowInternal === 'boolean' ? defaultShowInternal : undefined;
    const explicitExternal = typeof defaultShowExternal === 'boolean' ? defaultShowExternal : undefined;
    const d = String(defaultSource || '').trim();
    const fallbackInternal = d === 'contact' || d === 'external' ? false : true;
    const fallbackExternal = d === 'contact' || d === 'external' ? true : false;

    setShowInternal(allowInternal ? (explicitInternal ?? fallbackInternal) : false);
    setShowExternal(allowExternal ? (explicitExternal ?? fallbackExternal) : false);

    if (!cid) {
      setErrorInternal('Saknar companyId.');
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        if (allowInternal) {
          setLoadingInternal(true);
          setErrorInternal('');
          try {
            const membersRes = await fetchCompanyMembers(cid);
            const members = Array.isArray(membersRes?.out) ? membersRes.out : (Array.isArray(membersRes) ? membersRes : []);
            const mappedMembers = members
              .map((m) => {
                const refId = String(m?.uid || m?.id || '').trim();
                if (!refId) return null;
                return {
                  source: 'internal',
                  refId,
                  name: String(m?.displayName || m?.name || m?.email || '—').trim(),
                  company: cid,
                  email: String(m?.email || '').trim(),
                  phone: '',
                  metaRole: String(m?.role || '').trim(),
                };
              })
              .filter(Boolean);

            if (!cancelled) setInternalCandidates(mappedMembers);
          } catch (e) {
            if (!cancelled) setErrorInternal(String(e?.message || e || 'Kunde inte ladda interna användare.'));
          } finally {
            if (!cancelled) setLoadingInternal(false);
          }
        }
      } finally {
        if (!cancelled) {
          // Individual loaders handle their own state.
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cid, defaultSource, defaultShowInternal, defaultShowExternal, allowInternal, allowExternal]);

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
        // third click => default sort
        return 'none';
      });

      return k;
    });
  };

  useEffect(() => {
    if (sortDir !== 'none') return;
    // default sorting (name A–Ö) is represented by sortDir='none'.
    // Keep sortKey cleared to avoid showing active indicator.
    setSortKey(null);
  }, [sortDir]);

  useEffect(() => {
    if (!allowExternal) return;
    if (!showExternal) return;
    if (!cid) return;
    if (externalLoaded) return;

    let cancelled = false;
    (async () => {
      setLoadingExternal(true);
      setErrorExternal('');
      try {
        const contactsRes = await fetchCompanyContacts(cid);
        const contacts = Array.isArray(contactsRes) ? contactsRes : [];
        const mappedContacts = contacts
          .map((c) => {
            const refId = String(c?.id || '').trim();
            if (!refId) return null;
            const companyName = String(c?.contactCompanyName || c?.companyName || cid).trim();
            return {
              source: 'contact',
              refId,
              name: String(c?.name || '—').trim(),
              company: companyName,
              email: String(c?.email || '').trim(),
              phone: String(c?.phone || '').trim(),
              metaRole: String(c?.role || '').trim(),
            };
          })
          .filter(Boolean);

        if (!cancelled) {
          setExternalCandidates(mappedContacts);
          setExternalLoaded(true);
        }
      } catch (e) {
        if (!cancelled) setErrorExternal(String(e?.message || e || 'Kunde inte ladda kontakter.'));
      } finally {
        if (!cancelled) setLoadingExternal(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [allowExternal, showExternal, cid, externalLoaded, lazyLoadExternal]);

  useEffect(() => {
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

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    const keys = existingMemberKeys && typeof existingMemberKeys === 'object' ? existingMemberKeys : null;

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
  }, [showInternal, showExternal, internalCandidates, externalCandidates, search, existingMemberKeys, sortKey, sortDir]);

  const selectedList = useMemo(() => {
    const map = selectedByKey && typeof selectedByKey === 'object' ? selectedByKey : {};
    return Object.keys(map).map((k) => map[k]).filter(Boolean);
  }, [selectedByKey]);

  const selectedCount = selectedList.length;
  const canAdd = selectedCount > 0;

  const handleAdd = async () => {
    try {
      const batch = selectedList.map((c) => {
        const refId = String(c?.refId || '').trim();
        const source = String(c?.source || '').trim();
        return refId && source ? c : null;
      }).filter(Boolean);
      if (batch.length === 0) return;

      await onAdd(batch);
      requestClose();
    } catch (e) {
      const msg = String(e?.message || e || 'Kunde inte lägga till.');
      // Show error in both channels to avoid hiding it if user toggles filters.
      setErrorInternal(msg);
      setErrorExternal(msg);
    }
  };

  const activeError = [
    showInternal ? errorInternal : '',
    showExternal ? errorExternal : '',
  ].filter(Boolean).join('\n');

  const activeLoading = (showInternal && loadingInternal) || (showExternal && loadingExternal);
  const noSourceSelected = !showInternal && !showExternal;
  const blockingLoading = activeLoading && filtered.length === 0 && !noSourceSelected;

  const getSortIndicator = (key) => {
    const k = String(key || '').trim();
    if (sortDir !== 'none' && String(sortKey || '').trim() === k) {
      return sortDir === 'asc' ? '↑' : '↓';
    }
    return '↕';
  };

  const Body = (
    <View style={[styles.card, styles.cardFixed]}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
          <View style={{ width: 30, height: 30, borderRadius: 10, backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="person-add-outline" size={16} color={COLORS.blue} />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>Lägg till deltagare</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Sök i interna användare och kontaktregister</Text>
          </View>
        </View>
        <Pressable
          onPress={requestClose}
          title={Platform.OS === 'web' ? 'Stäng' : undefined}
          style={({ hovered, pressed }) => [
            styles.secondaryButton,
            hovered || pressed ? styles.secondaryButtonHot : null,
            Platform.OS === 'web' ? { cursor: 'pointer' } : null,
          ]}
        >
          {({ hovered, pressed }) => {
            const hot = hovered || pressed;
            return <Text style={[styles.secondaryButtonLabel, { color: hot ? COLORS.blue : COLORS.neutral }]}>Stäng</Text>;
          }}
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
              onPress={() => setShowExternal((v) => !v)}
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

        <View style={styles.tableWrap}>
          <View style={[styles.tableHeader, { backgroundColor: COLORS.bgMuted, borderBottomColor: COLORS.tableBorder }]}>
            <Pressable
              onPress={() => toggleSort('name')}
              style={({ hovered, pressed }) => [
                styles.thPressable,
                { flex: 1.5 },
                (hovered || pressed) ? styles.thPressableHot : null,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Text style={styles.th} numberOfLines={1}>Namn <Text style={styles.sortIcon}>{getSortIndicator('name')}</Text></Text>
            </Pressable>

            <Pressable
              onPress={() => toggleSort('company')}
              style={({ hovered, pressed }) => [
                styles.thPressable,
                { flex: 1.2 },
                (hovered || pressed) ? styles.thPressableHot : null,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Text style={styles.th} numberOfLines={1}>Företag <Text style={styles.sortIcon}>{getSortIndicator('company')}</Text></Text>
            </Pressable>

            <Pressable
              onPress={() => toggleSort('email')}
              style={({ hovered, pressed }) => [
                styles.thPressable,
                { flex: 1.35 },
                (hovered || pressed) ? styles.thPressableHot : null,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Text style={styles.th} numberOfLines={1}>E-post <Text style={styles.sortIcon}>{getSortIndicator('email')}</Text></Text>
            </Pressable>

            <Pressable
              onPress={() => toggleSort('phone')}
              style={({ hovered, pressed }) => [
                styles.thPressable,
                { flex: 1.0 },
                (hovered || pressed) ? styles.thPressableHot : null,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Text style={styles.th} numberOfLines={1}>Telefon <Text style={styles.sortIcon}>{getSortIndicator('phone')}</Text></Text>
            </Pressable>

            <Pressable
              onPress={() => toggleSort('source')}
              style={({ hovered, pressed }) => [
                styles.thPressable,
                { width: 86, alignItems: 'flex-end' },
                (hovered || pressed) ? styles.thPressableHot : null,
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
              ]}
            >
              <Text style={[styles.th, { textAlign: 'right' }]} numberOfLines={1}>Källa <Text style={styles.sortIcon}>{getSortIndicator('source')}</Text></Text>
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
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
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
                    title={Platform.OS === 'web' && rowDisabled ? 'Redan i gruppen (låst) – klicka för info' : undefined}
                    onPress={async () => {
                      if (rowDisabled) {
                        showLockedInfo(c);
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
                      setErrorInternal('');
                      setErrorExternal('');
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
                        Platform.OS === 'web' ? { cursor: rowDisabled ? 'pointer' : 'pointer' } : null,
                      ];
                    }}
                  >
                    <View style={{ flex: 1.5, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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

                    <Text style={[styles.td, { flex: 1.2, color: COLORS.text }]} numberOfLines={1}>{String(c?.company || '—')}</Text>
                    <Text style={[styles.td, { flex: 1.35, color: COLORS.text }]} numberOfLines={1}>{String(c?.email || '—')}</Text>
                    <Text style={[styles.td, { flex: 1.0, color: COLORS.text }]} numberOfLines={1}>{String(c?.phone || '—')}</Text>
                    <Text style={[styles.td, { width: 86, fontSize: 12, color: COLORS.textMuted, textAlign: 'right' }]} numberOfLines={1}>{sourceLabel}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          )}
        </View>
      </View>

      <View style={[styles.footer, { borderTopColor: COLORS.tableBorder }]}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={[styles.sectionTitle, { color: COLORS.text }]}>Deltagare i projektet</Text>
          {selectedCount === 0 ? (
            <Text style={[styles.helperText, { color: COLORS.textSubtle }]}>Välj en eller flera personer i listan ovan. Roller sätts efteråt.</Text>
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
          onPress={handleAdd}
          disabled={!canAdd}
          style={({ hovered, pressed }) => {
            const disabled = !canAdd;
            const bg = disabled ? '#9CA3AF' : (hovered || pressed ? COLORS.blueHover : COLORS.blue);
            return [
              styles.primaryButton,
              { backgroundColor: bg },
              Platform.OS === 'web' ? { cursor: disabled ? 'not-allowed' : 'pointer' } : null,
            ];
          }}
        >
          <Ionicons name="add-outline" size={16} color="#fff" />
          <Text style={styles.primaryButtonLabel}>{selectedCount > 0 ? `Lägg till (${selectedCount})` : 'Lägg till'}</Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <View style={Platform.OS === 'web' ? styles.webOuter : null}>
      {Body}
    </View>
  );
}

export default function AddParticipantModal({
  visible,
  onClose,
  companyId,
  existingMemberKeys,
  onAdd,
  defaultSource = 'internal',
  defaultShowInternal,
  defaultShowExternal,
  allowInternal = true,
  allowExternal = true,
  lazyLoadExternal = false,
}) {
  const { openSystemModal, closeSystemModal } = useSystemModal();
  const modalIdRef = React.useRef(null);

  useEffect(() => {
    if (visible && !modalIdRef.current) {
      modalIdRef.current = openSystemModal({
        component: AddParticipantModalContent,
        props: {
          companyId,
          existingMemberKeys,
          onAdd,
          defaultSource,
          defaultShowInternal,
          defaultShowExternal,
          allowInternal,
          allowExternal,
          lazyLoadExternal,
        },
        onClose,
      });
      return;
    }

    if (!visible && modalIdRef.current) {
      closeSystemModal(modalIdRef.current);
      modalIdRef.current = null;
    }
  }, [visible, openSystemModal, closeSystemModal, onClose, companyId, existingMemberKeys, onAdd, defaultSource, defaultShowInternal, defaultShowExternal, allowInternal, allowExternal, lazyLoadExternal]);

  useEffect(() => {
    return () => {
      if (modalIdRef.current) {
        closeSystemModal(modalIdRef.current);
        modalIdRef.current = null;
      }
    };
  }, [closeSystemModal]);

  return null;
}

const styles = StyleSheet.create({
  overlay: {
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 999999,
    padding: 18,
  },
  webOuter: {
    paddingHorizontal: 12,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)' } : { elevation: 6 }),
  },
  cardFixed: {
    width: Platform.OS === 'web' ? 980 : '100%',
    height: Platform.OS === 'web' ? 720 : '90%',
    maxWidth: Platform.OS === 'web' ? '92vw' : '100%',
    maxHeight: Platform.OS === 'web' ? '92vh' : '92%',
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8EC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
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
  tdMuted: {
    fontSize: 13,
    fontWeight: '400',
    color: '#475569',
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
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
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  primaryButtonLabel: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '600',
  },
});
