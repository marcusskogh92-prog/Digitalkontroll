import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ImageBackground, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adminFetchCompanyMembers, auth, fetchAdminAuditForCompany, fetchCompanies, fetchCompanyMembers, fetchCompanyProfile, getAllPhaseSharePointConfigs, getCompanySharePointSiteId, getSharePointSiteForPhase, purgeCompanyRemote, removeSharePointSiteForPhase, resolveCompanyLogoUrl, saveCompanyProfile, saveCompanySharePointSiteId, setCompanyNameRemote, setCompanyStatusRemote, setCompanyUserLimitRemote, setSharePointSiteForPhase, uploadCompanyLogo } from '../components/firebase';
import { PROJECT_PHASES } from '../features/projects/constants';
import HeaderAdminMenu from '../components/HeaderAdminMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageCompany({ navigation }) {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [userLimit, setUserLimit] = useState('10');
  const [companyEnabled, setCompanyEnabled] = useState(true);
  const [companyDeleted, setCompanyDeleted] = useState(false);
  const [companyMemberCount, setCompanyMemberCount] = useState(null);
  const [, setOrgNumber] = useState('');
  const [, setCompanyForm] = useState('');
  const [, setStreetAddress] = useState('');
  const [, setPostalCode] = useState('');
  const [, setCity] = useState('');
  const [, setCountry] = useState('');

  const [, setContactName] = useState('');
  const [, setContactEmail] = useState('');
  const [, setContactPhone] = useState('');

  const [, setBillingAddress] = useState('');
  const [, setBillingReference] = useState('');
  const [, setPaymentTerms] = useState('30');
  const [, setInvoiceMethod] = useState('email');
  const [loading, setLoading] = useState(false);
  const [logoUrl, setLogoUrl] = useState('');
  const [logoUploading, setLogoUploading] = useState(false);
  const [auditEvents, setAuditEvents] = useState([]);
  const [selectedCompanyAuditEvents, setSelectedCompanyAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [companiesForAudit, setCompaniesForAudit] = useState([]);
  const [auditCompanyId, setAuditCompanyId] = useState('');
  const [sharePointSiteId, setSharePointSiteId] = useState('');
  const [sharePointSiteCreating, setSharePointSiteCreating] = useState(false);
  const [sharePointSyncError, setSharePointSyncError] = useState(false);
  const [phaseSharePointConfigs, setPhaseSharePointConfigs] = useState({});
  const [phaseConfigModalVisible, setPhaseConfigModalVisible] = useState(false);
  const [selectedPhaseForConfig, setSelectedPhaseForConfig] = useState(null);
  const [externalSiteIdInput, setExternalSiteIdInput] = useState('');
  const [externalSiteUrlInput, setExternalSiteUrlInput] = useState('');
  const [externalSiteNameInput, setExternalSiteNameInput] = useState('');
  const fileInputRef = useRef(null);
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editUserLimit, setEditUserLimit] = useState(10);
  const editFileInputRef = useRef(null);

  // Keep selected companyId in local storage so global tools (e.g. kontaktregister i dropdown)
  // resolve the correct company.
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

  // Publish breadcrumb segments when company is selected (web only)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const publishBreadcrumb = () => {
      try {
        const segments = [];
        segments.push({ label: 'Startsida', onPress: () => {
          try {
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          } catch (_e) {
            try { navigation.navigate('Home'); } catch (__e) {}
          }
        }});
        segments.push({ label: 'Företag', onPress: () => {
          try {
            if (navigation?.navigate) navigation.navigate('ManageCompany');
          } catch (_e) {}
        }});
        
        if (companyName) {
          segments.push({ label: companyName, onPress: () => {} });
        }

        // Dispatch window event
        const evt = new CustomEvent('dkBreadcrumbUpdate', {
          detail: { scope: 'manageCompany', segments },
        });
        window.dispatchEvent(evt);
      } catch (_e) {
        // Ignore errors
      }
    };

    publishBreadcrumb();
  }, [companyName, navigation]);

  // Web UX: show a clear loading overlay during Firebase/Cloud Function operations.
  const [busyCount, setBusyCount] = useState(0);
  const [busyLabel, setBusyLabel] = useState('');
  const busyLabelLockRef = useRef(null);
  useEffect(() => {
    if (busyCount === 0) {
      busyLabelLockRef.current = null;
      setBusyLabel('');
    }
  }, [busyCount]);

  const lockBusyLabel = (label) => {
    try {
      const next = String(label || '').trim();
      busyLabelLockRef.current = next || null;
      if (next) setBusyLabel(next);
    } catch (_e) {}
  };

  const beginBusy = (label, { silent = false, forceLabel = false } = {}) => {
    try {
      if (!silent && (forceLabel || !busyLabelLockRef.current)) {
        setBusyLabel(String(label || 'Laddar...'));
      }
    } catch (_e) {}
    setBusyCount((c) => (Number.isFinite(c) ? c + 1 : 1));
    return () => setBusyCount((c) => {
      const next = (Number.isFinite(c) ? c - 1 : 0);
      return next < 0 ? 0 : next;
    });
  };

  const loadAuditForCompany = async (cid, limit = 50, { setLogEvents = true, setSelectedCompanyEvents = false } = {}) => {
    const safe = String(cid || '').trim();
    if (!safe) {
      if (setLogEvents) setAuditEvents([]);
      if (setSelectedCompanyEvents) setSelectedCompanyAuditEvents([]);
      return;
    }
    try {
      setAuditLoading(true);
      const items = await fetchAdminAuditForCompany(safe, limit).catch(() => []);
      const normalized = Array.isArray(items) ? items : [];
      if (setLogEvents) setAuditEvents(normalized);
      if (setSelectedCompanyEvents) setSelectedCompanyAuditEvents(normalized);
    } catch (_e) {
      if (setLogEvents) setAuditEvents([]);
      if (setSelectedCompanyEvents) setSelectedCompanyAuditEvents([]);
    } finally {
      setAuditLoading(false);
    }
  };

  // Header is handled globally in App.js (web breadcrumb + logos).

  // Helper component for info items
  const InfoItem = ({ label, value }) => (
    <View style={{ minWidth: 120 }}>
      <Text style={{ fontSize: 11, color: '#999', marginBottom: 4 }}>{label}</Text>
      <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>{value}</Text>
    </View>
  );

  // Open edit modal with current values
  const openEditModal = () => {
    setEditName(companyName || '');
    setEditCompanyId(companyId || '');
    setEditUserLimit(parseInt(userLimit || '10', 10));
    setEditModalVisible(true);
  };

  // Save changes from edit modal
  const handleSaveEditModal = async () => {
    if (!companyId) return;
    
    const endBusy = beginBusy('Sparar ändringar...');
    try {
      // Update company name if changed
      if (editName && editName !== companyName) {
        const res = await setCompanyNameRemote({ companyId, companyName: editName });
        const ok = !!(res && (res.ok === true || res.success === true));
        if (!ok) {
          try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra företagsnamn (servern avvisade ändringen).'); } catch (_e) {}
          return;
        }
      }
      
      // Update userLimit if changed
      if (editUserLimit !== parseInt(userLimit || '10', 10)) {
        const res = await setCompanyUserLimitRemote({ companyId, userLimit: editUserLimit });
        const ok = !!(res && (res.ok === true || res.success === true));
        if (!ok) {
          try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra antal användare (servern avvisade ändringen).'); } catch (_e) {}
          return;
        }
      }
      
      // Reload data
      await handleSelectCompany(companyId);
      
      setEditModalVisible(false);
      try { if (typeof window !== 'undefined') window.alert('Ändringar sparade!'); } catch (_e) {}
    } catch (e) {
      console.error('Error saving company profile:', e);
      try { 
        if (typeof window !== 'undefined') {
          window.alert('Kunde inte spara ändringar: ' + (e?.message || e));
        }
      } catch (_e) {}
    } finally {
      endBusy();
    }
  };

  // Helper component for Action Cards
  const ActionCard = ({ icon, title, text, button, color, onPress, disabled = false }) => {
    const colorStyles = {
      green: { bg: '#3f7f3f', hover: '#2d5d2d' },
      red: { bg: '#C62828', hover: '#B71C1C' },
      blue: { bg: '#1976D2', hover: '#1565C0' }
    };
    const style = colorStyles[color] || colorStyles.blue;

    return (
      <View style={{ 
        flex: 1, 
        minWidth: Platform.OS === 'web' ? 280 : '100%',
        maxWidth: Platform.OS === 'web' ? 400 : '100%',
        backgroundColor: '#fff', 
        borderRadius: 16, 
        padding: 24, 
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
        elevation: 3,
        justifyContent: 'space-between'
      }}>
        <View style={{ gap: 12 }}>
          <View>{icon}</View>
          <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>{title}</Text>
          <Text style={{ fontSize: 13, color: '#666' }}>{text}</Text>
        </View>
        <TouchableOpacity
          onPress={onPress}
          disabled={disabled || busyCount > 0}
          style={{
            marginTop: 16,
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
            backgroundColor: disabled ? '#ccc' : style.bg,
            opacity: (disabled || busyCount > 0) ? 0.6 : 1,
          }}
        >
          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 14, textAlign: 'center' }}>
            {button}
          </Text>
        </TouchableOpacity>
      </View>
    );
  };

  // Decide if interactive tools (manage company/users) should be shown
  const [allowedTools, setAllowedTools] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        if (email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se') {
          if (mounted) {
            setAllowedTools(true);
            setIsSuperadmin(true);
            setShowHeaderUserMenu(true);
          }
          return;
        }
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const companyId = companyFromClaims || stored || '';
        const allowHeader = isEmailSuperadmin || isSuperClaim || isAdminClaim;
        if (mounted) setIsSuperadmin(!!(isEmailSuperadmin || isSuperClaim));
        if (companyId === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowedTools(true);
        }
        if (mounted) setShowHeaderUserMenu(!!allowHeader);
        return;
      } catch(_e) {}
      if (mounted) {
        setAllowedTools(false);
        setIsSuperadmin(false);
        setShowHeaderUserMenu(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (!isSuperadmin) return undefined;
    let mounted = true;
    (async () => {
      try {
        const items = await fetchCompanies().catch(() => []);
        if (!mounted) return;
        setCompaniesForAudit(Array.isArray(items) ? items : []);
      } catch (_e) {
        if (!mounted) return;
        setCompaniesForAudit([]);
      }
    })();
    return () => { mounted = false; };
  }, [isSuperadmin]);

  // Lyssna på global "hem"-händelse från ProjectSidebar (webb)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = () => {
      try {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } catch (_e) {}
    };

    window.addEventListener('dkGoHome', handler);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
    };
  }, [navigation]);

  const handleSave = async () => {
    if (!companyId) return Alert.alert('Fel', 'Ange ett företags-ID');
    const limitNum = parseInt(String(userLimit || '0'), 10) || 0;
    setLoading(true);
    try {
      const trimmedId = String(companyId).trim();
      const trimmedName = String(companyName || '').trim();
      const ok = await saveCompanyProfile(trimmedId, { companyName: trimmedName, userLimit: limitNum });
      if (ok) {
        Alert.alert('Sparat', 'Företagsprofil uppdaterad.');
        // Inform sidebar (web) so it can refresh the visible company profile immediately
        try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
              detail: {
                companyId: trimmedId,
                profile: { companyName: trimmedName, userLimit: limitNum, logoUrl: logoUrl || undefined },
              },
            }));
          }
        } catch (_e) {}
        // Läs tillbaka profilen från Firestore så formuläret visar faktiskt sparat värde
        try {
          const latest = await fetchCompanyProfile(trimmedId);
          if (latest) {
            setCompanyId(trimmedId);
            setCompanyName(latest.companyName || trimmedName);
            setUserLimit(typeof latest.userLimit !== 'undefined' && latest.userLimit !== null ? String(latest.userLimit) : String(limitNum));
            setLogoUrl(latest.logoUrl || '');
          } else {
            setCompanyId(trimmedId);
            setCompanyName(trimmedName);
            setUserLimit(String(limitNum));
          }
        } catch (_e) {
          setCompanyId(trimmedId);
          setCompanyName(trimmedName);
          setUserLimit(String(limitNum));
        }
      } else {
        Alert.alert('Fel', 'Kunde inte spara företagsprofil.');
      }
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    } finally { setLoading(false); }
  };

  const handleLogoFileChange = async (event) => {
    try {
      if (!companyId) {
        Alert.alert('Fel', 'Välj först ett företag i listan till vänster.');
        return;
      }
      const file = event?.target?.files && event.target.files[0] ? event.target.files[0] : null;
      if (!file) return;
      // Visa en direktförhandsvisning på webben medan uppladdning pågår
      try {
        if (Platform.OS === 'web' && typeof URL !== 'undefined' && URL.createObjectURL) {
          const localPreview = URL.createObjectURL(file);
          if (localPreview) {
            setLogoUrl(localPreview);
          }
        }
      } catch (_e) {}
      setLogoUploading(true);
      const safeCompanyId = String(companyId).trim();
      // Use uploadCompanyLogo which tries Azure first, then falls back to Firebase
      const url = await uploadCompanyLogo({ companyId: safeCompanyId, file });
      const ok = await saveCompanyProfile(safeCompanyId, { logoUrl: url });
      if (!ok) {
        throw new Error('Kunde inte spara företagsprofil (logoUrl).');
      }
      // Försök alltid använda samma logik som i headern (hanterar gs://-URL:er)
      try {
        const resolved = await resolveCompanyLogoUrl(safeCompanyId);
        setLogoUrl((resolved || url || '').trim());
      } catch (_e) {
        setLogoUrl(url || '');
      }
      // Inform sidebar / other views about updated profile
      try {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
            detail: {
              companyId: safeCompanyId,
              profile: { logoUrl: url },
            },
          }));
        }
      } catch (_e) {}
      Alert.alert('Logga uppdaterad', 'Företagsloggan har sparats.');
    } catch (e) {
      Alert.alert('Fel', 'Kunde inte ladda upp loggan: ' + String(e?.message || e));
    } finally {
      setLogoUploading(false);
      try {
        if (event?.target) {
          event.target.value = '';
        }
      } catch (_e) {}
    }
  };

  // Handle company selection - used in both web and native, but primarily for web
  const handleSelectCompany = (payload) => {
    try {
      if (payload?.createNew) {
        // Clear form for new company
        try { busyLabelLockRef.current = null; setBusyLabel(''); } catch (_e) {}
        setCompanyId('');
        setCompanyName('');
        setUserLimit('10');
        setCompanyEnabled(true);
        setCompanyDeleted(false);
        setCompanyMemberCount(null);
        setOrgNumber(''); setCompanyForm(''); setStreetAddress(''); setPostalCode(''); setCity(''); setCountry('');
        setContactName(''); setContactEmail(''); setContactPhone('');
        setBillingAddress(''); setBillingReference(''); setPaymentTerms('30'); setInvoiceMethod('email');
        setAuditCompanyId('');
        setAuditEvents([]);
        setSelectedCompanyAuditEvents([]);
        return;
      }
      const cid = String(payload?.companyId || payload?.id || payload || '').trim();
      if (!cid) return;
      
      // If payload is just a string (companyId), fetch the profile
      const prof = payload?.profile || payload || {};
      
      // UX: When selecting a company in this view, keep the overlay label stable.
      // It should always read "Laddar företag…" (not "Hämtar användare…").
      if (Platform.OS === 'web') {
        lockBusyLabel('Laddar företag…');
        const endSelectBusy = beginBusy('', { silent: true });
        try { setTimeout(() => endSelectBusy(), 250); } catch (_e) { endSelectBusy(); }
      }

      if (cid) setCompanyId(cid);
      setCompanyName(prof?.companyName || prof?.name || '');
      setUserLimit((prof && typeof prof.userLimit !== 'undefined') ? String(prof.userLimit) : '10');
      setCompanyEnabled(typeof prof?.enabled === 'boolean' ? !!prof.enabled : true);
      setCompanyDeleted(typeof prof?.deleted === 'boolean' ? !!prof.deleted : false);
      
      // Load SharePoint site ID asynchronously (web only)
      if (Platform.OS === 'web') {
        (async () => {
          try {
            const siteId = await getCompanySharePointSiteId(cid);
            setSharePointSiteId(siteId || '');
            // Reset error status when loading a company with active sync
            if (siteId) {
              setSharePointSyncError(false);
            }
          } catch (_e) {
            setSharePointSiteId('');
            setSharePointSyncError(false);
          }
        })();
        
        // Load phase SharePoint configurations
        (async () => {
          try {
            const configs = await getAllPhaseSharePointConfigs(cid);
            setPhaseSharePointConfigs(configs || {});
          } catch (_e) {
            setPhaseSharePointConfigs({});
          }
        })();
      }
      
      setOrgNumber(prof?.orgNumber || prof?.organisationsnummer || '');
      setCompanyForm(prof?.companyForm || prof?.företagsform || '');
      setStreetAddress(prof?.streetAddress || prof?.address || '');
      setPostalCode(prof?.postalCode || prof?.postnummer || '');
      setCity(prof?.city || prof?.ort || '');
      setCountry(prof?.country || '');
      setContactName(prof?.contactName || '');
      setContactEmail(prof?.contactEmail || '');
      setContactPhone(prof?.contactPhone || '');
      setBillingAddress(prof?.billingAddress || '');
      setBillingReference(prof?.billingReference || '');
      setPaymentTerms(prof?.paymentTerms ? String(prof.paymentTerms) : '30');
      setInvoiceMethod(prof?.invoiceMethod || 'email');
      
      // Förhandsläs logga: om det är en gammal gs://-URL vill vi omvandla den till https.
      (async () => {
        if (Platform.OS === 'web') {
          const endBusy = beginBusy('', { silent: true });
          try {
            const resolved = await resolveCompanyLogoUrl(cid);
            if (resolved) {
              setLogoUrl(resolved);
            } else {
              setLogoUrl(prof?.logoUrl || '');
            }
          } catch (_e) {
            setLogoUrl(prof?.logoUrl || '');
          } finally {
            endBusy();
          }
        } else {
          setLogoUrl(prof?.logoUrl || '');
        }
      })();

      // Hämta senaste admin-loggposter för företaget (endast superadmin på webb)
      if (Platform.OS === 'web' && cid && isSuperadmin) {
        setAuditCompanyId(cid);
        (async () => {
          const endBusy = beginBusy('', { silent: true });
          try {
            await loadAuditForCompany(cid, 50, { setLogEvents: true, setSelectedCompanyEvents: true });
          } finally {
            endBusy();
          }
        })();
      } else {
        setAuditCompanyId('');
        setAuditEvents([]);
        setSelectedCompanyAuditEvents([]);
      }

      // Hämta antal användare för snabb sammanfattning (webb)
      if (Platform.OS === 'web' && cid) {
        (async () => {
          const endBusy = beginBusy('', { silent: true });
          try {
            // Superadmin: försök via Cloud Function (kan läsa alla bolag), annars fallback till Firestore.
            let mems = null;
            if (isSuperadmin) {
              const res = await adminFetchCompanyMembers(cid).catch(() => null);
              if (res && (res.ok === true || res.success === true) && Array.isArray(res.members)) {
                mems = res.members;
              }
            }
            if (!mems) {
              mems = await fetchCompanyMembers(cid).catch(() => []);
            }
            const count = Array.isArray(mems) ? mems.length : null;
            setCompanyMemberCount(typeof count === 'number' ? count : null);
          } catch (_e) {
            setCompanyMemberCount(null);
          } finally {
            endBusy();
          }
        })();
      } else {
        setCompanyMemberCount(null);
      }
      
      // If we only got a companyId string, fetch the full profile
      if (typeof payload === 'string' || (!payload?.profile && !payload?.companyName)) {
        (async () => {
          try {
            const profile = await fetchCompanyProfile(cid);
            if (profile) {
              setCompanyName(profile.companyName || prof?.companyName || '');
              setUserLimit((typeof profile.userLimit !== 'undefined') ? String(profile.userLimit) : '10');
              setCompanyEnabled(typeof profile.enabled === 'boolean' ? !!profile.enabled : true);
              setCompanyDeleted(typeof profile.deleted === 'boolean' ? !!profile.deleted : false);
              if (Platform.OS === 'web') {
                const resolved = await resolveCompanyLogoUrl(cid);
                setLogoUrl(resolved || profile.logoUrl || '');
              } else {
                setLogoUrl(profile.logoUrl || '');
              }
            }
          } catch (_e) {
            // Ignore errors when fetching profile
          }
        })();
      }
    } catch (_e) {}
  };

  // Web: render inside the central dashboard area so layout and background remain consistent
  if (Platform.OS === 'web') {
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardColumnsStyle = { flexDirection: 'row', alignItems: 'flex-start' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const hasSelectedCompany = !!(String(companyId || '').trim() || String(companyName || '').trim());
    const formDisabled = !hasSelectedCompany;
    const userLimitNum = parseInt(String(userLimit || '0'), 10);
    const userLimitNumber = Number.isFinite(userLimitNum) ? userLimitNum : null;
    const seatsLeft = (typeof companyMemberCount === 'number' && typeof userLimitNumber === 'number') ? (userLimitNumber - companyMemberCount) : null;
    const lastAuditTs = (() => {
      try {
        const src = isSuperadmin ? selectedCompanyAuditEvents : [];
        const first = Array.isArray(src) && src.length > 0 ? src[0] : null;
        const ts = first?.ts && first.ts.toDate ? first.ts.toDate() : null;
        return ts;
      } catch (_e) {
        return null;
      }
    })();
    const lastAuditText = lastAuditTs ? lastAuditTs.toLocaleString('sv-SE') : '';
    const statusLabel = companyEnabled ? 'Aktivt' : 'Pausat';

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        {(busyCount > 0 || loading || logoUploading) ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 50,
              backgroundColor: 'rgba(255,255,255,0.55)',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <View style={{ backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, minWidth: 260, maxWidth: 360, alignItems: 'center' }}>
              <ActivityIndicator color="#fff" />
              <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13, textAlign: 'center' }}>
                {busyLabel || (logoUploading ? 'Laddar upp logga…' : (loading ? 'Sparar…' : 'Laddar…'))}
              </Text>
            </View>
          </View>
        ) : null}
        <MainLayout
          onSelectProject={handleSelectCompany}
          sidebarTitle="Företag"
          sidebarIconName="business"
          sidebarIconColor="#2E7D32"
          sidebarSearchPlaceholder="Sök företag"
          sidebarCompaniesMode={true}
          sidebarShowMembers={allowedTools}
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
                      style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                      onPress={() => setSupportMenuOpen(s => !s)}
                    >
                      <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  <View />
                </View>
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            {!hasSelectedCompany ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, maxWidth: 600, alignSelf: 'center', width: '100%' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#666', textAlign: 'center' }}>
                  Välj ett företag i listan till vänster för att visa och ändra dess företagsprofil.
                </Text>
              </View>
            ) : (
              <>
                <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
                {/* HEADER CARD */}
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 24 }}>
                  <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 24, alignItems: 'center' }}>
                    {/* Logo/Image Section */}
                    <View style={{ flex: Platform.OS === 'web' ? 0 : 1, alignItems: 'center', justifyContent: 'center', minWidth: Platform.OS === 'web' ? 200 : '100%' }}>
                      {logoUrl ? (
                        <Image 
                          source={{ uri: logoUrl }} 
                          style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0' }} 
                          resizeMode="contain"
                        />
                      ) : (
                        <View style={{ width: 120, height: 120, borderRadius: 12, backgroundColor: '#f0f0f0', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="business" size={48} color="#ccc" />
                        </View>
                      )}
                    </View>

                    {/* Info Section */}
                    <View style={{ flex: 1, gap: 12 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
                        <Text style={{ fontSize: 24, fontWeight: '600', color: '#222', flex: 1, minWidth: 200 }}>
                          {companyName || companyId}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          {hasSelectedCompany && allowedTools ? (
                            <TouchableOpacity
                              onPress={openEditModal}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 4,
                                paddingVertical: 6,
                                paddingHorizontal: 12,
                                borderRadius: 8,
                                borderWidth: 1,
                                borderColor: '#ddd',
                                backgroundColor: '#fff',
                              }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
                                Ändra
                              </Text>
                              <Ionicons name="chevron-down" size={14} color="#666" />
                            </TouchableOpacity>
                          ) : null}
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                        <InfoItem label="Företags-ID" value={companyId || '—'} />
                        <InfoItem label="Användare" value={typeof companyMemberCount === 'number' ? `${companyMemberCount} st` : '—'} />
                        <InfoItem label="Licenser" value={seatsLeft !== null ? `${seatsLeft} kvar` : (userLimit ? `${userLimit} totalt` : '—')} />
                        <InfoItem label="Skapad" value={lastAuditText ? lastAuditText.split(' ')[0] : '—'} />
                        <InfoItem label="Senast aktiv" value={lastAuditText ? lastAuditText.split(' ')[1] || '—' : '—'} />
                      </View>
                    </View>
                  </View>
                </View>

                {/* ACTION CARDS */}
                {hasSelectedCompany && allowedTools ? (
                  <View style={{ 
                    flexDirection: Platform.OS === 'web' ? 'row' : 'column', 
                    gap: 24, 
                    marginBottom: 24,
                    flexWrap: 'wrap'
                  }}>
                    {/* Status Card */}
                    <ActionCard
                      icon={<Ionicons name="shield-checkmark" size={28} color={companyEnabled ? '#2E7D32' : '#C62828'} />}
                      title="Aktivt"
                      text={companyEnabled ? "Företaget är aktivt och kan användas." : "Företaget är pausat."}
                      button={companyEnabled ? "Inaktivera företag" : "Aktivera företag"}
                      color={companyEnabled ? "green" : "red"}
                      onPress={async () => {
                        if (!companyId) return;
                        const wantEnable = !companyEnabled;
                        const compId = String(companyId).trim();
                        const label = wantEnable ? 'aktivera' : 'pausa';
                        const message = wantEnable
                          ? `Aktivera företaget ${compId}? Användare och admins får åtkomst igen.`
                          : `Pausa företaget ${compId}? All data och kontroller sparas, men användare och admins kan inte logga in.`;
                        const conf = (typeof window !== 'undefined') ? window.confirm(message) : true;
                        if (!conf) return;

                        const endBusy = beginBusy(wantEnable ? 'Aktiverar företag…' : 'Pausar företag…');

                        try {
                          const res = await setCompanyStatusRemote({ companyId: compId, enabled: wantEnable, ...(wantEnable ? { deleted: false } : {}) });
                          const ok = !!(res && (res.ok === true || res.success === true));
                          if (!ok) {
                            try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra företagsstatus (servern avvisade ändringen).'); } catch (_e) {}
                            return;
                          }

                          let latest = null;
                          try { latest = await fetchCompanyProfile(compId).catch(() => null); } catch (_e) { latest = null; }
                          const enabledNow = (latest && typeof latest.enabled === 'boolean') ? !!latest.enabled : wantEnable;
                          const deletedNow = (latest && typeof latest.deleted === 'boolean') ? !!latest.deleted : (wantEnable ? false : companyDeleted);
                          setCompanyEnabled(enabledNow);
                          setCompanyDeleted(deletedNow);

                          try {
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                detail: {
                                  companyId: compId,
                                  profile: { enabled: enabledNow, deleted: deletedNow },
                                },
                              }));
                            }
                          } catch (_e) {}

                          try {
                            if (isSuperadmin) {
                              const sameAsDropdown = String(auditCompanyId || '').trim() === compId;
                              loadAuditForCompany(compId, 50, { setLogEvents: sameAsDropdown, setSelectedCompanyEvents: true });
                            }
                          } catch (_e) {}

                          try { if (typeof window !== 'undefined') window.alert(`Ok: företaget ${label}des.`); } catch (_e) {}
                        } catch (e) {
                          const rawCode = e && e.code ? String(e.code) : '';
                          const rawMsg = e && e.message ? String(e.message) : String(e || '');
                          const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                          try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte ändra status: ' + combined); } catch (_e) {}
                        } finally {
                          endBusy();
                        }
                      }}
                    />

                    {/* SharePoint Card */}
                    <ActionCard
                      icon={
                        <View style={{ position: 'relative', width: 28, height: 28, alignItems: 'flex-start', justifyContent: 'flex-start' }}>
                          <Ionicons name="cloud-outline" size={28} color="#1976D2" />
                          {sharePointSiteId ? (
                            <View style={{ position: 'absolute', top: -2, right: -4, flexDirection: 'row', gap: 2, alignItems: 'center' }}>
                              {/* Status indicator (green check or red error) */}
                              <View style={{ backgroundColor: sharePointSyncError ? '#C62828' : '#2E7D32', borderRadius: 10, width: 18, height: 18, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                                <Ionicons name={sharePointSyncError ? "close" : "checkmark"} size={10} color="#fff" />
                              </View>
                              {/* Debug button */}
                              <TouchableOpacity
                                onPress={async () => {
                                  // Debug button - show SharePoint site info
                                  if (!companyId) return;
                                  const compId = String(companyId).trim();
                                  try {
                                    const profile = await fetchCompanyProfile(compId);
                                    const siteId = profile?.sharePointSiteId || '';
                                    const webUrl = profile?.sharePointWebUrl || '';
                                    const debugInfo = `SharePoint Debug Info:\n\n` +
                                      `Site ID: ${siteId || 'N/A'}\n` +
                                      `Web URL: ${webUrl || 'N/A'}\n` +
                                      `Company ID: ${compId}\n` +
                                      `Status: ${siteId ? (sharePointSyncError ? 'Linked (Error)' : 'Linked') : 'Not linked'}\n\n` +
                                      `Debug Actions:\n` +
                                      `- Klicka OK för att testa error status\n` +
                                      `(Detta är bara för test - error status kan återställas)`;
                                    if (typeof window !== 'undefined') {
                                      window.alert(debugInfo);
                                      // Temporär test: Visa rött fel för test
                                      const testError = window.confirm('Vill du testa rött fel-status? (Detta är bara för test)');
                                      if (testError) {
                                        setSharePointSyncError(true);
                                        setTimeout(() => {
                                          // Återställ efter 5 sekunder för demo
                                          if (typeof window !== 'undefined') {
                                            window.alert('Error status satt. Den återställs automatiskt efter 5 sekunder för demo.');
                                          }
                                          setTimeout(() => {
                                            setSharePointSyncError(false);
                                          }, 5000);
                                        }, 100);
                                      }
                                    }
                                  } catch (e) {
                                    console.error('[SharePoint Debug] Error:', e);
                                    try { if (typeof window !== 'undefined') window.alert('Debug info kunde inte hämtas: ' + (e?.message || e)); } catch (_e) {}
                                  }
                                }}
                                style={{ width: 14, height: 14, alignItems: 'center', justifyContent: 'center' }}
                                hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
                              >
                                <Ionicons name="information-circle" size={14} color="#666" />
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      }
                      title="SharePoint Site"
                      text={sharePointSiteId ? (sharePointSyncError ? "SharePoint site är kopplad men synkar inte korrekt." : "SharePoint site är kopplad och synkar.") : "Koppla en SharePoint-site till företaget."}
                      button={sharePointSiteId ? "Stäng av synkning" : "Skapa SharePoint Site"}
                      color="blue"
                      disabled={sharePointSiteCreating}
                      onPress={async () => {
                        if (!companyId) return;
                        
                        // If already connected, disconnect
                        if (sharePointSiteId) {
                          const compId = String(companyId).trim();
                          const compName = String(companyName || companyId || '').trim();
                          
                          const conf = (typeof window !== 'undefined')
                            ? window.confirm(`Stäng av SharePoint-synkning för "${compName}" (${compId})?\n\nDetta tar bort länken mellan företaget och SharePoint-site. Filer i SharePoint påverkas inte.`)
                            : true;
                          if (!conf) return;

                          const endBusy = beginBusy('Stänger av synkning…');
                          
                          try {
                            // Remove SharePoint site link by setting siteId to null
                            const { updateDoc, doc } = await import('firebase/firestore');
                            const { db } = await import('../components/firebase');
                            const ref = doc(db, 'foretag', compId, 'profil', 'public');
                            await updateDoc(ref, { 
                              sharePointSiteId: null,
                              sharePointWebUrl: null,
                              updatedAt: (await import('firebase/firestore')).serverTimestamp()
                            });
                            
                            setSharePointSiteId('');
                            
                            try { if (typeof window !== 'undefined') window.alert('SharePoint-synkning är avstängd.'); } catch (_e) {}
                          } catch (e) {
                            console.error('[ManageCompany] ⚠️ Failed to disconnect SharePoint site:', e);
                            const errorMsg = e?.message || String(e);
                            try { if (typeof window !== 'undefined') window.alert(`Kunde inte stänga av synkning: ${errorMsg}`); } catch (_e) {}
                          } finally {
                            endBusy();
                          }
                          return;
                        }
                        
                        // If not connected, create/link site (existing logic)
                        const compId = String(companyId).trim();
                        const compName = String(companyName || companyId || '').trim();
                        
                        const conf = (typeof window !== 'undefined')
                          ? window.confirm(`Skapa SharePoint site för "${compName}" (${compId})?\n\nDetta kommer att skapa en ny SharePoint site automatiskt.`)
                          : true;
                        if (!conf) return;

                        setSharePointSiteCreating(true);
                        const endBusy = beginBusy('Skapar SharePoint site…');

                        try {
                          const { getStoredAccessToken } = await import('../services/azure/authService');
                          const existingToken = await getStoredAccessToken();
                          
                          if (!existingToken) {
                            try { if (typeof window !== 'undefined') window.alert('Du behöver autentisera med Microsoft/Azure först. Systemet kommer att omdirigera dig till inloggning...'); } catch (_e) {}
                            const { getAccessToken } = await import('../services/azure/authService');
                            await getAccessToken();
                          }

                          // Bygg ett stabilt URL-segment för SharePoint-siten.
                          // Exempel: companyId "MS Byggsystem" -> "dk-msbyggsystem".
                          const rawSlug = compId
                            .toLowerCase()
                            .replace(/[^a-z0-9]+/g, '-')
                            .replace(/^-+/, '')
                            .replace(/-+$/, '')
                            .substring(0, 40); // lämna lite marginal för prefix

                          const baseSlug = rawSlug && rawSlug.startsWith('dk-') ? rawSlug : `dk-${rawSlug || compId.toLowerCase().replace(/[^a-z0-9]+/g, '')}`;
                          const sanitizedId = baseSlug.substring(0, 50);

                          // Lokal del som kan användas som förslag till gruppens e-postadress
                          const emailLocalPart = baseSlug.replace(/[^a-z0-9]/g, '');
                          
                          const { getSiteByUrl } = await import('../services/azure/siteService');
                          const { getAzureConfig } = await import('../services/azure/config');
                          const config = getAzureConfig();
                          const hostname = new URL(config.sharePointSiteUrl).hostname;
                          
                          console.log('[ManageCompany] Looking for existing SharePoint site:', sanitizedId);
                          const existingSite = await getSiteByUrl(sanitizedId, hostname);
                          
                          if (existingSite && existingSite.siteId) {
                            console.log('[ManageCompany] ✅ Found existing SharePoint site:', existingSite.webUrl);
                            
                            await saveCompanySharePointSiteId(compId, existingSite.siteId, existingSite.webUrl);
                            setSharePointSiteId(existingSite.siteId);
                            setSharePointSyncError(false); // Reset error status when sync is activated
                            
                            try {
                              const { ensureCompanySiteStructure } = await import('../services/azure/siteService');
                              await ensureCompanySiteStructure(existingSite.siteId, compId);
                              console.log('[ManageCompany] ✅ Company folder structure created');
                            } catch (structureError) {
                              console.warn('[ManageCompany] ⚠️ Could not create company folder structure:', structureError);
                            }
                            
                            try {
                              const { ensureSystemFolderStructure } = await import('../services/azure/fileService');
                              await ensureSystemFolderStructure();
                              console.log('[ManageCompany] ✅ System folder structure ensured');
                            } catch (systemStructureError) {
                              console.warn('[ManageCompany] ⚠️ Could not ensure system folder structure:', systemStructureError);
                            }
                            
                            try { if (typeof window !== 'undefined') window.alert(`SharePoint site länkad! URL: ${existingSite.webUrl}\n\nMappstruktur skapad.`); } catch (_e) {}
                          } else {
                            const manualMessage = `SharePoint site hittades inte för "${compName}".\n\n` +
                              `Skapa site manuellt:\n` +
                              `1. Gå till SharePoint Admin Center:\n` +
                              `   https://admin.microsoft.com/sharepoint\n\n` +
                              `2. Klicka "+ Skapa" och fyll i:\n\n` +
                              `   📝 NAMN: "DK - ${compName}"\n` +
                              `   📝 GRUPPENS E-POSTADRESS: "${emailLocalPart}" (t.ex. ${emailLocalPart}@dindomän.se)\n` +
                              `   📝 WEBBPLATSADRESS: "${sanitizedId}"\n` +
                              `   📝 GRUPPÄGARE: marcus@msbyggsystem.se\n\n` +
                              `3. När site är skapad, kom tillbaka och klicka på "Skapa SharePoint Site" igen för att länka den.`;
                            
                            try { if (typeof window !== 'undefined') window.alert(manualMessage); } catch (_e) {}
                          }
                        } catch (e) {
                          console.error('[ManageCompany] ⚠️ Failed to create SharePoint site:', e);
                          const errorMsg = e?.message || String(e);
                          const isAuthError = errorMsg.includes('access token') || errorMsg.includes('authenticate') || errorMsg.includes('Redirecting');
                          
                          if (isAuthError) {
                            try { if (typeof window !== 'undefined') window.alert('Autentisering krävs. Du kommer att omdirigeras till Microsoft-inloggning...'); } catch (_e) {}
                          } else {
                            try { if (typeof window !== 'undefined') window.alert(`Kunde inte skapa SharePoint site: ${errorMsg}`); } catch (_e) {}
                          }
                        } finally {
                          setSharePointSiteCreating(false);
                          endBusy();
                        }
                      }}
                    />

                    {/* Per-Phase SharePoint Configuration Card */}
                    <ActionCard
                      icon={<Ionicons name="layers-outline" size={28} color="#7B1FA2" />}
                      title="SharePoint per Fas"
                      text="Konfigurera externa SharePoint-sites per fas (Kalkylskede, Produktion, Avslut, Eftermarknad). Om ingen extern site är kopplad används primär SharePoint-site."
                      button="Konfigurera Faser"
                      color="blue"
                      disabled={!companyId || sharePointSiteCreating}
                      onPress={() => {
                        setPhaseConfigModalVisible(true);
                      }}
                    />

                    {/* Delete Card */}
                    <ActionCard
                      icon={<Ionicons name="trash" size={28} color="#C62828" />}
                      title="Radera företag"
                      text="Ta bort företaget permanent."
                      button="Radera företag"
                      color="red"
                      disabled={String(companyId || '').trim() === 'MS Byggsystem'}
                      onPress={async () => {
                        if (!companyId) return;
                        const compId = String(companyId).trim();
                        const compName = String(companyName || companyId || '').trim();
                        if (compId === 'MS Byggsystem') {
                          try { if (typeof window !== 'undefined') window.alert('MS Byggsystem kan aldrig raderas.'); } catch (_e) {}
                          return;
                        }
                        // Extra säkerhet: Kräv bekräftelse med "RADERA"
                        const confirmWord = 'RADERA';
                        let conf = false;
                        let confirmText = '';
                        
                        if (typeof window !== 'undefined') {
                          const userConfirm = window.confirm(
                            `Radera företaget "${compName}" (${compId}) permanent?\n\n` +
                            `Detta raderar företagets data permanent och går inte att ångra.\n\n` +
                            `Skriv "${confirmWord}" i nästa dialog för att bekräfta.`
                          );
                          if (!userConfirm) return;
                          
                          // Prompt för bekräftelsetext
                          confirmText = window.prompt(
                            `Bekräfta radering genom att skriva "${confirmWord}":\n\n` +
                            `(Skriv exakt "${confirmWord}" för att fortsätta)`
                          ) || '';
                          conf = confirmText.trim().toUpperCase() === confirmWord;
                        } else {
                          conf = true; // Native fallback
                        }
                        
                        if (!conf) {
                          try { if (typeof window !== 'undefined') window.alert('Bekräftelsen matchade inte. Radering avbruten.'); } catch (_e) {}
                          return;
                        }

                        const endBusy = beginBusy('Raderar företag…');

                        try {
                          const res = await purgeCompanyRemote({ companyId: compId });
                          const ok = !!(res && (res.ok === true || res.success === true));
                          if (!ok) {
                            try { if (typeof window !== 'undefined') window.alert('Kunde inte radera företaget (servern avvisade ändringen).'); } catch (_e) {}
                            return;
                          }
                          try { if (typeof window !== 'undefined') window.alert('Raderat. Klicka på uppdatera-ikonen i företagslistan för att uppdatera listan.'); } catch (_e) {}
                          setCompanyId('');
                          setCompanyName('');
                          setUserLimit('10');
                          setCompanyEnabled(true);
                          setCompanyDeleted(false);
                          setCompanyMemberCount(null);
                          setAuditEvents([]);
                          setAuditCompanyId('');
                          setSelectedCompanyAuditEvents([]);
                        } catch (e) {
                          const rawCode = e && e.code ? String(e.code) : '';
                          const rawMsg = e && e.message ? String(e.message) : String(e || '');
                          const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                          try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte radera företaget: ' + combined); } catch (_e) {}
                        } finally {
                          endBusy();
                        }
                      }}
                    />
                  </View>
                ) : null}

                {/* LOG SECTION */}
                {isSuperadmin ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>Senaste åtgärder</Text>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, color: '#666' }}>Företag:</span>
                      <select
                        value={auditCompanyId || ''}
                        onChange={(e) => {
                          try {
                            const next = String(e?.target?.value || '').trim();
                            setAuditCompanyId(next);
                            loadAuditForCompany(next, 50, { setLogEvents: true, setSelectedCompanyEvents: false });
                          } catch (_e) {}
                        }}
                        style={{
                          height: 34,
                          borderRadius: 8,
                          border: '1px solid #e0e0e0',
                          padding: '0 10px',
                          backgroundColor: '#fff',
                          minWidth: 240,
                          maxWidth: 420,
                        }}
                      >
                        <option value="">Välj företag…</option>
                        {(Array.isArray(companiesForAudit) ? companiesForAudit : []).map((c) => {
                          const cid = String(c?.id || '').trim();
                          const name = String((c?.profile && (c.profile.companyName || c.profile.name)) || cid || '').trim();
                          if (!cid) return null;
                          return (
                            <option key={cid} value={cid}>
                              {name}
                            </option>
                          );
                        })}
                      </select>
                    </div>
                  </View>

                      <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#fafafa', width: '100%', maxHeight: 400, overflowY: 'auto' }}>
                        <View style={{ padding: 12, paddingBottom: 24 }}>
                          {!auditCompanyId ? (
                            <Text style={{ fontSize: 13, color: '#666' }}>Välj ett företag för att se admin-loggen.</Text>
                          ) : auditLoading ? (
                            <Text style={{ fontSize: 13, color: '#666' }}>Laddar logg...</Text>
                          ) : (Array.isArray(auditEvents) && auditEvents.length > 0 ? (
                            <>
                              {auditEvents.map((ev, index) => {
                                const ts = ev?.ts && ev.ts.toDate ? ev.ts.toDate() : null;
                                const tsText = ts ? ts.toLocaleString('sv-SE') : '';
                                const type = String(ev?.type || '').trim();
                                let label = type;
                                if (type === 'createUser') label = 'Skapa användare';
                                else if (type === 'updateUser') label = 'Uppdatera användare';
                                else if (type === 'deleteUser') label = 'Ta bort användare';
                                else if (type === 'setCompanyUserLimit') label = 'Ändra antal användare (userLimit)';
                                else if (type === 'setCompanyName') label = 'Ändra företagsnamn';
                                else if (type === 'setCompanyStatus') label = 'Ändra status (pausa/aktivera)';
                                else if (type === 'provisionCompany') label = 'Skapa företag';
                                else if (type === 'purgeCompany') label = 'Permanent radering av företag';

                                return (
                                  <View key={ev.id} style={{ paddingVertical: 8, borderBottomWidth: index === auditEvents.length - 1 ? 0 : 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                      <Ionicons name="checkmark-circle" size={16} color="#2E7D32" />
                                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#333', flex: 1 }}>{label}</Text>
                                    </View>
                                    {tsText ? <Text style={{ fontSize: 12, color: '#777', flexShrink: 0 }}>{tsText}</Text> : null}
                                  </View>
                                );
                              })}
                            </>
                          ) : (
                            <Text style={{ fontSize: 13, color: '#666' }}>Inga loggposter hittades än.</Text>
                          ))}
                        </View>
                      </View>
                    </View>
                  ) : null}
                </View>
                <View style={{ height: 100, minHeight: 100, width: '100%' }} />
              </>
            )}
          </View>
        </MainLayout>

            {/* Edit Company Modal */}
            <Modal
          visible={editModalVisible}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setEditModalVisible(false)}
        >
          <Pressable 
            style={{ 
              flex: 1, 
              backgroundColor: 'rgba(0, 0, 0, 0.4)',
              justifyContent: 'center',
              alignItems: 'center',
              padding: 20
            }}
            onPress={() => setEditModalVisible(false)}
          >
            <Pressable 
              style={{
                backgroundColor: '#fff',
                borderRadius: 14,
                padding: 20,
                width: Platform.OS === 'web' ? 520 : '100%',
                maxWidth: 520,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 5,
              }}
              onPress={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <View style={{ 
                flexDirection: 'row', 
                justifyContent: 'space-between', 
                alignItems: 'center',
                marginBottom: 20 
              }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#222' }}>
                  Ändra företagsprofil
                </Text>
                <TouchableOpacity 
                  onPress={() => setEditModalVisible(false)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="close" size={24} color="#666" />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView style={{ maxHeight: Platform.OS === 'web' ? 500 : 400 }}>
                {/* Företagsnamn */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                    Företagsnamn
                  </Text>
                  <TextInput
                    value={editName}
                    onChangeText={setEditName}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 14,
                      backgroundColor: '#fff',
                    }}
                    placeholder="Företagsnamn"
                  />
                </View>

                {/* Företags-ID */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                    Företags-ID
                  </Text>
                  <TextInput
                    value={editCompanyId}
                    onChangeText={setEditCompanyId}
                    editable={false}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 14,
                      backgroundColor: '#f5f5f5',
                      color: '#666',
                    }}
                    placeholder="Företags-ID"
                  />
                  <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                    Företags-ID kan inte ändras (det är unikt identifierare)
                  </Text>
                </View>

                {/* Logo */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                    Company Logo
                  </Text>
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 12,
                    marginBottom: 12 
                  }}>
                    {logoUrl ? (
                      <Image 
                        source={{ uri: logoUrl }} 
                        style={{ 
                          width: 64, 
                          height: 64, 
                          borderRadius: 8,
                          backgroundColor: '#f0f0f0'
                        }} 
                        resizeMode="contain"
                      />
                    ) : (
                      <View style={{ 
                        width: 64, 
                        height: 64, 
                        borderRadius: 8,
                        backgroundColor: '#f0f0f0',
                        justifyContent: 'center',
                        alignItems: 'center'
                      }}>
                        <Ionicons name="business" size={32} color="#ccc" />
                      </View>
                    )}
                    <TouchableOpacity
                      onPress={() => {
                        if (Platform.OS === 'web' && editFileInputRef.current) {
                          editFileInputRef.current.click();
                        }
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6,
                        paddingVertical: 8,
                        paddingHorizontal: 12,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        backgroundColor: '#fff',
                      }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>
                        Byt bild
                      </Text>
                      <Ionicons name="chevron-forward" size={14} color="#666" />
                    </TouchableOpacity>
                    {Platform.OS === 'web' && (
                      <input
                        ref={editFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: 'none' }}
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          if (file && companyId) {
                            setLogoUploading(true);
                            try {
                              const url = await uploadCompanyLogo({ companyId, file });
                              const ok = await saveCompanyProfile(companyId, { logoUrl: url });
                              if (!ok) {
                                throw new Error('Kunde inte spara företagsprofil (logoUrl).');
                              }
                              // Resolve logo URL (handles gs:// URLs)
                              try {
                                const resolved = await resolveCompanyLogoUrl(companyId);
                                setLogoUrl((resolved || url || '').trim());
                              } catch (_e) {
                                setLogoUrl(url || '');
                              }
                              // Inform sidebar / other views about updated profile
                              try {
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                    detail: {
                                      companyId,
                                      profile: { logoUrl: url },
                                    },
                                  }));
                                }
                              } catch (_e) {}
                              // Trigger refresh
                              await handleSelectCompany(companyId);
                              try {
                                if (typeof window !== 'undefined') {
                                  window.alert('Företagsbild uppdaterad!');
                                }
                              } catch (_e) {}
                            } catch (error) {
                              console.error('Logo upload error:', error);
                              try {
                                if (typeof window !== 'undefined') {
                                  window.alert('Kunde inte ladda upp logotyp: ' + (error?.message || error));
                                }
                              } catch (_e) {}
                            } finally {
                              setLogoUploading(false);
                              try {
                                if (e?.target) {
                                  e.target.value = '';
                                }
                              } catch (_e) {}
                            }
                          }
                        }}
                      />
                    )}
                  </View>
                  {logoUploading && (
                    <Text style={{ fontSize: 11, color: '#1976D2' }}>Laddar upp logotyp...</Text>
                  )}
                </View>

                {/* Max antal användare */}
                <View style={{ marginBottom: 16 }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                    Max antal användare
                  </Text>
                  <View style={{ 
                    flexDirection: 'row', 
                    alignItems: 'center', 
                    gap: 12 
                  }}>
                    <TouchableOpacity
                      onPress={() => setEditUserLimit(Math.max(1, editUserLimit - 1))}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        backgroundColor: '#fff',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>–</Text>
                    </TouchableOpacity>
                    
                    <Text style={{ 
                      fontSize: 16, 
                      fontWeight: '600', 
                      color: '#222',
                      minWidth: 40,
                      textAlign: 'center'
                    }}>
                      {editUserLimit}
                    </Text>
                    
                    <TouchableOpacity
                      onPress={() => setEditUserLimit(editUserLimit + 1)}
                      style={{
                        width: 36,
                        height: 36,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        backgroundColor: '#fff',
                        justifyContent: 'center',
                        alignItems: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              {/* Footer */}
              <View style={{ 
                flexDirection: 'row', 
                justifyContent: 'flex-end', 
                gap: 10,
                marginTop: 20,
                paddingTop: 20,
                borderTopWidth: 1,
                borderTopColor: '#eee'
              }}>
                <TouchableOpacity
                  onPress={() => setEditModalVisible(false)}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: '#eee',
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>
                    Avbryt
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  onPress={handleSaveEditModal}
                  disabled={busyCount > 0}
                  style={{
                    paddingVertical: 10,
                    paddingHorizontal: 16,
                    borderRadius: 8,
                    backgroundColor: '#3f7f3f',
                    opacity: busyCount > 0 ? 0.6 : 1,
                  }}
                >
                  <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                    {busyCount > 0 ? 'Sparar...' : 'Spara ändringar'}
                  </Text>
                </TouchableOpacity>
              </View>
            </Pressable>
          </Pressable>
        </Modal>

        {/* Per-Phase SharePoint Configuration Modal */}
        <Modal
          visible={phaseConfigModalVisible}
          transparent
          animationType="slide"
          onRequestClose={() => setPhaseConfigModalVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
            onPress={() => setPhaseConfigModalVisible(false)}
          >
            <Pressable
              style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 600, maxHeight: '90%' }}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={{ padding: 24 }}>
                <Text style={{ fontSize: 20, fontWeight: '700', marginBottom: 20 }}>
                  SharePoint per Fas
                </Text>
                
                <ScrollView style={{ maxHeight: 500 }}>
                  {PROJECT_PHASES.map((phase) => {
                    const phaseConfig = phaseSharePointConfigs[phase.key];
                    const isExternal = phaseConfig && phaseConfig.enabled;
                    
                    return (
                      <View
                        key={phase.key}
                        style={{
                          marginBottom: 16,
                          padding: 16,
                          backgroundColor: '#f9f9f9',
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: isExternal ? phase.color : '#ddd',
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                          <View
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: 6,
                              backgroundColor: phase.color,
                              marginRight: 8,
                            }}
                          />
                          <Text style={{ fontSize: 16, fontWeight: '600', flex: 1 }}>
                            {phase.name}
                          </Text>
                          {isExternal ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Ionicons name="checkmark-circle" size={20} color={phase.color} />
                              <Text style={{ fontSize: 12, color: phase.color, fontWeight: '600' }}>
                                Extern Site
                              </Text>
                            </View>
                          ) : (
                            <Text style={{ fontSize: 12, color: '#666' }}>
                              Primär Site
                            </Text>
                          )}
                        </View>
                        
                        {isExternal && phaseConfig ? (
                          <View style={{ marginTop: 8 }}>
                            <Text style={{ fontSize: 12, color: '#666', marginBottom: 4 }}>
                              Site: {phaseConfig.siteName || phaseConfig.siteId?.substring(0, 20) || 'N/A'}
                            </Text>
                            {phaseConfig.webUrl && (
                              <Text style={{ fontSize: 11, color: '#999', marginBottom: 8 }}>
                                {phaseConfig.webUrl}
                              </Text>
                            )}
                            <TouchableOpacity
                              onPress={async () => {
                                if (!companyId) return;
                                const conf = typeof window !== 'undefined'
                                  ? window.confirm(`Återställa ${phase.name} till primär SharePoint-site?`)
                                  : true;
                                if (!conf) return;
                                
                                const endBusy = beginBusy('Återställer...');
                                try {
                                  await removeSharePointSiteForPhase(companyId, phase.key);
                                  const configs = await getAllPhaseSharePointConfigs(companyId);
                                  setPhaseSharePointConfigs(configs || {});
                                  if (typeof window !== 'undefined') {
                                    window.alert(`${phase.name} återställd till primär SharePoint-site.`);
                                  }
                                } catch (e) {
                                  console.error('[ManageCompany] Error removing phase site:', e);
                                  if (typeof window !== 'undefined') {
                                    window.alert('Kunde inte återställa: ' + (e?.message || e));
                                  }
                                } finally {
                                  endBusy();
                                }
                              }}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 12,
                                borderRadius: 6,
                                backgroundColor: '#fff',
                                borderWidth: 1,
                                borderColor: '#ddd',
                                alignSelf: 'flex-start',
                              }}
                            >
                              <Text style={{ fontSize: 12, color: '#666' }}>
                                Återställ till Primär
                              </Text>
                            </TouchableOpacity>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={() => {
                              setSelectedPhaseForConfig(phase.key);
                              setExternalSiteIdInput('');
                              setExternalSiteUrlInput('');
                              setExternalSiteNameInput('');
                            }}
                            style={{
                              paddingVertical: 8,
                              paddingHorizontal: 12,
                              borderRadius: 6,
                              backgroundColor: phase.color,
                              alignSelf: 'flex-start',
                            }}
                          >
                            <Text style={{ fontSize: 12, color: '#fff', fontWeight: '600' }}>
                              Koppla Extern Site
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                  
                  {selectedPhaseForConfig && (
                    <View style={{
                      marginTop: 20,
                      padding: 16,
                      backgroundColor: '#f0f0f0',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: PROJECT_PHASES.find(p => p.key === selectedPhaseForConfig)?.color || '#1976D2',
                    }}>
                      <Text style={{ fontSize: 16, fontWeight: '600', marginBottom: 12 }}>
                        Koppla Extern SharePoint Site för {PROJECT_PHASES.find(p => p.key === selectedPhaseForConfig)?.name}
                      </Text>
                      
                      <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        Site ID (krävs):
                      </Text>
                      <TextInput
                        value={externalSiteIdInput}
                        onChangeText={setExternalSiteIdInput}
                        placeholder="t.ex. msbyggsystem.sharepoint.com,abc123..."
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#ddd',
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 12,
                          fontSize: 14,
                        }}
                      />
                      
                      <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        Web URL (valfritt):
                      </Text>
                      <TextInput
                        value={externalSiteUrlInput}
                        onChangeText={setExternalSiteUrlInput}
                        placeholder="https://msbyggsystem.sharepoint.com/sites/..."
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#ddd',
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 12,
                          fontSize: 14,
                        }}
                      />
                      
                      <Text style={{ fontSize: 12, color: '#666', marginBottom: 8 }}>
                        Site Namn (valfritt):
                      </Text>
                      <TextInput
                        value={externalSiteNameInput}
                        onChangeText={setExternalSiteNameInput}
                        placeholder="t.ex. Kunds SharePoint Site"
                        style={{
                          backgroundColor: '#fff',
                          borderWidth: 1,
                          borderColor: '#ddd',
                          borderRadius: 6,
                          padding: 10,
                          marginBottom: 12,
                          fontSize: 14,
                        }}
                      />
                      
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setSelectedPhaseForConfig(null);
                            setExternalSiteIdInput('');
                            setExternalSiteUrlInput('');
                            setExternalSiteNameInput('');
                          }}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 6,
                            backgroundColor: '#eee',
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>
                            Avbryt
                          </Text>
                        </TouchableOpacity>
                        
                        <TouchableOpacity
                          onPress={async () => {
                            if (!companyId || !externalSiteIdInput.trim()) {
                              if (typeof window !== 'undefined') {
                                window.alert('Site ID krävs.');
                              }
                              return;
                            }
                            
                            const endBusy = beginBusy('Kopplar site...');
                            try {
                              await setSharePointSiteForPhase(
                                companyId,
                                selectedPhaseForConfig,
                                externalSiteIdInput.trim(),
                                externalSiteUrlInput.trim() || null,
                                externalSiteNameInput.trim() || null
                              );
                              
                              const configs = await getAllPhaseSharePointConfigs(companyId);
                              setPhaseSharePointConfigs(configs || {});
                              
                              setSelectedPhaseForConfig(null);
                              setExternalSiteIdInput('');
                              setExternalSiteUrlInput('');
                              setExternalSiteNameInput('');
                              
                              if (typeof window !== 'undefined') {
                                window.alert('Extern SharePoint-site kopplad!');
                              }
                            } catch (e) {
                              console.error('[ManageCompany] Error setting phase site:', e);
                              if (typeof window !== 'undefined') {
                                window.alert('Kunde inte koppla site: ' + (e?.message || e));
                              }
                            } finally {
                              endBusy();
                            }
                          }}
                          disabled={!externalSiteIdInput.trim() || busyCount > 0}
                          style={{
                            flex: 1,
                            paddingVertical: 10,
                            paddingHorizontal: 16,
                            borderRadius: 6,
                            backgroundColor: PROJECT_PHASES.find(p => p.key === selectedPhaseForConfig)?.color || '#1976D2',
                            opacity: (!externalSiteIdInput.trim() || busyCount > 0) ? 0.6 : 1,
                            alignItems: 'center',
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                            {busyCount > 0 ? 'Kopplar...' : 'Koppla Site'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}
                </ScrollView>
                
                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 20, paddingTop: 20, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <TouchableOpacity
                    onPress={() => {
                      setPhaseConfigModalVisible(false);
                      setSelectedPhaseForConfig(null);
                      setExternalSiteIdInput('');
                      setExternalSiteUrlInput('');
                      setExternalSiteNameInput('');
                    }}
                    style={{
                      paddingVertical: 10,
                      paddingHorizontal: 20,
                      borderRadius: 8,
                      backgroundColor: '#1976D2',
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>
                      Stäng
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      </RootContainer>
    );
  }
  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Företag</Text>

        <Text style={{ marginTop: 12, marginBottom: 6 }}>Företags-ID (kort identifierare)</Text>
        <TextInput value={companyId} onChangeText={setCompanyId} placeholder="foretag-id" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />

        <Text style={{ marginTop: 12, marginBottom: 6 }}>Företagsnamn</Text>
        <TextInput value={companyName} onChangeText={setCompanyName} placeholder="Företagsnamn" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />

        <Text style={{ marginTop: 12, marginBottom: 6 }}>Antal användare (userLimit)</Text>
        <TextInput value={String(userLimit)} onChangeText={setUserLimit} placeholder="10" keyboardType="numeric" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />

        <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#1976D2', padding: 12, borderRadius: 8, marginTop: 16, alignItems: 'center' }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>{loading ? 'Sparar...' : 'Spara företag'}</Text>
        </TouchableOpacity>

        <View style={{ height: 32 }} />
        <Text style={{ color: '#666', fontSize: 13 }}>Obs: detta uppdaterar endast företagsprofil i Firestore (`foretag/{companyId}/profil/public`). För att koppla användare till Auth krävs server‑funktioner (Cloud Functions) som skapar/ta bort Auth‑konton.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
