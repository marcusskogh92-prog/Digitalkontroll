/**
 * Dashboard right panel (Premium SaaS 2026). Only shown when appMode === 'dashboard'.
 * Contains: Kalender (compact month), Kommande datum (upcoming deadlines).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useMemo, useState } from 'react';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { getPhaseConfig, getProjectPhase } from '../../features/projects/constants';

const PANEL_WIDTH = 340;
const CARD_RADIUS = 14;
const PANEL_PADDING = 24;
const CARD_PADDING = 20;
const ITEM_GAP = 14;

const WEEKDAY_LABELS = ['Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör', 'Sön'];

/** ISO date string set for days that have activity (timeline or skyddsrond) */
function CompactMonthCalendar({ activityDates = [] }) {
  const [viewDate] = useState(() => new Date());
  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date();
  const isToday = (d) => d.getDate() === today.getDate() && d.getMonth() === today.getMonth() && d.getFullYear() === today.getFullYear();
  const activitySet = useMemo(() => new Set(Array.isArray(activityDates) ? activityDates : []), [activityDates]);

  const { firstDay, daysInMonth, startOffset } = useMemo(() => {
    const first = new Date(year, month, 1);
    const last = new Date(year, month + 1, 0);
    const daysInMonth = last.getDate();
    const dayOfWeek = first.getDay();
    const startOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
    return { firstDay: first, daysInMonth, startOffset };
  }, [year, month]);

  const gridCells = useMemo(() => {
    const cells = [];
    for (let i = 0; i < startOffset; i++) cells.push({ key: `empty-${i}`, empty: true });
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d);
      const iso = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const hasActivity = activitySet.has(iso);
      cells.push({ key: `day-${d}`, day: d, date, today: isToday(date), hasActivity });
    }
    return cells;
  }, [year, month, daysInMonth, startOffset, activitySet]);

  const monthYearLabel = viewDate.toLocaleDateString('sv-SE', { month: 'long', year: 'numeric' });

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Kalender</Text>
      <Text style={styles.calendarMonthYear}>{monthYearLabel}</Text>
      <View style={styles.calendarHeader}>
        {WEEKDAY_LABELS.map((label) => (
          <Text key={label} style={styles.weekdayLabel}>{label}</Text>
        ))}
      </View>
      <View style={styles.calendarGrid}>
        {gridCells.map((cell) =>
          cell.empty ? (
            <View key={cell.key} style={styles.dayCell} />
          ) : (
            <View
              key={cell.key}
              style={[
                styles.dayCell,
                cell.today && styles.dayCellToday,
                cell.hasActivity && !cell.today && styles.dayCellActivity,
              ]}
            >
              <Text style={[styles.dayText, cell.today && styles.dayTextToday]}>
                {cell.day}
              </Text>
              {cell.hasActivity && !cell.today ? <View style={styles.dayActivityDot} /> : null}
            </View>
          )
        )}
      </View>
    </View>
  );
}

function formatDueDate(ms) {
  if (!ms) return '';
  try {
    return new Date(ms).toLocaleDateString('sv-SE', { day: 'numeric', month: 'short', year: 'numeric' });
  } catch (_e) {
    return '';
  }
}

/** Formatera datum som "13 Februari" (rubrik) */
function formatDateHeading(dateIso) {
  try {
    const d = new Date(dateIso + 'T12:00:00');
    const raw = d.toLocaleDateString('sv-SE', { day: 'numeric', month: 'long' });
    const parts = String(raw).split(/\s+/);
    const month = parts[parts.length - 1] || '';
    const capitalized = month ? month.charAt(0).toUpperCase() + month.slice(1).toLowerCase() : month;
    return parts.length > 1 ? `${parts.slice(0, -1).join(' ')} ${capitalized}` : raw;
  } catch (_e) {
    return dateIso || '';
  }
}

function UpcomingDeadlinesCard({ upcomingItems = [], upcomingTimelineItems = [], onProjectSelect }) {
  const byDate = useMemo(() => {
    const map = new Map();
    const add = (dateKey, entry) => {
      if (!map.has(dateKey)) map.set(dateKey, []);
      map.get(dateKey).push(entry);
    };
    (Array.isArray(upcomingItems) ? upcomingItems : []).forEach((item) => {
      const ms = Number(item?.nextDueMs || 0);
      if (!ms) return;
      const iso = new Date(ms).toISOString().slice(0, 10);
      add(iso, { type: 'skyddsrond', ...item, sortMs: ms });
    });
    (Array.isArray(upcomingTimelineItems) ? upcomingTimelineItems : []).forEach((item) => {
      const iso = String(item?.date || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return;
      add(iso, { type: 'timeline', ...item, sortMs: Number(item?.dateMs || 0) });
    });
    const sortedDates = Array.from(map.keys()).sort();
    return sortedDates.map((dateKey) => ({ dateKey, items: map.get(dateKey) }));
  }, [upcomingItems, upcomingTimelineItems]);

  return (
    <View style={styles.card}>
      <Text style={styles.cardTitle}>Kommande datum</Text>
      <View style={styles.upcomingList}>
        {byDate.length === 0 ? (
          <Text style={styles.upcomingEmpty}>Inga kommande datum</Text>
        ) : (
          byDate.slice(0, 10).map(({ dateKey, items }) => (
            <View key={dateKey} style={styles.upcomingDateBlock}>
              <Text style={styles.upcomingDateHeading}>{formatDateHeading(dateKey)}</Text>
              {items.map((item, idx) => {
                if (item.type === 'timeline') {
                  const project = item?.project || {};
                  const config = getProjectPhase(project) || getPhaseConfig('kalkylskede');
                  const projectLabel = item?.projectName || project?.fullName || project?.name || project?.projectNumber || project?.id || 'Projekt';
                  const what = item?.title || 'Datum';
                  return (
                    <TouchableOpacity
                      key={`tl-${item.projectId}-${item.date}-${idx}`}
                      style={styles.upcomingRow}
                      onPress={() => typeof onProjectSelect === 'function' && onProjectSelect(project)}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <View style={[styles.upcomingStageIcon, { backgroundColor: config?.color || '#2563EB' }]}>
                        <Ionicons name={config?.icon || 'calendar-outline'} size={12} color="#fff" />
                      </View>
                      <Text style={styles.upcomingRowText} numberOfLines={2}>
                        {projectLabel} – {what}
                      </Text>
                    </TouchableOpacity>
                  );
                }
                const project = item?.project || {};
                const config = getPhaseConfig(project?.phase || 'kalkylskede');
                const projectLabel = project?.fullName || project?.name || project?.projectNumber || project?.id || 'Projekt';
                return (
                  <TouchableOpacity
                    key={`sk-${project?.id}-${idx}`}
                    style={styles.upcomingRow}
                    onPress={() => typeof onProjectSelect === 'function' && onProjectSelect(project)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <View style={[styles.upcomingStageIcon, { backgroundColor: config?.color || '#2563EB' }]}>
                      <Ionicons name={config?.icon || 'shield-checkmark-outline'} size={12} color="#fff" />
                    </View>
                    <Text style={styles.upcomingRowText} numberOfLines={2}>
                      {projectLabel} – Skyddsrond
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          ))
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    padding: PANEL_PADDING,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: CARD_RADIUS,
    padding: CARD_PADDING,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 4,
  },
  calendarMonthYear: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 10,
    textTransform: 'capitalize',
  },
  calendarHeader: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  weekdayLabel: {
    flex: 1,
    textAlign: 'center',
    fontSize: 11,
    color: '#64748b',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    position: 'relative',
    width: '14.28%',
    aspectRatio: 1,
    maxWidth: 36,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  dayCellToday: {
    backgroundColor: '#2563EB',
  },
  dayCellActivity: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  dayActivityDot: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#2563EB',
  },
  dayText: {
    fontSize: 13,
    color: '#334155',
  },
  dayTextToday: {
    color: '#fff',
    fontWeight: '600',
  },
  upcomingList: {
    gap: ITEM_GAP + 4,
  },
  upcomingEmpty: {
    fontSize: 13,
    color: '#94a3b8',
    paddingVertical: 8,
  },
  upcomingDateBlock: {
    marginBottom: 4,
  },
  upcomingDateHeading: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    marginBottom: 6,
  },
  upcomingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 4,
    paddingLeft: 0,
  },
  upcomingStageIcon: {
    width: 20,
    height: 20,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  upcomingRowText: {
    flex: 1,
    fontSize: 13,
    color: '#475569',
    minWidth: 0,
  },
});

export function DashboardRightPanel({
  upcomingItems = [],
  upcomingTimelineItems = [],
  onProjectSelect,
}) {
  const activityDates = useMemo(() => {
    const set = new Set();
    (Array.isArray(upcomingTimelineItems) ? upcomingTimelineItems : []).forEach((item) => {
      if (item?.date && /^\d{4}-\d{2}-\d{2}$/.test(String(item.date))) set.add(String(item.date));
    });
    (Array.isArray(upcomingItems) ? upcomingItems : []).forEach((item) => {
      if (item?.nextDueMs) {
        const iso = new Date(item.nextDueMs).toISOString().slice(0, 10);
        set.add(iso);
      }
    });
    return Array.from(set);
  }, [upcomingTimelineItems, upcomingItems]);

  return (
    <ScrollView
      style={styles.panel}
      contentContainerStyle={{ paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
    >
      <CompactMonthCalendar activityDates={activityDates} />
      <UpcomingDeadlinesCard
        upcomingItems={upcomingItems}
        upcomingTimelineItems={upcomingTimelineItems}
        onProjectSelect={onProjectSelect}
      />
    </ScrollView>
  );
}

export const DASHBOARD_RIGHT_PANEL_WIDTH = PANEL_WIDTH;
