import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Alert, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, fetchAdminAuditForCompany, fetchCompanyProfile, saveCompanyProfile } from '../components/firebase';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageCompany({ navigation }) {
  const [companyId, setCompanyId] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [userLimit, setUserLimit] = useState('10');
  const [orgNumber, setOrgNumber] = useState('');
  const [companyForm, setCompanyForm] = useState('');
  const [streetAddress, setStreetAddress] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [city, setCity] = useState('');
  const [country, setCountry] = useState('');

  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');

  const [billingAddress, setBillingAddress] = useState('');
  const [billingReference, setBillingReference] = useState('');
  const [paymentTerms, setPaymentTerms] = useState('30');
  const [invoiceMethod, setInvoiceMethod] = useState('email');
  const [loading, setLoading] = useState(false);
  const [auditEvents, setAuditEvents] = useState([]);
  const [auditLoading, setAuditLoading] = useState(false);

  useEffect(() => {
    // Keep header consistent with project views (search + logos)
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

  // Decide if interactive tools (manage company/users) should be shown
  const [allowedTools, setAllowedTools] = useState(false);
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
        if (companyId === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowedTools(true);
        }
        if (mounted) setShowHeaderUserMenu(!!allowHeader);
        return;
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
                profile: { companyName: trimmedName, userLimit: limitNum },
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

  // Web: render inside the central dashboard area so layout and background remain consistent
  if (Platform.OS === 'web') {
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardColumnsStyle = { flexDirection: 'row', alignItems: 'flex-start' };
    const dashboardSectionTitleStyle = { fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const handleSelectCompany = (payload) => {
      try {
        if (payload?.createNew) {
          // Clear form for new company
          setCompanyId('');
          setCompanyName('');
          setUserLimit('10');
          setOrgNumber(''); setCompanyForm(''); setStreetAddress(''); setPostalCode(''); setCity(''); setCountry('');
          setContactName(''); setContactEmail(''); setContactPhone('');
          setBillingAddress(''); setBillingReference(''); setPaymentTerms('30'); setInvoiceMethod('email');
          return;
        }
        const cid = String(payload?.companyId || payload?.id || '').trim();
        const prof = payload?.profile || payload || {};
        if (cid) setCompanyId(cid);
        setCompanyName(prof?.companyName || prof?.name || '');
        setUserLimit((prof && typeof prof.userLimit !== 'undefined') ? String(prof.userLimit) : '10');
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

        // Hämta senaste admin-loggposter för företaget (endast webb)
        if (Platform.OS === 'web' && cid) {
          (async () => {
            try {
              setAuditLoading(true);
              const items = await fetchAdminAuditForCompany(cid, 50).catch(() => []);
              setAuditEvents(Array.isArray(items) ? items : []);
            } catch (_e) {
              setAuditEvents([]);
            } finally {
              setAuditLoading(false);
            }
          })();
        } else {
          setAuditEvents([]);
        }
      } catch (e) {}
    };

    const hasSelectedCompany = !!(String(companyId || '').trim() || String(companyName || '').trim());
    const formDisabled = !hasSelectedCompany;

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={handleSelectCompany}
          sidebarTitle="Företagslista"
          sidebarIconName="business"
          sidebarIconColor="#2E7D32"
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
            <View style={dashboardColumnsStyle}>
              <View style={{ flex: 1, minWidth: 360, marginRight: 16 }}>
                <View style={[dashboardCardStyle, { alignSelf: 'flex-start', maxWidth: 600 }] }>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                    <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                      <Ionicons name="chevron-back" size={20} color="#222" />
                    </TouchableOpacity>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                        <Ionicons name="business" size={14} color="#fff" />
                      </View>
                      <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Hantera företag</Text>
                    </View>
                  </View>

                  <View style={{ maxWidth: 520 }}>
                  {formDisabled && (
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
                        Välj ett företag i listan till vänster för att visa och ändra dess företagsprofil.
                      </Text>
                    </View>
                  )}
                  <View style={{ paddingVertical: 6, width: '100%', alignItems: 'flex-start' }}>
                    <Text style={{ marginBottom: 6, marginLeft: '8%' }}>Företags-ID (kort identifierare)</Text>
                    <TextInput
                      value={companyId}
                      editable={false}
                      placeholder="foretag-id"
                      style={{
                        width: '84%',
                        marginLeft: '8%',
                        borderWidth: 1,
                        borderColor: '#ddd',
                        padding: 8,
                        borderRadius: 6,
                        backgroundColor: '#f5f5f5',
                        color: '#555',
                      }}
                    />
                  </View>

                  <View style={{ paddingVertical: 6, width: '100%', alignItems: 'flex-start' }}>
                    <Text style={{ marginBottom: 6, marginLeft: '8%' }}>Företagsnamn</Text>
                    <TextInput
                      value={companyName}
                      editable={false}
                      placeholder="Företagsnamn"
                      style={{
                        width: '84%',
                        marginLeft: '8%',
                        borderWidth: 1,
                        borderColor: '#ddd',
                        padding: 8,
                        borderRadius: 6,
                        backgroundColor: '#f5f5f5',
                        color: '#555',
                      }}
                    />
                  </View>

                  <View style={{ paddingVertical: 6, width: '100%', alignItems: 'flex-start' }}>
                    <Text style={{ marginBottom: 6, marginLeft: '8%' }}>Licenser (userLimit)</Text>
                    <View
                      style={{
                        width: '84%',
                        marginLeft: '8%',
                        paddingVertical: 10,
                        paddingHorizontal: 8,
                        borderRadius: 6,
                        backgroundColor: '#f5f5f5',
                        borderWidth: 1,
                        borderColor: '#ddd',
                      }}
                    >
                      <Text style={{ color: '#333' }}>
                        {hasSelectedCompany
                          ? `Max antal användare: ${userLimit !== undefined && userLimit !== null ? String(userLimit) : '—'}`
                          : 'Ingen företag valt ännu.'}
                      </Text>
                      <Text style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                        Ändra userLimit via högerklick på företaget i företagslistan till vänster.
                      </Text>
                    </View>
                  </View>
                  </View>

                  <View style={{ paddingTop: 12 }}>
                    <Text style={{ color: '#666', fontSize: 13 }}>Obs: företagsprofilen lagras i Firestore (foretag/&lt;företags‑ID&gt;/profil/public). Max antal användare (userLimit) ändras via högerklick på företag i listan till vänster.</Text>
                  </View>
                  {hasSelectedCompany ? (
                    <View style={{ marginTop: 16 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 6 }}>Senaste åtgärder (admin-logg)</Text>
                      <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 8, maxHeight: 260, overflow: 'auto', backgroundColor: '#fafafa' }}>
                        {auditLoading ? (
                          <Text style={{ fontSize: 13, color: '#666' }}>Laddar logg...</Text>
                        ) : (Array.isArray(auditEvents) && auditEvents.length > 0 ? (
                          auditEvents.map((ev) => {
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

                            return (
                              <View key={ev.id} style={{ paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                                <Text style={{ fontSize: 13, fontWeight: '600', color: '#333' }}>{label}</Text>
                                {tsText ? <Text style={{ fontSize: 12, color: '#777' }}>{tsText}</Text> : null}
                              </View>
                            );
                          })
                        ) : (
                          <Text style={{ fontSize: 13, color: '#666' }}>Inga loggposter hittades än.</Text>
                        ))}
                      </View>
                    </View>
                  ) : null}
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
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 8 }}>Hantera företag</Text>

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
