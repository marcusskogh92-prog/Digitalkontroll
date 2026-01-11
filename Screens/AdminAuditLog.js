import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ImageBackground, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { auth, fetchAdminAuditEvents } from '../components/firebase';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function AdminAuditLog({ navigation }) {
  const [allowedTools, setAllowedTools] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterCompanyId, setFilterCompanyId] = useState(null);

  useEffect(() => {
    // Align header with ManageCompany
    try {
      navigation.setOptions({
        headerTitle: () => null,
        headerLeft: () => (
          <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
            <DigitalKontrollHeaderLogo />
          </View>
        ),
        headerRight: () => (
          <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center' }}>
            <CompanyHeaderLogo />
          </View>
        ),
        headerBackTitle: '',
      });
    } catch (_e) {}
  }, []);

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

    window.addEventListener('dkGoHome', handler);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
    };
  }, [navigation]);

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

  const selectedFilter = String(filterCompanyId || '').trim();

  if (Platform.OS === 'web') {
    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={handleSelectCompany}
          sidebarTitle="Företag / filter"
          sidebarSearchPlaceholder="sök företag"
          sidebarCompaniesMode={true}
          sidebarShowMembers={allowedTools}
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
                      onPress={() => setSupportMenuOpen(s => !s)}
                    >
                      <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#222', paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', minWidth: 72 }}
                    onPress={async () => {
                      setLoggingOut(true);
                      try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
                      await auth.signOut();
                      setLoggingOut(false);
                      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    }}
                  >
                    <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Logga ut</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            <View style={[dashboardCardStyle, { marginBottom: 16 }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                  <Ionicons name="chevron-back" size={20} color="#222" />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1565C0', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="list" size={14} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Adminlogg</Text>
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

              <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 8, maxHeight: 440, overflow: 'hidden', backgroundColor: '#fafafa' }}>
                {loading ? (
                  <Text style={{ fontSize: 13, color: '#666' }}>Laddar logg...</Text>
                ) : (Array.isArray(events) && events.length > 0 ? (
                  <ScrollView style={{ maxHeight: 420 }}>
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
                  </ScrollView>
                ) : (
                  <Text style={{ fontSize: 13, color: '#666' }}>Inga loggposter hittades än.</Text>
                ))}
              </View>
            </View>
          </View>
        </MainLayout>
      </RootContainer>
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
