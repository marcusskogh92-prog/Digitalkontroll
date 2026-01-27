


import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Alert, Platform, TouchableOpacity } from 'react-native';
import { checkSharePointConnection, createSharePointFolder, deleteItem, getSharePointHierarchy, loadFolderChildren } from '../services/azure/hierarchyService';
import { extractProjectMetadata, isProjectFolder } from '../utils/isProjectFolder';
import ContextMenu from './ContextMenu';
import UserEditModal from './UserEditModal';
import { adminFetchCompanyMembers, auth, createUserRemote, DEFAULT_CONTROL_TYPES, deleteCompanyControlType, deleteCompanyMall, deleteUserRemote, fetchCompanies, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, provisionCompanyRemote, purgeCompanyRemote, saveUserProfile, setCompanyNameRemote, setCompanyStatusRemote, setCompanyUserLimitRemote, updateCompanyControlType, updateCompanyMall, updateUserRemote, uploadUserAvatar } from './firebase';

const PRIMARY_BLUE = '#1976D2';
const HOVER_BG = 'rgba(25, 118, 210, 0.10)';

const dispatchWindowEvent = (name, detail) => {
  try {
    if (typeof window === 'undefined') return;
    const evt = (typeof CustomEvent === 'function')
      ? new CustomEvent(name, { detail })
      : (() => {
        const e = document.createEvent('Event');
        e.initEvent(name, true, true);
        e.detail = detail;
        return e;
      })();
    window.dispatchEvent(evt);
  } catch (_e) {}
};

const publishHomeBreadcrumbSegments = (segments) => {
  try {
    if (typeof window === 'undefined') return;
    if (!Array.isArray(segments)) return;
    try { window.__dkBreadcrumbHomeSegments = segments; } catch (_e) {}
    dispatchWindowEvent('dkBreadcrumbUpdate', { scope: 'home', segments });
  } catch (_e) {}
};

// Recursive folder component - handles infinite nesting levels from SharePoint
function RecursiveFolderItem({ 
  folder, 
  level = 0, 
  expandedSubs, 
  spinSubs, 
  toggleSub, 
  setFolderContextMenu,
  resolvedCompanyId,
  loadFolderChildren,
  setHierarchy,
  isProject = false,
  onSelectProject = null,
}) {
  const folderSpin = spinSubs[folder.id] || 0;
  const folderAngle = expandedSubs[folder.id] ? (folderSpin * 360 + 90) : (folderSpin * 360);
  const fontSize = Math.max(12, 15 - level); // Slightly smaller font for deeper levels
  const paddingLeft = 16 + (level * 4); // More indentation for deeper levels
  
  // Check if this folder is a project (if not already determined)
  const folderIsProject = isProject || isProjectFolder(folder);
  
  const handleClick = () => {
    if (folderIsProject && onSelectProject) {
      // Project folder: navigate to project view
      const projectMetadata = extractProjectMetadata(folder);
      if (projectMetadata) {
        onSelectProject({
          ...folder,
          // Display identity
          id: projectMetadata.id,
          name: projectMetadata.name,
          number: projectMetadata.number,
          projectNumber: projectMetadata.number,
          projectName: projectMetadata.name,
          fullName: projectMetadata.fullName,
          // SharePoint identity (internal)
          sharePointId: projectMetadata.sharePointId || folder.id || null,
          // Location
          path: projectMetadata.path,
          type: 'project',
        });
      }
    } else {
      // Regular folder: expand/collapse
      toggleSub(folder.id);
    }
  };
  
  return (
    <li>
      <div 
        style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} 
        onClick={handleClick}
        onContextMenu={(e) => {
          if (Platform.OS !== 'web') return;
          try { e.preventDefault(); } catch(_e) {}
          const x = (e && e.clientX) ? e.clientX : 60;
          const y = (e && e.clientY) ? e.clientY : 60;
          setFolderContextMenu({ folder, x, y });
        }}
      >
        {!folderIsProject && (
          <span
            style={{
              color: '#222',
              fontSize: fontSize + 1,
              fontWeight: 500,
              marginRight: 6,
              display: 'inline-block',
              transform: `rotate(${folderAngle}deg)`,
              transition: 'transform 0.4s ease',
            }}
          >
            &gt;
          </span>
        )}
        {folderIsProject && (
          <span
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#43A047',
              marginRight: 8,
              display: 'inline-block',
              border: '1px solid #bbb',
            }}
          />
        )}
        <span style={{ 
          fontWeight: expandedSubs[folder.id] ? 600 : (folderIsProject ? 600 : 400), 
          fontSize: fontSize,
          color: folderIsProject ? '#1976D2' : '#222',
        }}>{folder.name}</span>
      </div>
      {!folderIsProject && expandedSubs[folder.id] && (
        <ul style={{ listStyle: 'none', paddingLeft: paddingLeft, marginTop: 2 }}>
          {folder.loading ? (
            <li style={{ color: '#888', fontSize: fontSize - 1, paddingLeft: 8, fontStyle: 'italic' }}>
              Laddar undermappar från SharePoint...
            </li>
          ) : folder.error ? (
            <li style={{ color: '#D32F2F', fontSize: fontSize - 1, paddingLeft: 8 }}>
              Fel: {folder.error}
            </li>
          ) : folder.children && folder.children.length > 0 ? (
            // Recursively render children - infinite depth, fully driven by SharePoint structure
            folder.children.map(childFolder => {
              const childIsProject = isProjectFolder(childFolder);
              return (
                <RecursiveFolderItem
                  key={childFolder.id}
                  folder={childFolder}
                  level={level + 1}
                  expandedSubs={expandedSubs}
                  spinSubs={spinSubs}
                  toggleSub={toggleSub}
                  setFolderContextMenu={setFolderContextMenu}
                  resolvedCompanyId={resolvedCompanyId}
                  loadFolderChildren={loadFolderChildren}
                  setHierarchy={setHierarchy}
                  isProject={childIsProject}
                  onSelectProject={onSelectProject}
                />
              );
            })
          ) : (
            <li style={{ color: '#D32F2F', fontSize: fontSize - 1, paddingLeft: 8, fontStyle: 'italic' }}>
              Mappen är tom
            </li>
          )}
        </ul>
      )}
    </li>
  );
}

function ProjectSidebar({ onSelectProject, onSelectFunction, title = 'Projektlista', searchPlaceholder = 'Sök projektnamn eller nr...', companiesMode = false, showMembers = false, restrictCompanyId = null, hideCompanyActions = false, autoExpandMembers = false, memberSearchMode = false, allowCompanyManagementActions = true, iconName = null, iconColor = null, controlTypesMode = false, selectedCompanyId = null, selectedPhase: selectedPhaseProp, onPhaseChange, onAddMainFolder }) {
  // Legacy: "Mallar"-sidan är borttagen och vi vill inte att sidomenyn kan hamna i templates-läge.
  // Låt flaggan vara hårt avstängd även om någon råkar skicka props från äldre kod.
  const templatesMode = false;
  const templatesVersion = 0;

  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [hierarchy, setHierarchy] = useState([]);
  const [sharePointStatus, setSharePointStatus] = useState({
    connected: false,
    checking: false,
    error: null,
    siteId: null,
  });
  // Phase is now just a SharePoint folder - no internal phase logic needed
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [membersByCompany, setMembersByCompany] = useState({});
  const [hoveredCompany, setHoveredCompany] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);
  const [hoveredControlTypeKey, setHoveredControlTypeKey] = useState(null);
  const [hoveredTemplateItemKey, setHoveredTemplateItemKey] = useState(null);
  const [userContextMenu, setUserContextMenu] = useState(null); // { companyId, member, x, y }
  const [expandedMemberRoles, setExpandedMemberRoles] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [editingUserError, setEditingUserError] = useState('');
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuCompany, setContextMenuCompany] = useState(null);
  const [memberFetchErrors, setMemberFetchErrors] = useState({});
  const [effectiveGlobalAdmin, setEffectiveGlobalAdmin] = useState(false);
  const [isSuperadminViewer, setIsSuperadminViewer] = useState(false);
  const [showDeletedCompanies, setShowDeletedCompanies] = useState(false);
  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);
  const [membersPrefetchNonce, setMembersPrefetchNonce] = useState(0);
  const [spinTemplateTypes, setSpinTemplateTypes] = useState({});
  const [spinGroups, setSpinGroups] = useState({});
  const [spinSubs, setSpinSubs] = useState({});
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCompanyName, setAddCompanyName] = useState('');
  const [addCompanyId, setAddCompanyId] = useState('');
  const [addCompanySaving, setAddCompanySaving] = useState(false);
  const [addCompanyError, setAddCompanyError] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '' });
  const [selectedTemplateKey, setSelectedTemplateKey] = useState(null);
  const [hoveredTemplateKey, setHoveredTemplateKey] = useState(null);
  const [expandedTemplateTypes, setExpandedTemplateTypes] = useState({});
  const [controlTypesByCompany, setControlTypesByCompany] = useState({});
  const [templatesByCompany, setTemplatesByCompany] = useState({});
  const [templateFetchErrors, setTemplateFetchErrors] = useState({});
  const [controlTypeContextMenu, setControlTypeContextMenu] = useState(null); // { companyId, profile, controlTypeId, controlTypeKey, controlTypeName, builtin, hidden, x, y }
  const [templateContextMenu, setTemplateContextMenu] = useState(null); // { companyId, profile, controlType, template, x, y }
  const [folderContextMenu, setFolderContextMenu] = useState(null); // { folder, x, y } - for SharePoint folder context menu

  // Breadcrumb state for web: track last selected project path in the sidebar
  const [selectedProjectBreadcrumb] = useState(null); // { group, sub, project }
  const lastExpandedGroupIdRef = useRef(null);
  const lastExpandedSubIdRef = useRef(null);

  const templateFetchErrorCount = Object.keys(templateFetchErrors || {}).length;
  const lastMembersPrefetchNonceRef = useRef(0);
  const toastTimeoutRef = useRef(null);

  const showToast = (msg, timeout = 3000) => {
    try {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      setToast({ visible: true, message: msg });
      toastTimeoutRef.current = setTimeout(() => {
        setToast({ visible: false, message: '' });
        toastTimeoutRef.current = null;
      }, timeout);
    } catch (_e) {}
  };

  const showToastSticky = (msg) => {
    try {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      setToast({ visible: true, message: msg });
    } catch (_e) {}
  };

  const hideToast = () => {
    try {
      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
        toastTimeoutRef.current = null;
      }
      setToast({ visible: false, message: '' });
    } catch (_e) {}
  };

  function slugify(s) {
    try {
      return String(s || '')
        .normalize('NFKD')
        .replace(/\p{Diacritic}/gu, '')
        .replace(/[^a-zA-Z0-9\s-]/g, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '-');
    } catch (_e) {
      return String(s || '').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
    }
  }

  const isAdmin = (m) => {
    if (!m) return false;
    return !!(
      m.isAdmin ||
      m.admin ||
      m.role === 'admin' ||
      m.role === 'superadmin' ||
      (m.customClaims && m.customClaims.admin) ||
      (m.claims && m.claims.admin) ||
      (m.access === 'admin')
    );
  };

  const isMemberDisabled = (m) => {
    try {
      if (!m) return false;
      if (typeof m.disabled === 'boolean') return m.disabled;
      if (typeof m.enabled === 'boolean') return !m.enabled;
      if (typeof m.active === 'boolean') return !m.active;
      return false;
    } catch (_e) {
      return false;
    }
  };

  const getMemberDisplayName = (m) => {
    return m?.displayName || `${m?.firstName || ''} ${m?.lastName || ''}`.trim() || m?.email || m?.uid || m?.id || '';
  };

  const isCompanyEnabled = (company) => {
    try {
      const profile = company && company.profile ? company.profile : {};
      if (profile.deleted) return false;
      if (typeof profile.enabled === 'boolean') return profile.enabled;
      if (typeof profile.active === 'boolean') return profile.active;
      // Default: företag utan explicit flagga räknas som aktiva
      return true;
    } catch (_e) {
      return true;
    }
  };

  const visibleCompanies = (Array.isArray(companies) ? companies : []).filter((c) => {
    try {
      const deleted = !!(c && c.profile && c.profile.deleted);
      if (!showDeletedCompanies && deleted) return false;
      return true;
    } catch (_e) {
      return true;
    }
  });

  // Ange ditt företags-ID här (eller hämta dynamiskt från inloggning)
  // Prefer explicit restriction, then persisted dk_companyId, then auth claims.
  const [resolvedCompanyId, setResolvedCompanyId] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let cid = String(restrictCompanyId || '').trim();

      if (!cid) {
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            cid = String(window.localStorage.getItem('dk_companyId') || '').trim();
          }
        } catch (_e) {}
      }

      if (!cid) {
        try {
          const user = auth?.currentUser;
          const tokenRes = user?.getIdTokenResult ? await user.getIdTokenResult(false).catch(() => null) : null;
          cid = String(tokenRes?.claims?.companyId || '').trim();
        } catch (_e) {}
      }

      if (!cid) {
        try {
          const emailLower = String(auth?.currentUser?.email || '').trim().toLowerCase();
          const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';
          if (isEmailSuperadmin) cid = 'MS Byggsystem';
        } catch (_e) {}
      }

      // Dev convenience only.
      if (!cid && __DEV__) cid = 'testdemo';

      if (cancelled) return;
      setResolvedCompanyId(cid);
    })();

    return () => { cancelled = true; };
  }, [restrictCompanyId]);

  useEffect(() => {
    setLoading(true);
    if (companiesMode) {
      fetchCompanies().then(async (items) => {
        if (items && items.length > 0) {
          const filtered = restrictCompanyId ? items.filter(c => c && c.id === restrictCompanyId) : items;
          setCompanies(filtered);
          setLoading(false);
          return;
        }
        // Fallback: try a small set of expected company ids/names (helps when rules block listing)
        const fallbackIds = ['MS Byggsystem', 'MS Byggsystem DEMO', 'Wilzéns Bygg'];
        const fetched = await Promise.all(fallbackIds.map(async id => {
          try {
            const prof = await fetchCompanyProfile(id);
            return { id, profile: prof };
          } catch (_e) { return null; }
        }));
        let good = (fetched || []).filter(x => x && (x.profile || x.id));
        if (restrictCompanyId) {
          good = good.filter(c => c && c.id === restrictCompanyId);
        }
        if (good.length > 0) setCompanies(good);
        else setCompanies([]);
        setLoading(false);
      }).catch(async () => {
        // Try fallback on error as well
        const fallbackIds = ['MS Byggsystem', 'MS Byggsystem DEMO', 'Wilzéns Bygg'];
        const fetched = await Promise.all(fallbackIds.map(async id => {
          try { const prof = await fetchCompanyProfile(id); return { id, profile: prof }; } catch(_e) { return null; }
        }));
        let good = (fetched || []).filter(x => x && (x.profile || x.id));
        if (restrictCompanyId) {
          good = good.filter(c => c && c.id === restrictCompanyId);
        }
        setCompanies(good);
        setLoading(false);
      });
      return;
    }
    if (!resolvedCompanyId) {
      setHierarchy([]);
      setLoading(false);
      return;
    }
    
    // Check SharePoint connection and fetch folders
    (async () => {
      try {
        // First check SharePoint connection status
        setSharePointStatus({ connected: false, checking: true, error: null, siteId: null });
        const connectionStatus = await checkSharePointConnection(resolvedCompanyId);
        setSharePointStatus({
          connected: connectionStatus.connected,
          checking: false,
          error: connectionStatus.error,
          siteId: connectionStatus.siteId
        });

        if (connectionStatus.connected) {
          // Get ALL root folders (all phases) from SharePoint - no filtering
          const sharePointFolders = await getSharePointHierarchy(resolvedCompanyId, null);
          
          // Use SharePoint folders directly - no adapter needed
          // Each folder represents a phase (Kalkylskede, Produktion, etc.)
          setHierarchy(sharePointFolders || []);
        } else {
          // No connection - show empty
          setHierarchy([]);
        }
      } catch (error) {
        console.error('[ProjectSidebar] Error fetching SharePoint hierarchy:', error);
        setSharePointStatus({
          connected: false,
          checking: false,
          error: error?.message || 'Unknown error',
          siteId: null
        });
        setHierarchy([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [companiesMode, restrictCompanyId, resolvedCompanyId]);

  // Web: react to company profile updates from ManageCompany (e.g. userLimit changes)
  useEffect(() => {
    if (!companiesMode) return;
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const handler = (event) => {
      try {
        const cid = event?.detail?.companyId;
        const profilePatch = event?.detail?.profile || {};
        if (!cid) return;

        // Fetch latest profile from Firestore so sidebar always reflects
        // the persisted value (in case anything changed server-side).
        (async () => {
          let latestProfile = null;
          try {
            latestProfile = await fetchCompanyProfile(cid).catch(() => null);
          } catch (_err) {
            latestProfile = null;
          }
          const mergedPatch = latestProfile ? { ...(latestProfile || {}), ...profilePatch } : profilePatch;

          setCompanies((prev) => {
            if (!Array.isArray(prev) || prev.length === 0) return prev;
            let changed = false;
            const next = prev.map((c) => {
              if (c.id !== cid) return c;
              changed = true;
              return { ...c, profile: { ...(c.profile || {}), ...mergedPatch } };
            });
            return changed ? next : prev;
          });
        })();
      } catch (_e) {}
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('dkCompanyProfileUpdated', handler);
    }
    return () => {
      try { if (typeof window !== 'undefined') window.removeEventListener('dkCompanyProfileUpdated', handler); } catch (_e) {}
    };
  }, [companiesMode]);

  // When used for user management with a restricted company, optionally auto-expand
  // that company and show its Admin/Användare lists directly.
  useEffect(() => {
    if (!companiesMode) return;
    if (!autoExpandMembers) return;
    if (!restrictCompanyId) return;
    if (!Array.isArray(companies) || companies.length === 0) return;

    const cid = restrictCompanyId;
    const hasCompany = companies.some(c => c && c.id === cid);
    if (!hasCompany) return;

    setExpandedCompanies(prev => {
      if (prev && prev[cid]) return prev;
      return { [cid]: true };
    });

    setExpandedMemberRoles(prev => ({
      ...prev,
      [cid]: { ...(prev[cid] || {}), admin: true, users: true },
    }));

    if (!showMembers) return;
    if (membersByCompany && membersByCompany[cid]) return;

    (async () => {
      let loaded = false;
      try {
        const r = await adminFetchCompanyMembers(cid);
        const mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
        if (Array.isArray(mems)) {
          setMembersByCompany(prev => ({ ...prev, [cid]: mems }));
          loaded = true;
        }
      } catch (e) {
        try {
          const raw = String(e && e.message ? e.message : (e || ''));
          if (raw && raw.trim().toLowerCase() !== 'internal') {
            setMemberFetchErrors(prev => ({ ...prev, [cid]: raw }));
          }
        } catch (_) {}
      }
      if (!loaded) {
        try {
          const members = await fetchCompanyMembers(cid).catch(() => []);
          setMembersByCompany(prev => ({ ...prev, [cid]: members }));
        } catch (_e) {
          setMembersByCompany(prev => ({ ...prev, [cid]: [] }));
        }
      }
    })();
  }, [companiesMode, autoExpandMembers, restrictCompanyId, companies, showMembers, membersByCompany]);

  // Auto-expand selected company in controlTypesMode
  useEffect(() => {
    if (!controlTypesMode) return;
    if (!companiesMode) return;
    if (!selectedCompanyId) return;
    if (!Array.isArray(companies) || companies.length === 0) return;

    const cid = String(selectedCompanyId || '').trim();
    if (!cid) return;

    const hasCompany = companies.some(c => c && c.id === cid);
    if (!hasCompany) return;

    setExpandedCompanies(prev => {
      if (prev && prev[cid]) return prev;
      return { [cid]: true };
    });
  }, [controlTypesMode, companiesMode, selectedCompanyId, companies]);

  // If the current user är "global" admin (superadmin eller MS Byggsystem-admin),
  // prefetcha medlemmar för alla företag så vi kan visa användarantal i listan.
  // Vanliga företags-admins (t.ex. Wilzéns) räknas inte som global admin här.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companiesMode || !Array.isArray(companies) || companies.length === 0) return;
      try {
        const user = auth && auth.currentUser;
        if (!user || !user.getIdTokenResult) return;
        const token = await user.getIdTokenResult(false).catch(() => null);
        const claims = token && token.claims ? token.claims : {};
        const companyFromClaims = String(claims.companyId || '').trim();
        const isMsAdminClaim = !!((claims.admin === true || claims.role === 'admin') && companyFromClaims === 'MS Byggsystem');
        const isSuperClaim = !!(claims.superadmin === true || claims.role === 'superadmin');
        const userEmail = (user && user.email) ? String(user.email).toLowerCase() : '';
        // Allowlist override: allow specific known superadmin emails to see all members
        const isEmailSuperadmin = userEmail === 'marcus@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.com' || userEmail === 'marcus.skogh@msbyggsystem';
        const effectiveGlobalAdmin = isSuperClaim || isMsAdminClaim || isEmailSuperadmin;
        try { setEffectiveGlobalAdmin(!!effectiveGlobalAdmin); } catch (_) {}
        try { setIsSuperadminViewer(!!(isSuperClaim || isEmailSuperadmin)); } catch (_) {}
        if (!effectiveGlobalAdmin) return;

        // Endast i Hantera användare (memberSearchMode) behöver vi hämta medlemmar
        // för att visa användarräknare per företag.
        if (!memberSearchMode) return;

        const forceThisRun = membersPrefetchNonce !== lastMembersPrefetchNonceRef.current;
        if (forceThisRun) lastMembersPrefetchNonceRef.current = membersPrefetchNonce;

        const targets = forceThisRun
          ? companies
          : companies.filter(c => !membersByCompany || !Object.prototype.hasOwnProperty.call(membersByCompany, c.id));

        if (!targets || targets.length === 0) return;

        const clearCompanyError = (companyId) => {
          try {
            setMemberFetchErrors(prev => {
              if (!prev || !prev[companyId]) return prev;
              const next = { ...prev };
              delete next[companyId];
              return next;
            });
          } catch (_e) {}
        };

        const fetchForCompany = async (c) => {
          try {
            // Try admin callable first for global admins
            if (typeof adminFetchCompanyMembers === 'function') {
              try {
                const r = await adminFetchCompanyMembers(c.id).catch(err => { throw err; });
                const mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                clearCompanyError(c.id);
                return { id: c.id, members: Array.isArray(mems) ? mems : [] };
              } catch (e) {
                // record non-generic errors for debugging and fall back to client fetch
                try {
                  const raw = String(e && e.message ? e.message : (e || ''));
                  if (raw && raw.trim().toLowerCase() !== 'internal') {
                    setMemberFetchErrors(prev => ({ ...prev, [c.id]: raw }));
                  }
                } catch (_) {}
              }
            }
            try {
              const mems = await fetchCompanyMembers(c.id).catch(err => { throw err; });
              clearCompanyError(c.id);
              return { id: c.id, members: Array.isArray(mems) ? mems : [] };
            } catch (e) {
              setMemberFetchErrors(prev => ({ ...prev, [c.id]: String(e?.message || e) }));
              return { id: c.id, members: [] };
            }
          } catch (e) {
            setMemberFetchErrors(prev => ({ ...prev, [c.id]: String(e?.message || e) }));
            return { id: c.id, members: [] };
          }
        };

        // Concurrency-limit för att undvika bursts som ger deadline-exceeded.
        const concurrency = 2;
        let index = 0;
        const results = new Array(targets.length);
        const worker = async () => {
          while (true) {
            const i = index;
            index += 1;
            if (i >= targets.length) return;
            const c = targets[i];
            results[i] = await fetchForCompany(c);
          }
        };

        await Promise.all(new Array(concurrency).fill(0).map(() => worker()));
        if (cancelled) return;
        const map = {};
        results.forEach(r => { if (r && r.id) map[r.id] = r.members; });
        setMembersByCompany(prev => ({ ...prev, ...map }));
      } catch(_e) {}
    })();
    return () => { cancelled = true; };
  }, [companiesMode, companies, memberSearchMode, membersByCompany, membersPrefetchNonce]);

  // When used in Mallar-läge (templatesMode), hämta mallar per företag för att
  // kunna visa räknare både på företagsnivå och per kontrolltyp.
  useEffect(() => {
    if (!companiesMode || !templatesMode) return;
    if (!Array.isArray(companies) || companies.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        // Hämta mallar per företag
        const results = await Promise.all(
          companies.map(async (c) => {
            try {
              const items = await fetchCompanyMallar(c.id);
              const list = Array.isArray(items) ? items : [];
              const perType = {};
              list.forEach((tpl) => {
                const ct = String(tpl?.controlType || '').trim();
                if (!ct) return;
                perType[ct] = (perType[ct] || 0) + 1;
              });
              return { id: c.id, total: list.length, perType, items: list };
            } catch (e) {
              return { id: c.id, total: 0, perType: {}, items: [], error: String(e?.message || e) };
            }
          })
        );
        if (cancelled) return;
        const nextMap = {};
        const nextErr = {};
        results.forEach((r) => {
          nextMap[r.id] = { total: r.total, perType: r.perType, items: Array.isArray(r.items) ? r.items : [] };
          if (r.error) nextErr[r.id] = r.error;
        });
        setTemplatesByCompany((prev) => ({ ...prev, ...nextMap }));
        if (Object.keys(nextErr).length > 0) {
          setTemplateFetchErrors((prev) => ({ ...prev, ...nextErr }));
        }
      } catch (_e) {}
    })();

    return () => {
      cancelled = true;
    };
  }, [companiesMode, templatesMode, companies, templatesVersion]);

  // När vi är i Mallar-läge eller Kontrolltyper-läge, hämta kontrolltyper per företag så
  // vänstersidans lista kan visa både standard- och företags-specifika typer.
  useEffect(() => {
    if (!companiesMode || (!templatesMode && !controlTypesMode)) return;
    if (!Array.isArray(companies) || companies.length === 0) return;

    let cancelled = false;
    (async () => {
      try {
        const results = await Promise.all(
          companies.map(async (c) => {
            try {
              const list = await fetchCompanyControlTypes(c.id).catch(() => DEFAULT_CONTROL_TYPES);
              return { id: c.id, types: Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES };
            } catch (_e) {
              return { id: c.id, types: DEFAULT_CONTROL_TYPES };
            }
          })
        );
        if (cancelled) return;
        const next = {};
        results.forEach((r) => { next[r.id] = r.types; });
        setControlTypesByCompany(next);
      } catch (_e) {}
    })();

    return () => { cancelled = true; };
  }, [companiesMode, templatesMode, controlTypesMode, companies]);

  // Filtrera projekt baserat på söksträng (namn eller "nummer")
  const getProjectNumberText = (project) => {
    try {
      const id = String(project?.id || '').trim();
      if (id) return id;
      const name = String(project?.name || '').trim();
      if (!name) return '';
      // If name contains the common "ID — Name" pattern, use the left part.
      const parts = name.split('—');
      return String(parts[0] || '').trim();
    } catch (_e) {
      return '';
    }
  };

  // Sort direction: -1 = descending, 1 = ascending
  // Requested UX: "Alla nummer med 1 kommer först" and e.g.
  // 1001-100, 1011-200, 6510-2200, 825-10
  // => compare the prefix (before '-') lexicographically, then compare suffix parts numerically.
  const PROJECT_NUMBER_SORT_DIRECTION = 1;

  const splitProjectNumber = (s) => {
    try {
      return String(s || '').trim().split('-').map((x) => String(x || '').trim());
    } catch (_e) {
      return [String(s || '').trim()];
    }
  };

  const isDigitsOnly = (s) => /^[0-9]+$/.test(String(s || '').trim());

  const compareText = (a, b) => {
    return String(a || '').localeCompare(String(b || ''), 'sv', { sensitivity: 'base' });
  };

  const compareNumericish = (a, b) => {
    const aa = String(a || '').trim();
    const bb = String(b || '').trim();
    const aIsNum = isDigitsOnly(aa);
    const bIsNum = isDigitsOnly(bb);
    if (aIsNum && bIsNum) {
      const an = parseInt(aa, 10);
      const bn = parseInt(bb, 10);
      if (an !== bn) return an - bn;
      // Same numeric value: shorter (less zero-padded) first.
      if (aa.length !== bb.length) return aa.length - bb.length;
      return 0;
    }
    // If one is numeric and the other isn't, keep numeric first.
    if (aIsNum !== bIsNum) return aIsNum ? -1 : 1;
    return compareText(aa, bb);
  };

  const compareProjectsByNumber = (a, b) => {
    const aKey = getProjectNumberText(a);
    const bKey = getProjectNumberText(b);
    const aParts = splitProjectNumber(aKey);
    const bParts = splitProjectNumber(bKey);

    // 1) Prefix before '-' compared as text (lexicographic)
    const prefixCmp = compareText(aParts[0] || '', bParts[0] || '');
    if (prefixCmp !== 0) return PROJECT_NUMBER_SORT_DIRECTION * prefixCmp;

    // 2) Remaining parts compared numerically (natural within same prefix)
    const maxLen = Math.max(aParts.length, bParts.length);
    for (let i = 1; i < maxLen; i += 1) {
      const partCmp = compareNumericish(aParts[i] || '', bParts[i] || '');
      if (partCmp !== 0) return PROJECT_NUMBER_SORT_DIRECTION * partCmp;
    }

    // 3) Stable fallback
    return PROJECT_NUMBER_SORT_DIRECTION * compareText(aKey, bKey);
  };

  // Filter tree while preserving object references so state updates work correctly
  const filterTree = (tree) => {
    if (!search.trim()) {
      // No search - return tree as-is to preserve references
      return tree;
    }
    return tree
      .map(group => {
        // Filter by search for main folder name
        const groupMatchesSearch = group.name.toLowerCase().includes(search.toLowerCase());
        
        const filteredSubs = (group.children || []).map(sub => {
          // Filter by search for sub folder name
          const subMatchesSearch = sub.name.toLowerCase().includes(search.toLowerCase());
          
          const filteredProjects = (sub.children || []).filter(project => {
            // Filter by search
            const matchesSearch = project.name.toLowerCase().includes(search.toLowerCase()) ||
              String(project.id).toLowerCase().includes(search.toLowerCase());
            
            return matchesSearch;
          }).slice().sort(compareProjectsByNumber);
          
          // Preserve sub object reference if no filtering needed, otherwise create new
          if (subMatchesSearch && filteredProjects.length === (sub.children || []).length) {
            return sub; // No filtering needed - preserve reference
          }
          return { ...sub, children: filteredProjects };
        }).filter(sub => {
          // Keep sub folder if it has matching projects OR if sub folder name matches search
          return sub.children.length > 0 || sub.name.toLowerCase().includes(search.toLowerCase());
        });
        
        // Preserve group object reference if no filtering needed
        if (groupMatchesSearch && filteredSubs.length === (group.children || []).length) {
          return group; // No filtering needed - preserve reference
        }
        return { ...group, children: filteredSubs };
      })
      .filter(group => {
        // Keep main folder if it has matching sub folders OR if main folder name matches search
        return group.children.length > 0 || group.name.toLowerCase().includes(search.toLowerCase());
      });
  };

  // SharePoint hierarchy is already filtered by phase when fetched
  // No need to filter projects by phase metadata - SharePoint folders represent phases
  // The hierarchy structure from SharePoint is: Phase Folder -> Subfolders -> Files/Projects
  let phaseHierarchy = hierarchy;
  
  // Note: With SharePoint-first approach, phase filtering happens at fetch time
  // The hierarchy already contains only the selected phase folder and its contents
  // If we need to show all phases, we would fetch without phaseKey filter
  
  const filteredGroups = filterTree(phaseHierarchy);

  // Lazy load folder children when expanded
  const toggleGroup = async (id) => {
    const folder = hierarchy.find(f => f.id === id);
    if (!folder) return;
    
    const nextOpen = !expandedGroups[id];
    
    // If expanding and folder has no children or children not loaded, load them
    if (nextOpen && (!folder.children || folder.children.length === 0) && resolvedCompanyId) {
      try {
        // Use folder.path if available, otherwise construct from folder.name
        // Ensure path is not empty or just slashes
        let folderPath = folder.path || folder.name || '';
        
        // Normalize path: remove leading/trailing slashes, normalize separators
        if (folderPath && typeof folderPath === 'string') {
          folderPath = folderPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
          folderPath = folderPath.replace(/\/+$/, '');
        } else {
          folderPath = '';
        }
        
        // Validate path - if empty or invalid, log warning but still try with folder name
        if (!folderPath || folderPath.length === 0 || folderPath === '/') {
          console.warn('[ProjectSidebar] toggleGroup - Invalid folder path after normalization, using folder name:', folder.name);
          folderPath = folder.name || '';
        }
        
        console.log('[ProjectSidebar] toggleGroup - Loading children for folder:', folder.name, 'normalized path:', folderPath, 'current children:', folder.children?.length || 0, 'original path:', folder.path);
        
        // Set loading state
        setHierarchy(prev => prev.map(f => 
          f.id === id ? { ...f, children: [], loading: true, error: null } : f
        ));
        
        const children = await loadFolderChildren(resolvedCompanyId, folderPath);
        console.log('[ProjectSidebar] toggleGroup - Loaded', children.length, 'children for', folder.name, 'children:', children.map(c => c.name));
        
        // Update with loaded children - make sure to preserve other folder properties
        setHierarchy(prev => prev.map(f => {
          if (f.id === id) {
            return { 
              ...f, 
              children, 
              path: folderPath, 
              loading: false, 
              error: null,
              expanded: true 
            };
          }
          return f;
        }));
      } catch (error) {
        console.error('[ProjectSidebar] Error loading folder children:', error);
        // Set error state
        setHierarchy(prev => prev.map(f => 
          f.id === id ? { ...f, children: [], loading: false, error: error.message } : f
        ));
      }
    }
    
    // Update expanded state AFTER loading children (if needed)
    setExpandedGroups(prev => {
      const next = { ...prev, [id]: nextOpen };
      if (nextOpen) lastExpandedGroupIdRef.current = id;
      else if (lastExpandedGroupIdRef.current === id) lastExpandedGroupIdRef.current = null;
      return next;
    });
    setSpinGroups(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  // Lazy load subfolder children when expanded
  const toggleSub = async (id) => {
    // Find subfolder in hierarchy (recursively search all levels)
    const findFolder = (folders, targetId) => {
      for (const folder of folders) {
        if (folder.id === targetId) return folder;
        if (folder.children) {
          const found = findFolder(folder.children, targetId);
          if (found) return found;
        }
      }
      return null;
    };
    
    const folder = findFolder(hierarchy, id);
    if (!folder) return;
    
    const nextOpen = !expandedSubs[id];
    
    // If expanding and folder has no children or children not loaded, load them
    if (nextOpen && (!folder.children || folder.children.length === 0) && resolvedCompanyId) {
      try {
        // Use folder.path if available, otherwise construct from folder.name
        // For nested folders, we need the full path from root
        let folderPath = folder.path;
        if (!folderPath || (typeof folderPath === 'string' && folderPath.trim().length === 0)) {
          // If no path, try to construct it by finding parent path
          // This is critical for nested folders where path might not be set initially
          const findParentPath = (folders, targetId, currentPath = '') => {
            for (const f of folders) {
              // Use f.path if available (more reliable), otherwise construct from currentPath
              let fPath = f.path;
              if (!fPath || (typeof fPath === 'string' && fPath.trim().length === 0)) {
                // No path on folder, construct from currentPath
                fPath = currentPath ? `${currentPath}/${f.name}` : f.name;
              }
              
              if (f.id === targetId) {
                return fPath;
              }
              
              if (f.children && Array.isArray(f.children) && f.children.length > 0) {
                const found = findParentPath(f.children, targetId, fPath);
                if (found) return found;
              }
            }
            return null;
          };
          const constructedPath = findParentPath(hierarchy, id);
          folderPath = constructedPath || folder.name;
          console.log('[ProjectSidebar] toggleSub - No path found on folder, constructed:', folderPath, 'from folder name:', folder.name, 'folder.id:', id);
        }
        
        // Normalize path: remove leading/trailing slashes, normalize separators
        if (folderPath && typeof folderPath === 'string') {
          folderPath = folderPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
          folderPath = folderPath.replace(/\/+$/, '');
        } else {
          folderPath = '';
        }
        
        // CRITICAL VALIDATION: Ensure path is never empty or invalid before calling loadFolderChildren
        // Empty paths will cause ::/children errors in Graph API
        if (!folderPath || folderPath.length === 0 || folderPath === '/' || (typeof folderPath === 'string' && folderPath.trim().length === 0)) {
          console.error('[ProjectSidebar] toggleSub - CRITICAL: Invalid folder path after normalization!', {
            folderName: folder.name,
            folderId: id,
            originalPath: folder.path,
            normalizedPath: folderPath,
            folderType: typeof folderPath
          });
          
          // Try to use folder name as fallback, but validate it too
          if (folder.name && typeof folder.name === 'string' && folder.name.trim().length > 0) {
            folderPath = folder.name.trim();
            console.warn('[ProjectSidebar] toggleSub - Using folder name as fallback path:', folderPath);
          } else {
            console.error('[ProjectSidebar] toggleSub - Cannot construct valid path, skipping loadFolderChildren');
            // Don't call loadFolderChildren with invalid path - it will cause 400 error
            setExpandedSubs(prev => ({ ...prev, [id]: false }));
            setHierarchy(prev => {
              const updateFolder = (folders) => folders.map(f => {
                if (f.id === id) {
                  return { ...f, loading: false, error: 'Invalid folder path - cannot load children' };
                }
                if (f.children) {
                  return { ...f, children: updateFolder(f.children) };
                }
                return f;
              });
              return updateFolder(prev);
            });
            return;
          }
        }
        
        console.log('[ProjectSidebar] toggleSub - Loading children', {
          folderName: folder.name,
          folderId: id,
          normalizedPath: folderPath,
          pathType: typeof folderPath,
          pathLength: folderPath.length,
          currentChildren: folder.children?.length || 0,
          originalPath: folder.path
        });
        
        // Set loading state (recursively update hierarchy)
        setHierarchy(prev => {
          const updateFolder = (folders) => folders.map(f => {
            if (f.id === id) {
              return { ...f, children: [], loading: true, error: null };
            }
            if (f.children) {
              return { ...f, children: updateFolder(f.children) };
            }
            return f;
          });
          return updateFolder(prev);
        });
        
        const children = await loadFolderChildren(resolvedCompanyId, folderPath);
        console.log('[ProjectSidebar] toggleSub - Loaded', children.length, 'children for subfolder:', folder.name, 'children:', children.map(c => c.name));
        
        // Update with loaded children (recursively update hierarchy)
        // CRITICAL: Ensure all loaded children have their paths preserved
        // This is essential for recursive rendering to work correctly at all levels
        setHierarchy(prev => {
          const updateFolder = (folders) => folders.map(f => {
            if (f.id === id) {
              // Ensure children have paths - they should already have paths from loadFolderChildren
              // but double-check to prevent issues with deeper nesting
              const childrenWithPaths = children.map(child => {
                // Validate and ensure child has a valid path
                let childPath = child.path;
                if (!childPath || (typeof childPath === 'string' && childPath.trim().length === 0)) {
                  // Child missing path, construct it from parent path
                  // This is critical for recursive rendering to work at all levels
                  if (folderPath && folderPath.length > 0 && folderPath !== '/') {
                    childPath = `${folderPath}/${child.name}`;
                  } else {
                    childPath = child.name;
                  }
                  console.warn('[ProjectSidebar] toggleSub - Child missing path, constructed:', childPath, 'for child:', child.name, 'parent path:', folderPath);
                }
                
                // Normalize child path to ensure consistency
                if (childPath && typeof childPath === 'string') {
                  childPath = childPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
                  childPath = childPath.replace(/\/+$/, '');
                }
                
                // Final validation - path should never be empty
                if (!childPath || childPath.length === 0) {
                  console.error('[ProjectSidebar] toggleSub - CRITICAL: Cannot construct valid path for child:', child.name, 'parent path:', folderPath);
                  childPath = child.name || '';
                }
                
                return { 
                  ...child, 
                  path: childPath 
                };
              });
              
              return { 
                ...f, 
                children: childrenWithPaths, 
                path: folderPath, 
                loading: false, 
                error: null,
                expanded: true 
              };
            }
            if (f.children) {
              return { ...f, children: updateFolder(f.children) };
            }
            return f;
          });
          return updateFolder(prev);
        });
      } catch (error) {
        console.error('[ProjectSidebar] toggleSub - Error loading subfolder children:', error);
        // Set error state (recursively update hierarchy)
        setHierarchy(prev => {
          const updateFolder = (folders) => folders.map(f => {
            if (f.id === id) {
              return { ...f, children: [], loading: false, error: error.message };
            }
            if (f.children) {
              return { ...f, children: updateFolder(f.children) };
            }
            return f;
          });
          return updateFolder(prev);
        });
      }
    }
    
    setExpandedSubs(prev => {
      const next = { ...prev, [id]: nextOpen };
      if (nextOpen) lastExpandedSubIdRef.current = id;
      else if (lastExpandedSubIdRef.current === id) lastExpandedSubIdRef.current = null;
      return next;
    });
    setSpinSubs(prev => ({ ...prev, [id]: (prev[id] || 0) + 1 }));
  };

  // Web: publish breadcrumb based on sidebar expansion/selection so it updates even outside HomeScreen.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (companiesMode) return;
    if (templatesMode || controlTypesMode) return;

    const resolveLabel = (node, fallback) => {
      try {
        const text = String(node?.name || node?.title || node?.label || '').trim();
        if (text) return text;
        const idText = String(node?.id || '').trim();
        return idText || fallback;
      } catch (_e) {
        return fallback;
      }
    };

    const formatProjectLabel = (p) => {
      try {
        const pid = String(p?.id || '').trim();
        const pname = String(p?.name || '').trim();
        const combined = `${pid}${pid && pname ? ' — ' : ''}${pname}`.trim();
        return combined.replace(/^—\s*/, '') || 'Projekt';
      } catch (_e) {
        return 'Projekt';
      }
    };

    const getActiveGroup = () => {
      try {
        const preferredId = lastExpandedGroupIdRef.current;
        if (preferredId && expandedGroups?.[preferredId]) {
          return (filteredGroups || hierarchy || []).find((g) => g && String(g.id) === String(preferredId)) || null;
        }
        const openId = Object.keys(expandedGroups || {}).find((k) => expandedGroups?.[k]);
        if (!openId) return null;
        return (filteredGroups || hierarchy || []).find((g) => g && String(g.id) === String(openId)) || null;
      } catch (_e) {
        return null;
      }
    };

    const getActiveSub = (group) => {
      try {
        const subs = Array.isArray(group?.children) ? group.children : [];
        const preferredId = lastExpandedSubIdRef.current;
        if (preferredId && expandedSubs?.[preferredId]) {
          const hit = subs.find((s) => s && String(s.id) === String(preferredId));
          if (hit) return hit;
        }
        const openId = Object.keys(expandedSubs || {}).find((k) => expandedSubs?.[k] && subs.some((s) => s && String(s.id) === String(k)));
        if (!openId) return null;
        return subs.find((s) => s && String(s.id) === String(openId)) || null;
      } catch (_e) {
        return null;
      }
    };

    const selected = selectedProjectBreadcrumb;
    const group = selected?.group || getActiveGroup();
    const sub = selected?.sub || (group ? getActiveSub(group) : null);
    const project = selected?.project || null;

    const segments = [{ label: 'Startsida', target: { kind: 'dashboard' } }];
    if (group) segments.push({ label: resolveLabel(group, 'Huvudmapp'), target: { kind: 'main', mainId: group.id } });
    if (group && sub) segments.push({ label: resolveLabel(sub, 'Undermapp'), target: { kind: 'sub', mainId: group.id, subId: sub.id } });
    if (project && project.id != null) segments.push({ label: formatProjectLabel(project), target: { kind: 'project', projectId: String(project.id) } });

    publishHomeBreadcrumbSegments(segments);
  }, [companiesMode, templatesMode, controlTypesMode, hierarchy, filteredGroups, expandedGroups, expandedSubs, selectedProjectBreadcrumb]);

  if (loading) {
    return (
      <div style={{ width: 280, padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', color: '#888' }}>
        {companiesMode ? 'Laddar företagslista...' : 'Laddar projektlista...'}
      </div>
    );
  }

  const handleGoHome = () => {
    try {
      if (typeof window !== 'undefined') {
        // Signalera till omgivande skärm att vi vill tillbaka till dashboarden.
        // Själva navigationen hanteras i skärmen (t.ex. ManageCompany/AdminAuditLog)
        // så att användaren förblir inloggad.
        try {
          window.dispatchEvent(new CustomEvent('dkGoHome'));
        } catch (_e) {}
      }
    } catch (_e) {}
  };

  const handleAddCompany = () => {
    try {
      setAddCompanyError('');
      setAddCompanyName('');
      setAddCompanyId('');
      setAddDialogOpen(true);
    } catch (_) {}
  };

  const handleConfirmAddCompany = async () => {
    if (addCompanySaving) return;
    try {
      if (typeof window === 'undefined') return;
      const name = String(addCompanyName || '').trim();
      let id = String(addCompanyId || '').trim();
      if (!id && name) {
        id = slugify(name);
      }
      if (!id) {
        setAddCompanyError('Ange ett företags-ID');
        return;
      }
      setAddCompanyError('');
      setAddCompanySaving(true);

      const prev = Array.isArray(companies) ? companies : [];
      // Optimistic UI: add placeholder immediately
      setCompanies(prev.concat([{ id, profile: { companyName: name || id } }]));

      // Ensure token/claims are fresh before attempting writes that depend on claims
      try {
        if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
          await auth.currentUser.getIdToken(true);
        }
      } catch (_e) {
        // Non-fatal: continue but visa info i dialogen
        setAddCompanyError('Kunde inte uppdatera autentiseringstoken, försök logga ut/in om fel uppstår.');
      }

      // Prefer server-side provisioning (callable) because Firestore rules restrict
      // client-side creation of company profiles to superadmins / MS Byggsystem admins.
      try {
        console.log('[debug] calling provisionCompanyRemote', { id, name });
        const p = await provisionCompanyRemote({ companyId: id, companyName: name || id });
        console.log('[debug] provisionCompanyRemote result', p);
        if (!p || !p.ok) {
          setAddCompanyError('Serverfel: provisioning kunde inte slutföras automatiskt. Kontrollera loggar för provisionCompany.');
          setCompanies(prev);
          setAddCompanySaving(false);
          return;
        }
        
        // After company is created, show instructions for manual SharePoint site creation
        const sanitizedId = id
          .replace(/[^a-zA-Z0-9]/g, '')
          .replace(/\s+/g, '')
          .substring(0, 50);
        const sanitizedIdLower = sanitizedId.toLowerCase();
        const siteName = name || id;
        
        const instructions = `✅ Företag skapat!\n\n` +
          `SharePoint Site ska skapas manuellt:\n\n` +
          `1. Gå till SharePoint Admin Center:\n` +
          `   https://admin.microsoft.com/sharepoint\n\n` +
          `2. Klicka på "+ Skapa" och fyll i:\n\n` +
          `   📝 NAMN PÅ WEBBPLATS:\n` +
          `   "${siteName}"\n\n` +
          `   📝 BESKRIVNING (valfritt):\n` +
          `   "SharePoint site for ${siteName} - DigitalKontroll"\n\n` +
          `   📝 GRUPPENS E-POSTADRESS:\n` +
          `   "${sanitizedId}"\n\n` +
          `   📝 WEBBPLATSADRESS (bara delen efter /sites/):\n` +
          `   "${sanitizedIdLower}"\n` +
          `   (SharePoint lägger till https://msbyggsystem.sharepoint.com/sites/ automatiskt)\n\n` +
          `   📝 GRUPPÄGARE:\n` +
          `   marcus@msbyggsystem.se (lägg till först)\n` +
          `   Sedan lägger du till kundens e-post\n\n` +
          `3. När site är skapad, kom tillbaka och klicka på "Skapa SharePoint Site" i företagsinställningarna för att länka den.`;
        
        try {
          if (typeof window !== 'undefined') {
            window.alert(instructions);
          }
        } catch (_e) {}
        
        console.log('[ProjectSidebar] Company created. SharePoint site instructions shown.');
      } catch (e) {
        console.error('[debug] provisionCompanyRemote threw', e);
        const rawCode = e && e.code ? String(e.code) : '';
        const normCode = rawCode.startsWith('functions/') ? rawCode.slice('functions/'.length) : (rawCode || null);
        const rawMsg = e && e.message ? String(e.message) : String(e || '');
        let cleanMsg = rawMsg.replace(/^functions\.https\.HttpsError:\s*/i, '');
        if (!cleanMsg) cleanMsg = 'Okänt fel från servern.';

        if (normCode === 'permission-denied' || rawMsg.toLowerCase().includes('permission')) {
          setAddCompanyError('Ingen behörighet att skapa företag (permission-denied). Be en superadmin kontrollera dina rättigheter.');
        } else if (normCode === 'unauthenticated' || rawMsg.toLowerCase().includes('unauthenticated')) {
          setAddCompanyError('Du är utloggad eller din session har gått ut. Försök logga ut och in igen.');
        } else {
          setAddCompanyError(`Serverfel från provisionCompany (${normCode || 'okänt fel'}): ${cleanMsg}`);
        }
        // revert optimistic add
        setCompanies(prev);
        setAddCompanySaving(false);
        return;
      }
      // Refresh companies list
      try {
        const items = await fetchCompanies();
        if (Array.isArray(items)) setCompanies(items);
      } catch (_) {}
      setAddDialogOpen(false);
    } catch (e) {
      setAddCompanyError('Fel vid skapande: ' + String(e?.message || e));
    } finally {
      setAddCompanySaving(false);
    }
  };

  const handleHardRefresh = () => {
    // Do an in-app refresh without toggling `loading` (so the sidebar/list stays visible).
    (async () => {
      try {
        if (companiesMode) {
          const prev = Array.isArray(companies) ? companies : [];
          const items = await fetchCompanies();
          if (Array.isArray(items) && items.length > 0) {
            // Apply same filtering as initial load: respect restrictCompanyId
            const filtered = restrictCompanyId ? items.filter(c => c && c.id === restrictCompanyId) : items;
            setCompanies(filtered);
          } else {
            // keep previous companies if fetch returned empty — avoid wiping the UI
            showToast('Uppdateringen gav inga nya företag.');
            setCompanies(prev);
          }

          // I Hantera användare vill vi visa användarräknare per företag.
          // Uppdatera-knappen ska därför trigga en kontrollerad omhämtning (utan burst).
          try {
            if (memberSearchMode) {
              setMemberFetchErrors({});
              setMembersPrefetchNonce((n) => n + 1);
            }
          } catch (_e) {}

          // If we show members and some companies are expanded, refresh those member lists
          if (showMembers && expandedCompanies) {
            Object.keys(expandedCompanies).forEach(async (compId) => {
              if (expandedCompanies[compId]) {
                try {
                  const mems = await fetchCompanyMembers(compId).catch(() => []);
                  setMembersByCompany(prevState => ({ ...prevState, [compId]: mems }));
                } catch (_) {}
              }
            });
          }
          return;
        }

        // Project mode: re-fetch ALL root folders from SharePoint (no phase filtering)
        const prevH = Array.isArray(hierarchy) ? hierarchy : [];
        try {
          const sharePointFolders = await getSharePointHierarchy(resolvedCompanyId, null);
          if (Array.isArray(sharePointFolders) && sharePointFolders.length > 0) {
            setHierarchy(sharePointFolders);
          } else {
            showToast('Uppdateringen gav inga nya mappar.');
            setHierarchy(prevH);
          }
        } catch (error) {
          console.error('[ProjectSidebar] Error refreshing SharePoint hierarchy:', error);
          showToast('Kunde inte uppdatera mappstruktur från SharePoint.');
          setHierarchy(prevH);
        }
        return;
      } catch (_e) {
        // Fallback: cache-busting reload on same path
        try {
          if (typeof window !== 'undefined') {
            try { window.location.reload(); } catch(_) {}
            try {
              const path = window.location.pathname + (window.location.search || '');
              const sep = path.includes('?') ? '&' : '?';
              window.location.href = path + sep + '_cb=' + Date.now();
            } catch(_) {}
          }
        } catch (_) {}
      }
    })();
  };

  return (
    <div style={{ width: 320, minWidth: 280, background: '#f7f7f7', height: '100vh', overflowY: 'auto', overflowX: 'hidden', borderRight: '1px solid #ddd', padding: 0, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', position: 'relative', boxSizing: 'border-box', flexShrink: 0, display: 'flex', flexDirection: 'column' }}>
      {addDialogOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.35)',
            zIndex: 50,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}
          onClick={() => { if (!addCompanySaving) setAddDialogOpen(false); }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 16,
              width: 280,
              maxWidth: '90vw',
              boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
              fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif'
            }}
          >
            <h4 style={{ margin: 0, marginBottom: 8, fontSize: 16, fontWeight: 700, color: '#222' }}>Nytt företag</h4>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13, marginBottom: 4, display: 'block', color: '#444' }}>Företagsnamn (valfritt)</label>
              <input
                type="text"
                value={addCompanyName}
                onChange={(e) => setAddCompanyName(e.target.value)}
                placeholder="Företagsnamn"
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 13, marginBottom: 4, display: 'block', color: '#444' }}>Företags-ID (kort identifierare)</label>
              <input
                type="text"
                value={addCompanyId}
                onChange={(e) => setAddCompanyId(e.target.value)}
                placeholder={addCompanyName ? slugify(addCompanyName) : 'foretags-id (får ej vara mellanrum)'}
                style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid #ccc', fontSize: 14, boxSizing: 'border-box' }}
              />
            </div>
            {addCompanyError ? (
              <div style={{ color: '#D32F2F', fontSize: 12, marginBottom: 8 }}>{addCompanyError}</div>
            ) : null}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4, gap: 8 }}>
              <button
                type="button"
                onClick={() => { if (!addCompanySaving) setAddDialogOpen(false); }}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #ccc',
                  backgroundColor: '#fff',
                  fontSize: 14,
                  cursor: 'pointer'
                }}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleConfirmAddCompany}
                disabled={addCompanySaving}
                style={{
                  padding: '6px 10px',
                  borderRadius: 6,
                  border: '1px solid #1976D2',
                  backgroundColor: addCompanySaving ? '#90CAF9' : '#1976D2',
                  color: '#fff',
                  fontSize: 14,
                  cursor: addCompanySaving ? 'default' : 'pointer'
                }}
              >
                {addCompanySaving ? 'Skapar...' : 'Skapa'}
              </button>
            </div>
          </div>
        </div>
      )}
      {(() => {
        // Visa normal rubrik (fasväljaren, hem- och uppdatera-knapparna finns nu i GlobalPhaseToolbar)
        return (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingLeft: 16, paddingRight: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {iconName ? (
                <div style={{ width: 22, height: 22, borderRadius: 6, backgroundColor: iconColor || '#1976D2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Ionicons name={iconName} size={13} color="#fff" />
                </div>
              ) : null}
              <h3 style={{ margin: 0, fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, letterSpacing: 0.2, color: '#222', fontSize: 20 }}>{title}</h3>
              {templatesMode && templateFetchErrorCount > 0 ? (
                <span title={`Mallfel: ${templateFetchErrorCount}`} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 18, height: 18, borderRadius: 999, padding: '0 6px', backgroundColor: '#D32F2F', color: '#fff', fontSize: 12, fontWeight: 700 }}>
                  {templateFetchErrorCount}
                </span>
              ) : null}
            </div>
            {companiesMode ? (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8, marginRight: 6, backgroundColor: 'transparent' }}
                  onPress={() => {
                    setSpinHome(n => n + 1);
                    handleGoHome();
                  }}
                  accessibilityLabel="Hem"
                >
                  <Ionicons
                    name="home-outline"
                    size={18}
                    color="#1976D2"
                    style={{
                      transform: `rotate(${spinHome * 360}deg)`,
                      transition: 'transform 0.4s ease'
                    }}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8, marginRight: 6, backgroundColor: 'transparent' }}
                  onPress={() => {
                    setSpinRefresh(n => n + 1);
                    handleHardRefresh();
                  }}
                  accessibilityLabel="Uppdatera"
                >
                  <Ionicons
                    name="refresh"
                    size={18}
                    color="#1976D2"
                    style={{
                      transform: `rotate(${spinRefresh * 360}deg)`,
                      transition: 'transform 0.4s ease'
                    }}
                  />
                </TouchableOpacity>
              </div>
            ) : null}
          </div>
        );
      })()}
        {/* Toast/snackbar (döljs när dialogen för nytt företag är öppen) */}
        {toast.visible && !addDialogOpen ? (
          <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 13, zIndex: 40 }}>
            {toast.message}
          </div>
        ) : null}
      <div style={{ padding: '0 16px', flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}>
      <input
        type="text"
        placeholder={searchPlaceholder}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{
          width: '100%',
          padding: '8px 10px',
          margin: '8px 0 8px 0',
          borderRadius: 8,
          border: '1px solid #bbb',
          fontSize: 15,
          fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
          outline: 'none',
          boxSizing: 'border-box',
        }}
      />
      {companiesMode && !hideCompanyActions ? (
        <>
          <div style={{ marginTop: 8, marginBottom: 4 }}>
            <button
              onClick={handleAddCompany}
              style={{ background: '#fff', border: '1px solid #1976d2', color: '#1976d2', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
            >
              + Lägg till företag
            </button>
          </div>
          {effectiveGlobalAdmin ? (
            <div style={{ marginBottom: 8, fontSize: 12, color: '#555', display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="checkbox"
                checked={showDeletedCompanies}
                onChange={e => setShowDeletedCompanies(!!e.target.checked)}
                style={{ margin: 0 }}
              />
              <span>Visa dolda företag</span>
            </div>
          ) : null}
        </>
      ) : null}
        <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '12px 0 16px 0' }} />
      {companiesMode ? (<>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {(() => {
            const filtered = visibleCompanies.filter(c => {
              // In memberSearchMode (Hantera användare) eller när sidomenyn är
              // låst till ett enda företag (restrictCompanyId) ska sökfältet
              // inte filtrera bort själva företaget – bara användarna under.
              if (memberSearchMode || restrictCompanyId) return true;
              const q = search.toLowerCase();
              const name = String((c.profile && (c.profile.companyName || c.profile.name)) || '').toLowerCase();
              if (!q) return true;

              // I Kontrolltyper-läget: filtrera även på kontrolltypernas namn.
              if (controlTypesMode) {
                const types = (controlTypesByCompany[c.id] || DEFAULT_CONTROL_TYPES) || [];
                const hasTypeMatch = types.some(t => {
                  const label = String(t.name || t.key || '').toLowerCase();
                  return label && label.includes(q);
                });
                if (hasTypeMatch) return true;
              }

              return name.includes(q) || String(c.id || '').toLowerCase().includes(q);
            });
            if (!memberSearchMode && !restrictCompanyId && filtered.length === 0) {
              return (
                <li style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 24 }}>Inga företag hittades.</li>
              );
            }
            return filtered.map(company => {
                const companyEnabled = isCompanyEnabled(company);
                return (
                <li key={company.id}>
                  <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
                    <div
                      onMouseEnter={() => setHoveredCompany(company.id)}
                      onMouseLeave={() => setHoveredCompany(null)}
                      onContextMenu={(e) => {
                        try { e.preventDefault(); } catch(_e) {}
                        const x = (e && e.clientX) ? e.clientX : 60;
                        const y = (e && e.clientY) ? e.clientY : 60;
                        setContextMenuX(x);
                        setContextMenuY(y);
                        setContextMenuCompany(company);
                        setContextMenuVisible(true);
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        cursor: 'pointer',
                        userSelect: 'none',
                        flex: 1,
                        background: hoveredCompany === company.id ? HOVER_BG : 'transparent',
                        borderRadius: 4,
                        padding: '2px 4px',
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: hoveredCompany === company.id ? PRIMARY_BLUE : 'transparent',
                        transition: 'background 0.15s, border-color 0.15s',
                        boxSizing: 'border-box',
                      }}
                    >
                      <button
                        style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: hoveredCompany === company.id ? PRIMARY_BLUE : '#222',
                        textAlign: 'left',
                        fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                        fontSize: 15,
                        letterSpacing: 0.1,
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        justifyContent: 'space-between',
                      }}
                        onClick={async () => {
                          setExpandedCompanies(prev => {
                            const isOpen = !!prev[company.id];
                            // Allow only one expanded company at a time
                            if (isOpen) return {};
                            return { [company.id]: true };
                          });
                          // Whenever we change which company is öppnad, reset
                          // the per-company member role expansion so that
                          // "Admin" och "Användare" listas alltid startar stängda.
                          try { setExpandedMemberRoles({}); } catch(_e) {}
                          if (showMembers && !membersByCompany[company.id]) {
                            // Try admin callable first (works across companies as superadmin), then fallback to client fetch
                            let loaded = false;
                            try {
                              const r = await adminFetchCompanyMembers(company.id);
                              const mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                              if (Array.isArray(mems)) {
                                setMembersByCompany(prev => ({ ...prev, [company.id]: mems }));
                                loaded = true;
                              }
                            } catch (e) {
                              try {
                                const raw = String(e && e.message ? e.message : (e || ''));
                                if (raw && raw.trim().toLowerCase() !== 'internal') {
                                  setMemberFetchErrors(prev => ({ ...prev, [company.id]: raw }));
                                }
                              } catch (_) {}
                            }
                            if (!loaded) {
                              try {
                                const members = await fetchCompanyMembers(company.id).catch(() => []);
                                setMembersByCompany(prev => ({ ...prev, [company.id]: members }));
                              } catch (_e) {
                                setMembersByCompany(prev => ({ ...prev, [company.id]: [] }));
                              }
                            }
                          }
                          if (onSelectProject) {
                            onSelectProject({ companyId: company.id, profile: company.profile });
                          }
                        }}
                      >
                        <span style={{ fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          <Ionicons
                            name="briefcase"
                            size={16}
                            color={hoveredCompany === company.id ? PRIMARY_BLUE : (company.profile && company.profile.deleted ? '#999' : '#555')}
                            style={{
                              transform: expandedCompanies[company.id] ? 'rotate(360deg)' : 'rotate(0deg)',
                              transition: 'transform 0.4s ease'
                            }}
                          />
                          {(() => {
                            const baseName = (company.profile && (company.profile.companyName || company.profile.name)) || company.id;
                            if (company.profile && company.profile.deleted) return `${baseName} (dolt)`;
                            return baseName;
                          })()}
                          {(() => {
                            if (templatesMode) {
                              const summary = templatesByCompany && templatesByCompany[company.id];
                              const totalTemplates = summary && typeof summary.total === 'number' ? summary.total : 0;
                              return ` (${totalTemplates})`;
                            }

                            // I Kontrolltyper-läget vill vi visa antal kontrolltyper per företag,
                            // inte antal användare/licenser.
                            if (controlTypesMode && controlTypesByCompany && controlTypesByCompany[company.id]) {
                              const types = controlTypesByCompany[company.id] || [];
                              const count = Array.isArray(types) ? types.length : 0;
                              if (count > 0) return ` (${count})`;
                            }

                            const mems = membersByCompany && membersByCompany[company.id] ? (membersByCompany[company.id] || []) : null;
                            if (!mems) return '';
                            const used = mems.length;
                            let limit = null;
                            if (company.profile && company.profile.userLimit !== undefined && company.profile.userLimit !== null && company.profile.userLimit !== '') {
                              try {
                                const raw = String(company.profile.userLimit).trim();
                                const m = raw.match(/-?\d+/);
                                if (m && m[0]) {
                                  const n = parseInt(m[0], 10);
                                  if (!Number.isNaN(n) && Number.isFinite(n)) limit = n;
                                }
                              } catch (_) {}
                            }
                            if (typeof limit === 'number') return ` (${used}/${limit})`;
                            return ` (${used})`;
                          })()}
                        </span>
                        {isSuperadminViewer ? (
                          <span
                            style={{
                              marginLeft: 8,
                              padding: '0 6px',
                              minWidth: 32,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'flex-end',
                              boxSizing: 'border-box',
                              flexShrink: 0,
                            }}
                            title={(() => {
                              const deleted = !!(company.profile && company.profile.deleted);
                              if (deleted) return 'Företaget är dolt (visas bara för superadmin)';
                              return companyEnabled ? 'Företaget är aktivt (visas bara för superadmin)' : 'Företaget är pausat/inaktivt (visas bara för superadmin)';
                            })()}
                          >
                            <span
                              style={{
                                borderRadius: 999,
                                padding: '2px 8px',
                                fontSize: 12,
                                fontWeight: 700,
                                lineHeight: '16px',
                                backgroundColor: (() => {
                                  const deleted = !!(company.profile && company.profile.deleted);
                                  if (deleted) return '#F3F4F6';
                                  return companyEnabled ? '#E8F5E9' : '#FFEBEE';
                                })(),
                                border: (() => {
                                  const deleted = !!(company.profile && company.profile.deleted);
                                  if (deleted) return '1px solid #E5E7EB';
                                  return companyEnabled ? '1px solid #C8E6C9' : '1px solid #FFCDD2';
                                })(),
                                color: (() => {
                                  const deleted = !!(company.profile && company.profile.deleted);
                                  if (deleted) return '#6B7280';
                                  return companyEnabled ? '#2E7D32' : '#C62828';
                                })(),
                                boxSizing: 'border-box',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                              }}
                            >
                              {(() => {
                                const deleted = !!(company.profile && company.profile.deleted);
                                if (deleted) return 'Dolt';
                                return companyEnabled ? 'Aktiv' : 'Inaktiv';
                              })()}
                            </span>
                          </span>
                        ) : null}
                      </button>
                    </div>
                    <ContextMenu
                      visible={contextMenuVisible && contextMenuCompany && contextMenuCompany.id === company.id}
                      x={contextMenuX}
                      y={contextMenuY}
                      onClose={() => setContextMenuVisible(false)}
                      items={(() => {
                        const enabled = companyEnabled;
                        const deleted = !!(company.profile && company.profile.deleted);
                        const isProtectedCompany = String(company.id || '').trim() === 'MS Byggsystem';

                        // I Kontrolltyper-läget: ingen context-meny för företag (använd knappen i mittenpanelen istället)
                        if (controlTypesMode) {
                          return [];
                        }

                        // I Mallar-läget: företagsmenyn ska bara erbjuda "Lägg till mall".
                        if (templatesMode) {
                          return [
                            { key: 'addTemplate', label: 'Lägg till mall', icon: '➕' },
                          ];
                        }

                        const base = [{ key: 'addUser', label: 'Lägg till användare', icon: '➕' }];
                        if (!effectiveGlobalAdmin || !allowCompanyManagementActions) return base;
                        if (!isSuperadminViewer) return base;
                        return base.concat([
                          { key: 'rename', label: 'Byt företagsnamn', icon: '✏️' },
                          { key: 'setLimit', label: 'Justera antal användare (userLimit)', icon: '👥' },
                          ...(deleted ? [{ key: 'unhideCompany', label: 'Gör synligt igen', icon: '👁️' }] : []),
                          { key: 'activate', label: 'Aktivera företag', icon: '▶️', disabled: enabled },
                          { key: 'pause', label: 'Pausa företag', icon: '⏸️', disabled: !enabled },
                          { key: 'deleteCompany', label: deleted ? 'Radera företag' : 'Dölj företag', icon: '🗑️', danger: true, disabled: isProtectedCompany || (!deleted && enabled) },
                        ]);
                      })()}
                      onSelect={async (item) => {
                        if (!contextMenuCompany) return;
                        const compId = contextMenuCompany.id;
                        const isProtectedCompany = String(compId || '').trim() === 'MS Byggsystem';
                        if (controlTypesMode && item.key === 'addControlType') {
                          setContextMenuVisible(false);
                          if (onSelectProject) {
                            onSelectProject({ companyId: compId, profile: contextMenuCompany.profile, createControlType: true });
                          }
                          return;
                        }
                        if (templatesMode && item.key === 'addTemplate') {
                          setContextMenuVisible(false);
                          if (onSelectProject) {
                            // Välj bara företaget; själva formuläret för ny mall finns i mitten
                            onSelectProject({ companyId: compId, profile: contextMenuCompany.profile });
                          }
                          return;
                        }
                        if (item.key === 'addUser') {
                          // Open the same modal as edit, but in "create" mode.
                          setEditingUser({ companyId: compId, member: {}, create: true });
                          setContextMenuVisible(false);
                          return;
                        } else if (item.key === 'unhideCompany') {
                          const conf = (typeof window !== 'undefined') ? window.confirm('Gör företaget ' + compId + ' synligt i listan igen?') : true;
                          if (!conf) return;
                          showToastSticky('Laddar…');
                          try {
                            const res = await setCompanyStatusRemote({ companyId: compId, deleted: false });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte göra företaget synligt (servern avvisade ändringen).');
                              return;
                            }
                            try { Alert.alert('Ok', 'Företaget är nu synligt i listan.'); } catch(_e) { try { window.alert('Ok'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(_e) {}
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte göra företaget synligt: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte göra företaget synligt: ' + combined); } catch(_) { try { window.alert('Kunde inte göra företaget synligt'); } catch(__) {} }
                          } finally {
                            hideToast();
                          }
                        } else if (item.key === 'activate' || item.key === 'pause') {
                          const wantEnable = item.key === 'activate';
                          const label = wantEnable ? 'aktivera' : 'pausa';
                          const conf = (typeof window !== 'undefined') ? window.confirm(label.charAt(0).toUpperCase() + label.slice(1) + ' företaget ' + compId + '?') : true;
                          if (!conf) return;
                          showToastSticky('Laddar…');
                          try {
                            // Aktivering ska alltid göra bolaget synligt igen.
                            const res = await setCompanyStatusRemote({ companyId: compId, enabled: wantEnable, ...(wantEnable ? { deleted: false } : {}) });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte ändra företagsstatus (servern avvisade ändringen).');
                              return;
                            }
                            try { Alert.alert('Ok', `Företaget ${wantEnable ? 'aktiverades' : 'pausades'}.`); } catch(_e) { try { window.alert('Ok'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(_e) {}
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte ändra företagsstatus: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte ändra status: ' + combined); } catch(_) { try { window.alert('Kunde inte ändra status'); } catch(__) {} }
                          } finally {
                            hideToast();
                          }
                        } else if (item.key === 'deleteCompany') {
                          if (isProtectedCompany) {
                            showToast('MS Byggsystem kan aldrig raderas.');
                            return;
                          }
                          const prof = contextMenuCompany && contextMenuCompany.profile ? contextMenuCompany.profile : {};
                          const alreadyDeleted = !!prof.deleted;

                          if (!alreadyDeleted) {
                            // Dölja ska bara gå när bolaget är pausat (för att undvika att dölja aktiva bolag av misstag).
                            try {
                              const enabledNow = !prof.deleted && (typeof prof.enabled === 'boolean' ? !!prof.enabled : true);
                              if (enabledNow) {
                                showToast('Pausa företaget först innan du döljer det.');
                                return;
                              }
                            } catch (_e) {}
                            const conf = (typeof window !== 'undefined')
                              ? window.confirm('Dölj företaget ' + compId + '? Företaget pausas och döljs i listan. Du kan visa det igen via "Visa dolda företag".')
                              : true;
                            if (!conf) return;
                            showToastSticky('Laddar…');
                            try {
                              const res = await setCompanyStatusRemote({ companyId: compId, deleted: true, enabled: false });
                              const ok = !!(res && (res.ok === true || res.success === true));
                              if (!ok) {
                                showToast('Kunde inte radera företaget (servern avvisade ändringen).');
                                return;
                              }
                              // Markera som raderat lokalt istället för att ta bort helt.
                              setCompanies(prev =>
                                Array.isArray(prev)
                                  ? prev.map(c =>
                                      c.id === compId
                                        ? { ...c, profile: { ...(c.profile || {}), deleted: true, enabled: false } }
                                        : c
                                    )
                                  : prev
                              );
                              try {
                                Alert.alert('Dolt', 'Företaget har pausats och dolts från listan.');
                              } catch (_e) {
                                try { window.alert('Företaget har dolts från listan.'); } catch (_) {}
                              }
                            } catch (e) {
                              const rawCode = e && e.code ? String(e.code) : '';
                              const rawMsg = e && e.message ? String(e.message) : String(e || '');
                              const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                              showToast('Kunde inte radera företaget: ' + combined);
                              try { Alert.alert('Fel', 'Kunde inte radera företaget: ' + combined); } catch (_) { try { window.alert('Kunde inte radera företaget.'); } catch (__ ) {} }
                            } finally {
                              hideToast();
                            }
                          } else {
                            const conf = (typeof window !== 'undefined')
                              ? window.confirm(
                                  'Företaget ' +
                                    compId +
                                    ' är redan dolt. Vill du radera det PERMANENT? Detta tar bort all historik och kan inte ångras.'
                                )
                              : true;
                            if (!conf) return;
                            showToastSticky('Laddar…');
                            try {
                              const res = await purgeCompanyRemote({ companyId: compId });
                              const ok = !!(res && (res.ok === true || res.success === true));
                              if (!ok) {
                                showToast('Kunde inte radera företaget permanent (servern avvisade ändringen).');
                                return;
                              }
                              setCompanies(prev => (Array.isArray(prev) ? prev.filter(c => c.id !== compId) : prev));
                              try {
                                Alert.alert('Borttaget', 'Företaget har raderats permanent och all historik är borttagen.');
                              } catch (_e) {
                                try { window.alert('Företaget har raderats permanent.'); } catch (_) {}
                              }
                            } catch (e) {
                              const rawCode = e && e.code ? String(e.code) : '';
                              const rawMsg = e && e.message ? String(e.message) : String(e || '');
                              const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                              showToast('Kunde inte radera företaget permanent: ' + combined);
                              try { Alert.alert('Fel', 'Kunde inte radera företaget permanent: ' + combined); } catch (_) { try { window.alert('Kunde inte radera företaget permanent.'); } catch (__ ) {} }
                            } finally {
                              hideToast();
                            }
                          }
                        } else if (item.key === 'setLimit') {
                          if (typeof window === 'undefined') return;
                          // Förifyll med nuvarande limit om den finns
                          let currentLimit = null;
                          try {
                            const prof = contextMenuCompany && contextMenuCompany.profile ? contextMenuCompany.profile : null;
                            if (prof && prof.userLimit !== undefined && prof.userLimit !== null && prof.userLimit !== '') {
                              const raw = String(prof.userLimit).trim();
                              const m = raw.match(/-?\d+/);
                              if (m && m[0]) {
                                const n = parseInt(m[0], 10);
                                if (!Number.isNaN(n) && Number.isFinite(n)) currentLimit = n;
                              }
                            }
                          } catch (_) {}

                          const initial = currentLimit !== null ? String(currentLimit) : '';
                          const raw = window.prompt('Ange max antal användare (userLimit) för ' + compId + ':', initial);
                          if (raw === null) return; // avbrutet
                          const trimmed = String(raw).trim();
                          if (!trimmed) return;
                          const parsed = parseInt(trimmed, 10);
                          if (Number.isNaN(parsed) || !Number.isFinite(parsed) || parsed < 0) {
                            try { Alert.alert('Fel', 'Ogiltigt antal användare. Ange ett heltal 0 eller större.'); } catch(_e) { try { window.alert('Ogiltigt antal användare.'); } catch(_) {} }
                            return;
                          }

                          try {
                            showToastSticky('Laddar…');
                            const res = await setCompanyUserLimitRemote({ companyId: compId, userLimit: parsed });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte spara userLimit (servern avvisade ändringen).');
                              return;
                            }
                            try { Alert.alert('Ok', `Max antal användare uppdaterat till ${parsed}.`); } catch(_e) { try { window.alert('Max antal användare uppdaterat.'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(_e) {}
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte uppdatera userLimit: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte uppdatera userLimit: ' + combined); } catch(_) { try { window.alert('Kunde inte uppdatera userLimit.'); } catch(__) {} }
                          } finally {
                            hideToast();
                          }
                        } else if (item.key === 'rename') {
                          if (typeof window === 'undefined') return;
                          const prof = contextMenuCompany && contextMenuCompany.profile ? contextMenuCompany.profile : {};
                          const currentName = (prof && (prof.companyName || prof.name)) || compId;
                          const raw = window.prompt('Ange nytt företagsnamn för ' + compId + ':', currentName);
                          if (raw === null) return; // avbrutet
                          const trimmed = String(raw).trim();
                          if (!trimmed) return;

                          try {
                            const res = await setCompanyNameRemote({ companyId: compId, companyName: trimmed });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte uppdatera företagsnamnet (servern avvisade ändringen).');
                              return;
                            }
                            try { Alert.alert('Ok', 'Företagsnamnet har uppdaterats.'); } catch(_e) { try { window.alert('Företagsnamnet har uppdaterats.'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(_e) {}
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte uppdatera företagsnamn: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte uppdatera företagsnamn: ' + combined); } catch(_) { try { window.alert('Kunde inte uppdatera företagsnamn.'); } catch(__) {} }
                          }
                        }
                      }}
                    />

                    {(controlTypesMode || templatesMode) && controlTypeContextMenu && controlTypeContextMenu.companyId === company.id && (
                      <ContextMenu
                        visible={!!controlTypeContextMenu}
                        x={controlTypeContextMenu.x}
                        y={controlTypeContextMenu.y}
                        onClose={() => setControlTypeContextMenu(null)}
                        items={(function () {
                          if (templatesMode) {
                            return [
                              { key: 'addTemplate', label: 'Lägg till mall', icon: '➕' },
                            ];
                          }

                          const isHidden = !!controlTypeContextMenu.hidden;
                          return [
                            { key: 'rename', label: 'Byt namn' },
                            { key: isHidden ? 'activate' : 'hide', label: isHidden ? 'Aktivera' : 'Dölj' },
                            { key: 'delete', label: 'Radera' },
                          ];
                        })()}
                        onSelect={async (item) => {
                          const ctx = controlTypeContextMenu;
                          setControlTypeContextMenu(null);
                          if (!ctx || !item) return;
                          if (templatesMode && item.key === 'addTemplate') {
                            const compId = ctx.companyId;
                            const typeName = ctx.controlTypeName || ctx.controlTypeKey || '';
                            if (onSelectProject && compId && typeName) {
                              onSelectProject({ companyId: compId, profile: company.profile, controlType: typeName, openTemplateModal: true });
                            }
                            return;
                          }

                          if (!controlTypesMode) return;
                          const compId = ctx.companyId;
                          const ctId = ctx.controlTypeId;
                          const ctName = ctx.controlTypeName || '';
                          const ctKey = ctx.controlTypeKey || '';
                          const isBuiltin = !!ctx.builtin;
                          if (!compId) return;

                          const notifyChange = () => {
                            try {
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('dkControlTypesUpdated', { detail: { companyId: compId } }));
                              }
                            } catch (_) {}
                          };

                          try {
                            if (item.key === 'rename') {
                              let raw = ctName;
                              try {
                                if (typeof window !== 'undefined' && window.prompt) {
                                  raw = window.prompt('Nytt namn för kontrolltypen', ctName || '') || '';
                                }
                              } catch (_) {}
                              const trimmed = String(raw || '').trim();
                              if (!trimmed || trimmed === ctName) return;
                              if (isBuiltin || !ctId) {
                                await updateCompanyControlType({ key: ctKey || ctName || trimmed, name: trimmed }, compId);
                              } else {
                                await updateCompanyControlType({ id: ctId, name: trimmed }, compId);
                              }
                              try {
                                const list = await fetchCompanyControlTypes(compId).catch(() => null);
                                if (Array.isArray(list) && list.length > 0) {
                                  setControlTypesByCompany(prev => ({ ...prev, [compId]: list }));
                                }
                              } catch (_) {}
                              notifyChange();
                              return;
                            }

                            if (item.key === 'hide' || item.key === 'activate') {
                              const targetHidden = item.key === 'hide';
                              if (isBuiltin || !ctId) {
                                await updateCompanyControlType({ key: ctKey || ctName, hidden: targetHidden }, compId);
                              } else {
                                await updateCompanyControlType({ id: ctId, hidden: targetHidden }, compId);
                              }
                              try {
                                const list = await fetchCompanyControlTypes(compId).catch(() => null);
                                if (Array.isArray(list) && list.length > 0) {
                                  setControlTypesByCompany(prev => ({ ...prev, [compId]: list }));
                                }
                              } catch (_) {}
                              notifyChange();
                              return;
                            }

                            if (item.key === 'delete') {
                              let confirmed = true;
                              try {
                                if (typeof window !== 'undefined' && window.confirm) {
                                  confirmed = window.confirm(`Är du säker på att du vill radera kontrolltypen "${ctName || ''}"? Detta går inte att ångra.`);
                                }
                              } catch (_) { confirmed = true; }
                              if (!confirmed) return;
                              if (isBuiltin || !ctId) {
                                // För inbyggda kontrolltyper kan vi inte radera globalt,
                                // behandla "Radera" som att dölja typen för detta företag.
                                await updateCompanyControlType({ key: ctKey || ctName, hidden: true }, compId);
                              } else {
                                await deleteCompanyControlType({ id: ctId }, compId);
                              }
                              try {
                                const list = await fetchCompanyControlTypes(compId).catch(() => null);
                                if (Array.isArray(list) && list.length > 0) {
                                  setControlTypesByCompany(prev => ({ ...prev, [compId]: list }));
                                }
                              } catch (_) {}
                              notifyChange();
                              return;
                            }
                          } catch (e) {
                            try {
                              showToast('Kunde inte uppdatera kontrolltyp: ' + String(e?.message || e));
                            } catch (_) {}
                          }
                        }}
                      />
                    )}

                    {templatesMode && expandedCompanies[company.id] && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 6 }}>
                        {(controlTypesByCompany[company.id] || DEFAULT_CONTROL_TYPES).map(({ name, icon, color, key: ctKey, id, hidden, builtin }) => {
                          const type = name || ctKey || '';
                          if (!type) return null;
                          const key = `${company.id}:${type}`;
                          const spin = spinTemplateTypes[key] || 0;
                          const isSelected = selectedTemplateKey === key;
                          const isHovered = hoveredTemplateKey === key;
                          const isExpanded = !!expandedTemplateTypes[key];
                          const isHidden = !!hidden;
                          const summary = templatesByCompany && templatesByCompany[company.id];
                          const count = summary && summary.perType && typeof summary.perType[type] === 'number'
                            ? summary.perType[type]
                            : 0;
                          const templatesForType = summary && Array.isArray(summary.items)
                            ? summary.items.filter(tpl => String(tpl?.controlType || '').trim() === type)
                            : [];
                          return (
                            <li key={key}>
                              <button
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  width: '100%',
                                  textAlign: 'left',
                                  fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                                  fontSize: 14,
                                }}
                                onContextMenu={(e) => {
                                  try { if (e && e.preventDefault) e.preventDefault(); } catch (_) {}
                                  const x = (e && e.clientX) ? e.clientX : 60;
                                  const y = (e && e.clientY) ? e.clientY : 60;
                                  setControlTypeContextMenu({
                                    companyId: company.id,
                                    profile: company.profile,
                                    controlTypeId: id,
                                    controlTypeKey: ctKey,
                                    controlTypeName: type,
                                    builtin: !!builtin,
                                    hidden: isHidden,
                                    x,
                                    y,
                                  });
                                }}
                                onClick={() => {
                                  // Visa bara klick-feedback tillfälligt; vi vill inte
                                  // ha kvar en "markerad" kontrolltyp efter att
                                  // användaren har klickat bort fokus.
                                  setSelectedTemplateKey(key);
                                  setSpinTemplateTypes(prev => ({ ...prev, [key]: (prev[key] || 0) + 1 }));
                                  setExpandedTemplateTypes(prev => {
                                    const isOpen = !!prev[key];
                                    // Allow max en öppen kontrolltyp åt gången
                                    if (isOpen) return {};
                                    return { [key]: true };
                                  });
                                  if (onSelectProject) {
                                    onSelectProject({ companyId: company.id, profile: company.profile, controlType: type });
                                  }
                                  // Rensa markeringsstate strax efter klick så att
                                  // raden beter sig mer som hover (likt användarlistor).
                                  setTimeout(() => {
                                    try {
                                      setSelectedTemplateKey(prev => (prev === key ? null : prev));
                                    } catch (_) {}
                                  }, 150);
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px 4px',
                                    paddingLeft: 24,
                                    borderRadius: 4,
                                    backgroundColor: isSelected ? '#e3f2fd' : (isHovered ? HOVER_BG : 'transparent'),
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: isSelected ? PRIMARY_BLUE : (isHovered ? PRIMARY_BLUE : 'transparent'),
                                    transition: 'background 0.15s, border-color 0.15s',
                                  }}
                                  onMouseEnter={() => setHoveredTemplateKey(key)}
                                  onMouseLeave={() => { setHoveredTemplateKey(prev => (prev === key ? null : prev)); }}
                                >
                                  <Ionicons
                                    name={icon}
                                    size={14}
                                    color={isHovered ? PRIMARY_BLUE : color}
                                    style={{
                                      marginRight: 8,
                                      transform: `rotate(${spin * 360}deg)`,
                                      transition: 'transform 0.4s ease',
                                    }}
                                  />
                                  <span style={{ color: isHidden ? '#9E9E9E' : (isHovered ? PRIMARY_BLUE : '#333'), fontStyle: isHidden ? 'italic' : 'normal' }}>
                                    {count > 0 ? `${type} (${count})` : type}
                                  </span>
                                  <span
                                    style={{
                                      marginLeft: 'auto',
                                      padding: '1px 6px',
                                      borderRadius: 999,
                                      fontSize: 10,
                                      lineHeight: '14px',
                                      backgroundColor: isHidden ? '#FFEBEE' : '#E8F5E9',
                                      color: isHidden ? '#C62828' : '#2E7D32',
                                      border: `1px solid ${isHidden ? '#FFCDD2' : '#C8E6C9'}`,
                                    }}
                                  >
                                    {isHidden ? 'Inaktiv' : 'Aktiv'}
                                  </span>
                                </div>
                              </button>
                              {isExpanded && (
                                templatesForType.length > 0 ? (
                                  <ul style={{ listStyle: 'none', paddingLeft: 40, marginTop: 2 }}>
                                    {templatesForType.map((tpl) => {
                                      const itemKey = `${company.id}:${type}:${tpl.id}`;
                                      const isHoveredItem = hoveredTemplateItemKey === itemKey;
                                      const isHiddenItem = !!tpl.hidden;
                                      return (
                                        <li key={tpl.id}>
                                          <button
                                            style={{
                                              background: 'transparent',
                                              border: 'none',
                                              padding: 0,
                                              cursor: 'pointer',
                                              width: '100%',
                                              textAlign: 'left',
                                              fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                                              fontSize: 13,
                                            }}
                                            onMouseEnter={() => setHoveredTemplateItemKey(itemKey)}
                                            onMouseLeave={() => setHoveredTemplateItemKey(prev => (prev === itemKey ? null : prev))}
                                            onContextMenu={(e) => {
                                              try { if (e && e.preventDefault) e.preventDefault(); } catch (_) {}
                                              const x = (e && e.clientX) ? e.clientX : 60;
                                              const y = (e && e.clientY) ? e.clientY : 60;
                                              setTemplateContextMenu({
                                                companyId: company.id,
                                                profile: company.profile,
                                                controlType: type,
                                                template: tpl,
                                                x,
                                                y,
                                              });
                                            }}
                                            onClick={() => {
                                              if (onSelectProject) {
                                                onSelectProject({
                                                  companyId: company.id,
                                                  profile: company.profile,
                                                  controlType: type,
                                                  templateId: tpl.id,
                                                  template: tpl,
                                                });
                                              }
                                            }}
                                          >
                                            <span
                                              style={{
                                                display: 'block',
                                                padding: '3px 4px',
                                                paddingLeft: 32,
                                                borderRadius: 4,
                                                backgroundColor: isHoveredItem ? HOVER_BG : 'transparent',
                                                borderWidth: 1,
                                                borderStyle: 'solid',
                                                borderColor: isHoveredItem ? PRIMARY_BLUE : 'transparent',
                                                transition: 'background 0.15s, border 0.15s',
                                                color: isHiddenItem ? '#9E9E9E' : (isHoveredItem ? PRIMARY_BLUE : '#444'),
                                                fontStyle: isHiddenItem ? 'italic' : 'normal',
                                              }}
                                            >
                                              {(tpl.title || 'Namnlös mall') + (isHiddenItem ? ' (inaktiv)' : '')}
                                            </span>
                                          </button>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                ) : (
                                  <div style={{ paddingLeft: 48, marginTop: 2, fontSize: 12, color: '#D32F2F' }}>
                                    Inga mallar skapade
                                  </div>
                                )
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                    {templatesMode && templateContextMenu && templateContextMenu.companyId === company.id && (
                      <ContextMenu
                        visible={!!templateContextMenu}
                        x={templateContextMenu.x}
                        y={templateContextMenu.y}
                        onClose={() => setTemplateContextMenu(null)}
                        items={(function () {
                          const ctx = templateContextMenu;
                          const isHidden = !!(ctx && ctx.template && ctx.template.hidden);
                          return [
                            { key: 'edit', label: 'Redigera' },
                            { key: isHidden ? 'activate' : 'hide', label: isHidden ? 'Aktivera' : 'Dölj' },
                            { key: 'delete', label: 'Radera', danger: true },
                          ];
                        })()}
                        onSelect={async (item) => {
                          const ctx = templateContextMenu;
                          setTemplateContextMenu(null);
                          if (!ctx || !ctx.template || !ctx.companyId || !item) return;

                          const compId = ctx.companyId;
                          const tpl = ctx.template;
                          const type = ctx.controlType || '';

                          const refreshTemplatesForCompany = async () => {
                            try {
                              const items = await fetchCompanyMallar(compId);
                              const list = Array.isArray(items) ? items : [];
                              const perType = {};
                              list.forEach((t) => {
                                const ct = String(t?.controlType || '').trim();
                                if (!ct) return;
                                perType[ct] = (perType[ct] || 0) + 1;
                              });
                              setTemplatesByCompany(prev => ({
                                ...prev,
                                [compId]: { total: list.length, perType, items: list },
                              }));
                            } catch (e) {
                              setTemplateFetchErrors(prev => ({ ...prev, [compId]: String(e?.message || e) }));
                            }
                          };

                          const notifyTemplatesChange = () => {
                            try {
                              if (typeof window !== 'undefined') {
                                window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: compId } }));
                              }
                            } catch (_) {}
                          };

                          try {
                            if (item.key === 'edit') {
                              if (onSelectProject) {
                                onSelectProject({
                                  companyId: compId,
                                  profile: ctx.profile,
                                  controlType: type,
                                  templateId: tpl.id,
                                  template: tpl,
                                  openTemplateModal: true,
                                });
                              }
                              return;
                            }

                            if (item.key === 'hide' || item.key === 'activate') {
                              const targetHidden = item.key === 'hide';
                              await updateCompanyMall({ id: tpl.id, patch: { hidden: targetHidden } }, compId);
                              await refreshTemplatesForCompany();
                              notifyTemplatesChange();
                              return;
                            }

                            if (item.key === 'delete') {
                              let confirmed = true;
                              try {
                                if (typeof window !== 'undefined' && window.confirm) {
                                  confirmed = window.confirm(`Är du säker på att du vill radera mallen "${String(tpl.title || 'Namnlös mall')}"? Detta går inte att ångra.`);
                                }
                              } catch (_) { confirmed = true; }
                              if (!confirmed) return;
                              await deleteCompanyMall({ id: tpl.id }, compId);
                              await refreshTemplatesForCompany();
                              notifyTemplatesChange();
                              return;
                            }
                          } catch (e) {
                            try {
                              showToast('Kunde inte uppdatera mall: ' + String(e?.message || e));
                            } catch (_) {}
                          }
                        }}
                      />
                    )}

                    {controlTypesMode && expandedCompanies[company.id] && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 6 }}>
                        {(controlTypesByCompany[company.id] || DEFAULT_CONTROL_TYPES)
                          .filter((ct) => {
                            const type = (ct && (ct.name || ct.key)) || '';
                            if (!type) return false;
                            const q = search.toLowerCase();
                            if (!q) return true;
                            return String(type).toLowerCase().includes(q);
                          })
                          .map((ct) => {
                          const { name, icon, color, key: ctKey, id, hidden, builtin } = ct || {};
                          const type = name || ctKey || '';
                          if (!type) return null;
                          const key = `${company.id}:ct:${id || type}`;
                          const isHidden = !!hidden;
                          const isHovered = hoveredControlTypeKey === key;
                          return (
                            <li key={key}>
                              <button
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'default',
                                  width: '100%',
                                  textAlign: 'left',
                                  fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                                  fontSize: 14,
                                }}
                                onContextMenu={(e) => {
                                  try { if (e && e.preventDefault) e.preventDefault(); } catch (_) {}
                                  const x = (e && e.clientX) ? e.clientX : 60;
                                  const y = (e && e.clientY) ? e.clientY : 60;
                                  setControlTypeContextMenu({
                                    companyId: company.id,
                                    profile: company.profile,
                                    controlTypeId: id,
                                    controlTypeKey: ctKey,
                                    controlTypeName: type,
                                    builtin: !!builtin,
                                    hidden: isHidden,
                                    x,
                                    y,
                                  });
                                }}
                                onClick={() => {
                                  if (onSelectProject) {
                                    onSelectProject({ companyId: company.id, profile: company.profile, controlType: type });
                                  }
                                }}
                              >
                                <div
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '4px 4px',
                                    paddingLeft: 24,
                                    borderRadius: 4,
                                    backgroundColor: isHovered ? HOVER_BG : 'transparent',
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: isHovered ? PRIMARY_BLUE : 'transparent',
                                    transition: 'background 0.15s, border-color 0.15s',
                                  }}
                                  onMouseEnter={() => setHoveredControlTypeKey(key)}
                                  onMouseLeave={() => { setHoveredControlTypeKey(prev => (prev === key ? null : prev)); }}
                                >
                                  <Ionicons
                                    name={icon}
                                    size={14}
                                    color={isHovered ? PRIMARY_BLUE : color}
                                    style={{ marginRight: 8 }}
                                  />
                                  <span style={{ color: isHidden ? '#9E9E9E' : (isHovered ? PRIMARY_BLUE : '#333'), fontStyle: isHidden ? 'italic' : 'normal' }}>{type}</span>
                                  <span
                                    style={{
                                      marginLeft: 'auto',
                                      padding: '1px 6px',
                                      borderRadius: 999,
                                      fontSize: 10,
                                      lineHeight: '14px',
                                      backgroundColor: isHidden ? '#FFEBEE' : '#E8F5E9',
                                      color: isHidden ? '#C62828' : '#2E7D32',
                                      border: `1px solid ${isHidden ? '#FFCDD2' : '#C8E6C9'}`,
                                    }}
                                  >
                                    {isHidden ? 'Inaktiv' : 'Aktiv'}
                                  </span>
                                </div>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    )}

                    {showMembers && expandedCompanies[company.id] && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 6 }}>
                        {(() => {
                          const membersRaw = membersByCompany[company.id];
                          if (!membersRaw) {
                            return (
                              <li style={{ color: '#666', fontSize: 13 }}>Laddar användare…</li>
                            );
                          }
                          const members = Array.isArray(membersRaw) ? membersRaw : [];
                          const q = memberSearchMode ? search.toLowerCase() : '';
                          const matchesQuery = (m) => {
                            if (!q) return true;
                            const text = `${m.displayName || ''} ${m.firstName || ''} ${m.lastName || ''} ${m.email || ''}`.toLowerCase();
                            return text.includes(q);
                          };
                          const admins = members.filter(m => isAdmin(m) && matchesQuery(m));
                          const usersList = members.filter(m => !isAdmin(m) && matchesQuery(m));
                          if (!admins.length && !usersList.length) {
                            return (
                              <li style={{ color: '#D32F2F', fontSize: 13 }}>Inga användare matchar sökningen.</li>
                            );
                          }
                          const roleState = expandedMemberRoles[company.id] || {};

                          const renderMemberRow = (m, groupKey) => {
                            const memKey = String(m?.uid || m?.id || '');
                            const hoverKey = `${company.id}:${groupKey}:${memKey}`;
                            const isHoveredUser = hoveredUser === hoverKey;
                            const disabled = isMemberDisabled(m);
                            const name = getMemberDisplayName(m);

                            return (
                              <li key={memKey}>
                                <div
                                  onMouseEnter={() => setHoveredUser(hoverKey)}
                                  onMouseLeave={() => setHoveredUser(null)}
                                  onContextMenu={(e) => {
                                    try { e.preventDefault(); } catch(_) {}
                                    const x = (e && e.clientX) ? e.clientX : 60;
                                    const y = (e && e.clientY) ? e.clientY : 60;
                                    setUserContextMenu({ companyId: company.id, member: m, x, y });
                                  }}
                                  onClick={() => {
                                    try {
                                      if (onSelectProject) onSelectProject({ companyId: company.id, profile: company.profile, member: m });
                                    } catch (_e) {}
                                  }}
                                  onDoubleClick={() => {
                                    try { setEditingUser({ companyId: company.id, member: m }); } catch (_e) {}
                                  }}
                                  style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: '2px 4px',
                                    borderRadius: 4,
                                    background: isHoveredUser ? HOVER_BG : 'transparent',
                                    borderWidth: 1,
                                    borderStyle: 'solid',
                                    borderColor: isHoveredUser ? PRIMARY_BLUE : 'transparent',
                                    transition: 'background 0.15s, border-color 0.15s',
                                    cursor: 'pointer',
                                    opacity: disabled ? 0.65 : 1,
                                  }}
                                >
                                  <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <div style={{ fontWeight: 600, fontSize: 14, lineHeight: '18px', color: disabled ? '#9E9E9E' : (isHoveredUser ? PRIMARY_BLUE : '#1F2937'), whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {name}
                                    </div>
                                  </div>
                                </div>
                              </li>
                            );
                          };

                          return (
                            <>
                              <li>
                                <div
                                  onClick={() => setExpandedMemberRoles(prev => ({ ...prev, [company.id]: { ...(prev[company.id] || {}), admin: !prev[company.id]?.admin } }))}
                                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
                                >
                                  <span style={{ fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#111' }}>
                                    <Ionicons
                                      name="shield-checkmark"
                                      size={14}
                                      color="#1976D2"
                                      style={{
                                        transform: roleState.admin ? 'rotate(360deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.4s ease'
                                      }}
                                    />
                                    Administratörer ({admins.length})
                                  </span>
                                </div>
                                {roleState.admin && (
                                  <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {admins.length === 0 && (<li style={{ color: '#D32F2F', fontSize: 13 }}>Ingen administratör skapad.</li>)}
                                    {admins.map(m => renderMemberRow(m, 'admin'))}
                                  </ul>
                                )}
                              </li>

                              <li>
                                <div
                                  onClick={() => setExpandedMemberRoles(prev => ({ ...prev, [company.id]: { ...(prev[company.id] || {}), users: !prev[company.id]?.users } }))}
                                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
                                >
                                  <span style={{ fontWeight: 800, fontSize: 13, display: 'inline-flex', alignItems: 'center', gap: 6, color: '#111' }}>
                                    <Ionicons
                                      name="person"
                                      size={14}
                                      color="#555"
                                      style={{
                                        transform: roleState.users ? 'rotate(360deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.4s ease'
                                      }}
                                    />
                                    Användare ({usersList.length})
                                  </span>
                                </div>
                                {roleState.users && (
                                  <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 4, display: 'flex', flexDirection: 'column', gap: 2 }}>
                                    {usersList.length === 0 && (<li style={{ color: '#D32F2F', fontSize: 13 }}>Ingen användare skapad.</li>)}
                                    {usersList.map(m => renderMemberRow(m, 'user'))}
                                  </ul>
                                )}
                              </li>
                            </>
                          );
                        })()}
                      </ul>
                    )}
                  </div>
                </li>
                );
              });
          })()}
        </ul>
      {userContextMenu && (
        <ContextMenu
          visible={!!userContextMenu}
          x={userContextMenu.x}
          y={userContextMenu.y}
          onClose={() => setUserContextMenu(null)}
          items={[{ key: 'delete', label: 'Ta bort användare', danger: true, icon: '🗑️', disabled: String(userContextMenu?.member?.email || '').trim().toLowerCase() === 'marcus@msbyggsystem.se' }]}
          onSelect={async (item) => {
            if (!userContextMenu || item.key !== 'delete') return;
            const compId = userContextMenu.companyId;
            const member = userContextMenu.member || {};
            const uid = member.uid || member.id;
            if (!uid || !compId) return;
            const emailLower = String(member.email || '').trim().toLowerCase();
            if (emailLower === 'marcus@msbyggsystem.se') {
              try { Alert.alert('Skyddad användare', 'Kontot marcus@msbyggsystem.se kan aldrig raderas.'); } catch(_e) { try { window.alert('Kontot marcus@msbyggsystem.se kan aldrig raderas.'); } catch(_) {} }
              setUserContextMenu(null);
              return;
            }
            const name = member.displayName || `${member.firstName || ''} ${member.lastName || ''}`.trim() || member.email || uid;
            const confirmed = (typeof window !== 'undefined') ? window.confirm(`Ta bort användaren ${name} från ${compId}? Detta tar även bort Auth-kontot.`) : true;
            if (!confirmed) return;
            try {
              await deleteUserRemote({ companyId: compId, uid });
              try {
                let mems = [];
                try {
                  const r = await adminFetchCompanyMembers(compId);
                  mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                } catch(_e) {
                  try { mems = await fetchCompanyMembers(compId); } catch(_) { mems = []; }
                }
                setMembersByCompany(prev => ({ ...prev, [compId]: mems }));
              } catch(_) {}
              try { Alert.alert('Borttagen', 'Användaren har tagits bort.'); } catch(_e) { try { window.alert('Användaren har tagits bort.'); } catch(_) {} }
            } catch (e) {
              console.warn('delete user failed', e);
              try { Alert.alert('Fel', 'Kunde inte ta bort användaren: ' + String(e?.message || e)); } catch(_) { try { window.alert('Kunde inte ta bort användaren.'); } catch(__) {} }
            } finally {
              setUserContextMenu(null);
            }
          }}
        />
      )}
      <UserEditModal
        visible={!!editingUser}
        member={editingUser?.member}
        companyId={editingUser?.companyId}
        isNew={!!editingUser?.create}
        onClose={() => setEditingUser(null)}
        saving={savingUser}
        errorMessage={editingUserError}
        onSave={async ({ firstName, lastName, email, role, password, avatarPreset, avatarFile }) => {
          if (!editingUser) return;
          const displayName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || (email ? email.split('@')[0] : '');
          setEditingUserError('');
          setSavingUser(true);
          try {
            if (editingUser.create) {
              // Create new user via callable
              const createRes = await createUserRemote({
                companyId: editingUser.companyId,
                email: String(email || '').trim().toLowerCase(),
                displayName,
                role: role || 'user',
                password: password || undefined,
                firstName: (firstName || '').trim(),
                lastName: (lastName || '').trim(),
                avatarPreset: avatarPreset || undefined,
              });
              const newUid = createRes && (createRes.uid || (createRes.data && createRes.data.uid)) ? (createRes.uid || (createRes.data && createRes.data.uid)) : null;
              const tempPassword = createRes && (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) ? (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) : null;
              if (!newUid) {
                // No uid returned => treat as error and surface any message
                const rawMsg = createRes && (createRes.message || createRes.error || createRes.code) ? String(createRes.message || createRes.error || createRes.code) : 'Okänt fel vid skapande av användare.';
                setEditingUserError('Kunde inte skapa användare: ' + rawMsg);
                try {
                  Alert.alert('Fel', 'Kunde inte skapa användare: ' + rawMsg);
                } catch (_) {
                  try { window.alert('Kunde inte skapa användare: ' + rawMsg); } catch(__) {}
                }
                return;
              }
              if (newUid) {
                let photoURL = undefined;
                if (avatarFile) {
                  try {
                    photoURL = await uploadUserAvatar({ companyId: editingUser.companyId, uid: newUid, file: avatarFile });
                    await updateUserRemote({ companyId: editingUser.companyId, uid: newUid, photoURL, avatarPreset: avatarPreset || undefined });
                  } catch (_e) {
                    // Non-blocking
                  }
                }
                // update client-side users doc
                try { await saveUserProfile(newUid, { displayName, email, firstName, lastName, avatarPreset: avatarPreset || null, photoURL: photoURL || null }); } catch(_e) {}
                try {
                  let mems = [];
                  try {
                    const r = await adminFetchCompanyMembers(editingUser.companyId);
                    mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                  } catch(_e) {
                    try { mems = await fetchCompanyMembers(editingUser.companyId); } catch(_) { mems = []; }
                  }
                  setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems }));
                } catch(_e) {}
              }
              setEditingUser(null);
              const pwToShow = String(password || '').trim() || String(tempPassword || '').trim();
              if (pwToShow) {
                try { Alert.alert('Ok', `Användare skapad. Lösenord: ${pwToShow}`); } catch(_e) { try { window.alert('Användare skapad.'); } catch(_) {} }
              } else {
                try { Alert.alert('Ok', 'Användare skapad.'); } catch(_e) { try { window.alert('Användare skapad.'); } catch(_) {} }
              }
            } else {
              // Edit existing user
              const uid = editingUser.member && (editingUser.member.uid || editingUser.member.id);
              if (!uid) return;
              const theRole = role || (editingUser.member && (editingUser.member.role || (editingUser.member.isAdmin ? 'admin' : 'user'))) || 'user';
              try {
                let photoURL = undefined;
                if (avatarFile) {
                  try {
                    photoURL = await uploadUserAvatar({ companyId: editingUser.companyId, uid, file: avatarFile });
                  } catch (_e) {
                    photoURL = undefined;
                  }
                }
                await updateUserRemote({ companyId: editingUser.companyId, uid, displayName, email, role: theRole, password, photoURL, avatarPreset: avatarPreset || undefined });
                try { await saveUserProfile(uid, { displayName, email, firstName, lastName, avatarPreset: avatarPreset || null, photoURL: photoURL || null }); } catch(_e) {}
                try {
                  if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
                    await auth.currentUser.getIdToken(true);
                  }
                } catch(_e) { /* non-blocking */ }
                try {
                  let mems = [];
                  try {
                    const r = await adminFetchCompanyMembers(editingUser.companyId);
                    mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                  } catch(_e) {
                    try { mems = await fetchCompanyMembers(editingUser.companyId); } catch(_) { mems = []; }
                  }
                  setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems }));
                } catch (_e) {}
                setEditingUser(null);
                try { Alert.alert('Sparat', 'Användaren uppdaterades. Behörighet och uppgifter är sparade.'); } catch(_e) { try { window.alert('Användaren uppdaterades.'); } catch(_) {} }
              } catch (e) {
                console.warn('Could not save user', e);
              }
            }
          } catch (e) {
            console.warn('User save error', e);
            try {
              const code = e && e.code ? String(e.code) : '';

              // Specifik text när licenstaket är nått
              if (code === 'functions/failed-precondition') {
                const msg = 'Max antal användare är uppnådd';
                setEditingUserError(msg);
                Alert.alert('Fel', msg);
                return;
              }

              // För övriga fel: bygg ett mer tekniskt meddelande
              const details = (e && (e.details || e.data)) || '';
              const msgText = e && e.message ? String(e.message) : '';
              let detailText = '';
              if (typeof details === 'string') detailText = details;
              else if (details) {
                try { detailText = JSON.stringify(details); } catch (_) { detailText = String(details); }
              }
              let combined = '';
              if (code) combined += code;
              if (detailText) combined += (combined ? ' — ' : '') + detailText;
              if (!combined && msgText) combined = msgText;
              if (!combined) combined = 'Okänt fel från servern.';
              const finalMsg = 'Kunde inte spara användare: ' + combined;
              setEditingUserError(finalMsg);
              Alert.alert('Fel', finalMsg);
            } catch (_alertErr) {
              const fallbackMsg = 'Kunde inte spara användare: ' + String(e && e.message ? e.message : e);
              setEditingUserError(fallbackMsg);
              try { window.alert(fallbackMsg); } catch (_) {}
            }
          } finally { setSavingUser(false); }
        }}
      />
      {effectiveGlobalAdmin && Object.keys(memberFetchErrors).length > 0 && (
        <div style={{ marginTop: 12, padding: 8, borderRadius: 6, background: '#fff6f6', border: '1px solid #f2c2c2' }}>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Debug: Fel vid hämtning av användare</div>
          {Object.keys(memberFetchErrors).map(k => (
            <div key={k} style={{ fontSize: 13, color: '#b71c1c' }}><strong>{k}:</strong> {String(memberFetchErrors[k]).slice(0, 300)}</div>
          ))}
        </div>
      )}
      </> ) : (
        // Show raw SharePoint structure - folders expand, project folders navigate
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {filteredGroups.length === 0 && (
            <li style={{ textAlign: 'center', marginTop: 24 }}>
              {search.trim() === '' ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
                  <div style={{ color: '#888', fontSize: 15, marginBottom: 8 }}>Inga mappar ännu</div>
                </div>
              ) : (
                <div style={{ color: '#888', fontSize: 15 }}>Inga mappar hittades.</div>
              )}
            </li>
          )}
          {filteredGroups.map(group => {
            const groupIsProject = isProjectFolder(group);
            const groupSpin = spinGroups[group.id] || 0;
            const groupAngle = expandedGroups[group.id] ? (groupSpin * 360 + 90) : (groupSpin * 360);
            
            return (
              <li key={group.id}>
                <div 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    cursor: 'pointer', 
                    userSelect: 'none',
                    padding: '4px 8px',
                    borderRadius: 4,
                  }} 
                  onClick={() => {
                    if (groupIsProject && onSelectProject) {
                      const projectMetadata = extractProjectMetadata(group);
                      if (projectMetadata) {
                        onSelectProject({
                          id: projectMetadata.id,
                          name: projectMetadata.name,
                          number: projectMetadata.number,
                          fullName: projectMetadata.fullName,
                          path: projectMetadata.path,
                          type: 'project',
                          ...group,
                        });
                      }
                    } else {
                      toggleGroup(group.id);
                    }
                  }}
                  onContextMenu={(e) => {
                    if (Platform.OS !== 'web') return;
                    try { e.preventDefault(); } catch(_e) {}
                    const x = (e && e.clientX) ? e.clientX : 60;
                    const y = (e && e.clientY) ? e.clientY : 60;
                    setFolderContextMenu({ folder: group, x, y });
                  }}
                >
                  {!groupIsProject && (
                    <span
                      style={{
                        color: '#222',
                        fontSize: 18,
                        fontWeight: 700,
                        marginRight: 6,
                        display: 'inline-block',
                        transform: `rotate(${groupAngle}deg)`,
                        transition: 'transform 0.4s ease',
                      }}
                    >
                      &gt;
                    </span>
                  )}
                  {groupIsProject && (
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: '#43A047',
                        marginRight: 8,
                        display: 'inline-block',
                        border: '1px solid #bbb',
                      }}
                    />
                  )}
                  <span style={{ 
                    fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', 
                    fontWeight: expandedGroups[group.id] ? 700 : (groupIsProject ? 600 : 400), 
                    fontSize: 16, 
                    letterSpacing: 0.1,
                    color: groupIsProject ? '#1976D2' : '#222',
                  }}>{group.name}</span>
                </div>
                {!groupIsProject && expandedGroups[group.id] && (
                  <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 4 }}>
                    {group.loading ? (
                      <li style={{ color: '#888', fontSize: 14, paddingLeft: 8, fontStyle: 'italic' }}>
                        Laddar undermappar...
                      </li>
                    ) : group.error ? (
                      <li style={{ color: '#D32F2F', fontSize: 14, paddingLeft: 8 }}>
                        Fel: {group.error}
                      </li>
                    ) : group.children && group.children.length > 0 ? (
                      group.children.map(sub => {
                        const subIsProject = isProjectFolder(sub);
                        const subSpin = spinSubs[sub.id] || 0;
                        const subAngle = expandedSubs[sub.id] ? (subSpin * 360 + 90) : (subSpin * 360);
                        return (
                          <li key={sub.id}>
                            <div 
                              style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 4px' }} 
                              onClick={() => {
                                if (subIsProject && onSelectProject) {
                                  const projectMetadata = extractProjectMetadata(sub);
                                  if (projectMetadata) {
                                    onSelectProject({
                                      id: projectMetadata.id,
                                      name: projectMetadata.name,
                                      number: projectMetadata.number,
                                      fullName: projectMetadata.fullName,
                                      path: projectMetadata.path,
                                      type: 'project',
                                      ...sub,
                                    });
                                  }
                                } else {
                                  toggleSub(sub.id);
                                }
                              }}
                              onContextMenu={(e) => {
                                if (Platform.OS !== 'web') return;
                                try { e.preventDefault(); } catch(_e) {}
                                const x = (e && e.clientX) ? e.clientX : 60;
                                const y = (e && e.clientY) ? e.clientY : 60;
                                setFolderContextMenu({ folder: sub, x, y });
                              }}
                            >
                              {!subIsProject && (
                                <span
                                  style={{
                                    color: '#222',
                                    fontSize: 15,
                                    fontWeight: 600,
                                    marginRight: 6,
                                    display: 'inline-block',
                                    transform: `rotate(${subAngle}deg)`,
                                    transition: 'transform 0.4s ease',
                                  }}
                                >
                                  &gt;
                                </span>
                              )}
                              {subIsProject && (
                                <span
                                  style={{
                                    width: 10,
                                    height: 10,
                                    borderRadius: 5,
                                    backgroundColor: '#43A047',
                                    marginRight: 8,
                                    display: 'inline-block',
                                    border: '1px solid #bbb',
                                  }}
                                />
                              )}
                              <span style={{ 
                                fontWeight: expandedSubs[sub.id] ? 600 : (subIsProject ? 600 : 400), 
                                fontSize: 15,
                                color: subIsProject ? '#1976D2' : '#222',
                              }}>{sub.name}</span>
                            </div>
                            {!subIsProject && expandedSubs[sub.id] && (
                              <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 2 }}>
                                {sub.loading ? (
                                  <li style={{ color: '#888', fontSize: 14, paddingLeft: 8, fontStyle: 'italic' }}>
                                    Laddar undermappar från SharePoint...
                                  </li>
                                ) : sub.error ? (
                                  <li style={{ color: '#D32F2F', fontSize: 14, paddingLeft: 8 }}>
                                    Fel: {sub.error}
                                  </li>
                                ) : sub.children && sub.children.length > 0 ? (
                                  sub.children.map(childFolder => {
                                    const childIsProject = isProjectFolder(childFolder);
                                    return (
                                      <RecursiveFolderItem
                                        key={childFolder.id}
                                        folder={childFolder}
                                        level={1}
                                        expandedSubs={expandedSubs}
                                        spinSubs={spinSubs}
                                        toggleSub={(folderId) => {
                                          if (childIsProject && onSelectProject) {
                                            const projectMetadata = extractProjectMetadata(childFolder);
                                            if (projectMetadata) {
                                              onSelectProject({
                                                id: projectMetadata.id,
                                                name: projectMetadata.name,
                                                number: projectMetadata.number,
                                                fullName: projectMetadata.fullName,
                                                path: projectMetadata.path,
                                                type: 'project',
                                                ...childFolder,
                                              });
                                            }
                                          } else {
                                            toggleSub(folderId);
                                          }
                                        }}
                                        setFolderContextMenu={setFolderContextMenu}
                                        resolvedCompanyId={resolvedCompanyId}
                                        loadFolderChildren={loadFolderChildren}
                                        setHierarchy={setHierarchy}
                                        isProject={childIsProject}
                                        onSelectProject={onSelectProject}
                                      />
                                    );
                                  })
                                ) : (
                                  <li style={{ color: '#D32F2F', fontSize: 14, paddingLeft: 8, fontStyle: 'italic' }}>
                                    Mappen är tom
                                  </li>
                                )}
                              </ul>
                            )}
                          </li>
                        );
                      })
                    ) : (
                      <li style={{ color: '#888', fontSize: 14, paddingLeft: 8, fontStyle: 'italic' }}>
                        {group.loading ? 'Laddar undermappar från SharePoint...' : 'Inga undermappar i SharePoint'}
                      </li>
                    )}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
      </div>
      
      {/* SharePoint Folder Context Menu */}
      {folderContextMenu && (
        <ContextMenu
          visible={!!folderContextMenu}
          x={folderContextMenu.x}
          y={folderContextMenu.y}
          onClose={() => setFolderContextMenu(null)}
          items={[
            { key: 'createFolder', label: 'Lägg till mapp i SharePoint' },
            { key: 'rename', label: 'Byt namn' },
            { key: 'delete', label: 'Radera mapp', danger: true },
          ]}
          onSelect={async (item) => {
            const folder = folderContextMenu?.folder;
            if (!folder || !resolvedCompanyId) return;
            setFolderContextMenu(null);

            try {
              if (item.key === 'createFolder') {
                const folderName = window.prompt('Namn på ny mapp:', '');
                if (!folderName || !folderName.trim()) return;
                
                const parentPath = folder.path || folder.name;
                await createSharePointFolder(resolvedCompanyId, parentPath, folderName.trim());
                
                // Refresh hierarchy to show new folder
                const sharePointFolders = await getSharePointHierarchy(resolvedCompanyId, null);
                setHierarchy(sharePointFolders || []);
                
                showToast(`Mappen "${folderName}" har skapats i SharePoint`);
              } else if (item.key === 'delete') {
                const confirmed = window.confirm(`Är du säker på att du vill radera mappen "${folder.name}" från SharePoint? Detta går inte att ångra.`);
                if (!confirmed) return;
                
                const folderPath = folder.path || folder.name;
                await deleteItem(resolvedCompanyId, folderPath);
                
                // Refresh hierarchy
                const sharePointFolders = await getSharePointHierarchy(resolvedCompanyId, null);
                setHierarchy(sharePointFolders || []);
                
                showToast(`Mappen "${folder.name}" har raderats från SharePoint`);
              } else if (item.key === 'rename') {
                const newName = window.prompt('Nytt namn på mappen:', folder.name);
                if (!newName || !newName.trim() || newName.trim() === folder.name) return;
                
                // Note: SharePoint rename requires PATCH to update item name
                // For now, show message that rename should be done in SharePoint
                window.alert('För att byta namn på mappar, gör det direkt i SharePoint. Ändringen synkas automatiskt.');
              }
            } catch (error) {
              console.error('[ProjectSidebar] Error handling folder action:', error);
              showToast(`Fel: ${error?.message || 'Okänt fel'}`);
            }
          }}
        />
      )}
      
      {/* SharePoint Connection Status Indicator */}
      {!companiesMode && resolvedCompanyId && (
        <div style={{
          position: 'sticky',
          bottom: 0,
          left: 0,
          right: 0,
          padding: '10px 16px',
          backgroundColor: '#fff',
          borderTop: '2px solid #ddd',
          fontSize: 12,
          color: '#666',
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          zIndex: 100,
          boxShadow: '0 -2px 8px rgba(0,0,0,0.15)',
          minHeight: 40
        }}>
          {sharePointStatus.checking ? (
            <>
              <Ionicons name="hourglass-outline" size={16} color="#888" />
              <span>Kontrollerar SharePoint...</span>
            </>
          ) : sharePointStatus.connected ? (
            <>
              <Ionicons name="checkmark-circle" size={18} color="#43A047" />
              <span style={{ color: '#43A047', fontWeight: '600' }}>SharePoint: Ansluten</span>
              {sharePointStatus.siteId && (
                <span style={{ color: '#999', fontSize: 10, marginLeft: 'auto' }}>
                  Site: {sharePointStatus.siteId.substring(0, 8)}...
                </span>
              )}
            </>
          ) : (
            <>
              <Ionicons name="close-circle" size={18} color="#D32F2F" />
              <span style={{ color: '#D32F2F' }}>SharePoint: Ej ansluten</span>
              {sharePointStatus.error && (
                <span style={{ color: '#999', fontSize: 10, marginLeft: 'auto' }} title={sharePointStatus.error}>
                  {sharePointStatus.error.length > 25 ? sharePointStatus.error.substring(0, 25) + '...' : sharePointStatus.error}
                </span>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default ProjectSidebar;
