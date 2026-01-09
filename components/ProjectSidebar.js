


import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Alert, TouchableOpacity } from 'react-native';
import ContextMenu from './ContextMenu';
import { adminFetchCompanyMembers, auth, createUserRemote, fetchCompanies, fetchCompanyMembers, fetchCompanyProfile, fetchHierarchy, provisionCompanyRemote, saveCompanyProfile, saveUserProfile, updateUserRemote } from './firebase';
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
  const [expandedMemberRoles, setExpandedMemberRoles] = useState({});
  const [editingUser, setEditingUser] = useState(null);
  const [savingUser, setSavingUser] = useState(false);
  const [contextMenuVisible, setContextMenuVisible] = useState(false);
  const [contextMenuX, setContextMenuX] = useState(0);
  const [contextMenuY, setContextMenuY] = useState(0);
  const [contextMenuCompany, setContextMenuCompany] = useState(null);
  const [memberFetchErrors, setMemberFetchErrors] = useState({});
  const [effectiveGlobalAdmin, setEffectiveGlobalAdmin] = useState(false);
  const [hoveredIcon, setHoveredIcon] = useState(null);
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
    return !!(m.isAdmin || m.admin || m.role === 'admin' || (m.customClaims && m.customClaims.admin) || (m.claims && m.claims.admin) || (m.access === 'admin'));
  };

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
        const isEmailSuperadmin = userEmail === 'marcus.skogh@msbyggsystem' || userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.com';
        const effectiveGlobalAdmin = isGlobalAdmin || isEmailSuperadmin;
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
                // record the error for debugging and fall back to client fetch
                setMemberFetchErrors(prev => ({ ...prev, [c.id]: String(e?.message || e) }));
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

  const handleAddCompany = async () => {
    try {
      if (typeof window !== 'undefined') {
        // Ask for a company name first and suggest a safe slug for the company ID
        const name = (window.prompt('Ange företagsnamn (valfritt)', '') || '').trim();
        const suggestedId = name ? slugify(name) : '';
        const id = (window.prompt('Ange företags-ID (kort identifierare)', suggestedId) || '').trim();
        if (!id) return showToast('Avbröts: inget företags-ID angivet');
        // Optimistic UI: add placeholder immediately
        const prev = Array.isArray(companies) ? companies : [];
        setCompanies(prev.concat([{ id, profile: { companyName: name || id } }]));
        showToast('Skapar företag...');

        // Ensure token/claims are fresh before attempting writes that depend on claims
        try {
          if (auth && auth.currentUser && typeof auth.currentUser.getIdToken === 'function') {
            await auth.currentUser.getIdToken(true);
          }
        } catch (e) {
          // Non-fatal: continue but warn user
          showToast('Kunde inte uppdatera autentiseringstoken, försök logga ut/in om fel uppstår');
        }

        // Prefer server-side provisioning (callable) because Firestore rules restrict
        // client-side creation of company profiles to superadmins / MS Byggsystem admins.
        try {
          console.log('[debug] calling provisionCompanyRemote', { id, name });
          const p = await provisionCompanyRemote({ companyId: id, companyName: name || id });
          console.log('[debug] provisionCompanyRemote result', p);
          if (!p || !p.ok) {
            showToast('Företaget skapades men provisioning kunde inte slutföras automatiskt');
          }
        } catch (e) {
          console.error('[debug] provisionCompanyRemote threw', e);
          const code = e && e.code ? e.code : (String(e || '').toLowerCase().includes('permission') ? 'permission-denied' : null);
          if (code === 'permission-denied') {
            showToast('Ingen behörighet: endast superadmin eller MS Byggsystem-admin kan skapa företag');
            // revert optimistic add
            setCompanies(prev);
            return;
          }
          // If provisioning callable isn't available or failed for other reasons,
          // fall back to client-side write attempt so developer environments without
          // functions can still create a company (may be blocked by rules).
          try {
            console.log('[debug] fallback: saving profile to Firestore', { id, name });
            const ok = await saveCompanyProfile(id, { companyName: name || id, createdAt: new Date().toISOString(), enabled: true });
            if (!ok) throw new Error('Client save returned falsy');
            console.log('[debug] fallback saveCompanyProfile succeeded', { id });
          } catch (err) {
            console.error('[debug] fallback saveCompanyProfile threw', err);
            showToast('Kunde inte spara företag till Firebase: ' + String(err?.message || err));
            setCompanies(prev);
            return;
          }
        }
        // Refresh companies list
        try { const items = await fetchCompanies(); if (Array.isArray(items)) setCompanies(items); } catch(_) {}
        showToast('Företaget skapades');
      }
    } catch (e) {
      showToast('Fel vid skapande: ' + String(e?.message || e));
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
    <div style={{ width: 280, background: '#f7f7f7', height: '100vh', overflowY: 'auto', borderRight: '1px solid #ddd', padding: 16, fontFamily: 'Inter_400Regular, Inter, Arial, sans-serif', position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontFamily: 'Inter_700Bold, Inter, Arial, sans-serif', fontWeight: 700, letterSpacing: 0.2, color: '#222', fontSize: 20 }}>{title}</h3>
        {companiesMode ? (
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', position: 'relative' }}>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6, backgroundColor: 'transparent' }}
              onPress={handleGoHome}
              accessibilityLabel="Hem"
              onMouseEnter={() => setHoveredIcon('home')}
              onMouseLeave={() => setHoveredIcon(null)}
            >
              <Ionicons name="home-outline" size={18} color="#1976D2" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6, backgroundColor: 'transparent' }}
              onPress={handleAddCompany}
              accessibilityLabel="Lägg till företag"
              onMouseEnter={() => setHoveredIcon('add')}
              onMouseLeave={() => setHoveredIcon(null)}
            >
              <Ionicons name="add-circle-outline" size={18} color="#1976D2" />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6, backgroundColor: 'transparent' }}
              onPress={handleHardRefresh}
              accessibilityLabel="Uppdatera"
              onMouseEnter={() => setHoveredIcon('refresh')}
              onMouseLeave={() => setHoveredIcon(null)}
            >
              <Ionicons name="refresh" size={18} color="#1976D2" />
            </TouchableOpacity>

            {hoveredIcon ? (
              <div style={{ position: 'absolute', top: '100%', right: 0, marginTop: 6 }}>
                <div style={{ background: '#222', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, whiteSpace: 'nowrap' }}>
                  {hoveredIcon === 'home' ? 'Hem' : (hoveredIcon === 'add' ? 'Lägg till företag' : 'Uppdatera (hård)')}
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
        {/* Toast/snackbar */}
        {toast.visible ? (
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
          {companies.filter(c => {
            const q = search.toLowerCase();
            const name = String((c.profile && (c.profile.companyName || c.profile.name)) || '').toLowerCase();
            return q === '' || name.includes(q) || String(c.id || '').toLowerCase().includes(q);
          }).length === 0 && (
            <li style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 24 }}>Inga företag hittades.</li>
          )}
              {companies.filter(c => {
                const q = search.toLowerCase();
                const name = String((c.profile && (c.profile.companyName || c.profile.name)) || '').toLowerCase();
                return q === '' || name.includes(q) || String(c.id || '').toLowerCase().includes(q);
              }).map(company => (
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
                        transition: 'background 0.15s, border 0.15s'
                      }}
                    >
                      <button
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          color: '#222',
                          fontSize: 18,
                          fontWeight: 700,
                          marginRight: 6,
                          display: 'inline-block',
                          transform: expandedCompanies[company.id] ? 'rotate(90deg)' : 'none',
                          transition: 'transform 0.15s'
                        }}
                        onClick={async () => {
                          setExpandedCompanies(prev => ({ ...prev, [company.id]: !prev[company.id] }));
                          if (showMembers && !membersByCompany[company.id]) {
                            try {
                              const members = await fetchCompanyMembers(company.id).catch(() => []);
                              setMembersByCompany(prev => ({ ...prev, [company.id]: members }));
                            } catch (e) { setMembersByCompany(prev => ({ ...prev, [company.id]: [] })); }
                          }
                        }}
                      >&gt;</button>

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
                        justifyContent: 'flex-start',
                      }}
                        onClick={() => onSelectProject && onSelectProject({ companyId: company.id, profile: company.profile })}
                      >
                        <span style={{ fontWeight: hoveredCompany === company.id ? '700' : '600' }}>
                          {(company.profile && (company.profile.companyName || company.profile.name)) || company.id}
                          {((membersByCompany && membersByCompany[company.id]) ? ` (${(membersByCompany[company.id] || []).length})` : '')}
                        </span>
                      </button>
                    </div>
                    <ContextMenu
                      visible={contextMenuVisible && contextMenuCompany && contextMenuCompany.id === company.id}
                      x={contextMenuX}
                      y={contextMenuY}
                      onClose={() => setContextMenuVisible(false)}
                      items={(() => {
                        const enabled = !!(company.profile && (company.profile.enabled || company.profile.active));
                        return [
                          { key: 'addUser', label: 'Lägg till användare' },
                          { key: 'toggleActive', label: enabled ? 'Avaktivera företag' : 'Aktivera företag', danger: enabled },
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
                        } else if (item.key === 'toggleActive') {
                          const enabled = !!(contextMenuCompany.profile && (contextMenuCompany.profile.enabled || contextMenuCompany.profile.active));
                          const want = !enabled;
                          const conf = (typeof window !== 'undefined') ? window.confirm((want ? 'Aktivera' : 'Avaktivera') + ' företaget ' + compId + '?') : true;
                          if (!conf) return;
                          try {
                            await saveCompanyProfile(compId, { enabled: want });
                            try { Alert.alert('Ok', `Företaget ${want ? 'aktiverades' : 'avaktiverades'}.`); } catch(e) { try { window.alert('Ok'); } catch(_) {} }
                            try {
                              const updated = await fetchCompanyProfile(compId);
                              setCompanies(prev => prev.map(c => c.id === compId ? { ...c, profile: updated || c.profile } : c));
                            } catch(e) {}
                          } catch (e) {
                            try { Alert.alert('Fel', 'Kunde inte ändra status: ' + String(e?.message || e)); } catch(_) { try { window.alert('Kunde inte ändra status'); } catch(__) {} }
                          }
                        }
                      }}
                    />

                    {showMembers && expandedCompanies[company.id] && (
                      <ul style={{ listStyle: 'none', paddingLeft: 16, marginTop: 6 }}>
                        {(membersByCompany[company.id] || []).length === 0 && (
                          <li style={{ color: '#888', fontSize: 13 }}>Inga användare hittades.</li>
                        )}
                        {(() => {
                          const members = (membersByCompany[company.id] || []);
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
                                      <span style={{ color: '#222', fontSize: 15, fontWeight: 600, marginRight: 6, display: 'inline-block', transform: roleState.admin ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
                                      <span style={{ fontWeight: 700, fontSize: 14 }}>Admin ({admins.length})</span>
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
                                            onClick={() => {
                                              // open edit form
                                              setEditingUser({ companyId: company.id, member: m });
                                            }}
                                            style={{
                                              fontSize: 14,
                                              color: '#333',
                                              display: 'block',
                                              borderRadius: 4,
                                              padding: isHoveredUser ? '2px 4px' : '4px 0',
                                              background: isHoveredUser ? '#eee' : 'transparent',
                                              borderWidth: 1,
                                              borderStyle: 'solid',
                                              borderColor: isHoveredUser ? '#1976D2' : 'transparent',
                                              transition: 'background 0.15s, border 0.15s',
                                              cursor: 'pointer'
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
                                  <span style={{ color: '#222', fontSize: 15, fontWeight: 600, marginRight: 6, display: 'inline-block', transform: roleState.users ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}>&gt;</span>
                                  <span style={{ fontWeight: 700, fontSize: 14 }}>Användare ({usersList.length})</span>
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
                                            onClick={() => {
                                              setEditingUser({ companyId: company.id, member: m });
                                            }}
                                            style={{
                                              fontSize: 14,
                                              color: '#333',
                                              display: 'block',
                                              borderRadius: 4,
                                              padding: isHoveredUser ? '2px 4px' : '4px 0',
                                              background: isHoveredUser ? '#eee' : 'transparent',
                                              borderWidth: 1,
                                              borderStyle: 'solid',
                                              borderColor: isHoveredUser ? '#1976D2' : 'transparent',
                                              transition: 'background 0.15s, border 0.15s',
                                              cursor: 'pointer'
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
              ))}
        </ul>
      <UserEditModal
        visible={!!editingUser}
        member={editingUser?.member}
        companyId={editingUser?.companyId}
        isNew={!!editingUser?.create}
        onClose={() => setEditingUser(null)}
        saving={savingUser}
        onSave={async ({ firstName, lastName, email, role, password }) => {
          if (!editingUser) return;
          const displayName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || (email ? email.split('@')[0] : '');
          setSavingUser(true);
          try {
            if (editingUser.create) {
              // Create new user via callable
              const createRes = await createUserRemote({ companyId: editingUser.companyId, email: String(email || '').trim().toLowerCase(), displayName });
              const newUid = createRes && (createRes.uid || createRes.data && createRes.data.uid) ? (createRes.uid || (createRes.data && createRes.data.uid)) : null;
              const tempPassword = createRes && (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) ? (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) : null;
              if (newUid) {
                // If role or password specified different from default, call updateUserRemote to set them
                const needRoleChange = role && role !== 'user';
                const needPassword = password && password.length > 0;
                if (needRoleChange || needPassword) {
                  try { await updateUserRemote({ companyId: editingUser.companyId, uid: newUid, displayName, email, role: role || 'user', password: needPassword ? password : undefined }); } catch(e) {}
                }
                // update client-side users doc
                try { await saveUserProfile(newUid, { displayName, email, firstName, lastName }); } catch(e) {}
                try { const mems = await fetchCompanyMembers(editingUser.companyId); setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems })); } catch(e) {}
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
                try { const mems = await fetchCompanyMembers(editingUser.companyId); setMembersByCompany(prev => ({ ...prev, [editingUser.companyId]: mems })); } catch (_e) {}
                setEditingUser(null);
                try { Alert.alert('Sparat', 'Användaren uppdaterades. Behörighet och uppgifter är sparade.'); } catch(e) { try { window.alert('Användaren uppdaterades.'); } catch(_) {} }
              } catch (e) {
                console.warn('Could not save user', e);
              }
            }
          } catch (e) {
            console.warn('User save error', e);
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
