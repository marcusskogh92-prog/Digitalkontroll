/**
 * DateModal
 *
 * Extracted from TidsplanViktigaDatumView as a pure structural split.
 * No intended behavior/UI changes.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Alert, Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import ActivityParticipantPickerModal from '../../../../../../../../../components/common/ActivityParticipants/ActivityParticipantPickerModal';
import IsoDatePickerModal from '../../../../../../../../../components/common/Modals/IsoDatePickerModal';

import TimeField, { isValidTimeHHMM, timeToMinutes } from './TimeField';

const DEFAULT_COLORS = {
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

const DEFAULT_FW_REG = '400';
const DEFAULT_FW_MED = '500';

const TYPE_OPTIONS = [
  { key: 'Platsbesök', icon: 'walk-outline', multi: true },
  { key: 'Kalkylmöte', icon: 'people-outline', multi: true },
  { key: 'Möte med UE', icon: 'briefcase-outline', multi: true },
  { key: 'Internt möte', icon: 'chatbox-ellipses-outline', multi: true },
  { key: 'Anbudsinlämning', icon: 'paper-plane-outline', multi: false },
  { key: 'Valfritt möte', icon: 'options-outline', multi: true },
];

const SUBJECT_SUGGESTIONS = [
  'Platsbesök',
  'Kalkylmöte',
  'Möte med UE',
  'Internt möte',
  'Anbudsinlämning',
];

const MEETING_TYPES = new Set(['Kalkylmöte', 'Möte med UE', 'Internt möte']);

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
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

function formatTimeRangePlain(startTime, endTime) {
  const st = String(startTime || '').trim();
  const et = String(endTime || '').trim();
  if (isValidTimeHHMM(st) && isValidTimeHHMM(et)) return `${st}–${et}`;
  if (isValidTimeHHMM(st)) return st;
  return '';
}

function formatTimeLabel(startTime, endTime) {
  const range = formatTimeRangePlain(startTime, endTime);
  return range ? `kl. ${range}` : '';
}

function getMinEndDropdownMinutes(startTime) {
  const st = String(startTime || '').trim();
  if (!isValidTimeHHMM(st)) return null;
  const sm = timeToMinutes(st);
  if (sm == null) return null;
  const minEnd = sm + 30;
  // Dropdown options are in 30-minute increments; round up to the next available slot.
  return Math.ceil(minEnd / 30) * 30;
}

/** Format minutes since midnight as HH:MM (00:00–23:59). */
function minutesToHHMM(totalMinutes) {
  const m = Number(totalMinutes);
  if (!Number.isFinite(m)) return '';
  const wrapped = ((m % (24 * 60)) + (24 * 60)) % (24 * 60);
  const hh = String(Math.floor(wrapped / 60)).padStart(2, '0');
  const mm = String(wrapped % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Default start time for new meeting: next whole half-hour from now (08:12→08:30, 08:40→09:00). Never 00:00 or 07:00. */
function getDefaultStartTime() {
  const now = new Date();
  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  let nextSlot = Math.ceil(minutesFromMidnight / 30) * 30;
  if (nextSlot >= 24 * 60) nextSlot = 8 * 60;
  if (nextSlot === 0) nextSlot = 8 * 60;
  if (nextSlot === 7 * 60) nextSlot = 8 * 60;
  return minutesToHHMM(nextSlot);
}

const DEFAULT_DURATION_MINUTES = 60;

/** Build a Date on the given ISO date (YYYY-MM-DD) at HH:MM. Never pass undefined/empty. */
function hhmmToDate(isoDate, hhmmStr) {
  const iso = String(isoDate || '').trim();
  const t = String(hhmmStr || '').trim();
  if (!isValidIsoDate(iso) || !isValidTimeHHMM(t)) return null;
  const parts = t.split(':');
  const hh = parseInt(parts[0], 10);
  const mm = parseInt(parts[1], 10);
  const dateParts = iso.split('-');
  const y = parseInt(dateParts[0], 10);
  const mo = parseInt(dateParts[1], 10);
  const d = parseInt(dateParts[2], 10);
  if (!Number.isFinite(hh) || !Number.isFinite(mm) || !Number.isFinite(y) || !Number.isFinite(mo) || !Number.isFinite(d)) return null;
  return new Date(y, mo - 1, d, hh, mm, 0, 0);
}

/** Add minutes to a Date. Returns new Date. */
function addMinutes(date, minutes) {
  if (!(date instanceof Date) || !Number.isFinite(Number(minutes))) return null;
  const d = new Date(date.getTime());
  d.setMinutes(d.getMinutes() + Number(minutes));
  return d;
}

/** Format Date as HH:MM (minutes/seconds zero). */
function dateToHHMM(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const hh = String(date.getHours()).padStart(2, '0');
  const mm = String(date.getMinutes()).padStart(2, '0');
  return `${hh}:${mm}`;
}

/** Default start as Date (today, next half-hour). Never 00:00 or 07:00. */
function getDefaultStartDateTime() {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = now.getDate();
  const minutesFromMidnight = now.getHours() * 60 + now.getMinutes();
  let nextSlot = Math.ceil(minutesFromMidnight / 30) * 30;
  if (nextSlot >= 24 * 60) nextSlot = 8 * 60;
  if (nextSlot === 0) nextSlot = 8 * 60;
  if (nextSlot === 7 * 60) nextSlot = 8 * 60;
  return new Date(y, m, d, Math.floor(nextSlot / 60), nextSlot % 60, 0, 0);
}

function participantCountLabel(count) {
  const n = Number(count || 0) || 0;
  if (n <= 0) return 'Inga deltagare valda';
  if (n === 1) return '1 deltagare vald';
  return `${n} deltagare valda`;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmailLight(value) {
  const e = String(value || '').trim();
  return e.includes('@');
}

function SubjectComboField({ value, onChange, colors, fwMed, disabled }) {
  const v = String(value || '');
  const chips = SUBJECT_SUGGESTIONS;
  const CHIPS_ROW_HEIGHT = 34;
  const isDisabled = !!disabled;

  return (
    <View style={{ width: '100%' }}>
      <TextInput
        value={v}
        onChangeText={isDisabled ? undefined : onChange}
        editable={!isDisabled}
        placeholder="Exempel: Platsbesök stomme, Extra möte – stomlösning, Genomgång UE el"
        placeholderTextColor="#94A3B8"
        style={{
          borderWidth: 1,
          borderColor: '#E2E8F0',
          borderRadius: 10,
          paddingVertical: 9,
          paddingHorizontal: 10,
          fontSize: 13,
          color: isDisabled ? colors.textSubtle : colors.text,
          backgroundColor: isDisabled ? '#F1F5F9' : '#fff',
          ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
        }}
      />

      {/* Inline suggestions (fixed-height, no overlay, no dynamic expand). */}
      <View style={{ marginTop: 8, height: CHIPS_ROW_HEIGHT, justifyContent: 'center' }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', paddingRight: 4 }}>
            {chips.map((label) => {
              const isSelected = String(label) === String(v || '').trim();
              return (
                <Pressable
                  key={label}
                  onPress={() => {
                    if (isDisabled) return;
                    onChange?.(label);
                  }}
                  disabled={isDisabled}
                  style={({ hovered, pressed }) => ({
                    height: 28,
                    paddingHorizontal: 10,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: isSelected ? colors.blue : '#CBD5E1',
                    backgroundColor: isDisabled ? '#F1F5F9' : (hovered || pressed ? '#F1F5F9' : '#fff'),
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    opacity: isDisabled ? 0.75 : 1,
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: fwMed, color: isSelected ? colors.blue : colors.textSubtle }} numberOfLines={1}>
                    {label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

function participantLabel(p) {
  const name = String(p?.name || '').trim();
  const email = String(p?.email || '').trim();
  return name || email || '—';
}

function normalizeParticipants(raw) {
  const list = Array.isArray(raw) ? raw : [];
  const seen = new Set();
  const out = [];

  for (const p of list) {
    const name = String(p?.name || '').trim();
    const email = normalizeEmail(p?.email);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    out.push({ name, email });
  }

  out.sort((a, b) => `${normalizeSearch(a.name)}|${a.email}`.localeCompare(`${normalizeSearch(b.name)}|${b.email}`, 'sv'));
  return out;
}

function OccurrenceEditModal({
  visible,
  label,
  iso,
  title,
  onChangeTitle,
  startTime,
  endTime,
  onChangeStartTime,
  onChangeEndTime,
  participants,
  onChangeParticipants,
  onEditParticipants,
  onCopyFromFirst,
  canCopyFromFirst,
  copyFromFirstLabel,
  onClose,
  colors,
  fwReg,
  fwMed,
}) {
  const minEndDropdownMinutes = React.useMemo(() => getMinEndDropdownMinutes(startTime), [startTime]);

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
                <Text style={{ fontSize: 14, fontWeight: fwMed, color: colors.text }} numberOfLines={1}>
                  {label}
                </Text>
                <Text style={{ fontSize: 12, color: colors.textSubtle, marginTop: 2 }} numberOfLines={1}>
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
              <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Titel</Text>
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

            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Tid (valfritt men rekommenderat)</Text>
              <View style={{ flexDirection: 'row', gap: 10, flexWrap: 'wrap' }}>
                <TimeField label="Starttid" value={startTime} onChange={onChangeStartTime} colors={colors} fwReg={fwReg} fwMed={fwMed} />
                <TimeField
                  label="Sluttid"
                  value={endTime}
                  onChange={onChangeEndTime}
                  minDropdownMinutes={minEndDropdownMinutes}
                  colors={colors}
                  fwReg={fwReg}
                  fwMed={fwMed}
                />
              </View>
              <Text style={{ fontSize: 12, color: colors.textSubtle }}>
                {formatTimeLabel(startTime, endTime) ? `Visas som ${formatTimeLabel(startTime, endTime)}.` : 'Lämna tomt om tid inte är relevant.'}
              </Text>
            </View>

            <View style={{ gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Deltagare</Text>
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
                      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>
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
                      borderColor: colors.blue,
                      backgroundColor: hovered || pressed ? colors.blueHover : colors.blue,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    })}
                  >
                    <Ionicons name="people-outline" size={15} color="#fff" />
                    <Text style={{ fontSize: 12, fontWeight: fwMed, color: '#fff' }}>Lägg till deltagare</Text>
                  </Pressable>
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.bgMuted, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                  <Text style={{ flex: 1.2, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle }}>Namn</Text>
                  <Text style={{ flex: 1.4, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle }}>E-post</Text>
                  <Text style={{ width: 34, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle, textAlign: 'right' }} />
                </View>

                {(Array.isArray(participants) ? participants : []).length === 0 ? (
                  <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                    <Text style={{ fontSize: 13, color: '#64748B' }}>Inga deltagare valda.</Text>
                  </View>
                ) : (
                  <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
                    {(Array.isArray(participants) ? participants : []).map((p) => {
                      const name = String(p?.name || '').trim();
                      const email = String(p?.email || '').trim();

                      return (
                        <View key={email} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', gap: 10 }}>
                          <Text style={{ flex: 1.2, fontSize: 13, fontWeight: fwReg, color: colors.text }} numberOfLines={1}>
                            {name || '—'}
                          </Text>
                          <Text style={{ flex: 1.4, fontSize: 13, color: colors.textMuted }} numberOfLines={1}>
                            {email}
                          </Text>
                          <Pressable
                            onPress={() => {
                              const target = normalizeEmail(email);
                              const next = (Array.isArray(participants) ? participants : []).filter((x) => normalizeEmail(x?.email) !== target);
                              onChangeParticipants?.(next);
                            }}
                            style={({ hovered, pressed }) => ({
                              width: 34,
                              alignItems: 'flex-end',
                              opacity: hovered || pressed ? 0.9 : 1,
                            })}
                          >
                            <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                          </Pressable>
                        </View>
                      );
                    })}
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
              <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textMuted }}>Klar</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function DateModal({
  visible,
  initial,
  onClose,
  onSave,
  onDelete,
  onUnlockDate,
  peopleCandidates,
  peopleLoading,
  peopleError,
  colors = DEFAULT_COLORS,
  fwReg = DEFAULT_FW_REG,
  fwMed = DEFAULT_FW_MED,
}) {
  const safeOnClose = typeof onClose === 'function' ? onClose : () => {};
  const safeOnSave = typeof onSave === 'function' ? onSave : () => {};
  const safeOnDelete = typeof onDelete === 'function' ? onDelete : () => {};
  const safeOnUnlockDate = typeof onUnlockDate === 'function' ? onUnlockDate : async () => {};

  const isProjectInfo = React.useMemo(() => {
    const s = String(initial?.source || '').trim();
    return s === 'projectinfo' || s === 'projectInformation';
  }, [initial?.source]);
  const initialDateLocked = React.useMemo(() => {
    if (!isProjectInfo) return false;
    // Backwards compatibility: treat missing locked as locked.
    if (typeof initial?.locked === 'boolean') return initial.locked;
    return true;
  }, [initial?.locked, isProjectInfo]);

  const [dateLocked, setDateLocked] = React.useState(false);
  const lockTooltip = 'Datumet styrs från Projektinformationen';
  const subjectLocked = isProjectInfo; // Always locked for projectstyrda datum.

  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [date, setDate] = React.useState('');
  const [startDateTime, setStartDateTime] = React.useState(null);
  const [endDateTime, setEndDateTime] = React.useState(null);
  const [dates, setDates] = React.useState([]);
  const [allowMulti, setAllowMulti] = React.useState(false);
  const [baseNumber, setBaseNumber] = React.useState(1);
  const [datePickerOpen, setDatePickerOpen] = React.useState(false);
  const [activeDropdown, setActiveDropdown] = React.useState(null);
  const [startManuallyEdited, setStartManuallyEdited] = React.useState(false);
  const [endTimeManuallyEdited, setEndTimeManuallyEdited] = React.useState(false);

  const [multiDrafts, setMultiDrafts] = React.useState(() => ({}));
  const [participantsTargetIso, setParticipantsTargetIso] = React.useState(null);

  const [occurrenceEdit, setOccurrenceEdit] = React.useState(() => ({ open: false, iso: '', idx: -1 }));

  const [participants, setParticipants] = React.useState([]);
  const [participantsModalOpen, setParticipantsModalOpen] = React.useState(false);

  const handleClose = React.useCallback(() => {
    setActiveDropdown(null);
    safeOnClose();
  }, [safeOnClose]);

  const warningColor = '#D97706';

  const todayIso = React.useMemo(() => {
    const d = new Date();
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }, []);

  const selectedDates = React.useMemo(() => {
    if (!allowMulti) return [];
    return dedupeSortedDates(dates);
  }, [allowMulti, dates]);

  const isSeries = React.useMemo(() => allowMulti && selectedDates.length > 1, [allowMulti, selectedDates]);

  const showPastDateWarning = React.useMemo(() => {
    if (!isValidIsoDate(todayIso)) return false;

    if (isSeries) {
      const list = Array.isArray(selectedDates) ? selectedDates : [];
      return list.some((iso) => isValidIsoDate(iso) && String(iso) < todayIso);
    }

    const d = String(date || '').trim();
    if (!isValidIsoDate(d)) return false;
    return d < todayIso;
  }, [date, isSeries, selectedDates, todayIso]);

  React.useEffect(() => {
    // Reset lock state when opening/editing a new item.
    setDateLocked(!!initialDateLocked);
  }, [initial?.id, initialDateLocked, visible]);

  const requestUnlockDate = React.useCallback(() => {
    const msg = 'Om du låser upp detta datum kommer ändringen även uppdatera Projektinformationen.';

    if (Platform.OS === 'web') {
      try {
        // RN-web Alert buttons can be unreliable; use confirm.
        const ok = typeof window !== 'undefined' && typeof window.confirm === 'function' ? window.confirm(msg) : true;
        if (!ok) return;
      } catch (_e) {
        // If confirm fails, fall back to unlocking directly.
      }

      (async () => {
        try {
          await safeOnUnlockDate();
          setDateLocked(false);
        } catch (_e) {
          try {
            Alert.alert('Kunde inte låsa upp', 'Försök igen.');
          } catch {
            // no-op
          }
        }
      })();
      return;
    }

    Alert.alert(
      'Lås upp datum',
      msg,
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Lås upp och redigera',
          style: 'default',
          onPress: async () => {
            try {
              await safeOnUnlockDate();
              setDateLocked(false);
            } catch (_e) {
              Alert.alert('Kunde inte låsa upp', 'Försök igen.');
            }
          },
        },
      ]
    );
  }, [safeOnUnlockDate]);

  const startTime = React.useMemo(() => (startDateTime ? dateToHHMM(startDateTime) : ''), [startDateTime]);
  const endTime = React.useMemo(() => (endDateTime ? dateToHHMM(endDateTime) : ''), [endDateTime]);

  const minEndDropdownMinutes = React.useMemo(() => getMinEndDropdownMinutes(startTime), [startTime]);

  const handleStartTimeChange = React.useCallback(
    (hhmm) => {
      const v = String(hhmm || '').trim();
      if (!isValidTimeHHMM(v)) return;
      const refDate = date || todayIso;
      if (!isValidIsoDate(refDate)) return;
      const nextStart = hhmmToDate(refDate, v);
      if (!nextStart) return;
      setStartDateTime(nextStart);
      setStartManuallyEdited(true);
      if (!endTimeManuallyEdited) {
        const nextEnd = addMinutes(nextStart, DEFAULT_DURATION_MINUTES);
        if (nextEnd) setEndDateTime(nextEnd);
      }
    },
    [date, endTimeManuallyEdited, todayIso]
  );

  const handleEndTimeChange = React.useCallback(
    (hhmm) => {
      const v = String(hhmm || '').trim();
      if (!isValidTimeHHMM(v)) return;
      const refDate = date || todayIso;
      if (!isValidIsoDate(refDate)) return;
      const nextEnd = hhmmToDate(refDate, v);
      if (!nextEnd) return;
      setEndDateTime(nextEnd);
      setEndTimeManuallyEdited(true);
      if (startDateTime && nextEnd.getTime() <= startDateTime.getTime()) {
        const nextStart = addMinutes(nextEnd, -DEFAULT_DURATION_MINUTES);
        if (nextStart) {
          setStartDateTime(nextStart);
          setStartManuallyEdited(true);
        }
      }
    },
    [date, startDateTime, todayIso]
  );

  const addDuration = React.useCallback(
    (minutes) => {
      if (!startDateTime) return;
      const baseEnd =
        endDateTime && endDateTime.getTime() > startDateTime.getTime()
          ? endDateTime
          : new Date(startDateTime.getTime() + 60 * 60000);
      setEndDateTime(new Date(baseEnd.getTime() + minutes * 60000));
      setEndTimeManuallyEdited(true);
    },
    [startDateTime, endDateTime]
  );

  const multiCapable = React.useMemo(() => {
    const t = String(title || '').trim();
    const opt = TYPE_OPTIONS.find((x) => String(x?.key || '').trim() === t);
    return !!opt?.multi;
  }, [title]);

  React.useEffect(() => {
    // Keep multi-date behavior aligned with the selected type.
    if (!allowMulti) return;
    if (multiCapable) return;
    setAllowMulti(false);
    setDates([]);
  }, [allowMulti, multiCapable]);

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

      const base = normalizeTitlePrefix(title) || 'Platsbesök';
      const bn = Number(baseNumber || 1);

      selectedDates.forEach((iso, idx) => {
        const existing = prevObj?.[iso] && typeof prevObj[iso] === 'object' ? prevObj[iso] : {};
        const nextTitle = String(existing?.title || '').trim() || `${base} ${bn + idx}`;
        const nextParticipants = Array.isArray(existing?.participants) ? existing.participants : [];
        next[iso] = {
          ...existing,
          title: nextTitle,
          participants: nextParticipants,
          startTime: String(existing?.startTime || '').trim(),
          endTime: String(existing?.endTime || '').trim(),
        };
      });

      return next;
    });
  }, [isSeries, selectedDates, title, baseNumber]);

  React.useEffect(() => {
    if (!isSeries) return;
    ensureMultiDrafts();
  }, [isSeries, ensureMultiDrafts]);

  const closeOccurrenceEdit = React.useCallback(() => setOccurrenceEdit({ open: false, iso: '', idx: -1 }), []);

  const openOccurrenceEdit = React.useCallback((iso, idx) => {
    if (activeDropdown) {
      setActiveDropdown(null);
      return;
    }
    const safeIso = isValidIsoDate(iso) ? String(iso) : '';
    if (!safeIso) return;
    setOccurrenceEdit({ open: true, iso: safeIso, idx: Number.isFinite(Number(idx)) ? Number(idx) : -1 });
  }, [activeDropdown]);

  // Default / init time: ONLY set here. Never set time from blur, focus, dropdown-state or empty value.
  React.useEffect(() => {
    if (!visible) return;

    if (initial?.id) {
      try {
        const refDate = initial?.date || todayIso;
        const st = String(initial?.startTime || '').trim();
        const et = String(initial?.endTime || '').trim();
        setStartDateTime(st ? hhmmToDate(refDate, st) : null);
        setEndDateTime(et ? hhmmToDate(refDate, et) : null);
        setStartManuallyEdited(false);
        setEndTimeManuallyEdited(!!et);
      } catch (_e) {
        // Invalid initial time data; leave start/end as-is.
      }
      return;
    }

    try {
      const start = getDefaultStartDateTime();
      const end = addMinutes(start, 60);
      if (start) setStartDateTime(start);
      if (end) setEndDateTime(end);
      setStartManuallyEdited(false);
      setEndTimeManuallyEdited(false);
    } catch (_e) {
      // Fallback if default time fails (e.g. invalid date); leave start/end as-is.
    }
  }, [visible, initial?.id]);

  React.useEffect(() => {
    if (!visible) return;

    const initTitle = String(initial?.title || '').trim();
    const initType = String(initial?.type || '').trim();
    const initDescription = String(initial?.description || '').trim();
    const initDate = String(initial?.date || '').trim();
    const initDates = dedupeSortedDates(initial?.dates);
    const initAllowMulti = initDates.length > 1;
    const initBaseNumber = Number(initial?.baseNumber || 1);

    setTitle(initTitle || initType);
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
          title: String(it?.title || it?.type || '').trim(),
          participants: normalizeParticipants(it?.participants),
          startTime: String(it?.startTime || '').trim(),
          endTime: String(it?.endTime || '').trim(),
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

    // Single entry point modal.

    setParticipantsTargetIso(null);
    setParticipantsModalOpen(false);
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

  const closeParticipantsModal = React.useCallback(() => {
    setParticipantsModalOpen(false);
    setParticipantsTargetIso(null);
  }, []);

  const canSave = React.useMemo(() => {
    const hasTitle = !!String(title || '').trim();
    if (isSeries) return selectedDates.length > 1 && hasTitle;
    return isValidIsoDate(date) && hasTitle;
  }, [isSeries, selectedDates, date, title]);

  const openParticipantsEditor = React.useCallback(
    (isoOrNull) => {
      if (activeDropdown) {
        setActiveDropdown(null);
        return;
      }
      setParticipantsTargetIso(isoOrNull);
      setParticipantsModalOpen(true);
    },
    [activeDropdown]
  );

  const occurrenceIso = String(occurrenceEdit?.iso || '').trim();
  const occurrenceIdx = React.useMemo(() => {
    const idx = Number(occurrenceEdit?.idx);
    if (Number.isFinite(idx) && idx >= 0) return idx;
    if (!occurrenceIso) return -1;
    return selectedDates.indexOf(occurrenceIso);
  }, [occurrenceEdit, occurrenceIso, selectedDates]);
  const occurrenceNumber = occurrenceIdx >= 0 ? occurrenceIdx + 1 : null;
  const occurrencePrefix = isMeetingType(title) ? String(title || 'Möte').trim() : 'Tillfälle';
  const occurrenceLabel = occurrenceNumber ? `${occurrencePrefix} ${occurrenceNumber}` : occurrencePrefix;
  const occurrenceDraft = occurrenceIso && multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[occurrenceIso] : null;
  const occurrenceTitle = String(occurrenceDraft?.title || '');
  const occurrenceParticipants = normalizeParticipants(occurrenceDraft?.participants);
  const occurrenceStartTime = String(occurrenceDraft?.startTime || '').trim();
  const occurrenceEndTime = String(occurrenceDraft?.endTime || '').trim();

  const firstIso = selectedDates[0] || '';
  const firstParticipants = normalizeParticipants(multiDrafts?.[firstIso]?.participants);
  const canCopyFromFirst = !!occurrenceIso && occurrenceIdx > 0 && !!firstIso && firstParticipants.length > 0;

  return (
    <>
      <Modal visible={!!visible} transparent animationType="fade" onRequestClose={handleClose}>
        <Pressable
          onPress={handleClose}
          style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.30)', padding: 16, justifyContent: 'center' }}
        >
          <Pressable
            onPress={(e) => e.stopPropagation()}
            style={{
              width: '100%',
              maxWidth: 820,
              height: Platform.OS === 'web' ? '90vh' : '90%',
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
            <View pointerEvents="box-none" style={{ flex: 1 }}>
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                  <Ionicons name="calendar-outline" size={18} color={colors.textSubtle} />
                  <View style={{ minWidth: 0, flex: 1 }}>
                    <Text style={{ fontSize: 14, fontWeight: fwMed, color: colors.text }} numberOfLines={1}>
                      {initial?.id ? 'Redigera datum' : 'Nytt datum'}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
                      Tidsplan och viktiga datum
                    </Text>
                  </View>
                </View>

                <Pressable
                  onPress={handleClose}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
                  })}
                >
                  <Ionicons name="close" size={18} color={colors.textSubtle} />
                </Pressable>
              </View>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14, gap: 12 }} keyboardShouldPersistTaps="handled">
              <View
                style={{
                  gap: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  backgroundColor: colors.bgMuted,
                }}
              >
                {initial?.outlookEventId ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, paddingHorizontal: 10, backgroundColor: 'rgba(25, 118, 210, 0.08)', borderRadius: 10, borderWidth: 1, borderColor: 'rgba(25, 118, 210, 0.22)' }}>
                    <Text style={{ fontSize: 14 }} accessibilityLabel="Info">🔄</Text>
                    <Text style={{ flex: 1, fontSize: 12, fontWeight: fwReg, color: colors.text }}>
                      Detta möte är kopplat till Outlook. Ändringar skickas som uppdaterad kallelse.
                    </Text>
                  </View>
                ) : null}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Rubrik / ämne</Text>
                  <SubjectComboField
                    value={title}
                    onChange={(v) => {
                      if (subjectLocked) return;
                      setTitle(v);
                    }}
                    colors={colors}
                    fwMed={fwMed}
                    disabled={subjectLocked}
                  />
                  <Text style={{ fontSize: 12, color: colors.textSubtle }}>
                    {subjectLocked
                      ? 'Rubriken är låst eftersom datumet kommer från Projektinformationen.'
                      : 'Skriv fri text eller välj ett förslag. Efter val kan texten redigeras fritt.'}
                  </Text>
                </View>

                <View style={{ gap: 8 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>{isSeries ? 'Datum + tid (flera)' : 'Datum + tid'}</Text>
                      {!isProjectInfo || !dateLocked || isSeries ? null : (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }} {...(Platform.OS === 'web' ? { title: lockTooltip } : {})}>
                        <Ionicons name="lock-closed-outline" size={16} color={colors.textSubtle} />
                          <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }} numberOfLines={1}>
                            Låst
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>

                  {!isSeries ? (
                    <Pressable
                      onPress={() => {
                        if (activeDropdown) {
                          setActiveDropdown(null);
                          return;
                        }
                        if (isProjectInfo && dateLocked) return;
                        setDatePickerOpen(true);
                      }}
                      disabled={isProjectInfo && dateLocked}
                      style={({ hovered, pressed }) => ({
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                        backgroundColor: (isProjectInfo && dateLocked) ? '#F1F5F9' : (hovered || pressed ? '#F8FAFC' : '#fff'),
                        opacity: (isProjectInfo && dateLocked) ? 0.85 : 1,
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fwReg, color: colors.text }} numberOfLines={1}>
                        {String(date || '').trim() || 'Välj datum'}
                        {formatTimeLabel(startTime, endTime) ? `  ${formatTimeLabel(startTime, endTime)}` : ''}
                      </Text>
                    </Pressable>
                  ) : (
                    <Pressable
                      onPress={() => {
                        if (activeDropdown) {
                          setActiveDropdown(null);
                          return;
                        }
                        setDatePickerOpen(true);
                      }}
                      style={({ hovered, pressed }) => ({
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        borderRadius: 10,
                        paddingVertical: 9,
                        paddingHorizontal: 10,
                        backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                      })}
                    >
                      <Text style={{ fontSize: 13, fontWeight: fwReg, color: colors.text }} numberOfLines={1}>
                        {selectedDates.length === 0 ? 'Välj datum' : selectedDates.join(', ')}
                      </Text>
                    </Pressable>
                  )}

                  {isSeries ? null : !isValidIsoDate(date) ? (
                    <Text style={{ fontSize: 12, color: colors.danger }}>Välj datum.</Text>
                  ) : null}

                  {!isSeries ? null : selectedDates.length === 0 ? (
                    <Text style={{ fontSize: 12, color: colors.danger }}>Välj datum.</Text>
                  ) : null}

                  {!isProjectInfo || !dateLocked || isSeries ? null : (
                    <View style={{ gap: 8 }}>
                      <Text style={{ fontSize: 12, fontWeight: fwReg, color: colors.textSubtle }}>
                        Datumet är låst eftersom det kommer från Projektinformationen.
                      </Text>
                      <Pressable
                        onPress={() => {
                          requestUnlockDate();
                        }}
                        style={({ hovered, pressed }) => ({
                          paddingVertical: 8,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          borderWidth: 1,
                          borderColor: hovered || pressed ? colors.blueHover : colors.blue,
                          backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : '#fff',
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: 8,
                        })}
                      >
                        <Ionicons name="lock-open-outline" size={16} color={colors.blue} />
                        <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.blue }}>
                          Lås upp och redigera datum
                        </Text>
                      </Pressable>
                    </View>
                  )}

                {!isProjectInfo || dateLocked || isSeries ? null : (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Ionicons name="lock-open-outline" size={16} color={colors.green} />
                    <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.green }}>
                      Datumet är upplåst och kan redigeras.
                    </Text>
                  </View>
                )}

                  {!showPastDateWarning ? null : (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                      <Text style={{ fontSize: 12, color: warningColor, marginTop: 1 }} accessibilityLabel="Varning">
                        ⚠️
                      </Text>
                      <Text style={{ flex: 1, fontSize: 12, fontWeight: fwReg, color: colors.textSubtle }}>
                        Det här datumet har redan passerat. Kontrollera att det stämmer innan du sparar.
                      </Text>
                    </View>
                  )}

                  {isSeries ? null : (
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, flexWrap: 'wrap' }}>
                      {(isProjectInfo && dateLocked) ? (
                        <>
                          <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Starttid</Text>
                            <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F1F5F9' }}>
                              <Text style={{ fontSize: 13, fontWeight: fwReg, color: colors.textSubtle }} numberOfLines={1}>
                                {String(startTime || '').trim() || '—'}
                              </Text>
                            </View>
                          </View>
                          <View style={{ flexGrow: 1, flexBasis: 220, minWidth: 0, gap: 6 }}>
                            <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Sluttid</Text>
                            <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10, backgroundColor: '#F1F5F9' }}>
                              <Text style={{ fontSize: 13, fontWeight: fwReg, color: colors.textSubtle }} numberOfLines={1}>
                                {String(endTime || '').trim() || '—'}
                              </Text>
                            </View>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={{ width: 90 }}>
                            <TimeField
                              label="Starttid"
                              value={startTime}
                              onChange={handleStartTimeChange}
                              dropdownKey="startTime"
                              activeDropdown={activeDropdown}
                              setActiveDropdown={setActiveDropdown}
                              colors={colors}
                              fwReg={fwReg}
                              fwMed={fwMed}
                            />
                          </View>
                          <View style={{ width: 90 }}>
                            <TimeField
                              label="Sluttid"
                              value={endTime}
                              onChange={handleEndTimeChange}
                              minDropdownMinutes={minEndDropdownMinutes}
                              dropdownKey="endTime"
                              activeDropdown={activeDropdown}
                              setActiveDropdown={setActiveDropdown}
                              colors={colors}
                              fwReg={fwReg}
                              fwMed={fwMed}
                            />
                          </View>
                          <Pressable
                            onPress={() => addDuration(30)}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              backgroundColor: hovered || pressed ? '#155FB5' : '#1976D2',
                            })}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>+30 min</Text>
                          </Pressable>
                          <Pressable
                            onPress={() => addDuration(60)}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              borderRadius: 8,
                              backgroundColor: hovered || pressed ? '#155FB5' : '#1976D2',
                            })}
                          >
                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '500' }}>+60 min</Text>
                          </Pressable>
                        </>
                      )}
                    </View>
                  )}

                  {!multiCapable ? null : (
                    <Text style={{ fontSize: 12, color: colors.textSubtle }}>
                      Välj flera datum i kalendern för att skapa en serie.
                    </Text>
                  )}

                  <Text style={{ fontSize: 12, color: colors.textSubtle }}>
                    {isSeries ? 'Tid kan anges per tillfälle (öppna ett tillfälle).' : 'Tid är valfri men rekommenderas för möten och platsbesök.'}
                  </Text>
                </View>
              </View>

              {!isSeries ? null : (
                <View style={{ gap: 10 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Tillfällen</Text>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: colors.textSubtle }}>Startnr</Text>
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
                          color: colors.text,
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
                    const draftStartTime = String(draft?.startTime || '').trim();
                    const draftEndTime = String(draft?.endTime || '').trim();
                    const timeLabel = formatTimeLabel(draftStartTime, draftEndTime);

                    const prefix = isMeetingType(title) ? 'Möte' : 'Tillfälle';
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
                            <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textMuted }} numberOfLines={1}>
                              {label}
                            </Text>
                            <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }} numberOfLines={1}>
                              {iso}
                            </Text>
                          </View>
                          <Text style={{ fontSize: 12, color: colors.textMuted }} numberOfLines={1}>
                            {summaryTitle}
                          </Text>
                          {!timeLabel ? null : (
                            <Text style={{ fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
                              {timeLabel}
                            </Text>
                          )}
                        </View>

                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                          <Text style={{ fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
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
                            <Ionicons name="create-outline" size={15} color={colors.textSubtle} />
                            <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Öppna</Text>
                          </Pressable>
                        </View>
                      </Pressable>
                    );
                  })}
                </View>
              )}

              <View
                style={{
                  gap: 10,
                  padding: 12,
                  borderWidth: 1,
                  borderColor: '#E2E8F0',
                  borderRadius: 12,
                  backgroundColor: colors.bgMuted,
                }}
              >
                <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Beskrivning (valfritt)</Text>
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
                    color: colors.text,
                    backgroundColor: '#fff',
                    minHeight: 84,
                    textAlignVertical: 'top',
                    ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
                  }}
                />
              </View>

              {/* Participants should be available for all types (incl. Platsbesök & generic datum). */}
              {isSeries ? null : (
                <View
                  style={{
                    gap: 10,
                    padding: 12,
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    borderRadius: 12,
                    backgroundColor: colors.bgMuted,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                    <View style={{ minWidth: 0, flex: 1 }}>
                      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>Deltagare (valfritt)</Text>
                      <Text style={{ fontSize: 12, color: colors.textSubtle }} numberOfLines={1}>
                        {participantCountLabel(normalizedParticipants.length)}
                      </Text>
                    </View>

                    <Pressable
                      onPress={() => {
                        openParticipantsEditor(null);
                      }}
                      style={({ hovered, pressed }) => ({
                        paddingVertical: 7,
                        paddingHorizontal: 10,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: colors.blue,
                        backgroundColor: hovered || pressed ? colors.blueHover : colors.blue,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8,
                      })}
                    >
                      <Ionicons name="people-outline" size={15} color="#fff" />
                      <Text style={{ fontSize: 12, fontWeight: fwMed, color: '#fff' }}>Lägg till deltagare</Text>
                    </Pressable>
                  </View>

                  <View style={{ borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', overflow: 'hidden' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, backgroundColor: colors.bgMuted, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
                      <Text style={{ flex: 1.2, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle }}>Namn</Text>
                      <Text style={{ flex: 1.4, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle }}>E-post</Text>
                      <Text style={{ width: 34, fontSize: 11, fontWeight: fwMed, color: colors.textSubtle, textAlign: 'right' }} />
                    </View>

                    {normalizedParticipants.length === 0 ? (
                      <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                        <Text style={{ fontSize: 13, color: colors.textSubtle }}>Inga deltagare valda.</Text>
                      </View>
                    ) : (
                      <ScrollView style={{ maxHeight: 160 }} keyboardShouldPersistTaps="handled">
                        {normalizedParticipants.map((p) => {
                          const name = String(p?.name || '').trim();
                          const email = String(p?.email || '').trim();
                          const key = email;

                          return (
                            <View key={key} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', gap: 10 }}>
                              <Text style={{ flex: 1.2, fontSize: 13, fontWeight: fwReg, color: colors.text }} numberOfLines={1}>
                                {name || '—'}
                              </Text>
                              <Text style={{ flex: 1.4, fontSize: 13, color: colors.textMuted }} numberOfLines={1}>
                                {email}
                              </Text>
                              <Pressable
                                onPress={() => {
                                  const target = normalizeEmail(email);
                                  setParticipantsValue((prev) => (Array.isArray(prev) ? prev : []).filter((x) => normalizeEmail(x?.email) !== target));
                                }}
                                style={({ hovered, pressed }) => ({
                                  width: 34,
                                  alignItems: 'flex-end',
                                  opacity: hovered || pressed ? 0.9 : 1,
                                })}
                              >
                                <Ionicons name="trash-outline" size={16} color={colors.textSubtle} />
                              </Pressable>
                            </View>
                          );
                        })}
                      </ScrollView>
                    )}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <View>
                {!initial?.id ? null : (
                  <Pressable
                    onPress={safeOnDelete}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: hovered || pressed ? colors.danger : colors.borderStrong,
                      backgroundColor: '#fff',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    })}
                  >
                    {({ hovered, pressed }) => (
                      <>
                        <Ionicons name="trash-outline" size={16} color={hovered || pressed ? colors.danger : colors.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: fwMed, color: hovered || pressed ? colors.danger : colors.textSubtle }}>Ta bort</Text>
                      </>
                    )}
                  </Pressable>
                )}
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={handleClose}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textMuted }}>Avbryt</Text>
                </Pressable>

                <Pressable
                  onPress={() => {
                    if (!canSave) return;

                    // Validate time input (backwards compatible: empty is ok).
                    const st = String(startTime || '').trim();
                    const et = String(endTime || '').trim();
                    if (!isSeries) {
                      if (st && !isValidTimeHHMM(st)) {
                        Alert.alert('Ogiltig starttid', 'Ange starttid som HH:MM, t.ex. 09:00.');
                        return;
                      }
                      if (et && !isValidTimeHHMM(et)) {
                        Alert.alert('Ogiltig sluttid', 'Ange sluttid som HH:MM, t.ex. 10:30.');
                        return;
                      }
                      if (!st && et) {
                        Alert.alert('Starttid saknas', 'Ange en starttid om du vill ange en sluttid.');
                        return;
                      }
                      if (st && !et) {
                        Alert.alert('Sluttid saknas', 'Du måste ange en sluttid');
                        return;
                      }
                      if (st && et) {
                        const sm = timeToMinutes(st);
                        const em = timeToMinutes(et);
                        if (sm != null && em != null && em <= sm) {
                          Alert.alert('Tidsintervall', 'Sluttid måste vara senare än starttid.');
                          return;
                        }
                      }
                    }

                    let multiItems = [];
                    if (isSeries) {
                      const selected = selectedDates;
                      const base = splitTrailingNumber(String(title || '').trim()).base || 'Platsbesök';
                      const bn = Number(baseNumber || 1);
                      multiItems = selected.map((iso, idx) => {
                        const d = multiDrafts && typeof multiDrafts === 'object' ? multiDrafts?.[iso] : null;
                        const itTitle = String(d?.title || '').trim() || `${base} ${bn + idx}`;
                        const itParticipants = normalizeParticipants(d?.participants);
                        const itStartTime = String(d?.startTime || '').trim();
                        const itEndTime = String(d?.endTime || '').trim();
                        return { date: iso, title: itTitle, participants: itParticipants, startTime: itStartTime, endTime: itEndTime };
                      });

                      for (const mi of multiItems) {
                        const iso = String(mi?.date || '').trim();
                        const mst = String(mi?.startTime || '').trim();
                        const met = String(mi?.endTime || '').trim();
                        if (mst && !isValidTimeHHMM(mst)) {
                          Alert.alert('Ogiltig starttid', `Tillfälle ${iso}: ange starttid som HH:MM, t.ex. 09:00.`);
                          return;
                        }
                        if (met && !isValidTimeHHMM(met)) {
                          Alert.alert('Ogiltig sluttid', `Tillfälle ${iso}: ange sluttid som HH:MM, t.ex. 10:30.`);
                          return;
                        }
                        if (!mst && met) {
                          Alert.alert('Starttid saknas', `Tillfälle ${iso}: ange en starttid om du vill ange en sluttid.`);
                          return;
                        }
                        if (mst && !met) {
                          Alert.alert(`Sluttid saknas (${iso})`, 'Du måste ange en sluttid');
                          return;
                        }
                        if (mst && met) {
                          const sm = timeToMinutes(mst);
                          const em = timeToMinutes(met);
                          if (sm != null && em != null && em <= sm) {
                            Alert.alert('Tidsintervall', `Tillfälle ${iso}: sluttid måste vara senare än starttid.`);
                            return;
                          }
                        }
                      }
                    }

                    const payload = {
                      id: initial?.id || null,
                      title: String(title || '').trim(),
                      // NOTE: For Projektinformation-driven items, type/category must stay locked
                      // (unlocking only affects date/time).
                      type: isProjectInfo
                        ? String(initial?.type || initial?.customType || 'Viktigt datum').trim()
                        : String(title || '').trim(),
                      description: String(description || '').trim(),
                      date: isSeries ? '' : String(date || '').trim(),
                      dates: isSeries ? selectedDates : [],
                      allowMulti: !!isSeries,
                      baseNumber,
                      startTime: isSeries ? '' : String(startTime || '').trim(),
                      endTime: isSeries ? '' : String(endTime || '').trim(),
                      participants: normalizeParticipants(participants),
                      multiItems,

                      // Sync metadata (used by parent for two-way sync when unlocked)
                      source: initial?.source || null,
                      sourceKey: initial?.sourceKey || null,
                      projectInfoDateUnlocked: isProjectInfo ? !dateLocked : false,

                      // Outlook (parent uses for updateOutlookEvent when editing linked date)
                      outlookEventId: initial?.outlookEventId != null ? String(initial.outlookEventId).trim() || null : null,
                      outlookStatus: initial?.outlookStatus,
                      outlookInvitationPrepared: !!initial?.outlookInvitationPrepared,
                    };
                    safeOnSave(payload);
                  }}
                  disabled={!canSave}
                  style={({ hovered, pressed }) => {
                    const disabled = !canSave;
                    return {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: disabled ? '#E2E8F0' : colors.blue,
                      backgroundColor: disabled ? '#F1F5F9' : (hovered || pressed ? colors.blueHover : colors.blue),
                      opacity: disabled ? 0.85 : 1,
                    };
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: fwMed, color: '#fff' }}>Spara</Text>
                </Pressable>
              </View>
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
        startTime={occurrenceStartTime}
        endTime={occurrenceEndTime}
        onChangeStartTime={(v) => {
          if (!occurrenceIso) return;
          setMultiDrafts((prev) => {
            const prevObj = prev && typeof prev === 'object' ? prev : {};
            return {
              ...prevObj,
              [occurrenceIso]: { ...(prevObj?.[occurrenceIso] || {}), startTime: String(v || '').trim() },
            };
          });
        }}
        onChangeEndTime={(v) => {
          if (!occurrenceIso) return;
          const vTrimmed = String(v || '').trim();
          setMultiDrafts((prev) => {
            const prevObj = prev && typeof prev === 'object' ? prev : {};
            const current = prevObj?.[occurrenceIso] || {};
            const em = timeToMinutes(vTrimmed);
            const sm = timeToMinutes(String(current?.startTime || '').trim());
            const next = { ...current, endTime: vTrimmed };
            if (em != null && sm != null && em <= sm) {
              next.startTime = minutesToHHMM(em - 60);
            }
            return { ...prevObj, [occurrenceIso]: next };
          });
        }}
        participants={occurrenceParticipants}
        onChangeParticipants={(next) => {
          if (!occurrenceIso) return;
          const nextParticipants = normalizeParticipants(next);
          setMultiDrafts((prev) => {
            const prevObj = prev && typeof prev === 'object' ? prev : {};
            return {
              ...prevObj,
              [occurrenceIso]: { ...(prevObj?.[occurrenceIso] || {}), participants: nextParticipants },
            };
          });
        }}
        onEditParticipants={() => {
          if (!occurrenceIso) return;
          openParticipantsEditor(occurrenceIso);
        }}
        canCopyFromFirst={canCopyFromFirst}
        copyFromFirstLabel={isMeetingType(title) ? 'Kopiera från möte 1' : 'Kopiera från tillfälle 1'}
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
        colors={colors}
        fwReg={fwReg}
        fwMed={fwMed}
      />

      <IsoDatePickerModal
        visible={datePickerOpen}
        title={allowMulti ? 'Välj datum' : 'Välj datum'}
        value={datePickerValue}
        onSelect={(val) => {
          // Projectinformation-driven dates must never become series.
          if (isProjectInfo) {
            const picked = Array.isArray(val) ? (dedupeSortedDates(val)[0] || '') : String(val || '');
            setAllowMulti(false);
            setDates([]);
            setMultiDrafts({});
            setParticipantsTargetIso(null);
            setDate(String(picked || ''));
            setDatePickerOpen(false);
            return;
          }

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

      <ActivityParticipantPickerModal
        visible={participantsModalOpen}
        onClose={closeParticipantsModal}
        title="Lägg till deltagare"
        subtitle="Välj deltagare för denna aktivitet / detta datum."
        helpTextEmptySelection="Välj deltagare för denna aktivitet / detta datum."
        peopleCandidates={peopleCandidates}
        peopleLoading={peopleLoading}
        peopleError={peopleError}
        participants={participantsValue}
        onConfirmParticipants={(next) => setParticipantsValue(next)}
      />
    </>
  );
}
