import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Animated, FlatList, Image, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Swipeable } from 'react-native-gesture-handler';
import { auth, fetchCompanyProfile, fetchHierarchy, saveHierarchy } from '../components/firebase';
import InfoPopup from '../components/InfoPopup';

// Hjälpfunktion för att hämta förnamn från e-post
function getFirstName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  return localPart.split('.')[0].charAt(0).toUpperCase() + localPart.split('.')[0].slice(1);
}
function getFullName(email) {
  if (!email) return '';
  const localPart = email.split('@')[0];
  const parts = localPart.split('.');
  return parts.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(' ');
}

export default function HomeScreen({ route }) {
  // Lägg till state för meny-modal
  const [showCreateMenu, setShowCreateMenu] = useState(false);
  const navigation = useNavigation();
  const email = route.params?.email || '';
  const passedCompanyId = route.params?.companyId || null;
  const firstName = getFirstName(email); 
  const fullName = getFullName(email);
  const [loggingOut, setLoggingOut] = useState(false);
  

  // Formulär för nytt projekt
  const [showForm, setShowForm] = useState(false);
  const [showNewProjectModal, setShowNewProjectModal] = useState(false);
  const [newProject, setNewProject] = useState({ id: '', name: '', date: '' });
  const [errors, setErrors] = useState({});
  const [showActions, setShowActions] = useState(true);

  // Hierarkisk struktur för grupper och undergrupper
  const [hierarchy, setHierarchy] = useState([]);

  const [companyId, setCompanyId] = useState(passedCompanyId || 'demo-company');
  const [companyLogoUri, setCompanyLogoUri] = useState(null);
  const companyLogoSource = companyLogoUri
    ? { uri: companyLogoUri }
    : require('../assets/images/foretag_ab.png');

  // Enkel header med logga ut knapp högst upp

  // Resolve initial companyId at mount from params or AsyncStorage
  useEffect(() => {
    (async () => {
      try {
        let effectiveCompanyId = passedCompanyId;
        if (!effectiveCompanyId) {
          const storedCompanyId = await AsyncStorage.getItem('dk_companyId');
          effectiveCompanyId = storedCompanyId || 'demo-company';
        }
        setCompanyId(effectiveCompanyId);
      } catch {}
    })();
  }, []);

  // React to navigation param updates of companyId (e.g., after login)
  useEffect(() => {
    if (route?.params?.companyId && route.params.companyId !== companyId) {
      setCompanyId(route.params.companyId);
    }
  }, [route?.params?.companyId]);

  // Whenever companyId changes, load hierarchy and company profile
  useEffect(() => {
    (async () => {
      if (!companyId) return;
      try {
        const scopedKey = `dk_hierarchy:${companyId}`;
        let loaded = false;
        // Prefer local cache first for fast startup
        try {
          const savedScoped = await AsyncStorage.getItem(scopedKey);
          if (savedScoped) {
            const parsed = JSON.parse(savedScoped);
            if (Array.isArray(parsed)) {
              setHierarchy(parsed);
              loaded = true;
            }
          } else {
            // Migration: move legacy unscoped key to scoped
            const legacy = await AsyncStorage.getItem('dk_hierarchy');
            if (legacy) {
              const parsed = JSON.parse(legacy);
              if (Array.isArray(parsed)) {
                await AsyncStorage.setItem(scopedKey, legacy);
                setHierarchy(parsed);
                loaded = true;
              }
            }
          }
        } catch {}

        // Then try remote and update if non-empty
        const remote = await fetchHierarchy(companyId || 'demo-company');
        if (Array.isArray(remote) && remote.length > 0) {
          setHierarchy(remote);
          loaded = true;
        }
        if (!loaded) setHierarchy([]);

        const profile = await fetchCompanyProfile(companyId || 'demo-company');
        setCompanyLogoUri(profile && profile.logoUrl ? profile.logoUrl : null);
      } catch {}
    })();
  }, [companyId]);

  // Persist hierarchy on every change: Firestore + local cache
  useEffect(() => {
    (async () => {
      try {
        const scopedKey = `dk_hierarchy:${companyId || 'demo-company'}`;
        await AsyncStorage.setItem(scopedKey, JSON.stringify(hierarchy));
        await saveHierarchy(companyId || 'demo-company', hierarchy);
      } catch {}
    })();
  }, [hierarchy]);

  // Modal-hantering för grupper
  const [showGroupModal, setShowGroupModal] = useState(false);
  const [groupType, setGroupType] = useState('main');
  const [selectedMainGroup, setSelectedMainGroup] = useState('');
  const [newGroupName, setNewGroupName] = useState('');

  // Modal-hantering för ändra/ta bort grupp
  const [showActionModal, setShowActionModal] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [showNameEditModal, setShowNameEditModal] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  // Håller koll på öppet Swipeable-element för att kunna stänga andra
  const openSwipeRef = useRef(null);
  // Snabb projekt-modal via swipe höger på undermapp
  const [showQuickProjectModal, setShowQuickProjectModal] = useState(false);
  const [quickProject, setQuickProject] = useState({ id: '', name: '' });
  const [quickTarget, setQuickTarget] = useState(null); // { mainIndex, subIndex }

  // Modal för aktiviteter (arbetsmoment)
  const [showProjectPickerModal, setShowProjectPickerModal] = useState(false);
  const [selectedActivity, setSelectedActivity] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  // Expand/collapse state for project picker grouped view
  const [projectPickerExpanded, setProjectPickerExpanded] = useState({});
  // Expand/collapse per-subgroup inside each main group
  const [projectPickerSubExpanded, setProjectPickerSubExpanded] = useState({}); // { [groupName]: { [subName]: boolean } }
  // Sökfält för projektlista
  const [search, setSearch] = useState('');

  // Gemensam grå informations-popup
  const [infoPopup, setInfoPopup] = useState({ visible: false, title: '', message: '', primaryLabel: undefined, onPrimary: undefined, closeLabel: 'Stäng' });
  const showInfo = (title, message, options = {}) => setInfoPopup({ visible: true, title, message, ...options });
  const hideInfo = () => setInfoPopup({ visible: false, title: '', message: '', primaryLabel: undefined, onPrimary: undefined, closeLabel: 'Stäng' });
  // Hjälpare: stäng alla modaler och rensa lägen
  const closeAllModals = () => {
    try {
      setShowProjectPickerModal(false);
      setShowNewProjectModal(false);
      setShowSelectGroupModal(false);
      setShowQuickProjectModal(false);
      setShowGroupModal(false);
      setSelectMode(null);
      hideInfo();
    } catch {}
  };

  // Säkerställ att ev. popup inte lämnas kvar när gruppmodallen stängs
  useEffect(() => {
    if (!showGroupModal && infoPopup.visible) {
      hideInfo();
    }
  }, [showGroupModal]);

  // Modal för att välja grupp när man skapar projekt
  const [showSelectGroupModal, setShowSelectGroupModal] = useState(false);
  // Sök i undergrupper i gruppval-modal
  const [groupSelectSearch, setGroupSelectSearch] = useState('');
  // Expand/collapse för huvudgrupper i gruppvalet
  const [groupSelectExpanded, setGroupSelectExpanded] = useState({});
  // Lägesflagga för gruppval
  const [selectMode, setSelectMode] = useState(null);

  // const scrollRef = useRef(null);

  // Hantera "Skapa projekt" - öppnar popup för gruppval om allt är ifyllt
  const handleAddProject = () => {
    let newErrors = {};
    if (!newProject.id) newErrors.id = 'Fyll i projektnummer';
    if (!newProject.name) newErrors.name = 'Fyll i projektnamn';
    if (!newProject.date) newErrors.date = 'Fyll i datum';

    setErrors(newErrors);

    if (Object.keys(newErrors).length === 0) {
      setSelectMode('form');
      setShowSelectGroupModal(true); // Visa popup för gruppval
    }
    else {
      showInfo('Fel', Object.values(newErrors).join('\n'));
    }
  };

  const handleLogout = async () => {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await auth.signOut();
      // Remove company id and only scoped hierarchy for current company
      await AsyncStorage.removeItem('dk_companyId');
      await AsyncStorage.removeItem(`dk_hierarchy:${companyId || 'demo-company'}`);
      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
    } catch (e) {
      // Could show popup but keep silent minimal
    } finally {
      setLoggingOut(false);
    }
  };

  const handleLogoutConfirm = () => {
    showInfo('Logga ut', 'Är du säker på att du vill logga ut?', {
      primaryLabel: 'Logga ut',
      onPrimary: () => {
        hideInfo();
        handleLogout();
      },
      closeLabel: 'Avbryt'
    });
  };
  
  // Sätt en custom header-knapp för utloggning istället för back
  useLayoutEffect(() => {
    navigation.setOptions({
      headerLeft: () => (
        email ? (
          <View style={{ paddingHorizontal: 12, paddingVertical: 6 }}>
            <Text style={{ color: '#555', fontSize: 12 }}>
              Inloggad: {fullName || firstName || email.split('@')[0]}
            </Text>
          </View>
        ) : null
      ),
      headerRight: () => (
        <TouchableOpacity onPress={handleLogoutConfirm} style={{ paddingHorizontal: 12, paddingVertical: 6 }} disabled={loggingOut}>
          <Text style={{ color: '#263238', fontWeight: '600' }}>{loggingOut ? 'Loggar ut…' : 'Logga ut'}</Text>
        </TouchableOpacity>
      ),
      headerTitle: ''
    });
  }, [navigation, loggingOut]);
  // Skapa ny grupp eller undergrupp
  const handleSaveGroup = () => {
    // Validera namn
    if (!newGroupName.trim()) {
      showInfo('Fel', 'Du måste ange namn.');
      return;
    }
    // Extra validering för undermapp
    if (groupType === 'sub') {
      // Om huvudmapp inte är vald, använd expanderad eller enda huvudmapp
      const onlyOne = (hierarchy || []).length === 1 ? hierarchy[0]?.name : null;
      const expandedOne = (hierarchy || []).find(g => !!g.expanded)?.name || null;
      const effectiveMainGroup = selectedMainGroup || expandedOne || onlyOne || '';
      if ((hierarchy || []).length === 0) {
        showInfo('Ingen huvudmapp', 'Det finns ingen huvudmapp ännu. Skapa en huvudmapp först via "+ Skapa ny grupp".');
        return;
      }
      if (!effectiveMainGroup) {
        showInfo('Välj huvudmapp', 'Välj vilken huvudmapp undermappen ska ligga i.');
        return;
      }
    }
    // Förhindra dubbletter av mappnamn
    if (groupType === 'main') {
      const exists = hierarchy.some(g => (g.name || '').trim().toLowerCase() === newGroupName.trim().toLowerCase());
      if (exists) {
        showInfo('Ogiltigt namn', 'En huvudmapp med detta namn finns redan.');
        return;
      }
    } else {
      // Kontrollera dubblett endast inom vald (eller effektiv) huvudmapp
      const onlyOne = (hierarchy || []).length === 1 ? hierarchy[0]?.name : null;
      const expandedOne = (hierarchy || []).find(g => !!g.expanded)?.name || null;
      const effectiveMainGroup = selectedMainGroup || expandedOne || onlyOne || '';
      const targetGroup = (hierarchy || []).find(g => (g.name || '') === effectiveMainGroup);
      const existsInTarget = (targetGroup?.subgroups || []).some(s => (s.name || '').trim().toLowerCase() === newGroupName.trim().toLowerCase());
      if (existsInTarget) {
        showInfo('Ogiltigt namn', `En undermapp med detta namn finns redan under "${effectiveMainGroup}".`);
        return;
      }
    }
    const updatedHierarchy = [...hierarchy];
    if (groupType === 'main') {
      updatedHierarchy.push({ name: newGroupName, expanded: false, subgroups: [] });
    } else {
      const onlyOne = (updatedHierarchy || []).length === 1 ? updatedHierarchy[0]?.name : null;
      const expandedOne = (updatedHierarchy || []).find(g => !!g.expanded)?.name || null;
      const effectiveMainGroup = selectedMainGroup || expandedOne || onlyOne || '';
      const mainIndex = updatedHierarchy.findIndex(g => g.name === effectiveMainGroup);
      if (mainIndex !== -1) {
        if (!updatedHierarchy[mainIndex].subgroups) updatedHierarchy[mainIndex].subgroups = [];
        updatedHierarchy[mainIndex].subgroups.push({
          name: newGroupName,
          expanded: false,
          projects: []
        });
      } else {
        showInfo('Fel', 'Kunde inte hitta vald huvudmapp.');
        return;
      }
    }
    setHierarchy(updatedHierarchy);
    setShowGroupModal(false);
    setNewGroupName('');
    setSelectedMainGroup('');
    showInfo(groupType === 'main' ? 'Huvudmapp skapad' : 'Undermapp skapad', groupType === 'main' ? `"${newGroupName}" skapad.` : `"${newGroupName}" skapad under "${selectedMainGroup || expandedOne || onlyOne || ''}".`);
  };

  // Byt namn på grupp eller undergrupp
  const handleRename = () => {
    if (!renameValue.trim()) {
      showInfo('Fel', 'Du måste ange ett namn.');
      return;
    }
    const updatedHierarchy = [...hierarchy];
    if (actionTarget.type === 'main') {
      updatedHierarchy[actionTarget.index].name = renameValue;
    } else if (actionTarget.type === 'sub') {
      updatedHierarchy[actionTarget.mainIndex].subgroups[actionTarget.index].name = renameValue;
    } else if (actionTarget.type === 'project') {
      const pj = updatedHierarchy[actionTarget.mainIndex].subgroups[actionTarget.subIndex].projects[actionTarget.index];
      updatedHierarchy[actionTarget.mainIndex].subgroups[actionTarget.subIndex].projects[actionTarget.index] = { ...pj, name: renameValue };
    }
    setHierarchy(updatedHierarchy);
    setShowNameEditModal(false);
    setRenameValue('');
    showInfo('Namn ändrat', 'Namnet uppdaterades.');
  };

  // Ta bort grupp eller undergrupp
  const handleDelete = () => {
    const updatedHierarchy = [...hierarchy];
    if (actionTarget.type === 'main') {
      updatedHierarchy.splice(actionTarget.index, 1);
    } else if (actionTarget.type === 'sub') {
      updatedHierarchy[actionTarget.mainIndex].subgroups.splice(actionTarget.index, 1);
    } else if (actionTarget.type === 'project') {
      updatedHierarchy[actionTarget.mainIndex].subgroups[actionTarget.subIndex].projects.splice(actionTarget.index, 1);
    }
    setHierarchy(updatedHierarchy);
    setShowDeleteModal(false);
    showInfo('Borttaget', 'Mappen togs bort.');
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
      <FlatList
        style={styles.container}
        contentContainerStyle={{ paddingBottom: 200 }}
        data={[{ key: 'content' }]}
        renderItem={() => null}
        ListHeaderComponent={
        <View>
        {/* Header med logotyper (endast) */}
        <View style={styles.header}>
          <Image source={require('../assets/images/digital.kontroll.liggande.jpg')} style={styles.msLogo} />
          <Image source={companyLogoSource} style={styles.companyLogo} />
        </View>
        {/* Rubrik */}
        <View style={styles.titleRow}>
          <Text style={styles.title}>Skapa ny kontroll</Text>
        </View>
        <Text style={styles.instructions}>Tryck på typen du vill skapa.</Text>

        {/* Arbetsmoment – lista med aktiviteter */}
        {showActions && (
          <View style={styles.options}>
            {[
              { name: 'Arbetsberedning', icon: require('../assets/images/arbetsberedning.icon.png') },
              { name: 'Egenkontroll', icon: require('../assets/images/egenkontroll.icon.png') },
              { name: 'Fuktmätning', icon: require('../assets/images/fuktmatning.icon.png') },
              { name: 'Riskbedömning', icon: require('../assets/images/riskbedomning.icon.png') },
              { name: 'Skyddsrond', icon: require('../assets/images/skyddsrond.icon.png') },
            ].map((item) => (
              <TouchableOpacity
                key={item.name}
                style={styles.activityOption}
                accessibilityRole="button"
                accessibilityLabel={`Skapa ${item.name}`}
                accessibilityHint={`Öppnar popup för ${item.name}`}
                onPress={() => {
                  setSelectedActivity(item.name);
                  // If there are no projects anywhere, inform user
                  const hasAnyProjects = hierarchy.some(g => (g.subgroups || []).some(s => (s.projects || []).length > 0));
                  if (!hasAnyProjects) {
                    showInfo('Inga projekt', 'Skapa ett projekt innan du kan skapa en kontroll.');
                    return;
                  }
                  // Reset expand states so all groups start closed
                  setProjectPickerExpanded({});
                  setProjectPickerSubExpanded({});
                  setShowProjectPickerModal(true);
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <Image source={item.icon} style={styles.icon} />
                  <Text style={styles.optionText}>{item.name}</Text>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Välj projekt att skapa kontroll i */}
        <Modal visible={showProjectPickerModal} transparent={true} animationType="fade" onRequestClose={() => setShowProjectPickerModal(false)}>
          <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowProjectPickerModal(false)}>
            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
              <View style={styles.selectProjectCard}>
                <Text style={styles.modalText}>Välj projekt för {selectedActivity}</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Sök projekt"
                  placeholderTextColor="#888"
                  value={projectSearch}
                  onChangeText={setProjectSearch}
                />
                <View style={{ maxHeight: 300 }}>
                  {hierarchy.map((g, gi) => {
                    const sstr = (projectSearch || '').toLowerCase();
                    const filteredSubs = (g.subgroups || []).map((s, si) => {
                      const nameMatches = sstr ? (s.name || '').toLowerCase().includes(sstr) : true;
                      const filteredProjects = (s.projects || []).filter(p => {
                        if (!sstr) return true;
                        return (p.name || '').toLowerCase().includes(sstr) || (p.id || '').toLowerCase().includes(sstr);
                      });
                      // Visa undermapp även utan projekt när ingen sökning, eller om undermappens namn matchar sökningen
                      if (!sstr || nameMatches) {
                        return { ...s, projects: filteredProjects };
                      }
                      // Annars bara om det finns matchande projekt
                      return filteredProjects.length > 0 ? { ...s, projects: filteredProjects } : null;
                    }).filter(Boolean);
                    if (filteredSubs.length === 0) return null;
                    const expanded = !!projectPickerExpanded[g.name];
                    const totalProjects = filteredSubs.reduce((acc, s) => acc + (s.projects?.length || 0), 0);
                    return (
                      <View key={gi} style={{ marginBottom: 12 }}>
                        <TouchableOpacity
                          onPress={() => setProjectPickerExpanded(prev => ({ ...prev, [g.name]: !expanded }))}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityRole="button"
                        >
                          <MaterialIcons name={expanded ? 'remove' : 'add'} size={20} color="#263238" />
                          <Text style={{ fontWeight: 'bold', fontSize: 17, marginLeft: 6, color: '#263238' }}>{g.name} ({totalProjects})</Text>
                        </TouchableOpacity>
                        {expanded && (
                          <View style={{ marginTop: 6 }}>
                            {filteredSubs.map((s, si) => {
                              const isSubExpanded = !!(projectPickerSubExpanded[g.name] && projectPickerSubExpanded[g.name][s.name]);
                              const toggleSub = () => {
                                setProjectPickerSubExpanded(prev => {
                                  const groupState = { ...(prev[g.name] || {}) };
                                  groupState[s.name] = !isSubExpanded;
                                  return { ...prev, [g.name]: groupState };
                                });
                              };
                              return (
                                <View key={si} style={{ marginLeft: 18, marginBottom: 6 }}>
                                  <TouchableOpacity onPress={toggleSub} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6 }} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <MaterialIcons name={isSubExpanded ? 'remove' : 'add'} size={18} color="#555" />
                                      <Text style={{ fontSize: 18, color: '#555', marginLeft: 6, fontWeight: 'bold' }}>{s.name} ({s.projects?.length || 0})</Text>
                                  </TouchableOpacity>
                                  {isSubExpanded && (
                                    <View style={{ marginTop: 4 }}>
                                          {((s.projects || []).length === 0) ? (
                                            <Text style={{ color: '#777', marginLeft: 24 }}>Inga projekt</Text>
                                          ) : (
                                            (s.projects || []).map((p) => (
                                              <TouchableOpacity
                                                key={`${p.id}`}
                                                style={[styles.projectRow, { marginLeft: 24, paddingVertical: 8 }]}
                                                onPress={() => {
                                                  setShowProjectPickerModal(false);
                                                  const today = new Date().toISOString().split('T')[0];
                                                  if (selectedActivity) {
                                                    navigation.navigate('ControlDetails', {
                                                      control: { type: selectedActivity, date: today },
                                                      project: p,
                                                      createdBy: email,
                                                      companyId
                                                    });
                                                  } else {
                                                    navigation.navigate('ProjectDetails', { project: p, createdBy: email, companyId });
                                                  }
                                                }}
                                                hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                              >
                                                <Text style={{ fontSize: 16 }}>{p.id} - {p.name}</Text>
                                              </TouchableOpacity>
                                            ))
                                          )}
                                    </View>
                                  )}
                                </View>
                              );
                            })}
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
                  <TouchableOpacity
                    style={[styles.actionNeutralButton, { alignSelf: 'flex-start' }]}
                    onPress={() => {
                      setShowProjectPickerModal(false);
                      setSelectMode('quick');
                      setGroupSelectSearch('');
                      setShowSelectGroupModal(true);
                    }}
                  >
                    <View style={styles.buttonContent}>
                      <MaterialIcons name="add" size={20} color="#263238" />
                      <Text style={[styles.neutralButtonText, styles.buttonLabel]}>Lägg till projekt</Text>
                    </View>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.actionNeutralButton, { alignSelf: 'flex-end' }]} onPress={() => setShowProjectPickerModal(false)}>
                    <View style={styles.buttonContent}>
                      <MaterialIcons name="close" size={20} color="#263238" />
                      <Text style={[styles.neutralButtonText, styles.buttonLabel]}>Avbryt</Text>
                    </View>
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </TouchableOpacity>
        </Modal>

        {/* Sticky header: Projektlista + Sök */}
        <View style={{ backgroundColor: '#fff' }}>
          <Text style={styles.sectionTitle}>Projektlista</Text>
          {/* Sökfält med ikon */}
          <View style={[styles.searchContainer, { marginBottom: 8 }]}>
            <View style={styles.searchWrapper}>
              <MaterialIcons name="search" size={18} color="#888" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Sök projekt"
                placeholderTextColor="#888"
                value={search}
                onChangeText={setSearch}
              />
            </View>
          {/* + Lägg till knapp */}
          <TouchableOpacity
            style={styles.addGroupButton}
            onPress={() => setShowCreateMenu(true)}
            accessibilityRole="button"
            accessibilityLabel="Lägg till"
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <MaterialIcons name="add" size={22} color="#263238" />
              <Text style={styles.groupTitle}>Lägg till</Text>
            </View>
          </TouchableOpacity>
          {/* Modal för val av typ */}
          {showCreateMenu && (
            <View style={{
              position: 'absolute',
              top: 0, left: 0, right: 0, bottom: 0,
              backgroundColor: 'rgba(38,50,56,0.45)',
              justifyContent: 'center', alignItems: 'center',
              zIndex: 99
            }}>
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 20,
                minWidth: 260,
                shadowColor: '#000',
                shadowOpacity: 0.18,
                shadowRadius: 8,
                elevation: 5,
              }}>
                <Text style={{ fontSize: 17, fontWeight: '700', marginBottom: 12, textAlign: 'center' }}>Vad vill du skapa?</Text>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  onPress={() => { setShowCreateMenu(false); setGroupType('main'); setSelectedMainGroup(''); setShowGroupModal(true); }}
                >
                  <MaterialIcons name="folder" size={22} color="#263238" />
                  <Text style={{ marginLeft: 12, fontSize: 15 }}>Huvudgrupp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  onPress={() => {
                    if (hierarchy.length === 0) {
                      showInfo('Ingen huvudgrupp', 'Skapa först en huvudgrupp.');
                    } else {
                      // Förvälja huvudmapp vid skapande av undermapp: använd expanderad eller enda
                      const onlyOne = (hierarchy || []).length === 1 ? hierarchy[0]?.name : null;
                      const expandedOne = (hierarchy || []).find(g => !!g.expanded)?.name || null;
                      const preselect = expandedOne || onlyOne || '';
                      setShowCreateMenu(false);
                      setGroupType('sub');
                      setSelectedMainGroup(preselect);
                      setShowGroupModal(true);
                    }
                  }}
                >
                  <MaterialIcons name="create-new-folder" size={22} color="#263238" />
                  <Text style={{ marginLeft: 12, fontSize: 15 }}>Undermapp</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  onPress={() => {
                    setShowCreateMenu(false);
                    setNewProject({ id: '', name: '', date: '' });
                    setShowNewProjectModal(true);
                  }}
                >
                  <MaterialIcons name="description" size={22} color="#263238" />
                  <Text style={{ marginLeft: 12, fontSize: 15 }}>Projekt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ marginTop: 10, alignSelf: 'center' }}
                  onPress={() => setShowCreateMenu(false)}
                >
                  <Text style={{ color: '#1976D2', fontSize: 15 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          </View>
        </View>

        {/* Formulär och knapp för nytt projekt borttagna – hanteras nu via Lägg till-meny */}

        {/* Hierarkisk projektlista */}
        <View style={{ marginTop: 16 }}>
          {hierarchy.length === 0 && (
            <View>
              <View style={styles.infoBox}>
                <MaterialIcons name="info" size={20} color="#0a7ea4" />
                <Text style={styles.infoBoxText}>Inga huvudgrupper skapade ännu.</Text>
              </View>
              {/* Huvudgrupp skapas via "+ Skapa ny grupp" knappen ovan */}
            </View>
          )}
          {(() => {
            const mainGroupsSorted = (hierarchy || [])
              .map((g, i) => ({ ...g, __i: i }))
              .slice()
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv', { sensitivity: 'base' }));
            if (mainGroupsSorted.length === 0) return null;
            return (
              <View style={styles.unifiedGroupList}>
                {mainGroupsSorted.map((mainGroup, idx) => {
                  let swipeRef = null;
                  const renderRightActions = (progress) => {
                    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [80, 0] });
                    return (
                      <Animated.View style={[styles.swipeActions, { transform: [{ translateX }] }]}> 
                        <TouchableOpacity
                          style={styles.swipeActionBtn}
                          onPress={() => {
                            setActionTarget({ type: 'main', index: mainGroup.__i });
                            setShowActionModal(true);
                            swipeRef?.close();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Ändra huvudmapp"
                        >
                          <MaterialIcons name="edit" size={20} color="#fff" />
                          <Text style={styles.swipeActionText}>Ändra</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  };
                  const renderLeftActions = (progress) => {
                    const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] });
                    return (
                      <Animated.View style={[styles.swipeAddActions, { transform: [{ translateX }] }]}> 
                        <TouchableOpacity
                          style={styles.swipeAddBtn}
                          onPress={() => {
                            setGroupType('sub');
                            setSelectedMainGroup(mainGroup.name);
                            setNewGroupName('');
                            setShowGroupModal(true);
                            swipeRef?.close();
                          }}
                          accessibilityRole="button"
                          accessibilityLabel="Lägg till undermapp"
                        >
                          <MaterialIcons name="add" size={20} color="#fff" />
                          <Text style={styles.swipeAddText}>Lägg till</Text>
                        </TouchableOpacity>
                      </Animated.View>
                    );
                  };
                  return (
                    <View key={mainGroup.name} style={[styles.unifiedGroupItem, idx === 0 && styles.unifiedGroupItemFirst, idx === mainGroupsSorted.length - 1 && styles.unifiedGroupItemLast]}>
                      <Swipeable
                        ref={(r) => { swipeRef = r; }}
                        renderRightActions={renderRightActions}
                        renderLeftActions={renderLeftActions}
                        friction={0.7}
                        overshootRight={false}
                        overshootLeft={false}
                        onSwipeableWillOpen={() => {
                          if (openSwipeRef.current && openSwipeRef.current !== swipeRef) {
                            openSwipeRef.current.close();
                          }
                          openSwipeRef.current = swipeRef;
                        }}
                        onSwipeableClose={() => {
                          if (openSwipeRef.current === swipeRef) openSwipeRef.current = null;
                        }}
                      >
                        <TouchableOpacity
                          style={styles.unifiedGroupHeader}
                          onPress={() => {
                            const updated = [...hierarchy];
                            updated.forEach((g, gi) => { if (gi !== mainGroup.__i) g.expanded = false; });
                            const willExpand = !updated[mainGroup.__i].expanded;
                            updated[mainGroup.__i].expanded = willExpand;
                            if (!willExpand) {
                              const subs = updated[mainGroup.__i].subgroups || [];
                              for (let i = 0; i < subs.length; i++) {
                                subs[i].expanded = false;
                              }
                              updated[mainGroup.__i].subgroups = subs;
                            }
                            setHierarchy(updated);
                            swipeRef.current?.close();
                          }}
                          accessibilityRole="button"
                          accessibilityState={{ expanded: !!mainGroup.expanded }}
                          accessibilityLabel={`Huvudmapp ${mainGroup.name}`}
                          accessibilityHint={mainGroup.expanded ? 'Fäll ihop mappen' : 'Fäll ut mappen'}
                          activeOpacity={0.85}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                            <MaterialIcons name={mainGroup.expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                            <Text style={styles.groupTitle}>{mainGroup.name}</Text>
                          </View>
                        </TouchableOpacity>
                      </Swipeable>
                    {mainGroup.expanded && (
                      <View style={styles.unifiedGroupBody}>
                        {(mainGroup.subgroups || []).length === 0 && (
                          <View style={{ marginTop: 8 }}>
                            <View style={styles.infoBox}>
                              <MaterialIcons name="info" size={20} color="#0a7ea4" />
                              <Text style={styles.infoBoxText}>Ingen mapp skapad</Text>
                            </View>
                            <TouchableOpacity
                              style={styles.actionPrimaryButton}
                              onPress={() => {
                                setGroupType('sub');
                                setSelectedMainGroup(mainGroup.name);
                                setShowGroupModal(true);
                              }}
                            >
                              <View style={styles.buttonContent}>
                                <MaterialIcons name="create-new-folder" size={20} color="#fff" />
                                <Text style={[styles.saveButtonText, styles.buttonLabel]}>Skapa undergrupp</Text>
                              </View>
                            </TouchableOpacity>
                          </View>
                        )}
                        {(() => {
                          const subSorted = (mainGroup.subgroups || [])
                            .map((s, si) => ({ ...s, __si: si }))
                            .slice()
                            .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'sv', { sensitivity: 'base' }));
                          return subSorted.map((sub) => {
                            let subSwipeRef = null;
                            return (
                            <View key={sub.name} style={styles.subGroupContainer}>
                              <Swipeable
                                ref={(r) => { subSwipeRef = r; }}
                                renderRightActions={(progress) => {
                                  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
                                  return (
                                    <Animated.View style={[styles.swipeActions, { transform: [{ translateX }] }]}> 
                                      <TouchableOpacity
                                        style={styles.swipeActionBtnSmall}
                                        onPress={() => {
                                          setActionTarget({ type: 'sub', mainIndex: mainGroup.__i, index: sub.__si });
                                          setShowActionModal(true);
                                          subSwipeRef?.close();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Ändra undermapp"
                                      >
                                        <MaterialIcons name="edit" size={18} color="#fff" />
                                        <Text style={styles.swipeActionTextSmall}>Ändra</Text>
                                      </TouchableOpacity>
                                    </Animated.View>
                                  );
                                }}
                                renderLeftActions={(progress) => {
                                  const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
                                  return (
                                    <Animated.View style={[styles.swipeAddActions, { transform: [{ translateX }] }]}> 
                                      <TouchableOpacity
                                        style={styles.swipeAddBtnSmall}
                                        onPress={() => {
                                          setQuickTarget({ mainIndex: mainGroup.__i, subIndex: sub.__si });
                                          setQuickProject({ id: '', name: '' });
                                          setShowQuickProjectModal(true);
                                          subSwipeRef?.close();
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Lägg till projekt"
                                      >
                                        <MaterialIcons name="add" size={18} color="#fff" />
                                        <Text style={styles.swipeAddTextSmall}>Lägg till</Text>
                                      </TouchableOpacity>
                                    </Animated.View>
                                  );
                                }}
                                overshootRight={false}
                                overshootLeft={false}
                                friction={0.7}
                                onSwipeableWillOpen={() => {
                                  if (openSwipeRef.current && openSwipeRef.current !== subSwipeRef) {
                                    openSwipeRef.current.close();
                                  }
                                  openSwipeRef.current = subSwipeRef;
                                }}
                                onSwipeableClose={() => {
                                  if (openSwipeRef.current === subSwipeRef) openSwipeRef.current = null;
                                }}
                              >
                                <TouchableOpacity
                                  style={styles.subGroupHeader}
                                  onPress={() => {
                                    const updated = [...hierarchy];
                                    updated[mainGroup.__i].subgroups[sub.__si].expanded = !updated[mainGroup.__i].subgroups[sub.__si].expanded;
                                    setHierarchy(updated);
                                    subSwipeRef.current?.close();
                                  }}
                                  accessibilityRole="button"
                                  accessibilityState={{ expanded: !!sub.expanded }}
                                  activeOpacity={0.8}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                    <MaterialIcons name={sub.expanded ? 'expand-less' : 'expand-more'} size={20} color="#263238" />
                                    <Text style={styles.subGroupTitle}>{sub.name}</Text>
                                  </View>
                                </TouchableOpacity>
                              </Swipeable>
                              {sub.expanded && (
                                <View style={{ marginLeft: 8, marginTop: 4 }}>
                                  {(() => {
                                    const filtered = (sub.projects || []).filter(p => {
                                      if (!search) return true;
                                      const s = search.toLowerCase();
                                      return (
                                        (p.name || '').toLowerCase().includes(s) ||
                                        (p.id || '').toLowerCase().includes(s)
                                      );
                                    });
                                    const parseNum = (v) => {
                                      const n = parseInt(String(v).replace(/[^0-9]/g, ''), 10);
                                      return Number.isFinite(n) ? n : null;
                                    };
                                    const sorted = filtered.slice().sort((a, b) => {
                                      const an = parseNum(a.id);
                                      const bn = parseNum(b.id);
                                      if (an != null && bn != null) return an - bn;
                                      return String(a.id || '').localeCompare(String(b.id || ''), 'sv', { sensitivity: 'base' });
                                    });
                                    return sorted.map((project, pjIndex) => (
                                      <Swipeable
                                        key={project.id}
                                        renderRightActions={(progress) => {
                                          const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });
                                          return (
                                            <Animated.View style={[styles.swipeActions, { transform: [{ translateX }] }]}> 
                                              <TouchableOpacity
                                                style={styles.swipeActionBtnSmall}
                                                onPress={() => {
                                                  setActionTarget({ type: 'project', mainIndex: mainGroup.__i, subIndex: sub.__si, index: pjIndex });
                                                  setRenameValue(project.name || '');
                                                  setShowNameEditModal(true);
                                                }}
                                                accessibilityRole="button"
                                                accessibilityLabel="Ändra projekt"
                                              >
                                                <MaterialIcons name="edit" size={18} color="#fff" />
                                                <Text style={styles.swipeActionTextSmall}>Ändra</Text>
                                              </TouchableOpacity>
                                            </Animated.View>
                                          );
                                        }}
                                        renderLeftActions={(progress) => {
                                          const translateX = progress.interpolate({ inputRange: [0, 1], outputRange: [-60, 0] });
                                          return (
                                            <Animated.View style={[styles.swipeAddActions, { transform: [{ translateX }] }]}> 
                                              <TouchableOpacity
                                                style={styles.swipeAddBtnSmall}
                                                onPress={() => {
                                                  const isMain = false;
                                                  const firstTitle = 'Ta bort projekt';
                                                  const secondTitle = 'Bekräfta borttagning';
                                                  const firstMsg = 'Vill du verkligen ta bort detta projekt? Detta går inte att ångra.';
                                                  const secondMsg = 'Är du helt säker? Projektet tas bort.';
                                                  showInfo(firstTitle, firstMsg, {
                                                    primaryLabel: 'Fortsätt',
                                                    onPrimary: () => {
                                                      hideInfo();
                                                      setActionTarget({ type: 'project', mainIndex: mainGroup.__i, subIndex: sub.__si, index: pjIndex });
                                                      showInfo(secondTitle, secondMsg, {
                                                        primaryLabel: 'Ta bort',
                                                        onPrimary: () => { hideInfo(); handleDelete(); },
                                                        closeLabel: 'Avbryt'
                                                      });
                                                    },
                                                    closeLabel: 'Avbryt'
                                                  });
                                                }}
                                                accessibilityRole="button"
                                                accessibilityLabel="Ta bort projekt"
                                              >
                                                <MaterialIcons name="delete" size={18} color="#fff" />
                                                <Text style={styles.swipeAddTextSmall}>Ta bort</Text>
                                              </TouchableOpacity>
                                            </Animated.View>
                                          );
                                        }}
                                        overshootRight={false}
                                        overshootLeft={false}
                                        friction={0.7}
                                      >
                                        <TouchableOpacity
                                          style={styles.projectCard}
                                          onPress={() => navigation.navigate('ProjectDetails', { project, createdBy: email })}
                                          accessibilityRole="button"
                                          accessibilityLabel={`Öppna projekt ${project.name}`}
                                          accessibilityHint={`Visar detaljer för ${project.name}`}
                                        >
                                          <View style={{ flex: 1 }}>
                                            <Text style={styles.projectTitle}>{project.id} - {project.name}</Text>
                                          </View>
                                          <MaterialIcons name="chevron-right" size={20} color="#909090" />
                                        </TouchableOpacity>
                                      </Swipeable>
                                    ));
                                  })()}
                                  {sub.projects && sub.projects.length === 0 && (
                                    <View style={[styles.infoBox, { marginTop: 4 }]}> 
                                      <MaterialIcons name="info" size={18} color="#0a7ea4" />
                                      <Text style={styles.infoBoxText}>Inga projekt skapade</Text>
                                    </View>
                                  )}
                                      {/* Slimmad rad för + Skapa nytt projekt */}
                                      <TouchableOpacity
                                        style={styles.addProjectButton}
                                        onPress={() => {
                                          setQuickTarget({ mainIndex: mainGroup.__i, subIndex: sub.__si });
                                          setQuickProject({ id: '', name: '' });
                                          setShowQuickProjectModal(true);
                                        }}
                                        accessibilityRole="button"
                                        accessibilityLabel="Skapa nytt projekt"
                                      >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                                          <MaterialIcons name="add" size={20} color="#263238" />
                                          <Text style={styles.projectAddTitle}>Skapa nytt projekt</Text>
                                        </View>
                                      </TouchableOpacity>
                                </View>
                              )}
                            </View>
                            );
                          });
                        })()}
                      </View>
                    )}
                  </View>
                );})}
              </View>
            );
          })()}

          {/* Slimmad rad för + Skapa ny grupp borttagen – hanteras nu via Lägg till-meny */}
        </View>
        </View>
        }
      />

      {/* Modal: Skapa nytt projekt (grå kortvariant) */}
      <Modal visible={showNewProjectModal} transparent={true} animationType="fade" onRequestClose={closeAllModals}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={closeAllModals}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.newProjectCard}>
              <Text style={styles.modalText}>Skapa nytt projekt</Text>
              <TextInput
                style={styles.input}
                placeholder="Projektnummer"
                placeholderTextColor="#888"
                value={newProject.id}
                onChangeText={(t) => setNewProject({ ...newProject, id: t })}
              />
              <TextInput
                style={styles.input}
                placeholder="Projektnamn"
                placeholderTextColor="#888"
                value={newProject.name}
                onChangeText={(t) => setNewProject({ ...newProject, name: t })}
              />
              <TouchableOpacity style={styles.actionPrimaryButton} onPress={() => {
                const newErrors = {};
                if (!newProject.id) newErrors.id = 'Fyll i projektnummer';
                if (!newProject.name) newErrors.name = 'Fyll i projektnamn';
                if (Object.keys(newErrors).length > 0) {
                  showInfo('Fel', Object.values(newErrors).join('\n'));
                  return;
                }
                setShowNewProjectModal(false);
                setSelectMode('form');
                setGroupSelectSearch('');
                setGroupSelectExpanded({});
                setShowSelectGroupModal(true);
              }}>
                <View style={styles.buttonContent}>
                  <MaterialIcons name="save" size={20} color="#fff" />
                  <Text style={[styles.saveButtonText, styles.buttonLabel]}>Välj mapp</Text>
                </View>
              </TouchableOpacity>
              <TouchableOpacity style={styles.actionDestructiveButton} onPress={closeAllModals}>
                <View style={styles.buttonContent}>
                  <MaterialIcons name="close" size={20} color="#fff" />
                  <Text style={[styles.destructiveButtonText, styles.buttonLabel]}>Avbryt</Text>
                </View>
              </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      

      {/* Modal för gruppval vid projekt – omstylad */}
      <Modal visible={showSelectGroupModal} transparent={true} animationType="fade" onRequestClose={closeAllModals}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={closeAllModals}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.selectModalCard}>
              <View style={styles.selectModalHeaderRow}>
                <Text style={styles.selectModalTitle}>Välj grupp för projektet</Text>
                <TouchableOpacity onPress={closeAllModals} accessibilityLabel="Stäng">
                  <MaterialIcons name="close" size={22} color="#263238" />
                </TouchableOpacity>
              </View>
            {/* Sökfält för undergrupper i modalen */}
              <TextInput
                style={[styles.searchInput, { marginBottom: 8 }]}
                placeholder="Sök undergrupp"
                placeholderTextColor="#888"
                value={groupSelectSearch}
                onChangeText={setGroupSelectSearch}
              />
            {/* Scrollbar i kroppen när många grupper */}
            <View style={styles.selectModalBody}>
              <View style={{ maxHeight: 360 }}>
                <ScrollView>
                {hierarchy.map((group, mainIndex) => (
                  <View key={group.name} style={styles.groupSelectSection}>
                <TouchableOpacity
                  style={styles.groupSelectHeader}
                  activeOpacity={0.8}
                  onPress={() => {
                    const filteredCount = (group.subgroups || []).filter(
                      s => !groupSelectSearch || (s.name || '').toLowerCase().includes(groupSelectSearch.toLowerCase())
                    ).length;
                    if (filteredCount === 0) {
                      // Ingen undermapp – erbjud att skapa
                      setShowSelectGroupModal(false);
                      setGroupType('sub');
                      setSelectedMainGroup(group.name);
                      showInfo('Ingen undermapp', `Det finns ingen undermapp i "${group.name}". Vill du skapa en nu?`, {
                        primaryLabel: 'Ja, skapa mapp',
                        onPrimary: () => { hideInfo(); setShowGroupModal(true); },
                        closeLabel: 'Avbryt'
                      });
                      return;
                    }
                    setGroupSelectExpanded(prev => ({ ...prev, [group.name]: !prev[group.name] }));
                  }}
                >
                    <MaterialIcons name={groupSelectExpanded[group.name] ? 'folder-open' : 'folder'} size={20} color="#263238" />
                  {(() => {
                    const filtered = (group.subgroups || [])
                      .filter(s => !groupSelectSearch || (s.name || '').toLowerCase().includes(groupSelectSearch.toLowerCase()));
                    return (
                      <Text style={styles.groupSelectHeaderText}>
                        {group.name} ({filtered.length})
                      </Text>
                    );
                  })()}
                </TouchableOpacity>
                {groupSelectExpanded[group.name] && (
                <View style={styles.groupSelectSubList}>
                  {(() => {
                    const filteredSorted = (group.subgroups || [])
                      .filter(s => !groupSelectSearch || (s.name || '').toLowerCase().includes(groupSelectSearch.toLowerCase()))
                      .slice()
                      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
                    if (filteredSorted.length === 0) {
                      return <Text style={{ color: '#777' }}>Inga undergrupper</Text>;
                    }
                    return filteredSorted.map((sub, subIndex) => (
                      <TouchableOpacity
                        key={sub.name}
                        style={styles.groupSelectSubItem}
                        onPress={() => {
                          try {
                          const realSubIndex = (group.subgroups || []).findIndex(s => (s.name || '') === (sub.name || ''));
                          if (realSubIndex === -1) {
                            showInfo('Fel', 'Kunde inte hitta vald undermapp i hierarkin.');
                            return;
                          }
                          if (mainIndex == null || !hierarchy[mainIndex]) {
                            showInfo('Fel', 'Ogiltig huvudgrupp vid sparning.');
                            return;
                          }
                          if (selectMode === 'quick') {
                            // Öppna snabbmodal för att ange projektuppgifter med vald undermapp
                            setQuickTarget({ mainIndex, subIndex: realSubIndex });
                            setQuickProject({ id: '', name: '' });
                            setShowSelectGroupModal(false);
                            setShowQuickProjectModal(true);
                          } else {
                            // Säkerställ att projektnummer och namn är ifyllda i formulärflödet
                            if (!newProject.id || !newProject.name) {
                              showInfo('Saknar uppgifter', 'Fyll i projektnummer och projektnamn i formuläret först.');
                              return;
                            }
                            const updatedHierarchy = [...hierarchy];
                            if (!updatedHierarchy[mainIndex].subgroups || !updatedHierarchy[mainIndex].subgroups[realSubIndex]) {
                              showInfo('Fel', 'Undergruppen kunde inte hittas vid sparning.');
                              return;
                            }
                            // Förhindra dubbletter av projekt (id eller namn) i undermappen
                            const exists = updatedHierarchy.some(g => (g.subgroups || []).some(s => (s.projects || []).some(p =>
                              (p.id || '').trim().toLowerCase() === newProject.id.trim().toLowerCase() ||
                              (p.name || '').trim().toLowerCase() === newProject.name.trim().toLowerCase()
                            )));
                            if (exists) {
                              showInfo('Projekt finns redan', 'Ett projekt med detta nummer eller namn finns redan.');
                              return;
                            }
                            if (!updatedHierarchy[mainIndex].subgroups[realSubIndex].projects) {
                              updatedHierarchy[mainIndex].subgroups[realSubIndex].projects = [];
                            }
                            updatedHierarchy[mainIndex].subgroups[realSubIndex].projects.push({
                              id: newProject.id,
                              name: newProject.name,
                              createdAt: newProject.date,
                              createdBy: fullName
                            });
                            updatedHierarchy[mainIndex].expanded = true;
                            updatedHierarchy[mainIndex].subgroups[realSubIndex].expanded = true;
                            setHierarchy(updatedHierarchy);
                            setGroupSelectSearch('');
                            setShowSelectGroupModal(false);
                            setShowForm(false);
                            setNewProject({ id: '', name: '', date: '' });
                            showInfo('Projekt skapat', 'Projektet lades till i "' + group.name + ' / ' + sub.name + '".');
                          }
                          } catch (e) {
                            showInfo('Fel', 'Ett oväntat fel inträffade vid sparning. Försök igen.');
                          }
                        }}
                        activeOpacity={0.8}
                      >
                        <Text style={styles.groupSelectSubText}>{sub.name}</Text>
                        <MaterialIcons name="chevron-right" size={22} color="#888" />
                      </TouchableOpacity>
                    ));
                  })()}
                </View>
                  )}
                  </View>
                ))}
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity style={styles.actionDestructiveButton} onPress={closeAllModals}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="close" size={20} color="#fff" />
                <Text style={[styles.destructiveButtonText, styles.buttonLabel]}>Avbryt</Text>
              </View>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Modal för skapa ny grupp (grå kortvariant) */}
      <Modal
        visible={showGroupModal}
        transparent={true}
        animationType="fade"
        onRequestClose={() => {
          setShowGroupModal(false);
          setGroupType('main');
          setSelectedMainGroup('');
          setNewGroupName('');
        }}
      >
        <TouchableOpacity
          style={styles.centerOverlay}
          activeOpacity={1}
          onPress={() => {
            setShowGroupModal(false);
            setGroupType('main');
            setSelectedMainGroup('');
            setNewGroupName('');
          }}
        >
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.newProjectCard}>
            <Text style={styles.modalText}>Skapa ny mapp</Text>
            <View style={styles.segmentedContainer}>
              <TouchableOpacity
                style={[styles.segmentedButton, groupType === 'main' && styles.segmentedButtonActive]}
                onPress={() => setGroupType('main')}
              >
                <Text style={groupType === 'main' ? styles.segmentedLabelActive : styles.segmentedLabel}>Huvudmapp</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.segmentedButton, groupType === 'sub' && styles.segmentedButtonActive]}
                onPress={() => setGroupType('sub')}
              >
                <Text style={groupType === 'sub' ? styles.segmentedLabelActive : styles.segmentedLabel}>Undermapp</Text>
              </TouchableOpacity>
            </View>
            {groupType === 'main' && (
              <Text style={styles.helperText}>En huvudmapp samlar relaterade undermappar.</Text>
            )}
            {groupType === 'sub' && (
              <View style={{ marginVertical: 8 }}>
                <Text style={{ marginBottom: 4 }}>Välj huvudmapp:</Text>
                {hierarchy.length === 0 ? (
                  <View>
                    <View style={styles.infoBox}>
                      <MaterialIcons name="info" size={20} color="#0a7ea4" />
                      <Text style={styles.infoBoxText}>Ingen huvudmapp skapad</Text>
                    </View>
                    {/* Skapa huvudmapp via "+ Skapa ny grupp" */}
                  </View>
                ) : (
                  hierarchy.map((group) => (
                    <TouchableOpacity
                      key={group.name || Math.random().toString(36)}
                      onPress={() => setSelectedMainGroup(group.name)}
                      style={[
                        styles.segmentedListItem,
                        selectedMainGroup === group.name && styles.segmentedListItemActive
                      ]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        <MaterialIcons name="folder" size={18} color={selectedMainGroup === group.name ? '#fff' : '#263238'} />
                        <Text style={selectedMainGroup === group.name ? styles.segmentedListLabelActive : styles.segmentedListLabel}>
                          {group.name || 'Namnlös huvudmapp'}
                        </Text>
                      </View>
                      {selectedMainGroup === group.name && (
                        <MaterialIcons name="check" size={18} color="#fff" />
                      )}
                    </TouchableOpacity>
                  ))
                )}
                <Text style={styles.helperText}>Undermappen läggs i vald huvudmapp.</Text>
              </View>
            )}
            <TextInput
              style={styles.input}
              placeholder={groupType === 'main' ? 'Namn på huvudmapp' : 'Namn på undermapp'}
              value={newGroupName}
              onChangeText={setNewGroupName}
            />
            <TouchableOpacity style={styles.actionPrimaryButton} onPress={handleSaveGroup}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={[styles.saveButtonText, styles.buttonLabel]}>Spara</Text>
              </View>
            </TouchableOpacity>
            {/* Diskret hint när undermapp saknar huvudmapp/val */}
            {groupType === 'sub' && (
              (hierarchy.length === 0 ? (
                <Text style={[styles.helperText, { textAlign: 'center' }]}>Skapa en huvudmapp först via "+ Skapa ny grupp".</Text>
              ) : (!selectedMainGroup ? (
                <Text style={[styles.helperText, { textAlign: 'center' }]}>Välj en huvudmapp för undermappen.</Text>
              ) : null))
            )}
            <TouchableOpacity
              style={styles.actionNeutralButton}
              onPress={() => {
                setShowGroupModal(false);
                setGroupType('main');
                setSelectedMainGroup('');
                setNewGroupName('');
              }}
            >
              <View style={styles.buttonContent}>
                <MaterialIcons name="close" size={20} color="#263238" />
                <Text style={[styles.neutralButtonText, styles.buttonLabel]}>Avbryt</Text>
              </View>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Modal för val: Byta namn eller Ta bort */}
      <Modal visible={showActionModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalText}>Vad vill du ändra?</Text>
            <TouchableOpacity style={styles.actionPrimaryButton} onPress={() => {
              setShowActionModal(false);
              setShowNameEditModal(true);
              setRenameValue(actionTarget.type === 'main'
                ? hierarchy[actionTarget.index].name
                : hierarchy[actionTarget.mainIndex].subgroups[actionTarget.index].name);
            }}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="edit" size={20} color="#fff" />
                <Text style={[styles.saveButtonText, styles.buttonLabel]}>Byta namn</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionDestructiveButton} onPress={() => {
              setShowActionModal(false);
              const isMain = actionTarget.type === 'main';
              const firstTitle = isMain ? 'Ta bort huvudmapp' : 'Ta bort undermapp';
              const secondTitle = isMain ? 'Bekräfta borttagning' : 'Bekräfta borttagning';
              const firstMsg = isMain
                ? 'Vill du verkligen ta bort denna huvudmapp? Detta går inte att ångra.'
                : 'Vill du verkligen ta bort denna undermapp? Detta går inte att ångra.';
              const secondMsg = isMain
                ? 'Är du helt säker? Alla undermappar och projekt tas bort.'
                : 'Är du helt säker? Alla projekt i undermappen tas bort.';
              showInfo(firstTitle, firstMsg, {
                primaryLabel: 'Fortsätt',
                onPrimary: () => {
                  hideInfo();
                  showInfo(secondTitle, secondMsg, {
                    primaryLabel: 'Ta bort',
                    onPrimary: () => { hideInfo(); handleDelete(); },
                    closeLabel: 'Avbryt'
                  });
                },
                closeLabel: 'Avbryt'
              });
            }}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="delete" size={20} color="#fff" />
                <Text style={[styles.saveButtonText, styles.buttonLabel]}>Ta bort</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionDestructiveButton} onPress={() => setShowActionModal(false)}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="close" size={20} color="#fff" />
                <Text style={[styles.destructiveButtonText, styles.buttonLabel]}>Avbryt</Text>
              </View>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Modal för namnbyte */}
      <Modal visible={showNameEditModal} transparent={true} animationType="fade">
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.modalContent}>
            <Text style={styles.modalText}>Byt namn</Text>
            <TextInput style={styles.input} value={renameValue} onChangeText={setRenameValue} />
            <TouchableOpacity style={styles.actionPrimaryButton} onPress={handleRename}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={[styles.saveButtonText, styles.buttonLabel]}>Spara</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity style={styles.actionDestructiveButton} onPress={() => setShowNameEditModal(false)}>
              <View style={styles.buttonContent}>
                <MaterialIcons name="close" size={20} color="#fff" />
                <Text style={[styles.destructiveButtonText, styles.buttonLabel]}>Avbryt</Text>
              </View>
            </TouchableOpacity>
            </View>
          </KeyboardAvoidingView>
        </View>
      </Modal>

      {/* Omstylad snabb projekt-modal */}
      <Modal visible={showQuickProjectModal} transparent={true} animationType="fade" onRequestClose={() => setShowQuickProjectModal(false)}>
        <TouchableOpacity style={styles.quickModalBackdrop} activeOpacity={1} onPress={() => setShowQuickProjectModal(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.quickModalCardSlim}>
              <Text style={styles.quickModalTitle}>Nytt projekt</Text>
              <View style={styles.quickModalRow}>
                <TextInput
                  style={styles.quickModalInput}
                  placeholder="Nummer"
                  placeholderTextColor="#888"
                  value={quickProject.id}
                  onChangeText={(t) => setQuickProject({ ...quickProject, id: t })}
                  autoFocus
                />
                <TextInput
                  style={styles.quickModalInput}
                  placeholder="Namn"
                  placeholderTextColor="#888"
                  value={quickProject.name}
                  onChangeText={(t) => setQuickProject({ ...quickProject, name: t })}
                />
              </View>
              <View style={styles.quickModalActionsRow}>
                <TouchableOpacity
                  style={styles.quickModalAction}
                  onPress={() => {
                    if (!quickProject.id || !quickProject.name) {
                      showInfo('Fel', 'Fyll i projektnummer och namn.');
                      return;
                    }
                    const exists = hierarchy.some(g => (g.subgroups || []).some(s => (s.projects || []).some(p =>
                      (p.id || '').trim().toLowerCase() === quickProject.id.trim().toLowerCase() ||
                      (p.name || '').trim().toLowerCase() === quickProject.name.trim().toLowerCase()
                    )));
                    if (exists) {
                      showInfo('Projekt finns redan', 'Detta nummer eller namn används redan.');
                      return;
                    }
                    if (!quickTarget) { setShowQuickProjectModal(false); return; }
                    const updated = [...hierarchy];
                    const today = new Date().toISOString().split('T')[0];
                    if (!updated[quickTarget.mainIndex].subgroups[quickTarget.subIndex].projects) {
                      updated[quickTarget.mainIndex].subgroups[quickTarget.subIndex].projects = [];
                    }
                    updated[quickTarget.mainIndex].subgroups[quickTarget.subIndex].projects.push({
                      id: quickProject.id,
                      name: quickProject.name,
                      createdAt: today,
                      createdBy: fullName
                    });
                    setHierarchy(updated);
                    setShowQuickProjectModal(false);
                    setQuickProject({ id: '', name: '' });
                    setQuickTarget(null);
                    showInfo('Projekt skapat', 'Projektet lades till.');
                  }}
                  accessibilityLabel="Spara projekt"
                >
                  <MaterialIcons name="save" size={18} color="#fff" />
                  <Text style={styles.quickModalActionText}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.quickModalActionCancel}
                  onPress={() => {
                    setShowQuickProjectModal(false);
                    setQuickProject({ id: '', name: '' });
                    setQuickTarget(null);
                  }}
                  accessibilityLabel="Avbryt"
                >
                  <MaterialIcons name="close" size={18} color="#263238" />
                  <Text style={styles.quickModalCancelText}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>

      {/* Borttagning använder InfoPopup med två knappar – ingen separat modal behövs */}

      {/* Gemensam informations-/bekräftelsepopup */}
      <InfoPopup
        visible={infoPopup.visible}
        title={infoPopup.title}
        message={infoPopup.message}
        onClose={hideInfo}
        closeLabel={infoPopup.closeLabel}
        primaryLabel={infoPopup.primaryLabel}
        onPrimary={infoPopup.onPrimary}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', paddingHorizontal: 24, paddingTop: 8 },

  // Header med logotyper
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  msLogo: { width: 120, height: 120, resizeMode: 'contain' }, // Justerad storlek
  companyLogo: { width: 160, height: 64, resizeMode: 'contain' }, // Justerad storlek
  headerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },

  // Top bar med välkomsttext och logga ut knapp
  topBar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  welcome: { fontSize: 16, fontWeight: '600', color: '#263238' },
  logoutBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#263238', borderRadius: 6 },
  logoutText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // Rubrik
  title: { fontSize: 28, fontWeight: 'bold', marginTop: 8, marginBottom: 8, color: '#263238' },
  // Hjälprad under rubrik
  instructions: { fontSize: 14, color: '#666', marginBottom: 24 },

  // Aktivitetslista (arbetsmoment)
  options: { marginBottom: 32 }, // Extra spacing till projektlista/sökfält
  activityOption: {
    flexDirection: 'row',       // Ikon och text på samma rad
    alignItems: 'center',       // Vertikal centrering
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E0E0E0',
    // Skugga för iOS
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    // Skugga för Android
    elevation: 3,
  },
  icon: {
    width: 28,                  // Något mindre ikon
    height: 28,
    marginRight: 14,
    resizeMode: 'contain'
  },
  optionText: {
    fontSize: 20,               // Större text
    fontWeight: 'bold',
    color: '#263238',
    flex: 1,
    flexShrink: 1
  },
  // Rubrik "Projektlista"
  sectionTitle: {
    fontSize: 28,
    fontWeight: '600',
    color: '#263238',
    marginBottom: 12,
    letterSpacing: 0.2
  },

  // Sökfält
  searchContainer: { marginBottom: 8, marginTop: 16 },
  searchWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
    borderColor: '#E0E0E0',
    borderWidth: 1,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 2
  },
  searchInput: {
    flex: 1,
    color: '#000',
    fontSize: 16
  },

  // Formulär för nytt projekt
  form: {
    marginBottom: 16,
    backgroundColor: '#F7FAFC',
    padding: 16,
    borderRadius: 8
  },
  input: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    fontSize: 16,
    marginBottom: 8
  },
  error: { color: 'red', fontSize: 14, marginBottom: 8 },

  addGroupButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E3E6E8'
  },
  addProjectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E3E6E8'
  },
  projectAddTitle: {
    fontSize: 16,
    color: '#263238',
    fontWeight: '500'
  },

  saveButton: {
    backgroundColor: '#263238',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8
  },
  cancelButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    marginTop: 8
  },
  saveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  cancelText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  // Snabbprojekt modal nya stilar
  quickModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 24
  },
  quickModalCardSlim: {
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4
  },
  quickModalTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#263238'
  },
  quickModalRow: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12
  },
  quickModalInput: {
    backgroundColor: '#F9FBFC',
    borderColor: '#D0D7DC',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 15,
    color: '#263238'
  },
  quickModalActionsRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12
  },
  quickModalAction: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#43A047',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  quickModalActionText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },
  quickModalActionCancel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#D32F2F',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8
  },
  quickModalCancelText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '600'
  },

  // Hierarkisk projektlista
  groupContainer: {
    marginBottom: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E6E9EC',
    padding: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  // Huvudmapp-rad (enhetlig definition)
  groupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 6,
    backgroundColor: '#F7FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E7EEF3',
  },
  groupTitle: { fontSize: 20, fontWeight: '600', color: '#263238', flexShrink: 1 },
  headerRightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  countsRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 2 },
  countChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EEF3F6',
    borderColor: '#DCE5EB',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 999,
  },
  countChipText: { color: '#455A64', fontSize: 12, fontWeight: '700' },
  manageBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#263238',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  manageBtnText: { color: '#fff', fontSize: 13, fontWeight: '700', marginLeft: 6 },
  // Slimmad undermapp-stil
  subGroupContainer: {
    marginTop: 6,
    paddingLeft: 8
  },
  subGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8
  },
  subGroupTitle: { fontSize: 18, fontWeight: '600', color: '#263238' },
  projectCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginBottom: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E3E6E8',
    backgroundColor: '#FFFFFF'
  },
  projectTitle: { color: '#263238', fontSize: 16, fontWeight: '500' },
  projectMeta: { color: '#6B7280', fontSize: 12, marginTop: 2 },
  actionText: { color: '#2979FF', marginLeft: 8 },

  // Modaler
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
    alignItems: 'stretch'
  },
  modalContent: {
    backgroundColor: '#fff',
    padding: 20,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    width: '100%'
  },
  modalText: { fontSize: 18, fontWeight: '600', textAlign: 'center', marginBottom: 16, color: '#263238' },

  // Grå informations-popup
  infoPopupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center'
  },
  infoPopupCard: {
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    padding: 16,
    minWidth: '75%',
    borderWidth: 1,
    borderColor: '#DADFE3'
  },
  infoPopupTitle: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 8, textAlign: 'center' },
  infoPopupMessage: { fontSize: 16, color: '#37474F', textAlign: 'center' },
  infoPopupActions: { marginTop: 12, flexDirection: 'row', justifyContent: 'center' },
  infoPopupClose: { paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#CFD8DC', borderRadius: 8 },
  infoPopupCloseText: { color: '#263238', fontWeight: '700' },

  // Centered gray overlay used by new project modal
  centerOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  newProjectCard: {
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    padding: 16,
    minWidth: '85%',
    borderWidth: 1,
    borderColor: '#DADFE3'
  },
  selectProjectCard: {
    backgroundColor: '#ECEFF1',
    borderRadius: 12,
    padding: 16,
    minWidth: '85%',
    borderWidth: 1,
    borderColor: '#DADFE3'
  },
  // Ny, snyggare kort för gruppval
  selectModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 16,
    minWidth: '85%',
    maxHeight: 420,
    borderWidth: 1,
    borderColor: '#E5E8EB',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 5
  },
  selectModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8
  },
  selectModalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#263238'
  },
  selectModalBody: {
    maxHeight: 320,
    marginTop: 4
  },

  // Popup för aktivitet
  activityQuestion: {
    fontSize: 20,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
    color: '#263238'
  },
  primaryButton: {
    backgroundColor: '#263238',
    borderRadius: 8,
    paddingVertical: 14,
    marginBottom: 12,
    alignItems: 'center'
  },
  primaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },
  secondaryButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center'
  },
  secondaryButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold'
  },

  // Nya, konsekventa modalknappar
  actionPrimaryButton: {
    backgroundColor: '#263238',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  actionDestructiveButton: {
    backgroundColor: '#D32F2F', // Röd för Ta bort
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  actionNeutralButton: {
    backgroundColor: '#E9ECEF',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8
  },
  neutralButtonText: { color: '#263238', fontSize: 18, fontWeight: 'bold' },
  destructiveButtonText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
  buttonContent: { flexDirection: 'row', alignItems: 'center' },
  buttonLabel: { marginLeft: 8 },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#E8F4F8',
    borderColor: '#CCE7EF',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginBottom: 8,
  },
  infoBoxText: { color: '#0a7ea4' },

  // Välj grupp-modal
  groupSelectSection: {
    backgroundColor: '#F7FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E7E7E7',
    padding: 12,
    marginBottom: 10,
  },
  groupSelectHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  groupSelectHeaderText: { fontSize: 16, fontWeight: '700', color: '#263238' },
  groupSelectSubList: { marginTop: 4 },
  groupSelectSubItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginTop: 8,
  },
  groupSelectSubText: { fontSize: 16, color: '#263238' },

  option: { fontSize: 16, marginBottom: 8 },
  selectedOption: {
    fontSize: 16,
    marginBottom: 8,
    fontWeight: 'bold',
    color: '#263238'
  },
  // Segmented control styles for clearer selection
  segmentedContainer: {
    flexDirection: 'row',
    backgroundColor: '#E9ECEF',
    borderRadius: 10,
    padding: 4,
    gap: 6,
    marginBottom: 8
  },
  segmentedButton: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E0E0E0'
  },
  segmentedButtonActive: {
    backgroundColor: '#263238',
    borderColor: '#263238'
  },
  segmentedLabel: { color: '#263238', fontSize: 16, fontWeight: '600' },
  segmentedLabelActive: { color: '#fff', fontSize: 16, fontWeight: '700' },
  helperText: { fontSize: 13, color: '#666', marginTop: 4 }
  ,
  // Segmented list item styles for selecting huvudmapp
  segmentedListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    marginTop: 8
  },
  segmentedListItemActive: {
    backgroundColor: '#263238',
    borderColor: '#263238'
  },
  segmentedListLabel: { color: '#263238', fontSize: 16, fontWeight: '600' },
  segmentedListLabelActive: { color: '#fff', fontSize: 16, fontWeight: '700' }
  ,
  // Sammanhängande huvudgrupp-lista
  unifiedGroupList: {
    marginTop: 4
  },
  unifiedGroupItem: {
    borderBottomWidth: 1,
    borderBottomColor: '#E3E6E8'
  },
  unifiedGroupItemFirst: {},
  unifiedGroupItemLast: {
    borderBottomWidth: 0
  },
  unifiedGroupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 6
  },
  unifiedGroupBody: {
    paddingLeft: 16,
    paddingBottom: 4
  },
  swipeActions: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0
  },
  swipeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2', // Blå för Ändra
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24
  },
  swipeActionText: { color: '#fff', fontWeight: '700', marginLeft: 8 }
  ,
  swipeAddActions: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  swipeAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#43A047', // Ljusare grön för Lägg till
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 24
  },
  swipeAddText: { color: '#fff', fontWeight: '700', marginLeft: 8 }
  ,
  // Small variants for subgroup swipe actions
  swipeActionBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1976D2',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20
  },
  swipeAddBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#43A047',
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 20
  },
  swipeActionTextSmall: { color: '#fff', fontWeight: '600', marginLeft: 6, fontSize: 13 },
  swipeAddTextSmall: { color: '#fff', fontWeight: '600', marginLeft: 6, fontSize: 13 }
});
