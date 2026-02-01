/**
 * useProjectTimelineDates
 *
 * Project-specific timeline + important dates model.
 * Stored in Firestore under: foretag/{companyId}/project_timeline/{projectId}
 *
 * Data model (doc):
 * - { projectId, customDates: TimelineCustomDate[], siteVisits: TimelineSiteVisit[] }
 * - TimelineCustomDate: { id, title, date, customType, description }
 * - TimelineSiteVisit: { id, title, dates: string[], description }
 */

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { v4 as uuidv4 } from 'uuid';

import { auth, db } from '../components/firebase';

const COLLECTION = 'project_timeline';

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function normalizeCustomDates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((d) => {
      const id = String(d?.id || '').trim() || uuidv4();
      const title = String(d?.title || '').trim() || 'Datum';
      const date = isValidIsoDate(d?.date) ? String(d.date) : '';
      const type = String(d?.type || d?.customType || d?.typeLabel || '').trim() || 'Datum';
      const customType = String(d?.customType || d?.type || d?.typeLabel || '').trim() || type || 'Datum';
      const description = String(d?.description || '').trim();

      const startTime = String(d?.startTime || '').trim();
      const endTime = String(d?.endTime || '').trim();
      const outlookInvitationPrepared = !!d?.outlookInvitationPrepared;
      const locked = !!d?.locked;
      const source = d?.source != null ? String(d.source) : null;
      const sourceKey = d?.sourceKey != null ? String(d.sourceKey) : null;
      const participants = Array.isArray(d?.participants) ? d.participants : [];

      return {
        id,
        title,
        date,
        customType,
        type,
        description,
        startTime,
        endTime,
        participants,
        outlookInvitationPrepared,
        locked,
        source,
        sourceKey,
      };
    })
    .filter((d) => d && d.id);
}

function normalizeSiteVisits(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((v) => {
      const id = String(v?.id || '').trim() || uuidv4();
      const title = String(v?.title || '').trim() || 'Platsbesök';
      const dates = (Array.isArray(v?.dates) ? v.dates : [])
        .map((x) => String(x || '').trim())
        .filter((x) => isValidIsoDate(x));
      const uniqueDates = Array.from(new Set(dates)).sort();
      const description = String(v?.description || '').trim();
      return { id, title, dates: uniqueDates, description };
    })
    .filter((v) => v && v.id);
}

function ensureDocShape(docData, projectId) {
  const pid = String(projectId || '').trim();
  const d = docData && typeof docData === 'object' ? docData : {};
  return {
    projectId: String(d.projectId || pid || '').trim() || pid || null,
    customDates: normalizeCustomDates(d.customDates),
    siteVisits: normalizeSiteVisits(d.siteVisits),
  };
}

export function useProjectTimelineDates({ companyId, projectId }) {
  const cid = String(companyId || '').trim();
  const pid = String(projectId || '').trim();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState(() => ({ projectId: pid || null, customDates: [], siteVisits: [] }));

  const latestRef = useRef(data);
  useEffect(() => {
    latestRef.current = data;
  }, [data]);

  useEffect(() => {
    if (!cid || !pid) {
      setData({ projectId: pid || null, customDates: [], siteVisits: [] });
      setLoading(false);
      setError('');
      return;
    }

    setLoading(true);
    setError('');

    const ref = doc(db, 'foretag', cid, COLLECTION, pid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        const next = snap.exists() ? ensureDocShape(snap.data(), pid) : { projectId: pid, customDates: [], siteVisits: [] };
        setData(next);
        setLoading(false);
      },
      (err) => {
        setError(String(err?.message || err || 'Kunde inte läsa tidsplan.'));
        setLoading(false);
      }
    );

    return () => {
      try {
        unsub();
      } catch (_e) {}
    };
  }, [cid, pid]);

  const save = useCallback(
    async (nextData) => {
      if (!cid || !pid) return false;
      const ref = doc(db, 'foretag', cid, COLLECTION, pid);
      const payload = {
        projectId: pid,
        customDates: normalizeCustomDates(nextData?.customDates),
        siteVisits: normalizeSiteVisits(nextData?.siteVisits),
        updatedAt: serverTimestamp(),
        updatedBy: auth?.currentUser?.uid || null,
      };
      await setDoc(ref, payload, { merge: true });
      return true;
    },
    [cid, pid]
  );

  const addCustomDate = useCallback(
    async ({ id, title, date, customType, type, description, participants, startTime, endTime, outlookInvitationPrepared, locked, source, sourceKey } = {}) => {
      const current = latestRef.current;
      const next = {
        ...current,
        customDates: [
          ...(current.customDates || []),
          {
            id: String(id || '').trim() || uuidv4(),
            title: String(title || '').trim() || 'Datum',
            date: isValidIsoDate(date) ? String(date) : '',
            customType: String(customType || type || '').trim() || 'Datum',
            type: String(type || customType || '').trim() || 'Datum',
            description: String(description || '').trim(),
            participants: Array.isArray(participants) ? participants : [],
            startTime: String(startTime || '').trim(),
            endTime: String(endTime || '').trim(),
            outlookInvitationPrepared: !!outlookInvitationPrepared,
            locked: !!locked,
            source: source != null ? String(source) : null,
            sourceKey: sourceKey != null ? String(sourceKey) : null,
          },
        ],
      };
      await save(next);
    },
    [save]
  );

  const updateCustomDate = useCallback(
    async (id, patch) => {
      const did = String(id || '').trim();
      if (!did) return;
      const p = patch && typeof patch === 'object' ? patch : {};
      const current = latestRef.current;
      const next = {
        ...current,
        customDates: (current.customDates || []).map((d) => {
          if (String(d?.id || '') !== did) return d;
          const nextDate = p.date != null ? (isValidIsoDate(p.date) ? String(p.date) : '') : d.date;
          return {
            ...d,
            title: p.title != null ? (String(p.title || '').trim() || 'Datum') : d.title,
            date: nextDate,
            customType: p.customType != null ? (String(p.customType || '').trim() || 'Datum') : d.customType,
            type: p.type != null ? (String(p.type || '').trim() || 'Datum') : (d.type || d.customType),
            description: p.description != null ? String(p.description || '').trim() : d.description,
            participants: p.participants != null ? (Array.isArray(p.participants) ? p.participants : []) : d.participants,
            startTime: p.startTime != null ? String(p.startTime || '').trim() : d.startTime,
            endTime: p.endTime != null ? String(p.endTime || '').trim() : d.endTime,
            outlookInvitationPrepared: p.outlookInvitationPrepared != null ? !!p.outlookInvitationPrepared : !!d.outlookInvitationPrepared,
            locked: p.locked != null ? !!p.locked : !!d.locked,
            source: p.source != null ? String(p.source) : d.source,
            sourceKey: p.sourceKey != null ? String(p.sourceKey) : d.sourceKey,
          };
        }),
      };
      await save(next);
    },
    [save]
  );

  const setCustomDates = useCallback(
    async (customDates) => {
      const current = latestRef.current;
      const next = {
        ...current,
        customDates: Array.isArray(customDates) ? customDates : [],
      };
      await save(next);
    },
    [save]
  );

  const appendCustomDates = useCallback(
    async (items) => {
      const current = latestRef.current;
      const nextItems = Array.isArray(items) ? items : [];
      const next = {
        ...current,
        customDates: [...(current.customDates || []), ...nextItems],
      };
      await save(next);
    },
    [save]
  );

  const upsertCustomDate = useCallback(
    async (id, item) => {
      const did = String(id || '').trim();
      if (!did) return;
      const patch = item && typeof item === 'object' ? item : {};

      const current = latestRef.current;
      const list = Array.isArray(current.customDates) ? current.customDates : [];
      const exists = list.some((d) => String(d?.id || '') === did);

      if (exists) {
        await updateCustomDate(did, patch);
        return;
      }

      await addCustomDate({
        id: did,
        title: patch.title,
        date: patch.date,
        customType: patch.customType,
        type: patch.type,
        description: patch.description,
        participants: patch.participants,
        startTime: patch.startTime,
        endTime: patch.endTime,
        outlookInvitationPrepared: patch.outlookInvitationPrepared,
        locked: patch.locked,
        source: patch.source,
        sourceKey: patch.sourceKey,
      });
    },
    [addCustomDate, updateCustomDate]
  );

  const removeCustomDate = useCallback(
    async (id) => {
      const did = String(id || '').trim();
      if (!did) return;
      const current = latestRef.current;
      const next = {
        ...current,
        customDates: (current.customDates || []).filter((d) => String(d?.id || '') !== did),
      };
      await save(next);
    },
    [save]
  );

  const addSiteVisit = useCallback(
    async ({ title, dates, description } = {}) => {
      const ds = (Array.isArray(dates) ? dates : [])
        .map((x) => String(x || '').trim())
        .filter((x) => isValidIsoDate(x));
      const uniqueDates = Array.from(new Set(ds)).sort();

      const current = latestRef.current;
      const next = {
        ...current,
        siteVisits: [
          ...(current.siteVisits || []),
          {
            id: uuidv4(),
            title: String(title || '').trim() || 'Platsbesök',
            dates: uniqueDates,
            description: String(description || '').trim(),
          },
        ],
      };
      await save(next);
    },
    [save]
  );

  const updateSiteVisit = useCallback(
    async (id, patch) => {
      const vid = String(id || '').trim();
      if (!vid) return;
      const p = patch && typeof patch === 'object' ? patch : {};
      const nextDates = p.dates != null
        ? Array.from(
            new Set(
              (Array.isArray(p.dates) ? p.dates : [])
                .map((x) => String(x || '').trim())
                .filter((x) => isValidIsoDate(x))
            )
          ).sort()
        : null;

      const current = latestRef.current;
      const next = {
        ...current,
        siteVisits: (current.siteVisits || []).map((v) => {
          if (String(v?.id || '') !== vid) return v;
          return {
            ...v,
            title: p.title != null ? (String(p.title || '').trim() || 'Platsbesök') : v.title,
            dates: nextDates != null ? nextDates : v.dates,
            description: p.description != null ? String(p.description || '').trim() : v.description,
          };
        }),
      };
      await save(next);
    },
    [save]
  );

  const removeSiteVisit = useCallback(
    async (id) => {
      const vid = String(id || '').trim();
      if (!vid) return;
      const current = latestRef.current;
      const next = {
        ...current,
        siteVisits: (current.siteVisits || []).filter((v) => String(v?.id || '') !== vid),
      };
      await save(next);
    },
    [save]
  );

  return useMemo(
    () => ({
      customDates: data.customDates,
      siteVisits: data.siteVisits,
      loading,
      error,
      addCustomDate,
      updateCustomDate,
      removeCustomDate,
      setCustomDates,
      appendCustomDates,
      upsertCustomDate,
      addSiteVisit,
      updateSiteVisit,
      removeSiteVisit,
    }),
    [
      data.customDates,
      data.siteVisits,
      loading,
      error,
      addCustomDate,
      updateCustomDate,
      removeCustomDate,
      setCustomDates,
      appendCustomDates,
      upsertCustomDate,
      addSiteVisit,
      updateSiteVisit,
      removeSiteVisit,
    ]
  );
}
