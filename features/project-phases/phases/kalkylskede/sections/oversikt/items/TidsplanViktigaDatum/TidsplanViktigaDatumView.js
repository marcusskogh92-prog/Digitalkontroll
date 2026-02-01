/**
 * TidsplanViktigaDatumView
 * (Översikt 03) – project timeline (local state).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { v4 as uuidv4 } from 'uuid';
import CompactMonthCalendar from '../../../../../../../../components/common/CompactMonthCalendar';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import { fetchCompanyContacts, updateProjectInfoImportantDateFromTimeline } from '../../../../../../../../components/firebase';
import { emitProjectUpdated } from '../../../../../../../../components/projectBus';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';
import { useProjectTimelineDates } from '../../../../../../../../hooks/useProjectTimelineDates';

import DateModal from './tidsplan/DateModal';

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

function normalizeSearch(s) {
  return String(s || '').trim().toLowerCase();
}

function isValidTimeHHMM(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

function timeToMinutes(value) {
  if (!isValidTimeHHMM(value)) return null;
  const [hh, mm] = String(value).split(':');
  return Number(hh) * 60 + Number(mm);
}

function isValidEmailLight(value) {
  const e = String(value || '').trim();
  return e.includes('@');
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

function formatIcsDateTimeUtc(d) {
  const dt = d instanceof Date ? d : new Date(d);
  if (!Number.isFinite(dt.getTime())) return '';
  return (
    String(dt.getUTCFullYear()) +
    pad2(dt.getUTCMonth() + 1) +
    pad2(dt.getUTCDate()) +
    'T' +
    pad2(dt.getUTCHours()) +
    pad2(dt.getUTCMinutes()) +
    pad2(dt.getUTCSeconds()) +
    'Z'
  );
}

function formatIcsDateLocalValue(iso) {
  const s = String(iso || '').trim();
  if (!isValidIsoDate(s)) return '';
  return s.replace(/-/g, '');
}

function escapeIcsText(value) {
  // RFC5545-ish escaping; Outlook is tolerant, but this prevents obvious breakage.
  const s = String(value ?? '').replace(/\r\n/g, '\n').replace(/\r/g, '');
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function buildIcsInvite({
  uid,
  title,
  isoDate,
  startTime,
  endTime,
  description,
  location,
  attendees,
}) {
  const safeTitle = escapeIcsText(title || 'Möte');
  const safeDescription = escapeIcsText(description || '');
  const safeLocation = escapeIcsText(location || '');
  const dtstamp = formatIcsDateTimeUtc(new Date());

  const hasTimes = isValidTimeHHMM(startTime) && isValidTimeHHMM(endTime);
  const icsDate = formatIcsDateLocalValue(isoDate);

  let dtStartLine = '';
  let dtEndLine = '';

  if (icsDate && hasTimes) {
    const start = new Date(`${isoDate}T${startTime}:00`);
    const end = new Date(`${isoDate}T${endTime}:00`);
    const startUtc = formatIcsDateTimeUtc(start);
    const endUtc = formatIcsDateTimeUtc(end);
    if (startUtc && endUtc) {
      dtStartLine = `DTSTART:${startUtc}`;
      dtEndLine = `DTEND:${endUtc}`;
    }
  }

  // Fallback: all-day event if times are missing/invalid.
  if (!dtStartLine || !dtEndLine) {
    if (!icsDate) return '';
    const d = new Date(`${isoDate}T00:00:00`);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const nextIso = toIsoDate(next);
    const nextDate = formatIcsDateLocalValue(nextIso);
    dtStartLine = `DTSTART;VALUE=DATE:${icsDate}`;
    dtEndLine = `DTEND;VALUE=DATE:${nextDate}`;
  }

  const attendeeLines = (Array.isArray(attendees) ? attendees : [])
    .map((a) => {
      const email = normalizeEmail(a?.email);
      if (!isValidEmailLight(email)) return null;
      const name = String(a?.name || '').trim();
      const cnPart = name ? `;CN=${escapeIcsText(name)}` : '';
      return `ATTENDEE${cnPart}:mailto:${escapeIcsText(email)}`;
    })
    .filter(Boolean);

  // METHOD:REQUEST makes Outlook treat it as an invitation (user still sends).
  const lines = [
    'BEGIN:VCALENDAR',
    'PRODID:-//DigitalKontroll//Outlook Invite//SV',
    'VERSION:2.0',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${escapeIcsText(uid)}`,
    `DTSTAMP:${dtstamp}`,
    `SUMMARY:${safeTitle}`,
    dtStartLine,
    dtEndLine,
    safeLocation ? `LOCATION:${safeLocation}` : null,
    safeDescription ? `DESCRIPTION:${safeDescription}` : null,
    ...attendeeLines,
    'END:VEVENT',
    'END:VCALENDAR',
  ].filter(Boolean);

  return `${lines.join('\r\n')}\r\n`;
}

function downloadIcsOnWeb(filename, icsText) {
  const blob = new Blob([icsText], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  try {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } finally {
    // Revoke asynchronously to allow the click to read it.
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
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

export default function TidsplanViktigaDatumView({ projectId, companyId, project, hidePageHeader = false }) {
  const todayIso = React.useMemo(() => toIsoDate(new Date()), []);

  const timeline = useProjectTimelineDates({ companyId, projectId });
  const items = React.useMemo(
    () => (Array.isArray(timeline?.customDates) ? timeline.customDates : []),
    [timeline?.customDates]
  );

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
        date: '',
        dates: [],
        title: '',
        type: '',
        description: '',
        allowMulti: false,
        baseNumber: 1,
        startTime: '',
        endTime: '',
        participants: [],
        outlookInvitationPrepared: false,
      },
    });
  }, [todayIso]);

  const openEdit = React.useCallback((it) => {
    if (!it) return;
    const source = String(it?.source || '').trim();
    const sourceKey = String(it?.sourceKey || '').trim();
    const locked = typeof it?.locked === 'boolean' ? it.locked : undefined;
    setModalState({
      open: true,
      initial: {
        id: String(it.id || ''),
        date: isValidIsoDate(it?.date) ? String(it.date) : '',
        dates: [],
        title: String(it?.title || ''),
        type: String(it?.type || it?.customType || 'Valfritt möte'),
        description: String(it?.description || ''),
        allowMulti: false,
        baseNumber: 1,
        startTime: String(it?.startTime || '').trim(),
        endTime: String(it?.endTime || '').trim(),
        participants: normalizeParticipants(it?.participants),
        outlookInvitationPrepared: !!it?.outlookInvitationPrepared,

        // Sync metadata (Projektinformation-milestones)
        source: source || null,
        sourceKey: sourceKey || null,
        locked,
      },
    });
  }, [todayIso]);

  const prepareOutlookInvitation = React.useCallback((it) => {
    // IMPORTANT LIMITATIONS (user-driven status):
    // - DigitalKontroll generates a local .ics file only (no backend / no Outlook integration).
    // - DigitalKontroll does NOT verify that the invitation is actually sent.
    // - No sync with Outlook afterwards, and no tracking of responses (accepted/declined).
    // - Status is set when the user clicks the action (intent), not when Outlook sends.
    const id = String(it?.id || '').trim();
    const iso = isValidIsoDate(it?.date) ? String(it.date) : '';
    if (!id || !iso) return;

    const title = String(it?.title || it?.type || 'Möte').trim();
    const startTime = String(it?.startTime || '').trim();
    const endTime = String(it?.endTime || '').trim();

    const rawDesc = String(it?.description || '').trim();
    const type = String(it?.type || '').trim();
    const description = rawDesc
      ? rawDesc + (type ? `\n\nTyp: ${type}` : '')
      : (type ? `Typ: ${type}` : '');

    const participants = Array.isArray(it?.participants) ? it.participants : [];
    const attendees = participants
      .map((p) => ({ name: String(p?.name || '').trim(), email: normalizeEmail(p?.email) }))
      .filter((a) => isValidEmailLight(a.email));

    const uid = `${id}@digitalkontroll.local`;
    const ics = buildIcsInvite({
      uid,
      title,
      isoDate: iso,
      startTime,
      endTime,
      description,
      location: type,
      attendees,
    });

    if (!ics) return;

    // Web: download an .ics file. The OS/browser decides whether Outlook opens automatically
    // or if the user must open the downloaded invite manually.
    if (Platform.OS === 'web') {
      const safe = title.replace(/[^a-z0-9\- _]/gi, '').trim() || 'mote';
      const filename = `${iso}_${safe}.ics`;
      downloadIcsOnWeb(filename, ics);
    }

    // User-driven status: assume intent to send once user chose to open the invite.
    try {
      timeline.updateCustomDate(id, { outlookInvitationPrepared: true });
    } catch (_e) {}
  }, [timeline]);

  const closeModal = React.useCallback(() => {
    setModalState({ open: false, initial: null });
  }, []);

  const onSaveModal = React.useCallback(async (payload) => {
    const p = payload && typeof payload === 'object' ? payload : {};
    const ty = String(p.type || p.title || '').trim();
    const t = String(p.title || '').trim();
    const desc = String(p.description || '').trim();
    const participants = normalizeParticipants(p.participants);
    const startTime = String(p?.startTime || '').trim();
    const endTime = String(p?.endTime || '').trim();

    const src = String(p?.source || '').trim();
    const isProjectInfo = src === 'projectinfo' || src === 'projectInformation';
    const sourceKey = String(p?.sourceKey || '').trim();
    const projectInfoDateUnlocked = !!p?.projectInfoDateUnlocked;

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
        const itemStartTime = String(mi?.startTime || '').trim();
        const itemEndTime = String(mi?.endTime || '').trim();
        return {
          id: uuidv4(),
          date: iso,
          title: itemTitle,
          type: ty,
          customType: ty,
          description: desc,
          participants: itemParticipants,
          startTime: itemStartTime,
          endTime: itemEndTime,
          outlookInvitationPrepared: false,
        };
      });

      try {
        await timeline.appendCustomDates(newItems);
      } catch (_e) {}
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

      const current = items.find((x) => String(x?.id || '') === id) || null;
      const prevIso = isValidIsoDate(current?.date) ? String(current.date) : '';
      try {
        await timeline.updateCustomDate(id, {
          date: iso,
          title: t,
          type: ty,
          customType: ty,
          description: desc,
          participants,
          startTime,
          endTime,
        });
      } catch (_e) {}

      // Two-way sync: unlocked Projektinformation milestone => update Projektinformation field.
      if (isProjectInfo && projectInfoDateUnlocked && sourceKey && iso && iso !== prevIso) {
        try {
          const res = await updateProjectInfoImportantDateFromTimeline(companyId, projectId, sourceKey, iso);
          // Ensure Projektinformation updates immediately (no manual refresh).
          if (res?.patch) {
            const nextProject = {
              ...(project && typeof project === 'object' ? project : {}),
              id: String(projectId || '').trim(),
              ...res.patch,
            };
            emitProjectUpdated(nextProject);
          }
        } catch (_e) {}
      }
      closeModal();
      return;
    }

    // New single item.
    try {
      await timeline.addCustomDate({
        id: uuidv4(),
        date: iso,
        title: t,
        type: ty,
        customType: ty,
        description: desc,
        participants,
        startTime,
        endTime,
        outlookInvitationPrepared: false,
      });
    } catch (_e) {}
    closeModal();
  }, [closeModal, timeline]);

  const onDeleteModal = React.useCallback(async () => {
    const id = String(modalState?.initial?.id || '').trim();
    if (!id) {
      closeModal();
      return;
    }

    const current = items.find((x) => String(x?.id || '') === id);
    const src = String(current?.source || '').trim();
    const isProjectInfo = src === 'projectinfo' || src === 'projectInformation';
    if (isProjectInfo) {
      closeModal();
      return;
    }

    try {
      await timeline.removeCustomDate(id);
    } catch (_e) {}
    closeModal();
  }, [modalState?.initial?.id, closeModal, timeline, items]);

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
      style={{ flex: 1, minHeight: 0, backgroundColor: 'transparent' }}
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

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, justifyContent: 'flex-end' }}>
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
              <Text style={{ fontSize: 12, fontWeight: FW_MED, color: '#fff' }}>+ Lägg till datum / möte</Text>
            </Pressable>
          </View>
        </View>

        <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginBottom: 10 }}>
          Om Outlook inte öppnas automatiskt – öppna den nedladdade kallelsen.
        </Text>

        <View style={{ borderWidth: 1, borderColor: COLORS.border, borderRadius: 12, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7', backgroundColor: '#fff' }}>
            <Text style={{ width: 110, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Datum</Text>
            <Text style={{ flexGrow: 0, flexShrink: 1, flexBasis: 500, minWidth: 0, maxWidth: 540, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Titel</Text>
            <Text style={{ width: 86, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Deltagare</Text>
            <Text style={{ width: 92, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Status</Text>
            <Text style={{ width: 150, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Outlook</Text>
            <View style={{ width: 30 }} />
          </View>

          {sortedItems.length === 0 ? (
            <View style={{ paddingVertical: 12, paddingHorizontal: 12 }}>
              <Text style={{ fontSize: 13, color: COLORS.textSubtle }}>Inga datum ännu.</Text>
              <Text style={{ fontSize: 12, color: COLORS.textSubtle, marginTop: 6 }}>
                Lägg till datum för möten och platsbesök – de visas automatiskt i kalendern.
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
              const outlookPrepared = !!it?.outlookInvitationPrepared;
              const outlookHelp = 'DigitalKontroll skapar en .ics-kallelse. Outlook kan öppnas automatiskt eller behöva öppnas manuellt. DigitalKontroll skickar inte kallelsen – du skickar i Outlook.';

              const src = String(it?.source || '').trim();
              const isProjectInfo = src === 'projectinfo' || src === 'projectInformation';
              const isDateLocked = isProjectInfo && (it?.locked !== false);
              const lockTooltip = 'Datumet styrs från Projektinformationen';

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
                    openEdit(it);
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
                  <View style={{ width: 110 }}>
                    <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: FW_REG }} numberOfLines={1}>
                      {iso || '—'}
                    </Text>
                    {formatTimeLabel(it?.startTime, it?.endTime) ? (
                      <Text style={{ marginTop: 2, fontSize: 12, color: COLORS.textSubtle, fontWeight: FW_REG }} numberOfLines={1}>
                        {formatTimeLabel(it?.startTime, it?.endTime)}
                      </Text>
                    ) : null}

                    {!isDateLocked ? null : (
                      <Pressable
                        onPress={(e) => {
                          e?.stopPropagation?.();
                        }}
                        {...(Platform.OS === 'web' ? { title: lockTooltip } : {})}
                        style={{ marginTop: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                      >
                        <Ionicons name="lock-closed-outline" size={14} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                          Låst
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={{ flexGrow: 0, flexShrink: 1, flexBasis: 500, minWidth: 0, maxWidth: 540, paddingRight: 12 }}>
                    <Text style={{ fontSize: 13, color: COLORS.text, fontWeight: FW_REG }} numberOfLines={1}>
                      {String(it?.title || it?.type || '—')}
                    </Text>
                  </View>

                  <View style={{ width: 86, paddingHorizontal: 6, alignItems: 'flex-start', flexDirection: 'row', justifyContent: 'flex-start', gap: 8 }}>
                    {participantCount > 0 ? (
                      <>
                        <Ionicons name="people-outline" size={14} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 13, color: COLORS.textSubtle, fontWeight: FW_MED }} numberOfLines={1}>
                          {participantCount}
                        </Text>
                      </>
                    ) : (
                      <Text style={{ fontSize: 11, color: COLORS.textSubtle }} numberOfLines={1}>
                        —
                      </Text>
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

                  <View style={{ width: 150, alignItems: 'flex-start' }}>
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        prepareOutlookInvitation(it);
                      }}
                      hitSlop={8}
                      accessibilityLabel="Skicka Outlook-kallelse"
                      {...(Platform.OS === 'web' ? { title: outlookHelp } : {})}
                      style={({ hovered, pressed }) => ({
                        padding: 4,
                        borderRadius: 8,
                        backgroundColor: hovered || pressed ? '#F1F5F9' : 'transparent',
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                      })}
                    >
                      <Ionicons
                        name={outlookPrepared ? 'checkmark-circle' : 'mail-outline'}
                        size={18}
                        color={outlookPrepared ? COLORS.green : COLORS.textSubtle}
                      />
                      <Text style={{ fontSize: 12, fontWeight: FW_MED, color: outlookPrepared ? COLORS.green : COLORS.textSubtle }} numberOfLines={1}>
                        {outlookPrepared ? 'Kallelse skickad' : 'Ej skickad'}
                      </Text>
                    </Pressable>
                  </View>

                  <View style={{ width: 30, alignItems: 'flex-end' }}>
                    <Pressable
                      onPress={(e) => {
                        e?.stopPropagation?.();
                        openEdit(it);
                      }}
                      hitSlop={8}
                      {...(Platform.OS === 'web' && isDateLocked ? { title: lockTooltip } : {})}
                      style={({ hovered, pressed }) => ({
                        padding: 4,
                        borderRadius: 8,
                        backgroundColor: hovered || pressed ? '#F1F5F9' : 'transparent',
                      })}
                    >
                      <Ionicons name={isDateLocked ? 'lock-closed-outline' : 'create-outline'} size={16} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ marginTop: 18, marginBottom: 10 }}>
          <View style={{ height: 1, backgroundColor: '#EEF2F7' }} />
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
          options={{ todayDayNumberUsesAccentText: false, neutralEventText: true, showTimeInEventCell: true }}
        />
      </View>

      <DateModal
        visible={!!modalState?.open}
        initial={modalState?.initial}
        onClose={closeModal}
        onSave={onSaveModal}
        onDelete={onDeleteModal}
        onUnlockDate={async () => {
          const id = String(modalState?.initial?.id || '').trim();
          if (!id) return;
          try {
            await timeline.updateCustomDate(id, { locked: false });
          } catch (_e) {}
        }}
        peopleCandidates={peopleCandidates}
        peopleLoading={!!contactCandidates?.loading || !!organisationLoading}
        peopleError={String(contactCandidates?.error || organisationError || '').trim()}
      />
    </ScrollView>
  );
}
