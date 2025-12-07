


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
        // Helper to remove last main folder
        const removeLastMainFolder = () => {
          setHierarchy(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
        };
      // Helper to check if folder name is unique
      const isFolderNameUnique = (name) => !hierarchy.some(folder => folder.name.trim().toLowerCase() === name.trim().toLowerCase());
    // State for new main folder modal
    const [newFolderModalVisible, setNewFolderModalVisible] = useState(false);
    const [newFolderName, setNewFolderName] = useState('');
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
            <TouchableOpacity activeOpacity={0.7} onPress={() => setNewFolderModalVisible(true)}>
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
                    <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 16, marginBottom: 14, padding: 8, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
                      <TouchableOpacity
                        style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: main.expanded ? 1 : 0, borderColor: '#e0e0e0' }}
                        onPress={() => setHierarchy(toggleExpand(0, main.id))}
                        activeOpacity={0.7}
                      >
                        <Ionicons name={main.expanded ? 'chevron-down' : 'chevron-forward'} size={22} color="#1976D2" />
                        <Text style={{ fontSize: 19, fontWeight: 'bold', color: '#222', marginLeft: 8 }}>{main.name}</Text>
                      </TouchableOpacity>
                      {main.expanded && main.children && [...main.children]
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                        .map((sub) => (
                          <View key={sub.id} style={{ backgroundColor: '#F3F3F3', borderRadius: 12, marginVertical: 6, marginLeft: 16, padding: 6, borderLeftWidth: 3, borderLeftColor: '#bbb' }}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                              onPress={() => setHierarchy(toggleExpand(1, sub.id))}
                              activeOpacity={0.7}
                            >
                              <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                              <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
                            </TouchableOpacity>
                            {sub.expanded && sub.children && [...sub.children]
                              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                              .map((proj) => (
                                <View key={proj.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}>
                                  <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: proj.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                                  <Ionicons name="document-text-outline" size={16} color="#1976D2" />
                                  <Text style={{ fontSize: 15, color: '#1976D2', marginLeft: 8 }}>{proj.name}</Text>
                                </View>
                              ))}
                          </View>
                        ))}
                    </View>
                  ))}
              </View>
            )}
          </View>
        </ScrollView>
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
                          value={newFolderName}
                          onChangeText={setNewFolderName}
                          placeholder="Namn på huvudmapp..."
                          style={{
                            borderWidth: 1,
                            borderColor:
                              newFolderModalVisible && (newFolderName.trim() === '' || !isFolderNameUnique(newFolderName))
                                ? '#D32F2F'
                                : '#e0e0e0',
                            borderRadius: 8,
                            padding: 10,
                            fontSize: 16,
                            marginBottom: 6
                          }}
                          autoFocus
                        />
                        {newFolderModalVisible && newFolderName.trim() !== '' && !isFolderNameUnique(newFolderName) ? (
                          <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 12, textAlign: 'center' }}>
                            Namnet finns redan. Välj ett unikt namn.
                          </Text>
                        ) : null}
                        <TouchableOpacity
                          style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8 }}
                          onPress={() => {
                            if (
                              newFolderName.trim() !== '' &&
                              isFolderNameUnique(newFolderName)
                            ) {
                              setHierarchy(prev => [
                                ...prev.filter(folder => folder.name.trim().toLowerCase() !== 'test'),
                                {
                                  id: (Math.random() * 100000).toFixed(0),
                                  name: newFolderName.trim(),
                                  expanded: false,
                                  children: [],
                                },
                              ]);
                              setNewFolderName('');
                              setNewFolderModalVisible(false);
                            }
                          }}
                        >
                          <Text style={{ color: '#fff', fontWeight: '600', fontSize: 16 }}>Skapa</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
                          onPress={() => {
                            setNewFolderName('');
                            setNewFolderModalVisible(false);
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
    </ImageBackground>
  );
}
