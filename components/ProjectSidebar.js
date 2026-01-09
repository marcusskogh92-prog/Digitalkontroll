


import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import ContextMenu from './ContextMenu';
import { adminFetchCompanyMembers, auth, createUserRemote, deleteUserRemote, fetchCompanies, fetchCompanyMembers, fetchCompanyProfile, fetchHierarchy, provisionCompanyRemote, saveUserProfile, setCompanyStatusRemote, updateUserRemote } from './firebase';
import UserEditModal from './UserEditModal';





function ProjectSidebar({ onSelectProject, title = 'Projektlista', searchPlaceholder = 'Sök projektnamn eller nr...', companiesMode = false, showMembers = false }) {
  const [search, setSearch] = useState('');
  const [expandedGroups, setExpandedGroups] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [hierarchy, setHierarchy] = useState([]);
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedCompanies, setExpandedCompanies] = useState({});
  const [membersByCompany, setMembersByCompany] = useState({});
  const [hoveredCompany, setHoveredCompany] = useState(null);
  const [hoveredUser, setHoveredUser] = useState(null);
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
  const [spinHome, setSpinHome] = useState(0);
  const [spinAdd, setSpinAdd] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [addCompanyName, setAddCompanyName] = useState('');
  const [addCompanyId, setAddCompanyId] = useState('');
  const [addCompanySaving, setAddCompanySaving] = useState(false);
  const [addCompanyError, setAddCompanyError] = useState('');
  const [toast, setToast] = useState({ visible: false, message: '' });

  const showToast = (msg, timeout = 3000) => {
    try {
      setToast({ visible: true, message: msg });
      setTimeout(() => setToast({ visible: false, message: '' }), timeout);
    } catch (e) {}
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
    } catch (e) {
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

  const isCompanyEnabled = (company) => {
    try {
      const profile = company && company.profile ? company.profile : {};
      if (profile.deleted) return false;
      if (typeof profile.enabled === 'boolean') return profile.enabled;
      if (typeof profile.active === 'boolean') return profile.active;
      // Default: företag utan explicit flagga räknas som aktiva
      return true;
    } catch (e) {
      return true;
    }
  };

  const visibleCompanies = (Array.isArray(companies) ? companies : []).filter((c) => {
    try {
      return !(c && c.profile && c.profile.deleted);
    } catch (e) {
      return true;
    }
  });

  // Ange ditt företags-ID här (eller hämta dynamiskt från inloggning)
  // Prefer prop, otherwise try web localStorage (dk_companyId), fallback to 'testdemo' for demos.
  const propCompanyId = null;
  let companyId = propCompanyId || '';
  try {
    if (!companyId && typeof window !== 'undefined' && window.localStorage) {
      companyId = String(window.localStorage.getItem('dk_companyId') || '').trim();
    }
  } catch (e) { companyId = '' }
  if (!companyId) companyId = 'testdemo';

  useEffect(() => {
    setLoading(true);
    if (companiesMode) {
      fetchCompanies().then(async (items) => {
        if (items && items.length > 0) {
          setCompanies(items);
          setLoading(false);
          return;
        }
        // Fallback: try a small set of expected company ids/names (helps when rules block listing)
        const fallbackIds = ['MS Byggsystem', 'MS Byggsystem DEMO', 'Wilzéns Bygg'];
        const fetched = await Promise.all(fallbackIds.map(async id => {
          try {
            const prof = await fetchCompanyProfile(id);
            return { id, profile: prof };
          } catch (e) { return null; }
        }));
        const good = (fetched || []).filter(x => x && (x.profile || x.id));
        if (good.length > 0) setCompanies(good);
        else setCompanies([]);
        setLoading(false);
      }).catch(async () => {
        // Try fallback on error as well
        const fallbackIds = ['MS Byggsystem', 'MS Byggsystem DEMO', 'Wilzéns Bygg'];
        const fetched = await Promise.all(fallbackIds.map(async id => {
          try { const prof = await fetchCompanyProfile(id); return { id, profile: prof }; } catch(e) { return null; }
        }));
        const good = (fetched || []).filter(x => x && (x.profile || x.id));
        setCompanies(good);
        setLoading(false);
      });
      return;
    }
    fetchHierarchy(companyId).then(items => {
      setHierarchy(items || []);
      setLoading(false);
    }).catch(() => { setHierarchy([]); setLoading(false); });
  }, [companiesMode]);

  // If the current user is a global admin, prefetch members for all companies so we can
  // show member counts in the companies list. This runs after companies are loaded.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companiesMode || !Array.isArray(companies) || companies.length === 0) return;
      try {
        const user = auth && auth.currentUser;
        if (!user || !user.getIdTokenResult) return;
        const token = await user.getIdTokenResult(false).catch(() => null);
        const claims = token && token.claims ? token.claims : {};
        const isGlobalAdmin = !!(claims.admin === true || claims.role === 'admin' || claims.superadmin === true);
        const userEmail = (user && user.email) ? String(user.email).toLowerCase() : '';
        // Allowlist override: allow specific known superadmin emails to see all members
        const isEmailSuperadmin = userEmail === 'marcus@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.com' || userEmail === 'marcus.skogh@msbyggsystem';
        const effectiveGlobalAdmin = isGlobalAdmin || isEmailSuperadmin;
        try { setEffectiveGlobalAdmin(!!effectiveGlobalAdmin); } catch (_) {}
        if (!effectiveGlobalAdmin) return;
        // Fetch members for each company in parallel (but limit concurrency to avoid bursts)
        const results = await Promise.all(companies.map(async (c) => {
          try {
            // Try admin callable first for global admins
            if (effectiveGlobalAdmin && typeof adminFetchCompanyMembers === 'function') {
              try {
                const r = await adminFetchCompanyMembers(c.id).catch(err => { throw err; });
                const mems = r && (r.members || r.data && r.data.members) ? (r.members || r.data && r.data.members) : [];
                return { id: c.id, members: Array.isArray(mems) ? mems : [] };
              } catch(e) {
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
              return { id: c.id, members: Array.isArray(mems) ? mems : [] };
            } catch (e) {
              setMemberFetchErrors(prev => ({ ...prev, [c.id]: String(e?.message || e) }));
              return { id: c.id, members: [] };
            }
          } catch(e) { setMemberFetchErrors(prev => ({ ...prev, [c.id]: String(e?.message || e) })); return { id: c.id, members: [] }; }
        }));
        if (cancelled) return;
        const map = {};
        results.forEach(r => { map[r.id] = r.members; });
        setMembersByCompany(prev => ({ ...prev, ...map }));
      } catch(e) {}
    })();
    return () => { cancelled = true; };
  }, [companiesMode, companies]);

  // Filtrera projekt baserat på söksträng (namn eller "nummer")
  const filterTree = (tree) => tree
    .map(group => {
      const filteredSubs = (group.children || []).map(sub => {
        const filteredProjects = (sub.children || []).filter(project =>
          project.name.toLowerCase().includes(search.toLowerCase()) ||
          String(project.id).toLowerCase().includes(search.toLowerCase())
        );
        return { ...sub, children: filteredProjects };
      }).filter(sub => sub.children.length > 0 || sub.name.toLowerCase().includes(search.toLowerCase()));
      return { ...group, children: filteredSubs };
    })
    .filter(group => group.children.length > 0 || group.name.toLowerCase().includes(search.toLowerCase()));

  const filteredGroups = filterTree(hierarchy);

  const toggleGroup = (id) => setExpandedGroups(prev => ({ ...prev, [id]: !prev[id] }));
  const toggleSub = (id) => setExpandedSubs(prev => ({ ...prev, [id]: !prev[id] }));

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
        // Try SPA navigation first
        try { window.history.pushState(null, '', '/'); window.dispatchEvent(new PopStateEvent('popstate')); return; } catch(_) {}
        window.location.href = '/';
      }
    } catch (e) {}
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
      } catch (e) {
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
            setCompanies(items);
          } else {
            // keep previous companies if fetch returned empty — avoid wiping the UI
            showToast('Uppdateringen gav inga nya företag.');
            setCompanies(prev);
          }

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

        // Project mode: re-fetch hierarchy for current companyId without hiding UI
        const prevH = Array.isArray(hierarchy) ? hierarchy : [];
        const items = await fetchHierarchy(companyId);
        if (Array.isArray(items) && items.length > 0) setHierarchy(items);
        else {
          showToast('Uppdateringen gav inga nya projekt.');
          setHierarchy(prevH);
        }
        return;
      } catch (e) {
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

  const handleShowAuthDebug = async () => {
    try {
      const user = auth && auth.currentUser ? auth.currentUser : null;
      let claims = null;
      if (user && user.getIdTokenResult) {
        try { const t = await user.getIdTokenResult(false); claims = t.claims; } catch(e) { claims = { error: String(e?.message || e) }; }
      }
      const out = { user: user ? { uid: user.uid, email: user.email, displayName: user.displayName } : null, claims };
      alert('Auth debug:\n' + JSON.stringify(out, null, 2));
    } catch (e) {
      alert('Auth debug failed: ' + String(e?.message || e));
    }
  };

  return (
    <div style={{ width: 'max-content', minWidth: 280, background: '#f7f7f7', height: '100vh', overflowY: 'auto', borderRight: '1px solid #ddd', padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', position: 'relative' }}>
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
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, letterSpacing: 0.2, color: '#222', fontSize: 20 }}>{title}</h3>
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
        {/* Toast/snackbar (döljs när dialogen för nytt företag är öppen) */}
        {toast.visible && !addDialogOpen ? (
          <div style={{ position: 'absolute', top: 16, right: 16, background: 'rgba(0,0,0,0.85)', color: '#fff', padding: '8px 12px', borderRadius: 6, fontSize: 13, zIndex: 40 }}>
            {toast.message}
          </div>
        ) : null}
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
      {companiesMode ? (
        <div style={{ marginTop: 8, marginBottom: 8 }}>
          <button
            onClick={handleAddCompany}
            style={{ background: '#fff', border: '1px solid #1976d2', color: '#1976d2', padding: '6px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 14 }}
          >
            + Lägg till företag
          </button>
        </div>
      ) : null}
      <hr style={{ border: 0, borderTop: '1px solid #e0e0e0', margin: '12px 0 16px 0' }} />
      {companiesMode ? (<>
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {visibleCompanies.filter(c => {
            const q = search.toLowerCase();
            const name = String((c.profile && (c.profile.companyName || c.profile.name)) || '').toLowerCase();
              return q === '' || name.includes(q) || String(c.id || '').toLowerCase().includes(q);
          }).length === 0 && (
            <li style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 24 }}>Inga företag hittades.</li>
          )}
              {visibleCompanies.filter(c => {
                 const q = search.toLowerCase();
                const name = String((c.profile && (c.profile.companyName || c.profile.name)) || '').toLowerCase();
                return q === '' || name.includes(q) || String(c.id || '').toLowerCase().includes(q);
              }).map(company => {
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
                      style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', flex: 1,
                        background: hoveredCompany === company.id ? '#eee' : 'transparent',
                        borderRadius: 4,
                        padding: hoveredCompany === company.id ? '2px 4px' : 0,
                        borderWidth: 1,
                        borderStyle: 'solid',
                        borderColor: hoveredCompany === company.id ? '#1976D2' : 'transparent',
                        transition: 'background 0.15s, border 0.15s',
                      }}
                    >
                      <button
                        style={{
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        color: '#222',
                        textAlign: 'left',
                        fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                        fontSize: 15,
                        letterSpacing: 0.1,
                        display: 'flex',
                        alignItems: 'center',
                        width: '100%',
                        justifyContent: 'space-between',
                        whiteSpace: 'nowrap',
                      }}
                        onClick={async () => {
                          setExpandedCompanies(prev => ({ ...prev, [company.id]: !prev[company.id] }));
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
                              } catch (e) {
                                setMembersByCompany(prev => ({ ...prev, [company.id]: [] }));
                              }
                            }
                          }
                          if (onSelectProject) {
                            onSelectProject({ companyId: company.id, profile: company.profile });
                          }
                        }}
                      >
                        <span style={{ fontWeight: hoveredCompany === company.id ? '700' : '600', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Ionicons
                            name="briefcase"
                            size={16}
                            color="#555"
                            style={{
                              transform: expandedCompanies[company.id] ? 'rotate(360deg)' : 'rotate(0deg)',
                              transition: 'transform 0.4s ease'
                            }}
                          />
                          {(company.profile && (company.profile.companyName || company.profile.name)) || company.id}
                          {(() => {
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
                            // Pragmatisk fallback: visa standard 10 licenser om inget annat hittas
                            if (limit === null) {
                              limit = 10;
                            }
                            if (typeof limit === 'number') return ` (${used}/${limit})`;
                            return ` (${used})`;
                          })()}
                        </span>
                        <span
                          style={{
                            marginLeft: 12,
                            padding: '2px 10px',
                            minWidth: 40,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'flex-end',
                          }}
                          title={companyEnabled ? 'Aktivt' : 'Pausat'}
                        >
                          <span
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 999,
                              backgroundColor: companyEnabled ? '#4CAF50' : '#E53935',
                              border: '1px solid rgba(0,0,0,0.08)',
                              boxSizing: 'border-box',
                              display: 'inline-block',
                            }}
                          />
                        </span>
                      </button>
                    </div>
                    <ContextMenu
                      visible={contextMenuVisible && contextMenuCompany && contextMenuCompany.id === company.id}
                      x={contextMenuX}
                      y={contextMenuY}
                      onClose={() => setContextMenuVisible(false)}
                      items={(() => {
                        const enabled = companyEnabled;
                        return [
                          { key: 'addUser', label: 'Lägg till användare', icon: '➕' },
                          { key: 'activate', label: 'Aktivera företag', icon: '▶️', disabled: enabled },
                          { key: 'pause', label: 'Pausa företag', icon: '⏸️', disabled: !enabled },
                          { key: 'deleteCompany', label: 'Radera företag', icon: '🗑️', danger: true },
                        ];
                      })()}
                      onSelect={async (item) => {
                        if (!contextMenuCompany) return;
                        const compId = contextMenuCompany.id;
                        if (item.key === 'addUser') {
                          // Open the same modal as edit, but in "create" mode.
                          setEditingUser({ companyId: compId, member: {}, create: true });
                          setContextMenuVisible(false);
                          return;
                        } else if (item.key === 'activate' || item.key === 'pause') {
                          const wantEnable = item.key === 'activate';
                          const label = wantEnable ? 'aktivera' : 'pausa';
                          const conf = (typeof window !== 'undefined') ? window.confirm(label.charAt(0).toUpperCase() + label.slice(1) + ' företaget ' + compId + '?') : true;
                          if (!conf) return;
                          try {
                            const res = await setCompanyStatusRemote({ companyId: compId, enabled: wantEnable });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte ändra företagsstatus (servern avvisade ändringen).');
                              return;
                            }
                            try { Alert.alert('Ok', `Företaget ${wantEnable ? 'aktiverades' : 'pausades'}.`); } catch(e) { try { window.alert('Ok'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(e) {}
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte ändra företagsstatus: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte ändra status: ' + combined); } catch(_) { try { window.alert('Kunde inte ändra status'); } catch(__) {} }
                          }
                        } else if (item.key === 'deleteCompany') {
                          const conf = (typeof window !== 'undefined') ? window.confirm('Radera företaget ' + compId + '? Detta tar inte bort historik, men döljer företaget i listan.') : true;
                          if (!conf) return;
                          try {
                            const res = await setCompanyStatusRemote({ companyId: compId, deleted: true, enabled: false });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              showToast('Kunde inte radera företaget (servern avvisade ändringen).');
                              return;
                            }
                            setCompanies(prev => (Array.isArray(prev) ? prev.filter(c => c.id !== compId) : prev));
                            try { Alert.alert('Borttaget', 'Företaget har dolts från listan.'); } catch(e) { try { window.alert('Företaget har dolts från listan.'); } catch(_) {} }
                          } catch (e) {
                            const rawCode = e && e.code ? String(e.code) : '';
                            const rawMsg = e && e.message ? String(e.message) : String(e || '');
                            const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                            showToast('Kunde inte radera företaget: ' + combined);
                            try { Alert.alert('Fel', 'Kunde inte radera företaget: ' + combined); } catch(_) { try { window.alert('Kunde inte radera företaget.'); } catch(__) {} }
                          }
                        }
                      }}
                    />

                    {showMembers && expandedCompanies[company.id] && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 6 }}>
                        {(() => {
                          const members = (membersByCompany[company.id] || []);
                          if (!members.length) {
                            return (
                              <li style={{ color: '#D32F2F', fontSize: 13 }}>Inga användare skapade än.</li>
                            );
                          }
                          const admins = members.filter(isAdmin);
                          const usersList = members.filter(m => !isAdmin(m));
                          const roleState = expandedMemberRoles[company.id] || {};
                          return (
                            <>
                              <li>
                                <div
                                  onClick={() => setExpandedMemberRoles(prev => ({ ...prev, [company.id]: { ...(prev[company.id] || {}), admin: !prev[company.id]?.admin } }))}
                                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
                                >
                                  <span style={{ fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                    <Ionicons
                                      name="shield-checkmark"
                                      size={14}
                                      color="#1976D2"
                                      style={{
                                        transform: roleState.admin ? 'rotate(360deg)' : 'rotate(0deg)',
                                        transition: 'transform 0.4s ease'
                                      }}
                                    />
                                    Admin ({admins.length})
                                  </span>
                                </div>
                                {roleState.admin && (
                                  <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 2 }}>
                                    {admins.length === 0 && (<li style={{ color: '#888', fontSize: 13 }}>Inga administratörer hittades.</li>)}
                                    {admins.map(m => {
                                      const memKey = String(m.uid || m.id || '');
                                      const isHoveredUser = hoveredUser === `${company.id}:${memKey}`;
                                      return (
                                        <li key={memKey}>
                                          <div
                                            onMouseEnter={() => setHoveredUser(`${company.id}:${memKey}`)}
                                            onMouseLeave={() => setHoveredUser(null)}
                                            onContextMenu={(e) => {
                                              try { e.preventDefault(); } catch(_) {}
                                              const x = (e && e.clientX) ? e.clientX : 60;
                                              const y = (e && e.clientY) ? e.clientY : 60;
                                              setUserContextMenu({ companyId: company.id, member: m, x, y });
                                            }}
                                            onClick={() => {
                                              // open edit form
                                              setEditingUser({ companyId: company.id, member: m });
                                            }}
                                            style={{
                                              fontSize: 14,
                                              color: '#333',
                                              display: 'block',
                                              borderRadius: 4,
                                              padding: '4px 4px',
                                              paddingLeft: 24,
                                              background: isHoveredUser ? '#eee' : 'transparent',
                                              borderWidth: 1,
                                              borderStyle: 'solid',
                                              borderColor: isHoveredUser ? '#1976D2' : 'transparent',
                                              transition: 'background 0.15s, border 0.15s',
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            <span style={{ fontWeight: isHoveredUser ? '700' : '400' }}>{m.displayName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email || m.uid || m.id}</span>
                                          </div>
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </li>

                              <li>
                                <div
                                  onClick={() => setExpandedMemberRoles(prev => ({ ...prev, [company.id]: { ...(prev[company.id] || {}), users: !prev[company.id]?.users } }))}
                                  style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none', padding: '2px 0' }}
                                >
                                  <span style={{ fontWeight: 700, fontSize: 14, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
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
                                  <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 2 }}>
                                    {usersList.length === 0 && (<li style={{ color: '#888', fontSize: 13 }}>Inga användare hittades.</li>)}
                                    {usersList.map(m => {
                                      const memKey = String(m.uid || m.id || '');
                                      const isHoveredUser = hoveredUser === `${company.id}:${memKey}`;
                                      return (
                                        <li key={memKey}>
                                          <div
                                            onMouseEnter={() => setHoveredUser(`${company.id}:${memKey}`)}
                                            onMouseLeave={() => setHoveredUser(null)}
                                            onContextMenu={(e) => {
                                              try { e.preventDefault(); } catch(_) {}
                                              const x = (e && e.clientX) ? e.clientX : 60;
                                              const y = (e && e.clientY) ? e.clientY : 60;
                                              setUserContextMenu({ companyId: company.id, member: m, x, y });
                                            }}
                                            onClick={() => {
                                              setEditingUser({ companyId: company.id, member: m });
                                            }}
                                            style={{
                                              fontSize: 14,
                                              color: '#333',
                                              display: 'block',
                                              borderRadius: 4,
                                              padding: '4px 4px',
                                              paddingLeft: 24,
                                              background: isHoveredUser ? '#eee' : 'transparent',
                                              borderWidth: 1,
                                              borderStyle: 'solid',
                                              borderColor: isHoveredUser ? '#1976D2' : 'transparent',
                                              transition: 'background 0.15s, border 0.15s',
                                              cursor: 'pointer',
                                              whiteSpace: 'nowrap',
                                            }}
                                          >
                                            <span style={{ fontWeight: isHoveredUser ? '700' : '400' }}>{m.displayName || `${m.firstName || ''} ${m.lastName || ''}`.trim() || m.email || m.uid || m.id}</span>
                                          </div>
                                        </li>
                                      );
                                    })}
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
              })}
        </ul>
      {userContextMenu && (
        <ContextMenu
          visible={!!userContextMenu}
          x={userContextMenu.x}
          y={userContextMenu.y}
          onClose={() => setUserContextMenu(null)}
          items={[{ key: 'delete', label: 'Ta bort användare', danger: true, icon: '🗑️' }]}
          onSelect={async (item) => {
            if (!userContextMenu || item.key !== 'delete') return;
            const compId = userContextMenu.companyId;
            const member = userContextMenu.member || {};
            const uid = member.uid || member.id;
            if (!uid || !compId) return;
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
                } catch(e) {
                  try { mems = await fetchCompanyMembers(compId); } catch(_) { mems = []; }
                }
                setMembersByCompany(prev => ({ ...prev, [compId]: mems }));
              } catch(_) {}
              try { Alert.alert('Borttagen', 'Användaren har tagits bort.'); } catch(e) { try { window.alert('Användaren har tagits bort.'); } catch(_) {} }
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
        onSave={async ({ firstName, lastName, email, role, password }) => {
          if (!editingUser) return;
          const displayName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || (email ? email.split('@')[0] : '');
          setEditingUserError('');
          setSavingUser(true);
          try {
            if (editingUser.create) {
              // Create new user via callable
              const createRes = await createUserRemote({ companyId: editingUser.companyId, email: String(email || '').trim().toLowerCase(), displayName, role: role || 'user' });
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
                // If role or password specified different from default, call updateUserRemote to set them
                const needRoleChange = role && role !== 'user';
                const needPassword = password && password.length > 0;
                if (needRoleChange || needPassword) {
                  try { await updateUserRemote({ companyId: editingUser.companyId, uid: newUid, displayName, email, role: role || 'user', password: needPassword ? password : undefined }); } catch(e) {}
                }
                // update client-side users doc
                try { await saveUserProfile(newUid, { displayName, email, firstName, lastName }); } catch(e) {}
                try {
                  let mems = [];
                  try {
                    const r = await adminFetchCompanyMembers(editingUser.companyId);
                    mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                  } catch(e) {
                    try { mems = await fetchCompanyMembers(editingUser.companyId); } catch(_) { mems = []; }
                  }
                  setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems }));
                } catch(e) {}
              }
              setEditingUser(null);
              try { Alert.alert('Ok', `Användare skapad. Temporärt lösenord: ${tempPassword || ''}`); } catch(e) { try { window.alert('Användare skapad.'); } catch(_) {} }
            } else {
              // Edit existing user
              const uid = editingUser.member && (editingUser.member.uid || editingUser.member.id);
              if (!uid) return;
              const theRole = role || (editingUser.member && (editingUser.member.role || (editingUser.member.isAdmin ? 'admin' : 'user'))) || 'user';
              try {
                await updateUserRemote({ companyId: editingUser.companyId, uid, displayName, email, role: theRole, password });
                try { await saveUserProfile(uid, { displayName, email, firstName, lastName }); } catch(e) {}
                try {
                  if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
                    await auth.currentUser.getIdToken(true);
                  }
                } catch(e) { /* non-blocking */ }
                try {
                  let mems = [];
                  try {
                    const r = await adminFetchCompanyMembers(editingUser.companyId);
                    mems = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
                  } catch(e) {
                    try { mems = await fetchCompanyMembers(editingUser.companyId); } catch(_) { mems = []; }
                  }
                  setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems }));
                } catch (_e) {}
                setEditingUser(null);
                try { Alert.alert('Sparat', 'Användaren uppdaterades. Behörighet och uppgifter är sparade.'); } catch(e) { try { window.alert('Användaren uppdaterades.'); } catch(_) {} }
              } catch (e) {
                console.warn('Could not save user', e);
              }
            }
          } catch (e) {
            console.warn('User save error', e);
            try {
              const code = e && e.code ? String(e.code) : '';
              // För callable functions hamnar vårt meddelande ofta i `details`
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
        <ul style={{ listStyle: 'none', padding: 0 }}>
          {filteredGroups.length === 0 && (
            <li style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 24 }}>Inga projekt hittades.</li>
          )}
          {filteredGroups.map(group => (
            <li key={group.id}>
              <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleGroup(group.id)}>
                <span style={{ color: '#222', fontSize: 18, fontWeight: 700, marginRight: 6, display: 'inline-block', transform: expandedGroups[group.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
                <span style={{ fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, fontSize: 16, letterSpacing: 0.1 }}>{group.name}</span>
              </div>
              {expandedGroups[group.id] && group.children.length > 0 && (
                <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 4 }}>
                  {group.children.map(sub => (
                    <li key={sub.id}>
                      <div style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSub(sub.id)}>
                        <span style={{ color: '#222', fontSize: 15, fontWeight: 600, marginRight: 6, display: 'inline-block', transform: expandedSubs[sub.id] ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
                        <span style={{ fontWeight: 600, fontSize: 15 }}>{sub.name}</span>
                      </div>
                      {expandedSubs[sub.id] && sub.children.length > 0 && (
                        <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 2 }}>
                          {sub.children.map(project => (
                            <li key={project.id}>
                              <button
                                style={{
                                  background: 'none',
                                  border: 'none',
                                  padding: 0,
                                  cursor: 'pointer',
                                  color: '#1976d2',
                                  fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif',
                                  fontSize: 15,
                                  letterSpacing: 0.1,
                                  display: 'flex',
                                  alignItems: 'center',
                                  width: '100%',
                                  justifyContent: 'space-between',
                                }}
                                onClick={() => onSelectProject && onSelectProject(project)}
                              >
                                <span>{project.name}</span>
                                <span style={{ color: '#222', fontSize: 18, marginLeft: 8, display: 'inline-flex', alignItems: 'center' }}>&gt;</span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProjectSidebar;
