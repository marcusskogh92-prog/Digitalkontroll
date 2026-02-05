import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { HomeHeader } from '../components/common/HomeHeader';
import { adminFetchCompanyMembers, auth, fetchAdminAuditForCompany, fetchCompanyMembers, fetchCompanyProfile, fetchCompanySharePointSiteMetas, getAllPhaseSharePointConfigs, getAvailableSharePointSites, getCompanySharePointSiteId, getCompanySharePointSiteIdByRole, getSharePointNavigationConfig, removeSharePointSiteForPhase, resolveCompanyLogoUrl, saveCompanyProfile, saveCompanySharePointSiteId, saveSharePointNavigationConfig, setCompanyNameRemote, setCompanyStatusRemote, setCompanyUserLimitRemote, setSharePointSiteForPhase, syncSharePointSiteVisibilityRemote, uploadCompanyLogo, upsertCompanySharePointSiteMeta } from '../components/firebase';
import MainLayout from '../components/MainLayout';
import { PROJECT_PHASES } from '../features/projects/constants';
import { useSharePointStatus } from '../hooks/useSharePointStatus';

export default function ManageCompany({ navigation, route }) {
  const [companyId, setCompanyId] = useState('');
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId, searchSpinAnim });
  const [companyName, setCompanyName] = useState('');
  const [userLimit, setUserLimit] = useState('10');
  const [userLimitEditorOpen, setUserLimitEditorOpen] = useState(false);
  const [userLimitDraft, setUserLimitDraft] = useState('10');
  const [companyBannerRefreshKey, setCompanyBannerRefreshKey] = useState(0);
  const [companyEnabled, setCompanyEnabled] = useState(true);
  const [companyDeleted, setCompanyDeleted] = useState(false);
  const [companyMemberCount, setCompanyMemberCount] = useState(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
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
  const [dangerousActionsOpen, setDangerousActionsOpen] = useState(false);
  const [auditLogOpen, setAuditLogOpen] = useState(false);
  const [spinSpSitesRefresh, setSpinSpSitesRefresh] = useState(0);
  const [sharePointSiteId, setSharePointSiteId] = useState('');
  const [systemSharePointSiteId, setSystemSharePointSiteId] = useState('');
  const [companySharePointSiteMetas, setCompanySharePointSiteMetas] = useState([]);
  const [companySharePointSiteMetasLoading, setCompanySharePointSiteMetasLoading] = useState(false);
  const [sharePointSiteCreating, setSharePointSiteCreating] = useState(false);
  const [sharePointSyncError, setSharePointSyncError] = useState(false);
  const [sharePointSitePickerVisible, setSharePointSitePickerVisible] = useState(false);
  const [sharePointSitePickerMode, setSharePointSitePickerMode] = useState('projects');
  const [availableSharePointSites, setAvailableSharePointSites] = useState([]);
  const [sharePointSiteSearch, setSharePointSiteSearch] = useState('');
  const [sharePointSitesShowAll, setSharePointSitesShowAll] = useState(false);
  const [manualSharePointLinkOpen, setManualSharePointLinkOpen] = useState(false);
  const [manualSharePointSiteUrl, setManualSharePointSiteUrl] = useState('');
  const [manualSharePointSiteId, setManualSharePointSiteId] = useState('');
  const [manualSharePointSiteName, setManualSharePointSiteName] = useState('');
  const [phaseSharePointConfigs, setPhaseSharePointConfigs] = useState({});
  const [phaseConfigModalVisible, setPhaseConfigModalVisible] = useState(false);
  const [legacyAdvancedOpen, setLegacyAdvancedOpen] = useState(false);
  const [selectedPhaseForConfig, setSelectedPhaseForConfig] = useState(null);
  const [externalSiteIdInput, setExternalSiteIdInput] = useState('');
  const [externalSiteUrlInput, setExternalSiteUrlInput] = useState('');
  const [externalSiteNameInput, setExternalSiteNameInput] = useState('');
  const fileInputRef = useRef(null);
  
  // Edit modal state
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editName, setEditName] = useState('');
  const [editCompanyId, setEditCompanyId] = useState('');
  const editFileInputRef = useRef(null);

  useEffect(() => {
    try {
      if (userLimitEditorOpen) return;
      const next = String(userLimit || '10');
      setUserLimitDraft(next);
    } catch (_e) {}
  }, [companyId, userLimit, userLimitEditorOpen]);

  const siteSearch = String(sharePointSiteSearch || '').trim().toLowerCase();
  const allSites = Array.isArray(availableSharePointSites) ? availableSharePointSites : [];
  const recommendedSites = allSites.filter((s) => {
    const name = String(s?.displayName || s?.name || '').toLowerCase();
    const url = String(s?.webUrl || '').toLowerCase();
    return name.includes('dk') || name.includes('digitalkontroll') || url.includes('dk') || url.includes('digitalkontroll');
  });
  const baseSiteList = sharePointSitesShowAll ? allSites : (recommendedSites.length > 0 ? recommendedSites : allSites);
  const filteredSharePointSites = baseSiteList
    .filter((s) => {
      if (!siteSearch) return true;
      const name = String(s?.displayName || s?.name || '').toLowerCase();
      const url = String(s?.webUrl || '').toLowerCase();
      const id = String(s?.id || '').toLowerCase();
      return name.includes(siteSearch) || url.includes(siteSearch) || id.includes(siteSearch);
    })
    .sort((a, b) => {
      const an = String(a?.displayName || a?.name || '').toLowerCase();
      const bn = String(b?.displayName || b?.name || '').toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });

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

  const reloadCompanySharePointSites = async (cid, { silent = true } = {}) => {
    const company = String(cid || '').trim();
    if (!company) {
      setSystemSharePointSiteId('');
      setCompanySharePointSiteMetas([]);
      return;
    }

    const endBusy = beginBusy('Uppdaterar SharePoint-siter…', { silent });
    setCompanySharePointSiteMetasLoading(true);
    try {
      // Best-effort: seed/backfill sharepoint_sites for DK Bas/DK Site
      try { await syncSharePointSiteVisibilityRemote({ companyId: company }); } catch (_e) {}

      const sysId = await getCompanySharePointSiteIdByRole(company, 'system', { syncIfMissing: true });
      setSystemSharePointSiteId(String(sysId || '').trim());

      const metas = await fetchCompanySharePointSiteMetas(company).catch(() => []);
      setCompanySharePointSiteMetas(Array.isArray(metas) ? metas : []);
    } catch (_e) {
      setCompanySharePointSiteMetas([]);
    } finally {
      setCompanySharePointSiteMetasLoading(false);
      endBusy();
    }
  };

  const openSharePointSitePicker = async (mode = 'projects') => {
    if (!companyId) return;
    const nextMode = mode === 'custom' ? 'custom' : 'projects';
    setSharePointSitePickerMode(nextMode);

    setManualSharePointLinkOpen(false);
    setManualSharePointSiteUrl('');
    setManualSharePointSiteId('');
    setManualSharePointSiteName('');

    setSharePointSiteCreating(true);
    const endBusy = beginBusy('Laddar SharePoint-siter…');

    try {
      const { getStoredAccessToken, getAccessToken } = await import('../services/azure/authService');
      const existingToken = await getStoredAccessToken();
      if (!existingToken) {
        try {
          if (typeof window !== 'undefined') {
            window.alert('Du behöver autentisera med Microsoft/Azure först. Systemet kommer att omdirigera dig till inloggning...');
          }
        } catch (_e) {}
        await getAccessToken();
      }

      const sites = await getAvailableSharePointSites();
      setAvailableSharePointSites(Array.isArray(sites) ? sites : []);
      setSharePointSiteSearch('');
      setSharePointSitesShowAll(false);
      setSharePointSitePickerVisible(true);
    } catch (e) {
      console.error('[ManageCompany] ⚠️ Failed to load SharePoint sites:', e);
      const errorMsg = e?.message || String(e);
      const isAuthError = String(errorMsg).includes('access token') || String(errorMsg).includes('authenticate') || String(errorMsg).includes('Redirecting');
      if (isAuthError) {
        try { if (typeof window !== 'undefined') window.alert('Autentisering krävs. Du kommer att omdirigeras till Microsoft-inloggning...'); } catch (_e) {}
      } else {
        try { if (typeof window !== 'undefined') window.alert(`Kunde inte hämta SharePoint-siter: ${errorMsg}`); } catch (_e) {}
      }
    } finally {
      setSharePointSiteCreating(false);
      endBusy();
    }
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
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
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
            setCanSeeAllCompanies(true);
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
        if (mounted) {
          setIsSuperadmin(!!(isEmailSuperadmin || isSuperClaim));
          setCanSeeAllCompanies(!!(isEmailSuperadmin || isSuperClaim));
        }
        if (companyId === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowedTools(true);
        }
        if (mounted) setShowHeaderUserMenu(!!allowHeader);
        return;
      } catch(_e) {}
      if (mounted) {
        setAllowedTools(false);
        setIsSuperadmin(false);
        setCanSeeAllCompanies(false);
        setShowHeaderUserMenu(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (!isSuperadmin) return undefined;
    return undefined;
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

    const handleRefresh = () => {
      (async () => {
        try {
          const cid = String(companyId || '').trim();

          // Refresh selected company profile
          if (cid) {
            try {
              const profile = await fetchCompanyProfile(cid).catch(() => null);
              if (profile) {
                setCompanyName(String(profile.companyName || profile.name || '').trim() || cid);
                setUserLimit(typeof profile.userLimit !== 'undefined' && profile.userLimit !== null ? String(profile.userLimit) : String(userLimit || '10'));
                setCompanyEnabled(typeof profile.enabled === 'boolean' ? !!profile.enabled : true);
                setCompanyDeleted(typeof profile.deleted === 'boolean' ? !!profile.deleted : false);
                if (Platform.OS === 'web') {
                  const resolved = await resolveCompanyLogoUrl(cid).catch(() => '');
                  setLogoUrl(resolved || profile.logoUrl || '');
                } else {
                  setLogoUrl(profile.logoUrl || '');
                }
              }
            } catch (_e) {}

            // Refresh audit log for selected company (superadmin)
            if (Platform.OS === 'web' && isSuperadmin) {
              try {
                await loadAuditForCompany(cid, 50, { setLogEvents: true, setSelectedCompanyEvents: true });
              } catch (_e) {}
            }
          }
        } catch (_e) {}
      })();
    };

    window.addEventListener('dkGoHome', handler);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, companyId, isSuperadmin, userLimit]);

  // Handle route params for creating new company
  useEffect(() => {
    if (route?.params?.createNew) {
      handleSelectCompany({ createNew: true });
      // Clear the param to avoid re-triggering
      if (navigation.setParams) {
        navigation.setParams({ createNew: undefined });
      }
    }
  }, [route?.params?.createNew]);

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
        setAuditEvents([]);
        setSelectedCompanyAuditEvents([]);
        setIsCreatingNew(true);
        return;
      }
      setIsCreatingNew(false);
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
      setIsCreatingNew(false);
      
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

        (async () => {
          try {
            await reloadCompanySharePointSites(cid, { silent: true });
          } catch (_e) {}
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
        (async () => {
          const endBusy = beginBusy('', { silent: true });
          try {
            await loadAuditForCompany(cid, 50, { setLogEvents: true, setSelectedCompanyEvents: true });
          } finally {
            endBusy();
          }
        })();
      } else {
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

    const hasSelectedCompany = !!(String(companyId || '').trim() || String(companyName || '').trim());
    const formDisabled = !hasSelectedCompany && !isCreatingNew;
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

    const handleBannerChangeLogo = async (file) => {
      if (!companyId) return;
      const safeCompanyId = String(companyId || '').trim();
      if (!safeCompanyId) return;
      if (!file) return;

      setLogoUploading(true);
      const endBusy = beginBusy('Laddar upp logga…');
      try {
        const url = await uploadCompanyLogo({ companyId: safeCompanyId, file });
        const ok = await saveCompanyProfile(safeCompanyId, { logoUrl: url });
        if (!ok) throw new Error('Kunde inte spara företagsprofil (logoUrl).');

        try {
          const resolved = await resolveCompanyLogoUrl(safeCompanyId);
          setLogoUrl((resolved || url || '').trim());
        } catch (_e) {
          setLogoUrl(url || '');
        }

        try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
              detail: { companyId: safeCompanyId, profile: { logoUrl: url } },
            }));
          }
        } catch (_e) {}

        setCompanyBannerRefreshKey((n) => n + 1);
      } catch (e) {
        const msg = e?.message || String(e);
        try { if (typeof window !== 'undefined') window.alert('Kunde inte ladda upp logga: ' + msg); } catch (_e) {}
      } finally {
        endBusy();
        setLogoUploading(false);
      }
    };

    const handleBannerEditName = async () => {
      if (!companyId) return;
      if (!isSuperadmin) return;
      const compId = String(companyId || '').trim();
      const currentName = String(companyName || companyId || '').trim();
      if (!compId) return;

      const conf = (typeof window !== 'undefined')
        ? window.confirm(
          `Ändra företagsnamn för "${currentName}" (${compId})?\n\n` +
          `Detta bör göras sällan. Namn används i UI och kan påverka tydlighet för användare.`
        )
        : true;
      if (!conf) return;

      if (typeof window !== 'undefined') {
        const nextName = (window.prompt('Skriv nytt företagsnamn:', currentName) || '').trim();
        if (!nextName) return;
        const typed = (window.prompt(`Skriv företags-ID för att bekräfta:\n\n${compId}`) || '').trim();
        if (typed !== compId) {
          try { window.alert('Bekräftelsen matchade inte. Avbruten.'); } catch (_e) {}
          return;
        }

        const endBusy = beginBusy('Sparar företagsnamn…');
        try {
          const res = await setCompanyNameRemote({ companyId: compId, companyName: nextName });
          const ok = !!(res && (res.ok === true || res.success === true));
          if (!ok) {
            try { window.alert('Kunde inte ändra företagsnamn (servern avvisade ändringen).'); } catch (_e) {}
            return;
          }
          setCompanyName(nextName);
          setCompanyBannerRefreshKey((n) => n + 1);
          try {
            window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
              detail: { companyId: compId, profile: { companyName: nextName } },
            }));
          } catch (_e) {}
        } catch (e) {
          const msg = e?.message || String(e);
          try { window.alert('Fel: kunde inte ändra företagsnamn: ' + msg); } catch (_e) {}
        } finally {
          endBusy();
        }
      }
    };

    const spMetas = Array.isArray(companySharePointSiteMetas) ? companySharePointSiteMetas : [];
    const getSpMeta = (sid) => {
      const id = String(sid || '').trim();
      if (!id) return null;
      return spMetas.find((m) => String(m?.siteId || m?.id || '').trim() === id) || null;
    };
    const projectMeta = getSpMeta(sharePointSiteId);
    const systemMeta = getSpMeta(systemSharePointSiteId);

    const resolvedProjectSiteName = String(projectMeta?.siteName || sharePointStatus?.siteName || '');
    const resolvedProjectSiteUrl = String(projectMeta?.siteUrl || sharePointStatus?.siteUrl || '');
    const resolvedSystemSiteName = String(systemMeta?.siteName || '');
    const resolvedSystemSiteUrl = String(systemMeta?.siteUrl || '');

    const openInSharePoint = (url) => {
      const u = String(url || '').trim();
      if (!u) return;
      if (typeof window !== 'undefined' && window?.open) {
        try { window.open(u, '_blank', 'noopener,noreferrer'); } catch (_e) {}
      }
    };

    const normalizeRoleLabel = (role) => {
      const r = String(role || '').trim().toLowerCase();
      if (!r) return 'custom';
      if (r === 'projects' || r === 'project') return 'projects';
      if (r === 'system') return 'system';
      if (r === 'custom' || r === 'extra') return 'custom';
      return r;
    };
    const sortedSpMetas = [...spMetas].sort((a, b) => {
      const ar = normalizeRoleLabel(a?.role);
      const br = normalizeRoleLabel(b?.role);
      const weight = (r) => (r === 'system' ? 0 : (r === 'projects' ? 1 : 2));
      const w = weight(ar) - weight(br);
      if (w !== 0) return w;
      const an = String(a?.siteName || a?.siteUrl || a?.siteId || a?.id || '').toLowerCase();
      const bn = String(b?.siteName || b?.siteUrl || b?.siteId || b?.id || '').toLowerCase();
      return an.localeCompare(bn, undefined, { sensitivity: 'base' });
    });

    const showSimpleAlert = (title, message) => {
      try {
        const t = String(title || '').trim() || 'Info';
        const m = String(message || '').trim();
        if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(m ? `${t}\n\n${m}` : t);
        else Alert.alert(t, m || '');
      } catch (_e) {}
    };

    const noopAsync = async () => {};

    return (
      <>
        {(busyCount > 0 || loading || logoUploading) ? (
          <View
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: 2000,
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
          adminMode={true}
          adminCurrentScreen="manage_company"
          adminOnSelectCompany={handleSelectCompany}
          adminShowCompanySelector={canSeeAllCompanies}
          sidebarSelectedCompanyId={isCreatingNew ? null : companyId}
          adminCompanyBannerOnEdit={null}
          adminCompanyBannerOnEditName={hasSelectedCompany && isSuperadmin && !isCreatingNew ? handleBannerEditName : null}
          adminCompanyBannerOnChangeLogo={hasSelectedCompany && allowedTools && !isCreatingNew ? handleBannerChangeLogo : null}
          adminCompanyBannerRefreshKey={companyBannerRefreshKey}
          adminHideCompanyBanner={isCreatingNew}
          topBar={
            <HomeHeader
              headerHeight={headerHeight}
              setHeaderHeight={setHeaderHeight}
              navigation={navigation}
              route={route}
              auth={auth}
              selectedProject={null}
              isSuperAdmin={false}
              allowedTools={allowedTools}
              showHeaderUserMenu={showHeaderUserMenu}
              canShowSupportToolsInHeader={allowedTools}
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
          <View style={dashboardContainerStyle}>
            {!hasSelectedCompany && !isCreatingNew ? (
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, maxWidth: 600, alignSelf: 'center', width: '100%' }}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#666', textAlign: 'center' }}>
                  Välj ett företag i listan till vänster för att visa och ändra dess företagsprofil.
                </Text>
              </View>
            ) : (
              <>
                {isCreatingNew ? (
                  <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
                    {/* CREATE NEW COMPANY FORM */}
                    <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 24 }}>
                      <Text style={{ fontSize: 24, fontWeight: '600', color: '#1976D2', marginBottom: 24 }}>
                        Skapa nytt företag
                      </Text>
                      <View style={{ gap: 16, width: '100%' }}>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                            Företagsnamn *
                          </Text>
                          <TextInput
                            value={companyName}
                            onChangeText={(text) => {
                              setCompanyName(text);
                              // Auto-generate company ID from company name
                              const autoId = text
                                .toLowerCase()
                                .trim()
                                .replace(/\s+/g, '-') // Replace spaces with hyphens
                                .replace(/[åäö]/g, (match) => {
                                  const map = { 'å': 'a', 'ä': 'a', 'ö': 'o' };
                                  return map[match] || match;
                                }) // Replace Swedish characters
                                .replace(/[^a-z0-9-]/g, '') // Remove special characters except hyphens
                                .replace(/-+/g, '-') // Replace multiple hyphens with single hyphen
                                .replace(/^-+|-+$/g, ''); // Remove leading/trailing hyphens
                              setCompanyId(autoId);
                            }}
                            placeholder="t.ex. Test Företag AB"
                            style={{
                              borderWidth: 1,
                              borderColor: '#ddd',
                              borderRadius: 8,
                              padding: 12,
                              fontSize: 14,
                              backgroundColor: '#fff',
                            }}
                          />
                        </View>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                            Företags-ID *
                          </Text>
                          <TextInput
                            value={companyId}
                            onChangeText={setCompanyId}
                            placeholder="Fylls i automatiskt från företagsnamn"
                            style={{
                              borderWidth: 1,
                              borderColor: '#ddd',
                              borderRadius: 8,
                              padding: 12,
                              fontSize: 14,
                              backgroundColor: '#f5f5f5',
                              color: '#666',
                            }}
                          />
                          <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }}>
                            Fylls i automatiskt, men kan redigeras manuellt
                          </Text>
                        </View>
                        <View>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                            Max antal användare
                          </Text>
                          <TextInput
                            value={userLimit}
                            onChangeText={setUserLimit}
                            placeholder="10"
                            keyboardType="numeric"
                            style={{
                              borderWidth: 1,
                              borderColor: '#ddd',
                              borderRadius: 8,
                              padding: 12,
                              fontSize: 14,
                              backgroundColor: '#fff',
                            }}
                          />
                        </View>
                        <TouchableOpacity
                          onPress={async () => {
                            if (!companyId || !companyName) {
                              try { if (typeof window !== 'undefined') window.alert('Företags-ID och företagsnamn krävs.'); } catch (_e) {}
                              return;
                            }
                            const trimmedName = String(companyName).trim();
                            const trimmedId = String(companyId).trim();
                            const endBusy = beginBusy('Skapar företag…');
                            try {
                              const { functionsClient } = await import('../components/firebase');
                              const { httpsCallable } = await import('firebase/functions');
                              if (!functionsClient) {
                                throw new Error('Functions client inte tillgänglig');
                              }
                              const provisionCompany = httpsCallable(functionsClient, 'provisionCompany');
                              const result = await provisionCompany({
                                companyId: trimmedId,
                                companyName: trimmedName,
                              });
                              const ok = !!(result?.data && (result.data.ok === true || result.data.success === true));
                              if (ok) {
                                // Show success message in loading overlay
                                endBusy();
                                const successEndBusy = beginBusy(`Företag med namnet "${trimmedName}" skapades`);
                                setIsCreatingNew(false);
                                
                                // Trigger event to refresh company list in sidebar
                                try {
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('dkCompanyCreated', {
                                      detail: { companyId: trimmedId, companyName: trimmedName }
                                    }));
                                  }
                                } catch (_e) {}
                                
                                await handleSelectCompany(trimmedId);
                                // Auto-close after 2 seconds
                                setTimeout(() => {
                                  successEndBusy();
                                }, 2000);
                              } else {
                                throw new Error('Kunde inte skapa företag');
                              }
                            } catch (e) {
                              console.error('[ManageCompany] Error creating company:', e);
                              const errorMsg = e?.message || String(e);
                              endBusy();
                              try { if (typeof window !== 'undefined') window.alert('Kunde inte skapa företag: ' + errorMsg); } catch (_e) {}
                            }
                          }}
                          disabled={loading || !companyId.trim() || !companyName.trim()}
                          style={{
                            paddingVertical: 12,
                            paddingHorizontal: 20,
                            borderRadius: 8,
                            backgroundColor: (loading || !companyId.trim() || !companyName.trim()) ? '#B0BEC5' : '#43A047',
                            alignItems: 'center',
                            marginTop: 8,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>
                            {loading ? 'Skapar...' : 'Skapa företag'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ) : (
                  <View style={{ width: '100%', maxWidth: 1200, alignSelf: 'center' }}>
                    {/* ACTION CARDS */}
                {hasSelectedCompany && allowedTools && !isCreatingNew ? (
                  <View style={{ 
                    flexDirection: Platform.OS === 'web' ? 'row' : 'column', 
                    gap: 24, 
                    marginBottom: 24,
                    flexWrap: 'wrap'
                  }}>
                    {/* Status Card */}
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
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                            <Ionicons name="shield-checkmark" size={28} color={companyEnabled ? '#2E7D32' : '#C62828'} />
                            <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>Status</Text>
                          </View>
                          <View style={{ paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: companyEnabled ? '#E8F5E9' : '#FFEBEE' }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: companyEnabled ? '#2E7D32' : '#C62828' }}>
                              {statusLabel}
                            </Text>
                          </View>
                        </View>

                        <Text style={{ fontSize: 13, color: '#666' }}>
                          {companyEnabled ? 'Företaget är aktivt och kan användas.' : 'Företaget är pausat.'}
                        </Text>

                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 16 }}>
                          <InfoItem label="Användare" value={typeof companyMemberCount === 'number' ? `${companyMemberCount} st` : '—'} />
                          <InfoItem label="Limit" value={userLimitNumber ? `${userLimitNumber} st` : (String(userLimit || '').trim() ? `${String(userLimit).trim()} st` : '—')} />
                          {typeof seatsLeft === 'number' ? <InfoItem label="Lediga" value={`${seatsLeft} st`} /> : null}
                          {lastAuditText ? <InfoItem label="Senast aktiv" value={lastAuditText} /> : null}
                        </View>

                        <View style={{ borderTopWidth: 1, borderTopColor: '#eee', paddingTop: 12, gap: 8 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 13, fontWeight: '700', color: '#222' }}>Användargräns</Text>
                            {!userLimitEditorOpen ? (
                              <TouchableOpacity
                                onPress={() => {
                                  setUserLimitDraft(String(userLimit || '10'));
                                  setUserLimitEditorOpen(true);
                                }}
                                disabled={busyCount > 0}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', opacity: busyCount > 0 ? 0.6 : 1 }}
                              >
                                <Ionicons name="create-outline" size={14} color="#222" />
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>Ändra</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>

                          {userLimitEditorOpen ? (
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                              <TextInput
                                value={userLimitDraft}
                                onChangeText={setUserLimitDraft}
                                keyboardType="numeric"
                                placeholder="10"
                                style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10, minWidth: 90, backgroundColor: '#fff' }}
                              />
                              <TouchableOpacity
                                onPress={async () => {
                                  if (!companyId) return;
                                  const compId = String(companyId).trim();
                                  const parsed = parseInt(String(userLimitDraft || '').trim(), 10);
                                  const nextLimit = Number.isFinite(parsed) && parsed > 0 ? parsed : null;
                                  if (!nextLimit) {
                                    try { if (typeof window !== 'undefined') window.alert('Ange ett giltigt antal (minst 1).'); } catch (_e) {}
                                    return;
                                  }
                                  const endBusy = beginBusy('Sparar användargräns…');
                                  try {
                                    const res = await setCompanyUserLimitRemote({ companyId: compId, userLimit: nextLimit });
                                    const ok = !!(res && (res.ok === true || res.success === true));
                                    if (!ok) {
                                      try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra antal användare (servern avvisade ändringen).'); } catch (_e) {}
                                      return;
                                    }
                                    setUserLimit(String(nextLimit));
                                    setUserLimitEditorOpen(false);
                                    try {
                                      if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                        window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                          detail: { companyId: compId, profile: { userLimit: nextLimit } },
                                        }));
                                      }
                                    } catch (_e) {}
                                  } catch (e) {
                                    const rawMsg = e && e.message ? String(e.message) : String(e || '');
                                    try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte spara: ' + rawMsg); } catch (_e) {}
                                  } finally {
                                    endBusy();
                                  }
                                }}
                                disabled={busyCount > 0}
                                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1976D2', opacity: busyCount > 0 ? 0.6 : 1 }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Spara</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  setUserLimitEditorOpen(false);
                                  setUserLimitDraft(String(userLimit || '10'));
                                }}
                                disabled={busyCount > 0}
                                style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', opacity: busyCount > 0 ? 0.6 : 1 }}
                              >
                                <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>Avbryt</Text>
                              </TouchableOpacity>
                            </View>
                          ) : null}
                        </View>
                      </View>

                      <TouchableOpacity
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
                                  detail: { companyId: compId, profile: { enabled: enabledNow, deleted: deletedNow } },
                                }));
                              }
                            } catch (_e) {}

                            try {
                              if (isSuperadmin) {
                                loadAuditForCompany(compId, 50, { setLogEvents: true, setSelectedCompanyEvents: true });
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
                        disabled={busyCount > 0}
                        style={{
                          marginTop: 16,
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: busyCount > 0 ? '#ccc' : (companyEnabled ? '#3f7f3f' : '#C62828'),
                          opacity: busyCount > 0 ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                          {companyEnabled ? 'Inaktivera företag' : 'Aktivera företag'}
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* SharePoint Connections (locked architecture: DK Bas + DK Site) */}
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
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                          <Ionicons name="cloud-outline" size={28} color="#1976D2" />
                          <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>SharePoint-kopplingar</Text>
                        </View>

                        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#222' }}>DK Site (Projekt)</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }} numberOfLines={1}>
                            {resolvedProjectSiteName || (sharePointSiteId ? 'SharePoint-site' : 'Ej kopplad')}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12, color: sharePointSiteId ? '#2E7D32' : '#C62828', fontWeight: '700' }}>
                              {sharePointSiteId ? 'Ansluten' : 'Ej kopplad'}
                            </Text>
                            {resolvedProjectSiteUrl ? (
                              <TouchableOpacity onPress={() => openInSharePoint(resolvedProjectSiteUrl)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#f0f7ff', borderWidth: 1, borderColor: '#cfe3ff' }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#1976D2' }}>Öppna i SharePoint</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        <View style={{ padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa' }}>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#222' }}>DK Bas (System)</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }} numberOfLines={1}>
                            {(String(companyName || companyId || '').trim() ? `${String(companyName || companyId).trim()} – DK Bas` : 'DK Bas')}
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 8, flexWrap: 'wrap' }}>
                            <Text style={{ fontSize: 12, color: '#2E7D32', fontWeight: '700' }}>
                              Ansluten · Systemsite (låst)
                            </Text>
                            {resolvedSystemSiteUrl ? (
                              <TouchableOpacity onPress={() => openInSharePoint(resolvedSystemSiteUrl)} style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd' }}>
                                <Text style={{ fontSize: 12, fontWeight: '700', color: '#222' }}>Öppna i SharePoint</Text>
                              </TouchableOpacity>
                            ) : null}
                          </View>
                        </View>

                        <Text style={{ fontSize: 12, color: '#666' }}>
                          Företaget har alltid en DK Bas (system) och en DK Site (projekt). Inga siter skapas här.
                        </Text>
                      </View>

                      <TouchableOpacity
                        onPress={() => openSharePointSitePicker('projects')}
                        disabled={sharePointSiteCreating || busyCount > 0}
                        style={{
                          marginTop: 16,
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: (sharePointSiteCreating || busyCount > 0) ? '#ccc' : '#1976D2',
                          opacity: (sharePointSiteCreating || busyCount > 0) ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                          Byt projekt-site
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {/* Manage SharePoint sites metadata */}
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
                      justifyContent: 'space-between',
                    }}>
                      <View style={{ gap: 12 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <Ionicons name="list-outline" size={28} color="#1976D2" />
                            <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>Hantera SharePoint-siter</Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => {
                              setSpinSpSitesRefresh((n) => n + 1);
                              reloadCompanySharePointSites(companyId, { silent: false });
                            }}
                            disabled={companySharePointSiteMetasLoading || busyCount > 0}
                            style={{ padding: 6, borderRadius: 8, backgroundColor: 'transparent', opacity: (companySharePointSiteMetasLoading || busyCount > 0) ? 0.6 : 1 }}
                            accessibilityLabel="Uppdatera"
                          >
                            <Ionicons
                              name="refresh"
                              size={18}
                              color="#1976D2"
                              style={Platform.OS === 'web'
                                ? {
                                  transform: `rotate(${spinSpSitesRefresh * 360}deg)`,
                                  transition: 'transform 0.4s ease',
                                }
                                : { transform: [{ rotate: `${spinSpSitesRefresh * 360}deg` }] }
                              }
                            />
                          </TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 12, color: '#666' }}>
                          Detta styr vilka siter som syns i vänsterpanelen (Firestore: sharepoint_sites).
                        </Text>

                        <View style={{ borderWidth: 1, borderColor: '#eee', borderRadius: 12, overflow: 'hidden' }}>
                          <View style={{ paddingVertical: 8, paddingHorizontal: 12, backgroundColor: '#fafafa', borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>Site</Text>
                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>Role / Left</Text>
                          </View>

                          <ScrollView style={{ maxHeight: 260 }}>
                            {sortedSpMetas.length === 0 ? (
                              <View style={{ padding: 12 }}>
                                <Text style={{ fontSize: 12, color: '#666' }}>
                                  Inga SharePoint-siter hittades ännu för detta företag.
                                </Text>
                              </View>
                            ) : (
                              sortedSpMetas.map((m) => {
                                const sid = String(m?.siteId || m?.id || '').trim();
                                if (!sid) return null;
                                const role = normalizeRoleLabel(m?.role);
                                const isSystem = role === 'system';
                                const isProjects = role === 'projects';
                                const isCustom = role === 'custom';
                                const siteName = String(m?.siteName || 'SharePoint-site');
                                const siteUrl = String(m?.siteUrl || '');
                                const leftVisible = m?.visibleInLeftPanel === true;

                                return (
                                  <View key={sid} style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                      <View style={{ flex: 1 }}>
                                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#222' }} numberOfLines={1}>{siteName}</Text>
                                        {siteUrl ? (
                                          <TouchableOpacity onPress={() => openInSharePoint(siteUrl)} style={{ marginTop: 4 }}>
                                            <Text style={{ fontSize: 12, fontWeight: '700', color: '#1976D2' }} numberOfLines={1}>Öppna i SharePoint</Text>
                                          </TouchableOpacity>
                                        ) : null}
                                        <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }} numberOfLines={1}>{sid}</Text>
                                      </View>
                                      <View style={{ alignItems: 'flex-end' }}>
                                        <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>{role}</Text>
                                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>
                                          Left: {isSystem ? 'låst' : (leftVisible ? 'true' : 'false')}
                                        </Text>
                                      </View>
                                    </View>

                                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 }}>
                                      {isProjects ? (
                                        <TouchableOpacity
                                          onPress={() => openSharePointSitePicker('projects')}
                                          disabled={sharePointSiteCreating || busyCount > 0}
                                          style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#1976D2', opacity: (sharePointSiteCreating || busyCount > 0) ? 0.6 : 1 }}
                                        >
                                          <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Byt</Text>
                                        </TouchableOpacity>
                                      ) : null}

                                      {isCustom ? (
                                        <>
                                          <TouchableOpacity
                                            onPress={async () => {
                                              if (!companyId) return;
                                              const compId = String(companyId).trim();
                                              const endBusy = beginBusy('Uppdaterar…', { silent: false });
                                              try {
                                                await upsertCompanySharePointSiteMeta(compId, {
                                                  siteId: sid,
                                                  siteUrl: siteUrl || null,
                                                  siteName: siteName || null,
                                                  role: 'custom',
                                                  visibleInLeftPanel: !leftVisible,
                                                });

                                                // Best-effort: keep legacy nav config aligned (if it exists)
                                                try {
                                                  const cfg = await getSharePointNavigationConfig(compId).catch(() => null);
                                                  const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
                                                  const nextEnabled = (!leftVisible)
                                                    ? (enabledSites.includes(sid) ? enabledSites : [...enabledSites, sid])
                                                    : enabledSites.filter((x) => String(x || '').trim() !== sid);
                                                  await saveSharePointNavigationConfig(compId, { ...(cfg || {}), enabledSites: nextEnabled });
                                                } catch (_e) {}

                                                await reloadCompanySharePointSites(compId, { silent: true });
                                              } catch (e) {
                                                console.error('[ManageCompany] Toggle custom site visibility failed:', e);
                                                try { if (typeof window !== 'undefined') window.alert('Kunde inte uppdatera: ' + (e?.message || e)); } catch (_e) {}
                                              } finally {
                                                endBusy();
                                              }
                                            }}
                                            disabled={busyCount > 0}
                                            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: leftVisible ? '#eee' : '#f0f7ff', borderWidth: 1, borderColor: '#ddd', opacity: busyCount > 0 ? 0.6 : 1 }}
                                          >
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#222' }}>{leftVisible ? 'Dölj' : 'Visa'}</Text>
                                          </TouchableOpacity>

                                          <TouchableOpacity
                                            onPress={async () => {
                                              if (!companyId) return;
                                              const compId = String(companyId).trim();
                                              const conf = (typeof window !== 'undefined')
                                                ? window.confirm(`Ta bort den extra siten "${siteName}"?\n\nDetta tar bara bort kopplingen/metadata i Digitalkontroll. Inget raderas i SharePoint.`)
                                                : true;
                                              if (!conf) return;

                                              // Hard confirm: require typing siteId
                                              if (typeof window !== 'undefined') {
                                                const typed = (window.prompt(`Skriv siteId för att bekräfta borttagning:\n\n${sid}`) || '').trim();
                                                if (typed !== sid) {
                                                  try { window.alert('Bekräftelsen matchade inte. Avbruten.'); } catch (_e) {}
                                                  return;
                                                }
                                              }

                                              const endBusy = beginBusy('Tar bort…', { silent: false });
                                              try {
                                                const { deleteDoc, doc } = await import('firebase/firestore');
                                                const { db } = await import('../components/firebase');
                                                await deleteDoc(doc(db, 'foretag', compId, 'sharepoint_sites', sid));

                                                // Best-effort: also remove from legacy nav config
                                                try {
                                                  const cfg = await getSharePointNavigationConfig(compId).catch(() => null);
                                                  const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
                                                  const nextEnabled = enabledSites.filter((x) => String(x || '').trim() !== sid);
                                                  await saveSharePointNavigationConfig(compId, { ...(cfg || {}), enabledSites: nextEnabled });
                                                } catch (_e) {}

                                                await reloadCompanySharePointSites(compId, { silent: true });
                                              } catch (e) {
                                                console.error('[ManageCompany] Delete custom site meta failed:', e);
                                                try { if (typeof window !== 'undefined') window.alert('Kunde inte ta bort: ' + (e?.message || e)); } catch (_e) {}
                                              } finally {
                                                endBusy();
                                              }
                                            }}
                                            disabled={busyCount > 0}
                                            style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, backgroundColor: '#C62828', opacity: busyCount > 0 ? 0.6 : 1 }}
                                          >
                                            <Text style={{ fontSize: 12, fontWeight: '800', color: '#fff' }}>Ta bort</Text>
                                          </TouchableOpacity>
                                        </>
                                      ) : null}

                                      {isSystem ? (
                                        <Text style={{ fontSize: 12, color: '#666', fontWeight: '700' }}>Inga åtgärder</Text>
                                      ) : null}
                                    </View>
                                  </View>
                                );
                              })
                            )}
                          </ScrollView>
                        </View>
                      </View>

                      <TouchableOpacity
                        onPress={() => openSharePointSitePicker('custom')}
                        disabled={sharePointSiteCreating || busyCount > 0}
                        style={{
                          marginTop: 16,
                          paddingVertical: 10,
                          paddingHorizontal: 16,
                          borderRadius: 8,
                          backgroundColor: (sharePointSiteCreating || busyCount > 0) ? '#ccc' : '#1976D2',
                          opacity: (sharePointSiteCreating || busyCount > 0) ? 0.6 : 1,
                        }}
                      >
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14, textAlign: 'center' }}>
                          Lägg till extra site
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}

                {/* Legacy SharePoint per phase (hidden by default) */}
                {hasSelectedCompany && allowedTools && !isCreatingNew ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 24 }}>
                    <TouchableOpacity
                      onPress={() => setLegacyAdvancedOpen((v) => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="warning-outline" size={18} color="#C62828" />
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Avancerat (legacy)</Text>
                      </View>
                      <Ionicons name={legacyAdvancedOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </TouchableOpacity>

                    {legacyAdvancedOpen ? (
                      <View style={{ marginTop: 12, gap: 10 }}>
                        <Text style={{ fontSize: 12, color: '#C62828', fontWeight: '800' }}>
                          Används inte i nya SharePoint-modellen
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666' }}>
                          Här finns äldre inställningar för “SharePoint per fas”. Backend/logik lämnas orörd, men funktionen ska inte användas i nya upplägget.
                        </Text>
                        <TouchableOpacity
                          onPress={() => setPhaseConfigModalVisible(true)}
                          disabled={busyCount > 0}
                          style={{ alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff', opacity: busyCount > 0 ? 0.6 : 1 }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#222' }}>Öppna SharePoint per fas</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* Dangerous actions */}
                {hasSelectedCompany && isSuperadmin && !isCreatingNew ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 24 }}>
                    <TouchableOpacity
                      onPress={() => setDangerousActionsOpen((v) => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="warning" size={20} color="#C62828" />
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#C62828' }}>Farliga åtgärder</Text>
                      </View>
                      <Ionicons name={dangerousActionsOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </TouchableOpacity>

                    {dangerousActionsOpen ? (
                      <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 16 }}>Endast superadmin. Åtgärder här går inte att ångra.</Text>
                        {/* Permanent delete is intentionally disabled in UI. */}
                        <Text style={{ fontSize: 13, color: '#444' }}>
                          Permanent radering av företag är inte tillåten via UI.
                        </Text>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                {/* LOG SECTION */}
                {isSuperadmin ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3 }}>
                    <TouchableOpacity
                      onPress={() => setAuditLogOpen((v) => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', color: '#222' }}>Senaste åtgärder</Text>
                        <Text style={{ fontSize: 12, color: '#666' }}>
                          {companyId ? `Företag: ${String(companyName || companyId).trim()}` : 'Välj företag'}
                        </Text>
                      </View>
                      <Ionicons name={auditLogOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </TouchableOpacity>

                    {auditLogOpen ? (
                      <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#fafafa', width: '100%' }}>
                        <View style={{ padding: 12, paddingBottom: 24 }}>
                          {!companyId ? (
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
                    ) : null}
                    </View>
                  ) : null}
                  </View>
                )}
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
                {/* Max antal användare flyttat till Status-boxen */}
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

        {/* SharePoint Site Picker Modal (link existing site) */}
        <Modal
          visible={sharePointSitePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setSharePointSitePickerVisible(false)}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
            onPress={() => setSharePointSitePickerVisible(false)}
          >
            <Pressable
              style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 720, maxHeight: '90%' }}
              onPress={(e) => e.stopPropagation()}
            >
              <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#eee', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flex: 1, paddingRight: 12 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#222' }}>
                    {sharePointSitePickerMode === 'custom' ? 'Lägg till extra SharePoint-site' : (sharePointSiteId ? 'Byt projekt-site' : 'Koppla projekt-site')}
                  </Text>
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }}>
                    {sharePointSitePickerMode === 'custom'
                      ? `Kopplas till företaget "${String(companyName || companyId || '').trim()}" och läggs i navigationen (vänsterpanelen). Ingen site skapas här.`
                      : `Kopplas till företaget "${String(companyName || companyId || '').trim()}" som DK Site (projekt). Ingen site skapas här.`}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSharePointSitePickerVisible(false)} style={{ padding: 6 }}>
                  <Ionicons name="close" size={22} color="#666" />
                </TouchableOpacity>
              </View>

              <View style={{ padding: 20, paddingTop: 14 }}>
                <View style={{ marginBottom: 10 }}>
                  <View style={{ alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 999, backgroundColor: '#f5f7fb', borderWidth: 1, borderColor: '#e8eef7' }}>
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#234' }}>
                      Företag: {String(companyName || companyId || '').trim()}
                    </Text>
                  </View>
                </View>
                <View style={{ flexDirection: Platform.OS === 'web' ? 'row' : 'column', gap: 10, alignItems: Platform.OS === 'web' ? 'center' : 'stretch' }}>
                  <TextInput
                    value={sharePointSiteSearch}
                    onChangeText={setSharePointSiteSearch}
                    placeholder="Sök (t.ex. DK, Bas, msbyggsystem)"
                    style={{ flex: 1, borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14 }}
                  />
                  <TouchableOpacity
                    onPress={() => setSharePointSitesShowAll((v) => !v)}
                    style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#ddd', backgroundColor: sharePointSitesShowAll ? '#f0f7ff' : '#fff' }}
                  >
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>{sharePointSitesShowAll ? 'Visar alla' : 'Visa alla'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 12, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, color: '#666' }}>
                    {filteredSharePointSites.length} site(s) visade{sharePointSitesShowAll ? '' : ' (filtrerade)'}.
                  </Text>
                </View>

                <ScrollView style={{ maxHeight: 420 }}>
                  {filteredSharePointSites.length === 0 ? (
                    <View style={{ padding: 16, borderWidth: 1, borderColor: '#eee', borderRadius: 12, backgroundColor: '#fafafa' }}>
                      <Text style={{ fontSize: 13, color: '#666' }}>Inga siter hittades. Prova att slå på "Visa alla" eller ändra sökningen.</Text>
                    </View>
                  ) : (
                    filteredSharePointSites.map((site) => {
                      const siteName = String(site?.displayName || site?.name || 'SharePoint-site');
                      const siteUrl = String(site?.webUrl || '');
                      const siteId = String(site?.id || '');
                      const isLinked = sharePointSiteId && siteId && sharePointSiteId === siteId;
                      return (
                        <Pressable
                          key={siteId || siteUrl || siteName}
                          onPress={async () => {
                            if (!companyId) return;
                            if (!siteId) return;

                            const compId = String(companyId).trim();
                            const compName = String(companyName || companyId || '').trim();

                            const pickerMode = String(sharePointSitePickerMode || 'projects');

                            if (pickerMode === 'custom') {
                              const conf = (typeof window !== 'undefined')
                                ? window.confirm(`Lägg till "${siteName}" som extra site för "${compName}"?\n\nDetta skapar ingen ny site, utan sparar bara kopplingen i systemet.`)
                                : true;
                              if (!conf) return;

                              const endBusy = beginBusy('Lägger till extra site…');
                              try {
                                await upsertCompanySharePointSiteMeta(compId, {
                                  siteId,
                                  siteUrl: siteUrl || null,
                                  siteName,
                                  role: 'custom',
                                  visibleInLeftPanel: true,
                                });

                                // Best-effort: keep legacy nav config aligned (if it exists)
                                try {
                                  const cfg = await getSharePointNavigationConfig(compId).catch(() => null);
                                  const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
                                  const nextEnabled = enabledSites.includes(siteId) ? enabledSites : [...enabledSites, siteId];
                                  await saveSharePointNavigationConfig(compId, { ...(cfg || {}), enabledSites: nextEnabled });
                                } catch (_e) {}

                                setSharePointSitePickerVisible(false);
                                await reloadCompanySharePointSites(compId, { silent: true });
                                try { if (typeof window !== 'undefined') window.alert('Extra SharePoint-site tillagd.'); } catch (_e) {}
                              } catch (e) {
                                console.error('[ManageCompany] ⚠️ Failed to add custom SharePoint site:', e);
                                const errorMsg = e?.message || String(e);
                                try { if (typeof window !== 'undefined') window.alert(`Kunde inte lägga till site: ${errorMsg}`); } catch (_e) {}
                              } finally {
                                endBusy();
                              }
                              return;
                            }

                            const conf = (typeof window !== 'undefined')
                              ? window.confirm(`Koppla "${siteName}" till "${compName}"?\n\nDetta skapar ingen ny site, utan sparar bara kopplingen i systemet.`)
                              : true;
                            if (!conf) return;

                            const endBusy = beginBusy('Kopplar SharePoint-site…');
                            try {
                              const prevProjectsSiteId = String(sharePointSiteId || '').trim();
                              await saveCompanySharePointSiteId(compId, siteId, siteUrl || null);

                              // Digitalkontroll-owned metadata: controls left-panel visibility.
                              try {
                                await upsertCompanySharePointSiteMeta(compId, {
                                  siteId,
                                  siteUrl: siteUrl || null,
                                  siteName,
                                  role: 'projects',
                                  visibleInLeftPanel: true,
                                });
                              } catch (_e) {}

                              // If we swapped project site, hide the previous DK Site in left panel metadata.
                              if (prevProjectsSiteId && prevProjectsSiteId !== siteId) {
                                try {
                                  await upsertCompanySharePointSiteMeta(compId, {
                                    siteId: prevProjectsSiteId,
                                    role: 'projects',
                                    visibleInLeftPanel: false,
                                  });
                                } catch (_e) {}
                              }

                              setSharePointSiteId(siteId);
                              setSharePointSyncError(false);
                              setSharePointSitePickerVisible(false);

                              try {
                                await reloadCompanySharePointSites(compId, { silent: true });
                              } catch (_e) {}

                              // IMPORTANT GUARD:
                              // DK Site (role=projects) must remain a pure project site.
                              // Never create system folders (Company/Projects/01-Company/02-Projects/...) in DK Site.
                              // System folders belong in DK Bas (role=system) only.
                              try {
                                const systemSiteId = await getCompanySharePointSiteIdByRole(compId, 'system', { syncIfMissing: true });
                                const { ensureSystemFolderStructure } = await import('../services/azure/fileService');
                                await ensureSystemFolderStructure(systemSiteId || null);
                              } catch (_e) {}

                              try { if (typeof window !== 'undefined') window.alert(`SharePoint-site kopplad!\n\n${siteUrl ? `URL: ${siteUrl}` : ''}`); } catch (_e) {}
                            } catch (e) {
                              console.error('[ManageCompany] ⚠️ Failed to link SharePoint site:', e);
                              const errorMsg = e?.message || String(e);
                              try { if (typeof window !== 'undefined') window.alert(`Kunde inte koppla SharePoint-site: ${errorMsg}`); } catch (_e) {}
                            } finally {
                              endBusy();
                            }
                          }}
                          style={{ padding: 14, borderWidth: 1, borderColor: isLinked ? '#1976D2' : '#eee', borderRadius: 12, marginBottom: 10, backgroundColor: isLinked ? '#f0f7ff' : '#fff' }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <View style={{ flex: 1 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#222' }} numberOfLines={1}>{siteName}</Text>
                              {siteUrl ? <Text style={{ fontSize: 12, color: '#666', marginTop: 4 }} numberOfLines={1}>{siteUrl}</Text> : null}
                              {siteId ? <Text style={{ fontSize: 11, color: '#999', marginTop: 4 }} numberOfLines={1}>{siteId}</Text> : null}
                            </View>
                            <Ionicons name={isLinked ? 'checkmark-circle' : 'link'} size={20} color={isLinked ? '#1976D2' : '#666'} />
                          </View>
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>

                {sharePointSitePickerMode === 'custom' ? (
                  <View style={{ marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eee' }}>
                    <TouchableOpacity
                      onPress={() => setManualSharePointLinkOpen((v) => !v)}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
                    >
                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#222' }}>Hittar du inte siten?</Text>
                      <Ionicons name={manualSharePointLinkOpen ? 'chevron-up' : 'chevron-down'} size={18} color="#666" />
                    </TouchableOpacity>

                    {manualSharePointLinkOpen ? (
                      <View style={{ marginTop: 6 }}>
                        <Text style={{ fontSize: 12, color: '#666', marginBottom: 10 }}>
                          Klistra in site-URL (och ev. site-ID) för att koppla en site som inte dyker upp i listan. Ingen site skapas.
                        </Text>

                        <TextInput
                          value={manualSharePointSiteUrl}
                          onChangeText={setManualSharePointSiteUrl}
                          placeholder="Site-URL (t.ex. https://tenant.sharepoint.com/sites/Customer)"
                          autoCapitalize="none"
                          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 10 }}
                        />
                        <TextInput
                          value={manualSharePointSiteId}
                          onChangeText={setManualSharePointSiteId}
                          placeholder="Site-ID (valfritt, GUID från Graph)"
                          autoCapitalize="none"
                          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 10 }}
                        />
                        <TextInput
                          value={manualSharePointSiteName}
                          onChangeText={setManualSharePointSiteName}
                          placeholder="Visningsnamn (valfritt)"
                          style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 12, fontSize: 14, marginBottom: 10 }}
                        />

                        <TouchableOpacity
                          disabled={busyCount > 0}
                          onPress={async () => {
                            if (!companyId) return;

                            const compId = String(companyId).trim();
                            const compName = String(companyName || companyId || '').trim();

                            const urlRaw = String(manualSharePointSiteUrl || '').trim();
                            const idRaw = String(manualSharePointSiteId || '').trim();
                            const nameRaw = String(manualSharePointSiteName || '').trim();

                            if (!urlRaw && !idRaw) {
                              try { if (typeof window !== 'undefined') window.alert('Ange minst en Site-URL eller Site-ID.'); } catch (_e) {}
                              return;
                            }

                            const normalizeUrl = (u) => String(u || '').trim().replace(/\/+$/, '').toLowerCase();
                            const targetUrl = normalizeUrl(urlRaw);
                            const all = Array.isArray(availableSharePointSites) ? availableSharePointSites : [];

                            const match = (!idRaw && targetUrl)
                              ? all.find((s) => {
                                  const u = normalizeUrl(s?.webUrl || '');
                                  return u && (u === targetUrl || u.startsWith(targetUrl) || targetUrl.startsWith(u));
                                })
                              : null;

                            const siteId = String(idRaw || match?.id || '').trim();
                            const siteUrl = String(urlRaw || match?.webUrl || '').trim();
                            const siteName = String(nameRaw || match?.displayName || match?.name || '').trim() || 'SharePoint-site';

                            if (!siteId) {
                              try {
                                if (typeof window !== 'undefined') {
                                  window.alert('Kunde inte hitta site-ID. Prova att slå på "Visa alla" och välj i listan, eller klistra in site-ID (GUID) manuellt.');
                                }
                              } catch (_e) {}
                              return;
                            }

                            const conf = (typeof window !== 'undefined')
                              ? window.confirm(`Lägg till "${siteName}" som extra site för "${compName}"?\n\nDetta skapar ingen ny site, utan sparar bara kopplingen i systemet.`)
                              : true;
                            if (!conf) return;

                            const endBusy = beginBusy('Lägger till extra site…');
                            try {
                              await upsertCompanySharePointSiteMeta(compId, {
                                siteId,
                                siteUrl: siteUrl || null,
                                siteName,
                                role: 'custom',
                                visibleInLeftPanel: true,
                              });

                              // Best-effort: keep legacy nav config aligned (if it exists)
                              try {
                                const cfg = await getSharePointNavigationConfig(compId).catch(() => null);
                                const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
                                const nextEnabled = enabledSites.includes(siteId) ? enabledSites : [...enabledSites, siteId];
                                await saveSharePointNavigationConfig(compId, { ...(cfg || {}), enabledSites: nextEnabled });
                              } catch (_e) {}

                              setManualSharePointSiteUrl('');
                              setManualSharePointSiteId('');
                              setManualSharePointSiteName('');
                              setManualSharePointLinkOpen(false);
                              await reloadCompanySharePointSites(compId, { silent: true });
                              try { if (typeof window !== 'undefined') window.alert('Extra SharePoint-site tillagd.'); } catch (_e) {}
                            } catch (e) {
                              console.error('[ManageCompany] ⚠️ Failed to add custom SharePoint site (manual):', e);
                              const errorMsg = e?.message || String(e);
                              try { if (typeof window !== 'undefined') window.alert(`Kunde inte lägga till site: ${errorMsg}`); } catch (_e) {}
                            } finally {
                              endBusy();
                            }
                          }}
                          style={{
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            backgroundColor: '#1976D2',
                            alignSelf: 'flex-start',
                            opacity: busyCount > 0 ? 0.6 : 1,
                          }}
                        >
                          <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>Koppla extra site</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14, paddingTop: 14, borderTopWidth: 1, borderTopColor: '#eee' }}>
                  <TouchableOpacity
                    onPress={() => setSharePointSitePickerVisible(false)}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#eee' }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>Stäng</Text>
                  </TouchableOpacity>
                </View>
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
      </>
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
