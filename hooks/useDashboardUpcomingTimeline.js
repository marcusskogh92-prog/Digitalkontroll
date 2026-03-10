/**
 * Hämtar kommande tidsplandatum (t.ex. Anbudsinlämning) för alla projekt användaren är med i.
 * Används i dashboard right panel: kalender-markeringar + listan "Kommande datum".
 */

import { doc, getDoc } from 'firebase/firestore';
import { useEffect, useMemo, useState } from 'react';
import { db } from '../components/firebase';

const COLLECTION = 'project_timeline';

function isValidIsoDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '').trim());
}

function todayIso() {
  const d = new Date();
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function normalizeCustomDates(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((d) => {
      const date = isValidIsoDate(d?.date) ? String(d.date) : '';
      const title = String(d?.title || '').trim() || 'Datum';
      return date ? { date, title } : null;
    })
    .filter(Boolean);
}

/**
 * @param {string} companyId
 * @param {Array<{ id: string, name?: string, fullName?: string }>} projectList - Projekt användaren är med i (t.ex. dashboardActiveProjectsList)
 * @returns {{ upcomingDates: Array<{ projectId, projectName, date, title, dateMs }>, datesWithActivity: Set<string>, loading: boolean }}
 */
export function useDashboardUpcomingTimeline(companyId, projectList = []) {
  const cid = String(companyId || '').trim();
  const list = Array.isArray(projectList) ? projectList : [];
  const [timelineByProject, setTimelineByProject] = useState({});
  const [loading, setLoading] = useState(true);

  const listKey = useMemo(
    () => list.map((p) => p?.id || p?.projectId).filter(Boolean).sort().join(','),
    [list]
  );

  useEffect(() => {
    if (!cid || list.length === 0) {
      setTimelineByProject({});
      setLoading(false);
      return;
    }

    let mounted = true;
    setLoading(true);

    (async () => {
      const next = {};
      const today = todayIso();

      await Promise.all(
        list.map(async (proj) => {
          const pid = String(proj?.id || proj?.projectId || '').trim();
          if (!pid) return;

          try {
            const ref = doc(db, 'foretag', cid, COLLECTION, pid);
            const snap = await getDoc(ref);
            if (!mounted) return;

            const data = snap.exists() && snap.data() ? snap.data() : {};
            const customDates = normalizeCustomDates(data.customDates || []);
            next[pid] = {
              projectId: pid,
              projectName: String(proj?.fullName || proj?.name || proj?.projectName || pid).trim() || pid,
              dates: customDates,
            };
          } catch (_e) {
            if (mounted) next[pid] = { projectId: pid, projectName: proj?.name || pid, dates: [] };
          }
        })
      );

      if (mounted) {
        setTimelineByProject(next);
      }
      if (mounted) setLoading(false);
    })();

    return () => { mounted = false; };
  }, [cid, listKey]);

  const { upcomingDates, datesWithActivity } = useMemo(() => {
    const today = todayIso();
    const upcoming = [];
    const datesSet = new Set();

    Object.values(timelineByProject).forEach(({ projectId, projectName, dates }) => {
      (dates || []).forEach(({ date, title }) => {
        if (!date) return;
        datesSet.add(date);
        if (date >= today) {
          const dateMs = new Date(date + 'T12:00:00').getTime();
          upcoming.push({ projectId, projectName, date, title, dateMs });
        }
      });
    });

    upcoming.sort((a, b) => (a.dateMs || 0) - (b.dateMs || 0));
    return { upcomingDates: upcoming, datesWithActivity: datesSet };
  }, [timelineByProject]);

  return { upcomingDates, datesWithActivity, loading };
}
