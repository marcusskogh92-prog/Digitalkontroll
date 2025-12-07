


import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Alert, ImageBackground, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth } from '../components/firebase';

function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}

export default function HomeScreen({ route }) {
        // Modal state för att ändra/ta bort undermapp
        const [editSubModal, setEditSubModal] = useState({ visible: false, sub: null, newName: '' });

        // Funktion för att ändra namn på undermapp
        function handleRenameSub(newName) {
          if (!editSubModal.sub || !newName.trim()) return;
          setHierarchy(prev => prev.map(main => ({
            ...main,
            children: main.children.map(sub =>
              sub.id === editSubModal.sub.id
                ? { ...sub, name: newName.trim() }
                : sub
            )
          })));
          setEditSubModal({ visible: false, sub: null, newName: '' });
        }

        // Funktion för att ta bort undermapp
        function handleDeleteSub() {
          if (!editSubModal.sub) return;
          const hasProjects = Array.isArray(editSubModal.sub.children) && editSubModal.sub.children.length > 0;
          if (!hasProjects) {
            Alert.alert(
              'Ta bort undermapp',
              'Vill du ta bort undermappen?',
              [
                { text: 'Avbryt', style: 'cancel' },
                { text: 'Ta bort', style: 'destructive', onPress: () => {
                  setHierarchy(prev => prev.map(main => ({
                    ...main,
                    children: main.children.filter(sub => sub.id !== editSubModal.sub.id)
                  })));
                  setEditSubModal({ visible: false, sub: null, newName: '' });
                } }
              ]
            );
            return;
          }
          Alert.alert(
            'Ta bort undermapp',
            'Vill du ta bort undermappen?',
            [
              { text: 'Avbryt', style: 'cancel' },
              { text: 'Fortsätt', style: 'destructive', onPress: () => {
                Alert.alert(
                  'Bekräfta borttagning',
                  'Vill du verkligen ta bort undergrupp? Det finns sparade projekt som kommer att förloras.',
                  [
                    { text: 'Avbryt', style: 'cancel' },
                    { text: 'Ta bort', style: 'destructive', onPress: () => {
                      setHierarchy(prev => prev.map(main => ({
                        ...main,
                        children: main.children.filter(sub => sub.id !== editSubModal.sub.id)
                      })));
                      setEditSubModal({ visible: false, sub: null, newName: '' });
                    } }
                  ]
                );
              } }
            ]
          );
        }
      // Modal state för att lägga till huvudmapp
      const [addMainFolderModal, setAddMainFolderModal] = useState(false);
      const [newMainFolderName, setNewMainFolderName] = useState('');
    // Hjälpfunktion för att platta ut alla projekt i hierarkin
    function getAllProjects(tree) {
      let result = [];
      if (!Array.isArray(tree)) return result;
      tree.forEach(main => {
        if (main.children && Array.isArray(main.children)) {
          main.children.forEach(sub => {
            if (sub.children && Array.isArray(sub.children)) {
              sub.children.forEach(proj => {
                result.push(proj);
              });
            }
          });
        }
      });
      return result;
    }

    // Filtrera projekt baserat på söktext
    const allProjects = getAllProjects(hierarchy);
    const safeSearchText = typeof searchText === 'string' ? searchText : '';
    const filteredProjects = safeSearchText.trim() === '' ? [] : allProjects.filter(p =>
      p.name.toLowerCase().includes(safeSearchText.trim().toLowerCase())
    );
  const navigation = useNavigation();
  const email = route?.params?.email || '';
  const firstName = getFirstName(email);
  const [loggingOut, setLoggingOut] = useState(false);
  // Dummydata för trädstruktur
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
            { id: '1-1-1', name: '10001 - Skola A', type: 'project' },
            { id: '1-1-2', name: '10002 - Kontor B', type: 'project' },
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

  // Håll koll på expand/collapse
  const toggleExpand = (level, id, parentArr = hierarchy) => {
    return parentArr.map(item => {
      if (item.id === id) {
        return { ...item, expanded: !item.expanded };
      } else if (item.children) {
        return { ...item, children: toggleExpand(level + 1, id, item.children) };
      }
      return item;
    });
  };
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const isSearchEmpty = searchModalVisible && searchText.trim() === '';

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
            <View style={{ width: 48, height: 48, backgroundColor: '#eee', borderRadius: 24, marginRight: 12, overflow: 'hidden' }}>
              {/* Logotyp */}
            </View>
            <View>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#263238' }}>Hej, {firstName || 'Användare'}!</Text>
              <Text style={{ fontSize: 14, color: '#666' }}>Välkommen till Digitalkontroll</Text>
            </View>
          </View>
          <TouchableOpacity
            style={{
              backgroundColor: '#fff',
              borderRadius: 8,
              borderWidth: 1.5,
              borderColor: '#222',
              paddingVertical: 3,
              paddingHorizontal: 8,
              alignItems: 'center',
              minWidth: 60,
              minHeight: 28,
            }}
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

        {/* Allt under headern är nu skrollbart */}
        <ScrollView contentContainerStyle={{ paddingBottom: 32 }}>
          <View style={{ marginTop: 32, marginBottom: 16, alignItems: 'center' }}>
            {/* Rubrik ovanför knappar */}
            <Text style={{ fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginBottom: 18, color: '#263238' }}>
              Skapa ny kontroll
            </Text>
            {/* Knappar för kontroller */}
            {[
              { label: 'Arbetsberedning', icon: <Ionicons name="construct-outline" size={26} color="#1976D2" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('ArbetsberedningScreen') */} },
              { label: 'Egenkontroll', icon: <Ionicons name="checkmark-done-outline" size={26} color="#388E3C" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('EgenkontrollScreen') */} },
              { label: 'Fuktmätning', icon: <Ionicons name="water-outline" size={26} color="#0288D1" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('FuktmatningScreen') */} },
              { label: 'Riskbedömning', icon: <Ionicons name="alert-circle-outline" size={26} color="#F9A825" style={{ marginRight: 16 }} />, onPress: () => {/* navigation.navigate('RiskbedomningScreen') */} },
              { label: 'Skyddsrond', icon: <Ionicons name="shield-checkmark-outline" size={26} color="#D32F2F" style={{ marginRight: 16 }} />, onPress: () => navigation.navigate('SkyddsrondScreen') },
            ].map((btn) => (
              <TouchableOpacity
                key={btn.label}
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  marginBottom: 16,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'flex-start',
                  shadowColor: '#1976D2',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.10,
                  shadowRadius: 6,
                  elevation: 2,
                  minHeight: 56,
                  minWidth: 0,
                  maxWidth: 240,
                  width: '90%',
                  paddingLeft: 14,
                  paddingRight: 10,
                  overflow: 'hidden',
                  borderWidth: 2,
                  borderColor: '#222',
                }}
                activeOpacity={0.85}
                onPress={btn.onPress}
              >
                {btn.icon}
                <Text style={{ color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 }}>{btn.label}</Text>
              </TouchableOpacity>
            ))}
*** End Patch
          </View>

          {/* Projektlista */}
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, marginTop: 32, paddingHorizontal: 16 }}>
              {/* Endast en Projekt-text, nu med long press för popup */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <TouchableOpacity
                  onLongPress={() => setAddMainFolderModal(true)}
                  delayLongPress={400}
                  activeOpacity={1}
                >
                  <Text style={{ fontSize: 28, fontWeight: '800', color: '#263238', letterSpacing: 0.2, textAlign: 'left', marginLeft: 8 }}>
                    Projekt
                  </Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }} />
                <TouchableOpacity
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: '#fff',
                    borderRadius: 16,
                    borderWidth: 2,
                    borderColor: '#222',
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    shadowColor: '#1976D2',
                    shadowOffset: { width: 0, height: 2 },
                    shadowOpacity: 0.10,
                    shadowRadius: 4,
                    elevation: 2,
                    minHeight: 32,
                    marginLeft: 16,
                  }}
                  onPress={() => setSearchModalVisible(true)}
                  activeOpacity={0.85}
                >
                  <Ionicons name="search" size={18} color="#1976D2" style={{ marginRight: 6 }} />
                  <Text style={{ fontSize: 15, color: '#1976D2', fontWeight: '600', letterSpacing: 0.3 }}>Sök</Text>
                </TouchableOpacity>
              </View>
                        {/* Modal för att lägga till huvudmapp */}
                        <Modal
                          visible={addMainFolderModal}
                          animationType="fade"
                          transparent={true}
                          onRequestClose={() => setAddMainFolderModal(false)}
                        >
                          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                            <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center', elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 12, position: 'relative' }}>
                              {/* X-ikon uppe till höger */}
                              <TouchableOpacity
                                style={{ position: 'absolute', top: 16, right: 16, zIndex: 2, backgroundColor: '#D32F2F', borderRadius: 16, width: 32, height: 32, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 4 }}
                                onPress={() => setAddMainFolderModal(false)}
                              >
                                <Ionicons name="close" size={20} color="#fff" />
                              </TouchableOpacity>
                              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#222', textAlign: 'center', letterSpacing: 0.5 }}>
                                Lägg till huvudmapp
                              </Text>
                              <View style={{ width: '100%', marginBottom: 18 }}>
                                <TextInput
                                  placeholder="Namn på huvudmapp"
                                  value={newMainFolderName}
                                  onChangeText={setNewMainFolderName}
                                  style={{
                                    backgroundColor: hierarchy.some(h => h.name.trim().toLowerCase() === newMainFolderName.trim().toLowerCase()) ? '#ffebee' : '#f5f5f5',
                                    borderRadius: 8,
                                    borderWidth: 1,
                                    borderColor: hierarchy.some(h => h.name.trim().toLowerCase() === newMainFolderName.trim().toLowerCase()) ? '#D32F2F' : (newMainFolderName.trim() === '' ? '#D32F2F' : '#bbb'),
                                    paddingHorizontal: 14,
                                    paddingVertical: 8,
                                    fontSize: 16,
                                    color: '#222',
                                    width: '100%',
                                  }}
                                  autoFocus
                                />
                                {newMainFolderName.trim() !== '' && (
                                  <View style={{ width: '100%', flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
                                    <TouchableOpacity
                                      style={{
                                        backgroundColor: '#1976D2',
                                        borderRadius: 24,
                                        flexDirection: 'row',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        paddingHorizontal: 18,
                                        paddingVertical: 8,
                                        elevation: 3,
                                        shadowColor: '#1976D2',
                                        shadowOffset: { width: 0, height: 1 },
                                        shadowOpacity: 0.15,
                                        shadowRadius: 3,
                                        opacity: hierarchy.some(h => h.name.trim().toLowerCase() === newMainFolderName.trim().toLowerCase()) ? 0.5 : 1,
                                      }}
                                      disabled={hierarchy.some(h => h.name.trim().toLowerCase() === newMainFolderName.trim().toLowerCase())}
                                      onPress={() => {
                                        setHierarchy(prev => [
                                          ...prev,
                                          { id: Date.now().toString(), name: newMainFolderName.trim(), expanded: false, children: [] }
                                        ]);
                                        setNewMainFolderName('');
                                        setAddMainFolderModal(false);
                                      }}
                                    >
                                      <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 8 }} />
                                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Lägg till</Text>
                                    </TouchableOpacity>
                                  </View>
                                )}
                              </View>
                            </View>
                          </View>
                        </Modal>
            </View>

            {/* Sök-popup/modal */}
            <Modal
              visible={searchModalVisible}
              animationType="slide"
              transparent={true}
              onRequestClose={() => setSearchModalVisible(false)}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '85%', maxWidth: 400, alignItems: 'center' }}>
                  <Text style={{ fontSize: 20, fontWeight: 'bold', marginBottom: 16 }}>Sök projekt</Text>
                  <TextInput
                    placeholder="Skriv projekt nummer eller namn"
                    value={searchText}
                    onChangeText={setSearchText}
                    style={{
                      backgroundColor: '#f5f5f5',
                      borderRadius: 8,
                      borderWidth: 1.5,
                      borderColor: isSearchEmpty ? '#D32F2F' : '#bbb',
                      paddingHorizontal: 14,
                      paddingVertical: 8,
                      fontSize: 16,
                      color: '#222',
                      width: '100%',
                      marginBottom: 12,
                    }}
                    autoFocus
                  />
                  {/* Sökresultatlista */}
                  {searchText.trim() !== '' && (
                    <View style={{ maxHeight: 180, width: '100%', marginBottom: 8, backgroundColor: '#f9f9f9', borderRadius: 8, borderWidth: filteredProjects.length > 0 ? 1 : 0, borderColor: '#bbb' }}>
                      <ScrollView keyboardShouldPersistTaps="handled">
                        {filteredProjects.length === 0 ? (
                          <Text style={{ color: '#888', textAlign: 'center', padding: 12 }}>
                            Inga projekt matchar din sökning.
                          </Text>
                        ) : (
                          filteredProjects.map(proj => (
                            <View key={proj.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                              <Ionicons name="document-text-outline" size={16} color="#1976D2" />
                              <Text style={{ marginLeft: 8, fontSize: 15, color: '#1976D2' }}>{proj.name}</Text>
                            </View>
                          ))
                        )}
                      </ScrollView>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', width: '100%' }}>
                    <TouchableOpacity
                      style={{ marginTop: 8, backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, paddingHorizontal: 32 }}
                      onPress={() => setSearchModalVisible(false)}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Stäng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </Modal>
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
                              onLongPress={() => {
                                setEditSubModal({ visible: true, sub });
                              }}
                              delayLongPress={400}
                              activeOpacity={0.7}
                            >
                              <Ionicons name={sub.expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#222" />
                              <Text style={{ fontSize: 16, fontWeight: '600', color: '#222', marginLeft: 8 }}>{sub.name}</Text>
                            </TouchableOpacity>
                              {/* JSX för undermapps-popup renderas separat utanför .map */}
                                  {/* Modal för att ändra/ta bort undermapp */}
                                  <Modal
                                    visible={editSubModal.visible}
                                    animationType="fade"
                                    transparent={true}
                                    onRequestClose={() => setEditSubModal({ visible: false, sub: null })}
                                  >
                                    <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                                      <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: '85%', maxWidth: 350, alignItems: 'center', elevation: 8 }}>
                                        <Text style={{ fontSize: 17, fontWeight: 'bold', marginBottom: 16, color: '#222', textAlign: 'center' }}>Hantera undermapp</Text>
                                        <TextInput
                                          placeholder="Nytt namn på undermapp"
                                          defaultValue={editSubModal.sub?.name || ''}
                                          onChangeText={txt => setEditSubModal(modal => ({ ...modal, newName: txt }))}
                                          style={{
                                            backgroundColor: '#f5f5f5',
                                            borderRadius: 8,
                                            borderWidth: 1,
                                            borderColor: '#bbb',
                                            paddingHorizontal: 14,
                                            paddingVertical: 8,
                                            fontSize: 16,
                                            color: '#222',
                                            width: '100%',
                                            marginBottom: 18,
                                          }}
                                          autoFocus
                                        />
                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                                          <TouchableOpacity
                                            style={{ backgroundColor: '#1976D2', borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8, marginRight: 8, opacity: !editSubModal.newName || editSubModal.newName.trim() === '' ? 0.5 : 1 }}
                                            disabled={!editSubModal.newName || editSubModal.newName.trim() === ''}
                                            onPress={() => handleRenameSub(editSubModal.newName)}
                                          >
                                            <Ionicons name="create" size={18} color="#fff" style={{ marginRight: 6 }} />
                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Ändra namn</Text>
                                          </TouchableOpacity>
                                          <TouchableOpacity
                                            style={{ backgroundColor: '#D32F2F', borderRadius: 20, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16, paddingVertical: 8 }}
                                            onPress={handleDeleteSub}
                                          >
                                            <Ionicons name="trash" size={18} color="#fff" style={{ marginRight: 6 }} />
                                            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Ta bort</Text>
                                          </TouchableOpacity>
                                        </View>
                                        <TouchableOpacity
                                          style={{ marginTop: 18, backgroundColor: '#bbb', borderRadius: 16, paddingHorizontal: 24, paddingVertical: 8 }}
                                          onPress={() => setEditSubModal({ visible: false, sub: null })}
                                        >
                                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Stäng</Text>
                                        </TouchableOpacity>
                                      </View>
                                    </View>
                                  </Modal>
                            {sub.expanded && sub.children && [...sub.children]
                              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                              .map((proj) => (
                                <View key={proj.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 5, marginLeft: 18, backgroundColor: '#e3f2fd', borderRadius: 8, marginVertical: 3, paddingHorizontal: 8 }}>
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
      </View>
    </ImageBackground>
  );
}
