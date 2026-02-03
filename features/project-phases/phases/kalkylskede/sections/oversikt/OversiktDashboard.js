/**
 * OversiktDashboard
 * Read-only 2x2 overview for the main folder "01 - Översikt".
 *
 * Requirements:
 * - No editing / no form fields
 * - Summary-only information
 * - Cards navigate to their respective subpages
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import OverviewWeekCalendar from '../../../../../../components/common/OverviewWeekCalendar';
import { toTsMs } from '../../../../../../components/common/Dashboard/dashboardUtils';
import { PROJECT_TYPOGRAPHY } from '../../../../../../components/common/projectTypography';
import { useProjectOrganisation } from '../../../../../../hooks/useProjectOrganisation';
import { useProjectTimelineDates } from '../../../../../../hooks/useProjectTimelineDates';
import { getProjectPhase } from '../../../../../projects/constants';
import { listenFragaSvarItems } from '../../services/fragaSvarService';

const COLORS = {
  blue: '#1976D2',
  border: '#E6E8EC',
  borderStrong: '#D1D5DB',
  text: '#111',
  textMuted: '#475569',
  textSubtle: '#64748b',
  bgMuted: '#F8FAFC',
  danger: '#DC2626',
  green: '#16A34A',
};

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function formatIsoDateSv(iso) {
  const s = String(iso || '').trim();
  if (!isValidIsoDate(s)) return '';
  const t = new Date(`${s}T00:00:00`).getTime();
  if (!Number.isFinite(t)) return '';
  return new Date(t).toLocaleDateString('sv-SE');
}

function todayIso() {
  const d = new Date();
  const yyyy = String(d.getFullYear());
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function uniqueIdentitiesFromGroups(groups) {
  const seen = new Set();
  const members = [];
  (Array.isArray(groups) ? groups : []).forEach((g) => {
    (Array.isArray(g?.members) ? g.members : []).forEach((m) => {
      const source = String(m?.source || '').trim();
      const refId = String(m?.refId || '').trim();
      if (!source || !refId) return;
      const key = `${source}:${refId}`;
      if (seen.has(key)) return;
      seen.add(key);
      members.push({ ...m, source, refId });
    });
  });
  return members;
}

function roleMatches(memberRole, requiredRole) {
  const a = String(memberRole || '').trim().toLowerCase();
  const b = String(requiredRole || '').trim().toLowerCase();
  if (!a || !b) return false;
  // Allow a bit of flexibility: "bas p", "BAS-P", "BASP"
  const norm = (x) => x.replace(/\s+/g, '').replace(/[-–—]/g, '');
  return norm(a).includes(norm(b));
}

function computeTimelineHighlights(data) {
  const isoToday = todayIso();

  const custom = Array.isArray(data?.customDates) ? data.customDates : [];
  const visits = Array.isArray(data?.siteVisits) ? data.siteVisits : [];

  const events = [];

  custom.forEach((d) => {
    const iso = String(d?.date || '').trim();
    if (!isValidIsoDate(iso)) return;
    const title = String(d?.title || '').trim() || 'Datum';
    events.push({ title, iso });
  });

  visits.forEach((v) => {
    const title = String(v?.title || '').trim() || 'Platsbesök';
    (Array.isArray(v?.dates) ? v.dates : []).forEach((isoRaw) => {
      const iso = String(isoRaw || '').trim();
      if (!isValidIsoDate(iso)) return;
      events.push({ title, iso });
    });
  });

  // Sort by date then title for stable output.
  events.sort((a, b) => {
    if (a.iso !== b.iso) return a.iso.localeCompare(b.iso);
    return String(a.title).localeCompare(String(b.title), 'sv');
  });

  const upcoming = events.filter((e) => e.iso >= isoToday);
  const passed = events.filter((e) => e.iso < isoToday);

  const nextUpcoming = upcoming.length > 0 ? upcoming[0] : null;
  const lastPassed = passed.length > 0 ? passed[passed.length - 1] : null;

  let status = null;
  if (nextUpcoming) {
    status = nextUpcoming.iso === isoToday ? 'Idag' : 'Kommande';
  } else if (lastPassed) {
    status = 'Passerat';
  }

  return { nextUpcoming, lastPassed, status };
}

function badgeStyle(status) {
  if (status === 'Idag') {
    return { bg: 'rgba(25, 118, 210, 0.12)', border: 'rgba(25, 118, 210, 0.26)', text: '#0B4AA2' };
  }
  if (status === 'Kommande') {
    return { bg: 'rgba(22, 163, 74, 0.10)', border: 'rgba(22, 163, 74, 0.22)', text: '#166534' };
  }
  if (status === 'Passerat') {
    return { bg: 'rgba(148, 163, 184, 0.14)', border: 'rgba(148, 163, 184, 0.28)', text: '#64748B' };
  }
  return { bg: 'transparent', border: 'transparent', text: COLORS.textSubtle };
}

function useFragaSvarSummary({ companyId, projectId }) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!cid || !pid) {
      setItems([]);
      return;
    }

    const unsub = listenFragaSvarItems(
      cid,
      pid,
      (next) => setItems(Array.isArray(next) ? next : []),
      (_err) => setItems([])
    );

    return () => {
      try { unsub(); } catch (_e) {}
    };
  }, [cid, pid]);

  return useMemo(() => {
    const list = Array.isArray(items) ? items : [];
    const total = list.length;

    let unanswered = 0;
    let latestCreatedMs = 0;

    list.forEach((it) => {
      const status = String(it?.status || '').trim().toLowerCase();
      const answer = String(it?.answer || it?.comment || '').trim();
      const isUnanswered = status === 'obesvarad' || (!answer && status !== 'besvarad');
      if (isUnanswered) unanswered += 1;

      const t = toTsMs(it?.createdAt);
      if (t > latestCreatedMs) latestCreatedMs = t;
    });

    return {
      total,
      unanswered,
      latestQuestionDateText: latestCreatedMs ? new Date(latestCreatedMs).toLocaleDateString('sv-SE') : '',
    };
  }, [items]);
}

function Card({ title, icon, onPress, children, hintRight = null }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ hovered, pressed }) => {
        const isWeb = Platform.OS === 'web';
        const bg = pressed ? 'rgba(0,0,0,0.015)' : '#fff';
        const border = hovered && isWeb ? COLORS.blue : COLORS.borderStrong;
        return [
          styles.card,
          (Platform.OS === 'web' ? styles.cardWeb : styles.cardNative),
          { backgroundColor: bg, borderColor: border },
        ];
      }}
    >
      <View style={styles.cardHeader}>
        <View style={styles.cardHeaderLeft}>
          <Ionicons name={icon} size={18} color={COLORS.textSubtle} style={{ marginRight: 8 }} />
          <Text style={styles.cardTitle} numberOfLines={1}>{title}</Text>
        </View>
        {hintRight ? (
          <View style={styles.cardHeaderRight}>
            {hintRight}
          </View>
        ) : null}
      </View>
      <View style={styles.cardBody}>
        {children}
      </View>
    </Pressable>
  );
}

function Row({ label, value, tone = 'normal' }) {
  const color = tone === 'muted' ? COLORS.textMuted : COLORS.text;
  return (
    <View style={styles.row}>
      <Text style={[styles.rowLabel, { color: COLORS.textSubtle }]} numberOfLines={1}>{label}</Text>
      <Text style={[styles.rowValue, { color }]} numberOfLines={1}>{value || '—'}</Text>
    </View>
  );
}

const TIDSPLAN_ITEM_ID = 'tidsplan-viktiga-datum';

export default function OversiktDashboard({ companyId, projectId, project, onNavigate }) {
  const [navigatingTo, setNavigatingTo] = useState(null);

  const projectNumber = String(project?.projectNumber || project?.number || project?.id || '').trim();
  const rawName = String(project?.projectName || project?.name || '').trim();
  const projectName = rawName;

  const phase = getProjectPhase(project);
  const phaseLabel = String(phase?.name || phase?.label || project?.phase || project?.phaseKey || '').trim() || '—';

  const kontaktpersonName = String(project?.kontaktperson?.name || '').trim();

  const { organisation } = useProjectOrganisation({ companyId, projectId });
  const allMembers = useMemo(() => uniqueIdentitiesFromGroups(organisation?.groups), [organisation]);

  const internalCount = useMemo(
    () => allMembers.filter((m) => String(m?.source || '').trim() === 'internal').length,
    [allMembers]
  );
  const externalCount = useMemo(
    () => allMembers.filter((m) => String(m?.source || '').trim() === 'contact').length,
    [allMembers]
  );

  const requiredRoles = ['BAS-P'];
  const missingRoles = useMemo(() => {
    return requiredRoles.filter((r) => !allMembers.some((m) => roleMatches(m?.role, r)));
  }, [allMembers]);

  const { customDates, siteVisits } = useProjectTimelineDates({ companyId, projectId });
  const timelineData = useMemo(() => ({ customDates: customDates || [], siteVisits: siteVisits || [] }), [customDates, siteVisits]);
  const timeline = useMemo(() => computeTimelineHighlights(timelineData), [timelineData]);

  const calendarItems = useMemo(() => {
    const custom = Array.isArray(customDates) ? customDates : [];
    const visits = Array.isArray(siteVisits) ? siteVisits : [];
    const list = custom
      .filter((d) => isValidIsoDate(d?.date))
      .map((d) => ({ id: d.id, date: String(d.date), title: String(d?.title || '').trim() || 'Datum', type: String(d?.customType || d?.type || '').trim() || 'Datum', ...d }));
    visits.forEach((v) => {
      (Array.isArray(v?.dates) ? v.dates : []).forEach((iso) => {
        if (!isValidIsoDate(iso)) return;
        list.push({
          id: `${v.id}_${iso}`,
          date: iso,
          title: String(v?.title || '').trim() || 'Platsbesök',
          type: 'Platsbesök',
          ...v,
        });
      });
    });
    list.sort((a, b) => {
      if (a.date !== b.date) return a.date.localeCompare(b.date);
      return String(a.title).localeCompare(String(b.title), 'sv');
    });
    return list;
  }, [customDates, siteVisits]);

  const fsSummary = useFragaSvarSummary({ companyId, projectId });

  const statusBadge = timeline?.status ? badgeStyle(timeline.status) : null;

  const hasAnyDates = (timeline?.nextUpcoming || timeline?.lastPassed) != null;
  const hasCalendarItems = calendarItems.length > 0;

  const handleNavigateToTidsplan = (selectedIso) => {
    setNavigatingTo(TIDSPLAN_ITEM_ID);
    onNavigate?.(TIDSPLAN_ITEM_ID, selectedIso != null ? { selectedIso: String(selectedIso) } : undefined);
  };

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.container} showsVerticalScrollIndicator={true}>
      <View style={styles.helpRow}>
        <Ionicons name="information-circle-outline" size={16} color={COLORS.textSubtle} style={{ marginRight: 8 }} />
        <Text style={styles.helpText} numberOfLines={2}>
          Detta är en översikt. Klicka på ett kort för att se och arbeta vidare med detaljer.
        </Text>
      </View>

      <Text style={styles.sectionHeading}>Översiktskort</Text>
      <View style={styles.grid}>
        <Card
          title="Skede"
          icon="information-circle-outline"
          onPress={() => onNavigate?.('projektinfo')}
        >
          <Row label="Projektnummer" value={projectNumber} />
          <Row label="Projektnamn" value={projectName} />
          <Row label="Skede" value={phaseLabel} />
          <Row label="Kontaktperson" value={kontaktpersonName} tone="muted" />
        </Card>

        <Card
          title="Organisation & roller"
          icon="people-outline"
          onPress={() => onNavigate?.('organisation-roller')}
          hintRight={
            missingRoles.length > 0 ? (
              <View style={styles.subtleWarning}>
                <Ionicons name="warning-outline" size={14} color={COLORS.danger} style={{ marginRight: 6 }} />
                <Text style={styles.subtleWarningText} numberOfLines={1}>Saknar {missingRoles.join(', ')}</Text>
              </View>
            ) : null
          }
        >
          <Row label="Interna deltagare" value={String(internalCount)} />
          <Row label="Externa deltagare" value={String(externalCount)} />
          <Row label="Obligatoriska roller" value={missingRoles.length > 0 ? `Saknar ${missingRoles.join(', ')}` : 'OK'} tone={missingRoles.length > 0 ? 'normal' : 'muted'} />
        </Card>

        <Card
          title="Tidsplan & viktiga datum"
          icon="calendar-outline"
          onPress={() => handleNavigateToTidsplan()}
          hintRight={
            timeline?.status ? (
              <View style={[styles.badge, { backgroundColor: statusBadge.bg, borderColor: statusBadge.border }]}>
                <Text style={[styles.badgeText, { color: statusBadge.text }]}>{timeline.status}</Text>
              </View>
            ) : null
          }
        >
          <View style={{ gap: 6 }}>
            {!hasAnyDates ? (
              <Text style={styles.emptyHint}>Inga datum tillagda än</Text>
            ) : (
              <>
                <View style={styles.lineBlock}>
                  <Text style={styles.lineLabel} numberOfLines={1}>Nästa</Text>
                  <Text style={styles.lineValue} numberOfLines={2}>
                    {timeline?.nextUpcoming
                      ? `${timeline.nextUpcoming.title} – ${formatIsoDateSv(timeline.nextUpcoming.iso)}`
                      : '—'}
                  </Text>
                </View>
                <View style={styles.lineBlock}>
                  <Text style={styles.lineLabel} numberOfLines={1}>Senast passerat</Text>
                  <Text style={styles.lineValue} numberOfLines={2}>
                    {timeline?.lastPassed
                      ? `${timeline.lastPassed.title} – ${formatIsoDateSv(timeline.lastPassed.iso)}`
                      : '—'}
                  </Text>
                </View>
              </>
            )}
          </View>
        </Card>

        <Card
          title="Frågor & svar"
          icon="chatbox-ellipses-outline"
          onPress={() => onNavigate?.('status-beslut')}
        >
          <Row label="Totalt" value={String(fsSummary.total)} />
          <Row label="Obesvarade" value={String(fsSummary.unanswered)} />
          <Row label="Senast inkomna" value={fsSummary.latestQuestionDateText} tone="muted" />
        </Card>
      </View>

      <View style={styles.calendarCard}>
        {!hasCalendarItems ? (
          <Pressable
            onPress={handleNavigateToTidsplan}
            style={({ hovered, pressed }) => [
              styles.calendarEmpty,
              (hovered || pressed) && Platform.OS === 'web' ? { backgroundColor: 'rgba(25, 118, 210, 0.04)' } : {},
            ]}
          >
            <Ionicons name="calendar-outline" size={28} color={COLORS.textSubtle} style={{ marginBottom: 8 }} />
            <Text style={styles.emptyHint}>Inga datum tillagda än</Text>
            <Text style={styles.emptyHintSub}>Klicka för att gå till Tidsplan och lägga in datum</Text>
          </Pressable>
        ) : (
          <>
            <OverviewWeekCalendar
              items={calendarItems}
              todayIso={todayIso()}
              onPressItem={(item) => handleNavigateToTidsplan(item?.date)}
              onPressDay={(iso) => handleNavigateToTidsplan(iso)}
              colors={COLORS}
            />
            {navigatingTo ? (
              <View style={styles.calendarLoadingOverlay} pointerEvents="none">
                <View style={styles.calendarLoadingBox}>
                  <Text style={styles.calendarLoadingText}>Laddar...</Text>
                </View>
              </View>
            ) : null}
          </>
        )}
      </View>

      <Text style={[PROJECT_TYPOGRAPHY.smallHintText, styles.footerHint]} numberOfLines={1}>
        Läsbar sammanfattning – inga redigeringsfält i denna vy.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  container: {
    minHeight: 0,
    padding: 18,
    paddingBottom: 24,
  },

  sectionHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: COLORS.textSubtle,
    marginBottom: 10,
    marginTop: 4,
  },

  helpRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: COLORS.border,
    backgroundColor: 'rgba(255,255,255,0.92)',
    marginBottom: 14,
  },

  helpText: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textMuted,
    flex: 1,
    minWidth: 0,
    lineHeight: 18,
  },

  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 24,
    alignContent: 'flex-start',
  },

  card: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    minHeight: 172,
    flexGrow: 1,

    // Subtle elevation/separation (no new colors).
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  },

  // 2x2 grid on web; stacked cards on native.
  cardWeb: {
    flexBasis: '49%',
  },

  cardNative: {
    width: '100%',
  },

  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    gap: 10,
  },

  cardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
    flex: 1,
  },

  cardHeaderRight: {
    flexShrink: 0,
  },

  cardTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.text,
    minWidth: 0,
    flex: 1,
  },

  cardBody: {
    gap: 6,
  },

  row: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 10,
  },

  rowLabel: {
    fontSize: 12,
    fontWeight: '600',
    flexShrink: 0,
    width: 120,
  },

  rowValue: {
    fontSize: 13,
    fontWeight: '500',
    flex: 1,
    textAlign: 'right',
  },

  subtleWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(220, 38, 38, 0.22)',
    backgroundColor: 'rgba(220, 38, 38, 0.06)',
    maxWidth: 170,
  },

  subtleWarningText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
  },

  badge: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 999,
    borderWidth: 1,
  },

  badgeText: {
    fontSize: 12,
    fontWeight: '700',
  },

  lineBlock: {
    gap: 2,
  },

  lineLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: COLORS.textSubtle,
  },

  lineValue: {
    fontSize: 13,
    fontWeight: '500',
    color: COLORS.text,
    lineHeight: 18,
  },

  emptyHint: {
    fontSize: 13,
    color: COLORS.textSubtle,
    fontStyle: 'italic',
  },
  emptyHintSub: {
    fontSize: 12,
    color: COLORS.textSubtle,
    marginTop: 4,
  },

  calendarCard: {
    width: '100%',
    alignSelf: 'stretch',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: 12,
    paddingTop: 10,
    paddingHorizontal: 14,
    paddingBottom: 14,
    marginTop: 48,
    marginBottom: 16,
    backgroundColor: '#fff',
    position: 'relative',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  calendarLoadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarLoadingBox: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: COLORS.border,
  },
  calendarLoadingText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textMuted,
  },
  calendarEmpty: {
    minHeight: 120,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  footerHint: {
    color: COLORS.textSubtle,
    marginTop: 10,
  },
});
