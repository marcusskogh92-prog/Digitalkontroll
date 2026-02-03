/**
 * OverviewWeekCalendar
 * Veckovy för Översiktssidan: en vecka per rad, veckor staplade vertikalt.
 * Full bredd, samma statusfärger (Idag / Kommande / Passerat), read-only (klick → navigera).
 */

import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

function importantDatePresentationForCalendar(item) {
  const it = item && typeof item === 'object' ? item : {};
  const source = String(it?.source || '').trim();
  const sourceKey = String(it?.sourceKey || '').trim();
  if (source !== 'projectinfo') return null;
  if (sourceKey === 'sista-dag-for-fragor') {
    return { label: 'Sista dag för frågor', accent: '#F59E0B', bg: 'rgba(245, 158, 11, 0.14)', border: 'rgba(245, 158, 11, 0.45)' };
  }
  if (sourceKey === 'anbudsinlamning') {
    return { label: 'Anbudsinlämning', accent: '#DC2626', bg: 'rgba(220, 38, 38, 0.12)', border: 'rgba(220, 38, 38, 0.45)' };
  }
  if (sourceKey === 'planerad-byggstart') {
    return { label: 'Planerad byggstart', accent: '#16A34A', bg: 'rgba(22, 163, 74, 0.12)', border: 'rgba(22, 163, 74, 0.40)' };
  }
  if (sourceKey === 'klart-for-besiktning') {
    return { label: 'Klart för besiktning', accent: '#16A34A', bg: 'rgba(22, 163, 74, 0.12)', border: 'rgba(22, 163, 74, 0.40)' };
  }
  return null;
}

function isValidIsoDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function isoToDate(iso) {
  if (!isValidIsoDate(iso)) return null;
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToIso(d) {
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function addDays(iso, days) {
  const d = isoToDate(iso) || new Date();
  const next = new Date(d.getFullYear(), d.getMonth(), d.getDate() + Number(days || 0));
  return dateToIso(next);
}

function startOfWeekMondayIso(iso) {
  const d = isoToDate(iso) || new Date();
  const js = d.getDay();
  const mondayIndex = (js + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayIndex);
  return dateToIso(start);
}

function getISOWeekNumber(iso) {
  const d = isoToDate(iso);
  if (!d) return null;
  const day = d.getDay();
  const mondayOffset = (day + 6) % 7;
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayOffset);
  const jan4 = new Date(monday.getFullYear(), 0, 4);
  const jan4Day = jan4.getDay();
  const jan4MondayOffset = (jan4Day + 6) % 7;
  const jan4Monday = new Date(jan4.getFullYear(), 0, 4 - jan4MondayOffset);
  const diffMs = monday.getTime() - jan4Monday.getTime();
  let week = 1 + Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000));
  if (week < 1) {
    const prevJan4 = new Date(monday.getFullYear() - 1, 0, 4);
    const prevJan4Day = prevJan4.getDay();
    const prevJan4Monday = new Date(prevJan4.getFullYear(), 0, 4 - (prevJan4Day + 6) % 7);
    week = 1 + Math.floor((monday.getTime() - prevJan4Monday.getTime()) / (7 * 24 * 60 * 60 * 1000));
  }
  if (week > 52) {
    const nextJan4 = new Date(monday.getFullYear() + 1, 0, 4);
    const nextJan4Day = nextJan4.getDay();
    const nextJan4Monday = new Date(nextJan4.getFullYear(), 0, 4 - (nextJan4Day + 6) % 7);
    if (monday.getTime() >= nextJan4Monday.getTime()) week = 1;
  }
  return week;
}

const MONTHS_SV = ['januari', 'februari', 'mars', 'april', 'maj', 'juni', 'juli', 'augusti', 'september', 'oktober', 'november', 'december'];

function formatMonthYear(iso) {
  const d = isoToDate(iso);
  if (!d) return '';
  const m = MONTHS_SV[d.getMonth()] || '';
  const y = d.getFullYear();
  return `${m} ${y}`;
}

function statusForIso(iso, todayIso) {
  if (!isValidIsoDate(iso) || !isValidIsoDate(todayIso)) return null;
  if (iso === todayIso) return 'today';
  if (iso < todayIso) return 'past';
  return 'upcoming';
}

function eventStyleForStatus(status, colors) {
  const c = colors || {};
  if (status === 'today') {
    return { bg: '#DBEAFE', border: '#60A5FA', text: c.blue || '#2563EB' };
  }
  if (status === 'past') {
    return { bg: '#F1F5F9', border: '#E2E8F0', text: c.textSubtle || '#64748B' };
  }
  return { bg: '#EFF6FF', border: '#BFDBFE', text: c.text || '#0F172A' };
}

const WEEKDAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];
const NUM_WEEKS = 6;

export default function OverviewWeekCalendar({ items, todayIso, onPressItem, onPressDay, colors }) {
  const byDate = React.useMemo(() => {
    const out = {};
    (Array.isArray(items) ? items : []).forEach((it) => {
      const iso = isValidIsoDate(it?.date) ? String(it.date) : '';
      if (!iso) return;
      if (!out[iso]) out[iso] = [];
      out[iso].push(it);
    });
    return out;
  }, [items]);

  const weekStarts = React.useMemo(() => {
    const start = startOfWeekMondayIso(todayIso || dateToIso(new Date()));
    const list = [];
    for (let i = 0; i < NUM_WEEKS; i++) {
      list.push(addDays(start, i * 7));
    }
    return list;
  }, [todayIso]);

  const weeks = React.useMemo(() => {
    return weekStarts.map((weekStart) => {
      const days = [];
      for (let d = 0; d < 7; d++) {
        days.push(addDays(weekStart, d));
      }
      return days;
    });
  }, [weekStarts]);

  const weekNumbers = React.useMemo(() => weekStarts.map((iso) => getISOWeekNumber(iso)), [weekStarts]);
  const monthLabel = React.useMemo(() => formatMonthYear(todayIso || dateToIso(new Date())), [todayIso]);

  const weekNumWidth = 28;
  const dayCellHeight = 72;

  const weekHasMonthStart = React.useMemo(() => {
    return weekStarts.map((weekStartIso, idx) => {
      if (idx === 0) return false;
      const thisMonth = String(weekStartIso).slice(0, 7);
      const prevMonth = String(weekStarts[idx - 1]).slice(0, 7);
      return thisMonth !== prevMonth;
    });
  }, [weekStarts]);

  return (
    <View style={{ width: '100%' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingTop: 0 }}>
        <View style={{ flex: 1, alignItems: 'flex-start' }}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: colors?.textSubtle || '#64748B' }}>Kalender</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 11, fontWeight: '500', color: colors?.textSubtle || '#64748B' }}>{monthLabel}</Text>
        </View>
        <View style={{ flex: 1, alignItems: 'flex-end' }}>
          <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8' }}>Veckovy</Text>
        </View>
      </View>

      <View style={{ borderWidth: 1, borderColor: colors?.border || '#E2E8F0', borderRadius: 12, backgroundColor: '#fff', overflow: 'hidden' }}>
        <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#EEF2F7', paddingVertical: 6, paddingHorizontal: 8 }}>
          <View style={{ width: weekNumWidth, alignItems: 'center', justifyContent: 'center', paddingRight: 6 }}>
            <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8' }}>V</Text>
          </View>
          {WEEKDAY_LABELS.map((label) => (
            <View key={label} style={{ flex: 1, alignItems: 'center' }}>
              <Text style={{ fontSize: 10, fontWeight: '600', color: colors?.textSubtle || '#64748B' }}>{label}</Text>
            </View>
          ))}
        </View>

        {weeks.map((weekDays, weekIdx) => (
          <View
            key={weekStarts[weekIdx]}
            style={{
              flexDirection: 'row',
              borderBottomWidth: weekIdx < weeks.length - 1 ? 1 : 0,
              borderBottomColor: '#EEF2F7',
              height: dayCellHeight,
              ...(weekHasMonthStart[weekIdx] ? { backgroundColor: 'rgba(0,0,0,0.02)', borderTopWidth: 1, borderTopColor: 'rgba(0,0,0,0.06)' } : {}),
            }}
          >
            <View style={{ width: weekNumWidth, paddingRight: 6, paddingVertical: 6, borderRightWidth: 1, borderRightColor: '#EEF2F7', alignItems: 'center', justifyContent: 'flex-start' }}>
              <Text style={{ fontSize: 10, fontWeight: '500', color: '#94A3B8' }}>{weekNumbers[weekIdx] ?? '—'}</Text>
            </View>
            {weekDays.map((iso, dayIdx) => {
              const isToday = isValidIsoDate(iso) && iso === todayIso;
              const dayEvents = Array.isArray(byDate[iso]) ? byDate[iso] : [];
              const status = statusForIso(iso, todayIso);
              const st = eventStyleForStatus(status, colors);
              const dayNum = Number(String(iso).slice(8, 10));

              return (
                <View key={iso} style={{ flex: 1, minWidth: 0, height: dayCellHeight }}>
                  <Pressable
                    onPress={() => onPressDay?.(iso, dayEvents)}
                    style={({ hovered, pressed }) => ({
                      flex: 1,
                      paddingVertical: 4,
                      paddingHorizontal: 4,
                      borderRightWidth: dayIdx < 6 ? 1 : 0,
                      borderRightColor: '#EEF2F7',
                      backgroundColor: isToday
                        ? 'rgba(25, 118, 210, 0.06)'
                        : (hovered || pressed) ? '#F8FAFC' : 'transparent',
                      ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                    })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: isToday ? (colors?.blue || '#2563EB') : (colors?.text || '#0F172A'),
                        }}
                      >
                        {dayNum}
                      </Text>
                      {isToday ? (
                        <View style={{ paddingHorizontal: 4, paddingVertical: 1, borderRadius: 999, backgroundColor: 'rgba(25, 118, 210, 0.12)' }}>
                          <Text style={{ fontSize: 9, fontWeight: '600', color: colors?.blue || '#2563EB' }}>Idag</Text>
                        </View>
                      ) : null}
                    </View>
                    <ScrollView
                      style={{ flex: 1, minHeight: 0 }}
                      contentContainerStyle={{ paddingBottom: 2 }}
                      showsVerticalScrollIndicator={true}
                      nestedScrollEnabled
                    >
                      {dayEvents.map((it) => {
                        const important = importantDatePresentationForCalendar(it);
                        const eventSt = important ? { bg: important.bg, border: important.border, text: important.accent } : st;
                        const title = important?.label || String(it?.title || it?.type || '—').trim();
                        return (
                          <Pressable
                            key={String(it?.id || title)}
                            onPress={(e) => {
                              e?.stopPropagation?.();
                              onPressItem?.(it);
                            }}
                            style={({ hovered, pressed }) => ({
                              paddingVertical: 2,
                              paddingHorizontal: 4,
                              borderRadius: 4,
                              borderWidth: 1,
                              borderColor: eventSt.border,
                              backgroundColor: (hovered || pressed) ? eventSt.bg : eventSt.bg,
                              marginBottom: 2,
                              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
                            })}
                          >
                            <Text style={{ fontSize: 9, fontWeight: '500', color: eventSt.text }} numberOfLines={1}>
                              {title}
                            </Text>
                          </Pressable>
                        );
                      })}
                      {dayEvents.length > 0 ? null : null}
                    </ScrollView>
                  </Pressable>
                </View>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}
