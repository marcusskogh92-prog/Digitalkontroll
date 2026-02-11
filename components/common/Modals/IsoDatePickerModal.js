import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { Calendar, LocaleConfig } from 'react-native-calendars';

const SWEDISH_MONTHS = [
  'januari',
  'februari',
  'mars',
  'april',
  'maj',
  'juni',
  'juli',
  'augusti',
  'september',
  'oktober',
  'november',
  'december',
];

const SWEDISH_MONTHS_SHORT = [
  'jan',
  'feb',
  'mar',
  'apr',
  'maj',
  'jun',
  'jul',
  'aug',
  'sep',
  'okt',
  'nov',
  'dec',
];

const SWEDISH_DAY_NAMES = [
  'söndag',
  'måndag',
  'tisdag',
  'onsdag',
  'torsdag',
  'fredag',
  'lördag',
];

const SWEDISH_DAY_NAMES_SHORT = [
  'sön',
  'mån',
  'tis',
  'ons',
  'tor',
  'fre',
  'lör',
];

// Global calendar locale (shared across the entire app).
try {
  LocaleConfig.locales.sv = {
    monthNames: SWEDISH_MONTHS,
    monthNamesShort: SWEDISH_MONTHS_SHORT,
    dayNames: SWEDISH_DAY_NAMES,
    dayNamesShort: SWEDISH_DAY_NAMES_SHORT,
    today: 'Idag',
  };
  LocaleConfig.defaultLocale = 'sv';
} catch (_e) {}

const MODAL_MAX_WIDTH = 520;
// Fixed calendar height to avoid modal resizing between months (5 vs 6 weeks).
const CALENDAR_HEIGHT = 360;

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function toIsoDate(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addMonths(date, delta) {
  const d = new Date(date.getTime());
  d.setMonth(d.getMonth() + delta);
  return d;
}

function addYears(date, delta) {
  const d = new Date(date.getTime());
  d.setFullYear(d.getFullYear() + delta);
  return d;
}

function monthLabel(date) {
  const m = SWEDISH_MONTHS[date.getMonth()] || '';
  const y = date.getFullYear();
  return `${m} ${y}`.trim();
}

const SYSTEM_BLUE = '#1976D2';
const FW_MED = '500';

export default function IsoDatePickerModal({ visible, title = 'Välj datum', value, onSelect, onClose, onDelete }) {
  const todayIso = React.useMemo(() => toIsoDate(new Date()), []);

  const isMulti = Array.isArray(value);

  const [selectedIso, setSelectedIso] = React.useState(() => (!isMulti && isValidIsoDate(value) ? String(value) : ''));
  const [selectedMany, setSelectedMany] = React.useState(() => (isMulti ? Array.from(new Set(value.filter(isValidIsoDate))).sort() : []));
  const [monthCursor, setMonthCursor] = React.useState(() => {
    const base = isValidIsoDate(value) ? new Date(String(value) + 'T00:00:00') : new Date();
    return new Date(base.getFullYear(), base.getMonth(), 1);
  });

  React.useEffect(() => {
    if (!visible) return;
    if (Array.isArray(value)) {
      const nextMany = Array.from(new Set(value.map((x) => String(x || '').trim()).filter(isValidIsoDate))).sort();
      setSelectedMany(nextMany);
      setSelectedIso('');
      const base = nextMany[0] ? new Date(nextMany[0] + 'T00:00:00') : new Date();
      setMonthCursor(new Date(base.getFullYear(), base.getMonth(), 1));
      return;
    }

    const initialIso = isValidIsoDate(value) ? String(value) : '';
    setSelectedIso(initialIso);
    setSelectedMany([]);

    const base = initialIso ? new Date(initialIso + 'T00:00:00') : new Date();
    setMonthCursor(new Date(base.getFullYear(), base.getMonth(), 1));
  }, [visible, value]);

  const markedDates = React.useMemo(() => {
    const out = {};

    const todayKey = todayIso;
    const selectedKey = selectedIso;

    if (todayKey) {
      out[todayKey] = {
        customStyles: {
          container: {
            borderWidth: 2,
            borderColor: '#94A3B8',
            borderRadius: 8,
            backgroundColor: '#F1F5F9',
          },
          text: {
            color: '#0F172A',
            fontWeight: FW_MED,
          },
        },
      };
    }

    if (selectedKey) {
      const prev = out[selectedKey] || {};
      out[selectedKey] = {
        ...prev,
        customStyles: {
          container: {
            ...(prev.customStyles?.container || {}),
            backgroundColor: 'rgba(25, 118, 210, 0.14)',
            borderColor: SYSTEM_BLUE,
            borderWidth: 2,
            borderRadius: 8,
          },
          text: {
            ...(prev.customStyles?.text || {}),
            color: '#0F172A',
            fontWeight: FW_MED,
          },
        },
      };
    }

    if (Array.isArray(selectedMany) && selectedMany.length > 0) {
      selectedMany.forEach((k) => {
        const prev = out[k] || {};
        out[k] = {
          ...prev,
          customStyles: {
            container: {
              ...(prev.customStyles?.container || {}),
              backgroundColor: 'rgba(25, 118, 210, 0.14)',
              borderColor: SYSTEM_BLUE,
              borderWidth: 2,
              borderRadius: 8,
            },
            text: {
              ...(prev.customStyles?.text || {}),
              color: '#0F172A',
              fontWeight: FW_MED,
            },
          },
        };
      });
    }

    return out;
  }, [todayIso, selectedIso, selectedMany]);

  const close = React.useCallback(() => {
    if (onClose) onClose();
  }, [onClose]);

  const commitMulti = React.useCallback(() => {
    if (!Array.isArray(selectedMany)) return;
    if (onSelect) onSelect(selectedMany);
    close();
  }, [selectedMany, onSelect, close]);

  // Important: avoid mounting Calendar when closed (web can crash otherwise).
  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <Pressable
        onPress={close}
        style={{
          flex: 1,
          backgroundColor: 'rgba(15, 23, 42, 0.25)',
          padding: 16,
          justifyContent: 'center',
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            width: '100%',
            maxWidth: MODAL_MAX_WIDTH,
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
                <Ionicons name="calendar-outline" size={18} color="#64748B" />
                <Text style={{ fontSize: 14, fontWeight: FW_MED, color: '#0F172A' }} numberOfLines={1}>
                  {title}
                </Text>
              </View>

              <Pressable
                onPress={close}
                style={({ hovered, pressed }) => ({
                  padding: 6,
                  borderRadius: 8,
                  backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.18)' : 'transparent',
                })}
              >
                <Ionicons name="close" size={18} color="#64748B" />
              </Pressable>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => setMonthCursor((d) => addYears(d, -1))}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  })}
                >
                  <Ionicons name="play-back-outline" size={16} color="#64748B" />
                </Pressable>

                <Pressable
                  onPress={() => setMonthCursor((d) => addMonths(d, -1))}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  })}
                >
                  <Ionicons name="chevron-back" size={16} color="#64748B" />
                </Pressable>
              </View>

              <Text style={{ fontSize: 13, fontWeight: FW_MED, color: '#334155' }}>{monthLabel(monthCursor)}</Text>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() => setMonthCursor((d) => addMonths(d, 1))}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  })}
                >
                  <Ionicons name="chevron-forward" size={16} color="#64748B" />
                </Pressable>

                <Pressable
                  onPress={() => setMonthCursor((d) => addYears(d, 1))}
                  style={({ hovered, pressed }) => ({
                    padding: 6,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(25, 118, 210, 0.10)' : 'transparent',
                  })}
                >
                  <Ionicons name="play-forward-outline" size={16} color="#64748B" />
                </Pressable>
              </View>
            </View>
          </View>

          <View style={{ paddingHorizontal: 10, paddingVertical: 10 }}>
            <View style={{ height: CALENDAR_HEIGHT }}>
              <Calendar
                key={toIsoDate(monthCursor)}
                current={toIsoDate(monthCursor)}
                onDayPress={(day) => {
                  if (!day?.dateString) return;
                  const iso = String(day.dateString);

                  if (isMulti) {
                    setSelectedMany((prev) => {
                      const set = new Set(Array.isArray(prev) ? prev : []);
                      if (set.has(iso)) set.delete(iso);
                      else set.add(iso);
                      return Array.from(set).sort();
                    });
                    return;
                  }

                  setSelectedIso(iso);
                  if (onSelect) onSelect(iso);
                  close();
                }}
                onMonthChange={(m) => {
                  try {
                    if (!m?.year || !m?.month) return;
                    setMonthCursor(new Date(Number(m.year), Number(m.month) - 1, 1));
                  } catch (_e) {}
                }}
                markedDates={markedDates}
                markingType="custom"
                theme={{
                  backgroundColor: '#ffffff',
                  calendarBackground: '#ffffff',
                  textSectionTitleColor: '#64748b',
                  textSectionTitleDisabledColor: '#CBD5E1',
                  dayTextColor: '#0F172A',
                  textDisabledColor: '#CBD5E1',
                  monthTextColor: '#0F172A',
                  textDayFontWeight: FW_MED,
                  textMonthFontWeight: FW_MED,
                  textDayHeaderFontWeight: FW_MED,
                  textDayFontSize: 13,
                  textMonthFontSize: 14,
                  textDayHeaderFontSize: 11,
                  arrowColor: '#64748B',
                }}
                style={{ height: '100%' }}
                hideArrows
                renderHeader={() => null}
                enableSwipeMonths
                firstDay={1}
                showWeekNumbers
              />
            </View>
          </View>

          {!isMulti && onDelete && isValidIsoDate(value) ? (
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
              <Pressable
                onPress={() => {
                  onDelete();
                  close();
                }}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#DC2626',
                  backgroundColor: hovered || pressed ? 'rgba(220, 38, 38, 0.12)' : '#FEF2F2',
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: '#B91C1C' }}>Radera datum</Text>
              </Pressable>
            </View>
          ) : null}

          {!isMulti ? null : (
            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#EEF2F7', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
              <Text style={{ fontSize: 12, color: '#64748B' }}>
                {selectedMany.length > 0 ? `Valt: ${selectedMany.length} datum` : 'Välj ett eller flera datum'}
              </Text>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <Pressable
                  onPress={close}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                  })}
                >
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: '#475569' }}>Avbryt</Text>
                </Pressable>

                <Pressable
                  onPress={commitMulti}
                  disabled={selectedMany.length === 0}
                  style={({ hovered, pressed }) => {
                    const disabled = selectedMany.length === 0;
                    return {
                      paddingVertical: 8,
                      paddingHorizontal: 12,
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: disabled ? '#E2E8F0' : SYSTEM_BLUE,
                      backgroundColor: disabled ? '#F1F5F9' : (hovered || pressed ? 'rgba(25, 118, 210, 0.14)' : 'rgba(25, 118, 210, 0.10)'),
                      opacity: disabled ? 0.8 : 1,
                    };
                  }}
                >
                  <Text style={{ fontSize: 12, fontWeight: FW_MED, color: selectedMany.length === 0 ? '#94A3B8' : '#0F172A' }}>Klar</Text>
                </Pressable>
              </View>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
