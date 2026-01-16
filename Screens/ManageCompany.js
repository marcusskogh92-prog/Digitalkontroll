import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, ImageBackground, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { adminFetchCompanyMembers, auth, fetchAdminAuditForCompany, fetchCompanies, fetchCompanyMembers, fetchCompanyProfile, purgeCompanyRemote, resolveCompanyLogoUrl, saveCompanyProfile, setCompanyNameRemote, setCompanyStatusRemote, setCompanyUserLimitRemote, storage } from '../components/firebase';
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
  const fileInputRef = useRef(null);

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
      const path = `company-logos/${encodeURIComponent(safeCompanyId)}/${Date.now()}_${file.name}`;
      const ref = storageRef(storage, path);
      await uploadBytes(ref, file);
      const url = await getDownloadURL(ref);
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
        const cid = String(payload?.companyId || payload?.id || '').trim();
        const prof = payload?.profile || payload || {};

        // UX: When selecting a company in this view, keep the overlay label stable.
        // It should always read "Laddar företag…" (not "Hämtar användare…").
        lockBusyLabel('Laddar företag…');
        const endSelectBusy = beginBusy('', { silent: true });
        try { setTimeout(() => endSelectBusy(), 250); } catch (_e) { endSelectBusy(); }

        if (cid) setCompanyId(cid);
        setCompanyName(prof?.companyName || prof?.name || '');
        setUserLimit((prof && typeof prof.userLimit !== 'undefined') ? String(prof.userLimit) : '10');
        setCompanyEnabled(typeof prof?.enabled === 'boolean' ? !!prof.enabled : true);
        setCompanyDeleted(typeof prof?.deleted === 'boolean' ? !!prof.deleted : false);
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
      } catch (_e) {}
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
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
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
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 980, maxWidth: '100%' }]}>
              {Platform.OS !== 'web' ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                      <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(_e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                        <Ionicons name="chevron-back" size={20} color="#222" />
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#2E7D32', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                          <Ionicons name="business" size={14} color="#fff" />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }} numberOfLines={1} ellipsizeMode="tail">Företag</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : null}
              <View style={{ padding: 18, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E6E8EC' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {hasSelectedCompany && (companyName || companyId) ? (
                    <>
                      <Text style={{ fontSize: 15, fontWeight: '500', color: '#666' }}>{companyName || companyId}</Text>
                      <Ionicons name="chevron-forward" size={14} color="#999" />
                    </>
                  ) : null}
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="business" size={20} color="#1976D2" />
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>Företag</Text>
                </View>
              </View>

              <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', flexDirection: 'row', minHeight: 520 }}>
                <View style={{ flex: 1, padding: 16, backgroundColor: '#fff' }}>
                  <View style={{ maxWidth: 560 }}>
                    {formDisabled && (
                      <View style={{
                        width: '100%',
                        marginBottom: 12,
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        backgroundColor: '#FFF8E1',
                        borderWidth: 1,
                        borderColor: '#FFE082',
                      }}>
                        <Text style={{ fontSize: 13, color: '#5D4037' }}>
                          Välj ett företag i listan till vänster för att visa och ändra dess företagsprofil.
                        </Text>
                      </View>
                    )}

                    <View style={{ paddingVertical: 6, width: '100%' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Företags-ID (kort identifierare)</Text>
                      <TextInput
                        value={companyId}
                        editable={false}
                        placeholder="foretag-id"
                        style={{
                          width: '100%',
                          borderWidth: 1,
                          borderColor: '#E6E8EC',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: '#f5f5f5',
                          color: '#555',
                          fontSize: 14,
                        }}
                      />
                    </View>

                    <View style={{ paddingVertical: 6, width: '100%' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Företagsnamn</Text>
                      <TextInput
                        value={companyName}
                        editable={false}
                        placeholder="Företagsnamn"
                        style={{
                          width: '100%',
                          borderWidth: 1,
                          borderColor: '#E6E8EC',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: '#f5f5f5',
                          color: '#555',
                          fontSize: 14,
                        }}
                      />
                      {hasSelectedCompany && allowedTools ? (
                        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            onClick={async () => {
                              const endBusy = beginBusy('Sparar företagsnamn…');
                              try {
                                const compId = String(companyId || '').trim();
                                if (!compId) return;
                                const current = String(companyName || '').trim();
                                const next = (typeof window !== 'undefined')
                                  ? String(window.prompt('Nytt företagsnamn:', current) || '').trim()
                                  : '';
                                if (!next || next === current) return;
                                const conf = (typeof window !== 'undefined')
                                  ? window.confirm(`Byt företagsnamn för ${compId} till "${next}"?`)
                                  : true;
                                if (!conf) return;

                                const res = await setCompanyNameRemote({ companyId: compId, companyName: next });
                                const ok = !!(res && (res.ok === true || res.success === true));
                                if (!ok) {
                                  try { if (typeof window !== 'undefined') window.alert('Kunde inte byta företagsnamn (servern avvisade ändringen).'); } catch (_e) {}
                                  return;
                                }
                                let latest = null;
                                try { latest = await fetchCompanyProfile(compId).catch(() => null); } catch (_e) { latest = null; }
                                const nameNow = String((latest && (latest.companyName || latest.name)) || next).trim();
                                setCompanyName(nameNow);
                                try {
                                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                      detail: {
                                        companyId: compId,
                                        profile: { companyName: nameNow },
                                      },
                                    }));
                                  }
                                } catch (_e) {}
                                try {
                                  if (isSuperadmin) {
                                    const sameAsDropdown = String(auditCompanyId || '').trim() === compId;
                                    await loadAuditForCompany(compId, 50, { setLogEvents: sameAsDropdown, setSelectedCompanyEvents: true });
                                  }
                                } catch (_e) {}
                              } catch (e) {
                                const rawCode = e && e.code ? String(e.code) : '';
                                const rawMsg = e && e.message ? String(e.message) : String(e || '');
                                const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                                try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte byta företagsnamn: ' + combined); } catch (_e) {}
                              } finally {
                                endBusy();
                              }
                            }}
                            style={{
                              height: 34,
                              borderRadius: 8,
                              border: '1px solid #ccc',
                              backgroundColor: '#fff',
                              padding: '0 10px',
                              cursor: 'pointer',
                              fontSize: 13,
                              fontWeight: 600,
                            }}
                          >
                            Byt företagsnamn
                          </button>
                        </div>
                      ) : null}
                    </View>

                    <View style={{ paddingVertical: 6, width: '100%' }}>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Licenser (userLimit)</Text>
                      <View
                        style={{
                          width: '100%',
                          paddingVertical: 10,
                          paddingHorizontal: 12,
                          borderRadius: 10,
                          backgroundColor: '#f5f5f5',
                          borderWidth: 1,
                          borderColor: '#E6E8EC',
                        }}
                      >
                        <Text style={{ color: '#333', fontSize: 13 }}>
                          {hasSelectedCompany
                            ? `Max antal användare: ${userLimit !== undefined && userLimit !== null ? String(userLimit) : '—'}`
                            : 'Ingen företag valt ännu.'}
                        </Text>
                        {hasSelectedCompany && allowedTools ? (
                          <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              onClick={async () => {
                                const endBusy = beginBusy('Sparar userLimit…');
                                try {
                                  const compId = String(companyId || '').trim();
                                  if (!compId) return;
                                  const current = String(userLimit || '').trim();
                                  const raw = (typeof window !== 'undefined')
                                    ? String(window.prompt('Nytt max antal användare (userLimit):', current) || '').trim()
                                    : '';
                                  if (!raw || raw === current) return;
                                  const nextNum = parseInt(raw, 10);
                                  if (!Number.isFinite(nextNum) || Number.isNaN(nextNum) || nextNum < 0) {
                                    try { if (typeof window !== 'undefined') window.alert('Ange ett giltigt tal (0 eller större).'); } catch (_e) {}
                                    return;
                                  }
                                  const conf = (typeof window !== 'undefined')
                                    ? window.confirm(`Sätta userLimit för ${compId} till ${nextNum}?`)
                                    : true;
                                  if (!conf) return;

                                  const res = await setCompanyUserLimitRemote({ companyId: compId, userLimit: nextNum });
                                  const ok = !!(res && (res.ok === true || res.success === true));
                                  if (!ok) {
                                    try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra userLimit (servern avvisade ändringen).'); } catch (_e) {}
                                    return;
                                  }
                                  let latest = null;
                                  try { latest = await fetchCompanyProfile(compId).catch(() => null); } catch (_e) { latest = null; }
                                  const limitNow = (latest && typeof latest.userLimit !== 'undefined' && latest.userLimit !== null)
                                    ? String(latest.userLimit)
                                    : String(nextNum);
                                  setUserLimit(limitNow);
                                  try {
                                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                      window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                        detail: {
                                          companyId: compId,
                                          profile: { userLimit: nextNum },
                                        },
                                      }));
                                    }
                                  } catch (_e) {}
                                  try {
                                    if (isSuperadmin) {
                                      const sameAsDropdown = String(auditCompanyId || '').trim() === compId;
                                      await loadAuditForCompany(compId, 50, { setLogEvents: sameAsDropdown, setSelectedCompanyEvents: true });
                                    }
                                  } catch (_e) {}
                                } catch (e) {
                                  const rawCode = e && e.code ? String(e.code) : '';
                                  const rawMsg = e && e.message ? String(e.message) : String(e || '');
                                  const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                                  try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte ändra userLimit: ' + combined); } catch (_e) {}
                                } finally {
                                  endBusy();
                                }
                              }}
                              style={{
                                height: 34,
                                borderRadius: 8,
                                border: '1px solid #ccc',
                                backgroundColor: '#fff',
                                padding: '0 10px',
                                cursor: 'pointer',
                                fontSize: 13,
                                fontWeight: 600,
                              }}
                            >
                              Justera antal användare (userLimit)
                            </button>
                          </div>
                        ) : (
                          <Text style={{ marginTop: 4, fontSize: 12, color: '#666' }}>
                            Endast superadmin kan ändra userLimit.
                          </Text>
                        )}
                      </View>
                    </View>

                    <View style={{ paddingTop: 12 }}>
                      <Text style={{ color: '#666', fontSize: 13 }}>Obs: företagsprofilen lagras i Firestore (foretag/&lt;företags‑ID&gt;/profil/public). Max antal användare (userLimit) ändras via högerklick på företag i listan till vänster.</Text>
                    </View>
                  </View>

                  {hasSelectedCompany && allowedTools ? (
                    <View style={{ marginTop: 16, maxWidth: 680 }}>
                      <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 8 }}>Inställningar</Text>

                      {companyDeleted ? (
                        <View style={{ borderWidth: 1, borderColor: '#FFE0B2', borderRadius: 10, padding: 12, backgroundColor: '#FFF8E1', marginBottom: 10 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <Ionicons name="eye-off" size={18} color="#EF6C00" />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 14, fontWeight: '800', color: '#E65100' }}>Företaget är DOLT i listan</Text>
                                <Text style={{ fontSize: 12, color: '#8D6E63', marginTop: 2 }}>
                                  Det visas bara när "Visa dolda företag" är ikryssat. Du kan göra det synligt igen även om det fortfarande är pausat.
                                </Text>
                              </View>
                            </View>
                            <TouchableOpacity
                              onPress={async () => {
                                if (!companyId) return;
                                const compId = String(companyId).trim();
                                const conf = (typeof window !== 'undefined')
                                  ? window.confirm(`Gör företaget ${compId} synligt i listan igen?`)
                                  : true;
                                if (!conf) return;
                                const endBusy = beginBusy('Gör synligt…');
                                try {
                                  const res = await setCompanyStatusRemote({ companyId: compId, deleted: false });
                                  const ok = !!(res && (res.ok === true || res.success === true));
                                  if (!ok) {
                                    try { if (typeof window !== 'undefined') window.alert('Kunde inte göra företaget synligt (servern avvisade ändringen).'); } catch (_e) {}
                                    return;
                                  }

                                  let latest = null;
                                  try { latest = await fetchCompanyProfile(compId).catch(() => null); } catch (_e) { latest = null; }
                                  const deletedNow = (latest && typeof latest.deleted === 'boolean') ? !!latest.deleted : false;
                                  const enabledNow = (latest && typeof latest.enabled === 'boolean') ? !!latest.enabled : companyEnabled;
                                  setCompanyDeleted(deletedNow);
                                  setCompanyEnabled(enabledNow);

                                  try {
                                    if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                      window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                        detail: { companyId: compId, profile: { deleted: deletedNow, enabled: enabledNow } },
                                      }));
                                    }
                                  } catch (_e) {}

                                  try { if (typeof window !== 'undefined') window.alert('Ok: företaget är nu synligt i listan.'); } catch (_e) {}
                                } catch (e) {
                                  const rawCode = e && e.code ? String(e.code) : '';
                                  const rawMsg = e && e.message ? String(e.message) : String(e || '');
                                  const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                                  try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte göra synligt: ' + combined); } catch (_e) {}
                                } finally {
                                  endBusy();
                                }
                              }}
                              style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#FFB74D', borderRadius: 10, paddingVertical: 8, paddingHorizontal: 12 }}
                            >
                              <Text style={{ fontWeight: '800', color: '#E65100' }}>Gör synligt</Text>
                            </TouchableOpacity>
                          </View>
                        </View>
                      ) : null}

                      {!companyDeleted && !companyEnabled ? (
                        <TouchableOpacity
                          onPress={async () => {
                            if (!companyId) return;
                            const compId = String(companyId).trim();
                            const conf = (typeof window !== 'undefined')
                              ? window.confirm(`Dölj företaget ${compId}? Det blir synligt igen via "Visa dolda företag" eller knappen "Gör synligt".`)
                              : true;
                            if (!conf) return;
                            const endBusy = beginBusy('Döljer företag…');
                            try {
                              const res = await setCompanyStatusRemote({ companyId: compId, deleted: true, enabled: false });
                              const ok = !!(res && (res.ok === true || res.success === true));
                              if (!ok) {
                                try { if (typeof window !== 'undefined') window.alert('Kunde inte dölja företaget (servern avvisade ändringen).'); } catch (_e) {}
                                return;
                              }

                              let latest = null;
                              try { latest = await fetchCompanyProfile(compId).catch(() => null); } catch (_e) { latest = null; }
                              const deletedNow = (latest && typeof latest.deleted === 'boolean') ? !!latest.deleted : true;
                              const enabledNow = (latest && typeof latest.enabled === 'boolean') ? !!latest.enabled : false;
                              setCompanyDeleted(deletedNow);
                              setCompanyEnabled(enabledNow);

                              try {
                                if (Platform.OS === 'web' && typeof window !== 'undefined') {
                                  window.dispatchEvent(new CustomEvent('dkCompanyProfileUpdated', {
                                    detail: { companyId: compId, profile: { deleted: deletedNow, enabled: enabledNow } },
                                  }));
                                }
                              } catch (_e) {}

                              try { if (typeof window !== 'undefined') window.alert('Ok: företaget är dolt i listan.'); } catch (_e) {}
                            } catch (e) {
                              const rawCode = e && e.code ? String(e.code) : '';
                              const rawMsg = e && e.message ? String(e.message) : String(e || '');
                              const combined = rawCode ? `${rawCode}: ${rawMsg}` : rawMsg;
                              try { if (typeof window !== 'undefined') window.alert('Fel: kunde inte dölja: ' + combined); } catch (_e) {}
                            } finally {
                              endBusy();
                            }
                          }}
                          style={{ borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, backgroundColor: '#F9FAFB', marginBottom: 10 }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                              <Ionicons name="eye-off" size={16} color="#6B7280" />
                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text style={{ fontSize: 14, fontWeight: '700', color: '#374151' }}>Dölj företag</Text>
                                <Text style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Tillåtet endast när företaget är pausat/inaktivt.</Text>
                              </View>
                            </View>
                            <Ionicons name="chevron-forward" size={18} color="#9CA3AF" />
                          </View>
                        </TouchableOpacity>
                      ) : null}

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
                            // Viktigt: om vi aktiverar ett dolt bolag ska det bli synligt igen.
                            const res = await setCompanyStatusRemote({ companyId: compId, enabled: wantEnable, ...(wantEnable ? { deleted: false } : {}) });
                            const ok = !!(res && (res.ok === true || res.success === true));
                            if (!ok) {
                              try { if (typeof window !== 'undefined') window.alert('Kunde inte ändra företagsstatus (servern avvisade ändringen).'); } catch (_e) {}
                              return;
                            }

                            // Läs tillbaka profil så status-pill och UI speglar servern
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

                            // Uppdatera loggvisning för valt företag
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
                        style={{
                          borderWidth: 1,
                          borderColor: companyEnabled ? '#C8E6C9' : '#FFCDD2',
                          borderRadius: 10,
                          padding: 12,
                          backgroundColor: companyEnabled ? '#F1F8E9' : '#FFEBEE',
                          marginBottom: 10,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <Ionicons name={companyEnabled ? 'checkmark-circle' : 'close-circle'} size={18} color={companyEnabled ? '#2E7D32' : '#C62828'} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 14, fontWeight: '800', color: companyEnabled ? '#1B5E20' : '#B71C1C' }}>
                                {companyEnabled ? 'Företaget är AKTIVT' : 'Företaget är INAKTIVT (pausat)'}
                              </Text>
                              <Text style={{ fontSize: 12, color: companyEnabled ? '#2E7D32' : '#C62828', marginTop: 2 }}>
                                {companyEnabled
                                  ? 'Klicka för att pausa. All data och kontroller sparas.'
                                  : (companyDeleted ? 'Klicka för att aktivera och göra företaget synligt igen.' : 'Klicka för att aktivera. Användare och admins får åtkomst igen.')}
                              </Text>
                            </View>
                          </View>
                          <Ionicons name={companyEnabled ? 'pause' : 'play'} size={18} color={companyEnabled ? '#2E7D32' : '#C62828'} />
                        </View>
                      </TouchableOpacity>

                      <TouchableOpacity
                        disabled={String(companyId || '').trim() === 'MS Byggsystem'}
                        onPress={async () => {
                          if (!companyId) return;
                          const compId = String(companyId).trim();
                          const compName = String(companyName || companyId || '').trim();
                          if (compId === 'MS Byggsystem') {
                            try { if (typeof window !== 'undefined') window.alert('MS Byggsystem kan aldrig raderas.'); } catch (_e) {}
                            return;
                          }
                          const conf = (typeof window !== 'undefined')
                            ? window.confirm(`Radera företaget "${compName}" (${compId}) permanent?\n\nDetta raderar företagets data permanent och går inte att ångra.`)
                            : true;
                          if (!conf) return;

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
                        style={{ borderWidth: 1, borderColor: '#FFCDD2', borderRadius: 10, padding: 12, backgroundColor: '#fff', opacity: String(companyId || '').trim() === 'MS Byggsystem' ? 0.55 : 1 }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <Ionicons name="trash" size={16} color="#C62828" />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={{ fontSize: 14, fontWeight: '700', color: '#C62828' }}>Radera företag</Text>
                              <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>Alla data kommer att raderas permanent.</Text>
                            </View>
                          </View>
                          <Ionicons name="chevron-forward" size={18} color="#999" />
                        </View>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                </View>

                <View style={{ width: 360, backgroundColor: '#F9FAFB', borderLeftWidth: 1, borderLeftColor: '#E6E8EC', padding: 16 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 10 }}>Företagsprofil</Text>
                  {hasSelectedCompany ? (
                    <>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#222' }} numberOfLines={1}>{companyName || companyId}</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{statusLabel}</Text>
                        </View>
                        <View style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: statusLabel === 'Aktivt' ? '#E8F5E9' : (statusLabel === 'Pausat' ? '#FFEBEE' : '#F3F4F6') }}>
                          <Text style={{ fontSize: 12, fontWeight: '600', color: statusLabel === 'Aktivt' ? '#2E7D32' : (statusLabel === 'Pausat' ? '#C62828' : '#6B7280') }}>{statusLabel}</Text>
                        </View>
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Användare</Text>
                        <Text style={{ fontSize: 13, color: '#374151' }}>
                          {typeof companyMemberCount === 'number' ? `${companyMemberCount} användare` : '— användare'}
                          {seatsLeft !== null ? ` (${seatsLeft} licenser kvar)` : ''}
                        </Text>
                      </View>

                      <View style={{ marginBottom: 12 }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Senaste aktivitet</Text>
                        <Text style={{ fontSize: 13, color: '#374151' }}>{lastAuditText || '—'}</Text>
                      </View>

                      <View style={{ marginBottom: 12, alignItems: 'center', justifyContent: 'center' }}>
                        {logoUrl ? (
                          <img
                            src={logoUrl}
                            alt="Företagslogga"
                            style={{ maxHeight: 80, maxWidth: 260, objectFit: 'contain', borderRadius: 6, border: '1px solid #eee', backgroundColor: '#fff', padding: 4 }}
                          />
                        ) : (
                          <View style={{ height: 80, width: '100%', borderRadius: 6, borderWidth: 1, borderColor: '#eee', backgroundColor: '#fafafa', alignItems: 'center', justifyContent: 'center' }}>
                            <Text style={{ fontSize: 12, color: '#999' }}>Ingen logga uppladdad ännu.</Text>
                          </View>
                        )}
                      </View>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <button
                          type="button"
                          onClick={() => {
                            try {
                              if (fileInputRef.current) fileInputRef.current.click();
                            } catch (_e) {}
                          }}
                          disabled={logoUploading}
                          style={{
                            padding: '6px 10px',
                            borderRadius: 8,
                            border: '1px solid #ccc',
                            backgroundColor: '#fafafa',
                            cursor: logoUploading ? 'default' : 'pointer',
                            fontSize: 13,
                          }}
                        >
                          {logoUploading ? 'Laddar upp logga…' : 'Byt logga'}
                        </button>
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*"
                          style={{ display: 'none' }}
                          onChange={handleLogoFileChange}
                        />
                      </div>
                    </>
                  ) : (
                    <Text style={{ fontSize: 13, color: '#666' }}>
                      Välj ett företag i listan till vänster för att visa och ändra företagsloggan.
                    </Text>
                  )}
                </View>
              </View>

              {isSuperadmin ? (
                <View style={{ marginTop: 16 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 8, flexWrap: 'wrap' }}>
                    <Text style={{ fontSize: 15, fontWeight: '700', marginBottom: 0 }}>Senaste åtgärder (admin-logg)</Text>
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

                  <View style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 8, maxHeight: 320, overflow: 'auto', backgroundColor: '#fafafa', width: '100%' }}>
                    {!auditCompanyId ? (
                      <Text style={{ fontSize: 13, color: '#666' }}>Välj ett företag för att se admin-loggen.</Text>
                    ) : auditLoading ? (
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
                        else if (type === 'setCompanyStatus') label = 'Ändra status (pausa/aktivera)';
                        else if (type === 'provisionCompany') label = 'Skapa företag';
                        else if (type === 'purgeCompany') label = 'Permanent radering av företag';

                        return (
                          <View key={ev.id} style={{ paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
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
        </MainLayout>
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
