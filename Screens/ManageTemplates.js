import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, FlatList, ImageBackground, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, createCompanyMall, DEFAULT_CONTROL_TYPES, deleteCompanyMall, fetchCompanyControlTypes, fetchCompanyMallar } from '../components/firebase';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageTemplates({ route, navigation }) {
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [controlType, setControlType] = useState('');
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);

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

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Ladda kontrolltyper per företag (standard + ev. företags-specifika)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchCompanyControlTypes(companyId || null);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setControlTypes(list);
        } else if (mounted) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

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

  useEffect(() => {
    (async () => {
      try {
        if (!companyId) {
          setTemplates([]);
          setSelectedTemplateId(null);
          return;
        }
        setLoading(true);
        const items = await fetchCompanyMallar(companyId);
        const list = Array.isArray(items) ? items : [];
        setTemplates(list);
        // Om vi har ett valt templateId, försök återställa markeringen
        if (selectedTemplateId) {
          const exists = list.some(t => String(t.id) === String(selectedTemplateId));
          if (!exists) {
            setSelectedTemplateId(null);
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, selectedTemplateId]);

  const handleAddTemplate = async () => {
    if (!companyId) return Alert.alert('Fel', 'Välj först ett företag till vänster.');
    const title = String(newTitle || '').trim();
    if (!title) return Alert.alert('Fel', 'Ange en titel för mallen.');
     const ct = String(controlType || '').trim();
     if (!ct) return Alert.alert('Fel', 'Välj vilken kontrolltyp mallen gäller.');
    try {
      await createCompanyMall({ title, description: newDescription, controlType: ct }, companyId);
      setNewTitle('');
      setNewDescription('');
      setControlType('');
      const items = await fetchCompanyMallar(companyId);
      const list = Array.isArray(items) ? items : [];
      setTemplates(list);
      // Markera den senast skapade mallen om möjligt
      try {
        const last = list[list.length - 1];
        if (last && last.id) setSelectedTemplateId(last.id);
      } catch (_e) {}
      setTemplatesVersion(v => v + 1);
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleDeleteTemplate = async (id) => {
    if (!companyId || !id) return;
    try {
      await deleteCompanyMall({ id }, companyId);
      const items = await fetchCompanyMallar(companyId);
      const list = Array.isArray(items) ? items : [];
      setTemplates(list);
      if (selectedTemplateId && String(selectedTemplateId) === String(id)) {
        setSelectedTemplateId(null);
      }
      setTemplatesVersion(v => v + 1);
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const renderTemplate = ({ item }) => {
    const isSelected = selectedTemplateId && String(selectedTemplateId) === String(item.id);
    return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: isSelected ? '#E0F2F1' : '#fff' }}>
      <View style={{ flexShrink: 1, paddingRight: 12 }}>
        <TouchableOpacity
          onPress={() => setSelectedTemplateId(item.id)}
          style={{}}
        >
          <Text style={{ fontSize: 15, fontWeight: '600', color: isSelected ? '#00695C' : '#000' }}>{item.title || 'Namnlös mall'}</Text>
        </TouchableOpacity>
        {!!item.controlType && (
          <Text style={{ fontSize: 12, color: '#607D8B', marginTop: 2 }}>{item.controlType}</Text>
        )}
        {!!item.description && (
          <Text style={{ color: '#666', marginTop: 4 }} numberOfLines={2}>{item.description}</Text>
        )}
      </View>
      <TouchableOpacity
        onPress={() => handleDeleteTemplate(item.id)}
        style={{ paddingHorizontal: 8, paddingVertical: 4 }}
      >
        <Text style={{ fontSize: 12, color: '#D32F2F' }}>Ta bort</Text>
      </TouchableOpacity>
    </View>
  ); };

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
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={(payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();
              const tplId = payload?.templateId;
              const tpl = payload?.template;
              setCompanyId(cid || '');
              if (tplId) {
                setSelectedTemplateId(tplId);
                if (tpl && tpl.controlType) {
                  setControlType(String(tpl.controlType));
                }
              } else if (payload?.controlType) {
                setControlType(String(payload.controlType));
                setSelectedTemplateId(null);
              }
            } catch (_e) {}
          }}
          sidebarTitle="Mallar"
          sidebarIconName="copy-outline"
          sidebarIconColor="#00897B"
          sidebarSearchPlaceholder="Sök företag"
          sidebarCompaniesMode={true}
          sidebarShowMembers={false}
          sidebarRestrictCompanyId={sidebarRestrictId}
          sidebarHideCompanyActions={true}
          sidebarAutoExpandMembers={true}
          sidebarTemplatesMode={true}
          sidebarTemplatesVersion={templatesVersion}
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
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#00897B', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="copy-outline" size={14} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Mallar</Text>
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
                      Välj ett företag i listan till vänster för att se och hantera dess mallar.
                    </Text>
                  </View>
                )}

                <View style={{ marginTop: 4, width: '100%', alignItems: 'flex-start' }}>
                  <Text style={{ marginBottom: 4, marginLeft: '8%', fontSize: 13, color: '#444' }}>Sammanfattning</Text>
                  <View
                    style={{
                      width: '84%',
                      marginLeft: '8%',
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
                        ? loading
                          ? 'Läser mallar…'
                          : `Antal mallar: ${templates.length}`
                        : 'Inget företag valt ännu.'}
                    </Text>
                  </View>
                </View>

                <View style={{ marginTop: 16, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                    Skapa och hantera återanvändbara mallar kopplade till företaget.
                    Dessa kan användas som underlag vid onboarding och uppsättning av projekt.
                  </Text>
                </View>

                <View style={{ marginTop: 18, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Kontrolltyp</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 10 }}>
                    {controlTypes.map(({ name, icon, color, key }) => {
                      const displayName = name || key || '';
                      if (!displayName) return null;
                      const selected = controlType === displayName;
                      return (
                        <TouchableOpacity
                          key={key || displayName}
                          onPress={() => setControlType(displayName)}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: selected ? '#00897B' : '#e0e0e0',
                            backgroundColor: selected ? '#E0F2F1' : '#fff',
                            marginRight: 8,
                            marginBottom: 8,
                          }}
                        >
                          <Ionicons name={icon || 'document-text-outline'} size={14} color={color || '#455A64'} style={{ marginRight: 6 }} />
                          <Text style={{ fontSize: 12, color: '#263238' }}>{displayName}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Ny mall</Text>
                  <TextInput
                    value={newTitle}
                    onChangeText={setNewTitle}
                    placeholder="Titel på mall"
                    style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, marginBottom: 8, backgroundColor: '#fff' }}
                  />
                  <TextInput
                    value={newDescription}
                    onChangeText={setNewDescription}
                    placeholder="Beskrivning (valfritt)"
                    multiline
                    style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, minHeight: 60, textAlignVertical: 'top', backgroundColor: '#fff' }}
                  />
                  <TouchableOpacity
                    onPress={handleAddTemplate}
                    style={{ backgroundColor: '#00897B', padding: 10, borderRadius: 8, marginTop: 10, alignItems: 'center', alignSelf: 'flex-start', minWidth: 140 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Lägg till mall</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 22, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Befintliga mallar</Text>
                  {loading && hasSelectedCompany ? (
                    <Text style={{ fontSize: 13, color: '#666' }}>Laddar mallar…</Text>
                  ) : !hasSelectedCompany ? (
                    <Text style={{ fontSize: 13, color: '#666' }}>Välj ett företag för att se dess mallar.</Text>
                  ) : templates.length === 0 ? (
                    <Text style={{ fontSize: 13, color: '#666' }}>Inga mallar registrerade ännu.</Text>
                  ) : (
                    <FlatList
                      data={templates}
                      keyExtractor={(i) => String(i.id || Math.random())}
                      renderItem={renderTemplate}
                    />
                  )}
                </View>
              </View>
            </View>
          </View>
        </MainLayout>
      </RootContainer>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Mallar</Text>
        <Text style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Skapa och hantera återanvändbara mallar kopplade till ditt företag.
        </Text>

        <View style={{ marginTop: 4 }}>
          <Text style={{ marginBottom: 6 }}>Titel</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Titel på mall"
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
          />
          <Text style={{ marginTop: 12, marginBottom: 6 }}>Beskrivning (valfritt)</Text>
          <TextInput
            value={newDescription}
            onChangeText={setNewDescription}
            placeholder="Kort beskrivning"
            multiline
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, minHeight: 60, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={handleAddTemplate}
            style={{ backgroundColor: '#00897B', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lägg till mall</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Befintliga mallar</Text>
          {loading ? (
            <Text style={{ color: '#666' }}>Laddar mallar…</Text>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(i) => String(i.id || Math.random())}
              renderItem={renderTemplate}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
