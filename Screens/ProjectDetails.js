import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as FileSystem from 'expo-file-system';
import * as Haptics from 'expo-haptics';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useRef, useState } from 'react';
import {
    Image,
    KeyboardAvoidingView,
    Modal,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { fetchProjectControls } from '../components/fetchProjectControls';

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, backgroundColor: '#fff' },
  subtitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  noControls: { fontSize: 16, fontStyle: 'italic', marginBottom: 12 },
  groupContainer: { marginBottom: 18, backgroundColor: '#f7f7f7', borderRadius: 10, padding: 8 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 4 },
  groupTitle: { fontSize: 16, fontWeight: '700', marginLeft: 8, color: '#263238' },
  groupBadge: { backgroundColor: '#1976D2', borderRadius: 12, paddingHorizontal: 8, marginLeft: 8 },
  groupBadgeText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  controlCard: { backgroundColor: '#fff', borderRadius: 8, padding: 10, marginVertical: 4, borderWidth: 1, borderColor: '#e0e0e0' },
  controlType: { fontSize: 15, color: '#222' },
  form: { backgroundColor: '#fff', borderRadius: 12, padding: 16, margin: 12 },
  selectedType: { fontWeight: '700', fontSize: 16, marginBottom: 8 },
  infoText: { fontSize: 14, color: '#555', marginBottom: 8 },
  linkText: { color: '#1976D2', fontSize: 14, marginBottom: 8 },
  input: { backgroundColor: '#f5f5f5', borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 8, borderWidth: 1, borderColor: '#e0e0e0' },
  saveButton: { backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  saveButtonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  cancelButton: { backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', marginTop: 8 },
  cancelText: { color: '#222', fontWeight: '600', fontSize: 16 },
  undoBar: { backgroundColor: '#fffbe6', borderRadius: 8, padding: 10, margin: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  undoText: { color: '#222', fontSize: 15 },
  undoButtonText: { color: '#1976D2', fontWeight: '700', fontSize: 15 },
  noticeBar: { backgroundColor: '#e3f2fd', borderRadius: 8, padding: 10, margin: 12 },
  noticeText: { color: '#1976D2', fontSize: 15, textAlign: 'center' },
  summaryCard: { backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 },
  modalText: { fontSize: 20, fontWeight: '600', marginBottom: 18, color: '#222', textAlign: 'center', marginTop: 6 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: 8 },
  filterChip: { backgroundColor: '#e0e0e0', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 8, marginBottom: 8 },
  filterChipSelected: { backgroundColor: '#1976D2' },
  filterChipText: { color: '#222', fontSize: 14 },
  filterChipTextSelected: { color: '#fff', fontWeight: '700' },
  centerOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' },
});

export default function ProjectDetails({ route, navigation }) {
              const [showControlTypeModal, setShowControlTypeModal] = useState(false);
            const [showDeleteModal, setShowDeleteModal] = useState(false);
            const [showDeleteWarning, setShowDeleteWarning] = useState(false);
          // Sätt navigationstitel och bild i headern
          React.useEffect(() => {
    navigation.setOptions({
      headerTitle: () => (
        <Image
          source={require('../assets/images/digitalkontroll.lang.transparant.jpg')}
          style={{ width: 150, height: 80, resizeMode: 'contain' }}
        />
      ),
      headerBackTitle: 'Hem',
    });
  }, [navigation]);
    // State för att låsa upp skapad-datum
    const [canEditCreated, setCanEditCreated] = useState(false);
        const handlePreviewPdf = async () => {
          if (!controls || controls.length === 0) return;
          setExportingPdf(true);
          try {
            try { Haptics.selectionAsync(); } catch {}
            // Try to use a local file path for the logo for better reliability
            let logoForPrint = companyLogoUri || null;
            if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
              try {
                const fileName = 'company-logo.preview.png';
                const dest = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
                const dl = await FileSystem.downloadAsync(logoForPrint, dest);
                if (dl?.uri) logoForPrint = dl.uri;
              } catch {}
            }
            await Print.printAsync({ html: buildSummaryHtml(exportFilter, logoForPrint) });
          } catch (e) {
            console.error('[PDF] Preview error:', e);
            setNotice({ visible: true, text: 'Kunde inte förhandsvisa PDF' });
            setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
          } finally {
            setExportingPdf(false);
          }
        };
      const [notice, setNotice] = useState({ visible: false, text: '' });
    const scrollRef = useRef(null);
  // Destructure navigation params
  const { project, companyId, initialCreator, selectedAction } = route.params || {};
  // Defensive check: If project is undefined or null, show fallback UI
  if (!project || typeof project !== 'object' || !project.id) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 }}>
        <Text style={{ fontSize: 18, color: '#D32F2F', textAlign: 'center' }}>
          Kunde inte läsa projektdata.
        </Text>
        <Text style={{ fontSize: 14, color: '#888', marginTop: 8, textAlign: 'center' }}>
          Projektet är inte korrekt laddat eller saknar ID.
        </Text>
        <TouchableOpacity style={{ marginTop: 24, padding: 12, backgroundColor: '#1976D2', borderRadius: 8 }} onPress={() => navigation.goBack()}>
          <Text style={{ color: '#fff', fontWeight: '600' }}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }
    // ...befintlig kod...
    // Visa lista med kontroller under projektinfo
    // Placera där du vill i din layout, t.ex. direkt efter projektinfo:
    // ...befintlig kod...
    // Exempel på integration:
    // <ProjectControlsList projectId={project.id} />
  const controlTypes = [
    'Arbetsberedning',
    'Egenkontroll',
    'Fuktmätning',
    'Mottagningskontroll',
    'Riskbedömning',
    'Skyddsrond'
  ].sort();
  const [controls, setControls] = useState([]);

  // Ladda kontroller för projektet
  const loadControls = useCallback(async () => {
    if (!project?.id) return;
    const arr = await fetchProjectControls(project.id);
    setControls(arr);
  }, [project?.id]);

  // Ladda kontroller när sidan visas (fokus)
  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadControls();
    });
    // Ladda direkt vid mount också
    loadControls();
    return unsubscribe;
  }, [navigation, loadControls]);
  const [editableProject, setEditableProject] = useState(project);
  const [showControlPicker, setShowControlPicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [newControl, setNewControl] = useState({ type: '', date: '', description: '', byggdel: '' });
  const [expandedByType, setExpandedByType] = useState({});
  const [editingInfo, setEditingInfo] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [selectedControls, setSelectedControls] = useState([]);
  const [expandedType, setExpandedType] = useState(null);
  const [undoState, setUndoState] = useState({ visible: false, item: null, index: -1 });
  const [companyLogoUri, setCompanyLogoUri] = useState(null);
  const [exportFilter, setExportFilter] = useState('Alla');
  const [selectedControl, setSelectedControl] = useState(null);
  const [showControlOptions, setShowControlOptions] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const undoTimerRef = useRef(null);
  // ...existing code...

  // Handler for long-press on a control
  const handleControlLongPress = (control) => {
    setSelectedControl(control);
    setShowControlOptions(true);
  };

  // Handler for deleting selected control
  const handleDeleteSelectedControl = async () => {
    if (!selectedControl) return;
    await onDeletePress(selectedControl.id);
    setShowControlOptions(false);
    setSelectedControl(null);
  };

  // Huvud-UI return
  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 240 }}
    >
      {/* Rubrik för projektinfo */}
      <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 18, color: '#333' }}>Projektinformation</Text>
      {/* Projektinfo med logga, status, projektnummer, projektnamn */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 18, padding: 12, backgroundColor: '#f7f7f7', borderRadius: 10 }}>
        {companyLogoUri ? (
          <View style={{ marginRight: 16 }}>
            <Image source={{ uri: companyLogoUri }} style={{ width: 56, height: 56, borderRadius: 8, backgroundColor: '#eee' }} resizeMode="contain" />
          </View>
        ) : null}
        <View style={{ flex: 1, position: 'relative' }}>
          {/* Informationsrader */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <View style={{
              width: 16,
              height: 16,
              borderRadius: 8,
              backgroundColor: editableProject?.status === 'completed' ? '#222' : '#43A047',
              marginRight: 8,
              borderWidth: 2,
              borderColor: '#bbb',
            }} />
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', marginRight: 8 }}>{editableProject?.id}</Text>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#222' }}>{editableProject?.name}</Text>
            <TouchableOpacity
              style={{ position: 'absolute', top: -8, right: -8, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.01)' }}
              onPress={() => setEditingInfo(true)}
              accessibilityLabel="Ändra projektinfo"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="create-outline" size={24} color="#888" />
            </TouchableOpacity>
          </View>
          <View style={{ marginBottom: 2 }}>
            <View style={{ marginBottom: 2 }}>
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Skapad:</Text> {editableProject?.createdAt
                  ? <Text>{new Date(editableProject.createdAt).toLocaleDateString()}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Ansvarig:</Text> {editableProject?.ansvarig
                  ? <Text>{editableProject.ansvarig}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Status:</Text> {editableProject?.status === 'completed'
                  ? <Text>Avslutat</Text>
                  : editableProject?.status === 'ongoing'
                    ? <Text>Pågående</Text>
                    : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Kund:</Text> {editableProject?.client
                  ? <Text>{editableProject.client}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Adress:</Text> {editableProject?.adress
                  ? <Text>{editableProject.adress}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
              </Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
              <Text style={{ fontSize: 15, color: '#555' }}>
                <Text style={{ fontWeight: '700' }}>Fastighetsbeteckning:</Text> {editableProject?.fastighetsbeteckning
                  ? <Text>{editableProject.fastighetsbeteckning}</Text>
                  : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Valfritt</Text>}
              </Text>
            </View>
          </View>
        </View>
      </View>

      {/* Modal för ändra projektinfo */}
      <Modal visible={editingInfo} transparent animationType="fade" onRequestClose={() => setEditingInfo(false)}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
          <View style={{ backgroundColor: '#f7f7fa', borderRadius: 20, padding: 28, minWidth: 300, maxWidth: 380, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12, position: 'relative', borderWidth: 1, borderColor: '#e0e0e0' }}>
            {/* Kryss för stängning uppe till höger */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
              onPress={() => setEditingInfo(false)}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#222" />
            </TouchableOpacity>
            <Text style={{ fontSize: 22, fontWeight: '700', marginBottom: 18, color: '#222', textAlign: 'center', letterSpacing: 0.5 }}>Ändra projektinfo</Text>
            <ScrollView style={{ maxHeight: 340, paddingHorizontal: 2 }} showsVerticalScrollIndicator={false}>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Skapad</Text>
                <TouchableOpacity
                  activeOpacity={1}
                  onLongPress={() => setCanEditCreated(true)}
                  delayLongPress={2000}
                >
                  <TextInput
                    style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: canEditCreated ? '#fff' : '#eee', color: canEditCreated ? '#222' : '#888' }}
                    value={editableProject?.createdAt ? new Date(editableProject.createdAt).toLocaleDateString() : ''}
                    editable={false}
                    pointerEvents="none"
                  />
                  {!canEditCreated && (
                    <Text style={{ fontSize: 13, color: '#888', marginTop: 4, textAlign: 'center' }}>
                      Håll in 2 sekunder för att ändra datum
                    </Text>
                  )}
                </TouchableOpacity>
                {canEditCreated && (
                  <Modal visible={canEditCreated} transparent animationType="fade" onRequestClose={() => setCanEditCreated(false)}>
                    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.30)' }}>
                      <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, minWidth: 260, maxWidth: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                        <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Välj nytt skapad-datum</Text>
                        <TextInput
                          style={{ borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, padding: 10, fontSize: 16, backgroundColor: '#fafafa', color: '#222', marginBottom: 12 }}
                          value={editableProject?.createdAt ? new Date(editableProject.createdAt).toISOString().slice(0, 10) : ''}
                          onChangeText={v => {
                            // Validera att datumet inte är i framtiden
                            const today = new Date();
                            const inputDate = new Date(v);
                            if (inputDate > today) return;
                            setEditableProject(p => ({ ...p, createdAt: v }));
                          }}
                          placeholder="YYYY-MM-DD"
                          placeholderTextColor="#bbb"
                          keyboardType="numeric"
                        />
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                          <TouchableOpacity
                            style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginRight: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Spara</Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, alignItems: 'center', flex: 1, marginLeft: 8 }}
                            onPress={() => setCanEditCreated(false)}
                          >
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </Modal>
                )}
              </View>
                // State för att låsa upp skapad-datum
                const [canEditCreated, setCanEditCreated] = useState(false);
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Ansvarig</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.ansvarig || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, ansvarig: v }))}
                  placeholder="Ange ansvarig"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Status</Text>
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: editableProject?.status !== 'completed' ? '#e8f5e9' : '#fff', borderWidth: editableProject?.status !== 'completed' ? 2 : 1, borderColor: editableProject?.status !== 'completed' ? '#43A047' : '#e0e0e0', marginRight: 8 }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'ongoing' }))}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#43A047', marginRight: 8, borderWidth: 2, borderColor: '#bbb' }} />
                    <Text style={{ fontSize: 15, color: '#222' }}>Pågående</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, backgroundColor: editableProject?.status === 'completed' ? '#f5f5f5' : '#fff', borderWidth: editableProject?.status === 'completed' ? 2 : 1, borderColor: editableProject?.status === 'completed' ? '#222' : '#e0e0e0' }}
                    onPress={() => setEditableProject(p => ({ ...p, status: 'completed' }))}
                  >
                    <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: '#222', marginRight: 8, borderWidth: 2, borderColor: '#bbb' }} />
                    <Text style={{ fontSize: 15, color: '#222' }}>Avslutat</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Kund</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.client || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, client: v }))}
                  placeholder="Ange kund"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Adress</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.adress || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, adress: v }))}
                  placeholder="Ange adress"
                  placeholderTextColor="#bbb"
                />
              </View>
              <View style={{ marginBottom: 14 }}>
                <Text style={{ fontSize: 15, color: '#888', marginBottom: 4 }}>Fastighetsbeteckning</Text>
                <TextInput
                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
                  value={editableProject?.fastighetsbeteckning || ''}
                  onChangeText={v => setEditableProject(p => ({ ...p, fastighetsbeteckning: v }))}
                  placeholder="Ange fastighetsbeteckning"
                  placeholderTextColor="#bbb"
                />
              </View>
            </ScrollView>
            <TouchableOpacity
              style={{
                backgroundColor: '#f5f5f5',
                borderRadius: 10,
                borderWidth: 2,
                borderColor: '#222',
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 10,
                paddingHorizontal: 18,
                shadowColor: '#222',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.08,
                shadowRadius: 4,
                elevation: 1,
                minHeight: 36,
                marginTop: 8,
                marginBottom: 2,
                overflow: 'hidden',
              }}
              activeOpacity={0.85}
              onPress={() => {
                if (typeof navigation?.setParams === 'function') {
                  navigation.setParams({ project: editableProject });
                }
                if (typeof route?.params?.updateProject === 'function') {
                  route.params.updateProject(editableProject);
                }
                setEditingInfo(false);
              }}
            >
              <Ionicons name="checkmark-circle-outline" size={20} color="#222" style={{ marginRight: 10 }} />
              <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5 }}>Spara</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      {/* Knapprad med horisontella linjer */}
      <View style={{ marginBottom: 12 }}>
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginBottom: 10, marginTop: 8, width: '110%', marginLeft: '-5%' }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', width: '100%' }}>
          <TouchableOpacity
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 18,
              shadowColor: '#222',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 1,
              minHeight: 36,
              maxWidth: 180,
              width: 'auto',
              marginBottom: 8,
              marginRight: 40,
              overflow: 'hidden',
            }}
            activeOpacity={0.85}
            onPress={() => setShowControlTypeModal(true)}
          >
            <Ionicons name="add-circle-outline" size={20} color="#222" style={{ marginRight: 10 }} />
            <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5, zIndex: 1 }}>Ny kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 12,
              shadowColor: '#222',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 1,
              minHeight: 36,
              maxWidth: 50,
              marginRight: 10,
              marginBottom: 8,
              overflow: 'hidden',
            }}
            activeOpacity={0.85}
            onPress={() => setShowSummary(true)}
            accessibilityLabel="Skriv ut"
          >
            <Ionicons name="print-outline" size={20} color="#222" />
          </TouchableOpacity>
          <TouchableOpacity
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 6,
              paddingHorizontal: 12,
              shadowColor: '#D32F2F',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.08,
              shadowRadius: 4,
              elevation: 1,
              minHeight: 36,
              maxWidth: 50,
              marginRight: 0,
              marginBottom: 8,
              overflow: 'hidden',
            }}
            activeOpacity={0.85}
            onPress={() => {
              if (controls.length === 0) {
                setShowDeleteModal(true);
              } else {
                setShowDeleteWarning(true);
              }
            }}
            accessibilityLabel="Radera projekt"
          >
            <Ionicons name="trash-outline" size={20} color="#D32F2F" />
          </TouchableOpacity>
        </View>
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginTop: 10, width: '110%', marginLeft: '-5%' }} />
      </View>

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, minHeight: 32 }}>

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
                style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                onPress={() => {
                  setShowControlTypeModal(false);
                  // Route each control type to its dedicated screen
                  switch (type) {
                    case 'Arbetsberedning':
                      navigation.navigate('ArbetsberedningScreen', { project });
                      break;
                    case 'Riskbedömning':
                      navigation.navigate('RiskbedömningScreen', { project });
                      break;
                    case 'Fuktmätning':
                      navigation.navigate('FuktmätningScreen', { project });
                      break;
                    case 'Egenkontroll':
                      navigation.navigate('EgenkontrollScreen', { project });
                      break;
                    case 'Mottagningskontroll':
                      navigation.navigate('MottagningskontrollScreen', { project });
                      break;
                    case 'Skyddsrond':
                      navigation.navigate('SkyddsrondScreen', { project });
                      break;
                    default:
                      navigation.navigate('ControlForm', {
                        project,
                        controlType: type
                      });
                  }
                }}
              >
                <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
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

              {/* Modal: Bekräfta radering om inga kontroller */}
              <Modal visible={showDeleteModal} transparent animationType="fade" onRequestClose={() => setShowDeleteModal(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#222', textAlign: 'center' }}>Vill du ta bort projektet?</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                      <TouchableOpacity style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }} onPress={() => {/* TODO: Lägg till raderingslogik här */ setShowDeleteModal(false); }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Ta bort</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteModal(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
              {/* Modal: Extra varning om kontroller finns */}
              <Modal visible={showDeleteWarning} transparent animationType="fade" onRequestClose={() => setShowDeleteWarning(false)}>
                <View style={styles.centerOverlay}>
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, minWidth: 260, maxWidth: 340, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 16, elevation: 12 }}>
                    <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 18, color: '#D32F2F', textAlign: 'center' }}>Projektet har kontroller kopplade.\nÄr du säker på att du vill ta bort projektet? Allt kommer att förloras.</Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                      <TouchableOpacity style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 12, flex: 1, marginRight: 8, alignItems: 'center' }} onPress={() => {/* TODO: Lägg till raderingslogik här */ setShowDeleteWarning(false); }}>
                        <Text style={{ color: '#fff', fontWeight: '700', fontSize: 16 }}>Ta bort</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={{ backgroundColor: '#e0e0e0', borderRadius: 8, padding: 12, flex: 1, marginLeft: 8, alignItems: 'center' }} onPress={() => setShowDeleteWarning(false)}>
                        <Text style={{ color: '#222', fontWeight: '600', fontSize: 16 }}>Avbryt</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </Modal>
        <Text style={[styles.subtitle, { lineHeight: 32 }]}>Utförda kontroller:</Text>
      </View>

      {controls.length === 0 ? (
        <Text style={[styles.noControls, { color: '#D32F2F' }]}>Inga kontroller utförda än</Text>
      ) : (
        <View>
          {(() => {
            const grouped = controlTypes
              .map((t) => ({ type: t, items: controls.filter(c => (c.type || '') === t) }))
              .filter(g => g.items.length > 0);

            const toggleType = (t) => {
              try { Haptics.selectionAsync(); } catch {}
              setExpandedByType((prev) => ({ ...prev, [t]: !(prev[t] ?? false) }));
            };

            const pluralLabels = {
              Arbetsberedning: 'Arbetsberedningar',
              Egenkontroll: 'Egenkontroller',
              Fuktmätning: 'Fuktmätningar',
              Skyddsrond: 'Skyddsronder',
              Riskbedömning: 'Riskbedömningar',
            };

            return grouped.map(({ type: t, items }) => {
              const expanded = expandedByType[t] ?? false;
              return (
                <View key={t} style={styles.groupContainer}>
                  <TouchableOpacity style={styles.groupHeader} onPress={() => toggleType(t)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                      <Text style={styles.groupTitle}>{pluralLabels[t] || t}</Text>
                    </View>
                    <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{items.length}</Text></View>
                  </TouchableOpacity>
                  {expanded ? (
                    items
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((item) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity
                            style={[styles.controlCard, { flex: 1 }]}
                            onPress={() => navigation.navigate('ControlDetails', { control: item, project })}
                            onLongPress={() => handleControlLongPress(item)}
                            delayLongPress={600}
                          >
                            <Text style={styles.controlType}>
                              {item.type === 'Skyddsrond'
                                ? `${item.description ? item.description + ' ' : ''}${item.date}`
                                : `${item.byggdel ? item.byggdel + ' ' : ''}${item.description} ${item.date}`}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      ))
                  ) : null}
                </View>
              );
            });
          })()}
        </View>
      )}

      {/* Formulär */}
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={styles.form}
        >
          <Text style={styles.selectedType}>Vald kontroll: {newControl.type}</Text>

          {/* Visa dagens datum och möjlighet att välja eget */}
          <Text style={styles.infoText}>Dagens datum: {newControl.date}</Text>
          <TouchableOpacity onPress={() => setNewControl({ ...newControl, date: '' })}>
            <Text style={styles.linkText}>Välj eget datum</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Datum (ÅÅÅÅ-MM-DD)"
            placeholderTextColor="#888"
            value={newControl.date}
            onChangeText={(text) => setNewControl({ ...newControl, date: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TextInput
            style={styles.input}
            placeholder={newControl.type === 'Skyddsrond' ? 'Skyddsrond omfattar' : 'Beskrivning'}
            placeholderTextColor="#888"
            value={newControl.description}
            onChangeText={(text) => setNewControl({ ...newControl, description: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAddControl}>
            <Text style={styles.saveButtonText}>Skapa kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowForm(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {undoState.visible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Kontroll borttagen</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Ångra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {notice.visible ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => setShowSummary(false)}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowSummary(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.summaryCard}>
              {/* Stäng (X) knapp uppe till höger */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={styles.modalText}>Skriv ut</Text>
              {/* Export filter selector */}
              {(() => {
                const byType = controls.reduce((acc, c) => {
                  const t = c.type || 'Okänd';
                  (acc[t] = acc[t] || []).push(c);
                  return acc;
                }, {});
                const types = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                if (types.length === 0) return null;
                const labels = {
                  Arbetsberedning: 'Arbetsberedningar',
                  Egenkontroll: 'Egenkontroller',
                  Fuktmätning: 'Fuktmätningar',
                  Skyddsrond: 'Skyddsronder',
                  Riskbedömning: 'Riskbedömningar',
                };
                return (
                  <View style={styles.filterRow}>
                    {['Alla', ...types].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {}; setExportFilter(t); }}
                        style={[styles.filterChip, exportFilter === t && styles.filterChipSelected]}
                      >
                        <Text style={[styles.filterChipText, exportFilter === t && styles.filterChipTextSelected]}>
                          {t === 'Alla' ? 'Alla' : (labels[t] || t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}

              <ScrollView style={{ maxHeight: 380 }}>
                {/* Här kan du lägga till en preview av PDF-innehållet om du vill */}
              </ScrollView>
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handlePreviewPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Förhandsvisa PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleExportPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>{exportingPdf ? 'Genererar…' : 'Exportera PDF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    </ScrollView>
  );
  };

  const handleExportPdf = async () => {
    if (!controls || controls.length === 0) return;
    setExportingPdf(true);
    try {
      try { Haptics.selectionAsync(); } catch {}
      // On web: open the browser print dialog instead of generating a file
      if (Platform.OS === 'web') {
        await Print.printAsync({ html: buildSummaryHtml(exportFilter, companyLogoUri) });
        setNotice({ visible: true, text: 'Öppnade utskriftsdialog i webbläsaren' });
        setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
        return;
      }

      // Native: try to use a local file for remote logos to avoid HTML image issues
      let logoForPrint = companyLogoUri || null;
      if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
        try {
          const fileName = 'company-logo.pdfheader.png';
          const dest = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
          const dl = await FileSystem.downloadAsync(logoForPrint, dest);
          if (dl?.uri) logoForPrint = dl.uri;
        } catch {}
      }

      const html = buildSummaryHtml(exportFilter, logoForPrint);
      const { uri } = await Print.printToFileAsync({ html });
      // Prepare pretty destination path
      const datePart = new Date().toISOString().replace(/[:T]/g, '-').slice(0,19);
      const fileName = `utforda-kontroller-${(project.id || '').toString().replace(/[^a-z0-9-_]/gi,'_')}-${datePart}.pdf`;
      const destUri = (FileSystem.documentDirectory || FileSystem.cacheDirectory) + fileName;
      let finalUri = uri;
      try {
        await FileSystem.copyAsync({ from: uri, to: destUri });
        finalUri = destUri;
      } catch (copyErr) {
        console.warn('[PDF] Copy failed, will try sharing tmp uri:', copyErr?.message);
      }

      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        try {
          await Sharing.shareAsync(finalUri, { UTI: 'com.adobe.pdf', mimeType: 'application/pdf', dialogTitle: 'Dela PDF' });
        } catch (shareErr) {
          console.warn('[PDF] shareAsync failed on file://, trying content:// if Android');
          if (Platform.OS === 'android') {
            try {
              const contentUri = await FileSystem.getContentUriAsync(finalUri);
              await Sharing.shareAsync(contentUri, { UTI: 'application/pdf', mimeType: 'application/pdf', dialogTitle: 'Dela PDF' });
            } catch (contentErr) {
              console.error('[PDF] shareAsync content:// failed:', contentErr);
              // As a last resort, just show where the file is saved
              setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
              setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
              return;
            }
          } else {
            // iOS: show saved path if share fails
            setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
            setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
            return;
          }
        }
      } else {
        // Sharing not available – tell the user where it was saved
        setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
        setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
        return;
      }
      // If sharing succeeded, optionally also inform about the saved copy
      setNotice({ visible: true, text: `PDF sparad: ${finalUri}` });
      setTimeout(() => setNotice({ visible: false, text: '' }), 6000);
    } catch (e) {
      console.error('[PDF] Export error:', e);
      setNotice({ visible: true, text: 'Kunde inte skapa PDF' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
    } finally {
      setExportingPdf(false);
  };

  const handlePreviewPdf = async () => {
    if (!controls || controls.length === 0) return;
    setExportingPdf(true);
    try {
      try { Haptics.selectionAsync(); } catch {}
      // Try to use a local file path for the logo for better reliability
      let logoForPrint = companyLogoUri || null;
      if (logoForPrint && /^https?:\/\//i.test(logoForPrint)) {
        try {
          const fileName = 'company-logo.preview.png';
          const dest = (FileSystem.cacheDirectory || FileSystem.documentDirectory) + fileName;
          const dl = await FileSystem.downloadAsync(logoForPrint, dest);
          if (dl?.uri) logoForPrint = dl.uri;
        } catch {}
      }
      await Print.printAsync({ html: buildSummaryHtml(exportFilter, logoForPrint) });
    } catch (e) {
      console.error('[PDF] Preview error:', e);
      setNotice({ visible: true, text: 'Kunde inte förhandsvisa PDF' });
      setTimeout(() => setNotice({ visible: false, text: '' }), 4000);
    } finally {
      setExportingPdf(false);
    }
  };

  const scrollRef = useRef(null);

  return (
    <ScrollView
      ref={scrollRef}
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      contentContainerStyle={{ paddingBottom: 240 }}
    >
      {/* Titel, info, redigera projektinfo, kontroller, modals, formulär, etc. */}
      {/* ...existing code... */}
    </ScrollView>
  );


      {/* Kontroller */}
      {/* Knappar för skapa kontroll och PDF, med popup för kontrolltyp */}
      {}

      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 16, marginBottom: 8, minHeight: 32 }}>
        <Text style={[styles.subtitle, { lineHeight: 32 }]}>Utförda kontroller:</Text>
      </View>

      {controls.length === 0 ? (
        <Text style={[styles.noControls, { color: '#D32F2F' }]}>Inga kontroller utförda än</Text>
      ) : (
        <View>
          {(() => {
            const grouped = controlTypes
              .map((t) => ({ type: t, items: controls.filter(c => (c.type || '') === t) }))
              .filter(g => g.items.length > 0);

            const toggleType = (t) => {
              try { Haptics.selectionAsync(); } catch {}
              setExpandedByType((prev) => ({ ...prev, [t]: !(prev[t] ?? false) }));
            };

            const pluralLabels = {
              Arbetsberedning: 'Arbetsberedningar',
              Egenkontroll: 'Egenkontroller',
              Fuktmätning: 'Fuktmätningar',
              Skyddsrond: 'Skyddsronder',
              Riskbedömning: 'Riskbedömningar',
            };

            return grouped.map(({ type: t, items }) => {
              const expanded = expandedByType[t] ?? false;
              return (
                <View key={t} style={styles.groupContainer}>
                  <TouchableOpacity style={styles.groupHeader} onPress={() => toggleType(t)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <MaterialIcons name={expanded ? 'expand-less' : 'expand-more'} size={22} color="#263238" />
                      <Text style={styles.groupTitle}>{pluralLabels[t] || t}</Text>
                    </View>
                    <View style={styles.groupBadge}><Text style={styles.groupBadgeText}>{items.length}</Text></View>
                  </TouchableOpacity>
                  {expanded ? (
                    items
                      .slice()
                      .sort((a, b) => (b.date || '').localeCompare(a.date || ''))
                      .map((item) => (
                        <View key={item.id} style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <TouchableOpacity
                            style={[styles.controlCard, { flex: 1 }]}
                            onPress={() => navigation.navigate('ControlDetails', { control: item, project })}
                            onLongPress={() => handleControlLongPress(item)}
                            delayLongPress={600}
                          >
                            <Text style={styles.controlType}>
                              {item.type === 'Skyddsrond'
                                ? `${item.description ? item.description + ' ' : ''}${item.date}`
                                : `${item.byggdel ? item.byggdel + ' ' : ''}${item.description} ${item.date}`}
                            </Text>
                          </TouchableOpacity>
                          {/* Ta bort-knapp borttagen, endast long-press popup gäller */}
                        </View>
                      ))
                  ) : null}
                </View>
              );
            });
                {/* Modal for edit/delete control (long-press) */}
          })()}
        </View>
      )}


      {/* Välj kontrolltyp */}
      {}

      {/* Formulär */}
      {showForm && (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 0}
          style={styles.form}
        >
          <Text style={styles.selectedType}>Vald kontroll: {newControl.type}</Text>

          {/* Visa dagens datum och möjlighet att välja eget */}
          <Text style={styles.infoText}>Dagens datum: {newControl.date}</Text>
          <TouchableOpacity onPress={() => setNewControl({ ...newControl, date: '' })}>
            <Text style={styles.linkText}>Välj eget datum</Text>
          </TouchableOpacity>

          <TextInput
            style={styles.input}
            placeholder="Datum (ÅÅÅÅ-MM-DD)"
            placeholderTextColor="#888"
            value={newControl.date}
            onChangeText={(text) => setNewControl({ ...newControl, date: text })}
            onFocus={() => {
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
            />
          <TextInput
            style={styles.input}
            placeholder={newControl.type === 'Skyddsrond' ? 'Skyddsrond omfattar' : 'Beskrivning'}
            placeholderTextColor="#888"
            value={newControl.description}
            onChangeText={(text) => setNewControl({ ...newControl, description: text })}
            onFocus={() => {
              // Scroll to bottom to reveal the input above the keyboard
              setTimeout(() => {
                if (scrollRef.current && typeof scrollRef.current.scrollToEnd === 'function') {
                  try { scrollRef.current.scrollToEnd({ animated: true }); } catch {}
                }
              }, 50);
            }}
          />
          <TouchableOpacity style={styles.saveButton} onPress={handleAddControl}>
            <Text style={styles.saveButtonText}>Skapa kontroll</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelButton} onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowForm(false); }}>
            <Text style={styles.cancelText}>Avbryt</Text>
          </TouchableOpacity>
        </KeyboardAvoidingView>
      )}

      {undoState.visible ? (
        <View style={styles.undoBar}>
          <Text style={styles.undoText}>Kontroll borttagen</Text>
          <TouchableOpacity onPress={handleUndo}>
            <Text style={styles.undoButtonText}>Ångra</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {notice.visible ? (
        <View style={styles.noticeBar}>
          <Text style={styles.noticeText}>{notice.text}</Text>
        </View>
      ) : null}

      <Modal visible={showSummary} transparent animationType="fade" onRequestClose={() => setShowSummary(false)}>
        <TouchableOpacity style={styles.centerOverlay} activeOpacity={1} onPress={() => setShowSummary(false)}>
          <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
            <View style={styles.summaryCard}>
              {/* Stäng (X) knapp uppe till höger */}
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={() => { try { Haptics.selectionAsync(); } catch {}; setShowSummary(false); }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={styles.modalText}>Skriv ut</Text>
              {/* Export filter selector */}
              {(() => {
                const byType = controls.reduce((acc, c) => {
                  const t = c.type || 'Okänd';
                  (acc[t] = acc[t] || []).push(c);
                  return acc;
                }, {});
                const types = Object.keys(byType).sort((a, b) => a.localeCompare(b));
                if (types.length === 0) return null;
                const labels = {
                  Arbetsberedning: 'Arbetsberedningar',
                  Egenkontroll: 'Egenkontroller',
                  Fuktmätning: 'Fuktmätningar',
                  Skyddsrond: 'Skyddsronder',
                  Riskbedömning: 'Riskbedömningar',
                };
                return (
                  <View style={styles.filterRow}>
                    {['Alla', ...types].map((t) => (
                      <TouchableOpacity
                        key={t}
                        onPress={() => { try { Haptics.selectionAsync(); } catch {}; setExportFilter(t); }}
                        style={[styles.filterChip, exportFilter === t && styles.filterChipSelected]}
                      >
                        <Text style={[styles.filterChipText, exportFilter === t && styles.filterChipTextSelected]}>
                          {t === 'Alla' ? 'Alla' : (labels[t] || t)}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}

              <ScrollView style={{ maxHeight: 380 }}>
                {(() => {
                })()}
              </ScrollView>
              <View style={{ marginTop: 10 }}>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handlePreviewPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>Förhandsvisa PDF</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 2,
                      borderColor: '#222',
                      alignItems: 'center',
                      justifyContent: 'center',
                      height: 44,
                      marginBottom: 8,
                      opacity: exportingPdf || controls.length === 0 ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleExportPdf}
                  disabled={exportingPdf || controls.length === 0}
                >
                  <Text style={{ color: '#222', fontWeight: '600', fontSize: 14, letterSpacing: 0.2 }}>{exportingPdf ? 'Genererar…' : 'Exportera PDF'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </KeyboardAvoidingView>
        </TouchableOpacity>
      </Modal>
    }


