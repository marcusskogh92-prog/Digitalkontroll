import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Modal, Platform, Text, TouchableOpacity, View } from 'react-native';

let createPortal = null;
let flushSync = (fn) => { if (typeof fn === 'function') fn(); };
try {
  const r = require('react-dom');
  createPortal = r.createPortal;
  if (r.flushSync) flushSync = r.flushSync;
} catch (_e) {
  createPortal = null;
}
import { collectionGroup, deleteDoc, doc, getDocs, getDocsFromServer, updateDoc } from 'firebase/firestore';
import { HomeHeader } from '../components/common/HomeHeader';
import SharePointSiteIcon from '../components/common/SharePointSiteIcon';
import MainLayout from '../components/MainLayout';
import { useSharePointStatus } from '../hooks/useSharePointStatus';
import {
  auth,
  db,
  fetchCompanies,
  fetchCompanySharePointSiteMetas,
  fetchCompanySharePointSiteMetasFromServer,
  getAvailableSharePointSites,
  syncSharePointSiteVisibilityRemote,
  upsertCompanySharePointSiteMeta,
} from '../components/firebase';

const STATUS_TTL_MS = 2 * 60 * 1000;

const normalizeMatchText = (value) => {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '')
    .trim();
};

const normalizeSiteSlug = (value) => {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 50);
};

const companyIdToSlug = (cid) => {
  return String(cid || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')
    .replace(/[^a-z0-9-]/g, '');
};

const extractCompanyIdFromPath = (path) => {
  const safe = String(path || '');
  const match = safe.match(/foretag\/([^/]+)\/sharepoint_sites/i);
  return match && match[1] ? String(match[1]).trim() : '';
};

/** Normaliserar företags-id för matchning (t.ex. "MS Byggsystem" och "ms-byggsystem" → samma). */
const normalizeCompanyIdForMatch = (id) => {
  const s = String(id || '').trim();
  if (!s) return '';
  return s
    .toLowerCase()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
};

const showSimpleAlert = (title, message) => {
  try {
    const t = String(title || '').trim() || 'Info';
    const m = String(message || '').trim();
    if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(m ? `${t}\n\n${m}` : t);
    else Alert.alert(t, m || '');
  } catch (_e) {}
};

export default function ManageSharePointNavigation({ navigation, route }) {
  const [companyId, setCompanyId] = useState(() => {
    try {
      const fromRoute = String(route?.params?.companyId || '').trim();
      return fromRoute || '';
    } catch (_e) {
      return '';
    }
  });
  const [companies, setCompanies] = useState([]);
  const [loadingCompanies, setLoadingCompanies] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [loadingMetas, setLoadingMetas] = useState(false);
  const [syncingCompanies, setSyncingCompanies] = useState(false);
  const [syncProgress, setSyncProgress] = useState({ done: 0, total: 0 });
  const [allCompanySiteMetas, setAllCompanySiteMetas] = useState({});
  const [metasVersion, setMetasVersion] = useState(0);
  const [supplementalSiteMetas, setSupplementalSiteMetas] = useState({});
  const [companyGroupOpen, setCompanyGroupOpen] = useState({});
  const [siteStatusMap, setSiteStatusMap] = useState({});
  const siteStatusRef = useRef({});
  const [statusFilter, setStatusFilter] = useState('all');
  const [creatingCustomSite, setCreatingCustomSite] = useState(false);
  const [assigningSiteId, setAssigningSiteId] = useState('');
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [openKebabKey, setOpenKebabKey] = useState(null);
  const [kebabMenuPosition, setKebabMenuPosition] = useState(null);
  const [kebabMenuContent, setKebabMenuContent] = useState(null);
  const kebabMenuPortalRef = useRef(null);
  const kebabButtonRef = useRef(null);
  const [moveModalOpen, setMoveModalOpen] = useState(false);
  const [moveModalRow, setMoveModalRow] = useState(null);
  const [moveModalCompanyId, setMoveModalCompanyId] = useState('');
  const [moveModalTargetCompanyId, setMoveModalTargetCompanyId] = useState('');
  const [actionInProgressKey, setActionInProgressKey] = useState(null);
  const [refreshingList, setRefreshingList] = useState(false);
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId, searchSpinAnim });

  const closeKebabMenu = () => {
    setOpenKebabKey(null);
    setKebabMenuPosition(null);
    setKebabMenuContent(null);
    kebabButtonRef.current = null;
  };

  useEffect(() => {
    if (!openKebabKey || Platform.OS !== 'web' || typeof document === 'undefined') return;
    const onMouseDown = (e) => {
      if (kebabMenuPortalRef.current && kebabMenuPortalRef.current.contains(e.target)) return;
      if (kebabButtonRef.current && (e.target === kebabButtonRef.current || kebabButtonRef.current.contains(e.target))) return;
      closeKebabMenu();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [openKebabKey]);

  const noopAsync = async () => {};

  const companyNameMap = useMemo(() => {
    const map = {};
    (Array.isArray(companies) ? companies : []).forEach((c) => {
      const cid = String(c?.id || '').trim();
      if (!cid) return;
      const label = String(c?.profile?.companyName || c?.profile?.name || c?.name || cid).trim();
      map[cid] = label || cid;
    });
    return map;
  }, [companies]);

  const getCompanyLabel = (cid) => {
    const id = String(cid || '').trim();
    if (!id) return '';
    return String(companyNameMap[id] || id).trim();
  };

  useEffect(() => {
    siteStatusRef.current = siteStatusMap;
  }, [siteStatusMap]);

  // Load company ID from storage/route (fallback if route param missing)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const current = String(companyId || '').trim();
        if (current) return;
        const stored = await AsyncStorage.getItem('dk_companyId');
        const storedTrim = String(stored || '').trim();
        if (storedTrim && mounted) setCompanyId(storedTrim);
      } catch (_e) {}
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Persist selected company
  useEffect(() => {
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid) return;
        try { await AsyncStorage.setItem('dk_companyId', cid); } catch (_e) {}
        if (Platform.OS === 'web') {
          try { window?.localStorage?.setItem?.('dk_companyId', cid); } catch (_e) {}
        }
      } catch (_e) {}
    })();
  }, [companyId]);

  // Role detection
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch (_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const superFlag = isEmailSuperadmin || isSuperClaim;
        const allowHeader = superFlag || isAdminClaim;
        if (mounted) {
          setShowHeaderUserMenu(!!allowHeader);
          setIsSuperadmin(!!superFlag);
        }
      } catch (_e) {
        if (mounted) setShowHeaderUserMenu(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load companies
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin) return;
      setLoadingCompanies(true);
      try {
        const list = await fetchCompanies();
        if (mounted) setCompanies(Array.isArray(list) ? list : []);
      } catch (_e) {
        if (mounted) setCompanies([]);
      } finally {
        if (mounted) setLoadingCompanies(false);
      }
    })();
    return () => { mounted = false; };
  }, [isSuperadmin]);

  // Load available SharePoint sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin) return;
      setLoadingSites(true);
      try {
        const allSites = await getAvailableSharePointSites();
        if (mounted) setAvailableSites(Array.isArray(allSites) ? allSites : []);
      } catch (_e) {
        if (mounted) setAvailableSites([]);
      } finally {
        if (mounted) setLoadingSites(false);
      }
    })();
    return () => { mounted = false; };
  }, [isSuperadmin]);

  // Sync all companies (superadmin)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin) return;
      const list = Array.isArray(companies) ? companies : [];
      if (list.length === 0) return;
      setSyncingCompanies(true);
      setSyncProgress({ done: 0, total: list.length });
      try {
        for (let i = 0; i < list.length; i += 1) {
          const cid = String(list[i]?.id || '').trim();
          if (cid) {
            try { await syncSharePointSiteVisibilityRemote({ companyId: cid }); } catch (_e) {}
          }
          if (mounted) setSyncProgress({ done: i + 1, total: list.length });
        }
      } finally {
        if (mounted) setSyncingCompanies(false);
      }
    })();
    return () => { mounted = false; };
  }, [isSuperadmin, companies]);

  // Hämta sharepoint_sites per företag – serverläsning, med fallback på slug-format om id skiljer sig
  const fetchMetasByCompany = async (companyList) => {
    const cids = (Array.isArray(companyList) ? companyList : [])
      .map((c) => String(c?.id || '').trim())
      .filter(Boolean);
    if (cids.length === 0) return {};
    const byCompany = {};
    await Promise.all(
      cids.map(async (cid) => {
        let metas = await fetchCompanySharePointSiteMetasFromServer(cid);
        if (!Array.isArray(metas) || metas.length === 0) {
          metas = await fetchCompanySharePointSiteMetas(cid);
        }
        if (!Array.isArray(metas) || metas.length === 0) {
          const slug = companyIdToSlug(cid);
          if (slug && slug !== cid) {
            metas = await fetchCompanySharePointSiteMetasFromServer(slug);
            if (!Array.isArray(metas) || metas.length === 0) {
              metas = await fetchCompanySharePointSiteMetas(slug);
            }
          }
        }
        if (Array.isArray(metas) && metas.length > 0) {
          byCompany[cid] = metas.map((m) => ({ ...m, siteId: String(m?.siteId || m?.id || '').trim() }));
        }
      })
    );
    return byCompany;
  };

  // Load all company SharePoint metas (collection group eller per-företag)
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin) return;
      const list = Array.isArray(companies) ? companies : [];
      if (list.length === 0) return;
      setLoadingMetas(true);
      try {
        const snap = await getDocs(collectionGroup(db, 'sharepoint_sites'));
        const byCompany = {};
        snap.forEach((docSnap) => {
          const data = docSnap.data() || {};
          const siteId = String(data.siteId || docSnap.id || '').trim();
          const ownerCompanyId = extractCompanyIdFromPath(docSnap.ref?.path || '');
          if (!siteId || !ownerCompanyId) return;
          if (!byCompany[ownerCompanyId]) byCompany[ownerCompanyId] = [];
          byCompany[ownerCompanyId].push({ id: docSnap.id, ...data, siteId });
        });
        if (mounted) {
          let final = byCompany;
          if (Object.keys(byCompany).length === 0) {
            final = await fetchMetasByCompany(list);
          }
          setAllCompanySiteMetas((prev) => {
            const next = Object.keys(final || {}).length > 0 ? final : prev;
            if (typeof window !== 'undefined' && window.location?.hostname === 'localhost' && next && Object.keys(next).length > 0) {
              const summary = Object.entries(next).map(([k, arr]) => `${k} (${(arr || []).length})`).join(', ');
              console.warn('[SharePoint Nav] Set metas:', summary);
            }
            return next;
          });
          setMetasVersion((v) => v + 1);
        }
      } catch (_e) {
        if (!mounted) return;
        const byCompany = await fetchMetasByCompany(list);
        setAllCompanySiteMetas((prev) => {
          const next = Object.keys(byCompany || {}).length > 0 ? byCompany : prev;
          if (typeof window !== 'undefined' && window.location?.hostname === 'localhost' && next && Object.keys(next).length > 0) {
            const summary = Object.entries(next).map(([k, arr]) => `${k} (${(arr || []).length})`).join(', ');
            console.warn('[SharePoint Nav] Set metas (catch):', summary);
          }
          return next;
        });
        setMetasVersion((v) => v + 1);
      } finally {
        if (mounted) setLoadingMetas(false);
      }
    })();
    return () => { mounted = false; };
  }, [isSuperadmin, syncingCompanies, companies]);

  // För företag som visar 0 siter från collectionGroup: hämta direkt från foretag/{id}/sharepoint_sites
  // så att vi visar rätt antal även om collectionGroup inte returnerade dem (t.ex. olika id-format).
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin || loadingMetas) return;
      const list = Array.isArray(companies) ? companies : [];
      const metaByNorm = new Map();
      Object.entries(allCompanySiteMetas || {}).forEach(([key, arr]) => {
        const norm = normalizeCompanyIdForMatch(key);
        if (!norm) return;
        const existing = metaByNorm.get(norm) || [];
        const add = Array.isArray(arr) ? arr : [];
        const seen = new Set(existing.map((m) => String(m?.siteId || m?.id || '').trim()).filter(Boolean));
        add.forEach((m) => {
          const sid = String(m?.siteId || m?.id || '').trim();
          if (sid && !seen.has(sid)) {
            seen.add(sid);
            existing.push(m);
          }
        });
        metaByNorm.set(norm, existing);
      });
      const toFetch = list
        .map((c) => String(c?.id || '').trim())
        .filter((cid) => cid && cid !== 'digitalkontroll-unassigned')
        .filter((cid) => {
          const norm = normalizeCompanyIdForMatch(cid);
          const count = (norm ? metaByNorm.get(norm) : null)?.length ?? 0;
          return count === 0;
        });
      if (toFetch.length === 0) {
        return;
      }
      const next = {};
      await Promise.all(
        toFetch.map(async (cid) => {
          try {
            let metas = await fetchCompanySharePointSiteMetasFromServer(cid);
            if (!Array.isArray(metas) || metas.length === 0) metas = await fetchCompanySharePointSiteMetas(cid);
            if (!Array.isArray(metas) || metas.length === 0) {
              const slug = companyIdToSlug(cid);
              if (slug && slug !== cid) {
                metas = await fetchCompanySharePointSiteMetasFromServer(slug);
                if (!Array.isArray(metas) || metas.length === 0) metas = await fetchCompanySharePointSiteMetas(slug);
              }
            }
            if (mounted && Array.isArray(metas) && metas.length > 0) next[cid] = metas;
          } catch (_e) {}
        })
      );
      if (mounted) setSupplementalSiteMetas(next);
    })();
    return () => { mounted = false; };
  }, [isSuperadmin, loadingMetas, companies, allCompanySiteMetas]);

  // Check live status for sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isSuperadmin) return;
      const siteIds = (Array.isArray(availableSites) ? availableSites : [])
        .map((s) => String(s?.id || '').trim())
        .filter(Boolean);
      if (siteIds.length === 0) {
        if (mounted) setSiteStatusMap({});
        return;
      }

      const now = Date.now();
      const prev = siteStatusRef.current || {};
      const toCheck = siteIds.filter((id) => {
        const entry = prev[id];
        if (!entry || !entry.checkedAt) return true;
        return now - entry.checkedAt > STATUS_TTL_MS;
      });

      if (toCheck.length === 0) return;

      setSiteStatusMap((current) => {
        const next = { ...current };
        toCheck.forEach((id) => {
          next[id] = { status: 'checking', checkedAt: next[id]?.checkedAt || null };
        });
        return next;
      });

      try {
        const { getAccessToken } = await import('../services/azure/authService');
        const accessToken = await getAccessToken();
        if (!accessToken) throw new Error('Missing access token');

        const batches = [];
        for (let i = 0; i < toCheck.length; i += 6) {
          batches.push(toCheck.slice(i, i + 6));
        }

        for (const group of batches) {
          const results = await Promise.allSettled(group.map(async (id) => {
            const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${id}`, {
              headers: { Authorization: `Bearer ${accessToken}` },
            });
            if (!res.ok) {
              const status = res.status;
              const txt = await res.text();
              if (status === 404) {
                throw new Error('Site not found (404)');
              }
              throw new Error(txt || `Status ${status}`);
            }
            return true;
          }));

          if (!mounted) return;
          setSiteStatusMap((current) => {
            const next = { ...current };
            results.forEach((r, idx) => {
              const id = group[idx];
              if (r.status === 'fulfilled') {
                next[id] = { status: 'live', checkedAt: Date.now() };
              } else {
                next[id] = { status: 'error', checkedAt: Date.now(), error: String(r.reason || '') };
              }
            });
            return next;
          });
        }
      } catch (e) {
        if (!mounted) return;
        setSiteStatusMap((current) => {
          const next = { ...current };
          toCheck.forEach((id) => {
            next[id] = { status: 'error', checkedAt: Date.now(), error: String(e?.message || e) };
          });
          return next;
        });
      }
    })();

    return () => { mounted = false; };
  }, [isSuperadmin, availableSites]);

  const availableSiteMap = useMemo(() => new Map(
    (Array.isArray(availableSites) ? availableSites : [])
      .map((site) => [String(site?.id || '').trim(), site])
      .filter(([id]) => id)
  ), [availableSites]);

  const siteOwnerMap = useMemo(() => {
    const map = {};
    Object.entries(allCompanySiteMetas || {}).forEach(([cid, metas]) => {
      (Array.isArray(metas) ? metas : []).forEach((m) => {
        const sid = String(m?.siteId || m?.id || '').trim();
        if (!sid) return;
        map[sid] = cid;
      });
    });
    return map;
  }, [allCompanySiteMetas]);

  const unassignedSites = useMemo(() => {
    return (Array.isArray(availableSites) ? availableSites : []).filter((site) => {
      const sid = String(site?.id || '').trim();
      if (!sid) return false;
      return !siteOwnerMap[sid];
    });
  }, [availableSites, siteOwnerMap]);

  const getStatusInfo = (siteId, isPaused = false) => {
    if (isPaused) {
      return {
        statusValue: 'paused',
        statusLabel: 'Pausad',
        statusColor: '#6B7280',
        statusBg: '#F3F4F6',
      };
    }
    const entry = siteStatusMap[siteId] || {};
    const statusValue = entry.status || 'checking';
    const statusLabel = statusValue === 'live' ? 'Live' : statusValue === 'error' ? 'Fel' : 'Synkar';
    const statusColor = statusValue === 'live' ? '#2E7D32' : statusValue === 'error' ? '#C62828' : '#6B7280';
    const statusBg = statusValue === 'live' ? '#E8F5E9' : statusValue === 'error' ? '#FFEBEE' : '#F3F4F6';
    return { statusValue, statusLabel, statusColor, statusBg };
  };

  // company.id är foretag-dokumentets id; allCompanySiteMetas nycklas med id från sökvägen foretag/{id}/sharepoint_sites.
  // En site får bara tillhöra ETT företag (en site = en ägare). DK Site/DK Bas visas bara under det företag som matchar sitnamnet.
  const companyRows = useMemo(() => {
    const list = Array.isArray(companies) ? companies : [];
    const metaByNormalized = new Map();
    Object.entries(allCompanySiteMetas || {}).forEach(([key, arr]) => {
      const norm = normalizeCompanyIdForMatch(key);
      if (!norm) return;
      const existing = metaByNormalized.get(norm) || [];
      const add = Array.isArray(arr) ? arr : [];
      const seen = new Set((existing || []).map((m) => String(m?.siteId || m?.id || '').trim()).filter(Boolean));
      add.forEach((m) => {
        const sid = String(m?.siteId || m?.id || '').trim();
        if (sid && !seen.has(sid)) {
          seen.add(sid);
          existing.push(m);
        }
      });
      metaByNormalized.set(norm, existing);
    });

    // Bestäm canonical ägare per siteId. Firestore (metaByNormalized) går före supplemental så flytt uppdateras direkt.
    const allSiteCompanyPairs = [];
    Array.from(metaByNormalized.entries()).forEach(([norm, metas]) => {
      metas.forEach((meta) => {
        const siteId = String(meta?.siteId || meta?.id || '').trim();
        if (!siteId) return;
        const site = availableSiteMap.get(siteId) || {};
        const displayName = String(meta?.siteName || site?.displayName || site?.name || '').trim();
        allSiteCompanyPairs.push({ siteId, norm, meta, displayName, fromSupplemental: false });
      });
    });
    list.forEach((company) => {
      const cid = String(company?.id || '').trim();
      const norm = normalizeCompanyIdForMatch(cid);
      (Array.isArray(supplementalSiteMetas[cid]) ? supplementalSiteMetas[cid] : []).forEach((meta) => {
        const siteId = String(meta?.siteId || meta?.id || '').trim();
        if (!siteId) return;
        const site = availableSiteMap.get(siteId) || {};
        const displayName = String(meta?.siteName || site?.displayName || site?.name || '').trim();
        allSiteCompanyPairs.push({ siteId, norm, meta, displayName, fromSupplemental: true });
      });
    });
    const bySiteId = new Map();
    allSiteCompanyPairs.forEach(({ siteId, norm, fromSupplemental }) => {
      if (!bySiteId.has(siteId)) bySiteId.set(siteId, []);
      const arr = bySiteId.get(siteId);
      if (!arr.some((x) => x.norm === norm)) arr.push({ norm, fromSupplemental });
    });
    const siteIdToCanonicalNorm = {};
    bySiteId.forEach((entries, siteId) => {
      const pairs = allSiteCompanyPairs.filter((e) => e.siteId === siteId);
      const displayNameForCheck = (pairs[0]?.displayName || '').toLowerCase();
      const isDkBas = /dk\s*[- ]?ba(s)?/.test(displayNameForCheck) || /dk\s*bas/.test(displayNameForCheck);
      const isDkSite = /dk\s*[- ]?site/.test(displayNameForCheck);
      if (isDkBas || isDkSite) {
        const match = (pairs[0]?.displayName || '').match(/^(.+?)\s*[-–—]\s*dk\s*(?:site|ba?s?)/i);
        const prefix = (match && match[1] ? match[1].trim() : '') || '';
        const normPrefix = prefix ? normalizeCompanyIdForMatch(prefix) : '';
        const found =
          normPrefix &&
          list.find(
            (c) =>
              normalizeCompanyIdForMatch(c?.id) === normPrefix ||
              normalizeCompanyIdForMatch(getCompanyLabel(c?.id)) === normPrefix ||
              normalizeCompanyIdForMatch(String(c?.name || '')) === normPrefix
          );
        if (found) {
          siteIdToCanonicalNorm[siteId] = normalizeCompanyIdForMatch(found.id);
          return;
        }
      }
      const fromMain = entries.filter((e) => !e.fromSupplemental).map((e) => e.norm);
      const fromSupp = entries.filter((e) => e.fromSupplemental).map((e) => e.norm);
      const preferred = fromMain.length > 0 ? fromMain : fromSupp;
      const sorted = [...new Set(preferred)].sort();
      siteIdToCanonicalNorm[siteId] = sorted[0];
    });

    const rows = list.map((company) => {
      const cid = String(company?.id || '').trim();
      const cname = getCompanyLabel(cid);
      const norm = normalizeCompanyIdForMatch(cid);
      const fromGroup = (norm ? metaByNormalized.get(norm) : null) || [];
      const fromSupplemental = Array.isArray(supplementalSiteMetas[cid]) ? supplementalSiteMetas[cid] : [];
      const owned = (arr) => arr.filter((m) => siteIdToCanonicalNorm[String(m?.siteId || m?.id || '').trim()] === norm);
      const ownedGroup = owned(fromGroup);
      const seenIds = new Set(ownedGroup.map((m) => String(m?.siteId || m?.id || '').trim()).filter(Boolean));
      const merged = [...ownedGroup];
      owned(fromSupplemental).forEach((m) => {
        const sid = String(m?.siteId || m?.id || '').trim();
        if (sid && !seenIds.has(sid)) {
          seenIds.add(sid);
          merged.push(m);
        }
      });
      const metas = merged;
      const siteRows = metas
        .map((meta) => {
          const siteId = String(meta?.siteId || meta?.id || '').trim();
          if (!siteId) return null;
          const site = availableSiteMap.get(siteId) || {};
          const role = String(meta?.role || '').trim();
          const displayNameForCheck = String(meta?.siteName || site?.displayName || site?.name || site?.webUrl || '').toLowerCase();
          const isDkBasByName = /dk\s*[- ]?ba(s)?/.test(displayNameForCheck) || /dk\s*bas/.test(displayNameForCheck);
          const isDkSiteByName = /dk\s*[- ]?site/.test(displayNameForCheck);
          const isSystem = role === 'system' || isDkBasByName;
          const isProjects = role === 'projects' || (isDkSiteByName && !isDkBasByName);
          const isLinked = true;
          const isLocked = isSystem || isProjects;
          const isPaused = meta?.visibleInLeftPanel === false;
          const { statusValue, statusLabel, statusColor, statusBg } = getStatusInfo(siteId, isPaused);
          const roleLabel = isSystem ? 'Låst' : isProjects ? 'Låst' : '';
          let displayName = String(meta?.siteName || site?.displayName || site?.name || site?.webUrl || siteId).trim();
          if (isDkBasByName && /dk\s*[- ]?ba\s*$/i.test(displayName)) {
            displayName = displayName.replace(/dk\s*[- ]?ba\s*$/i, 'DK Bas').trim();
          }
          const sortName = String(site?.displayName || site?.name || meta?.siteName || displayName || site?.webUrl || siteId).trim();

          return {
            siteId,
            site,
            role,
            isSystem,
            isProjects,
            isLinked,
            isLocked,
            statusValue,
            statusLabel,
            statusColor,
            statusBg,
            roleLabel,
            visibleInLeftPanel: meta?.visibleInLeftPanel !== false,
            sortName,
            displayName,
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          if (a.isSystem && !b.isSystem) return -1;
          if (!a.isSystem && b.isSystem) return 1;
          if (a.isProjects && !b.isProjects) return -1;
          if (!a.isProjects && b.isProjects) return 1;
          return (a.sortName || '').localeCompare(b.sortName || '', undefined, { sensitivity: 'base' });
        });

      const total = siteRows.length;
      const anyError = siteRows.some((r) => r.statusValue === 'error');
      const anyChecking = siteRows.some((r) => r.statusValue === 'checking');
      const statusKind = total === 0 ? 'warning' : anyError ? 'error' : anyChecking ? 'warning' : 'ok';
      const statusLabel = statusKind === 'ok' ? 'OK' : statusKind === 'error' ? 'Fel' : 'Varning';
      const statusColor = statusKind === 'ok' ? '#2E7D32' : statusKind === 'error' ? '#C62828' : '#B45309';
      const statusBg = statusKind === 'ok' ? '#E8F5E9' : statusKind === 'error' ? '#FFEBEE' : '#FEF3C7';

      return {
        id: cid,
        name: cname || cid,
        rows: siteRows,
        total,
        statusKind,
        statusLabel,
        statusColor,
        statusBg,
      };
    });

    // Add Digitalkontroll group for unassigned sites
    rows.unshift({
      id: 'digitalkontroll-unassigned',
      name: 'Digitalkontroll',
      rows: unassignedSites.map((site) => {
        const siteId = String(site?.id || '').trim();
        const { statusValue, statusLabel, statusColor, statusBg } = getStatusInfo(siteId);
        const displayName = String(site?.displayName || site?.name || site?.webUrl || siteId).trim();
        return {
          siteId,
          site,
          displayName,
          role: 'unassigned',
          isLinked: false,
          isLocked: false,
          statusValue,
          statusLabel,
          statusColor,
          statusBg,
          roleLabel: 'Ej kopplad',
          visibleInLeftPanel: false,
        };
      }),
      total: unassignedSites.length,
      statusKind: unassignedSites.some((s) => getStatusInfo(String(s?.id || '').trim()).statusValue === 'error') ? 'error' : (unassignedSites.length ? 'ok' : 'warning'),
      statusLabel: unassignedSites.length ? 'OK' : 'Varning',
      statusColor: unassignedSites.length ? '#2E7D32' : '#B45309',
      statusBg: unassignedSites.length ? '#E8F5E9' : '#FEF3C7',
    });

    return rows;
  }, [companies, allCompanySiteMetas, metasVersion, supplementalSiteMetas, availableSiteMap, unassignedSites, getCompanyLabel, getStatusInfo]);

  const filteredCompanyRows = useMemo(() => {
    return companyRows;
  }, [companyRows]);

  const filterRows = (rows, groupId) => {
    if (statusFilter === 'all') return rows;
    if (statusFilter === 'error') return rows.filter((r) => r.statusValue === 'error');
    if (statusFilter === 'linked') return groupId === 'digitalkontroll-unassigned' ? [] : rows;
    if (statusFilter === 'available') return groupId === 'digitalkontroll-unassigned' ? rows : [];
    return rows;
  };

  const toggleSiteEnabled = async (siteId, targetCompanyId, nextEnabled, row = null) => {
    const cid = String(targetCompanyId || '').trim();
    if (!cid || !siteId) return;

    try {
      const site = availableSiteMap.get(siteId) || {};
      const displayNameForConfirm = String(row?.displayName || site.displayName || site.name || site.webUrl || siteId).trim();
      const isEnable = !!nextEnabled;
      const title = isEnable ? 'Bekräfta aktivering' : 'Bekräfta avstängning';
      const question = isEnable
        ? `Vill du aktivera "${displayNameForConfirm}" i vänsterpanelen?`
        : `Vill du stänga av "${displayNameForConfirm}" i vänsterpanelen?`;
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(question);
        if (!ok) return;
      } else {
        const accepted = await new Promise((resolve) => {
          Alert.alert(title, question, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: isEnable ? 'Aktivera' : 'Stäng av', onPress: () => resolve(true) },
          ]);
        });
        if (!accepted) return;
      }

      setActionInProgressKey(`${cid}-${siteId}`);
      try {
        if (nextEnabled) {
          await upsertCompanySharePointSiteMeta(cid, {
            siteId,
            siteName: row?.displayName || site.displayName || site.name || null,
            siteUrl: site.webUrl || null,
            role: row?.role || 'custom',
            visibleInLeftPanel: true,
          });
        } else {
          await updateDoc(doc(db, 'foretag', cid, 'sharepoint_sites', siteId), {
            visibleInLeftPanel: false,
          });
        }
        await refreshAllCompanySiteMetas({ afterWrite: true });
        showSimpleAlert('Sparat', nextEnabled ? 'Siten är aktiverad.' : 'Siten är pausad.');
      } finally {
        setActionInProgressKey(null);
      }
    } catch (e) {
      setActionInProgressKey(null);
      showSimpleAlert('Fel', e?.message || String(e));
    }
  };

  const refreshAllCompanySiteMetas = async (options = {}) => {
    const { afterWrite = false } = options;
    const coll = collectionGroup(db, 'sharepoint_sites');
    const buildByCompany = (snap) => {
      const byCompany = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const sid = String(data.siteId || docSnap.id || '').trim();
        const owner = extractCompanyIdFromPath(docSnap.ref?.path || '');
        if (!sid || !owner) return;
        if (!byCompany[owner]) byCompany[owner] = [];
        byCompany[owner].push({ id: docSnap.id, ...data, siteId: sid });
      });
      return byCompany;
    };
    const applyMetas = (next) => {
      flushSync(() => {
        setAllCompanySiteMetas(next);
        setMetasVersion((v) => v + 1);
      });
    };
    const applyMetasMerge = (next) => {
      flushSync(() => {
        setAllCompanySiteMetas((prev) => ({ ...prev, ...next }));
        setMetasVersion((v) => v + 1);
      });
    };
    const list = Array.isArray(companies) ? companies : [];
    const ensureNonEmpty = async (byCompany) => {
      if (Object.keys(byCompany).length > 0) return byCompany;
      return fetchMetasByCompany(list);
    };
    if (afterWrite) {
      await new Promise((r) => setTimeout(r, 350));
    }
    let lastError;
    try {
      const snap = await getDocsFromServer(coll);
      const next = await ensureNonEmpty(buildByCompany(snap));
      applyMetas(next);
      return { fromCache: false };
    } catch (e) {
      lastError = e;
      await new Promise((r) => setTimeout(r, 600));
      try {
        const snap = await getDocsFromServer(coll);
        const next = await ensureNonEmpty(buildByCompany(snap));
        applyMetas(next);
        return { fromCache: false };
      } catch (e2) {
        lastError = e2;
      }
    }
    try {
      const snap = await getDocs(coll);
      const next = await ensureNonEmpty(buildByCompany(snap));
      applyMetas(next);
      return { fromCache: true };
    } catch (e2) {
      if (list.length > 0) {
        const byCompany = await fetchMetasByCompany(list);
        applyMetasMerge(byCompany);
        return { fromCache: true };
      }
      if (lastError) throw lastError;
      throw e2;
    }
  };

  const handleRenameSite = async (row, companyId) => {
    const cid = String(companyId || '').trim();
    if (!cid || !row?.siteId) return;
    // Use saved display name (e.g. "Anbud 2026") so popup shows what we show in Nav and left panel
    const currentName = String(row.displayName || row.site?.displayName || row.site?.name || row.site?.webUrl || row.siteId).trim();
    const newName =
      Platform.OS === 'web' && typeof window !== 'undefined'
        ? (window.prompt('Nytt visningsnamn för siten (i Digitalkontroll)', currentName) || '').trim()
        : currentName;
    if (!newName || newName === currentName) return;
    setActionInProgressKey(`${cid}-${row.siteId}`);
    try {
      await upsertCompanySharePointSiteMeta(cid, {
        siteId: row.siteId,
        siteName: newName,
        siteUrl: row.site?.webUrl || null,
        role: row.role || 'custom',
        visibleInLeftPanel: row.visibleInLeftPanel !== false,
      });
      await refreshAllCompanySiteMetas({ afterWrite: true });
      showSimpleAlert('Sparat', 'Visningsnamnet är uppdaterat.');
    } catch (e) {
      showSimpleAlert('Fel', e?.message || String(e));
    } finally {
      setActionInProgressKey(null);
    }
  };

  const moveSiteToCompany = async (siteId, fromCompanyId, toCompanyId, row) => {
    const fromId = String(fromCompanyId || '').trim();
    const toId = String(toCompanyId || '').trim();
    if (!fromId || !toId || !siteId || fromId === toId) return;
    const toName = getCompanyLabel(toId);
    let ok = false;
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      ok = window.confirm(`Flytta denna site till "${toName}"? Den tas bort från nuvarande företag.`);
    } else {
      ok = await new Promise((resolve) => {
        Alert.alert('Flytta site', `Flytta till "${toName}"? Den tas bort från nuvarande företag.`, [
          { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
          { text: 'Flytta', onPress: () => resolve(true) },
        ]);
      });
    }
    if (!ok) return;
    setMoveModalOpen(false);
    setMoveModalRow(null);
    setMoveModalCompanyId('');
    setMoveModalTargetCompanyId('');
    setActionInProgressKey(`${fromId}-${siteId}`);
    try {
      await deleteDoc(doc(db, 'foretag', fromId, 'sharepoint_sites', siteId));
      await upsertCompanySharePointSiteMeta(toId, {
        siteId,
        siteName: row.displayName || row.site?.displayName || row.site?.name || null,
        siteUrl: row.site?.webUrl || null,
        role: 'custom',
        visibleInLeftPanel: row.visibleInLeftPanel !== false,
      });
      await refreshAllCompanySiteMetas({ afterWrite: true });
      showSimpleAlert('Flyttad', `Siten är nu kopplad till ${toName}. Listan uppdateras.`);
    } catch (e) {
      showSimpleAlert('Fel', e?.message || String(e));
    } finally {
      setActionInProgressKey(null);
    }
  };

  const assignSiteToCompany = async (siteId, targetCompanyId) => {
    const cid = String(targetCompanyId || '').trim();
    if (!cid || !siteId) return;
    setAssigningSiteId(siteId);
    try {
      const site = availableSiteMap.get(siteId) || {};
      await upsertCompanySharePointSiteMeta(cid, {
        siteId,
        siteName: site.displayName || site.name || null,
        siteUrl: site.webUrl || null,
        role: 'custom',
        visibleInLeftPanel: true,
      });
      await refreshAllCompanySiteMetas({ afterWrite: true });
      showSimpleAlert('Kopplad', 'Siten är nu kopplad till företaget.');
    } catch (e) {
      const msg = e?.message || String(e);
      const isPermission = e?.code === 'permission-denied' || (typeof msg === 'string' && (msg.includes('permission') || msg.includes('insufficient')));
      const friendlyMsg = isPermission
        ? 'Saknar behörighet att koppla site. Kontrollera att du är inloggad som superadmin (t.ex. marcus@msbyggsystem.se). Deploya Cloud Functions (firebase deploy --only functions) om du inte gjort det. Använd "Uppdatera token & synka" eller logga ut och in igen.'
        : msg;
      showSimpleAlert('Fel', friendlyMsg);
    } finally {
      setAssigningSiteId('');
    }
  };

  const createCustomSiteForCompany = async (targetCompanyId, targetCompanyName) => {
    const cid = String(targetCompanyId || '').trim();
    if (!cid || !isSuperadmin) return;

    if (Platform.OS !== 'web') {
      showSimpleAlert('Info', 'Skapande av siter stöds just nu bara i webbläget.');
      return;
    }

    const baseName = String(targetCompanyName || cid).trim();
    const namePart = String(window.prompt('Namn på ny site', '') || '').trim();
    if (!namePart) return;

    const displayName = `${baseName} – DK ${namePart}`;
    const slug = normalizeSiteSlug(displayName);
    if (!slug) {
      showSimpleAlert('Fel', 'Ogiltigt namn. Prova ett enklare namn.');
      return;
    }

    setCreatingCustomSite(true);
    try {
      const { getAccessToken } = await import('../services/azure/authService');
      const { getAzureConfig } = await import('../services/azure/config');
      const accessToken = await getAccessToken();
      const cfg = getAzureConfig();
      const hostname = cfg?.sharePointSiteUrl ? new URL(cfg.sharePointSiteUrl).hostname : '';
      if (!accessToken || !hostname) {
        throw new Error('Saknar SharePoint-konfiguration eller access token.');
      }

      const ownerEmail = String(auth?.currentUser?.email || '').trim();
      const createRes = await fetch('https://graph.microsoft.com/beta/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          displayName,
          name: slug,
          description: `Digitalkontroll site for ${baseName}`,
          siteCollection: { hostname },
          template: 'teamSite',
          ownerIdentityToResolve: ownerEmail ? { email: ownerEmail } : undefined,
        }),
      });

      let siteData = null;
      if (createRes.ok) {
        siteData = await createRes.json();
      } else {
        const txt = await createRes.text();
        if (createRes.status === 409) {
          const getRes = await fetch(`https://graph.microsoft.com/v1.0/sites/${hostname}:/sites/${encodeURIComponent(slug)}`, {
            headers: { Authorization: `Bearer ${accessToken}` },
          });
          if (getRes.ok) {
            siteData = await getRes.json();
          } else {
            const getTxt = await getRes.text();
            throw new Error(`Siten finns redan (409) men kunde inte hämtas: ${getTxt || getRes.status}`);
          }
        } else if (createRes.status === 400) {
          let errMsg = txt;
          try {
            const j = JSON.parse(txt);
            if (j?.error?.message) errMsg = j.error.message;
          } catch (_e) {}
          throw new Error(`Ogiltig begäran från SharePoint: ${errMsg}`);
        } else {
          throw new Error(`Kunde inte skapa site (${createRes.status}): ${txt}`);
        }
      }

      const createdId = String(siteData?.id || '').trim();
      const createdUrl = String(siteData?.webUrl || '').trim();
      if (!createdId) throw new Error('Skapad site saknar id.');

      await upsertCompanySharePointSiteMeta(cid, {
        siteId: createdId,
        siteName: displayName,
        siteUrl: createdUrl || null,
        role: 'custom',
        visibleInLeftPanel: true,
      });

      const snap = await getDocs(collectionGroup(db, 'sharepoint_sites'));
      const byCompany = {};
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const sid = String(data.siteId || docSnap.id || '').trim();
        const owner = extractCompanyIdFromPath(docSnap.ref?.path || '');
        if (!sid || !owner) return;
        if (!byCompany[owner]) byCompany[owner] = [];
        byCompany[owner].push({ id: docSnap.id, ...data, siteId: sid });
      });
      setAllCompanySiteMetas(byCompany);
    } catch (e) {
      showSimpleAlert('Fel', e?.message || String(e));
    } finally {
      setCreatingCustomSite(false);
    }
  };

  if (!isSuperadmin && Platform.OS === 'web') {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 14, color: '#6B7280' }}>Endast superadmin kan öppna SharePoint Nav.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      {(loadingSites || loadingMetas || syncingCompanies || creatingCustomSite) && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(255,255,255,0.7)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minWidth: 260, maxWidth: 360, alignItems: 'center' }}>
            <ActivityIndicator color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13, textAlign: 'center' }}>
              {syncingCompanies ? `Synkar företag… (${syncProgress.done}/${syncProgress.total})` : (creatingCustomSite ? 'Skapar ny SharePoint-site…' : 'Laddar SharePoint-nav…')}
            </Text>
          </View>
        </View>
      )}

      <MainLayout
        adminMode={true}
        adminCurrentScreen="sharepoint_navigation"
        adminOnSelectCompany={(company) => {
          if (company && company.id) {
            setCompanyId(String(company.id).trim());
          }
        }}
        adminShowCompanySelector={true}
        adminHideCompanyBanner={true}
        sidebarSelectedCompanyId={companyId}
        topBar={
          <HomeHeader
            headerHeight={headerHeight}
            setHeaderHeight={setHeaderHeight}
            navigation={navigation}
            route={route}
            auth={auth}
            selectedProject={null}
            isSuperAdmin={isSuperadmin}
            allowedTools={false}
            showHeaderUserMenu={showHeaderUserMenu}
            canShowSupportToolsInHeader={false}
            supportMenuOpen={supportMenuOpen}
            setSupportMenuOpen={setSupportMenuOpen}
            companyId={companyId}
            routeCompanyId={route?.params?.companyId || ''}
            showAdminButton={false}
            adminActionRunning={false}
            localFallbackExists={false}
            handleMakeDemoAdmin={noopAsync}
            refreshLocalFallbackFlag={noopAsync}
            dumpLocalRemoteControls={async () => showSimpleAlert('Info', 'Debug-funktionen är inte kopplad på denna vy.')}
            showLastFsError={async () => showSimpleAlert('Info', 'FS-felvisning är inte kopplad på denna vy.')}
            saveControlToFirestore={noopAsync}
            saveDraftToFirestore={noopAsync}
            searchSpinAnim={searchSpinAnim}
            sharePointStatus={sharePointStatus}
          />
        }
      >
        <View style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
          {Platform.OS === 'web' ? (
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, margin: 0, color: '#222' }}>
                  SharePoint Nav
                </h1>
                <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                  Företagscentrerad överblick. Expandera ett företag för att se dess siter.
                </p>
              </div>
              <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>Ändringar sparas direkt.</p>
            </div>
          ) : (
            <View style={{ marginBottom: 16 }}>
              <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 4, color: '#222' }}>
                SharePoint Nav
              </Text>
              <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 6 }}>
                Företagscentrerad överblick. Expandera ett företag för att se dess siter.
              </Text>
            </View>
          )}

          <View style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB' }}>
            <View style={{ padding: 10, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                {[
                  { key: 'all', label: 'Alla' },
                  { key: 'linked', label: 'Upptagna' },
                  { key: 'available', label: 'Lediga' },
                  { key: 'error', label: 'Fel' },
                ].map((item) => {
                  const active = statusFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      onPress={() => setStatusFilter(item.key)}
                      style={{
                        paddingVertical: 4,
                        paddingHorizontal: 8,
                        borderRadius: 999,
                        borderWidth: 1,
                        borderColor: active ? '#1976D2' : '#E5E7EB',
                        backgroundColor: active ? '#E5F3FF' : '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 11, fontWeight: '700', color: active ? '#1D4ED8' : '#6B7280' }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <TouchableOpacity
                onPress={async () => {
                  if (refreshingList) return;
                  setRefreshingList(true);
                  const minShowMs = 500;
                  const start = Date.now();
                  try {
                    const result = await refreshAllCompanySiteMetas();
                    const elapsed = Date.now() - start;
                    if (elapsed < minShowMs) await new Promise((r) => setTimeout(r, minShowMs - elapsed));
                    showSimpleAlert('Uppdaterad', result?.fromCache ? 'Listan är uppdaterad (från cache).' : 'Listan är uppdaterad.');
                  } catch (e) {
                    showSimpleAlert('Kunde inte uppdatera', e?.message || String(e));
                  } finally {
                    setRefreshingList(false);
                  }
                }}
                disabled={refreshingList}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#fff', opacity: refreshingList ? 0.7 : 1 }}
              >
                {refreshingList ? <ActivityIndicator size="small" color="#1976D2" /> : <Ionicons name="refresh" size={16} color="#1976D2" />}
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#1976D2' }}>{refreshingList ? 'Uppdaterar…' : 'Uppdatera listan'}</Text>
              </TouchableOpacity>
            </View>

            <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#E5E7EB', backgroundColor: '#F8FAFC' }}>
              <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>Företag</Text>
              <Text style={{ width: 110, fontSize: 11, fontWeight: '700', color: '#6B7280', textAlign: 'right' }}>Antal siter</Text>
              <Text style={{ width: 110, fontSize: 11, fontWeight: '700', color: '#6B7280', textAlign: 'right' }}>Status</Text>
            </View>

            <View key={metasVersion}>
            {filteredCompanyRows.map((company) => {
              const isOpen = !!companyGroupOpen[company.id];
              return (
                <View key={company.id} style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                  <TouchableOpacity
                    onPress={() => setCompanyGroupOpen((prev) => ({ ...prev, [company.id]: !isOpen }))}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 8, backgroundColor: '#fff' }}
                  >
                    <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={14} color="#64748B" style={{ marginRight: 8 }} />
                    <Text style={{ flex: 1, fontSize: 13, fontWeight: '700', color: '#111' }}>
                      {company.name || company.id}
                    </Text>
                    <Text style={{ width: 110, fontSize: 12, color: '#6B7280', textAlign: 'right' }}>
                      {company.total}
                    </Text>
                    <View style={{ width: 110, alignItems: 'flex-end' }}>
                      <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: company.statusBg }}>
                        <Text style={{ fontSize: 10, fontWeight: '700', color: company.statusColor }}>
                          {company.statusLabel}
                        </Text>
                      </View>
                    </View>
                  </TouchableOpacity>

                  {isOpen ? (
                    <View style={{ paddingBottom: 6, overflow: 'visible' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#F8FAFC', borderTopWidth: 1, borderTopColor: '#E5E7EB' }}>
                        <Text style={{ width: 26 }} />
                        <Text style={{ width: 20 }} />
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>Site</Text>
                        <Text style={{ flex: 1, fontSize: 11, fontWeight: '700', color: '#6B7280' }}>Url</Text>
                        <Text style={{ width: 110, fontSize: 11, fontWeight: '700', color: '#6B7280', textAlign: 'right' }}>Status</Text>
                        <Text style={{ width: 200, fontSize: 11, fontWeight: '700', color: '#6B7280', textAlign: 'right' }}>Åtgärd</Text>
                      </View>

                      {isSuperadmin && company.id !== 'digitalkontroll-unassigned' ? (
                        <View style={{ paddingHorizontal: 8, paddingTop: 6 }}>
                          <TouchableOpacity
                            onPress={() => createCustomSiteForCompany(company.id, company.name)}
                            disabled={creatingCustomSite}
                            style={{ alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 8, borderRadius: 8, borderWidth: 1, borderStyle: 'dashed', borderColor: '#CBD5E1', backgroundColor: '#fff', opacity: creatingCustomSite ? 0.6 : 1 }}
                          >
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1976D2' }}>Lägg till ny site</Text>
                          </TouchableOpacity>
                        </View>
                      ) : null}

                      {(() => {
                        const rows = filterRows(company.rows, company.id);
                        if (rows.length === 0) {
                          return (
                            <View style={{ paddingHorizontal: 8, paddingVertical: 10 }}>
                              <Text style={{ fontSize: 12, color: '#6B7280' }}>Inga siter matchar filtret.</Text>
                            </View>
                          );
                        }

                        return rows.map((row, idx) => (
                          <View
                            key={row.siteId}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              backgroundColor: idx % 2 === 0 ? '#fff' : '#FAFAFA',
                              borderTopWidth: 1,
                              borderTopColor: '#F1F5F9',
                              flexDirection: 'row',
                              alignItems: 'center',
                            }}
                          >
                            <View style={{ width: 26, alignItems: 'center' }}>
                              <SharePointSiteIcon size={16} color={row.isLinked ? '#2563EB' : '#9CA3AF'} />
                            </View>
                            <View style={{ flex: 1 }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <Text style={{ fontSize: 12, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                                  {row.displayName || row.site?.displayName || row.site?.name || row.site?.webUrl || row.siteId}
                                </Text>
                                {row.isSystem ? (
                                  <Ionicons name="lock-closed" size={14} color="#6B7280" />
                                ) : null}
                              </View>
                              <Text style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }} numberOfLines={1}>
                                Tillhör företag: {company.id === 'digitalkontroll-unassigned' ? 'Ej kopplad' : (company.name || company.id)}
                              </Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              {Platform.OS === 'web' && (row.site?.webUrl || row.siteId) ? (
                                <a
                                  href={row.site.webUrl || row.siteId}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  style={{ fontSize: 11, color: '#2563EB', textDecoration: 'underline', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}
                                  title="Öppna site i ny flik"
                                >
                                  {row.site.webUrl || row.siteId}
                                </a>
                              ) : (
                                <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={1}>
                                  {row.site?.webUrl || row.siteId}
                                </Text>
                              )}
                            </View>
                            <View style={{ width: 110, alignItems: 'flex-end' }}>
                              <View style={{ paddingVertical: 2, paddingHorizontal: 6, borderRadius: 999, backgroundColor: row.statusBg }}>
                                <Text style={{ fontSize: 10, fontWeight: '700', color: row.statusColor }}>
                                  {row.statusLabel}
                                </Text>
                              </View>
                            </View>
                            <View style={{ width: 200, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8, overflow: 'visible' }}>
                              {actionInProgressKey === `${company.id}-${row.siteId}` ? (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <ActivityIndicator size="small" color="#2563EB" />
                                  <Text style={{ fontSize: 11, color: '#6B7280' }}>Uppdaterar...</Text>
                                </View>
                              ) : company.id === 'digitalkontroll-unassigned' ? (
                                Platform.OS === 'web' ? (
                                  <select
                                    disabled={assigningSiteId === row.siteId}
                                    onChange={(e) => assignSiteToCompany(row.siteId, String(e.target.value || ''))}
                                    style={{ padding: '4px 6px', borderRadius: 6, border: '1px solid #E5E7EB', fontSize: 11 }}
                                    defaultValue=""
                                  >
                                    <option value="">Koppla</option>
                                    {companies.map((c) => {
                                      const cid = String(c?.id || '').trim();
                                      return cid ? <option key={cid} value={cid}>{getCompanyLabel(cid)}</option> : null;
                                    })}
                                  </select>
                                ) : (
                                  <TouchableOpacity
                                    onPress={() => showSimpleAlert('Info', 'Koppla site via webbläget.')}
                                    style={{ paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6, borderWidth: 1, borderColor: '#E5E7EB' }}
                                  >
                                    <Text style={{ fontSize: 10, color: '#6B7280' }}>Koppla</Text>
                                  </TouchableOpacity>
                                )
                              ) : (
                                <>
                                  {!row.isLocked && Platform.OS === 'web' ? (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setMoveModalRow(row);
                                        setMoveModalCompanyId(company.id);
                                        setMoveModalTargetCompanyId('');
                                        setMoveModalOpen(true);
                                      }}
                                      style={{
                                        padding: '6px 12px',
                                        borderRadius: 6,
                                        border: '1px solid #D1D5DB',
                                        backgroundColor: '#fff',
                                        fontSize: 11,
                                        fontWeight: 600,
                                        color: '#374151',
                                        cursor: 'pointer',
                                      }}
                                    >
                                      Flytta site
                                    </button>
                                  ) : null}
                                  {Platform.OS === 'web' ? (
                                    <button
                                      type="button"
                                      ref={(el) => { if (openKebabKey === `${company.id}-${row.siteId}`) kebabButtonRef.current = el; }}
                                      onClick={(e) => {
                                        const key = `${company.id}-${row.siteId}`;
                                        if (openKebabKey === key) {
                                          closeKebabMenu();
                                          return;
                                        }
                                        const rect = e.target.getBoundingClientRect();
                                        kebabButtonRef.current = e.target;
                                        setKebabMenuPosition({ left: rect.left, top: rect.bottom + 4 });
                                        setKebabMenuContent({ row, company });
                                        setOpenKebabKey(key);
                                      }}
                                      aria-label="Åtgärder"
                                      style={{
                                        padding: '4px 8px',
                                        borderRadius: 6,
                                        border: '1px solid #E5E7EB',
                                        backgroundColor: '#fff',
                                        fontSize: 14,
                                        lineHeight: 1,
                                        cursor: 'pointer',
                                        color: '#6B7280',
                                      }}
                                    >
                                      ⋮
                                    </button>
                                  ) : (
                                    <TouchableOpacity
                                      onPress={() => toggleSiteEnabled(row.siteId, company.id, !row.visibleInLeftPanel, row)}
                                      style={{
                                        paddingVertical: 4,
                                        paddingHorizontal: 6,
                                        borderRadius: 6,
                                        borderWidth: 1,
                                        borderColor: row.visibleInLeftPanel ? '#CFE3FF' : '#E5E7EB',
                                        backgroundColor: row.visibleInLeftPanel ? '#F0F7FF' : '#F3F4F6',
                                      }}
                                    >
                                      <Text style={{ fontSize: 10, fontWeight: '700', color: row.visibleInLeftPanel ? '#1976D2' : '#6B7280' }}>
                                        {row.visibleInLeftPanel ? 'Aktiv' : 'Avstängd'}
                                      </Text>
                                    </TouchableOpacity>
                                  )}
                                </>
                              )}
                            </View>
                          </View>
                        ));
                      })()}
                    </View>
                  ) : null}
                </View>
              );
            })}
            </View>
          </View>
        </View>

        {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' && openKebabKey && kebabMenuPosition && kebabMenuContent ? createPortal(
          <div
            ref={kebabMenuPortalRef}
            style={{
              position: 'fixed',
              left: kebabMenuPosition.left,
              top: kebabMenuPosition.top,
              zIndex: 99999,
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 8,
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              minWidth: 160,
            }}
          >
            <button
              type="button"
              onClick={() => { handleRenameSite(kebabMenuContent.row, kebabMenuContent.company.id); closeKebabMenu(); }}
              style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', fontSize: 12, cursor: 'pointer', color: '#111' }}
            >
              Byt visningsnamn
            </button>
            {kebabMenuContent.row.visibleInLeftPanel ? (
              <button
                type="button"
                onClick={() => { toggleSiteEnabled(kebabMenuContent.row.siteId, kebabMenuContent.company.id, false, kebabMenuContent.row); closeKebabMenu(); }}
                style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', fontSize: 12, cursor: 'pointer', color: '#111', borderTop: '1px solid #F3F4F6' }}
              >
                Pausa site
              </button>
            ) : (
              <button
                type="button"
                onClick={() => { toggleSiteEnabled(kebabMenuContent.row.siteId, kebabMenuContent.company.id, true, kebabMenuContent.row); closeKebabMenu(); }}
                style={{ display: 'block', width: '100%', padding: '10px 12px', textAlign: 'left', border: 'none', background: 'none', fontSize: 12, cursor: 'pointer', color: '#111', borderTop: '1px solid #F3F4F6' }}
              >
                Aktivera site
              </button>
            )}
          </div>,
          document.body
        ) : null}

        <Modal
          visible={moveModalOpen}
          transparent
          onRequestClose={() => setMoveModalOpen(false)}
          animationType="fade"
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setMoveModalOpen(false)}
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 24,
            }}
          >
            <View
              onStartShouldSetResponder={() => true}
              style={{
                backgroundColor: '#fff',
                  borderRadius: 12,
                  padding: 24,
                  minWidth: 360,
                  maxWidth: '100%',
                }}
              >
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 }}>
                  Flytta site till annat företag
                </Text>
                {moveModalRow ? (
                  <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 12 }} numberOfLines={1}>
                    Site: {moveModalRow.displayName || moveModalRow.siteId}
                  </Text>
                ) : null}
                {Platform.OS === 'web' ? (
                  <select
                    value={moveModalTargetCompanyId}
                    onChange={(e) => setMoveModalTargetCompanyId(String(e.target.value || ''))}
                    style={{
                      width: '100%',
                      padding: '10px 12px',
                      borderRadius: 8,
                      border: '1px solid #E5E7EB',
                      fontSize: 14,
                      marginBottom: 16,
                    }}
                  >
                    <option value="">Välj mål-företag</option>
                    {companies
                      .filter((c) => String(c?.id || '').trim() && c.id !== moveModalCompanyId)
                      .map((c) => (
                        <option key={c.id} value={c.id}>
                          {getCompanyLabel(c.id)}
                        </option>
                      ))}
                  </select>
                ) : (
                  <View style={{ marginBottom: 16 }}>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginBottom: 4 }}>Välj mål-företag</Text>
                    <Text style={{ fontSize: 12, color: '#9CA3AF' }}>Flytt stöds i webbläget.</Text>
                  </View>
                )}
                <View style={{ backgroundColor: '#F3F4F6', borderRadius: 8, padding: 12, marginBottom: 20 }}>
                  <Text style={{ fontSize: 12, color: '#6B7280', lineHeight: 18 }}>
                    Flytten ändrar vilken organisation som har tillgång till siten i Digitalkontroll. Själva SharePoint-siten flyttas inte fysiskt.
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setMoveModalOpen(false)}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#D1D5DB',
                      backgroundColor: '#fff',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#374151' }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (!moveModalTargetCompanyId || !moveModalRow) return;
                      moveSiteToCompany(moveModalRow.siteId, moveModalCompanyId, moveModalTargetCompanyId, moveModalRow);
                    }}
                    disabled={!moveModalTargetCompanyId}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 16,
                      borderRadius: 8,
                      backgroundColor: moveModalTargetCompanyId ? '#2563EB' : '#9CA3AF',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Bekräfta flytt</Text>
                  </TouchableOpacity>
                </View>
              </View>
          </TouchableOpacity>
        </Modal>
      </MainLayout>
    </View>
  );
}
