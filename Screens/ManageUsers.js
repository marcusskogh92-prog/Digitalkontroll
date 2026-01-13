import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, FlatList, ImageBackground, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, createUserRemote, fetchCompanyMembers, fetchCompanyProfile } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageUsers({ route, navigation }) {
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');

  useEffect(() => {
    // Align header with other admin views (logos, no inline title)
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

  // Decide if interactive tools (manage company/users) should be shown (same gating as ManageCompany)
  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
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

  // Listen for global home event from sidebar (web) and navigate back to dashboard without logging out
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

  // Load profile + members whenever companyId changes
  useEffect(() => {
    (async () => {
      try {
        if (!companyId) {
          setProfile(null);
          setMembers([]);
          return;
        }
        setLoading(true);
        const prof = await fetchCompanyProfile(companyId);
        setProfile(prof || null);
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } catch (e) {
        console.warn(e);
      } finally { setLoading(false); }
    })();
  }, [companyId]);

  // Web: lyssna på uppdateringar från Hantera företag så att profil/userLimit
  // uppdateras direkt om man har Hantera användare öppet samtidigt.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const handler = (event) => {
      try {
        const cid = event?.detail?.companyId;
        const profilePatch = event?.detail?.profile || {};
        if (!cid || cid !== companyId) return;

        (async () => {
          let latestProfile = null;
          try {
            latestProfile = await fetchCompanyProfile(companyId).catch(() => null);
          } catch (_err) {
            latestProfile = null;
          }
          const merged = latestProfile ? { ...(latestProfile || {}), ...profilePatch } : profilePatch;
          setProfile(prev => ({ ...(prev || {}), ...merged }));
        })();
      } catch (_e) {}
    };

    window.addEventListener('dkCompanyProfileUpdated', handler);
    return () => {
      try { window.removeEventListener('dkCompanyProfileUpdated', handler); } catch (_e) {}
    };
  }, [companyId]);

  let userLimitNumber = null;
  if (profile && profile.userLimit !== undefined && profile.userLimit !== null && profile.userLimit !== '') {
    try {
      const raw = String(profile.userLimit).trim();
      const m = raw.match(/-?\d+/);
      if (m && m[0]) {
        const n = parseInt(m[0], 10);
        if (!Number.isNaN(n) && Number.isFinite(n)) userLimitNumber = n;
      }
    } catch (_) {}
  }

  // Pragmatic fallback: MS Byggsystem standard 10 licenser om inget annat hittas
  if (userLimitNumber === null && companyId === 'MS Byggsystem') {
    userLimitNumber = 10;
  }

  const seatsLeft = (userLimitNumber !== null) ? Math.max(0, userLimitNumber - (Array.isArray(members) ? members.length : 0)) : null;

  const handleAdd = async () => {
    if (!newEmail) return Alert.alert('Fel', 'Ange e-post');
    if (seatsLeft !== null && seatsLeft <= 0) return Alert.alert('Fel', 'Inga platser kvar enligt userLimit');
    // Use callable Cloud Function to create Auth user + member doc
    try {
      const email = String(newEmail).trim().toLowerCase();
      const displayName = String(newName).trim() || email.split('@')[0];
      const payload = { companyId, email, displayName };
      const result = await createUserRemote(payload);
      if (result && result.ok) {
        Alert.alert('Ok', `Användare skapad. Temporärt lösenord: ${result.tempPassword || result.tempPassword || result.tempPassword || result.tempPassword || result.tempPassword || ''}`.replace(/: $/, ''));
        setNewName(''); setNewEmail('');
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } else if (result && result.uid) {
        Alert.alert('Ok', 'Användare skapad.');
        setNewName(''); setNewEmail('');
        const mems = await fetchCompanyMembers(companyId) || [];
        setMembers(mems);
      } else {
        Alert.alert('Fel', 'Kunde inte skapa användare.');
      }
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const renderItem = ({ item }) => (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#f0f0f0' }}>
      <Text style={{ fontSize: 15, fontWeight: '600' }}>{formatPersonName(item.displayName || item.email)}</Text>
      <Text style={{ color: '#666', marginTop: 4 }}>{item.email || ''}</Text>
    </View>
  );

  // Web: use same layout as ManageCompany (sidebar + top bar + background)
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

    // Superadmin / MS Byggsystem-admin (canSeeAllCompanies === true) ska kunna se alla
    // företag i listan. Vanliga företags-admins ser bara sitt eget företag.
    const sidebarRestrictId = canSeeAllCompanies ? null : companyId;

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={(payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();
              setCompanyId(cid || '');
            } catch (_e) {}
          }}
          sidebarTitle="Användarlista"
          sidebarIconName="person"
          sidebarIconColor="#1976D2"
          sidebarSearchPlaceholder="Sök användare"
          sidebarCompaniesMode={true}
          sidebarShowMembers={true}
          sidebarRestrictCompanyId={sidebarRestrictId}
          sidebarHideCompanyActions={true}
          sidebarAutoExpandMembers={true}
          sidebarSearchMembersOnly={true}
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
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 760, maxWidth: '100%' }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                  <Ionicons name="chevron-back" size={20} color="#222" />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="person" size={14} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Hantera användare</Text>
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
                      Välj ett företag i listan till vänster för att se och hantera dess användare.
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
                      {profile
                        ? `Platser: ${userLimitNumber !== null ? userLimitNumber : '—'} — Användare: ${members.length}`
                        : hasSelectedCompany ? 'Läser profil…' : 'Inget företag valt ännu.'}
                    </Text>
                    {seatsLeft !== null ? (
                      <Text style={{ marginTop: 4, fontSize: 12, color: seatsLeft > 0 ? '#2E7D32' : '#D32F2F' }}>
                        {`Platser kvar: ${seatsLeft}`}
                      </Text>
                    ) : null}
                  </View>
                </View>

                <View style={{ marginTop: 16, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                    Användare skapas och hanteras via listan till vänster.
                    Högerklicka på företaget för att lägga till eller ta bort användare.
                  </Text>
                </View>

                {hasSelectedCompany && (
                  <View style={{ marginTop: 20, width: '84%', marginLeft: '8%' }}>
                    <Text style={{ fontSize: 14, fontWeight: '700', color: '#222', marginBottom: 6 }}>
                      Användare i {companyId}
                    </Text>
                    <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#fafafa' }}>
                      {Array.isArray(members) && members.length > 0 ? (
                        members.map((m) => {
                          const role = String(m.role || '').trim();
                          let roleLabel = 'Användare';
                          let roleColor = '#455A64';
                          if (role === 'admin') { roleLabel = 'Admin'; roleColor = '#1565C0'; }
                          else if (role === 'superadmin') { roleLabel = 'Superadmin'; roleColor = '#C62828'; }

                          return (
                            <View
                              key={m.uid || m.id || m.email}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: '#e0e0e0',
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                              }}
                            >
                              <View style={{ flex: 1, marginRight: 12 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#222' }}>
                                  {formatPersonName(m.displayName || m.email || '')}
                                </Text>
                                <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{m.email || ''}</Text>
                              </View>
                              <View style={{ paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#ECEFF1' }}>
                                <Text style={{ fontSize: 11, fontWeight: '600', color: roleColor }}>{roleLabel}</Text>
                              </View>
                            </View>
                          );
                        })
                      ) : (
                        <View style={{ paddingVertical: 10, paddingHorizontal: 10 }}>
                          <Text style={{ fontSize: 13, color: '#D32F2F' }}>Ingen användare skapad.</Text>
                        </View>
                      )}
                    </View>
                  </View>
                )}
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
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Hantera användare</Text>
        <Text style={{ marginTop: 8 }}>{profile ? `Platser: ${userLimitNumber !== null ? userLimitNumber : '—'} — Användare: ${members.length}` : 'Läser profil...'}</Text>
        {seatsLeft !== null ? <Text style={{ marginTop: 6, color: seatsLeft > 0 ? '#2E7D32' : '#D32F2F' }}>{`Platser kvar: ${seatsLeft}`}</Text> : null}

        <View style={{ marginTop: 12 }}>
          <Text style={{ marginBottom: 6 }}>Namn</Text>
          <TextInput value={newName} onChangeText={setNewName} placeholder="Förnamn Efternamn" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
          <Text style={{ marginTop: 12, marginBottom: 6 }}>Email</Text>
          <TextInput value={newEmail} onChangeText={setNewEmail} placeholder="user@company.se" keyboardType="email-address" style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }} />
          <TouchableOpacity onPress={handleAdd} style={{ backgroundColor: '#1976D2', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' }}>
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lägg till användare</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Nuvarande användare</Text>
          <FlatList data={members} keyExtractor={(i) => String(i.uid || i.id || i.email || Math.random())} renderItem={renderItem} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
