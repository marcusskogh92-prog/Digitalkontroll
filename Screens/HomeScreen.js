import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Animated, Easing, Image, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenu from '../components/HeaderUserMenu';
import WebBreadcrumbInline from '../components/WebBreadcrumbInline';
import { auth, DEFAULT_CONTROL_TYPES, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, fetchControlsForProject, fetchHierarchy, fetchUserProfile, logCompanyActivity, saveControlToFirestore, saveDraftToFirestore, saveHierarchy, saveUserProfile, storage, subscribeCompanyActivity, subscribeCompanyMembers, upsertCompanyMember } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import { onProjectUpdated } from '../components/projectBus';
import useBackgroundSync from '../hooks/useBackgroundSync';
import ProjectDetails from './ProjectDetails';
import TemplateControlScreen from './TemplateControlScreen';
let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch(_e) { createPortal = null; }
}
let portalRootId = 'dk-header-portal';

function isValidIsoDateYmd(value) {
  const v = String(value || '').trim();
  if (!v) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [yStr, mStr, dStr] = v.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return false;
  if (m < 1 || m > 12) return false;
  if (d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && (dt.getUTCMonth() + 1) === m && dt.getUTCDate() === d;
}

// App version (displayed in sidebar)
let appVersion = '1.0.0';
try {
  const pkg = require('../package.json');
  if (pkg && pkg.version) appVersion = String(pkg.version);
} catch (e) {
  try { Alert.alert('Fel', 'Kunde inte läsa package.json: ' + (e?.message || String(e))); } catch(_e) {}
}

// showAlert: use Alert.alert on native, fallback to window.alert on web so support buttons work in browser
function showAlert(title, message, buttons) {
  // Prefer window.alert on web so buttonless alerts work in browsers
  if (Platform && Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    const msg = (typeof message === 'string') ? message : (message && typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message));
    try { window.alert(String(title || '') + '\n\n' + msg); } catch(_e) { /* ignore */ }
    return;
  }
  try {
    if (buttons) Alert.alert(title || '', message || '', buttons);
    else Alert.alert(title || '', message || '');
  } catch (_e) { /* ignore */ }
}

export default function HomeScreen({ navigation, route }) {

  // Visible marker to confirm which bundle/source is running in web/native.
  const BUILD_STAMP = 'DK-BUILD 2026-01-15 A';

  const [spinSidebarFilter, setSpinSidebarFilter] = useState(0);
  const [spinSidebarHome, setSpinSidebarHome] = useState(0);
  const [spinSidebarRefresh, setSpinSidebarRefresh] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const leftTreeScrollRef = useRef(null);
  const rightPaneScrollRef = useRef(null);
  const activityScrollRef = useRef(null);
  const filterSpinAnim = useRef(new Animated.Value(0)).current;
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const mainChevronSpinAnim = useRef({}).current; // per-huvudmapp
  const subChevronSpinAnim = useRef({}).current;  // per-undermapp

  const spinOnce = (anim) => {
    if (!anim) return;
    try { anim.setValue(0); } catch(_e) {}
      try {
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
      }).start();
    } catch(_e) {}
  };

  // Small press feedback row used for task/control rows
  function AnimatedRow({ children, onPress, style }) {
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => {
      try { Animated.timing(scale, { toValue: 0.985, duration: 120, useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    };
    const pressOut = () => {
      try { Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    };
    return (
      <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={onPress}>
        <Animated.View style={[{ transform: [{ scale }] }, style]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  const filterRotate = filterSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const searchRotate = searchSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const [tasksOpen, setTasksOpen] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);
  
  // Close header search on Escape key (web)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keyHandler = (e) => {
      try {
        if (e && (e.key === 'Escape' || e.key === 'Esc')) {
          try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: true }); } catch(_e) {}
        }
      } catch(_e) {}
    };

    const closeOnScrollOrResize = () => {
      try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
    };

    try { window.addEventListener('keydown', keyHandler); } catch(_e) {}
    try { window.addEventListener('scroll', closeOnScrollOrResize, { passive: true }); } catch(_e) {}
    try { window.addEventListener('resize', closeOnScrollOrResize); } catch(_e) {}

    return () => {
      try { window.removeEventListener('keydown', keyHandler); } catch(_e) {}
      try { window.removeEventListener('scroll', closeOnScrollOrResize); } catch(_e) {}
      try { window.removeEventListener('resize', closeOnScrollOrResize); } catch(_e) {}
    };
  }, [navigation]);

  const webPaneHeight = Platform.OS === 'web'
    ? Math.max(240, (windowHeight || 800) - (headerHeight || 140))
    : undefined;

  const scrollToEndSafe = (ref) => {
    const node = ref?.current;
    if (!node) return;
    try {
      if (typeof node.scrollToEnd === 'function') node.scrollToEnd({ animated: true });
      else if (typeof node.scrollTo === 'function') node.scrollTo({ y: 1e9, animated: true });
    } catch(_e) {}
  };

  // Helper: collapse all expanded flags in a hierarchy (used on initial load)
  const collapseHierarchy = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map(m => ({
      ...m,
      expanded: false,
      children: Array.isArray(m.children) ? m.children.map(s => ({
        ...s,
        expanded: false,
        children: Array.isArray(s.children) ? s.children.map(ch => ({ ...ch })) : [],
      })) : [],
    }));
  };
  // Admin unlock (tap title 5 times)
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [adminActionRunning, setAdminActionRunning] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);

  // Support/debug tools should not be visible in normal UI.
  // Shown only in development or after explicit admin-unlock.
  const showSupportTools = __DEV__ || showAdminButton;

  // Extra restriction: only show support/debug tools for admins, or for the dedicated demo company.
  // This keeps normal companies/users clean while still enabling dev workflows.
  const [authClaims, setAuthClaims] = useState(null);

  React.useEffect(() => {
    let active = true;
    async function refreshClaims() {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (active) setAuthClaims(null);
          return;
        }
        const tokenRes = await user.getIdTokenResult(false).catch((e) => null);
        if (active) setAuthClaims(tokenRes?.claims || null);
      } catch(_e) {
        if (active) setAuthClaims(null);
      }
    }

    refreshClaims();
    const unsub = auth?.onAuthStateChanged ? auth.onAuthStateChanged(() => { refreshClaims(); }) : null;
    return () => {
      active = false;
      try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
    };
  }, []);

  const routeCompanyId = route?.params?.companyId || null;

  const isAdminUser = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  // IMPORTANT: companyId state is initialized later in this component.
  // Do not reference it here (TDZ on web). Use claims/route params instead.
  const debugCompanyId = String(authClaims?.companyId || routeCompanyId || '').trim();
  const isDemoCompany = debugCompanyId === 'MS Byggsystem DEMO' || debugCompanyId === 'demo-service' || debugCompanyId === 'demo-company';
  // Only show support tools for:
  // - Demo company (all users)
  // - MS Byggsystem admins (dev accounts)
  // This prevents other-company admins from seeing dev tools.
  const isMsByggsystemCompany = debugCompanyId === 'MS Byggsystem';
  const canShowSupportToolsInHeader = !!(showSupportTools && (isDemoCompany || (isMsByggsystemCompany && isAdminUser)));
  
  // Dev-only: promote current user to demo/admin and load test hierarchy
  async function handleMakeDemoAdmin() {
    if (!__DEV__) return;
    if (adminActionRunning) return;
    setAdminActionRunning(true);
    try {
      const user = auth.currentUser;
      const demoCompanyId = 'demo-company';
        if (user) {
        await saveUserProfile(user.uid, {
          companyId: demoCompanyId,
          role: 'admin',
          displayName: user.email ? user.email.split('@')[0] : 'Demo Admin',
          email: user.email || null,
          updatedAt: new Date().toISOString()
        });
        await AsyncStorage.setItem('dk_companyId', demoCompanyId);
        setCompanyId(demoCompanyId);
        setHierarchy(collapseHierarchy(testHierarchy));
      }
    } catch(_e) {
      console.log('[Home] make demo admin error', _e?.message || _e);
    } finally {
      setAdminActionRunning(false);
      setShowAdminButton(false);
    }
  }

  // Filtrera bort projekt med namnet '22 test' vid render
  React.useEffect(() => {
    setHierarchy(prev => prev.map(main => ({
      ...main,
      children: main.children.map(sub => ({
        ...sub,
        children: sub.children ? sub.children.filter(child => !(child.type === 'project' && child.name.trim().toLowerCase() === '22 test')) : []
      }))
    })));
  }, []);
  // State för nytt projekt-modal i undermapp
  const [newProjectModal, setNewProjectModal] = useState({ visible: false, parentSubId: null });
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectNumber, setNewProjectNumber] = useState("");

  // Extra project fields (web modal UX)
  const [newProjectCustomer, setNewProjectCustomer] = useState('');
  const [newProjectClientContactName, setNewProjectClientContactName] = useState('');
  const [newProjectClientContactPhone, setNewProjectClientContactPhone] = useState('');
  const [newProjectClientContactEmail, setNewProjectClientContactEmail] = useState('');
  const [newProjectAddressStreet, setNewProjectAddressStreet] = useState('');
  const [newProjectAddressPostal, setNewProjectAddressPostal] = useState('');
  const [newProjectAddressCity, setNewProjectAddressCity] = useState('');
  const [newProjectPropertyDesignation, setNewProjectPropertyDesignation] = useState('');
  const [newProjectParticipantsSearch, setNewProjectParticipantsSearch] = useState('');
  const [newProjectAdvancedOpen, setNewProjectAdvancedOpen] = useState(false);

  const [newProjectResponsible, setNewProjectResponsible] = useState(null);
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [newProjectParticipants, setNewProjectParticipants] = useState([]);
  const [participantsPickerVisible, setParticipantsPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [newProjectKeyboardLockHeight, setNewProjectKeyboardLockHeight] = useState(0);
  const [, setCompanyAdminsLastFetchAt] = useState(0);
  const companyAdminsUnsubRef = useRef(null);
  const [companyAdminsPermissionDenied, setCompanyAdminsPermissionDenied] = useState(false);

  const [newProjectSkyddsrondEnabled, setNewProjectSkyddsrondEnabled] = useState(false);
  const [newProjectSkyddsrondWeeks, setNewProjectSkyddsrondWeeks] = useState(2);
  const [newProjectSkyddsrondFirstDueDate, setNewProjectSkyddsrondFirstDueDate] = useState('');
  const [skyddsrondWeeksPickerVisible, setSkyddsrondWeeksPickerVisible] = useState(false);

  const newProjectSkyddsrondFirstDueTrim = String(newProjectSkyddsrondFirstDueDate || '').trim();
  const newProjectSkyddsrondFirstDueValid = (!newProjectSkyddsrondEnabled)
    || (newProjectSkyddsrondFirstDueTrim !== '' && isValidIsoDateYmd(newProjectSkyddsrondFirstDueTrim));

  const resetProjectFields = React.useCallback(() => {
    try { setNewProjectName(''); } catch(_e) {}
    try { setNewProjectNumber(''); } catch(_e) {}
    try { setNewProjectCustomer(''); } catch(_e) {}
    try { setNewProjectClientContactName(''); } catch(_e) {}
    try { setNewProjectClientContactPhone(''); } catch(_e) {}
    try { setNewProjectClientContactEmail(''); } catch(_e) {}
    try { setNewProjectAddressStreet(''); } catch(_e) {}
    try { setNewProjectAddressPostal(''); } catch(_e) {}
    try { setNewProjectAddressCity(''); } catch(_e) {}
    try { setNewProjectPropertyDesignation(''); } catch(_e) {}
    try { setNewProjectParticipantsSearch(''); } catch(_e) {}
    try { setNewProjectAdvancedOpen(false); } catch(_e) {}
    try { setNewProjectResponsible(null); } catch(_e) {}
    try { setResponsiblePickerVisible(false); } catch(_e) {}
    try { setNewProjectKeyboardLockHeight(0); } catch(_e) {}
    try { setNewProjectSkyddsrondEnabled(false); } catch(_e) {}
    try { setNewProjectSkyddsrondWeeks(2); } catch(_e) {}
    try { setNewProjectSkyddsrondFirstDueDate(''); } catch(_e) {}
    try { setSkyddsrondWeeksPickerVisible(false); } catch(_e) {}
    try { setNewProjectParticipants([]); } catch(_e) {}
    try { setParticipantsPickerVisible(false); } catch(_e) {}
    // Best-effort: dismiss keyboard on native
    try { if (Platform.OS !== 'web') Keyboard.dismiss(); } catch(_e) {}
  }, []);

  const loadCompanyAdmins = React.useCallback(async ({ force } = { force: false }) => {
    try {
      if (!routeCompanyId) return;
      if (loadingCompanyAdmins && !force) return;
      setLoadingCompanyAdmins(true);
      setCompanyAdminsPermissionDenied(false);
      // Ensure at least the current user is present in members directory
      // (Inline to avoid any scope issues on native/web builds.)
      try {
        const user = auth?.currentUser;
        if (user?.uid) {
          const profile = await fetchUserProfile(user.uid).catch((e) => null);
          const displayName = profile?.displayName || profile?.name || (user.email ? String(user.email).split('@')[0] : null);
          const role = profile?.role || null;
          await upsertCompanyMember({
            companyId: routeCompanyId || null,
            uid: user.uid,
            displayName,
            email: user.email || null,
            role,
          });
        }
      } catch(_e) {}
      const admins = await fetchCompanyMembers(routeCompanyId, { role: 'admin' });
      setCompanyAdmins(Array.isArray(admins) ? admins : []);
      setCompanyAdminsLastFetchAt(Date.now());
    } catch(_e) {
      const msg = String(_e?.message || _e || '').toLowerCase();
      if (_e?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
      setCompanyAdmins([]);
    } finally {
      setLoadingCompanyAdmins(false);
    }
  }, [routeCompanyId, loadingCompanyAdmins]);

  // If the create-project modal opens before companyId is ready, onShow can early-return.
  // This effect ensures admins are fetched as soon as companyId is available while the modal is open.
  React.useEffect(() => {
    if (!newProjectModal?.visible) return;
    if (!routeCompanyId) return;
    // Avoid refetch loop; only fetch if we have nothing yet.
    if (companyAdmins && companyAdmins.length > 0) return;
    if (loadingCompanyAdmins) return;
    loadCompanyAdmins({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectModal?.visible, routeCompanyId]);

  // While the ansvarig picker is open, subscribe to admins in realtime.
  // This avoids the common "empty cache" problem on fresh logins.
  React.useEffect(() => {
    if (!responsiblePickerVisible) {
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch(_e) {}
      companyAdminsUnsubRef.current = null;
      return;
    }
    if (!routeCompanyId) return;

    setLoadingCompanyAdmins(true);
    setCompanyAdminsPermissionDenied(false);
    try {
      if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current();
    } catch(_e) {}
    companyAdminsUnsubRef.current = subscribeCompanyMembers(routeCompanyId, {
      role: 'admin',
      onData: (admins) => {
        setCompanyAdmins(Array.isArray(admins) ? admins : []);
        setCompanyAdminsLastFetchAt(Date.now());
        setLoadingCompanyAdmins(false);
      },
      onError: (err) => {
        const msg = String(err?.message || err || '').toLowerCase();
        if (err?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
        setLoadingCompanyAdmins(false);
      }
    });

    return () => {
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch(_e) {}
      companyAdminsUnsubRef.current = null;
    };
  }, [responsiblePickerVisible, routeCompanyId]);

  // Track native keyboard height for the create-project modal.
  // We keep this separate from the search modal keyboard handling to avoid stale/reset values.
  const [nativeKeyboardHeight, setNativeKeyboardHeight] = useState(0);
  const nativeKeyboardHeightRef = useRef(0);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const subs = [];
    const onShow = (e) => {
      const h = e?.endCoordinates?.height || 0;
      nativeKeyboardHeightRef.current = h;
      setNativeKeyboardHeight(h);
    };
    const onHide = () => {
      nativeKeyboardHeightRef.current = 0;
      setNativeKeyboardHeight(0);
    };

    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch(_e) {}
      }
    };
  }, []);

  // Modal för nytt projekt i undermapp (läggs utanför return)
  // State for project selection modal (for creating controls)
  const [selectProjectModal, setSelectProjectModal] = useState({ visible: false, type: null });
  const [showControlTypeModal, setShowControlTypeModal] = useState(false);
  const [controlTypeScrollMetrics, setControlTypeScrollMetrics] = useState({
    containerHeight: 0,
    contentHeight: 0,
    scrollY: 0,
  });
  const controlTypeCanScroll = controlTypeScrollMetrics.contentHeight > (controlTypeScrollMetrics.containerHeight + 1);
  const controlTypeThumbHeight = React.useMemo(() => {
    const { containerHeight, contentHeight } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const ratio = containerHeight / contentHeight;
    return Math.max(28, containerHeight * ratio);
  }, [controlTypeScrollMetrics]);
  const controlTypeThumbTop = React.useMemo(() => {
    const { containerHeight, contentHeight, scrollY } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const maxScroll = Math.max(1, contentHeight - containerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
    return (containerHeight - controlTypeThumbHeight) * progress;
  }, [controlTypeScrollMetrics, controlTypeThumbHeight]);
  const [projectControlModal, setProjectControlModal] = useState({ visible: false, project: null });
  const [projectControlSelectedType, setProjectControlSelectedType] = useState('');
  const [projectControlTypePickerOpen, setProjectControlTypePickerOpen] = useState(false);
  const [projectControlTemplates, setProjectControlTemplates] = useState([]);
  const [projectControlSelectedTemplateId, setProjectControlSelectedTemplateId] = useState('');
  const [projectControlTemplatePickerOpen, setProjectControlTemplatePickerOpen] = useState(false);
  const [projectControlTemplateSearch, setProjectControlTemplateSearch] = useState('');

  const isBrowserEnv = (Platform.OS === 'web') || (typeof globalThis !== 'undefined' && !!globalThis.document);

  // Check that a project number/id is unique across the whole hierarchy.
  // Must be declared before any JSX/constants that reference it (RN-web TDZ).
  const isProjectNumberUnique = React.useCallback((num) => {
    if (!num) return true;
    const n = String(num ?? '').trim();
    if (!n) return true;
    try {
      for (const main of (hierarchyRef.current || [])) {
        for (const sub of (main.children || [])) {
          if (Array.isArray(sub.children) && sub.children.some(child => child?.type === 'project' && String(child.id) === n)) {
            return false;
          }
        }
      }
    } catch(_e) {}
    return true;
  }, []);

  const newProjectModalComponent = (
    <Modal
      visible={newProjectModal.visible}
      transparent
      animationType="fade"
      onShow={async () => {
        // Fetch admins when the modal opens
        await loadCompanyAdmins({ force: false });
      }}
      onRequestClose={() => {
        setNewProjectModal({ visible: false, parentSubId: null });
        resetProjectFields();
        setNewProjectKeyboardLockHeight(0);
      }}
    >
      {isBrowserEnv ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => {
              setNewProjectModal({ visible: false, parentSubId: null });
              resetProjectFields();
            }}
          />
          {(() => {
            const cardStyle = {
              backgroundColor: '#fff',
              borderRadius: 18,
              width: 980,
              maxWidth: '96%',
              height: 740,
              maxHeight: '90%',
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 8 },
              shadowOpacity: 0.18,
              shadowRadius: 18,
              elevation: 12,
              overflow: 'hidden',
            };

            const headerStyle = {
              height: 56,
              borderBottomWidth: 1,
              borderBottomColor: '#E6E8EC',
              backgroundColor: '#F8FAFC',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 16,
            };

            const sectionTitle = { fontSize: 13, fontWeight: '500', color: '#111', marginBottom: 10 };
            const labelStyle = { fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 };
            const inputStyleBase = {
              borderWidth: 1,
              borderColor: '#E2E8F0',
              borderRadius: 10,
              paddingVertical: 9,
              paddingHorizontal: 10,
              fontSize: 13,
              backgroundColor: '#fff',
              color: '#111',
            };

            const requiredBorder = (ok) => ({ borderColor: ok ? '#E2E8F0' : '#EF4444' });

            const initials = (person) => {
              const name = String(person?.displayName || person?.name || person?.email || '').trim();
              if (!name) return '?';
              const parts = name.split(/\s+/).filter(Boolean);
              const a = (parts[0] || '').slice(0, 1);
              const b = (parts[1] || '').slice(0, 1);
              return (a + b).toUpperCase();
            };

            const toggleParticipant = (m) => {
              try {
                const id = (m.uid || m.id);
                const exists = (newProjectParticipants || []).find((p) => (p.uid || p.id) === id);
                if (exists) {
                  setNewProjectParticipants((prev) => (prev || []).filter((p) => (p.uid || p.id) !== id));
                } else {
                  setNewProjectParticipants((prev) => ([...(prev || []), { uid: id, displayName: m.displayName || null, email: m.email || null, role: m.role || null }]));
                }
              } catch (_e) {}
            };

            const q = String(newProjectParticipantsSearch || '').trim().toLowerCase();
            const visibleAdmins = (companyAdmins || []).filter((m) => {
              if (!q) return true;
              const n = String(m?.displayName || m?.name || '').toLowerCase();
              const e = String(m?.email || '').toLowerCase();
              return n.includes(q) || e.includes(q);
            });

            const canCreate = (
              String(newProjectName ?? '').trim() !== ''
              && String(newProjectNumber ?? '').trim() !== ''
              && isProjectNumberUnique(newProjectNumber)
              && !!newProjectResponsible
              && (!!newProjectSkyddsrondFirstDueValid)
            );

            return (
              <View style={cardStyle}>
                <View style={headerStyle}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>Skapa nytt projekt</Text>
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
                    onPress={() => {
                      setNewProjectModal({ visible: false, parentSubId: null });
                      resetProjectFields();
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={22} color="#111" />
                  </TouchableOpacity>
                </View>

                <View style={{ flex: 1, flexDirection: 'row' }}>
                  {/* Left column */}
                  <View style={{ flex: 1, borderRightWidth: 1, borderRightColor: '#E6E8EC', backgroundColor: '#fff' }}>
                    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 18, paddingBottom: 22 }}>
                      <Text style={sectionTitle}>Projektinformation</Text>

                      <Text style={labelStyle}>Projektnummer *</Text>
                      <TextInput
                        value={newProjectNumber}
                        onChangeText={(v) => {
                          const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                          setNewProjectNumber(String(next));
                        }}
                        placeholder="Projektnummer..."
                        placeholderTextColor="#94A3B8"
                        style={{
                          ...inputStyleBase,
                          ...requiredBorder(String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber)),
                          color: (!isProjectNumberUnique(newProjectNumber) && String(newProjectNumber ?? '').trim() !== '') ? '#B91C1C' : '#111',
                          marginBottom: 10,
                        }}
                        autoFocus
                      />
                      {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) ? (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: -4, marginBottom: 10 }}>
                          <Ionicons name="warning" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                          <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>Projektnummer används redan.</Text>
                        </View>
                      ) : null}

                      <Text style={labelStyle}>Projektnamn *</Text>
                      <TextInput
                        value={newProjectName}
                        onChangeText={(v) => {
                          const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                          setNewProjectName(String(next));
                        }}
                        placeholder="Projektnamn..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, ...requiredBorder(String(newProjectName ?? '').trim() !== ''), marginBottom: 12 }}
                      />

                      <Text style={labelStyle}>Kund</Text>
                      <TextInput
                        value={newProjectCustomer}
                        onChangeText={(v) => {
                          const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                          setNewProjectCustomer(String(next));
                        }}
                        placeholder="Kundens företagsnamn..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={{ ...labelStyle, marginBottom: 8 }}>Uppgifter till projektansvarig hos beställaren</Text>
                      <TextInput
                        value={newProjectClientContactName}
                        onChangeText={(v) => setNewProjectClientContactName(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Namn"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={newProjectClientContactPhone}
                        onChangeText={(v) => setNewProjectClientContactPhone(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Telefonnummer"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <TextInput
                        value={newProjectClientContactEmail}
                        onChangeText={(v) => setNewProjectClientContactEmail(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="namn@foretag.se"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      <Text style={labelStyle}>Adress</Text>
                      <TextInput
                        value={newProjectAddressStreet}
                        onChangeText={(v) => setNewProjectAddressStreet(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Gata och nr..."
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 10 }}
                      />
                      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
                        <TextInput
                          value={newProjectAddressPostal}
                          onChangeText={(v) => setNewProjectAddressPostal(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Postnummer"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.45 }}
                        />
                        <TextInput
                          value={newProjectAddressCity}
                          onChangeText={(v) => setNewProjectAddressCity(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Ort"
                          placeholderTextColor="#94A3B8"
                          style={{ ...inputStyleBase, flex: 0.55 }}
                        />
                      </View>
                      <TextInput
                        value={newProjectPropertyDesignation}
                        onChangeText={(v) => setNewProjectPropertyDesignation(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                        placeholder="Fastighetsbeteckning"
                        placeholderTextColor="#94A3B8"
                        style={{ ...inputStyleBase, marginBottom: 14 }}
                      />

                      {/* Skyddsronder is controlled from the bottom-right dropdown (web V2). */}
                    </ScrollView>
                  </View>

                  {/* Right column */}
                  <View style={{ flex: 1, backgroundColor: '#fff' }}>
                    <View style={{ flex: 1, padding: 18, paddingBottom: 10 }}>
                      <Text style={sectionTitle}>Ansvariga och deltagare</Text>

                      <Text style={labelStyle}>Ansvarig</Text>
                      <TouchableOpacity
                        style={{
                          ...inputStyleBase,
                          ...(newProjectResponsible ? {} : { borderColor: '#EF4444' }),
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          marginBottom: 12,
                        }}
                        onPress={() => setResponsiblePickerVisible(true)}
                        activeOpacity={0.8}
                      >
                        <Text style={{ fontSize: 13, color: newProjectResponsible ? '#111' : '#94A3B8', fontWeight: '700' }} numberOfLines={1}>
                          {newProjectResponsible ? formatPersonName(newProjectResponsible) : 'Välj ansvarig...'}
                        </Text>
                        <Ionicons name="chevron-down" size={16} color="#111" />
                      </TouchableOpacity>
                      {!newProjectResponsible ? (
                        <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: -6, marginBottom: 10, fontWeight: '700' }}>
                          Du måste välja ansvarig.
                        </Text>
                      ) : null}

                      <Text style={labelStyle}>Deltagare</Text>
                      <View style={{ ...inputStyleBase, flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                        <Ionicons name="search" size={16} color="#64748b" />
                        <TextInput
                          value={newProjectParticipantsSearch}
                          onChangeText={(v) => setNewProjectParticipantsSearch(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                          placeholder="Sök användare..."
                          placeholderTextColor="#94A3B8"
                          style={{ flex: 1, fontSize: 13, color: '#111' }}
                        />
                      </View>

                      <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', flex: 1, minHeight: 260 }}>
                        {loadingCompanyAdmins ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#64748b', fontSize: 13 }}>Laddar…</Text>
                          </View>
                        ) : companyAdminsPermissionDenied ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#B91C1C', fontSize: 13, fontWeight: '700' }}>Saknar behörighet att läsa användare.</Text>
                          </View>
                        ) : visibleAdmins.length === 0 ? (
                          <View style={{ padding: 12 }}>
                            <Text style={{ color: '#64748b', fontSize: 13 }}>Inga träffar.</Text>
                          </View>
                        ) : (
                          <ScrollView style={{ flex: 1 }}>
                            {visibleAdmins.slice(0, 200).map((m) => {
                              const id = m.id || m.uid || m.email;
                              const selected = !!(newProjectParticipants || []).find((p) => (p.uid || p.id) === (m.uid || m.id));
                              return (
                                <TouchableOpacity
                                  key={id}
                                  onPress={() => toggleParticipant(m)}
                                  style={{
                                    paddingVertical: 10,
                                    paddingHorizontal: 12,
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#EEF0F3',
                                    flexDirection: 'row',
                                    alignItems: 'center',
                                    justifyContent: 'space-between',
                                    backgroundColor: selected ? '#EFF6FF' : '#fff',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#1E40AF', alignItems: 'center', justifyContent: 'center' }}>
                                      <Text style={{ color: '#fff', fontWeight: '900', fontSize: 12 }}>{initials(m)}</Text>
                                    </View>
                                    <View style={{ minWidth: 0, flex: 1 }}>
                                      <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: '800', color: '#111' }}>{formatPersonName(m)}</Text>
                                      <Text numberOfLines={1} style={{ fontSize: 12, color: '#64748b' }}>{String(m?.role || '').trim() || 'Användare'}</Text>
                                    </View>
                                  </View>

                                  <View style={{ width: 22, height: 22, borderRadius: 6, borderWidth: 1, borderColor: selected ? '#2563EB' : '#CBD5E1', backgroundColor: selected ? '#2563EB' : '#fff', alignItems: 'center', justifyContent: 'center' }}>
                                    {selected ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </ScrollView>
                        )}
                      </View>

                      <TouchableOpacity
                        onPress={() => {
                          try { setNewProjectParticipantsSearch(''); } catch (_e) {}
                        }}
                        style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 10, paddingHorizontal: 4 }}
                      >
                        <View style={{ width: 24, height: 24, borderRadius: 8, backgroundColor: '#E0F2FE', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#BAE6FD' }}>
                          <Ionicons name="add" size={16} color="#0369A1" />
                        </View>
                        <Text style={{ color: '#1976D2', fontWeight: '500', fontSize: 13 }}>Lägg till deltagare</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={{ paddingHorizontal: 24, paddingBottom: 16, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#E6E8EC', backgroundColor: '#fff', position: 'relative' }}>
                      {newProjectAdvancedOpen ? (
                        <View
                          style={{
                            position: 'absolute',
                            right: 24,
                            bottom: 66,
                            width: 340,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#E6E8EC',
                            borderRadius: 14,
                            padding: 14,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 8 },
                            shadowOpacity: 0.18,
                            shadowRadius: 18,
                            elevation: 12,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                            <Text style={{ fontSize: 13, fontWeight: '500', color: '#111' }}>Skyddsronder</Text>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '500' }}>{newProjectSkyddsrondEnabled ? 'Aktiva' : 'Av'}</Text>
                              <Switch
                                value={!!newProjectSkyddsrondEnabled}
                                onValueChange={(v) => {
                                  const next = !!v;
                                  setNewProjectSkyddsrondEnabled(next);
                                  if (!next) {
                                    try { setNewProjectSkyddsrondFirstDueDate(''); } catch (_e) {}
                                  }
                                }}
                              />
                            </View>
                          </View>

                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Veckor mellan skyddsronder</Text>
                          <TouchableOpacity
                            style={{
                              ...inputStyleBase,
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                              marginBottom: 10,
                            }}
                            disabled={!newProjectSkyddsrondEnabled}
                            onPress={() => setSkyddsrondWeeksPickerVisible(true)}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, color: '#111', fontWeight: '500' }}>{String(newProjectSkyddsrondWeeks || 2)}</Text>
                            <Ionicons name="chevron-down" size={16} color="#111" />
                          </TouchableOpacity>

                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155', marginBottom: 6 }}>Första skyddsrond senast</Text>
                          <TextInput
                            value={newProjectSkyddsrondFirstDueDate}
                            onChangeText={(v) => {
                              const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
                              setNewProjectSkyddsrondFirstDueDate(String(next));
                            }}
                            placeholder="YYYY-MM-DD"
                            placeholderTextColor="#94A3B8"
                            editable={!!newProjectSkyddsrondEnabled}
                            style={{
                              ...inputStyleBase,
                              ...((!newProjectSkyddsrondFirstDueValid && newProjectSkyddsrondEnabled) ? { borderColor: '#EF4444' } : {}),
                              opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
                            }}
                          />

                          {newProjectSkyddsrondEnabled && !newProjectSkyddsrondFirstDueValid ? (
                            <Text style={{ color: '#B91C1C', fontSize: 12, marginTop: 6, fontWeight: '500' }}>
                              Ange datum (YYYY-MM-DD).
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => {
                            if (!newProjectSkyddsrondEnabled) {
                              setNewProjectSkyddsrondEnabled(true);
                            }
                            setNewProjectAdvancedOpen((v) => !v ? true : !v);
                          }}
                          style={{
                            borderWidth: 1,
                            borderColor: newProjectSkyddsrondEnabled ? '#93C5FD' : '#E2E8F0',
                            backgroundColor: newProjectSkyddsrondEnabled ? '#EFF6FF' : '#fff',
                            borderRadius: 999,
                            paddingVertical: 9,
                            paddingHorizontal: 12,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}
                          activeOpacity={0.85}
                        >
                          <Ionicons name="shield-checkmark" size={16} color={newProjectSkyddsrondEnabled ? '#1D4ED8' : '#64748b'} />
                          <Text style={{ fontSize: 12, fontWeight: '500', color: '#0F172A' }}>{newProjectSkyddsrondEnabled ? 'Skyddsronder: På' : 'Aktivera skyddsronder'}</Text>
                          <Ionicons name={newProjectAdvancedOpen ? 'chevron-down' : 'chevron-up'} size={14} color="#0F172A" />
                        </TouchableOpacity>

                        <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12 }}>
                        <TouchableOpacity
                          onPress={() => {
                            setNewProjectModal({ visible: false, parentSubId: null });
                            resetProjectFields();
                          }}
                          style={{ backgroundColor: '#E5E7EB', borderRadius: 10, paddingVertical: 11, paddingHorizontal: 18, minWidth: 120, alignItems: 'center' }}
                        >
                          <Text style={{ color: '#111', fontWeight: '800', fontSize: 14 }}>Avbryt</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          disabled={!canCreate}
                          onPress={() => {
                            // Insert new project into selected subfolder
                            setHierarchy(prev => prev.map(main => ({
                              ...main,
                              children: main.children.map(sub =>
                                sub.id === newProjectModal.parentSubId
                                  ? {
                                      ...sub,
                                      children: [
                                        ...(sub.children || []),
                                        {
                                          id: String(newProjectNumber ?? '').trim(),
                                          name: String(newProjectName ?? '').trim(),
                                          type: 'project',
                                          status: 'ongoing',
                                          customer: String(newProjectCustomer || '').trim() || null,
                                          clientContact: {
                                            name: String(newProjectClientContactName || '').trim() || null,
                                            phone: String(newProjectClientContactPhone || '').trim() || null,
                                            email: String(newProjectClientContactEmail || '').trim() || null,
                                          },
                                          address: {
                                            street: String(newProjectAddressStreet || '').trim() || null,
                                            postalCode: String(newProjectAddressPostal || '').trim() || null,
                                            city: String(newProjectAddressCity || '').trim() || null,
                                          },
                                          propertyDesignation: String(newProjectPropertyDesignation || '').trim() || null,
                                          skyddsrondEnabled: !!newProjectSkyddsrondEnabled,
                                          skyddsrondIntervalWeeks: Number(newProjectSkyddsrondWeeks) || 2,
                                          skyddsrondFirstDueDate: String(newProjectSkyddsrondFirstDueDate || '').trim() || null,
                                          ansvarig: formatPersonName(newProjectResponsible),
                                          ansvarigId: newProjectResponsible?.uid || null,
                                          participants: (newProjectParticipants || []).map(p => ({ uid: p.uid || p.id, displayName: p.displayName || null, email: p.email || null })),
                                          createdAt: new Date().toISOString(),
                                          createdBy: auth?.currentUser?.email || ''
                                        }
                                      ]
                                    }
                                  : sub
                              )
                            })));
                            setNewProjectModal({ visible: false, parentSubId: null });
                            resetProjectFields();
                          }}
                          style={{
                            backgroundColor: '#4F7DB6',
                            borderRadius: 10,
                            paddingVertical: 11,
                            paddingHorizontal: 18,
                            minWidth: 140,
                            alignItems: 'center',
                            opacity: canCreate ? 1 : 0.45,
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>Skapa</Text>
                        </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                </View>
              </View>
            );
          })()}

            <Modal
              visible={responsiblePickerVisible}
              transparent
              animationType="fade"
              onRequestClose={() => setResponsiblePickerVisible(false)}
            >
              <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                <Pressable
                  style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                  onPress={() => setResponsiblePickerVisible(false)}
                />
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, maxHeight: 520, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                    Välj ansvarig
                  </Text>
                  {loadingCompanyAdmins ? (
                    <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                      Laddar...
                    </Text>
                  ) : (companyAdmins.length === 0 ? (
                    <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                      Inga admins hittades i företaget.
                    </Text>
                  ) : (
                    <ScrollView style={{ maxHeight: 420 }}>
                      {companyAdmins.map((m) => (
                        <TouchableOpacity
                          key={m.id || m.uid || m.email}
                          style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                          onPress={() => {
                            setNewProjectResponsible({
                              uid: m.uid || m.id,
                              displayName: m.displayName || null,
                              email: m.email || null,
                              role: m.role || null,
                            });
                            setResponsiblePickerVisible(false);
                          }}
                        >
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                            {formatPersonName(m)}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  ))}

                  <TouchableOpacity
                    style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                    onPress={() => setResponsiblePickerVisible(false)}
                  >
                    <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>

        </View>
      ) : (
        (() => {
          const effectiveKb = responsiblePickerVisible
            ? Math.max(nativeKeyboardHeight || 0, newProjectKeyboardLockHeight || 0)
            : (nativeKeyboardHeight || 0);
          // Lift the modal above the keyboard. Keep a small margin so it doesn't over-shoot.
          const lift = Math.max(0, effectiveKb - 12);
          const hasKeyboard = lift > 40; // if keyboard is visible, treat as bottom-aligned
          return (
            <View
              style={{
                flex: 1,
                justifyContent: hasKeyboard ? 'flex-end' : 'center',
                alignItems: 'center',
                paddingBottom: hasKeyboard ? 16 + lift : 0,
              }}
            >
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={() => {
                setNewProjectModal({ visible: false, parentSubId: null });
                resetProjectFields();
                setNewProjectKeyboardLockHeight(0);
              }}
            />
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
            onPress={() => {
              setNewProjectModal({ visible: false, parentSubId: null });
              resetProjectFields();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={26} color="#222" />
          </TouchableOpacity>

          <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center', marginTop: 6 }}>{`Skapa nytt projekt (${BUILD_STAMP})`}</Text>
          <View style={{ position: 'absolute', left: 12, top: 14, paddingVertical: 4, paddingHorizontal: 8, borderRadius: 999, backgroundColor: '#FEF3C7', borderWidth: 1, borderColor: '#FDE68A' }}>
            <Text style={{ fontSize: 10, color: '#92400E', fontWeight: '900' }}>{`LEGACY  OS=${String(Platform.OS)}`}</Text>
          </View>

          <TextInput
            value={newProjectNumber}
            onChangeText={(v) => {
              // RN-web can sometimes deliver an event object; normalize to string to avoid crashes.
              const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
              setNewProjectNumber(String(next));
            }}
            placeholder="Projektnummer..."
            placeholderTextColor="#888"
            style={{
              borderWidth: 1,
              borderColor: String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 10,
              backgroundColor: '#fafafa',
              color: !isProjectNumberUnique(newProjectNumber) && String(newProjectNumber ?? '').trim() !== '' ? '#D32F2F' : '#222'
            }}
            autoFocus
            keyboardType="default"
          />
          {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
              <Ionicons name="warning" size={18} color="#D32F2F" style={{ marginRight: 6 }} />
              <Text style={{ color: '#D32F2F', fontSize: 15, fontWeight: 'bold' }}>Projektnummer används redan.</Text>
            </View>
          )}

          <TextInput
            value={newProjectName}
            onChangeText={(v) => {
              const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
              setNewProjectName(String(next));
            }}
            placeholder="Projektnamn..."
            placeholderTextColor="#888"
            style={{
              borderWidth: 1,
              borderColor: String(newProjectName ?? '').trim() === '' ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              color: '#222'
            }}
            keyboardType="default"
          />

          {/* Ansvarig (required) */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
            Ansvarig
          </Text>
          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: newProjectResponsible ? '#e0e0e0' : '#D32F2F',
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 10,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            onPress={() => {
              // Opening the picker dismisses the keyboard on iOS/Android.
              // Lock the current keyboard height so this modal doesn't jump down.
              setNewProjectKeyboardLockHeight(nativeKeyboardHeightRef.current || nativeKeyboardHeight || 0);
              try { Keyboard.dismiss(); } catch(_e) {}
              // If admins weren't loaded yet (or modal opened too early), fetch now.
              if ((!companyAdmins || companyAdmins.length === 0) && !loadingCompanyAdmins) {
                loadCompanyAdmins({ force: true });
              }
              setResponsiblePickerVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16, color: newProjectResponsible ? '#222' : '#888' }} numberOfLines={1}>
              {newProjectResponsible ? formatPersonName(newProjectResponsible) : 'Välj ansvarig...'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#222" />
          </TouchableOpacity>

          {/* Deltagare (optional, multi-select) */}
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
            Deltagare
          </Text>
          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#e0e0e0',
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 10,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
            onPress={() => {
              setNewProjectKeyboardLockHeight(nativeKeyboardHeightRef.current || nativeKeyboardHeight || 0);
              try { Keyboard.dismiss(); } catch(_e) {}
              if ((!companyAdmins || companyAdmins.length === 0) && !loadingCompanyAdmins) {
                loadCompanyAdmins({ force: true });
              }
              setParticipantsPickerVisible(true);
            }}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16, color: (newProjectParticipants && newProjectParticipants.length > 0) ? '#222' : '#888' }} numberOfLines={1}>
              {(newProjectParticipants && newProjectParticipants.length > 0) ? newProjectParticipants.map(p => formatPersonName(p)).join(', ') : 'Välj deltagare...'}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#222" />
          </TouchableOpacity>

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
            Första skyddsrond senast
          </Text>
          <TextInput
            value={newProjectSkyddsrondFirstDueDate}
            onChangeText={(v) => {
              const next = typeof v === 'string' ? v : (v?.target?.value ?? '');
              setNewProjectSkyddsrondFirstDueDate(String(next));
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#888"
            editable={!!newProjectSkyddsrondEnabled}
            style={{
              borderWidth: 1,
                borderColor: (!newProjectSkyddsrondFirstDueValid && newProjectSkyddsrondEnabled) ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              color: '#222',
              opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
            }}
          />

            {newProjectSkyddsrondEnabled && !newProjectSkyddsrondFirstDueValid && (
              <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: -8, marginBottom: 10 }}>
                Du måste fylla i datum (YYYY-MM-DD).
              </Text>
            )}

          {!newProjectResponsible && (
            <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: -8, marginBottom: 10 }}>
              Du måste välja ansvarig.
            </Text>
          )}

          <Modal
            visible={responsiblePickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              setResponsiblePickerVisible(false);
              setNewProjectKeyboardLockHeight(0);
            }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => {
                  setResponsiblePickerVisible(false);
                  setNewProjectKeyboardLockHeight(0);
                }}
              />
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, maxHeight: 520, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                  Välj ansvarig
                </Text>
                {loadingCompanyAdmins ? (
                  <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 8 }}>
                    Laddar...
                  </Text>
                ) : companyAdminsPermissionDenied ? (
                  <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    Saknar behörighet att läsa admins i företaget. Logga ut/in eller kontakta admin.
                  </Text>
                ) : companyAdmins.length === 0 ? (
                  <Text style={{ color: '#D32F2F', fontSize: 14, textAlign: 'center', marginTop: 8 }}>
                    Inga admins hittades i företaget. Om du nyss lades till, logga ut/in och försök igen.
                  </Text>
                ) : (
                  <ScrollView style={{ maxHeight: 420 }}>
                    {companyAdmins.map((m) => (
                      <TouchableOpacity
                        key={m.id || m.uid || m.email}
                        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: '#eee' }}
                        onPress={() => {
                          setNewProjectResponsible({
                            uid: m.uid || m.id,
                            displayName: m.displayName || null,
                            email: m.email || null,
                            role: m.role || null,
                          });
                          setResponsiblePickerVisible(false);
                          setNewProjectKeyboardLockHeight(0);
                        }}
                      >
                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                          {formatPersonName(m)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                )}

                <TouchableOpacity
                  style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                  onPress={() => {
                    setResponsiblePickerVisible(false);
                    setNewProjectKeyboardLockHeight(0);
                  }}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
            Skyddsronder
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 15, color: '#555' }}>Aktiva</Text>
            <Switch
              value={!!newProjectSkyddsrondEnabled}
              onValueChange={(v) => setNewProjectSkyddsrondEnabled(!!v)}
            />
          </View>

          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 6 }}>
            Veckor mellan skyddsronder
          </Text>
          <TouchableOpacity
            style={{
              borderWidth: 1,
              borderColor: '#e0e0e0',
              borderRadius: 8,
              paddingVertical: 10,
              paddingHorizontal: 10,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              opacity: newProjectSkyddsrondEnabled ? 1 : 0.5,
            }}
            disabled={!newProjectSkyddsrondEnabled}
            onPress={() => setSkyddsrondWeeksPickerVisible(true)}
            activeOpacity={0.8}
          >
            <Text style={{ fontSize: 16, color: '#222' }} numberOfLines={1}>
              {String(newProjectSkyddsrondWeeks || 2)}
            </Text>
            <Ionicons name="chevron-down" size={18} color="#222" />
          </TouchableOpacity>

          <Modal
            visible={skyddsrondWeeksPickerVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setSkyddsrondWeeksPickerVisible(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => setSkyddsrondWeeksPickerVisible(false)}
              />
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 12, textAlign: 'center' }}>
                  Veckor mellan skyddsronder
                </Text>
                {[1, 2, 3, 4].map((w) => (
                  <TouchableOpacity
                    key={String(w)}
                    style={{ paddingVertical: 12, borderBottomWidth: 1, borderColor: '#eee' }}
                    onPress={() => {
                      setNewProjectSkyddsrondWeeks(w);
                      setSkyddsrondWeeksPickerVisible(false);
                    }}
                  >
                    <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>
                      {w}
                    </Text>
                  </TouchableOpacity>
                ))}
                <TouchableOpacity
                  style={{ backgroundColor: '#e0e0e0', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginTop: 12 }}
                  onPress={() => setSkyddsrondWeeksPickerVisible(false)}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#1976D2',
                borderRadius: 8,
                paddingVertical: 12,
                alignItems: 'center',
                flex: 1,
                marginRight: 8,
                opacity: (String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible || !newProjectSkyddsrondFirstDueValid) ? 0.5 : 1
              }}
              disabled={String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible || !newProjectSkyddsrondFirstDueValid}
              onPress={() => {
                // Insert new project into selected subfolder
                setHierarchy(prev => prev.map(main => ({
                  ...main,
                  children: main.children.map(sub =>
                    sub.id === newProjectModal.parentSubId
                      ? {
                          ...sub,
                          children: [
                            ...(sub.children || []),
                            {
                              id: String(newProjectNumber ?? '').trim(),
                              name: String(newProjectName ?? '').trim(),
                              type: 'project',
                              status: 'ongoing',
                              skyddsrondEnabled: !!newProjectSkyddsrondEnabled,
                              skyddsrondIntervalWeeks: Number(newProjectSkyddsrondWeeks) || 2,
                              skyddsrondFirstDueDate: newProjectSkyddsrondEnabled ? (String(newProjectSkyddsrondFirstDueDate || '').trim() || null) : null,
                              ansvarig: formatPersonName(newProjectResponsible),
                              ansvarigId: newProjectResponsible?.uid || null,
                              participants: (newProjectParticipants || []).map(p => ({ uid: p.uid || p.id, displayName: p.displayName || null, email: p.email || null })),
                              createdAt: new Date().toISOString(),
                              createdBy: auth?.currentUser?.email || ''
                            }
                          ]
                        }
                      : sub
                  )
                })));
                setNewProjectModal({ visible: false, parentSubId: null });
                resetProjectFields();
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Skapa</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
              onPress={() => {
                setNewProjectModal({ visible: false, parentSubId: null });
                resetProjectFields();
              }}
            >
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
            </View>
          );
        })()
      )}
    </Modal>
  );
    // Ref for main folder long press timers
    const mainTimersRef = React.useRef({});
  // Clean up timer on unmount (only one, correct placement)
  React.useEffect(() => {
    return () => {
      if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
    };
  }, []);
          // Ref for long press timer
          const projektLongPressTimer = React.useRef(null);
        // State for new main folder modal
        const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
      // State for edit modal (main or sub group)
      const [, setEditModal] = useState({ visible: false, type: '', id: null, name: '' });
    // Helper to count ongoing and completed projects
    // eslint-disable-next-line no-unused-vars
    function _countProjectStatus(tree) {
      let ongoing = 0;
      let completed = 0;
      if (!Array.isArray(tree)) return { ongoing, completed };
      try {
        tree.forEach(main => {
          if (main.children && Array.isArray(main.children)) {
            main.children.forEach(sub => {
              if (sub.children && Array.isArray(sub.children)) {
                sub.children.forEach(child => {
                  if (child && child.type === 'project') {
                    if (child.status === 'completed') completed++;
                    else ongoing++;
                  }
                });
              }
            });
          }
        });
      } catch (_e) {}
      return { ongoing, completed };
    }
  // Helper to remove last main folder
  // eslint-disable-next-line no-unused-vars
  const removeLastMainFolder = () => {
    setHierarchy(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
  };
  // Helper to check if folder name is unique
  const isFolderNameUnique = (name) => !hierarchy.some(folder => folder.name.trim().toLowerCase() === name.trim().toLowerCase());

  // State for new subfolder modal
  const [newSubModal, setNewSubModal] = useState({ visible: false, parentId: null });
  const [newSubName, setNewSubName] = useState('');
  // Helper to count all projects in the hierarchy
  // eslint-disable-next-line no-unused-vars
  function _countProjects(tree) {
    let count = 0;
    if (!Array.isArray(tree)) return count;
    tree.forEach(main => {
      if (main.children && Array.isArray(main.children)) {
        main.children.forEach(sub => {
          if (sub.children && Array.isArray(sub.children)) {
            count += sub.children.filter(child => child.type === 'project').length;
          }
        });
      }
    });
    return count;
  }
  const email = route?.params?.email || '';
  const firstName = formatPersonName(email);
  const userBtnRef = useRef(null);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const isSuperAdmin = ((auth && auth.currentUser && ['marcus@msbyggsystem.se', 'marcus.skogh@msbyggsystem.se'].includes(String(auth.currentUser.email || '').toLowerCase())) || !!authClaims?.globalAdmin);

  const currentEmailLower = String(auth?.currentUser?.email || '').toLowerCase();
  const isMsAdminClaim = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  const allowedTools = (currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se') || (String(authClaims?.companyId || '').trim() === 'MS Byggsystem' && isMsAdminClaim);
  const showHeaderUserMenu = !!(isAdminUser || currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se');

  const openUserMenu = () => {
    try {
      const node = userBtnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          setUserMenuVisible(true);
        });
        return;
      }
    } catch (_e) {}
    setUserMenuVisible(true);
  };
  const [, setLoggingOut] = useState(false);
  // companyId kan komma från route.params eller användarprofil
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');

  // Persist companyId locally (used as fallback in other screens) and
  // allow resolving companyId from auth claims when route params are missing.
  React.useEffect(() => {
    (async () => {
      try {
        const current = String(companyId || '').trim();
        const fromClaims = String(authClaims?.companyId || '').trim();
        const cid = current || fromClaims;
        if (!cid) return;
        if (!current && fromClaims) {
          setCompanyId(fromClaims);
        }
        const stored = await AsyncStorage.getItem('dk_companyId');
        if (stored !== cid) {
          await AsyncStorage.setItem('dk_companyId', cid);
        }
      } catch(_e) {}
    })();
  }, [companyId, authClaims?.companyId]);
  // Laddningsstate för hierarkin
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [hierarchy, setHierarchy] = useState([]);
  const hierarchyRef = useRef([]);
  const [spinMain, setSpinMain] = useState({});
  const [spinSub, setSpinSub] = useState({});
  const [localFallbackExists, setLocalFallbackExists] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null); // { mainId, subId, mainName?, subName?, projectId? }
  const selectedProjectRef = useRef(null);
  const [isInlineLocked, setIsInlineLocked] = useState(false);
  const pendingProjectSwitchRef = useRef(null);
  const pendingBreadcrumbNavRef = useRef(null); // { kind: 'dashboard'|'main'|'sub'|'project', mainId?, subId?, projectId? }
  const [projectInlineViewLabel, setProjectInlineViewLabel] = useState(null); // e.g. 'Skyddsrond'
  const [projectControlsRefreshNonce, setProjectControlsRefreshNonce] = useState(0);
  const [inlineControlEditor, setInlineControlEditor] = useState(null); // { project, controlType }

  // Used to request a specific action when opening a project from the dashboard (e.g. open a draft inline)
  const [projectSelectedAction, setProjectSelectedAction] = useState(null);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardOverview, setDashboardOverview] = useState({
    activeProjects: 0,
    openDeviations: 0,
    skyddsrondOverdue: 0,
    skyddsrondDueSoon: 0,
    controlsToSign: 0,
    drafts: 0,
  });
  const [dashboardRecent, setDashboardRecent] = useState([]);
  const [dashboardRecentProjects, setDashboardRecentProjects] = useState([]);
  const [companyActivity, setCompanyActivity] = useState([]);

  // Dashboard drill-down + hover (used mainly on web)
  const [dashboardFocus, setDashboardFocus] = useState(null); // 'activeProjects' | 'drafts' | 'controlsToSign' | 'upcomingSkyddsrond' | 'openDeviations'
  const [dashboardHoveredStatKey, setDashboardHoveredStatKey] = useState(null);
  const [dashboardActiveProjectsList, setDashboardActiveProjectsList] = useState([]);
  const [dashboardDraftItems, setDashboardDraftItems] = useState([]);
  const [dashboardControlsToSignItems, setDashboardControlsToSignItems] = useState([]);
  const [dashboardOpenDeviationItems, setDashboardOpenDeviationItems] = useState([]);
  const [dashboardUpcomingSkyddsrondItems, setDashboardUpcomingSkyddsrondItems] = useState([]);
  const [dashboardDropdownAnchor, setDashboardDropdownAnchor] = useState('overview');
  const [dashboardDropdownTop, setDashboardDropdownTop] = useState(null);
  const [dashboardDropdownRowKey, setDashboardDropdownRowKey] = useState(null);

  // Remote-loaded button images (prefer Firebase Storage; fallback to local assets)
  const [dashboardBtn1Url, setDashboardBtn1Url] = useState(null);
  const [dashboardBtn2Url, setDashboardBtn2Url] = useState(null);
  const [dashboardBtn1Failed, setDashboardBtn1Failed] = useState(false);
  const [dashboardBtn2Failed, setDashboardBtn2Failed] = useState(false);

  const dashboardCardLayoutRef = useRef({ overview: null, reminders: null });
  const dashboardStatRowLayoutRef = useRef({});

  // Try to load dashboard button images from Firebase Storage path
  React.useEffect(() => {
    let mounted = true;
    async function loadButtons() {
      try {
        const paths = [
          'branding/dashboard_buttons/nykontroll.png',
          'branding/dashboard_buttons/dagensuppgifter.png'
        ];
        const results = await Promise.all(paths.map(async (p) => {
          try {
            if (!storage) return null;
            let fullPath = p;
            // Support full gs:// URIs too
            if (typeof p === 'string' && p.trim().toLowerCase().startsWith('gs://')) {
              const m = String(p).trim().match(/^gs:\/\/[^\/]+\/(.+)$/i);
              if (m && m[1]) fullPath = m[1];
              else return null;
            }

            // Ensure path has no leading slash
            const normPath = String(fullPath).replace(/^\/+/, '');

            // On web prefer the public GCS URL (avoids tokenized REST calls that can 403 in browsers)
            try {
              if (Platform && Platform.OS === 'web') {
                const bucketName = (storage && storage.app && storage.app.options && storage.app.options.storageBucket) ? String(storage.app.options.storageBucket) : '';
                const bucketCandidates = [];
                if (bucketName) {
                  bucketCandidates.push(bucketName);
                  if (bucketName.toLowerCase().endsWith('.firebasestorage.app')) {
                    bucketCandidates.push(bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
                  }
                }
                for (const b of (bucketCandidates.length ? bucketCandidates : [])) {
                  try {
                    const publicUrl = 'https://storage.googleapis.com/' + b + '/' + encodeURI(normPath);
                    return publicUrl;
                  } catch (_e) {
                    // try next bucket candidate
                  }
                }
              }
            } catch (_e) {
              // ignore fallback errors
            }

            // Try a couple of path variants (no leading slash and with a leading slash) using SDK
            const tryPaths = [String(fullPath), String('/' + fullPath)];
            for (const tp of tryPaths) {
              try {
                const sref = storageRef(storage, tp);
                const url = await getDownloadURL(sref);
                if (url) return url;
              } catch (_e) {
                // try next variant
              }
            }

            return null;
          } catch (e) {
            return null;
          }
        }));
        if (!mounted) return;
        // Debug: log what we found so we can inspect console on web
        try { console.log('Dashboard button URLs:', results); } catch (_e) {}
        if (results[0]) setDashboardBtn1Url(results[0]);
        if (results[1]) setDashboardBtn2Url(results[1]);
      } catch (e) {
        // ignore failures; local assets will be used
      }
    }
    loadButtons();
    return () => { mounted = false; };
  }, []);

  // Listen for project updates emitted from ProjectDetails (or other screens)
  React.useEffect(() => {
    const unsub = onProjectUpdated((updatedProject) => {
      try {
        if (!updatedProject || !updatedProject.id) return;
        setHierarchy((prev) => {
            const walk = (nodes) => {
            const next = (nodes || []).map((n) => {
              if (!n) return n;
              if (n.type === 'project' && String(n.id) === String(updatedProject.id)) {
                return Object.assign({}, n, updatedProject);
              }
              if (Array.isArray(n.children) && n.children.length > 0) {
                const newChildren = walk(n.children);
                if (newChildren !== n.children) {
                  return Object.assign({}, n, { children: newChildren });
                }
              }
              return n;
            });
            return next;
          };
          const newHierarchy = walk(prev || []);
          try { hierarchyRef.current = newHierarchy; } catch (_e) {}
          return newHierarchy;
        });

        setSelectedProject((prev) => (prev && String(prev.id) === String(updatedProject.id) ? Object.assign({}, prev, updatedProject) : prev));
      } catch (e) {
        console.warn('onProjectUpdated handler error', e);
      }
    });
    return () => { try { if (typeof unsub === 'function') unsub(); } catch(_) {} };
  }, []);

  const toggleDashboardFocus = (key, anchor, top) => {
    if (!key) return;
    console.log && console.log('toggleDashboardFocus called', { key, anchor, top, current: dashboardFocus });
    if (anchor) {
      setDashboardDropdownAnchor(anchor);
    }
    // If opening, set top immediately to avoid race on positioning
    if (typeof top === 'number') {
      setDashboardDropdownTop(top);
    } else if (dashboardFocus === key) {
      // closing
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
      setDashboardDropdownRowKey(null);
    }
    setDashboardFocus((prev) => (prev === key ? null : key));
  };

  // Keep ref in sync for popstate handler
  React.useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  // Close dashboard dropdowns when navigating into a project (avoid leaving overlays open)
  React.useEffect(() => {
    try {
      // Clear dropdown focus whenever selectedProject changes (entering or leaving a project)
      setDashboardFocus(null);
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
    } catch (e) {}
  }, [selectedProject]);

  const handleInlineLockChange = React.useCallback((locked) => {
    setIsInlineLocked(!!locked);
  }, []);

  const requestProjectSwitch = React.useCallback((project, opts = {}) => {
    if (!project) {
      if (Object.prototype.hasOwnProperty.call(opts, 'selectedAction')) {
        setProjectSelectedAction(opts.selectedAction);
      }
      try { setSelectedProjectPath(null); } catch (_e) {}
      setSelectedProject(null);
      return;
    }

    const nextProject = { ...project };
    const selectedActionProvided = Object.prototype.hasOwnProperty.call(opts, 'selectedAction');
    const clearActionAfter = !!opts.clearActionAfter;

    if (Platform.OS === 'web' && isInlineLocked) {
      pendingProjectSwitchRef.current = {
        project: nextProject,
        selectedAction: selectedActionProvided ? opts.selectedAction : null,
        clearActionAfter,
      };
      try {
        window.dispatchEvent(new CustomEvent('dkInlineAttemptExit'));
      } catch(_e) {
        // Fallback: if event dispatch fails, proceed immediately.
        if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
        try {
          const p = opts?.path;
          setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
        } catch (_e2) {}
        setSelectedProject(nextProject);
        if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
      }
      return;
    }

    if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
    try {
      const p = opts?.path;
      setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
    } catch (_e) {}
    setSelectedProject(nextProject);
    if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
  }, [isInlineLocked]);

  const handleInlineViewChange = React.useCallback((payload) => {
    try {
      if (!payload) {
        setProjectInlineViewLabel(null);
        return;
      }
      if (typeof payload === 'string') {
        const v = String(payload || '').trim();
        setProjectInlineViewLabel(v || null);
        return;
      }
      const label = String(payload?.label || '').trim();
      setProjectInlineViewLabel(label || null);
    } catch (_e) {
      try { setProjectInlineViewLabel(null); } catch (__e) {}
    }
  }, []);

  React.useEffect(() => {
    // Clear leaf when leaving project or switching to template-inline editor.
    if (!selectedProject) {
      setProjectInlineViewLabel(null);
      return;
    }
    if (inlineControlEditor) {
      setProjectInlineViewLabel(null);
    }
  }, [selectedProject, inlineControlEditor]);

  const findProjectPathById = React.useCallback((projectId) => {
    if (!projectId) return null;
    const targetId = String(projectId);
    try {
      const tree = hierarchyRef.current || [];
      const isProjectNode = (node) => {
        try {
          if (!node) return false;
          const t = String(node?.type || node?.kind || node?.nodeType || '').toLowerCase();
          if (t) return t === 'project';
          // fallback: looks like a project (id + name) and isn't a folder with children
          if (node.id == null) return false;
          if (typeof node.name !== 'string') return false;
          if (Array.isArray(node.children)) return false;
          return true;
        } catch (_e) {
          return false;
        }
      };

      for (const main of tree) {
        for (const sub of (main?.children || [])) {
          const proj = (sub?.children || []).find((ch) => ch && String(ch.id) === targetId && isProjectNode(ch));
          if (proj) return { main, sub, project: proj };
        }
      }
    } catch (_e) {}
    return null;
  }, []);

  const applyBreadcrumbTarget = React.useCallback((target) => {
    const t = target || {};
    const kind = String(t.kind || '').trim();

    const setTree = (updater) => {
      try { setHierarchy((prev) => updater(prev)); } catch (_e) {}
    };

    const closeProjectAndInline = () => {
      try { setInlineControlEditor(null); } catch (_e) {}
      try { setProjectSelectedAction(null); } catch (_e) {}
      try { setSelectedProjectPath(null); } catch (_e) {}
      try { setSelectedProject(null); } catch (_e) {}
    };

    if (kind === 'dashboard') {
      closeProjectAndInline();
      setTree((prev) => collapseHierarchy(prev));
      return;
    }

    if (kind === 'projectHome') {
      // Stay in the current project but close any inline control view.
      try { setInlineControlEditor(null); } catch (_e) {}
      try {
        setProjectSelectedAction({ id: `closeInline:${Date.now()}`, kind: 'closeInline' });
        setTimeout(() => {
          try { setProjectSelectedAction(null); } catch (_e2) {}
        }, 0);
      } catch (_e) {}
      return;
    }

    if (kind === 'main') {
      const mainId = String(t.mainId || '');
      closeProjectAndInline();
      if (!mainId) return;
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === mainId,
        children: Array.isArray(m.children) ? m.children.map((s) => ({ ...s, expanded: false })) : [],
      })) : prev));
      return;
    }

    if (kind === 'sub') {
      const mainId = String(t.mainId || '');
      const subId = String(t.subId || '');
      closeProjectAndInline();
      if (!mainId || !subId) return;
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === mainId,
        children: Array.isArray(m.children) ? m.children.map((s) => ({
          ...s,
          expanded: String(m.id) === mainId && String(s.id) === subId,
        })) : [],
      })) : prev));
      return;
    }

    if (kind === 'project') {
      const projectId = String(t.projectId || '');
      if (!projectId) return;
      const path = findProjectPathById(projectId);
      if (!path || !path.project) return;

      // Ensure left tree reflects the path
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === String(path.main?.id),
        children: Array.isArray(m.children) ? m.children.map((s) => ({
          ...s,
          expanded: String(m.id) === String(path.main?.id) && String(s.id) === String(path.sub?.id),
        })) : [],
      })) : prev));

      try { setInlineControlEditor(null); } catch (_e) {}
      try { setProjectSelectedAction(null); } catch (_e) {}
      try {
        setSelectedProjectPath({
          mainId: String(path.main?.id || ''),
          subId: String(path.sub?.id || ''),
          mainName: String(path.main?.name || ''),
          subName: String(path.sub?.name || ''),
          projectId,
        });
      } catch (_e) {}
      try { setSelectedProject({ ...path.project }); } catch (_e) {}
    }
  }, [findProjectPathById]);

  const navigateViaBreadcrumb = React.useCallback((target) => {
    // If an inline form is open/locked, route through exit-confirm first.
    if (Platform.OS === 'web' && isInlineLocked) {
      pendingBreadcrumbNavRef.current = target;
      try {
        window.dispatchEvent(new CustomEvent('dkInlineAttemptExit', { detail: { reason: 'breadcrumb' } }));
      } catch (_e) {
        // If event dispatch fails, navigate immediately.
        pendingBreadcrumbNavRef.current = null;
        applyBreadcrumbTarget(target);
      }
      return;
    }
    applyBreadcrumbTarget(target);
  }, [applyBreadcrumbTarget, isInlineLocked]);

  // Allow the global header breadcrumb (App.js) to drive navigation inside Home.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onNav = (event) => {
      try {
        const target = event?.detail?.target ?? event?.detail;
        if (!target) return;
        navigateViaBreadcrumb(target);
      } catch (_e) {}
    };

    try { window.addEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    return () => {
      try { window.removeEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    };
  }, [navigateViaBreadcrumb]);

  // Publish the current Home breadcrumb (Dashboard / main / sub / project / control) for the global header.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    try {
      const selectedProjectId = selectedProject?.id ? String(selectedProject.id) : null;

      const resolveFolderLabel = (node, fallback) => {
        try {
          const text = String(node?.name || node?.title || node?.label || '').trim();
          if (text) return text;
          const idText = String(node?.id || '').trim();
          return idText || fallback;
        } catch (_e) {
          return fallback;
        }
      };

      // Prefer deriving main/sub from the selected project's actual path
      // (or from the explicit click-path when selecting in the tree), so breadcrumb
      // stays correct even if the tree UI isn't expanded.
      let path = null;
      try {
        if (selectedProjectId && selectedProjectPath?.mainId && selectedProjectPath?.subId) {
          const main = (hierarchy || []).find((m) => m && String(m.id) === String(selectedProjectPath.mainId)) || null;
          const sub = main && Array.isArray(main.children)
            ? (main.children || []).find((s) => s && String(s.id) === String(selectedProjectPath.subId))
            : null;
          path = {
            main: main || { id: selectedProjectPath.mainId, name: selectedProjectPath.mainName || '' },
            sub: sub || { id: selectedProjectPath.subId, name: selectedProjectPath.subName || '' },
            project: null,
          };
        }
      } catch (_e) { path = null; }
      try {
        if (!path && selectedProjectId) path = findProjectPathById(selectedProjectId);
      } catch (_e) { /* ignore */ }

      const expandedMain = (path && path.main) ? path.main : (hierarchy || []).find((m) => m && m.expanded);
      const expandedSub = (path && path.sub)
        ? path.sub
        : (expandedMain && Array.isArray(expandedMain.children)
          ? expandedMain.children.find((s) => s && s.expanded)
          : null);

      const projectId = selectedProjectId;
      const projectLabel = selectedProject
        ? `${String(selectedProject?.id || '').trim()} — ${String(selectedProject?.name || '').trim()}`.trim().replace(/^—\s*/, '')
        : '';

      const leafLabel = inlineControlEditor && inlineControlEditor.controlType
        ? String(inlineControlEditor.controlType).trim()
        : (projectInlineViewLabel ? String(projectInlineViewLabel).trim() : '');

      const segments = [];
      segments.push({ label: 'Startsida', target: { kind: 'dashboard' } });
      if (expandedMain) segments.push({ label: resolveFolderLabel(expandedMain, 'Huvudmapp'), target: { kind: 'main', mainId: expandedMain.id } });
      if (expandedMain && expandedSub) segments.push({ label: resolveFolderLabel(expandedSub, 'Undermapp'), target: { kind: 'sub', mainId: expandedMain.id, subId: expandedSub.id } });
      if (projectId) segments.push({ label: projectLabel || 'Projekt', target: { kind: 'project', projectId } });
      if (projectId && leafLabel) segments.push({ label: leafLabel, target: { kind: 'noop' } });

      // Cache latest segments so the global header can read immediately on mount,
      // even if it missed the first event or CustomEvent isn't supported.
      try { window.__dkBreadcrumbHomeSegments = segments; } catch (_e) {}

      try {
        const detail = { scope: 'home', segments };
        const evt = (typeof CustomEvent === 'function')
          ? new CustomEvent('dkBreadcrumbUpdate', { detail })
          : (() => {
            const e = document.createEvent('Event');
            e.initEvent('dkBreadcrumbUpdate', true, true);
            e.detail = detail;
            return e;
          })();
        window.dispatchEvent(evt);
      } catch (_e) {}
    } catch (_e) {}
  }, [hierarchy, selectedProject, selectedProjectPath, projectInlineViewLabel, inlineControlEditor, findProjectPathById]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onDecision = (event) => {
      const decision = event?.detail?.decision;
      const pendingSwitch = pendingProjectSwitchRef.current;
      pendingProjectSwitchRef.current = null;

      const pendingBreadcrumb = pendingBreadcrumbNavRef.current;
      pendingBreadcrumbNavRef.current = null;

      if (decision !== 'draft' && decision !== 'abort') return;

      if (pendingSwitch && pendingSwitch.project) {
        try { setProjectSelectedAction(pendingSwitch.selectedAction ?? null); } catch(_e) {}
        setSelectedProject({ ...pendingSwitch.project });
        if (pendingSwitch.clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
      }

      if (pendingBreadcrumb) {
        applyBreadcrumbTarget(pendingBreadcrumb);
      }
    };

    window.addEventListener('dkInlineExitDecision', onDecision);
    return () => {
      try { window.removeEventListener('dkInlineExitDecision', onDecision); } catch(_e) {}
    };
  }, []);

  const findProjectById = React.useCallback((projectId) => {
    if (!projectId) return null;
    const targetId = String(projectId);
    try {
      const tree = hierarchyRef.current || [];
      for (const main of tree) {
        for (const sub of (main.children || [])) {
          for (const child of (sub.children || [])) {
            if (child && child.type === 'project' && String(child.id) === targetId) return child;
          }
        }
      }
    } catch(_e) {}
    return null;
  }, []);

  const toTsMs = React.useCallback((value) => {
    try {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      if (typeof value === 'string') return new Date(value).getTime() || 0;
      if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
      if (typeof value?.seconds === 'number') return (value.seconds * 1000) + (typeof value.nanoseconds === 'number' ? Math.floor(value.nanoseconds / 1e6) : 0);
      return new Date(value).getTime() || 0;
    } catch(_e) {
      return 0;
    }
  }, []);

  const formatRelativeTime = React.useCallback((isoLike) => {
    try {
      const t = toTsMs(isoLike);
      if (!t) return '';
      const diffMs = Date.now() - t;
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      if (diffSec < 60) return 'för nyss';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `för ${diffMin} minut${diffMin === 1 ? '' : 'er'} sedan`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `för ${diffH} tim${diffH === 1 ? 'me' : 'mar'} sedan`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `för ${diffD} dag${diffD === 1 ? '' : 'ar'} sedan`;
      return new Date(t).toLocaleDateString('sv-SE');
    } catch(_e) {
      return '';
    }
  }, [toTsMs]);

  const computeOpenDeviationsCount = React.useCallback((controls) => {
    try {
      let open = 0;
      for (const item of (controls || [])) {
        if (!item || item.type !== 'Skyddsrond') continue;
        // Saved controls may use different shapes over time:
        // - Newer: item.checklist (array of sections) with section.remediation keyed by point text
        // - Older: item.checklistSections with section.remediation indexed by point index
        const sections = Array.isArray(item.checklistSections)
          ? item.checklistSections
          : (Array.isArray(item.checklist) ? item.checklist : null);
        if (!Array.isArray(sections)) continue;
        for (const section of sections) {
          if (!section || !Array.isArray(section.statuses)) continue;
          section.statuses.forEach((status, idx) => {
            if (status !== 'avvikelse') return;
            const points = Array.isArray(section.points) ? section.points : [];
            const pt = points[idx];
            const rem = section.remediation
              ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[idx]
              : null;
            const handled = !!rem;
            if (!handled) open += 1;
          });
        }
      }
      return open;
    } catch(_e) {
      return 0;
    }
  }, []);

  const computeControlsToSign = React.useCallback((drafts) => {
    try {
      let count = 0;
      for (const item of (drafts || [])) {
        if (!item) continue;
        const type = String(item.type || '');
        if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') continue;
        const sigs = item.mottagningsSignatures;
        if (!Array.isArray(sigs) || sigs.length === 0) count++;
      }
      return count;
    } catch(_e) {
      return 0;
    }
  }, []);

  const countActiveProjects = React.useCallback(() => {
    try {
      let active = 0;
      const tree = hierarchyRef.current || [];
      for (const main of tree) {
        for (const sub of (main.children || [])) {
          for (const child of (sub.children || [])) {
            if (child && child.type === 'project') {
              const status = child.status || 'ongoing';
              if (status !== 'completed') active++;
            }
          }
        }
      }
      return active;
    } catch(_e) {
      return 0;
    }
  }, []);

  const loadDashboard = React.useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [draftRaw, completedRaw] = await Promise.all([
        AsyncStorage.getItem('draft_controls'),
        AsyncStorage.getItem('completed_controls'),
      ]);
      const drafts = draftRaw ? (JSON.parse(draftRaw) || []) : [];
      const completed = completedRaw ? (JSON.parse(completedRaw) || []) : [];

      // Important: draft/completed controls are stored locally without company-scoping.
      // Filter them to only include projects that exist in the current company's hierarchy.
      const allowedProjectIds = new Set();
      try {
        const tree = hierarchyRef.current || [];
        for (const main of tree) {
          for (const sub of (main.children || [])) {
            for (const child of (sub.children || [])) {
              if (child && child.type === 'project' && child.id) allowedProjectIds.add(String(child.id));
            }
          }
        }
      } catch(_e) {}

      const pickProjectId = (item) => {
        const pid = item?.project?.id || item?.projectId || item?.project || null;
        return pid ? String(pid) : null;
      };

      const filteredDrafts = (drafts || []).filter((d) => {
        const pid = pickProjectId(d);
        return pid && allowedProjectIds.has(pid);
      });
      const filteredCompleted = (completed || []).filter((c) => {
        const pid = pickProjectId(c);
        return pid && allowedProjectIds.has(pid);
      });

      // Store lists for dashboard drill-down
      try { setDashboardDraftItems(Array.isArray(filteredDrafts) ? filteredDrafts : []); } catch(_e) {}

      try {
        const activeList = [];
        const tree = hierarchyRef.current || [];
        for (const main of tree) {
          for (const sub of (main.children || [])) {
            for (const child of (sub.children || [])) {
              if (!child || child.type !== 'project') continue;
              const status = child.status || 'ongoing';
              if (status === 'completed') continue;
              activeList.push(child);
            }
          }
        }
        setDashboardActiveProjectsList(activeList);
      } catch(_e) {
        try { setDashboardActiveProjectsList([]); } catch(_e) {}
      }

      try {
        const needSign = (filteredDrafts || []).filter((item) => {
          if (!item) return false;
          const type = String(item.type || '');
          if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') return false;
          const sigs = item.mottagningsSignatures;
          return !Array.isArray(sigs) || sigs.length === 0;
        });
        setDashboardControlsToSignItems(needSign);
      } catch(_e) {
        try { setDashboardControlsToSignItems([]); } catch(_e) {}
      }

      const activeProjects = countActiveProjects();
      const openDeviations = computeOpenDeviationsCount(filteredCompleted);
      const controlsToSign = computeControlsToSign(filteredDrafts);

      // Skyddsrond interval reminders (default: 14 days)
      const MS_DAY = 24 * 60 * 60 * 1000;
      const NOW = Date.now();
      const SOON_THRESHOLD_DAYS = 3;
      const lastSkyddsrondByProject = new Map();
      try {
        (filteredCompleted || []).forEach((c) => {
          if (!c || c.type !== 'Skyddsrond') return;
          const pid = pickProjectId(c);
          if (!pid) return;
          const ts = toTsMs(c.date || c.savedAt || c.updatedAt || c.createdAt || null);
          if (!ts) return;
          const prev = lastSkyddsrondByProject.get(pid) || 0;
          if (ts > prev) lastSkyddsrondByProject.set(pid, ts);
        });
      } catch(_e) {}

      let skyddsrondOverdue = 0;
      let skyddsrondDueSoon = 0;
      const upcomingSkyddsrond = [];
      try {
        const tree = hierarchyRef.current || [];
        for (const main of tree) {
          for (const sub of (main.children || [])) {
            for (const child of (sub.children || [])) {
              if (!child || child.type !== 'project' || !child.id) continue;
              const status = child.status || 'ongoing';
              if (status === 'completed') continue;

              const pid = String(child.id);
              const enabled = child.skyddsrondEnabled !== false;
              if (!enabled) continue;

              const intervalWeeksRaw = Number(child.skyddsrondIntervalWeeks);
              const intervalDaysRaw = Number(child.skyddsrondIntervalDays);
              const intervalDays = (Number.isFinite(intervalWeeksRaw) && intervalWeeksRaw > 0)
                ? (intervalWeeksRaw * 7)
                : (Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0 ? intervalDaysRaw : 14);

              const lastMs = lastSkyddsrondByProject.get(pid) || 0;
              const firstDueMs = toTsMs(child.skyddsrondFirstDueDate || null);
              const baselineMs = lastMs || toTsMs(child.createdAt || null) || NOW;
              const nextDueMs = lastMs
                ? (baselineMs + intervalDays * MS_DAY)
                : (firstDueMs || (baselineMs + intervalDays * MS_DAY));

              if (NOW > nextDueMs) {
                skyddsrondOverdue += 1;
                upcomingSkyddsrond.push({ project: child, nextDueMs, state: 'overdue' });
              } else if ((nextDueMs - NOW) <= (SOON_THRESHOLD_DAYS * MS_DAY)) {
                skyddsrondDueSoon += 1;
                upcomingSkyddsrond.push({ project: child, nextDueMs, state: 'dueSoon' });
              }
            }
          }
        }
      } catch(_e) {}

      try {
        upcomingSkyddsrond.sort((a, b) => Number(a?.nextDueMs || 0) - Number(b?.nextDueMs || 0));
        setDashboardUpcomingSkyddsrondItems(upcomingSkyddsrond);
      } catch(_e) {
        try { setDashboardUpcomingSkyddsrondItems([]); } catch(_e) {}
      }

      const countOpenDeviationsForControl = (control) => {
        try {
          if (!control || control.type !== 'Skyddsrond') return 0;
          const sections = Array.isArray(control.checklistSections)
            ? control.checklistSections
            : (Array.isArray(control.checklist) ? control.checklist : null);
          if (!Array.isArray(sections)) return 0;
          let open = 0;
          for (const section of sections) {
            if (!section || !Array.isArray(section.statuses)) continue;
            const points = Array.isArray(section.points) ? section.points : [];
            for (let i = 0; i < section.statuses.length; i++) {
              if (section.statuses[i] !== 'avvikelse') continue;
              const pt = points[i];
              const rem = section.remediation
                ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[i]
                : null;
              if (!rem) open += 1;
            }
          }
          return open;
        } catch(_e) {
          return 0;
        }
      };

      try {
        const openDevItems = (filteredCompleted || [])
          .filter((c) => c && c.type === 'Skyddsrond')
          .map((c) => ({ control: c, openCount: countOpenDeviationsForControl(c) }))
          .filter((x) => (x.openCount || 0) > 0);
        setDashboardOpenDeviationItems(openDevItems);
      } catch(_e) {
        try { setDashboardOpenDeviationItems([]); } catch(_e) {}
      }

      const recent = [];
      const pushRecent = (item, kind) => {
        if (!item || typeof item !== 'object') return;
        const ts = item.savedAt || item.updatedAt || item.createdAt || item.date || null;
        const projectId = pickProjectId(item);
        if (!projectId) return;
        // Only show activity for projects we know belong to this company.
        if (!allowedProjectIds.has(projectId)) return;
        const projObj = findProjectById(projectId);
        if (!projObj) return;
        const projectName = projObj?.name || null;
        const desc = String(item.deliveryDesc || item.materialDesc || item.generalNote || item.description || '').trim();
        // Try to enrich with actor info from companyActivity if available
        let actorName = null;
        let actorEmail = null;
        let actorUid = null;
        try {
          if (Array.isArray(companyActivity) && companyActivity.length > 0) {
            // find an activity event matching this project + type and close timestamp
            const approxTs = toTsMs(ts || 0);
            const match = companyActivity.find(ev => {
              try {
                const evProj = ev.projectId || (ev.project && ev.project.id) || null;
                if (!evProj || String(evProj) !== String(projectId)) return false;
                const evType = String(ev.type || ev.eventType || ev.kind || '').toLowerCase();
                const itType = String(item.type || kind || '').toLowerCase();
                if (itType && evType && evType !== itType) {
                  // allow drafts/completed to map to same type name
                }
                const evTs = toTsMs(ev.ts || ev.createdAt || ev.updatedAt || 0);
                if (approxTs && evTs) {
                  const diff = Math.abs(approxTs - evTs);
                  if (diff > 120000) return false; // require within 2 minutes
                }
                return true;
              } catch(_e) { return false; }
            });
            if (match) {
              actorName = match.actorName || match.displayName || match.actor || null;
              actorEmail = match.actorEmail || match.email || null;
              actorUid = match.uid || null;
            }
          }
        } catch(_e) {}
        // Fallbacks: check item/raw for createdBy/author fields
        try {
          if (!actorName) {
            const raw = item.raw || item.payload || item || {};
            // common shapes: createdBy: { uid, email, displayName } or createdBy: 'email' or createdBy: uid
            const cb = raw.createdBy || raw.creator || raw.author || raw.createdByUid || raw.createdById || null;
            if (cb) {
              if (typeof cb === 'string') {
                // Could be email or uid
                actorEmail = actorEmail || (cb.includes('@') ? cb : actorEmail);
                actorUid = actorUid || (cb.includes('@') ? actorUid : cb);
                actorName = actorName || null;
              } else if (typeof cb === 'object') {
                actorName = actorName || cb.displayName || cb.name || cb.fullName || null;
                actorEmail = actorEmail || cb.email || cb.mail || null;
                actorUid = actorUid || cb.uid || cb.id || null;
              }
            }
            // other ad-hoc fields
            actorName = actorName || raw.actorName || raw.actor || raw.username || raw.userName || raw.userDisplayName || null;
            actorEmail = actorEmail || raw.actorEmail || raw.email || null;
            actorUid = actorUid || raw.uid || raw.userId || raw.userUID || null;
          }
        } catch(_e) {}

        recent.push({
          kind,
          type: item.type || kind,
          ts,
          projectId,
          projectName,
          desc,
          openDeviationsCount: (kind === 'completed' && item.type === 'Skyddsrond') ? countOpenDeviationsForControl(item) : 0,
          actorName: actorName || null,
          actorEmail: actorEmail || null,
          uid: actorUid || null,
          raw: item,
        });
      };
      (filteredCompleted || []).forEach((c) => pushRecent(c, 'completed'));
      (filteredDrafts || []).forEach((d) => pushRecent(d, 'draft'));

      // Merge in company activity (e.g. login events and control-related events).
      try {
        const events = Array.isArray(companyActivity) ? companyActivity : [];
        // Add login events (deduped by identity)
        try {
          const loginEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() === 'login').slice().sort((a, b) => {
            const ta = toTsMs(a.ts || a.createdAt || a.updatedAt || 0);
            const tb = toTsMs(b.ts || b.createdAt || b.updatedAt || 0);
            return tb - ta;
          });
          const seen = new Set();
          for (const ev of loginEvents) {
            if (!ev || typeof ev !== 'object') continue;
            const idKey = String(ev.uid || ev.email || ev.displayName || '').trim().toLowerCase();
            const key = idKey || '__noid';
            if (seen.has(key)) continue;
            seen.add(key);
            const who = formatPersonName(ev.displayName || ev.email || ev.uid || '');
            recent.push({
              kind: 'company',
              type: 'login',
              ts: ev.ts || ev.createdAt || ev.updatedAt || null,
              projectId: null,
              projectName: null,
              desc: who ? `Loggade in: ${who}` : 'Loggade in',
              actorName: ev.displayName || null,
              actorEmail: ev.email || null,
              uid: ev.uid || null,
              raw: ev,
            });
          }
        } catch(_e) {}

        // Add other company events (drafts, completed controls, etc.) so actor info is visible
        try {
          const otherEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() !== 'login');
          for (const ev of otherEvents) {
            try {
              const t = ev.type || ev.eventType || ev.kind || null;
              const ts = ev.ts || ev.createdAt || ev.updatedAt || null;
              const projectId = ev.projectId || (ev.project && ev.project.id) || null;
              const projectName = ev.projectName || (ev.project && ev.project.name) || null;
              const desc = ev.label || ev.message || ev.msg || '';
              recent.push({
                kind: ev.kind || 'company',
                type: t,
                ts,
                projectId,
                projectName,
                desc,
                actorName: ev.actorName || ev.displayName || null,
                actorEmail: ev.actorEmail || ev.email || null,
                uid: ev.uid || null,
                raw: ev,
              });
            } catch(_e) {}
          }
        } catch(_e) {}
      } catch(_e) {}
      recent.sort((a, b) => {
        return toTsMs(b.ts) - toTsMs(a.ts);
      });
      const top = recent.slice(0, 8);

      // Derive recent projects from recent activity (unique by projectId)
      const projMap = new Map();
      for (const r of recent) {
        if (!r.projectId) continue;
        const prev = projMap.get(r.projectId);
        const t = toTsMs(r.ts);
        if (!prev || t > prev.ts) projMap.set(r.projectId, { ts: t });
      }
      const recentProjects = Array.from(projMap.entries())
        .map(([projectId, meta]) => {
          const p = findProjectById(projectId);
          return p ? { project: p, projectId: String(projectId), ts: meta.ts } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 8);

      setDashboardOverview({
        activeProjects,
        openDeviations,
        skyddsrondOverdue,
        skyddsrondDueSoon,
        controlsToSign,
        drafts: Array.isArray(filteredDrafts) ? filteredDrafts.length : 0,
      });
      setDashboardRecent(top);
      setDashboardRecentProjects(recentProjects);
    } catch(_e) {
      setDashboardOverview({ activeProjects: 0, openDeviations: 0, skyddsrondOverdue: 0, skyddsrondDueSoon: 0, controlsToSign: 0, drafts: 0 });
      setDashboardRecent([]);
      setDashboardRecentProjects([]);
    } finally {
      setDashboardLoading(false);
    }
  }, [companyActivity, countActiveProjects, computeControlsToSign, computeOpenDeviationsCount, findProjectById, toTsMs]);

  // Web: keep browser back/forward in sync with selectedProject
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history) return;

    // Ensure we have a stable "home" state
    try {
      const st = window.history.state || {};
      if (!st.dkView) window.history.replaceState({ ...st, dkView: 'home' }, '');
    } catch(_e) {}

    const onPopState = (e) => {
      try {
        const st = e?.state || window.history.state || {};
        if (st && st.dkView === 'project' && st.projectId) {
          const proj = findProjectById(st.projectId);
          // Clear any pending dashboard action when navigating with browser back/forward.
          setProjectSelectedAction(null);
          try { setSelectedProjectPath(null); } catch (_e) {}
          if (proj) setSelectedProject({ ...proj });
          else setSelectedProject(null);
        } else {
          setProjectSelectedAction(null);
          try { setSelectedProjectPath(null); } catch (_e) {}
          setSelectedProject(null);
        }
      } catch(_e) {
        setProjectSelectedAction(null);
        try { setSelectedProjectPath(null); } catch (_e2) {}
        setSelectedProject(null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      try { window.removeEventListener('popstate', onPopState); } catch(_e) {}
    };
  }, [findProjectById]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history || typeof window.history.pushState !== 'function') return;

    const proj = selectedProject;
    if (proj && proj.id) {
      try {
        const st = window.history.state || {};
        // Avoid pushing duplicates
        if (st.dkView === 'project' && String(st.projectId || '') === String(proj.id)) return;
        window.history.pushState({ ...st, dkView: 'project', projectId: String(proj.id) }, '');
      } catch(_e) {}
    }
  }, [selectedProject]);

  const closeSelectedProject = React.useCallback(() => {
    // UX requirement: the in-app back button should always leave the project
    // and return to the dashboard (not the previously opened project).
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const st = window.history.state || {};
        window.history.replaceState({ ...st, dkView: 'home', projectId: null }, '');
      } catch(_e) {}
    }
    setProjectSelectedAction(null);
    try { setSelectedProjectPath(null); } catch (_e) {}
    setSelectedProject(null);
  }, []);

  const openInlineControlEditor = React.useCallback((project, controlType, templateId = null) => {
    if (!project || !controlType) return;
    try { setSelectedProjectPath(null); } catch (_e) {}
    setSelectedProject(project);
    setInlineControlEditor({ project, controlType, templateId });
    setProjectSelectedAction(null);
  }, []);

  const closeInlineControlEditor = React.useCallback(() => {
    setInlineControlEditor(null);
  }, []);

  const handleInlineControlFinished = React.useCallback(() => {
    try {
      showAlert('Sparad', 'Kontrollen är sparad.');
    } catch(_e) {}
    setInlineControlEditor(null);
    setProjectControlsRefreshNonce((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Refresh dashboard when returning to start panel or after sync/hierarchy changes.
    if (!selectedProject) loadDashboard();
  }, [selectedProject, syncStatus, hierarchy, companyActivity, loadDashboard]);

  // Realtime company activity feed (company-scoped).
  React.useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    if (!cid) return;
    const unsub = subscribeCompanyActivity(cid, {
      limitCount: 25,
      onData: (items) => {
        try { setCompanyActivity(Array.isArray(items) ? items : []); } catch(_e) {}
      },
      onError: () => {},
    });
    return () => {
      try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
    };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Log a login event (throttled) so other users can see who logs in.
  React.useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    const user = auth?.currentUser;
    if (!cid) return;
    if (!user?.uid && !user?.email) return;

    let cancelled = false;
    (async () => {
      try {
        const idPart = user?.uid || user?.email || 'unknown';
        const throttleKey = `dk_last_login_activity:${cid}:${idPart}`;
        const last = await AsyncStorage.getItem(throttleKey);
        if (last) {
          const lastMs = new Date(last).getTime() || 0;
          if (lastMs && (Date.now() - lastMs) < 5 * 60 * 1000) return;
        }
        const ok = await logCompanyActivity({
          type: 'login',
          uid: user?.uid || null,
          email: user?.email || null,
          displayName: user?.displayName || null,
        }, cid);
        if (!ok) return;
        if (cancelled) return;
        await AsyncStorage.setItem(throttleKey, new Date().toISOString());
      } catch(_e) {}
    })();

    return () => { cancelled = true; };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Ensure current user is written to the company members directory (so admin dropdown works)
  React.useEffect(() => {
    if (!companyId) return;
    if (!auth?.currentUser?.uid) return;
    // Inline the upsert to avoid any scope issues on native/web builds.
    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user?.uid) return;
        const profile = await fetchUserProfile(user.uid).catch((e) => null);
        const displayName = profile?.displayName || profile?.name || (user.email ? String(user.email).split('@')[0] : null);
        const role = profile?.role || null;
        await upsertCompanyMember({
          companyId: routeCompanyId || null,
          uid: user.uid,
          displayName,
          email: user.email || null,
          role,
        });
      } catch(_e) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, auth?.currentUser?.uid]);

  // Keep ref in sync for early-defined helpers/modals
  React.useEffect(() => {
    hierarchyRef.current = hierarchy;
  }, [hierarchy]);

  // Company profile (used for per-company feature visibility)
  const [companyProfile, setCompanyProfile] = useState(null);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);

  // Load full control type list (default + company-specific) for the active company
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
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

  const controlTypeOptions = React.useMemo(() => {
    const baseList = Array.isArray(controlTypes) && controlTypes.length > 0
      ? controlTypes
      : DEFAULT_CONTROL_TYPES;

    // If we have any custom (non-builtin) control types, we treat the
    // per-company list as the source of truth and ignore the older
    // enabledControlTypes filter from the company profile.
    const hasCustomTypes = baseList.some(ct => ct && ct.builtin === false);

    let visible = baseList.filter(ct => ct && ct.hidden !== true);

    const enabled = companyProfile?.enabledControlTypes;
    if (!hasCustomTypes && Array.isArray(enabled) && enabled.length > 0) {
      const enabledSet = new Set(enabled.map(v => String(v || '').trim()).filter(Boolean));
      visible = visible.filter((ct) => {
        const name = String(ct.name || '').trim();
        const key = String(ct.key || '').trim();
        if (!enabledSet.size) return true;
        return (name && enabledSet.has(name)) || (key && enabledSet.has(key));
      });
    }

    return visible.map((ct) => ({
      type: ct.name || ct.key || '',
      icon: ct.icon || 'document-text-outline',
      color: ct.color || '#455A64',
    })).filter(o => o.type);
  }, [controlTypes, companyProfile]);

  // Load company profile when companyId changes
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch((e) => { /* ignore */ });
    return () => { active = false; };
  }, [companyId]);

  // Recompute whether any local fallback data exists (hierarki eller kontroller)
  async function refreshLocalFallbackFlag() {
    try {
      const [h, c, d] = await Promise.all([
        AsyncStorage.getItem('hierarchy_local'),
        AsyncStorage.getItem('completed_controls'),
        AsyncStorage.getItem('draft_controls'),
      ]);
      const exists = !!((h && h !== '[]') || (c && c !== '[]') || (d && d !== '[]'));
      setLocalFallbackExists(exists);
    } catch(_e) {}
  }
  
  // Debug helper: dump local AsyncStorage keys and compare with Firestore counts
  async function dumpLocalRemoteControls() {
    try {
      const keys = ['hierarchy_local', 'completed_controls', 'draft_controls', 'completed_controls_backup', 'draft_controls_backup'];
      const data = {};
      for (const k of keys) {
        try {
          const raw = await AsyncStorage.getItem(k);
          data[k] = raw ? JSON.parse(raw) : null;
        } catch(_e) { data[k] = null; }
      }
      // Build summary
      const summary = {
        completed_count: Array.isArray(data.completed_controls) ? data.completed_controls.length : 0,
        draft_count: Array.isArray(data.draft_controls) ? data.draft_controls.length : 0,
        backups: {
          completed_backup_exists: !!data.completed_controls_backup,
          draft_backup_exists: !!data.draft_controls_backup,
        },
      };

      // Query Firestore for any project IDs found in local completed controls
      const projectIds = new Set();
      (data.completed_controls || []).forEach(c => { if (c && c.project && c.project.id) projectIds.add(String(c.project.id)); });
      (data.draft_controls || []).forEach(d => { if (d && d.project && d.project.id) projectIds.add(String(d.project.id)); });

      const remoteInfo = {};
      for (const pid of projectIds) {
        try {
          const remote = await fetchControlsForProject(pid, companyId).catch((e) => []);
          remoteInfo[pid] = { remote_count: Array.isArray(remote) ? remote.length : 0, sample_ids: (remote || []).slice(0,5).map(r => r.id) };
        } catch(_e) {
          remoteInfo[pid] = { remote_count: -1, error: String(_e) };
        }
      }
      const final = { summary, remote: remoteInfo, sample_local_completed: (data.completed_controls || []).slice(0,5).map(c => ({ id: c.id, projectId: c.project?.id })) };
      try { console.log('[dumpLocalRemoteControls] full dump', final); } catch(_e) {}
      showAlert('Debug: lokal vs moln', JSON.stringify(final, null, 2).slice(0,1000));
    } catch(_e) {
      showAlert('Debug-fel', String(_e));
    }
  }

  // Show the last Firestore error saved by firebase helpers
  async function showLastFsError() {
    try {
      // Prefer the full errors array if available
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      if (rawArr) {
        let parsedArr = null;
          try { parsedArr = JSON.parse(rawArr); } catch(_e) { parsedArr = [rawArr]; }
        // Show the most recent entry first (arrays can get huge)
        const last = Array.isArray(parsedArr) ? parsedArr[parsedArr.length - 1] : parsedArr;
        return showAlert('Senaste FS-fel', JSON.stringify(last, null, 2).slice(0,2000));
      }
      // Fallback to single-entry key for older records
      const raw = await AsyncStorage.getItem('dk_last_fs_error');
      if (!raw) return showAlert('Senaste FS-fel', 'Ingen fel-logg hittades.');
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch(_e) { parsed = { raw }; }
      showAlert('Senaste FS-fel', JSON.stringify(parsed, null, 2).slice(0,2000));
    } catch(_e) {
      showAlert('Fel', 'Kunde inte läsa dk_last_fs_error: ' + (_e?.message || _e));
    }
  }
  

  // start background sync hook
  useBackgroundSync(companyId, { onStatus: (s) => setSyncStatus(s) });
  const didInitialLoadRef = React.useRef(false);
  const loadedHierarchyForCompanyRef = useRef(null);

  // Left column resizer state (default 320)
  const [leftWidth, setLeftWidth] = useState(320);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => { leftWidthRef.current = leftWidth; }, [leftWidth]);
  const initialLeftRef = useRef(0);

  // Right column resizer state (default 420)
  const [rightWidth, setRightWidth] = useState(420);
  const rightWidthRef = useRef(rightWidth);
  useEffect(() => { rightWidthRef.current = rightWidth; }, [rightWidth]);
  const initialRightRef = useRef(0);

  // PanResponder for resizing the left column (works on web + native)
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => true,
    onPanResponderGrant: () => {
      initialLeftRef.current = leftWidthRef.current;
    },
    onPanResponderMove: (evt, gestureState) => {
      const dx = gestureState.dx || 0;
      const newWidth = Math.max(240, Math.min(800, initialLeftRef.current + dx));
      setLeftWidth(newWidth);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  })).current;

  // PanResponder for resizing the right column (works on web + native)
  const panResponderRight = useRef(PanResponder.create({
    onStartShouldSetPanResponder: (evt, gestureState) => true,
    onPanResponderGrant: () => {
      initialRightRef.current = rightWidthRef.current;
    },
    onPanResponderMove: (evt, gestureState) => {
      const dx = gestureState.dx || 0;
      // Dragging the left edge: moving right (dx>0) should decrease width, moving left (dx<0) should increase
      const newWidth = Math.max(340, Math.min(520, initialRightRef.current - dx));
      setRightWidth(newWidth);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  })).current;

  // Ensure panes start at their minimum widths on web after first mount
  const initialPaneWidthsSetRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web' && !initialPaneWidthsSetRef.current) {
      setLeftWidth(240); // left min
      setRightWidth(340); // right min
      initialPaneWidthsSetRef.current = true;
    }
  }, []);


  // Ladda hierarchy från Firestore när vi har companyId (route/stored/claims).
  // Viktigt på web: claims kommer ofta in efter första render, så vi måste re-run.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      // Resolve company id robustly (order matters):
      // 1) explicit state/route
      // 2) persisted selection (dk_companyId)
      // 3) auth claims
      let cid = String(companyId || routeCompanyId || '').trim();

      if (!cid) {
        try {
          const stored = await AsyncStorage.getItem('dk_companyId');
          const storedTrim = String(stored || '').trim();
          if (storedTrim) {
            cid = storedTrim;
            try { setCompanyId(cid); } catch (_e) {}
          }
        } catch(_e) {}
      }

      // Legacy: try user profile by uid if present
      if (!cid && route?.params?.uid) {
        try {
          const userProfile = await fetchUserProfile(route.params.uid).catch(() => null);
          const profCid = String(userProfile?.companyId || '').trim();
          if (profCid) {
            cid = profCid;
            try { setCompanyId(cid); } catch (_e) {}
          }
        } catch(_e) {}
      }

      if (!cid) {
        const fromClaims = String(authClaims?.companyId || '').trim();
        if (fromClaims) {
          cid = fromClaims;
          try { setCompanyId(cid); } catch (_e) {}
        }
      }

      if (!cid) return;

      if (didInitialLoadRef.current && loadedHierarchyForCompanyRef.current === cid) return;
      loadedHierarchyForCompanyRef.current = cid;

      if (cancelled) return;
      setLoadingHierarchy(true);

      const items = await fetchHierarchy(cid).catch(() => null);
      if (cancelled) return;

      if (Array.isArray(items) && items.length > 0) {
        setHierarchy(collapseHierarchy(items));
      } else {
        // Firestore empty or failed — try local AsyncStorage fallback
        try {
          const raw = await AsyncStorage.getItem('hierarchy_local');
          if (raw) {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setHierarchy(collapseHierarchy(parsed));
              setLocalFallbackExists(true);
              // Try to push local fallback to Firestore (best-effort)
              try {
                const pushedRes = await saveHierarchy(cid, parsed);
                const pushed = pushedRes === true || (pushedRes && pushedRes.ok === true);
                if (pushed) {
                  try { await AsyncStorage.removeItem('hierarchy_local'); } catch(_e) {}
                  await refreshLocalFallbackFlag();
                } else {
                  try { console.error('[Home] push local fallback error', pushedRes && pushedRes.error ? pushedRes.error : pushedRes); } catch(_e) {}
                }
              } catch(_e) {}
            } else {
              setHierarchy([]);
            }
          } else {
            setHierarchy([]);
          }
        } catch(_e) {
          setHierarchy([]);
        }
      }

      setLoadingHierarchy(false);
      // mark that initial load completed to avoid initial empty save overwriting server
      didInitialLoadRef.current = true;
    })();

    return () => { cancelled = true; };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Visa migreringsknappen även om det finns lokala kontroller (completed/draft)
  React.useEffect(() => {
    (async () => {
      try {
        const completed = await AsyncStorage.getItem('completed_controls');
        const drafts = await AsyncStorage.getItem('draft_controls');
        if ((completed && completed !== '[]') || (drafts && drafts !== '[]')) {
          setLocalFallbackExists(true);
        }
      } catch(_e) {
        // ignore
      }
    })();
  }, []);

  // Spara hierarchy till Firestore varje gång den ändras (och companyId finns)
  React.useEffect(() => {
    if (!companyId) return;
    // don't save before initial load finished (avoid overwriting server with empty on mount)
    if (!didInitialLoadRef.current) return;
    (async () => {
      try {
        const res = await saveHierarchy(companyId, hierarchy);
        const ok = res === true || (res && res.ok === true);
        if (!ok) {
          // Firestore save failed — persist locally as fallback
          try {
            await AsyncStorage.setItem('hierarchy_local', JSON.stringify(hierarchy || []));
            setLocalFallbackExists(true);
          } catch(_e) {}
        } else {
          // On successful cloud save, also clear local fallback
            try {
            await AsyncStorage.removeItem('hierarchy_local');
            await refreshLocalFallbackFlag();
          } catch(_e) {}
        }
      } catch(_e) {
        try {
          await AsyncStorage.setItem('hierarchy_local', JSON.stringify(hierarchy || []));
          setLocalFallbackExists(true);
        } catch(_e) {}
      }
    })();
     
  }, [hierarchy, companyId]);

  // Remove all top-level folders named 'test' after initial load
  React.useEffect(() => {
    setHierarchy(prev => prev.filter(folder => folder.name.trim().toLowerCase() !== 'test'));
  }, []);
  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const openSearchModal = React.useCallback(() => {
    // Ensure the popup doesn't start "lifted" due to stale keyboard height
    setKeyboardHeight(0);
    setSearchModalVisible(true);
  }, []);

  const closeSearchModal = React.useCallback(() => {
    setSearchModalVisible(false);
    setSearchText('');
    setKeyboardHeight(0);
  }, []);

  // Header search dropdown (between logos): search among created projects in hierarchy
  const headerProjectQuery = String(route?.params?.headerProjectSearchText || '').trim();
  const headerSearchOpen = React.useMemo(() => {
    // default: open when there is a query; explicit false closes dropdown
    if (Object.prototype.hasOwnProperty.call(route?.params || {}, 'headerSearchOpen')) {
      return !!route.params.headerSearchOpen;
    }
    return !!headerProjectQuery;
  }, [route?.params, headerProjectQuery]);
  const headerSearchWidth = React.useMemo(() => {
    const w = Number(route?.params?.headerSearchWidth || 0);
    return Number.isFinite(w) && w > 0 ? w : null;
  }, [route?.params]);
  const headerSearchBottom = React.useMemo(() => {
    const b = Number(route?.params?.headerSearchBottom || 0);
    return Number.isFinite(b) && b > 0 ? b : 71;
  }, [route?.params]);
  const headerSearchLeft = React.useMemo(() => {
    const l = Number(route?.params?.headerSearchLeft || 0);
    return Number.isFinite(l) ? l : null;
  }, [route?.params]);
  const headerProjectMatches = React.useMemo(() => {
    if (!headerProjectQuery) return [];
    const q = headerProjectQuery.toLowerCase();
    const out = [];

    for (const main of (hierarchy || [])) {
      for (const sub of (main?.children || [])) {
        for (const child of (sub?.children || [])) {
          if (child?.type !== 'project') continue;
          const id = String(child?.id || '');
          const name = String(child?.name || '');
          if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
            out.push(child);
            if (out.length >= 25) return out;
          }
        }
      }
    }

    return out;
  }, [headerProjectQuery, hierarchy]);

  // Web-only UX: hover highlight + subtle open animation for dropdown
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const dropdownAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(dropdownAnim, {
      toValue: headerProjectQuery ? 1 : 0,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
    }).start();
  }, [headerProjectQuery, dropdownAnim]);

  // Native: keep search modal above the keyboard
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const subs = [];
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height || 0);
    const onHide = () => setKeyboardHeight(0);

    // iOS is often more reliable with *Will* events
    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch(_e) {}
      }
    };
  }, []);

  // App (native): filter projects by status
  const [projectStatusFilter, setProjectStatusFilter] = useState('all'); // 'all' | 'ongoing' | 'completed'
  const [filterModalVisible, setFilterModalVisible] = useState(false);

  // Web: right-click context menu for folder tree
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, target: null });
  const ensuredDefaultMainRef = useRef(false);

  // Web: hover highlight for tree rows
  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const getRowKey = React.useCallback((type, mainId, subId, projectId) => {
    return [type, mainId ?? '', subId ?? '', projectId ?? ''].join(':');
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false, target: null }));
  }, []);

  const getContextCoords = React.useCallback((e) => {
    const ne = e?.nativeEvent || e;
    const rawX = ne?.pageX ?? ne?.clientX ?? 0;
    const rawY = ne?.pageY ?? ne?.clientY ?? 0;
    const menuWidth = 220;
    const menuHeight = 220;
    if (typeof window !== 'undefined') {
      const maxX = Math.max(8, (window.innerWidth || rawX) - menuWidth - 8);
      const maxY = Math.max(8, (window.innerHeight || rawY) - menuHeight - 8);
      return { x: Math.min(rawX, maxX), y: Math.min(rawY, maxY) };
    }
    return { x: rawX, y: rawY };
  }, []);

  const openContextMenu = React.useCallback((e, target) => {
    if (Platform.OS !== 'web') return;
    try { e?.preventDefault?.(); } catch(_e) {}
    const { x, y } = getContextCoords(e);
    setContextMenu({ visible: true, x, y, target });
  }, [getContextCoords]);

  // Web-only: intercept the *real* DOM contextmenu event so the browser menu never opens.
  // RN-web doesn't reliably fire onContextMenu for all components.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const handler = (ev) => {
      const rootEl = document.getElementById('dk-tree-root');
      if (!rootEl) return;
      if (!rootEl.contains(ev.target)) return;

      // Always block the browser menu within the tree area
      ev.preventDefault();
      ev.stopPropagation();

      const rowEl = ev.target?.closest?.('[data-dk-type]');
      if (!rowEl) return;

      const dkType = rowEl.getAttribute('data-dk-type');
      const mainId = rowEl.getAttribute('data-dk-mainid');
      const subId = rowEl.getAttribute('data-dk-subid');
      const projectId = rowEl.getAttribute('data-dk-projectid');

      let target = null;
      if (dkType === 'main') {
        target = { type: 'main', mainId };
      } else if (dkType === 'sub') {
        target = { type: 'sub', mainId, subId };
      } else if (dkType === 'project') {
        // Lookup project object from current hierarchy
        let project = null;
        for (const m of hierarchy || []) {
          if (String(m.id) !== String(mainId)) continue;
          for (const s of m.children || []) {
            if (String(s.id) !== String(subId)) continue;
            project = (s.children || []).find(ch => ch?.type === 'project' && String(ch.id) === String(projectId)) || null;
          }
        }
        target = { type: 'project', mainId, subId, project };
      }

      if (!target) return;
      openContextMenu(ev, target);
    };

    document.addEventListener('contextmenu', handler, { capture: true });
    return () => document.removeEventListener('contextmenu', handler, { capture: true });
  }, [hierarchy, openContextMenu]);

  // Ensure at least one main folder exists (important since we remove the + button)
  React.useEffect(() => {
    if (!companyId) return;
    if (!didInitialLoadRef.current) return;
    if (ensuredDefaultMainRef.current) return;
    if (Array.isArray(hierarchy) && hierarchy.length === 0) {
      ensuredDefaultMainRef.current = true;
        setHierarchy([
        {
          id: (Math.random() * 100000).toFixed(0),
          name: 'Huvudmapp',
          expanded: false,
          children: [],
        },
      ]);
    }
  }, [hierarchy, companyId]);

  const renameMainFolderWeb = React.useCallback((mainId) => {
    const current = hierarchy.find(m => m.id === mainId);
    const currentName = current?.name || '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på huvudmapp', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => (m.id === mainId ? { ...m, name: nextName } : m)));
      return;
    }
    setEditModal({ visible: true, type: 'main', id: mainId, name: currentName });
  }, [hierarchy]);

  const renameSubFolderWeb = React.useCallback((subId) => {
    let currentName = '';
    hierarchy.forEach(m => {
      (m.children || []).forEach(s => {
        if (s.id === subId) currentName = s.name || '';
      });
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på undermapp', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => ({
        ...m,
        children: (m.children || []).map(s => (s.id === subId ? { ...s, name: nextName } : s)),
      })));
      return;
    }
    setEditModal({ visible: true, type: 'sub', id: subId, name: currentName });
  }, [hierarchy]);

  const deleteMainFolderGuarded = React.useCallback((mainId) => {
    const mainName = (hierarchy || []).find(m => m.id === mainId)?.name || '';
    if ((hierarchy || []).length <= 1) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Kan inte radera.\n\nDet måste finnas minst en huvudmapp.');
      } else {
        Alert.alert('Kan inte radera', 'Det måste finnas minst en huvudmapp.');
      }
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`);
      if (!ok) return;
      setHierarchy(prev => prev.filter(m => m.id !== mainId));
      return;
    }

    Alert.alert('Radera huvudmapp', `Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera',
        style: 'destructive',
        onPress: () => setHierarchy(prev => prev.filter(m => m.id !== mainId)),
      },
    ]);
  }, [hierarchy]);

  const deleteSubFolder = React.useCallback((mainId, subId) => {
    const main = (hierarchy || []).find(m => m.id === mainId);
    const subName = (main?.children || []).find(s => s.id === subId)?.name || '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`);
      if (!ok) return;
      setHierarchy(prev => prev.map(m => (
        m.id === mainId
          ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
          : m
      )));
      return;
    }

    Alert.alert('Radera undermapp', `Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera',
        style: 'destructive',
        onPress: () => setHierarchy(prev => prev.map(m => (
          m.id === mainId
            ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
            : m
        ))),
      },
    ]);
  }, [hierarchy]);

  const renameProjectWeb = React.useCallback((projectId) => {
    let currentName = '';
    hierarchy.forEach(m => {
      (m.children || []).forEach(s => {
        (s.children || []).forEach(ch => {
          if (ch?.type === 'project' && ch.id === projectId) currentName = ch.name || '';
        });
      });
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på projekt', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => ({
        ...m,
        children: (m.children || []).map(s => ({
          ...s,
          children: (s.children || []).map(ch => (
            ch?.type === 'project' && ch.id === projectId ? { ...ch, name: nextName } : ch
          )),
        })),
      })));
      return;
    }
  }, [hierarchy]);

  const deleteProject = React.useCallback((mainId, subId, projectId) => {
    const main = (hierarchy || []).find(m => m.id === mainId);
    const sub = (main?.children || []).find(s => s.id === subId);
    const projName = (sub?.children || []).find(ch => ch?.type === 'project' && ch.id === projectId)?.name || '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Vill du verkligen radera projektet ${projectId}${projName ? ` — ${projName}` : ''}?`);
      if (!ok) return;
      setHierarchy(prev => prev.map(m => (
        m.id !== mainId
          ? m
          : {
            ...m,
            children: (m.children || []).map(s => (
              s.id !== subId
                ? s
                : { ...s, children: (s.children || []).filter(ch => !(ch?.type === 'project' && ch.id === projectId)) }
            )),
          }
      )));
      return;
    }

    Alert.alert('Radera projekt', `Vill du verkligen radera projektet ${projectId}${projName ? ` — ${projName}` : ''}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera',
        style: 'destructive',
        onPress: () => setHierarchy(prev => prev.map(m => (
          m.id !== mainId
            ? m
            : {
              ...m,
              children: (m.children || []).map(s => (
                s.id !== subId
                  ? s
                  : { ...s, children: (s.children || []).filter(ch => !(ch?.type === 'project' && ch.id === projectId)) }
              )),
            }
        ))),
      },
    ]);
  }, [hierarchy]);

  const copyProjectWeb = React.useCallback((mainId, subId, project) => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    if (!project || project.type !== 'project') return;

    const suggestedId = String(project.id || '').trim();
    const suggestedName = String(project.name || '').trim();
    const newId = (window.prompt('Nytt projektnummer', suggestedId) || '').trim();
    if (!newId) return;
    if (!isProjectNumberUnique(newId)) {
      Alert.alert('Fel', 'Projektnummer används redan.');
      return;
    }
    const newName = (window.prompt('Nytt projektnamn', suggestedName) || '').trim();
    if (!newName) return;

    const copy = {
      ...project,
      id: newId,
      name: newName,
      createdAt: new Date().toISOString(),
      status: project.status || 'ongoing',
    };

    setHierarchy(prev => prev.map(m => (
      m.id !== mainId
        ? m
        : {
          ...m,
          children: (m.children || []).map(s => (
            s.id !== subId
              ? s
              : { ...s, children: [...(s.children || []), copy] }
          )),
        }
    )));
  }, [isProjectNumberUnique]);

  const contextMenuItems = React.useMemo(() => {
    const t = contextMenu.target;
    if (!t) return [];
    if (t.type === 'main') {
      return [
        { key: 'addMain', label: 'Lägg till huvudmapp', icon: '📁' },
        { key: 'addSub', label: 'Lägg till undermapp', icon: '📂' },
        { key: 'rename', label: 'Byt namn', icon: '✏️' },
        { key: 'delete', label: 'Radera', icon: '🗑️', danger: true, disabled: (hierarchy || []).length <= 1 },
      ];
    }
    if (t.type === 'sub') {
      return [
        { key: 'addProject', label: 'Lägg till projekt', icon: '➕' },
        { key: 'rename', label: 'Byt namn', icon: '✏️' },
        { key: 'delete', label: 'Radera', icon: '🗑️', danger: true },
      ];
    }
    if (t.type === 'project') {
      return [
        { key: 'open', label: 'Öppna projekt', icon: '📄' },
        { key: 'addControl', label: 'Skapa ny kontroll', icon: '✅' },
        { key: 'copy', label: 'Kopiera projekt', icon: '📋' },
        { key: 'rename', label: 'Byt namn', icon: '✏️' },
        { key: 'delete', label: 'Radera', icon: '🗑️', danger: true },
      ];
    }
    return [];
  }, [contextMenu.target, hierarchy]);

  const handleContextMenuSelect = React.useCallback((item) => {
    const t = contextMenu.target;
    if (!t) return;

    if (t.type === 'main') {
      const mainId = t.mainId;
      switch (item.key) {
        case 'addMain':
          setNewFolderModalVisible(true);
          setNewSubName('');
          break;
        case 'addSub':
          setNewSubModal({ visible: true, parentId: mainId });
          setNewSubName('');
          break;
        case 'rename':
          renameMainFolderWeb(mainId);
          break;
        case 'delete':
          deleteMainFolderGuarded(mainId);
          break;
      }
    }

    if (t.type === 'sub') {
      const mainId = t.mainId;
      const subId = t.subId;
      switch (item.key) {
        case 'addProject':
          setNewProjectModal({ visible: true, parentSubId: subId });
          setNewProjectName('');
          setNewProjectNumber('');
          break;
        case 'rename':
          renameSubFolderWeb(subId);
          break;
        case 'delete':
          deleteSubFolder(mainId, subId);
          break;
      }
    }

    if (t.type === 'project') {
      const mainId = t.mainId;
      const subId = t.subId;
      const project = t.project;
      switch (item.key) {
        case 'open':
          if (project && Platform.OS === 'web') {
            const main = (hierarchy || []).find((m) => m && String(m.id) === String(mainId)) || null;
            const sub = main && Array.isArray(main.children)
              ? (main.children || []).find((s) => s && String(s.id) === String(subId))
              : null;
            requestProjectSwitch(project, { selectedAction: null, path: { mainId: String(mainId), subId: String(subId), mainName: String(main?.name || ''), subName: String(sub?.name || '') } });
          }
          break;
        case 'addControl':
          if (project) {
            setProjectControlSelectedType(controlTypeOptions[0]?.type || '');
            setProjectControlTypePickerOpen(false);
            setProjectControlTemplates([]);
            setProjectControlSelectedTemplateId('');
            setProjectControlTemplatePickerOpen(false);
            setProjectControlTemplateSearch('');
            (async () => {
              try {
                const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
                if (cid) {
                  const items = await fetchCompanyMallar(cid).catch(() => []);
                  const list = Array.isArray(items) ? items : [];
                  setProjectControlTemplates(list);
                }
              } catch(_e) {}
              setProjectControlModal({ visible: true, project });
            })();
          }
          break;
        case 'copy':
          copyProjectWeb(mainId, subId, project);
          break;
        case 'rename':
          if (project?.id) renameProjectWeb(project.id);
          break;
        case 'delete':
          if (project?.id) deleteProject(mainId, subId, project.id);
          break;
      }
    }
  }, [contextMenu.target, deleteMainFolderGuarded, deleteSubFolder, renameMainFolderWeb, renameSubFolderWeb, requestProjectSwitch, copyProjectWeb, deleteProject, renameProjectWeb, companyId, routeCompanyId, authClaims?.companyId, controlTypeOptions, fetchCompanyMallar]);

  function toggleExpand(level, id, parentArr = hierarchy) {
    return parentArr.map(item => {
      if (item.id === id) {
        return { ...item, expanded: !item.expanded };
      } else if (item.children) {
        return { ...item, children: toggleExpand(level + 1, id, item.children) };
      }
      return item;
    });
  }

  const handleToggleMainFolder = (mainId) => {
    setHierarchy(prev => prev.map(m => m.id === mainId ? { ...m, expanded: !m.expanded } : { ...m, expanded: false }));
    setSpinMain(prev => ({ ...prev, [mainId]: (prev[mainId] || 0) + 1 }));
  };

  const handleToggleSubFolder = (subId) => {
    setHierarchy(prev => toggleExpand(1, subId, prev));
    setSpinSub(prev => ({ ...prev, [subId]: (prev[subId] || 0) + 1 }));
  };

  // Stil för återanvändning
// eslint-disable-next-line no-unused-vars
const _kontrollKnappStil = { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' };
// eslint-disable-next-line no-unused-vars
const _kontrollTextStil = { color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 };

    // Dashboard: gemensamma stilar (återanvänd befintliga färger)
    const dashboardContainerStyle = React.useMemo(() => ({ width: '100%', maxWidth: 1180, alignSelf: 'center' }), []);
    const dashboardColumnsStyle = React.useMemo(() => ({ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' }), []);
    const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 }), []);
    const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' }), []);
    const dashboardCardDenseStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 10, backgroundColor: '#fff' }), []);
    const dashboardEmptyTextStyle = React.useMemo(() => ({ color: '#777', padding: 12 }), []);
    const dashboardMetaTextStyle = React.useMemo(() => ({ fontSize: 12, color: '#888', marginTop: 2 }), []);
    const dashboardLinkTitleStyle = React.useMemo(() => ({ fontSize: 13, color: '#1976D2', fontWeight: '400' }), []);
    const dashboardListItemStyle = React.useCallback((idx) => ({
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    // Compact variants for the activity list (reduce vertical footprint)
    const dashboardActivityListItemStyle = React.useCallback((idx) => ({
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    const dashboardActivityTitleCompactStyle = React.useMemo(() => ({ fontSize: 14, color: '#222', fontWeight: '600' }), []);
    const dashboardActivityMetaCompactStyle = React.useMemo(() => ({ fontSize: 12, color: '#777', marginTop: 0 }), []);
    const dashboardStatRowStyle = React.useCallback((idx) => ({
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    const dashboardStatDotStyle = React.useCallback((color) => ({ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 12 }), []);
    const dashboardStatLabelStyle = React.useMemo(() => ({ flex: 1, fontSize: 15, color: '#222' }), []);
    const dashboardStatValueStyle = React.useMemo(() => ({ fontSize: 16, fontWeight: '400', color: '#222' }), []);
    const dashboardActivityTitleStyle = React.useMemo(() => ({ fontSize: 15, color: '#222', fontWeight: '600' }), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
    const ActivityPanel = React.useCallback(() => {
      return (
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* Moved Overview: show Översikt at top of right-hand panel */}
          <Text style={dashboardSectionTitleStyle}>Översikt</Text>
          <View
            style={[dashboardCardStyle, { padding: 12, marginBottom: 20 }]}
            onLayout={Platform.OS === 'web' ? (e) => { dashboardCardLayoutRef.current.overview = e?.nativeEvent?.layout || null; } : undefined}
          >
            {[
              { key: 'activeProjects', label: 'Pågående projekt', color: '#43A047', value: dashboardOverview.activeProjects, focus: 'activeProjects' },
              { key: 'completedProjects', label: 'Avslutade projekt', color: '#222', value: (_countProjectStatus ? _countProjectStatus(hierarchy).completed : 0), focus: 'completedProjects' },
              { key: 'controlsToSign', label: 'Kontroller att signera', color: '#D32F2F', value: dashboardOverview.controlsToSign, focus: 'controlsToSign' },
              { key: 'drafts', label: 'Sparade utkast', color: '#888', value: dashboardOverview.drafts, focus: 'drafts' },
            ].map((row, ridx) => {
              const isWeb = Platform.OS === 'web';
              const isHovered = isWeb && dashboardHoveredStatKey === row.key;
              const isOpen = isWeb && dashboardFocus === row.focus && dashboardDropdownAnchor === 'overview';
              const openFromRow = () => {
                const cardLayout = dashboardCardLayoutRef.current.overview;
                const rowLayout = dashboardStatRowLayoutRef.current[`overview:${row.key}`];
                // Position top flush under the row (no extra gap)
                const top = (cardLayout && rowLayout) ? (cardLayout.y + rowLayout.y + rowLayout.height) : undefined;
                console.log && console.log('dashboard: overview row press', row.key, row.focus, { cardLayout, rowLayout, top });
                setDashboardHoveredStatKey(row.key);
                setDashboardDropdownRowKey(row.key);
                toggleDashboardFocus(row.focus, 'overview', top);
              };
              return (
                <TouchableOpacity
                  key={row.key}
                  style={{
                    ...dashboardStatRowStyle(ridx),
                    paddingHorizontal: 6,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: isHovered ? '#1976D2' : 'transparent',
                    backgroundColor: isHovered ? '#eee' : 'transparent',
                    cursor: isWeb ? 'pointer' : undefined,
                    transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
                  }}
                  activeOpacity={0.75}
                  onPress={openFromRow}
                  onMouseEnter={isWeb ? () => setDashboardHoveredStatKey(row.key) : undefined}
                  onMouseLeave={isWeb ? () => setDashboardHoveredStatKey(null) : undefined}
                  onLayout={isWeb ? (e) => {
                    const l = e?.nativeEvent?.layout;
                    if (l) dashboardStatRowLayoutRef.current[`overview:${row.key}`] = l;
                  } : undefined}
                >
                  <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 6 }} />
                  <View style={dashboardStatDotStyle(row.color)} />
                  <Text style={dashboardStatLabelStyle}>{row.label}</Text>
                  <Text style={dashboardStatValueStyle}>{String(row.value ?? 0)}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Overview dropdown overlay (renders inside ActivityPanel, below Overview card) */}
          {Platform.OS === 'web' && dashboardFocus && dashboardDropdownAnchor === 'overview' ? (
            <View
              style={(function() {
                try {
                  const ov = dashboardCardLayoutRef.current.overview;
                  const rKey = dashboardDropdownRowKey;
                  const rowLayout = rKey ? dashboardStatRowLayoutRef.current[`overview:${rKey}`] : null;
                  // compute left/width and use bottom to overlap the button (dropdown bottom == row top)
                  if (rowLayout && typeof rowLayout.x === 'number' && typeof rowLayout.width === 'number' && ov && typeof ov.height === 'number' && typeof rowLayout.y === 'number') {
                    // Align dropdown top to the row's bottom so it falls downwards
                    const NUDGE_DOWN = 28; // small downward nudge so header/title remains visible
                    const topPos = Math.max(0, rowLayout.y + rowLayout.height + NUDGE_DOWN);
                    console.log && console.log('dashboard overlay positioning (exact, top)', { ovHeight: ov.height, rowY: rowLayout.y, rowHeight: rowLayout.height, topPos, nudge: NUDGE_DOWN });
                    return { position: 'absolute', left: rowLayout.x, width: rowLayout.width, top: topPos, zIndex: 20 };
                  }

                  // fallback: full card width (use top so overlay appears under the card)
                  if (ov && typeof ov.width === 'number' && typeof ov.height === 'number') {
                    return { position: 'absolute', left: 0, width: ov.width, top: ov.height, zIndex: 20 };
                  }
                } catch (e) {}
                return { position: 'absolute', left: 0, right: 0, top: 54, zIndex: 20 };
              })()}
            >
              <View style={[dashboardCardStyle, { paddingTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}> 
                <ScrollView style={{ maxHeight: Math.max(180, (webPaneHeight || 640) - 220 - 24), paddingTop: 0 }}>
                  {dashboardLoading ? <Text style={dashboardEmptyTextStyle}>Laddar…</Text> : (
                    (() => {
                      const focus = dashboardFocus;
                      if (focus === 'activeProjects') {
                        const items = Array.isArray(dashboardActiveProjectsList) ? dashboardActiveProjectsList : [];
                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga pågående projekt.</Text>;
                        return items.map((p, idx) => (
                          <TouchableOpacity key={`${p.id}-${idx}`} activeOpacity={0.85} onPress={() => { requestProjectSwitch(p, { selectedAction: null }); setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }} style={dashboardListItemStyle(idx)}>
                            <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p.id} — {p.name}</Text>
                          </TouchableOpacity>
                        ));
                      }
                      if (focus === 'completedProjects') {
                        try {
                          const tree = hierarchyRef.current || [];
                          const items = [];
                          for (const main of tree) {
                            for (const sub of (main.children || [])) {
                              for (const child of (sub.children || [])) {
                                if (child && child.type === 'project' && (child.status === 'completed' || String(child.status || '').toLowerCase() === 'completed')) {
                                  items.push(child);
                                }
                              }
                            }
                          }
                          if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga avslutade projekt.</Text>;
                          return items.map((p, idx) => (
                            <TouchableOpacity key={`${p.id}-${idx}`} activeOpacity={0.85} onPress={() => { requestProjectSwitch(p, { selectedAction: null }); setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }} style={dashboardListItemStyle(idx)}>
                              <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p.id} — {p.name}</Text>
                            </TouchableOpacity>
                          ));
                        } catch (_e) {
                          return <Text style={dashboardEmptyTextStyle}>Inga avslutade projekt.</Text>;
                        }
                      }
                      if (focus === 'drafts' || focus === 'controlsToSign') {
                        const items = focus === 'controlsToSign' ? (Array.isArray(dashboardControlsToSignItems) ? dashboardControlsToSignItems : []) : (Array.isArray(dashboardDraftItems) ? dashboardDraftItems : []);
                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga utkast.</Text>;
                        return items.map((d, idx) => {
                          const pid = d?.project?.id || d?.projectId || d?.project || null;
                          const projectId = pid ? String(pid) : '';
                          const projObj = projectId ? findProjectById(projectId) : null;
                          const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                          const ts = d?.savedAt || d?.updatedAt || d?.createdAt || d?.date || null;
                          const type = String(d?.type || 'Utkast');
                          return (
                            <TouchableOpacity key={`${projectId}-${type}-${idx}`} activeOpacity={0.85} onPress={() => {
                              if (!projObj) return;
                              requestProjectSwitch(projObj, { selectedAction: { id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, kind: 'openDraft', type, initialValues: d }, clearActionAfter: true });
                              setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null);
                            }} style={dashboardListItemStyle(idx)}>
                              <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                              <Text style={dashboardMetaTextStyle}>{type}{ts ? ` • Sparat: ${formatRelativeTime(ts)}` : ''}</Text>
                            </TouchableOpacity>
                          );
                        });
                      }
                      if (focus === 'openDeviations') {
                        const items = Array.isArray(dashboardOpenDeviationItems) ? dashboardOpenDeviationItems : [];
                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga öppna avvikelser.</Text>;
                        return items.map((entry, idx) => {
                          const c = entry?.control;
                          const pid = c?.project?.id || c?.projectId || c?.project || null;
                          const projectId = pid ? String(pid) : '';
                          const projObj = projectId ? findProjectById(projectId) : null;
                          const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                          const openCount = entry?.openCount || 0;
                          return (
                            <TouchableOpacity key={`${projectId}-${c?.id || idx}`} activeOpacity={0.85} onPress={() => {
                              if (!projObj || !c) return;
                              requestProjectSwitch(projObj, { selectedAction: { id: `openControl-${c?.id || Date.now()}`, kind: 'openControlDetails', control: c }, clearActionAfter: true });
                              setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null);
                            }} style={dashboardListItemStyle(idx)}>
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                <View style={[dashboardStatDotStyle('#FFD600'), { marginTop: 4 }]} />
                                <View style={{ flex: 1, minWidth: 0 }}>
                                  <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                                  <Text style={dashboardMetaTextStyle}>Skyddsrond • Öppna avvikelser: {String(openCount)}</Text>
                                </View>
                              </View>
                            </TouchableOpacity>
                          );
                        });
                      }
                      if (focus === 'upcomingSkyddsrond') {
                        const items = Array.isArray(dashboardUpcomingSkyddsrondItems) ? dashboardUpcomingSkyddsrondItems : [];
                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga kommande skyddsronder.</Text>;
                        return items.map((entry, idx) => {
                          const p = entry?.project;
                          const dueMs = Number(entry?.nextDueMs || 0);
                          const dueLabel = dueMs ? new Date(dueMs).toLocaleDateString('sv-SE') : '';
                          const state = entry?.state === 'overdue' ? 'Försenad' : 'Snart';
                          return (
                            <TouchableOpacity key={`${p?.id || 'proj'}-${idx}`} activeOpacity={0.85} onPress={() => { if (p) requestProjectSwitch(p, { selectedAction: null }); setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }} style={dashboardListItemStyle(idx)}>
                              <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p?.id} — {p?.name}</Text>
                              <Text style={dashboardMetaTextStyle}>{state}{dueLabel ? ` • Nästa: ${dueLabel}` : ''}</Text>
                            </TouchableOpacity>
                          );
                        });
                      }
                      return <Text style={dashboardEmptyTextStyle}>Inget att visa.</Text>;
                    })()
                  )}
                </ScrollView>
              </View>
            </View>
          ) : null}

          <Text style={dashboardSectionTitleStyle}>Senaste aktivitet</Text>
          <View style={dashboardCardDenseStyle}>
            {dashboardLoading ? (
              <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
            ) : (dashboardRecent || []).length === 0 ? (
              <Text style={dashboardEmptyTextStyle}>Ingen aktivitet ännu.</Text>
            ) : (
              (dashboardRecent || []).map((a, idx) => {
                const isLogin = String(a.type || '').toLowerCase() === 'login';
                const hasOpenDeviations = !isLogin && a.kind !== 'draft' && a.type === 'Skyddsrond' && (a.openDeviationsCount || 0) > 0;
                const iconName = isLogin ? 'log-in-outline' : (a.kind === 'draft' ? 'document-text-outline' : (hasOpenDeviations ? 'alert-circle' : 'checkmark-circle'));
                const iconColor = isLogin ? '#1976D2' : (a.kind === 'draft' ? '#FFD600' : (hasOpenDeviations ? '#D32F2F' : '#43A047'));
                // eslint-disable-next-line no-unused-vars
                
                const who = formatPersonName(a.actorName || a.actorEmail || a.actor || a.email || a.uid || '');
                const title = isLogin
                  ? (who ? `Loggade in: ${who}` : 'Loggade in')
                  : (a.kind === 'draft'
                    ? `Utkast sparat: ${a.type}${who ? ` — av ${who}` : ''}`
                    : `Slutförd: ${a.type}${who ? ` — av ${who}` : ''}`);

                return (
                  <TouchableOpacity
                    key={`${a.kind}-${a.ts || 'no-ts'}-${idx}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (isLogin) return;
                      if (a.projectId) {
                        const p = findProjectById(a.projectId);
                        if (p) {
                          if (a.kind === 'draft') {
                            const raw = a.raw || null;
                            const stableId = raw?.id || raw?.draftId || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                            const selectedAction = {
                              id: `openDraft:${String(a.projectId)}:${String(stableId)}`,
                              kind: 'openDraft',
                              type: a.type,
                              initialValues: raw || undefined,
                            };
                            requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                          } else {
                            requestProjectSwitch(p, { selectedAction: null });
                          }
                        }
                      }
                    }}
                    style={[{ flexDirection: 'row', alignItems: 'flex-start' }, dashboardActivityListItemStyle(idx)]}
                  >
                    <Ionicons name={iconName} size={16} color={iconColor} style={{ marginTop: 2, marginRight: 8 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={dashboardActivityTitleCompactStyle} numberOfLines={1}>
                        {title}
                      </Text>
                      { (a.projectId || a.projectName) ? (
                        <Text style={{ fontSize: 13, color: '#1976D2', marginTop: 2 }} numberOfLines={1}>
                          {a.projectId ? String(a.projectId) : ''}{(a.projectId && a.projectName) ? ' - ' : ''}{a.projectName ? String(a.projectName) : ''}
                        </Text>
                      ) : null}
                      {a.desc && (!isLogin || a.desc !== title) ? (
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                          {a.desc}
                        </Text>
                      ) : null}
                      {
                        // Show actor + relative time for non-login activities when available
                        (!isLogin && who) ? (
                          <Text style={dashboardActivityMetaCompactStyle} numberOfLines={1}>
                            {`Av: ${who} ${formatRelativeTime(a.ts)}`}
                          </Text>
                        ) : (
                          <Text style={dashboardActivityMetaCompactStyle}>
                            {formatRelativeTime(a.ts)}
                          </Text>
                        )
                      }
                    </View>

                    {Platform.OS === 'web' && hasOpenDeviations && (
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                          if (!a.projectId) return;
                          const p = findProjectById(a.projectId);
                          if (!p) return;
                          const raw = a.raw || null;
                          const stableId = raw?.id || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                          const selectedAction = {
                            id: `openControlDetails:${String(a.projectId)}:${String(stableId)}`,
                            kind: 'openControlDetails',
                            control: raw || undefined,
                          };
                          requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                        }}
                        style={{ marginLeft: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600', alignSelf: 'center' }}
                        activeOpacity={0.85}
                        accessibilityLabel="Åtgärda avvikelse"
                      >
                        <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      );
    }, [
      dashboardRecent,
      dashboardLoading,
      dashboardSectionTitleStyle,
      dashboardCardStyle,
      dashboardCardDenseStyle,
      dashboardEmptyTextStyle,
      dashboardListItemStyle,
      dashboardActivityListItemStyle,
      dashboardActivityTitleStyle,
      dashboardActivityTitleCompactStyle,
      dashboardMetaTextStyle,
      dashboardActivityMetaCompactStyle,
      dashboardLinkTitleStyle,
      findProjectById,
      formatRelativeTime,
      requestProjectSwitch,
      toggleDashboardFocus,
      // Ensure overview/hover/focus state cause re-creation so chevrons and overlays update
      dashboardFocus,
      dashboardHoveredStatKey,
      dashboardDropdownAnchor,
      dashboardDropdownTop,
      dashboardDropdownRowKey,
      dashboardOverview,
      dashboardActiveProjectsList,
      dashboardDraftItems,
      dashboardControlsToSignItems,
      dashboardOpenDeviationItems,
      dashboardUpcomingSkyddsrondItems,
      dashboardStatDotStyle,
      dashboardStatLabelStyle,
      dashboardStatRowStyle,
      dashboardStatValueStyle,
      webPaneHeight,
      hierarchy,
    ]);

    function SelectProjectModal() {
      const [expandedMain, setExpandedMain] = useState([]);
      const [expandedSub, setExpandedSub] = useState([]);
      // Quick-add project state (currently unused)
      const isMainExpanded = id => expandedMain[0] === id;
      const isSubExpanded = id => expandedSub.includes(id);
      const toggleMain = id => setExpandedMain(exp => exp[0] === id ? [] : [id]);
      const toggleSub = id => setExpandedSub(exp => exp.includes(id) ? exp.filter(e => e !== id) : [...exp, id]);

      // Reset expanded state when project selector modal opens
      const modalVisible = !!selectProjectModal?.visible;
      React.useEffect(() => {
        if (modalVisible) setExpandedMain([]);
      }, [modalVisible]);

      return (
        <Modal
          visible={selectProjectModal.visible}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectProjectModal({ visible: false, type: null })}
        >
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={() => setSelectProjectModal({ visible: false, type: null })}
            />
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 360, maxHeight: 540 }}>
              {selectProjectModal.type && (
                <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 6, color: '#222', textAlign: 'center' }}>
                  {selectProjectModal.type}
                </Text>
              )}
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj projekt</Text>
              <View style={{ position: 'relative', marginBottom: 14 }}>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Sök projektnamn eller nummer..."
                  style={{
                    borderWidth: 1,
                    borderColor: '#222',
                    borderRadius: 16,
                    padding: 10,
                    fontSize: 16,
                    backgroundColor: '#fff',
                    color: '#222',
                    paddingRight: 38
                  }}
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                {searchText.trim().length > 0 && (
                  <View style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', zIndex: 10, maxHeight: 180 }}>
                    <ScrollView keyboardShouldPersistTaps="handled">
                      {hierarchy.flatMap(main =>
                        main.children.flatMap(sub =>
                          (sub.children || [])
                            .filter(child => child.type === 'project' && (
                              child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                              child.name.toLowerCase().includes(searchText.toLowerCase())
                            ))
                            .map(proj => (
                              <TouchableOpacity
                                key={proj.id}
                                style={{ padding: 10, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                                onPress={() => {
                                  const selType = selectProjectModal.type;
                                  setSelectProjectModal({ visible: false, type: null });
                                  if (selType) {
                                    openInlineControlEditor(proj, selType);
                                  }
                                }}
                              >
                                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                <Text style={{ fontSize: 14, color: '#1976D2', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                              </TouchableOpacity>
                            ))
                        )
                      )}
                    </ScrollView>
                  </View>
                )}
              </View>
              <ScrollView style={{ maxHeight: 370 }}>
                {[...hierarchy]
                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                  .filter(main =>
                    main.name.toLowerCase().includes(searchText.toLowerCase()) ||
                    main.children.some(sub =>
                      sub.name.toLowerCase().includes(searchText.toLowerCase()) ||
                      (sub.children || []).some(child =>
                        child.type === 'project' && (
                          child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                          child.id.toLowerCase().includes(searchText.toLowerCase())
                        )
                      )
                    )
                  )
                  .map(main => (
                    <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 3, padding: 6, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleMain(main.id)} activeOpacity={0.7}>
                        <Ionicons name={isMainExpanded(main.id) ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                      </TouchableOpacity>
                      {isMainExpanded(main.id) && (
                        !main.children || main.children.length === 0 ? (
                          <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>Inga undermappar skapade</Text>
                        ) : (
                          [...main.children]
                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                            .filter(sub =>
                              sub.name.toLowerCase().includes(searchText.toLowerCase()) ||
                              (sub.children || []).some(child =>
                                child.type === 'project' && (
                                  child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                                  child.id.toLowerCase().includes(searchText.toLowerCase())
                                )
                              )
                            )
                            .map(sub => (
                              <View key={sub.id} style={{ marginLeft: 20, marginBottom: 0, padding: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 0 2px 0', userSelect: 'none' }}>
                                  <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }} onPress={() => toggleSub(sub.id)} activeOpacity={0.7}>
                                    <Ionicons name={isSubExpanded(sub.id) ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 4 }} />
                                    <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginLeft: 2 }}>{sub.name}</Text>
                                  </TouchableOpacity>
                                </View>
                                {isSubExpanded(sub.id) && (
                                  (sub.children || []).filter(child => child.type === 'project').map(proj => (
                                    <View key={proj.id} style={{ marginLeft: 32 }}>
                                      <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: 'transparent', borderRadius: 4, padding: '2px 4px', marginBottom: 0 }}
                                        onPress={() => {
                                          const selType = selectProjectModal.type;
                                          setSelectProjectModal({ visible: false, type: null });
                                          if (selType) {
                                            openInlineControlEditor(proj, selType);
                                          }
                                        }}
                                      >
                                        <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 6, borderWidth: 1, borderColor: '#bbb' }} />
                                        <Text style={{ fontSize: 13, color: '#1976D2', fontWeight: '400', marginLeft: 2, marginRight: 6, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} — {proj.name}</Text>
                                      </TouchableOpacity>
                                    </View>
                                  ))
                                )}
                              </View>
                            ))
                        )
                      )}
                    </View>
                  ))}
              </ScrollView>
            </View>
          </View>
        </Modal>
      );
    }

  return (
    <View style={{ flex: 1 }}>
      {/* App-only: filter modal */}
      <Modal
        visible={filterModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setFilterModalVisible(false)}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => setFilterModalVisible(false)}
          />
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 20, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative' }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center' }}>
              Filtrera projekt
            </Text>

            {[{ key: 'all', label: 'Alla' }, { key: 'ongoing', label: 'Pågående' }, { key: 'completed', label: 'Avslutade' }].map(opt => {
              const selected = projectStatusFilter === opt.key;
              return (
                <TouchableOpacity
                  key={opt.key}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    paddingHorizontal: 12,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: selected ? '#1976D2' : '#e0e0e0',
                    backgroundColor: selected ? '#e3f2fd' : '#fff',
                    marginBottom: 10,
                  }}
                  onPress={() => {
                    setProjectStatusFilter(opt.key);
                    setFilterModalVisible(false);
                  }}
                  activeOpacity={0.8}
                >
                  {opt.key === 'ongoing' && (
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#43A047', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                  )}
                  {opt.key === 'completed' && (
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#222', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                  )}
                  {opt.key === 'all' && (
                    <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: '#fff', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                  )}
                  <Text style={{ fontSize: 16, fontWeight: selected ? '700' : '600', color: '#222' }}>{opt.label}</Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={{ backgroundColor: '#e0e0e0', borderRadius: 12, paddingVertical: 10, alignItems: 'center' }}
              onPress={() => setFilterModalVisible(false)}
            >
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Sök-popup/modal */}
      <Modal
        visible={searchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSearchModal}
      >
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={closeSearchModal}
            />
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 24,
                width: 340,
                maxHeight: 700,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
                elevation: 6,
                position: 'relative',
              }}
            >
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={closeSearchModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center', marginTop: 6 }}>
                Sök projekt
              </Text>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Skriv projektnummer..."
                style={{
                  borderWidth: 1,
                  borderColor: '#222',
                  borderRadius: 16,
                  padding: 10,
                  fontSize: 16,
                  backgroundColor: '#fff',
                  color: '#222',
                  marginBottom: 12
                }}
                autoFocus
                keyboardType="default"
                autoCorrect={false}
                autoCapitalize="none"
              />
              <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
                {hierarchy.flatMap(main =>
                  main.children.flatMap(sub =>
                    (sub.children || [])
                      .filter(child => child.type === 'project' &&
                        searchText.trim() !== '' &&
                        (
                          child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                          child.name.toLowerCase().includes(searchText.toLowerCase())
                        )
                      )
                      .map(proj => (
                        <TouchableOpacity
                          key={proj.id}
                          style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => {
                            closeSearchModal();
                            requestProjectSwitch(proj, { selectedAction: null });
                          }}
                        >
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                        </TouchableOpacity>
                      ))
                  )
                )}
                {searchText.trim() !== '' && hierarchy.flatMap(main => main.children.flatMap(sub => (sub.children || []).filter(child => child.type === 'project' && (
                  child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                  child.name.toLowerCase().includes(searchText.toLowerCase())
                )))).length === 0 && (
                  <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 12 }}>Inga projekt hittades.</Text>
                )}
              </ScrollView>
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <View
              style={{
                flex: 1,
                // Center the search dialog vertically on mobile
                justifyContent: 'center',
                alignItems: 'center',
                paddingTop: 20,
                paddingBottom: 8,
              }}
            >
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={closeSearchModal}
              />
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: 24,
                  width: 340,
                  maxHeight: Math.max(320, Math.min(600, (windowHeight || 700) - (keyboardHeight || 0) - 80)),
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.18,
                  shadowRadius: 8,
                  elevation: 6,
                  position: 'relative',
                }}
              >
                <TouchableOpacity
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                  onPress={closeSearchModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={26} color="#222" />
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center', marginTop: 6 }}>
                  Sök projekt
                </Text>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Skriv projektnummer..."
                  style={{
                    borderWidth: 1,
                    borderColor: '#222',
                    borderRadius: 16,
                    padding: 10,
                    fontSize: 16,
                    backgroundColor: '#fff',
                    color: '#222',
                    marginBottom: 12
                  }}
                  autoFocus
                  keyboardType="default"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <ScrollView
                  style={{
                    maxHeight: Math.max(180, (windowHeight || 700) - (keyboardHeight || 0) - 260),
                  }}
                  keyboardShouldPersistTaps="handled"
                >
                  {hierarchy.flatMap(main =>
                    main.children.flatMap(sub =>
                      (sub.children || [])
                        .filter(child => child.type === 'project' &&
                          searchText.trim() !== '' &&
                          (
                            child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                            child.name.toLowerCase().includes(searchText.toLowerCase())
                          )
                        )
                        .map(proj => (
                          <TouchableOpacity
                            key={proj.id}
                            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => {
                              closeSearchModal();
                              navigation.navigate('ProjectDetails', {
                                project: {
                                  id: proj.id,
                                  name: proj.name,
                                  ansvarig: proj.ansvarig || '',
                                  adress: proj.adress || '',
                                  fastighetsbeteckning: proj.fastighetsbeteckning || '',
                                  client: proj.client || '',
                                  status: proj.status || 'ongoing',
                                  createdAt: proj.createdAt || '',
                                  createdBy: proj.createdBy || ''
                                },
                                companyId
                              });
                            }}
                          >
                            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                            <Text style={{ fontSize: 16, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                          </TouchableOpacity>
                        ))
                    )
                  )}
                  {searchText.trim() !== '' && hierarchy.flatMap(main => main.children.flatMap(sub => (sub.children || []).filter(child => child.type === 'project' && (
                    child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                    child.name.toLowerCase().includes(searchText.toLowerCase())
                  )))).length === 0 && (
                    <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 12 }}>Inga projekt hittades.</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
      {newProjectModalComponent}
      {(() => {
        const RootContainer = ImageBackground;
        const rootContainerProps = {
          source: require('../assets/images/inlogg.webb.png'),
          resizeMode: 'cover',
          imageStyle: { width: '100%', height: '100%' },
        };

        return (
          <RootContainer
            {...rootContainerProps}
            style={{ flex: 1, width: '100%', minHeight: Platform.OS === 'web' ? '100vh' : undefined, height: Platform.OS === 'web' ? windowHeight || undefined : undefined }}
          >
              <View
                style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 0 }}
              />

            {headerProjectQuery && headerSearchOpen ? (
              (() => {
                const innerDropdown = (
                  <View
                    style={{
                      pointerEvents: 'auto',
                      position: Platform.OS === 'web' ? 'fixed' : 'absolute',
                      top: Platform.OS === 'web' ? headerSearchBottom : 8,
                      left: Platform.OS === 'web' && headerSearchLeft !== null ? headerSearchLeft : 0,
                      zIndex: 99999,
                      alignItems: 'flex-start',
                      marginTop: 0,
                      paddingTop: 0,
                    }}
                  >
                    <Animated.View
                      style={{
                          width: headerSearchWidth || 560,
                          backgroundColor: '#fff',
                          borderRadius: 16,
                          borderTopLeftRadius: 0,
                          borderTopRightRadius: 0,
                          overflow: 'hidden',
                          borderLeftWidth: 1,
                          borderRightWidth: 1,
                          borderBottomWidth: 1,
                          borderTopWidth: 0,
                          borderColor: '#666',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.18,
                          shadowRadius: 14,
                          elevation: 10,
                          marginTop: 0,
                          paddingTop: 0,
                          opacity: Platform.OS === 'web' ? dropdownAnim : 1,
                          transform: Platform.OS === 'web' ? [{ scale: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [0.995, 1] }) }] : undefined,
                        }}
                    >
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingTop: 0 }} keyboardShouldPersistTaps="handled">
                        {headerProjectMatches.map((proj) => (
                          <TouchableOpacity
                            key={proj.id}
                            onMouseEnter={Platform.OS === 'web' ? () => setHoveredProjectId(proj.id) : undefined}
                            onMouseLeave={Platform.OS === 'web' ? () => setHoveredProjectId(null) : undefined}
                            style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', backgroundColor: Platform.OS === 'web' && hoveredProjectId === proj.id ? '#F7FBFF' : '#fff' }}
                            activeOpacity={0.8}
                            onPress={() => {
                                // Switch project inline and close the header dropdown (keep the query text).
                                if (Platform.OS === 'web') {
                                  try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
                                }
                                requestProjectSwitch(proj, { selectedAction: null });
                              }}
                          >
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                            <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                              {proj.id} - {proj.name}
                            </Text>
                          </TouchableOpacity>
                        ))}

                        {headerProjectMatches.length === 0 ? (
                          <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', paddingVertical: 14 }}>
                            Inga projekt hittades.
                          </Text>
                        ) : null}
                      </ScrollView>
                    </Animated.View>
                  </View>
                );

                const PortalContent = (
                  <>
                    <View
                      // backdrop to capture outside clicks and close the dropdown
                      onStartShouldSetResponder={() => true}
                      onResponderRelease={() => {
                        if (Platform.OS === 'web') {
                          try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
                        }
                      }}
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998, backgroundColor: 'rgba(0,0,0,0)' }}
                    />
                    {innerDropdown}
                  </>
                );

                if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
                  try {
                    let portalRoot = document.getElementById(portalRootId);
                    if (!portalRoot) {
                      portalRoot = document.createElement('div');
                      portalRoot.id = portalRootId;
                      portalRoot.style.position = 'relative';
                      document.body.appendChild(portalRoot);
                    }
                    return createPortal(PortalContent, portalRoot);
                  } catch(_e) {
                    return PortalContent;
                  }
                }
                return innerDropdown;
              })()
            ) : null}

            <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} scrollEnabled={Platform.OS !== 'web'} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        {/* Header */}
        <View
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (Platform.OS === 'web' && typeof h === 'number' && h > 0 && Math.abs(h - headerHeight) > 1) {
              setHeaderHeight(h);
            }
          }}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F7FAFC', borderBottomWidth: 1, borderColor: '#e6e6e6' }}
        >
          <View>
              {/* User button: icon + full name, opens dropdown */}
            {/* User button: icon + full name, opens dropdown */}
            {Platform.OS !== 'web' ? (() => {
              let displayName = '';
              if (route?.params?.displayName) displayName = route.params.displayName;
              else if (auth?.currentUser) {
                const user = auth.currentUser;
                if (user.displayName && String(user.displayName).trim().includes(' ')) {
                  displayName = String(user.displayName).trim();
                } else {
                  displayName = formatPersonName(user) || (user.displayName ? String(user.displayName).trim() : '');
                }
              }
              displayName = displayName || firstName || 'Användare';
              const _nameSeed = String(displayName || '').trim();
              // eslint-disable-next-line no-unused-vars
              const _hash = Array.from(_nameSeed).reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0);
              const _colors = ['#F44336','#E91E63','#9C27B0','#3F51B5','#2196F3','#03A9F4','#009688','#4CAF50','#FF9800','#FFC107'];
              const avatarBg = _colors[Math.abs(_hash) % _colors.length];

              const menuItems = [];
              if (isSuperAdmin) {
                // Superadmin: behåll alla befintliga adminval
                menuItems.push({ key: 'manage_company', label: 'Hantera företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
                menuItems.push({ key: 'manage_users', label: 'Hantera användare', icon: <Ionicons name="person-add" size={16} color="#1976D2" /> });
                menuItems.push({ key: 'admin_audit', label: 'Adminlogg', icon: <Ionicons name="list" size={16} color="#1565C0" /> });
              }

              // Alla roller: logga ut längst ned. För admin/användare blir detta enda valet.
              menuItems.push({ key: 'logout', label: 'Logga ut', icon: <Ionicons name="log-out-outline" size={16} color="#D32F2F" /> });

              return (
                <>
                  <TouchableOpacity
                    ref={userBtnRef}
                    onPress={() => { try { openUserMenu(); } catch(_e) {} }}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={16} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#666"
                      style={{ marginLeft: 6, transform: [{ rotate: (userMenuVisible ? '180deg' : '0deg') }] }}
                    />
                  </TouchableOpacity>
                  <ContextMenu
                    visible={userMenuVisible}
                    x={menuPos.x}
                    y={menuPos.y}
                    items={menuItems}
                    onClose={() => setUserMenuVisible(false)}
                    onSelect={async (it) => {
                      try {
                        setUserMenuVisible(false);
                        if (!it) return;
                        if (it.key === 'manage_company') {
                          try { navigation.navigate('ManageCompany'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna Hantera företag'); }
                          return;
                        }
                        if (it.key === 'admin_audit') {
                          try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
                          return;
                        }
                        if (it.key === 'manage_users') {
                          try { navigation.navigate('ManageUsers', { companyId: String(companyId || routeCompanyId || '') }); } catch(_e) { Alert.alert('Valt', it.label); }
                          return;
                        }
                        if (it.key === 'logout') {
                          try { setLoggingOut(true); } catch(_e) {}
                          try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
                          try { await auth.signOut(); } catch(_e) {}
                          try { setLoggingOut(false); } catch(_e) {}
                          try {
                            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                          } catch(_e) {
                            try { navigation.navigate('Login'); } catch(__e) {}
                          }
                          return;
                        }
                        // Default: show label as feedback
                        Alert.alert('Valt', it.label);
                      } catch(_e) {}
                    }}
                  />
                </>
              );
            })() : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 8 }}>
              {Platform.OS === 'web' ? (
                <View style={{ marginRight: 6 }}>
                  {showHeaderUserMenu ? <HeaderUserMenu /> : <HeaderDisplayName />}
                </View>
              ) : null}
              {allowedTools ? (
                <TouchableOpacity
                  style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                  onPress={() => setSupportMenuOpen(s => !s)}
                >
                  <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {Platform.OS === 'web' ? (
              <View style={{ marginTop: 10, marginLeft: 8, marginRight: 8, alignSelf: 'stretch', maxWidth: 1180 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e0e0e0', paddingVertical: 10, paddingHorizontal: 12, alignSelf: 'flex-start' }}>
                  <WebBreadcrumbInline navigation={navigation} preferHomeSegments maxWidth={760} />
                </View>
              </View>
            ) : null}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Adminlogg</Text>
              </TouchableOpacity>
            )}
            {__DEV__ && showAdminButton && canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  await saveHierarchy('testdemo', testHierarchy);
                  setShowAdminButton(false);
                  alert('Testdata har lagts in!');
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Fyll på testdata</Text>
              </TouchableOpacity>
            )}
            {__DEV__ && showAdminButton && canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#43A047', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  await handleMakeDemoAdmin();
                  alert('Din användare är nu markerad som demo/admin (client-side).');
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{adminActionRunning ? 'Kör...' : 'Gör mig demo-admin'}</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && localFallbackExists && (
              <TouchableOpacity
                style={{ backgroundColor: '#FFB300', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  // migrate local fallback (hierarki + controls) to Firestore with confirmation
                  try {
                    const rawHierarchy = await AsyncStorage.getItem('hierarchy_local');
                    const rawCompleted = await AsyncStorage.getItem('completed_controls');
                    const rawDrafts = await AsyncStorage.getItem('draft_controls');

                    if (!rawHierarchy && !rawCompleted && !rawDrafts) {
                      Alert.alert('Ingen lokal data', 'Ingen lokalt sparad hierarki eller kontroller hittades.');
                      await refreshLocalFallbackFlag();
                      return;
                    }

                    Alert.alert(
                      'Migrera lokal data',
                      'Vill du migrera lokalt sparad hierarki och kontroller till molnet för kontot? Detta kan skriva över befintlig molndata.',
                      [
                        { text: 'Avbryt', style: 'cancel' },
                        { text: 'Migrera', onPress: async () => {
                          try {
                            let successMsgs = [];

                            // Hierarki
                            if (rawHierarchy) {
                              try {
                                const parsed = JSON.parse(rawHierarchy);
                                const res = await saveHierarchy(companyId, parsed);
                                const ok = res === true || (res && res.ok === true);
                                if (ok) {
                                  await AsyncStorage.removeItem('hierarchy_local');
                                  setHierarchy(parsed);
                                  successMsgs.push('Hierarki migrerad');
                                } else {
                                  successMsgs.push('Hierarki misslyckades');
                                }
                              } catch(_e) {
                                successMsgs.push('Hierarki-fel');
                              }
                            }

                            // Controls: backup locally first
                            if (rawCompleted) {
                              try {
                                await AsyncStorage.setItem('completed_controls_backup', rawCompleted);
                                const parsedCompleted = JSON.parse(rawCompleted);
                                let okCount = 0;
                                for (const ctl of parsedCompleted) {
                                  try {
                                    const ok = await saveControlToFirestore(ctl);
                                    if (ok) okCount++;
                                  } catch(_e) {}
                                }
                                if (okCount > 0) {
                                  await AsyncStorage.removeItem('completed_controls');
                                  successMsgs.push(`${okCount} utförda kontroller migrerade`);
                                } else {
                                  successMsgs.push('Inga utförda kontroller migrerade');
                                }
                              } catch(_e) {
                                successMsgs.push('Backup/migrering av utförda kontroller misslyckades');
                              }
                            }

                            if (rawDrafts) {
                              try {
                                await AsyncStorage.setItem('draft_controls_backup', rawDrafts);
                                const parsedDrafts = JSON.parse(rawDrafts);
                                let okDrafts = 0;
                                for (const d of parsedDrafts) {
                                  try {
                                    const ok = await saveDraftToFirestore(d);
                                    if (ok) okDrafts++;
                                  } catch(_e) {}
                                }
                                if (okDrafts > 0) {
                                  await AsyncStorage.removeItem('draft_controls');
                                  successMsgs.push(`${okDrafts} utkast migrerade`);
                                } else {
                                  successMsgs.push('Inga utkast migrerade');
                                }
                              } catch(_e) {
                                successMsgs.push('Backup/migrering av utkast misslyckades');
                              }
                            }

                            Alert.alert('Migrering klar', successMsgs.join('\n'));
                            await refreshLocalFallbackFlag();
                          } catch(_e) {
                            Alert.alert('Fel', 'Kunde inte migrera: ' + (_e?.message || 'okänt fel'));
                          }
                        }}
                      ],
                    );
                  } catch(_e) {
                    Alert.alert('Fel', 'Kunde inte läsa lokal data.');
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Migrera lokal data</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (auth && auth.currentUser) && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    // Force refresh token
                    await auth.currentUser.getIdToken(true);
                    showAlert('Token uppdaterad', 'ID-token uppdaterad. Försöker migrera lokal data...');
                    // attempt migration if local data exists
                    const raw = await AsyncStorage.getItem('hierarchy_local');
                    if (!raw) {
                      showAlert('Ingen lokal data', 'Inget att migrera.');
                      await refreshLocalFallbackFlag();
                      return;
                    }
                    const parsed = JSON.parse(raw);
                    const res = await saveHierarchy(companyId, parsed);
                    const ok = res === true || (res && res.ok === true);
                      if (ok) {
                      await AsyncStorage.removeItem('hierarchy_local');
                      await refreshLocalFallbackFlag();
                      setHierarchy(parsed);
                      showAlert('Klar', 'Lokal hierarki migrerad till molnet.');
                    } else {
                      showAlert('Misslyckades', 'Kunde inte spara till molnet. Fel: ' + (res && res.error ? res.error : 'okänt fel'));
                    }
                  } catch(_e) {
                    showAlert('Fel', 'Kunde inte uppdatera token eller migrera: ' + (_e?.message || _e));
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Uppdatera token & synka</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    const user = auth.currentUser;
                    const tokenRes = user ? await auth.currentUser.getIdTokenResult(true).catch((e) => null) : null;
                    const claims = tokenRes?.claims || {};
                    const stored = await AsyncStorage.getItem('dk_companyId');
                    showAlert('Auth info', `user: ${user ? user.email + ' (' + user.uid + ')' : 'not signed in'}\nclaims.companyId: ${claims.companyId || '—'}\ndk_companyId: ${stored || '—'}`);
                  } catch(_e) {
                    showAlert('Fel', 'Kunde inte läsa auth info: ' + (_e?.message || _e));
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa auth-info</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await dumpLocalRemoteControls(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Debug: visa lokal/moln</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await showLastFsError(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa senaste FS-fel</Text>
              </TouchableOpacity>
            )}
          </View>

        </View>
        {/* Allt under headern är skrollbart */}
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: leftWidth, padding: 8, borderRightWidth: 0, borderColor: '#e6e6e6', backgroundColor: '#f5f6f7', height: webPaneHeight, position: 'relative' }}>
                    {/* Thin right-side divider for visual separation */}
                    <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
                    {/* Draggable handle - sits above the divider */}
                    <View
                  {...(panResponder && panResponder.panHandlers)}
                  style={Platform.OS === 'web' ? { position: 'absolute', right: -8, top: 0, bottom: 0, width: 16, cursor: 'col-resize', zIndex: 9 } : { position: 'absolute', right: -12, top: 0, bottom: 0, width: 24, zIndex: 9 }}
                    />
              <View style={{ paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 2, borderColor: '#e0e0e0', marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#222' }}>Projekt</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
                    onPress={() => {
                      setSpinSidebarHome((n) => n + 1);
                      if (selectedProject) closeSelectedProject();
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Hem"
                  >
                    <Ionicons
                      name="home-outline"
                      size={18}
                      color="#1976D2"
                      style={{
                        transform: [{ rotate: `${spinSidebarHome * 360}deg` }],
                        transitionProperty: 'transform',
                        transitionDuration: '0.4s',
                        transitionTimingFunction: 'ease',
                      }}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
                    onPress={() => {
                      setSpinSidebarRefresh((n) => n + 1);
                      if (selectedProject) {
                        setProjectControlsRefreshNonce((n) => n + 1);
                      } else {
                        try { loadDashboard(); } catch(_e) {}
                      }
                    }}
                    activeOpacity={0.7}
                    accessibilityLabel="Uppdatera"
                  >
                    <Ionicons
                      name="refresh"
                      size={18}
                      color="#1976D2"
                      style={{
                        transform: [{ rotate: `${spinSidebarRefresh * 360}deg` }],
                        transitionProperty: 'transform',
                        transitionDuration: '0.4s',
                        transitionTimingFunction: 'ease',
                      }}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
                    onPress={() => {
                      setSpinSidebarFilter((n) => n + 1);
                      setFilterModalVisible(true);
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={{ position: 'relative' }}>
                      <Ionicons
                        name="filter"
                        size={18}
                        color="#1976D2"
                        style={{
                          transform: [{ rotate: `${spinSidebarFilter * 360}deg` }],
                          transitionProperty: 'transform',
                          transitionDuration: '0.4s',
                          transitionTimingFunction: 'ease',
                        }}
                      />
                      {projectStatusFilter !== 'all' && (
                        <View
                          style={{
                            position: 'absolute',
                            right: -1,
                            top: -1,
                            width: 9,
                            height: 9,
                            borderRadius: 5,
                            backgroundColor: projectStatusFilter === 'completed' ? '#222' : '#43A047',
                            borderWidth: 1,
                            borderColor: '#f5f6f7',
                          }}
                        />
                      )}
                    </View>
                  </TouchableOpacity>

                  
                </View>
              </View>
              <ScrollView ref={leftTreeScrollRef} style={{ flex: 1 }}>
                {loadingHierarchy || hierarchy.length === 0 ? (
                  <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                    Inga mappar eller projekt skapade ännu.
                  </Text>
                ) : (
                  <View style={{ paddingHorizontal: 4 }} nativeID={Platform.OS === 'web' ? 'dk-tree-root' : undefined}>
                    {[...hierarchy]
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                      .map((main) => (
                        <View key={main.id} style={{ marginBottom: 0, padding: 0 }}>
                          <View
                            style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 0 2px 4px', userSelect: 'none' }}
                            dataSet={Platform.OS === 'web' ? { dkType: 'main', dkMainid: String(main.id) } : undefined}
                          >
                            {(() => {
                              const isHovered = Platform.OS === 'web' && hoveredRowKey === getRowKey('main', String(main.id));
                              return (
                            <TouchableOpacity
                              dataSet={Platform.OS === 'web' ? { dkType: 'main', dkMainid: String(main.id) } : undefined}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                flex: 1,
                                backgroundColor: isHovered ? '#eee' : 'transparent',
                                borderRadius: 4,
                                padding: '2px 4px',
                                borderWidth: 1,
                                borderColor: isHovered ? '#1976D2' : 'transparent',
                                transition: 'background 0.15s, border 0.15s',
                              }}
                              onPress={() => handleToggleMainFolder(main.id)}
                              activeOpacity={0.7}
                              onLongPress={() => setEditModal({ visible: true, type: 'main', id: main.id, name: main.name })}
                              delayLongPress={2000}
                              onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey(getRowKey('main', String(main.id))) : undefined}
                              onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey(null) : undefined}
                              onPressIn={() => {
                                if (mainTimersRef.current[main.id]) clearTimeout(mainTimersRef.current[main.id]);
                                mainTimersRef.current[main.id] = setTimeout(() => {
                                  setEditModal({ visible: true, type: 'main', id: main.id, name: main.name });
                                }, 2000);
                              }}
                              onPressOut={() => {
                                if (mainTimersRef.current[main.id]) clearTimeout(mainTimersRef.current[main.id]);
                              }}
                            >
                              <Ionicons
                                name={main.expanded ? 'chevron-down' : 'chevron-forward'}
                                size={18}
                                color="#222"
                                style={{
                                  marginRight: 4,
                                  transform: Platform.OS === 'web' ? [{ rotate: `${(spinMain[main.id] || 0) * 360}deg` }] : undefined,
                                  transitionProperty: Platform.OS === 'web' ? 'transform' : undefined,
                                  transitionDuration: Platform.OS === 'web' ? '0.35s' : undefined,
                                  transitionTimingFunction: Platform.OS === 'web' ? 'ease' : undefined,
                                }}
                              />
                              <Text style={{ fontSize: 15, fontWeight: isHovered ? '700' : '600', color: '#222', marginLeft: 2 }}>{main.name}</Text>
                            </TouchableOpacity>
                              );
                            })()}
                          </View>
                          {main.expanded && (
                            !main.children || main.children.length === 0 ? (
                              <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 22, marginTop: 6 }}>
                                Inga undermappar skapade
                              </Text>
                            ) : (
                              [...main.children]
                                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                .map((sub) => {
                                  const allProjects = sub.children ? sub.children.filter(child => child.type === 'project') : [];
                                  const projects = projectStatusFilter === 'all'
                                    ? allProjects
                                    : allProjects.filter((p) => {
                                        const status = p?.status || 'ongoing';
                                        return projectStatusFilter === 'completed'
                                          ? status === 'completed'
                                          : status !== 'completed';
                                      });
                                  return (
                                    <View key={sub.id} style={{ marginLeft: 20, marginBottom: 0, padding: 0 }}>
                                  <View
                                    style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 0 2px 0', userSelect: 'none' }}
                                    dataSet={Platform.OS === 'web' ? { dkType: 'sub', dkMainid: String(main.id), dkSubid: String(sub.id) } : undefined}
                                  >
                                    {(() => {
                                      const isHovered = Platform.OS === 'web' && hoveredRowKey === getRowKey('sub', String(main.id), String(sub.id));
                                      return (
                                    <TouchableOpacity
                                      dataSet={Platform.OS === 'web' ? { dkType: 'sub', dkMainid: String(main.id), dkSubid: String(sub.id) } : undefined}
                                      style={{
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        flex: 1,
                                        backgroundColor: isHovered ? '#eee' : 'transparent',
                                        borderRadius: 4,
                                        padding: '2px 4px',
                                        borderWidth: 1,
                                        borderColor: isHovered ? '#1976D2' : 'transparent',
                                        transition: 'background 0.15s, border 0.15s',
                                      }}
                                      onPress={() => handleToggleSubFolder(sub.id)}
                                      onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                      delayLongPress={2000}
                                      activeOpacity={0.7}
                                      onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey(getRowKey('sub', String(main.id), String(sub.id))) : undefined}
                                      onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey(null) : undefined}
                                    >
                                      <Ionicons
                                        name={sub.expanded ? 'chevron-down' : 'chevron-forward'}
                                        size={16}
                                        color="#222"
                                        style={{
                                          marginRight: 4,
                                          transform: Platform.OS === 'web' ? [{ rotate: `${(spinSub[sub.id] || 0) * 360}deg` }] : undefined,
                                          transitionProperty: Platform.OS === 'web' ? 'transform' : undefined,
                                          transitionDuration: Platform.OS === 'web' ? '0.35s' : undefined,
                                          transitionTimingFunction: Platform.OS === 'web' ? 'ease' : undefined,
                                        }}
                                      />
                                      <Text style={{ fontSize: 14, fontWeight: isHovered ? '700' : '600', color: '#222', marginLeft: 2 }}>{sub.name}</Text>
                                    </TouchableOpacity>
                                      );
                                    })()}
                                  </View>
                                  {sub.expanded && (
                                    <React.Fragment>
                                      {projects.length === 0 ? (
                                        <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                          {allProjects.length === 0 ? 'Inga projekt skapade' : 'Inga projekt matchar filtret'}
                                        </Text>
                                      ) : (
                                        projects
                                          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                          .map((proj) => (
                                            <View
                                              key={proj.id}
                                              style={{ marginLeft: 32 }}
                                              dataSet={Platform.OS === 'web' ? { dkType: 'project', dkMainid: String(main.id), dkSubid: String(sub.id), dkProjectid: String(proj.id) } : undefined}
                                            >
                                              {(() => {
                                                const isHovered = Platform.OS === 'web' && hoveredRowKey === getRowKey('project', String(main.id), String(sub.id), String(proj.id));
                                                return (
                                              <TouchableOpacity
                                                dataSet={Platform.OS === 'web' ? { dkType: 'project', dkMainid: String(main.id), dkSubid: String(sub.id), dkProjectid: String(proj.id) } : undefined}
                                                style={{
                                                  flexDirection: 'row',
                                                  alignItems: 'center',
                                                  backgroundColor: isHovered ? '#eee' : 'transparent',
                                                  borderRadius: 4,
                                                  padding: '2px 4px',
                                                  marginBottom: 0,
                                                  borderWidth: 1,
                                                  borderColor: isHovered ? '#1976D2' : 'transparent',
                                                  transition: 'background 0.15s, border 0.15s',
                                                }}
                                                onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey(getRowKey('project', String(main.id), String(sub.id), String(proj.id))) : undefined}
                                                onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey(null) : undefined}
                                                onPress={() => {
                                                  if (Platform.OS === 'web') {
                                                    requestProjectSwitch(proj, { selectedAction: null, path: { mainId: String(main.id), subId: String(sub.id), mainName: String(main.name || ''), subName: String(sub.name || '') } });
                                                  } else {
                                                    navigation.navigate('ProjectDetails', {
                                                      project: {
                                                        id: proj.id,
                                                        name: proj.name,
                                                        ansvarig: proj.ansvarig || '',
                                                        adress: proj.adress || '',
                                                        fastighetsbeteckning: proj.fastighetsbeteckning || '',
                                                        client: proj.client || '',
                                                        status: proj.status || 'ongoing',
                                                        createdAt: proj.createdAt || '',
                                                        createdBy: proj.createdBy || ''
                                                      },
                                                      companyId
                                                    });
                                                  }
                                                }}
                                              >
                                                <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 6, borderWidth: 1, borderColor: '#bbb' }} />
                                                <Text
                                                  style={{ fontSize: 13, color: '#1976D2', fontWeight: isHovered ? '700' : '400', marginLeft: 2, marginRight: 6, flexShrink: 1 }}
                                                  numberOfLines={1}
                                                  ellipsizeMode="tail"
                                                >
                                                  {proj.id} — {proj.name}
                                                </Text>
                                              </TouchableOpacity>
                                                );
                                              })()}
                                            </View>
                                          ))
                                      )}
                                    </React.Fragment>
                                  )}
                                </View>
                                  );
                                })
                            )
                          )}
                        </View>
                      ))}
                  </View>
                )}
              </ScrollView>

              {Platform.OS === 'web' && (
                <ContextMenu
                  visible={contextMenu.visible}
                  x={contextMenu.x}
                  y={contextMenu.y}
                  items={contextMenuItems}
                  onSelect={handleContextMenuSelect}
                  onClose={closeContextMenu}
                />
              )}
              
              {/* Sidebar bottom-left: sync status + app version (web portal to avoid clipping) */}
              {Platform.OS === 'web' && createPortal && typeof document !== 'undefined' ? (() => {
                try {
                  let footerRoot = document.getElementById('dk-footer-portal');
                  if (!footerRoot) {
                    footerRoot = document.createElement('div');
                    footerRoot.id = 'dk-footer-portal';
                    document.body.appendChild(footerRoot);
                  }

                  const FooterBox = (
                    <View style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2147483647, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.96)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 12, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                          Synk: {syncStatus}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>Version: {appVersion} ({BUILD_STAMP})</Text>
                      </View>
                    </View>
                  );

                  return createPortal(FooterBox, footerRoot);
                } catch(_e) {
                    return (
                    <View style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 9999, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', elevation: 8, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                          Synk: {syncStatus}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Version: {appVersion} ({BUILD_STAMP})</Text>
                      </View>
                    </View>
                  );
                }
              })() : (
                <View style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 9999, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', elevation: 8, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                      Synk: {syncStatus}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Version: {appVersion} ({BUILD_STAMP})</Text>
                  </View>
                </View>
              )}

            </View>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                onPress={() => scrollToEndSafe(leftTreeScrollRef)}
                activeOpacity={0.85}
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 10,
                  zIndex: 20,
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  padding: 6,
                }}
              >
                <Ionicons name="chevron-down" size={18} color="#222" />
              </TouchableOpacity>
            )}

            <View style={{ flex: 1, height: webPaneHeight, position: 'relative' }}>
              {Platform.OS === 'web' ? (
                <View style={{ flex: 1, flexDirection: 'row', minWidth: 0 }}>
                  {/* Main content (dashboard / project / control) */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ScrollView ref={rightPaneScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                      {inlineControlEditor && inlineControlEditor.project ? (
                        <View style={{ flex: 1, padding: 18 }}>
                          <TemplateControlScreen
                            project={inlineControlEditor.project}
                            controlType={inlineControlEditor.controlType}
                            route={{ params: { templateId: inlineControlEditor.templateId || null, companyId } }}
                            onExit={closeInlineControlEditor}
                            onFinished={handleInlineControlFinished}
                          />
                        </View>
                      ) : selectedProject ? (
                        <View style={{ flex: 1 }}>
                          <ProjectDetails route={{ params: { project: selectedProject, companyId, selectedAction: projectSelectedAction, onInlineLockChange: handleInlineLockChange, onInlineViewChange: handleInlineViewChange } }} navigation={navigation} inlineClose={closeSelectedProject} refreshNonce={projectControlsRefreshNonce} />
                        </View>
                      ) : (
                        <View style={{ flex: 1, padding: 18 }}>
                          <View style={{ position: 'relative' }}>
                            {Platform.OS === 'web' && dashboardFocus ? (
                              <Pressable
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                                onPress={() => { setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }}
                              />
                            ) : null}

                            <View style={dashboardContainerStyle}>
                              {Platform.OS === 'web' ? (
                                <View style={{ marginBottom: 14, marginTop: 2 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 36, flexWrap: 'wrap' }}>
                                    <TouchableOpacity
                                      activeOpacity={0.9}
                                      onPress={() => { console.log('Dashboard button 1 clicked'); }}
                                      style={{ borderRadius: 14, overflow: 'hidden', width: 380, height: 180, backgroundColor: '#fff' }}
                                    >
                                      <Image
                                        source={dashboardBtn1Url && !dashboardBtn1Failed ? { uri: dashboardBtn1Url } : require('../assets/images/partial-react-logo.png')}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="cover"
                                        onError={() => { try { setDashboardBtn1Failed(true); } catch(_e) {} }}
                                        onLoad={() => { try { setDashboardBtn1Failed(false); } catch(_e) {} }}
                                      />
                                    </TouchableOpacity>

                                    <TouchableOpacity
                                      activeOpacity={0.9}
                                      onPress={() => { console.log('Dashboard button 2 clicked'); }}
                                      style={{ borderRadius: 14, overflow: 'hidden', width: 380, height: 180, backgroundColor: '#fff' }}
                                    >
                                      <Image
                                        source={dashboardBtn2Url && !dashboardBtn2Failed ? { uri: dashboardBtn2Url } : require('../assets/images/partial-react-logo.png')}
                                        style={{ width: '100%', height: '100%' }}
                                        resizeMode="cover"
                                        onError={() => { try { setDashboardBtn2Failed(true); } catch(_e) {} }}
                                        onLoad={() => { try { setDashboardBtn2Failed(false); } catch(_e) {} }}
                                      />
                                    </TouchableOpacity>
                                  </View>
                                </View>
                              ) : null}
                            <View style={dashboardColumnsStyle}>
                              {/* Column 1: Continue */}
                              <View style={{ flex: 1, minWidth: 360, marginRight: 16 }}>
                                <Text style={[dashboardSectionTitleStyle, { marginTop: 12 }]}>Senaste projekten</Text>
                                <View style={dashboardCardStyle}>
                                  {dashboardLoading ? (
                                    <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
                                  ) : (dashboardRecentProjects || []).length === 0 ? (
                                    <Text style={dashboardEmptyTextStyle}>Inga senaste projekt ännu.</Text>
                                  ) : (
                                    (dashboardRecentProjects || []).map((entry, idx) => (
                                      <TouchableOpacity
                                        key={`${entry.projectId}-${idx}`}
                                        activeOpacity={0.85}
                                        onPress={() => {
                                          if (entry?.project) {
                                            requestProjectSwitch(entry.project, { selectedAction: null });
                                          }
                                        }}
                                        style={dashboardListItemStyle(idx)}
                                      >
                                        <Text style={dashboardLinkTitleStyle} numberOfLines={1}>
                                          {entry.project.id} — {entry.project.name}
                                        </Text>
                                        <Text style={dashboardMetaTextStyle}>
                                          Senast aktivitet: {formatRelativeTime(entry.ts)}
                                        </Text>
                                      </TouchableOpacity>
                                    ))
                                  )}
                                </View>
                              </View>

                              <View style={{ width: 320, minWidth: 280, position: 'relative' }}>
                                {/* Overview moved to right-hand ActivityPanel on web */}

                                <Text style={[dashboardSectionTitleStyle, { marginTop: 12 }]}>Påminnelser</Text>
                                <View
                                  style={[dashboardCardStyle, { padding: 16, marginBottom: 16 }]}
                                  onLayout={Platform.OS === 'web' ? (e) => { dashboardCardLayoutRef.current.reminders = e?.nativeEvent?.layout || null; } : undefined}
                                >
                                  {[
                                    {
                                      key: 'remindersSkyddsrondUpcoming',
                                      label: 'Kommande skyddsronder',
                                      color: '#FFD600',
                                      value: (dashboardOverview.skyddsrondDueSoon ?? 0) + (dashboardOverview.skyddsrondOverdue ?? 0),
                                      focus: 'upcomingSkyddsrond',
                                    },
                                    { key: 'remindersOpenDeviations', label: 'Öppna avvikelser', color: '#FFD600', value: dashboardOverview.openDeviations, focus: 'openDeviations' },
                                    { key: 'remindersDrafts', label: 'Sparade utkast', color: '#888', value: dashboardOverview.drafts, focus: 'drafts' },
                                  ].map((row, ridx) => {
                                    const isWeb = Platform.OS === 'web';
                                    const isHovered = isWeb && dashboardHoveredStatKey === row.key;
                                    const isOpen = isWeb && dashboardFocus === row.focus && dashboardDropdownAnchor === 'reminders';
                                    const openFromRow = () => {
                                      const cardLayout = dashboardCardLayoutRef.current.reminders;
                                      const rowLayout = dashboardStatRowLayoutRef.current[`reminders:${row.key}`];
                                      // Position top flush under the row (no extra gap)
                                      const top = (cardLayout && rowLayout) ? (cardLayout.y + rowLayout.y + rowLayout.height) : undefined;
                                      console.log && console.log('dashboard: reminders row press', row.key, row.focus, { cardLayout, rowLayout, top });
                                      setDashboardHoveredStatKey(row.key);
                                      setDashboardDropdownRowKey(row.key);
                                      toggleDashboardFocus(row.focus, 'reminders', top);
                                    };
                                    return (
                                      <TouchableOpacity
                                        key={row.key}
                                        style={{
                                          ...dashboardStatRowStyle(ridx),
                                          paddingHorizontal: 6,
                                          borderRadius: 8,
                                          borderWidth: 1,
                                          borderColor: isHovered ? '#1976D2' : 'transparent',
                                          backgroundColor: isHovered ? '#eee' : 'transparent',
                                          cursor: isWeb ? 'pointer' : undefined,
                                          transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
                                        }}
                                        activeOpacity={0.75}
                                        onPress={openFromRow}
                                        onMouseEnter={isWeb ? () => setDashboardHoveredStatKey(row.key) : undefined}
                                        onMouseLeave={isWeb ? () => setDashboardHoveredStatKey(null) : undefined}
                                        onLayout={isWeb ? (e) => {
                                          const l = e?.nativeEvent?.layout;
                                          if (l) dashboardStatRowLayoutRef.current[`reminders:${row.key}`] = l;
                                        } : undefined}
                                      >
                                        <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 6 }} />
                                        <View style={dashboardStatDotStyle(row.color)} />
                                        <Text style={dashboardStatLabelStyle}>{row.label}</Text>
                                        <Text style={dashboardStatValueStyle}>{String(row.value ?? 0)}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>

                                {/* Web-only: dropdown overlay for Reminders (renders in center column) */}
                                {Platform.OS === 'web' && dashboardFocus && dashboardDropdownAnchor === 'reminders' ? (
                                  <View
                                    style={(function() {
                                      try {
                                        const card = dashboardCardLayoutRef && dashboardCardLayoutRef.current && dashboardCardLayoutRef.current.reminders;
                                        const rKey = dashboardDropdownRowKey;
                                        const rowLayout = rKey ? dashboardStatRowLayoutRef.current[`reminders:${rKey}`] : null;
                                        const NUDGE_DOWN = 28; // small downward nudge so header/title remains visible
                                        // align to row/button when possible and position dropdown below the row (dropdown top == row bottom + nudge)
                                        if (rowLayout && typeof rowLayout.x === 'number' && typeof rowLayout.width === 'number' && card && typeof rowLayout.y === 'number' && typeof rowLayout.height === 'number') {
                                          const topPos = rowLayout.y + rowLayout.height + NUDGE_DOWN;
                                          console.log && console.log('dashboard reminders overlay positioning (top)', { cardHeight: card.height, rowY: rowLayout.y, rowHeight: rowLayout.height, top: topPos });
                                          return { position: 'absolute', left: rowLayout.x, width: rowLayout.width, top: topPos, zIndex: 20 };
                                        }

                                        // fallback: place dropdown under the card
                                        if (card && typeof card.width === 'number' && typeof card.height === 'number') return { position: 'absolute', left: 0, width: card.width, top: card.height, zIndex: 20 };
                                      } catch (e) {}
                                      return { position: 'absolute', left: 0, right: 0, top: 218, zIndex: 20 };
                                    })()}
                                  >
                                    <View style={[dashboardCardStyle, { paddingTop: 0, borderTopLeftRadius: 0, borderTopRightRadius: 0 }]}> 
                                      <ScrollView
                                        style={{
                                          maxHeight: Math.max(
                                            180,
                                            (webPaneHeight || 640) -
                                              (typeof dashboardDropdownTop === 'number' ? dashboardDropdownTop : 220) -
                                              24
                                          ),
                                          paddingTop: 0,
                                        }}
                                      >
                                        {dashboardLoading ? (
                                          <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
                                        ) : (
                                          (() => {
                                            const focus = dashboardFocus;

                                            if (focus === 'activeProjects') {
                                              const items = Array.isArray(dashboardActiveProjectsList) ? dashboardActiveProjectsList : [];
                                              if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga pågående projekt.</Text>;
                                              return items.map((p, idx) => (
                                                <TouchableOpacity
                                                  key={`${p.id}-${idx}`}
                                                  activeOpacity={0.85}
                                                  onPress={() => { requestProjectSwitch(p, { selectedAction: null }); setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }}
                                                  style={dashboardListItemStyle(idx)}
                                                >
                                                  <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p.id} — {p.name}</Text>
                                                </TouchableOpacity>
                                              ));
                                            }

                                            if (focus === 'drafts' || focus === 'controlsToSign') {
                                              const items = focus === 'controlsToSign'
                                                ? (Array.isArray(dashboardControlsToSignItems) ? dashboardControlsToSignItems : [])
                                                : (Array.isArray(dashboardDraftItems) ? dashboardDraftItems : []);

                                              if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga utkast.</Text>;
                                              return items.map((d, idx) => {
                                                const pid = d?.project?.id || d?.projectId || d?.project || null;
                                                const projectId = pid ? String(pid) : '';
                                                const projObj = projectId ? findProjectById(projectId) : null;
                                                const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                                                const ts = d?.savedAt || d?.updatedAt || d?.createdAt || d?.date || null;
                                                const type = String(d?.type || 'Utkast');
                                                return (
                                                  <TouchableOpacity
                                                    key={`${projectId}-${type}-${idx}`}
                                                    activeOpacity={0.85}
                                                    onPress={() => {
                                                      if (!projObj) return;
                                                      requestProjectSwitch(projObj, {
                                                        selectedAction: {
                                                          id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                          kind: 'openDraft',
                                                          type,
                                                          initialValues: d,
                                                        },
                                                        clearActionAfter: true,
                                                      });
                                                      setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null);
                                                    }}
                                                    style={dashboardListItemStyle(idx)}
                                                  >
                                                    <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                                                    <Text style={dashboardMetaTextStyle}>{type}{ts ? ` • Sparat: ${formatRelativeTime(ts)}` : ''}</Text>
                                                  </TouchableOpacity>
                                                );
                                              });
                                            }

                                            if (focus === 'openDeviations') {
                                              const items = Array.isArray(dashboardOpenDeviationItems) ? dashboardOpenDeviationItems : [];
                                              if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga öppna avvikelser.</Text>;
                                              return items.map((entry, idx) => {
                                                const c = entry?.control;
                                                const pid = c?.project?.id || c?.projectId || c?.project || null;
                                                const projectId = pid ? String(pid) : '';
                                                const projObj = projectId ? findProjectById(projectId) : null;
                                                const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                                                const openCount = entry?.openCount || 0;
                                                return (
                                                  <TouchableOpacity
                                                    key={`${projectId}-${c?.id || idx}`}
                                                    activeOpacity={0.85}
                                                    onPress={() => {
                                                      if (!projObj || !c) return;
                                                      requestProjectSwitch(projObj, {
                                                        selectedAction: {
                                                          id: `openControl-${c?.id || Date.now()}`,
                                                          kind: 'openControlDetails',
                                                          control: c,
                                                        },
                                                        clearActionAfter: true,
                                                      });
                                                      setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null);
                                                    }}
                                                    style={dashboardListItemStyle(idx)}
                                                  >
                                                    <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                      <View style={[dashboardStatDotStyle('#FFD600'), { marginTop: 4 }]} />
                                                      <View style={{ flex: 1, minWidth: 0 }}>
                                                        <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                                                        <Text style={dashboardMetaTextStyle}>Skyddsrond • Öppna avvikelser: {String(openCount)}</Text>
                                                      </View>
                                                    </View>
                                                  </TouchableOpacity>
                                                );
                                              });
                                            }

                                            if (focus === 'upcomingSkyddsrond') {
                                              const items = Array.isArray(dashboardUpcomingSkyddsrondItems) ? dashboardUpcomingSkyddsrondItems : [];
                                              if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga kommande skyddsronder.</Text>;
                                              return items.map((entry, idx) => {
                                                const p = entry?.project;
                                                const dueMs = Number(entry?.nextDueMs || 0);
                                                const dueLabel = dueMs ? new Date(dueMs).toLocaleDateString('sv-SE') : '';
                                                const state = entry?.state === 'overdue' ? 'Försenad' : 'Snart';
                                                return (
                                                  <TouchableOpacity
                                                    key={`${p?.id || 'proj'}-${idx}`}
                                                    activeOpacity={0.85}
                                                    onPress={() => { if (p) requestProjectSwitch(p, { selectedAction: null }); setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }}
                                                    style={dashboardListItemStyle(idx)}
                                                  >
                                                    <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p?.id} — {p?.name}</Text>
                                                    <Text style={dashboardMetaTextStyle}>{state}{dueLabel ? ` • Nästa: ${dueLabel}` : ''}</Text>
                                                  </TouchableOpacity>
                                                );
                                              });
                                            }

                                            return <Text style={dashboardEmptyTextStyle}>Inget att visa.</Text>;
                                          })()
                                        )}
                                      </ScrollView>
                                    </View>
                                  </View>
                                ) : null}
                              </View>
                            </View>
                          </View>
                          </View>
                        </View>
                      )}
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => scrollToEndSafe(rightPaneScrollRef)}
                      activeOpacity={0.85}
                      style={{
                        position: 'absolute',
                        right: 10,
                        bottom: 10,
                        zIndex: 20,
                        backgroundColor: '#fff',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        padding: 6,
                      }}
                    >
                      <Ionicons name="chevron-down" size={18} color="#222" />
                    </TouchableOpacity>
                  </View>

                  {/* Persistent right side: activity */}
                  <View style={{ width: rightWidth, minWidth: 340, maxWidth: 520, padding: 18, borderLeftWidth: 1, borderLeftColor: '#e6e6e6', backgroundColor: '#F7FAFC', position: 'relative' }}>
                    {/* Divider for visual separation */}
                    <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
                    {/* Draggable handle - sits above the left divider of the right panel */}
                    <View
                      {...(panResponderRight && panResponderRight.panHandlers)}
                      style={Platform.OS === 'web' ? { position: 'absolute', left: -8, top: 0, bottom: 0, width: 16, cursor: 'col-resize', zIndex: 9 } : { position: 'absolute', left: -12, top: 0, bottom: 0, width: 24, zIndex: 9 }}
                    />
                    <ScrollView ref={activityScrollRef} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }}>
                      <ActivityPanel />
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => scrollToEndSafe(activityScrollRef)}
                      activeOpacity={0.85}
                      style={{
                        position: 'absolute',
                        right: 10,
                        bottom: 10,
                        zIndex: 20,
                        backgroundColor: '#fff',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        padding: 6,
                      }}
                    >
                      <Ionicons name="chevron-down" size={18} color="#222" />
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <ScrollView ref={rightPaneScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                  {selectedProject ? (
                    <View style={{ flex: 1 }}>
                      <ProjectDetails route={{ params: { project: selectedProject, companyId, selectedAction: projectSelectedAction, onInlineLockChange: handleInlineLockChange } }} navigation={navigation} inlineClose={closeSelectedProject} refreshNonce={projectControlsRefreshNonce} />
                    </View>
                  ) : (
                    <View style={{ flex: 1, padding: 18 }}>
                      <View style={dashboardContainerStyle}>
                        <View style={dashboardColumnsStyle}>
                          <View style={{ flex: 1, minWidth: 360, marginRight: 16 }}>
                            <Text style={[dashboardSectionTitleStyle, { marginTop: 12 }]}>Senaste projekten</Text>
                            <View style={dashboardCardStyle}>
                              {dashboardLoading ? (
                                <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
                              ) : (dashboardRecentProjects || []).length === 0 ? (
                                <Text style={dashboardEmptyTextStyle}>Inga senaste projekt ännu.</Text>
                              ) : (
                                (dashboardRecentProjects || []).map((entry, idx) => (
                                  <TouchableOpacity
                                    key={`${entry.projectId}-${idx}`}
                                    activeOpacity={0.85}
                                    onPress={() => {
                                      if (entry?.project) {
                                        requestProjectSwitch(entry.project, { selectedAction: null });
                                      }
                                    }}
                                    style={dashboardListItemStyle(idx)}
                                  >
                                    <Text style={dashboardLinkTitleStyle} numberOfLines={1}>
                                      {entry.project.id} — {entry.project.name}
                                    </Text>
                                    <Text style={dashboardMetaTextStyle}>
                                      Senast aktivitet: {formatRelativeTime(entry.ts)}
                                    </Text>
                                  </TouchableOpacity>
                                ))
                              )}
                            </View>

                            {dashboardFocus ? (
                              <View style={{ marginTop: 16 }}>
                                <Text style={dashboardSectionTitleStyle}>
                                  {dashboardFocus === 'activeProjects'
                                    ? 'Pågående projekt'
                                    : dashboardFocus === 'controlsToSign'
                                      ? 'Kontroller att signera'
                                      : dashboardFocus === 'drafts'
                                        ? 'Sparade utkast'
                                        : dashboardFocus === 'openDeviations'
                                          ? 'Öppna avvikelser'
                                          : dashboardFocus === 'upcomingSkyddsrond'
                                            ? 'Kommande skyddsronder'
                                            : 'Lista'}
                                </Text>
                                <View style={dashboardCardStyle}>
                                  {dashboardLoading ? (
                                    <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
                                  ) : (
                                    (() => {
                                      const focus = dashboardFocus;

                                      if (focus === 'activeProjects') {
                                        const items = Array.isArray(dashboardActiveProjectsList) ? dashboardActiveProjectsList : [];
                                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga pågående projekt.</Text>;
                                        return items.map((p, idx) => (
                                          <TouchableOpacity
                                            key={`${p.id}-${idx}`}
                                            activeOpacity={0.85}
                                            onPress={() => requestProjectSwitch(p, { selectedAction: null })}
                                            style={dashboardListItemStyle(idx)}
                                          >
                                            <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p.id} — {p.name}</Text>
                                          </TouchableOpacity>
                                        ));
                                      }

                                      if (focus === 'drafts' || focus === 'controlsToSign') {
                                        const items = focus === 'controlsToSign'
                                          ? (Array.isArray(dashboardControlsToSignItems) ? dashboardControlsToSignItems : [])
                                          : (Array.isArray(dashboardDraftItems) ? dashboardDraftItems : []);

                                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga utkast.</Text>;
                                        return items.map((d, idx) => {
                                          const pid = d?.project?.id || d?.projectId || d?.project || null;
                                          const projectId = pid ? String(pid) : '';
                                          const projObj = projectId ? findProjectById(projectId) : null;
                                          const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                                          const ts = d?.savedAt || d?.updatedAt || d?.createdAt || d?.date || null;
                                          const type = String(d?.type || 'Utkast');
                                          return (
                                            <TouchableOpacity
                                              key={`${projectId}-${type}-${idx}`}
                                              activeOpacity={0.85}
                                              onPress={() => {
                                                if (!projObj) return;
                                                requestProjectSwitch(projObj, {
                                                  selectedAction: {
                                                    id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                    kind: 'openDraft',
                                                    type,
                                                    initialValues: d,
                                                  },
                                                  clearActionAfter: true,
                                                });
                                              }}
                                              style={dashboardListItemStyle(idx)}
                                            >
                                              <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                                              <Text style={dashboardMetaTextStyle}>{type}{ts ? ` • Sparat: ${formatRelativeTime(ts)}` : ''}</Text>
                                            </TouchableOpacity>
                                          );
                                        });
                                      }

                                      if (focus === 'openDeviations') {
                                        const items = Array.isArray(dashboardOpenDeviationItems) ? dashboardOpenDeviationItems : [];
                                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga öppna avvikelser.</Text>;
                                        return items.map((entry, idx) => {
                                          const c = entry?.control;
                                          const pid = c?.project?.id || c?.projectId || c?.project || null;
                                          const projectId = pid ? String(pid) : '';
                                          const projObj = projectId ? findProjectById(projectId) : null;
                                          const title = projObj ? `${projObj.id} — ${projObj.name}` : (projectId || 'Projekt');
                                          const openCount = entry?.openCount || 0;
                                          return (
                                            <TouchableOpacity
                                              key={`${projectId}-${c?.id || idx}`}
                                              activeOpacity={0.85}
                                              onPress={() => {
                                                if (!projObj || !c) return;
                                                requestProjectSwitch(projObj, {
                                                  selectedAction: {
                                                    id: `openControl-${c?.id || Date.now()}`,
                                                    kind: 'openControlDetails',
                                                    control: c,
                                                  },
                                                  clearActionAfter: true,
                                                });
                                              }}
                                              style={dashboardListItemStyle(idx)}
                                            >
                                              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                                                <View style={[dashboardStatDotStyle('#FFD600'), { marginTop: 4 }]} />
                                                <View style={{ flex: 1, minWidth: 0 }}>
                                                  <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{title}</Text>
                                                  <Text style={dashboardMetaTextStyle}>Skyddsrond • Öppna avvikelser: {String(openCount)}</Text>
                                                </View>
                                              </View>
                                            </TouchableOpacity>
                                          );
                                        });
                                      }

                                      if (focus === 'upcomingSkyddsrond') {
                                        const items = Array.isArray(dashboardUpcomingSkyddsrondItems) ? dashboardUpcomingSkyddsrondItems : [];
                                        if (items.length === 0) return <Text style={dashboardEmptyTextStyle}>Inga kommande skyddsronder.</Text>;
                                        return items.map((entry, idx) => {
                                          const p = entry?.project;
                                          const dueMs = Number(entry?.nextDueMs || 0);
                                          const dueLabel = dueMs ? new Date(dueMs).toLocaleDateString('sv-SE') : '';
                                          const state = entry?.state === 'overdue' ? 'Försenad' : 'Snart';
                                          return (
                                            <TouchableOpacity
                                              key={`${p?.id || 'proj'}-${idx}`}
                                              activeOpacity={0.85}
                                              onPress={() => { if (p) requestProjectSwitch(p, { selectedAction: null }); }}
                                              style={dashboardListItemStyle(idx)}
                                            >
                                              <Text style={dashboardLinkTitleStyle} numberOfLines={1}>{p?.id} — {p?.name}</Text>
                                              <Text style={dashboardMetaTextStyle}>{state}{dueLabel ? ` • Nästa: ${dueLabel}` : ''}</Text>
                                            </TouchableOpacity>
                                          );
                                        });
                                      }

                                      return <Text style={dashboardEmptyTextStyle}>Inget att visa.</Text>;
                                    })()
                                  )}
                                </View>
                              </View>
                            ) : null}
                          </View>
                          <View style={{ width: 320, minWidth: 280 }}>
                            <Text style={dashboardSectionTitleStyle}>Översikt</Text>
                            <View style={[dashboardCardStyle, { padding: 16, marginBottom: 16 }]}>
                              {[
                                { key: 'activeProjects', label: 'Pågående projekt', color: '#43A047', value: dashboardOverview.activeProjects, focus: 'activeProjects', onPress: () => { toggleDashboardFocus('activeProjects'); } },
                                { key: 'completedProjects', label: 'Avslutade projekt', color: '#222', value: (_countProjectStatus ? _countProjectStatus(hierarchy).completed : 0), focus: 'completedProjects', onPress: () => { toggleDashboardFocus('completedProjects'); } },
                                { key: 'controlsToSign', label: 'Kontroller att signera', color: '#D32F2F', value: dashboardOverview.controlsToSign, focus: 'controlsToSign', onPress: () => toggleDashboardFocus('controlsToSign') },
                                { key: 'drafts', label: 'Sparade utkast', color: '#888', value: dashboardOverview.drafts, focus: 'drafts', onPress: () => toggleDashboardFocus('drafts') },
                              ].map((row, ridx) => {
                                const isWeb = Platform.OS === 'web';
                                const isHovered = isWeb && dashboardHoveredStatKey === row.key;
                                const isOpen = !isWeb && dashboardFocus === row.focus;
                                return (
                                  <TouchableOpacity
                                    key={row.key}
                                    style={{
                                      ...dashboardStatRowStyle(ridx),
                                      paddingHorizontal: 6,
                                      borderRadius: 8,
                                      borderWidth: 1,
                                      borderColor: isHovered ? '#1976D2' : 'transparent',
                                      backgroundColor: isHovered ? '#eee' : 'transparent',
                                      cursor: isWeb ? 'pointer' : undefined,
                                      transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
                                    }}
                                    activeOpacity={0.75}
                                    onPress={row.onPress}
                                    onMouseEnter={isWeb ? () => setDashboardHoveredStatKey(row.key) : undefined}
                                    onMouseLeave={isWeb ? () => setDashboardHoveredStatKey(null) : undefined}
                                  >
                                    {!isWeb ? <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 6 }} /> : null}
                                    <View style={dashboardStatDotStyle(row.color)} />
                                    <Text style={dashboardStatLabelStyle}>{row.label}</Text>
                                    <Text style={dashboardStatValueStyle}>{String(row.value ?? 0)}</Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </View>

                            {Platform.OS === 'web' ? null : (
                              <>
                                <Text style={[dashboardSectionTitleStyle, { marginTop: 12 }]}>Påminnelser</Text>
                                <View style={[dashboardCardStyle, { padding: 16, marginBottom: 16 }]}>
                                  {[
                                    {
                                      key: 'remindersSkyddsrondUpcoming',
                                      label: 'Kommande skyddsronder',
                                      color: '#FFD600',
                                      value: (dashboardOverview.skyddsrondDueSoon ?? 0) + (dashboardOverview.skyddsrondOverdue ?? 0),
                                      focus: 'upcomingSkyddsrond',
                                      onPress: () => toggleDashboardFocus('upcomingSkyddsrond'),
                                    },
                                    { key: 'remindersOpenDeviations', label: 'Öppna avvikelser', color: '#FFD600', value: dashboardOverview.openDeviations, focus: 'openDeviations', onPress: () => toggleDashboardFocus('openDeviations') },
                                    { key: 'remindersDrafts', label: 'Sparade utkast', color: '#888', value: dashboardOverview.drafts, focus: 'drafts', onPress: () => toggleDashboardFocus('drafts') },
                                  ].map((row, ridx) => {
                                    const isWeb = Platform.OS === 'web';
                                    const isHovered = isWeb && dashboardHoveredStatKey === row.key;
                                    const isOpen = !isWeb && dashboardFocus === row.focus;
                                    return (
                                      <TouchableOpacity
                                        key={row.key}
                                        style={{
                                          ...dashboardStatRowStyle(ridx),
                                          paddingHorizontal: 6,
                                          borderRadius: 8,
                                          borderWidth: 1,
                                          borderColor: isHovered ? '#1976D2' : 'transparent',
                                          backgroundColor: isHovered ? '#eee' : 'transparent',
                                          cursor: isWeb ? 'pointer' : undefined,
                                          transition: isWeb ? 'background 0.15s, border 0.15s' : undefined,
                                        }}
                                        activeOpacity={0.75}
                                        onPress={row.onPress}
                                        onMouseEnter={isWeb ? () => setDashboardHoveredStatKey(row.key) : undefined}
                                        onMouseLeave={isWeb ? () => setDashboardHoveredStatKey(null) : undefined}
                                      >
                                        {!isWeb ? <Ionicons name={isOpen ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 6 }} /> : null}
                                        <View style={dashboardStatDotStyle(row.color)} />
                                        <Text style={dashboardStatLabelStyle}>{row.label}</Text>
                                        <Text style={dashboardStatValueStyle}>{String(row.value ?? 0)}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </View>
                              </>
                            )}
                          </View>
                          <View style={{ width: 420, minWidth: 320, position: 'relative' }}>
                            <ActivityPanel />
                          </View>
                        </View>
                      </View>
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        ) : null}
          {/* Uppgifter-sektion + Skapa kontroll-knapp och popup för val av kontrolltyp */}
          <View style={Platform.OS === 'web' ? { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16 } : { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16, width: '100%' }}>
            {Platform.OS === 'web' ? (
              <View>
                <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  {controlTypeOptions.map(({ type, icon, color }) => (
                    <TouchableOpacity
                      key={type}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        marginRight: 10,
                        marginBottom: 10,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.06,
                        shadowRadius: 4,
                        elevation: 2,
                        cursor: 'pointer'
                      }}
                      onPress={() => {
                        setSelectProjectModal({ visible: true, type });
                        setShowControlTypeModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <View style={{ width: '100%', marginBottom: 6 }}>
                  <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', shadowColor: '#222', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 }}>
                    <TouchableOpacity
                      onPress={() => {
                        try {
                          if (!mainChevronSpinAnim.tasks) mainChevronSpinAnim.tasks = new Animated.Value(0);
                          spinOnce(mainChevronSpinAnim.tasks);
                        } catch (_) {}
                        setTasksOpen(prev => {
                          const next = !prev;
                          if (next) setControlsOpen(false);
                          return next;
                        });
                      }}
                      activeOpacity={0.85}
                      style={{
                        width: '100%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        minHeight: 44,
                      }}
                    >
                      <Animated.View style={mainChevronSpinAnim.tasks ? { transform: [{ rotate: mainChevronSpinAnim.tasks.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}>
                        <Ionicons name={tasksOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                      </Animated.View>
                      <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Uppgifter'}</Text>
                    </TouchableOpacity>

                    {tasksOpen ? (
                      <View>
                        {[
                          { key: 'task1', label: 'Uppgift 1', icon: 'list-outline', color: '#1976D2' },
                          { key: 'task2', label: 'Uppgift 2', icon: 'time-outline', color: '#00897B' },
                          { key: 'task3', label: 'Uppgift 3', icon: 'checkmark-circle-outline', color: '#7B1FA2' },
                        ].map((btn, idx) => (
                          <AnimatedRow
                            key={btn.key}
                            style={{
                              backgroundColor: '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingVertical: 12,
                              paddingLeft: 28,
                              paddingRight: 18,
                              borderTopWidth: 1,
                              borderColor: '#e0e0e0',
                              minHeight: 44,
                              width: '100%',
                            }}
                            onPress={() => {}}
                          >
                            <Ionicons name={btn.icon} size={18} color={btn.color} style={{ marginRight: 14 }} />
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.2 }}>{btn.label}</Text>
                          </AnimatedRow>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Kontroll: grouped block (same style as Uppgifter) */}
                <View style={{ width: '100%', marginTop: 4, marginBottom: 6, alignSelf: 'stretch' }}>
                  <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', shadowColor: '#222', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 }}>
                    <TouchableOpacity
                      onPress={() => {
                        try {
                          if (!mainChevronSpinAnim.controls) mainChevronSpinAnim.controls = new Animated.Value(0);
                          spinOnce(mainChevronSpinAnim.controls);
                        } catch (_) {}
                        setControlsOpen(prev => {
                          const next = !prev;
                          if (next) setTasksOpen(false);
                          return next;
                        });
                      }}
                      activeOpacity={0.85}
                      style={{
                        width: '100%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        minHeight: 44,
                      }}
                    >
                      <Animated.View style={mainChevronSpinAnim.controls ? { transform: [{ rotate: mainChevronSpinAnim.controls.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}>
                        <Ionicons name={controlsOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                      </Animated.View>
                      <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Skapa kontroll'}</Text>
                    </TouchableOpacity>

                    {controlsOpen ? (
                      <View>
                        {/* Skapa ny kontroll (keeps the add icon) */}
                        <AnimatedRow
                          onPress={() => setShowControlTypeModal(true)}
                          style={{
                            backgroundColor: '#fff',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            paddingVertical: 12,
                            paddingLeft: 18,
                            paddingRight: 18,
                            borderTopWidth: 1,
                            borderColor: '#e0e0e0',
                            minHeight: 44,
                            width: '100%',
                          }}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Ionicons name="add" size={16} color="#fff" />
                          </View>
                          <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5 }}>Skapa ny kontroll</Text>
                        </AnimatedRow>

                        {/* Valfri 1-4 buttons */}
                        {[1,2,3,4].map((n) => (
                          <AnimatedRow
                            key={`valfri-${n}`}
                            style={{
                              backgroundColor: '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingVertical: 12,
                              paddingLeft: 28,
                              paddingRight: 18,
                              borderTopWidth: 1,
                              borderColor: '#e0e0e0',
                              minHeight: 44,
                              width: '100%',
                            }}
                            onPress={() => {}}
                          >
                            <Ionicons name="square-outline" size={18} color="#78909C" style={{ marginRight: 14 }} />
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{`Valfri ${n}`}</Text>
                          </AnimatedRow>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          
            {/* Modal för val av kontrolltyp */}
            {/* Modal för val av kontrolltyp */}
            <Modal
              visible={showControlTypeModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowControlTypeModal(false)}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center', marginTop: 6 }}>
                    Välj kontrolltyp
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <ScrollView
                      style={{ maxHeight: 320, flex: 1 }}
                      showsVerticalScrollIndicator
                      onLayout={(e) => {
                        const h = e?.nativeEvent?.layout?.height || 0;
                        setControlTypeScrollMetrics(prev => ({ ...prev, containerHeight: h }));
                      }}
                      onContentSizeChange={(w, h) => {
                        setControlTypeScrollMetrics(prev => ({ ...prev, contentHeight: h || 0 }));
                      }}
                      onScroll={(e) => {
                        const y = e?.nativeEvent?.contentOffset?.y || 0;
                        setControlTypeScrollMetrics(prev => ({ ...prev, scrollY: y }));
                      }}
                      scrollEventThrottle={16}
                    >
                      {controlTypeOptions.map(({ type, icon, color }) => (
                        <TouchableOpacity
                          key={type}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                          onPress={() => {
                            setSelectProjectModal({ visible: true, type });
                            setShowControlTypeModal(false);
                          }}
                        >
                          <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                      {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                        <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                          Inga kontrolltyper är aktiverade för företaget.
                        </Text>
                      ) : null}
                    </ScrollView>
                    {controlTypeCanScroll ? (
                      <View
                          style={{
                            pointerEvents: 'none',
                            width: 3,
                            marginLeft: 6,
                            borderRadius: 999,
                            backgroundColor: '#E0E0E0',
                            height: controlTypeScrollMetrics.containerHeight || 0,
                            overflow: 'hidden',
                            alignSelf: 'flex-start',
                            marginTop: 2,
                          }}
                        >
                        <View
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            borderRadius: 999,
                            backgroundColor: '#B0B0B0',
                            height: controlTypeThumbHeight,
                            top: controlTypeThumbTop,
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => setShowControlTypeModal(false)}
                  >
                    <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* Modal: skapa ny kontroll för valt projekt via högerklick på projekt i trädet */}
            <Modal
              visible={projectControlModal.visible}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setProjectControlModal({ visible: false, project: null });
                setProjectControlSelectedType('');
                setProjectControlTypePickerOpen(false);
                setProjectControlSelectedTemplateId('');
                setProjectControlTemplatePickerOpen(false);
                setProjectControlTemplateSearch('');
              }}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#222', textAlign: 'center' }}>
                    Skapa ny kontroll
                  </Text>
                  {projectControlModal.project && (
                    <Text style={{ fontSize: 14, color: '#555', marginBottom: 14, textAlign: 'center' }}>
                      {projectControlModal.project.id} - {projectControlModal.project.name}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Kontrolltyp</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setProjectControlTypePickerOpen(o => !o)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: '#fff',
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                        {(() => {
                          const meta = controlTypeOptions.find(o => o.type === projectControlSelectedType) || null;
                          if (!meta) return null;
                          return (
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                backgroundColor: meta.color || '#00897B',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                marginRight: 8,
                              }}
                            >
                              <Ionicons name={meta.icon} size={14} color="#fff" />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                          {projectControlSelectedType || 'Välj kontrolltyp'}
                        </Text>
                      </View>
                      <Ionicons
                        name={projectControlTypePickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#555"
                      />
                    </View>
                  </TouchableOpacity>
                  {projectControlTypePickerOpen && controlTypeOptions.length > 0 && (
                    <View
                      style={{
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        maxHeight: 220,
                        overflow: 'auto',
                      }}
                    >
                      {controlTypeOptions.map(({ type, icon, color }) => {
                        const selected = type === projectControlSelectedType;
                        return (
                          <TouchableOpacity
                            key={type}
                            onPress={() => {
                              setProjectControlSelectedType(type);
                              setProjectControlTypePickerOpen(false);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              backgroundColor: selected ? '#E0F2F1' : '#fff',
                              borderBottomWidth: 1,
                              borderBottomColor: '#eee',
                            }}
                          >
                            <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                            <Text style={{ fontSize: 14, color: '#263238' }}>{type}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                    <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                      Inga kontrolltyper är aktiverade för företaget.
                    </Text>
                  ) : null}
                  {/* Mall-val: visas om det finns minst en mall för vald kontrolltyp */}
                  {(() => {
                    const ct = String(projectControlSelectedType || '').trim();
                    const allTemplates = Array.isArray(projectControlTemplates) ? projectControlTemplates : [];
                    const baseForType = ct
                      ? allTemplates.filter(t => String(t.controlType || '').trim() === ct)
                      : [];
                    // Om ingen mall överhuvudtaget finns för vald kontrolltyp, visa inget mall-fält.
                    if (!ct || baseForType.length === 0) return null;

                    let filtered = baseForType;
                    const q = String(projectControlTemplateSearch || '').trim().toLowerCase();
                    if (q) {
                      filtered = filtered.filter((t) => {
                        const title = String(t.title || '').toLowerCase();
                        const desc = String(t.description || '').toLowerCase();
                        const v = t.version != null ? String(t.version).toLowerCase() : '';
                        return title.includes(q) || desc.includes(q) || v.includes(q);
                      });
                    }
                    const selectedTemplate = baseForType.find(t => String(t.id) === String(projectControlSelectedTemplateId)) || null;
                    const selectedLabel = selectedTemplate?.title || 'Välj mall';
                    return (
                      <>
                        <Text style={{ fontSize: 13, color: '#555', marginBottom: 6, marginTop: 10 }}>Mall</Text>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setProjectControlTemplatePickerOpen(o => !o)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#ddd',
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            backgroundColor: '#fff',
                            marginBottom: 4,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                              {selectedLabel}
                            </Text>
                            <Ionicons
                              name={projectControlTemplatePickerOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color="#555"
                            />
                          </View>
                        </TouchableOpacity>
                        {projectControlTemplatePickerOpen && (
                          <View
                            style={{
                              marginBottom: 10,
                              borderWidth: 1,
                              borderColor: '#ddd',
                              borderRadius: 8,
                              backgroundColor: '#fff',
                              maxHeight: 220,
                              overflow: 'auto',
                            }}
                          >
                            <TextInput
                              placeholder="Sök mall"
                              value={projectControlTemplateSearch}
                              onChangeText={setProjectControlTemplateSearch}
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: '#eee',
                                fontSize: 13,
                              }}
                            />
                            {filtered.length === 0 ? (
                              <Text
                                style={{ paddingVertical: 6, paddingHorizontal: 8, fontSize: 12, color: '#78909C' }}
                              >
                                Inga mallar hittades för din sökning.
                              </Text>
                            ) : filtered.map((tpl) => {
                              const selected = String(tpl.id) === String(projectControlSelectedTemplateId);
                              const title = tpl.title || 'Namnlös mall';
                              const v = tpl.version != null ? String(tpl.version) : '';
                              const versionLabel = v ? `v${v}` : '';
                              return (
                                <TouchableOpacity
                                  key={tpl.id}
                                  onPress={() => {
                                    setProjectControlSelectedTemplateId(String(tpl.id));
                                    setProjectControlTemplatePickerOpen(false);
                                  }}
                                  style={{
                                    paddingVertical: 5,
                                    paddingHorizontal: 8,
                                    backgroundColor: selected ? '#E3F2FD' : '#fff',
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#eee',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, color: '#263238', flexShrink: 1 }} numberOfLines={1}>
                                      {title}
                                    </Text>
                                    {!!versionLabel && (
                                      <Text style={{ fontSize: 11, color: '#78909C', marginLeft: 6 }} numberOfLines={1}>
                                        {versionLabel}
                                      </Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </>
                    );
                  })()}
                  <TouchableOpacity
                    disabled={!projectControlSelectedType}
                    style={{
                      marginTop: 6,
                      marginBottom: 4,
                      alignSelf: 'stretch',
                      backgroundColor: projectControlSelectedType ? '#1976D2' : '#B0BEC5',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      if (!projectControlSelectedType) return;
                      const proj = projectControlModal.project;
                      setProjectControlModal({ visible: false, project: null });
                      setProjectControlTypePickerOpen(false);
                      if (proj) {
                        const ct = projectControlSelectedType;
                        const tplId = projectControlSelectedTemplateId || null;
                        openInlineControlEditor(proj, ct, tplId);
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Skapa kontroll</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => {
                      setProjectControlModal({ visible: false, project: null });
                      setProjectControlSelectedType('');
                      setProjectControlTypePickerOpen(false);
                    }}
                  >
                    <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* Modal för att välja projekt till kontroll */}
            {/* Select project modal (render component instead of inlining hooks in a callback) */}
            <SelectProjectModal />
            {/* Utförda kontroller header removed from main screen; it's shown inside project details only */}
          </View>
          {/* Projektträd */}
          {/* Rubrik och sök-knapp */}
          <View style={{ width: '100%', alignItems: 'center', marginTop: 18, paddingHorizontal: 16 }}>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 16 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPressIn={() => {
                if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
                projektLongPressTimer.current = setTimeout(() => {
                  setNewFolderModalVisible(true);
                }, 2000);
              }}
              onPressOut={() => {
                if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
              }}
            >
              <Text style={{ fontSize: 26, fontWeight: '600', color: '#263238', letterSpacing: 0.2, textAlign: 'center' }}>Projekt</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8 }}
                  onPress={() => {
                    spinOnce(filterSpinAnim);
                    setFilterModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Animated.View style={{ transform: [{ rotate: filterRotate }] }}>
                      <Ionicons name="filter" size={22} color="#1976D2" />
                    </Animated.View>
                    {projectStatusFilter !== 'all' && (
                      <View
                        style={{
                          position: 'absolute',
                          right: -1,
                          top: -1,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: projectStatusFilter === 'completed' ? '#222' : '#43A047',
                          borderWidth: 1,
                          borderColor: '#fff',
                        }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8, marginLeft: 10 }}
                  onPress={() => {
                    spinOnce(searchSpinAnim);
                    openSearchModal();
                  }}
                  activeOpacity={0.7}
                >
                  <Animated.View style={{ transform: [{ rotate: searchRotate }] }}>
                    <Ionicons name="search" size={22} color="#1976D2" />
                  </Animated.View>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {/* Ny huvudmapp popup modal */}
          <Modal
            visible={newFolderModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setNewFolderModalVisible(false)}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => setNewFolderModalVisible(false)}
              />
              <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Skapa ny huvudmapp</Text>
                <TextInput
                  placeholder="Namn på huvudmapp..."
                  style={{
                    borderWidth: 1,
                    borderColor:
                      newFolderModalVisible && (newSubName.trim() === '' || !isFolderNameUnique(newSubName))
                        ? '#D32F2F'
                        : '#e0e0e0',
                    borderRadius: 8,
                    padding: 10,
                    fontSize: 16,
                    marginBottom: 6
                  }}
                  autoFocus
                  value={newSubName}
                  onChangeText={setNewSubName}
                />
                {(newFolderModalVisible && newSubName.trim() === '') && (
                  <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
                    Du måste ange ett namn.
                  </Text>
                )}
                {(newFolderModalVisible && newSubName.trim() !== '' && !isFolderNameUnique(newSubName)) && (
                  <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
                    Namnet används redan.
                  </Text>
                )}
                <TouchableOpacity
                  style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}
                  onPress={async () => {
                    if (newSubName.trim() === '' || !isFolderNameUnique(newSubName)) return;
                    const newMain = {
                      id: (Math.random() * 100000).toFixed(0),
                      name: newSubName.trim(),
                      expanded: false,
                      children: [],
                    };
                    const newHierarchy = [...hierarchy, newMain];
                    setHierarchy(newHierarchy);
                    setNewSubName('');
                    setNewFolderModalVisible(false);
                    try {
                      const ok = await saveHierarchy(companyId, newHierarchy);
                      if (!ok) {
                          await AsyncStorage.setItem('hierarchy_local', JSON.stringify(newHierarchy));
                          setLocalFallbackExists(true);
                          Alert.alert('Offline', 'Huvudmappen sparades lokalt. Appen kommer försöka synka senare.');
                        } else {
                          try { await AsyncStorage.removeItem('hierarchy_local'); } catch(_e) {}
                          await refreshLocalFallbackFlag();
                      }
                    } catch(_e) {
                      try { await AsyncStorage.setItem('hierarchy_local', JSON.stringify(newHierarchy)); } catch(_e) {}
                      Alert.alert('Offline', 'Huvudmappen sparades lokalt. Appen kommer försöka synka senare.');
                    }
                  }}
                  disabled={newSubName.trim() === '' || !isFolderNameUnique(newSubName)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, opacity: newSubName.trim() === '' || !isFolderNameUnique(newSubName) ? 0.5 : 1 }}>
                    Skapa
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
                  onPress={() => {
                    setNewSubName('');
                    setNewFolderModalVisible(false);
                  }}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
          {Platform.OS !== 'web' && (
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              {loadingHierarchy || hierarchy.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                  Inga mappar eller projekt skapade ännu.
                </Text>
              ) : (
                <View style={{ paddingHorizontal: 4 }}>
                  {[...hierarchy]
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                    .map((main) => (
                      <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 0, paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0, borderBottomWidth: main.expanded ? 1 : 0, borderColor: '#e0e0e0' }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                            onPress={() => {
                              if (!mainChevronSpinAnim[main.id]) {
                                mainChevronSpinAnim[main.id] = new Animated.Value(0);
                              }
                              spinOnce(mainChevronSpinAnim[main.id]);
                              setHierarchy(prev => prev.map(m => m.id === main.id ? { ...m, expanded: !m.expanded } : { ...m, expanded: false }));
                            }}
                            activeOpacity={0.7}
                            onLongPress={() => setEditModal({ visible: true, type: 'main', id: main.id, name: main.name })}
                            delayLongPress={2000}
                            onPressIn={() => {
                              if (mainTimersRef.current[main.id]) clearTimeout(mainTimersRef.current[main.id]);
                              mainTimersRef.current[main.id] = setTimeout(() => {
                                setEditModal({ visible: true, type: 'main', id: main.id, name: main.name });
                              }, 2000);
                            }}
                            onPressOut={() => {
                              if (mainTimersRef.current[main.id]) clearTimeout(mainTimersRef.current[main.id]);
                            }}
                          >
                            <Animated.View
                              style={mainChevronSpinAnim[main.id]
                                ? { transform: [{ rotate: mainChevronSpinAnim[main.id].interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }
                                : undefined}
                            >
                              <Ionicons name={main.expanded ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                            </Animated.View>
                            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                          </TouchableOpacity>
                          {/* Visa endast om ingen undermapp är expanderad */}
                          {main.expanded && !main.children?.some(sub => sub.expanded) && (
                            <TouchableOpacity
                              style={{ marginLeft: 8, padding: 4 }}
                              onPress={() => {
                                setNewSubModal({ visible: true, parentId: main.id });
                                setNewSubName("");
                              }}
                            >
                              <Ionicons name="add-circle" size={22} color="#1976D2" />
                            </TouchableOpacity>
                          )}
                        </View>
                        {main.expanded && (
                          !main.children || main.children.length === 0 ? (
                            <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                              Inga undermappar skapade
                            </Text>
                          ) : (
                            [...main.children]
                              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                              .map((sub) => {
                                const allProjects = sub.children ? sub.children.filter(child => child.type === 'project') : [];
                                const projects = projectStatusFilter === 'all'
                                  ? allProjects
                                  : allProjects.filter(p => {
                                      const status = p?.status || 'ongoing';
                                      return projectStatusFilter === 'completed' ? status === 'completed' : status !== 'completed';
                                    });
                                return (
                                  <View key={sub.id} style={{ backgroundColor: '#fff', borderRadius: 12, marginVertical: 1, marginLeft: 12, padding: 5 }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                                      <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                        onPress={() => {
                                          if (!subChevronSpinAnim[sub.id]) {
                                            subChevronSpinAnim[sub.id] = new Animated.Value(0);
                                          }
                                          spinOnce(subChevronSpinAnim[sub.id]);
                                          setHierarchy(toggleExpand(1, sub.id));
                                        }}
                                        onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                        delayLongPress={2000}
                                        activeOpacity={0.7}
                                      >
                                        <Animated.View
                                          style={subChevronSpinAnim[sub.id]
                                            ? { transform: [{ rotate: subChevronSpinAnim[sub.id].interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] }
                                            : undefined}
                                        >
                                          <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                                        </Animated.View>
                                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
                                      </TouchableOpacity>
                                      {sub.expanded && (
                                        <TouchableOpacity
                                          style={{ padding: 4 }}
                                          onPress={() => {
                                            setNewProjectModal({ visible: true, parentSubId: sub.id });
                                            setNewProjectName("");
                                            setNewProjectNumber("");
                                          }}
                                        >
                                          <Ionicons name="add-circle" size={22} color="#1976D2" />
                                        </TouchableOpacity>
                                      )}
                                    </View>
                                    {sub.expanded && (
                                      <React.Fragment>
                                        {projects.length === 0 ? (
                                          <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                            {allProjects.length === 0 ? 'Inga projekt skapade' : 'Inga projekt matchar filtret'}
                                          </Text>
                                        ) : (
                                          projects
                                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                            .map((proj) => (
                                              <TouchableOpacity
                                                key={proj.id}
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, marginLeft: 14, backgroundColor: '#fff', borderRadius: 8, marginVertical: 2, paddingHorizontal: 6 }}
                                                onPress={() => {
                                                  if (Platform.OS === 'web') {
                                                    setSelectedProject({ ...proj });
                                                  } else {
                                                    navigation.navigate('ProjectDetails', {
                                                      project: {
                                                        id: proj.id,
                                                        name: proj.name,
                                                        ansvarig: proj.ansvarig || '',
                                                        adress: proj.adress || '',
                                                        fastighetsbeteckning: proj.fastighetsbeteckning || '',
                                                        client: proj.client || '',
                                                        status: proj.status || 'ongoing',
                                                        createdAt: proj.createdAt || '',
                                                        createdBy: proj.createdBy || ''
                                                      },
                                                      companyId
                                                    });
                                                  }
                                                }}
                                              >
                                                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                                <Text style={{ fontSize: 15, color: '#1976D2', marginLeft: 4, marginRight: 8, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} — {proj.name}</Text>
                                              </TouchableOpacity>
                                            ))
                                        )}
                                      </React.Fragment>
                                    )}
                                  </View>
                                );
                              })
                          )
                        )}
                      </View>
                    ))}
                </View>
              )}
            </View>
          )}
                  {/* Ny huvudmapp popup modal */}
                  {/* Ny undermapp popup modal */}
      {/* Ny undermapp popup modal */}
      <Modal
        visible={newSubModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => setNewSubModal({ visible: false, parentId: null })}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => setNewSubModal({ visible: false, parentId: null })}
          />
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Skapa ny undermapp</Text>
            <TextInput
              value={newSubName}
              onChangeText={setNewSubName}
              placeholder="Namn på undermapp..."
              style={{
                borderWidth: 1,
                borderColor:
                  newSubModal.visible && (newSubName.trim() === '' || (() => {
                    // Check for duplicate name in selected main folder
                    const parent = hierarchy.find(main => main.id === newSubModal.parentId);
                    if (!parent) return false;
                    return parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase());
                  })())
                    ? '#D32F2F'
                    : '#e0e0e0',
                borderRadius: 8,
                padding: 10,
                fontSize: 16,
                marginBottom: 6
              }}
              autoFocus
            />
            {(newSubModal.visible && newSubName.trim() === '') && (
              <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
                Du måste ange ett namn.
              </Text>
            )}
            {(newSubModal.visible && newSubName.trim() !== '' && (() => {
              const parent = hierarchy.find(main => main.id === newSubModal.parentId);
              if (!parent) return false;
              return parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase());
            })()) && (
              <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
                Namnet används redan.
              </Text>
            )}
            {(() => {
              const parent = hierarchy.find(main => main.id === newSubModal.parentId);
              const isDuplicate = parent ? parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase()) : false;
              const isDisabled = newSubName.trim() === '' || isDuplicate;
              const opacity = isDisabled ? 0.5 : 1;
              return (
                <TouchableOpacity
                  style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8, opacity }}
                  onPress={() => {
                    if (!isDisabled) {
                      setHierarchy(prev => prev.map(main => {
                        if (main.id === newSubModal.parentId) {
                          return {
                            ...main,
                            children: [
                              ...(main.children || []),
                              {
                                id: (Math.random() * 100000).toFixed(0),
                                name: newSubName.trim(),
                                expanded: false,
                                children: [],
                              },
                            ],
                          };
                        }
                        return main;
                      }));
                      setNewSubName('');
                      setNewSubModal({ visible: false, parentId: null });
                    }
                   }}
                  disabled={isDisabled}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>
                    Skapa
                  </Text>
                </TouchableOpacity>
              );
            })()}
            <TouchableOpacity
              style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
              onPress={() => {
                setNewSubName('');
                setNewSubModal({ visible: false, parentId: null });
              }}
            >
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      </ScrollView>
          </RootContainer>
        );
      })()}
    </View>
  );
}

