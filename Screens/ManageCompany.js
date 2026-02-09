import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Image, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import AdminQuickActionsGrid from '../components/common/AdminQuickActionsGrid';
import CompanyOverviewCard from '../components/common/CompanyOverviewCard';
import { HomeHeader } from '../components/common/HomeHeader';
import { adminFetchCompanyMembers, auth, fetchAdminAuditForCompany, fetchCompanyMembers, fetchCompanyProfile, fetchCompanySharePointSiteMetas, functionsClient, getAllPhaseSharePointConfigs, getAvailableSharePointSites, getCompanySharePointSiteId, getCompanySharePointSiteIdByRole, getSharePointNavigationConfig, removeSharePointSiteForPhase, resolveCompanyLogoUrl, saveCompanyProfile, saveCompanySharePointSiteId, saveSharePointNavigationConfig, setCompanyNameRemote, setCompanyStatusRemote, setCompanyUserLimitRemote, setSharePointSiteForPhase, syncSharePointSiteVisibilityRemote, uploadCompanyLogo, upsertCompanySharePointSiteMeta } from '../components/firebase';
import ContextMenu from '../components/ContextMenu';
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
  const [sharePointAdminAdvancedOpen, setSharePointAdminAdvancedOpen] = useState(false);
  const [sharePointSitePickerVisible, setSharePointSitePickerVisible] = useState(false);
  const [sharePointSitePickerMode, setSharePointSitePickerMode] = useState('projects');
  const [availableSharePointSites, setAvailableSharePointSites] = useState([]);
  const [sharePointSiteSearch, setSharePointSiteSearch] = useState('');
  const [sharePointSitesShowAll, setSharePointSitesShowAll] = useState(false);
  const [manualSharePointLinkOpen, setManualSharePointLinkOpen] = useState(false);
  const [manualSharePointSiteUrl, setManualSharePointSiteUrl] = useState('');
  const [manualSharePointSiteId, setManualSharePointSiteId] = useState('');
  const [manualSharePointSiteName, setManualSharePointSiteName] = useState('');
  const [sharePointRenameSiteId, setSharePointRenameSiteId] = useState('');
  const [sharePointRenameCurrentName, setSharePointRenameCurrentName] = useState('');
  const [sharePointRenameDraft, setSharePointRenameDraft] = useState('');
  const [spKebabSiteId, setSpKebabSiteId] = useState(null);
  const [spKebabPosition, setSpKebabPosition] = useState({ x: 0, y: 0 });
  const spKebabButtonRefs = useRef({});
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
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
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
          setIsCompanyAdmin(!!isAdminClaim);
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

  // If navigated with a companyId (e.g. clicking "Översikt" under a company in the sidebar),
  // auto-select that company so the screen doesn't show the "Välj ett företag..." placeholder.
  useEffect(() => {
    (async () => {
      try {
        if (route?.params?.createNew) return;
        const fromRoute = String(route?.params?.companyId || '').trim();
        let cid = fromRoute;

        // Fallback: if route param is missing on web, try last stored selection.
        if (!cid) {
          try {
            const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
            if (stored) cid = stored;
          } catch (_e) {}

          if (!cid && Platform.OS === 'web') {
            try {
              const ls = String(window?.localStorage?.getItem?.('dk_companyId') || '').trim();
              if (ls) cid = ls;
            } catch (_e) {}
          }
        }

        if (!cid) return;
        const current = String(companyId || '').trim();
        if (current === cid && !isCreatingNew) return;

        handleSelectCompany(cid);
      } catch (_e) {}
    })();
  }, [route?.params?.companyId]);

  // focus: 'sharepoint' is handled by showing the SharePoint card (single list); no accordion to open

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

    const canEditCompanyTools = hasSelectedCompany && allowedTools && !isCreatingNew;
    const canSeeSharePoint = hasSelectedCompany && !isCreatingNew && (isSuperadmin || isCompanyAdmin);

    const toggleCompanyEnabled = async () => {
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
    };

    const openUserLimitEditor = () => {
      setUserLimitDraft(String(userLimit || '10'));
      setUserLimitEditorOpen(true);
    };

    const cancelUserLimitEditor = () => {
      setUserLimitEditorOpen(false);
      setUserLimitDraft(String(userLimit || '10'));
    };

    const saveUserLimitFromDraft = async () => {
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
    };

    const safeCompanyIdForNav = String(companyId || '').trim();
    const adminQuickActions = (hasSelectedCompany && safeCompanyIdForNav && !isCreatingNew) ? ([
      {
        key: 'users',
        title: 'Användare',
        subtitle: 'Hantera användare',
        icon: 'person',
        color: '#1976D2',
        onPress: () => navigation.navigate('ManageUsers', { companyId: safeCompanyIdForNav }),
      },
      {
        key: 'contact_registry',
        title: 'Kontaktregister',
        subtitle: 'Kontakter & register',
        icon: 'book-outline',
        color: '#1976D2',
        onPress: () => navigation.navigate('ContactRegistry', { companyId: safeCompanyIdForNav, allCompanies: !!isSuperadmin }),
      },
      {
        key: 'suppliers',
        title: 'Leverantörer',
        subtitle: 'Register & uppgifter',
        icon: 'business-outline',
        color: '#1976D2',
        onPress: () => navigation.navigate('Suppliers', { companyId: safeCompanyIdForNav }),
      },
      {
        key: 'customers',
        title: 'Kunder',
        subtitle: 'Register & uppgifter',
        icon: 'people-outline',
        color: '#1976D2',
        onPress: () => navigation.navigate('Customers', { companyId: safeCompanyIdForNav }),
      },
    ]) : [];

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

    const spTypeLabel = (role) => {
      const r = normalizeRoleLabel(role);
      if (r === 'system') return 'System';
      if (r === 'projects') return 'Produkt';
      return 'Extra';
    };

    const spVisibilityLabel = (role) => {
      const r = normalizeRoleLabel(role);
      return r === 'system' ? 'Nej' : 'Ja';
    };

    const spLeftPanelLabel = (role, visibleInLeftPanel) => {
      const r = normalizeRoleLabel(role);
      if (r === 'system') return 'Låst';
      return visibleInLeftPanel === true ? 'Ja' : 'Nej';
    };

    const spStatusInfo = (entry) => {
      const role = normalizeRoleLabel(entry?.role);
      if (role === 'projects') {
        if (sharePointStatus?.checking) return { label: 'Synkar…', tone: 'neutral' };
        if (sharePointStatus?.error) return { label: 'Error', tone: 'danger', detail: String(sharePointStatus.error || '') };
        if (sharePointStatus?.connected) return { label: 'OK', tone: 'ok' };
        return { label: 'Synkar ej', tone: 'warn' };
      }
      const hasUrl = !!String(entry?.siteUrl || '').trim();
      if (!hasUrl) return { label: 'Synkar ej', tone: 'warn' };
      return { label: 'OK', tone: 'ok' };
    };

    const spStatusPillStyle = (tone) => {
      if (tone === 'ok') return { backgroundColor: '#E8F5E9', color: '#2E7D32', borderColor: '#C8E6C9' };
      if (tone === 'warn') return { backgroundColor: '#FFF8E1', color: '#8D6E00', borderColor: '#FFECB3' };
      if (tone === 'danger') return { backgroundColor: '#FFEBEE', color: '#C62828', borderColor: '#FFCDD2' };
      return { backgroundColor: '#F3F4F6', color: '#374151', borderColor: '#E5E7EB' };
    };

    const createCustomSharePointSite = async () => {
      const cid = String(companyId || '').trim();
      if (!cid) return;
      if (Platform.OS !== 'web') {
        try { Alert.alert('Info', 'Skapande av siter stöds just nu bara i webbläget.'); } catch (_e) {}
        return;
      }

      const baseName = String(companyName || cid).trim();
      const namePart = String(window.prompt('Namn på ny site', '') || '').trim();
      if (!namePart) return;

      setSharePointSiteCreating(true);
      const endBusy = beginBusy('Skapar SharePoint-site…', { silent: false });
      try {
        if (!auth?.currentUser) throw new Error('Du måste vara inloggad för att skapa en site.');
        try { await auth.currentUser.getIdToken(true); } catch (_t) { /* force refresh token */ }
        if (!functionsClient) throw new Error('Functions client inte tillgänglig');
        const { httpsCallable } = await import('firebase/functions');
        const createSharePointSite = httpsCallable(functionsClient, 'createSharePointSite');
        const result = await createSharePointSite({
          companyId: cid,
          companyName: baseName,
          siteNamePart: namePart,
        });
        const data = result?.data;
        const createdId = data?.siteId ? String(data.siteId).trim() : '';
        const createdUrl = data?.webUrl ? String(data.webUrl).trim() : null;
        const displayName = data?.siteName || `${baseName} – DK ${namePart}`;
        if (!createdId) throw new Error('Skapad site saknar id.');

        await upsertCompanySharePointSiteMeta(cid, {
          siteId: createdId,
          siteName: displayName,
          siteUrl: createdUrl || null,
          role: 'custom',
          visibleInLeftPanel: true,
        });

        try { await syncSharePointSiteVisibilityRemote({ companyId: cid }); } catch (_e) {}
        await reloadCompanySharePointSites(cid, { silent: false });

        try {
          if (typeof window !== 'undefined') {
            window.alert(`Siten "${displayName}" skapades och är kopplad till ${baseName}.\n\nDen syns i listan nedan.`);
          }
        } catch (_a) {}
      } catch (e) {
        const msg = e?.message || String(e);
        const code = e?.code || e?.details?.code || '';
        const codeStr = String(code);
        const isServerError = /failed-precondition|permission-denied|unauthenticated|invalid-argument|functions\//.test(codeStr);
        const userMsg = isServerError ? msg : 'Kunde inte skapa site: ' + msg;
        try { window.alert(userMsg); } catch (_a) {}
      } finally {
        endBusy();
        setSharePointSiteCreating(false);
      }
    };

    const handleRenameCustomSite = async () => {
      const cid = String(companyId || '').trim();
      const sid = String(sharePointRenameSiteId || '').trim();
      const newName = String(sharePointRenameDraft || '').trim();
      if (!cid || !sid || !newName) return;
      setSharePointRenameSiteId('');
      setSharePointRenameCurrentName('');
      setSharePointRenameDraft('');
      const endBusy = beginBusy('Byter namn…', { silent: false });
      try {
        const meta = spMetas.find((m) => String(m?.siteId || m?.id || '').trim() === sid);
        const siteUrl = meta?.siteUrl || null;
        await upsertCompanySharePointSiteMeta(cid, {
          siteId: sid,
          siteUrl: siteUrl || null,
          siteName: newName,
          role: 'custom',
          visibleInLeftPanel: meta?.visibleInLeftPanel === true,
        });
        await reloadCompanySharePointSites(cid, { silent: true });
        try { if (typeof window !== 'undefined') window.alert('Namnet är uppdaterat.'); } catch (_e) {}
      } catch (e) {
        console.error('[ManageCompany] Rename custom site failed:', e);
        try { if (typeof window !== 'undefined') window.alert('Kunde inte byta namn: ' + (e?.message || e)); } catch (_e) {}
      } finally {
        endBusy();
      }
    };

    const buildZone3SiteEntries = () => {
      const byId = new Map();
      const add = (m) => {
        const sid = String(m?.siteId || m?.id || '').trim();
        if (!sid) return;
        if (byId.has(sid)) return;
        byId.set(sid, {
          siteId: sid,
          siteName: String(m?.siteName || ''),
          siteUrl: String(m?.siteUrl || ''),
          role: normalizeRoleLabel(m?.role),
          visibleInLeftPanel: m?.visibleInLeftPanel === true,
        });
      };

      // Prefer explicit metas but ensure we always show project + system if we have them.
      if (systemMeta) add(systemMeta);
      if (projectMeta) add(projectMeta);
      sortedSpMetas.forEach(add);

      const projectsSiteId = String(sharePointSiteId || sharePointStatus?.siteId || '').trim();
      if (projectsSiteId && !byId.has(projectsSiteId)) {
        byId.set(projectsSiteId, {
          siteId: projectsSiteId,
          siteName: String(resolvedProjectSiteName || 'Projekt-site'),
          siteUrl: String(resolvedProjectSiteUrl || ''),
          role: 'projects',
          visibleInLeftPanel: projectMeta ? (projectMeta?.visibleInLeftPanel === true) : true,
        });
      }

      const systemSiteId = String(systemSharePointSiteId || '').trim();
      if (systemSiteId && !byId.has(systemSiteId)) {
        byId.set(systemSiteId, {
          siteId: systemSiteId,
          siteName: String(resolvedSystemSiteName || 'System-site'),
          siteUrl: String(resolvedSystemSiteUrl || ''),
          role: 'system',
          visibleInLeftPanel: true,
        });
      }

      return Array.from(byId.values()).sort((a, b) => {
        const weight = (r) => (r === 'system' ? 0 : (r === 'projects' ? 1 : 2));
        const w = weight(a.role) - weight(b.role);
        if (w !== 0) return w;
        return String(a.siteName || a.siteId).localeCompare(String(b.siteName || b.siteId), undefined, { sensitivity: 'base' });
      });
    };

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
          adminHideCompanyBanner={true}
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
                    {hasSelectedCompany && !isCreatingNew ? (
                      <View style={{ marginBottom: 24, gap: 16 }}>
                        <CompanyOverviewCard
                          companyName={companyName}
                          companyId={companyId}
                          logoUrl={logoUrl}
                          statusLabel={statusLabel}
                          companyEnabled={companyEnabled}
                          companyMemberCount={companyMemberCount}
                          userLimit={userLimit}
                          seatsLeft={seatsLeft}
                          lastAuditText={lastAuditText}
                          onEditName={(hasSelectedCompany && isSuperadmin && !isCreatingNew) ? handleBannerEditName : null}
                          onChangeLogo={canEditCompanyTools ? handleBannerChangeLogo : null}
                          canEditUserLimit={canEditCompanyTools}
                          onToggleCompanyEnabled={canEditCompanyTools ? toggleCompanyEnabled : null}
                          userLimitEditorOpen={userLimitEditorOpen}
                          userLimitDraft={userLimitDraft}
                          onOpenUserLimitEditor={openUserLimitEditor}
                          onChangeUserLimitDraft={setUserLimitDraft}
                          onSaveUserLimit={saveUserLimitFromDraft}
                          onCancelUserLimitEditor={cancelUserLimitEditor}
                          busy={busyCount > 0}
                        />

                        {allowedTools ? (
                          <AdminQuickActionsGrid items={adminQuickActions} />
                        ) : null}
                      </View>
                    ) : null}

                {/* SHAREPOINT – en lista: siter, typ, status, åtgärder. DK Bas/DK Site låsta. */}
                {canSeeSharePoint ? (
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 18, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.1, shadowRadius: 4, elevation: 3, marginBottom: 24 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Ionicons name="cloud-outline" size={20} color="#1976D2" />
                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>SharePoint</Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <TouchableOpacity
                          onPress={createCustomSharePointSite}
                          disabled={sharePointSiteCreating || busyCount > 0}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            backgroundColor: (sharePointSiteCreating || busyCount > 0) ? '#E5E7EB' : '#EFF6FF',
                            borderWidth: 1,
                            borderColor: (sharePointSiteCreating || busyCount > 0) ? '#D1D5DB' : '#BFDBFE',
                            opacity: (sharePointSiteCreating || busyCount > 0) ? 0.7 : 1,
                          }}
                          accessibilityLabel="Lägg till ny site"
                        >
                          <Ionicons name="add" size={18} color={(sharePointSiteCreating || busyCount > 0) ? '#9CA3AF' : '#1976D2'} />
                          <Text style={{ fontSize: 12, fontWeight: '600', color: (sharePointSiteCreating || busyCount > 0) ? '#9CA3AF' : '#1976D2' }}>Ny site</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => { setSpinSpSitesRefresh((n) => n + 1); reloadCompanySharePointSites(companyId, { silent: false }); }}
                          disabled={companySharePointSiteMetasLoading || busyCount > 0}
                          style={{ padding: 6, borderRadius: 8, opacity: (companySharePointSiteMetasLoading || busyCount > 0) ? 0.6 : 1 }}
                          accessibilityLabel="Uppdatera listan"
                        >
                          <Ionicons name="refresh" size={20} color="#1976D2" style={Platform.OS === 'web' ? { transform: `rotate(${spinSpSitesRefresh * 360}deg)`, transition: 'transform 0.4s ease' } : { transform: [{ rotate: `${spinSpSitesRefresh * 360}deg` }] }} />
                        </TouchableOpacity>
                      </View>
                    </View>
                    <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>
                      Siter som företaget har tillgång till. DK Bas och DK Site är låsta och kan inte tas bort.
                    </Text>

                    <View style={{ marginTop: 14, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
                      <View style={{ paddingVertical: 10, paddingHorizontal: 12, backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', flex: 1 }}>Site</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', width: 140 }}>Typ</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', width: 72 }}>Status</Text>
                        <Text style={{ fontSize: 12, fontWeight: '600', color: '#111827', width: 140 }}>Åtgärder</Text>
                      </View>
                      <ScrollView style={{ maxHeight: 320 }}>
                        {(() => {
                          const entries = buildZone3SiteEntries();
                          if (entries.length === 0) {
                            return (
                              <View style={{ padding: 16 }}>
                                <Text style={{ fontSize: 13, color: '#6B7280' }}>Inga siter ännu. Klicka på &quot;+ Ny site&quot; ovan för att lägga till.</Text>
                              </View>
                            );
                          }
                          const typLabel = (entry) => {
                            const r = normalizeRoleLabel(entry?.role);
                            const name = String(entry?.siteName || '').trim();
                            if (r === 'system') return 'System låst';
                            if (r === 'projects') return 'System låst';
                            if (/dk\s*bas/i.test(name)) return 'System låst';
                            if (/dk\s*site/i.test(name)) return 'System låst';
                            return 'Extra';
                          };
                          return entries.map((entry) => {
                            const sid = String(entry?.siteId || '').trim();
                            if (!sid) return null;
                            const status = spStatusInfo(entry);
                            const pill = spStatusPillStyle(status.tone);
                            const siteName = String(entry?.siteName || 'SharePoint-site').trim();
                            const siteUrl = String(entry?.siteUrl || '').trim();
                            const role = normalizeRoleLabel(entry?.role);
                            const isSystem = role === 'system';
                            const isProjects = role === 'projects';
                            const isCustom = role === 'custom';
                            const canOpenSystem = isSuperadmin && siteUrl;

                            return (
                              <View key={sid} style={{ paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                                <View style={{ flex: 1, minWidth: 140 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '500', color: '#111827' }} numberOfLines={1}>{siteName}</Text>
                                  <Text style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }} numberOfLines={1}>{sid}</Text>
                                </View>
                                <Text style={{ fontSize: 12, color: '#374151', width: 140 }} numberOfLines={1}>{typLabel(entry)}</Text>
                                <View style={{ width: 72 }}>
                                  <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, borderWidth: 1, borderColor: pill.borderColor, backgroundColor: pill.backgroundColor, alignSelf: 'flex-start' }}>
                                    <Text style={{ fontSize: 11, fontWeight: '600', color: pill.color }}>{status.label}</Text>
                                  </View>
                                </View>
                                <View style={{ width: 140, flexDirection: 'row', justifyContent: 'flex-end' }}>
                                  <TouchableOpacity
                                    ref={(el) => { spKebabButtonRefs.current[sid] = el; }}
                                    onPress={() => {
                                      const node = spKebabButtonRefs.current[sid];
                                      if (node && typeof node.measureInWindow === 'function') {
                                        node.measureInWindow((x, y, w, h) => {
                                          setSpKebabPosition({ x, y: y + (h || 0) + 4 });
                                          setSpKebabSiteId(sid);
                                        });
                                      } else {
                                        setSpKebabPosition({ x: 0, y: 0 });
                                        setSpKebabSiteId(sid);
                                      }
                                    }}
                                    style={{ padding: 8, borderRadius: 8, opacity: busyCount > 0 ? 0.6 : 1 }}
                                    accessibilityLabel="Åtgärder"
                                  >
                                    <Ionicons name="ellipsis-vertical" size={20} color="#6B7280" />
                                  </TouchableOpacity>
                                </View>
                              </View>
                            );
                          });
                        })()}
                      </ScrollView>
                    </View>

                    {(() => {
                      const kebabEntry = spKebabSiteId ? buildZone3SiteEntries().find((e) => String(e?.siteId || '').trim() === String(spKebabSiteId || '').trim()) : null;
                      const role = kebabEntry ? normalizeRoleLabel(kebabEntry?.role) : null;
                      const isSystemRole = role === 'system';
                      const isProjectsRole = role === 'projects';
                      const isCustomRole = role === 'custom';
                      const kebabSiteUrl = String(kebabEntry?.siteUrl || '').trim();
                      const kebabSiteName = String(kebabEntry?.siteName || 'SharePoint-site').trim();
                      const kebabItems = [];
                      if (kebabSiteUrl) kebabItems.push({ key: 'open', label: 'Öppna' });
                      if (isCustomRole) {
                        kebabItems.push({ key: 'rename', label: 'Byt namn' });
                        kebabItems.push({ key: 'delete', label: 'Ta bort', danger: true });
                      }
                      return (
                        <ContextMenu
                          visible={!!spKebabSiteId && kebabItems.length > 0}
                          x={spKebabPosition.x}
                          y={spKebabPosition.y}
                          items={kebabItems}
                          onSelect={(item) => {
                            const key = item?.key;
                            if (key === 'open' && kebabSiteUrl) openInSharePoint(kebabSiteUrl);
                            if (key === 'rename' && spKebabSiteId) {
                              setSharePointRenameSiteId(spKebabSiteId);
                              setSharePointRenameCurrentName(kebabSiteName);
                              setSharePointRenameDraft(kebabSiteName);
                            }
                            if (key === 'delete' && spKebabSiteId && companyId) {
                              const compId = String(companyId).trim();
                              const conf = (typeof window !== 'undefined') ? window.confirm(`Ta bort kopplingen till "${kebabSiteName}"?\n\nDetta tar bort siten från företaget i Digitalkontroll. Siten raderas inte i SharePoint.`) : true;
                              if (!conf) { setSpKebabSiteId(null); return; }
                              const endBusy = beginBusy('Tar bort…', { silent: false });
                              (async () => {
                                try {
                                  const { deleteDoc, doc } = await import('firebase/firestore');
                                  const { db } = await import('../components/firebase');
                                  await deleteDoc(doc(db, 'foretag', compId, 'sharepoint_sites', spKebabSiteId));
                                  try {
                                    const cfg = await getSharePointNavigationConfig(compId).catch(() => null);
                                    const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
                                    const nextEnabled = enabledSites.filter((x) => String(x || '').trim() !== spKebabSiteId);
                                    await saveSharePointNavigationConfig(compId, { ...(cfg || {}), enabledSites: nextEnabled });
                                  } catch (_e) {}
                                  await reloadCompanySharePointSites(compId, { silent: true });
                                } catch (e) {
                                  console.error('[ManageCompany] Delete custom site meta failed:', e);
                                  try { if (typeof window !== 'undefined') window.alert('Kunde inte ta bort: ' + (e?.message || e)); } catch (_e) {}
                                } finally {
                                  endBusy();
                                  setSpKebabSiteId(null);
                                }
                              })();
                              return;
                            }
                            setSpKebabSiteId(null);
                          }}
                          onClose={() => setSpKebabSiteId(null)}
                        />
                      );
                    })()}
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

        {/* Byt namn på site (egna siter) */}
        <Modal
          visible={!!sharePointRenameSiteId}
          transparent
          animationType="fade"
          onRequestClose={() => { setSharePointRenameSiteId(''); setSharePointRenameCurrentName(''); setSharePointRenameDraft(''); }}
        >
          <Pressable
            style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.45)', justifyContent: 'center', alignItems: 'center', padding: 20 }}
            onPress={() => { setSharePointRenameSiteId(''); setSharePointRenameCurrentName(''); setSharePointRenameDraft(''); }}
          >
            <Pressable style={{ backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, padding: 20 }} onPress={(e) => e.stopPropagation()}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#111827' }}>Byt namn på site</Text>
              <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 6 }}>Nuvarande namn: {sharePointRenameCurrentName}</Text>
              <TextInput
                value={sharePointRenameDraft}
                onChangeText={setSharePointRenameDraft}
                placeholder="Nytt namn"
                style={{ marginTop: 12, borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14 }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 16 }}>
                <TouchableOpacity onPress={() => { setSharePointRenameSiteId(''); setSharePointRenameCurrentName(''); setSharePointRenameDraft(''); }} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: '#F3F4F6' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#374151' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleRenameCustomSite} disabled={!String(sharePointRenameDraft || '').trim()} style={{ paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8, backgroundColor: String(sharePointRenameDraft || '').trim() ? '#1976D2' : '#9CA3AF' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#fff' }}>Spara</Text>
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
