




import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';

// import BottomSheet from '@gorhom/bottom-sheet';
import { Dimensions, Image, Modal, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

import 'react-native-get-random-values';
import Svg, { Polygon, Text as SvgText } from 'react-native-svg';
import Ionicons from 'react-native-vector-icons/Ionicons';
import { v4 as uuidv4 } from 'uuid';
import NativeSignatureModal from './NativeSignatureModal';

export default function BaseControlForm({
  project,
  participants = [],
  date,
  weatherOptions = [],
  checklistConfig = [],
  controlType = '',
  labels = {},
  onSave,
  onSaveDraft,
  initialValues = {},
  hideWeather = false,
}) {
  // State för deltagar-modalens fält (måste ligga här!)
  const [participantName, setParticipantName] = useState('');
  const [participantCompany, setParticipantCompany] = useState('');
  const [participantRole, setParticipantRole] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  // Refs för TextInput-fokus i deltagar-modal (måste ligga här!)
  const nameRef = useRef();
  const companyRef = useRef();
  const roleRef = useRef();
  const phoneRef = useRef();
  // Add state for draftId and selectedWeather
  // const bottomSheetRef = useReactRef(null);
  // The misplaced Modal and logic block above was removed because it must be inside a component or function, not at the top level.
  // If you want to use this Modal, move it inside your component's return statement or a function.
  const route = useRoute();
  const navigation = useNavigation();
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  // Ref to store blocked navigation event
  const blockedNavEvent = useRef(null);

  // Add beforeRemove event to block navigation if dirty
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirty) return; // Allow navigation if not dirty
      // Prevent default behavior of leaving the screen
      e.preventDefault();
      blockedNavEvent.current = e;
      setShowBackConfirm(true);
    });
    return unsubscribe;
  }, [navigation, isDirty]);
  const [photoModal, setPhotoModal] = useState({ visible: false, uris: [], index: 0 });
  // Only initialize checklist ONCE, never re-initialize from checklistConfig after mount
  // Checklist state: restore from route.params if present, else initialize
  const [checklist, setChecklist] = useState(() => {
    // Always prefer params.savedChecklist if present, else checklistConfig
    let raw = [];
    if (route.params && route.params.savedChecklist) {
      raw = route.params.savedChecklist;
    } else if (Array.isArray(checklistConfig)) {
      raw = checklistConfig.map(section => ({
        label: section.label,
        points: Array.isArray(section.points) ? [...section.points] : [],
        statuses: Array(Array.isArray(section.points) ? section.points.length : 0).fill(null),
        photos: Array(Array.isArray(section.points) ? section.points.length : 0).fill([]),
      }));
    }
    // Robustify: ensure every section has valid points, statuses, photos arrays
    return (raw || []).map(section => {
      const points = Array.isArray(section.points) ? section.points : [];
      const statuses = Array.isArray(section.statuses) && Array.isArray(points) && section.statuses.length === points.length
        ? section.statuses
        : Array(Array.isArray(points) ? points.length : 0).fill(null);
      let photos = Array.isArray(section.photos) && Array.isArray(points) && section.photos.length === points.length
        ? section.photos
        : Array(Array.isArray(points) ? points.length : 0).fill(null).map(() => []);
      // Ensure every photos[i] is an array
      photos = photos.map(arr => Array.isArray(arr) ? arr : (arr ? [arr] : []));
      return {
        label: section.label,
        points,
        statuses,
        photos,
      };
    });
  });

  // Track initial state for dirty checking
  const initialChecklist = useMemo(() => {
    if (Array.isArray(checklistConfig)) {
      return checklistConfig.map(section => ({
        label: section.label,
        points: Array.isArray(section.points) ? [...section.points] : [],
        statuses: Array(section.points.length).fill(null),
        photos: Array(section.points.length).fill([]),
      }));
    }
    return [];
  }, [checklistConfig]);

  const initialParticipants = useMemo(() => participants, [participants]);
  const initialDate = useMemo(() => date || initialValues.date || '', [date, initialValues.date]);
  const initialDeliveryDesc = useMemo(() => initialValues.deliveryDesc || '', [initialValues.deliveryDesc]);
  const initialGeneralNote = useMemo(() => initialValues.generalNote || '', [initialValues.generalNote]);

  // Helper to compare arrays/objects shallowly
  function shallowEqual(a, b) {
    if (a === b) return true;
    if (!a || !b) return false;
    if (Array.isArray(a) && Array.isArray(b)) {
      if (a.length !== b.length) return false;
      for (let i = 0; i < a.length; i++) {
        if (!shallowEqual(a[i], b[i])) return false;
      }
      return true;
    }
    if (typeof a === 'object' && typeof b === 'object') {
      const aKeys = Object.keys(a);
      const bKeys = Object.keys(b);
      if (aKeys.length !== bKeys.length) return false;
      for (let key of aKeys) {
        if (!shallowEqual(a[key], b[key])) return false;
      }
      return true;
    }
    return a === b;
  }

  // Local participants state (initialize from participants prop)
  const [localParticipants, setLocalParticipants] = useState(participants);
  // Dirty state: true if any field differs from initial
  const isDirty = useMemo(() => {
    if (!shallowEqual(localParticipants, initialParticipants)) return true;
    if (!shallowEqual(checklist, initialChecklist)) return true;
    if (dateValue !== initialDate) return true;
    if (deliveryDesc !== initialDeliveryDesc) return true;
    if (generalNote !== initialGeneralNote) return true;
    return false;
  }, [localParticipants, checklist, dateValue, deliveryDesc, generalNote, initialParticipants, initialChecklist, initialDate, initialDeliveryDesc, initialGeneralNote]);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const windowWidth = Dimensions.get('window').width;
  const startX = useRef(0);
  const handleTouchStart = (e) => {
    startX.current = e.nativeEvent.pageX;
  };
  const handleTouchEnd = (e, uris, index) => {
    const dx = e.nativeEvent.pageX - startX.current;
    if (dx > 40 && index > 0) {
      setPhotoModal((m) => ({ ...m, index: m.index - 1 }));
    } else if (dx < -40 && index < uris.length - 1) {
      setPhotoModal((m) => ({ ...m, index: m.index + 1 }));
    }
  };

  // Handle cameraResult photo adding logic in a useEffect
    // Save checklist state to route.params before navigating to CameraCapture
    const handleNavigateToCamera = (sectionIdx, pointIdx, project) => {
      // Always pass the current checklist state to CameraCapture
      navigation.navigate('CameraCapture', {
        sectionIdx,
        pointIdx,
        project,
        savedChecklist: checklist
      });
    };
  useEffect(() => {
    const cameraResult = route.params?.cameraResult;
    if (cameraResult) {
      const { uri, sectionIdx, pointIdx } = cameraResult;
      if (uri && sectionIdx !== undefined && pointIdx !== undefined) {
        setChecklist(prev => prev.map((section, sIdx) => {
          if (sIdx !== sectionIdx) return section;
          // Defensiv: säkerställ points och photos alltid är arrays av rätt längd
          const points = Array.isArray(section.points) ? section.points : [];
          let photos = Array.isArray(section.photos) && section.photos.length === points.length
            ? [...section.photos]
            : Array(Array.isArray(points) ? points.length : 0).fill(null).map(() => []);
          // Se till att photos[pointIdx] är en array
          if (!Array.isArray(photos[pointIdx])) photos[pointIdx] = photos[pointIdx] ? [photos[pointIdx]] : [];
          photos[pointIdx] = [...photos[pointIdx], uri];
          return { ...section, photos, points };
        }));
        setExpandedChecklist(prev => prev.includes(sectionIdx) ? prev : [sectionIdx]);
        // Also update savedChecklist in params so it persists if navigating again
        navigation.setParams({ cameraResult: undefined, savedChecklist: checklist });
      }
    }
  }, [route.params?.cameraResult]);
  const [dateValue, setDateValue] = useState(date || initialValues.date || '');
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState('');
  const [deliveryDesc, setDeliveryDesc] = useState(initialValues.deliveryDesc || '');
  const [generalNote, setGeneralNote] = useState(initialValues.generalNote || '');
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [signatureForIndex, setSignatureForIndex] = useState(null);

  // Spara utkast till AsyncStorage (flera per projekt/kontrolltyp)
  const saveDraftControl = async () => {
    try {
      const draft = {
        id: draftId || uuidv4(),
        date: dateValue,
        project,
        weather: selectedWeather,
        participants: localParticipants,
        checklist,
        deliveryDesc,
        generalNote,
        type: controlType,
        savedAt: new Date().toISOString(),
      };
      let arr = [];
      const existing = await AsyncStorage.getItem('draft_controls');
      if (existing) arr = JSON.parse(existing);
      // Ersätt om samma projekt+typ redan finns, annars lägg till
      const idx = arr.findIndex(
        c => c.project?.id === project?.id && c.type === controlType && c.id === draft.id
      );
      if (idx !== -1) {
        arr[idx] = draft;
      } else {
        arr.push(draft);
      }
      await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
    } catch (e) {
      alert('Kunde inte spara utkast: ' + e.message);
    }
  };

  // Spara slutförd kontroll och ta bort ev. utkast
  const handleSave = async () => {
    if (onSave) onSave({
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      checklist,
      deliveryDesc,
      generalNote,
      type: controlType,
    });
    // Ta bort ev. utkast för detta projekt+typ
    try {
      const existing = await AsyncStorage.getItem('draft_controls');
      if (existing) {
        let arr = JSON.parse(existing);
        arr = arr.filter(
          c => !(c.project?.id === project?.id && c.type === controlType)
        );
        await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
      }
    } catch {}
  };

  // Spara utkast
  const handleSaveDraft = async () => {
    await saveDraftControl();
    if (onSaveDraft) onSaveDraft({
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      checklist,
      deliveryDesc,
      generalNote,
      type: controlType,
    });
  };

  // Render
  return (
    <>
      {/* ...ingen testknapp/modal... */}
      {/* Modal för bekräftelse vid tillbaka om formuläret är ändrat */}
      <Modal
        visible={showBackConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setShowBackConfirm(false)}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: 320, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative' }}>
            {/* Close (X) icon in top right */}
            <TouchableOpacity
              onPress={() => setShowBackConfirm(false)}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 6 }}
              accessibilityLabel="Stäng"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#888" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#222', textAlign: 'center', marginTop: 4 }}>Vill du avsluta kontrollen?</Text>
            <Text style={{ fontSize: 15, color: '#222', marginBottom: 28, textAlign: 'center' }}>Du har osparade ändringar. Välj om du vill spara utkast eller radera ändringarna.</Text>
            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent' }}
                onPress={async () => {
                  await saveDraftControl();
                  if (onSaveDraft) onSaveDraft({
                    date: dateValue,
                    project,
                    weather: selectedWeather,
                    participants: localParticipants,
                    checklist,
                    deliveryDesc,
                    generalNote,
                    type: controlType,
                  });
                  setShowBackConfirm(false);
                  if (blockedNavEvent.current) {
                    blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
                    blockedNavEvent.current = null;
                  } else {
                    navigation.goBack();
                  }
                }}
              >
                <Text style={{ color: '#1976D2', fontWeight: 'normal', fontSize: 16 }}>Spara utkast</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#D32F2F', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent' }}
                onPress={() => {
                  setShowBackConfirm(false);
                  if (blockedNavEvent.current) {
                    blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
                    blockedNavEvent.current = null;
                  } else {
                    navigation.goBack();
                  }
                }}
              >
                <Text style={{ color: '#D32F2F', fontWeight: 'normal', fontSize: 16 }}>Radera</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* Modal för bildgranskning med swipe */}
      <Modal
        visible={photoModal.visible}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setPhotoModal({ ...photoModal, visible: false })}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.95)', justifyContent: 'center', alignItems: 'center' }}>
          {photoModal.uris.length > 0 && (
            <View style={{ width: windowWidth, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
              <View style={{
                width: Math.min(windowWidth * 0.92, 420),
                height: Math.min(windowWidth * 0.92, 420),
                maxWidth: 420,
                maxHeight: 420,
                borderRadius: 18,
                backgroundColor: '#222',
                alignItems: 'center',
                justifyContent: 'center',
                overflow: 'hidden',
              }}>
                {/* Försök visa rätt aspect ratio */}
                <Image
                  source={{ uri: photoModal.uris[photoModal.index] }}
                  style={(() => {
                    // Om vi i framtiden spar orientation i uri-objektet, kan vi använda det här
                    // Just nu: defaulta till 4:3 (stående)
                    // Om du vill spara orientation i checklist/photos, kan du använda det här
                    // const orientation = ...
                    // const aspectRatio = orientation === 'landscape' ? 3/4 : 4/3;
                    // return { width: '100%', aspectRatio, resizeMode: 'contain' };
                    return {
                      width: '100%',
                      aspectRatio: 4/3,
                      resizeMode: 'contain',
                      backgroundColor: '#111',
                    };
                  })()}
                  onTouchStart={handleTouchStart}
                  onTouchEnd={(e) => handleTouchEnd(e, photoModal.uris, photoModal.index)}
                />
              </View>
              <View style={{ flexDirection: 'row', marginTop: 18, alignItems: 'center', justifyContent: 'center' }}>
                {photoModal.uris.map((uri, idx) => (
                  <View key={`photo-dot-${idx}-${uri ? uri.substring(uri.length-8) : 'empty'}`} style={{ width: 10, height: 10, borderRadius: 5, margin: 4, backgroundColor: idx === photoModal.index ? '#fff' : '#888' }} />
                ))}
              </View>
              {/* Action buttons under image */}
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 32 }}>
                <TouchableOpacity
                  onPress={handleDeletePhoto}
                  accessibilityLabel="Ta bort bild"
                  style={{ marginHorizontal: 32, alignItems: 'center' }}
                >
                  <Ionicons name="trash" size={40} color="#D32F2F" />
                  <Text style={{ color: '#D32F2F', fontSize: 14, marginTop: 4 }}>Ta bort</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setPhotoModal({ ...photoModal, visible: false })}
                  accessibilityLabel="Stäng"
                  style={{ marginHorizontal: 32, alignItems: 'center' }}
                >
                  <Ionicons name="close-circle" size={40} color="#fff" />
                  <Text style={{ color: '#fff', fontSize: 14, marginTop: 4 }}>Stäng</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>
      </Modal>
      <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1 }}>
        {/* Project Info and meta */}
        <View style={{ padding: 16, paddingBottom: 0 }}>
        {/* Project number and name */}
        {project && (
          <>
            <Text style={{ fontSize: 28, color: '#222', fontWeight: 'bold', marginBottom: 8, letterSpacing: 0.2 }}>
              {project.id ? project.id : ''}{project.id && project.name ? ' – ' : ''}{project.name ? project.name : ''}
            </Text>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 10 }} />
          </>
        )}
        {/* Date row - long press to edit */}
        {/* Date row with icon, text, and edit button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>
              {(dateValue ? new Date(dateValue) : new Date()).toLocaleDateString('sv-SE')} • Vecka {(() => {
                const d = dateValue ? new Date(dateValue) : new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
                const week1 = new Date(d.getFullYear(), 0, 4);
                return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
              })()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setTempDate(dateValue ? new Date(dateValue).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
              setShowDateModal(true);
            }}
            style={{ marginLeft: 12, padding: 4 }}
            activeOpacity={0.7}
            accessibilityLabel="Ändra datum"
          >
            <Ionicons name="create-outline" size={22} color="#888" />
          </TouchableOpacity>
        </View>
        {/* Soft horizontal divider under date */}
        <View style={{ height: 1, backgroundColor: '#f0f0f0', width: '100%', marginBottom: 12, marginTop: 0 }} />
        {/* Date edit modal */}
        {showDateModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
            <View style={{ height: 500 }} />
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 280, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
              {/* Close (X) icon in top right */}
              <TouchableOpacity 
                onPress={() => setShowDateModal(false)} 
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, padding: 4 }} 
                accessibilityLabel="Stäng"
                hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
              >
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Ändra datum</Text>
              <TextInput
                value={tempDate}
                onChangeText={text => {
                  // Only allow numbers and hyphens, auto-insert hyphens for yyyy-mm-dd
                  let cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
                  let formatted = cleaned;
                  if (cleaned.length > 4) formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
                  if (cleaned.length > 6) formatted = formatted.slice(0, 7) + '-' + formatted.slice(7);
                  setTempDate(formatted);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: '#bbb',
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 16,
                  color: '#222',
                  backgroundColor: '#fafafa',
                  width: 160,
                  marginBottom: 8
                }}
                placeholder="ÅÅÅÅ-MM-DD"
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
              {/* Red warning if date is in the future */}
              {(() => {
                if (tempDate.length === 10) {
                  const today = new Date();
                  const inputDate = new Date(tempDate);
                  if (!isNaN(inputDate) && inputDate > today) {
                    return <Text style={{ color: '#D32F2F', marginBottom: 8, fontSize: 13 }}>Du kan inte välja ett framtida datum.</Text>;
                  }
                }
                return null;
              })()}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    setDateValue(tempDate);
                    setShowDateModal(false);
                  }}
                  disabled={(() => {
                    if (tempDate.length === 10) {
                      const today = new Date();
                      const inputDate = new Date(tempDate);
                      return isNaN(inputDate) || inputDate > today;
                    }
                    return true;
                  })()}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '400', fontSize: 16, opacity: (() => {
                    if (tempDate.length === 10) {
                      const today = new Date();
                      const inputDate = new Date(tempDate);
                      return (!isNaN(inputDate) && inputDate <= today) ? 1 : 0.4;
                    }
                    return 0.4;
                  })() }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => setShowDateModal(false)}
                >
                  <Text style={{ color: '#D32F2F', fontWeight: '400', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          {/* Divider under participants (should only be in main flow, not modal) */}
          </View>
        )}
        {/* Participants row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Ionicons name="person-outline" size={26} color="#1976D2" style={{ marginRight: 7, marginTop: 2 }} />
            <View>
              <Text style={{ fontSize: 18, color: '#222', fontWeight: '600', marginBottom: 2, marginTop: 4 }}>Deltagare:</Text>
              {localParticipants && localParticipants.length > 0 ? (
                localParticipants.map((p, idx) => {
                  // Use a robust key: if object, try id, else hash the stringified object, else fallback to uuid
                  let key;
                  if (typeof p === 'object' && p !== null) {
                    if (p.id) {
                      key = `participant-${p.id}`;
                    } else {
                      try {
                        key = 'participant-' + btoa(unescape(encodeURIComponent(JSON.stringify(p)))) + '-' + idx;
                      } catch {
                        key = 'participant-' + idx + '-' + uuidv4();
                      }
                    }
                  } else {
                    key = `${p}-${idx}`;
                  }
                  if (typeof p === 'string') {
                    return (
                      <View key={key} style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 6, minWidth: 180 }}>
                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '500' }}>{p}</Text>
                      </View>
                    );
                  } else if (typeof p === 'object' && p !== null) {
                    return (
                      <View key={key} style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 6, minWidth: 180 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '500', marginRight: 8 }}>{p.name || ''}</Text>
                          {p.company ? <Text style={{ fontSize: 16, color: '#555', fontWeight: '400' }}>{p.company}</Text> : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {p.role ? <Text style={{ fontSize: 13, color: '#888', marginRight: 12 }}>{p.role}</Text> : null}
                          {p.phone ? <Text style={{ fontSize: 13, color: '#888' }}>{p.phone}</Text> : null}
                        </View>
                      </View>
                    );
                  }
                  return null;
                })
              ) : null}
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowAddParticipantModal(true)} style={{ padding: 4 }} accessibilityLabel="Lägg till deltagare">
            <Ionicons name="add-circle-outline" size={26} color="#1976D2" />
          </TouchableOpacity>
        </View>
        {/* Divider under participants, before weather */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
                {/* Add Participant Modal */}
        {/* Modal för Lägg till deltagare */}
        {showAddParticipantModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'center', zIndex: 200 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 300, minHeight: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, marginTop: 140 }}>
              {/* Close (X) icon in top right */}
                <TouchableOpacity 
                  onPress={() => setShowAddParticipantModal(false)} 
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, padding: 4 }} 
                  accessibilityLabel="Stäng"
                  hitSlop={{ top: 16, bottom: 16, left: 16, right: 16 }}
                >
                  <Ionicons name="close" size={24} color="#888" />
                </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Lägg till deltagare</Text>
              <TextInput
                value={participantName}
                onChangeText={setParticipantName}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholder="Namn"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => companyRef && companyRef.current && companyRef.current.focus()}
                ref={nameRef}
              />
              <TextInput
                value={participantCompany}
                onChangeText={setParticipantCompany}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholderTextColor="#888"
                placeholder="Företag"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => roleRef && roleRef.current && roleRef.current.focus()}
                ref={companyRef}
              />
              <TextInput
                value={participantRole}
                onChangeText={setParticipantRole}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholderTextColor="#888"
                placeholder="Roll"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef && phoneRef.current && phoneRef.current.focus()}
                ref={roleRef}
              />
              <TextInput
                value={participantPhone}
                onChangeText={text => {
                  // Only allow numbers, auto-insert spaces: xxx xxx xx xx
                  let cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned.length > 10) cleaned = cleaned.slice(0, 10);
                  let formatted = cleaned;
                  if (cleaned.length > 3) formatted = cleaned.slice(0, 3) + ' ' + cleaned.slice(3);
                  if (cleaned.length > 6) formatted = formatted.slice(0, 7) + ' ' + formatted.slice(7);
                  if (cleaned.length > 8) formatted = formatted.slice(0, 10) + ' ' + formatted.slice(10);
                  setParticipantPhone(formatted);
                }}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 16 }}
                placeholderTextColor="#888"
                placeholder="Mobilnummer"
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={13}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (participantName.trim()) {
                    setLocalParticipants([
                      ...localParticipants,
                      {
                        name: participantName.trim(),
                        company: participantCompany.trim(),
                        role: participantRole.trim(),
                        phone: participantPhone.trim(),
                      },
                    ]);
                    setShowAddParticipantModal(false);
                    setParticipantName('');
                    setParticipantCompany('');
                    setParticipantRole('');
                    setParticipantPhone('');
                  }
                }}
                ref={phoneRef}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    // Add participant to list
                    if (participantName.trim()) {
                      setLocalParticipants([
                        ...localParticipants,
                        {
                          name: participantName.trim(),
                          company: participantCompany.trim(),
                          role: participantRole.trim(),
                          phone: participantPhone.trim(),
                        },
                      ]);
                      setShowAddParticipantModal(false);
                      setParticipantName('');
                      setParticipantCompany('');
                      setParticipantRole('');
                      setParticipantPhone('');
                    }
                  }}
                  disabled={!participantName.trim()}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '400', fontSize: 16, opacity: participantName.trim() ? 1 : 0.4 }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    setShowAddParticipantModal(false);
                    setParticipantName('');
                    setParticipantCompany('');
                    setParticipantRole('');
                    setParticipantPhone('');
                  }}
                >
                  <Text style={{ color: '#D32F2F', fontWeight: '400', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        </View>
        {/* Divider under participants, before weather (removed duplicate) */}

        {/* Omfattning / beskrivning för Skyddsrond */}
        {controlType === 'Skyddsrond' && (
          <View style={{ marginTop: 8, marginBottom: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, fontWeight: 'bold' }}>Omfattning / beskrivning</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
              value={deliveryDesc}
              onChangeText={setDeliveryDesc}
              placeholder="Ex: Hus A, yttertak, ställning, endast inomhus eller utomhus..."
              placeholderTextColor="#bbb"
              multiline
            />
            {/* Divider under Omfattning */}
            <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 12, marginBottom: 0 }} />
          </View>
        )}
      {/* Checklist rendering for Skyddsrond och andra kontroller */}
      {Array.isArray(checklistConfig) && checklistConfig.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 16, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 10, marginLeft: 2 }}>Kontrollpunkter</Text>
          {checklistConfig.map((section, sectionIdx) => {
            const expanded = expandedChecklist.includes(sectionIdx);
            // Check if any point in this section is not filled in
            const sectionStatuses = checklist[sectionIdx]?.statuses || [];
            const anyMissing = section.points.some((_, idx) => !sectionStatuses[idx]);
            const sectionHeaderBg = anyMissing ? '#FFE5E5' : '#e9ecef';
            const sectionHeaderText = anyMissing ? '#D32F2F' : '#222';
            // Ikonlogik: visa fotoikon om något foto finns, varning om någon avvikelse, grön check om alla är ifyllda (oavsett status)
            const allFilled = section.points.every((_, idx) => !!sectionStatuses[idx]);
            const hasAvvikelse = sectionStatuses.some(s => s === 'avvikelse');
            const photos = checklist[sectionIdx]?.photos || [];
            const hasPhoto = photos.some(photoArr => Array.isArray(photoArr) && photoArr.length > 0);
            // Show green check if all filled, regardless of status
            const showGreenCheck = allFilled;
            return (
                <View key={section.id ? `section-${section.id}` : btoa(unescape(encodeURIComponent(section.label))) + '-' + sectionIdx} style={{ marginBottom: 10, backgroundColor: '#fff', borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' }}>
                <TouchableOpacity
                  style={{ flexDirection: 'row', alignItems: 'center', padding: 14, backgroundColor: sectionHeaderBg }}
                  onPress={() => setExpandedChecklist(prev => prev.includes(sectionIdx) ? [] : [sectionIdx])}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Visa eller dölj ${section.label}`}
                >
                  <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={20} color={'#1976D2'} style={{ marginRight: 8 }} />
                  <Text style={{ fontSize: 16, fontWeight: 'bold', color: sectionHeaderText, flex: 1 }}>{section.label}</Text>
                  {/* Visa fotoikon om något foto finns */}
                  {hasPhoto && (
                    <Ionicons name="camera" size={22} color="#1976D2" style={{ marginLeft: 8 }} />
                  )}
                  {/* Visa varning om någon avvikelse finns */}
                  {hasAvvikelse && (
                    <View style={{ marginLeft: 8 }}>
                      <Svg width={22} height={22} viewBox="0 0 24 24">
                        <Polygon points="12,2 22,20 2,20" fill="#FFD600" stroke="#111" strokeWidth="1" />
                        <SvgText
                          x="12"
                          y="14"
                          fontSize="13"
                          fontWeight="bold"
                          fill="#111"
                          textAnchor="middle"
                          alignmentBaseline="middle"
                        >
                          !
                        </SvgText>
                      </Svg>
                    </View>
                  )}
                  {/* Visa grön check om alla är ifyllda och ingen avvikelse */}
                  {showGreenCheck && (
                    <Ionicons name="checkmark-circle" size={22} color="#43A047" style={{ marginLeft: 8 }} />
                  )}
                </TouchableOpacity>
                {expanded && (
                  <View style={{ padding: 10, paddingTop: 0 }}>
                    {section.points.map((point, pointIdx) => {
                      // Find or initialize status for this point
                      const status = (checklist[sectionIdx]?.statuses && checklist[sectionIdx].statuses[pointIdx]) || null;
                      const setStatus = (newStatus) => {
                        setChecklist(prev => {
                          const updated = prev.map((s, sIdx) => {
                            if (sIdx !== sectionIdx) return s;
                            // Ensure statuses array exists and is correct length
                            const statuses = Array.isArray(s.statuses) ? [...s.statuses] : Array(s.points.length).fill(null);
                            statuses[pointIdx] = newStatus;
                            return { ...s, statuses };
                          });
                          return updated;
                        });
                      };
                      // Set background to red if status is not set
                      const rowBackgroundColor = status ? '#fff' : '#FFD6D6';
                      return (
                        <View key={typeof point === 'object' && point !== null && point.id ? `point-${point.id}` : btoa(unescape(encodeURIComponent(point))) + '-' + pointIdx} style={{ marginBottom: 14, backgroundColor: rowBackgroundColor, borderRadius: 6, padding: 10, borderWidth: 1, borderColor: '#e0e0e0' }}>
                          <Text style={{ fontSize: 15, color: '#222', fontWeight: '500', marginBottom: 6 }}>{point}</Text>
                          {/* Status selector (OK, Avvikelse, Ej aktuell) */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginRight: 16,
                                opacity: status === 'ok' ? 1 : 0.7,
                                backgroundColor: status === 'ok' ? '#fff' : '#FFD6D6',
                                borderRadius: 6,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                              }}
                              onPress={() => setStatus('ok')}
                            >
                              <Ionicons name="checkmark-circle" size={22} color={status === 'ok' ? '#43A047' : '#bbb'} style={{ marginRight: 4 }} />
                              <Text style={{ color: status === 'ok' ? '#43A047' : '#bbb', fontWeight: 'bold' }}>OK</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                marginRight: 16,
                                opacity: status === 'avvikelse' ? 1 : 0.7,
                                backgroundColor: status === 'avvikelse' ? '#fff' : '#FFD6D6',
                                borderRadius: 6,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                              }}
                              onPress={() => setStatus('avvikelse')}
                            >
                              <Svg width={22} height={22} viewBox="0 0 24 24" style={{ marginRight: 4 }}>
                                <Polygon points="12,2 22,20 2,20" fill={status === 'avvikelse' ? '#FFD600' : '#bbb'} stroke="#111" strokeWidth="1" />
                                <SvgText
                                  x="12"
                                  y="14"
                                  fontSize="13"
                                  fontWeight="bold"
                                  fill="#111"
                                  textAnchor="middle"
                                  alignmentBaseline="middle"
                                >
                                  !
                                </SvgText>
                              </Svg>
                              <Text style={{
                                color: status === 'avvikelse' ? '#111' : '#bbb',
                                fontWeight: 'bold',
                                backgroundColor: status === 'avvikelse' ? '#FFD600' : 'transparent',
                                borderWidth: status === 'avvikelse' ? 1 : 0,
                                borderColor: status === 'avvikelse' ? '#111' : 'transparent',
                                borderRadius: 4,
                                paddingHorizontal: 4,
                                paddingVertical: 1,
                                overflow: 'hidden',
                              }}>Avvikelse</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                opacity: status === 'ejaktuell' ? 1 : 0.7,
                                backgroundColor: status === 'ejaktuell' ? '#fff' : '#FFD6D6',
                                borderRadius: 6,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                              }}
                              onPress={() => setStatus('ejaktuell')}
                            >
                              <Ionicons name="ellipse-outline" size={22} color={status === 'ejaktuell' ? '#000' : '#bbb'} style={{ marginRight: 4 }} />
                              <Text style={{ color: status === 'ejaktuell' ? '#000' : '#bbb', fontWeight: 'bold' }}>Ej aktuell</Text>
                            </TouchableOpacity>
                          </View>
                          {/* Note field */}
                          <TextInput
                            style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 6, padding: 8, fontSize: 14, backgroundColor: '#fafafa', marginBottom: 6 }}
                            placeholder="Anteckning (valfritt)"
                            placeholderTextColor="#bbb"
                            multiline
                          />
                          {/* Photo upload button */}
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                            <TouchableOpacity
                              style={{ flexDirection: 'row', alignItems: 'center' }}
                              onPress={() => handleNavigateToCamera(sectionIdx, pointIdx, project)}
                            >
                              <Ionicons name="camera" size={20} color="#1976D2" style={{ marginRight: 6 }} />
                              <Text style={{ color: '#1976D2', fontWeight: '500' }}>Lägg till foto</Text>
                            </TouchableOpacity>
                            {/* Visa miniatyrer om bilder finns */}
                            {(() => {
                              const photos = checklist[sectionIdx]?.photos || [];
                              const photoArr = Array.isArray(photos[pointIdx]) ? photos[pointIdx] : (photos[pointIdx] ? [photos[pointIdx]] : []);
                              if (photoArr && photoArr.length > 0) {
                                return (
                                  <View style={{ flexDirection: 'row', marginLeft: 10 }}>
                                    {photoArr.map((uri, idx) => (
                                      <TouchableOpacity
                                        key={`photo-thumb-${sectionIdx}-${pointIdx}-${idx}-${uri ? uri.substring(uri.length-8) : 'empty'}`}
                                        onPress={() => setPhotoModal({ visible: true, uris: photoArr, index: idx })}
                                        activeOpacity={0.8}
                                      >
                                        <Image source={{ uri }} style={{ width: 44, height: 44, borderRadius: 8, borderWidth: 1, borderColor: '#bbb', marginRight: 6, backgroundColor: '#eee', resizeMode: 'cover' }} />
                                      </TouchableOpacity>
                                    ))}
                                  </View>
                                );
                              }
                              return null;
                            })()}
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
            );
          })}
          {/* Divider under checklist */}
          <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 8 }} />

          {/* Summary under checklist */}
          {(() => {
            // Count sections
            const numSections = checklistConfig.length;
            // Count all points
            let totalPoints = 0;
            let approvedPoints = 0;
            let deviationPoints = 0;
            let completedSections = 0;
            checklistConfig.forEach((section, sectionIdx) => {
              totalPoints += section.points.length;
              const statuses = checklist[sectionIdx]?.statuses || [];
              let allFilled = true;
              section.points.forEach((_, pointIdx) => {
                if (statuses[pointIdx] === 'ok') approvedPoints++;
                if (statuses[pointIdx] === 'avvikelse') deviationPoints++;
                if (!statuses[pointIdx]) allFilled = false;
              });
              if (section.points.length > 0 && allFilled) completedSections++;
            });
            return (
              <View style={{ marginTop: 16, marginBottom: 8, padding: 16, backgroundColor: '#f5f5f5', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0' }}>
                <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginBottom: 4 }}>
                  Sammanställning
                </Text>
                <Text style={{ fontSize: 15, color: '#222', marginBottom: 2 }}>
                  Gått igenom: {completedSections} av {numSections} områden
                </Text>
                <Text style={{ fontSize: 15, color: '#43A047', marginBottom: 2 }}>
                  Godkända kontrollpunkter: {approvedPoints} av {totalPoints}
                </Text>
                <Text style={{ fontSize: 15, color: deviationPoints > 0 ? '#FFD600' : '#222' }}>
                  Avvikelser: {deviationPoints}
                </Text>
              </View>
            );
          })()}
        </View>
      )}
      {/* Date, Delivery Description, Participants, Checklist, Signature, Save Buttons */}
      {/* ...existing code... */}
      <View style={{
        flexDirection: 'row',
        justifyContent: 'space-between',
        width: '100%',
        paddingHorizontal: 16,
        marginTop: 16,
        marginBottom: 32,
        backgroundColor: '#fafafa',
        borderWidth: 1,
        borderColor: '#e0e0e0',
        borderRadius: 12,
        paddingVertical: 10,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.06,
        shadowRadius: 4,
        elevation: 2,
      }}>
        <TouchableOpacity
          onPress={handleSave}
          style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0 }}
        >
          <Text style={{ color: '#1976D2', fontWeight: 'bold', fontSize: 16 }}>Slutför</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSaveDraft}
          style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0 }}
        >
          <Text style={{ color: '#D32F2F', fontWeight: 'bold', fontSize: 16 }}>Spara utkast</Text>
        </TouchableOpacity>
      </View>
      {/* Signature Modal Example */}
      <NativeSignatureModal
        visible={signatureForIndex !== null}
        onOK={() => setSignatureForIndex(null)}
        onCancel={() => setSignatureForIndex(null)}
      />
    </View>
  </ScrollView>
    </>
  );
}
