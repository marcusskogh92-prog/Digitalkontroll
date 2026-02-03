import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { storage, subscribeCompanyActivity, subscribeCompanyProjectOrganisation, subscribeCompanyProjects } from '../../firebase';
import { computeControlsToSign, computeOpenDeviationsCount, countActiveProjectsInHierarchy, countOpenDeviationsForControl, formatRelativeTime, resolveProjectId, toTsMs } from './dashboardUtils';

/**
 * Shared dashboard hook for HomeScreen and other containers.
 * Encapsulates dashboard state, loading, and company activity feed.
 */
export function useDashboard({
  companyId,
  routeCompanyId,
  authClaims,
  currentUserId,
  hierarchy,
  hierarchyRef,
  selectedProject,
  syncStatus,
  findProjectById,
}) {
  const DEBUG_MEMBERSHIP = !!(__DEV__ && Platform?.OS === 'web');
  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardOverview, setDashboardOverview] = useState({
    activeProjects: 0,
    openDeviations: 0,
    skyddsrondOverdue: 0,
    skyddsrondDueSoon: 0,
    controlsToSign: 0,
    drafts: 0,
  });
  const [dashboardRecent, setDashboardRecent] = useState([]);
  const [dashboardRecentProjects, setDashboardRecentProjects] = useState([]);
  const [companyActivity, setCompanyActivity] = useState([]);

  const [dashboardFocus, setDashboardFocus] = useState(null);
  const [dashboardHoveredStatKey, setDashboardHoveredStatKey] = useState(null);
  const [dashboardActiveProjectsList, setDashboardActiveProjectsList] = useState([]);
  const [dashboardDraftItems, setDashboardDraftItems] = useState([]);
  const [dashboardControlsToSignItems, setDashboardControlsToSignItems] = useState([]);
  const [dashboardOpenDeviationItems, setDashboardOpenDeviationItems] = useState([]);
  const [dashboardUpcomingSkyddsrondItems, setDashboardUpcomingSkyddsrondItems] = useState([]);
  const [dashboardDropdownAnchor, setDashboardDropdownAnchor] = useState('overview');
  const [dashboardDropdownTop, setDashboardDropdownTop] = useState(null);
  const [dashboardDropdownRowKey, setDashboardDropdownRowKey] = useState(null);

  const [dashboardBtn1Url, setDashboardBtn1Url] = useState(null);
  const [dashboardBtn2Url, setDashboardBtn2Url] = useState(null);
  const [dashboardBtn1Failed, setDashboardBtn1Failed] = useState(false);
  const [dashboardBtn2Failed, setDashboardBtn2Failed] = useState(false);

  const [memberProjectIds, setMemberProjectIds] = useState(() => new Set());
  const memberProjectIdsRef = useRef(memberProjectIds);
  useEffect(() => {
    memberProjectIdsRef.current = memberProjectIds;
  }, [memberProjectIds]);
  const [memberProjectsReady, setMemberProjectsReady] = useState(false);

  const [companyProjects, setCompanyProjects] = useState([]);
  const companyProjectsRef = useRef(companyProjects);
  useEffect(() => {
    companyProjectsRef.current = companyProjects;
  }, [companyProjects]);
  const [companyProjectsReady, setCompanyProjectsReady] = useState(false);

  const dashboardCardLayoutRef = useRef({ overview: null, reminders: null });
  const dashboardStatRowLayoutRef = useRef({});

  const isAdmin = !!(
    authClaims?.globalAdmin ||
    authClaims?.admin === true ||
    String(authClaims?.role || '').toLowerCase() === 'admin'
  );

  useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    const uid = String(currentUserId || '').trim();

    if (DEBUG_MEMBERSHIP) {
      console.log('[dashboard][membership] subscribe start', { cid, uid, isAdmin: !!(
        authClaims?.globalAdmin || authClaims?.admin === true || String(authClaims?.role || '').toLowerCase() === 'admin'
      ) });
    }

    if (!cid || !uid) {
      setMemberProjectIds(new Set());
      setMemberProjectsReady(false);
      return;
    }

    setMemberProjectsReady(false);
    const unsub = subscribeCompanyProjectOrganisation(
      cid,
      (docs) => {
        const next = new Set();

        if (DEBUG_MEMBERSHIP) {
          console.log('[dashboard][membership] raw org snapshot', {
            cid,
            uid,
            docsCount: Array.isArray(docs) ? docs.length : 0,
            sample: Array.isArray(docs) ? docs.slice(0, 3).map((d) => ({ id: d?.id, projectId: d?.projectId, projectNumber: d?.projectNumber })) : [],
          });
        }

        const normalizeToArray = (value) => {
          if (Array.isArray(value)) return value;
          if (value && typeof value === 'object') {
            try { return Object.values(value); } catch (_e) { return []; }
          }
          return [];
        };

        try {
          let compareCount = 0;
          for (const d of (docs || [])) {
            const groups = normalizeToArray(d?.groups);
            let isMember = false;

            if (DEBUG_MEMBERSHIP) {
              console.log('[dashboard][membership] org doc', {
                docId: d?.id,
                projectId: d?.projectId,
                projectNumber: d?.projectNumber,
                groupsType: Array.isArray(d?.groups) ? 'array' : (d?.groups && typeof d?.groups === 'object' ? 'object' : typeof d?.groups),
                groupsCount: Array.isArray(groups) ? groups.length : 0,
              });
            }

            for (const g of groups) {
              const members = normalizeToArray(g?.members);

              if (DEBUG_MEMBERSHIP) {
                console.log('[dashboard][membership] group', {
                  groupId: g?.id,
                  groupTitle: g?.title,
                  membersType: Array.isArray(g?.members) ? 'array' : (g?.members && typeof g?.members === 'object' ? 'object' : typeof g?.members),
                  membersCount: Array.isArray(members) ? members.length : 0,
                });
              }

              for (const m of members) {
                const refId = String(m?.refId || m?.uid || m?.userId || '').trim();
                if (DEBUG_MEMBERSHIP) {
                  compareCount += 1;
                  if (compareCount <= 500) {
                    console.log('[dashboard][membership] compare member', {
                      currentUserId: uid,
                      memberRefId: refId,
                      memberSource: m?.source,
                      memberRole: m?.role,
                      memberName: m?.name,
                      match: !!(refId && refId === uid),
                    });
                  } else if (compareCount === 501) {
                    console.log('[dashboard][membership] compare member: too many comparisons, truncating logs after 500');
                  }
                }
                if (!refId) continue;
                if (refId === uid) {
                  isMember = true;
                  break;
                }
              }
              if (isMember) break;
            }

            if (isMember) {
              const pid = String(d?.projectId || d?.id || '').trim();
              if (DEBUG_MEMBERSHIP) {
                console.log('[dashboard][membership] member match => allow project', {
                  docId: d?.id,
                  projectId: d?.projectId,
                  projectNumber: d?.projectNumber,
                  derivedAllowedProjectId: pid,
                });
              }
              if (pid) next.add(pid);
            }
          }
        } catch (_e) {}

        if (DEBUG_MEMBERSHIP) {
          console.log('[dashboard][membership] final memberProjectIds', Array.from(next));
        }
        setMemberProjectIds(next);
        setMemberProjectsReady(true);
      },
      () => {
        setMemberProjectIds(new Set());
        setMemberProjectsReady(true);
      }
    );

    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [companyId, routeCompanyId, authClaims?.companyId, currentUserId]);

  // Canonical project source for dashboard rendering:
  // Firestore collection foretag/{companyId}/projects (not SharePoint folder hierarchy).
  useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    if (!cid) {
      setCompanyProjects([]);
      setCompanyProjectsReady(false);
      return;
    }

    setCompanyProjectsReady(false);
    const unsub = subscribeCompanyProjects(
      cid,
      { siteRole: 'projects' },
      (docs) => {
        try { setCompanyProjects(Array.isArray(docs) ? docs : []); } catch (_e) { setCompanyProjects([]); }
        setCompanyProjectsReady(true);
      },
      () => {
        setCompanyProjects([]);
        setCompanyProjectsReady(true);
      }
    );

    return () => {
      try { unsub?.(); } catch (_e) {}
    };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  const loadDashboard = useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [draftRaw, completedRaw] = await Promise.all([
        AsyncStorage.getItem('draft_controls'),
        AsyncStorage.getItem('completed_controls'),
      ]);
      const drafts = draftRaw ? (JSON.parse(draftRaw) || []) : [];
      const completed = completedRaw ? (JSON.parse(completedRaw) || []) : [];

      const allowedProjectIds = new Set();
      if (isAdmin) {
        try {
          const list = companyProjectsRef.current;
          if (Array.isArray(list) && list.length > 0) {
            for (const p of list) {
              const pid = resolveProjectId(p);
              if (pid) allowedProjectIds.add(pid);
            }
          } else {
            const findAllProjects = (nodes) => {
              if (!Array.isArray(nodes)) return;
              nodes.forEach(node => {
                if (node && node.type === 'project') {
                  const pid = resolveProjectId(node);
                  if (pid) allowedProjectIds.add(pid);
                }
                if (node && node.children && Array.isArray(node.children)) {
                  findAllProjects(node.children);
                }
              });
            };
            findAllProjects(hierarchyRef?.current || hierarchy || []);
          }
        } catch (_e) {}
      } else if (memberProjectsReady) {
        try {
          const s = memberProjectIdsRef.current;
          if (s && typeof s.forEach === 'function') {
            s.forEach((pid) => {
              const norm = String(pid || '').trim();
              if (norm) allowedProjectIds.add(norm);
            });
          }
        } catch (_e) {}
      }

      if (DEBUG_MEMBERSHIP) {
        const allProjectIds = [];
        try {
          const list = companyProjectsRef.current;
          if (Array.isArray(list)) {
            for (const p of list) {
              const pid = resolveProjectId(p);
              if (pid) allProjectIds.push(pid);
            }
          }
        } catch (_e) {}

        console.log('[dashboard][filter] pre-filter projects', {
          memberProjectsReady,
          memberProjectIdsCount: memberProjectIdsRef?.current?.size || 0,
          allowedProjectIds: Array.from(allowedProjectIds),
          allProjectIds,
        });
      }

      const pickProjectId = (item) => {
        const pid = item?.project?.id || item?.projectId || item?.project || null;
        return pid ? String(pid).trim() : null;
      };

      const isProjectCompleted = (project) => {
        // Status is deprecated; treat phase "Avslut" as closed.
        const phaseKey = String(project?.phase || '').trim().toLowerCase();
        return phaseKey === 'avslut';
      };

      const filteredDrafts = (drafts || []).filter((d) => {
        const pid = pickProjectId(d);
        return pid && allowedProjectIds.has(pid);
      });
      const filteredCompleted = (completed || []).filter((c) => {
        const pid = pickProjectId(c);
        return pid && allowedProjectIds.has(pid);
      });

      try { setDashboardDraftItems(Array.isArray(filteredDrafts) ? filteredDrafts : []); } catch (_e) {}

      try {
        const activeList = [];
        const list = companyProjectsRef.current;
        if (Array.isArray(list)) {
          for (const p of list) {
            const pid = resolveProjectId(p);
            if (!pid) continue;
            if (!allowedProjectIds.has(pid)) continue;
            if (isProjectCompleted(p)) continue;
            activeList.push({
              ...p,
              id: pid,
              projectId: pid,
              name: p?.projectName || p?.name || p?.fullName || pid,
              number: p?.projectNumber || p?.number || pid,
              type: 'project',
            });
          }
        }
        setDashboardActiveProjectsList(activeList);
      } catch (_e) {
        try { setDashboardActiveProjectsList([]); } catch (_e2) {}
      }

      try {
        const needSign = (filteredDrafts || []).filter((item) => {
          if (!item) return false;
          const type = String(item.type || '');
          if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') return false;
          const sigs = item.mottagningsSignatures;
          return !Array.isArray(sigs) || sigs.length === 0;
        });
        setDashboardControlsToSignItems(needSign);
      } catch (_e) {
        try { setDashboardControlsToSignItems([]); } catch (_e2) {}
      }

      // Prefer canonical project source; fallback to hierarchy for legacy adapters.
      const activeProjects = (() => {
        try {
          const list = companyProjectsRef.current;
          if (Array.isArray(list) && list.length > 0) {
            let n = 0;
            for (const p of list) {
              const pid = resolveProjectId(p);
              if (!pid) continue;
              if (!allowedProjectIds.has(pid)) continue;
              if (isProjectCompleted(p)) continue;
              n += 1;
            }
            return n;
          }
        } catch (_e) {}
        return countActiveProjectsInHierarchy(hierarchyRef?.current || hierarchy || [], allowedProjectIds);
      })();
      const openDeviations = computeOpenDeviationsCount(filteredCompleted);
      const controlsToSign = computeControlsToSign(filteredDrafts);

      const MS_DAY = 24 * 60 * 60 * 1000;
      const NOW = Date.now();
      const SOON_THRESHOLD_DAYS = 3;
      const lastSkyddsrondByProject = new Map();
      try {
        (filteredCompleted || []).forEach((c) => {
          if (!c || c.type !== 'Skyddsrond') return;
          const pid = pickProjectId(c);
          if (!pid) return;
          const ts = toTsMs(c.date || c.savedAt || c.updatedAt || c.createdAt || null);
          if (!ts) return;
          const prev = lastSkyddsrondByProject.get(pid) || 0;
          if (ts > prev) lastSkyddsrondByProject.set(pid, ts);
        });
      } catch (_e) {}

      let skyddsrondOverdue = 0;
      let skyddsrondDueSoon = 0;
      const upcomingSkyddsrond = [];
      try {
        const list = companyProjectsRef.current;
        if (Array.isArray(list)) {
          for (const p0 of list) {
            const pid = resolveProjectId(p0);
            if (!pid) continue;
            if (!allowedProjectIds.has(pid)) continue;
            if (isProjectCompleted(p0)) continue;

            const enabled = p0.skyddsrondEnabled !== false;
            if (!enabled) continue;

            const intervalWeeksRaw = Number(p0.skyddsrondIntervalWeeks);
            const intervalDaysRaw = Number(p0.skyddsrondIntervalDays);
              const intervalDays = (Number.isFinite(intervalWeeksRaw) && intervalWeeksRaw > 0)
                ? (intervalWeeksRaw * 7)
                : (Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0 ? intervalDaysRaw : 14);

              const lastMs = lastSkyddsrondByProject.get(pid) || 0;
              const firstDueMs = toTsMs(p0.skyddsrondFirstDueDate || null);
              const baselineMs = lastMs || toTsMs(p0.createdAt || null) || NOW;
              const nextDueMs = lastMs
                ? (baselineMs + intervalDays * MS_DAY)
                : (firstDueMs || (baselineMs + intervalDays * MS_DAY));

              if (NOW > nextDueMs) {
                skyddsrondOverdue += 1;
                upcomingSkyddsrond.push({ project: { ...p0, id: pid, projectId: pid, type: 'project' }, nextDueMs, state: 'overdue' });
              } else if ((nextDueMs - NOW) <= (SOON_THRESHOLD_DAYS * MS_DAY)) {
                skyddsrondDueSoon += 1;
                upcomingSkyddsrond.push({ project: { ...p0, id: pid, projectId: pid, type: 'project' }, nextDueMs, state: 'dueSoon' });
              }
          }
        }
      } catch (_e) {}

      try {
        upcomingSkyddsrond.sort((a, b) => Number(a?.nextDueMs || 0) - Number(b?.nextDueMs || 0));
        setDashboardUpcomingSkyddsrondItems(upcomingSkyddsrond);
      } catch (_e) {
        try { setDashboardUpcomingSkyddsrondItems([]); } catch (_e2) {}
      }

      try {
        const openDevItems = (filteredCompleted || [])
          .filter((c) => c && c.type === 'Skyddsrond')
          .map((c) => ({ control: c, openCount: countOpenDeviationsForControl(c) }))
          .filter((x) => (x.openCount || 0) > 0);
        setDashboardOpenDeviationItems(openDevItems);
      } catch (_e) {
        try { setDashboardOpenDeviationItems([]); } catch (_e2) {}
      }

      const recent = [];
      const pushRecent = (item, kind) => {
        if (!item || typeof item !== 'object') return;
        const ts = item.savedAt || item.updatedAt || item.createdAt || item.date || null;
        const projectId = pickProjectId(item);
        if (!projectId) return;
        if (!allowedProjectIds.has(projectId)) return;
        const projObj = findProjectById(projectId);
        if (!projObj) return;
        const projectName = projObj?.name || null;
        const desc = String(item.deliveryDesc || item.materialDesc || item.generalNote || item.description || '').trim();

        let actorName = null;
        let actorEmail = null;
        let actorUid = null;
        try {
          if (Array.isArray(companyActivity) && companyActivity.length > 0) {
            const approxTs = toTsMs(ts || 0);
            const match = companyActivity.find(ev => {
              try {
                const evProj = ev.projectId || (ev.project && ev.project.id) || null;
                if (!evProj || String(evProj) !== String(projectId)) return false;
                const evType = String(ev.type || ev.eventType || ev.kind || '').toLowerCase();
                const itType = String(item.type || kind || '').toLowerCase();
                if (itType && evType && evType !== itType) {
                }
                const evTs = toTsMs(ev.ts || ev.createdAt || ev.updatedAt || 0);
                if (approxTs && evTs) {
                  const diff = Math.abs(approxTs - evTs);
                  if (diff > 120000) return false;
                }
                return true;
              } catch (_e) { return false; }
            });
            if (match) {
              actorName = match.actorName || match.displayName || match.actor || null;
              actorEmail = match.actorEmail || match.email || null;
              actorUid = match.uid || null;
            }
          }
        } catch (_e) {}

        try {
          if (!actorName) {
            const raw = item.raw || item.payload || item || {};
            const cb = raw.createdBy || raw.creator || raw.author || raw.createdByUid || raw.createdById || null;
            if (cb) {
              if (typeof cb === 'string') {
                actorEmail = actorEmail || (cb.includes('@') ? cb : actorEmail);
                actorUid = actorUid || (cb.includes('@') ? actorUid : cb);
                actorName = actorName || null;
              } else if (typeof cb === 'object') {
                actorName = actorName || cb.displayName || cb.name || cb.fullName || null;
                actorEmail = actorEmail || cb.email || cb.mail || null;
                actorUid = actorUid || cb.uid || cb.id || null;
              }
            }
            actorName = actorName || raw.actorName || raw.actor || raw.username || raw.userName || raw.userDisplayName || null;
            actorEmail = actorEmail || raw.actorEmail || raw.email || null;
            actorUid = actorUid || raw.uid || raw.userId || raw.userUID || null;
          }
        } catch (_e) {}

        recent.push({
          kind,
          type: item.type || kind,
          ts,
          projectId,
          projectName,
          desc,
          openDeviationsCount: (kind === 'completed' && item.type === 'Skyddsrond') ? countOpenDeviationsForControl(item) : 0,
          actorName: actorName || null,
          actorEmail: actorEmail || null,
          uid: actorUid || null,
          raw: item,
        });
      };
      (filteredCompleted || []).forEach((c) => pushRecent(c, 'completed'));
      (filteredDrafts || []).forEach((d) => pushRecent(d, 'draft'));

      try {
        const events = Array.isArray(companyActivity) ? companyActivity : [];
        try {
          const loginEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() === 'login').slice().sort((a, b) => {
            const ta = toTsMs(a.ts || a.createdAt || a.updatedAt || 0);
            const tb = toTsMs(b.ts || b.createdAt || b.updatedAt || 0);
            return tb - ta;
          });
          const seen = new Set();
          for (const ev of loginEvents) {
            if (!ev || typeof ev !== 'object') continue;
            const idKey = String(ev.uid || ev.email || ev.displayName || '').trim().toLowerCase();
            const key = idKey || '__noid';
            if (seen.has(key)) continue;
            seen.add(key);
            const who = formatRelativeTime(ev.displayName || ev.email || ev.uid || '');
            recent.push({
              kind: 'company',
              type: 'login',
              ts: ev.ts || ev.createdAt || ev.updatedAt || null,
              projectId: null,
              projectName: null,
              desc: who ? `Loggade in: ${who}` : 'Loggade in',
              actorName: ev.displayName || null,
              actorEmail: ev.email || null,
              uid: ev.uid || null,
              raw: ev,
            });
          }
        } catch (_e) {}

        try {
          const otherEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() !== 'login');
          for (const ev of otherEvents) {
            try {
              const t = ev.type || ev.eventType || ev.kind || null;
              const ts = ev.ts || ev.createdAt || ev.updatedAt || null;
              const projectId = ev.projectId || (ev.project && ev.project.id) || null;
              const projectName = ev.projectName || (ev.project && ev.project.name) || null;
              const desc = ev.label || ev.message || ev.msg || '';
              recent.push({
                kind: ev.kind || 'company',
                type: t,
                ts,
                projectId,
                projectName,
                desc,
                actorName: ev.actorName || ev.displayName || null,
                actorEmail: ev.actorEmail || ev.email || null,
                uid: ev.uid || null,
                raw: ev,
              });
            } catch (_e) {}
          }
        } catch (_e) {}
      } catch (_e) {}

      recent.sort((a, b) => {
        return toTsMs(b.ts) - toTsMs(a.ts);
      });
      const top = recent.slice(0, 8);

      const projMap = new Map();
      for (const r of recent) {
        if (!r.projectId) continue;
        const prev = projMap.get(r.projectId);
        const t = toTsMs(r.ts);
        if (!prev || t > prev.ts) projMap.set(r.projectId, { ts: t });
      }
      const recentProjects = Array.from(projMap.entries())
        .map(([projectId, meta]) => {
          const p = findProjectById(projectId) || (() => {
            try {
              const list = companyProjectsRef.current;
              if (!Array.isArray(list)) return null;
              const pid = String(projectId || '').trim();
              const hit = list.find((x) => String(resolveProjectId(x) || '').trim() === pid);
              if (!hit) return null;
              return {
                ...hit,
                id: pid,
                projectId: pid,
                type: 'project',
                name: hit?.projectName || hit?.name || hit?.fullName || pid,
                number: hit?.projectNumber || hit?.number || pid,
              };
            } catch (_e) {
              return null;
            }
          })();
          return p ? { project: p, projectId: String(projectId), ts: meta.ts } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 8);

      setDashboardOverview({
        activeProjects,
        openDeviations,
        skyddsrondOverdue,
        skyddsrondDueSoon,
        controlsToSign,
        drafts: Array.isArray(filteredDrafts) ? filteredDrafts.length : 0,
      });
      setDashboardRecent(top);
      setDashboardRecentProjects(recentProjects);
    } catch (_e) {
      setDashboardOverview({ activeProjects: 0, openDeviations: 0, skyddsrondOverdue: 0, skyddsrondDueSoon: 0, controlsToSign: 0, drafts: 0 });
      setDashboardRecent([]);
      setDashboardRecentProjects([]);
    } finally {
      setDashboardLoading(false);
    }
  }, [companyActivity, findProjectById, hierarchy, hierarchyRef, isAdmin, memberProjectsReady, companyProjectsReady]);

  const toggleDashboardFocus = (key, anchor, top) => {
    if (!key) return;
    if (anchor) {
      setDashboardDropdownAnchor(anchor);
    }
    if (typeof top === 'number') {
      setDashboardDropdownTop(top);
    } else if (dashboardFocus === key) {
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
      setDashboardDropdownRowKey(null);
    }
    setDashboardFocus((prev) => (prev === key ? null : key));
  };

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!selectedProject) loadDashboard();
  }, [selectedProject, syncStatus, hierarchy, companyActivity, memberProjectIds, memberProjectsReady, companyProjects, companyProjectsReady, loadDashboard]);

  useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    if (!cid) return;
    const unsub = subscribeCompanyActivity(cid, {
      limitCount: 25,
      onData: (items) => {
        try { setCompanyActivity(Array.isArray(items) ? items : []); } catch (_e) {}
      },
      onError: () => {},
    });
    return () => {
      try { if (typeof unsub === 'function') unsub(); } catch (_e) {}
    };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  useEffect(() => {
    try {
      setDashboardFocus(null);
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
    } catch (_e) {}
  }, [selectedProject]);

  useEffect(() => {
    let mounted = true;
    async function loadButtons() {
      try {
        const paths = [
          'branding/dashboard_buttons/nykontroll.png',
          'branding/dashboard_buttons/dagensuppgifter.png'
        ];
        const results = await Promise.all(paths.map(async (p) => {
          try {
            if (!storage) return null;
            let fullPath = p;
            if (typeof p === 'string' && p.trim().toLowerCase().startsWith('gs://')) {
              const m = String(p).trim().match(/^gs:\/\/[^\/]+\/(.+)$/i);
              if (m && m[1]) fullPath = m[1];
              else return null;
            }

            const normPath = String(fullPath).replace(/^\/+/, '');

            try {
              if (Platform && Platform.OS === 'web') {
                const bucketName = (storage && storage.app && storage.app.options && storage.app.options.storageBucket) ? String(storage.app.options.storageBucket) : '';
                const bucketCandidates = [];
                if (bucketName) {
                  bucketCandidates.push(bucketName);
                  if (bucketName.toLowerCase().endsWith('.firebasestorage.app')) {
                    bucketCandidates.push(bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
                  }
                }
                for (const b of (bucketCandidates.length ? bucketCandidates : [])) {
                  try {
                    const publicUrl = 'https://storage.googleapis.com/' + b + '/' + encodeURI(normPath);
                    return publicUrl;
                  } catch (_e) {}
                }
              }
            } catch (_e) {}

            try {
              const ref = storage.ref(normPath);
              const url = await ref.getDownloadURL();
              return url || null;
            } catch (_e) {
              return null;
            }
          } catch (_e) {
            return null;
          }
        }));

        if (!mounted) return;
        setDashboardBtn1Url(results[0] || null);
        setDashboardBtn2Url(results[1] || null);
        setDashboardBtn1Failed(!results[0]);
        setDashboardBtn2Failed(!results[1]);
      } catch (_e) {
        if (!mounted) return;
        setDashboardBtn1Failed(true);
        setDashboardBtn2Failed(true);
      }
    }

    loadButtons();
    return () => { mounted = false; };
  }, []);

  return {
    dashboardLoading,
    dashboardOverview,
    dashboardRecent,
    dashboardRecentProjects,
    companyActivity,
    dashboardFocus,
    dashboardHoveredStatKey,
    dashboardActiveProjectsList,
    dashboardDraftItems,
    dashboardControlsToSignItems,
    dashboardOpenDeviationItems,
    dashboardUpcomingSkyddsrondItems,
    dashboardDropdownAnchor,
    dashboardDropdownTop,
    dashboardDropdownRowKey,
    dashboardBtn1Url,
    dashboardBtn2Url,
    dashboardBtn1Failed,
    dashboardBtn2Failed,
    dashboardCardLayoutRef,
    dashboardStatRowLayoutRef,
    setDashboardDropdownRowKey,
    setDashboardBtn1Failed,
    setDashboardBtn2Failed,
    setDashboardDropdownTop,
    setDashboardHoveredStatKey,
    setDashboardFocus,
    loadDashboard,
    toggleDashboardFocus,
  };
}
