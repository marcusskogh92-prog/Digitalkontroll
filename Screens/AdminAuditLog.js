import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { HomeHeader } from '../components/common/HomeHeader';
import { auth, fetchAdminAuditEvents } from '../components/firebase';
import MainLayout from '../components/MainLayout';
import { useSharePointStatus } from '../hooks/useSharePointStatus';

export default function AdminAuditLog({ navigation, route }) {
  const [allowedTools, setAllowedTools] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const [loggingOut, setLoggingOut] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState(null);

  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const selectedFilter = String(filterCompanyId || '').trim();
  const { sharePointStatus } = useSharePointStatus({ companyId: selectedFilter, searchSpinAnim });

  const noopAsync = async () => {};

  const showSimpleAlert = (title, message) => {
    try {
      const t = String(title || '').trim() || 'Info';
      const m = String(message || '').trim();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(m ? `${t}\n\n${m}` : t);
      else Alert.alert(t, m || '');
    } catch (_e) {}
  };

  // Header is handled globally in App.js (web breadcrumb + logos).

  // Only superadmin / MS Byggsystem-admin should see this screen (same gating as ManageCompany)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        if (email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se') {
          if (mounted) {
            setAllowedTools(true);
            setShowHeaderUserMenu(true);
          }
          return;
        }
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const cid = companyFromClaims || stored || '';
        if (cid === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) {
            setAllowedTools(true);
            setShowHeaderUserMenu(true);
          }
          return;
        }
      } catch(_e) {}
      if (mounted) {
        setAllowedTools(false);
        setShowHeaderUserMenu(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

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
          setLoading(true);
          const items = await fetchAdminAuditEvents({ companyId: filterCompanyId || null, limitCount: 100 }).catch(() => []);
          setEvents(Array.isArray(items) ? items : []);
        } catch (_e) {
          setEvents([]);
        } finally {
          setLoading(false);
        }
      })();
    };

    window.addEventListener('dkGoHome', handler);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, filterCompanyId]);

  // Fetch latest events (global or filtered by companyId)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const items = await fetchAdminAuditEvents({ companyId: filterCompanyId || null, limitCount: 100 }).catch(() => []);
        if (!cancelled) setEvents(Array.isArray(items) ? items : []);
      } catch(_e) {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [filterCompanyId]);

  // When a company is selected in the sidebar, use it as filter
  const handleSelectCompany = (payload) => {
    try {
      if (payload?.createNew) {
        setFilterCompanyId(null);
        return;
      }
      const cid = String(payload?.companyId || payload?.id || '').trim();
      if (!cid) {
        setFilterCompanyId(null);
        return;
      }
      setFilterCompanyId(cid);
    } catch(_e) {}
  };

  if (Platform.OS === 'web') {
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    return (
      <MainLayout
        onSelectProject={handleSelectCompany}
        sidebarTitle="Företag / filter"
        sidebarSearchPlaceholder="sök företag"
        sidebarCompaniesMode={true}
        sidebarShowMembers={allowedTools}
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
            companyId={selectedFilter}
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
            <View style={[dashboardCardStyle, { marginBottom: 16 }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(_e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                    <Ionicons name="chevron-back" size={20} color="#222" />
                  </TouchableOpacity>
                  <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                      <Ionicons name="list" size={14} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }} numberOfLines={1} ellipsizeMode="tail">Adminlogg</Text>
                  </View>
                </View>
              </View>

              <View style={{ marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: '#555' }}>
                  Visar senaste åtgärder i hela systemet. Välj ett företag i listan till vänster för att filtrera loggen.
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                <Text style={{ fontSize: 13, color: '#333', marginRight: 8 }}>
                  Filter:
                </Text>
                <Text style={{ fontSize: 13, fontWeight: '600', color: selectedFilter ? '#1565C0' : '#555' }}>
                  {selectedFilter || 'Alla företag'}
                </Text>
                {selectedFilter ? (
                  <TouchableOpacity
                    style={{ marginLeft: 12, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 999, backgroundColor: '#eee' }}
                    onPress={() => setFilterCompanyId(null)}
                  >
                    <Text style={{ fontSize: 12, color: '#333' }}>Rensa filter</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

              <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 8, backgroundColor: '#fafafa' }}>
                {loading ? (
                  <Text style={{ fontSize: 13, color: '#666' }}>Laddar logg...</Text>
                ) : (Array.isArray(events) && events.length > 0 ? (
                  <View>
                    {events.map((ev) => {
                      const ts = ev?.ts && ev.ts.toDate ? ev.ts.toDate() : null;
                      const tsText = ts ? ts.toLocaleString('sv-SE') : '';
                      const type = String(ev?.type || '').trim();
                      let label = type;
                      if (type === 'createUser') label = 'Skapa användare';
                      else if (type === 'updateUser') label = 'Uppdatera användare';
                      else if (type === 'deleteUser') label = 'Ta bort användare';
                      else if (type === 'setCompanyUserLimit') label = 'Ändra antal användare (userLimit)';
                      else if (type === 'setCompanyName') label = 'Ändra företagsnamn';
                      else if (type === 'setCompanyStatus') label = 'Ändra status/dölj företag';
                      else if (type === 'provisionCompany') label = 'Skapa företag';
                      else if (type === 'purgeCompany') label = 'Permanent radering av företag';

                      const companyLabel = String(ev?.companyId || '').trim();
                      const actor = String(ev?.actorUid || '').trim();
                      const target = String(ev?.targetUid || '').trim();

                      return (
                        <View key={ev.id} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>{label}</Text>
                          {companyLabel ? (
                            <Text style={{ fontSize: 12, color: '#444' }}>Företag: {companyLabel}</Text>
                          ) : null}
                          {actor || target ? (
                            <Text style={{ fontSize: 12, color: '#666' }}>
                              {actor ? `Utförd av: ${actor}` : ''}
                              {actor && target ? ' · ' : ''}
                              {target ? `Mål: ${target}` : ''}
                            </Text>
                          ) : null}
                          {tsText ? <Text style={{ fontSize: 12, color: '#777' }}>{tsText}</Text> : null}
                        </View>
                      );
                    })}
                  </View>
                ) : (
                  <Text style={{ fontSize: 13, color: '#666' }}>Inga loggposter hittades än.</Text>
                ))}
              </View>
            </View>
          </View>
      </MainLayout>
    );
  }

  // Native/mobile fallback: simple list
  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Adminlogg</Text>
      <Text style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
        Den här vyn är optimerad för webb. Loggning fungerar ändå i bakgrunden.
      </Text>
      {loading ? (
        <Text style={{ fontSize: 14, color: '#666' }}>Laddar logg...</Text>
      ) : (Array.isArray(events) && events.length > 0 ? (
        events.map((ev) => {
          const ts = ev?.ts && ev.ts.toDate ? ev.ts.toDate() : null;
          const tsText = ts ? ts.toLocaleString('sv-SE') : '';
          const type = String(ev?.type || '').trim();
          const companyLabel = String(ev?.companyId || '').trim();
          return (
            <View key={ev.id} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: '#333' }}>{type}</Text>
              {companyLabel ? <Text style={{ fontSize: 13, color: '#444' }}>Företag: {companyLabel}</Text> : null}
              {tsText ? <Text style={{ fontSize: 12, color: '#777' }}>{tsText}</Text> : null}
            </View>
          );
        })
      ) : (
        <Text style={{ fontSize: 14, color: '#666' }}>Inga loggposter hittades än.</Text>
      ))}
    </ScrollView>
  );
}
