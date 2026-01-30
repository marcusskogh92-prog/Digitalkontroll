/**
 * TidsplanViktigaDatumView
 * (Översikt 03) – project timeline (local state).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

import { v4 as uuidv4 } from 'uuid';
import CompactMonthCalendar from '../../../../../../../../components/common/CompactMonthCalendar';
import IsoDatePickerModal from '../../../../../../../../components/common/Modals/IsoDatePickerModal';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import { fetchCompanyContacts } from '../../../../../../../../components/firebase';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';

const COLORS = {
  blue: '#1976D2',
  blueHover: '#155FB5',
  green: '#16A34A',
  border: '#E6E8EC',
  borderStrong: '#D1D5DB',
  text: '#111',
  textMuted: '#475569',
  textSubtle: '#64748b',
  bgMuted: '#F8FAFC',
  rowHover: 'rgba(25, 118, 210, 0.08)',
  danger: '#DC2626',
};

// Golden rule (local to this view): never exceed 500 weight.
const FW_REG = '400';
const FW_MED = '500';

const CONTENT_MAX_WIDTH = 960;

const QUICK_TYPES = [
  { key: 'Platsbesök', icon: 'walk-outline', multi: true },
  { key: 'Kalkylmöte', icon: 'people-outline', multi: true },
  { key: 'Möte med UE', icon: 'briefcase-outline', multi: true },
  { key: 'Internt möte', icon: 'chatbox-ellipses-outline', multi: true },
  { key: 'Anbudsinlämning', icon: 'paper-plane-outline', multi: false },
];

const MEETING_TYPES = new Set(['Kalkylmöte', 'Möte med UE', 'Internt möte']);

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function toIsoDate(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function statusForIso(iso, todayIso) {
  if (!isValidIsoDate(iso) || !isValidIsoDate(todayIso)) return null;
  if (iso < todayIso) return 'passed';
  if (iso > todayIso) return 'upcoming';
  return 'today';
}

function statusLabel(status) {
  if (status === 'upcoming') return 'Kommande';
  if (status === 'today') return 'Idag';
  if (status === 'passed') return 'Passerat';
  return '';
}

function statusBadgeStyle(status) {
  if (status === 'upcoming') {
    return { bg: 'rgba(22, 163, 74, 0.10)', border: 'rgba(22, 163, 74, 0.22)', text: '#166534' };
  }
  if (status === 'today') {
    return { bg: 'rgba(25, 118, 210, 0.12)', border: 'rgba(25, 118, 210, 0.26)', text: '#0B4AA2' };
  }
  if (status === 'passed') {
    return { bg: 'rgba(148, 163, 184, 0.14)', border: 'rgba(148, 163, 184, 0.28)', text: '#64748B' };
  }
  return { bg: 'transparent', border: 'transparent', text: COLORS.textSubtle };
}

function dedupeSortedDates(dates) {
  return Array.from(
    new Set(
      (Array.isArray(dates) ? dates : [])
        .map((x) => String(x || '').trim())
        .filter((x) => isValidIsoDate(x))
    )
  ).sort();
}

function splitTrailingNumber(title) {
  const t = String(title || '').trim();
  const m = t.match(/^(.*?)(?:\s+(\d+))$/);
  if (!m) return { base: t, number: null };
  const base = String(m[1] || '').trim();
  const num = Number(m[2]);
  return { base: base || t, number: Number.isFinite(num) ? num : null };
}

function normalizeTitlePrefix(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return splitTrailingNumber(raw).base;
}

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function isMeetingType(type) {
  const t = String(type || '').trim();
  if (!t) return false;
  if (MEETING_TYPES.has(t)) return true;
  return normalizeSearch(t).includes('möte');
}

function participantLabel(p) {
  const name = String(p?.name || '').trim();
  const company = String(p?.company || '').trim();
  if (name && company) return `${name} (${company})`;
  return name || company || '—';
}

function participantSortKey(p) {
  return `${normalizeSearch(p?.name)}|${normalizeSearch(p?.company)}|${normalizeSearch(p?.email)}`;
}

function normalizeParticipants(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((p) => {
      const id = String(p?.id || '').trim() || uuidv4();
      const origin = String(p?.origin || '').trim() || 'external';
      const refKey = p?.refKey == null ? null : String(p?.refKey || '').trim() || null;
      return {
        id,
        origin,
        refKey,
        name: String(p?.name || '').trim() || '—',
        company: String(p?.company || '').trim() || '',
        email: String(p?.email || '').trim() || '',
        phone: String(p?.phone || '').trim() || '',
        role: String(p?.role || '').trim() || '',
        notification: p?.notification && typeof p.notification === 'object' ? p.notification : { enabled: false },
      };
    })
    .filter(Boolean)
    .sort((a, b) => participantSortKey(a).localeCompare(participantSortKey(b), 'sv'));
}

function buildCandidateKey(c) {
  const origin = String(c?.origin || '').trim();
  const refKey = String(c?.refKey || '').trim();
  if (!origin || !refKey) return null;
  return `${origin}:${refKey}`;
}

function matchesCandidate(c, q) {
  if (!q) return true;
  const hay = [c?.name, c?.company, c?.email, c?.phone, c?.role, c?.groupTitle]
    .map((x) => normalizeSearch(x))
    .join(' ');
  return hay.includes(q);
}

function titleForSiteVisit(v) {
  const count = Array.isArray(v?.dates) ? v.dates.length : 0;
  return `${String(v?.title || 'Platsbesök').trim() || 'Platsbesök'} (${count} tillfällen)`;
}

function earliestDate(dates) {
  const ds = (Array.isArray(dates) ? dates : []).filter(isValidIsoDate).sort();
  return ds[0] || '';
}

function OccurrenceEditModal({
  visible,
  label,
  iso,
  title,
  onChangeTitle,
  participants,
  onEditParticipants,
  onCopyFromFirst,
  canCopyFromFirst,
  copyFromFirstLabel,
  onClose,
}) {
  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.30)', padding: 16, justifyContent: 'center' }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: 720,
            maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
            alignSelf: 'center',
            backgroundColor: '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            overflow: 'hidden',
            ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.18)' } : {}),
          }}
        >
          <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <View style={{ minWidth: 0, flex: 1 }}>
                <Text style={{ fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginTop: 2 }} numberOfLines={1}>
                  {iso}
                </Text>
              </View>

              <Pressable
                onPress={onClose}
                style={({ hovered, pressed }) => ({
                  padding: 6,
                  borderRadius: 8,
                  backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
                })}
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Titel</Text>
              <TextInput
                value={title}
                onChangeText={onChangeTitle}
                placeholder={label}
                placeholderTextColor="#94A3B8"
                style={{
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 10,
                  paddingVertical: 9,
                  paddingHorizontal: 10,
                  fontSize: 13,
                  color: '#0F172A',
                  backgroundColor: '#fff',
                  ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                }}
              />
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Deltagare</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {!canCopyFromFirst ? null : (
                    <Pressable
                      onPress={onCopyFromFirst}
                      style={({ hovered, pressed }) => ({
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      })}
                    >
                      <Ionicons name="copy-outline" size={15} color="#64748B" />
                      <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>
                        {String(copyFromFirstLabel || 'Kopiera från tillfälle 1')}
                      </Text>
                    </Pressable>
                  )}

                  <Pressable
                    onPress={onEditParticipants}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    })}
                  >
                    <Ionicons name="people-outline" size={15} color="#64748B" />
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Redigera ({Array.isArray(participants) ? participants.length : 0})</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' }}>
                {(Array.isArray(participants) ? participants : []).length === 0 ? (
                  <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 13, color: '#64748B' }}>Inga deltagare valda.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {(Array.isArray(participants) ? participants : []).map((p) => (
                      <View key={p.id} style={{ paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                        <Text style={{ fontSize: 13, fontWeight: FW_REG, color: COLORS.text }} numberOfLines={1}>
                          {participantLabel(p)}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }} numberOfLines={1}>
                          {[p.role, p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                        </Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
              </View>
            </View>
          </ScrollView>

          <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', justifyContent: 'flex-end' }}>
            <Pressable
              onPress={onClose}
              style={({ hovered, pressed }) => ({
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#CBD5E1',
                backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textMuted }}>Klar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function DateModal({
  visible,
  initial,
  onClose,
  onSave,
  onDelete,
  peopleCandidates,
  peopleLoading,
  peopleError,
}) {
  const [title, setTitle] = React.useState('');
  const [type, setType] = React.useState('');
  const [typeLocked, setTypeLocked] = React.useState(false);
  const [description, setDescription] = React.useState('');
  const [date, setDate] = React.useState('');
  const [dates, setDates] = React.useState([]);
  const [allowMulti, setAllowMulti] = React.useState(false);
  const [baseNumber, setBaseNumber] = React.useState(1);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);

  const [multiDrafts, setMultiDrafts] = React.useState(() => ({}));
  const [participantsTargetIso, setParticipantsTargetIso] = React.useState(null);

  const [occurrenceEdit, setOccurrenceEdit] = React.useState(() => ({ open: false, iso: '', idx: -1 }));

  const [participants, setParticipants] = React.useState([]);
  const [participantsModalOpen, setParticipantsModalOpen] = React.useState(false);
  const [participantsSearch, setParticipantsSearch] = React.useState('');
  const [externalDraft, setExternalDraft] = React.useState(() => ({ id: null, name: '', company: '', email: '', phone: '', role: '' }));
  const [externalEditingId, setExternalEditingId] = React.useState(null);
  const [externalSectionOpen, setExternalSectionOpen] = React.useState(false);

  const selectedDates = React.useMemo(() => {
    if (!allowMulti) return [];
    return dedupeSortedDates(dates);
  }, [allowMulti, dates]);

  const isSeries = React.useMemo(() => allowMulti && selectedDates.length > 1, [allowMulti, selectedDates]);

  const multiCapable = React.useMemo(() => {
    const t = String(type || '').trim();
    const quick = QUICK_TYPES.find((x) => String(x?.key || '').trim() === t);
    return !!quick?.multi;
  }, [type]);

  const datePickerValue = React.useMemo(() => {
    if (multiCapable || allowMulti) {
      const seed = [];
      if (allowMulti) return Array.isArray(dates) ? dates : [];
      const d = String(date || '').trim();
      if (isValidIsoDate(d)) seed.push(d);
      return seed;
    }
    return date;
  }, [multiCapable, allowMulti, dates, date]);

  const ensureMultiDrafts = React.useCallback(() => {
    if (!isSeries) return;
    setMultiDrafts((prev) => {
      const prevObj = prev && typeof prev === 'object' ? prev : {};
      const next = {};

      const base = normalizeTitlePrefix(title) || normalizeTitlePrefix(type) || 'Platsbesök';
      const bn = Number(baseNumber || 1);

      selectedDates.forEach((iso, idx) => {
        const existing = prevObj?.[iso] && typeof prevObj[iso] === 'object' ? prevObj[iso] : {};
        const nextTitle = String(existing?.title || '').trim() || `${base} ${bn + idx}`;
        const nextParticipants = Array.isArray(existing?.participants) ? existing.participants : [];
        next[iso] = { ...existing, title: nextTitle, participants: nextParticipants };
      });

      return next;
    });
  }, [isSeries, selectedDates, title, type, baseNumber]);

  React.useEffect(() => {
    if (!isSeries) return;
    ensureMultiDrafts();
  }, [isSeries, ensureMultiDrafts]);

  const closeOccurrenceEdit = React.useCallback(() => setOccurrenceEdit({ open: false, iso: '', idx: -1 }), []);

  const openOccurrenceEdit = React.useCallback((iso, idx) => {
    const safeIso = isValidIsoDate(iso) ? String(iso) : '';
    if (!safeIso) return;
    setOccurrenceEdit({ open: true, iso: safeIso, idx: Number.isFinite(Number(idx)) ? Number(idx) : -1 });
  }, []);

  React.useEffect(() => {
    if (!visible) return;

    const initTitle = String(initial?.title || '').trim();
    const initType = String(initial?.type || '').trim();
    const initDescription = String(initial?.description || '').trim();
    const initDate = String(initial?.date || '').trim();
    const initDates = dedupeSortedDates(initial?.dates);
    const initAllowMulti = initDates.length > 1;
    const initBaseNumber = Number(initial?.baseNumber || 1);

    setTitle(initTitle);
    setType(initType);
    setDescription(initDescription);
    setAllowMulti(initAllowMulti);
    setBaseNumber(Number.isFinite(initBaseNumber) ? initBaseNumber : 1);

    if (initAllowMulti) {
      setDates(initDates);
      setDate('');

      const d = {};
      const fromInitial = Array.isArray(initial?.multiItems) ? initial.multiItems : [];
      fromInitial.forEach((it) => {
        const iso = String(it?.date || '').trim();
        if (!isValidIsoDate(iso)) return;
        d[iso] = {
          title: String(it?.title || '').trim(),
          participants: normalizeParticipants(it?.participants),
        };
      });
      setMultiDrafts(d);
    } else {
      setDate(initDates[0] || initDate);
      setDates([]);
      setMultiDrafts({});
    }

    closeOccurrenceEdit();

    setParticipants(normalizeParticipants(initial?.participants));

    const isQuick = QUICK_TYPES.some((q) => String(q?.key || '').trim() === initType);
    setTypeLocked(!!initType && isQuick);

    setParticipantsTargetIso(null);
    setParticipantsModalOpen(false);
    setParticipantsSearch('');
    setExternalEditingId(null);
    setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
    setExternalSectionOpen(false);
  }, [visible, initial, closeOccurrenceEdit]);

  const participantsValue = React.useMemo(() => {
    if (participantsTargetIso && isSeries) {
      return (multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[participantsTargetIso]?.participants : null) || [];
    }
    return participants;
  }, [participantsTargetIso, isSeries, multiDrafts, participants]);

  const setParticipantsValue = React.useCallback(
    (updater) => {
      const apply = (prev) => {
        if (typeof updater === 'function') return updater(prev);
        return updater;
      };

      if (participantsTargetIso && isSeries) {
        const iso = participantsTargetIso;
        setMultiDrafts((prev) => {
          const prevObj = prev && typeof prev === 'object' ? prev : {};
          const current = Array.isArray(prevObj?.[iso]?.participants) ? prevObj[iso].participants : [];
          const nextParticipants = normalizeParticipants(apply(current));
          return { ...prevObj, [iso]: { ...(prevObj?.[iso] || {}), participants: nextParticipants } };
        });
        return;
      }

      setParticipants((prev) => normalizeParticipants(apply(Array.isArray(prev) ? prev : [])));
    },
    [participantsTargetIso, isSeries]
  );

  const normalizedParticipants = React.useMemo(() => normalizeParticipants(participantsValue), [participantsValue]);

  const selectedRefKeys = React.useMemo(() => {
    const map = {};
    normalizedParticipants.forEach((p) => {
      const rk = String(p?.refKey || '').trim();
      if (rk) map[rk] = true;
    });
    return map;
  }, [normalizedParticipants]);

  const q = React.useMemo(() => normalizeSearch(participantsSearch), [participantsSearch]);
  const candidates = React.useMemo(() => (Array.isArray(peopleCandidates) ? peopleCandidates : []), [peopleCandidates]);
  const orgCandidatesFiltered = React.useMemo(
    () => candidates.filter((c) => String(c?.origin || '') === 'project_org').filter((c) => matchesCandidate(c, q)),
    [candidates, q]
  );
  const contactCandidatesFiltered = React.useMemo(
    () => candidates.filter((c) => String(c?.origin || '') === 'contact_registry').filter((c) => matchesCandidate(c, q)),
    [candidates, q]
  );

  const externalParticipants = React.useMemo(
    () => normalizedParticipants.filter((p) => String(p?.origin || '') === 'external'),
    [normalizedParticipants]
  );

  const closeParticipantsModal = React.useCallback(() => {
    setParticipantsModalOpen(false);
    setParticipantsTargetIso(null);
    setParticipantsSearch('');
    setExternalEditingId(null);
    setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
    setExternalSectionOpen(false);
  }, []);

  const canSave = React.useMemo(() => {
    if (isSeries) return selectedDates.length > 1 && !!String(type || '').trim();
    return isValidIsoDate(date) && !!String(type || '').trim();
  }, [isSeries, selectedDates, date, type]);

  const openParticipantsEditor = React.useCallback(
    (isoOrNull) => {
      setParticipantsTargetIso(isoOrNull);
      setParticipantsSearch('');
      setExternalEditingId(null);
      setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
      setParticipantsModalOpen(true);
    },
    []
  );

  const occurrenceIso = String(occurrenceEdit?.iso || '').trim();
  const occurrenceIdx = React.useMemo(() => {
    const idx = Number(occurrenceEdit?.idx);
    if (Number.isFinite(idx) && idx >= 0) return idx;
    if (!occurrenceIso) return -1;
    return selectedDates.indexOf(occurrenceIso);
  }, [occurrenceEdit, occurrenceIso, selectedDates]);
  const occurrenceNumber = occurrenceIdx >= 0 ? occurrenceIdx + 1 : null;
  const occurrencePrefix = isMeetingType(type) ? String(type || 'Möte').trim() : 'Tillfälle';
  const occurrenceLabel = occurrenceNumber ? `${occurrencePrefix} ${occurrenceNumber}` : occurrencePrefix;
  const occurrenceDraft = occurrenceIso && multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[occurrenceIso] : null;
  const occurrenceTitle = String(occurrenceDraft?.title || '');
  const occurrenceParticipants = normalizeParticipants(occurrenceDraft?.participants);

  const firstIso = selectedDates[0] || '';
  const firstParticipants = normalizeParticipants(multiDrafts?.[firstIso]?.participants);
  const canCopyFromFirst = !!occurrenceIso && occurrenceIdx > 0 && !!firstIso && firstParticipants.length > 0;

  return (
    <>
      <Modal visible={!!visible} transparent animationType="fade" onRequestClose={onClose}>
        <Pressable
          onPress={onClose}
          style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.30)', padding: 16, justifyContent: 'center' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 820,
              maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.18)' } : {}),
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <Ionicons name="calendar-outline" size={18} color={COLORS.textSubtle} />
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>
                      {initial?.id ? 'Redigera datum' : 'Nytt datum'}
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>
                      Tidsplan och viktiga datum
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={onClose}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
                  })}
                >
                  <Ionicons name="close" size={18} color={COLORS.textSubtle} />
                </Pressable>
              </View>
            </View>

            <ScrollView contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
              <View style={{ gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>{isSeries ? 'Datum (flera)' : 'Datum'}</Text>
                  <Pressable
                    onPress={() => setDatePickerOpen(true)}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 7,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    })}
                  >
                    <Ionicons name="calendar-outline" size={15} color={COLORS.textSubtle} />
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Välj</Text>
                  </Pressable>
                </View>

                {!isSeries ? (
                  <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#fff' }}>
                    <Text style={{ fontSize: 13, fontWeight: FW_REG, color: COLORS.text }}>{String(date || '').trim() || '—'}</Text>
                  </View>
                ) : (
                  <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#fff' }}>
                    <Text style={{ fontSize: 13, fontWeight: FW_REG, color: COLORS.text }}>
                      {selectedDates.length === 0 ? '—' : selectedDates.join(', ')}
                    </Text>
                  </View>
                )}

                {!multiCapable ? null : (
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>
                    Välj flera datum i kalendern för att skapa en serie.
                  </Text>
                )}
              </View>

              {!isSeries ? null : (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Tillfällen</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>Startnr</Text>
                      <TextInput
                        value={String(baseNumber || 1)}
                        onChangeText={(v) => {
                          const n = Number(String(v || '').replace(/[^0-9]/g, ''));
                          if (!Number.isFinite(n)) return;
                          setBaseNumber(n || 1);
                        }}
                        style={{
                          width: 64,
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          borderRadius: 10,
                          paddingVertical: 7,
                          paddingHorizontal: 10,
                          fontSize: 13,
                          color: COLORS.text,
                          backgroundColor: '#fff',
                          textAlign: 'right',
                          ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                        }}
                        keyboardType={Platform.OS === 'web' ? 'default' : 'numeric'}
                      />
                    </View>
                  </View>

                  {selectedDates.map((iso, idx) => {
                    const draft = multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[iso] : null;
                    const draftTitle = String(draft?.title || '').trim();
                    const draftParticipants = normalizeParticipants(draft?.participants);

                    const prefix = isMeetingType(type) ? String(type || 'Möte').trim() : 'Tillfälle';
                    const label = `${prefix} ${idx + 1}`;
                    const summaryTitle = draftTitle || label;

                    return (
                      <Pressable
                        key={iso}
                        onPress={() => openOccurrenceEdit(iso, idx)}
                        style={({ hovered, pressed }) => ({
                          borderWidth: 1,
                          borderColor: '#EEF2F7',
                          borderRadius: 12,
                          backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: 12,
                        })}
                      >
                        <View style={{ minWidth: 0, flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 }}>
                            <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textMuted }} numberOfLines={1}>
                              {label}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                              {iso}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: COLORS.textMuted }} numberOfLines={1}>
                            {summaryTitle}
                          </Text>
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>
                            {draftParticipants.length} deltagare
                          </Text>
                          <Pressable
                            onPress={(e) => {
                              e?.stopPropagation?.();
                              openOccurrenceEdit(iso, idx);
                            }}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 7,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: '#CBD5E1',
                              backgroundColor: hovered || pressed ? '#F1F5F9' : '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 8,
                            })}
                          >
                            <Ionicons name="create-outline" size={15} color={COLORS.textSubtle} />
                            <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Redigera</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Typ</Text>
                  {!typeLocked ? null : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <Ionicons name="lock-closed-outline" size={12} color={COLORS.textSubtle} />
                      <Text style={{ fontSize: 11, color: COLORS.textSubtle, fontWeight: FW_MED }}>Låst</Text>
                    </View>
                  )}
                </View>
                {typeLocked ? (
                  <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F8FAFC' }}>
                    <Text style={{ fontSize: 13, fontWeight: FW_REG, color: COLORS.text }}>{String(type || '').trim() || '—'}</Text>
                  </View>
                ) : (
                  <TextInput
                    value={type}
                    onChangeText={setType}
                    placeholder="T.ex. Milstolpe"
                    placeholderTextColor="#94A3B8"
                    style={{
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      borderRadius: 10,
                      paddingVertical: 9,
                      paddingHorizontal: 10,
                      fontSize: 13,
                      color: COLORS.text,
                      backgroundColor: '#fff',
                      ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                    }}
                  />
                )}
              </View>

              <View style={{ gap: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Beskrivning (valfritt)</Text>
                <TextInput
                  value={description}
                  onChangeText={setDescription}
                  placeholder="Fritext…"
                  placeholderTextColor="#94A3B8"
                  multiline
                  style={{
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 10,
                    fontSize: 13,
                    color: COLORS.text,
                    backgroundColor: '#fff',
                    minHeight: 84,
                    textAlignVertical: 'top',
                    ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                  }}
                />
              </View>

              {/* Participants should be available for all types (incl. Platsbesök & generic datum). */}
              {isSeries ? null : (
                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Deltagare (valfritt)</Text>
                    <Pressable
                      onPress={() => {
                        setParticipantsTargetIso(null);
                        setParticipantsSearch('');
                        setExternalEditingId(null);
                        setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
                        setParticipantsModalOpen(true);
                      }}
                      style={({ hovered, pressed }) => ({
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                        backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      })}
                    >
                      <Ionicons name="people-outline" size={15} color={COLORS.textSubtle} />
                      <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>
                        Redigera ({normalizedParticipants.length})
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' }}>
                    {normalizedParticipants.length === 0 ? (
                      <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                        <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga deltagare valda.</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 140 }}>
                        {normalizedParticipants.map((p) => (
                          <View key={p.id} style={{ paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                            <Text style={{ fontSize: 13, fontWeight: FW_REG, color: COLORS.text }} numberOfLines={1}>
                              {participantLabel(p)}
                            </Text>
                            <Text style={{ fontSize: 11, color: COLORS.textSubtle }} numberOfLines={1}>
                              {[p.role, p.email, p.phone].filter(Boolean).join(' · ') || '—'}
                            </Text>
                          </View>
                        ))}
                      </ScrollView>
                    )}
                  </View>

                  {!peopleLoading ? null : (
                    <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>Laddar kandidater…</Text>
                  )}

                  {!peopleError ? null : (
                    <Text style={{ fontSize: 12, color: COLORS.danger }}>{String(peopleError)}</Text>
                  )}
                </View>
              )}
            </ScrollView>

            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View>
                {!initial?.id ? null : (
                  <Pressable
                    onPress={onDelete}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: hovered || pressed ? COLORS.danger : COLORS.borderStrong,
                      backgroundColor: '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    })}
                  >
                    {({ hovered, pressed }) => (
                      <>
                        <Ionicons name="trash-outline" size={16} color={hovered || pressed ? COLORS.danger : COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: hovered || pressed ? COLORS.danger : COLORS.textSubtle }}>Ta bort</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={onClose}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textMuted }}>Avbryt</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (!canSave) return;

                    const computedTitle = (() => {
                      const existing = String(title || '').trim();
                      if (existing) return existing;
                      const t = String(type || '').trim();
                      if (t) return t;
                      return 'Viktigt datum';
                    })();

                    let multiItems = [];
                    if (isSeries) {
                      const selected = selectedDates;
                      const base = splitTrailingNumber(String(title || '').trim()).base || String(type || '').trim() || 'Platsbesök';
                      const bn = Number(baseNumber || 1);
                      multiItems = selected.map((iso, idx) => {
                        const d = multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[iso] : null;
                        const itTitle = String(d?.title || '').trim() || `${base} ${bn + idx}`;
                        const itParticipants = normalizeParticipants(d?.participants);
                        return { date: iso, title: itTitle, participants: itParticipants };
                      });
                    }

                    const payload = {
                      id: initial?.id || null,
                      title: isSeries ? String(title || '').trim() : computedTitle,
                      type: String(type || '').trim(),
                      description: String(description || '').trim(),
                      date: isSeries ? '' : String(date || '').trim(),
                      dates: isSeries ? selectedDates : [],
                      allowMulti: !!isSeries,
                      baseNumber,
                      participants: normalizeParticipants(participants),
                      multiItems,
                    };
                    onSave(payload);
                  }}
                  disabled={!canSave}
                  style={({ hovered, pressed }) => {
                    const disabled = !canSave;
                    return {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: disabled ? '#E2E8F0' : COLORS.blue,
                      backgroundColor: disabled ? '#F1F5F9' : (hovered || pressed ? COLORS.blueHover : COLORS.blue),
                      opacity: disabled ? 0.85 : 1,
                    };
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: '#fff' }}>Spara</Text>
                </Pressable>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <OccurrenceEditModal
        visible={occurrenceEdit?.open}
        label={occurrenceLabel}
        iso={occurrenceIso}
        title={occurrenceTitle}
        onChangeTitle={(v) => {
          const nextTitle = String(v || '');
          if (!occurrenceIso) return;
          setMultiDrafts((prev) => {
            const prevObj = prev && typeof prev === 'object' ? prev : {};
            return {
              ...prevObj,
              [occurrenceIso]: { ...(prevObj?.[occurrenceIso] || {}), title: nextTitle },
            };
          });
        }}
        participants={occurrenceParticipants}
        onEditParticipants={() => {
          if (!occurrenceIso) return;
          openParticipantsEditor(occurrenceIso);
        }}
        canCopyFromFirst={canCopyFromFirst}
        copyFromFirstLabel={isMeetingType(type) ? 'Kopiera från möte 1' : 'Kopiera från tillfälle 1'}
        onCopyFromFirst={() => {
          if (!occurrenceIso || !firstIso) return;
          setMultiDrafts((prev) => {
            const prevObj = prev && typeof prev === 'object' ? prev : {};
            return {
              ...prevObj,
              [occurrenceIso]: {
                ...(prevObj?.[occurrenceIso] || {}),
                participants: normalizeParticipants(prevObj?.[firstIso]?.participants),
              },
            };
          });
        }}
        onClose={closeOccurrenceEdit}
      />

      <IsoDatePickerModal
        visible={datePickerOpen}
        title={allowMulti ? 'Välj datum' : 'Välj datum'}
        value={datePickerValue}
        onSelect={(val) => {
          const many = Array.isArray(val) ? dedupeSortedDates(val) : [];
          if (Array.isArray(val) || multiCapable || allowMulti) {
            if (many.length > 1) {
              setAllowMulti(true);
              setDates(many);
              setDate('');
              setDatePickerOpen(false);
              return;
            }

            // Treat 0-1 selections as single-date mode.
            const one = many[0] || '';
            setAllowMulti(false);
            setDates([]);
            setMultiDrafts({});
            setParticipantsTargetIso(null);
            setDate(one);
            setDatePickerOpen(false);
            return;
          }

          setDate(String(val || ''));
          setDatePickerOpen(false);
        }}
        onClose={() => setDatePickerOpen(false)}
      />

      <Modal visible={participantsModalOpen} transparent animationType="fade" onRequestClose={closeParticipantsModal}>
        <Pressable onPress={closeParticipantsModal} style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.25)', padding: 16, justifyContent: 'center' }}>
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 920,
              maxHeight: Platform.OS === 'web' ? '90vh' : '90%',
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.18)' } : {}),
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <Ionicons name="people-outline" size={18} color={COLORS.textSubtle} />
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: FW_MED, color: COLORS.text }} numberOfLines={1}>
                      Deltagare
                    </Text>
                    <Text style={{ fontSize: 12, color: COLORS.textSubtle }} numberOfLines={1}>
                      Registerurval
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={closeParticipantsModal}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
                  })}
                >
                  <Ionicons name="close" size={18} color={COLORS.textSubtle} />
                </Pressable>
              </View>
            </View>

            <View style={{ padding: 14, gap: 12 }}>
              {!peopleError ? null : (
                <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
                  <Text style={{ fontSize: 13, color: '#C62828' }}>{String(peopleError)}</Text>
                </View>
              )}

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Ionicons name="search-outline" size={16} color={COLORS.textSubtle} />
                <TextInput
                  value={participantsSearch}
                  onChangeText={setParticipantsSearch}
                  placeholder="Sök namn, företag, e-post, telefon"
                  placeholderTextColor="#94A3B8"
                  style={{
                    flex: 1,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 10,
                    paddingVertical: 9,
                    paddingHorizontal: 10,
                    fontSize: 13,
                    color: COLORS.text,
                    backgroundColor: '#fff',
                    ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                  }}
                  autoCapitalize="none"
                />
              </View>

              <View style={{ gap: 8 }}>
                <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>Valda ({normalizedParticipants.length})</Text>
                {normalizedParticipants.length === 0 ? (
                  <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga deltagare valda.</Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {normalizedParticipants.map((p) => {
                      const isExternal = String(p?.origin || '') === 'external';
                      const label = participantLabel(p);
                      const meta = isExternal ? 'Extern' : (p.origin === 'project_org' ? 'Organisation' : 'Kontaktregister');
                      return (
                        <Pressable
                          key={String(p.id)}
                          onPress={() => {
                            setParticipantsValue((prev) => {
                              const list = Array.isArray(prev) ? prev : [];
                              return list.filter((x) => String(x?.id || '') !== String(p.id || ''));
                            });
                          }}
                          style={({ hovered, pressed }) => ({
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 999,
                            borderWidth: 1,
                            borderColor: hovered || pressed ? '#BFDBFE' : '#E2E8F0',
                            backgroundColor: '#fff',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          })}
                        >
                          <Text style={{ fontSize: 12, color: COLORS.text, maxWidth: 260 }} numberOfLines={1}>{label}</Text>
                          <Text style={{ fontSize: 11, color: COLORS.textSubtle }} numberOfLines={1}>{meta}</Text>
                          <Ionicons name="close-circle" size={16} color={COLORS.textSubtle} />
                        </Pressable>
                      );
                    })}
                  </View>
                )}
              </View>

              <View style={{ borderWidth: 1, borderColor: '#EEF2F7', borderRadius: 12, overflow: 'hidden' }}>
                <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Organisation/Projektroller</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>{orgCandidatesFiltered.length}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                  <Text style={{ width: 54, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Val</Text>
                  <Text style={{ flex: 1.4, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Namn</Text>
                  <Text style={{ flex: 1.1, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Företag</Text>
                  <Text style={{ flex: 1.1, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Roll</Text>
                  <Text style={{ width: 120, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle, textAlign: 'right' }}>Källa</Text>
                </View>

                {peopleLoading ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Laddar…</Text>
                  </View>
                ) : orgCandidatesFiltered.length === 0 ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga träffar.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {orgCandidatesFiltered.slice(0, 250).map((c) => {
                      const rk = String(c?.refKey || '').trim();
                      const checked = !!selectedRefKeys[rk];
                      return (
                        <Pressable
                          key={buildCandidateKey(c) || rk}
                          onPress={() => {
                            if (!rk) return;
                            setParticipantsValue((prev) => {
                              const current = Array.isArray(prev) ? prev : [];
                              const has = current.some((p) => String(p?.refKey || '').trim() === rk);
                              if (has) return normalizeParticipants(current.filter((p) => String(p?.refKey || '').trim() !== rk));
                              const next = {
                                id: uuidv4(),
                                origin: 'project_org',
                                refKey: rk,
                                name: String(c?.name || '').trim() || '—',
                                company: String(c?.company || '').trim() || '',
                                email: String(c?.email || '').trim() || '',
                                phone: String(c?.phone || '').trim() || '',
                                role: String(c?.role || '').trim() || '',
                                notification: { enabled: false },
                              };
                              return normalizeParticipants([...current, next]);
                            });
                          }}
                          style={({ hovered, pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: hovered || pressed ? '#CBD5E1' : '#EEF2F7',
                            backgroundColor: '#fff',
                            gap: 10,
                          })}
                        >
                          {({ hovered, pressed }) => (
                            <>
                              <View style={{ width: 54 }}>
                                <Ionicons
                                  name={checked ? 'checkbox' : 'square-outline'}
                                  size={18}
                                  color={checked ? COLORS.blue : (hovered || pressed ? COLORS.blue : COLORS.textSubtle)}
                                />
                              </View>
                              <Text style={{ flex: 1.4, fontSize: 13, color: COLORS.text }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                              <Text style={{ flex: 1.1, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>{String(c?.company || '—')}</Text>
                              <Text style={{ flex: 1.1, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>{String(c?.role || '—')}</Text>
                              <Text style={{ width: 120, fontSize: 12, color: COLORS.textSubtle, textAlign: 'right' }}>Organisation</Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={{ borderWidth: 1, borderColor: '#EEF2F7', borderRadius: 12, overflow: 'hidden' }}>
                <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Kontaktregister</Text>
                  <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>{contactCandidatesFiltered.length}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: COLORS.bgMuted, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                  <Text style={{ width: 54, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Val</Text>
                  <Text style={{ flex: 1.4, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Namn</Text>
                  <Text style={{ flex: 1.1, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Företag</Text>
                  <Text style={{ flex: 1.1, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle }}>Roll</Text>
                  <Text style={{ width: 120, fontSize: 11, fontWeight: '500', color: COLORS.textSubtle, textAlign: 'right' }}>Källa</Text>
                </View>

                {peopleLoading ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Laddar…</Text>
                  </View>
                ) : contactCandidatesFiltered.length === 0 ? (
                  <View style={{ padding: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga träffar.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {contactCandidatesFiltered.slice(0, 250).map((c) => {
                      const rk = String(c?.refKey || '').trim();
                      const checked = !!selectedRefKeys[rk];
                      return (
                        <Pressable
                          key={buildCandidateKey(c) || rk}
                          onPress={() => {
                            if (!rk) return;
                            setParticipantsValue((prev) => {
                              const current = Array.isArray(prev) ? prev : [];
                              const has = current.some((p) => String(p?.refKey || '').trim() === rk);
                              if (has) return normalizeParticipants(current.filter((p) => String(p?.refKey || '').trim() !== rk));
                              const next = {
                                id: uuidv4(),
                                origin: 'contact_registry',
                                refKey: rk,
                                name: String(c?.name || '').trim() || '—',
                                company: String(c?.company || '').trim() || '',
                                email: String(c?.email || '').trim() || '',
                                phone: String(c?.phone || '').trim() || '',
                                role: String(c?.role || '').trim() || '',
                                notification: { enabled: false },
                              };
                              return normalizeParticipants([...current, next]);
                            });
                          }}
                          style={({ hovered, pressed }) => ({
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderBottomWidth: 1,
                            borderBottomColor: hovered || pressed ? '#CBD5E1' : '#EEF2F7',
                            backgroundColor: '#fff',
                            gap: 10,
                          })}
                        >
                          {({ hovered, pressed }) => (
                            <>
                              <View style={{ width: 54 }}>
                                <Ionicons
                                  name={checked ? 'checkbox' : 'square-outline'}
                                  size={18}
                                  color={checked ? COLORS.blue : (hovered || pressed ? COLORS.blue : COLORS.textSubtle)}
                                />
                              </View>
                              <Text style={{ flex: 1.4, fontSize: 13, color: COLORS.text }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                              <Text style={{ flex: 1.1, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>{String(c?.company || '—')}</Text>
                              <Text style={{ flex: 1.1, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>{String(c?.role || '—')}</Text>
                              <Text style={{ width: 120, fontSize: 12, color: COLORS.textSubtle, textAlign: 'right' }}>Kontaktregister</Text>
                            </>
                          )}
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                )}
              </View>

              <View style={{ borderWidth: 1, borderColor: '#EEF2F7', borderRadius: 12, overflow: 'hidden' }}>
                <View style={{ padding: 12, backgroundColor: '#fff' }}>
                  <Pressable
                    onPress={() => setExternalSectionOpen((v) => !v)}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#CBD5E1',
                      backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 10,
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Ionicons name="add-outline" size={16} color={COLORS.textSubtle} />
                      <Text style={{ fontSize: 12, color: COLORS.textMuted }}>Lägg till extern deltagare</Text>
                    </View>
                    <Ionicons name={externalSectionOpen ? 'chevron-up' : 'chevron-down'} size={16} color={COLORS.textSubtle} />
                  </Pressable>
                </View>

                {!externalSectionOpen ? null : (
                  <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', backgroundColor: COLORS.bgMuted, gap: 10 }}>
                    {externalParticipants.length === 0 ? null : (
                      <View style={{ gap: 6 }}>
                        <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>Externa ({externalParticipants.length})</Text>
                        {externalParticipants.map((p) => (
                          <View key={p.id} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E2E8F0', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                            <View style={{ minWidth: 0, flex: 1 }}>
                              <Text style={{ fontSize: 13, color: COLORS.text }} numberOfLines={1}>{participantLabel(p)}</Text>
                              <Text style={{ fontSize: 11, color: COLORS.textSubtle }} numberOfLines={1}>Extern · {[p.email, p.phone, p.role].filter(Boolean).join(' · ') || '—'}</Text>
                            </View>
                            <View style={{ flexDirection: 'row', gap: 8 }}>
                              <Pressable
                                onPress={() => {
                                  setExternalEditingId(p.id);
                                  setExternalDraft({
                                    id: p.id,
                                    name: String(p.name || ''),
                                    company: String(p.company || ''),
                                    email: String(p.email || ''),
                                    phone: String(p.phone || ''),
                                    role: String(p.role || ''),
                                  });
                                }}
                                style={({ hovered, pressed }) => ({
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: '#E2E8F0',
                                  backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                                })}
                              >
                                <Ionicons name="create-outline" size={16} color={COLORS.textSubtle} />
                              </Pressable>
                              <Pressable
                                onPress={() => {
                                  setParticipantsValue((prev) => (Array.isArray(prev) ? prev : []).filter((x) => String(x?.id || '') !== String(p.id || '')));
                                  if (String(externalEditingId || '') === String(p.id || '')) {
                                    setExternalEditingId(null);
                                    setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
                                  }
                                }}
                                style={({ hovered, pressed }) => ({
                                  paddingVertical: 6,
                                  paddingHorizontal: 8,
                                  borderRadius: 8,
                                  borderWidth: 1,
                                  borderColor: '#E2E8F0',
                                  backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                                })}
                              >
                                <Ionicons name="trash-outline" size={16} color={hovered || pressed ? COLORS.danger : COLORS.textSubtle} />
                              </Pressable>
                            </View>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, color: COLORS.textSubtle }}>{externalEditingId ? 'Redigera extern' : 'Ny extern'}</Text>
                      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                        <TextInput
                          value={externalDraft.name}
                          onChangeText={(v) => setExternalDraft((p) => ({ ...(p || {}), name: v }))}
                          placeholder="Namn"
                          placeholderTextColor="#94A3B8"
                          style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                        />
                        <TextInput
                          value={externalDraft.company}
                          onChangeText={(v) => setExternalDraft((p) => ({ ...(p || {}), company: v }))}
                          placeholder="Företag"
                          placeholderTextColor="#94A3B8"
                          style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                        />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                        <TextInput
                          value={externalDraft.email}
                          onChangeText={(v) => setExternalDraft((p) => ({ ...(p || {}), email: v }))}
                          placeholder="E-post"
                          placeholderTextColor="#94A3B8"
                          autoCapitalize="none"
                          style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                        />
                        <TextInput
                          value={externalDraft.phone}
                          onChangeText={(v) => setExternalDraft((p) => ({ ...(p || {}), phone: v }))}
                          placeholder="Telefon"
                          placeholderTextColor="#94A3B8"
                          style={{ flexGrow: 1, flexBasis: 220, borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                        />
                      </View>
                      <TextInput
                        value={externalDraft.role}
                        onChangeText={(v) => setExternalDraft((p) => ({ ...(p || {}), role: v }))}
                        placeholder="Roll"
                        placeholderTextColor="#94A3B8"
                        style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, fontSize: 13, color: COLORS.text, backgroundColor: '#fff', ...(Platform.OS === 'web' ? { outline: 'none' } : {}) }}
                      />

                      <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'flex-end' }}>
                        {!externalEditingId ? null : (
                          <Pressable
                            onPress={() => {
                              setExternalEditingId(null);
                              setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
                            }}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: '#CBD5E1',
                              backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                            })}
                          >
                            <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textMuted }}>Avbryt</Text>
                          </Pressable>
                        )}

                        <Pressable
                          onPress={() => {
                            const name = String(externalDraft?.name || '').trim();
                            if (!name) return;
                            const nextPayload = {
                              id: externalEditingId ? String(externalEditingId) : uuidv4(),
                              origin: 'external',
                              refKey: null,
                              name,
                              company: String(externalDraft?.company || '').trim(),
                              email: String(externalDraft?.email || '').trim(),
                              phone: String(externalDraft?.phone || '').trim(),
                              role: String(externalDraft?.role || '').trim(),
                              notification: { enabled: false },
                            };

                            setParticipantsValue((prev) => {
                              const current = Array.isArray(prev) ? prev : [];
                              if (externalEditingId) {
                                return normalizeParticipants(
                                  current.map((p) => (String(p?.id || '') === String(externalEditingId) ? { ...p, ...nextPayload } : p))
                                );
                              }
                              return normalizeParticipants([...current, nextPayload]);
                            });

                            setExternalEditingId(null);
                            setExternalDraft({ id: null, name: '', company: '', email: '', phone: '', role: '' });
                          }}
                          style={({ hovered, pressed }) => ({
                            paddingVertical: 8,
                            paddingHorizontal: 12,
                            borderRadius: 10,
                            backgroundColor: hovered || pressed ? COLORS.blueHover : COLORS.blue,
                          })}
                        >
                          <Text style={{ fontSize: 12, fontWeight: FW_MED, color: '#fff' }}>{externalEditingId ? 'Spara' : 'Lägg till'}</Text>
                        </Pressable>
                      </View>
                    </View>
                  </View>
                )}
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

export default function TidsplanViktigaDatumView({ projectId, companyId, project, hidePageHeader = false }) {
  const todayIso = React.useMemo(() => toIsoDate(new Date()), []);

  const [items, setItems] = React.useState(() => []);
  const typeCountersRef = React.useRef({});

  const scrollRef = React.useRef(null);
  const scrollYRef = React.useRef(0);
  const rowRefsRef = React.useRef({});

  const [selectedIso, setSelectedIso] = React.useState('');
  const [flashIso, setFlashIso] = React.useState('');
  const flashTimerRef = React.useRef(null);

  const {
    groups: organisationGroups,
    loading: organisationLoading,
    error: organisationError,
  } = useProjectOrganisation({ companyId, projectId });
  const [contactCandidates, setContactCandidates] = React.useState(() => ({ loading: false, error: '', list: [] }));

  React.useEffect(() => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setContactCandidates({ loading: false, error: '', list: [] });
      return;
    }

    let cancelled = false;
    (async () => {
      setContactCandidates({ loading: true, error: '', list: [] });
      try {
        const contacts = await fetchCompanyContacts(cid);
        const list = (Array.isArray(contacts) ? contacts : [])
          .map((c) => {
            const refId = String(c?.id || '').trim();
            if (!refId) return null;
            const companyName = String(c?.contactCompanyName || c?.companyName || cid).trim();
            return {
              origin: 'contact_registry',
              refKey: `contact:${refId}`,
              name: String(c?.name || '—').trim(),
              company: companyName,
              email: String(c?.email || '').trim(),
              phone: String(c?.phone || '').trim(),
              role: String(c?.role || '').trim(),
              groupTitle: '',
            };
          })
          .filter(Boolean);

        if (!cancelled) setContactCandidates({ loading: false, error: '', list });
      } catch (e) {
        if (!cancelled) setContactCandidates({ loading: false, error: String(e?.message || e || 'Kunde inte ladda kontakter.'), list: [] });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const orgCandidates = React.useMemo(() => {
    const out = [];
    const groups = Array.isArray(organisationGroups) ? organisationGroups : [];
    groups.forEach((g) => {
      const groupTitle = String(g?.title || '').trim();
      const members = Array.isArray(g?.members) ? g.members : [];
      members.forEach((m) => {
        const refSource = String(m?.source || '').trim();
        const refId = String(m?.refId || '').trim();
        if (!refSource || !refId) return;
        out.push({
          origin: 'project_org',
          refKey: `${refSource}:${refId}`,
          name: String(m?.name || '—').trim(),
          company: String(m?.company || '').trim(),
          email: String(m?.email || '').trim(),
          phone: String(m?.phone || '').trim(),
          role: String(m?.role || '').trim(),
          groupTitle,
        });
      });
    });
    return out;
  }, [organisationGroups]);

  const peopleCandidates = React.useMemo(() => {
    const org = Array.isArray(orgCandidates) ? orgCandidates : [];
    const contacts = Array.isArray(contactCandidates?.list) ? contactCandidates.list : [];
    const seen = {};

    const merged = [];
    org.forEach((c) => {
      const rk = String(c?.refKey || '').trim();
      if (!rk) return;
      if (seen[rk]) return;
      seen[rk] = true;
      merged.push(c);
    });
    contacts.forEach((c) => {
      const rk = String(c?.refKey || '').trim();
      if (!rk) return;
      if (seen[rk]) return;
      seen[rk] = true;
      merged.push(c);
    });
    return merged;
  }, [orgCandidates, contactCandidates?.list]);

  const [modalState, setModalState] = React.useState(() => ({
    open: false,
    initial: null,
  }));

  const sortedItems = React.useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const withSortKey = list.map((it) => {
      const iso = isValidIsoDate(it?.date) ? String(it.date) : '9999-12-31';
      return { ...it, _sortKey: iso };
    });
    return withSortKey
      .sort((a, b) => {
        if (a._sortKey < b._sortKey) return -1;
        if (a._sortKey > b._sortKey) return 1;
        return String(a?.title || '').localeCompare(String(b?.title || ''), 'sv');
      })
      .map(({ _sortKey, ...rest }) => rest);
  }, [items]);

  const flashSelection = React.useCallback((iso) => {
    const value = isValidIsoDate(iso) ? String(iso) : '';
    if (!value) return;
    setFlashIso(value);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashIso(''), 1200);
  }, []);

  React.useEffect(() => {
    return () => {
      if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    };
  }, []);

  const scrollToItemId = React.useCallback((id) => {
    const sid = String(id || '').trim();
    if (!sid) return;

    const row = rowRefsRef.current?.[sid];
    const scroller = scrollRef.current;
    if (!row || !scroller || typeof row.measure !== 'function' || typeof scroller.scrollTo !== 'function' || typeof scroller.measure !== 'function') {
      return;
    }

    const run = () => {
      try {
        row.measure((x, y, width, height, pageX, pageY) => {
          scroller.measure((sx, sy, sw, sh, sPageX, sPageY) => {
            const offsetTop = 84;
            const targetY = (Number(pageY || 0) - Number(sPageY || 0)) + Number(scrollYRef.current || 0) - offsetTop;
            scroller.scrollTo({ y: Math.max(0, targetY), animated: true });
          });
        });
      } catch {
        // no-op
      }
    };

    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
  }, []);

  const scrollToFirstItemForIso = React.useCallback((iso) => {
    const targetIso = isValidIsoDate(iso) ? String(iso) : '';
    if (!targetIso) return;
    const list = Array.isArray(sortedItems) ? sortedItems : [];
    const match = list.find((it) => String(it?.date || '').trim() === targetIso);
    if (!match) return;
    scrollToItemId(match.id);
  }, [sortedItems, scrollToItemId]);

  const openAddGeneric = React.useCallback(() => {
    setModalState({
      open: true,
      initial: {
        id: null,
        date: todayIso,
        dates: [],
        title: '',
        type: 'Milstolpe',
        typeLocked: false,
        description: '',
        allowMulti: false,
        baseNumber: 1,
        participants: [],
      },
    });
  }, [todayIso]);

  const openQuick = React.useCallback((typeKey, allowMulti) => {
    const next = Number(typeCountersRef.current?.[typeKey] || 1);
    setModalState({
      open: true,
      initial: {
        id: null,
        date: todayIso,
        dates: [],
        title: `${typeKey} ${next}`,
        type: typeKey,
        typeLocked: true,
        description: '',
        allowMulti: !!allowMulti,
        baseNumber: next,
        participants: [],
      },
    });
  }, [todayIso]);

  const openEdit = React.useCallback((it) => {
    if (!it) return;
    setModalState({
      open: true,
      initial: {
        id: String(it.id || ''),
        date: isValidIsoDate(it?.date) ? String(it.date) : todayIso,
        dates: [],
        title: String(it?.title || ''),
        type: String(it?.type || 'Milstolpe'),
        typeLocked: false,
        description: String(it?.description || ''),
        allowMulti: false,
        baseNumber: 1,
        participants: normalizeParticipants(it?.participants),
      },
    });
  }, [todayIso]);

  const closeModal = React.useCallback(() => {
    setModalState({ open: false, initial: null });
  }, []);

  const onSaveModal = React.useCallback((payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const ty = String(p.type || '').trim();
    const t = String(p.title || '').trim();
    const desc = String(p.description || '').trim();
    const participants = normalizeParticipants(p.participants);

    if (!ty || !t) {
      closeModal();
      return;
    }

    // Multi-date: create one item per date with incrementing titles.
    if (p.allowMulti) {
      const selected = dedupeSortedDates(p.dates);
      if (selected.length === 0) {
        closeModal();
        return;
      }

      const baseNumber = Number(p.baseNumber || 1);
      const base = splitTrailingNumber(t).base || ty;

      const multiItems = Array.isArray(p.multiItems) ? p.multiItems : null;
      const multiByDate = {};
      (multiItems || []).forEach((mi) => {
        const iso = isValidIsoDate(mi?.date) ? String(mi.date) : '';
        if (!iso) return;
        multiByDate[iso] = mi;
      });

      const newItems = selected.map((iso, idx) => {
        const mi = multiByDate[iso];
        const miTitle = String(mi?.title || '').trim();
        const itemTitle = miTitle || `${base} ${baseNumber + idx}`;
        const itemParticipants = normalizeParticipants(mi?.participants != null ? mi.participants : participants);
        return {
          id: uuidv4(),
          date: iso,
          title: itemTitle,
          type: ty,
          description: desc,
          participants: itemParticipants,
        };
      });

      typeCountersRef.current[ty] = baseNumber + selected.length;
      setItems((prev) => [...(Array.isArray(prev) ? prev : []), ...newItems]);
      closeModal();
      return;
    }

    // Single date: update existing or add new.
    const iso = isValidIsoDate(p.date) ? String(p.date) : '';
    if (!iso) {
      closeModal();
      return;
    }

    if (p.id) {
      const id = String(p.id);
      setItems((prev) => (Array.isArray(prev) ? prev : []).map((it) => (String(it?.id || '') === id ? { ...it, date: iso, title: t, type: ty, description: desc, participants } : it)));
      closeModal();
      return;
    }

    // New single item.
    const nextNumber = Number(p.baseNumber || 1);
    if (p.typeLocked) {
      typeCountersRef.current[ty] = nextNumber + 1;
    }

    setItems((prev) => [
      ...(Array.isArray(prev) ? prev : []),
      { id: uuidv4(), date: iso, title: t, type: ty, description: desc, participants },
    ]);
    closeModal();
  }, [closeModal]);

  const onDeleteModal = React.useCallback(() => {
    const id = String(modalState?.initial?.id || '').trim();
    if (!id) {
      closeModal();
      return;
    }
    setItems((prev) => (Array.isArray(prev) ? prev : []).filter((it) => String(it?.id || '') !== id));
    closeModal();
  }, [modalState?.initial?.id, closeModal]);

  const projectLabel = React.useMemo(() => {
    if (hidePageHeader) return '';
    const num = String(project?.projectNumber || project?.number || project?.id || '').trim();
    const rawName = String(project?.projectName || project?.name || '').trim();
    if (!num && !rawName) return '';
    if (!num) return rawName;
    if (!rawName) return num;
    if (rawName.startsWith(num)) {
      let rest = rawName.slice(num.length).trim();
      if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) rest = rest.slice(1).trim();
      if (rest) return `${num} — ${rest}`;
    }
    return `${num} — ${rawName}`;
  }, [project]);

  return (
    <ScrollView
      ref={scrollRef}
      style={{ flex: 1, minHeight: 0, backgroundColor: '#fff' }}
      keyboardShouldPersistTaps="handled"
      scrollEventThrottle={16}
      onScroll={(e) => {
        const y = e?.nativeEvent?.contentOffset?.y;
        if (typeof y === 'number' && Number.isFinite(y)) scrollYRef.current = y;
      }}
      contentContainerStyle={{ paddingVertical: 18, paddingHorizontal: 18, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
    >
      <View style={{ width: '100%', maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'flex-start' }}>
        {!hidePageHeader ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
            <Ionicons name="calendar-outline" size={22} color={COLORS.blue} style={{ marginRight: 10 }} />
            <View style={{ minWidth: 0, flex: 1 }}>
              <Text style={[PROJECT_TYPOGRAPHY.viewTitle, { color: COLORS.text, fontWeight: FW_MED }]} numberOfLines={1}>
                Tidsplan och viktiga datum
              </Text>
              <Text style={{ fontSize: 13, color: COLORS.textSubtle, marginTop: 2 }} numberOfLines={1}>
                Viktiga datum för projektet
              </Text>
              {projectLabel ? (
                <Text style={{ fontSize: 13, color: COLORS.textSubtle, marginTop: 2 }} numberOfLines={1}>
                  {projectLabel}
                </Text>
              ) : null}
            </View>
          </View>
        ) : null}

        <Text style={[PROJECT_TYPOGRAPHY.introText, { color: COLORS.textMuted, marginBottom: 14 }]}>
          Lägg in viktiga datum för projektet. Datum sorteras automatiskt och får status baserat på dagens datum.
        </Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
          <Text style={[PROJECT_TYPOGRAPHY.sectionHeading, { color: COLORS.text, fontWeight: FW_MED }]}>Datumlista</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {QUICK_TYPES.map((qt) => (
              <Pressable
                key={qt.key}
                onPress={() => openQuick(qt.key, qt.multi)}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 7,
                  paddingHorizontal: 10,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: COLORS.borderStrong,
                  backgroundColor: hovered || pressed ? '#F1F5F9' : '#fff',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                })}
              >
                <Ionicons name={qt.icon} size={15} color={COLORS.textSubtle} />
                <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>{qt.key}</Text>
              </Pressable>
            ))}

            <Pressable
              onPress={openAddGeneric}
              style={({ hovered, pressed }) => ({
                paddingVertical: 7,
                paddingHorizontal: 12,
                borderRadius: 10,
                backgroundColor: hovered || pressed ? COLORS.blueHover : COLORS.blue,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              })}
            >
              <Ionicons name="add-outline" size={16} color="#fff" />
              <Text style={{ fontSize: 12, fontWeight: FW_MED, color: '#fff' }}>Lägg till datum</Text>
            </Pressable>
          </View>
        </View>

        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', backgroundColor: '#fff' }}>
            <Text style={{ width: 110, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Datum</Text>
            <Text style={{ flexGrow: 0, flexShrink: 1, flexBasis: 360, minWidth: 0, maxWidth: 380, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Titel</Text>
            <Text style={{ width: 120, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Typ</Text>
            <Text style={{ width: 86, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Deltagare</Text>
            <Text style={{ width: 92, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Status</Text>
            <View style={{ width: 30 }} />
          </View>

          {sortedItems.length === 0 ? (
            <View style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga datum ännu.</Text>
              <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginTop: 6 }}>
                Lägg till datum för möten, platsbesök och milstolpar – de visas automatiskt i kalendern.
              </Text>
            </View>
          ) : (
            sortedItems.map((it) => {
              const iso = isValidIsoDate(it?.date) ? String(it.date) : '';
              const status = iso ? statusForIso(iso, todayIso) : null;
              const badge = statusBadgeStyle(status);
              const participantCount = Array.isArray(it?.participants) ? it.participants.length : 0;

              const isSelected = !!iso && iso === selectedIso;
              const isFlashing = !!iso && iso === flashIso;

              return (
                <Pressable
                  key={String(it.id)}
                  ref={(r) => {
                    const id = String(it?.id || '').trim();
                    if (!id) return;
                    if (!r) delete rowRefsRef.current[id];
                    else rowRefsRef.current[id] = r;
                  }}
                  onPress={() => {
                    if (!iso) return;
                    setSelectedIso(iso);
                    flashSelection(iso);
                  }}
                  style={({ hovered, pressed }) => ({
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: '#EEF2F7',
                    backgroundColor: isFlashing
                      ? 'rgba(25, 118, 210, 0.16)'
                      : (isSelected ? 'rgba(25, 118, 210, 0.10)' : (hovered || pressed ? COLORS.rowHover : '#fff')),
                  })}
                >
                  <Text style={{ width: 110, fontSize: 13, color: COLORS.text, fontWeight: FW_REG }}>
                    {iso || '—'}
                  </Text>

                  <Text style={{ flexGrow: 0, flexShrink: 1, flexBasis: 360, minWidth: 0, maxWidth: 380, fontSize: 13, color: COLORS.text, fontWeight: FW_REG }} numberOfLines={1}>
                    {String(it?.title || '—')}
                  </Text>

                  <Text style={{ width: 120, fontSize: 13, color: COLORS.textMuted }} numberOfLines={1}>
                    {String(it?.type || '—')}
                  </Text>

                  <View style={{ width: 86, alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'flex-start', gap: 6 }}>
                    {participantCount > 0 ? (
                      <>
                        <Ionicons name="people-outline" size={14} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 13, color: COLORS.textSubtle, fontWeight: FW_MED }}>{participantCount}</Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 11, color: COLORS.textSubtle }}>—</Text>
                    )}
                  </View>

                  <View style={{ width: 92, alignItems: 'flex-start' }}>
                    {!status ? (
                      <Text style={{ fontSize: 11, color: COLORS.textSubtle }}>—</Text>
                    ) : (
                      <View style={{ paddingVertical: 3, paddingHorizontal: 6, borderRadius: 999, backgroundColor: badge.bg, borderWidth: 1, borderColor: badge.border }}>
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: badge.text }}>{statusLabel(status)}</Text>
                      </View>
                    )}
                  </View>

                  <View style={{ width: 30, alignItems: 'flex-end' }}>
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEdit(it);
                      }}
                      hitSlop={8}
                      style={({ hovered, pressed }) => ({
                        padding: 4,
                        borderRadius: 8,
                        backgroundColor: hovered || pressed ? '#F1F5F9' : 'transparent',
                      })}
                    >
                      <Ionicons name="create-outline" size={16} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <CompactMonthCalendar
          items={sortedItems}
          todayIso={todayIso}
          onPressItem={openEdit}
          selectedIso={selectedIso}
          flashIso={flashIso}
          onPressDay={(iso, dayItems) => {
            const targetIso = isValidIsoDate(iso) ? String(iso) : '';
            setSelectedIso(targetIso);
            if (targetIso) flashSelection(targetIso);
            const list = Array.isArray(dayItems) ? dayItems : [];
            if (list.length > 0 && targetIso) scrollToFirstItemForIso(targetIso);
          }}
          colors={COLORS}
          maxWidth={980}
          typography={{
            headerTitleStyle: { fontWeight: FW_MED },
            navTextStyle: { fontWeight: FW_MED },
            navTodayTextStyle: { fontWeight: FW_MED },
            monthLabelStyle: { fontWeight: FW_MED },
            weekdayLabelStyle: { fontWeight: FW_MED },
            dayNumberStyle: { fontWeight: FW_MED, color: COLORS.text },
            plusTextStyle: { fontWeight: FW_MED },
            eventTitleStyle: { fontSize: 13, fontWeight: FW_REG, color: COLORS.text },
            eventTypeStyle: { fontSize: 12, fontWeight: FW_REG, color: COLORS.textSubtle },
            moreTextStyle: { fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle },
          }}
          options={{ todayDayNumberUsesAccentText: false, neutralEventText: true }}
        />
      </View>

      <DateModal
        visible={!!modalState?.open}
        initial={modalState?.initial}
        onClose={closeModal}
        onSave={onSaveModal}
        onDelete={onDeleteModal}
        peopleCandidates={peopleCandidates}
        peopleLoading={!!contactCandidates?.loading || !!organisationLoading}
        peopleError={String(contactCandidates?.error || organisationError || '').trim()}
      />
    </ScrollView>
  );
}
