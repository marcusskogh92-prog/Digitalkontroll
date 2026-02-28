import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Platform, Text, View } from 'react-native';
import { HomeHeader } from '../components/common/HomeHeader';
import { auth, fetchCompanyProfile, requestSubscriptionUpgradeRemote } from '../components/firebase';
import CompanyUsersContent from '../components/CompanyUsersContent';
import MainLayout from '../components/MainLayout';
import { useSharePointStatus } from '../hooks/useSharePointStatus';

export default function ManageUsers({ route, navigation }) {
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId, searchSpinAnim });

  const [profile, setProfile] = useState(null);
  const [memberCount, setMemberCount] = useState(0);
  const [reloadKey, setReloadKey] = useState(0);

  const [upgradeSending, setUpgradeSending] = useState(false);

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [lockedCompanyId, setLockedCompanyId] = useState('');
  const [currentClaims, setCurrentClaims] = useState({ admin: false, superadmin: false, role: '' });

  const isWeb = Platform.OS === 'web';
  const currentUid = String(auth?.currentUser?.uid || '').trim();
  const currentEmail = String(auth?.currentUser?.email || '').toLowerCase();

  const isEmailSuperadmin = currentEmail === 'marcus@msbyggsystem.se'
    || currentEmail === 'marcus.skogh@msbyggsystem.se'
    || currentEmail === 'marcus.skogh@msbyggsystem.com'
    || currentEmail === 'marcus.skogh@msbyggsystem';

  const isSuperAdmin = !!(currentClaims?.superadmin || currentClaims?.role === 'superadmin' || isEmailSuperadmin);
  const isCompanyAdmin = !!(currentClaims?.admin || currentClaims?.role === 'admin' || isSuperAdmin);

  // Keep selected companyId in storage so global tools resolve correctly.
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

  // Permission gating (same intent as before)
  useEffect(() => {
    if (!isWeb) return undefined;
    let mounted = true;
    (async () => {
      try {
        const tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null);
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const cid = companyFromClaims || stored || '';

        const canSeeAll = isSuperClaim || isEmailSuperadmin || (cid === 'MS Byggsystem' && isAdminClaim);
        const allowHeader = isEmailSuperadmin || isSuperClaim || isAdminClaim;

        if (!mounted) return;
        setCurrentClaims({ admin: isAdminClaim, superadmin: isSuperClaim, role: String(claims?.role || (isSuperClaim ? 'superadmin' : (isAdminClaim ? 'admin' : ''))) });
        setAllowedTools(!!allowHeader);
        setCanSeeAllCompanies(!!canSeeAll);
        setShowHeaderUserMenu(!!allowHeader);
        setLockedCompanyId(canSeeAll ? '' : cid);
        if (!canSeeAll && cid && (!companyId || String(companyId).trim() !== cid)) {
          setCompanyId(cid);
        }
      } catch (_e) {
        if (!mounted) return;
        setAllowedTools(false);
        setCanSeeAllCompanies(false);
        setShowHeaderUserMenu(false);
        setLockedCompanyId('');
      }
    })();
    return () => { mounted = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const companyName = String(profile?.companyName || profile?.name || companyId || '').trim();

  const userLimitNumber = useMemo(() => {
    let n = null;
    if (profile && profile.userLimit !== undefined && profile.userLimit !== null && profile.userLimit !== '') {
      try {
        const raw = String(profile.userLimit).trim();
        const m = raw.match(/-?\d+/);
        if (m && m[0]) {
          const parsed = parseInt(m[0], 10);
          if (!Number.isNaN(parsed) && Number.isFinite(parsed)) n = parsed;
        }
      } catch (_e) {}
    }
    if (n === null && String(companyId || '').trim() === 'MS Byggsystem') return 10;
    return n;
  }, [profile, companyId]);

  const usageLine = useMemo(() => {
    if (!companyId) return '';
    if (typeof userLimitNumber === 'number') return `Användare: ${memberCount} / ${userLimitNumber}`;
    return `Användare: ${memberCount}`;
  }, [companyId, memberCount, userLimitNumber]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId) {
        setProfile(null);
        return;
      }
      try {
        const prof = await fetchCompanyProfile(companyId).catch(() => null);
        if (!cancelled) setProfile(prof || null);
      } catch (_e) {}
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  useEffect(() => {
    if (!isWeb || typeof window === 'undefined') return undefined;
    const handler = () => {
      try { navigation.reset({ index: 0, routes: [{ name: 'Home' }] }); } catch (_e) {}
    };
    const handleRefresh = () => {
      try { setReloadKey((k) => k + 1); } catch (_e) {}
    };
    window.addEventListener('dkGoHome', handler);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, isWeb]);

  const handleUpgrade = async () => {
    if (upgradeSending) return;
    const conf = (typeof window !== 'undefined')
      ? window.confirm('Vill du utöka ditt abonnemang? Klickar du Ja så tar vi kontakt med dig.')
      : true;
    if (!conf) return;

    setUpgradeSending(true);
    try {
      await requestSubscriptionUpgradeRemote({ companyId });
      try { if (typeof window !== 'undefined') window.alert('Tack! Vi kontaktar dig snarast.'); } catch (_e) {}
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    } finally {
      setUpgradeSending(false);
    }
  };

  if (!isWeb) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Användare</Text>
        <Text style={{ marginTop: 8, color: '#555' }}>Användare är just nu optimerat för webbläget.</Text>
      </View>
    );
  }

  if (!isCompanyAdmin) {
    return (
      <MainLayout adminMode={true} adminCurrentScreen="manage_users" sidebarSelectedCompanyId={companyId} adminShowCompanySelector={false}>
        <View style={{ padding: 24, borderRadius: 16, borderWidth: 1, borderColor: '#E6E8EC', backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 16, fontWeight: '800', color: '#111' }}>Ingen åtkomst</Text>
          <Text style={{ marginTop: 8, color: '#64748b' }}>Du behöver vara Admin eller Superadmin för att se Användare.</Text>
        </View>
      </MainLayout>
    );
  }

  const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };

  const handleMembersLoaded = useCallback((list) => {
    const active = Array.isArray(list)
      ? list.filter((m) => !(m?.disabled === true || String(m?.status || '').toLowerCase() === 'disabled')).length
      : 0;
    setMemberCount(active);
  }, []);

  return (
    <>
      <MainLayout
        adminMode={true}
        adminCurrentScreen="manage_users"
        adminOnSelectCompany={(payload) => {
          try {
            const cid = String(payload?.companyId || payload?.id || '').trim();
            if (!cid) return;
            if (!canSeeAllCompanies) return;
            setCompanyId(cid);
            setMemberSearch('');
          } catch (_e) {}
        }}
        adminShowCompanySelector={canSeeAllCompanies}
        sidebarSelectedCompanyId={companyId}
        sidebarCompaniesMode={true}
        sidebarShowMembers={false}
        sidebarHideCompanyActions={true}
        sidebarAutoExpandMembers={true}
        sidebarAllowCompanyManagementActions={false}
        adminCompanyBannerUsageLine={usageLine}
        adminCompanyBannerPrimaryAction={{ label: upgradeSending ? 'Skickar…' : 'Uppgradera abonnemang', iconName: 'sparkles', onPress: handleUpgrade }}
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
            handleMakeDemoAdmin={async () => {}}
            refreshLocalFallbackFlag={async () => {}}
            dumpLocalRemoteControls={async () => Alert.alert('Info', 'Debug-funktionen är inte kopplad på denna vy.')}
            showLastFsError={async () => Alert.alert('Info', 'FS-felvisning är inte kopplad på denna vy.')}
            saveControlToFirestore={async () => {}}
            saveDraftToFirestore={async () => {}}
            searchSpinAnim={searchSpinAnim}
            sharePointStatus={sharePointStatus}
          />
        }
        rightPanel={null}
      >
        <View style={dashboardContainerStyle}>
          <CompanyUsersContent
            key={reloadKey}
            companyId={companyId}
            companyName={companyName}
            onMembersLoaded={handleMembersLoaded}
          />
        </View>
      </MainLayout>
    </>
  );
}
