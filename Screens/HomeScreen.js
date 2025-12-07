import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import React, { useState } from 'react';
import { ImageBackground, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../components/firebase';

function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}

export default function HomeScreen({ route }) {
  // State för nytt projekt-modal i undermapp

  // Funktion för att alltid nollställa projektfält
  const resetProjectFields = () => {
    setNewProjectName("");
    setNewProjectNumber("");
  };

  // Nollställ projektfält när popup öppnas eller stängs
  React.useEffect(() => {
    if (newProjectModal?.visible) {
      resetProjectFields();
    } else {
      resetProjectFields();
    }
  }, [newProjectModal?.visible]);
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
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
        activeOpacity={1}
        onPress={() => {
          setNewProjectModal({ visible: false, parentSubId: null });
          resetProjectFields();
        }}
      >
        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
          <TouchableOpacity
            style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, padding: 6 }}
            onPress={() => {
              setNewProjectModal({ visible: false, parentSubId: null });
              resetProjectFields();
            }}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Ionicons name="close" size={26} color="#222" />
          </TouchableOpacity>
          <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 }}>
            Skapa nytt projekt
          </Text>
          <View style={{ marginBottom: 4 }}>
            <TextInput
              value={newProjectNumber}
              onChangeText={setNewProjectNumber}
              placeholder="Projektnummer..."
              style={{
                borderWidth: 1,
                borderColor: newProjectNumber.trim() === '' || !isProjectNumberUnique(newProjectNumber) ? '#D32F2F' : '#e0e0e0',
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                backgroundColor: '#fafafa',
                color: !isProjectNumberUnique(newProjectNumber) && newProjectNumber.trim() !== '' ? '#D32F2F' : '#222',
              }}
              autoFocus
              keyboardType="default"
            />
            {newProjectNumber.trim() !== '' && !isProjectNumberUnique(newProjectNumber) && (
              <Text style={{ color: '#D32F2F', fontSize: 15, fontWeight: 'bold', marginTop: 8, marginLeft: 2, marginBottom: 4 }}>
                Projektnummer används redan. Välj ett annat nummer.
              </Text>
            )}
          </View>
          <TextInput
            value={newProjectName}
            onChangeText={setNewProjectName}
            placeholder="Projektnamn..."
            placeholderTextColor="#888"
            style={{
              borderWidth: 1,
              borderColor: newProjectName.trim() === '' ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 12,
              fontSize: 16,
              marginBottom: 12,
              backgroundColor: '#fafafa',
              color: '#222'
            }}
            keyboardType="default"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 10 }}>
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
                // Extra skydd: kontrollera alltid innan skapande
                if (
                  newProjectName.trim() === '' ||
                  newProjectNumber.trim() === '' ||
                  !isProjectNumberUnique(newProjectNumber)
                ) {
                  return;
                }
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
                              status: 'ongoing'
                            }
                          ]
                        }
                      : sub
                  )
                })));
                setNewProjectModal({ visible: false, parentSubId: null });
                setNewProjectName("");
                setNewProjectNumber("");
              }}
            >
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>
                Skapa
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
              onPress={() => setNewProjectModal({ visible: false, parentSubId: null })}
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
  const navigation = useNavigation();
  const email = route?.params?.email || '';
  const firstName = getFirstName(email);
  const [loggingOut, setLoggingOut] = useState(false);
  const [hierarchy, setHierarchy] = useState([
    {
      id: '1',
      name: 'Entreprenad',
      expanded: false,
      children: [
        {
          id: '1-1',
          name: '2025',
          expanded: false,
          children: [
            { id: '1-1-1', name: '10001 - Skola A', type: 'project', status: 'ongoing' },
            { id: '1-1-2', name: '10002 - Kontor B', type: 'project', status: 'ongoing' },
            { id: '1-1-3', name: '10003 - Avslutat Projekt', type: 'project', status: 'completed' },
          ],
        },
        {
          id: '1-2',
          name: 'Anna Projektledare',
          expanded: false,
          children: [
            { id: '1-2-1', name: '10003 - Villa C', type: 'project' },
          ],
        },
      ],
    },
    {
      id: '2',
      name: 'Byggservice',
      expanded: false,
      children: [
        {
          id: '2-1',
          name: 'Andersson AB',
          expanded: false,
          children: [
            { id: '2-1-1', name: '20001 - Servicejobb', type: 'project' },
          ],
        },
      ],
    },
  ]);

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

  return (
    <>
      {newProjectModalComponent}
      <ImageBackground
        source={require('../assets/images/inlogg.app.png')}
        style={{ flex: 1, resizeMode: 'cover' }}
        imageStyle={{ opacity: 1 }}
      >
      <View style={{ flex: 1, backgroundColor: 'rgba(255,255,255,0.85)' }}>
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#F7FAFC' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={{ width: 48, height: 48, backgroundColor: '#eee', borderRadius: 24, marginRight: 12, overflow: 'hidden' }} />
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#263238' }}>Hej, {firstName || 'Användare'}!</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>Välkommen till Digitalkontroll</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1.5, borderColor: '#222', paddingVertical: 3, paddingHorizontal: 8, alignItems: 'center', minWidth: 60, minHeight: 28 }}
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
        {/* Allt under headern är skrollbart */}
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          {/* Knappar för att skapa kontroller */}
          <View style={{ marginTop: 32, marginBottom: 16, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 8, color: '#263238', letterSpacing: 0.2 }}>
              Skapa kontroll
            </Text>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '80%', marginBottom: 18 }} />
            <TouchableOpacity style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' }} activeOpacity={0.85} onPress={() => {}}>
              <Ionicons name="construct-outline" size={26} color="#1976D2" style={{ marginRight: 16 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Arbetsberedning</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' }} activeOpacity={0.85} onPress={() => {}}>
              <Ionicons name="checkmark-done-outline" size={26} color="#388E3C" style={{ marginRight: 16 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Egenkontroll</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' }} activeOpacity={0.85} onPress={() => {}}>
              <Ionicons name="water-outline" size={26} color="#0288D1" style={{ marginRight: 16 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Fuktmätning</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' }} activeOpacity={0.85} onPress={() => {}}>
              <Ionicons name="alert-circle-outline" size={26} color="#F9A825" style={{ marginRight: 16 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Riskbedömning</Text>
            </TouchableOpacity>
            <TouchableOpacity style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' }} activeOpacity={0.85} onPress={() => navigation.navigate('SkyddsrondScreen')}>
              <Ionicons name="shield-checkmark-outline" size={26} color="#D32F2F" style={{ marginRight: 16 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>Skyddsrond</Text>
            </TouchableOpacity>
          </View>
          {/* Projektträd */}
          {/* Rubrik och sök-knapp */}
          <View style={{ width: '100%', alignItems: 'center', marginTop: 32 }}>
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
              <Text style={{ fontSize: 28, fontWeight: '800', color: '#263238', letterSpacing: 0.2, textAlign: 'left' }}>Projekt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#222', paddingHorizontal: 10, paddingVertical: 6, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 4, elevation: 2, minHeight: 32, marginLeft: 16 }}
              onPress={() => setSearchModalVisible(true)}
              activeOpacity={0.85}
            >
              <Ionicons name="search" size={18} color="#1976D2" style={{ marginRight: 6 }} />
              <Text style={{ fontSize: 15, color: '#1976D2', fontWeight: '600', letterSpacing: 0.3 }}>Sök</Text>
            </TouchableOpacity>
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
                  onPress={() => {
                    if (newSubName.trim() === '' || !isFolderNameUnique(newSubName)) return;
                    setHierarchy(prev => [
                      ...prev,
                      {
                        id: (Math.random() * 100000).toFixed(0),
                        name: newSubName.trim(),
                        expanded: false,
                        children: [],
                      },
                    ]);
                    setNewSubName('');
                    setNewFolderModalVisible(false);
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
          <View style={{ flex: 1 }}>
            {hierarchy.length === 0 ? (
              <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                Inga projekt eller mappar ännu.
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
                          // ...existing code...
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
                                    {/* Edit modal for main/sub group */}
                                    <Modal
                                      visible={editModal.visible}
                                      transparent
                                      animationType="fade"
                                      onRequestClose={() => setEditModal({ visible: false, type: '', id: null, name: '' })}
                                    >
                                      <TouchableOpacity
                                        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}
                                        activeOpacity={1}
                                        onPress={() => setEditModal({ visible: false, type: '', id: null, name: '' })}
                                      >
                                        <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                                          {/* Close (X) button */}
                                          <TouchableOpacity
                                            style={{ position: 'absolute', top: 14, right: 14, zIndex: 2, padding: 6 }}
                                            onPress={() => setEditModal({ visible: false, type: '', id: null, name: '' })}
                                            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                                          >
                                            <Ionicons name="close" size={26} color="#222" />
                                          </TouchableOpacity>
                                          <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 }}>
                                            {editModal.type === 'main' ? 'Hantera huvudmapp' : 'Hantera undermapp'}
                                          </Text>
                                          <TextInput
                                            value={editModal.name}
                                            onChangeText={txt => setEditModal(modal => ({ ...modal, name: txt }))}
                                            placeholder={editModal.type === 'main' ? 'Nytt namn på huvudmapp...' : 'Nytt namn på undermapp...'}
                                            style={{
                                              borderWidth: 1,
                                              borderColor: editModal.name.trim() === '' ? '#D32F2F' : '#e0e0e0',
                                              borderRadius: 8,
                                              padding: 12,
                                              fontSize: 16,
                                              marginBottom: 12,
                                              backgroundColor: '#fafafa'
                                            }}
                                            autoFocus
                                          />
                                          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 }}>
                                            <TouchableOpacity
                                              style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                                              onPress={() => {
                                                if (editModal.name.trim() !== '') {
                                                  if (editModal.type === 'main') {
                                                    setHierarchy(prev => prev.map(main => main.id === editModal.id ? { ...main, name: editModal.name.trim() } : main));
                                                  } else if (editModal.type === 'sub') {
                                                    setHierarchy(prev => prev.map(main => ({
                                                      ...main,
                                                      children: main.children.map(sub => sub.id === editModal.id ? { ...sub, name: editModal.name.trim() } : sub)
                                                    })));
                                                  }
                                                  setEditModal({ visible: false, type: '', id: null, name: '' });
                                                }
                                              }}
                                            >
                                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                                <Ionicons name="checkmark" size={18} color="#fff" style={{ marginRight: 6 }} />
                                                <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Spara</Text>
                                              </View>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              style={{
                                                backgroundColor:
                                                  (editModal.type === 'main' && hierarchy.find(main => main.id === editModal.id)?.children?.length > 0) ||
                                                  (editModal.type === 'sub' && (() => {
                                                    const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                                    const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                                    return sub?.children?.length > 0;
                                                  })())
                                                    ? '#aaa'
                                                    : '#D32F2F',
                                                borderRadius: 8,
                                                paddingVertical: 12,
                                                alignItems: 'center',
                                                flex: 1,
                                                marginLeft: 8
                                              }}
                                              disabled={
                                                (editModal.type === 'main' && hierarchy.find(main => main.id === editModal.id)?.children?.length > 0) ||
                                                (editModal.type === 'sub' && (() => {
                                                  const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                                  const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                                  return sub?.children?.length > 0;
                                                })())
                                              }
                                              onPress={() => {
                                                if (editModal.type === 'main') {
                                                  const mainFolder = hierarchy.find(main => main.id === editModal.id);
                                                  if (!mainFolder || (mainFolder.children && mainFolder.children.length > 0)) return;
                                                  setHierarchy(prev => prev.filter(main => main.id !== editModal.id));
                                                } else if (editModal.type === 'sub') {
                                                  const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                                  const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                                  if (sub && sub.children && sub.children.length > 0) return;
                                                  setHierarchy(prev => prev.map(main => ({
                                                    ...main,
                                                    children: main.children.filter(sub => sub.id !== editModal.id)
                                                  })));
                                                }
                                                setEditModal({ visible: false, type: '', id: null, name: '' });
                                              }}
                                            >
                                              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
                                                <Ionicons name="trash" size={18} color={
                                                  (editModal.type === 'main' && hierarchy.find(main => main.id === editModal.id)?.children?.length > 0) ||
                                                  (editModal.type === 'sub' && (() => {
                                                    const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                                    const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                                    return sub?.children?.length > 0;
                                                  })())
                                                    ? '#eee'
                                                    : '#fff'
                                                } style={{ marginRight: 6 }} />
                                                <Text style={{
                                                  color:
                                                    (editModal.type === 'main' && hierarchy.find(main => main.id === editModal.id)?.children?.length > 0) ||
                                                    (editModal.type === 'sub' && (() => {
                                                      const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                                      const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                                      return sub?.children?.length > 0;
                                                    })())
                                                      ? '#eee'
                                                      : '#fff',
                                                  fontWeight: '600', fontSize: 16
                                                }}>Radera</Text>
                                              </View>
                                            </TouchableOpacity>
                                          </View>
                                          {editModal.type === 'main' && hierarchy.find(main => main.id === editModal.id)?.children?.length > 0 && (
                                            <Text style={{ color: '#D32F2F', fontSize: 13, textAlign: 'center', marginTop: 10 }}>
                                              Tips: Du kan bara radera en huvudmapp om den är tom.
                                            </Text>
                                          )}
                                          {editModal.type === 'sub' && (() => {
                                            const parent = hierarchy.find(main => main.children.some(sub => sub.id === editModal.id));
                                            const sub = parent?.children?.find(sub => sub.id === editModal.id);
                                            return sub?.children?.length > 0;
                                          })() && (
                                            <Text style={{ color: '#D32F2F', fontSize: 13, textAlign: 'center', marginTop: 10 }}>
                                              Tips: Du kan bara radera en undermapp om den är tom.
                                            </Text>
                                          )}
                                        </View>
                                      </TouchableOpacity>
                                    </Modal>
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
                                        <View key={proj.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}>
                                          <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                          <Text style={{ fontSize: 15, color: '#1976D2', marginLeft: 8 }}>{proj.name}</Text>
                                        </View>
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
        </ScrollView>
                  {/* Ny huvudmapp popup modal */}
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
                        <TouchableOpacity
                          style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}
                          onPress={() => {
                            const parent = hierarchy.find(main => main.id === newSubModal.parentId);
                            const isDuplicate = parent ? parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase()) : false;
                            if (newSubName.trim() !== '' && !isDuplicate) {
                              setHierarchy(prev => prev.map(main => {
                                if (main.id === newSubModal.parentId) {
                                  return {
                                    ...main,
                                    children: [
                                      ...main.children,
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
                          disabled={newSubName.trim() === '' || (() => {
                            const parent = hierarchy.find(main => main.id === newSubModal.parentId);
                            return parent ? parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase()) : false;
                          })()}
                        >
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16, opacity: newSubName.trim() === '' || (() => {
                            const parent = hierarchy.find(main => main.id === newSubModal.parentId);
                            return parent ? parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase()) : false;
                          })() ? 0.5 : 1 }}>
                            Skapa
                          </Text>
                        </TouchableOpacity>
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
            {/* Sök popup modal */}
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
                <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Sök projekt</Text>
                  <TextInput
                    value={searchText}
                    onChangeText={setSearchText}
                    placeholder="Skriv projektnamn eller nummer..."
                    style={{
                      borderWidth: 1,
                      borderColor: searchModalVisible && searchText.trim() === '' ? '#D32F2F' : '#e0e0e0',
                      borderRadius: 8,
                      padding: 10,
                      fontSize: 16,
                      marginBottom: 18
                    }}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
                    onPress={() => setSearchModalVisible(false)}
                  >
                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Stäng</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            </Modal>
      </View>
      {/* Summary text at the bottom */}
      <View style={{ width: '100%', alignItems: 'center', marginBottom: 8, backgroundColor: 'transparent' }}>
        {(() => {
          const { ongoing, completed } = countProjectStatus(hierarchy);
          return (
            <Text style={{ fontSize: 13, color: '#222', textAlign: 'center', backgroundColor: 'transparent' }}>
              {`Pågående projekt: ${ongoing}   |   Avslutade projekt: ${completed}`}
            </Text>
          );
        })()}
      </View>
      </ImageBackground>
    </>
  );
}
