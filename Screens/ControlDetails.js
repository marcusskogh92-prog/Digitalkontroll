import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { CommonActions, useNavigation } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { Collapsible } from '../components/ui/collapsible';
const normalizeUri = (uri) => {
  if (!uri) return null;
  // Some pickers return URIs without scheme; ensure proper prefix for local files
  // Allow common schemes: http(s), file, content (Android), asset
  if (!/^https?:\/\//.test(uri) && !/^file:\/\//.test(uri) && !/^content:\/\//.test(uri) && !/^asset:\/\//.test(uri) && !/^data:image\//.test(uri)) {
    return `file://${uri}`;
  }
  return uri;
};

const PREVIEW_HEIGHT = 360;
let CARD_MAX_HEIGHT = 600;
let CARD_PAGE_WIDTH = 300;
try {
  const win = Dimensions.get('window');
  if (win && win.height) {
    CARD_MAX_HEIGHT = Math.floor(win.height * 0.85);
  }
  if (win && win.width) {
    CARD_PAGE_WIDTH = Math.floor(win.width * 0.85);
  }
} catch {}

const PRIMARY = '#263238';

export default function ControlDetails({ route }) {
  const navigation = useNavigation();
  const { control, project } = route.params || {};
  if (!control) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#555' }}>Kunde inte hitta kontrollen.</Text>
      </View>
    );
  }

  const { type, date, byggdel, description, participants = [], checklist = [] } = control;

  // Fuktmätning lokalt formulärstate
  const [device, setDevice] = useState('');
  const [serial, setSerial] = useState('');
  const [calibrationDate, setCalibrationDate] = useState('');
  const [showDatePickerModal, setShowDatePickerModal] = useState(false);
  // Gränsvärde picker state
  const [showReferencePickerModal, setShowReferencePickerModal] = useState(false);
  const [tempReference, setTempReference] = useState(85);
  const referenceScrollRef = useRef(null);
  useEffect(() => {
    try {
      if (showReferencePickerModal && referenceScrollRef.current) {
        const idx = Math.max(0, Math.min(Math.round(tempReference || 85), 100));
        referenceScrollRef.current.scrollTo({ y: idx * ITEM_HEIGHT, animated: false });
      }
    } catch {}
  }, [showReferencePickerModal]);
  const [tempYear, setTempYear] = useState(null);
  const [tempMonth, setTempMonth] = useState(null);
  const [tempDay, setTempDay] = useState(null);
  const isValidCalibration = (() => {
    if (calibrationDate === 'Okänt') return true;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(calibrationDate)) return false;
    const [y, m, d] = calibrationDate.split('-').map(Number);
    if (m < 1 || m > 12) return false;
    if (d < 1 || d > 31) return false;
    // Ensure day does not exceed actual days in month
    try {
      const max = daysInMonth(y, m);
      if (d > max) return false;
      // Reject dates in the future
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const selected = new Date(y, (m || 1) - 1, d || 1);
      selected.setHours(0, 0, 0, 0);
      if (selected.getTime() > today.getTime()) return false;
    } catch {}
    return true;
  })();
  // Approval flags are computed after state declarations below

  const openDatePicker = () => {
    try {
      if (/^\d{4}-\d{2}-\d{2}$/.test(calibrationDate)) {
        const [y, m, d] = calibrationDate.split('-').map(Number);
        setTempYear(y);
        setTempMonth(m);
        setTempDay(d);
      } else {
        const now = new Date();
        setTempYear(now.getFullYear());
        setTempMonth(now.getMonth() + 1);
        setTempDay(now.getDate());
      }
    } catch {
      const now = new Date();
      setTempYear(now.getFullYear());
      setTempMonth(now.getMonth() + 1);
      setTempDay(now.getDate());
    }
    setShowDatePickerModal(true);
  };

  const pad2 = (n) => String(n).padStart(2, '0');
  const daysInMonth = (y, m) => new Date(y, m, 0).getDate();
  const YEAR_SPAN = 50;
  const YEAR_OFFSET = 25;
  const ITEM_HEIGHT = 44;
  const VIEWPORT_HEIGHT = 240;
  const SPACER = VIEWPORT_HEIGHT / 2 - ITEM_HEIGHT / 2;
  const [location, setLocation] = useState('');
  const [material, setMaterial] = useState('');
  const [method, setMethod] = useState('RF'); // RF eller CM
  const [reference, setReference] = useState(''); // t.ex. 75 (RF%)
  const [measurements, setMeasurements] = useState([
    { id: '1', position: '', depth: '', temp: '', value: '', unit: 'RF', note: '', photos: [], attachments: [] }
  ]);
  // RF värdepicker
  const [showMeasurementPickerModal, setShowMeasurementPickerModal] = useState(false);
  const [tempMeasurementValue, setTempMeasurementValue] = useState(100);
  const [measurementPickerIndex, setMeasurementPickerIndex] = useState(null);
  // Val av mätkategori för fuktmätning
  const [measureCategory, setMeasureCategory] = useState('');
  const [measureCategorySource, setMeasureCategorySource] = useState(null); // 'material' | 'concrete' | 'screed' | 'manual'
  const [showMeasureTypeModal, setShowMeasureTypeModal] = useState(false);
  const [measureGroupsExpanded, setMeasureGroupsExpanded] = useState({
    material: false,
    concrete: false,
    screed: false
  });
  const toggleMeasureGroup = (key) => {
    setMeasureGroupsExpanded(prev => ({ ...prev, [key]: !prev[key] }));
  };
  const [manualMaterial, setManualMaterial] = useState('');
  const [manualConcrete, setManualConcrete] = useState('');
  const [manualScreed, setManualScreed] = useState('');
  const [showManualMaterial, setShowManualMaterial] = useState(false);
  const [showManualConcrete, setShowManualConcrete] = useState(false);
  const [showManualScreed, setShowManualScreed] = useState(false);
  const [manualGeneral, setManualGeneral] = useState('');
  const [showManualGeneral, setShowManualGeneral] = useState(false);
  const [multiSelectMode, setMultiSelectMode] = useState(false);
  const [tempMultiSelections, setTempMultiSelections] = useState([]);
  const [selectedMultiItems, setSelectedMultiItems] = useState([]);
  const [materialOpen, setMaterialOpen] = useState(false);
  const [instrumentOpen, setInstrumentOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  // Popup-kategori för "Vad ska du mäta?"
  const [measurePopupCategory, setMeasurePopupCategory] = useState(null); // 'material' | 'concrete' | 'screed'
  const [showEditSelectedModal, setShowEditSelectedModal] = useState(false);
  const [removeSelections, setRemoveSelections] = useState([]);
  // Generella bifogade filer (ritningar, foton på ritning etc.)
  const [attachments, setAttachments] = useState([]); // [{uri, type}]
  // Fallback kamera-overlay med expo-camera
  const [showCameraOverlay, setShowCameraOverlay] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraRef, setCameraRef] = useState(null);
  const [cameraTargetIndex, setCameraTargetIndex] = useState(null);
  // Flagga för att skilja avbryt från normal back
  const [isCancelling, setIsCancelling] = useState(false);
  // Förhandsvisning
  const [previewItem, setPreviewItem] = useState(null); // { uri, type, title }
  const [previewItems, setPreviewItems] = useState([]); // array of {uri,type,title, source:'measurement'|'global', mIndex?:number, kind?:'photo'|'attachment'}
  // Compute approval flags based on current state
  // Reference must be a number between 0 and 100 (inclusive)
  const isValidReference = (() => {
    const t = (reference || '').trim();
    if (!t) return false;
    // Allow integers or decimals; reject non-numeric
    const n = Number(t.replace(',', '.'));
    if (!isFinite(n)) return false;
    return n >= 0 && n <= 100;
  })();
  const isInstrumentApproved = !!(device?.trim() && serial?.trim() && isValidCalibration);
  const isMaterialApproved = !!(measureCategory?.trim());
  const isPlaceApproved = !!(location?.trim() && isValidReference);
  const isMeasurementsApproved = Array.isArray(measurements) && measurements.length > 0 && measurements.every(m => {
    const hasPosition = !!m?.position?.trim();
    const valStr = (m?.value ?? '').trim();
    if (m?.unit === 'RF') {
      const num = Number(valStr);
      return hasPosition && !!valStr && isFinite(num) && num > 0;
    }
    // CM: only require non-empty value
    return hasPosition && !!valStr;
  });
  // Auto-close instrument section when approved
  useEffect(() => {
    if (isInstrumentApproved && instrumentOpen) {
      setInstrumentOpen(false);
    }
  }, [isInstrumentApproved]);
  // Auto-close place section when approved
  useEffect(() => {
    if (isPlaceApproved && placeOpen) {
      setPlaceOpen(false);
    }
  }, [isPlaceApproved]);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewPageWidth, setPreviewPageWidth] = useState(CARD_PAGE_WIDTH);
  const [previewError, setPreviewError] = useState(null);
  const [previewAspect, setPreviewAspect] = useState(null); // width/height
  const openPreview = (item, items = []) => {
    try {
      const normalized = normalizeUri(item?.uri);
      console.log('OpenPreview original URI:', item?.uri, 'normalized:', normalized, 'type:', item?.type);
      if (normalized) {
        Image.getSize(normalized,
          (w, h) => {
            if (w && h) setPreviewAspect(w / h);
          },
          (err) => {
            console.warn('getSize failed', err);
            setPreviewAspect(null);
          }
        );
      }
    } catch {}
    setPreviewError(null);
    setPreviewItems(items && items.length ? items : [item]);
    setPreviewIndex(0);
    setPreviewItem(item);
  };
  const closePreview = () => setPreviewItem(null);
  const copyPreviewUri = async () => {
    try {
      const uri = previewItem?.uri ? normalizeUri(previewItem.uri) : '';
      if (uri) {
        await Clipboard.setStringAsync(uri);
        Alert.alert('Kopierat', 'URI har kopierats till urklipp.');
      }
    } catch {}
  };

  const addRow = () => {
    const nextId = String(measurements.length + 1);
    setMeasurements([...measurements, { id: nextId, position: '', depth: '', temp: '', value: '', unit: method === 'CM' ? 'CM' : 'RF', note: '', photos: [], attachments: [] }]);
  };
  const isMeasurementEmpty = (m) => {
    // Ignorera 'unit' (har default RF/CM) vid tomhetskontroll
    const noText = !m.position && !m.depth && !m.temp && !m.value && !m.note;
    const noMedia = (!Array.isArray(m.photos) || m.photos.length === 0) && (!Array.isArray(m.attachments) || m.attachments.length === 0);
    return noText && noMedia;
  };
  const removeRow = (index) => {
    const next = measurements.slice();
    next.splice(index, 1);
    setMeasurements(next);
  };
  const removeRowWithConfirm = (index) => {
    const m = measurements[index];
    if (isMeasurementEmpty(m)) {
      removeRow(index);
      return;
    }
    Alert.alert(
      'Radera mätpunkt?',
      `Mätpunkt #${m.id} innehåller data. Vill du verkligen radera den?`,
      [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Radera', style: 'destructive', onPress: () => removeRow(index) }
      ]
    );
  };
  const updateRow = (index, patch) => {
    const next = measurements.slice();
    next[index] = { ...next[index], ...patch };
    setMeasurements(next);
  };
  const validateFukt = () => {
    if (!device || !method) return 'Fyll i mätinstrument och metod.';
    if (!calibrationDate) return 'Fyll i kalibreringsdatum.';
    if (measurements.length === 0) return 'Lägg till minst en mätpunkt.';
    const bad = measurements.find(m => {
      const valStr = (m?.value ?? '').trim();
      if (m?.unit === 'RF') {
        const num = Number(valStr);
        return !valStr || !isFinite(num) || num <= 0;
      }
      return !valStr; // CM must be non-empty
    });
    if (bad) return bad?.unit === 'RF' ? 'RF kan inte vara 0% eller tom.' : 'Minst en mätpunkt saknar värde.';
    return null;
  };
  const saveFukt = () => {
    const err = validateFukt();
    if (err) {
      alert(err);
      return;
    }
    // TODO: Persist to Firestore under project controls collection
    alert('Fuktmätning sparad (demo)');
  };
  const cancelControl = () => {
    Alert.alert(
      'Avbryt kontroll?',
      'Om du avbryter nu kommer den här kontrollen att gå förlorad. Vill du fortsätta?',
      [
        { text: 'Nej', style: 'cancel' },
        { text: 'Ja, avbryt', style: 'destructive', onPress: () => {
          setIsCancelling(true);
          setShowMeasureTypeModal(false);
          setShowDrawingModal(false);
          setShowCameraOverlay(false);
          try {
            // Stack reset direkt till 'Home' som definierad i App.js
            navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
            return;
          } catch {}
          try {
            navigation.navigate('Home');
            return;
          } catch {}
          try {
            navigation.popToTop?.();
          } catch {}
        } }
      ]
    );
  };
  const handleHeaderBack = () => {
    try {
      const parent = navigation.getParent?.();
      if (parent) {
        parent.dispatch(CommonActions.goBack());
        return;
      }
      navigation.dispatch(CommonActions.goBack());
    } catch {}
  };
  useLayoutEffect(() => {
    navigation.setOptions({
      headerBackVisible: false,
      headerLeft: () => (
        <TouchableOpacity onPress={handleHeaderBack} style={{ paddingHorizontal: 12 }} accessibilityLabel="Tillbaka">
          <MaterialIcons name="arrow-back" size={22} color="#263238" />
        </TouchableOpacity>
      )
    });
  }, [navigation]);
  // Ritning: popup för att bifoga PDF, lägga till foto eller ta kort
  const [showDrawingModal, setShowDrawingModal] = useState(false);
  const takePhotoAsync = async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Inte tillgängligt på webben', 'Kamerafunktionen stöds inte i webbläsaren.');
        return;
      }
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Behörighet krävs', 'Appen behöver kamerabehörighet för att ta foto.');
        return;
      }
      const result = await ImagePicker.launchCameraAsync({ allowsEditing: false, quality: 0.8 });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        // Lägg som generell bilaga
        setAttachments(prev => [...prev, { uri, type: 'image' }]);
        Alert.alert('Foto bifogat', 'Fotot har lagts till som bilaga.');
      }
    } catch (e) {
      Alert.alert('Fel vid kamerastart', 'Kontrollera att "expo-image-picker" är installerad och konfigurerad.\n' + String(e?.message || e));
    } finally {
      setShowDrawingModal(false);
    }
  };
  const pickImageAsync = async () => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Inte tillgängligt på webben', 'Mediabiblioteket stöds inte i webbläsaren.');
        return;
      }
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Behörighet krävs', 'Appen behöver åtkomst till bilder för att bifoga från biblioteket.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: false,
        quality: 0.9,
        mediaTypes: ImagePicker.MediaTypeOptions.Images
      });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        setAttachments(prev => [...prev, { uri, type: 'image' }]);
        Alert.alert('Foto bifogat', 'Valt foto har lagts till som bilaga.');
      }
    } catch (e) {
      Alert.alert('Fel vid val av foto', 'Kontrollera att "expo-image-picker" är installerad och konfigurerad.\n' + String(e?.message || e));
    } finally {
      setShowDrawingModal(false);
    }
  };
  const takePhotoForMeasurement = async (index) => {
    try {
      // Stäng mätpunktens bifoga-modal innan kameran öppnas
      closeMeasureAttach();
      if (Platform.OS === 'web') {
        Alert.alert('Inte tillgängligt på webben', 'Kamerafunktionen stöds inte i webbläsaren.');
        return;
      }
      // Begär kamerabehörighet via expo-camera (inte image-picker)
      const currentCamPerm = await Camera.getCameraPermissionsAsync();
      const perm = currentCamPerm?.status === 'granted' ? currentCamPerm : await Camera.requestCameraPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Behörighet krävs', 'Appen behöver kamerabehörighet för att ta foto.');
        return;
      }
      // För vissa enheter kan launchCameraAsync under en modal misslyckas.
      // Fallback: öppna en egen kamera-overlay med expo-camera.
      setCameraTargetIndex(index);
      setTimeout(() => setShowCameraOverlay(true), 200);
    } catch (e) {
      Alert.alert('Fel vid kamerastart', String(e?.message || e));
    }
  };

  const captureWithOverlay = async () => {
    try {
      if (!cameraRef) return;
      const photo = await cameraRef.takePictureAsync({ quality: 0.8, skipProcessing: true });
      if (photo?.uri && typeof cameraTargetIndex === 'number') {
        const next = measurements.slice();
        const photos = Array.isArray(next[cameraTargetIndex].photos) ? next[cameraTargetIndex].photos : [];
        next[cameraTargetIndex] = { ...next[cameraTargetIndex], photos: [...photos, { uri: photo.uri }] };
        setMeasurements(next);
        setShowCameraOverlay(false);
        setCameraTargetIndex(null);
        Alert.alert('Foto till mätpunkt', `Foto tillagt på mätpunkt #${next[cameraTargetIndex]?.id || ''}.`);
      }
    } catch (err) {
      Alert.alert('Kamerafel (overlay)', String(err?.message || err));
    }
  };
  // Per-mätpunkt: öppna attach-modal
  const [measureAttachIndex, setMeasureAttachIndex] = useState(null);
  const openMeasureAttach = (index) => setMeasureAttachIndex(index);
  const closeMeasureAttach = () => setMeasureAttachIndex(null);
  const attachPdfForMeasurement = (index) => {
    closeMeasureAttach();
    Alert.alert('Bifoga PDF (demo)', `PDF bifogas till mätpunkt #${measurements[index]?.id}.`);
  };
  // Ta emot bild från kamerasidan
  useEffect(() => {
    const result = route?.params?.cameraResult;
    if (result?.uri && typeof result.index === 'number') {
      const next = measurements.slice();
      const photos = Array.isArray(next[result.index].photos) ? next[result.index].photos : [];
      next[result.index] = { ...next[result.index], photos: [...photos, { uri: result.uri }] };
      setMeasurements(next);
      // Rensa param för att undvika dubbelhantering
      navigation.setParams({ cameraResult: null });
    }
  }, [route?.params?.cameraResult]);
  const pickImageForMeasurement = async (index) => {
    try {
      if (Platform.OS === 'web') {
        Alert.alert('Inte tillgängligt på webben', 'Mediabiblioteket stöds inte i webbläsaren.');
        return;
      }
      const ImagePicker = await import('expo-image-picker');
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (perm.status !== 'granted') {
        Alert.alert('Behörighet krävs', 'Appen behöver åtkomst till bilder för att välja från biblioteket.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({ allowsEditing: false, quality: 0.9, mediaTypes: ImagePicker.MediaTypeOptions.Images });
      if (!result.canceled && result.assets && result.assets.length > 0) {
        const uri = result.assets[0].uri;
        const next = measurements.slice();
        const photos = Array.isArray(next[index].photos) ? next[index].photos : [];
        next[index] = { ...next[index], photos: [...photos, { uri }] };
        setMeasurements(next);
        Alert.alert('Foto till mätpunkt', `Biblioteksfoto tillagt på mätpunkt #${next[index].id}.`);
      }
    } catch (e) {
      Alert.alert('Fel vid val av foto', 'Kontrollera att "expo-image-picker" är installerad och konfigurerad.\n' + String(e?.message || e));
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: 24 }}>
      <Text style={styles.title}>
        {byggdel ? `${byggdel} ` : ''}{type}
      </Text>
      <Text style={styles.subInfo}>Datum: {date}</Text>
      {project?.id ? (
        <Text style={styles.subInfo}>Projekt: {project.id} - {project.name}</Text>
      ) : null}
      {type?.toLowerCase() === 'fuktmätning' ? (
        <View>
          {/* Modal: Vad ska du mäta? */}
          <Modal visible={showMeasureTypeModal} transparent animationType="fade" onRequestClose={() => setShowMeasureTypeModal(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{measurePopupCategory === 'material' ? 'Material' : measurePopupCategory === 'concrete' ? 'Betongplatta' : measurePopupCategory === 'screed' ? 'Golvavjämning' : 'Vad ska du mäta?'}</Text>
                {/* Enkel lista med val baserat på vald kategori, eller övergripande val vid null */}
                {measurePopupCategory == null ? (
                  <View>
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setMeasurePopupCategory('material')} accessibilityLabel="Material">
                      <MaterialIcons name="category" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Material</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setMeasurePopupCategory('concrete')} accessibilityLabel="Betongplatta">
                      <MaterialIcons name="architecture" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Betongplatta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setMeasurePopupCategory('screed')} accessibilityLabel="Golvavjämning">
                      <MaterialIcons name="layers" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Golvavjämning</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => { setShowMeasureTypeModal(false); setShowManualGeneral(true); setMeasureGroupsExpanded({ material: false, concrete: false, screed: false }); }} accessibilityLabel="Valfritt">
                      <MaterialIcons name="edit" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Valfritt</Text>
                    </TouchableOpacity>
                  </View>
                ) : measurePopupCategory === 'material' ? (
                  <View>
                    {['Trä','Virke','Isolering','Gips','Byggskivor'].map((label) => (
                      <TouchableOpacity key={label} style={styles.modalOption} onPress={() => {
                        if (multiSelectMode) {
                          setTempMultiSelections(prev => prev.includes(label) ? prev : [...prev, label]);
                        } else {
                          setSelectedMultiItems(prev => {
                            const next = prev.includes(label) ? prev : [...prev, label];
                            setMeasureCategory(next.join(', '));
                            setMeasureCategorySource(next.length > 1 ? 'multi' : 'material');
                            return next;
                          });
                          setShowMeasureTypeModal(false);
                        }
                      }}>
                        <MaterialIcons name="chevron-right" size={18} color="#888" />
                        <Text style={styles.modalOptionText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setShowManualMaterial(v => !v)}>
                      <MaterialIcons name="add-circle-outline" size={20} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Lägg till annat val</Text>
                    </TouchableOpacity>
                    {showManualMaterial ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ange eget material" placeholderTextColor="#9AA0A6" value={manualMaterial} onChangeText={setManualMaterial} />
                        <TouchableOpacity style={styles.primaryAction} onPress={() => { if (manualMaterial.trim()) { if (multiSelectMode) { setTempMultiSelections(prev => prev.includes(manualMaterial.trim()) ? prev : [...prev, manualMaterial.trim()]); setManualMaterial(''); } else { const val = manualMaterial.trim(); setSelectedMultiItems(prev => { const next = prev.includes(val) ? prev : [...prev, val]; setMeasureCategory(next.join(', ')); setMeasureCategorySource(next.length > 1 ? 'multi' : 'material'); return next; }); setShowMeasureTypeModal(false); setManualMaterial(''); } } }}>
                          <MaterialIcons name="check" size={18} color="#fff" />
                          <Text style={styles.primaryActionText}>Lägg till</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : measurePopupCategory === 'concrete' ? (
                  <View>
                    {['Fuktinnehåll i betong','Mätning av RF'].map((label) => (
                      <TouchableOpacity key={label} style={styles.modalOption} onPress={() => {
                        if (multiSelectMode) {
                          setTempMultiSelections(prev => prev.includes(label) ? prev : [...prev, label]);
                        } else {
                          setSelectedMultiItems(prev => {
                            const next = prev.includes(label) ? prev : [...prev, label];
                            setMeasureCategory(next.join(', '));
                            setMeasureCategorySource(next.length > 1 ? 'multi' : 'concrete');
                            return next;
                          });
                          setShowMeasureTypeModal(false);
                        }
                      }}>
                        <MaterialIcons name="chevron-right" size={18} color="#888" />
                        <Text style={styles.modalOptionText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setShowManualConcrete(v => !v)}>
                      <MaterialIcons name="add-circle-outline" size={20} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Lägg till annat val</Text>
                    </TouchableOpacity>
                    {showManualConcrete ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ange eget val" placeholderTextColor="#9AA0A6" value={manualConcrete} onChangeText={setManualConcrete} />
                        <TouchableOpacity style={styles.primaryAction} onPress={() => { if (manualConcrete.trim()) { if (multiSelectMode) { setTempMultiSelections(prev => prev.includes(manualConcrete.trim()) ? prev : [...prev, manualConcrete.trim()]); setManualConcrete(''); } else { const val = manualConcrete.trim(); setSelectedMultiItems(prev => { const next = prev.includes(val) ? prev : [...prev, val]; setMeasureCategory(next.join(', ')); setMeasureCategorySource(next.length > 1 ? 'multi' : 'concrete'); return next; }); setShowMeasureTypeModal(false); setManualConcrete(''); } } }}>
                          <MaterialIcons name="check" size={18} color="#fff" />
                          <Text style={styles.primaryActionText}>Lägg till</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : measurePopupCategory === 'screed' ? (
                  <View>
                    {['RF mätning innan tätskikt','RF mätning innan golvbeläggning'].map((label) => (
                      <TouchableOpacity key={label} style={styles.modalOption} onPress={() => {
                        if (multiSelectMode) {
                          setTempMultiSelections(prev => prev.includes(label) ? prev : [...prev, label]);
                        } else {
                          setSelectedMultiItems(prev => {
                            const next = prev.includes(label) ? prev : [...prev, label];
                            setMeasureCategory(next.join(', '));
                            setMeasureCategorySource(next.length > 1 ? 'multi' : 'screed');
                            return next;
                          });
                          setShowMeasureTypeModal(false);
                        }
                      }}>
                        <MaterialIcons name="chevron-right" size={18} color="#888" />
                        <Text style={styles.modalOptionText}>{label}</Text>
                      </TouchableOpacity>
                    ))}
                    <TouchableOpacity style={styles.modalOptionSecondary} onPress={() => setShowManualScreed(v => !v)}>
                      <MaterialIcons name="add-circle-outline" size={20} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Lägg till annat val</Text>
                    </TouchableOpacity>
                    {showManualScreed ? (
                      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        <TextInput style={[styles.input, { flex: 1 }]} placeholder="Ange eget val" placeholderTextColor="#9AA0A6" value={manualScreed} onChangeText={setManualScreed} />
                        <TouchableOpacity style={styles.primaryAction} onPress={() => {
                          if (manualScreed.trim()) {
                            const val = manualScreed.trim();
                            if (multiSelectMode) {
                              setTempMultiSelections(prev => prev.includes(val) ? prev : [...prev, val]);
                              setManualScreed('');
                            } else {
                              setSelectedMultiItems(prev => { const next = prev.includes(val) ? prev : [...prev, val]; setMeasureCategory(next.join(', ')); setMeasureCategorySource(next.length > 1 ? 'multi' : 'screed'); return next; });
                              setShowMeasureTypeModal(false);
                              setManualScreed('');
                            }
                          }
                        }}>
                          <MaterialIcons name="check" size={18} color="#fff" />
                          <Text style={styles.primaryActionText}>Lägg till</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                ) : null}
                {/* Tillbaka och Avbryt */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12 }}>
                  {multiSelectMode ? (
                    <View style={{ flex: 2 }}>
                      <TouchableOpacity
                        style={[styles.successAction, { width: '100%', justifyContent: 'center' }]}
                        onPress={() => {
                          if (tempMultiSelections.length > 0) {
                            const joined = tempMultiSelections.join(', ');
                            setMeasureCategory(joined);
                            setMeasureCategorySource('multi');
                            setSelectedMultiItems(tempMultiSelections);
                            setShowMeasureTypeModal(false);
                            setMaterialOpen(false);
                            setMultiSelectMode(false);
                            setTempMultiSelections([]);
                            setMeasurePopupCategory(null);
                            setShowManualMaterial(false);
                            setShowManualConcrete(false);
                            setShowManualScreed(false);
                          }
                        }}
                        accessibilityLabel="Bekräfta flera val (Klar)"
                      >
                        <MaterialIcons name="check" size={18} color="#fff" />
                        <Text style={styles.successActionText}>Klar</Text>
                      </TouchableOpacity>
                    </View>
                  ) : null}
                  <View style={{ flex: 2 }}>
                    {measurePopupCategory !== null ? (
                      <TouchableOpacity style={[styles.secondaryAction, { width: '100%', justifyContent: 'center', paddingHorizontal: 18 }]} onPress={() => setMeasurePopupCategory(null)} accessibilityLabel="Tillbaka till kategori">
                        <MaterialIcons name="chevron-left" size={18} color={PRIMARY} />
                        <Text style={styles.secondaryActionText}>Tillbaka</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  <View style={{ flex: 1 }} />
                  <TouchableOpacity style={styles.dangerAction} onPress={() => setShowMeasureTypeModal(false)} accessibilityLabel="Stäng kategori-val">
                    <MaterialIcons name="close" size={18} color="#fff" />
                    <Text style={styles.dangerActionText}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
          {/* Modal: Valda delar */}
          <Modal visible={showEditSelectedModal} transparent animationType="fade" onRequestClose={() => setShowEditSelectedModal(false)}>
            <View style={styles.modalBackdrop}>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>Valda delar</Text>
                {selectedMultiItems.length === 0 ? (
                  <Text style={{ color: '#666', textAlign: 'center' }}>Inga val att ändra.</Text>
                ) : (
                  <View>
                    {selectedMultiItems.map((item) => (
                      <TouchableOpacity
                        key={`sel-${item}`}
                        style={[
                          styles.modalOption,
                          removeSelections.includes(item) && { borderColor: '#D32F2F', backgroundColor: '#FDECEA' }
                        ]}
                        onPress={() => {
                          setRemoveSelections(prev => prev.includes(item) ? prev.filter(i => i !== item) : [...prev, item]);
                        }}
                      >
                        <MaterialIcons name={removeSelections.includes(item) ? 'check-box' : 'check-box-outline-blank'} size={18} color={removeSelections.includes(item) ? '#D32F2F' : '#888'} />
                        <Text style={styles.modalOptionText}>{item}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{ flexDirection: 'row', gap: 12, marginTop: 12, alignItems: 'stretch' }}>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.dangerAction, { width: '100%', justifyContent: 'center' }]}
                      onPress={() => {
                        if (removeSelections.length > 0) {
                          const next = selectedMultiItems.filter(i => !removeSelections.includes(i));
                          setSelectedMultiItems(next);
                          if (next.length > 0) {
                            setMeasureCategory(next.join(', '));
                            setMeasureCategorySource(next.length > 1 ? 'multi' : 'manual');
                          } else {
                            setMeasureCategory('');
                            setMeasureCategorySource(null);
                          }
                          setShowEditSelectedModal(false);
                          setRemoveSelections([]);
                        }
                      }}
                      accessibilityLabel="Ta bort markerade val"
                    >
                      <MaterialIcons name="delete" size={18} color="#fff" />
                      <Text style={styles.dangerActionText}>Ta bort valda</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flex: 1 }}>
                    <TouchableOpacity
                      style={[styles.modalCancel, { width: '100%', justifyContent: 'center', marginTop: 0, alignSelf: 'flex-start', paddingVertical: 12, paddingHorizontal: 14 } ]}
                      onPress={() => { setShowEditSelectedModal(false); setRemoveSelections([]); }}
                      accessibilityLabel="Stäng valda delar"
                    >
                      <MaterialIcons name="close" size={18} color="#263238" />
                      <Text style={styles.modalCancelText}>Stäng</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
          {/* Info-banner borttagen: valet visas i selektorraden */}
          <View style={styles.section}>
            <Collapsible
              title="Mätinstrument"
              subtitle={!instrumentOpen && (device || '').trim() ? (device || '').trim() : undefined}
              error={!isInstrumentApproved}
              open={instrumentOpen}
              onOpenChange={(open) => setInstrumentOpen(open)}
              headerRight={isInstrumentApproved ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialIcons name="check-circle" size={18} color="#2E7D32" />
                  <Text style={{ color: '#2E7D32', fontWeight: '600' }}>Godkänd</Text>
                  {calibrationDate === 'Okänt' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 6 }}>
                      <MaterialIcons name="warning" size={18} color="#FBC02D" />
                      <Text style={{ color: '#263238', fontWeight: '600' }}>Kalibrering</Text>
                    </View>
                  ) : null}
                </View>
              ) : null}
            >
              <View>
                <View style={{ position: 'relative' }}>
                  <TextInput style={[styles.input, !device?.trim() && styles.inputError]} placeholder="Instrument/modell" placeholderTextColor="#9AA0A6" value={device} onChangeText={setDevice} />
                  {device?.trim() ? (
                    <MaterialIcons name="check-circle" size={18} color="#2E7D32" style={styles.inputIconRight} />
                  ) : (
                    <MaterialIcons name="cancel" size={18} color="#D32F2F" style={styles.inputIconRight} />
                  )}
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, position: 'relative' }}>
                    <TextInput style={[styles.input, { flex: 1 }, !serial?.trim() && styles.inputError]} placeholder="Serienummer" placeholderTextColor="#9AA0A6" value={serial} onChangeText={setSerial} />
                    {serial?.trim() ? (
                      <MaterialIcons name="check-circle" size={18} color="#2E7D32" style={styles.inputIconRight} />
                    ) : (
                      <MaterialIcons name="cancel" size={18} color="#D32F2F" style={styles.inputIconRight} />
                    )}
                  </View>
                  <View style={{ flex: 1, position: 'relative' }}>
                    <TouchableOpacity
                      style={[styles.input, { flex: 1, justifyContent: 'center', alignItems: 'flex-start' }, !isValidCalibration && styles.inputError]}
                      activeOpacity={0.7}
                      onPress={openDatePicker}
                      accessibilityRole="button"
                      accessibilityLabel="Öppna datumväljare för kalibreringsdatum"
                    >
                      <Text style={{ fontSize: 15, color: calibrationDate ? '#263238' : '#9AA0A6', textAlign: 'left', width: '100%' }}>
                        {calibrationDate || 'Kalibreringsdatum (YYYY-MM-DD)'}
                      </Text>
                    </TouchableOpacity>
                    {calibrationDate === 'Okänt' ? (
                      <MaterialIcons name="warning" size={18} color="#FBC02D" style={styles.inputIconRight} />
                    ) : isValidCalibration ? (
                      <MaterialIcons name="check-circle" size={18} color="#2E7D32" style={styles.inputIconRight} />
                    ) : (
                      <MaterialIcons name="cancel" size={18} color="#D32F2F" style={styles.inputIconRight} />
                    )}
                  </View>
                </View>
              </View>
            </Collapsible>
          </View>
          {/* Inline fråga: Material */}
          <View style={styles.section}>
            <Collapsible title="Material" subtitle={!materialOpen && measureCategory ? measureCategory : undefined} error={!isMaterialApproved} open={materialOpen} onOpenChange={(open) => {
              setMaterialOpen(open);
              if (!open) {
                setMeasureGroupsExpanded({ material: false, concrete: false, screed: false });
                setShowManualGeneral(false);
                setShowMeasureTypeModal(false);
                setMeasurePopupCategory(null);
              }
            }} headerRight={isMaterialApproved ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="check-circle" size={18} color="#2E7D32" />
                <Text style={{ color: '#2E7D32', fontWeight: '600' }}>Godkänd</Text>
              </View>
            ) : undefined}>
              <View>
                {/* Toppval: Lägg till + Valda delar + Ändra (varsin rad, jämn indrag vänster/höger) */}
                <View style={{ flexDirection: 'column', gap: 8, marginBottom: 8, marginHorizontal: 20, alignItems: 'flex-start' }}>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity
                      style={styles.modalOptionSecondary}
                      onPress={() => { setMeasurePopupCategory(null); setShowMeasureTypeModal(true); setMultiSelectMode(false); setTempMultiSelections([]); }}
                      accessibilityLabel="Lägg till"
                    >
                      <MaterialIcons name="category" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Lägg till</Text>
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8, width: '100%', alignItems: 'center' }}>
                    <TouchableOpacity
                      style={styles.modalOptionSecondary}
                      onPress={() => { setRemoveSelections([]); setShowEditSelectedModal(true); }}
                      accessibilityLabel="Valda delar"
                    >
                      <MaterialIcons name="list" size={18} color={PRIMARY} />
                      <Text style={styles.modalOptionText}>Valda delar</Text>
                    </TouchableOpacity>
                    <View style={{ flex: 1 }} />
                    {measureCategory ? (
                      <TouchableOpacity
                        style={[styles.modalOptionSecondary, { backgroundColor: '#D32F2F', borderColor: '#D32F2F' }]}
                        onPress={() => {
                          setMeasurePopupCategory(null);
                          setShowMeasureTypeModal(true);
                          setMultiSelectMode(false);
                          setTempMultiSelections([]);
                        }}
                        accessibilityLabel="Ändra val"
                      >
                        <MaterialIcons name="edit" size={18} color="#FFFFFF" />
                        <Text style={[styles.modalOptionText, { color: '#FFFFFF', fontWeight: '700' }]}>Ändra</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                  
                </View>
                {/* Valfritt borttagen: 'Valda kategorier' ersätter och öppnar ändra-valda modal */}
                {measureCategory ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#E9ECEF', borderColor: '#D0D5DA', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#263238', fontWeight: '600' }}>Utför mätning av:</Text>
                      <View style={{ marginTop: 4 }}>
                        {(selectedMultiItems.length > 0 ? selectedMultiItems : (measureCategory ? measureCategory.split(',').map(s => s.trim()).filter(Boolean) : [])).map((it, idx) => (
                          <Text key={`sel-${idx}`} style={{ color: '#263238' }}>• {it}</Text>
                        ))}
                      </View>
                    </View>
                    <MaterialIcons name="check-circle" size={18} color="#2E7D32" />
                  </View>
                ) : null}
              </View>
            </Collapsible>
          </View>
          <View style={styles.section}>
            <Collapsible title="Mätplats" subtitle={!placeOpen && (location || '').trim() ? `Plats/rum: ${(location || '').trim()}` : undefined} error={!isPlaceApproved} open={placeOpen} onOpenChange={(open) => setPlaceOpen(open)} headerRight={isPlaceApproved ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="check-circle" size={18} color="#2E7D32" />
                <Text style={{ color: '#2E7D32', fontWeight: '600' }}>Godkänd</Text>
              </View>
            ) : undefined}>
              <View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, position: 'relative' }}>
                    <View style={[styles.input, { flexDirection: 'row', alignItems: 'center' }, !location?.trim() && styles.inputError]}>
                      <Text style={{ color: '#263238', fontWeight: '700', marginRight: 6 }}>Plats/rum:</Text>
                      <TextInput
                        style={{ flex: 1, color: '#263238', paddingVertical: 0 }}
                        placeholder="Skriv plats/rum"
                        placeholderTextColor="#9AA0A6"
                        value={location}
                        onChangeText={setLocation}
                      />
                    </View>
                    {location?.trim() ? (
                      <MaterialIcons name="check-circle" size={18} color="#2E7D32" style={styles.inputIconRight} />
                    ) : (
                      <MaterialIcons name="cancel" size={18} color="#D32F2F" style={styles.inputIconRight} />
                    )}
                  </View>
                </View>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  <View style={{ flex: 1, position: 'relative' }}>
                    <TouchableOpacity
                      style={[styles.input, { flex: 1 }, !isValidReference && styles.inputError, { justifyContent: 'center' }]}
                      onPress={() => {
                        // Init with existing reference or default 85
                        const t = (reference || '').trim();
                        const n = Number(t.replace(',', '.'));
                        const init = isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 85;
                        setTempReference(init);
                        setShowReferencePickerModal(true);
                      }}
                      accessibilityLabel="Välj gränsvärde"
                    >
                      <Text>
                        <Text style={{ color: '#263238', fontWeight: '700' }}>Gränsvärde:</Text>
                        <Text style={{ color: reference?.trim() ? '#263238' : '#9AA0A6', fontWeight: '400', fontStyle: reference?.trim() ? 'normal' : 'italic' }}> {reference?.trim() ? `${reference}, % RF` : '(0–100)'}</Text>
                      </Text>
                    </TouchableOpacity>
                    {isValidReference ? (
                      <MaterialIcons name="check-circle" size={18} color="#2E7D32" style={styles.inputIconRight} />
                    ) : (
                      <MaterialIcons name="cancel" size={18} color="#D32F2F" style={styles.inputIconRight} />
                    )}
                  </View>
                </View>
              </View>
            </Collapsible>
          </View>

          <View style={styles.section}>
            <Collapsible title="Mätpunkter" error={!isMeasurementsApproved} headerRight={isMeasurementsApproved ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialIcons name="check-circle" size={18} color="#2E7D32" />
                <Text style={{ color: '#2E7D32', fontWeight: '600' }}>Godkänd</Text>
              </View>
            ) : undefined}>
            {measurements.map((m, idx) => (
              <View key={m.id} style={[styles.measureRow, styles.measureRowFilled]}>
                <View style={styles.measureIdCol}>
                  <Text style={styles.measureId}>#{m.id}</Text>
                  {!isMeasurementEmpty(m) ? (
                    <MaterialIcons name="fiber-manual-record" size={10} color="#1976D2" />
                  ) : (
                    <View style={{ height: 10 }} />
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <TextInput style={[styles.input, !m.position?.trim() && styles.inputError]} placeholder="Position" placeholderTextColor="#9AA0A6" value={m.position} onChangeText={(t) => updateRow(idx, { position: t })} />
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Djup (mm)" placeholderTextColor="#9AA0A6" value={m.depth} onChangeText={(t) => updateRow(idx, { depth: t })} />
                    <TextInput style={[styles.input, { flex: 1 }]} placeholder="Temp (°C)" placeholderTextColor="#9AA0A6" value={m.temp} onChangeText={(t) => updateRow(idx, { temp: t })} />
                  </View>
                  <View style={{ flexDirection: 'row', gap: 8 }}>
                    {m.unit === 'CM' ? (
                      <TextInput style={[styles.input, { flex: 1 }, !m.value?.trim() && styles.inputError]} placeholder="CM (%)" placeholderTextColor="#9AA0A6" value={m.value} onChangeText={(t) => updateRow(idx, { value: t })} />
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.input,
                          { flex: 1 },
                          // Error when empty OR RF value is 0
                          (!m.value?.trim() || (m.unit === 'RF' && Number((m.value || '').trim()) === 0)) && styles.inputError,
                          { justifyContent: 'center' }
                        ]}
                        onPress={() => {
                          const t = (m.value || '').trim();
                          const n = Number(t.replace(',', '.'));
                          const init = isFinite(n) ? Math.max(1, Math.min(100, Math.round(n))) : 100;
                          setTempMeasurementValue(init);
                          setMeasurementPickerIndex(idx);
                          setShowMeasurementPickerModal(true);
                        }}
                        accessibilityLabel={`Välj RF värde för mätpunkt #${m.id}`}
                      >
                        <Text style={{ color: m.value?.trim() ? '#263238' : '#9AA0A6', fontStyle: m.value?.trim() ? 'normal' : 'italic' }}>
                          {m.value?.trim() ? `${m.value} %` : 'RF (1–100%)'}
                        </Text>
                        <MaterialIcons name="expand-more" size={18} color="#888" style={styles.inputIconRight} />
                      </TouchableOpacity>
                    )}
                  </View>
                  <TextInput style={styles.input} placeholder="Anteckning" placeholderTextColor="#9AA0A6" value={m.note} onChangeText={(t) => updateRow(idx, { note: t })} />
                </View>
                <View style={{ alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity onPress={() => openMeasureAttach(idx)} style={styles.rowSecondaryBtn} accessibilityLabel={`Bifoga till mätpunkt ${m.id}`}>
                    <MaterialIcons name="attachment" size={18} color="#263238" />
                  </TouchableOpacity>
                  {Array.isArray(m.photos) && m.photos.length > 0 ? (
                    <TouchableOpacity onPress={() => openPreview({ uri: m.photos[0]?.uri, type: 'image', title: `Mätpunkt #${m.id} foto` })}>
                      <Text style={{ fontSize: 11, color: '#666', textDecorationLine: 'underline' }}>{m.photos.length} foto</Text>
                    </TouchableOpacity>
                  ) : null}
                  {Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                    <Text style={{ fontSize: 11, color: '#666' }}>{m.attachments.length} bilaga</Text>
                  ) : null}
                  {/* Kompakt staplad thumbnail: visar första med stack-indikator och badge */}
                  <View style={{ marginTop: 4 }}>
                    {Array.isArray(m.photos) && m.photos.length > 0 ? (
                      <TouchableOpacity onPress={() => {
                        const photoItems = m.photos.map(p => ({ uri: p.uri, type: 'image', title: `Mätpunkt #${m.id} foto`, source: 'measurement', mIndex: idx, kind: 'photo' }));
                        const attachItems = m.attachments.map(a => ({ uri: a.uri, type: a.type || 'file', title: `Mätpunkt #${m.id} bilaga`, source: 'measurement', mIndex: idx, kind: 'attachment' }));
                        const items = [...photoItems, ...attachItems];
                        openPreview(photoItems[0], items);
                      }}>
                        <View style={styles.stackThumbWrap}>
                          {m.photos.length > 1 ? (
                            <View style={[styles.stackLayer, { transform: [{ rotate: '-2deg'}], left: 6, top: 6 }]} />
                          ) : null}
                          {m.photos.length > 2 ? (
                            <View style={[styles.stackLayer, { transform: [{ rotate: '3deg'}], left: 3, top: 3 }]} />
                          ) : null}
                          <Image source={{ uri: m.photos[0].uri }} style={styles.stackThumb} />
                          <View style={styles.stackBadge}>
                            <Text style={styles.stackBadgeText}>{m.photos.length}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    ) : Array.isArray(m.attachments) && m.attachments.length > 0 ? (
                      m.attachments[0].type === 'image' ? (
                        <TouchableOpacity onPress={() => {
                          const items = m.attachments.map(a => ({ uri: a.uri, type: a.type || 'file', title: `Mätpunkt #${m.id} bilaga`, source: 'measurement', mIndex: idx, kind: 'attachment' }));
                          openPreview(items[0], items);
                        }}>
                          <View style={styles.stackThumbWrap}>
                            <Image source={{ uri: m.attachments[0].uri }} style={styles.stackThumb} />
                            <View style={styles.stackBadge}>
                              <Text style={styles.stackBadgeText}>{m.attachments.length}</Text>
                            </View>
                          </View>
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.stackThumbWrap}>
                          <View style={[styles.thumbPdf, { width: 56, height: 56 }] }>
                            <MaterialIcons name="picture-as-pdf" size={18} color="#D32F2F" />
                          </View>
                          <View style={styles.stackBadge}>
                            <Text style={styles.stackBadgeText}>{m.attachments.length}</Text>
                          </View>
                        </View>
                      )
                    ) : null}
                  </View>
                </View>
                <TouchableOpacity onPress={() => removeRowWithConfirm(idx)} style={styles.iconBtn} accessibilityLabel="Ta bort mätpunkt">
                  <MaterialIcons name="delete" size={18} color="#fff" />
                </TouchableOpacity>
              </View>
            ))}
            <TouchableOpacity onPress={addRow} style={styles.addRowBtn} accessibilityLabel="Lägg till mätpunkt">
              <MaterialIcons name="add" size={18} color="#263238" />
              <Text style={{ color: '#263238', fontWeight: '600' }}>Lägg till mätpunkt</Text>
            </TouchableOpacity>
            </Collapsible>
          </View>

          {/* Bottenåtgärder för Fuktmätning flyttas till gemensam sektion nedan */}
        </View>
      ) : (
        <View>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Beskrivning</Text>
            <Text style={styles.bodyText}>{description || '—'}</Text>
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Deltagare</Text>
            {participants.length === 0 ? (
              <Text style={styles.bodyText}>Inga deltagare</Text>
            ) : (
              <View>
                {participants.map((p, i) => (
                  <View key={i} style={styles.participantRow}>
                    <Text style={styles.bodyText}>
                      {p.name || '—'}{p.company ? `, ${p.company}` : ''}{p.role ? `, ${p.role}` : ''}{p.phone ? `, ${p.phone}` : ''}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </View>

          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Kontrollpunkter</Text>
            {checklist.length === 0 ? (
              <Text style={styles.bodyText}>Inga punkter</Text>
            ) : (
              <View>
                {checklist.map((item, idx) => (
                  <View key={idx} style={styles.checkRow}>
                    <View style={[styles.checkbox, item.done && styles.checkboxChecked]}>
                      {item.done ? <Text style={styles.checkboxMark}>✓</Text> : null}
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.checkLabel}>{item.label}</Text>
                      {item.note ? (
                        <Text style={styles.noteText}>{item.note}</Text>
                      ) : null}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </View>
        </View>
      )}

      {/* Gemensam bottensektion: Bifoga, Spara, Avbryt */}
      <View style={styles.section}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {/* Left: prominent Bifoga */}
          <TouchableOpacity
            style={styles.secondaryAction}
            onPress={() => setShowDrawingModal(true)}
            accessibilityLabel="Bifoga dokument eller foto"
          >
            <MaterialIcons name="attachment" size={20} color={PRIMARY} />
            <Text style={styles.secondaryActionText}>Bifoga</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          {/* Right: Spara + Avbryt grouped on right */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <TouchableOpacity onPress={type?.toLowerCase() === 'fuktmätning' ? saveFukt : () => alert('Spara (demo)')} style={styles.primaryAction} accessibilityLabel="Spara kontroll">
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text style={styles.primaryActionText}>Spara</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={cancelControl} style={styles.dangerAction} accessibilityLabel="Avbryt kontroll">
              <MaterialIcons name="close" size={20} color="#fff" />
              <Text style={styles.dangerActionText}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </View>
        {attachments.length > 0 ? (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 13, color: '#666' }}>{attachments.length} bilaga</Text>
            {/* Gemensam kompakt staplad thumbnail */}
            <View style={{ marginTop: 6 }}>
              {attachments.length > 0 ? (
                attachments[0].type === 'image' ? (
                  <TouchableOpacity onPress={() => {
                    const items = attachments.map(a => ({ uri: a.uri, type: a.type || 'file', title: 'Bilaga', source: 'global', kind: 'attachment' }));
                    openPreview(items[0], items);
                  }}>
                    <View style={styles.stackThumbWrap}>
                      <Image source={{ uri: attachments[0].uri }} style={styles.stackThumb} />
                      <View style={styles.stackBadge}>
                        <Text style={styles.stackBadgeText}>{attachments.length}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                ) : (
                  <View style={styles.stackThumbWrap}>
                    <View style={[styles.thumbPdf, { width: 56, height: 56 }]}>
                      <MaterialIcons name="picture-as-pdf" size={18} color="#D32F2F" />
                    </View>
                    <View style={styles.stackBadge}>
                      <Text style={styles.stackBadgeText}>{attachments.length}</Text>
                    </View>
                  </View>
                )
              ) : null}
            </View>
          </View>
        ) : null}
      </View>

      {/* Modal: Bifoga */}
      <Modal visible={showDrawingModal} transparent animationType="fade" onRequestClose={() => setShowDrawingModal(false)}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={() => setShowDrawingModal(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bifoga</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { setShowDrawingModal(false); alert('Bifoga PDF (demo)'); }}>
              <MaterialIcons name="picture-as-pdf" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Bifoga PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={pickImageAsync}>
              <MaterialIcons name="photo-library" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Lägg till foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={takePhotoAsync}>
              <MaterialIcons name="photo-camera" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Ta kort</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerAction} onPress={() => setShowDrawingModal(false)}>
              <MaterialIcons name="close" size={18} color="#fff" />
              <Text style={styles.dangerActionText}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
      {/* Date Picker Modal */}
      <Modal visible={showDatePickerModal} transparent animationType="fade" onRequestClose={() => setShowDatePickerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Välj kalibreringsdatum</Text>
            {(() => {
              const now = new Date();
              const currentYear = now.getFullYear();
              const currentMonth = now.getMonth() + 1;
              const currentDay = now.getDate();
              const yearStart = currentYear - YEAR_OFFSET;
              // Only include years up to the current year (no future years)
              const years = Array.from({ length: (currentYear - yearStart + 1) }, (_, i) => yearStart + i);
              const yearIndex = Math.max(0, years.indexOf(tempYear || currentYear));
              const monthIndex = Math.max(0, (tempMonth || currentMonth) - 1);
              const dayIndex = Math.max(0, (tempDay || currentDay) - 1);
              const monthsBase = Array.from({ length: 12 }, (_, i) => i + 1);
              const monthsWrap = [...monthsBase, ...monthsBase, ...monthsBase, ...monthsBase, ...monthsBase];
              const monthsCenterStart = monthsBase.length * 2;
              const monthsInitIdx = monthsCenterStart + monthIndex;
              // Effective selection used for bounds
              const effYear = tempYear || currentYear;
              const effMonth = tempMonth || currentMonth;
              let dcount = daysInMonth(effYear, effMonth);
              // If selecting current year and current month, limit days to currentDay
              if (effYear === currentYear && effMonth === currentMonth) {
                dcount = Math.min(dcount, currentDay);
              }
              const daysBase = Array.from({ length: dcount }, (_, i) => i + 1);
              const daysWrap = [...daysBase, ...daysBase, ...daysBase, ...daysBase, ...daysBase];
              const daysCenterStart = dcount * 2;
              const daysInitIdx = daysCenterStart + dayIndex;
              return (
                <View>
                  <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#263238', fontWeight: '700' }}>År</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#263238', fontWeight: '700' }}>Månad</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ color: '#263238', fontWeight: '700' }}>Dag</Text>
                    </View>
                  </View>
                  <View style={{ position: 'relative', height: VIEWPORT_HEIGHT }}>
                    <View style={{ flexDirection: 'row', gap: 12, height: '100%' }}>
                      {/* Year scroll */}
                      <View style={{ flex: 1 }}>
                        <ScrollView
                          style={{ height: '100%' }}
                          contentOffset={{ y: yearIndex * ITEM_HEIGHT }}
                          snapToInterval={ITEM_HEIGHT}
                          decelerationRate="fast"
                          showsVerticalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => {
                            const yoff = e.nativeEvent.contentOffset.y;
                            let idx = Math.round(yoff / ITEM_HEIGHT);
                            idx = Math.max(0, Math.min(idx, years.length - 1));
                            const ySel = years[idx];
                            setTempYear(ySel);
                          }}
                        >
                          <View style={{ height: SPACER }} />
                          {years.map((y) => (
                            <TouchableOpacity key={y} style={[styles.modalOption, { height: ITEM_HEIGHT, paddingVertical: 0, marginTop: 0, justifyContent: 'center' }, tempYear === y && { borderColor: PRIMARY, backgroundColor: '#E8F4F8' }]} onPress={() => setTempYear(y)}>
                              <Text style={[styles.modalOptionText, tempYear === y && { fontWeight: '700', color: PRIMARY }]}>{y}</Text>
                            </TouchableOpacity>
                          ))}
                          <View style={{ height: SPACER }} />
                        </ScrollView>
                      </View>
                      {/* Month scroll (wrap) */}
                      <View style={{ flex: 1 }}>
                        <ScrollView
                          style={{ height: '100%' }}
                          contentOffset={{ y: monthsInitIdx * ITEM_HEIGHT }}
                          snapToInterval={ITEM_HEIGHT}
                          decelerationRate="fast"
                          showsVerticalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => {
                            const yoff = e.nativeEvent.contentOffset.y;
                            const idx = Math.round(yoff / ITEM_HEIGHT);
                            let mVal = ((idx % 12) + 12) % 12 + 1;
                            const effYearSel = tempYear || currentYear;
                            // Clamp month if selecting current year
                            if (effYearSel === currentYear && mVal > currentMonth) {
                              mVal = currentMonth;
                            }
                            setTempMonth(mVal);
                            let dmax = daysInMonth(effYearSel, mVal);
                            if (effYearSel === currentYear && mVal === currentMonth) {
                              dmax = Math.min(dmax, currentDay);
                            }
                            if ((tempDay || currentDay) > dmax) setTempDay(dmax);
                          }}
                        >
                          <View style={{ height: SPACER }} />
                          {monthsWrap.map((m, i) => (
                            <TouchableOpacity
                              key={`m-${i}`}
                              style={[
                                styles.modalOption,
                                { height: ITEM_HEIGHT, paddingVertical: 0, marginTop: 0, justifyContent: 'center' },
                                (i === monthsCenterStart + (tempMonth ? tempMonth - 1 : monthIndex)) && { borderColor: PRIMARY, backgroundColor: '#E8F4F8' }
                              ]}
                              onPress={() => {
                                const effYearSel = tempYear || currentYear;
                                const mSel = (effYearSel === currentYear && m > currentMonth) ? currentMonth : m;
                                setTempMonth(mSel);
                                let dmax = daysInMonth(effYearSel, mSel);
                                if (effYearSel === currentYear && mSel === currentMonth) {
                                  dmax = Math.min(dmax, currentDay);
                                }
                                if ((tempDay || currentDay) > dmax) setTempDay(dmax);
                              }}
                            >
                              <Text style={[styles.modalOptionText, (i === monthsCenterStart + (tempMonth ? tempMonth - 1 : monthIndex)) && { fontWeight: '700', color: PRIMARY }]}>{pad2(m)}</Text>
                            </TouchableOpacity>
                          ))}
                          <View style={{ height: SPACER }} />
                        </ScrollView>
                      </View>
                      {/* Day scroll (wrap) */}
                      <View style={{ flex: 1 }}>
                        <ScrollView
                          style={{ height: '100%' }}
                          contentOffset={{ y: daysInitIdx * ITEM_HEIGHT }}
                          snapToInterval={ITEM_HEIGHT}
                          decelerationRate="fast"
                          showsVerticalScrollIndicator={false}
                          onMomentumScrollEnd={(e) => {
                            const yoff = e.nativeEvent.contentOffset.y;
                            const idx = Math.round(yoff / ITEM_HEIGHT);
                            const dVal = ((idx % dcount) + dcount) % dcount + 1;
                            setTempDay(dVal);
                          }}
                        >
                          <View style={{ height: SPACER }} />
                          {daysWrap.map((d, i) => (
                            <TouchableOpacity key={`d-${i}`} style={[styles.modalOption, { height: ITEM_HEIGHT, paddingVertical: 0, marginTop: 0, justifyContent: 'center' }, (i === daysCenterStart + ((tempDay ? tempDay : dayIndex + 1) - 1)) && { borderColor: PRIMARY, backgroundColor: '#E8F4F8' }]} onPress={() => setTempDay(d)}>
                              <Text style={[styles.modalOptionText, (i === daysCenterStart + ((tempDay ? tempDay : dayIndex + 1) - 1)) && { fontWeight: '700', color: PRIMARY }]}>{pad2(d)}</Text>
                            </TouchableOpacity>
                          ))}
                          <View style={{ height: SPACER }} />
                        </ScrollView>
                      </View>
                    </View>
                    {/* Single center guide bar across all columns */}
                    <View style={{ position: 'absolute', left: 0, right: 0, top: VIEWPORT_HEIGHT / 2 - 1, height: 2, backgroundColor: PRIMARY, opacity: 0.25 }} />
                  </View>
                </View>
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[styles.successAction, { width: '100%', justifyContent: 'center' }]}
                  onPress={() => {
                    if (tempYear && tempMonth && tempDay) {
                      const ddm = daysInMonth(tempYear, tempMonth);
                      const safeDay = Math.min(tempDay, ddm);
                      // Block future dates
                      const today = new Date(); today.setHours(0,0,0,0);
                      const chosen = new Date(tempYear, (tempMonth || 1) - 1, safeDay || 1); chosen.setHours(0,0,0,0);
                      if (chosen.getTime() > today.getTime()) {
                        Alert.alert('Ogiltigt datum', 'Du kan inte välja ett datum i framtiden.');
                        return;
                      }
                      const next = `${tempYear}-${pad2(tempMonth)}-${pad2(safeDay)}`;
                      setCalibrationDate(next);
                      setShowDatePickerModal(false);
                    }
                  }}
                  accessibilityLabel="Bekräfta datum (Klar)"
                >
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.successActionText}>Klar</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                {/* Okänt datum-knapp (gul, kompakt, triangelikon) */}
                <TouchableOpacity
                  style={[
                    styles.modalOptionSecondary,
                    {
                      marginTop: 0,
                      width: '100%',
                      justifyContent: 'center',
                      paddingHorizontal: 6,
                      backgroundColor: '#FBC02D',
                      borderColor: '#F9A825',
                      gap: 6,
                    },
                  ]}
                  onPress={() => { setCalibrationDate('Okänt'); setShowDatePickerModal(false); }}
                  accessibilityLabel="Kalibreringsdatum okänt"
                >
                  <MaterialIcons name="warning" size={18} color="#263238" />
                  <Text style={[styles.modalOptionText, { color: '#263238', fontWeight: '700', fontSize: 13 }]}>Okänt</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[
                    styles.modalCancel,
                    {
                      marginTop: 0,
                      width: '100%',
                      justifyContent: 'center',
                      backgroundColor: '#D32F2F',
                      borderColor: '#D32F2F',
                    },
                  ]}
                  onPress={() => setShowDatePickerModal(false)}
                  accessibilityLabel="Avbryt datumval"
                >
                  <MaterialIcons name="close" size={18} color="#fff" />
                  <Text style={[styles.modalCancelText, { color: '#fff' }]}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* RF Value Picker Modal */}
      <Modal visible={showMeasurementPickerModal} transparent animationType="fade" onRequestClose={() => setShowMeasurementPickerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Välj RF värde</Text>
            {(() => {
              const min = 1; // RF cannot be 0%
              const max = 100;
              const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
              const initIdx = Math.max(0, Math.min(values.indexOf(tempMeasurementValue), values.length - 1));
              return (
                <View>
                  <View style={{ position: 'relative', height: VIEWPORT_HEIGHT }}>
                    <ScrollView
                      style={{ height: '100%' }}
                      contentOffset={{ y: initIdx * ITEM_HEIGHT }}
                      snapToInterval={ITEM_HEIGHT}
                      decelerationRate="fast"
                      showsVerticalScrollIndicator={false}
                      onMomentumScrollEnd={(e) => {
                        const yoff = e.nativeEvent.contentOffset.y;
                        let idx = Math.round(yoff / ITEM_HEIGHT);
                        idx = Math.max(0, Math.min(idx, values.length - 1));
                        setTempMeasurementValue(values[idx]);
                      }}
                    >
                      <View style={{ height: SPACER }} />
                      {values.map((v) => (
                        <TouchableOpacity key={`rf-${v}`} style={[styles.modalOption, { height: ITEM_HEIGHT, paddingVertical: 0, marginTop: 0, justifyContent: 'center' }, tempMeasurementValue === v && { borderColor: PRIMARY, backgroundColor: '#E8F4F8' }]} onPress={() => setTempMeasurementValue(v)}>
                          <Text style={[styles.modalOptionText, tempMeasurementValue === v && { fontWeight: '700', color: PRIMARY }]}>{v} %</Text>
                        </TouchableOpacity>
                      ))}
                      <View style={{ height: SPACER }} />
                    </ScrollView>
                    {/* Center guide bar */}
                    <View style={{ position: 'absolute', left: 0, right: 0, top: VIEWPORT_HEIGHT / 2 - 1, height: 2, backgroundColor: PRIMARY, opacity: 0.25 }} />
                  </View>
                </View>
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[styles.successAction, { width: '100%', justifyContent: 'center' }]}
                  onPress={() => {
                    if (typeof measurementPickerIndex === 'number') {
                      updateRow(measurementPickerIndex, { value: String(tempMeasurementValue) });
                    }
                    setShowMeasurementPickerModal(false);
                    setMeasurementPickerIndex(null);
                  }}
                  accessibilityLabel="Bekräfta RF värde (Klar)"
                >
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.successActionText}>Klar</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[
                    styles.modalCancel,
                    {
                      marginTop: 0,
                      width: '100%',
                      justifyContent: 'center',
                      backgroundColor: '#D32F2F',
                      borderColor: '#D32F2F',
                    },
                  ]}
                  onPress={() => { setShowMeasurementPickerModal(false); setMeasurementPickerIndex(null); }}
                  accessibilityLabel="Avbryt RF värde"
                >
                  <MaterialIcons name="close" size={18} color="#fff" />
                  <Text style={[styles.modalCancelText, { color: '#fff' }]}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
      {/* Gränsvärde Picker Modal */}
      <Modal visible={showReferencePickerModal} transparent animationType="fade" onRequestClose={() => setShowReferencePickerModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Välj gränsvärde</Text>
            {(() => {
              const min = 0;
              const max = 100;
              const values = Array.from({ length: max - min + 1 }, (_, i) => min + i);
              const initIdx = Math.max(0, Math.min(values.indexOf(tempReference), values.length - 1));
              return (
                <View>
                  <View style={{ position: 'relative', height: VIEWPORT_HEIGHT }}>
                    <ScrollView
                      ref={referenceScrollRef}
                      style={{ height: '100%' }}
                      contentOffset={{ y: initIdx * ITEM_HEIGHT }}
                      snapToInterval={ITEM_HEIGHT}
                      decelerationRate="fast"
                      showsVerticalScrollIndicator={false}
                      onMomentumScrollEnd={(e) => {
                        const yoff = e.nativeEvent.contentOffset.y;
                        let idx = Math.round(yoff / ITEM_HEIGHT);
                        idx = Math.max(0, Math.min(idx, values.length - 1));
                        setTempReference(values[idx]);
                      }}
                    >
                      <View style={{ height: SPACER }} />
                      {values.map((v) => (
                        <TouchableOpacity key={`ref-${v}`} style={[styles.modalOption, { height: ITEM_HEIGHT, paddingVertical: 0, marginTop: 0, justifyContent: 'center' }, tempReference === v && { borderColor: PRIMARY, backgroundColor: '#E8F4F8' }]} onPress={() => setTempReference(v)}>
                          <Text style={[styles.modalOptionText, tempReference === v && { fontWeight: '700', color: PRIMARY }]}>{v} %</Text>
                        </TouchableOpacity>
                      ))}
                      <View style={{ height: SPACER }} />
                    </ScrollView>
                    {/* Center guide bar */}
                    <View style={{ position: 'absolute', left: 0, right: 0, top: VIEWPORT_HEIGHT / 2 - 1, height: 2, backgroundColor: PRIMARY, opacity: 0.25 }} />
                  </View>
                </View>
              );
            })()}
            <View style={{ flexDirection: 'row', gap: 12, marginTop: 12 }}>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[styles.successAction, { width: '100%', justifyContent: 'center' }]}
                  onPress={() => { setReference(String(tempReference)); setShowReferencePickerModal(false); }}
                  accessibilityLabel="Bekräfta gränsvärde (Klar)"
                >
                  <MaterialIcons name="check" size={18} color="#fff" />
                  <Text style={styles.successActionText}>Klar</Text>
                </TouchableOpacity>
              </View>
              <View style={{ flex: 1 }}>
                <TouchableOpacity
                  style={[
                    styles.modalCancel,
                    {
                      marginTop: 0,
                      width: '100%',
                      justifyContent: 'center',
                      backgroundColor: '#D32F2F',
                      borderColor: '#D32F2F',
                    },
                  ]}
                  onPress={() => setShowReferencePickerModal(false)}
                  accessibilityLabel="Avbryt gränsvärde"
                >
                  <MaterialIcons name="close" size={18} color="#fff" />
                  <Text style={[styles.modalCancelText, { color: '#fff' }]}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* Förhandsvisning i stor vy */}
      <Modal visible={!!previewItem} transparent animationType="fade" onRequestClose={closePreview}>
        <View style={styles.previewBackdrop}>
          <View style={styles.previewCard} onLayout={(e) => {
            try {
              const w = e.nativeEvent.layout.width;
              if (w && Math.abs(w - previewPageWidth) > 2) {
                setPreviewPageWidth(w);
              }
            } catch {}
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={styles.modalTitle}>{previewItem?.title || 'Förhandsvisning'}</Text>
              <TouchableOpacity style={styles.modalCancel} onPress={closePreview}>
                <MaterialIcons name="close" size={18} color="#263238" />
                <Text style={styles.modalCancelText}>Stäng</Text>
              </TouchableOpacity>
            </View>
            <View style={{ height: PREVIEW_HEIGHT, overflow: 'hidden' }}>
            <ScrollView
              horizontal
              pagingEnabled
              snapToInterval={previewPageWidth}
              snapToAlignment="center"
              decelerationRate="fast"
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
              const x = e.nativeEvent.contentOffset.x;
              const w = previewPageWidth;
              const idx = Math.round(x / (w || 1));
              if (idx !== previewIndex) setPreviewIndex(idx);
            }}
              scrollEventThrottle={16}
            >
              {previewItems.map((it, i) => (
                <View key={`pv-${i}`} style={{ width: previewPageWidth }}>
                  {it.type === 'image' && it.uri ? (
                    <Image
                      source={{ uri: normalizeUri(it.uri) }}
                      style={{ width: previewPageWidth, height: PREVIEW_HEIGHT, borderRadius: 10 }}
                      resizeMode="contain"
                      onError={() => console.warn('Preview image failed to load', it)}
                      onLoad={() => {}
                      }
                    />
                  ) : (
                    <View style={{ alignItems: 'center', padding: 20 }}>
                      <MaterialIcons name="insert-drive-file" size={36} color="#666" />
                      <Text style={{ color: '#666', marginTop: 8 }}>Kan inte förhandsvisa den här filtypen.</Text>
                    </View>
                  )}
                </View>
              ))}
            </ScrollView>
            </View>
            {/* Delete button under the photo */}
            {previewItems.length > 0 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 12 }}>
                <TouchableOpacity
                  style={[styles.dangerAction, { paddingVertical: 10, paddingHorizontal: 14 }]}
                  onPress={() => {
                    try {
                      const current = previewItems[previewIndex];
                      if (!current) return;
                      Alert.alert(
                        'Ta bort foto?',
                        'Är du säker på att du vill ta bort det här fotot?',
                        [
                          { text: 'Avbryt', style: 'cancel' },
                          { text: 'Ta bort', style: 'destructive', onPress: () => {
                            try {
                              if (current.source === 'measurement' && typeof current.mIndex === 'number') {
                                const mi = current.mIndex;
                                const next = measurements.slice();
                                const m = next[mi];
                                if (!m) return;
                                if (current.kind === 'photo') {
                                  next[mi] = { ...m, photos: (m.photos || []).filter(p => p.uri !== current.uri) };
                                } else {
                                  next[mi] = { ...m, attachments: (m.attachments || []).filter(a => a.uri !== current.uri) };
                                }
                                setMeasurements(next);
                              } else if (current.source === 'global') {
                                setAttachments(prev => prev.filter(a => a.uri !== current.uri));
                              }
                              const revised = previewItems.filter((_, i) => i !== previewIndex);
                              setPreviewItems(revised);
                              if (revised.length === 0) {
                                closePreview();
                              } else {
                                setPreviewIndex(Math.max(0, previewIndex - 1));
                                setPreviewItem(revised[Math.max(0, previewIndex - 1)]);
                              }
                              Alert.alert('Raderat', 'Filen har tagits bort.');
                            } catch (e) {
                              Alert.alert('Kunde inte radera', String(e?.message || e));
                            }
                          } }
                        ]
                      );
                    } catch (e) {
                      Alert.alert('Kunde inte radera', String(e?.message || e));
                    }
                  }}
                  accessibilityLabel="Ta bort aktuell bild"
                >
                  <MaterialIcons name="delete" size={18} color="#fff" />
                  <Text style={styles.dangerActionText}>Ta bort</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {previewItems.length > 1 ? (
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 8 }}>
                <Text style={{ color: '#666' }}>{previewIndex + 1} / {previewItems.length}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* Modal: Bifoga per mätpunkt */}
      <Modal visible={measureAttachIndex !== null} transparent animationType="fade" onRequestClose={closeMeasureAttach}>
        <TouchableOpacity style={styles.modalBackdrop} activeOpacity={1} onPress={closeMeasureAttach}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Bifoga till mätpunkt #{measureAttachIndex !== null ? measurements[measureAttachIndex]?.id : ''}</Text>
            <TouchableOpacity style={styles.modalOption} onPress={() => { const i = measureAttachIndex; attachPdfForMeasurement(i); }}>
              <MaterialIcons name="picture-as-pdf" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Bifoga PDF</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { const i = measureAttachIndex; closeMeasureAttach(); pickImageForMeasurement(i); }}>
              <MaterialIcons name="photo-library" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Lägg till foto</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.modalOption} onPress={() => { const i = measureAttachIndex; takePhotoForMeasurement(i); }}>
              <MaterialIcons name="photo-camera" size={18} color="#888" />
              <Text style={styles.modalOptionText}>Ta kort</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.dangerAction} onPress={closeMeasureAttach}>
              <MaterialIcons name="close" size={18} color="#fff" />
              <Text style={styles.dangerActionText}>Avbryt</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Kamera-overlay fallback */}
      <Modal visible={showCameraOverlay} transparent animationType="fade" onRequestClose={() => setShowCameraOverlay(false)}>
        <View style={styles.overlayBackdrop}>
          <View style={styles.overlayCard}>
            <Text style={styles.modalTitle}>Kamera</Text>
            <View style={{ height: 300, borderRadius: 10, overflow: 'hidden', backgroundColor: '#000' }}>
              <CameraView
                style={{ flex: 1 }}
                ref={(ref) => setCameraRef(ref)}
                onCameraReady={() => setCameraReady(true)}
              />
            </View>
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 12, justifyContent: 'center' }}>
              {/* Primary left, Cancel right */}
              <TouchableOpacity style={styles.primaryAction} onPress={captureWithOverlay} disabled={!cameraReady}>
                <MaterialIcons name="photo-camera" size={20} color="#fff" />
                <Text style={styles.primaryActionText}>Ta foto</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.dangerAction} onPress={() => { setShowCameraOverlay(false); setCameraTargetIndex(null); }}>
                <MaterialIcons name="close" size={18} color="#fff" />
                <Text style={styles.dangerActionText}>Avbryt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: PRIMARY, marginBottom: 8 },
  subInfo: { fontSize: 14, color: '#666', marginBottom: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginBottom: 8 },
  bodyText: { fontSize: 15, color: '#222' },
  participantRow: { paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#EEE' },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  checkbox: {
    width: 22, height: 22, borderRadius: 4, borderWidth: 2, borderColor: PRIMARY,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  checkboxChecked: { backgroundColor: PRIMARY },
  checkboxMark: { color: '#fff', fontWeight: '700' },
  checkLabel: { fontSize: 15, color: '#222' },
  noteText: { fontSize: 13, color: '#444', marginTop: 2 },
  // Fuktmätning
  input: {
    backgroundColor: '#fff',
    borderColor: '#E0E0E0',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 10,
    height: 42,
    fontSize: 15,
    marginBottom: 8,
    color: '#263238'
  },
  inputError: {
    borderColor: '#D32F2F',
    borderWidth: 2,
  },
  inputIconRight: {
    position: 'absolute',
    right: 10,
    top: '50%',
    marginTop: -9,
  },
  measureRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12
  },
  measureRowFilled: { borderWidth: 0.5, borderColor: '#B3E5FC', borderRadius: 10, padding: 6 },
  measureIdCol: { width: 28, alignItems: 'center', justifyContent: 'flex-start' },
  measureId: { color: '#909090', fontWeight: '700', textAlign: 'center', marginTop: 8 },
  iconBtn: { backgroundColor: '#D32F2F', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 },
  rowSecondaryBtn: { backgroundColor: '#E9ECEF', borderWidth: 1, borderColor: '#D0D5DA', paddingHorizontal: 10, paddingVertical: 10, borderRadius: 8 },
  addRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  primaryAction: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignSelf: 'flex-start' },
  primaryActionText: { color: '#fff', fontWeight: '700' }
  ,
  successAction: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#2E7D32', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignSelf: 'flex-start' },
  successActionText: { color: '#fff', fontWeight: '700' },
  dangerAction: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#D32F2F', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10, alignSelf: 'flex-start' },
  dangerActionText: { color: '#fff', fontWeight: '700' },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderColor: PRIMARY, backgroundColor: '#F5F8FA', paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  secondaryActionText: { color: PRIMARY, fontWeight: '700' },
  selectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', paddingVertical: 10, paddingHorizontal: 12 },
  selectRowText: { fontSize: 15, color: '#263238', flexShrink: 1 },
  // Measure type modal styles
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modalCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: '85%', borderWidth: 1, borderColor: '#E5E8EB', shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, elevation: 4 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#263238', marginBottom: 8, textAlign: 'center' },
  modalGroup: { backgroundColor: '#F7FAFC', borderRadius: 10, borderWidth: 1, borderColor: '#E7E7E7', padding: 10, marginTop: 8 },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalGroupTitle: { fontSize: 14, fontWeight: '700', color: '#263238', marginBottom: 6 },
  modalOption: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  modalOptionSecondary: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E9ECEF', borderRadius: 10, borderWidth: 1, borderColor: '#D0D5DA', paddingVertical: 10, paddingHorizontal: 12, marginTop: 8 },
  topRowBtn: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E9ECEF', borderRadius: 10, borderWidth: 1, borderColor: '#D0D5DA', paddingVertical: 10, paddingHorizontal: 12 },
  modalOptionText: { fontSize: 15, color: '#263238', flexShrink: 1 },
  modalCancel: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#E9ECEF', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, marginTop: 12, alignSelf: 'center' },
  modalCancelText: { color: '#263238', fontWeight: '700' },
  infoBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F4F8', borderColor: '#CCE7EF', borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  infoBannerText: { color: '#0a7ea4' }
  ,
  // Overlay & preview styles
  overlayBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  overlayCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: '85%', borderWidth: 1, borderColor: '#E5E8EB' },
  previewBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  previewCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, minWidth: '85%', maxWidth: 640, maxHeight: CARD_MAX_HEIGHT, borderWidth: 1, borderColor: '#E5E8EB' },
  thumb: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0' },
  thumbPdf: { width: 48, height: 48, borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', alignItems: 'center', justifyContent: 'center', backgroundColor: '#F7FAFC' }
  ,
  stackThumbWrap: { width: 56, height: 56, position: 'relative' },
  stackThumb: { width: 56, height: 56, borderRadius: 10, borderWidth: 1, borderColor: '#E0E0E0' },
  stackLayer: { position: 'absolute', width: 56, height: 56, borderRadius: 10, backgroundColor: '#F0F4F8', borderWidth: 1, borderColor: '#DFE3E8' },
  stackBadge: { position: 'absolute', right: -6, top: -6, backgroundColor: '#263238', borderRadius: 10, paddingHorizontal: 6, paddingVertical: 2 },
  stackBadgeText: { color: '#fff', fontSize: 11, fontWeight: '700' }
});
