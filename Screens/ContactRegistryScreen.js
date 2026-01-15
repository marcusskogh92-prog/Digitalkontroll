import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ImageBackground, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';
import WebBreadcrumbHeader from '../components/WebBreadcrumbHeader';
import {
  auth,
  createCompanyContact,
  deleteCompanyContact,
  fetchAllCompanyContacts,
  fetchCompanyContacts,
  fetchCompanyProfile,
  updateCompanyContact,
} from '../components/firebase';

function formatSwedishMobilePhone(input) {
  const raw = String(input || '');
  let digits = raw.replace(/\D+/g, '');

  // If user pastes international format (+46...), normalize to leading 0 when possible.
  if (raw.trim().startsWith('+') && digits.startsWith('46') && digits.length >= 9) {
    digits = `0${digits.slice(2)}`;
  }

  if (!digits) return '';

  // Typical Swedish mobile: 10 digits, formatted as 3-3-2-2 with spaces.
  const p1 = digits.slice(0, 3);
  const p2 = digits.slice(3, 6);
  const p3 = digits.slice(6, 8);
  const p4 = digits.slice(8, 10);
  const rest = digits.slice(10);

  const parts = [];
  if (p1) parts.push(p1);
  if (p2) parts.push(p2);
  if (p3) parts.push(p3);
  if (p4) parts.push(p4);

  if (rest) {
    for (let i = 0; i < rest.length; i += 2) {
      parts.push(rest.slice(i, i + 2));
    }
  }

  return parts.join(' ').trim();
}

export default function ContactRegistryScreen({ navigation, route }) {
  const routeCompanyId = String(route?.params?.companyId || '').trim();
  const routeAllCompanies = !!route?.params?.allCompanies;

  const [companyId, setCompanyId] = useState(() => routeCompanyId);
  const [companyName, setCompanyName] = useState('');

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);

  const [allCompaniesMode, setAllCompaniesMode] = useState(routeAllCompanies);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');

  const [visibleLimit, setVisibleLimit] = useState(500);

  const [editingId, setEditingId] = useState(null);
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [editingCompanyName, setEditingCompanyName] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuContact, setRowMenuContact] = useState(null);

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Role gating + company lock logic (same approach as other admin pages)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const emailLower = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.com' || emailLower === 'marcus.skogh@msbyggsystem';

        let tokenRes = null;
        try {
          tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null);
        } catch (_e) {
          tokenRes = null;
        }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const cid = companyFromClaims || stored || '';

        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));

        const allowHeader = isEmailSuperadmin || isSuperClaim || isAdminClaim;
        const canSeeAll = isEmailSuperadmin || isSuperClaim || (cid === 'MS Byggsystem' && isAdminClaim);

        if (!mounted) return;
        setShowHeaderUserMenu(!!allowHeader);
        setCanSeeAllCompanies(!!canSeeAll);

        // Allow tools (same pattern as other pages)
        if (cid === 'MS Byggsystem' && isAdminClaim) setAllowedTools(true);
        if (isEmailSuperadmin || isSuperClaim) setAllowedTools(true);

        // If user is not allowed header/tools, bounce to Home
        if (!allowHeader) {
          try {
            navigation?.navigate?.('Home');
          } catch (_e) {}
        }

        // Initialize selection and mode
        if (routeAllCompanies && (isEmailSuperadmin || isSuperClaim)) {
          setAllCompaniesMode(true);
        } else {
          setAllCompaniesMode(false);
        }

        // If not global, lock companyId to claims/stored
        if (!canSeeAll) {
          if (cid) {
            setCompanyId(cid);
          }
        } else {
          // If we don't have a companyId yet, use route/stored/claims
          if (!String(routeCompanyId || '').trim() && cid && !String(companyId || '').trim()) {
            setCompanyId(cid);
          }
        }
      } catch (_e) {
        if (mounted) {
          setAllowedTools(false);
          setCanSeeAllCompanies(false);
          setShowHeaderUserMenu(false);
        }
      }
    })();

    return () => {
      mounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Keep selected companyId in storage (used by dropdown + other pages)
  useEffect(() => {
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid) return;
        try {
          await AsyncStorage.setItem('dk_companyId', cid);
        } catch (_e) {}
        if (Platform.OS === 'web') {
          try {
            window?.localStorage?.setItem?.('dk_companyId', cid);
          } catch (_e) {}
        }
      } catch (_e) {}
    })();
  }, [companyId]);

  // Resolve companyName for header
  useEffect(() => {
    (async () => {
      try {
        if (allCompaniesMode) {
          setCompanyName('Alla företag');
          return;
        }
        const cid = String(companyId || '').trim();
        if (!cid) {
          setCompanyName('');
          return;
        }
        const profile = await fetchCompanyProfile(cid).catch(() => null);
        const name = String(profile?.companyName || profile?.name || '').trim();
        setCompanyName(name || cid);
      } catch (_e) {
        setCompanyName(String(companyId || '').trim());
      }
    })();
  }, [companyId, allCompaniesMode]);

  const filtered = useMemo(() => {
    const list = Array.isArray(contacts) ? contacts : [];
    const q = String(search || '').trim().toLowerCase();
    const base = q
      ? list.filter((c) => {
      try {
        const n = String(c?.name || '').toLowerCase();
        const r = String(c?.role || '').toLowerCase();
        const p = String(c?.phone || '').toLowerCase();
        const e = String(c?.email || '').toLowerCase();
        const cn = String(c?.companyName || c?.companyId || '').toLowerCase();
        return n.includes(q) || r.includes(q) || p.includes(q) || e.includes(q) || cn.includes(q);
      } catch (_e) {
        return false;
      }
    })
      : list;

    // Stable sorting: company (in all-companies mode), then name.
    try {
      const collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('sv', { sensitivity: 'base' }) : null;
      const cmp = (a, b) => {
        if (!collator) return String(a || '').localeCompare(String(b || ''));
        return collator.compare(String(a || ''), String(b || ''));
      };
      return base.slice().sort((a, b) => {
        if (allCompaniesMode) {
          const c1 = String(a?.companyName || a?.companyId || '').trim();
          const c2 = String(b?.companyName || b?.companyId || '').trim();
          const cc = cmp(c1, c2);
          if (cc !== 0) return cc;
        }
        const n1 = String(a?.name || '').trim();
        const n2 = String(b?.name || '').trim();
        const nc = cmp(n1, n2);
        if (nc !== 0) return nc;
        const r1 = String(a?.role || '').trim();
        const r2 = String(b?.role || '').trim();
        return cmp(r1, r2);
      });
    } catch (_e) {
      return base;
    }
  }, [contacts, search]);

  useEffect(() => {
    setVisibleLimit(500);
  }, [search, companyId, allCompaniesMode]);

  const shownContacts = useMemo(() => {
    return filtered.slice(0, Math.max(1, Number(visibleLimit) || 500));
  }, [filtered, visibleLimit]);

  const showNotice = (msg) => {
    const m = String(msg || '').trim();
    if (!m) return;
    setNotice(m);
    setTimeout(() => {
      try { setNotice(''); } catch (_e) {}
    }, 1800);
  };

  const copyToClipboard = async (value) => {
    const text = String(value || '').trim();
    if (!text) return false;
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_e) {}

    // Fallback for older browsers
    try {
      if (typeof document !== 'undefined') {
        const el = document.createElement('textarea');
        el.value = text;
        el.style.position = 'fixed';
        el.style.left = '-9999px';
        document.body.appendChild(el);
        el.focus();
        el.select();
        const ok = document.execCommand && document.execCommand('copy');
        document.body.removeChild(el);
        return !!ok;
      }
    } catch (_e) {}

    return false;
  };

  const openMailto = (addr) => {
    try {
      const email = String(addr || '').trim();
      if (!email) return;
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      window.location.href = `mailto:${encodeURIComponent(email)}`;
    } catch (_e) {}
  };

  const openTel = (num) => {
    try {
      const phoneValue = String(num || '').trim();
      if (!phoneValue) return;
      if (Platform.OS !== 'web' || typeof window === 'undefined') return;
      const digits = phoneValue.replace(/\s+/g, '');
      window.location.href = `tel:${encodeURIComponent(digits)}`;
    } catch (_e) {}
  };

  const clearForm = () => {
    setEditingId(null);
    setEditingCompanyId('');
    setEditingCompanyName('');
    setName('');
    setRole('');
    setPhone('');
    setEmail('');
    setError('');
    setNotice('');
  };

  const startNew = () => {
    clearForm();
  };

  const startEdit = (contact) => {
    try {
      setEditingId(String(contact?.id || '').trim() || null);
      setEditingCompanyId(String(contact?.companyId || '').trim());
      setEditingCompanyName(String(contact?.companyName || '').trim());
      setName(String(contact?.name || ''));
      setRole(String(contact?.role || ''));
      setPhone(formatSwedishMobilePhone(contact?.phone || ''));
      setEmail(String(contact?.email || ''));
      setError('');
    } catch (_e) {}
  };

  const loadContacts = async () => {
    setLoading(true);
    setError('');
    try {
      const cid = String(companyId || '').trim();
      const items = allCompaniesMode
        ? await fetchAllCompanyContacts({ max: 5000 })
        : (cid ? await fetchCompanyContacts(cid) : []);

      if (!mountedRef.current) return;
      setContacts(Array.isArray(items) ? items : []);
    } catch (e) {
      if (!mountedRef.current) return;
      setError(String(e?.message || e || 'Kunde inte hämta kontakter.'));
      setContacts([]);
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    // Load when mode/company changes
    if (allCompaniesMode) {
      loadContacts();
      return;
    }
    if (!String(companyId || '').trim()) {
      setContacts([]);
      return;
    }
    loadContacts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, allCompaniesMode]);

  const handleSave = async () => {
    const isAll = !!allCompaniesMode;

    if (isAll) {
      if (!editingId || !String(editingCompanyId || '').trim()) {
        setError('För att lägga till ny kontakt: välj ett företag i listan till vänster först.');
        return;
      }
    }

    const cid = isAll ? String(editingCompanyId || '').trim() : String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag först.');
      return;
    }

    const n = String(name || '').trim();
    if (!n) {
      setError('Namn är obligatoriskt.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const payloadBase = {
        name: n,
        role: String(role || '').trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
      };

      const payload = editingId
        ? {
          ...payloadBase,
          // Avoid writing "Alla företag" into contacts when editing global view
          ...(isAll ? (editingCompanyName ? { companyName: editingCompanyName } : {}) : { companyName: String(companyName || '').trim() || cid }),
        }
        : {
          ...payloadBase,
          companyName: String(companyName || '').trim() || cid,
        };

      if (editingId) {
        await updateCompanyContact({ id: editingId, patch: payload }, cid);
      } else {
        await createCompanyContact(payload, cid);
      }

      await loadContacts();
      clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    try {
      const cid = allCompaniesMode ? String(contact?.companyId || '').trim() : String(companyId || '').trim();
      if (!cid) return;
      const id = String(contact?.id || '').trim();
      if (!id) return;

      const label = String(contact?.name || '').trim() || 'kontakten';
      if (Platform.OS === 'web') {
        // eslint-disable-next-line no-alert
        const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Radera ${label}?`) : false;
        if (!ok) return;
      } else {
        const ok = await new Promise((resolve) => {
          Alert.alert('Radera kontakt', `Radera ${label}?`, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!ok) return;
      }

      await deleteCompanyContact({ id }, cid);
      await loadContacts();
      if (editingId && editingId === id) clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte radera.'));
    }
  };

  const isWeb = Platform.OS === 'web';

  const openRowMenu = (e, contact) => {
    try {
      if (Platform.OS !== 'web') {
        // Native fallback: use Alert with actions
        const c = contact || null;
        if (!c) return;
        Alert.alert('Kontakt', String(c?.name || 'Kontakt'), [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Redigera', onPress: () => startEdit(c) },
          { text: 'Radera', style: 'destructive', onPress: () => handleDelete(c) },
        ]);
        return;
      }

      // Web: right-click
      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? ne?.locationX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? ne?.locationY ?? 64);
      setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
      setRowMenuContact(contact || null);
      setRowMenuVisible(true);
    } catch (_err) {
      setRowMenuPos({ x: 20, y: 64 });
      setRowMenuContact(contact || null);
      setRowMenuVisible(true);
    }
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'copy_email', label: 'Kopiera e-post', icon: <Ionicons name="copy-outline" size={16} color="#0f172a" /> },
    { key: 'copy_phone', label: 'Kopiera telefon', icon: <Ionicons name="copy-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" /> },
  ];

  // Simple native fallback
  if (!isWeb) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Kontaktregister</Text>
        <Text style={{ marginTop: 8, color: '#555' }}>Kontaktregister är just nu optimerat för webbläget.</Text>
      </View>
    );
  }

  const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
  const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

  const RootContainer = ImageBackground;
  const rootProps = {
    source: require('../assets/images/inlogg.webb.png'),
    resizeMode: 'cover',
    imageStyle: { width: '100%', height: '100%' },
  };

  const hasSelectedCompany = !!String(companyId || '').trim();

  const RightPanel = (
    <View style={{ padding: 8 }}>
      <Text style={{ fontSize: 13, fontWeight: '800', color: '#111', marginBottom: 10 }}>{editingId ? 'Redigera kontakt' : 'Lägg till kontakt'}</Text>

      <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Förnamn Efternamn"
        style={{ borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13, marginBottom: 10 }}
      />

      <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Företag</Text>
      <View style={{ borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#F8FAFC', marginBottom: 10 }}>
        <Text style={{ fontSize: 13, color: '#111', fontWeight: '700' }}>{(allCompaniesMode ? (editingCompanyName || 'Alla företag') : (companyName || companyId || '—'))}</Text>
        {allCompaniesMode && !editingId ? (
          <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Välj företag i listan och klicka “Lägg till ny kontakt”.</Text>
        ) : null}
      </View>

      <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Roll</Text>
      <TextInput
        value={role}
        onChangeText={setRole}
        placeholder="t.ex. Platschef"
        style={{ borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13, marginBottom: 10 }}
      />

      <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Telefonnummer</Text>
      <TextInput
        value={phone}
        onChangeText={(t) => setPhone(formatSwedishMobilePhone(t))}
        placeholder="t.ex. 070-123 45 67"
        style={{ borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13, marginBottom: 10 }}
      />

      <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>E-post</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="t.ex. namn@foretag.se"
        style={{ borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13, marginBottom: 12 }}
      />

      {error ? (
        <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', marginBottom: 12 }}>
          <Text style={{ fontSize: 13, color: '#C62828' }}>{error}</Text>
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
        <TouchableOpacity
          onPress={clearForm}
          style={{ paddingVertical: 9, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#f3f4f6' }}
        >
          <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Rensa</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
          disabled={saving || (!hasSelectedCompany && !allCompaniesMode) || (allCompaniesMode && !editingId)}
          style={{
            paddingVertical: 9,
            paddingHorizontal: 14,
            borderRadius: 10,
            backgroundColor: (saving || (!hasSelectedCompany && !allCompaniesMode) || (allCompaniesMode && !editingId)) ? '#94A3B8' : '#0f172a',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Ionicons name="save-outline" size={14} color="#fff" />
          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{saving ? 'Sparar…' : 'Spara'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <RootContainer {...rootProps} style={{ flex: 1 }}>
      <MainLayout
        onSelectProject={(payload) => {
          try {
            const cid = String(payload?.companyId || payload?.id || '').trim();
            if (!cid) return;
            if (!canSeeAllCompanies) {
              // locked admins can't switch company
              return;
            }
            setCompanyId(cid);
            setAllCompaniesMode(false);
            clearForm();
          } catch (_e) {}
        }}
        sidebarTitle="Kontaktregister"
        sidebarIconName="book-outline"
        sidebarIconColor="#0f172a"
        sidebarSearchPlaceholder="Sök företag"
        sidebarCompaniesMode={true}
        sidebarShowMembers={false}
        sidebarHideCompanyActions={true}
        sidebarAutoExpandMembers={true}
        sidebarAllowCompanyManagementActions={false}
        topBar={
          <View style={{ height: 96, paddingLeft: 24, paddingRight: 24, backgroundColor: '#fff', justifyContent: 'center' }}>
            <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                <View style={{ marginRight: 10 }}>
                  {showHeaderUserMenu ? <HeaderUserMenuConditional /> : <HeaderDisplayName />}
                </View>

                {allowedTools ? (
                  <TouchableOpacity
                    style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                    onPress={() => setSupportMenuOpen((s) => !s)}
                  >
                    <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                  </TouchableOpacity>
                ) : null}

                {canSeeAllCompanies ? (
                  <TouchableOpacity
                    style={{ marginLeft: 10, backgroundColor: allCompaniesMode ? '#0f172a' : '#fff', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#0f172a' }}
                    onPress={() => {
                      setAllCompaniesMode((v) => !v);
                      clearForm();
                    }}
                  >
                    <Text style={{ color: allCompaniesMode ? '#fff' : '#0f172a', fontWeight: '800' }}>{allCompaniesMode ? 'Alla företag' : 'Endast valt företag'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }} />
            </View>
          </View>
        }
        rightPanel={RightPanel}
      >
        <View style={dashboardContainerStyle}>
          <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 980, maxWidth: '100%' }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <WebBreadcrumbHeader
                  navigation={navigation}
                  label="Kontaktregister"
                  iconName="book-outline"
                  iconColor="#0f172a"
                  extraLabel={allCompaniesMode ? 'Alla företag' : (companyName || companyId || '')}
                />
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    if (allCompaniesMode) {
                      if (!String(companyId || '').trim()) {
                        setError('Välj ett företag i listan till vänster först.');
                        return;
                      }
                      setAllCompaniesMode(false);
                    }
                    startNew();
                  }}
                  disabled={allCompaniesMode && !String(companyId || '').trim()}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: (allCompaniesMode && !String(companyId || '').trim()) ? '#e2e8f0' : '#e0f2fe',
                    borderWidth: 1,
                    borderColor: (allCompaniesMode && !String(companyId || '').trim()) ? '#e2e8f0' : '#bae6fd',
                  }}
                >
                  <Text style={{ color: '#0f172a', fontWeight: '800', fontSize: 12 }}>Lägg till ny kontakt</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={loadContacts}
                  style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                >
                  <Ionicons name="refresh" size={16} color="#111" />
                </TouchableOpacity>
              </View>
            </View>

            {!allCompaniesMode && !hasSelectedCompany ? (
              <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#5D4037' }}>Välj ett företag i listan till vänster först.</Text>
              </View>
            ) : null}

            {error ? (
              <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#C62828' }}>{error}</Text>
              </View>
            ) : null}

            {notice ? (
              <View style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', marginBottom: 12 }}>
                <Text style={{ fontSize: 13, color: '#065F46', fontWeight: '700' }}>{notice}</Text>
              </View>
            ) : null}

            <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
              <View style={{ padding: 14, backgroundColor: '#fff' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 10 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>Kontakter</Text>
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder={allCompaniesMode ? 'Sök företag, namn, roll, telefon, e-post' : 'Sök namn, roll, telefon, e-post'}
                    style={{ flex: 1, marginLeft: 10, borderWidth: 1, borderColor: '#ddd', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, fontSize: 13 }}
                  />
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: '#64748b' }}>
                    Visar {Math.min(shownContacts.length, filtered.length)} av {filtered.length}
                  </Text>
                  {filtered.length > shownContacts.length ? (
                    <TouchableOpacity
                      onPress={() => setVisibleLimit((v) => Math.min(filtered.length, (Number(v) || 500) + 500))}
                      style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    >
                      <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Visa fler</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                <View style={{ backgroundColor: '#F8FAFC', paddingVertical: 10, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E6E8EC', marginBottom: 10 }}>
                  <View style={{ flexDirection: 'row' }}>
                    {allCompaniesMode ? (
                      <Text style={{ flex: 1.1, fontSize: 12, fontWeight: '800', color: '#334155' }}>Företag</Text>
                    ) : null}
                    <Text style={{ flex: 1.2, fontSize: 12, fontWeight: '800', color: '#334155' }}>Namn</Text>
                    <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '800', color: '#334155' }}>Roll</Text>
                    <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '800', color: '#334155' }}>Telefon</Text>
                    <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '800', color: '#334155' }}>E-post</Text>
                  </View>
                </View>

                {loading ? (
                  <Text style={{ color: '#666', fontSize: 13 }}>Laddar…</Text>
                ) : filtered.length === 0 ? (
                  <Text style={{ color: '#666', fontSize: 13 }}>Inga kontakter ännu.</Text>
                ) : (
                  <ScrollView style={{ maxHeight: 520 }}>
                    <View style={{ borderWidth: 1, borderColor: '#EEF0F3', borderRadius: 10, overflow: 'hidden' }}>
                      {shownContacts.map((c) => (
                        <View
                          key={`${String(c?.companyId || '')}-${String(c?.id || '')}`}
                          onContextMenu={(e) => openRowMenu(e, c)}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#EEF0F3' }}
                        >
                          {allCompaniesMode ? (
                            <Text style={{ flex: 1.1, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.companyName || c?.companyId || '—')}</Text>
                          ) : null}
                          <TouchableOpacity onPress={() => startEdit(c)} onLongPress={() => openRowMenu(null, c)} style={{ flex: 1.2 }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                          </TouchableOpacity>
                          <Text style={{ flex: 1.0, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(c?.role || '—')}</Text>
                          <TouchableOpacity
                            onPress={() => openTel(c?.phone)}
                            onLongPress={() => openRowMenu(null, c)}
                            style={{ flex: 1.0 }}
                            disabled={!String(c?.phone || '').trim()}
                          >
                            <Text style={{ fontSize: 13, color: String(c?.phone || '').trim() ? '#1976D2' : '#555' }} numberOfLines={1}>
                              {String(c?.phone || '—')}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => openMailto(c?.email)}
                            onLongPress={() => openRowMenu(null, c)}
                            style={{ flex: 1.4 }}
                            disabled={!String(c?.email || '').trim()}
                          >
                            <Text style={{ fontSize: 13, color: String(c?.email || '').trim() ? '#1976D2' : '#555' }} numberOfLines={1}>
                              {String(c?.email || '—')}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}

                <ContextMenu
                  visible={rowMenuVisible}
                  x={rowMenuPos.x}
                  y={rowMenuPos.y}
                  items={rowMenuItems}
                  onClose={() => setRowMenuVisible(false)}
                  onSelect={(it) => {
                    try {
                      const c = rowMenuContact;
                      if (!c) return;
                      if (it?.key === 'edit') startEdit(c);
                      if (it?.key === 'copy_email') {
                        copyToClipboard(c?.email).then((ok) => { if (ok) showNotice('E-post kopierad'); });
                      }
                      if (it?.key === 'copy_phone') {
                        copyToClipboard(c?.phone).then((ok) => { if (ok) showNotice('Telefon kopierad'); });
                      }
                      if (it?.key === 'delete') handleDelete(c);
                    } catch (_e) {}
                  }}
                />
              </View>
            </View>
          </View>
        </View>
      </MainLayout>
    </RootContainer>
  );
}
