import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, ImageBackground, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import HeaderAdminMenu from '../components/HeaderAdminMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';
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

  // For superadmins, don't auto-select company - require explicit selection
  const [companyId, setCompanyId] = useState(() => {
    // Only use routeCompanyId if explicitly provided, otherwise start empty for superadmins
    return routeCompanyId || '';
  });
  const [companyName, setCompanyName] = useState('');

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);

  // Always start with allCompaniesMode disabled - require explicit company selection
  const [allCompaniesMode, setAllCompaniesMode] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');

  const [visibleLimit, setVisibleLimit] = useState(500);
  const [sortColumn, setSortColumn] = useState('name'); // 'name', 'contactCompanyName', 'role', 'phone', 'email'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

  const [editingId, setEditingId] = useState(null);
  const [editingCompanyId, setEditingCompanyId] = useState('');
  const [editingCompanyName, setEditingCompanyName] = useState('');
  const [name, setName] = useState('');
  const [contactCompanyName, setContactCompanyName] = useState(''); // Företag som kontakten jobbar på
  const [role, setRole] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [saving, setSaving] = useState(false);

  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuContact, setRowMenuContact] = useState(null);

  // Inline editing state for new contact row
  const [inlineName, setInlineName] = useState('');
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [inlineRole, setInlineRole] = useState('');
  const [inlinePhone, setInlinePhone] = useState('');
  const [inlineEmail, setInlineEmail] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [contactModalVisible, setContactModalVisible] = useState(false);

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
        // Superadmins must select a company first - don't auto-enable allCompaniesMode
        // Always disable allCompaniesMode on mount - require explicit company selection
          setAllCompaniesMode(false);

        // If not global, lock companyId to claims/stored
        if (!canSeeAll) {
          // Regular admins are locked to their company
          if (cid) {
            setCompanyId(cid);
            setAllCompaniesMode(false); // Force single company mode
          }
        } else {
          // Superadmins: Don't auto-select company - require explicit selection
          // Only use routeCompanyId if explicitly provided in route
          if (String(routeCompanyId || '').trim()) {
            // Explicit route companyId - use it
            setCompanyId(routeCompanyId);
            setAllCompaniesMode(false);
          } else {
            // No explicit route companyId - clear it to force selection
            setCompanyId('');
            setAllCompaniesMode(false);
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
        // Never show "Alla företag" - require explicit company selection
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
  }, [companyId]);

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
        const ccn = String(c?.contactCompanyName || '').toLowerCase();
        return n.includes(q) || r.includes(q) || p.includes(q) || e.includes(q) || cn.includes(q) || ccn.includes(q);
      } catch (_e) {
        return false;
      }
    })
      : list;

    // Sort by selected column and direction
    try {
      const collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator('sv', { sensitivity: 'base' }) : null;
      const cmp = (a, b) => {
        if (!collator) return String(a || '').localeCompare(String(b || ''));
        return collator.compare(String(a || ''), String(b || ''));
      };
      return base.slice().sort((a, b) => {
        let valA = '';
        let valB = '';
        
        switch (sortColumn) {
          case 'name':
            valA = String(a?.name || '').trim();
            valB = String(b?.name || '').trim();
            break;
          case 'contactCompanyName':
            valA = String(a?.contactCompanyName || '').trim();
            valB = String(b?.contactCompanyName || '').trim();
            break;
          case 'role':
            valA = String(a?.role || '').trim();
            valB = String(b?.role || '').trim();
            break;
          case 'phone':
            valA = String(a?.phone || '').trim();
            valB = String(b?.phone || '').trim();
            break;
          case 'email':
            valA = String(a?.email || '').trim();
            valB = String(b?.email || '').trim();
            break;
          default:
            valA = String(a?.name || '').trim();
            valB = String(b?.name || '').trim();
        }
        
        const result = cmp(valA, valB);
        return sortDirection === 'asc' ? result : -result;
      });
    } catch (_e) {
      return base;
    }
  }, [contacts, search, sortColumn, sortDirection]);

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
    setContactCompanyName('');
    setRole('');
    setPhone('');
    setEmail('');
    setError('');
    setNotice('');
    setContactModalVisible(false);
  };

  const startNew = () => {
    clearForm();
    setContactModalVisible(true);
  };

  const startEdit = (contact) => {
    try {
      setEditingId(String(contact?.id || '').trim() || null);
      setEditingCompanyId(String(contact?.companyId || '').trim());
      setEditingCompanyName(String(contact?.companyName || '').trim());
      setName(String(contact?.name || ''));
      setContactCompanyName(String(contact?.contactCompanyName || contact?.companyName || '').trim());
      setRole(String(contact?.role || ''));
      setPhone(formatSwedishMobilePhone(contact?.phone || ''));
      setEmail(String(contact?.email || ''));
      setError('');
      setContactModalVisible(true);
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
    // Require a company to be selected (no allCompaniesMode for creating/editing)
    const cid = String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag i listan till vänster först.');
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
        contactCompanyName: String(contactCompanyName || '').trim(), // Företag som kontakten jobbar på
        role: String(role || '').trim(),
        phone: String(phone || '').trim(),
        email: String(email || '').trim(),
      };

      const payload = editingId
        ? {
          ...payloadBase,
          companyName: String(companyName || '').trim() || cid,
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
      showNotice(editingId ? 'Kontakt uppdaterad' : 'Kontakt tillagd');
      // Stay on the same company - don't change mode
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setSaving(false);
    }
  };

  const getContactInitials = (contact) => {
    try {
      const name = String(contact?.name || '').trim();
      if (!name) return '?';
      const parts = name.replace(/\s+/g, ' ').split(' ').filter(Boolean);
      if (parts.length === 1) {
        // Only one name - return first letter
        return parts[0].slice(0, 1).toUpperCase();
      }
      // Multiple names - return first letter of first and last name
      return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
    } catch (_e) {
      return '?';
    }
  };

  const handleSort = (column) => {
    if (sortColumn === column) {
      // Toggle direction if same column
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      // New column, default to ascending
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleInlineSave = async () => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag i listan till vänster först.');
      return;
    }

    const n = String(inlineName || '').trim();
    if (!n) {
      // Don't save if name is empty
      return;
    }

    setInlineSaving(true);
    setError('');
    try {
      const payload = {
        name: n,
        contactCompanyName: String(inlineCompanyName || '').trim(),
        role: String(inlineRole || '').trim(),
        phone: String(inlinePhone || '').trim(),
        email: String(inlineEmail || '').trim(),
        companyName: String(companyName || '').trim() || cid,
      };

      await createCompanyContact(payload, cid);
      await loadContacts();
      
      // Clear inline form
      setInlineName('');
      setInlineCompanyName('');
      setInlineRole('');
      setInlinePhone('');
      setInlineEmail('');
      
      showNotice('Kontakt tillagd');
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setInlineSaving(false);
    }
  };

  const clearInlineForm = () => {
    setInlineName('');
    setInlineCompanyName('');
    setInlineRole('');
    setInlinePhone('');
    setInlineEmail('');
  };

  const handleDelete = async (contact) => {
    try {
      // Always use the selected company - don't allow deleting from other companies
      const cid = String(companyId || '').trim();
      if (!cid) {
        setError('Välj ett företag i listan till vänster först.');
        return;
      }
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
      // Stay on the same company - don't change mode
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
  const dashboardCardStyle = { 
    borderWidth: 1, 
    borderColor: '#E6E8EC', 
    borderRadius: 18, 
    padding: 20, 
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  };

  const RootContainer = ImageBackground;
  const rootProps = {
    source: require('../assets/images/inlogg.webb.png'),
    resizeMode: 'cover',
    imageStyle: { width: '100%', height: '100%' },
  };

  const hasSelectedCompany = !!String(companyId || '').trim();

  // Keyboard event handler for Enter to save (web only) - for modal
  useEffect(() => {
    if (!contactModalVisible || Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Only trigger if we're not in a textarea or multiline input
        const target = e.target;
        if (target && target.tagName !== 'TEXTAREA') {
          e.preventDefault();
          // Check if form is valid and not saving - require company to be selected
          const canSave = !saving && name.trim() && String(companyId || '').trim();
          if (canSave) {
            handleSave();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contactModalVisible, saving, name, allCompaniesMode, editingId, companyId]);

  // Keyboard event handler for Enter to save inline row (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !hasSelectedCompany) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Only trigger if we're in an inline input field
        const target = e.target;
        if (target && target.tagName === 'INPUT' && target.placeholder && 
            ['Namn', 'Företag', 'Roll', 'Telefon', 'E-post'].includes(target.placeholder)) {
          // If in last field (E-post), save
          if (target.placeholder === 'E-post') {
            e.preventDefault();
            if (!inlineSaving && inlineName.trim() && String(companyId || '').trim()) {
              handleInlineSave();
            }
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelectedCompany, inlineSaving, inlineName, companyId]);

  const ContactModalComponent = (
    <Modal
      visible={contactModalVisible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (!saving) {
          clearForm();
        }
      }}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
          onPress={() => {
            if (!saving) {
              clearForm();
            }
          }}
        />
        <View style={{
          backgroundColor: '#fff',
          borderRadius: 18,
          width: 520,
          maxWidth: '96%',
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.18,
          shadowRadius: 18,
          elevation: 12,
          overflow: 'hidden',
        }}>
          <View style={{
            height: 56,
            borderBottomWidth: 1,
            borderBottomColor: '#E6E8EC',
            backgroundColor: '#F8FAFC',
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            paddingHorizontal: 16,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                <Ionicons name={editingId ? "create-outline" : "person-add-outline"} size={20} color="#1976D2" />
              </View>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>{editingId ? 'Redigera kontakt' : 'Lägg till kontakt'}</Text>
            </View>
            <TouchableOpacity
              style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
              onPress={() => {
                if (!saving) {
                  clearForm();
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#111" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ padding: 20 }}>
            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Namn *</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="Förnamn Efternamn"
              style={{ 
                borderWidth: 1, 
                borderColor: name.trim() ? '#E2E8F0' : '#EF4444', 
                paddingVertical: 10, 
                paddingHorizontal: 12, 
                borderRadius: 10, 
                fontSize: 13, 
                marginBottom: 16,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s',
                  outline: 'none',
                } : {}),
              }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Företag</Text>
            <TextInput
              value={contactCompanyName}
              onChangeText={setContactCompanyName}
              placeholder="t.ex. Tekniska Verken, Skanska, etc."
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                // Focus next field (Roll)
                if (Platform.OS === 'web') {
                  setTimeout(() => {
                    try {
                      const nextInput = document.querySelector('input[placeholder*="Platschef"]');
                      if (nextInput) nextInput.focus();
                    } catch(_e) {}
                  }, 50);
                }
              }}
              style={{ 
                borderWidth: 1, 
                borderColor: '#E2E8F0', 
                paddingVertical: 10, 
                paddingHorizontal: 12, 
                borderRadius: 10, 
                fontSize: 13, 
                marginBottom: 16,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s',
                  outline: 'none',
                } : {}),
              }}
            />
            <Text style={{ fontSize: 11, color: '#64748b', marginTop: -12, marginBottom: 16 }}>
              Företag som kontakten jobbar på (kan vara extern kund/leverantör)
            </Text>

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Roll</Text>
      <TextInput
        value={role}
        onChangeText={setRole}
        placeholder="t.ex. Platschef"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                // Focus next field (Telefonnummer)
                if (Platform.OS === 'web') {
                  setTimeout(() => {
                    try {
                      const nextInput = document.querySelector('input[placeholder*="070-123"]');
                      if (nextInput) nextInput.focus();
                    } catch(_e) {}
                  }, 50);
                }
              }}
              style={{ 
                borderWidth: 1, 
                borderColor: '#E2E8F0', 
                paddingVertical: 10, 
                paddingHorizontal: 12, 
                borderRadius: 10, 
                fontSize: 13, 
                marginBottom: 16,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s',
                  outline: 'none',
                } : {}),
              }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Telefonnummer</Text>
      <TextInput
        value={phone}
        onChangeText={(t) => setPhone(formatSwedishMobilePhone(t))}
        placeholder="t.ex. 070-123 45 67"
              returnKeyType="next"
              blurOnSubmit={false}
              onSubmitEditing={() => {
                // Focus next field (E-post)
                if (Platform.OS === 'web') {
                  setTimeout(() => {
                    try {
                      const nextInput = document.querySelector('input[placeholder*="namn@foretag"]');
                      if (nextInput) nextInput.focus();
                    } catch(_e) {}
                  }, 50);
                }
              }}
              style={{ 
                borderWidth: 1, 
                borderColor: '#E2E8F0', 
                paddingVertical: 10, 
                paddingHorizontal: 12, 
                borderRadius: 10, 
                fontSize: 13, 
                marginBottom: 16,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s',
                  outline: 'none',
                } : {}),
              }}
            />

            <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>E-post</Text>
      <TextInput
        value={email}
        onChangeText={setEmail}
        placeholder="t.ex. namn@foretag.se"
              returnKeyType="done"
              blurOnSubmit={true}
              onSubmitEditing={() => {
                // Save on Enter in last field - require company to be selected
                if (!saving && name.trim() && String(companyId || '').trim()) {
                  handleSave();
                }
              }}
              style={{ 
                borderWidth: 1, 
                borderColor: '#E2E8F0', 
                paddingVertical: 10, 
                paddingHorizontal: 12, 
                borderRadius: 10, 
                fontSize: 13, 
                marginBottom: 16,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web' ? {
                  transition: 'border-color 0.2s',
                  outline: 'none',
                } : {}),
              }}
      />

      {error ? (
              <View style={{ 
                paddingVertical: 12, 
                paddingHorizontal: 14, 
                borderRadius: 10, 
                backgroundColor: '#FEF2F2', 
                borderWidth: 1, 
                borderColor: '#FECACA', 
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}>
                <Ionicons name="warning" size={16} color="#DC2626" />
                <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>{error}</Text>
        </View>
      ) : null}

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 12, marginTop: 8 }}>
        <TouchableOpacity
          onPress={clearForm}
                disabled={saving}
                style={{ 
                  paddingVertical: 11, 
                  paddingHorizontal: 18, 
                  borderRadius: 10, 
                  backgroundColor: '#E5E7EB',
                  opacity: saving ? 0.5 : 1,
                  ...(Platform.OS === 'web' ? {
                    transition: 'background-color 0.2s',
                    cursor: saving ? 'not-allowed' : 'pointer',
                  } : {}),
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#111', fontWeight: '700', fontSize: 13 }}>Avbryt</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={handleSave}
                disabled={saving || (!hasSelectedCompany && !allCompaniesMode) || (allCompaniesMode && !editingId) || !name.trim()}
          style={{
                  paddingVertical: 11,
                  paddingHorizontal: 20,
            borderRadius: 10,
                  backgroundColor: (saving || (!hasSelectedCompany && !allCompaniesMode) || (allCompaniesMode && !editingId) || !name.trim()) ? '#94A3B8' : '#1976D2',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
                  ...(Platform.OS === 'web' && !(saving || !hasSelectedCompany || !name.trim()) ? {
                    transition: 'background-color 0.2s, transform 0.1s',
                    cursor: 'pointer',
                  } : {}),
          }}
                activeOpacity={0.85}
        >
                <Ionicons name="save-outline" size={16} color="#fff" />
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>{saving ? 'Sparar…' : 'Spara'}</Text>
        </TouchableOpacity>
      </View>
          </ScrollView>
    </View>
      </View>
    </Modal>
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
            setAllCompaniesMode(false); // Always use single company mode when selecting
            clearForm();
          } catch (_e) {}
        }}
        sidebarTitle="Kontaktregister"
        sidebarIconName="book-outline"
        sidebarIconColor="#1976D2"
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
                <View style={{ marginRight: 10 }}>
                  <HeaderAdminMenu />
                </View>
                {allowedTools ? (
                  <TouchableOpacity
                    style={{ 
                      backgroundColor: supportMenuOpen ? '#1976D2' : '#F1F5F9', 
                      borderRadius: 10, 
                      paddingVertical: 8, 
                      paddingHorizontal: 14, 
                      alignSelf: 'flex-start',
                      borderWidth: 1,
                      borderColor: supportMenuOpen ? '#1976D2' : '#E2E8F0',
                      ...(Platform.OS === 'web' ? {
                        transition: 'all 0.2s',
                        cursor: 'pointer',
                      } : {}),
                    }}
                    onPress={() => setSupportMenuOpen((s) => !s)}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: supportMenuOpen ? '#fff' : '#475569', fontWeight: '700', fontSize: 13 }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
              <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }} />
            </View>
          </View>
        }
        rightPanel={null}
      >
        <View style={dashboardContainerStyle}>
          <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 1200, maxWidth: '100%' }]}>
            {!hasSelectedCompany ? (
              <View style={{ 
                paddingVertical: 16, 
                paddingHorizontal: 18, 
                borderRadius: 12, 
                backgroundColor: '#FEF2F2', 
                borderWidth: 2, 
                borderColor: '#DC2626', 
                marginBottom: 20,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
              }}>
                <Ionicons name="alert-circle" size={24} color="#DC2626" />
                <Text style={{ fontSize: 14, color: '#DC2626', fontWeight: '700' }}>
                  Du måste välja ett företag på vänstersidan för att se och hantera kontakter.
                </Text>
              </View>
            ) : null}

            {error ? (
              <View style={{ 
                paddingVertical: 14, 
                paddingHorizontal: 16, 
                borderRadius: 12, 
                backgroundColor: '#FEF2F2', 
                borderWidth: 1, 
                borderColor: '#FECACA', 
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            {notice ? (
              <View style={{ 
                paddingVertical: 14, 
                paddingHorizontal: 16, 
                borderRadius: 12, 
                backgroundColor: '#ECFDF5', 
                borderWidth: 1, 
                borderColor: '#A7F3D0', 
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <Text style={{ fontSize: 13, color: '#059669', fontWeight: '700' }}>{notice}</Text>
              </View>
            ) : null}

            <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
              <View style={{ padding: 18, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E6E8EC' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {companyName ? (
                      <>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: '#666' }}>{companyName}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#999" />
                      </>
                    ) : null}
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="book-outline" size={20} color="#1976D2" />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>Kontaktregister</Text>
                  </View>
                  <View style={{ flex: 1, maxWidth: 400, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                      placeholder={allCompaniesMode ? 'Sök systemföretag, företag, namn, roll, telefon, e-post' : 'Sök företag, namn, roll, telefon, e-post'}
                      style={{ 
                        flex: 1, 
                        fontSize: 13, 
                        color: '#111',
                        ...(Platform.OS === 'web' ? {
                          outline: 'none',
                        } : {}),
                      }}
                      placeholderTextColor="#94A3B8"
                  />
                </View>
                <TouchableOpacity
                  onPress={loadContacts}
                  style={{
                    paddingVertical: 10, 
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: '#F1F5F9',
                    borderWidth: 1,
                    borderColor: '#E2E8F0',
                    marginLeft: 12,
                    ...(Platform.OS === 'web' ? {
                      transition: 'background-color 0.2s',
                      cursor: 'pointer',
                    } : {}),
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="refresh" size={18} color="#475569" />
                </TouchableOpacity>
                </View>
              </View>
              <View style={{ padding: 18 }}>
                {hasSelectedCompany ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                    Visar {Math.min(shownContacts.length, filtered.length)} av {filtered.length}
                  </Text>
                  {filtered.length > shownContacts.length ? (
                    <TouchableOpacity
                      onPress={() => setVisibleLimit((v) => Math.min(filtered.length, (Number(v) || 500) + 500))}
                          style={{ 
                            paddingVertical: 8, 
                            paddingHorizontal: 14, 
                            borderRadius: 10, 
                            backgroundColor: '#EFF6FF',
                            borderWidth: 1,
                            borderColor: '#BFDBFE',
                            ...(Platform.OS === 'web' ? {
                              transition: 'background-color 0.2s',
                              cursor: 'pointer',
                            } : {}),
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#1976D2', fontWeight: '700', fontSize: 13 }}>Visa fler</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                    <View style={{ 
                      backgroundColor: '#F8FAFC', 
                      paddingVertical: 12, 
                      paddingHorizontal: 14, 
                      borderRadius: 12, 
                      borderWidth: 1, 
                      borderColor: '#E6E8EC', 
                      marginBottom: 12 
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => handleSort('name')}
                          style={{
                            flex: 1.2,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Namn</Text>
                          {sortColumn === 'name' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('contactCompanyName')}
                          style={{
                            flex: 1.1,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Företag</Text>
                          {sortColumn === 'contactCompanyName' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('role')}
                          style={{
                            flex: 1.0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Roll</Text>
                          {sortColumn === 'role' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('phone')}
                          style={{
                            flex: 1.0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Telefon</Text>
                          {sortColumn === 'phone' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('email')}
                          style={{
                            flex: 1.4,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>E-post</Text>
                          {sortColumn === 'email' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                  </View>
                </View>

                {loading ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '500' }}>Laddar kontakter…</Text>
                      </View>
                ) : filtered.length === 0 ? (
                  <View style={{ 
                    padding: 32, 
                    alignItems: 'center', 
                    backgroundColor: '#F8FAFC', 
                    borderRadius: 12, 
                    borderWidth: 1, 
                    borderColor: '#E6E8EC' 
                  }}>
                    <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                      <Ionicons name="book-outline" size={32} color="#1976D2" />
                    </View>
                    <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Inga kontakter ännu</Text>
                    <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                      {search ? 'Inga kontakter matchade din sökning.' : 'Lägg till din första kontakt för att komma igång.'}
                    </Text>
                  </View>
                ) : (
                  <ScrollView 
                    style={{ maxHeight: 520 }}
                    contentContainerStyle={{ flexGrow: 1 }}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                  >
                    <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
                      {/* Inline add row */}
                      {hasSelectedCompany ? (
                        <View style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          paddingVertical: 6, 
                          paddingHorizontal: 14, 
                          borderBottomWidth: 1, 
                          borderBottomColor: '#EEF0F3',
                          backgroundColor: '#F8FAFC',
                        }}>
                          <TextInput
                            value={inlineName}
                            onChangeText={setInlineName}
                            placeholder="Namn"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Företag"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.2,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineCompanyName}
                            onChangeText={setInlineCompanyName}
                            placeholder="Företag"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Roll"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.1,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineRole}
                            onChangeText={setInlineRole}
                            placeholder="Roll"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Telefon"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.0,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlinePhone}
                            onChangeText={(t) => setInlinePhone(formatSwedishMobilePhone(t))}
                            placeholder="Telefon"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="E-post"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.0,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineEmail}
                            onChangeText={setInlineEmail}
                            placeholder="E-post"
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => {
                              if (!inlineSaving && inlineName.trim()) {
                                handleInlineSave();
                              }
                            }}
                            onKeyDown={Platform.OS === 'web' ? (e) => {
                              // If Tab is pressed in the last field, save instead of moving to next element
                              if (e.key === 'Tab' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                                e.preventDefault();
                                if (!inlineSaving && inlineName.trim() && String(companyId || '').trim()) {
                                  handleInlineSave();
                                }
                              }
                            } : undefined}
                            style={{ 
                              flex: 1.4,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      ) : null}
                      {shownContacts.map((c, index) => (
                        <View
                          key={`${String(c?.companyId || '')}-${String(c?.id || '')}`}
                          onContextMenu={(e) => openRowMenu(e, c)}
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            paddingVertical: 8, 
                            paddingHorizontal: 14, 
                            borderBottomWidth: index < shownContacts.length - 1 ? 1 : 0, 
                            borderBottomColor: '#EEF0F3',
                            backgroundColor: '#fff',
                            ...(Platform.OS === 'web' ? {
                              transition: 'background-color 0.15s',
                            } : {}),
                          }}
                          onMouseEnter={Platform.OS === 'web' ? (e) => {
                            if (e?.currentTarget) {
                              e.currentTarget.style.backgroundColor = '#F8FAFC';
                            }
                          } : undefined}
                          onMouseLeave={Platform.OS === 'web' ? (e) => {
                            if (e?.currentTarget) {
                              e.currentTarget.style.backgroundColor = '#fff';
                            }
                          } : undefined}
                        >
                          <TouchableOpacity 
                            onPress={() => startEdit(c)} 
                            onLongPress={() => openRowMenu(null, c)} 
                            style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                            activeOpacity={0.7}
                          >
                            <View style={{ 
                              width: 22, 
                              height: 22, 
                              borderRadius: 11, 
                              backgroundColor: '#1976D2', 
                              alignItems: 'center', 
                              justifyContent: 'center' 
                            }}>
                              <Text style={{ fontSize: 9, fontWeight: '700', color: '#fff' }}>
                                {getContactInitials(c)}
                              </Text>
                            </View>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#111' }} numberOfLines={1}>{String(c?.name || '—')}</Text>
                          </TouchableOpacity>
                          <View style={{ flex: 1.1 }}>
                            <Text style={{ fontSize: 13, color: '#475569', fontWeight: '500' }} numberOfLines={1}>{String(c?.contactCompanyName || '—')}</Text>
                          </View>
                          <Text style={{ flex: 1.0, fontSize: 13, color: '#64748b' }} numberOfLines={1}>{String(c?.role || '—')}</Text>
                          <TouchableOpacity
                            onPress={() => openTel(c?.phone)}
                            onLongPress={() => openRowMenu(null, c)}
                            style={{ flex: 1.0, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            disabled={!String(c?.phone || '').trim()}
                            activeOpacity={0.7}
                          >
                            {String(c?.phone || '').trim() ? (
                              <>
                                <Ionicons name="call-outline" size={14} color="#1976D2" />
                                <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '500' }} numberOfLines={1}>
                              {String(c?.phone || '—')}
                            </Text>
                              </>
                            ) : (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }} numberOfLines={1}>—</Text>
                            )}
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => openMailto(c?.email)}
                            onLongPress={() => openRowMenu(null, c)}
                            style={{ flex: 1.4, flexDirection: 'row', alignItems: 'center', gap: 6 }}
                            disabled={!String(c?.email || '').trim()}
                            activeOpacity={0.7}
                          >
                            {String(c?.email || '').trim() ? (
                              <>
                                <Ionicons name="mail-outline" size={14} color="#1976D2" />
                                <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '500' }} numberOfLines={1}>
                              {String(c?.email || '—')}
                            </Text>
                              </>
                            ) : (
                              <Text style={{ fontSize: 13, color: '#94A3B8' }} numberOfLines={1}>—</Text>
                            )}
                          </TouchableOpacity>
                        </View>
                      ))}
                    </View>
                  </ScrollView>
                )}
                  </>
                ) : (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <Ionicons name="business-outline" size={48} color="#CBD5E1" style={{ marginBottom: 12 }} />
                    <Text style={{ color: '#94A3B8', fontSize: 14, fontWeight: '600', textAlign: 'center' }}>
                      Välj ett företag på vänstersidan för att se kontakter
                    </Text>
                  </View>
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
      {ContactModalComponent}
    </RootContainer>
  );
}
