import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, FlatList, ImageBackground, KeyboardAvoidingView, Platform, SectionList, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { adminFetchCompanyMembers, auth, createUserRemote, deleteUserRemote, fetchCompanyMembers, fetchCompanyProfile, requestSubscriptionUpgradeRemote, updateUserRemote, uploadUserAvatar } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';
import UserEditModal from '../components/UserEditModal';

export default function ManageUsers({ route, navigation }) {
  const { height: windowHeight } = useWindowDimensions();
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [members, setMembers] = useState([]);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [membersLoadError, setMembersLoadError] = useState('');
  const [membersReloadNonce, setMembersReloadNonce] = useState(0);
  const [newName, setNewName] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [userStatusSaving, setUserStatusSaving] = useState({});
  const [selectedMember, setSelectedMember] = useState(null);
  const [expandedMemberSections, setExpandedMemberSections] = useState({ admins: true, users: true });
  const [hoveredMemberKey, setHoveredMemberKey] = useState(null);

  const [memberSearch, setMemberSearch] = useState('');

  const [lockedCompanyId, setLockedCompanyId] = useState('');

  const [addUserOpen, setAddUserOpen] = useState(false);
  const [addUserSaving, setAddUserSaving] = useState(false);
  const [addUserError, setAddUserError] = useState('');

  const [profileDraftFirstName, setProfileDraftFirstName] = useState('');
  const [profileDraftLastName, setProfileDraftLastName] = useState('');
  const [profileDraftEmail, setProfileDraftEmail] = useState('');
  const [profileDraftRole, setProfileDraftRole] = useState('user');
  const [profileDraftPassword, setProfileDraftPassword] = useState('');
  const [profileShowPassword, setProfileShowPassword] = useState(false);
  const [profileDraftDisabled, setProfileDraftDisabled] = useState(false);
  const [profileDraftAvatarPreset, setProfileDraftAvatarPreset] = useState('');
  const [profileDraftAvatarFile, setProfileDraftAvatarFile] = useState(null);
  const [profileDraftAvatarPreviewUrl, setProfileDraftAvatarPreviewUrl] = useState('');
  const [profileOriginalSnapshot, setProfileOriginalSnapshot] = useState(null);
  const pendingSelectMemberRef = useRef(null);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState('');
  const [profileSaveConfirmOpen, setProfileSaveConfirmOpen] = useState(false);
  const [profileSaveConfirmText, setProfileSaveConfirmText] = useState('');
  const profileSaveConfirmTimeoutRef = useRef(null);

  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [upgradeSending, setUpgradeSending] = useState(false);
  const [upgradeError, setUpgradeError] = useState('');
  const [upgradeSuccessOpen, setUpgradeSuccessOpen] = useState(false);
  const [upgradeSuccessText, setUpgradeSuccessText] = useState('');
  const upgradeSuccessTimeoutRef = useRef(null);

  const [profileAvatarPickerOpen, setProfileAvatarPickerOpen] = useState(false);
  const profileAvatarFileInputRef = useRef(null);

  const avatarFileInputRef = useRef(null);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Keep selected companyId in storage so global tools (kontaktregister i dropdown) resolve correctly.
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

  // Header is handled globally in App.js (web breadcrumb + logos).

  // Decide if interactive tools (manage company/users) should be shown (same gating as ManageCompany)
  const [allowedTools, setAllowedTools] = useState(false);
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

        // Lock regular admins to their own company so they can't browse other companies.
        // Superadmins/MS-global admins (canSeeAll === true) are not locked.
        if (mounted) {
          setLockedCompanyId(canSeeAll ? '' : cid);
          if (!canSeeAll && cid && (!companyId || String(companyId).trim() !== cid)) {
            setCompanyId(cid);
          }
        }

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
    let cancelled = false;
    (async () => {
      try {
        if (!companyId) {
          setProfile(null);
          setMembers([]);
          setSelectedMember(null);
          setExpandedMemberSections({ admins: true, users: true });
          setMemberSearch('');
          setMembersLoadError('');
          return;
        }
        setLoading(true);
        if (!cancelled) setMembersLoadError('');
        // Avoid showing stale data while switching companies.
        if (!cancelled) {
          setProfile(null);
          setMembers([]);
        }

        // Profile may be locked down by rules across companies; try but don't block member loading.
        try {
          const prof = await fetchCompanyProfile(companyId);
          if (!cancelled) setProfile(prof || null);
        } catch (_e) {
          if (!cancelled) setProfile(null);
        }

        // Members: superadmin/MS-global admins should use admin callable (works across companies), then fallback.
        let mems = [];
        let loaded = false;
        let adminErr = null;
        let fallbackErr = null;

        if (canSeeAllCompanies) {
          try {
            const r = await adminFetchCompanyMembers(companyId);
            const arr = r && (r.members || (r.data && r.data.members)) ? (r.members || (r.data && r.data.members)) : [];
            if (Array.isArray(arr)) {
              mems = arr;
              loaded = true;
            }
          } catch (e) {
            adminErr = e;
            loaded = false;
          }
        }

        if (!loaded) {
          try {
            const fallback = await fetchCompanyMembers(companyId);
            mems = Array.isArray(fallback) ? fallback : [];
            loaded = true;
          } catch (e) {
            fallbackErr = e;
            loaded = false;
          }
        }

        if (!loaded) {
          const src = fallbackErr || adminErr;
          const rawCode = src && src.code ? String(src.code) : '';
          const normCode = rawCode.startsWith('functions/') ? rawCode.slice('functions/'.length) : (rawCode || '');
          const rawMsg = src && src.message ? String(src.message) : String(src || '');
          const lower = rawMsg.toLowerCase();
          let msg = 'Kunde inte hämta användare för valt företag. Försök igen.';
          if (normCode === 'unauthenticated' || lower.includes('unauthenticated')) {
            msg = 'Du verkar vara utloggad (unauthenticated). Logga ut/in och försök igen.';
          } else if (normCode === 'permission-denied' || lower.includes('permission')) {
            msg = 'Saknar behörighet att läsa användare för valt företag (permission-denied). Kontrollera att du är inloggad som superadmin och försök igen.';
          } else if (rawMsg && rawMsg.trim()) {
            msg = `Kunde inte hämta användare: ${rawMsg.replace(/^functions\.https\.HttpsError:\s*/i, '')}`;
          }
          if (!cancelled) setMembersLoadError(msg);
          mems = [];
        } else {
          if (!cancelled) setMembersLoadError('');
        }

        if (!cancelled) setMembers(mems);
        setExpandedMemberSections({ admins: true, users: true });
        setSelectedMember(null);
        setMemberSearch('');
      } catch (e) {
        console.warn(e);
        if (!cancelled) setMembersLoadError('Kunde inte hämta användare. Försök igen eller ladda om sidan.');
      } finally { setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [companyId, canSeeAllCompanies, membersReloadNonce]);

  const selectedMemberUidKey = useMemo(() => {
    try {
      return String(selectedMember?.uid || selectedMember?.id || '').trim();
    } catch (_e) {
      return '';
    }
  }, [selectedMember]);

  const lastSelectedMemberUidRef = useRef('');

  useEffect(() => {
    // Only re-initialize drafts when switching to a different member.
    // Otherwise (e.g. after saveSelectedMember patch), keep UI feedback like confirmations.
    const uidKey = String(selectedMemberUidKey || '').trim();
    if (!uidKey) {
      setProfileDraftFirstName('');
      setProfileDraftLastName('');
      setProfileDraftEmail('');
      setProfileDraftRole('user');
      setProfileDraftPassword('');
      setProfileShowPassword(false);
      setProfileDraftDisabled(false);
      setProfileDraftAvatarPreset('');
      setProfileDraftAvatarFile(null);
      setProfileDraftAvatarPreviewUrl('');
      setProfileOriginalSnapshot(null);
      setProfileAvatarPickerOpen(false);
      setProfileError('');
      lastSelectedMemberUidRef.current = '';
      return;
    }

    if (lastSelectedMemberUidRef.current === uidKey) {
      return;
    }
    lastSelectedMemberUidRef.current = uidKey;

    try {
      const dn = String(selectedMember?.displayName || '').trim();
      const parts = dn ? dn.split(' ').filter(Boolean) : [];
      const firstFromDn = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : (parts[0] || '');
      const lastFromDn = parts.length > 1 ? parts.slice(-1).join(' ') : '';
      setProfileDraftFirstName(String(selectedMember?.firstName || firstFromDn || '').trim());
      setProfileDraftLastName(String(selectedMember?.lastName || lastFromDn || '').trim());
    } catch (_e) {
      setProfileDraftFirstName('');
      setProfileDraftLastName('');
    }
    setProfileDraftEmail(String(selectedMember?.email || '').trim());
    const role = String(selectedMember?.role || '').trim();
    setProfileDraftRole(role === 'admin' || role === 'superadmin' ? role : 'user');
    setProfileDraftPassword('');
    setProfileShowPassword(false);
    try {
      const disabled = !!(selectedMember?.disabled === true || String(selectedMember?.status || '').toLowerCase() === 'disabled');
      setProfileDraftDisabled(disabled);
    } catch (_e) {
      setProfileDraftDisabled(false);
    }
    try {
      setProfileDraftAvatarPreset(String(selectedMember?.avatarPreset || '').trim().toLowerCase());
    } catch (_e) {
      setProfileDraftAvatarPreset('');
    }
    setProfileDraftAvatarFile(null);
    setProfileDraftAvatarPreviewUrl('');
    try {
      setProfileOriginalSnapshot({
        displayName: String(selectedMember?.displayName || '').trim(),
        firstName: String(selectedMember?.firstName || '').trim(),
        lastName: String(selectedMember?.lastName || '').trim(),
        email: String(selectedMember?.email || '').trim().toLowerCase(),
        role: String(selectedMember?.role || '').trim() || 'user',
        disabled: !!(selectedMember?.disabled === true || String(selectedMember?.status || '').toLowerCase() === 'disabled'),
        photoURL: String(selectedMember?.photoURL || selectedMember?.avatarUrl || selectedMember?.photo || '').trim(),
        avatarPreset: String(selectedMember?.avatarPreset || '').trim().toLowerCase(),
      });
    } catch (_e) {
      setProfileOriginalSnapshot(null);
    }
    setProfileError('');
  }, [selectedMemberUidKey]);

  useEffect(() => {
    return () => {
      try {
        if (profileSaveConfirmTimeoutRef.current) {
          clearTimeout(profileSaveConfirmTimeoutRef.current);
          profileSaveConfirmTimeoutRef.current = null;
        }
      } catch (_e) {}
    };
  }, []);

  useEffect(() => {
    return () => {
      try {
        if (upgradeSuccessTimeoutRef.current) {
          clearTimeout(upgradeSuccessTimeoutRef.current);
          upgradeSuccessTimeoutRef.current = null;
        }
      } catch (_e) {}
    };
  }, []);

  useEffect(() => {
    if (!Platform || Platform.OS !== 'web') return;
    if (!profileDraftAvatarFile) {
      setProfileDraftAvatarPreviewUrl('');
      return;
    }
    try {
      const url = URL.createObjectURL(profileDraftAvatarFile);
      setProfileDraftAvatarPreviewUrl(url);
      return () => {
        try { URL.revokeObjectURL(url); } catch (_e) {}
      };
    } catch (_e) {
      setProfileDraftAvatarPreviewUrl('');
      return undefined;
    }
  }, [profileDraftAvatarFile]);

  const profileDirty = useMemo(() => {
    try {
      if (!selectedMember || !profileOriginalSnapshot) return false;
      const first = String(profileDraftFirstName || '').trim();
      const last = String(profileDraftLastName || '').trim();
      const email = String(profileDraftEmail || '').trim().toLowerCase();
      const role = String(profileDraftRole || '').trim() || 'user';
      const disabled = !!profileDraftDisabled;
      const avatarPreset = String(profileDraftAvatarPreset || '').trim().toLowerCase();
      const pw = String(profileDraftPassword || '');

      const dnNext = `${first} ${last}`.trim();
      const origDn = String(profileOriginalSnapshot.displayName || '').trim();

      const photoStaged = !!profileDraftAvatarFile;
      const avatarPresetChanged = avatarPreset !== String(profileOriginalSnapshot.avatarPreset || '').trim().toLowerCase();
      const emailChanged = email && email !== String(profileOriginalSnapshot.email || '').trim().toLowerCase();
      const roleChanged = role !== String(profileOriginalSnapshot.role || '').trim();
      const disabledChanged = disabled !== !!profileOriginalSnapshot.disabled;
      const dnChanged = dnNext && dnNext !== origDn;

      return !!(dnChanged || emailChanged || roleChanged || disabledChanged || avatarPresetChanged || photoStaged || (pw && pw.length > 0));
    } catch (_e) {
      return false;
    }
  }, [
    selectedMember,
    profileOriginalSnapshot,
    profileDraftFirstName,
    profileDraftLastName,
    profileDraftEmail,
    profileDraftRole,
    profileDraftDisabled,
    profileDraftAvatarPreset,
    profileDraftAvatarFile,
    profileDraftPassword,
  ]);

  useEffect(() => {
    const sub = navigation?.addListener?.('beforeRemove', (e) => {
      if (!profileDirty) return;
      try { e.preventDefault(); } catch (_e) {}
      Alert.alert('Osparade ändringar', 'Du har osparade ändringar. Vill du spara innan du lämnar?', [
        {
          text: 'Avbryt',
          style: 'cancel',
        },
        {
          text: 'Lämna utan att spara',
          style: 'destructive',
          onPress: () => {
            try { navigation.dispatch(e.data.action); } catch (_e2) { try { navigation.goBack(); } catch (_e3) {} }
          },
        },
      ]);
    });
    return sub;
  }, [navigation, profileDirty]);

  useEffect(() => {
    if (!Platform || Platform.OS !== 'web') return;
    const handler = (e) => {
      if (!profileDirty) return undefined;
      try {
        e.preventDefault();
        e.returnValue = '';
      } catch (_e) {}
      return '';
    };
    try {
      window.addEventListener('beforeunload', handler);
      return () => window.removeEventListener('beforeunload', handler);
    } catch (_e) {
      return undefined;
    }
  }, [profileDirty]);

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

  const isMemberDisabled = (member) => {
    if (!member) return false;
    return !!(member.disabled === true || String(member.status || '').toLowerCase() === 'disabled');
  };

  const getMemberRoleLabel = (member) => {
    const role = String(member?.role || '').trim();
    if (role === 'superadmin') return { label: 'Superadmin', color: '#C62828', bg: '#FFEBEE' };
    if (role === 'admin') return { label: 'Administratör', color: '#1565C0', bg: '#E3F2FD' };
    return { label: 'Användare', color: '#455A64', bg: '#ECEFF1' };
  };

  const getMemberDisplayName = (member) => {
    return formatPersonName(member?.displayName || member?.email || '');
  };

  const getMemberListName = (member) => {
    try {
      const dn = String(member?.displayName || '').trim();
      const fn = String(member?.firstName || '').trim();
      const ln = String(member?.lastName || '').trim();
      const name = (dn || `${fn} ${ln}`.trim()).trim();
      if (name) return formatPersonName(name);
      const email = String(member?.email || '').trim();
      if (!email) return 'Okänd användare';
      return formatPersonName(email.split('@')[0] || email);
    } catch (_e) {
      return 'Okänd användare';
    }
  };

  const toggleMemberDisabled = async ({ member }) => {
    const uid = String(member?.uid || member?.id || '').trim();
    if (!uid) return;
    const currentUid = String(auth?.currentUser?.uid || '').trim();
    if (currentUid && uid === currentUid) {
      Alert.alert('Inte tillåtet', 'Du kan inte inaktivera ditt eget konto.');
      return;
    }

    const currentlyDisabled = isMemberDisabled(member);
    const targetDisabled = !currentlyDisabled;

    setUserStatusSaving((prev) => ({ ...(prev || {}), [uid]: true }));

    // Optimistic UI
    setMembers((prev) => {
      const list = Array.isArray(prev) ? prev : [];
      return list.map((m) => {
        const muid = String(m?.uid || m?.id || '').trim();
        if (muid !== uid) return m;
        return { ...m, disabled: targetDisabled };
      });
    });

    try {
      await updateUserRemote({ companyId, uid, disabled: targetDisabled });
    } catch (e) {
      // Revert
      setMembers((prev) => {
        const list = Array.isArray(prev) ? prev : [];
        return list.map((m) => {
          const muid = String(m?.uid || m?.id || '').trim();
          if (muid !== uid) return m;
          return { ...m, disabled: currentlyDisabled };
        });
      });
      Alert.alert('Fel', String(e?.message || e));
    } finally {
      setUserStatusSaving((prev) => ({ ...(prev || {}), [uid]: false }));
    }
  };

  // Web: use same layout as ManageCompany (sidebar + top bar + background)
  if (Platform.OS === 'web') {
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    const AVATAR_PRESETS = {
      blue_female: { icon: 'woman', bg: '#1976D2' },
      cyan_male: { icon: 'man', bg: '#00ACC1' },
      teal_person: { icon: 'person', bg: '#26A69A' },
      orange_person: { icon: 'person', bg: '#FB8C00' },
      red_person: { icon: 'person', bg: '#E53935' },
      green_person: { icon: 'person', bg: '#43A047' },
    };

    const isMsBygg = String(companyId || '').trim() === 'MS Byggsystem';

    const generatePassword = () => {
      const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
      let out = '';
      for (let i = 0; i < 12; i += 1) {
        out += chars.charAt(Math.floor(Math.random() * chars.length));
      }
      return out;
    };

    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const hasSelectedCompany = !!String(companyId || '').trim();

    // Superadmin / MS Byggsystem-admin (canSeeAllCompanies === true) ska kunna se alla
    // företag i listan. Vanliga företags-admins ser bara sitt eget företag.
    const sidebarRestrictId = canSeeAllCompanies ? null : (String(lockedCompanyId || '').trim() || companyId);

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={(payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();

              // When clicking a company row, we usually already have its profile in the payload.
              // Set it immediately so the middle panel updates even if profile fetch is denied.
              if (!payload?.member && payload?.profile) {
                setProfile(payload.profile);
              }

              // If company is locked (regular admin), ignore attempts to switch company.
              if (!canSeeAllCompanies && String(lockedCompanyId || '').trim()) {
                const locked = String(lockedCompanyId || '').trim();
                if (cid && cid !== locked) {
                  return;
                }
              }

              // If user clicked a member row in the sidebar, keep company selection and open details in middle panel.
              if (payload?.member) {
                setCompanyId(cid || '');
                setSelectedMember(payload.member);
                return;
              }
              // Company selection: clear selected member.
              setSelectedMember(null);
              setCompanyId(cid || '');
            } catch (_e) {}
          }}
          sidebarTitle="Användare"
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
                <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }} />
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 980, maxWidth: '100%' }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {Platform.OS !== 'web' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                      <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(_e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                        <Ionicons name="chevron-back" size={20} color="#222" />
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                          <Ionicons name="person" size={14} color="#fff" />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }} numberOfLines={1} ellipsizeMode="tail">Användare</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>
              <View style={{ width: '100%' }}>
                {!hasSelectedCompany ? (
                  <View style={{
                    width: '100%',
                    marginTop: 8,
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 10,
                    backgroundColor: '#FFF8E1',
                    borderWidth: 1,
                    borderColor: '#FFE082',
                  }}>
                    <Text style={{ fontSize: 13, color: '#5D4037' }}>
                      Välj ett företag i listan till vänster för att se och hantera dess användare.
                    </Text>
                  </View>
                ) : (
                  <View style={{ marginTop: 8 }}>
                    {(() => {
                      const list = Array.isArray(members) ? members : [];
                      const q = String(memberSearch || '').trim().toLowerCase();
                      const filtered = !q ? list : list.filter((m) => {
                        try {
                          const dn = String(m?.displayName || '').toLowerCase();
                          const fn = String(m?.firstName || '').toLowerCase();
                          const ln = String(m?.lastName || '').toLowerCase();
                          const email = String(m?.email || '').toLowerCase();
                          const name = String(`${fn} ${ln}`.trim() || dn || '').toLowerCase();
                          return dn.includes(q) || name.includes(q) || fn.includes(q) || ln.includes(q) || email.includes(q);
                        } catch (_e) {
                          return false;
                        }
                      });
                      const normalized = list.slice();
                      const isAdminRole = (member) => {
                        const role = String(member?.role || '').trim();
                        return role === 'admin' || role === 'superadmin';
                      };
                      const normalizedFiltered = (Array.isArray(filtered) ? filtered : []).slice();
                      const admins = normalizedFiltered.filter(isAdminRole);
                      const users = normalizedFiltered.filter((m) => !isAdminRole(m));
                      const byName = (a, b) => {
                        const an = String(a?.displayName || a?.email || '').toLowerCase();
                        const bn = String(b?.displayName || b?.email || '').toLowerCase();
                        return an.localeCompare(bn, 'sv');
                      };
                      admins.sort(byName);
                      users.sort(byName);

                      const getInitials = (member) => {
                        try {
                          const name = String(member?.displayName || '').trim() || String(member?.email || '').trim();
                          if (!name) return '?';
                          const parts = name.replace(/\s+/g, ' ').split(' ').filter(Boolean);
                          if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
                          return (parts[0].slice(0, 1) + parts[parts.length - 1].slice(0, 1)).toUpperCase();
                        } catch (_e) {
                          return '?';
                        }
                      };

                      const selectedUid = String(selectedMember?.uid || selectedMember?.id || '').trim();
                      const liveSelected = selectedUid ? list.find((m) => String(m?.uid || m?.id || '').trim() === selectedUid) : null;
                      const activeSelected = liveSelected || selectedMember;

                      const confirmDiscardOrCancelIfDirty = (onContinue) => {
                        if (!profileDirty) {
                          if (typeof onContinue === 'function') onContinue();
                          return;
                        }
                        Alert.alert(
                          'Osparade ändringar',
                          'Du har osparade ändringar. Vill du lämna utan att spara?',
                          [
                            { text: 'Avbryt', style: 'cancel' },
                            {
                              text: 'Lämna utan att spara',
                              style: 'destructive',
                              onPress: () => {
                                try {
                                  setProfileDraftPassword('');
                                  setProfileDraftAvatarFile(null);
                                  setProfileDraftAvatarPreviewUrl('');
                                } catch (_e) {}
                                if (typeof onContinue === 'function') onContinue();
                              },
                            },
                          ],
                        );
                      };

                      const requestSelectMember = (m) => {
                        if (!m) return;
                        const go = () => {
                          pendingSelectMemberRef.current = null;
                          setSelectedMember(m);
                        };
                        if (profileDirty) {
                          pendingSelectMemberRef.current = m;
                          confirmDiscardOrCancelIfDirty(go);
                        } else {
                          go();
                        }
                      };

                      const renderMemberRow = (m) => {
                        const key = String(m?.uid || m?.id || m?.email || '');
                        const uid = String(m?.uid || m?.id || '').trim();
                        const disabled = isMemberDisabled(m);
                        const isActive = !disabled;
                        const saving = !!(uid && userStatusSaving && userStatusSaving[uid]);
                        const isHovered = hoveredMemberKey === key;
                        const isSelected = !!(selectedUid && uid && selectedUid === uid);
                        const avatarUri = String(m?.photoURL || m?.avatarUrl || m?.photo || '').trim();
                        const avatarPreset = String(m?.avatarPreset || '').trim().toLowerCase();
                        const initials = getInitials(m);
                        const rowOpacity = isActive ? 1 : 0.45;

                        return (
                          <View
                            key={key}
                            onMouseEnter={Platform.OS === 'web' ? () => setHoveredMemberKey(key) : undefined}
                            onMouseLeave={Platform.OS === 'web' ? () => setHoveredMemberKey(prev => (prev === key ? null : prev)) : undefined}
                            style={{
                              paddingVertical: 6,
                              paddingHorizontal: 10,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              borderRadius: 10,
                              marginBottom: 4,
                              backgroundColor: isSelected ? '#E3F2FD' : (isHovered ? '#F6F7F9' : 'transparent'),
                              opacity: saving ? 0.7 : 1,
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => { try { requestSelectMember(m); } catch (_e) {} }}
                              style={{ flex: 1, marginRight: 10, flexDirection: 'row', alignItems: 'center' }}
                            >
                              <View
                                style={{
                                  width: 36,
                                  height: 36,
                                  borderRadius: 999,
                                  overflow: 'hidden',
                                  marginRight: 10,
                                  backgroundColor: (AVATAR_PRESETS[avatarPreset] && AVATAR_PRESETS[avatarPreset].bg) ? AVATAR_PRESETS[avatarPreset].bg : '#e9eef5',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  opacity: rowOpacity,
                                }}
                              >
                                {avatarUri ? (
                                  <ImageBackground
                                    source={{ uri: avatarUri }}
                                    style={{ width: '100%', height: '100%' }}
                                    imageStyle={{ borderRadius: 999 }}
                                  />
                                ) : (AVATAR_PRESETS[avatarPreset] && AVATAR_PRESETS[avatarPreset].icon) ? (
                                  <Ionicons name={AVATAR_PRESETS[avatarPreset].icon} size={18} color="#fff" />
                                ) : (
                                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#335' }}>{initials}</Text>
                                )}
                              </View>

                              <View style={{ flex: 1, minWidth: 0 }}>
                                <Text
                                  numberOfLines={1}
                                  style={{
                                    fontSize: 14,
                                    fontWeight: '600',
                                    color: isActive ? '#1F2937' : '#6B7280',
                                    opacity: rowOpacity,
                                  }}
                                >
                                  {getMemberListName(m)}
                                </Text>
                              </View>
                            </TouchableOpacity>

                            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                              <Text style={{ fontSize: 12, fontWeight: '600', color: disabled ? '#777' : '#2E7D32' }}>
                                {disabled ? 'Inaktiv' : 'Aktiv'}
                              </Text>
                              <TouchableOpacity
                                accessibilityRole="checkbox"
                                accessibilityState={{ checked: isActive, disabled: saving }}
                                disabled={saving}
                                onPress={() => {
                                  try {
                                    // Make toggle part of staged profile flow: select + stage, don't save immediately.
                                    if (!isSelected) {
                                      requestSelectMember(m);
                                    }
                                    // Only stage for the selected row; others require selecting first.
                                    if (isSelected) {
                                      setProfileDraftDisabled((prev) => !prev);
                                    }
                                  } catch (_e) {}
                                }}
                                style={{
                                  width: 22,
                                  height: 22,
                                  borderRadius: 6,
                                  borderWidth: 2,
                                  borderColor: isActive ? '#1976D2' : '#B0B8C4',
                                  backgroundColor: isActive ? '#1976D2' : 'transparent',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                }}
                              >
                                {isActive ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      };

                      const RoleSectionHeader = ({ kind, title, iconName, iconColor, count, open }) => (
                        <View style={{ marginBottom: 10 }}>
                          <TouchableOpacity
                            onPress={() => setExpandedMemberSections(prev => ({ ...(prev || {}), [kind]: !prev?.[kind] }))}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              borderRadius: 10,
                              backgroundColor: '#fff',
                              borderWidth: 1,
                              borderColor: '#E6E8EC',
                            }}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Ionicons name={iconName} size={14} color={iconColor} />
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#222' }}>{title} ({count})</Text>
                            </View>
                            <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={16} color="#666" />
                          </TouchableOpacity>
                        </View>
                      );

                      const selectedUidResolved = String(activeSelected?.uid || activeSelected?.id || '').trim();
                      const selectedDisabled = activeSelected ? !!profileDraftDisabled : false;
                      const selectedRoleMeta = activeSelected ? getMemberRoleLabel(activeSelected) : null;
                      const selectedAvatarUri = String(activeSelected?.photoURL || activeSelected?.avatarUrl || activeSelected?.photo || '').trim();
                      const selectedAvatarPreset = String(profileDraftAvatarPreset || '').trim().toLowerCase();
                      const selectedInitials = activeSelected ? getInitials(activeSelected) : '?';

                      const selectedAvatarPreview = profileDraftAvatarPreviewUrl;
                      const effectiveAvatarUri = selectedAvatarPreview || selectedAvatarUri;

                      const memberListMaxHeight = Platform.OS === 'web'
                        ? '50vh'
                        : Math.max(260, Math.floor((Number(windowHeight) || 600) * 0.55));

                      const saveSelectedProfilePatch = async (patch) => {
                        if (!selectedUidResolved) return;
                        setProfileSaving(true);
                        setProfileError('');
                        try {
                          await updateUserRemote({ companyId, uid: selectedUidResolved, ...patch });
                          setMembers((prev) => {
                            const arr = Array.isArray(prev) ? prev : [];
                            return arr.map((mm) => {
                              const mmuid = String(mm?.uid || mm?.id || '').trim();
                              if (!mmuid || mmuid !== selectedUidResolved) return mm;
                              return { ...mm, ...patch };
                            });
                          });
                          setSelectedMember((prev) => ({ ...(prev || {}), ...patch }));
                        } catch (e) {
                          setProfileError(String(e?.message || e));
                        } finally {
                          setProfileSaving(false);
                        }
                      };

                      const handleUploadAvatar = async (file) => {
                        if (!selectedUidResolved || !file) return;
                        setProfileError('');
                        try {
                          setProfileDraftAvatarFile(file);
                          setProfileDraftAvatarPreset('');
                        } catch (_e) {}
                      };

                      const handleSelectAvatarPreset = async (presetKey) => {
                        if (!presetKey) return;
                        try {
                          setProfileDraftAvatarPreset(String(presetKey).trim().toLowerCase());
                          setProfileDraftAvatarFile(null);
                          setProfileDraftAvatarPreviewUrl('');
                        } finally {
                          setProfileAvatarPickerOpen(false);
                        }
                      };

                      const handleCancelEdits = () => {
                        if (!profileOriginalSnapshot) return;
                        try {
                          const dn = String(profileOriginalSnapshot.displayName || '').trim();
                          const parts = dn ? dn.split(' ').filter(Boolean) : [];
                          const firstFromDn = parts.length > 1 ? parts.slice(0, parts.length - 1).join(' ') : (parts[0] || '');
                          const lastFromDn = parts.length > 1 ? parts.slice(-1).join(' ') : '';
                          const first = String(profileOriginalSnapshot.firstName || firstFromDn || '').trim();
                          const last = String(profileOriginalSnapshot.lastName || lastFromDn || '').trim();
                          setProfileDraftFirstName(first);
                          setProfileDraftLastName(last);
                          setProfileDraftEmail(String(profileOriginalSnapshot.email || '').trim());
                          setProfileDraftRole(String(profileOriginalSnapshot.role || 'user').trim() || 'user');
                          setProfileDraftDisabled(!!profileOriginalSnapshot.disabled);
                          setProfileDraftPassword('');
                          setProfileShowPassword(false);
                          setProfileDraftAvatarPreset(String(profileOriginalSnapshot.avatarPreset || '').trim().toLowerCase());
                          setProfileDraftAvatarFile(null);
                          setProfileDraftAvatarPreviewUrl('');
                          setProfileError('');
                        } catch (_e) {}
                      };

                      const handleSaveEdits = async () => {
                        if (!selectedUidResolved) return;
                        setProfileSaving(true);
                        setProfileError('');
                        try { setProfileSaveConfirmOpen(false); } catch (_e) {}
                        try { setProfileSaveConfirmText(''); } catch (_e) {}
                        try {
                          if (profileSaveConfirmTimeoutRef.current) {
                            clearTimeout(profileSaveConfirmTimeoutRef.current);
                            profileSaveConfirmTimeoutRef.current = null;
                          }
                        } catch (_e) {}
                        try {
                          const first = String(profileDraftFirstName || '').trim();
                          const last = String(profileDraftLastName || '').trim();
                          const displayName = `${first} ${last}`.trim();
                          const email = String(profileDraftEmail || '').trim().toLowerCase();
                          const role = String(profileDraftRole || '').trim() || 'user';
                          const disabled = !!profileDraftDisabled;
                          const password = String(profileDraftPassword || '');
                          const avatarPreset = String(profileDraftAvatarPreset || '').trim().toLowerCase();

                          const emailOk = !email || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
                          if (email && !emailOk) {
                            setProfileError('Ogiltig e-postadress.');
                            return;
                          }

                          let photoURL = null;
                          if (profileDraftAvatarFile) {
                            setAvatarUploading(true);
                            try {
                              photoURL = await uploadUserAvatar({ companyId, uid: selectedUidResolved, file: profileDraftAvatarFile });
                            } finally {
                              setAvatarUploading(false);
                            }
                          }

                          const patch = {};
                          if (displayName) patch.displayName = displayName;
                          if (email) patch.email = email;
                          if (role) patch.role = role;
                          patch.disabled = disabled;
                          if (password) patch.password = password;

                          if (profileDraftAvatarFile) {
                            patch.photoURL = photoURL || '';
                            patch.avatarPreset = '';
                          } else if (avatarPreset) {
                            patch.avatarPreset = avatarPreset;
                            patch.photoURL = '';
                          }

                          await updateUserRemote({ companyId, uid: selectedUidResolved, ...patch });

                          // Update local members list
                          setMembers((prev) => {
                            const arr = Array.isArray(prev) ? prev : [];
                            return arr.map((mm) => {
                              const mmuid = String(mm?.uid || mm?.id || '').trim();
                              if (!mmuid || mmuid !== selectedUidResolved) return mm;
                              const merged = { ...mm, ...patch };
                              // Normalize saved avatar fields
                              if (Object.prototype.hasOwnProperty.call(patch, 'photoURL')) merged.photoURL = patch.photoURL || null;
                              if (Object.prototype.hasOwnProperty.call(patch, 'avatarPreset')) merged.avatarPreset = patch.avatarPreset || null;
                              return merged;
                            });
                          });
                          setSelectedMember((prev) => ({ ...(prev || {}), ...patch }));

                          // Reset original snapshot so dirty=false
                          try {
                            setProfileOriginalSnapshot((prev) => {
                              const base = prev || {};
                              return {
                                ...base,
                                displayName: displayName || base.displayName,
                                email: email || base.email,
                                role: role || base.role,
                                disabled,
                                photoURL: profileDraftAvatarFile ? (photoURL || '') : base.photoURL,
                                avatarPreset: profileDraftAvatarFile ? '' : (avatarPreset || base.avatarPreset),
                              };
                            });
                          } catch (_e) {}

                          setProfileDraftPassword('');
                          setProfileShowPassword(false);
                          setProfileDraftAvatarFile(null);
                          setProfileDraftAvatarPreviewUrl('');

                          try {
                            Alert.alert('Sparat', 'Ändringar är sparade.');
                          } catch (_e) {}

                          // Web-confirmation popup (design-consistent)
                          try {
                            setProfileSaveConfirmText('Ändringar är sparade.');
                            setProfileSaveConfirmOpen(true);
                            profileSaveConfirmTimeoutRef.current = setTimeout(() => {
                              try { setProfileSaveConfirmOpen(false); } catch (_e2) {}
                            }, 2500);
                          } catch (_e) {}
                        } catch (e) {
                          setProfileError(String(e?.message || e));
                        } finally {
                          setProfileSaving(false);
                        }
                      };

                      const handleDeleteSelectedUser = () => {
                        try {
                          const emailLower = String(activeSelected?.email || '').trim().toLowerCase();
                          if (emailLower === 'marcus@msbyggsystem.se') {
                            Alert.alert('Skyddad användare', 'Kontot marcus@msbyggsystem.se kan aldrig raderas.');
                            return;
                          }
                        } catch (_e) {}
                        Alert.alert(
                          'Radera användare',
                          'Vill du verkligen radera användaren? Detta går inte att ångra.',
                          [
                            { text: 'Avbryt', style: 'cancel' },
                            {
                              text: 'Radera',
                              style: 'destructive',
                              onPress: async () => {
                                if (!selectedUidResolved) return;
                                try {
                                  await deleteUserRemote({ companyId, uid: selectedUidResolved });
                                  const mems = await fetchCompanyMembers(companyId).catch(() => []);
                                  setMembers(Array.isArray(mems) ? mems : []);
                                  setSelectedMember(null);
                                } catch (e) {
                                  setProfileError(String(e?.message || e));
                                }
                              },
                            },
                          ],
                        );
                      };

                      return (
                        <View
                          style={{
                            borderWidth: 1,
                            borderColor: '#E6E8EC',
                            borderRadius: 12,
                            overflow: 'hidden',
                            flexDirection: 'row',
                            minHeight: 520,
                          }}
                        >
                          <View style={{ width: 360, backgroundColor: '#F9FAFB', borderRightWidth: 1, borderRightColor: '#E6E8EC' }}>
                            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff' }}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                                  {`Användare i ${companyId} (${members.length}${userLimitNumber !== null ? ` / ${userLimitNumber}` : ''})`}
                                </Text>
                                <Ionicons name="chevron-down" size={16} color="#666" />
                              </View>
                              {seatsLeft !== null ? (
                                <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                                  <View style={{ alignSelf: 'flex-start', paddingVertical: 4, paddingHorizontal: 10, borderRadius: 999, backgroundColor: seatsLeft > 0 ? '#E8F5E9' : '#FFEBEE' }}>
                                    <Text style={{ fontSize: 12, fontWeight: '600', color: seatsLeft > 0 ? '#2E7D32' : '#C62828' }}>{`Plats kvar: ${seatsLeft}`}</Text>
                                  </View>
                                  <TouchableOpacity
                                    onPress={() => {
                                      setUpgradeError('');
                                      setUpgradeModalOpen(true);
                                    }}
                                    style={{
                                      paddingVertical: 6,
                                      paddingHorizontal: 10,
                                      borderRadius: 10,
                                      borderWidth: 1,
                                      borderColor: '#D7DBE2',
                                      backgroundColor: '#fff',
                                      flexDirection: 'row',
                                      alignItems: 'center',
                                      gap: 8,
                                    }}
                                  >
                                    <Ionicons name="sparkles" size={14} color="#1976D2" />
                                    <Text style={{ fontSize: 12, fontWeight: '500', color: '#1976D2' }}>Uppgradera abonnemang</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : null}
                            </View>

                            <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff' }}>
                              <TextInput
                                value={memberSearch}
                                onChangeText={setMemberSearch}
                                placeholder="Sök användare (namn eller e-post)"
                                style={{
                                  borderWidth: 1,
                                  borderColor: '#E6E8EC',
                                  backgroundColor: '#fff',
                                  paddingVertical: 10,
                                  paddingHorizontal: 12,
                                  borderRadius: 10,
                                  fontSize: 14,
                                }}
                              />
                            </View>

                            {membersLoadError ? (
                              <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff' }}>
                                <View style={{ borderWidth: 1, borderColor: '#FFCDD2', backgroundColor: '#FFEBEE', borderRadius: 10, padding: 10 }}>
                                  <Text style={{ color: '#C62828', fontSize: 13, fontWeight: '600' }}>Fel vid hämtning</Text>
                                  <Text style={{ color: '#8E1B1B', fontSize: 12, marginTop: 4 }}>{membersLoadError}</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10, marginTop: 10 }}>
                                    <TouchableOpacity
                                      onPress={() => setMembersReloadNonce(n => n + 1)}
                                      style={{ paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E9A7AE', backgroundColor: '#fff' }}
                                    >
                                      <Text style={{ color: '#C62828', fontSize: 12, fontWeight: '700' }}>{loading ? 'Hämtar…' : 'Försök igen'}</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              </View>
                            ) : null}

                            <SectionList
                              style={{ maxHeight: memberListMaxHeight }}
                              contentContainerStyle={{ padding: 12, paddingBottom: 12 }}
                              sections={[
                                {
                                  kind: 'admins',
                                  title: 'Administratörer',
                                  iconName: 'shield-checkmark',
                                  iconColor: '#1976D2',
                                  open: !!expandedMemberSections?.admins,
                                  count: admins.length,
                                  data: (!!expandedMemberSections?.admins ? admins : []),
                                },
                                {
                                  kind: 'users',
                                  title: 'Användare',
                                  iconName: 'person',
                                  iconColor: '#555',
                                  open: !!expandedMemberSections?.users,
                                  count: users.length,
                                  data: (!!expandedMemberSections?.users ? users : []),
                                },
                              ]}
                              keyExtractor={(item, index) => String(item?.uid || item?.id || item?.email || index)}
                              renderItem={({ item }) => renderMemberRow(item)}
                              renderSectionHeader={({ section }) => (
                                <RoleSectionHeader
                                  kind={section.kind}
                                  title={section.title}
                                  iconName={section.iconName}
                                  iconColor={section.iconColor}
                                  count={section.count}
                                  open={section.open}
                                />
                              )}
                              renderSectionFooter={({ section }) => (
                                section.open && section.count === 0 ? (
                                  <Text style={{ fontSize: 13, color: '#777', paddingHorizontal: 10, paddingVertical: 8, marginTop: -6, marginBottom: 10 }}>
                                    Inga användare.
                                  </Text>
                                ) : null
                              )}
                              stickySectionHeadersEnabled={Platform.OS === 'web'}
                              initialNumToRender={20}
                              maxToRenderPerBatch={30}
                              windowSize={11}
                            />

                            <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#E6E8EC', backgroundColor: '#fff' }}>
                              <TouchableOpacity
                                onPress={() => {
                                  setAddUserError('');
                                  setAddUserOpen(true);
                                }}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  gap: 8,
                                  paddingVertical: 10,
                                  borderRadius: 10,
                                  borderWidth: 1,
                                  borderColor: '#D7DBE2',
                                  backgroundColor: '#fff',
                                }}
                              >
                                <Ionicons name="add" size={16} color="#1976D2" />
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#1976D2' }}>Lägg till användare</Text>
                              </TouchableOpacity>
                            </View>
                          </View>

                          <View style={{ flex: 1, padding: 16, backgroundColor: '#fff' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                              <Ionicons name="pencil" size={14} color="#222" />
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#111' }}>Användarsprofil</Text>
                            </View>

                            {!activeSelected ? (
                              <View style={{ paddingVertical: 12 }}>
                                <Text style={{ color: '#555', fontSize: 13 }}>Välj en användare i listan till vänster.</Text>
                              </View>
                            ) : (
                              <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, padding: 14, backgroundColor: '#fff' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
                                    <View style={{ width: 62, height: 62, borderRadius: 999, overflow: 'hidden', backgroundColor: (AVATAR_PRESETS[selectedAvatarPreset] && AVATAR_PRESETS[selectedAvatarPreset].bg) ? AVATAR_PRESETS[selectedAvatarPreset].bg : '#e9eef5', alignItems: 'center', justifyContent: 'center' }}>
                                      {effectiveAvatarUri ? (
                                        <ImageBackground
                                          source={{ uri: effectiveAvatarUri }}
                                          style={{ width: '100%', height: '100%' }}
                                          imageStyle={{ borderRadius: 999 }}
                                        />
                                      ) : (AVATAR_PRESETS[selectedAvatarPreset] && AVATAR_PRESETS[selectedAvatarPreset].icon) ? (
                                        <Ionicons name={AVATAR_PRESETS[selectedAvatarPreset].icon} size={28} color="#fff" />
                                      ) : (
                                        <Text style={{ fontSize: 22, fontWeight: '900', color: '#334' }}>{selectedInitials.slice(0, 1)}</Text>
                                      )}
                                    </View>

                                    <View style={{ flex: 1, minWidth: 0 }}>
                                      <Text style={{ fontSize: 18, fontWeight: '600', color: '#111' }} numberOfLines={1}>{getMemberDisplayName(activeSelected)}</Text>
                                      {selectedRoleMeta ? (
                                        <View style={{ marginTop: 6, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 8, borderRadius: 999, backgroundColor: selectedRoleMeta.bg }}>
                                          <Text style={{ fontSize: 11, fontWeight: '600', color: selectedRoleMeta.color }}>{selectedRoleMeta.label}</Text>
                                        </View>
                                      ) : null}
                                    </View>
                                  </View>

                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                                    <TouchableOpacity
                                      onPress={handleDeleteSelectedUser}
                                      disabled={profileSaving}
                                      style={{
                                        backgroundColor: '#fff',
                                        paddingVertical: 8,
                                        paddingHorizontal: 10,
                                        borderRadius: 10,
                                        borderWidth: 1,
                                        borderColor: '#FFCDD2',
                                        opacity: profileSaving ? 0.7 : 1,
                                      }}
                                      accessibilityLabel="Radera användare"
                                    >
                                      <Ionicons name="trash" size={16} color="#C62828" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => {
                                        setProfileAvatarPickerOpen(true);
                                      }}
                                      disabled={profileSaving}
                                      style={{
                                        backgroundColor: '#1976D2',
                                        paddingVertical: 8,
                                        paddingHorizontal: 12,
                                        borderRadius: 10,
                                        opacity: profileSaving ? 0.7 : 1,
                                      }}
                                    >
                                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }}>Byt bild</Text>
                                    </TouchableOpacity>
                                  </View>
                                </View>

                                {profileError ? (
                                  <View style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2' }}>
                                    <Text style={{ color: '#C62828', fontSize: 12, fontWeight: '800' }}>{profileError}</Text>
                                  </View>
                                ) : null}

                                {profileDirty ? (
                                  <View style={{ marginTop: 10, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082' }}>
                                    <Text style={{ color: '#7A5A00', fontSize: 12, fontWeight: '800' }}>Osparade ändringar</Text>
                                  </View>
                                ) : null}

                                <View style={{ marginTop: 14, flexDirection: 'row', gap: 12 }}>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Förnamn</Text>
                                    <TextInput
                                      value={profileDraftFirstName}
                                      onChangeText={setProfileDraftFirstName}
                                      style={{ borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14 }}
                                      editable={!profileSaving}
                                    />
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Efternamn</Text>
                                    <TextInput
                                      value={profileDraftLastName}
                                      onChangeText={setProfileDraftLastName}
                                      style={{ borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14 }}
                                      editable={!profileSaving}
                                    />
                                  </View>
                                </View>

                                <View style={{ marginTop: 12 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>E-post</Text>
                                  <TextInput
                                    value={profileDraftEmail}
                                    onChangeText={setProfileDraftEmail}
                                    style={{ borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14 }}
                                    editable={!profileSaving}
                                    autoCapitalize="none"
                                  />
                                </View>

                                <View style={{ marginTop: 12 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Lösenord</Text>
                                  <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                                    <TextInput
                                      value={profileDraftPassword}
                                      onChangeText={setProfileDraftPassword}
                                      placeholder="Fyll i för att byta lösenord"
                                      secureTextEntry={!profileShowPassword}
                                      style={{ flex: 1, borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14 }}
                                      editable={!profileSaving}
                                    />
                                    <TouchableOpacity
                                      onPress={() => setProfileShowPassword(s => !s)}
                                      disabled={profileSaving}
                                      style={{ paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#E6E8EC', backgroundColor: '#fff', opacity: profileSaving ? 0.7 : 1 }}
                                    >
                                      <Text style={{ fontSize: 13, fontWeight: '700', color: '#222' }}>{profileShowPassword ? 'Dölj' : 'Visa'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      onPress={() => { setProfileDraftPassword(generatePassword()); setProfileShowPassword(true); }}
                                      disabled={profileSaving}
                                      style={{ paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, borderWidth: 1, borderColor: '#1976D2', backgroundColor: '#E3F2FD', opacity: profileSaving ? 0.7 : 1 }}
                                    >
                                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#1976D2' }}>Generera</Text>
                                    </TouchableOpacity>
                                  </View>
                                  <View style={{ marginTop: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end' }}>
                                    <Text style={{ fontSize: 12, color: '#6B7280' }}>Sparas när du trycker Spara.</Text>
                                  </View>
                                </View>

                                <View style={{ marginTop: 12 }}>
                                  <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', marginBottom: 6 }}>Roll</Text>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                                    <select
                                      value={profileDraftRole}
                                      onChange={(e) => {
                                        const next = String(e?.target?.value || '').trim();
                                        setProfileDraftRole(next);
                                      }}
                                      disabled={profileSaving}
                                      style={{
                                        flex: 1,
                                        padding: 10,
                                        borderRadius: 10,
                                        border: '1px solid #E6E8EC',
                                        fontSize: 14,
                                        background: '#fff',
                                        color: '#111',
                                      }}
                                    >
                                      {isMsBygg && String(activeSelected?.role || '').trim() === 'superadmin' ? <option value="superadmin">Superadmin</option> : null}
                                      <option value="admin">Administratör</option>
                                      <option value="user">Användare</option>
                                    </select>

                                    <View style={{ alignItems: 'flex-end', gap: 6 }}>
                                      <Text style={{ fontSize: 12, fontWeight: '600', color: selectedDisabled ? '#777' : '#2E7D32' }}>{selectedDisabled ? 'Inaktiv' : 'Aktiv'}</Text>
                                      <TouchableOpacity
                                        accessibilityRole="checkbox"
                                        accessibilityState={{ checked: !selectedDisabled, disabled: profileSaving }}
                                        disabled={profileSaving}
                                        onPress={() => setProfileDraftDisabled((prev) => !prev)}
                                        style={{
                                          width: 22,
                                          height: 22,
                                          borderRadius: 6,
                                          borderWidth: 2,
                                          borderColor: (!selectedDisabled) ? '#1976D2' : '#B0B8C4',
                                          backgroundColor: (!selectedDisabled) ? '#1976D2' : 'transparent',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                        }}
                                      >
                                        {(!selectedDisabled) ? <Ionicons name="checkmark" size={16} color="#fff" /> : null}
                                      </TouchableOpacity>
                                    </View>
                                  </View>
                                  <Text style={{ marginTop: 8, color: '#6B7280', fontSize: 12 }}>
                                    Inaktiv användare kan inte logga in men behåller historik.
                                  </Text>
                                </View>

                                <View style={{ marginTop: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10 }}>
                                  <TouchableOpacity
                                    onPress={handleCancelEdits}
                                    disabled={profileSaving || !profileDirty}
                                    style={{
                                      paddingVertical: 10,
                                      paddingHorizontal: 12,
                                      borderRadius: 10,
                                      borderWidth: 1,
                                      borderColor: '#D7DBE2',
                                      backgroundColor: '#fff',
                                      opacity: (profileSaving || !profileDirty) ? 0.6 : 1,
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#222' }}>Avbryt</Text>
                                  </TouchableOpacity>
                                  <TouchableOpacity
                                    onPress={handleSaveEdits}
                                    disabled={profileSaving || !profileDirty}
                                    style={{
                                      paddingVertical: 10,
                                      paddingHorizontal: 14,
                                      borderRadius: 10,
                                      backgroundColor: '#1976D2',
                                      opacity: (profileSaving || !profileDirty) ? 0.6 : 1,
                                    }}
                                  >
                                    <Text style={{ fontSize: 13, fontWeight: '900', color: '#fff' }}>{profileSaving ? 'Sparar…' : 'Spara'}</Text>
                                  </TouchableOpacity>
                                </View>

                              </View>
                            )}
                          </View>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </View>
            </View>
          </View>

          {profileAvatarPickerOpen ? (
            <div
              onClick={() => setProfileAvatarPickerOpen(false)}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1300,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 420,
                  maxWidth: 'calc(100% - 40px)',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#1976D2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={14} color="#fff" />
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: '#111' }}>Välj profilbild</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setProfileAvatarPickerOpen(false)}
                    style={{ border: '1px solid #E6E8EC', background: '#fff', borderRadius: 10, padding: '6px 10px', cursor: 'pointer' }}
                    aria-label="Stäng"
                  >
                    Stäng
                  </button>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 10, alignItems: 'center' }}>
                  {Object.keys(AVATAR_PRESETS).map((k) => {
                    const p = AVATAR_PRESETS[k];
                    const selected = String(profileDraftAvatarPreset || '').trim().toLowerCase() === k && !profileDraftAvatarFile;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => handleSelectAvatarPreset(k)}
                        title={k}
                        aria-label={k}
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: 999,
                          border: selected ? '2px solid #1976D2' : '1px solid #E0E0E0',
                          background: p.bg,
                          cursor: 'pointer',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: selected ? '0 0 0 3px rgba(25,118,210,0.15)' : 'none',
                        }}
                      >
                        <Ionicons name={p.icon} size={20} color="#fff" />
                      </button>
                    );
                  })}

                  <button
                    type="button"
                    onClick={() => { try { profileAvatarFileInputRef.current?.click?.(); } catch (_e) {} }}
                    title="Ladda upp bild"
                    aria-label="Ladda upp bild"
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 999,
                      border: '1px solid #E0E0E0',
                      background: '#fff',
                      cursor: 'pointer',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Ionicons name="image" size={18} color="#555" />
                  </button>
                </div>

                <div style={{ marginTop: 10, fontSize: 12, color: '#6B7280', lineHeight: '16px' }}>
                  Välj en ikon eller ladda upp egen bild (sparas i molnet). Du kan alltid byta bild igen.
                </div>

                <input
                  ref={profileAvatarFileInputRef}
                  type="file"
                  accept="image/*"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    try {
                      const f = e?.target?.files && e.target.files[0] ? e.target.files[0] : null;
                      if (f) handleUploadAvatar(f);
                      e.target.value = '';
                      setProfileAvatarPickerOpen(false);
                    } catch (_e) {}
                  }}
                />
              </div>
            </div>
          ) : null}

          {profileSaveConfirmOpen ? (
            <div
              onClick={() => setProfileSaveConfirmOpen(false)}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1400,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 320,
                  maxWidth: 'calc(100% - 40px)',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                  border: '1px solid #E6E8EC',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>Sparat</div>
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: '18px' }}>
                  {profileSaveConfirmText || 'Ändringar är sparade.'}
                </div>
              </div>
            </div>
          ) : null}

          {upgradeModalOpen ? (
            <div
              onClick={() => {
                if (upgradeSending) return;
                setUpgradeModalOpen(false);
              }}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.35)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1500,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 360,
                  maxWidth: 'calc(100% - 40px)',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                  border: '1px solid #E6E8EC',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#1976D2', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="rocket" size={16} color="#fff" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 500, color: '#111' }}>Uppgradera abonnemang</div>
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: '18px' }}>
                  Vill du utöka ditt abonnemang? Klickar du Ja så tar vi kontakt med dig.
                </div>
                {upgradeError ? (
                  <div style={{ marginTop: 10, fontSize: 12, color: '#B71C1C', fontWeight: 500 }}>
                    {upgradeError}
                  </div>
                ) : null}
                <div style={{ marginTop: 14, display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button
                    type="button"
                    disabled={upgradeSending}
                    onClick={() => setUpgradeModalOpen(false)}
                    style={{
                      border: '1px solid #D7DBE2',
                      background: '#fff',
                      borderRadius: 10,
                      padding: '8px 12px',
                      cursor: upgradeSending ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      color: '#111',
                      opacity: upgradeSending ? 0.6 : 1,
                    }}
                  >
                    Avbryt
                  </button>
                  <button
                    type="button"
                    disabled={upgradeSending}
                    onClick={async () => {
                      if (!companyId) return;
                      setUpgradeError('');
                      setUpgradeSending(true);
                      try {
                        await requestSubscriptionUpgradeRemote({ companyId });
                        setUpgradeModalOpen(false);
                        setUpgradeSuccessText('Tack! Vi kontaktar dig.');
                        setUpgradeSuccessOpen(true);
                        try {
                          if (upgradeSuccessTimeoutRef.current) {
                            clearTimeout(upgradeSuccessTimeoutRef.current);
                            upgradeSuccessTimeoutRef.current = null;
                          }
                          upgradeSuccessTimeoutRef.current = setTimeout(() => {
                            try { setUpgradeSuccessOpen(false); } catch (_e2) {}
                          }, 2500);
                        } catch (_e) {}
                      } catch (e) {
                        setUpgradeError(String(e?.message || e));
                      } finally {
                        setUpgradeSending(false);
                      }
                    }}
                    style={{
                      border: '1px solid #1976D2',
                      background: '#1976D2',
                      borderRadius: 10,
                      padding: '8px 12px',
                      cursor: upgradeSending ? 'not-allowed' : 'pointer',
                      fontWeight: 500,
                      color: '#fff',
                      opacity: upgradeSending ? 0.7 : 1,
                    }}
                  >
                    {upgradeSending ? 'Skickar…' : 'Ja'}
                  </button>
                </div>
              </div>
            </div>
          ) : null}

          {upgradeSuccessOpen ? (
            <div
              onClick={() => setUpgradeSuccessOpen(false)}
              style={{
                position: 'fixed',
                left: 0,
                top: 0,
                width: '100%',
                height: '100%',
                background: 'rgba(0,0,0,0.20)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1501,
              }}
            >
              <div
                onClick={(e) => e.stopPropagation()}
                style={{
                  width: 320,
                  maxWidth: 'calc(100% - 40px)',
                  background: '#fff',
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
                  border: '1px solid #E6E8EC',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#2E7D32', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Ionicons name="checkmark" size={18} color="#fff" />
                  </div>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#111' }}>Skickat</div>
                </div>
                <div style={{ fontSize: 13, color: '#374151', lineHeight: '18px' }}>
                  {upgradeSuccessText || 'Tack! Vi kontaktar dig.'}
                </div>
              </div>
            </div>
          ) : null}

          <UserEditModal
            visible={addUserOpen}
            member={null}
            companyId={companyId}
            isNew={true}
            saving={addUserSaving}
            errorMessage={addUserError}
            onClose={() => { setAddUserOpen(false); setAddUserError(''); }}
            onSave={async ({ firstName, lastName, email, role, password, avatarPreset, avatarFile }) => {
              if (!companyId) return;
              if (seatsLeft !== null && seatsLeft <= 0) {
                setAddUserError('Inga platser kvar enligt userLimit');
                return;
              }
              const displayName = `${(firstName || '').trim()} ${(lastName || '').trim()}`.trim() || (email ? String(email).split('@')[0] : '');
              setAddUserSaving(true);
              setAddUserError('');
              try {
                const createRes = await createUserRemote({
                  companyId,
                  email: String(email || '').trim().toLowerCase(),
                  displayName,
                  role: role || 'user',
                  password: password || undefined,
                  firstName: (firstName || '').trim(),
                  lastName: (lastName || '').trim(),
                  avatarPreset: avatarPreset || undefined,
                });
                const newUid = createRes && (createRes.uid || (createRes.data && createRes.data.uid)) ? (createRes.uid || (createRes.data && createRes.data.uid)) : null;
                const tempPassword = createRes && (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) ? (createRes.tempPassword || (createRes.data && createRes.data.tempPassword)) : null;
                if (!newUid) {
                  const rawMsg = createRes && (createRes.message || createRes.error || createRes.code) ? String(createRes.message || createRes.error || createRes.code) : 'Okänt fel vid skapande av användare.';
                  setAddUserError('Kunde inte skapa användare: ' + rawMsg);
                  return;
                }
                if (avatarFile) {
                  try {
                    const photoURL = await uploadUserAvatar({ companyId, uid: newUid, file: avatarFile });
                    await updateUserRemote({ companyId, uid: newUid, photoURL, avatarPreset: avatarPreset || undefined });
                  } catch (_e) {
                    // Non-blocking
                  }
                }

                const mems = await fetchCompanyMembers(companyId).catch(() => []);
                setMembers(Array.isArray(mems) ? mems : []);
                setAddUserOpen(false);

                const pwToShow = String(password || '').trim() || String(tempPassword || '').trim();
                if (pwToShow) Alert.alert('Ok', `Användare skapad. Lösenord: ${pwToShow}`);
                else Alert.alert('Ok', 'Användare skapad.');
              } catch (e) {
                setAddUserError(String(e?.message || e));
              } finally {
                setAddUserSaving(false);
              }
            }}
          />
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
