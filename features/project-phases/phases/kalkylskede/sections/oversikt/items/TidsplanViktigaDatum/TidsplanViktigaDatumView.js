/**
 * TidsplanViktigaDatumView
 * (Översikt 03) – project timeline (local state).
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { v4 as uuidv4 } from 'uuid';
import CompactMonthCalendar from '../../../../../../../../components/common/CompactMonthCalendar';
import { deriveEventType, extractProjectNumberAndName, formatExternalCalendarSubject } from '../../../../../../../../components/common/calendarEventTitle';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../../../../../../../../components/common/layoutConstants';
import { PROJECT_TYPOGRAPHY } from '../../../../../../../../components/common/projectTypography';
import { fetchCompanyContacts, updateProjectInfoImportantDateFromTimeline } from '../../../../../../../../components/firebase';
import { emitProjectUpdated } from '../../../../../../../../components/projectBus';
import { useProjectOrganisation } from '../../../../../../../../hooks/useProjectOrganisation';
import { useProjectTimelineDates } from '../../../../../../../../hooks/useProjectTimelineDates';
import { cancelOutlookEvent, updateOutlookEvent } from '../../../../../../../../services/outlook/outlookCalendarService';
import ContextMenu from '../../../../../../../../components/ContextMenu';
import ConfirmModal from '../../../../../../../../components/common/Modals/ConfirmModal';

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

const CONTENT_MAX_WIDTH = 1200;

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

/** Single source of truth: Outlook invitation sent (for UI "Kallelse skickad" and delete warning). */
function hasOutlookInvitation(item) {
  return Boolean(
    item?.outlookEventId ||
    item?.outlook?.eventId ||
    item?.outlookStatus === 'sent' ||
    item?.outlook === 'sent'
  );
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

export default function TidsplanViktigaDatumView({ projectId, companyId, project, hidePageHeader = false, navigationParams }) {
  const todayIso = React.useMemo(() => toIsoDate(new Date()), []);

  const timeline = useProjectTimelineDates({ companyId, projectId });

  const navSelectedIso = React.useMemo(() => {
    const iso = navigationParams?.selectedIso;
    return isValidIsoDate(iso) ? String(iso) : '';
  }, [navigationParams?.selectedIso]);

  const [flashIsoFromNav, setFlashIsoFromNav] = React.useState('');
  React.useEffect(() => {
    if (!navSelectedIso) return;
    setFlashIsoFromNav(navSelectedIso);
    const t = setTimeout(() => setFlashIsoFromNav(''), 2500);
    return () => clearTimeout(t);
  }, [navSelectedIso]);

  /** Optimistic update: hide these ids from the list until Firestore snapshot confirms (or rollback on error). */
  const [optimisticRemovedIds, setOptimisticRemovedIds] = React.useState(() => []);

  const items = React.useMemo(() => {
    const list = Array.isArray(timeline?.customDates) ? timeline.customDates : [];
    const removed = Array.isArray(optimisticRemovedIds) ? optimisticRemovedIds : [];
    if (removed.length === 0) return list;
    return list.filter((item) => !removed.includes(String(item?.id || '')));
  }, [timeline?.customDates, optimisticRemovedIds]);

  React.useEffect(() => {
    const list = Array.isArray(timeline?.customDates) ? timeline.customDates : [];
    const idsInBackend = new Set(list.map((d) => String(d?.id || '')));
    setOptimisticRemovedIds((prev) => prev.filter((id) => idsInBackend.has(id)));
  }, [timeline?.customDates]);

  const scrollRef = React.useRef(null);
  const scrollYRef = React.useRef(0);
  const rowRefsRef = React.useRef({});

  const [selectedDateId, setSelectedDateId] = React.useState('');
  const [flashDateId, setFlashDateId] = React.useState('');
  const flashTimerRef = React.useRef(null);

  const selectedIsoFromList = React.useMemo(() => {
    const item = (timeline?.customDates || []).find((d) => String(d?.id || '') === selectedDateId);
    return item && isValidIsoDate(item?.date) ? String(item.date) : '';
  }, [timeline?.customDates, selectedDateId]);
  const flashIsoFromList = React.useMemo(() => {
    const item = (timeline?.customDates || []).find((d) => String(d?.id || '') === flashDateId);
    return item && isValidIsoDate(item?.date) ? String(item.date) : '';
  }, [timeline?.customDates, flashDateId]);

  const selectedIso = selectedIsoFromList || navSelectedIso;
  const flashIso = flashIsoFromNav || flashIsoFromList;

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

  /** Modal when deleting a date that has an Outlook event: user chooses cancel-in-Outlook or local-only. */
  const [outlookDeleteModal, setOutlookDeleteModal] = React.useState(() => ({
    open: false,
    item: null,
    choice: null,
  }));

  /** Row overflow menu (⋯): anchor { item, x, y } when open. */
  const [rowMenuAnchor, setRowMenuAnchor] = React.useState(null);

  /** Bekräftelsemodal för radera datum (samma UX som byggdelar: Enter = radera, Esc = avbryt). */
  const [deleteConfirmDate, setDeleteConfirmDate] = React.useState(null);

  /** Modal: "Avboka möte i Outlook" only (no delete) – requires confirmation. */
  const [cancelOutlookOnlyModal, setCancelOutlookOnlyModal] = React.useState({ open: false, item: null });

  /** Optimistic Outlook status per id: 'sending' | 'sent'. Cleared when Firestore snapshot has outlookStatus. */
  const [optimisticOutlook, setOptimisticOutlook] = React.useState(() => ({}));

  React.useEffect(() => {
    const list = Array.isArray(timeline?.customDates) ? timeline.customDates : [];
    const sentIds = new Set(list.filter((d) => d?.outlookStatus === 'sent' || hasOutlookInvitation(d)).map((d) => String(d?.id || '')));
    setOptimisticOutlook((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((id) => {
        if (sentIds.has(id)) delete next[id];
      });
      return next;
    });
  }, [timeline?.customDates]);

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

  const flashSelectionById = React.useCallback((id) => {
    const sid = id != null ? String(id).trim() : '';
    if (!sid) return;
    setFlashDateId(sid);
    if (flashTimerRef.current) clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlashDateId(''), 1200);
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
    const mid = String(match?.id || '').trim();
    if (mid) {
      setSelectedDateId(mid);
      flashSelectionById(mid);
    }
    scrollToItemId(mid);
  }, [sortedItems, scrollToItemId, flashSelectionById]);

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
    const outlookEventId = it?.outlookEventId != null && String(it.outlookEventId).trim() ? String(it.outlookEventId).trim() : null;
    const outlookStatus = ['sent', 'updated', 'cancelled'].includes(String(it?.outlookStatus || '').trim()) ? String(it.outlookStatus).trim() : undefined;
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
        outlookEventId: outlookEventId || undefined,
        outlookStatus,

        // Sync metadata (Projektinformation-milestones)
        source: source || null,
        sourceKey: sourceKey || null,
        locked,
      },
    });
  }, [todayIso]);

  const projectSubjectMeta = React.useMemo(() => extractProjectNumberAndName(project), [project]);

  const prepareOutlookInvitation = React.useCallback((it) => {
    const id = String(it?.id || '').trim();
    const iso = isValidIsoDate(it?.date) ? String(it.date) : '';
    if (!id || !iso) return;

    setOptimisticOutlook((prev) => ({ ...prev, [id]: 'sending' }));

    const eventType = deriveEventType(it);
    const title = formatExternalCalendarSubject({
      projectNumber: projectSubjectMeta?.projectNumber,
      projectName: projectSubjectMeta?.projectName,
      eventType,
    });
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

    if (!ics) {
      setOptimisticOutlook((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }

    if (Platform.OS === 'web') {
      const safe = String(eventType || 'mote').replace(/[^a-z0-9\- _]/gi, '').trim() || 'mote';
      const filename = `${iso}_${safe}.ics`;
      downloadIcsOnWeb(filename, ics);
    }

    timeline
      .updateCustomDate(id, { outlookInvitationPrepared: true, outlookStatus: 'sent' })
      .then(() => {
        setOptimisticOutlook((prev) => ({ ...prev, [id]: 'sent' }));
      })
      .catch(() => {
        setOptimisticOutlook((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      });
  }, [timeline, projectSubjectMeta]);

  const closeModal = React.useCallback(() => {
    setModalState({ open: false, initial: null });
  }, []);

  const requestDeleteDate = React.useCallback((it) => {
    if (!it) return;
    const src = String(it?.source || '').trim();
    if (src === 'projectinfo' || src === 'projectInformation') return;

    if (hasOutlookInvitation(it)) {
      setOutlookDeleteModal({ open: true, item: it, choice: null });
      return;
    }

    setDeleteConfirmDate(it);
  }, []);

  const performDeleteDate = React.useCallback(() => {
    const it = deleteConfirmDate;
    setDeleteConfirmDate(null);
    if (!it) return;
    const id = String(it?.id || '').trim();
    if (!id) return;
    setOptimisticRemovedIds((prev) => [...prev, id]);
    timeline.removeCustomDate(id).catch((e) => {
      setOptimisticRemovedIds((prev) => prev.filter((x) => x !== id));
      const msg = String(e?.message || e || 'Kunde inte radera datum.');
      if (Platform.OS === 'web' && typeof window?.alert === 'function') {
        window.alert(msg);
      } else {
        Alert.alert('Kunde inte radera', msg);
      }
    });
  }, [deleteConfirmDate, timeline]);

  const confirmOutlookReminderAndDelete = React.useCallback(() => {
    const item = outlookDeleteModal?.item;
    const id = item ? String(item.id || '').trim() : '';

    setOutlookDeleteModal({ open: false, item: null, choice: null });
    if (!id) return;

    setOptimisticRemovedIds((prev) => [...prev, id]);
    timeline.removeCustomDate(id).catch((e) => {
      setOptimisticRemovedIds((prev) => prev.filter((x) => x !== id));
      const msg = String(e?.message || e || 'Kunde inte radera datum.');
      if (Platform.OS === 'web' && typeof window?.alert === 'function') {
        window.alert(msg);
      } else {
        Alert.alert('Kunde inte radera', msg);
      }
    });
  }, [outlookDeleteModal?.item, timeline]);

  const closeOutlookDeleteModal = React.useCallback(() => {
    setOutlookDeleteModal({ open: false, item: null, choice: null });
  }, []);

  const openRowMenu = React.useCallback((e, it) => {
    e?.stopPropagation?.();
    const id = String(it?.id || '').trim();
    if (!id) return;
    const rowEl = rowRefsRef.current?.[id];
    if (rowEl && typeof rowEl.measure === 'function') {
      rowEl.measure((_x, _y, width, height, pageX, pageY) => {
        const x = Number(pageX ?? 0) + Number(width ?? 0) - 24;
        const y = Number(pageY ?? 0) + Number(height ?? 0) + 4;
        setRowMenuAnchor({ item: it, x, y });
      });
    } else {
      const ev = e?.nativeEvent;
      const x = Number(ev?.clientX ?? ev?.pageX ?? 0);
      const y = Number(ev?.clientY ?? ev?.pageY ?? 0) + 4;
      setRowMenuAnchor({ item: it, x, y });
    }
  }, []);

  const closeRowMenu = React.useCallback(() => setRowMenuAnchor(null), []);

  const onRowMenuSelect = React.useCallback((menuItem) => {
    const it = rowMenuAnchor?.item;
    if (!it) return;
    const key = menuItem?.key;
    if (key === 'edit') {
      openEdit(it);
    } else if (key === 'delete') {
      requestDeleteDate(it);
    } else if (key === 'resend_outlook') {
      prepareOutlookInvitation(it);
    } else if (key === 'cancel_outlook') {
      setCancelOutlookOnlyModal({ open: true, item: it });
    }
    closeRowMenu();
  }, [rowMenuAnchor?.item, openEdit, requestDeleteDate, prepareOutlookInvitation, closeRowMenu]);

  const confirmCancelOutlookOnly = React.useCallback(async () => {
    const it = cancelOutlookOnlyModal?.item;
    const id = it ? String(it.id || '').trim() : '';
    const outlookEventId = it?.outlookEventId != null ? String(it.outlookEventId).trim() : '';
    setCancelOutlookOnlyModal({ open: false, item: null });
    if (!id || !outlookEventId) return;
    try {
      await cancelOutlookEvent(outlookEventId);
      await timeline.updateCustomDate(id, { outlookStatus: 'cancelled' });
    } catch (_e) {}
  }, [cancelOutlookOnlyModal?.item, timeline]);

  const rowMenuItems = React.useMemo(() => {
    const it = rowMenuAnchor?.item;
    if (!it) return [];
    const src = String(it?.source || '').trim();
    const isProjectInfo = src === 'projectinfo' || src === 'projectInformation';
    const hasOutlook = hasOutlookInvitation(it);
    const list = [
      { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
      { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" />, disabled: isProjectInfo },
    ];
    if (hasOutlook) {
      list.push({ key: 'resend_outlook', label: 'Skicka om Outlook-kallelse', icon: <Ionicons name="send-outline" size={16} color="#475569" /> });
      list.push({ key: 'cancel_outlook', label: 'Avboka möte i Outlook', danger: true, icon: <Ionicons name="close-circle-outline" size={16} color="#b91c1c" /> });
    }
    return list;
  }, [rowMenuAnchor?.item]);

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
      const outlookEventId = current?.outlookEventId != null && String(current.outlookEventId).trim() ? String(current.outlookEventId).trim() : null;
      const updatedPayload = {
        date: iso,
        title: t,
        type: ty,
        customType: ty,
        description: desc,
        participants,
        startTime,
        endTime,
      };
      if (outlookEventId) {
        try {
          await updateOutlookEvent(outlookEventId, { date: iso, startTime, endTime, title: t, description: desc });
        } catch (_e) {}
        updatedPayload.outlookStatus = 'updated';
      }
      try {
        await timeline.updateCustomDate(id, updatedPayload);
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

  const onDeleteModal = React.useCallback(() => {
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

    if (hasOutlookInvitation(current)) {
      closeModal();
      setOutlookDeleteModal({ open: true, item: current, choice: null });
      return;
    }

    setOptimisticRemovedIds((prev) => [...prev, id]);
    closeModal();
    timeline.removeCustomDate(id).catch((e) => {
      setOptimisticRemovedIds((prev) => prev.filter((x) => x !== id));
      const msg = String(e?.message || e || 'Kunde inte radera datum.');
      if (Platform.OS === 'web' && typeof window?.alert === 'function') {
        window.alert(msg);
      } else {
        Alert.alert('Kunde inte radera', msg);
      }
    });
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
            <Text style={{ flex: 1, minWidth: 120, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }}>Titel</Text>
            <Text style={{ width: 86, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Deltagare</Text>
            <Text style={{ width: 92, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Status</Text>
            <Text style={{ width: 150, fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle, textAlign: 'left' }}>Outlook</Text>
            <View style={{ width: 44, alignItems: 'flex-end' }} />
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

              const rowId = String(it?.id || '').trim();
              const isSelected = rowId === selectedDateId;
              const isFlashing = rowId === flashDateId;
              const outlookStatusValue = ['sent', 'updated', 'cancelled'].includes(String(it?.outlookStatus || '').trim()) ? String(it.outlookStatus).trim() : undefined;
              const optimisticStatus = optimisticOutlook[rowId];
              const effectiveSent = optimisticStatus === 'sent' || (outlookStatusValue !== 'cancelled' && hasOutlookInvitation(it));
              const outlookHelp = 'DigitalKontroll skapar en .ics-kallelse. Outlook kan öppnas automatiskt eller behöva öppnas manuellt. DigitalKontroll skickar inte kallelsen – du skickar i Outlook.';

              const src = String(it?.source || '').trim();
              const isProjectInfo = src === 'projectinfo' || src === 'projectInformation';
              // Projektinformation-datum ska kunna flyttas i både Projektöversikt och Tidsplan – visa inte som låst.
              const isDateLocked = false;

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
                    if (!rowId) return;
                    setSelectedDateId(rowId);
                    flashSelectionById(rowId);
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

                  </View>

                  <View style={{ flex: 1, minWidth: 120, paddingRight: 12 }}>
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
                    {outlookStatusValue === 'cancelled' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="close-circle-outline" size={18} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                          ❌ Kallelse avbokad
                        </Text>
                      </View>
                    ) : outlookStatusValue === 'updated' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="refresh" size={18} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                          🔄 Uppdaterad kallelse
                        </Text>
                      </View>
                    ) : optimisticStatus === 'sending' ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <ActivityIndicator size="small" color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                          Skickar…
                        </Text>
                      </View>
                    ) : effectiveSent ? (
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Ionicons name="checkmark-circle" size={18} color={COLORS.green} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.green }} numberOfLines={1}>
                          ✔ Kallelse skickad
                        </Text>
                      </View>
                    ) : (
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
                        <Ionicons name="mail-outline" size={18} color={COLORS.textSubtle} />
                        <Text style={{ fontSize: 12, fontWeight: FW_MED, color: COLORS.textSubtle }} numberOfLines={1}>
                          Ej skickad
                        </Text>
                      </Pressable>
                    )}
                  </View>

                  <View style={{ width: 44, alignItems: 'flex-end' }}>
                    <Pressable
                      onPress={(e) => openRowMenu(e, it)}
                      hitSlop={8}
                      accessibilityLabel="Visa åtgärder"
                      style={({ hovered, pressed }) => ({
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: hovered || pressed ? '#F1F5F9' : 'transparent',
                      })}
                    >
                      <Ionicons name="ellipsis-vertical" size={18} color={COLORS.textSubtle} />
                    </Pressable>
                  </View>
                </Pressable>
              );
            })
          )}
        </View>

        <View style={{ marginTop: 14, marginBottom: 6 }}>
          <View style={{ height: 1, backgroundColor: '#EEF2F7' }} />
        </View>

        <View style={{ paddingVertical: 8, paddingHorizontal: 0 }}>
          <CompactMonthCalendar
            items={sortedItems}
            todayIso={todayIso}
            onPressItem={openEdit}
            selectedIso={selectedIso}
            flashIso={flashIso}
            onPressDay={(iso, dayItems) => {
              const targetIso = isValidIsoDate(iso) ? String(iso) : '';
              if (targetIso && Array.isArray(dayItems) && dayItems.length > 0) scrollToFirstItemForIso(targetIso);
            }}
            colors={COLORS}
            maxWidth={CONTENT_MAX_WIDTH}
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

      <Modal visible={!!outlookDeleteModal?.open} transparent animationType="fade" onRequestClose={closeOutlookDeleteModal}>
        <Pressable
          onPress={closeOutlookDeleteModal}
          style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.30)', padding: 16, justifyContent: 'center' }}
        >
          <Pressable
            onPress={(e) => e?.stopPropagation?.()}
            style={{
              width: '100%',
              maxWidth: 440,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.18)' } : {}),
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
              <Text style={{ fontSize: 16, fontWeight: FW_MED, color: COLORS.text }}>Outlook-kallelse är skickad</Text>
            </View>
            <View style={{ padding: 14, gap: 12 }}>
              <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                Detta möte har skickats som kallelse via Outlook. Om du raderar datumet här tas det inte bort i Outlook. Glöm inte att även avboka mötet i Outlook.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
              <Pressable
                onPress={closeOutlookDeleteModal}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.textMuted }}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={confirmOutlookReminderAndDelete}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? COLORS.blueHover : COLORS.blue,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: '#fff' }}>Radera ändå</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <ContextMenu
        visible={!!rowMenuAnchor}
        x={rowMenuAnchor?.x ?? 0}
        y={rowMenuAnchor?.y ?? 0}
        items={rowMenuItems}
        onSelect={onRowMenuSelect}
        onClose={closeRowMenu}
        align="right"
        direction="down"
      />

      <ConfirmModal
        visible={!!deleteConfirmDate}
        message={deleteConfirmDate ? `Vill du radera detta datum?${deleteConfirmDate?.title ? ` (${String(deleteConfirmDate.title).trim()})` : ''}` : ''}
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
        onCancel={() => setDeleteConfirmDate(null)}
        onConfirm={performDeleteDate}
        compact
      />

      <Modal visible={!!cancelOutlookOnlyModal?.open} transparent animationType="fade" onRequestClose={() => setCancelOutlookOnlyModal({ open: false, item: null })}>
        <Pressable
          onPress={() => setCancelOutlookOnlyModal({ open: false, item: null })}
          style={{ flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.30)', padding: 16, justifyContent: 'center' }}
        >
          <Pressable
            onPress={(e) => e?.stopPropagation?.()}
            style={{
              width: '100%',
              maxWidth: 400,
              alignSelf: 'center',
              backgroundColor: '#fff',
              borderRadius: 12,
              borderWidth: 1,
              borderColor: '#E2E8F0',
              overflow: 'hidden',
              ...(Platform.OS === 'web' ? { boxShadow: '0 10px 30px rgba(0,0,0,0.18)' } : {}),
            }}
          >
            <View style={{ paddingHorizontal: 14, paddingTop: 14, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
              <Text style={{ fontSize: 16, fontWeight: FW_MED, color: COLORS.text }}>❌ Avboka möte i Outlook</Text>
            </View>
            <View style={{ padding: 14 }}>
              <Text style={{ fontSize: 13, color: COLORS.textMuted }}>
                Vill du avboka detta möte i Outlook? Datumet finns kvar i DigitalKontroll.
              </Text>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: '#EEF2F7' }}>
              <Pressable
                onPress={() => setCancelOutlookOnlyModal({ open: false, item: null })}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  backgroundColor: hovered || pressed ? 'rgba(148, 163, 184, 0.14)' : '#fff',
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: COLORS.textMuted }}>Avbryt</Text>
              </Pressable>
              <Pressable
                onPress={confirmCancelOutlookOnly}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 8,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: hovered || pressed ? COLORS.blueHover : COLORS.blue,
                })}
              >
                <Text style={{ fontSize: 13, fontWeight: FW_MED, color: '#fff' }}>Bekräfta</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}
