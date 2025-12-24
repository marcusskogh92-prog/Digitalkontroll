import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import { Alert, ImageBackground, Modal, PanResponder, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, fetchHierarchy, fetchUserProfile, saveHierarchy, saveUserProfile } from '../components/firebase';
import useBackgroundSync from '../hooks/useBackgroundSync';
import ProjectDetails from './ProjectDetails';


function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}

export default function HomeScreen({ route, navigation }) {
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
    // State for control type selection modal
    const [showControlTypeModal, setShowControlTypeModal] = useState(false);
  // State för nytt projekt-modal i undermapp

  // Funktion för att alltid nollställa projektfält
  const resetProjectFields = () => {
    setNewProjectName("");
    setNewProjectNumber("");
  };

  // Kontrollera om projektnummer är unikt i hela hierarkin
  function isProjectNumberUnique(num) {
    if (!num) return true;
    const n = num.trim();
    for (const main of hierarchy || []) {
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

  // Modal för nytt projekt i undermapp (läggs utanför return)
  // State for project selection modal (for creating controls)
  const [selectProjectModal, setSelectProjectModal] = useState({ visible: false, type: null });
  const newProjectModalComponent = (
    <Modal
      visible={newProjectModal.visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setNewProjectModal({ visible: false, parentSubId: null });
        resetProjectFields();
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        onPress={() => {
          setNewProjectModal({ visible: false, parentSubId: null });
          resetProjectFields();
        }}
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
      >
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
            onChangeText={setNewProjectNumber}
            placeholder="Projektnummer..."
            style={{
              borderWidth: 1,
              borderColor: newProjectNumber.trim() === '' || !isProjectNumberUnique(newProjectNumber) ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 10,
              backgroundColor: '#fafafa',
              color: !isProjectNumberUnique(newProjectNumber) && newProjectNumber.trim() !== '' ? '#D32F2F' : '#222'
            }}
            autoFocus
            keyboardType="default"
          />
          {newProjectNumber.trim() !== '' && !isProjectNumberUnique(newProjectNumber) && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4, marginBottom: 6 }}>
              <Ionicons name="warning" size={18} color="#D32F2F" style={{ marginRight: 6 }} />
              <Text style={{ color: '#D32F2F', fontSize: 15, fontWeight: 'bold' }}>Projektnummer används redan.</Text>
            </View>
          )}

          <TextInput
            value={newProjectName}
            onChangeText={setNewProjectName}
            placeholder="Projektnamn..."
            placeholderTextColor="#888"
            style={{
              borderWidth: 1,
              borderColor: newProjectName.trim() === '' ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              color: '#222'
            }}
            keyboardType="default"
          />

          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <TouchableOpacity
              style={{
                backgroundColor: '#1976D2',
                borderRadius: 8,
                paddingVertical: 12,
                alignItems: 'center',
                flex: 1,
                marginRight: 8,
                opacity: (newProjectName.trim() === '' || newProjectNumber.trim() === '' || !isProjectNumberUnique(newProjectNumber)) ? 0.5 : 1
              }}
              disabled={newProjectName.trim() === '' || newProjectNumber.trim() === '' || !isProjectNumberUnique(newProjectNumber)}
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
                              id: newProjectNumber.trim(),
                              name: newProjectName.trim(),
                              type: 'project',
                              status: 'ongoing',
                              createdAt: new Date().toISOString()
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
      </TouchableOpacity>
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
                    setLocalFallbackExists(false);
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
            setLocalFallbackExists(false);
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
    <>
      {/* Sök-popup/modal */}
      <Modal
        visible={searchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSearchModalVisible(false)}
      >
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setSearchModalVisible(false)}
        >
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative' }}>
            {/* Stäng (X) knapp */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
              onPress={() => setSearchModalVisible(false)}
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
            <ScrollView style={{ maxHeight: 220 }} keyboardShouldPersistTaps="handled">
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
                        style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee' }}
                        onPress={() => {
                          setSearchModalVisible(false);
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
                              updateProject
                            });
                          }
                        }}
                      >
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
        </TouchableOpacity>
      </Modal>
      {newProjectModalComponent}
      <ImageBackground
        source={Platform.OS === 'web' ? require('../assets/images/inlogg.webb.jpg') : require('../assets/images/inlogg.app.png')}
        style={Platform.OS === 'web' ? { flex: 1, width: '100%', minHeight: '100vh' } : { flex: 1 }}
        imageStyle={{ opacity: Platform.OS === 'web' ? 0.15 : 1, resizeMode: 'cover' }}
      >
      <View style={{ flex: 1, backgroundColor: 'transparent' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F7FAFC', borderBottomWidth: 1, borderColor: '#e6e6e6' }}>
          <View>
            <TouchableOpacity onPress={handleAdminTitlePress} activeOpacity={0.7}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#263238' }}>Hej, {firstName || 'Användare'}!</Text>
            </TouchableOpacity>
            <Text style={{ fontSize: 14, color: '#666' }}>Välkommen tillbaka</Text>
            {showAdminButton && (
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
            {showAdminButton && (
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
            {localFallbackExists && (
              <TouchableOpacity
                style={{ backgroundColor: '#FFB300', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  // migrate local fallback to Firestore with confirmation
                  try {
                    const raw = await AsyncStorage.getItem('hierarchy_local');
                    if (!raw) {
                      Alert.alert('Ingen lokal data', 'Ingen lokalt sparad hierarki hittades.');
                      setLocalFallbackExists(false);
                      return;
                    }
                    const parsed = JSON.parse(raw);
                    Alert.alert(
                      'Migrera lokal data',
                      'Vill du migrera den lokalt sparade hierarkin till molnet för kontot? Detta kan skriva över befintlig molnhierarki.',
                      [
                        { text: 'Avbryt', style: 'cancel' },
                        { text: 'Migrera', onPress: async () => {
                          try {
                            const res = await saveHierarchy(companyId, parsed);
                            const ok = res === true || (res && res.ok === true);
                            if (ok) {
                              await AsyncStorage.removeItem('hierarchy_local');
                              setLocalFallbackExists(false);
                              setHierarchy(parsed);
                              Alert.alert('Klar', 'Lokal hierarki migrerad till molnet.');
                            } else {
                              Alert.alert('Misslyckades', 'Kunde inte spara till molnet. Fel: ' + (res && res.error ? res.error : 'okänt fel'));
                            }
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
            {(auth && auth.currentUser) && (
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
                      setLocalFallbackExists(false);
                      return;
                    }
                    const parsed = JSON.parse(raw);
                    const res = await saveHierarchy(companyId, parsed);
                    const ok = res === true || (res && res.ok === true);
                    if (ok) {
                      await AsyncStorage.removeItem('hierarchy_local');
                      setLocalFallbackExists(false);
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
              await auth.signOut();
              setLoggingOut(false);
              navigation.reset({ index: 0, routes: [{ name: 'LoginScreen' }] });
            }}
          >
            <Text style={{ color: '#222', fontWeight: 'bold', fontSize: 13 }}>Logga ut</Text>
          </TouchableOpacity>
          </View>
        </View>
        {/* Allt under headern är skrollbart */}
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: leftWidth, padding: 8, borderRightWidth: 0, borderColor: '#e6e6e6', backgroundColor: '#f5f6f7', height: 'calc(100vh - 140px)', position: 'relative' }}>
                    {/* Thin right-side divider for visual separation */}
                    <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
                    {/* Draggable handle - sits above the divider */}
                    <View
                  {...(panResponder && panResponder.panHandlers)}
                  style={Platform.OS === 'web' ? { position: 'absolute', right: -8, top: 0, bottom: 0, width: 16, cursor: 'col-resize', zIndex: 9 } : { position: 'absolute', right: -12, top: 0, bottom: 0, width: 24, zIndex: 9 }}
                    />
              <View style={{ paddingVertical: 6, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#eee', marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={() => {
                      setNewFolderModalVisible(true);
                      setNewSubName('');
                    }}
                    activeOpacity={0.7}
                    style={{ padding: 6, marginRight: 8 }}
                  >
                    <Ionicons name="add-circle" size={20} color="#1976D2" />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#222' }}>Projekt</Text>
                </View>
                <TouchableOpacity onPress={() => setSearchModalVisible(true)} activeOpacity={0.7} style={{ padding: 6, borderRadius: 8 }}>
                  <Ionicons name="search" size={18} color="#1976D2" />
                </TouchableOpacity>
              </View>
              <ScrollView>
                {loadingHierarchy || hierarchy.length === 0 ? (
                  <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                    Inga mappar eller projekt skapade ännu.
                  </Text>
                ) : (
                  <View style={{ paddingHorizontal: 4 }}>
                    {[...hierarchy]
                      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                      .map((main) => (
                        <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 4, padding: 8, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: main.expanded ? 1 : 0, borderColor: '#e0e0e0' }}>
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
                              <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                            </TouchableOpacity>
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
                          {main.expanded && main.children && [...main.children]
                            .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                            .map((sub) => {
                              const projects = sub.children ? sub.children.filter(child => child.type === 'project') : [];
                              return (
                                <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 2, marginLeft: 16, padding: 6, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                                    <TouchableOpacity
                                      style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                      onPress={() => setHierarchy(toggleExpand(1, sub.id))}
                                      onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                      delayLongPress={2000}
                                      activeOpacity={0.7}
                                    >
                                      <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                                      <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
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
                                          Inga projekt skapade
                                        </Text>
                                      ) : (
                                        projects
                                          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                          .map((proj) => (
                                            <TouchableOpacity
                                              key={proj.id}
                                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}
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
                                                    updateProject
                                                  });
                                                }
                                              }}
                                            >
                                              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                              <Text
                                                style={{ fontSize: 15, color: '#1976D2', marginLeft: 4, marginRight: 8, flexShrink: 1 }}
                                                numberOfLines={1}
                                                ellipsizeMode="tail"
                                              >
                                                {proj.id} — {proj.name}
                                              </Text>
                                            </TouchableOpacity>
                                          ))
                                      )}
                                    </React.Fragment>
                                  )}
                                </View>
                              );
                            })}
                        </View>
                      ))}
                  </View>
                )}
              </ScrollView>
            </View>
            <View style={{ flex: 1, minHeight: 'calc(100vh - 140px)' }}>
              {selectedProject ? (
                  <View style={{ flex: 1 }}>
                    <View style={{ flex: 1 }}>
                      <ProjectDetails route={{ params: { project: selectedProject, updateProject } }} navigation={navigation} inlineClose={() => setSelectedProject(null)} />
                    </View>
                  </View>
                ) : (
                  <View style={{ flex: 1 }} />
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
                  {[
                    { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
                    { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
                    { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
                    { type: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2' },
                    { type: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600' },
                    { type: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C' }
                  ].map(({ type, icon, color }) => (
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
                  {[
                    { type: 'Arbetsberedning', icon: 'construct-outline', color: '#1976D2' },
                    { type: 'Egenkontroll', icon: 'checkmark-done-outline', color: '#388E3C' },
                    { type: 'Fuktmätning', icon: 'water-outline', color: '#0288D1' },
                    { type: 'Mottagningskontroll', icon: 'checkbox-outline', color: '#7B1FA2' },
                    { type: 'Riskbedömning', icon: 'warning-outline', color: '#FFD600' },
                    { type: 'Skyddsrond', icon: 'shield-half-outline', color: '#388E3C' }
                  ].sort((a, b) => a.type.localeCompare(b.type)).map(({ type, icon, color }) => (
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
                  <TouchableOpacity
                    style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
                    activeOpacity={1}
                    onPress={() => setSelectProjectModal({ visible: false, type: null })}
                  >
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
                                        <Ionicons name="folder-open" size={16} color="#1976D2" style={{ marginRight: 7 }} />
                                        <Text style={{ fontSize: 15, color: '#1976D2', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
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
                            <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 4, padding: 8, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                onPress={() => toggleMain(main.id)}
                                activeOpacity={0.7}
                              >
                                <Ionicons name={isMainExpanded(main.id) ? 'chevron-down' : 'chevron-forward'} size={22} color="#1976D2" />
                                <Text style={{ fontSize: 19, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                              </TouchableOpacity>
                              {isMainExpanded(main.id) && main.children && [...main.children]
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
                                    <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 2, marginLeft: 16, padding: 6, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                                      <TouchableOpacity
                                        style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                        onPress={() => toggleSub(sub.id)}
                                        activeOpacity={0.7}
                                      >
                                        <Ionicons name={isSubExpanded(sub.id) ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                                        <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
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
                                                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}
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
                                                      updateProject
                                                    });
                                                  }
                                                }}
                                              >
                                                <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                                <Text style={{ fontSize: 15, color: '#1976D2', marginLeft: 4, marginRight: 8, flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} — {proj.name}</Text>
                                              </TouchableOpacity>
                                            ))
                                        )
                                      )}
                                    </View>
                                  );
                                })}
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
                  </TouchableOpacity>
                </Modal>
              );
            })()}
            {/* Utförda kontroller - rubrik med samma storlek som ovan */}
            <View style={Platform.OS === 'web' ? { marginTop: 18, marginBottom: 8, alignItems: 'flex-start', paddingHorizontal: 16 } : { marginTop: 18, marginBottom: 8, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={Platform.OS === 'web' ? { fontSize: 18, fontWeight: '600', textAlign: 'left', marginBottom: 12, color: '#263238', letterSpacing: 0.2 } : { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 8, color: '#263238', letterSpacing: 0.2 }}>
                Utförda kontroller:
              </Text>
            </View>
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
              <TouchableOpacity
                style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#222', paddingHorizontal: 16, paddingVertical: 10, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 2, minHeight: 36, marginLeft: 16 }}
                onPress={() => setSearchModalVisible(true)}
                activeOpacity={0.85}
              >
                <Ionicons name="search" size={18} color="#1976D2" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 15, color: '#1976D2', fontWeight: '600', letterSpacing: 0.3 }}>Sök</Text>
              </TouchableOpacity>
            )}
          </View>
          {/* Ny huvudmapp popup modal */}
          <Modal
            visible={newFolderModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => setNewFolderModalVisible(false)}
          >
            <TouchableOpacity
              style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
              activeOpacity={1}
              onPress={() => setNewFolderModalVisible(false)}
            >
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
                          setLocalFallbackExists(false);
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
            </TouchableOpacity>
          </Modal>
          {Platform.OS !== 'web' && (
            <View style={{ flex: 1 }}>
              {loadingHierarchy || hierarchy.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                  Inga mappar eller projekt skapade ännu.
                </Text>
              ) : (
                <View style={{ paddingHorizontal: 4 }}>
                  {[...hierarchy]
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                    .map((main) => (
                      <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 4, padding: 8, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: main.expanded ? 1 : 0, borderColor: '#e0e0e0' }}>
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
                            <Text style={{ fontSize: 19, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
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
                        {main.expanded && main.children && [...main.children]
                          .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                          .map((sub) => {
                            const projects = sub.children ? sub.children.filter(child => child.type === 'project') : [];
                            return (
                              <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 2, marginLeft: 16, padding: 6, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6 }}>
                                  <TouchableOpacity
                                    style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
                                    onPress={() => setHierarchy(toggleExpand(1, sub.id))}
                                    onLongPress={() => setEditModal({ visible: true, type: 'sub', id: sub.id, name: sub.name })}
                                    delayLongPress={2000}
                                    activeOpacity={0.7}
                                  >
                                    <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                                    <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
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
                                {/* ...existing code... */}
                                {sub.expanded && (
                                  <React.Fragment>
                                    {projects.length === 0 ? (
                                      <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                        Inga projekt skapade
                                      </Text>
                                    ) : (
                                      projects
                                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                        .map((proj) => (
                                          <TouchableOpacity
                                            key={proj.id}
                                            style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}
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
                                                  updateProject
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
                          })}
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
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
          activeOpacity={1}
          onPress={() => setNewSubModal({ visible: false, parentId: null })}
        >
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
        </TouchableOpacity>
      </Modal>
        </View>
      </ImageBackground>
    </>
  );
}
