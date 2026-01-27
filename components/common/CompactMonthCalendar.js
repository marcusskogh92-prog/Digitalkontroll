import Ionicons from '@expo/vector-icons/Ionicons';
import React from 'react';
import { Platform, Pressable, Text, View } from 'react-native';

function isValidIsoDate(iso) {
  return typeof iso === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(iso);
}

function startOfMonthIso(date) {
  const d = date instanceof Date ? date : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}-01`;
}

function isoToDate(iso) {
  if (!isValidIsoDate(iso)) return null;
  // Force midnight UTC-ish parsing safety: use yyyy-mm-dd + 'T00:00:00'.
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
  // JS: Sunday=0 ... Saturday=6. We want Monday=0.
  const js = d.getDay();
  const mondayIndex = (js + 6) % 7;
  const start = new Date(d.getFullYear(), d.getMonth(), d.getDate() - mondayIndex);
  return dateToIso(start);
}

function monthStartIso(isoMonthStart) {
  const d = isoToDate(isoMonthStart) || new Date();
  return dateToIso(new Date(d.getFullYear(), d.getMonth(), 1));
}

function monthEndIso(isoMonthStart) {
  const d = isoToDate(isoMonthStart) || new Date();
  // day 0 of next month = last day of current month
  const end = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return dateToIso(end);
}

function addMonths(isoMonthStart, deltaMonths) {
  const d = isoToDate(isoMonthStart) || new Date();
  const next = new Date(d.getFullYear(), d.getMonth() + Number(deltaMonths || 0), 1);
  return startOfMonthIso(next);
}

const MONTHS_SV = [
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

function formatMonthLabel(isoMonthStart) {
  const d = isoToDate(isoMonthStart) || new Date();
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
  const COLORS = colors || {};
  if (status === 'today') {
    return { bg: '#DBEAFE', border: '#60A5FA', text: COLORS.blue || '#2563EB', type: '#1D4ED8' };
  }
  if (status === 'past') {
    return { bg: '#F1F5F9', border: '#E2E8F0', text: COLORS.textSubtle || '#64748B', type: COLORS.textSubtle || '#64748B' };
  }
  return { bg: '#EFF6FF', border: '#BFDBFE', text: COLORS.text || '#0F172A', type: COLORS.textSubtle || '#64748B' };
}

/**
 * Compact month calendar rendering events per day.
 *
 * Props:
 * - items: [{id, date, title, type, ...}]
 * - todayIso: 'YYYY-MM-DD'
 * - onPressItem: (item) => void
 * - selectedIso: 'YYYY-MM-DD' (optional)
 * - flashIso: 'YYYY-MM-DD' (optional)
 * - onPressDay: (iso, dayItems) => void (optional)
 * - colors: shared COLORS object
 * - maxWidth: number (default 980)
 */
export default function CompactMonthCalendar({ items, todayIso, onPressItem, selectedIso, flashIso, onPressDay, colors, maxWidth = 980 }) {
  const byDate = React.useMemo(() => {
    const safeItems = Array.isArray(items) ? items : [];
    const out = {};
    safeItems.forEach((it) => {
      const iso = isValidIsoDate(it?.date) ? String(it.date) : '';
      if (!iso) return;
      if (!out[iso]) out[iso] = [];
      out[iso].push(it);
    });
    return out;
  }, [items]);

  const initialMonth = React.useMemo(() => startOfMonthIso(isoToDate(todayIso) || new Date()), [todayIso]);
  const [monthIso, setMonthIso] = React.useState(initialMonth);

  React.useEffect(() => {
    // Keep month in sync with today when view mounts.
    setMonthIso((cur) => (cur ? cur : initialMonth));
  }, [initialMonth]);

  React.useEffect(() => {
    const iso = isValidIsoDate(selectedIso) ? String(selectedIso) : '';
    if (!iso) return;
    const d = isoToDate(iso);
    if (!d) return;
    const targetMonth = startOfMonthIso(d);
    setMonthIso((cur) => (cur === targetMonth ? cur : targetMonth));
  }, [selectedIso]);

  const label = React.useMemo(() => formatMonthLabel(monthIso), [monthIso]);

  const monthGrid = React.useMemo(() => {
    const start = monthStartIso(monthIso);
    const end = monthEndIso(monthIso);
    const gridStart = startOfWeekMondayIso(start);
    const cells = [];
    for (let i = 0; i < 42; i += 1) {
      const iso = addDays(gridStart, i);
      cells.push({
        iso,
        inMonth: iso >= start && iso <= end,
      });
    }
    return { start, end, gridStart, cells };
  }, [monthIso]);

  const weekDayLabels = React.useMemo(
    () => ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'],
    []
  );

  // NOTE: Avoid CSS grid for RN-web inside ScrollView.
  // In some layouts, RN-web's ScrollView content measurement can undercount grid height,
  // making it impossible to scroll to the very bottom.
  const gridStyles = {
    flexDirection: 'row',
    flexWrap: 'wrap',
  };

  const cellMinHeight = Platform.OS === 'web' ? 80 : 76;

  const selectedIsoSafe = isValidIsoDate(selectedIso) ? String(selectedIso) : '';
  const flashIsoSafe = isValidIsoDate(flashIso) ? String(flashIso) : '';
  const focusedWeekStart = React.useMemo(() => {
    if (!selectedIsoSafe) return '';
    return startOfWeekMondayIso(selectedIsoSafe);
  }, [selectedIsoSafe]);
  const focusedWeekEnd = React.useMemo(() => {
    if (!focusedWeekStart) return '';
    return addDays(focusedWeekStart, 6);
  }, [focusedWeekStart]);

  return (
    <View style={{ marginTop: 14, width: '100%', maxWidth: maxWidth, alignSelf: 'flex-start' }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 8 }}>
        <Text style={{ fontSize: 13, fontWeight: '900', color: (colors?.text || '#0F172A') }}>Kalender</Text>

        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <Pressable
            onPress={() => setMonthIso((m) => addMonths(m, -1))}
            style={({ hovered, pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors?.borderStrong || '#CBD5E1',
              backgroundColor: hovered || pressed ? '#F1F5F9' : '#fff',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            })}
          >
            <Ionicons name="chevron-back" size={16} color={colors?.textSubtle || '#64748B'} />
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors?.textSubtle || '#64748B' }}>Föregående</Text>
          </Pressable>

          <Pressable
            onPress={() => setMonthIso(initialMonth)}
            style={({ hovered, pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 10,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors?.borderStrong || '#CBD5E1',
              backgroundColor: hovered || pressed ? '#F1F5F9' : '#fff',
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '900', color: colors?.textSubtle || '#64748B' }}>Idag</Text>
          </Pressable>

          <Pressable
            onPress={() => setMonthIso((m) => addMonths(m, 1))}
            style={({ hovered, pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors?.borderStrong || '#CBD5E1',
              backgroundColor: hovered || pressed ? '#F1F5F9' : '#fff',
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
            })}
          >
            <Text style={{ fontSize: 12, fontWeight: '800', color: colors?.textSubtle || '#64748B' }}>Nästa</Text>
            <Ionicons name="chevron-forward" size={16} color={colors?.textSubtle || '#64748B'} />
          </Pressable>
        </View>
      </View>

      <View
        style={{
          borderWidth: 1,
          borderColor: colors?.border || '#E2E8F0',
          borderRadius: 12,
          backgroundColor: '#fff',
        }}
      >
        <View style={{ paddingHorizontal: 10, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text style={{ fontSize: 13, fontWeight: '900', color: colors?.text || '#0F172A' }}>{label}</Text>
          <Text style={{ fontSize: 12, color: colors?.textSubtle || '#64748B' }}>Månadsvy</Text>
        </View>

        {/* Weekday header */}
        <View
          style={{
            paddingHorizontal: 10,
            paddingTop: 8,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: '#EEF2F7',
            ...gridStyles,
          }}
        >
          {weekDayLabels.map((w) => (
            <View key={w} style={{ width: '14.2857%' }}>
              <Text style={{ fontSize: 11, fontWeight: '900', color: colors?.textSubtle || '#64748B' }}>{w}</Text>
            </View>
          ))}
        </View>

        {/* Grid body */}
        <View
          style={{
            padding: 7,
            ...gridStyles,
          }}
        >
          {monthGrid.cells.map((cell) => {
            const iso = cell.iso;
            const isToday = isValidIsoDate(iso) && iso === todayIso;
            const isSelected = !!selectedIsoSafe && iso === selectedIsoSafe;
            const isFlashing = !!flashIsoSafe && iso === flashIsoSafe;
            const inFocusedWeek = !!focusedWeekStart && iso >= focusedWeekStart && iso <= focusedWeekEnd;
            const list = Array.isArray(byDate?.[iso]) ? byDate[iso] : [];
            const maxVisible = 3;
            const visible = list.slice(0, maxVisible);
            const more = Math.max(0, list.length - visible.length);
            const dayNum = Number(String(iso).slice(8, 10));

            const baseBorder = '#E2E8F0';
            const outMonthBg = '#F1F5F9';
            const inMonthBg = '#fff';

            const todayBg = '#EFF6FF';
            const selectedBg = 'rgba(25, 118, 210, 0.12)';
            const flashBg = 'rgba(25, 118, 210, 0.18)';

            const dayTextColor = !cell.inMonth
              ? '#94A3B8'
              : (isToday ? (colors?.blue || '#2563EB') : (colors?.text || '#0F172A'));

            return (
              <View
                key={iso}
                style={{
                  width: '14.2857%',
                  padding: 3,
                }}
              >
                <Pressable
                  onPress={() => {
                    if (!onPressDay) return;
                    onPressDay(iso, list);
                  }}
                  style={({ hovered, pressed }) => ({
                    minHeight: cellMinHeight,
                    borderWidth: (isSelected || isToday) ? 2 : 1,
                    borderColor: isSelected
                      ? (colors?.blue || '#2563EB')
                      : (isToday ? (colors?.blue || '#2563EB') : baseBorder),
                    backgroundColor: !cell.inMonth
                      ? outMonthBg
                      : (isFlashing ? flashBg : (isSelected ? selectedBg : (isToday ? todayBg : (inFocusedWeek ? '#F8FAFC' : inMonthBg)))),
                    borderRadius: 8,
                    padding: 4,
                    ...(Platform.OS === 'web'
                      ? {
                        transitionProperty: 'background-color, border-color',
                        transitionDuration: '140ms',
                        boxShadow: isFlashing ? '0 0 0 3px rgba(25, 118, 210, 0.10)' : 'none',
                      }
                      : {}),
                    opacity: pressed ? 0.98 : 1,
                  })}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 4 }}>
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '900',
                        color: dayTextColor,
                      }}
                    >
                      {dayNum}
                    </Text>

                    {list.length > 0 ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                        {Array.from({ length: Math.min(3, list.length) }).map((_, idx) => (
                          <View
                            key={`${iso}-dot-${idx}`}
                            style={{ width: 5, height: 5, borderRadius: 99, backgroundColor: colors?.blue || '#2563EB', opacity: cell.inMonth ? 0.9 : 0.5 }}
                          />
                        ))}
                        {list.length > 3 ? (
                          <Text style={{ fontSize: 9, fontWeight: '900', color: colors?.textSubtle || '#64748B' }}>+</Text>
                        ) : null}
                      </View>
                    ) : null}
                  </View>

                  <View style={{ flex: 1, minHeight: 0 }}>
                    {visible.map((it) => {
                      const s = statusForIso(iso, todayIso);
                      const st = eventStyleForStatus(s, colors);
                      const title = String(it?.title || '—');
                      const type = String(it?.type || '').trim();
                      return (
                        <Pressable
                          key={String(it?.id || title)}
                          onPress={(e) => {
                            e?.stopPropagation?.();
                            onPressItem && onPressItem(it);
                          }}
                          style={({ hovered, pressed }) => ({
                            paddingVertical: 2,
                            paddingHorizontal: 4,
                            borderRadius: 5,
                            borderWidth: 1,
                            borderColor: st.border,
                            backgroundColor: pressed || hovered ? st.bg : st.bg,
                            marginBottom: 3,
                          })}
                        >
                          <Text style={{ fontSize: 9, fontWeight: '900', color: st.text }} numberOfLines={1}>
                            {title}
                          </Text>
                          {!type ? null : (
                            <Text style={{ fontSize: 8, fontWeight: '800', color: st.type }} numberOfLines={1}>
                              {type}
                            </Text>
                          )}
                        </Pressable>
                      );
                    })}

                    {more > 0 ? (
                      <Text style={{ fontSize: 10, fontWeight: '900', color: colors?.textSubtle || '#64748B' }} numberOfLines={1}>
                        +{more} till
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            );
          })}
        </View>
      </View>
    </View>
  );
}
