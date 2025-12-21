




import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';

// import BottomSheet from '@gorhom/bottom-sheet';
import { Alert, Dimensions, Image, InteractionManager, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, ScrollView, Text, TextInput, TouchableOpacity, UIManager, useColorScheme, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';
import * as ImagePicker from 'expo-image-picker';
import 'react-native-get-random-values';
import Svg, { Path, Polygon, Text as SvgText } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import { Colors } from '../constants/theme';

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
  // expandedChecklist is declared above (moved earlier)
  const [sectionMenuIndex, setSectionMenuIndex] = useState(null);
  const [participantRole, setParticipantRole] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [editParticipantIndex, setEditParticipantIndex] = useState(null);
  // Refs för TextInput-fokus i deltagar-modal (måste ligga här!)
  const nameRef = useRef();
  const companyRef = useRef();
  const roleRef = useRef();

  // Enable LayoutAnimation on Android
  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  // Keep all sections closed by default; user will open manually (accordion behavior)

  const markAllOk = (sectionIdx) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChecklist(prev => prev.map((s, idx) => {
      if (idx !== sectionIdx) return s;
      const statuses = Array((s.points || []).length).fill('ok');
      return { ...s, statuses };
    }));
    setSectionMenuIndex(null);
  };

  const clearAllPhotos = (sectionIdx) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setChecklist(prev => prev.map((s, idx) => {
      if (idx !== sectionIdx) return s;
      const photos = Array((s.points || []).length).fill([]);
      return { ...s, photos };
    }));
    setSectionMenuIndex(null);
  };
  const phoneRef = useRef();
  const [missingFields, setMissingFields] = useState([]);
  const scrollRef = useRef(null);
  const [signerKeyboardShift, setSignerKeyboardShift] = useState(0);

  useEffect(() => {
    const onShow = (e) => {
      try {
        const h = e && e.endCoordinates ? e.endCoordinates.height : 0;
        const shift = Math.max(0, h - 80);
        setSignerKeyboardShift(shift);
      } catch (err) {
        setSignerKeyboardShift(0);
      }
    };
    const onHide = () => setSignerKeyboardShift(0);
    const showSub = Keyboard.addListener('keyboardDidShow', onShow);
    const hideSub = Keyboard.addListener('keyboardDidHide', onHide);
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  // Add state for draftId and selectedWeather
  const [draftId, setDraftId] = useState(initialValues.id || null);
  const [selectedWeather, setSelectedWeather] = useState(initialValues.weather || null);
  const [materialDesc, setMaterialDesc] = useState(initialValues.materialDesc || '');
  const [qualityDesc, setQualityDesc] = useState(initialValues.qualityDesc || '');
  const [coverageDesc, setCoverageDesc] = useState(initialValues.coverageDesc || '');
  const [mottagningsSignatures, setMottagningsSignatures] = useState(initialValues.mottagningsSignatures || []);
  // Normalize mottagningsPhotos to array of objects { uri, comment }
  const normalizePhotos = (arr) => {
    if (!Array.isArray(arr)) return [];
    return arr.map(p => {
      if (!p) return null;
      if (typeof p === 'string') return { uri: p, comment: '' };
      if (typeof p === 'object' && p.uri) return { uri: p.uri, comment: p.comment || '' };
      return null;
    }).filter(Boolean);
  };
  const [mottagningsPhotos, setMottagningsPhotos] = useState(() => normalizePhotos(initialValues.mottagningsPhotos || []));
  const [showPhotoChoice, setShowPhotoChoice] = useState(false);
  const _theme = useColorScheme() || 'light';
  const tintColor = (Colors && Colors[_theme] && Colors[_theme].tint) ? Colors[_theme].tint : '#1976D2';
  // Ensure visibility: if tintColor is pure white (dark theme), use a contrasting fallback
  const visibleTint = (tintColor === '#fff' || tintColor === '#ffffff') ? '#0a7ea4' : tintColor;
  const onTintColor = (tintColor === '#fff' || tintColor === '#ffffff') ? '#000' : '#fff';
  // const bottomSheetRef = useReactRef(null);
  // The misplaced Modal and logic block above was removed because it must be inside a component or function, not at the top level.
  // If you want to use this Modal, move it inside your component's return statement or a function.
  const route = useRoute();
  const navigation = useNavigation();
  try { console.log('[BaseControlForm] mounted route.key:', route && route.key); } catch (e) {}
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDraftSavedConfirm, setShowDraftSavedConfirm] = useState(false);
  // Ref to store blocked navigation event
  const blockedNavEvent = useRef(null);
  // Keep a ref copy of isDirty so the beforeRemove listener can be attached once
  const isDirtyRef = useRef(false);
  // Prevent duplicate rapid saves of drafts
  const savingDraftRef = useRef(false);
  const lastSavedDraftRef = useRef(null);

  const handleAttemptFinish = () => {
    // Special validation rules for Mottagningskontroll and Skyddsrond
    if (controlType !== 'Mottagningskontroll' && controlType !== 'Skyddsrond') {
      handleSave();
      return;
    }
    const missing = [];
    // Date is optional for Mottagningskontroll; do not mark as missing
    if (!Array.isArray(localParticipants) || localParticipants.length === 0) missing.push('Deltagare');
    const descLabel = (controlType === 'Skyddsrond') ? 'Omfattning / beskrivning av skyddsrond' : 'Beskriv leverans';
    if (!(controlType === 'Skyddsrond' ? deliveryDesc : materialDesc) || !(controlType === 'Skyddsrond' ? deliveryDesc : materialDesc).trim()) missing.push(descLabel);
    if (Array.isArray(checklist) && checklist.length > 0) {
      const anyMissing = checklist.some(sec => !(Array.isArray(sec.statuses) && sec.statuses.every(s => !!s)));
      if (anyMissing) missing.push('Kontrollpunkter');
    }
    if (!Array.isArray(mottagningsSignatures) || mottagningsSignatures.length === 0) missing.push('Signaturer');
    if (missing.length === 0) {
      handleSave();
    } else {
      setMissingFields(missing);
      Alert.alert('Saknas', 'Följande saknas: ' + missing.join(', '));
      if (scrollRef && scrollRef.current && scrollRef.current.scrollTo) {
        scrollRef.current.scrollTo({ y: 0, animated: true });
      }
      setTimeout(() => setMissingFields([]), 5000);
    }
  };

  // Add beforeRemove event once to block navigation if dirty (use ref inside)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirtyRef.current) return; // Allow navigation if not dirty
      e.preventDefault();
      blockedNavEvent.current = e;
      setShowBackConfirm(true);
    });
    return unsubscribe;
  }, [navigation]);
  const [photoModal, setPhotoModal] = useState({ visible: false, uris: [], index: 0 });
  const handleDeletePhoto = () => {
    const { uris, index } = photoModal || {};
    if (!uris || uris.length === 0) {
      setPhotoModal({ visible: false, uris: [], index: 0 });
      return;
    }
    const photoObj = uris[index];
    const uri = photoObj ? (photoObj.uri || photoObj) : null;
    if (!uri) {
      setPhotoModal({ visible: false, uris: [], index: 0 });
      return;
    }

    // 1) Try remove from mottagningsPhotos (central photos list)
    try {
      const mp = mottagningsPhotosRef.current || [];
      const mpIdx = mp.findIndex(x => (x && x.uri) ? x.uri === uri : x === uri);
      if (mpIdx !== -1) {
        const newMp = [...mp];
        newMp.splice(mpIdx, 1);
        setMottagningsPhotos(newMp);
        mottagningsPhotosRef.current = newMp;
        const newUris = uris.filter((u, i) => i !== index);
        const newIndex = Math.max(0, index - 1);
        setPhotoModal({ visible: newUris.length > 0, uris: newUris, index: newUris.length > 0 ? newIndex : 0 });
        return;
      }
    } catch (e) {
      // ignore and try checklist removal
    }

    // 2) Try remove from checklist photos (per-section/point)
    try {
      const prev = checklistRef.current || [];
      let found = false;
      const newChecklist = prev.map((section) => {
        const points = Array.isArray(section.points) ? section.points : [];
        // Normalize photos array to match points length
        const photosArr = Array.isArray(section.photos) && section.photos.length === points.length
          ? section.photos.map(a => Array.isArray(a) ? [...a] : (a ? [a] : []))
          : Array(points.length).fill(null).map(() => []);
        // Remove uri if present in any point
        for (let p = 0; p < photosArr.length; p++) {
          const arr = photosArr[p] || [];
          const pos = arr.findIndex(item => (item && item.uri) ? item.uri === uri : item === uri);
          if (pos !== -1) {
            photosArr[p] = arr.filter((_, i) => i !== pos);
            found = true;
            break;
          }
        }
        return { ...section, photos: photosArr, points };
      });
      if (found) {
        setChecklist(newChecklist);
        checklistRef.current = newChecklist;
        // Expand the section containing the removed photo (if any)
        const sectionIndex = newChecklist.findIndex(sec => Array.isArray(sec.photos) && sec.photos.some(arr => arr && arr.findIndex(item => (item && item.uri) ? item.uri === uri : item === uri) !== -1));
        if (sectionIndex !== -1) setExpandedChecklist(prev => prev.includes(sectionIndex) ? prev : [sectionIndex]);
        const newUris = uris.filter((u, i) => i !== index);
        const newIndex = Math.max(0, index - 1);
        setPhotoModal({ visible: newUris.length > 0, uris: newUris, index: newUris.length > 0 ? newIndex : 0 });
        return;
      }
    } catch (e) {
      // ignore and fallback to removing from modal only
    }

    // 3) Fallback: remove from modal list only
    const newUris = uris.filter((u, i) => i !== index);
    const newIndex = Math.max(0, index - 1);
    setPhotoModal({ visible: newUris.length > 0, uris: newUris, index: newUris.length > 0 ? newIndex : 0 });
  };
  // Ref to avoid stale closures for mottagningsPhotos
  const mottagningsPhotosRef = useRef(mottagningsPhotos);
  useEffect(() => { mottagningsPhotosRef.current = mottagningsPhotos; }, [mottagningsPhotos]);
  // Only initialize checklist ONCE, never re-initialize from checklistConfig after mount
  // Checklist state: restore from route.params if present, else initialize
  // Predefined sections for Mottagningskontroll (option B - pre-filled rows)
  const mottagningsTemplate = [
    {
      label: 'Leverans',
      points: [
        'Kontrollera att levererat material överensstämmer med följesedel',
        'Kontrollera antal och att inga kollin saknas eller är skadade',
        'Kontrollera märkning och produktinformation på kollin',
      ],
    },
    {
      label: 'Kvalitet och skick',
      points: [
        'Inspektera ytskador (bulor, sprickor, fuktfläckar)',
        'Kontrollera att dimensioner och toleranser stämmer',
        'Kontrollera att rätt materialleverans lämnats (typ/spec)',
      ],
    },
    {
      label: 'Täckning och väderskydd',
      points: [
        'Kontrollera att material är täckt vid risk för nederbörd',
        'Säkerställ att vindskydd eller presenningar är korrekt fästa',
        'Kontrollera att täckning inte skadar materialet (kondens, gnidning)',
      ],
    },
  ];
  const [checklist, setChecklist] = useState(() => {
    // Always prefer params.savedChecklist if present, else checklistConfig
    let raw = [];
    if (route.params && route.params.savedChecklist) {
      raw = route.params.savedChecklist;
    } else if (initialValues && Array.isArray(initialValues.checklist) && initialValues.checklist.length > 0) {
      raw = initialValues.checklist;
    } else if (controlType === 'Mottagningskontroll' && (!Array.isArray(checklistConfig) || checklistConfig.length === 0)) {
      // Use predefined Mottagningskontroll sections when no checklistConfig is provided
      raw = mottagningsTemplate.map(section => ({ label: section.label, points: Array.isArray(section.points) ? [...section.points] : [] }));
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

  // Keep a ref of checklist to avoid stale closures when updating params
  const checklistRef = useRef(checklist);
  useEffect(() => { checklistRef.current = checklist; }, [checklist]);

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

  const initialParticipants = useMemo(() => {
    if (initialValues && Array.isArray(initialValues.participants) && initialValues.participants.length > 0) return initialValues.participants;
    return Array.isArray(participants) ? participants : [];
  }, [participants, initialValues]);
  const initialDate = useMemo(() => date || initialValues.date || '', [date, initialValues.date]);
  const initialDeliveryDesc = useMemo(() => initialValues.deliveryDesc || '', [initialValues.deliveryDesc]);
  const initialGeneralNote = useMemo(() => initialValues.generalNote || '', [initialValues.generalNote]);
  const initialMaterialDesc = useMemo(() => initialValues.materialDesc || '', [initialValues.materialDesc]);
  const initialQualityDesc = useMemo(() => initialValues.qualityDesc || '', [initialValues.qualityDesc]);
  const initialCoverageDesc = useMemo(() => initialValues.coverageDesc || '', [initialValues.coverageDesc]);
  const initialMottagningsSignatures = useMemo(() => initialValues.mottagningsSignatures || [], [initialValues.mottagningsSignatures]);
  const initialMottagningsPhotos = useMemo(() => initialValues.mottagningsPhotos || [], [initialValues.mottagningsPhotos]);

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

    // Convert an array of points to a smooth SVG path using Catmull-Rom -> cubic Bezier
    function pointsToPath(points) {
      if (!Array.isArray(points) || points.length === 0) return '';
      if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
      const p = points.map(pt => ({ x: Number(pt.x), y: Number(pt.y) }));
      let d = `M ${p[0].x} ${p[0].y}`;
      for (let i = 0; i < p.length - 1; i++) {
        const p0 = i > 0 ? p[i - 1] : p[i];
        const p1 = p[i];
        const p2 = p[i + 1];
        const p3 = i + 2 < p.length ? p[i + 2] : p2;
        const b1x = p1.x + (p2.x - p0.x) / 6;
        const b1y = p1.y + (p2.y - p0.y) / 6;
        const b2x = p2.x - (p3.x - p1.x) / 6;
        const b2y = p2.y - (p3.y - p1.y) / 6;
        d += ` C ${b1x} ${b1y}, ${b2x} ${b2y}, ${p2.x} ${p2.y}`;
      }
      return d;
    }

  // Local participants state (initialize from participants prop)
  // Prefer participants passed via initialValues when viewing a saved/completed control
  const [localParticipants, setLocalParticipants] = useState(() => {
    if (initialValues && Array.isArray(initialValues.participants) && initialValues.participants.length > 0) return initialValues.participants;
    return Array.isArray(participants) ? participants : [];
  });
  // Dirty state: true if any field differs from initial
  const isDirty = useMemo(() => {
    if (!shallowEqual(localParticipants, initialParticipants)) return true;
    if (!shallowEqual(checklist, initialChecklist)) return true;
    if (dateValue !== initialDate) return true;
    if (deliveryDesc !== initialDeliveryDesc) return true;
    if (generalNote !== initialGeneralNote) return true;
    if (materialDesc !== initialMaterialDesc) return true;
    if (qualityDesc !== initialQualityDesc) return true;
    if (coverageDesc !== initialCoverageDesc) return true;
    if (!shallowEqual(mottagningsSignatures, initialMottagningsSignatures)) return true;
    if (!shallowEqual(mottagningsPhotos, initialMottagningsPhotos)) return true;
    return false;
  }, [localParticipants, checklist, dateValue, deliveryDesc, generalNote, materialDesc, qualityDesc, coverageDesc, mottagningsSignatures, mottagningsPhotos, initialParticipants, initialChecklist, initialDate, initialDeliveryDesc, initialGeneralNote, initialMaterialDesc, initialQualityDesc, initialCoverageDesc, initialMottagningsSignatures, initialMottagningsPhotos]);
  // Keep isDirtyRef in sync with latest computed isDirty
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showAddSignerModal, setShowAddSignerModal] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(() => Array.isArray(checklistConfig) ? checklistConfig.map(() => true) : []);

  useEffect(() => {
    // When checklistConfig changes, reset selected categories to all true (guarded)
    const newSel = Array.isArray(checklistConfig) ? checklistConfig.map(() => true) : [];
    if (!shallowEqual(newSel, selectedCategories)) {
      setSelectedCategories(newSel);
    }
  }, [checklistConfig, selectedCategories]);
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
        // include returnScreen so CameraCapture can navigate back to the correct form
        navigation.navigate('CameraCapture', {
          sectionIdx,
          pointIdx,
          project,
          // Provide the caller route key so CameraCapture can set params on return
          returnKey: route.key || null,
          // Provide the caller route name so CameraCapture can fallback to navigating back
          // to the correct screen if key-based setParams doesn't reach it.
          returnScreen: route.name || null,
          autoSave: controlType === 'Mottagningskontroll',
          mottagningsPhotos: mottagningsPhotosRef.current || [],
        });
      };

    const handlePickFromLibrary = async () => {
      try {
        console.log('[BaseControlForm] handlePickFromLibrary start');
        // Ensure any open keyboard or modal is closed before launching native picker
        try { Keyboard.dismiss(); } catch (e) {}
        setShowPhotoChoice(false);
        // Try to get current permission first, then request if needed
        let perm = null;
        try {
          if (typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
            perm = await ImagePicker.getMediaLibraryPermissionsAsync();
          }
        } catch (e) {}
        if (!perm || !(perm.granted === true || perm.status === 'granted')) {
          try {
            perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          } catch (e) {
            // fall through
          }
        }
        const ok = (perm && (perm.granted === true || perm.status === 'granted'));
        console.log('[BaseControlForm] media library permission:', ok, perm);
        if (!ok) {
          alert('Behöver tillgång till bildbiblioteket för att välja bilder.');
          return;
        }
                // Build conservative picker options (avoid allowsMultipleSelection which may hang on some SDKs)
                const mediaTypesOption = (ImagePicker && ImagePicker.MediaType && ImagePicker.MediaType.Images) ? ImagePicker.MediaType.Images : undefined;
                const pickerOptions = { quality: 0.8 };
                if (mediaTypesOption) pickerOptions.mediaTypes = mediaTypesOption;
                console.log('[BaseControlForm] launching image library with options', pickerOptions, 'launchFn:', typeof ImagePicker.launchImageLibraryAsync);
                if (typeof ImagePicker.launchImageLibraryAsync !== 'function') {
                  console.warn('[BaseControlForm] ImagePicker.launchImageLibraryAsync is not a function');
                  alert('Image picker inte tillgänglig i denna miljö.');
                  return;
                }
                // Wait for UI interactions/animations to finish and a short delay
                await new Promise(resolve => InteractionManager.runAfterInteractions(() => setTimeout(resolve, 500)));
                // Wrap launch in a timeout so we don't hang if native picker fails silently
                const launchPromise = ImagePicker.launchImageLibraryAsync(pickerOptions);
                let res;
                try {
                  res = await Promise.race([
                    launchPromise,
                    new Promise((_, reject) => setTimeout(() => reject(new Error('picker_timeout')), 7000)),
                  ]);
                } catch (launchErr) {
                  if (launchErr && launchErr.message === 'picker_timeout') {
                    console.warn('[BaseControlForm] image picker timed out');
                    alert('Bildväljaren svarade inte. Försök igen.');
                    return;
                  }
                  console.warn('[BaseControlForm] launchImageLibraryAsync threw', launchErr);
                  alert('Kunde inte öppna bildväljaren: ' + (launchErr?.message || launchErr));
                  return;
                }
                console.log('[BaseControlForm] imagePicker result:', res);
        // Handle new API shapes: res.canceled + res.assets OR res.selectedAssets
        const extractAssets = (r) => {
          if (!r) return [];
          if (Array.isArray(r.assets) && r.assets.length) return r.assets;
          if (Array.isArray(r.selectedAssets) && r.selectedAssets.length) return r.selectedAssets;
          // legacy
          if (r.uri) return [{ uri: r.uri }];
          if (r.cancelled === false && r.uri) return [{ uri: r.uri }];
          return [];
        };
        const assets = extractAssets(res);
        if (assets && assets.length > 0) {
          const photos = assets.map(a => {
            const uri = a?.uri || a?.uriString || a?.localUri || (a?.base64 ? `data:image/jpeg;base64,${a.base64}` : null);
            return uri ? { uri, comment: '' } : null;
          }).filter(Boolean);
          if (photos.length > 0) {
            setMottagningsPhotos(prev => {
              const prevArr = Array.isArray(prev) ? prev : (mottagningsPhotosRef.current || []);
              const existing = new Set(prevArr.map(p => p && p.uri).filter(Boolean));
              const toAdd = photos.filter(p => p && p.uri && !existing.has(p.uri));
              if (!toAdd.length) return prevArr;
              const next = [...prevArr, ...toAdd];
              mottagningsPhotosRef.current = next;
              return next;
            });
          }
        } else {
          // User cancelled or no assets
          // No-op
        }
      } catch (e) {
        console.warn('Image pick error', e);
        alert('Kunde inte välja bild: ' + (e?.message || e));
      }
    };

    
  // Guarded camera result handling to avoid re-processing and param cycles
  const cameraHandledRef = useRef(false);
  const processedCameraUrisRef = useRef(new Set());

  // Helper: merge two drafts conservatively (preserve photos, participants, signatures, checklist photos)
  const mergeDrafts = (existing, incoming) => {
    if (!existing) return incoming;
    if (!incoming) return existing;
    const out = { ...existing, ...incoming };
    // Merge participants (unique by name+company)
    try {
      const a = Array.isArray(existing.participants) ? existing.participants : [];
      const b = Array.isArray(incoming.participants) ? incoming.participants : [];
      const key = (p) => ((p && p.name) ? p.name : JSON.stringify(p)) + '::' + ((p && p.company) ? p.company : '');
      const map = new Map();
      a.concat(b).forEach(p => { try { map.set(key(p), p); } catch (e) {} });
      out.participants = Array.from(map.values());
    } catch (e) {}
    // Merge mottagningsSignatures
    try {
      const a = Array.isArray(existing.mottagningsSignatures) ? existing.mottagningsSignatures : [];
      const b = Array.isArray(incoming.mottagningsSignatures) ? incoming.mottagningsSignatures : [];
      out.mottagningsSignatures = [...a, ...b.filter(s => !a.includes(s))];
    } catch (e) {}
    // Merge mottagningsPhotos by uri
    try {
      const a = Array.isArray(existing.mottagningsPhotos) ? existing.mottagningsPhotos : [];
      const b = Array.isArray(incoming.mottagningsPhotos) ? incoming.mottagningsPhotos : [];
      const seen = new Set(a.map(x => x && x.uri).filter(Boolean));
      const merged = [...a];
      b.forEach(x => { if (x && x.uri && !seen.has(x.uri)) { seen.add(x.uri); merged.push(x); } });
      out.mottagningsPhotos = merged;
    } catch (e) {}
    // Merge checklist: prefer incoming structure but union photos per point
    try {
      const A = Array.isArray(existing.checklist) ? existing.checklist : [];
      const B = Array.isArray(incoming.checklist) ? incoming.checklist : [];
      if (B.length === 0) {
        out.checklist = A;
      } else if (A.length === 0) {
        out.checklist = B;
      } else {
        const mergedChecklist = B.map((secB, sIdx) => {
          const secA = A[sIdx] || {};
          const points = Array.isArray(secB.points) ? secB.points : (Array.isArray(secA.points) ? secA.points : []);
          const statuses = Array.isArray(secB.statuses) && secB.statuses.length === points.length ? secB.statuses : (secA.statuses || Array(points.length).fill(null));
          const photosA = Array.isArray(secA.photos) ? secA.photos : Array(points.length).fill([]);
          const photosB = Array.isArray(secB.photos) ? secB.photos : Array(points.length).fill([]);
          const photos = points.map((_, pIdx) => {
            const aArr = Array.isArray(photosA[pIdx]) ? photosA[pIdx] : (photosA[pIdx] ? [photosA[pIdx]] : []);
            const bArr = Array.isArray(photosB[pIdx]) ? photosB[pIdx] : (photosB[pIdx] ? [photosB[pIdx]] : []);
            const seen = new Set(aArr.map(x => (x && x.uri) ? x.uri : x).filter(Boolean));
            const outArr = [...aArr];
            bArr.forEach(item => { const uri = (item && item.uri) ? item.uri : item; if (uri && !seen.has(uri)) { seen.add(uri); outArr.push(item); } });
            return outArr;
          });
          return { ...secB, points, statuses, photos };
        });
        out.checklist = mergedChecklist;
      }
    } catch (e) {}
    return out;
  };

  // Persist a draft object by merging with existing matching draft(s)
  const persistDraftObject = async (draftObj) => {
    if (!draftObj || !draftObj.project) {
      // still write minimal object to avoid losing the id
    }
    let arr = [];
    try {
      const raw = await AsyncStorage.getItem('draft_controls');
      if (raw) arr = JSON.parse(raw) || [];
    } catch (e) { arr = []; }
    // Find matching draft by id first
    let idx = -1;
    if (draftObj && draftObj.id) {
      idx = arr.findIndex(c => c.id === draftObj.id && c.project?.id === draftObj.project?.id && c.type === draftObj.type);
    }
    // If not found, try match by project+type (to merge newer content into older draft)
    if (idx === -1 && draftObj && draftObj.project) {
      idx = arr.findIndex(c => c.project?.id === draftObj.project?.id && c.type === draftObj.type);
    }
    if (idx !== -1) {
      const merged = mergeDrafts(arr[idx], draftObj);
      arr[idx] = merged;
      lastSavedDraftRef.current = merged;
    } else {
      arr.push(draftObj);
      lastSavedDraftRef.current = draftObj;
    }
    await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
    try { console.log('[BaseControlForm] persistDraftObject saved id:', lastSavedDraftRef.current && lastSavedDraftRef.current.id, 'total:', arr.length); } catch (e) {}
    return arr;
  };

  const processCameraResult = (cameraResult) => {
    if (!cameraResult) return;
    try { console.log('[BaseControlForm] processing cameraResult from state/params:', cameraResult); } catch (e) {}
    const { uri, sectionIdx, pointIdx, returnedMottagningsPhotos } = cameraResult;
    if (returnedMottagningsPhotos && Array.isArray(returnedMottagningsPhotos)) {
      try {
        const norm = normalizePhotos(returnedMottagningsPhotos);
        // Filter duplicates by uri
        const prev = mottagningsPhotosRef.current || [];
        const existingUris = new Set(prev.map(p => p && p.uri).filter(Boolean));
        const toAdd = norm.filter(p => p && p.uri && !existingUris.has(p.uri));
        // Attach any new returned photo URIs to the specific checklist point (if provided)
        try {
          if (sectionIdx !== undefined && pointIdx !== undefined) {
            const urisToAttach = toAdd.map(p => p.uri).filter(Boolean);
              if (urisToAttach.length > 0) {
              try { console.log('[BaseControlForm] attaching returnedMottagningsPhotos to checklist point', sectionIdx, pointIdx, 'uris:', urisToAttach); } catch (e) {}
              const prevChecklist = checklistRef.current || [];
              const updated = prevChecklist.map((section, sIdx) => {
                if (sIdx !== sectionIdx) return section;
                const points = Array.isArray(section.points) ? section.points : [];
                let photos = Array.isArray(section.photos) && section.photos.length === points.length
                  ? [...section.photos]
                  : Array(Array.isArray(points) ? points.length : 0).fill(null).map(() => []);
                photos[pointIdx] = Array.isArray(photos[pointIdx]) ? photos[pointIdx] : [];
                photos[pointIdx] = [...photos[pointIdx], ...urisToAttach];
                return { ...section, photos, points };
              });
              setChecklist(updated);
              checklistRef.current = updated;
              setExpandedChecklist(prev => prev.includes(sectionIdx) ? prev : [sectionIdx]);
              // Persist draft with updated checklist (merge/upsert to avoid overwriting richer state)
              (async () => {
                try {
                  const toSaveId = draftId || uuidv4();
                  try { setDraftId(toSaveId); } catch (e) {}
                  const draftObj = {
                    id: toSaveId,
                    date: dateValue,
                    project,
                    weather: selectedWeather,
                    participants: localParticipants,
                    materialDesc,
                    qualityDesc,
                    coverageDesc,
                    mottagningsSignatures,
                    mottagningsPhotos,
                    checklist: updated,
                    expandedChecklist,
                    deliveryDesc,
                    generalNote,
                    type: controlType,
                    savedAt: new Date().toISOString(),
                  };
                  try {
                    await persistDraftObject(draftObj);
                    try { console.log('[BaseControlForm] persisted draft after attaching photos, id:', draftObj.id); } catch (e) {}
                  } catch (e) { try { console.warn('[BaseControlForm] persist after attach failed', e); } catch (er) {} }
                } catch (e) { try { console.warn('[BaseControlForm] persist after attach failed', e); } catch (er) {} }
              })();
            }
          }
        } catch (er) {}
        if (toAdd.length === 0) {
          try { navigation.setParams({ cameraResult: undefined }); } catch (e) {}
          return;
        }
        setMottagningsPhotos(prevState => {
          const next = [...(prevState || []), ...toAdd];
          mottagningsPhotosRef.current = next;
          return next;
        });
        try { console.log('[BaseControlForm] appended returnedMottagningsPhotos, added:', toAdd.length, 'uris:', toAdd.map(p=>p.uri)); } catch (e) {}
        try { navigation.setParams({ cameraResult: undefined }); } catch (e) {}
      } catch (e) {}
    } else if (uri) {
      if (processedCameraUrisRef.current.has(uri)) {
        try { navigation.setParams({ cameraResult: undefined }); } catch (e) {}
        return;
      }
      if (controlType === 'Mottagningskontroll') {
        try {
          processedCameraUrisRef.current.add(uri);
          setMottagningsPhotos(prev => {
            const prevArr = Array.isArray(prev) ? prev : (mottagningsPhotosRef.current || []);
            // avoid duplicates
            if (prevArr.findIndex(x => x && x.uri === uri) !== -1) return prevArr;
            const newItem = { uri, comment: '' };
            const next = [...prevArr, newItem];
            mottagningsPhotosRef.current = next;
            return next;
          });
          try { console.log('[BaseControlForm] appended uri to mottagningsPhotos, item:', uri); } catch (e) {}
          try { navigation.setParams({ cameraResult: undefined }); } catch (e) {}
        } catch (e) {}
      } else if (sectionIdx !== undefined && pointIdx !== undefined) {
        try {
          const prev = checklistRef.current || [];
          const newChecklist = prev.map((section, sIdx) => {
            if (sIdx !== sectionIdx) return section;
            const points = Array.isArray(section.points) ? section.points : [];
            let photos = Array.isArray(section.photos) && section.photos.length === points.length
              ? [...section.photos]
              : Array(Array.isArray(points) ? points.length : 0).fill(null).map(() => []);
            if (!Array.isArray(photos[pointIdx])) photos[pointIdx] = photos[pointIdx] ? [photos[pointIdx]] : [];
            photos[pointIdx] = [...photos[pointIdx], uri];
            return { ...section, photos, points };
          });
          setChecklist(newChecklist);
          checklistRef.current = newChecklist;
          setExpandedChecklist(prev => prev.includes(sectionIdx) ? prev : [sectionIdx]);
          try { navigation.setParams({ cameraResult: undefined }); } catch (e) {}
          // Persist updated checklist (including photos) to draft controls immediately so
          // photos added from CameraCapture are not lost if the user navigates away.
          (async () => {
            try {
              const toSaveId = draftId || uuidv4();
              try { setDraftId(toSaveId); } catch (e) {}
              const draftObj = {
                id: toSaveId,
                date: dateValue,
                project,
                weather: selectedWeather,
                participants: localParticipants,
                materialDesc,
                qualityDesc,
                coverageDesc,
                mottagningsSignatures,
                mottagningsPhotos,
                checklist: newChecklist,
                expandedChecklist,
                deliveryDesc,
                generalNote,
                type: controlType,
                savedAt: new Date().toISOString(),
              };
              try {
                await persistDraftObject(draftObj);
                try { console.log('[BaseControlForm] persisted draft after uri add, id:', draftObj.id); } catch (e) {}
              } catch (e) { try { console.warn('[BaseControlForm] persist after uri add failed', e); } catch (er) {} }
            } catch (e) {
              try { console.warn('[BaseControlForm] persist after uri add failed', e); } catch (er) {}
            }
          })();
        } catch (e) {}
      }
    }
  };

  // Primary effect: react to explicit route.params changes (fast path)
  useEffect(() => {
    const cameraResult = route.params?.cameraResult;
    try { console.log('[BaseControlForm] cameraResult param changed (effect):', cameraResult); } catch (e) {}
    if (cameraResult) processCameraResult(cameraResult);
    if (!route.params?.cameraResult) cameraHandledRef.current = false;
  }, [route.params?.cameraResult]);

  // Secondary: on focus / navigation state, attempt to find cameraResult set via setParams-by-key
  useEffect(() => {
    const checkStateForCameraResult = () => {
      try {
        const state = navigation.getState && navigation.getState();
        if (!state || !Array.isArray(state.routes)) return;
        try { console.log('[BaseControlForm] nav state routes:', state.routes.map(r => ({ key: r.key, name: r.name, hasCameraResult: !!(r.params && r.params.cameraResult) }))); } catch (e) {}
        const ourRoute = state.routes.find(r => r.key === route.key);
        const cr = ourRoute && ourRoute.params && ourRoute.params.cameraResult;
        if (cr) {
          try { console.log('[BaseControlForm] found cameraResult on navigation state for our route:', cr); } catch (e) {}
          processCameraResult(cr);
        } else {
          // Log which route appears previous to the current index for debugging
          try {
            const idx = typeof state.index === 'number' ? state.index : state.routes.findIndex(r => r.key === route.key);
            const prev = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
            try { console.log('[BaseControlForm] nav index:', idx, 'prevRoute:', prev && { key: prev.key, name: prev.name, hasCameraResult: !!(prev.params && prev.params.cameraResult) }); } catch (e) {}
          } catch (e) {}
        }
      } catch (e) {}
    };
    const unsub = navigation.addListener('focus', () => { checkStateForCameraResult(); });
    // also check immediately (in case params were set while backgrounded)
    checkStateForCameraResult();
    return unsub;
  }, [navigation, route.key]);

  // Drain any pending camera photos stored in AsyncStorage by CameraCapture as a fallback
  useEffect(() => {
    const drainPending = async () => {
      try {
        const raw = await AsyncStorage.getItem('pending_camera_photos');
        if (!raw) return;
        const arr = JSON.parse(raw || '[]') || [];
        if (!Array.isArray(arr) || arr.length === 0) return;
        try { console.log('[BaseControlForm] draining pending camera photos from storage:', arr.length); } catch (e) {}
        for (const cameraResult of arr) {
          try { processCameraResult(cameraResult); } catch (e) {}
        }
        await AsyncStorage.removeItem('pending_camera_photos');
      } catch (e) {}
    };
    const unsub2 = navigation.addListener('focus', () => { drainPending(); });
    // run now as well
    drainPending();
    return unsub2;
  }, [navigation, processCameraResult]);
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dateValue, setDateValue] = useState(date || initialValues.date || todayIso);
  // Ensure dateValue is populated if props arrive asynchronously or after hot restart
  useEffect(() => {
    if (!dateValue || dateValue === '') {
      const fallback = date || (initialValues && initialValues.date) || todayIso;
      setDateValue(fallback);
    }
  }, [date, initialValues && initialValues.date]);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState('');
  const [deliveryDesc, setDeliveryDesc] = useState(initialValues.deliveryDesc || '');
  const [generalNote, setGeneralNote] = useState(initialValues.generalNote || '');
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [signatureForIndex, setSignatureForIndex] = useState(null);
  const [sigStrokes, setSigStrokes] = useState([]);
  const [sigCurrent, setSigCurrent] = useState([]);
  const sigCurrentRef = useRef([]);
  const sigStrokesRef = useRef([]);
  const sigCanvasSize = Math.min(Dimensions.get('window').width * 0.9, 760);
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => true,
    onMoveShouldSetPanResponder: () => true,
    onPanResponderGrant: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      const next = [{ x: locationX, y: locationY }];
      sigCurrentRef.current = next;
      setSigCurrent(next);
    },
    onPanResponderMove: (e) => {
      const { locationX, locationY } = e.nativeEvent;
      try {
        const last = sigCurrentRef.current && sigCurrentRef.current.length ? sigCurrentRef.current[sigCurrentRef.current.length - 1] : null;
        const dx = last ? Math.abs(locationX - last.x) : Infinity;
        const dy = last ? Math.abs(locationY - last.y) : Infinity;
        // Only add a new point if movement exceeds threshold (reduces noise)
        const THRESH = 2; // pixels
        if (!last || dx >= THRESH || dy >= THRESH) {
          const next = [...sigCurrentRef.current, { x: locationX, y: locationY }];
          sigCurrentRef.current = next;
          setSigCurrent(next);
        }
      } catch (err) {}
    },
    onPanResponderRelease: () => {
      try {
        const curr = (sigCurrentRef.current && sigCurrentRef.current.length) ? [...(Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []), sigCurrentRef.current] : (Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []);
        sigStrokesRef.current = curr;
        setSigStrokes(curr);
      } catch (e) {}
      sigCurrentRef.current = [];
      setSigCurrent([]);
    },
    onPanResponderTerminate: () => {
      try {
        const curr = (sigCurrentRef.current && sigCurrentRef.current.length) ? [...(Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []), sigCurrentRef.current] : (Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []);
        sigStrokesRef.current = curr;
        setSigStrokes(curr);
      } catch (e) {}
      sigCurrentRef.current = [];
      setSigCurrent([]);
    }
  })).current;

  // Spara utkast till AsyncStorage (flera per projekt/kontrolltyp)
  const saveDraftControl = async () => {
    // Prevent concurrent saves causing duplicates
    if (savingDraftRef.current) return lastSavedDraftRef.current;
    savingDraftRef.current = true;
    let draft = null;
    try {
      // Guard: avoid creating a new empty draft unless there's meaningful data
      const hasChecklistContent = Array.isArray(checklist) && checklist.some(sec => {
        if (!sec) return false;
        if (Array.isArray(sec.statuses) && sec.statuses.some(s => !!s)) return true;
        if (Array.isArray(sec.photos) && sec.photos.some(pArr => Array.isArray(pArr) && pArr.length > 0)) return true;
        return false;
      });
      const hasText = (deliveryDesc && String(deliveryDesc).trim().length > 0) || (materialDesc && String(materialDesc).trim().length > 0) || (generalNote && String(generalNote).trim().length > 0);
      const hasPhotos = Array.isArray(mottagningsPhotos) && mottagningsPhotos.length > 0;
      const hasSignatures = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length > 0;
      const hasParticipantsLocal = Array.isArray(localParticipants) && localParticipants.length > 0;
      const shouldPersist = !!lastSavedDraftRef.current || isDirtyRef.current || hasChecklistContent || hasText || hasPhotos || hasSignatures || hasParticipantsLocal;
      if (!shouldPersist) {
        // Nothing meaningful to save; avoid creating an empty draft
        savingDraftRef.current = false;
        return lastSavedDraftRef.current;
      }
      try { console.log('[BaseControlForm] saveDraftControl START, draftId:', draftId, 'project.id:', project && project.id, 'controlType:', controlType); } catch (e) {}
      draft = {
        id: draftId || uuidv4(),
        date: dateValue,
        project,
        weather: selectedWeather,
        participants: localParticipants,
        materialDesc,
        qualityDesc,
        coverageDesc,
        mottagningsSignatures,
        mottagningsPhotos,
        checklist,
        expandedChecklist,
        deliveryDesc,
        generalNote,
        type: controlType,
        savedAt: new Date().toISOString(),
      };
      // Ensure subsequent saves update the same draft instead of creating a new one
      try { setDraftId(draft.id); } catch (e) {}

      // Persist draft using merge-upsert helper so we don't overwrite richer data
      try {
        try { console.log('[BaseControlForm] existing draft_controls raw (upsert)'); } catch (e) {}
        await persistDraftObject(draft);
      } catch (e) {
        try { console.warn('[BaseControlForm] failed to persist draft_controls', e); } catch (er) {}
      }
      // store last saved draft so concurrent attempts can reuse it
      lastSavedDraftRef.current = draft;
      return draft;
    } catch (e) {
      // If persistence fails, still return the constructed draft so callers/upserters reuse same id
      try { if (draft) lastSavedDraftRef.current = draft; } catch (er) {}
      alert('Kunde inte spara utkast: ' + (e && e.message ? e.message : String(e)));
      return draft;
    } finally {
      savingDraftRef.current = false;
    }
  };

  // Spara slutförd kontroll och ta bort ev. utkast
  const handleSave = async () => {
    if (onSave) onSave({
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      materialDesc,
      qualityDesc,
      coverageDesc,
      mottagningsSignatures,
      mottagningsPhotos,
      checklist,
      expandedChecklist,
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
    // Clear dirty flag so beforeRemove won't intercept navigation, then show confirmation and go back
    try {
      isDirtyRef.current = false;
    } catch (e) {}
    try {
      // Show a short confirmation modal, then navigate back
      setShowFinishConfirm(true);
      setTimeout(() => {
        try { setShowFinishConfirm(false); } catch (e) {}
        try {
          if (navigation && navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          }
        } catch (e) {}
      }, 1200);
    } catch (e) {}
  };

  // Spara utkast
  const handleSaveDraft = async () => {
    const draft = await saveDraftControl();
    try { console.log('[BaseControlForm] handleSaveDraft got draft id:', draft && draft.id); } catch (e) {}
    if (onSaveDraft) await onSaveDraft(draft || {
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      materialDesc,
      qualityDesc,
      coverageDesc,
      mottagningsSignatures,
      mottagningsPhotos,
      checklist,
      expandedChecklist,
      deliveryDesc,
      generalNote,
      type: controlType,
    });
    try {
      // Mark form as not dirty and hide any back-confirm modal so navigation proceeds cleanly
      try { isDirtyRef.current = false; } catch (e) {}
      try { setShowBackConfirm(false); } catch (e) {}
      setShowDraftSavedConfirm(true);
      setTimeout(() => {
        try { setShowDraftSavedConfirm(false); } catch (e) {}
        try {
          if (blockedNavEvent.current) {
            blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
            blockedNavEvent.current = null;
          } else if (navigation && navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          }
        } catch (e) {}
      }, 1000);
    } catch (e) {}
  };

  // Render
  // Determine whether the control may be completed (enabled "Slutför").
  // For Mottagningskontroll we require: date, >=1 participant, material description,
  // all checklist points completed (if present) and at least one signature. Photos and weather are optional.
  const canFinish = (() => {
    if (controlType !== 'Mottagningskontroll' && controlType !== 'Skyddsrond') return true;
    const hasParticipants = Array.isArray(localParticipants) && localParticipants.length >= 1;
    // For Mottagningskontroll and Skyddsrond require a short description/omfattning
    const hasMaterial = typeof materialDesc === 'string' && materialDesc.trim().length > 0;
    const hasScope = typeof deliveryDesc === 'string' && deliveryDesc.trim().length > 0;
    const checklistComplete = (() => {
      if (!Array.isArray(checklist) || checklist.length === 0) return true;
      return checklist.every(sec => Array.isArray(sec.statuses) && sec.statuses.length > 0 && sec.statuses.every(s => !!s));
    })();
    const hasSignature = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length >= 1;
    // For Skyddsrond also require scope/description
    if (controlType === 'Skyddsrond') return hasParticipants && hasScope && checklistComplete && hasSignature;
    return hasParticipants && hasMaterial && checklistComplete && hasSignature;
  })();

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
                  const draft = await saveDraftControl();
                      if (onSaveDraft) await onSaveDraft(draft || {
                        date: dateValue,
                        project,
                        weather: selectedWeather,
                        participants: localParticipants,
                        materialDesc,
                        qualityDesc,
                        coverageDesc,
                        mottagningsSignatures,
                        checklist,
                        deliveryDesc,
                        generalNote,
                        type: controlType,
                      });
                  // Ensure navigation won't be blocked by dirty flag after saving
                  try { isDirtyRef.current = false; } catch (e) {}
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
      {/* Confirmation after successful finish */}
      <Modal visible={showFinishConfirm} transparent animationType="fade" onRequestClose={() => setShowFinishConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Ionicons name="checkmark-circle" size={44} color="#43A047" style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 16, color: '#222', textAlign: 'center', fontWeight: '600' }}>Kontrollen är slutförd och sparad i projektet.</Text>
          </View>
        </View>
      </Modal>
      {/* Confirmation after saving draft */}
      <Modal visible={showDraftSavedConfirm} transparent animationType="fade" onRequestClose={() => setShowDraftSavedConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 12, padding: 20, width: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Ionicons name="save-outline" size={44} color="#D32F2F" style={{ marginBottom: 8 }} />
            <Text style={{ fontSize: 16, color: '#222', textAlign: 'center', fontWeight: '600' }}>Kontrollen sparas som utkast.</Text>
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
            <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={80}>
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
                  source={{ uri: (photoModal.uris[photoModal.index] && photoModal.uris[photoModal.index].uri) ? photoModal.uris[photoModal.index].uri : photoModal.uris[photoModal.index] }}
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
              <View style={{ flexDirection: 'column', marginTop: 18, alignItems: 'center', justifyContent: 'center', width: '100%' }}>
                <View style={{ flexDirection: 'row', justifyContent: 'center' }}>
                  {photoModal.uris.map((p, idx) => (
                    <View key={`photo-dot-${idx}-${p && p.uri ? p.uri.substring(p.uri.length-8) : idx}`} style={{ width: 8, height: 8, borderRadius: 4, margin: 4, backgroundColor: idx === photoModal.index ? '#fff' : '#888' }} />
                  ))}
                </View>
                {/* Comment input for current photo */}
                <View style={{ width: '92%', marginTop: 12 }}>
                  <Text style={{ color: '#fff', marginBottom: 6 }}>Kommentar</Text>
                  <TextInput
                    value={(photoModal.uris[photoModal.index] && photoModal.uris[photoModal.index].comment) ? photoModal.uris[photoModal.index].comment : ''}
                    onChangeText={(text) => {
                      try {
                        const newUris = (photoModal.uris || []).map((p, i) => i === photoModal.index ? ({ uri: (p && p.uri) ? p.uri : p, comment: text }) : (p && p.uri ? { uri: p.uri, comment: p.comment || '' } : p));
                        setPhotoModal({ ...photoModal, uris: newUris });
                        // Persist to mottagningsPhotos if central
                        const current = photoModal.uris[photoModal.index];
                        const currentUri = current && current.uri ? current.uri : current;
                        const mp = mottagningsPhotosRef.current || [];
                        const idxFound = mp.findIndex(x => x && x.uri === currentUri);
                        if (idxFound !== -1) {
                          const mpNew = mp.map((x, xi) => xi === idxFound ? ({ uri: x.uri, comment: text }) : x);
                          setMottagningsPhotos(mpNew);
                          mottagningsPhotosRef.current = mpNew;
                        }
                      } catch (e) {}
                    }}
                    placeholder="Lägg till kommentar till bilden..."
                    placeholderTextColor="#ddd"
                    style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: 8, borderRadius: 8, color: '#fff' }}
                  />
                </View>
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
      </KeyboardAvoidingView>
      </Modal>
      <ScrollView ref={scrollRef} style={{ flex: 1, backgroundColor: '#fff' }} keyboardShouldPersistTaps="handled">
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
        {/* Created date row - show as 'Skapad' (date only) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
            <View>
              <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>{`Skapad: ${(() => {
                // Prefer the local `dateValue` (may be defaulted to today) so new forms show today's date
                const src = (dateValue && dateValue !== '') ? dateValue : (initialValues && initialValues.date ? initialValues.date : '');
                if (!src) return '-';
                const d = new Date(src);
                if (isNaN(d)) return src;
                return d.toISOString().slice(0, 10);
              })()}`}</Text>
              {(() => {
                const status = initialValues && initialValues.status ? initialValues.status : null;
                const savedAt = initialValues && initialValues.savedAt ? initialValues.savedAt : null;
                if (!status || !savedAt) return null;
                const label = status === 'UTFÖRD' ? 'Slutförd' : (status === 'UTKAST' ? 'Sparad' : null);
                if (!label) return null;
                const d = new Date(savedAt);
                const dateOnly = isNaN(d) ? savedAt : d.toISOString().slice(0, 10);
                return <Text style={{ fontSize: 13, color: '#666', marginTop: 4 }}>{`${label}: ${dateOnly}`}</Text>;
              })()}
            </View>
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
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
        {/* Date edit modal */}
        {showDateModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
            <View style={{ height: 120 }} />
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
        {/* Participants (own row) and Weather (separate row below) */}
        <View style={{ flexDirection: 'column', marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
              <Ionicons name="person-outline" size={26} color="#1976D2" style={{ marginRight: 7, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, color: (missingFields && missingFields.includes('Deltagare')) ? '#D32F2F' : '#222', fontWeight: '600', marginBottom: 6, marginTop: 4 }}>Deltagare</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ paddingVertical: 6 }} contentContainerStyle={{ alignItems: 'center' }}>
                  {(Array.isArray(localParticipants) ? localParticipants : []).map((p, idx) => {
                    const name = (typeof p === 'string') ? p : (p && p.name) ? p.name : `Deltagare ${idx+1}`;
                    const key = (typeof p === 'object' && p && p.id) ? `participant-${p.id}` : `participant-${idx}-${name}`;
                    return (
                      <View key={key} style={{ backgroundColor: '#f5f5f5', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, marginRight: 8, flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 14, color: '#222', marginRight: 8 }}>{name}</Text>
                        <TouchableOpacity onPress={() => { setParticipantName(typeof p === 'string' ? p : (p.name || '')); setParticipantCompany(typeof p === 'object' && p ? (p.company || '') : ''); setParticipantRole(typeof p === 'object' && p ? (p.role || '') : ''); setParticipantPhone(typeof p === 'object' && p ? (p.phone || '') : ''); setEditParticipantIndex(idx); setShowAddParticipantModal(true); }} style={{ marginRight: 6 }}>
                          <Ionicons name="create-outline" size={18} color="#1976D2" />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => { const nameToDelete = name; setLocalParticipants(prev => (Array.isArray(prev) ? prev.filter((_, i) => i !== idx) : [])); setMottagningsSignatures(prev => (Array.isArray(prev) ? prev.filter(s => s.name !== nameToDelete) : [])); }}>
                          <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
            <TouchableOpacity onPress={() => { setParticipantName(''); setParticipantCompany(''); setParticipantRole(''); setParticipantPhone(''); setEditParticipantIndex(null); setShowAddParticipantModal(true); }} style={{ padding: 4, marginLeft: 8 }} accessibilityLabel="Lägg till deltagare">
              <Ionicons name="add-circle-outline" size={26} color="#1976D2" />
            </TouchableOpacity>
          </View>

          {/* Divider between participants and weather */}
          <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 8 }} />

          {/* Weather row (separate) */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              {/* Fixed weather icon on the left, same blue as other icons */}
              <Ionicons name="sunny" size={18} color="#1976D2" style={{ marginRight: 8 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>Väderlek</Text>
                {!selectedWeather && (
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: '400', marginLeft: 6 }}>(valfritt)</Text>
                )}
                {selectedWeather && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 10 }}>
                    <Ionicons
                      name={(() => {
                        const defaultWeatherOptions = [
                          { key: 'Soligt', icon: 'sunny' },
                          { key: 'Delvis molnigt', icon: 'partly-sunny' },
                          { key: 'Molnigt', icon: 'cloudy' },
                          { key: 'Regn', icon: 'rainy' },
                          { key: 'Snö', icon: 'snow' },
                          { key: 'Åska', icon: 'thunderstorm' },
                        ];
                        const localWeather = (Array.isArray(weatherOptions) && weatherOptions.length > 0)
                          ? weatherOptions.map(w => (typeof w === 'string' ? { key: w, icon: null } : w))
                          : (controlType === 'Mottagningskontroll' ? defaultWeatherOptions : []);
                        const meta = localWeather.find(w => (w.key || w) === selectedWeather);
                        return (meta && meta.icon) ? meta.icon : 'sunny';
                      })()}
                      size={14}
                      color={(() => {
                        const cmap = { sunny: '#FFD54F', 'partly-sunny': '#FFB74D', cloudy: '#90A4AE', rainy: '#4FC3F7', snow: '#90CAF9', thunderstorm: '#9575CD' };
                        const defaultWeatherOptions = [
                          { key: 'Soligt', icon: 'sunny' },
                          { key: 'Delvis molnigt', icon: 'partly-sunny' },
                          { key: 'Molnigt', icon: 'cloudy' },
                          { key: 'Regn', icon: 'rainy' },
                          { key: 'Snö', icon: 'snow' },
                          { key: 'Åska', icon: 'thunderstorm' },
                        ];
                        const localWeather = (Array.isArray(weatherOptions) && weatherOptions.length > 0)
                          ? weatherOptions.map(w => (typeof w === 'string' ? { key: w, icon: null } : w))
                          : (controlType === 'Mottagningskontroll' ? defaultWeatherOptions : []);
                        const meta = localWeather.find(w => (w.key || w) === selectedWeather);
                        const icon = meta && meta.icon ? meta.icon : 'sunny';
                        return cmap[icon] || '#1976D2';
                      })()}
                      style={{ marginRight: 6 }}
                    />
                    <Text style={{ color: '#222', marginRight: 8 }}>{selectedWeather}</Text>
                    <TouchableOpacity onPress={() => setSelectedWeather(null)}>
                      <Ionicons name="close-circle" size={18} color="#D32F2F" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowWeatherModal(true)} style={{ padding: 4, marginLeft: 8 }} accessibilityLabel="Lägg till väder">
              <Ionicons name="add-circle-outline" size={26} color="#1976D2" />
            </TouchableOpacity>
          </View>
        </View>
        {/* Horizontal divider between participants and material description */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
        {/* Weather selection modal triggered from participants area */}
        <Modal visible={showWeatherModal} transparent animationType="fade" onRequestClose={() => setShowWeatherModal(false)}>
          <TouchableOpacity activeOpacity={1} onPress={() => setShowWeatherModal(false)} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd' }}>
              <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>Välj väder</Text>
              </View>
              <View style={{ padding: 16, flexDirection: 'row', flexWrap: 'wrap' }}>
                {(() => {
                  const defaultWeatherOptions = [
                    { key: 'Soligt', icon: 'sunny' },
                    { key: 'Delvis molnigt', icon: 'partly-sunny' },
                    { key: 'Molnigt', icon: 'cloudy' },
                    { key: 'Regn', icon: 'rainy' },
                    { key: 'Snö', icon: 'snow' },
                    { key: 'Åska', icon: 'thunderstorm' },
                  ];
                  const localWeather = (Array.isArray(weatherOptions) && weatherOptions.length > 0)
                    ? weatherOptions.map(w => (typeof w === 'string' ? { key: w, icon: null } : w))
                    : (controlType === 'Mottagningskontroll' ? defaultWeatherOptions : []);
                  return localWeather.map(w => {
                    const label = w.key || w;
                    const iconName = w.icon || null;
                    const isSelected = selectedWeather === label;
                    return (
                        <TouchableOpacity key={`wm-${label}`} onPress={() => { setSelectedWeather(label); setShowWeatherModal(false); }} style={{ width: '48%', padding: 12, margin: '1%', backgroundColor: isSelected ? '#E8F0FF' : '#fff', borderRadius: 8, borderWidth: 1, borderColor: isSelected ? '#1976D2' : '#e0e0e0', alignItems: 'center' }}>
                          {iconName ? <Ionicons name={iconName} size={22} color={(() => { const cmap = { sunny: '#FFD54F', 'partly-sunny': '#FFB74D', cloudy: '#90A4AE', rainy: '#4FC3F7', snow: '#90CAF9', thunderstorm: '#9575CD' }; return isSelected ? '#1976D2' : (iconName && cmap[iconName] ? cmap[iconName] : '#444'); })()} style={{ marginBottom: 6 }} /> : null}
                          <Text style={{ color: isSelected ? '#1976D2' : '#444' }}>{label}</Text>
                        </TouchableOpacity>
                      );
                  });
                })()}
              </View>
              <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#eee', alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setShowWeatherModal(false)} style={{ paddingVertical: 10 }}>
                  <Text style={{ color: '#1976D2' }}>Stäng</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </Modal>
        {/* Material description for Mottagningskontroll */}
        {controlType === 'Mottagningskontroll' && (
          <View style={{ marginTop: 8, marginBottom: 10, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 15, color: (missingFields && missingFields.includes('Beskriv leverans')) ? '#D32F2F' : '#222', marginBottom: 6, fontWeight: '600' }}>Beskriv leverans</Text>
            <TextInput
              value={materialDesc}
              onChangeText={setMaterialDesc}
              placeholder="Ex: Gipsskivor, isolering, fönster..."
              placeholderTextColor="#888"
              style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
            />
            {/* Väderlek handled under participants (plus-button to add) */}
            {/* The per-section textareas for Leverans/Kvalitet/Täckning were removed as requested. */}
          </View>
        )}
        {/* Divider under participants, before weather */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
                {/* Button to choose categories for Arbetsberedning */}
        {controlType === 'Arbetsberedning' && Array.isArray(checklistConfig) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => setShowCategoryModal(true)}
              style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
              accessibilityRole="button"
            >
              <Ionicons name="options-outline" size={22} color="#1976D2" style={{ marginRight: 8 }} />
              <Text style={{ color: '#1976D2', fontWeight: '600', fontSize: 16 }}>Välj kategorier att gå igenom</Text>
            </TouchableOpacity>
          </View>
        )}
        {/* Add Participant Modal */}
        {/* Modal för Lägg till deltagare */}
        <Modal visible={showAddParticipantModal} transparent animationType="fade" onRequestClose={() => setShowAddParticipantModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }}>
            <KeyboardAvoidingView
              behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
              keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}
              style={{ flex: 1 }}
            >
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 140, paddingBottom: 24 }}>
                <View style={{ width: '100%', maxWidth: 300, backgroundColor: '#fff', borderRadius: 12, padding: 16, marginTop: 0, marginVertical: 8 }}>
                  <TouchableOpacity
                    onPress={() => setShowAddParticipantModal(false)}
                    style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, padding: 6 }}
                    accessibilityLabel="Stäng"
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Ionicons name="close" size={22} color="#888" />
                  </TouchableOpacity>
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>{editParticipantIndex !== null ? 'Redigera deltagare' : 'Lägg till deltagare'}</Text>
                  <TextInput
                    value={participantName}
                    onChangeText={setParticipantName}
                    placeholder="Namn"
                    placeholderTextColor="#888"
                    style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: '100%', marginBottom: 10 }}
                    returnKeyType="next"
                    onSubmitEditing={() => companyRef && companyRef.current && companyRef.current.focus()}
                    ref={nameRef}
                  />
                  <TextInput
                    value={participantCompany}
                    onChangeText={setParticipantCompany}
                    style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: '100%', marginBottom: 10 }}
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
                    style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: '100%', marginBottom: 10 }}
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
                    style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: '100%', marginBottom: 16 }}
                    placeholderTextColor="#888"
                    placeholder="Mobilnummer"
                    keyboardType="numeric"
                    autoCapitalize="none"
                    autoCorrect={false}
                    maxLength={13}
                    returnKeyType="done"
                    onSubmitEditing={() => {
                      // Save or update participant
                      if (!participantName.trim()) return;
                      const newP = { name: participantName.trim(), company: participantCompany.trim(), role: participantRole.trim(), phone: participantPhone.trim() };
                      if (editParticipantIndex !== null && editParticipantIndex >= 0) {
                        setLocalParticipants(prev => {
                          const a = Array.isArray(prev) ? [...prev] : [];
                          a[editParticipantIndex] = newP;
                          return a;
                        });
                      } else {
                        setLocalParticipants(prev => ([...(Array.isArray(prev) ? prev : []), newP]));
                      }
                      setShowAddParticipantModal(false);
                      setParticipantName('');
                      setParticipantCompany('');
                      setParticipantRole('');
                      setParticipantPhone('');
                      setEditParticipantIndex(null);
                    }}
                    ref={phoneRef}
                  />
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                      onPress={() => {
                        if (!participantName.trim()) return;
                        const newP = { name: participantName.trim(), company: participantCompany.trim(), role: participantRole.trim(), phone: participantPhone.trim() };
                        if (editParticipantIndex !== null && editParticipantIndex >= 0) {
                          setLocalParticipants(prev => {
                            const a = Array.isArray(prev) ? [...prev] : [];
                            a[editParticipantIndex] = newP;
                            return a;
                          });
                        } else {
                          setLocalParticipants(prev => ([...(Array.isArray(prev) ? prev : []), newP]));
                        }
                        setShowAddParticipantModal(false);
                        setParticipantName('');
                        setParticipantCompany('');
                        setParticipantRole('');
                        setParticipantPhone('');
                        setEditParticipantIndex(null);
                      }}
                      disabled={!participantName.trim()}
                    >
                      <Text style={{ color: '#1976D2', fontWeight: '400', fontSize: 16, opacity: participantName.trim() ? 1 : 0.4 }}>{editParticipantIndex !== null ? 'Spara' : 'Spara'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                      onPress={() => {
                        setShowAddParticipantModal(false);
                        setParticipantName('');
                        setParticipantCompany('');
                        setParticipantRole('');
                        setParticipantPhone('');
                        setEditParticipantIndex(null);
                      }}
                    >
                      <Text style={{ color: '#D32F2F', fontWeight: '400', fontSize: 16 }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>
            </KeyboardAvoidingView>
          </View>
        </Modal>
        {/* Divider under participants, before weather (removed duplicate) */}
        {/* Modal to add an extra signer (used by Lägg till signerare) */}
        <Modal visible={showAddSignerModal} transparent animationType="fade" onRequestClose={() => setShowAddSignerModal(false)}>
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ width: '90%', maxWidth: 340, backgroundColor: '#fff', borderRadius: 12, padding: 16 }}>
              <TouchableOpacity onPress={() => { setShowAddSignerModal(false); setSignerName(''); }} style={{ position: 'absolute', top: 8, right: 8, zIndex: 10, padding: 6 }}>
                <Ionicons name="close" size={22} color="#888" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 12, textAlign: 'center' }}>Lägg till signerare</Text>
              <TextInput
                value={signerName}
                onChangeText={setSignerName}
                placeholder="Namn på signerare"
                placeholderTextColor="#888"
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 10, fontSize: 16, marginBottom: 12 }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => { setShowAddSignerModal(false); setSignerName(''); }} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8 }}>
                  <Text style={{ color: '#777' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  const name = (signerName || '').trim();
                  if (!name) return;
                  setLocalParticipants(prev => ([...(Array.isArray(prev) ? prev : []), { name }]));
                  setSignerName('');
                  setShowAddSignerModal(false);
                }} style={{ flex: 1, alignItems: 'center', paddingVertical: 12 }}>
                  <Text style={{ color: '#1976D2', fontWeight: '600' }}>Lägg till</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Omfattning / beskrivning för Skyddsrond */}
        {controlType === 'Skyddsrond' && (
          <View style={{ marginTop: 8, marginBottom: 12, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 15, color: (missingFields && missingFields.includes('Omfattning / beskrivning av skyddsrond')) ? '#D32F2F' : '#222', marginBottom: 4, fontWeight: 'bold' }}>Omfattning / beskrivning av skyddsrond</Text>
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
        {/* Category selection modal for Arbetsberedning */}
        {showCategoryModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'center', zIndex: 300 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320, maxHeight: '70%', alignItems: 'stretch', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 8, marginTop: 120 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Välj kategorier</Text>
              <ScrollView style={{ marginBottom: 12 }}>
                {Array.isArray(checklistConfig) && checklistConfig.map((sec, idx) => (
                  <TouchableOpacity
                    key={`cat-${idx}`}
                    onPress={() => setSelectedCategories(prev => { const s = [...prev]; s[idx] = !s[idx]; return s; })}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                    hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                  >
                    <Ionicons name={selectedCategories[idx] ? 'checkbox' : 'square-outline'} size={20} color={selectedCategories[idx] ? '#1976D2' : '#666'} style={{ marginRight: 10 }} />
                    <Text style={{ fontSize: 15, color: '#222' }}>{sec.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <TouchableOpacity onPress={() => setShowCategoryModal(false)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8 }}>
                  <Text style={{ color: '#777' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    // Apply selected categories to checklist state
                    const newChecklist = (Array.isArray(checklistConfig) ? checklistConfig : [])
                      .map(section => ({ label: section.label, points: Array.isArray(section.points) ? [...section.points] : [], statuses: Array.isArray(section.points) ? Array(section.points.length).fill(null) : [], photos: Array.isArray(section.points) ? Array(section.points.length).fill([]) : [] }))
                      .filter((_, i) => selectedCategories[i]);
                    // Only update state if checklist actually changes
                    if (!shallowEqual(newChecklist, checklist)) {
                      setChecklist(newChecklist);
                    }
                    setExpandedChecklist([]);
                    setShowCategoryModal(false);
                  }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginLeft: 8 }}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '600' }}>Bekräfta</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      {/* Checklist rendering for Skyddsrond och andra kontroller */}
      {Array.isArray(checklist) && checklist.length > 0 && (
        <View style={{ marginTop: 8, marginBottom: 16, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: (missingFields && missingFields.includes('Kontrollpunkter')) ? '#D32F2F' : '#222', marginBottom: 10, marginLeft: 2 }}>Kontrollpunkter</Text>
          {checklist.map((section, sectionIdx) => {
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
                  onPress={() => {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setExpandedChecklist(prev => prev.includes(sectionIdx) ? [] : [sectionIdx]);
                  }}
                  activeOpacity={0.7}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel={`Visa eller dölj ${section.label}`}
                >
                  <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={20} color={'#1976D2'} style={{ marginRight: 8 }} />
                  <View style={{ flex: 1, flexDirection: 'column' }}>
                    <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 16, fontWeight: 'bold', color: sectionHeaderText }}>{section.label}</Text>
                    {(() => {
                      const deviationCount = (sectionStatuses || []).filter(s => s === 'avvikelse').length;
                      const okCount = (sectionStatuses || []).filter(s => s === 'ok').length;
                      const total = (section.points || []).length || 0;
                      return (
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                          <View style={{ backgroundColor: '#E8F5E9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12, marginRight: 8 }}>
                            <Text style={{ fontSize: 12, color: '#43A047', fontWeight: '600' }}>{`${okCount}/${total} godkända`}</Text>
                          </View>
                          {deviationCount > 0 && (
                            <View style={{ backgroundColor: '#FFF8E1', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 12 }}>
                              <Text style={{ fontSize: 12, color: '#F57C00', fontWeight: '600' }}>{`${deviationCount}/${total} avvikelse`}</Text>
                            </View>
                          )}
                        </View>
                      );
                    })()}
                  </View>
                  {/* Camera / check icons */}
                  {hasPhoto && (
                    <Ionicons name="camera" size={20} color="#1976D2" style={{ marginLeft: 8 }} />
                  )}
                  {/* Section menu button */}
                  <TouchableOpacity onPress={(e) => { e.stopPropagation && e.stopPropagation(); setSectionMenuIndex(prev => prev === sectionIdx ? null : sectionIdx); }} style={{ marginLeft: 10, padding: 6 }} accessibilityLabel={`Sektion meny ${section.label}`}>
                    <Ionicons name="ellipsis-vertical" size={18} color="#666" />
                  </TouchableOpacity>
                </TouchableOpacity>
                {sectionMenuIndex === sectionIdx && (
                  <View style={{ paddingHorizontal: 14, paddingBottom: 8, backgroundColor: '#fff' }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
                      <TouchableOpacity onPress={() => markAllOk(sectionIdx)} style={{ marginRight: 12 }}>
                        <Text style={{ color: '#1976D2' }}>Markera alla OK</Text>
                      </TouchableOpacity>
                          {/* Removed "Radera alla foton" as requested */}
                      <TouchableOpacity onPress={() => setSectionMenuIndex(null)}>
                        <Text style={{ color: '#777' }}>Stäng</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
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
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
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
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
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
                              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                              accessibilityRole="button"
                            >
                              <Ionicons name="close" size={22} color={status === 'ejaktuell' ? '#000' : '#bbb'} style={{ marginRight: 4 }} />
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
                          {/* Photo upload button + thumbnails (hidden per-point for Mottagningskontroll) */}
                          {controlType !== 'Mottagningskontroll' && (
                            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                              <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center' }}
                                onPress={() => handleNavigateToCamera(sectionIdx, pointIdx, project)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
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
                          )}
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
            const numSections = checklist.length;
            // Count all points
            let totalPoints = 0;
            let approvedPoints = 0;
            let deviationPoints = 0;
            let completedSections = 0;
            checklist.forEach((section, sectionIdx) => {
              totalPoints += (section.points || []).length;
              const statuses = checklist[sectionIdx]?.statuses || [];
              let allFilled = true;
              (section.points || []).forEach((_, pointIdx) => {
                if (statuses[pointIdx] === 'ok') approvedPoints++;
                if (statuses[pointIdx] === 'avvikelse') deviationPoints++;
                if (!statuses[pointIdx]) allFilled = false;
              });
              if ((section.points || []).length > 0 && allFilled) completedSections++;
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
          {/* Centralized photos (for Mottagningskontroll) */}
          {controlType === 'Mottagningskontroll' && (
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600' }}>Foton</Text>
                {(!Array.isArray(mottagningsPhotos) || mottagningsPhotos.length === 0) && (
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: '400', marginLeft: 6 }}>(valfritt)</Text>
                )}
                {/* Debug: show count of mottagningsPhotos */}
                <View style={{ marginLeft: 10 }}>
                  <Text style={{ fontSize: 12, color: '#1976D2' }}>{`Bilder: ${Array.isArray(mottagningsPhotos) ? mottagningsPhotos.length : 0}`}</Text>
                  {/* Removed verbose file path display (Senast: file://...) per UX request */}
                </View>
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', marginTop: 8 }}>
                <TouchableOpacity onPress={() => setShowPhotoChoice(true)} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#000', backgroundColor: 'transparent' }}>
                  <Ionicons name="camera" size={20} color="#000" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#000', fontWeight: '600' }}>Lägg till foto</Text>
                </TouchableOpacity>
              </View>
              {Array.isArray(mottagningsPhotos) && mottagningsPhotos.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {mottagningsPhotos.map((uri, idx) => (
                    <TouchableOpacity key={`m-photo-${idx}-${(uri && uri.uri) ? uri.uri.substring(uri.uri.length-8) : idx}`} onPress={() => setPhotoModal({ visible: true, uris: mottagningsPhotos, index: idx })} activeOpacity={0.85} style={{ marginRight: 8 }}>
                      <Image source={{ uri: uri && uri.uri ? uri.uri : uri }} style={{ width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#eee' }} />
                      {uri && uri.comment ? (
                        <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 }}>
                          <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>{uri.comment}</Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>
          )}
      {(controlType === 'Mottagningskontroll' || controlType === 'Skyddsrond') && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Text style={{ fontSize: 15, color: (missingFields && missingFields.includes('Signaturer')) ? '#D32F2F' : '#222', fontWeight: '600', marginBottom: 8 }}>Signaturer</Text>
            <TouchableOpacity onPress={() => setShowAddSignerModal(true)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#1976D2' }}>Lägg till signerare</Text>
            </TouchableOpacity>
          </View>
          {localParticipants && localParticipants.length > 0 ? (
            localParticipants.map((p, pIdx) => {
              const name = (typeof p === 'object' && p !== null) ? (p.name || `${p.company || ''}`) : (p || `Deltagare ${pIdx+1}`);
              const existing = (mottagningsSignatures || []).find(s => s.name === name);
              return (
                <View key={`sig-${pIdx}-${name}`} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <Text style={{ fontSize: 15, color: '#222' }}>{name}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    {existing ? (
                      <>
                        {existing.strokes ? (
                          <Svg width={120} height={48} viewBox={`0 0 ${sigCanvasSize} ${sigCanvasSize / 2}`} style={{ marginRight: 8 }}>
                            {existing.strokes.map((stroke, si) => (
                              <Path
                                key={`ps-${si}`}
                                d={pointsToPath(stroke)}
                                fill="none"
                                stroke="#000"
                                strokeWidth={2}
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              />
                            ))}
                          </Svg>
                        ) : (
                          <Image source={{ uri: existing.uri }} style={{ width: 120, height: 48, borderRadius: 6, marginRight: 8, borderWidth: 1, borderColor: '#e0e0e0' }} />
                        )}
                        <TouchableOpacity onPress={() => { const v = existing.strokes || []; setSignatureForIndex(pIdx); setSigStrokes(v); try { sigStrokesRef.current = v; } catch (e) {} }} style={{ paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 }}>
                          <Text style={{ color: '#1976D2' }}>Byt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setMottagningsSignatures(prev => prev.filter(s => s.name !== name))} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ color: '#D32F2F' }}>Ta bort</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => { setSignatureForIndex(pIdx); const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (e) {} }} style={{ paddingHorizontal: 6, paddingVertical: 2 }} accessibilityLabel="Lägg till signatur">
                        <Ionicons name="add-circle-outline" size={24} color="#1976D2" />
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              );
            })
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text style={{ fontSize: 15, color: '#222' }}>Signatur</Text>
              <TouchableOpacity onPress={() => { setSignatureForIndex('mottagnings'); const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (e) {} }} style={{ paddingVertical: 4, paddingHorizontal: 6 }} accessibilityLabel="Lägg till signatur">
                <Ionicons name="add-circle-outline" size={28} color="#1976D2" />
              </TouchableOpacity>
            </View>
          )}
          
          <Modal visible={showPhotoChoice} transparent animationType="fade" onRequestClose={() => setShowPhotoChoice(false)}>
            <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd' }}>
                    <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                      <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>Bifoga bild</Text>
                    </View>
                    <View style={{ padding: 16 }}>
                      <TouchableOpacity onPress={() => { setShowPhotoChoice(false); handleNavigateToCamera(null, null, project); }} style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="camera" size={20} color="#000" style={{ marginRight: 10 }} />
                        <Text style={{ color: '#1976D2', fontSize: 16 }}>Ta foto</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => { setShowPhotoChoice(false); setTimeout(() => handlePickFromLibrary(), 200); }} style={{ paddingVertical: 12, flexDirection: 'row', alignItems: 'center' }}>
                        <Ionicons name="images" size={20} color="#000" style={{ marginRight: 10 }} />
                        <Text style={{ color: '#1976D2', fontSize: 16 }}>Välj från bibliotek</Text>
                      </TouchableOpacity>
                  <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 8 }}>
                    <TouchableOpacity onPress={() => setShowPhotoChoice(false)} style={{ padding: 8 }}>
                      <Text style={{ color: '#777' }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        </View>
      )}
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
          onPress={handleAttemptFinish}
          style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0, opacity: canFinish ? 1 : 0.5 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color={canFinish ? '#1976D2' : '#AAA'} style={{ marginRight: 8 }} />
            <Text style={{ color: canFinish ? '#1976D2' : '#AAA', fontWeight: 'bold', fontSize: 16 }}>Slutför</Text>
          </View>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSaveDraft}
          style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="save-outline" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
            <Text style={{ color: '#D32F2F', fontWeight: 'bold', fontSize: 16 }}>Spara utkast</Text>
          </View>
        </TouchableOpacity>
      </View>
      {/* Signature Modal (JS fallback) */}
      <Modal visible={signatureForIndex !== null} transparent animationType="slide" onRequestClose={() => setSignatureForIndex(null)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', alignItems: 'center', paddingBottom: 12 }}>
          <View style={{ width: '100%', maxWidth: sigCanvasSize + 32, backgroundColor: '#fff', borderTopLeftRadius: 12, borderTopRightRadius: 12, padding: 12, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8 }}>Signera med fingret</Text>
            <View style={{ width: sigCanvasSize, height: sigCanvasSize / 2, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, overflow: 'hidden' }} {...panResponder.panHandlers}>
              <Svg width={sigCanvasSize} height={sigCanvasSize / 2}>
                {sigStrokes.map((stroke, si) => (
                  <Path key={`s-${si}`} d={pointsToPath(stroke)} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                ))}
                {sigCurrent && sigCurrent.length > 0 && (
                  <Path d={pointsToPath(sigCurrent)} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                )}
              </Svg>
            </View>
            <View style={{ flexDirection: 'row', marginTop: 12, width: '100%', justifyContent: 'space-between' }}>
              <TouchableOpacity onPress={() => { const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (e) {} setSigCurrent([]); }} style={{ padding: 10 }}>
                <Text style={{ color: '#D32F2F' }}>Rensa</Text>
              </TouchableOpacity>
              <View style={{ flexDirection: 'row' }}>
                <TouchableOpacity onPress={() => setSignatureForIndex(null)} style={{ padding: 10, marginRight: 8 }}>
                  <Text style={{ color: '#777' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => {
                  try {
                    const strokesToSave = Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : sigStrokes;
                    // Save signature strokes for participant or generic
                    if (signatureForIndex === 'mottagnings') {
                      setMottagningsSignatures(prev => [...(prev || []), { name: 'Signerad', strokes: strokesToSave }]);
                    } else if (typeof signatureForIndex === 'number') {
                      const p = localParticipants[signatureForIndex];
                      const name = (typeof p === 'object' && p !== null) ? (p.name || `${p.company || ''}`) : (p || `Deltagare ${signatureForIndex+1}`);
                      setMottagningsSignatures(prev => {
                        const others = (prev || []).filter(s => s.name !== name);
                        return [...others, { name, strokes: strokesToSave }];
                      });
                    }
                    // Reset local signature drawing state and close modal
                    const v = [];
                    setSigStrokes(v);
                    try { sigStrokesRef.current = v; } catch (e) {}
                    setSigCurrent([]);
                    setSignatureForIndex(null);
                  } catch (e) {}
                }} style={{ padding: 10 }}>
                  <Text style={{ color: '#1976D2', fontWeight: '600' }}>OK</Text>
                </TouchableOpacity>
                
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  </View>
  </ScrollView>
  </>
  );
}
