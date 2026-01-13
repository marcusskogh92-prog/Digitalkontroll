import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ImageBackground, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, createCompanyControlType, DEFAULT_CONTROL_TYPES, fetchCompanyControlTypes } from '../components/firebase';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

// Ikonuppsättning för nya kontrolltyper (ca 36 bygg-/kontrollrelaterade varianter)
const CONTROL_TYPE_ICON_CHOICES = [
  { icon: 'construct-outline', color: '#1976D2' },
  { icon: 'checkmark-done-outline', color: '#388E3C' },
  { icon: 'water-outline', color: '#0288D1' },
  { icon: 'checkbox-outline', color: '#7B1FA2' },
  { icon: 'warning-outline', color: '#FFD600' },
  { icon: 'shield-half-outline', color: '#388E3C' },
  { icon: 'document-text-outline', color: '#455A64' },
  { icon: 'document-outline', color: '#1976D2' },
  { icon: 'clipboard-outline', color: '#1976D2' },
  { icon: 'save-outline', color: '#D32F2F' },
  { icon: 'calendar-outline', color: '#1976D2' },
  { icon: 'cube-outline', color: '#1976D2' },
  { icon: 'camera', color: '#1976D2' },
  { icon: 'images', color: '#00897B' },
  { icon: 'partly-sunny', color: '#FFA000' },
  { icon: 'sunny-outline', color: '#FBC02D' },
  { icon: 'alert-circle', color: '#D32F2F' },
  { icon: 'checkmark-circle', color: '#43A047' },
  { icon: 'remove-circle', color: '#607D8B' },
  { icon: 'close-circle-outline', color: '#D32F2F' },
  { icon: 'options-outline', color: '#6A1B9A' },
  { icon: 'copy-outline', color: '#00897B' },
  { icon: 'business', color: '#2E7D32' },
  { icon: 'home-outline', color: '#1976D2' },
  { icon: 'person-outline', color: '#1976D2' },
  { icon: 'list', color: '#1565C0' },
  { icon: 'filter', color: '#1976D2' },
  { icon: 'search', color: '#1976D2' },
  { icon: 'add-circle-outline', color: '#1976D2' },
  { icon: 'add-circle', color: '#43A047' },
  // Extra bygg-/installationsrelaterade ikoner för EL, VVS, mark, rivning, ventilation m.m.
  { icon: 'flash-outline', color: '#FBC02D' },      // El
  { icon: 'thermometer-outline', color: '#1976D2' }, // Klimat / VVS
  { icon: 'flame-outline', color: '#D32F2F' },       // Heta arbeten / rivning
  { icon: 'leaf-outline', color: '#43A047' },        // Miljö / energi
  { icon: 'rainy-outline', color: '#0288D1' },       // Väder / fukt / mark
  { icon: 'map-outline', color: '#6D4C41' },         // Mark / plats
];

export default function ManageControlTypes({ route, navigation }) {
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);
  const [newControlTypeName, setNewControlTypeName] = useState('');
  const [savingControlType, setSavingControlType] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(CONTROL_TYPE_ICON_CHOICES[0]?.icon || 'document-text-outline');
  const [selectedIconColor, setSelectedIconColor] = useState(CONTROL_TYPE_ICON_CHOICES[0]?.color || '#6A1B9A');

  useEffect(() => {
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
  }, [navigation]);

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
        const cid = companyFromClaims || stored || '';
        const canSeeAll = isSuperClaim || isEmailSuperadmin || (cid === 'MS Byggsystem' && isAdminClaim);
        const allowHeader = isEmailSuperadmin || isSuperClaim || isAdminClaim;
        if (cid === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowedTools(true);
        }
        if (mounted) {
          setCanSeeAllCompanies(!!canSeeAll);
          setShowHeaderUserMenu(!!allowHeader);
        }
      } catch(_e) {}
      if (mounted) {
        setAllowedTools(prev => prev);
        setCanSeeAllCompanies(prev => prev);
        setShowHeaderUserMenu(prev => prev);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Ladda kontrolltyper när valt företag ändras
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
        if (mounted && Array.isArray(list) && list.length > 0) setControlTypes(list);
        else if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);


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

  // Uppdatera listan om kontrolltyperna ändras via sidomenyn (t.ex. byt namn/dölj/radera)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      try {
        const cid = String(event?.detail?.companyId || '').trim();
        const current = String(companyId || '').trim();
        if (!cid || !current || cid !== current) return;
      } catch (_e) {
        return;
      }

      (async () => {
        try {
          const list = await fetchCompanyControlTypes(companyId);
          setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
        } catch (_e) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      })();
    };

    window.addEventListener('dkControlTypesUpdated', handler);
    return () => {
      try { window.removeEventListener('dkControlTypesUpdated', handler); } catch (_e) {}
    };
  }, [companyId]);

  if (Platform.OS === 'web') {
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const hasSelectedCompany = !!String(companyId || '').trim();
    const sidebarRestrictId = canSeeAllCompanies ? null : companyId;

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={async (payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();
              if (cid) setCompanyId(cid);
              if (payload?.createControlType && cid) {
                setNewControlTypeName('');
                const baseIcon = CONTROL_TYPE_ICON_CHOICES[0]?.icon || 'document-text-outline';
                const baseColor = CONTROL_TYPE_ICON_CHOICES[0]?.color || '#6A1B9A';
                setSelectedIcon(baseIcon);
                setSelectedIconColor(baseColor);
                setShowAddModal(true);
              }
            } catch (_e) {}
          }}
          sidebarTitle="Kontrolltyper"
          sidebarIconName="options-outline"
          sidebarIconColor="#6A1B9A"
          sidebarSearchPlaceholder="Sök kontroll"
          sidebarCompaniesMode={true}
          sidebarShowMembers={false}
          sidebarRestrictCompanyId={sidebarRestrictId}
          sidebarHideCompanyActions={true}
          sidebarAutoExpandMembers={true}
          sidebarTemplatesMode={false}
          sidebarControlTypesMode={true}
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
                    <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>{loggingOut ? 'Loggar ut…' : 'Logga ut'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 760, maxWidth: '100%' }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                  <Ionicons name="chevron-back" size={20} color="#222" />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="options-outline" size={14} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Kontrolltyper</Text>
                </View>
              </View>

              <View style={{ maxWidth: 680 }}>
                {!hasSelectedCompany && (
                  <View style={{
                    width: '84%',
                    marginLeft: '8%',
                    marginBottom: 12,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: '#FFF8E1',
                    borderWidth: 1,
                    borderColor: '#FFE082',
                  }}>
                    <Text style={{ fontSize: 13, color: '#5D4037' }}>
                      Välj ett företag i listan till vänster för att kunna hantera dess kontrolltyper.
                    </Text>
                  </View>
                )}

                <View style={{ marginTop: 4, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ marginBottom: 4, fontSize: 13, color: '#444' }}>Sammanfattning</Text>
                  <View
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      backgroundColor: '#f5f5f5',
                      borderWidth: 1,
                      borderColor: '#ddd',
                    }}
                  >
                    <Text style={{ color: '#333', fontSize: 13 }}>
                      {hasSelectedCompany
                        ? `Antal kontrolltyper: ${Array.isArray(controlTypes) ? controlTypes.length : 0}`
                        : 'Inget företag valt ännu.'}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 18, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                    Högerklicka på ett företagsnamnet i listan till vänster och välj "Lägg till kontrolltyp" för att lägga till egna kontrollpunkter.
                    {'\n'}{'\n'}För att redigera kontrollen kan ni högerklicka på den i listan och välja mellan att byta namn, dölj/aktivera eller radera kontrollen.
                  </Text>
                </View>
              </View>
            </View>
          </View>
          {showAddModal && (
            <View
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 200,
              }}
            >
              <View
                style={{
                  width: 440,
                  maxWidth: '90%',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="options-outline" size={16} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Ny kontrolltyp</Text>
                </View>

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
                <TextInput
                  value={newControlTypeName}
                  onChangeText={setNewControlTypeName}
                  placeholder="Namn på kontrolltyp (t.ex. Avprovning)"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, backgroundColor: '#fff', marginBottom: 12 }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Välj ikon</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
                  {CONTROL_TYPE_ICON_CHOICES.map((t, index) => {
                    const active = selectedIcon === t.icon;
                    return (
                      <TouchableOpacity
                        key={t.icon + '-' + index}
                        onPress={() => {
                          setSelectedIcon(t.icon);
                          setSelectedIconColor(t.color || '#6A1B9A');
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: active ? '#6A1B9A' : '#ddd',
                          backgroundColor: active ? '#F3E5F5' : '#fff',
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Ionicons name={t.icon} size={16} color={t.color || '#455A64'} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingControlType) return;
                      setShowAddModal(false);
                      setNewControlTypeName('');
                    }}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: '#555' }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const name = String(newControlTypeName || '').trim();
                      if (!companyId || !name) return;
                      try {
                        setSavingControlType(true);
                        await createCompanyControlType({ name, icon: selectedIcon, color: selectedIconColor }, companyId);
                        setNewControlTypeName('');
                        setShowAddModal(false);
                        try {
                          const list = await fetchCompanyControlTypes(companyId);
                          setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                        } catch (_e) {}
                      } catch (_e) {
                      } finally {
                        setSavingControlType(false);
                      }
                    }}
                    disabled={savingControlType || !newControlTypeName.trim()}
                    style={{
                      backgroundColor: savingControlType || !newControlTypeName.trim() ? '#B0BEC5' : '#6A1B9A',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      {savingControlType ? 'Sparar…' : 'Spara kontrolltyp'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </MainLayout>
      </RootContainer>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Kontrolltyper</Text>
      <Text style={{ fontSize: 14, color: '#555' }}>
        Här kommer du kunna hantera egna kontrolltyper per företag. Funktionen är under utveckling.
      </Text>
    </View>
  );
}
