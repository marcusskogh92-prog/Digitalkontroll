import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import { auth, fetchCompanyMembers, fetchCompanyProfile, fetchControlsForProject, fetchHierarchy, fetchUserProfile, saveControlToFirestore, saveDraftToFirestore, saveHierarchy, saveUserProfile, subscribeCompanyMembers, upsertCompanyMember } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import { onProjectUpdated } from '../components/projectBus';
import useBackgroundSync from '../hooks/useBackgroundSync';
import ProjectDetails from './ProjectDetails';


function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}

export default function HomeScreen({ route, navigation }) {
  const { height: windowHeight } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const leftTreeScrollRef = useRef(null);
  const rightPaneScrollRef = useRef(null);

  const webPaneHeight = Platform.OS === 'web'
    ? Math.max(240, (windowHeight || 800) - (headerHeight || 140))
    : undefined;

  const scrollToEndSafe = (ref) => {
    const node = ref?.current;
    if (!node) return;
    try {
      if (typeof node.scrollToEnd === 'function') node.scrollToEnd({ animated: true });
      else if (typeof node.scrollTo === 'function') node.scrollTo({ y: 1e9, animated: true });
    } catch (e) {}
  };
  // Testdata för demo-kontot (används av dold admin-knapp)
  const testHierarchy = [
    {
      id: 'main1',
      name: 'Byggprojekt',
      expanded: false,
      children: [
        {
          id: 'sub1',
          name: 'Stockholm',
          expanded: false,
          children: [
            { id: 'P-1001', name: 'Projekt Slussen', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() },
            { id: 'P-1002', name: 'Projekt Hammarby', type: 'project', status: 'completed', createdAt: new Date().toISOString() }
          ]
        },
        {
          id: 'sub2',
          name: 'Göteborg',
          expanded: false,
          children: [
            { id: 'P-2001', name: 'Projekt Gamlestaden', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() },
            { id: 'P-2002', name: 'Projekt Mölndal', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() }
          ]
        }
      ]
    },
    {
      id: 'main2',
      name: 'Serviceprojekt',
      expanded: false,
      children: [
        {
          id: 'sub3',
          name: 'Malmö',
          expanded: false,
          children: [
            { id: 'P-3001', name: 'Projekt Limhamn', type: 'project', status: 'completed', createdAt: new Date().toISOString() },
            { id: 'P-3002', name: 'Projekt Hyllie', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() }
          ]
        },
        {
          id: 'sub4',
          name: 'Uppsala',
          expanded: false,
          children: [
            { id: 'P-4001', name: 'Projekt Gränby', type: 'project', status: 'ongoing', createdAt: new Date().toISOString() },
            { id: 'P-4002', name: 'Projekt Fyrislund', type: 'project', status: 'completed', createdAt: new Date().toISOString() }
          ]
        }
      ]
    }
  ];

  // Admin unlock (tap title 5 times)
  const [adminTapCount, setAdminTapCount] = useState(0);
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [adminActionRunning, setAdminActionRunning] = useState(false);
  function handleAdminTitlePress() {
    setAdminTapCount(c => {
      if (c >= 4) {
        setShowAdminButton(true);
        return 0;
      }
      return c + 1;
    });
  }

  // Support/debug tools should not be visible in normal UI.
  // Shown only in development or after explicit admin-unlock.
  const showSupportTools = __DEV__ || showAdminButton;
  
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
        setHierarchy(testHierarchy);
      }
    } catch (e) {
      console.log('[Home] make demo admin error', e?.message || e);
    } finally {
      setAdminActionRunning(false);
      setShowAdminButton(false);
    }
  }
      // Funktion för att uppdatera projektinfo i hierarchy
      function updateProject(updatedProject) {
        setHierarchy(prev => prev.map(main => ({
          ...main,
          children: main.children.map(sub => ({
            ...sub,
            children: sub.children ? sub.children.map(child => {
              // Match on originalId if present, otherwise fallback to id
              if (child.type === 'project' && (child.id === updatedProject.originalId || child.id === updatedProject.id)) {
                const { originalId, ...rest } = updatedProject;
                return { ...child, ...rest };
              }
              return child;
            }) : []
          }))
        })));
      }

      // React Navigation params must be serializable. Instead of passing updateProject
      // as a param, listen for project updates via a simple event bus.
      React.useEffect(() => {
        const unsubscribe = onProjectUpdated((p) => {
          if (p && typeof p === 'object') updateProject(p);
        });
        return unsubscribe;
      }, []);
    // State for control type selection modal
    const [showControlTypeModal, setShowControlTypeModal] = useState(false);
  // State för nytt projekt-modal i undermapp

  // Keep a ref to hierarchy so early-defined helpers/modals can safely read it on web
  const hierarchyRef = useRef([]);

  // Funktion för att alltid nollställa projektfält
  const resetProjectFields = () => {
    setNewProjectName("");
    setNewProjectNumber("");
    setNewProjectResponsible(null);
  };

  const didUpsertMemberKeyRef = useRef('');

  async function ensureCurrentUserMemberDoc() {
    try {
      const uid = auth?.currentUser?.uid;
      if (!uid || !companyId) return;

      const key = `${companyId}::${uid}`;
      if (didUpsertMemberKeyRef.current === key) return;

      // Prefer role/displayName from user profile if present
      const profile = await fetchUserProfile(uid).catch(() => null);
      const role = profile?.role || null;
      const email = profile?.email || auth?.currentUser?.email || null;
      const displayName = profile?.displayName || auth?.currentUser?.displayName || (email ? String(email).split('@')[0] : null);

      const ok = await upsertCompanyMember({ companyId, uid, role, email, displayName });
      if (ok) didUpsertMemberKeyRef.current = key;
    } catch (e) {
      // ignore
    }
  }

  // Kontrollera om projektnummer är unikt i hela hierarkin
  function isProjectNumberUnique(num) {
    if (!num) return true;
    const n = String(num ?? '').trim();
    for (const main of hierarchyRef.current || []) {
      for (const sub of (main.children || [])) {
        if (sub.children && Array.isArray(sub.children) && sub.children.some(child => child.type === 'project' && child.id === n)) {
          return false;
        }
      }
    }
    return true;
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
  const [newProjectResponsible, setNewProjectResponsible] = useState(null);
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [newProjectKeyboardLockHeight, setNewProjectKeyboardLockHeight] = useState(0);
  const [companyAdminsLastFetchAt, setCompanyAdminsLastFetchAt] = useState(0);
  const companyAdminsUnsubRef = useRef(null);
  const [companyAdminsPermissionDenied, setCompanyAdminsPermissionDenied] = useState(false);

  const loadCompanyAdmins = React.useCallback(async ({ force } = { force: false }) => {
    try {
      if (!companyId) return;
      if (loadingCompanyAdmins && !force) return;
      setLoadingCompanyAdmins(true);
      setCompanyAdminsPermissionDenied(false);
      // Ensure at least the current user is present in members directory
      await ensureCurrentUserMemberDoc();
      const admins = await fetchCompanyMembers(companyId, { role: 'admin' });
      setCompanyAdmins(Array.isArray(admins) ? admins : []);
      setCompanyAdminsLastFetchAt(Date.now());
    } catch (e) {
      const msg = String(e?.message || e || '').toLowerCase();
      if (e?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
      setCompanyAdmins([]);
    } finally {
      setLoadingCompanyAdmins(false);
    }
  }, [companyId, loadingCompanyAdmins]);

  // If the create-project modal opens before companyId is ready, onShow can early-return.
  // This effect ensures admins are fetched as soon as companyId is available while the modal is open.
  React.useEffect(() => {
    if (!newProjectModal?.visible) return;
    if (!companyId) return;
    // Avoid refetch loop; only fetch if we have nothing yet.
    if (companyAdmins && companyAdmins.length > 0) return;
    if (loadingCompanyAdmins) return;
    loadCompanyAdmins({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectModal?.visible, companyId]);

  // While the ansvarig picker is open, subscribe to admins in realtime.
  // This avoids the common "empty cache" problem on fresh logins.
  React.useEffect(() => {
    if (!responsiblePickerVisible) {
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch (e) {}
      companyAdminsUnsubRef.current = null;
      return;
    }
    if (!companyId) return;

    setLoadingCompanyAdmins(true);
    setCompanyAdminsPermissionDenied(false);
    try {
      if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current();
    } catch (e) {}
    companyAdminsUnsubRef.current = subscribeCompanyMembers(companyId, {
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
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch (e) {}
      companyAdminsUnsubRef.current = null;
    };
  }, [responsiblePickerVisible, companyId]);

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
        try { s.remove(); } catch (e) {}
      }
    };
  }, []);

  // Modal för nytt projekt i undermapp (läggs utanför return)
  // State for project selection modal (for creating controls)
  const [selectProjectModal, setSelectProjectModal] = useState({ visible: false, type: null });
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
      {Platform.OS === 'web' ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
            onPress={() => {
              setNewProjectModal({ visible: false, parentSubId: null });
              resetProjectFields();
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

            <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center', marginTop: 6 }}>Skapa nytt projekt</Text>

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
              onPress={() => setResponsiblePickerVisible(true)}
              activeOpacity={0.8}
            >
              <Text style={{ fontSize: 16, color: newProjectResponsible ? '#222' : '#888' }} numberOfLines={1}>
                {newProjectResponsible ? formatPersonName(newProjectResponsible) : 'Välj ansvarig...'}
              </Text>
              <Ionicons name="chevron-down" size={18} color="#222" />
            </TouchableOpacity>

            {!newProjectResponsible && (
              <Text style={{ color: '#D32F2F', fontSize: 13, marginTop: -8, marginBottom: 10 }}>
                Du måste välja ansvarig.
              </Text>
            )}

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

            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{
                  backgroundColor: '#1976D2',
                  borderRadius: 8,
                  paddingVertical: 12,
                  alignItems: 'center',
                  flex: 1,
                  marginRight: 8,
                  opacity: (String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible) ? 0.5 : 1
                }}
                disabled={String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible}
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
                                ansvarig: formatPersonName(newProjectResponsible),
                                ansvarigId: newProjectResponsible?.uid || null,
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
      ) : (
        (() => {
          const effectiveKb = responsiblePickerVisible
            ? Math.max(nativeKeyboardHeight || 0, newProjectKeyboardLockHeight || 0)
            : (nativeKeyboardHeight || 0);
          // Lift the modal above the keyboard. Keep a small margin so it doesn't over-shoot.
          const lift = Math.max(0, effectiveKb - 12);
          return (
            <View style={{ flex: 1, justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 16 + lift }}>
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

          <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center', marginTop: 6 }}>Skapa nytt projekt</Text>

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
              try { Keyboard.dismiss(); } catch (e) {}
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

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#1976D2',
                borderRadius: 8,
                paddingVertical: 12,
                alignItems: 'center',
                flex: 1,
                marginRight: 8,
                opacity: (String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible) ? 0.5 : 1
              }}
              disabled={String(newProjectName ?? '').trim() === '' || String(newProjectNumber ?? '').trim() === '' || !isProjectNumberUnique(newProjectNumber) || !newProjectResponsible}
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
                              ansvarig: formatPersonName(newProjectResponsible),
                              ansvarigId: newProjectResponsible?.uid || null,
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
      const [editModal, setEditModal] = useState({ visible: false, type: '', id: null, name: '' });
    // Helper to count ongoing and completed projects
    function countProjectStatus(tree) {
      let ongoing = 0;
      let completed = 0;
      if (!Array.isArray(tree)) return { ongoing, completed };
      tree.forEach(main => {
        if (main.children && Array.isArray(main.children)) {
          main.children.forEach(sub => {
            if (sub.children && Array.isArray(sub.children)) {
              sub.children.forEach(child => {
                if (child.type === 'project') {
                  if (child.status === 'completed') completed++;
                  else ongoing++;
                }
              });
            }
          });
        }
      });
      return { ongoing, completed };
    }
  // Helper to remove last main folder
  const removeLastMainFolder = () => {
    setHierarchy(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
  };
  // Helper to check if folder name is unique
  const isFolderNameUnique = (name) => !hierarchy.some(folder => folder.name.trim().toLowerCase() === name.trim().toLowerCase());
  // State for new subfolder modal
  const [newSubModal, setNewSubModal] = useState({ visible: false, parentId: null });
  const [newSubName, setNewSubName] = useState('');
  // Helper to count all projects in the hierarchy
  function countProjects(tree) {
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
  const firstName = getFirstName(email);
  const [loggingOut, setLoggingOut] = useState(false);
  // companyId kan komma från route.params eller användarprofil
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  // Laddningsstate för hierarkin
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [hierarchy, setHierarchy] = useState([]);
  const [localFallbackExists, setLocalFallbackExists] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [selectedProject, setSelectedProject] = useState(null);

  // Ensure current user is written to the company members directory (so admin dropdown works)
  React.useEffect(() => {
    if (!companyId) return;
    if (!auth?.currentUser?.uid) return;
    ensureCurrentUserMemberDoc();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, auth?.currentUser?.uid]);

  // Keep ref in sync for early-defined helpers/modals
  React.useEffect(() => {
    hierarchyRef.current = hierarchy;
  }, [hierarchy]);

  // Company profile (used for per-company feature visibility)
  const [companyProfile, setCompanyProfile] = useState(null);

  const controlTypeOptions = React.useMemo(() => {
    const all = [
      { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
      { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
      { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
      { type: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2' },
      { type: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600' },
      { type: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C' }
    ];

    const enabled = companyProfile?.enabledControlTypes;
    const filtered = Array.isArray(enabled)
      ? all.filter(o => enabled.includes(o.type))
      : all;

    return filtered.slice().sort((a, b) => a.type.localeCompare(b.type));
  }, [companyProfile]);

  // Load company profile when companyId changes
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch(() => { /* ignore */ });
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
    } catch (e) {}
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
        } catch (e) { data[k] = null; }
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
          const remote = await fetchControlsForProject(pid, companyId).catch(() => []);
          remoteInfo[pid] = { remote_count: Array.isArray(remote) ? remote.length : 0, sample_ids: (remote || []).slice(0,5).map(r => r.id) };
        } catch (e) {
          remoteInfo[pid] = { remote_count: -1, error: String(e) };
        }
      }
      const final = { summary, remote: remoteInfo, sample_local_completed: (data.completed_controls || []).slice(0,5).map(c => ({ id: c.id, projectId: c.project?.id })) };
      try { console.log('[dumpLocalRemoteControls] full dump', final); } catch (e) {}
      Alert.alert('Debug: lokal vs moln', JSON.stringify(final, null, 2).slice(0,1000));
    } catch (e) {
      Alert.alert('Debug-fel', String(e));
    }
  }

  // Show the last Firestore error saved by firebase helpers
  async function showLastFsError() {
    try {
      // Prefer the full errors array if available
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      if (rawArr) {
        let parsedArr = null;
        try { parsedArr = JSON.parse(rawArr); } catch (e) { parsedArr = [rawArr]; }
        // Show the most recent entry first (arrays can get huge)
        const last = Array.isArray(parsedArr) ? parsedArr[parsedArr.length - 1] : parsedArr;
        return Alert.alert('Senaste FS-fel', JSON.stringify(last, null, 2).slice(0,2000));
      }
      // Fallback to single-entry key for older records
      const raw = await AsyncStorage.getItem('dk_last_fs_error');
      if (!raw) return Alert.alert('Senaste FS-fel', 'Ingen fel-logg hittades.');
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch (e) { parsed = { raw }; }
      Alert.alert('Senaste FS-fel', JSON.stringify(parsed, null, 2).slice(0,2000));
    } catch (e) {
      Alert.alert('Fel', 'Kunde inte läsa dk_last_fs_error: ' + (e?.message || e));
    }
  }
  

  // start background sync hook
  const bg = useBackgroundSync(companyId, { onStatus: (s) => setSyncStatus(s) });
  const didInitialLoadRef = React.useRef(false);

  // Left column resizer state (default 320)
  const [leftWidth, setLeftWidth] = useState(320);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => { leftWidthRef.current = leftWidth; }, [leftWidth]);
  const initialLeftRef = useRef(0);

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


  // Ladda hierarchy från Firestore vid appstart
  React.useEffect(() => {
    (async () => {
      let cid = companyId;
      // If companyId not provided via params, try user profile by uid
      if (!cid && route?.params?.uid) {
        const userProfile = await fetchUserProfile(route.params.uid);
        if (userProfile && userProfile.companyId) {
          cid = userProfile.companyId;
          setCompanyId(cid);
        }
      }
      // As a last resort try local stored companyId (dk_companyId)
      if (!cid) {
        try {
          const stored = await AsyncStorage.getItem('dk_companyId');
          if (stored) {
            cid = stored;
            setCompanyId(cid);
          }
        } catch (e) {}
      }
      if (cid) {
        setLoadingHierarchy(true);
        const items = await fetchHierarchy(cid);
        if (Array.isArray(items) && items.length > 0) {
          setHierarchy(items);
        } else {
          // Firestore empty or failed — try local AsyncStorage fallback
          try {
            const raw = await AsyncStorage.getItem('hierarchy_local');
            if (raw) {
              const parsed = JSON.parse(raw);
              if (Array.isArray(parsed) && parsed.length > 0) {
                setHierarchy(parsed);
                setLocalFallbackExists(true);
                // Try to push local fallback to Firestore (best-effort)
                try {
                  const pushedRes = await saveHierarchy(cid, parsed);
                  const pushed = pushedRes === true || (pushedRes && pushedRes.ok === true);
                  if (pushed) {
                    try { await AsyncStorage.removeItem('hierarchy_local'); } catch (er) {}
                    await refreshLocalFallbackFlag();
                  } else {
                    try { console.error('[Home] push local fallback error', pushedRes && pushedRes.error ? pushedRes.error : pushedRes); } catch (er) {}
                  }
                } catch (er) {}
              } else {
                setHierarchy([]);
              }
            } else {
              setHierarchy([]);
            }
          } catch (e) {
            setHierarchy([]);
          }
        }
        setLoadingHierarchy(false);
        // mark that initial load completed to avoid initial empty save overwriting server
        didInitialLoadRef.current = true;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Visa migreringsknappen även om det finns lokala kontroller (completed/draft)
  React.useEffect(() => {
    (async () => {
      try {
        const completed = await AsyncStorage.getItem('completed_controls');
        const drafts = await AsyncStorage.getItem('draft_controls');
        if ((completed && completed !== '[]') || (drafts && drafts !== '[]')) {
          setLocalFallbackExists(true);
        }
      } catch (e) {
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
          } catch (e) {}
        } else {
          // On successful cloud save, also clear local fallback
            try {
            await AsyncStorage.removeItem('hierarchy_local');
            await refreshLocalFallbackFlag();
          } catch (e) {}
        }
      } catch (e) {
        try {
          await AsyncStorage.setItem('hierarchy_local', JSON.stringify(hierarchy || []));
          setLocalFallbackExists(true);
        } catch (er) {}
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
        try { s.remove(); } catch (e) {}
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
    try { e?.preventDefault?.(); } catch (er) {}
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
          expanded: true,
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
        { key: 'addProject', label: 'Lägg till projekt', icon: '➕' },
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
          if (project && Platform.OS === 'web') setSelectedProject({ ...project });
          break;
        case 'addProject':
          setNewProjectModal({ visible: true, parentSubId: subId });
          setNewProjectName('');
          setNewProjectNumber('');
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
  }, [contextMenu.target, deleteMainFolderGuarded, deleteSubFolder, renameMainFolderWeb, renameSubFolderWeb]);

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

  // Stil för återanvändning
const kontrollKnappStil = { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' };
const kontrollTextStil = { color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 };

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
                            setSelectedProject({ ...proj });
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
                justifyContent: 'flex-end',
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
      <View style={Platform.OS === 'web' ? { flex: 1, width: '100%', minHeight: '100vh', height: windowHeight || undefined } : { flex: 1 }}>
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
            <TouchableOpacity onPress={handleAdminTitlePress} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#263238' }}>Hej, {firstName || 'Användare'}!</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 14, color: '#666' }}>Välkommen tillbaka</Text>
            {__DEV__ && showAdminButton && (
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
            {__DEV__ && showAdminButton && (
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
            {showSupportTools && localFallbackExists && (
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
                              } catch (e) {
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
                                  } catch (e) {}
                                }
                                if (okCount > 0) {
                                  await AsyncStorage.removeItem('completed_controls');
                                  successMsgs.push(`${okCount} utförda kontroller migrerade`);
                                } else {
                                  successMsgs.push('Inga utförda kontroller migrerade');
                                }
                              } catch (e) {
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
                                  } catch (e) {}
                                }
                                if (okDrafts > 0) {
                                  await AsyncStorage.removeItem('draft_controls');
                                  successMsgs.push(`${okDrafts} utkast migrerade`);
                                } else {
                                  successMsgs.push('Inga utkast migrerade');
                                }
                              } catch (e) {
                                successMsgs.push('Backup/migrering av utkast misslyckades');
                              }
                            }

                            Alert.alert('Migrering klar', successMsgs.join('\n'));
                            await refreshLocalFallbackFlag();
                          } catch (e) {
                            Alert.alert('Fel', 'Kunde inte migrera: ' + (e?.message || 'okänt fel'));
                          }
                        }}
                      ],
                    );
                  } catch (e) {
                    Alert.alert('Fel', 'Kunde inte läsa lokal data.');
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Migrera lokal data</Text>
              </TouchableOpacity>
            )}
            {showSupportTools && (auth && auth.currentUser) && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    // Force refresh token
                    await auth.currentUser.getIdToken(true);
                    Alert.alert('Token uppdaterad', 'ID-token uppdaterad. Försöker migrera lokal data...');
                    // attempt migration if local data exists
                    const raw = await AsyncStorage.getItem('hierarchy_local');
                    if (!raw) {
                      Alert.alert('Ingen lokal data', 'Inget att migrera.');
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
                      Alert.alert('Klar', 'Lokal hierarki migrerad till molnet.');
                    } else {
                      Alert.alert('Misslyckades', 'Kunde inte spara till molnet. Fel: ' + (res && res.error ? res.error : 'okänt fel'));
                    }
                  } catch (e) {
                    Alert.alert('Fel', 'Kunde inte uppdatera token eller migrera: ' + (e?.message || e));
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Uppdatera token & synka</Text>
              </TouchableOpacity>
            )}
            {showSupportTools && (
              <TouchableOpacity
                style={{ backgroundColor: '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    const user = auth.currentUser;
                    const tokenRes = user ? await auth.currentUser.getIdTokenResult(true).catch(() => null) : null;
                    const claims = tokenRes?.claims || {};
                    const stored = await AsyncStorage.getItem('dk_companyId');
                    Alert.alert('Auth info', `user: ${user ? user.email + ' (' + user.uid + ')' : 'not signed in'}\nclaims.companyId: ${claims.companyId || '—'}\ndk_companyId: ${stored || '—'}`);
                  } catch (e) {
                    Alert.alert('Fel', 'Kunde inte läsa auth info: ' + (e?.message || e));
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa auth-info</Text>
              </TouchableOpacity>
            )}
            {showSupportTools && (
              <TouchableOpacity
                style={{ backgroundColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await dumpLocalRemoteControls(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Debug: visa lokal/moln</Text>
              </TouchableOpacity>
            )}
            {showSupportTools && (
              <TouchableOpacity
                style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await showLastFsError(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa senaste FS-fel</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#888', marginBottom: 6 }}>
              Synk: {syncStatus}
            </Text>
            {null}
 
          <TouchableOpacity
            style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#222', paddingVertical: 3, paddingHorizontal: 8, alignItems: 'center', minWidth: 60, minHeight: 28 }}
            onPress={async () => {
              setLoggingOut(true);
              try { await AsyncStorage.removeItem('dk_companyId'); } catch (e) {}
              await auth.signOut();
              setLoggingOut(false);
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
            }}
          >
            <Text style={{ color: '#222', fontWeight: 'bold', fontSize: 13 }}>Logga ut</Text>
          </TouchableOpacity>
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
                    onPress={() => setFilterModalVisible(true)}
                    activeOpacity={0.7}
                  >
                    <View style={{ position: 'relative' }}>
                      <Ionicons name="filter" size={18} color="#1976D2" />
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

                  <TouchableOpacity onPress={openSearchModal} activeOpacity={0.7} style={{ padding: 6, borderRadius: 8 }}>
                    <Ionicons name="search" size={18} color="#1976D2" />
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
                              onPress={() => setHierarchy(prev => prev.map(m => m.id === main.id ? { ...m, expanded: !m.expanded } : { ...m, expanded: false }))}
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
                              <Ionicons name={main.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#1976D2" style={{ marginRight: 4 }} />
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
                                      onPress={() => setHierarchy(toggleExpand(1, sub.id))}
                                      onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                      delayLongPress={2000}
                                      activeOpacity={0.7}
                                      onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey(getRowKey('sub', String(main.id), String(sub.id))) : undefined}
                                      onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey(null) : undefined}
                                    >
                                      <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#222" style={{ marginRight: 4 }} />
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
              <ScrollView ref={rightPaneScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                {selectedProject ? (
                  <View style={{ flex: 1 }}>
                    <ProjectDetails route={{ params: { project: selectedProject, companyId } }} navigation={navigation} inlineClose={() => setSelectedProject(null)} />
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
                )}
              </ScrollView>
              {Platform.OS === 'web' && (
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
              )}
            </View>
          </View>
        ) : null}
          {/* Skapa kontroll-knapp och popup för val av kontrolltyp */}
          <View style={Platform.OS === 'web' ? { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16 } : { marginTop: 18, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={Platform.OS === 'web' ? { fontSize: 18, fontWeight: '600', textAlign: 'left', marginBottom: 12, color: '#263238', letterSpacing: 0.2 } : { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8, color: '#263238', letterSpacing: 0.2 }}>
              Skapa kontroll:
            </Text>
            {Platform.OS === 'web' ? (
              <>
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
              </>
            ) : (
              <>
                <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '80%', marginBottom: 18 }} />
                <TouchableOpacity
                  style={{
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    borderWidth: 1,
                    borderColor: '#222',
                    paddingVertical: 14,
                    paddingHorizontal: 32,
                    alignItems: 'center',
                    flexDirection: 'row',
                    justifyContent: 'center',
                    shadowColor: '#1976D2',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.10,
                    shadowRadius: 6,
                    elevation: 2,
                    minHeight: 56,
                    maxWidth: 240,
                    width: '90%',
                    marginBottom: 16,
                    overflow: 'hidden',
                  }}
                  activeOpacity={0.85}
                  onPress={() => setShowControlTypeModal(true)}
                >
                  <Ionicons name="add-circle-outline" size={26} color="#222" style={{ marginRight: 16 }} />
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Ny kontroll</Text>
                </TouchableOpacity>
              </>
            )}
          
            {/* Modal för val av kontrolltyp */}
            {/* Modal för val av kontrolltyp */}
            <Modal
              visible={showControlTypeModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowControlTypeModal(false)}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 }}>
                    Välj kontrolltyp
                  </Text>
                  {controlTypeOptions.map(({ type, icon, color }) => (
                    <TouchableOpacity
                      key={type}
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' }}
                      onPress={() => {
                        setSelectProjectModal({ visible: true, type });
                        setShowControlTypeModal(false);
                      }}
                    >
                      <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                  {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                    <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                      Inga kontrolltyper är aktiverade för företaget.
                    </Text>
                  ) : null}
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => setShowControlTypeModal(false)}
                  >
                    <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* Modal för att välja projekt till kontroll */}
            {/* Välj projekt-modal med exakt samma struktur och stil som projektlistan */}
            {(() => {
              const [expandedMain, setExpandedMain] = React.useState([]);
              const [expandedSub, setExpandedSub] = React.useState([]);
              const [quickAddModal, setQuickAddModal] = React.useState({ visible: false, parentSubId: null });
              const [quickAddName, setQuickAddName] = React.useState("");
              const [quickAddNumber, setQuickAddNumber] = React.useState("");
              const [showProjectCreated, setShowProjectCreated] = React.useState(false);
              // Endast en huvudmapp expanderad åt gången
              const isMainExpanded = id => expandedMain[0] === id;
              const isSubExpanded = id => expandedSub.includes(id);
              const toggleMain = id => setExpandedMain(exp => exp[0] === id ? [] : [id]);
              const toggleSub = id => setExpandedSub(exp => exp.includes(id) ? exp.filter(e => e !== id) : [...exp, id]);
              // Stäng alla huvudmappar när modal öppnas
              React.useEffect(() => {
                if (selectProjectModal.visible) setExpandedMain([]);
              }, [selectProjectModal.visible]);
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
                            paddingRight: 38 // plats för knappen
                          }}
                          autoCorrect={false}
                          autoCapitalize="none"
                        />
                        {/* Autocomplete-lista */}
                        {searchText.trim().length > 0 && (
                          <View style={{ position: 'absolute', top: 44, left: 0, right: 0, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e0e0e0', zIndex: 10, maxHeight: 180 }}>
                            <ScrollView keyboardShouldPersistTaps="handled">
                              {hierarchy.flatMap(main =>
                                main.children.flatMap(sub =>
                                  (sub.children || [])
                                    .filter(child => child.type === 'project' &&
                                      (
                                        child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                                        child.name.toLowerCase().includes(searchText.toLowerCase())
                                      )
                                    )
                                    .map(proj => (
                                      <TouchableOpacity
                                        key={proj.id}
                                        style={{ padding: 10, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                                        onPress={() => {
                                          setSelectProjectModal({ visible: false, type: null });
                                          // Route each control type to its dedicated screen
                                          switch (selectProjectModal.type) {
                                            case 'Arbetsberedning':
                                              navigation.navigate('ArbetsberedningScreen', { project: proj });
                                              break;
                                            case 'Riskbedömning':
                                              navigation.navigate('RiskbedömningScreen', { project: proj });
                                              break;
                                            case 'Fuktmätning':
                                              navigation.navigate('FuktmätningScreen', { project: proj });
                                              break;
                                            case 'Egenkontroll':
                                              navigation.navigate('EgenkontrollScreen', { project: proj });
                                              break;
                                            case 'Mottagningskontroll':
                                              navigation.navigate('MottagningskontrollScreen', { project: proj });
                                              break;
                                            case 'Skyddsrond':
                                              navigation.navigate('SkyddsrondScreen', { project: proj });
                                              break;
                                            default:
                                              navigation.navigate('ControlForm', {
                                                project: proj,
                                                controlType: selectProjectModal.type
                                              });
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
                                child.type === 'project' &&
                                (
                                  child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                                  child.id.toLowerCase().includes(searchText.toLowerCase())
                                )
                              )
                            )
                          )
                          .map(main => (
                            <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 3, padding: 6, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                onPress={() => toggleMain(main.id)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name={isMainExpanded(main.id) ? 'chevron-down' : 'chevron-forward'} size={22} color="#1976D2" />
                                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                              </TouchableOpacity>
                              {isMainExpanded(main.id) && (
                                !main.children || main.children.length === 0 ? (
                                  <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                    Inga undermappar skapade
                                  </Text>
                                ) : (
                                  [...main.children]
                                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                    .filter(sub =>
                                      sub.name.toLowerCase().includes(searchText.toLowerCase()) ||
                                      (sub.children || []).some(child =>
                                        child.type === 'project' &&
                                        (
                                          child.name.toLowerCase().includes(searchText.toLowerCase()) ||
                                          child.id.toLowerCase().includes(searchText.toLowerCase())
                                        )
                                      )
                                    )
                                    .map(sub => {
                                  const projects = sub.children ? sub.children.filter(child => child.type === 'project') : [];
                                  return (
                                    <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 1, marginLeft: 12, padding: 5, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                                      <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                        onPress={() => toggleSub(sub.id)}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons name={isSubExpanded(sub.id) ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                                        <Text style={{ fontSize: 15, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
                                      </TouchableOpacity>
                                      {isSubExpanded(sub.id) && (
                                        projects.length === 0 ? (
                                          <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                            Inga projekt skapade
                                          </Text>
                                        ) : (
                                          projects
                                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                            .map((proj) => (
                                              <TouchableOpacity
                                                key={proj.id}
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, marginLeft: 14, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 2, paddingHorizontal: 6 }}
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
                                                <Text style={{ fontSize: 14, color: '#1976D2', marginLeft: 4, marginRight: 8, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} — {proj.name}</Text>
                                              </TouchableOpacity>
                                            ))
                                        )
                                      )}
                                    </View>
                                  );
                                    })
                                )
                              )}
                            </View>
                          ))}
                      </ScrollView>
                      <TouchableOpacity
                        style={{ marginTop: 16, alignSelf: 'center' }}
                        onPress={() => setSelectProjectModal({ visible: false, type: null })}
                      >
                        <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              );
            })()}
            {/* Utförda kontroller header removed from main screen; it's shown inside project details only */}
          </View>
          {/* Projektträd */}
          {/* Rubrik och sök-knapp */}
          <View style={{ width: '100%', alignItems: 'center', marginTop: 18 }}>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '80%', marginBottom: 12 }} />
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
                  onPress={() => setFilterModalVisible(true)}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Ionicons name="filter" size={22} color="#1976D2" />
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
                  onPress={openSearchModal}
                  activeOpacity={0.7}
                >
                  <Ionicons name="search" size={22} color="#1976D2" />
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
                          try { await AsyncStorage.removeItem('hierarchy_local'); } catch (e) {}
                          await refreshLocalFallbackFlag();
                      }
                    } catch (e) {
                      try { await AsyncStorage.setItem('hierarchy_local', JSON.stringify(newHierarchy)); } catch (er) {}
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
                      <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 3, padding: 6, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: main.expanded ? 1 : 0, borderColor: '#e0e0e0' }}>
                          <TouchableOpacity
                            style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                            onPress={() => setHierarchy(prev => prev.map(m => m.id === main.id ? { ...m, expanded: !m.expanded } : { ...m, expanded: false }))}
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
                            <Ionicons name={main.expanded ? 'chevron-down' : 'chevron-forward'} size={22} color="#1976D2" />
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
                                  <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 1, marginLeft: 12, padding: 5, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                                      <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                        onPress={() => setHierarchy(toggleExpand(1, sub.id))}
                                        onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                        delayLongPress={2000}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
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
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 3, marginLeft: 14, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 2, paddingHorizontal: 6 }}
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
      </View>
    </View>
  );
}
