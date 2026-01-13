




import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useEffect, useMemo, useRef, useState } from 'react';

// import BottomSheet from '@gorhom/bottom-sheet';
import { Alert, Dimensions, Image, InteractionManager, Keyboard, KeyboardAvoidingView, LayoutAnimation, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, UIManager, useColorScheme, useWindowDimensions, View } from 'react-native';

import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import 'react-native-get-random-values';
import Svg, { Path } from 'react-native-svg';
import { v4 as uuidv4 } from 'uuid';
import { Colors } from '../constants/theme';
import { createByggdelMall, deleteByggdelMall, deleteDraftControlFromFirestore, fetchByggdelHierarchy, fetchByggdelMallar, saveByggdelHierarchy, saveDraftToFirestore, updateByggdelMall } from './firebase';
import { CompanyHeaderLogo } from './HeaderComponents';
// Load ImagePicker dynamically inside handlers to avoid web-only export issues
let ImagePicker = null;

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
  onExit,
  onFinished,
  initialValues = {},
  hideWeather = false,
  hideProjectHeader = false,
  templatePreviewMode = false,
}) {
  const { height: windowHeight } = useWindowDimensions();
  const onExitRef = useRef(onExit);
  useEffect(() => {
    onExitRef.current = onExit;
  }, [onExit]);

  const arbetsberedningCategoryKey = (projectId) => `dk_ab_categories_${String(projectId || '').trim()}`;
  const arbetsberedningActiveByggdelKey = (projectId) => `dk_ab_active_byggdel_${String(projectId || '').trim()}`;
  const didInitArbetsberedningCategoriesRef = useRef(false);
  const loadedAktivaByggdelPidRef = useRef('');

  const suppressNextMallPressRef = useRef(false);
  const formatByggdelLabelFromTemplate = (tpl) => {
    try {
      if (!tpl) return '';
      const hg = tpl.huvudgrupp || '';
      const mm = tpl.moment || '';
      const nm = tpl.mallName || tpl.name || '';
      const parts = [hg, mm, nm].map(x => String(x || '').trim()).filter(Boolean);
      return parts.join(' / ');
    } catch (_e) {
      return '';
    }
  };

  const formatByggdelMomentLabelFromTemplate = (tpl) => {
    try {
      if (!tpl) return '';
      const hg = tpl.huvudgrupp || '';
      const mm = tpl.moment || '';
      const parts = [hg, mm].map(x => String(x || '').trim()).filter(Boolean);
      return parts.join(' / ');
    } catch (_e) {
      return '';
    }
  };

  const fixedByggdelHuvudgrupper = useMemo(() => (
    [
      '0 - Sammansatta byggdelar',
      '1 - Mark',
      '2 - Husunderbyggnad',
      '3 - Stomme',
      '4 - Yttertak',
      '5 - Fasad',
      '6 - Stomkomplettering',
      '7 - Invändiga ytskikt',
      '8 - Installationer',
      '9 - Gemensamma arbeten',
    ]
  ), []);

  const byggdelHuvudgruppOptions = fixedByggdelHuvudgrupper;

  const defaultByggdelMomentsByGroup = useMemo(() => (
    {
      // Prefer numeric prefix keys so labels can change without breaking lookups
      '0': ['03 - Rivning', '06 - Håltagning'],
      '1': ['10 - Markarbeten'],
      '2': ['23 - Markförstärkningar', '24 - Grundkonstruktioner', '25 - Kulvert', '27 - Platta på mark'],
      '3': [
        '30 - Sammansatta',
        '31 - Väggar',
        '32 - Pelare',
        '33 - Prefab',
        '34 - Bjälklag/Balkar',
        '35 - Smide',
        '36 - Trappor/Hiss/Schakt',
        '37 - Samverkande takstomme',
        '38 - Huskomplettering',
        '39 - Hall/UE (Tätt hus)',
      ],
      '4': [
        '40 - Sammansatta',
        '41 - Takstomme',
        '42 - Taklagskomplettering',
        '43 - Taktäckning',
        '44 - Takfot & gavlar',
        '45 - Öppningskomplettering (takluckor)',
        '47 - Terrasser/altaner',
        '48 - Huskomplettering',
        '49 - Plåt',
      ],
      '5': [
        '50 - Sammansatta',
        '51 - Stomkomplettering (utfackning)',
        '53 - Fasadbeklädnad/ytskikt',
        '55 - Fönster/dörrar/partier',
        '56 - Utvändiga trappor',
        '58 - Huskomplettering',
      ],
      '6': [
        '60 - Sammansatta',
        '61 - Insida yttervägg',
        '62 - Undergolv',
        '63 - Innerväggar',
        '64 - Innertak',
        '65 - Invändiga dörrar & partier',
        '66 - Invändiga trappor',
        '67 - Brandskydd',
        '68 - Huskomplettering',
        '69 - Lås & passer',
      ],
      '7': [
        '70 - Sammansatta',
        '71 - Kakel/klinkers/keramik',
        '72 - Ytskikt golv & trappor',
        '73 - Ytskikt vägg',
        '74 - Ytskikt tak/undertak',
        '75 - Målning',
        '76 - Vita varor',
        '77 - Skåp & inredningssnickerier',
        '78 - Rumskomplettering/övrigt',
      ],
      '8': [
        '80 - Sammansatta',
        '81 - Sprinkler',
        '82 - Process',
        '83 - Storkök',
        '84 - Sanitet/värme',
        '85 - Luft',
        '86 - El',
        '87 - Transport',
        '88 - Styr',
        '89 - Kyla',
      ],
      '9': [
        '90 - Hyresmaskiner',
        '91 - Gemensamma arbeten',
        '92 - Ställningar',
        '94 - Kran & lyft',
        '96 - Bodar/etablering',
        '98 - Konsulter',
        '99 - TJ-tid',
      ],
    }
  ), []);

  const mergeByggdelMomentsByGroup = (existing) => {
    const safeExisting = (existing && typeof existing === 'object') ? existing : {};
    let changed = false;
    const merged = { ...safeExisting };

    const mergeList = (current, additions) => {
      const base = Array.isArray(current) ? current.map(x => String(x || '').trim()).filter(Boolean) : [];
      const add = Array.isArray(additions) ? additions.map(x => String(x || '').trim()).filter(Boolean) : [];
      const set = new Set(base);
      const out = [...base];
      for (const item of add) {
        if (!set.has(item)) {
          set.add(item);
          out.push(item);
        }
      }
      return out;
    };

    for (const key of Object.keys(defaultByggdelMomentsByGroup)) {
      const defaults = defaultByggdelMomentsByGroup[key];
      const current = merged[key];
      const next = mergeList(current, defaults);
      if (!Array.isArray(current) || next.length !== (Array.isArray(current) ? current.length : 0)) {
        merged[key] = next;
        changed = true;
      }
    }

    return { merged, changed };
  };
  // State för deltagar-modalens fält (måste ligga här!)
  const [participantName, setParticipantName] = useState('');
  const [participantCompany, setParticipantCompany] = useState('');
  // State för åtgärd (remediation)
  const [remediationModal, setRemediationModal] = useState({ visible: false, sectionIdx: null, pointIdx: null, comment: '', name: '', date: '', infoMode: false });
  // expandedChecklist is declared above (moved earlier)
  // State for adding custom checklist points
  const [addPointModal, setAddPointModal] = useState({ visible: false, sectionIdx: null });
  const [newPointText, setNewPointText] = useState('');
  const [newPointActionText, setNewPointActionText] = useState('');
  const [sectionMenuIndex, setSectionMenuIndex] = useState(null);
  const [participantRole, setParticipantRole] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [editParticipantIndex, setEditParticipantIndex] = useState(null);
  // State for cancel edit confirmation modal
  const [showCancelEditConfirm, setShowCancelEditConfirm] = useState(false);
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
      } catch (_e) {
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

  const weatherPayload = useMemo(
    () => (hideWeather ? {} : { weather: selectedWeather }),
    [hideWeather, selectedWeather]
  );
  const [byggdelTemplate, setByggdelTemplate] = useState(initialValues.byggdelTemplate || null);
  const [byggdel, setByggdel] = useState(initialValues.byggdel || formatByggdelLabelFromTemplate(initialValues.byggdelTemplate) || '');
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
  // ...existing code...
  const routeParams = route && route.params ? route.params : {};
  const isTemplatePreview = !!(templatePreviewMode || (routeParams && routeParams.previewFromTemplate));
  const participantsLabel = controlType === 'Mottagningskontroll' ? 'Mottagare' : 'Deltagare';
  const addParticipantsLabel = controlType === 'Mottagningskontroll' ? 'Lägg till mottagare' : 'Lägg till deltagare';
  const editParticipantsLabel = controlType === 'Mottagningskontroll' ? 'Redigera mottagare' : 'Redigera deltagare';
  const [showBackConfirm, setShowBackConfirm] = useState(false);
  const [backConfirmMode, setBackConfirmMode] = useState('dirty'); // 'dirty' | 'exit'
  const [showFinishConfirm, setShowFinishConfirm] = useState(false);
  const [showDraftSavedConfirm, setShowDraftSavedConfirm] = useState(false);
  const finishingSaveRef = useRef(false);
  // Ref to store blocked navigation event
  const blockedNavEvent = useRef(null);
  // Keep a ref copy of isDirty so the beforeRemove listener can be attached once
  const isDirtyRef = useRef(false);
  // Prevent duplicate rapid saves of drafts
  const savingDraftRef = useRef(false);
  const lastSavedDraftRef = useRef(null);

  // Web-only: allow parent (HomeScreen) to coordinate project switching
  // when the user is inside an inline control form.
  const dispatchInlineExitDecision = (decision) => {
    if (Platform.OS !== 'web') return;
    try {
      if (typeof window === 'undefined' || !window.dispatchEvent) return;
      window.dispatchEvent(new CustomEvent('dkInlineExitDecision', { detail: { decision: String(decision || '') } }));
    } catch (_e) {}
  };

  const closeBackConfirm = (decision) => {
    try { setShowBackConfirm(false); } catch (_e) {}
    if (decision) dispatchInlineExitDecision(decision);
  };

  const handleAttemptFinish = () => {
    // Special validation rules for Mottagningskontroll and Skyddsrond
    if (controlType !== 'Mottagningskontroll' && controlType !== 'Skyddsrond') {
      handleSave();
      return;
    }
    const missing = [];
    // Date is optional for Mottagningskontroll; do not mark as missing
    if (!Array.isArray(localParticipants) || localParticipants.length === 0) missing.push(participantsLabel);
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
      // More descriptive guidance when saving fails validation
      const humanMsg = 'Följande saknas: ' + missing.join(', ') + '.\nFyll i saknade fält eller markera kontrollpunkter. Om en avvikelse är åtgärdad, öppna punkten och tryck Åtgärda för att spara åtgärdsinfo.';
      Alert.alert('Saknas', humanMsg);
      if (scrollRef && scrollRef.current && scrollRef.current.scrollTo) {
        scrollRef.current.scrollTo({ y: 0, animated: true });
      }
    }
  };

  // Add beforeRemove event once to block navigation if dirty (use ref inside)
  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', (e) => {
      if (!isDirtyRef.current) return; // Allow navigation if not dirty
      e.preventDefault();
      blockedNavEvent.current = e;
      try { setBackConfirmMode('dirty'); } catch (_e) {}
      setShowBackConfirm(true);
    });
    return unsubscribe;
  }, [navigation]);

  // Web (inline mode): allow browser back button to trigger the same
  // unsaved-changes flow (save draft or abort) instead of forcing the user
  // to press the in-app "Avbryt" button.
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history || typeof window.history.pushState !== 'function') return;
    // Only enable this guard when the form is rendered inline (i.e. it has an onExit handler)
    if (typeof onExitRef.current !== 'function') return;

    const guardId = String(Date.now()) + '-' + Math.random().toString(36).slice(2);
    const pushGuard = () => {
      try {
        window.history.pushState({ ...(window.history.state || {}), dkInlineControl: guardId }, '');
      } catch (_e) {}
    };
    pushGuard();

    const requestExitConfirm = (mode) => {
      try {
        // Re-add guard entry so the user stays "here" until they choose.
        pushGuard();
      } catch (_e) {}
      try { setBackConfirmMode(mode || 'exit'); } catch (_e) {}
      try { setShowBackConfirm(true); } catch (_e) {}
    };

    const onPopState = () => {
      try {
        // Always confirm when leaving an inline control (prevents accidental project switch)
        if (isDirtyRef.current) requestExitConfirm('dirty');
        else requestExitConfirm('exit');
      } catch (_e) {}
    };

    const onAttemptExit = () => {
      try {
        if (isDirtyRef.current) requestExitConfirm('dirty');
        else requestExitConfirm('exit');
      } catch (_e) {}
    };

    window.addEventListener('popstate', onPopState);
    window.addEventListener('dkInlineAttemptExit', onAttemptExit);
    return () => {
      try { window.removeEventListener('popstate', onPopState); } catch (_e) {}
      try { window.removeEventListener('dkInlineAttemptExit', onAttemptExit); } catch (_e) {}
    };
  }, []);
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

    // 0) If viewing mall (template) photos, remove only from mall draft
    try {
      const mallSectionId = photoModal && photoModal.mallSectionId ? String(photoModal.mallSectionId) : '';
      const mallPointIdx = (photoModal && typeof photoModal.mallPointIdx === 'number') ? photoModal.mallPointIdx : null;
      if (mallSectionId && mallPointIdx !== null && mallPointIdx >= 0) {
        setByggdelMallSectionsDraft(prev => {
          const arr = Array.isArray(prev) ? prev : [];
          return arr.map(s => {
            if (String(s && s.id ? s.id : '') !== mallSectionId) return s;
            const pts = Array.isArray(s && s.points) ? s.points : [];
            const photosOuter = Array.isArray(s && s.photos) ? s.photos : Array(pts.length).fill(null).map(() => []);
            const photos = photosOuter.map(a => Array.isArray(a) ? [...a] : (a ? [a] : []));
            if (!Array.isArray(photos[mallPointIdx])) photos[mallPointIdx] = [];
            const list = photos[mallPointIdx] || [];
            const pos = list.findIndex(item => (item && item.uri) ? item.uri === uri : item === uri);
            if (pos !== -1) {
              photos[mallPointIdx] = list.filter((_, i) => i !== pos);
            }
            return Object.assign({}, s, { photos });
          });
        });
        const newUris = uris.filter((u, i) => i !== index);
        const newIndex = Math.max(0, index - 1);
        setPhotoModal({ visible: newUris.length > 0, uris: newUris, index: newUris.length > 0 ? newIndex : 0, mallSectionId, mallPointIdx });
        return;
      }
    } catch (_e) {}

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
    } catch (_e) {
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
    } catch (_e) {
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
    // Always prefer params.savedChecklist if present and non-empty, else checklistConfig
    let raw = [];
    if (!isTemplatePreview && routeParams && Array.isArray(routeParams.savedChecklist) && routeParams.savedChecklist.length > 0) {
      raw = routeParams.savedChecklist;
    } else if (!isTemplatePreview && initialValues && Array.isArray(initialValues.checklist) && initialValues.checklist.length > 0) {
      raw = initialValues.checklist;
    } else if (Array.isArray(checklistConfig) && checklistConfig.length > 0) {
      // Arbetsberedning: start with no visible sections until user selects categories
      if (controlType === 'Arbetsberedning') {
        raw = [];
      } else {
      raw = checklistConfig.map(section => ({
        label: section.label,
        points: Array.isArray(section.points) ? [...section.points] : [],
        statuses: Array(Array.isArray(section.points) ? section.points.length : 0).fill(null),
        photos: Array(Array.isArray(section.points) ? section.points.length : 0).fill([]),
          comments: Array(Array.isArray(section.points) ? section.points.length : 0).fill(''),
      }));
      }
    } else if (controlType === 'Mottagningskontroll') {
      // Use predefined Mottagningskontroll sections when no checklistConfig is provided
      raw = mottagningsTemplate.map(section => ({ label: section.label, points: Array.isArray(section.points) ? [...section.points] : [] }));
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
      const comments = Array.isArray(section.comments) && Array.isArray(points) && section.comments.length === points.length
        ? section.comments
        : Array(Array.isArray(points) ? points.length : 0).fill('');
      return {
        label: section.label,
        points,
        statuses,
        photos,
        comments,
      };
    });
  });

  // Keep a ref of checklist to avoid stale closures when updating params
  const checklistRef = useRef(checklist);
  useEffect(() => { checklistRef.current = checklist; }, [checklist]);

  const byggdelMallLocksCategories = useMemo(() => {
    if (controlType !== 'Arbetsberedning') return false;
    const tpl = byggdelTemplate || null;
    return !!(tpl && (tpl.mallId || tpl.mallName || tpl.name));
  }, [controlType, byggdelTemplate]);

  const hasAnyChecklistPoints = (list) => {
    try {
      const arr = Array.isArray(list) ? list : [];
      for (const sec of arr) {
        const pts = Array.isArray(sec && sec.points) ? sec.points : [];
        if (pts.length > 0) return true;
      }
      return false;
    } catch (_e) {
      return false;
    }
  };

  const buildChecklistFromMallPoints = ({ mallName, points, sections }) => {
    const coerceArrayLike = (v) => {
      if (Array.isArray(v)) return v;
      if (v && typeof v === 'object') {
        const keys = Object.keys(v).filter(k => String(parseInt(k, 10)) === k).map(k => parseInt(k, 10)).sort((a, b) => a - b);
        if (!keys.length) return [];
        const arr = [];
        keys.forEach(k => { arr[k] = v[k]; });
        return arr;
      }
      return [];
    };

    const secArr = Array.isArray(sections) ? sections : [];
    const normalizedSections = secArr
      .map(s => {
        const label = String(s && (s.title ?? s.label ?? '')).trim();
        const pts = (Array.isArray(s && s.points) ? s.points : []).map(p => String(p || '').trim()).filter(Boolean);
        const rawStatuses = coerceArrayLike(s && s.statuses);
        const statuses = pts.map((_, i) => {
          const v = rawStatuses[i];
          return (v === 'ok' || v === 'avvikelse' || v === 'ejaktuell') ? v : null;
        });
        const rawPhotosOuter = coerceArrayLike(s && s.photos);
        const photos = pts.map((_, i) => {
          const row = rawPhotosOuter[i];
          const list = Array.isArray(row) ? row : (row ? [row] : []);
          return list
            .map(item => {
              if (!item) return null;
              if (typeof item === 'string') return item;
              if (item && typeof item === 'object' && item.uri) return { uri: item.uri, comment: item.comment || '' };
              return null;
            })
            .filter(Boolean);
        });
        return { label, points: pts, statuses, photos };
      })
      .filter(s => (String(s.label || '').trim() || (Array.isArray(s.points) && s.points.length > 0)));

    if (normalizedSections.length > 0) {
      return normalizedSections.map(s => {
        const lbl = String(s.label || '').trim() || String(mallName || 'Mall');
        const pts = Array.isArray(s.points) ? s.points : [];
        return {
          label: lbl,
          points: pts,
          statuses: (Array.isArray(s.statuses) && s.statuses.length === pts.length) ? s.statuses : Array(pts.length).fill(null),
          photos: (Array.isArray(s.photos) && s.photos.length === pts.length) ? s.photos.map(a => Array.isArray(a) ? a : (a ? [a] : [])) : Array(pts.length).fill(null).map(() => []),
          comments: Array(pts.length).fill(''),
        };
      });
    }

    const pts = (Array.isArray(points) ? points : []).map(p => String(p || '').trim()).filter(Boolean);
    return [
      {
        label: String(mallName || 'Mall'),
        points: pts,
        statuses: Array(pts.length).fill(null),
        photos: Array(pts.length).fill([]),
        comments: Array(pts.length).fill(''),
      },
    ];
  };

  // Track initial state for dirty checking
  const initialChecklist = useMemo(() => {
    if (!isTemplatePreview && routeParams && Array.isArray(routeParams.savedChecklist) && routeParams.savedChecklist.length > 0) {
      return routeParams.savedChecklist;
    }
    if (!isTemplatePreview && initialValues && Array.isArray(initialValues.checklist) && initialValues.checklist.length > 0) {
      return initialValues.checklist;
    }
    // Arbetsberedning: baseline is empty until user selects categories
    if (controlType === 'Arbetsberedning') return [];
    if (Array.isArray(checklistConfig)) {
      return checklistConfig.map(section => ({
        label: section.label,
        points: Array.isArray(section.points) ? [...section.points] : [],
        statuses: Array(Array.isArray(section.points) ? section.points.length : 0).fill(null),
        photos: Array(Array.isArray(section.points) ? section.points.length : 0).fill([]),
        comments: Array(Array.isArray(section.points) ? section.points.length : 0).fill(''),
      }));
    }
    return [];
  }, [checklistConfig, controlType, initialValues, routeParams, isTemplatePreview]);

  const initialParticipants = useMemo(() => {
    if (initialValues && Array.isArray(initialValues.participants) && initialValues.participants.length > 0) return initialValues.participants;
    return Array.isArray(participants) ? participants : [];
  }, [participants, initialValues]);
  const initialDate = useMemo(() => date || initialValues.date || '', [date, initialValues.date]);
  const initialWeather = useMemo(() => initialValues.weather || null, [initialValues.weather]);
  const initialByggdel = useMemo(() => initialValues.byggdel || formatByggdelLabelFromTemplate(initialValues.byggdelTemplate) || '', [initialValues.byggdel, initialValues.byggdelTemplate]);
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

  // NOTE: These states must be declared before any hook (e.g. isDirty) references them.
  // Otherwise web can crash with "Cannot access '<var>' before initialization".
  const todayIso = new Date().toISOString().slice(0, 10);
  const [dateValue, setDateValue] = useState(date || (initialValues && initialValues.date) || todayIso);
  // Ensure dateValue is populated if props arrive asynchronously or after hot restart
  useEffect(() => {
    if (!dateValue || dateValue === '') {
      const fallback = date || (initialValues && initialValues.date) || todayIso;
      setDateValue(fallback);
    }
  }, [date, initialValues && initialValues.date]);
  const [deliveryDesc, setDeliveryDesc] = useState((initialValues && initialValues.deliveryDesc) || '');
  const [generalNote, setGeneralNote] = useState((initialValues && initialValues.generalNote) || '');

  // Keep missing-field highlights until the user fixes them.
  // IMPORTANT: This must be declared after the dependent state variables,
  // otherwise web can crash with "Cannot access '<var>' before initialization".
  useEffect(() => {
    if (!Array.isArray(missingFields) || missingFields.length === 0) return;

    const descLabel = (controlType === 'Skyddsrond') ? 'Omfattning / beskrivning av skyddsrond' : 'Beskriv leverans';

    const stillMissing = (label) => {
      if (label === participantsLabel || label === 'Deltagare') {
        return !(Array.isArray(localParticipants) && localParticipants.length > 0);
      }
      if (label === descLabel) {
        if (controlType === 'Skyddsrond') {
          return !(typeof deliveryDesc === 'string' && deliveryDesc.trim().length > 0);
        }
        // Mottagningskontroll has historically used both fields; accept either.
        const hasDelivery = typeof deliveryDesc === 'string' && deliveryDesc.trim().length > 0;
        const hasMaterial = typeof materialDesc === 'string' && materialDesc.trim().length > 0;
        return !(hasDelivery || hasMaterial);
      }
      if (label === 'Kontrollpunkter') {
        if (!Array.isArray(checklist) || checklist.length === 0) return false;
        return checklist.some(sec => !(Array.isArray(sec.statuses) && sec.statuses.every(s => !!s)));
      }
      if (label === 'Signaturer' || label === 'Signatur') {
        return !(Array.isArray(mottagningsSignatures) && mottagningsSignatures.length > 0);
      }
      return true;
    };

    const nextMissing = missingFields.filter(stillMissing);
    if (nextMissing.length !== missingFields.length) {
      setMissingFields(nextMissing);
    }
  }, [missingFields, controlType, localParticipants, deliveryDesc, materialDesc, checklist, mottagningsSignatures]);

  // Dirty state: true if any field differs from initial
  const isDirty = useMemo(() => {
    if (!shallowEqual(localParticipants, initialParticipants)) return true;
    if (!shallowEqual(checklist, initialChecklist)) return true;
    if (dateValue !== initialDate) return true;
    if (selectedWeather !== initialWeather) return true;
    if ((byggdel || '') !== (initialByggdel || '')) return true;
    if (deliveryDesc !== initialDeliveryDesc) return true;
    if (generalNote !== initialGeneralNote) return true;
    if (materialDesc !== initialMaterialDesc) return true;
    if (qualityDesc !== initialQualityDesc) return true;
    if (coverageDesc !== initialCoverageDesc) return true;
    if (!shallowEqual(mottagningsSignatures, initialMottagningsSignatures)) return true;
    if (!shallowEqual(mottagningsPhotos, initialMottagningsPhotos)) return true;
    return false;
  }, [localParticipants, checklist, dateValue, selectedWeather, byggdel, deliveryDesc, generalNote, materialDesc, qualityDesc, coverageDesc, mottagningsSignatures, mottagningsPhotos, initialParticipants, initialChecklist, initialDate, initialWeather, initialByggdel, initialDeliveryDesc, initialGeneralNote, initialMaterialDesc, initialQualityDesc, initialCoverageDesc, initialMottagningsSignatures, initialMottagningsPhotos]);
  // Keep isDirtyRef in sync with latest computed isDirty
  useEffect(() => { isDirtyRef.current = isDirty; }, [isDirty]);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [showAddSignerModal, setShowAddSignerModal] = useState(false);
  const [signerName, setSignerName] = useState('');
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [showByggdelModal, setShowByggdelModal] = useState(false);
  const [showAktivaByggdelarModal, setShowAktivaByggdelarModal] = useState(false);
  const [aktivaByggdelarSelectedKeys, setAktivaByggdelarSelectedKeys] = useState([]);
  const [aktivaByggdelarDraftKeys, setAktivaByggdelarDraftKeys] = useState([]);
  const [aktivaByggdelarExpandedPrefix, setAktivaByggdelarExpandedPrefix] = useState('');
  const [byggdelHierarchyLoading, setByggdelHierarchyLoading] = useState(false);
  const [byggdelMomentsByGroup, setByggdelMomentsByGroup] = useState(() => defaultByggdelMomentsByGroup);
  const [byggdelMallarLoading, setByggdelMallarLoading] = useState(false);
  const [byggdelMallar, setByggdelMallar] = useState([]);
  const [byggdelHuvudgruppDraft, setByggdelHuvudgruppDraft] = useState('');
  const [byggdelMomentDraft, setByggdelMomentDraft] = useState('');
  const [byggdelMallDraft, setByggdelMallDraft] = useState(null);
  const [byggdelExpandedHuvudgrupp, setByggdelExpandedHuvudgrupp] = useState('');
  const [byggdelExpandedMomentKey, setByggdelExpandedMomentKey] = useState('');
  const [showByggdelHuvudgruppRolldown, setShowByggdelHuvudgruppRolldown] = useState(true);
  const [showKontrollplanRolldown, setShowKontrollplanRolldown] = useState(true);
  const [newByggdelMallName, setNewByggdelMallName] = useState('');
  const [savingByggdelMall, setSavingByggdelMall] = useState(false);
  const [deletingByggdelMallId, setDeletingByggdelMallId] = useState('');
  const [showCreateByggdelMallModal, setShowCreateByggdelMallModal] = useState(false);
  const [createByggdelMallContext, setCreateByggdelMallContext] = useState(null);
  const [showByggdelMallEditor, setShowByggdelMallEditor] = useState(false);
  const [byggdelMallEditor, setByggdelMallEditor] = useState(null);
  const [byggdelMallSectionsDraft, setByggdelMallSectionsDraft] = useState([]);
  const [newByggdelMallSectionTitle, setNewByggdelMallSectionTitle] = useState('');
  const [byggdelMallEditorExpandedSectionId, setByggdelMallEditorExpandedSectionId] = useState('');
  const [newByggdelMallPointBySectionId, setNewByggdelMallPointBySectionId] = useState({});
  const [savingByggdelMallPoints, setSavingByggdelMallPoints] = useState(false);
  const [showCreateByggdelMoment, setShowCreateByggdelMoment] = useState(false);
  const [newByggdelMomentName, setNewByggdelMomentName] = useState('');

  // Keep create-mall popup bottom aligned right above the keyboard.
  const DEFAULT_CREATE_MALL_KEYBOARD_HEIGHT_IOS = 320;
  const [createMallKeyboardHeight, setCreateMallKeyboardHeight] = useState(Platform.OS === 'ios' ? DEFAULT_CREATE_MALL_KEYBOARD_HEIGHT_IOS : 0);
  useEffect(() => {
    if (showCreateByggdelMallModal && Platform.OS === 'ios' && !(createMallKeyboardHeight > 0)) {
      setCreateMallKeyboardHeight(DEFAULT_CREATE_MALL_KEYBOARD_HEIGHT_IOS);
    }
  }, [showCreateByggdelMallModal]);

  // Shift mall editor up when keyboard is visible so footer buttons aren't covered.
  const [mallEditorKeyboardHeight, setMallEditorKeyboardHeight] = useState(0);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e) => {
      const h = (e && e.endCoordinates && typeof e.endCoordinates.height === 'number') ? e.endCoordinates.height : 0;
      setMallEditorKeyboardHeight(h || 0);
    };
    const onHide = () => setMallEditorKeyboardHeight(0);

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      try { subShow && subShow.remove && subShow.remove(); } catch (_e) {}
      try { subHide && subHide.remove && subHide.remove(); } catch (_e) {}
    };
  }, []);
  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = (e) => {
      const h = (e && e.endCoordinates && typeof e.endCoordinates.height === 'number') ? e.endCoordinates.height : 0;
      setCreateMallKeyboardHeight(h || 0);
    };
    const onHide = () => {
      // iOS: keep last height to avoid jumping down and showing underlying footer.
      if (Platform.OS === 'ios') return;
      setCreateMallKeyboardHeight(0);
    };

    const subShow = Keyboard.addListener(showEvent, onShow);
    const subHide = Keyboard.addListener(hideEvent, onHide);
    return () => {
      try { subShow && subShow.remove && subShow.remove(); } catch (_e) {}
      try { subHide && subHide.remove && subHide.remove(); } catch (_e) {}
    };
  }, []);

  const closeByggdelModal = () => {
    try { Keyboard.dismiss && Keyboard.dismiss(); } catch (_e) {}
    setShowByggdelModal(false);
    setShowAktivaByggdelarModal(false);
    setNewByggdelMallName('');
    setSavingByggdelMall(false);
    setShowCreateByggdelMallModal(false);
    setCreateByggdelMallContext(null);
    setShowCreateByggdelMoment(false);
    setNewByggdelMomentName('');
  };

  const closeCreateByggdelMallModal = () => {
    try { Keyboard.dismiss && Keyboard.dismiss(); } catch (_e) {}
    setShowCreateByggdelMallModal(false);
    setCreateByggdelMallContext(null);
    setNewByggdelMallName('');
    setSavingByggdelMall(false);
  };

  const submitCreateByggdelMall = async () => {
    try {
      const nm = String(newByggdelMallName || '').trim();
      if (!nm) {
        Alert.alert('Ange namn', 'Skriv ett namn på mallen.');
        return;
      }
      if (savingByggdelMall) return;

      const ctx = createByggdelMallContext;
      const hgKeyPrefix = String(ctx && ctx.huvudgrupp ? ctx.huvudgrupp : '').trim();
      const momentLabel = String(ctx && ctx.moment ? ctx.moment : '').trim();
      if (!hgKeyPrefix || !momentLabel) {
        Alert.alert('Kunde inte skapa', 'Saknar byggdel/moment. Försök igen.');
        return;
      }

      setSavingByggdelMall(true);
      const createdId = await createByggdelMall({ huvudgrupp: hgKeyPrefix, moment: momentLabel, name: nm });

      // Optimistic insert so the mall is visible immediately under this moment.
      setByggdelMallar(prev => {
        const current = Array.isArray(prev) ? prev : [];
        const next = [
          ...current.filter(x => String(x && x.id ? x.id : '') !== String(createdId || '')),
          { id: createdId, huvudgrupp: hgKeyPrefix, moment: momentLabel, name: nm, points: [], sections: [] },
        ];
        next.sort((a, b) => {
          const ag = String(a && (a.huvudgrupp ?? '')).trim();
          const bg = String(b && (b.huvudgrupp ?? '')).trim();
          if (ag !== bg) return ag.localeCompare(bg, 'sv');
          const am = String(a && (a.moment ?? '')).trim();
          const bm = String(b && (b.moment ?? '')).trim();
          if (am !== bm) return am.localeCompare(bm, 'sv');
          const an = String(a && (a.name ?? '')).trim();
          const bn = String(b && (b.name ?? '')).trim();
          return an.localeCompare(bn, 'sv');
        });
        return next;
      });

      // Best-effort refresh (keeps list in sync across devices)
      refreshByggdelMallar();

      setByggdelMallDraft({ id: createdId || null, name: nm });
      closeCreateByggdelMallModal();
      if (createdId) {
        // iOS/Expo Go: avoid stacking RN Modals; close Byggdel modal before opening editor.
        setShowByggdelModal(false);
        setTimeout(() => {
          openByggdelMallEditor({ id: createdId, name: nm, huvudgrupp: hgKeyPrefix, moment: momentLabel, points: [], sections: [] });
        }, 250);
      }
    } catch (_e) {
      const code = e && e.code ? String(e.code) : '';
      const msg = (e && e.message) ? String(e.message) : '';
      const isDuplicate = code === 'already-exists' || code === 'already_exists' || (msg && msg.toLowerCase().includes('already') && msg.toLowerCase().includes('exist'));
      const isPermission = code === 'permission-denied' || (msg && msg.toLowerCase().includes('permission'));
      const isAuth = code === 'unauthenticated';
      const isOffline = code === 'unavailable' || (msg && (msg.toLowerCase().includes('network') || msg.toLowerCase().includes('offline')));
      if (isDuplicate) {
        Alert.alert('Finns redan', 'Det finns redan en mall med detta namn i företaget. Välj ett annat namn.');
      } else if (isPermission) {
        Alert.alert('Kunde inte skapa', 'Du saknar behörighet till företaget. Logga ut och in igen (eller be admin sätta rätt företag på användaren) och försök igen.');
      } else if (isAuth) {
        Alert.alert('Kunde inte skapa', 'Du är inte inloggad. Logga in igen och försök igen.');
      } else if (isOffline) {
        Alert.alert('Kunde inte skapa', 'Ingen kontakt med servern. Kontrollera internetanslutningen och försök igen.');
      } else if (code === 'no_company') {
        Alert.alert('Kunde inte skapa', 'Saknar företag på användaren. Logga ut/in eller be admin koppla användaren till ett företag.');
      } else {
        Alert.alert('Kunde inte skapa', 'Försök igen.');
      }
    } finally {
      setSavingByggdelMall(false);
    }
  };

  const openByggdelMallEditor = (mall) => {
    try {
      const id = mall && mall.id ? String(mall.id) : '';
      const name = String(mall && (mall.name || '')).trim();
      if (!id) {
        Alert.alert('Kunde inte öppna', 'Mallen saknar id.');
        return;
      }
      const coerceArrayLike = (v) => {
        if (Array.isArray(v)) return v;
        if (v && typeof v === 'object') {
          const keys = Object.keys(v).filter(k => String(parseInt(k, 10)) === k).map(k => parseInt(k, 10)).sort((a, b) => a - b);
          if (!keys.length) return [];
          const arr = [];
          keys.forEach(k => { arr[k] = v[k]; });
          return arr;
        }
        return [];
      };
      const normalizeStatus = (v) => (v === 'ok' || v === 'avvikelse' || v === 'ejaktuell') ? v : null;

      const makeSectionId = (idx) => `sec-${Date.now()}-${idx}`;
      const rawSections = Array.isArray(mall && mall.sections) ? mall.sections : [];

      let sections = [];
      if (rawSections.length > 0) {
        sections = rawSections
          .map((s, idx) => {
            const title = String(s && (s.title ?? s.label ?? '')).trim();
            const pts = (Array.isArray(s && s.points) ? s.points : []).map(p => String(p || '').trim()).filter(Boolean);
            const rawStatuses = coerceArrayLike(s && s.statuses);
            const statuses = pts.map((_, i) => normalizeStatus(rawStatuses[i]));
            const rawPhotosOuter = coerceArrayLike(s && s.photos);
            const photos = pts.map((_, i) => {
              const row = rawPhotosOuter[i];
              const list = Array.isArray(row) ? row : (row ? [row] : []);
              return list.map(item => {
                if (!item) return null;
                if (typeof item === 'string') return item;
                if (item && typeof item === 'object' && item.uri) return { uri: item.uri, comment: item.comment || '' };
                return null;
              }).filter(Boolean);
            });
            return { id: makeSectionId(idx), title, points: pts, statuses, photos };
          })
          .filter(s => String(s && s.title ? s.title : '').trim() || (Array.isArray(s && s.points) && s.points.length > 0));
      } else {
        const pts = Array.isArray(mall && mall.points) ? mall.points : [];
        const normalized = pts.map(p => String(p || '').trim()).filter(Boolean);
        if (normalized.length > 0) {
          sections = [{ id: makeSectionId(0), title: 'Kontrollpunkter', points: normalized, statuses: Array(normalized.length).fill(null), photos: Array(normalized.length).fill(null).map(() => []) }];
        }
      }
      setByggdelMallEditor({
        id,
        name,
        huvudgrupp: String(mall && (mall.huvudgrupp || '')).trim(),
        moment: String(mall && (mall.moment || '')).trim(),
      });
      setByggdelMallSectionsDraft(sections);
      setByggdelMallEditorExpandedSectionId((sections && sections[0] && sections[0].id) ? String(sections[0].id) : '');
      setNewByggdelMallSectionTitle('');
      setNewByggdelMallPointBySectionId({});
      setShowByggdelMallEditor(true);
    } catch (_e) {
      Alert.alert('Kunde inte öppna', 'Försök igen.');
    }
  };

  const handlePickMallPointFromLibrary = async (mallSectionId, mallPointIdx) => {
    try {
      const sid = String(mallSectionId || '').trim();
      const pIdx = (typeof mallPointIdx === 'number') ? mallPointIdx : -1;
      if (!sid || pIdx < 0) return;
      try { Keyboard.dismiss(); } catch (_e) {}

      // Dynamically import ImagePicker when needed
      if (!ImagePicker) {
        try { ImagePicker = await import('expo-image-picker'); } catch (_e) { ImagePicker = null; }
      }
      let perm = null;
      try {
        if (ImagePicker && typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
          perm = await ImagePicker.getMediaLibraryPermissionsAsync();
        }
      } catch (_e) {}
      if (!perm || !(perm.granted === true || perm.status === 'granted')) {
        try {
          perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        } catch (_e) {}
      }
      const ok = (perm && (perm.granted === true || perm.status === 'granted'));
      if (!ok) {
        alert('Behöver tillgång till bildbiblioteket för att välja bilder.');
        return;
      }

      const mediaTypesOption = (ImagePicker && ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images)
        ? ImagePicker.MediaTypeOptions.Images
        : undefined;
      const pickerOptions = { quality: 0.8 };
      if (mediaTypesOption) pickerOptions.mediaTypes = mediaTypesOption;
      await new Promise(resolve => InteractionManager.runAfterInteractions(() => setTimeout(resolve, 200)));
      const res = (ImagePicker && typeof ImagePicker.launchImageLibraryAsync === 'function') ? await ImagePicker.launchImageLibraryAsync(pickerOptions) : null;
      const assets = (res && Array.isArray(res.assets) && res.assets.length) ? res.assets : (res && res.uri ? [{ uri: res.uri }] : []);
      const photos = (assets || [])
        .map(a => {
          const uri = a?.uri || a?.uriString || a?.localUri || (a?.base64 ? `data:image/jpeg;base64,${a.base64}` : null);
          return uri ? { uri, comment: '' } : null;
        })
        .filter(Boolean);
      if (!photos.length) return;

      let modalUris = [];
      setByggdelMallSectionsDraft(prev => {
        const arr = Array.isArray(prev) ? prev : [];
        return arr.map(s => {
          if (String(s && s.id ? s.id : '') !== sid) return s;
          const pts = Array.isArray(s && s.points) ? s.points : [];
          const photosOuter = Array.isArray(s && s.photos) && s.photos.length === pts.length
            ? s.photos.map(a => Array.isArray(a) ? [...a] : (a ? [a] : []))
            : Array(pts.length).fill(null).map(() => []);
          if (!Array.isArray(photosOuter[pIdx])) photosOuter[pIdx] = [];
          const existingUris = new Set((photosOuter[pIdx] || []).map(p => (p && p.uri) ? p.uri : p).filter(Boolean));
          const toAdd = photos.filter(p => p && p.uri && !existingUris.has(p.uri));
          if (toAdd.length) {
            photosOuter[pIdx] = [...(photosOuter[pIdx] || []), ...toAdd];
          }
          modalUris = photosOuter[pIdx];
          return Object.assign({}, s, { photos: photosOuter });
        });
      });
      setPhotoModal({ visible: true, uris: Array.isArray(modalUris) ? modalUris : [], index: 0, mallSectionId: sid, mallPointIdx: pIdx });
    } catch (_e) {
      alert('Kunde inte välja bild: ' + (e?.message || e));
    }
  };

  const refreshByggdelHierarchy = async () => {
    try {
      setByggdelHierarchyLoading(true);
      const res = await fetchByggdelHierarchy();
      const mbg = res && typeof res.momentsByGroup === 'object' && res.momentsByGroup ? res.momentsByGroup : {};
      const { merged, changed } = mergeByggdelMomentsByGroup(mbg);
      setByggdelMomentsByGroup(merged);

      // Best-effort: persist defaults once per company so web/app share the same baseline.
      if (changed) {
        saveByggdelHierarchy({ momentsByGroup: merged }).catch((e) => {});
      }
    } catch (_e) {
      setByggdelMomentsByGroup(defaultByggdelMomentsByGroup);
    } finally {
      setByggdelHierarchyLoading(false);
    }
  };

  const refreshByggdelMallar = async () => {
    try {
      setByggdelMallarLoading(true);
      const list = await fetchByggdelMallar();
      const arr = Array.isArray(list) ? list : [];
      arr.sort((a, b) => {
        const ag = String(a && (a.huvudgrupp ?? '')).trim();
        const bg = String(b && (b.huvudgrupp ?? '')).trim();
        if (ag !== bg) return ag.localeCompare(bg, 'sv');
        const am = String(a && (a.moment ?? '')).trim();
        const bm = String(b && (b.moment ?? '')).trim();
        if (am !== bm) return am.localeCompare(bm, 'sv');
        const an = String(a && (a.name ?? '')).trim();
        const bn = String(b && (b.name ?? '')).trim();
        return an.localeCompare(bn, 'sv');
      });
      setByggdelMallar(arr);
    } catch (_e) {
      setByggdelMallar([]);
    } finally {
      setByggdelMallarLoading(false);
    }
  };
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [selectedCategories, setSelectedCategories] = useState(() => {
    if (!Array.isArray(checklistConfig) || checklistConfig.length === 0) return [];
    // Arbetsberedning: start with all categories unchecked
    if (controlType === 'Arbetsberedning') {
      if (initialValues && Array.isArray(initialValues.selectedCategories) && initialValues.selectedCategories.length === checklistConfig.length) {
        return initialValues.selectedCategories;
      }
      if (initialValues && Array.isArray(initialValues.checklist) && initialValues.checklist.length > 0) {
        const selectedLabels = new Set((initialValues.checklist || []).map(s => s && s.label).filter(Boolean));
        return checklistConfig.map(sec => selectedLabels.has(sec.label));
      }
      return checklistConfig.map(() => false);
    }
    // Other controls: default to all categories enabled
    return checklistConfig.map(() => true);
  });

  const applySelectedCategoriesToChecklist = (categoryFlags) => {
    try {
      const cfg = (Array.isArray(checklistConfig) ? checklistConfig : []);
      const flags = Array.isArray(categoryFlags) ? categoryFlags : [];
      const current = Array.isArray(checklist) ? checklist : [];
      const existingByLabel = new Map(current.map(s => [s && s.label ? s.label : '', s]));
      const newChecklist = cfg
        .filter((_, i) => !!flags[i])
        .map(section => {
          const points = Array.isArray(section.points) ? [...section.points] : [];
          const existing = existingByLabel.get(section.label) || null;
          if (existing && Array.isArray(existing.points)) {
            const existingStatuses = Array.isArray(existing.statuses) ? existing.statuses : [];
            const existingPhotos = Array.isArray(existing.photos) ? existing.photos : [];
            const existingComments = Array.isArray(existing.comments) ? existing.comments : [];
            const idxByPoint = new Map((existing.points || []).map((pt, idx) => [pt, idx]));
            const statuses = points.map(pt => {
              const exIdx = idxByPoint.get(pt);
              return (exIdx === undefined) ? null : (existingStatuses[exIdx] ?? null);
            });
            const photos = points.map(pt => {
              const exIdx = idxByPoint.get(pt);
              const p = (exIdx === undefined) ? [] : existingPhotos[exIdx];
              return Array.isArray(p) ? p : (p ? [p] : []);
            });
            const comments = points.map(pt => {
              const exIdx = idxByPoint.get(pt);
              return (exIdx === undefined) ? '' : (existingComments[exIdx] ?? '');
            });
            return {
              ...existing,
              label: section.label,
              points,
              statuses,
              photos,
              comments,
            };
          }
          return {
            label: section.label,
            points,
            statuses: Array(points.length).fill(null),
            photos: Array(points.length).fill([]),
            comments: Array(points.length).fill(''),
          };
        });
      if (!shallowEqual(newChecklist, checklist)) {
        setChecklist(newChecklist);
      }
      setExpandedChecklist([]);
    } catch (_e) {}
  };

  useEffect(() => {
    // Arbetsberedning: load project-level category defaults (local AsyncStorage)
    if (controlType !== 'Arbetsberedning') return;
    const cfg = Array.isArray(checklistConfig) ? checklistConfig : [];
    const pid = project && project.id ? String(project.id) : '';
    if (!pid || cfg.length === 0) return;
    if (didInitArbetsberedningCategoriesRef.current) return;

    const hasInitialSelection = !!(
      (initialValues && Array.isArray(initialValues.selectedCategories) && initialValues.selectedCategories.length === cfg.length) ||
      (initialValues && Array.isArray(initialValues.checklist) && initialValues.checklist.length > 0)
    );
    if (hasInitialSelection) {
      didInitArbetsberedningCategoriesRef.current = true;
      return;
    }

    didInitArbetsberedningCategoriesRef.current = true;
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(arbetsberedningCategoryKey(pid));
        if (!raw) return;
        const parsed = JSON.parse(raw);

        let flags = null;
        if (Array.isArray(parsed) && parsed.length > 0) {
          // Backward compatible formats:
          // - boolean[] same length as cfg
          // - string[] of selected labels
          if (parsed.every(v => typeof v === 'boolean') && parsed.length === cfg.length) {
            flags = parsed;
          } else if (parsed.every(v => typeof v === 'string')) {
            const selectedLabels = new Set(parsed.map(s => String(s || '').trim()).filter(Boolean));
            flags = cfg.map(sec => selectedLabels.has(String(sec && sec.label ? sec.label : '').trim()));
          }
        } else if (parsed && typeof parsed === 'object') {
          // Newer format: { selectedLabels: string[] }
          if (Array.isArray(parsed.selectedLabels) && parsed.selectedLabels.every(v => typeof v === 'string')) {
            const selectedLabels = new Set(parsed.selectedLabels.map(s => String(s || '').trim()).filter(Boolean));
            flags = cfg.map(sec => selectedLabels.has(String(sec && sec.label ? sec.label : '').trim()));
          }
        }

        if (!flags || flags.length !== cfg.length) return;
        setSelectedCategories(flags);

        // If this is a new control with empty checklist, apply immediately.
        const currentChecklist = Array.isArray(checklistRef?.current) ? checklistRef.current : (Array.isArray(checklist) ? checklist : []);
        if (!currentChecklist || currentChecklist.length === 0) {
          applySelectedCategoriesToChecklist(flags);
        }
      } catch (_e) {}
    })();
  }, [controlType, project && project.id, checklistConfig, initialValues]);

  useEffect(() => {
    // Arbetsberedning: load project-level active byggdel filter (local AsyncStorage)
    if (controlType !== 'Arbetsberedning') return;
    const pid = project && project.id ? String(project.id) : '';
    if (!pid) return;
    if (loadedAktivaByggdelPidRef.current === pid) return;
    loadedAktivaByggdelPidRef.current = pid;

    (async () => {
      try {
        const raw = await AsyncStorage.getItem(arbetsberedningActiveByggdelKey(pid));
        if (!raw) {
          setAktivaByggdelarSelectedKeys([]);
          return;
        }
        const parsed = JSON.parse(raw);
        let keys = [];
        let legacyPrefixes = [];

        if (Array.isArray(parsed) && parsed.every(v => typeof v === 'string')) {
          // Backward compatible formats:
          // - string[] of "prefix" (e.g. "3")
          // - string[] of "prefix||moment" keys
          const anyKey = parsed.some(v => String(v || '').includes('||'));
          if (anyKey) {
            keys = parsed;
          } else {
            legacyPrefixes = parsed;
          }
        } else if (parsed && typeof parsed === 'object') {
          if (Array.isArray(parsed.selectedKeys) && parsed.selectedKeys.every(v => typeof v === 'string')) {
            keys = parsed.selectedKeys;
          } else if (Array.isArray(parsed.selectedPrefixes) && parsed.selectedPrefixes.every(v => typeof v === 'string')) {
            legacyPrefixes = parsed.selectedPrefixes;
          }
        }

        const normalizedKeys = (Array.isArray(keys) ? keys : [])
          .map(x => String(x || '').trim())
          .filter(x => !!x && x.includes('||'));

        if (normalizedKeys.length > 0) {
          setAktivaByggdelarSelectedKeys(normalizedKeys);
          return;
        }

        // Migrate legacy huvudgrupp-prefix filter to moment keys (select all moments in those prefixes)
        const prefixes = (Array.isArray(legacyPrefixes) ? legacyPrefixes : [])
          .map(x => String(x || '').trim())
          .filter(Boolean);
        if (prefixes.length === 0) {
          setAktivaByggdelarSelectedKeys([]);
          return;
        }

        const migrated = [];
        prefixes.forEach(prefix => {
          const momentsCandidate = (defaultByggdelMomentsByGroup && defaultByggdelMomentsByGroup[prefix]) || [];
          const moments = Array.isArray(momentsCandidate) ? momentsCandidate : [];
          moments.forEach(mm => {
            const m = String(mm || '').trim();
            if (!m) return;
            migrated.push(`${prefix}||${m}`);
          });
        });

        const uniq = Array.from(new Set(migrated.map(x => String(x || '').trim()).filter(Boolean)));
        setAktivaByggdelarSelectedKeys(uniq);
      } catch (_e) {
        setAktivaByggdelarSelectedKeys([]);
      }
    })();
  }, [controlType, project && project.id]);

  useEffect(() => {
    // If checklistConfig arrives/changes, initialize checkbox array length once without overriding user toggles
    const cfg = Array.isArray(checklistConfig) ? checklistConfig : [];
    setSelectedCategories(prev => {
      if (Array.isArray(prev) && prev.length === cfg.length) return prev;
      if (cfg.length === 0) return [];
      if (controlType === 'Arbetsberedning') return cfg.map(() => false);
      return cfg.map(() => true);
    });
  }, [checklistConfig, controlType]);
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
        try { Keyboard.dismiss(); } catch (_e) {}
        setShowPhotoChoice(false);
        let perm = null;
        try {
          if (typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
            perm = await ImagePicker.getMediaLibraryPermissionsAsync();
          }
        } catch (_e) {}
        if (!perm || !(perm.granted === true || perm.status === 'granted')) {
          try {
            perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          } catch (_e) {}
        }
        const ok = (perm && (perm.granted === true || perm.status === 'granted'));
        if (!ok) {
          alert('Behöver tillgång till bildbiblioteket för att välja bilder.');
          return;
        }
        const mediaTypesOption = (ImagePicker && ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images)
          ? ImagePicker.MediaTypeOptions.Images
          : undefined;
        const pickerOptions = { quality: 0.8 };
        if (mediaTypesOption) pickerOptions.mediaTypes = mediaTypesOption;
        await new Promise(resolve => InteractionManager.runAfterInteractions(() => setTimeout(resolve, 500)));
        const launchPromise = ImagePicker.launchImageLibraryAsync(pickerOptions);
        let res;
        try {
          res = await Promise.race([
            launchPromise,
            new Promise((_, reject) => setTimeout(() => reject(new Error('picker_timeout')), 7000)),
          ]);
        } catch (launchErr) {
          if (launchErr && launchErr.message === 'picker_timeout') {
            alert('Bildväljaren svarade inte. Försök igen.');
            return;
          }
          alert('Kunde inte öppna bildväljaren: ' + (launchErr?.message || launchErr));
          return;
        }
        const extractAssets = (r) => {
          if (!r) return [];
          if (Array.isArray(r.assets) && r.assets.length) return r.assets;
          if (Array.isArray(r.selectedAssets) && r.selectedAssets.length) return r.selectedAssets;
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
            // If a checklist photo modal is open, add to the correct checklist point
            if (photoModal && typeof photoModal.sectionIdx === 'number' && typeof photoModal.pointIdx === 'number') {
              setChecklist(prev => prev.map((section, sIdx) => {
                if (sIdx !== photoModal.sectionIdx) return section;
                const points = Array.isArray(section.points) ? section.points : [];
                let photosArr = Array.isArray(section.photos) && section.photos.length === points.length
                  ? [...section.photos]
                  : Array(points.length).fill([]);
                if (!Array.isArray(photosArr[photoModal.pointIdx])) photosArr[photoModal.pointIdx] = [];
                // Avoid duplicates
                const existingUris = new Set((photosArr[photoModal.pointIdx] || []).map(p => (p && p.uri) ? p.uri : p));
                const toAdd = photos.filter(p => p && p.uri && !existingUris.has(p.uri));
                photosArr[photoModal.pointIdx] = [...(photosArr[photoModal.pointIdx] || []), ...toAdd];
                return { ...section, photos: photosArr };
              }));
              // Also update modal state to show new images
              setPhotoModal(m => {
                const newUris = [...(m.uris || []), ...photos.filter(p => p && p.uri && !(m.uris || []).some(u => (u && u.uri) ? u.uri === p.uri : u === p.uri))];
                return { ...m, uris: newUris, index: newUris.length > 0 ? newUris.length - 1 : 0 };
              });
            } else {
              // Otherwise, add to main mottagningsPhotos
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
          }
        }
        // User cancelled or no assets: No-op
      } catch (_e) {
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
      a.concat(b).forEach(p => { try { map.set(key(p), p); } catch (_e) {} });
      out.participants = Array.from(map.values());
    } catch (_e) {}
    // Merge mottagningsSignatures
    try {
      const a = Array.isArray(existing.mottagningsSignatures) ? existing.mottagningsSignatures : [];
      const b = Array.isArray(incoming.mottagningsSignatures) ? incoming.mottagningsSignatures : [];
      out.mottagningsSignatures = [...a, ...b.filter(s => !a.includes(s))];
    } catch (_e) {}
    // Merge mottagningsPhotos by uri
    try {
      const a = Array.isArray(existing.mottagningsPhotos) ? existing.mottagningsPhotos : [];
      const b = Array.isArray(incoming.mottagningsPhotos) ? incoming.mottagningsPhotos : [];
      const seen = new Set(a.map(x => x && x.uri).filter(Boolean));
      const merged = [...a];
      b.forEach(x => { if (x && x.uri && !seen.has(x.uri)) { seen.add(x.uri); merged.push(x); } });
      out.mottagningsPhotos = merged;
    } catch (_e) {}
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
    } catch (_e) {}
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
    } catch (_e) { arr = []; }
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
    // ...existing code...
    return arr;
  };

  const processCameraResult = (cameraResult) => {
    if (!cameraResult) return;
    // ...existing code...
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
              // ...existing code...
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
                  try { setDraftId(toSaveId); } catch (_e) {}
                  const draftObj = {
                    id: toSaveId,
                    date: dateValue,
                    project,
                    ...weatherPayload,
                    byggdel,
                    byggdelTemplate,
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
                    // ...existing code...
                  } catch (_e) { try { console.warn('[BaseControlForm] persist after attach failed', e); } catch (_e) {} }
                } catch (_e) { try { console.warn('[BaseControlForm] persist after attach failed', e); } catch (_e) {} }
              })();
            }
          }
        } catch (_e) {}
        if (toAdd.length === 0) {
          try { navigation.setParams({ cameraResult: undefined }); } catch (_e) {}
          return;
        }
        setMottagningsPhotos(prevState => {
          const next = [...(prevState || []), ...toAdd];
          mottagningsPhotosRef.current = next;
          return next;
        });
        // ...existing code...
        try { navigation.setParams({ cameraResult: undefined }); } catch (_e) {}
      } catch (_e) {}
    } else if (uri) {
      if (processedCameraUrisRef.current.has(uri)) {
        try { navigation.setParams({ cameraResult: undefined }); } catch (_e) {}
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
          try { console.log('[BaseControlForm] appended uri to mottagningsPhotos, item:', uri); } catch (_e) {}
          try { navigation.setParams({ cameraResult: undefined }); } catch (_e) {}
        } catch (_e) {}
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
          try { navigation.setParams({ cameraResult: undefined }); } catch (_e) {}
          // Persist updated checklist (including photos) to draft controls immediately so
          // photos added from CameraCapture are not lost if the user navigates away.
          (async () => {
            try {
              const toSaveId = draftId || uuidv4();
              try { setDraftId(toSaveId); } catch (_e) {}
              const draftObj = {
                id: toSaveId,
                date: dateValue,
                project,
                ...weatherPayload,
                byggdel,
                byggdelTemplate,
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
                try { console.log('[BaseControlForm] persisted draft after uri add, id:', draftObj.id); } catch (_e) {}
              } catch (_e) { try { console.warn('[BaseControlForm] persist after uri add failed', e); } catch (_e) {} }
            } catch (_e) {
              try { console.warn('[BaseControlForm] persist after uri add failed', e); } catch (_e) {}
            }
          })();
        } catch (_e) {}
      }
    }
  };

  // Primary effect: react to explicit route.params changes (fast path)
  useEffect(() => {
    const cameraResult = route.params?.cameraResult;
    // ...existing code...
    if (cameraResult) processCameraResult(cameraResult);
    if (!route.params?.cameraResult) cameraHandledRef.current = false;
  }, [route.params?.cameraResult]);

  // Secondary: on focus / navigation state, attempt to find cameraResult set via setParams-by-key
  useEffect(() => {
    const checkStateForCameraResult = () => {
      try {
        const state = navigation.getState && navigation.getState();
        if (!state || !Array.isArray(state.routes)) return;
        // ...existing code...
        const ourRoute = state.routes.find(r => r.key === route.key);
        const cr = ourRoute && ourRoute.params && ourRoute.params.cameraResult;
        if (cr) {
          // ...existing code...
          processCameraResult(cr);
        } else {
          // Log which route appears previous to the current index for debugging
          try {
            const idx = typeof state.index === 'number' ? state.index : state.routes.findIndex(r => r.key === route.key);
            const prev = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
            // ...existing code...
          } catch (_e) {}
        }
      } catch (_e) {}
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
        // ...existing code...
        for (const cameraResult of arr) {
          try { processCameraResult(cameraResult); } catch (_e) {}
        }
        await AsyncStorage.removeItem('pending_camera_photos');
      } catch (_e) {}
    };
    const unsub2 = navigation.addListener('focus', () => { drainPending(); });
    // run now as well
    drainPending();
    return unsub2;
  }, [navigation, processCameraResult]);
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState('');
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
      } catch (_e) {}
    },
    onPanResponderRelease: () => {
      try {
        const curr = (sigCurrentRef.current && sigCurrentRef.current.length) ? [...(Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []), sigCurrentRef.current] : (Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []);
        sigStrokesRef.current = curr;
        setSigStrokes(curr);
      } catch (_e) {}
      sigCurrentRef.current = [];
      setSigCurrent([]);
    },
    onPanResponderTerminate: () => {
      try {
        const curr = (sigCurrentRef.current && sigCurrentRef.current.length) ? [...(Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []), sigCurrentRef.current] : (Array.isArray(sigStrokesRef.current) ? sigStrokesRef.current : []);
        sigStrokesRef.current = curr;
        setSigStrokes(curr);
      } catch (_e) {}
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
      const hasText = (deliveryDesc && String(deliveryDesc).trim().length > 0) || (materialDesc && String(materialDesc).trim().length > 0) || (generalNote && String(generalNote).trim().length > 0) || (byggdel && String(byggdel).trim().length > 0);
      const hasPhotos = Array.isArray(mottagningsPhotos) && mottagningsPhotos.length > 0;
      const hasSignatures = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length > 0;
      const hasParticipantsLocal = Array.isArray(localParticipants) && localParticipants.length > 0;
      const hasWeather = !hideWeather && !!selectedWeather;
      const shouldPersist = !!lastSavedDraftRef.current || isDirtyRef.current || hasChecklistContent || hasText || hasPhotos || hasSignatures || hasParticipantsLocal || hasWeather;
      if (!shouldPersist) {
        // Nothing meaningful to save; avoid creating an empty draft
        savingDraftRef.current = false;
        return lastSavedDraftRef.current;
      }
      // ...existing code...
      draft = {
        id: draftId || uuidv4(),
        date: dateValue,
        project,
        ...weatherPayload,
        byggdel,
        byggdelTemplate,
        selectedCategories,
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
      try { setDraftId(draft.id); } catch (_e) {}

      // Persist draft using merge-upsert helper so we don't overwrite richer data
      try {
        // ...existing code...
        await persistDraftObject(draft);
        try {
          // Best-effort: also save draft to Firestore so web/app can sync
          await saveDraftToFirestore(draft);
        } catch (_e) {}
      } catch (_e) {
        try { console.warn('[BaseControlForm] failed to persist draft_controls', e); } catch (_e) {}
      }
      // store last saved draft so concurrent attempts can reuse it
      lastSavedDraftRef.current = draft;
      return draft;
    } catch (_e) {
      // If persistence fails, still return the constructed draft so callers/upserters reuse same id
      try { if (draft) lastSavedDraftRef.current = draft; } catch (_e) {}
      alert('Kunde inte spara utkast: ' + (e && e.message ? e.message : String(e)));
      return draft;
    } finally {
      savingDraftRef.current = false;
    }
  };

  // Spara slutförd kontroll och ta bort ev. utkast
  const handleSave = async () => {
    if (finishingSaveRef.current) return;
    finishingSaveRef.current = true;

    const isEditingCompleted = !!(initialValues && (initialValues.status === 'UTFÖRD' || initialValues.completed));
    const resolvedId = (initialValues && initialValues.id)
      ? initialValues.id
      : (draftId || uuidv4());
    // Ensure repeated saves (e.g. accidental double click) target the same record.
    try {
      if (!(initialValues && initialValues.id) && !draftId) setDraftId(resolvedId);
    } catch (_e) {}

    try {
      if (onSave) {
        await Promise.resolve(onSave({
          id: resolvedId,
          date: dateValue,
          project,
          ...weatherPayload,
          byggdel,
          byggdelTemplate,
          selectedCategories,
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
        }));
      }
    } catch (_e) {
      finishingSaveRef.current = false;
      Alert.alert('Kunde inte spara', (e && e.message) ? e.message : String(e));
      return;
    }
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

    // Best-effort: also delete the draft in Firestore so web/app stay in sync
    try {
      const draftIdToDelete = (initialValues && initialValues.id)
        ? initialValues.id
        : (draftId || null);
      if (draftIdToDelete) {
        await deleteDraftControlFromFirestore(draftIdToDelete);
      }
    } catch (_e) {}
    // Clear dirty flag so beforeRemove won't intercept navigation
    try {
      isDirtyRef.current = false;
    } catch (_e) {}

    // For "Slutför" on web: show a lightweight confirmation (like "Spara utkast")
    // and then exit back to the project automatically.
    if (!isEditingCompleted) {
      try { setShowFinishConfirm(true); } catch (_e) {}
      setTimeout(() => {
        try { setShowFinishConfirm(false); } catch (_e) {}
        finishingSaveRef.current = false;
        try {
          if (typeof onFinished === 'function') {
            onFinished();
            return;
          }
          if (typeof onExit === 'function') {
            onExit();
            return;
          }
          if (navigation && navigation.navigate && project) {
            navigation.navigate('ProjectDetails', { project });
          } else if (navigation && navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          }
        } catch (_e) {}
      }, 900);
      return;
    }

    // Editing an already completed control: keep the explicit OK flow.
    finishingSaveRef.current = false;
    setTimeout(() => {
      Alert.alert(
        'Sparad',
        'Dina ändringar är sparade i kontrollen.',
        [
          {
            text: 'OK',
            onPress: () => {
              if (typeof onFinished === 'function') {
                onFinished();
                return;
              }
              if (typeof onExit === 'function') {
                onExit();
                return;
              }
              if (navigation && navigation.navigate && project) {
                navigation.navigate('ProjectDetails', { project });
              } else if (navigation && navigation.canGoBack && navigation.canGoBack()) {
                navigation.goBack();
              }
            },
          },
        ],
        { cancelable: false }
      );
    }, 100);
  };

  // Spara utkast
  const handleSaveDraft = async () => {
    const draft = await saveDraftControl();
    // ...existing code...
    if (onSaveDraft) await onSaveDraft(draft || {
      date: dateValue,
      project,
      ...weatherPayload,
      byggdel,
      byggdelTemplate,
      selectedCategories,
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
      try { isDirtyRef.current = false; } catch (_e) {}
      try { setShowBackConfirm(false); } catch (_e) {}
      setShowDraftSavedConfirm(true);
      setTimeout(() => {
        try { setShowDraftSavedConfirm(false); } catch (_e) {}
        try {
          if (blockedNavEvent.current) {
            blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
            blockedNavEvent.current = null;
          } else if (typeof onExit === 'function') {
            onExit();
          } else if (navigation && navigation.canGoBack && navigation.canGoBack()) {
            navigation.goBack();
          }
        } catch (_e) {}
      }, 1000);
    } catch (_e) {}
  };

  // Render
  // Determine whether the control may be completed (enabled "Slutför").
  // For Riskbedömning: require date, >=1 participant, 'Beskriv arbetsmoment', all checklist points, and at least one signature.
  // For Mottagningskontroll: require date, >=1 participant, material description, all checklist points, and at least one signature.
  // For Skyddsrond: require date, >=1 participant, scope/description, all checklist points, and at least one signature.
  const canFinish = (() => {
    if (controlType === 'Riskbedömning') {
      const hasDate = typeof dateValue === 'string' && dateValue.trim().length > 0;
      const hasParticipants = Array.isArray(localParticipants) && localParticipants.length >= 1;
      const hasScope = typeof deliveryDesc === 'string' && deliveryDesc.trim().length > 0;
      const checklistComplete = (() => {
        if (!Array.isArray(checklist) || checklist.length === 0) return false;
        return checklist.every(sec => Array.isArray(sec.statuses) && sec.statuses.length > 0 && sec.statuses.every(s => !!s));
      })();
      const hasSignature = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length >= 1;
      return hasDate && hasParticipants && hasScope && checklistComplete && hasSignature;
    }
    if (controlType === 'Skyddsrond') {
      const hasParticipants = Array.isArray(localParticipants) && localParticipants.length >= 1;
      const hasScope = typeof deliveryDesc === 'string' && deliveryDesc.trim().length > 0;
      const checklistComplete = (() => {
        if (!Array.isArray(checklist) || checklist.length === 0) return true;
        return checklist.every(sec => Array.isArray(sec.statuses) && sec.statuses.length > 0 && sec.statuses.every(s => !!s));
      })();
      const hasSignature = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length >= 1;
      return hasParticipants && hasScope && checklistComplete && hasSignature;
    }
    if (controlType === 'Mottagningskontroll') {
      const hasParticipants = Array.isArray(localParticipants) && localParticipants.length >= 1;
      const hasMaterial = typeof materialDesc === 'string' && materialDesc.trim().length > 0;
      const checklistComplete = (() => {
        if (!Array.isArray(checklist) || checklist.length === 0) return true;
        return checklist.every(sec => Array.isArray(sec.statuses) && sec.statuses.length > 0 && sec.statuses.every(s => !!s));
      })();
      const hasSignature = Array.isArray(mottagningsSignatures) && mottagningsSignatures.length >= 1;
      return hasParticipants && hasMaterial && checklistComplete && hasSignature;
    }
    // Default: allow finish
    return true;
  })();

  return (
    <>
      {/* Modal för åtgärd/åtgärdsinfo */}
      <Modal visible={remediationModal.visible} transparent animationType="fade" onRequestClose={() => setRemediationModal({ ...remediationModal, visible: false })}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 20, width: 320, alignItems: 'center' }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 10, color: '#222' }}>{remediationModal.infoMode ? 'Åtgärdsinfo' : 'Åtgärda avvikelse'}</Text>
            <Text style={{ fontSize: 15, color: '#222', marginBottom: 8 }}>Punkt: {remediationModal.sectionIdx !== null && remediationModal.pointIdx !== null ? checklist[remediationModal.sectionIdx].points[remediationModal.pointIdx] : ''}</Text>
            <TextInput
              value={remediationModal.comment}
              onChangeText={text => setRemediationModal(m => ({ ...m, comment: text }))}
              placeholder="Beskriv åtgärd"
              placeholderTextColor="#888"
              style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: remediationModal.infoMode ? '#f5f5f5' : '#fff', width: '100%', marginBottom: 10 }}
              editable={!remediationModal.infoMode}
              multiline
            />
            <TextInput
              value={remediationModal.name}
              onChangeText={text => setRemediationModal(m => ({ ...m, name: text }))}
              placeholder="Namn på åtgärdande person"
              placeholderTextColor="#888"
              style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: remediationModal.infoMode ? '#f5f5f5' : '#fff', width: '100%', marginBottom: 10 }}
              editable={!remediationModal.infoMode}
            />
            {/* Spara/avbryt/info-knappar */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 8 }}>
              <TouchableOpacity onPress={() => setRemediationModal({ ...remediationModal, visible: false })} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8 }}>
                <Text style={{ color: '#777' }}>Avbryt</Text>
              </TouchableOpacity>
              {!remediationModal.infoMode && (
                <TouchableOpacity
                  onPress={() => {
                    // Spara åtgärd i checklistan
                    const { sectionIdx, pointIdx, comment, name } = remediationModal;
                    if (sectionIdx === null || pointIdx === null) return;
                    setChecklist(prev => prev.map((s, sIdx) => {
                      if (sIdx !== sectionIdx) return s;
                      const remediation = { ...(s.remediation || {}) };
                      const pt = s.points[pointIdx];
                      remediation[pt] = {
                        comment,
                        name,
                        date: new Date().toISOString(),
                      };
                      return { ...s, remediation };
                    }));
                    setRemediationModal({ ...remediationModal, visible: false });
                    // Persist draft immediately so the saved åtgärd is not lost
                    (async () => {
                      try {
                        await saveDraftControl();
                      } catch (_e) { }
                    })();
                  }}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginLeft: 8 }}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '600' }}>Spara</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* ...ingen testknapp/modal... */}
      {/* Modal för bekräftelse vid tillbaka om formuläret är ändrat */}
      <Modal
        visible={showBackConfirm}
        transparent={true}
        animationType="fade"
        onRequestClose={() => closeBackConfirm('cancel')}
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.35)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 28, width: 320, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6, position: 'relative' }}>
            {/* Close (X) icon in top right */}
            <TouchableOpacity
              onPress={() => closeBackConfirm('cancel')}
              style={{ position: 'absolute', top: 12, right: 12, zIndex: 10, padding: 6 }}
              accessibilityLabel="Stäng"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={26} color="#888" />
            </TouchableOpacity>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#222', textAlign: 'center', marginTop: 4 }}>
              {backConfirmMode === 'dirty' ? 'Vill du avbryta kontrollen?' : 'Vill du lämna kontrollen?'}
            </Text>
            <Text style={{ fontSize: 15, color: '#222', marginBottom: 28, textAlign: 'center' }}>
              {backConfirmMode === 'dirty'
                ? 'Du har osparade ändringar. Välj om du vill spara utkast eller avbryta.'
                : 'Välj om du vill spara som utkast eller avbryta.'}
            </Text>
            <View style={{ flexDirection: 'row', width: '100%', justifyContent: 'space-between' }}>
              <TouchableOpacity
                style={{ flex: 1, borderWidth: 1, borderColor: '#1976D2', borderRadius: 8, paddingVertical: 14, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent' }}
                onPress={async () => {
                  const draft = await saveDraftControl();
                      if (onSaveDraft) await onSaveDraft(draft || {
                        date: dateValue,
                        project,
                        ...weatherPayload,
                        byggdel,
                        byggdelTemplate,
                        selectedCategories,
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
                  try { isDirtyRef.current = false; } catch (_e) {}
                  closeBackConfirm('draft');
                  if (blockedNavEvent.current) {
                    blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
                    blockedNavEvent.current = null;
                  } else if (typeof onExit === 'function') {
                    onExit();
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
                  closeBackConfirm('abort');
                  if (blockedNavEvent.current) {
                    blockedNavEvent.current.data.action && navigation.dispatch(blockedNavEvent.current.data.action);
                    blockedNavEvent.current = null;
                  } else if (typeof onExit === 'function') {
                    onExit();
                  } else {
                    navigation.goBack();
                  }
                }}
              >
                <Text style={{ color: '#D32F2F', fontWeight: 'normal', fontSize: 16 }}>Avbryt</Text>
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
            {/* Close (X) icon in top right */}
            <TouchableOpacity
              style={{ position: 'absolute', top: 32, right: 24, zIndex: 10, padding: 8 }}
              onPress={() => setPhotoModal({ ...photoModal, visible: false })}
              accessibilityLabel="Stäng"
            >
              <Text style={{ fontSize: 28, color: '#fff', fontWeight: 'bold' }}>×</Text>
            </TouchableOpacity>
            {photoModal.uris.length > 0 && (
              <View style={{ width: windowWidth, alignItems: 'center', justifyContent: 'center', flex: 1 }}>
                {/* Modal header with title and close X */}
                <View style={{ width: '100%', alignItems: 'center', justifyContent: 'center', marginBottom: 8, position: 'relative' }}>
                  <Text style={{ fontSize: 22, fontWeight: 'bold', color: '#222', marginTop: 8, marginBottom: 8 }}>Bilder för kontrollpunkt</Text>
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 0, right: 18, zIndex: 10, padding: 8 }}
                    onPress={() => setPhotoModal({ ...photoModal, visible: false })}
                    accessibilityLabel="Stäng"
                  >
                    <Text style={{ fontSize: 28, color: '#222', fontWeight: 'bold' }}>×</Text>
                  </TouchableOpacity>
                </View>
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
                  <Image
                    source={{ uri: (photoModal.uris[photoModal.index] && photoModal.uris[photoModal.index].uri) ? photoModal.uris[photoModal.index].uri : photoModal.uris[photoModal.index] }}
                    style={{ width: '100%', aspectRatio: 4/3, backgroundColor: '#111' }}
                    resizeMode="contain"
                    onTouchStart={handleTouchStart}
                    onTouchEnd={(e) => handleTouchEnd(e, photoModal.uris, photoModal.index)}
                  />
                </View>
                {/* Thumbnails row */}
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10, marginBottom: 8, maxHeight: 60 }}>
                  {photoModal.uris.map((p, i) => (
                    <TouchableOpacity
                      key={i}
                      onPress={() => setPhotoModal(m => ({ ...m, index: i }))}
                      style={{ borderWidth: i === photoModal.index ? 2 : 0, borderColor: '#1976D2', borderRadius: 6, marginHorizontal: 2 }}
                    >
                      <Image source={{ uri: p.uri || p }} style={{ width: 48, height: 48, borderRadius: 6 }} />
                    </TouchableOpacity>
                  ))}
                </ScrollView>
                {/* Comment input and delete button */}
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, width: 320 }}>
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
                      } catch (_e) {}
                    }}
                    placeholder="Lägg till kommentar..."
                    placeholderTextColor="#ddd"
                    style={{ flex: 1, backgroundColor: '#fff', borderRadius: 6, paddingHorizontal: 10, paddingVertical: 6, fontSize: 15, marginRight: 8 }}
                    multiline
                    maxLength={120}
                  />
                  <TouchableOpacity
                    onPress={() => {
                      setPhotoModal({ ...photoModal, visible: false });
                      Alert.alert('Kommentar sparad');
                    }}
                    style={{ backgroundColor: '#1976D2', borderRadius: 24, padding: 10, marginRight: 8, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4, alignItems: 'center', justifyContent: 'center' }}
                    accessibilityLabel="Spara kommentar"
                  >
                    <MaterialIcons name="save" size={28} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleDeletePhoto}
                    style={{ backgroundColor: '#e53935', borderRadius: 24, padding: 10, elevation: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.18, shadowRadius: 4 }}
                    accessibilityLabel="Ta bort foto"
                  >
                    <MaterialIcons name="delete-forever" size={28} color="#fff" style={{}} />
                  </TouchableOpacity>
                </View>
                {/* Action buttons row (tight layout) */}
                <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', width: 320, marginBottom: 8 }}>
                  <TouchableOpacity
                    onPress={() => {
                      setPhotoModal({ ...photoModal, visible: false });
                      setTimeout(() => handleNavigateToCamera(), 300);
                    }}
                    style={{ backgroundColor: '#1976D2', borderRadius: 6, paddingVertical: 8, paddingHorizontal: 12, marginHorizontal: 4 }}
                  >
                    <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 15 }}>Ta nytt foto</Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>
      <ScrollView
        ref={scrollRef}
        style={[
          { flex: 1, backgroundColor: '#fff' },
          Platform.OS === 'web' ? { height: windowHeight || undefined, minHeight: 0 } : null,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={{ flex: 1 }}>
                {/* Förklaring av statusknappar för riskbedömning (legend row removed from top, now only in checklist section header) */}
        {/* Project Info and meta */}
        <View style={{ padding: 16, paddingBottom: 0 }}>
        {/* Company logo header (always shown) */}
        <View style={{ marginBottom: 8 }}>
          <CompanyHeaderLogo />
        </View>
        <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: hideProjectHeader ? 10 : 6 }} />
        {/* Project number and name (toggled via meta-fältet "Projekt") */}
        {project && !hideProjectHeader && (
          <Text style={{ fontSize: 20, color: '#222', fontWeight: 'bold', marginBottom: 10, letterSpacing: 0.2 }}>
            {project.id ? project.id : ''}{project.id && project.name ? ' – ' : ''}{project.name ? project.name : ''}
          </Text>
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
            <Ionicons name="create-outline" size={22} color="#1976D2" />
          </TouchableOpacity>
        </View>
        {/* Soft horizontal divider under date */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
        {/* Date edit modal */}
        <Modal
          visible={showDateModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowDateModal(false)}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 280, maxWidth: '90%', alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
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
          </View>
        </Modal>
        {/* Participants (own row) and Weather (separate row below) */}
        <View style={{ flexDirection: 'column', marginBottom: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', flex: 1 }}>
              <Ionicons name="person-outline" size={26} color="#1976D2" style={{ marginRight: 10, marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 18, color: (missingFields && (missingFields.includes(participantsLabel) || missingFields.includes('Deltagare'))) ? '#D32F2F' : '#222', fontWeight: '600', marginBottom: 6, marginTop: 4 }}>{participantsLabel}</Text>
                <View style={{ paddingVertical: 6 }}>
                  {(Array.isArray(localParticipants) ? localParticipants : []).map((p, idx) => {
                    const name = (typeof p === 'string') ? p : (p && p.name) ? p.name : `${participantsLabel} ${idx+1}`;
                    const key = (typeof p === 'object' && p && p.id) ? `participant-${p.id}` : `participant-${idx}-${name}`;
                    return (
                      <View key={key} style={{ backgroundColor: '#f5f5f5', borderRadius: 16, paddingVertical: 8, paddingHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
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
                </View>
              </View>
            </View>
            <TouchableOpacity onPress={() => { setParticipantName(''); setParticipantCompany(''); setParticipantRole(''); setParticipantPhone(''); setEditParticipantIndex(null); setShowAddParticipantModal(true); }} style={{ padding: 4, marginLeft: 8 }} accessibilityLabel={addParticipantsLabel}>
              <Ionicons name="add-circle-outline" size={26} color="#1976D2" />
            </TouchableOpacity>
          </View>

          {/* Divider between participants and weather/byggdel */}
          {(!hideWeather || controlType === 'Egenkontroll') && (
            <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 8 }} />
          )}

          {/* Weather row (separate) */}
          {!hideWeather && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                {/* Fixed weather icon on the left, same blue as other icons */}
                <Ionicons name="partly-sunny" size={26} color="#1976D2" style={{ marginRight: 10 }} />
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
          )}

          {/* Byggdel row (Egenkontroll, where weather usually is) */}
          {hideWeather && controlType === 'Egenkontroll' && (
            <View style={{ flexDirection: 'column', marginTop: 8 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Ionicons name="cube-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                  <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>Byggdel</Text>
                  {!((byggdelTemplate && (byggdelTemplate.huvudgrupp || byggdelTemplate.moment)) || byggdel) && (
                    <Text style={{ fontSize: 12, color: '#666', fontWeight: '400', marginLeft: 6 }}>(valfritt)</Text>
                  )}
                  {!!((byggdelTemplate && (byggdelTemplate.huvudgrupp || byggdelTemplate.moment)) || byggdel) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 10, flexShrink: 1, minWidth: 0 }}>
                      <Text style={{ color: '#222', marginRight: 8, flexShrink: 1 }} numberOfLines={1}>
                        {(() => {
                          const tpl = byggdelTemplate || null;
                          const lbl = tpl ? formatByggdelMomentLabelFromTemplate(tpl) : '';
                          return lbl || byggdel;
                        })()}
                      </Text>
                      <TouchableOpacity
                        onPress={() => {
                          const tpl = byggdelTemplate || null;
                          const hadMall = !!(tpl && (tpl.mallId || tpl.mallName || tpl.name));
                          const clearOnlySelection = () => {
                            setByggdel('');
                            setByggdelTemplate(null);
                          };
                          const clearSelectionAndChecklist = () => {
                            setByggdel('');
                            setByggdelTemplate(null);
                            setChecklist([]);
                            setExpandedChecklist([]);
                            try {
                              if (controlType === 'Arbetsberedning') {
                                const cfg = Array.isArray(checklistConfig) ? checklistConfig : [];
                                if (cfg.length > 0) setSelectedCategories(cfg.map(() => false));
                              }
                            } catch (_e) {}
                          };

                          if (hadMall && hasAnyChecklistPoints(checklistRef.current)) {
                            Alert.alert(
                              'Ta bort mall?'
                              ,
                              'Du har valt en mall. Vill du behålla kontrollpunkterna eller rensa dem?'
                              ,
                              [
                                { text: 'Avbryt', style: 'cancel' },
                                { text: 'Behåll punkter', onPress: clearOnlySelection },
                                { text: 'Rensa punkter', style: 'destructive', onPress: clearSelectionAndChecklist },
                              ]
                            );
                            return;
                          }

                          if (hadMall) {
                            clearSelectionAndChecklist();
                            return;
                          }

                          clearOnlySelection();
                        }}
                        accessibilityLabel="Rensa byggdel"
                      >
                        <Ionicons name="close-circle" size={18} color="#D32F2F" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  const tpl = byggdelTemplate || null;
                  const hg = String(tpl?.huvudgrupp || '').trim();
                  const mm = String(tpl?.moment || '').trim();
                  setByggdelHuvudgruppDraft(hg);
                  setByggdelMomentDraft(mm);
                  setByggdelMallDraft(tpl && (tpl.mallId || tpl.mallName || tpl.name) ? { id: tpl.mallId || null, name: tpl.mallName || tpl.name || '' } : null);
                  setByggdelExpandedHuvudgrupp(hg);
                  setByggdelExpandedMomentKey(hg && mm ? `${String(hg || '').split('-')[0].trim()}||${mm}` : '');
                  setNewByggdelMallName('');
                  setShowCreateByggdelMoment(false);
                  setNewByggdelMomentName('');
                  setShowCreateByggdelMallModal(false);
                  setCreateByggdelMallContext(null);
                  setShowKontrollplanRolldown(true);
                  refreshByggdelHierarchy();
                  refreshByggdelMallar();
                  setShowByggdelModal(true);
                }}
                style={{ padding: 4, marginLeft: 8 }}
                accessibilityLabel="Ange byggdel"
              >
                <Ionicons name={byggdel ? 'create-outline' : 'add-circle-outline'} size={26} color="#1976D2" />
              </TouchableOpacity>
              </View>

              {/* Divider between byggdel and kontrollplan */}
              <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />

              {/* Kontrollplan row (Egenkontroll) */}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 10, justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <Ionicons name="clipboard-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
                    <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>Kontrollplan</Text>
                    {!String((byggdelTemplate && (byggdelTemplate.mallName || byggdelTemplate.name)) || '').trim() && (
                      <Text style={{ fontSize: 12, color: '#666', fontWeight: '400', marginLeft: 6 }}>(valfritt)</Text>
                    )}
                    {!!String((byggdelTemplate && (byggdelTemplate.mallName || byggdelTemplate.name)) || '').trim() && (
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, marginLeft: 10, flexShrink: 1, minWidth: 0 }}>
                        <Text style={{ color: '#222', marginRight: 8, flexShrink: 1 }} numberOfLines={1}>
                          {String((byggdelTemplate && (byggdelTemplate.mallName || byggdelTemplate.name)) || '').trim()}
                        </Text>
                        <TouchableOpacity
                          onPress={() => {
                            const tpl = byggdelTemplate || null;
                            const hadMall = !!(tpl && (tpl.mallId || tpl.mallName || tpl.name));
                            if (!hadMall) return;

                            const clearOnlyPlan = () => {
                              const nextTpl = { huvudgrupp: tpl.huvudgrupp, moment: tpl.moment };
                              setByggdelTemplate(nextTpl);
                              setByggdel(formatByggdelMomentLabelFromTemplate(nextTpl));
                            };
                            const clearPlanAndChecklist = () => {
                              const nextTpl = { huvudgrupp: tpl.huvudgrupp, moment: tpl.moment };
                              setByggdelTemplate(nextTpl);
                              setByggdel(formatByggdelMomentLabelFromTemplate(nextTpl));
                              setChecklist([]);
                              setExpandedChecklist([]);
                            };

                            if (hasAnyChecklistPoints(checklistRef.current)) {
                              Alert.alert(
                                'Ta bort mall?'
                                ,
                                'Du har valt en mall. Vill du behålla kontrollpunkterna eller rensa dem?'
                                ,
                                [
                                  { text: 'Avbryt', style: 'cancel' },
                                  { text: 'Behåll punkter', onPress: clearOnlyPlan },
                                  { text: 'Rensa punkter', style: 'destructive', onPress: clearPlanAndChecklist },
                                ]
                              );
                              return;
                            }

                            clearOnlyPlan();
                          }}
                          accessibilityLabel="Rensa kontrollplan"
                        >
                          <Ionicons name="close-circle" size={18} color="#D32F2F" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>

                <TouchableOpacity
                  onPress={() => {
                    const tpl = byggdelTemplate || null;
                    const hg = String(tpl?.huvudgrupp || '').trim();
                    const mm = String(tpl?.moment || '').trim();
                    setByggdelHuvudgruppDraft(hg);
                    setByggdelMomentDraft(mm);
                    setByggdelMallDraft(tpl && (tpl.mallId || tpl.mallName || tpl.name) ? { id: tpl.mallId || null, name: tpl.mallName || tpl.name || '' } : null);
                    setByggdelExpandedHuvudgrupp(hg);
                    setByggdelExpandedMomentKey(hg && mm ? `${String(hg || '').split('-')[0].trim()}||${mm}` : '');
                    setNewByggdelMallName('');
                    setShowCreateByggdelMoment(false);
                    setNewByggdelMomentName('');
                    setShowCreateByggdelMallModal(false);
                    setCreateByggdelMallContext(null);
                    setShowKontrollplanRolldown(true);
                    refreshByggdelHierarchy();
                    refreshByggdelMallar();
                    setShowByggdelModal(true);
                  }}
                  style={{ padding: 4, marginLeft: 8 }}
                  accessibilityLabel="Ange kontrollplan"
                >
                  <Ionicons name={String((byggdelTemplate && (byggdelTemplate.mallName || byggdelTemplate.name)) || '').trim() ? 'create-outline' : 'add-circle-outline'} size={26} color="#1976D2" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* Soft horizontal divider between weather and byggdel (same as date -> participants) */}
          {controlType === 'Arbetsberedning' && !hideWeather && (
            <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
          )}

          {/* Byggdel row (Arbetsberedning only) */}
          {controlType === 'Arbetsberedning' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: hideWeather ? 12 : 2, justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                <Ionicons name="cube-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 10, flexShrink: 0 }}>
                  <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>Byggdel</Text>
                  <Text style={{ fontSize: 12, color: '#666', fontWeight: '400', marginLeft: 6 }}>(valfritt)</Text>
                </View>

                {!!byggdel && (
                  <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f5f5f5', borderRadius: 12, paddingVertical: 6, paddingHorizontal: 10, flexShrink: 1, minWidth: 0 }}>
                    <Text style={{ color: '#222', marginRight: 8, flexShrink: 1 }} numberOfLines={1}>
                      {byggdel}
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        const tpl = byggdelTemplate || null;
                        const hadMall = !!(tpl && (tpl.mallId || tpl.mallName || tpl.name));
                        const clearOnlySelection = () => {
                          setByggdel('');
                          setByggdelTemplate(null);
                        };
                        const clearSelectionAndChecklist = () => {
                          setByggdel('');
                          setByggdelTemplate(null);
                          setChecklist([]);
                          setExpandedChecklist([]);
                          try {
                            if (controlType === 'Arbetsberedning') {
                              const cfg = Array.isArray(checklistConfig) ? checklistConfig : [];
                              if (cfg.length > 0) setSelectedCategories(cfg.map(() => false));
                            }
                          } catch (_e) {}
                        };

                        if (hadMall && hasAnyChecklistPoints(checklistRef.current)) {
                          Alert.alert(
                            'Ta bort mall?'
                            ,
                            'Du har valt en mall. Vill du behålla kontrollpunkterna eller rensa dem?'
                            ,
                            [
                              { text: 'Avbryt', style: 'cancel' },
                              { text: 'Behåll punkter', onPress: clearOnlySelection },
                              { text: 'Rensa punkter', style: 'destructive', onPress: clearSelectionAndChecklist },
                            ]
                          );
                          return;
                        }

                        if (hadMall) {
                          clearSelectionAndChecklist();
                          return;
                        }

                        clearOnlySelection();
                      }}
                      accessibilityLabel="Rensa byggdel"
                    >
                      <Ionicons name="close-circle" size={18} color="#D32F2F" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
              <TouchableOpacity
                onPress={() => {
                  const tpl = byggdelTemplate || null;
                  const hg = String(tpl?.huvudgrupp || '').trim();
                  const mm = String(tpl?.moment || '').trim();
                  setByggdelHuvudgruppDraft(hg);
                  setByggdelMomentDraft(mm);
                  setByggdelMallDraft(tpl && (tpl.mallId || tpl.mallName || tpl.name) ? { id: tpl.mallId || null, name: tpl.mallName || tpl.name || '' } : null);
                  setByggdelExpandedHuvudgrupp(hg);
                  setByggdelExpandedMomentKey(hg && mm ? `${String(hg || '').split('-')[0].trim()}||${mm}` : '');
                  setNewByggdelMallName('');
                  setShowCreateByggdelMoment(false);
                  setNewByggdelMomentName('');
                  setShowCreateByggdelMallModal(false);
                  setCreateByggdelMallContext(null);
                  refreshByggdelHierarchy();
                  refreshByggdelMallar();
                  setShowByggdelModal(true);
                }}
                style={{ padding: 4, marginLeft: 8 }}
                accessibilityLabel="Ange byggdel"
              >
                <Ionicons name={byggdel ? 'create-outline' : 'add-circle-outline'} size={26} color="#1976D2" />
              </TouchableOpacity>
            </View>
          )}
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

        {/* Byggdel modal (Arbetsberedning + Egenkontroll) */}
        {(controlType === 'Arbetsberedning' || controlType === 'Egenkontroll') && (
          <Modal visible={showByggdelModal} transparent animationType="fade" onRequestClose={closeByggdelModal}>
            <View style={{ pointerEvents: 'box-none', flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
              <Pressable onPress={closeByggdelModal} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
              <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd' }}>
                <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>Byggdel</Text>
                </View>
                <View style={{ padding: 16 }}>
                  {byggdelHierarchyLoading ? (
                    <Text style={{ color: '#444' }}>Laddar moment…</Text>
                  ) : null}

                  {byggdelMallarLoading ? (
                    <Text style={{ color: '#444' }}>Laddar mallar…</Text>
                  ) : null}

                  {controlType === 'Arbetsberedning' ? (
                    <TouchableOpacity
                      onPress={() => {
                        const current = (Array.isArray(aktivaByggdelarSelectedKeys) ? aktivaByggdelarSelectedKeys : []);
                        setAktivaByggdelarDraftKeys(current);
                        setAktivaByggdelarExpandedPrefix('');
                        setShowAktivaByggdelarModal(true);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        backgroundColor: '#fff',
                        alignSelf: 'flex-start',
                        marginBottom: 10,
                      }}
                      accessibilityRole="button"
                      accessibilityLabel="Aktiva byggdelar"
                    >
                      <Text style={{ color: '#1976D2', fontWeight: '700' }}>Aktiva byggdelar</Text>
                    </TouchableOpacity>
                  ) : null}

                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 10 }}>Välj byggdel och moment.</Text>

                  {controlType === 'Arbetsberedning' && (!Array.isArray(aktivaByggdelarSelectedKeys) || aktivaByggdelarSelectedKeys.length === 0) ? (
                    <Text style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
                      Inga byggdelar är aktiva ännu. Tryck på “Aktiva byggdelar” och välj vilka moment som är aktuella i projektet.
                    </Text>
                  ) : null}

                  {/* Step 1: Huvudgrupp */}
                  {controlType === 'Egenkontroll' && (
                    <TouchableOpacity
                      onPress={() => {
                        LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                        setShowByggdelHuvudgruppRolldown(prev => !prev);
                      }}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        borderRadius: 10,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        backgroundColor: '#fff',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 8,
                      }}
                      accessibilityLabel="Byggdel"
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 14, color: '#222', fontWeight: '700' }}>Byggdel</Text>
                        <Text style={{ fontSize: 12, color: '#666', marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>
                          {byggdelHuvudgruppDraft ? byggdelHuvudgruppDraft : 'Välj'}
                        </Text>
                      </View>
                      <Ionicons name={showByggdelHuvudgruppRolldown ? 'chevron-up' : 'chevron-down'} size={18} color={'#666'} style={{ marginLeft: 8 }} />
                    </TouchableOpacity>
                  )}

                  {(controlType !== 'Egenkontroll' || showByggdelHuvudgruppRolldown) && (
                    <View style={{ flexDirection: 'column' }}>
                      {(() => {
                        const options = Array.isArray(byggdelHuvudgruppOptions) ? byggdelHuvudgruppOptions : [];
                        if (controlType !== 'Arbetsberedning') return options;
                        const selected = Array.isArray(aktivaByggdelarSelectedKeys) ? aktivaByggdelarSelectedKeys : [];
                        if (!selected || selected.length === 0) return [];
                        const selectedPrefixes = new Set(selected
                          .map(k => String(k || '').split('||')[0].trim())
                          .filter(Boolean));
                        return options.filter(hg => selectedPrefixes.has(String(hg || '').split('-')[0].trim()));
                      })().map(hg => {
                      const isSelected = String(byggdelHuvudgruppDraft || '') === hg;
                      const isExpanded = String(byggdelExpandedHuvudgrupp || '') === hg;
                      const hgKeyPrefix = String(hg || '').split('-')[0].trim();
                      const momentsCandidate = (byggdelMomentsByGroup && (byggdelMomentsByGroup[hg] || byggdelMomentsByGroup[hgKeyPrefix])) || [];
                      let moments = Array.isArray(momentsCandidate) ? momentsCandidate : [];
                      if (controlType === 'Arbetsberedning') {
                        const selected = Array.isArray(aktivaByggdelarSelectedKeys) ? aktivaByggdelarSelectedKeys : [];
                        if (!selected || selected.length === 0) {
                          moments = [];
                        } else {
                          const activeSet = new Set(selected
                            .filter(k => String(k || '').startsWith(`${hgKeyPrefix}||`))
                            .map(k => String(k || '').split('||')[1])
                            .map(x => String(x || '').trim())
                            .filter(Boolean));
                          moments = moments.filter(mm => activeSet.has(String(mm || '').trim()));
                        }
                      }
                      return (
                        <View key={`hg-${hg}`} style={{ marginBottom: 8 }}>
                          <TouchableOpacity
                            onPress={() => {
                              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);

                              // Toggle expansion
                              const nextExpanded = isExpanded ? '' : hg;
                              setByggdelExpandedHuvudgrupp(nextExpanded);

                              // Selecting a huvudgrupp resets moment (unless staying on same group)
                              if (!isSelected) {
                                setByggdelHuvudgruppDraft(hg);
                                setByggdelMomentDraft('');
                                setByggdelMallDraft(null);
                                setByggdelExpandedMomentKey('');
                                setShowCreateByggdelMallModal(false);
                                setCreateByggdelMallContext(null);
                                setNewByggdelMallName('');
                              }
                              setShowCreateByggdelMoment(false);
                              setNewByggdelMomentName('');
                            }}
                            style={{
                              paddingVertical: 10,
                              paddingHorizontal: 12,
                              borderRadius: 10,
                              borderWidth: 1,
                              borderColor: isExpanded ? '#1976D2' : '#e0e0e0',
                              backgroundColor: isExpanded ? '#E8F0FF' : '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                            }}
                          >
                            <Text style={{ color: isExpanded ? '#1976D2' : '#444', fontWeight: isExpanded ? '700' : '500', flex: 1 }} numberOfLines={2}>
                              {hg}
                            </Text>
                            <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={isExpanded ? '#1976D2' : '#666'} style={{ marginLeft: 8 }} />
                          </TouchableOpacity>

                          {isExpanded ? (
                            <View style={{ marginTop: 4, paddingLeft: 12, paddingRight: 12, paddingBottom: 2 }}>

                              {moments.length === 0 ? (
                                <Text style={{ color: '#666' }}>Inga moment finns ännu för denna byggdel.</Text>
                              ) : (
                                <View style={{ flexDirection: 'column' }}>
                                  {moments.map((mm) => {
                                    const momentKey = `${hgKeyPrefix}||${String(mm || '')}`;
                                    const isMomentExpanded = String(byggdelExpandedMomentKey || '') === momentKey;
                                    const mallarForMoment = (Array.isArray(byggdelMallar) ? byggdelMallar : []).filter(m => {
                                      const mg = String(m && (m.huvudgrupp ?? '')).trim();
                                      const mom = String(m && (m.moment ?? '')).trim();
                                      return mg === hgKeyPrefix && mom === String(mm || '').trim();
                                    });
                                    return (
                                      <View key={`mm-${hg}-${mm}`} style={{ marginBottom: 6 }}>
                                        <TouchableOpacity
                                          onPress={() => {
                                            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                            setByggdelMomentDraft(String(mm || ''));
                                            setByggdelMallDraft(null);
                                            setNewByggdelMallName('');
                                            setByggdelExpandedMomentKey(isMomentExpanded ? '' : momentKey);
                                          }}
                                          style={{
                                            paddingVertical: 10,
                                            paddingHorizontal: 12,
                                            borderRadius: 10,
                                            borderWidth: 1,
                                            borderColor: isMomentExpanded ? '#1976D2' : '#e0e0e0',
                                            backgroundColor: isMomentExpanded ? '#E8F0FF' : '#fff',
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            justifyContent: 'space-between',
                                          }}
                                        >
                                          <Text style={{ color: isMomentExpanded ? '#1976D2' : '#444', fontWeight: isMomentExpanded ? '700' : '500', flex: 1 }} numberOfLines={2}>
                                            {String(mm || '')}
                                          </Text>
                                          <Ionicons name={isMomentExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={isMomentExpanded ? '#1976D2' : '#666'} style={{ marginLeft: 8 }} />
                                        </TouchableOpacity>

                                        {isMomentExpanded ? (
                                          <View style={{ marginTop: 4, paddingLeft: 12, paddingRight: 12, paddingBottom: 2 }}>
                                            {controlType === 'Egenkontroll' && (
                                              <TouchableOpacity
                                                onPress={() => {
                                                  LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                  setShowKontrollplanRolldown(prev => !prev);
                                                }}
                                                style={{
                                                  paddingVertical: 10,
                                                  paddingHorizontal: 12,
                                                  borderRadius: 10,
                                                  borderWidth: 1,
                                                  borderColor: '#e0e0e0',
                                                  backgroundColor: '#fff',
                                                  flexDirection: 'row',
                                                  alignItems: 'center',
                                                  justifyContent: 'space-between',
                                                  marginBottom: 8,
                                                }}
                                                accessibilityLabel="Kontrollplan"
                                              >
                                                <View style={{ flexDirection: 'row', alignItems: 'baseline', flex: 1, minWidth: 0 }}>
                                                  <Text style={{ fontSize: 14, color: '#222', fontWeight: '700' }}>Kontrollplan</Text>
                                                  <Text style={{ fontSize: 12, color: '#666', marginLeft: 8, flexShrink: 1 }} numberOfLines={1}>
                                                    {(() => {
                                                      const tpl = byggdelTemplate || null;
                                                      const tplHg = String(tpl?.huvudgrupp || '').trim();
                                                      const tplMom = String(tpl?.moment || '').trim();
                                                      const tplMall = String((tpl && (tpl.mallName || tpl.name)) || '').trim();
                                                      const isForThis = tplHg === String(hgKeyPrefix || '').trim() && tplMom === String(mm || '').trim();
                                                      return (isForThis && tplMall) ? tplMall : 'Välj';
                                                    })()}
                                                  </Text>
                                                </View>
                                                <Ionicons name={showKontrollplanRolldown ? 'chevron-up' : 'chevron-down'} size={18} color={'#666'} style={{ marginLeft: 8 }} />
                                              </TouchableOpacity>
                                            )}

                                            {(controlType !== 'Egenkontroll' || showKontrollplanRolldown) && (
                                              <View>
                                                {mallarForMoment.length === 0 ? (
                                                  <Text style={{ color: '#666', marginBottom: 8 }}>Inga mallar skapade.</Text>
                                                ) : (
                                                  <View style={{ marginBottom: 8 }}>
                                                    {mallarForMoment.map((m) => {
                                                      const id = m && m.id ? String(m.id) : '';
                                                      const name = String(m && (m.name || '')).trim();
                                                      const isSelectedMall = !!(byggdelMallDraft && ((byggdelMallDraft.id && id && byggdelMallDraft.id === id) || (byggdelMallDraft.name && name && byggdelMallDraft.name === name)));
                                                      return (
                                                        <TouchableOpacity
                                                          key={`mall-${momentKey}-${id || name}`}
                                                          onPress={() => {
                                                            if (suppressNextMallPressRef.current) return;
                                                            setByggdelMallDraft({ id: id || null, name });
                                                            openByggdelMallEditor(m);
                                                          }}
                                                          delayLongPress={2000}
                                                          onLongPress={() => {
                                                            if (!id && !name) return;
                                                            suppressNextMallPressRef.current = true;
                                                            setTimeout(() => { suppressNextMallPressRef.current = false; }, 350);

                                                            Alert.alert(
                                                              'Mall',
                                                              name || '(namnlös mall)',
                                                              [
                                                                { text: 'Avbryt', style: 'cancel' },
                                                                {
                                                                  text: 'Ändra mall',
                                                                  onPress: () => {
                                                                    openByggdelMallEditor(m);
                                                                  }
                                                                },
                                                                {
                                                                  text: 'Radera',
                                                                  style: 'destructive',
                                                                  onPress: () => {
                                                                    if (!id) {
                                                                      Alert.alert('Kunde inte radera', 'Mallen saknar id.');
                                                                      return;
                                                                    }

                                                                    Alert.alert(
                                                                      'Radera mall?',
                                                                      `Vill du radera "${name || '(namnlös mall)'}"?`,
                                                                      [
                                                                        { text: 'Avbryt', style: 'cancel' },
                                                                        {
                                                                          text: 'Radera',
                                                                          style: 'destructive',
                                                                          onPress: async () => {
                                                                            try {
                                                                              if (deletingByggdelMallId) return;
                                                                              setDeletingByggdelMallId(id);
                                                                              await deleteByggdelMall({ mallId: id });

                                                                              setByggdelMallar(prev => (Array.isArray(prev) ? prev.filter(x => String(x && x.id ? x.id : '') !== id) : []));

                                                                              // Clear current selection if it was this mall
                                                                              if (byggdelMallDraft) {
                                                                                const pid = byggdelMallDraft.id ? String(byggdelMallDraft.id) : '';
                                                                                const pname = byggdelMallDraft.name ? String(byggdelMallDraft.name).trim() : '';
                                                                                if ((pid && pid === id) || (!pid && pname && pname === name)) {
                                                                                  setByggdelMallDraft(null);
                                                                                }
                                                                              }

                                                                              // Clear saved template reference if it was this mall (avoid dangling mallId)
                                                                              if (byggdelTemplate) {
                                                                                const pmid = byggdelTemplate.mallId ? String(byggdelTemplate.mallId) : '';
                                                                                const pmname = byggdelTemplate.mallName ? String(byggdelTemplate.mallName).trim() : '';
                                                                                const isMatch = (pmid && pmid === id) || (!pmid && pmname && pmname === name);
                                                                                if (isMatch) {
                                                                                  const nextTpl = { huvudgrupp: byggdelTemplate.huvudgrupp, moment: byggdelTemplate.moment };
                                                                                  setByggdelTemplate(nextTpl);
                                                                                  setByggdel(formatByggdelLabelFromTemplate(nextTpl));
                                                                                }
                                                                              }

                                                                              if (byggdelMallEditor && String(byggdelMallEditor.id || '') === id) {
                                                                                setShowByggdelMallEditor(false);
                                                                                setByggdelMallEditor(null);
                                                                                setByggdelMallSectionsDraft([]);
                                                                                setNewByggdelMallSectionTitle('');
                                                                              }
                                                                            } catch (_e) {
                                                                              const msg = (e && e.message) ? String(e.message) : '';
                                                                              const code = e && e.code ? String(e.code) : '';
                                                                              const isPermission = code === 'permission-denied' || (msg && msg.toLowerCase().includes('permission'));
                                                                              if (isPermission) {
                                                                                Alert.alert('Kunde inte radera', 'Du saknar behörighet att radera mallar i företaget.');
                                                                              } else {
                                                                                Alert.alert('Kunde inte radera', 'Försök igen.');
                                                                              }
                                                                            } finally {
                                                                              setDeletingByggdelMallId('');
                                                                            }
                                                                          }
                                                                        }
                                                                      ]
                                                                    );
                                                                  }
                                                                }
                                                              ]
                                                            );
                                                          }}
                                                          style={{
                                                            paddingVertical: 10,
                                                            paddingHorizontal: 12,
                                                            borderRadius: 10,
                                                            borderWidth: 1,
                                                            borderColor: isSelectedMall ? '#1976D2' : '#e0e0e0',
                                                            backgroundColor: isSelectedMall ? '#E8F0FF' : '#fff',
                                                            marginBottom: 6,
                                                            opacity: deletingByggdelMallId && deletingByggdelMallId === id ? 0.5 : 1,
                                                          }}
                                                        >
                                                          <Text style={{ color: isSelectedMall ? '#1976D2' : '#444', fontWeight: isSelectedMall ? '700' : '500' }}>
                                                            {name || '(namnlös mall)'}
                                                          </Text>
                                                        </TouchableOpacity>
                                                      );
                                                    })}
                                                  </View>
                                                )}

                                                <TouchableOpacity
                                                  onPress={() => {
                                                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                                    setCreateByggdelMallContext({ huvudgrupp: hgKeyPrefix, moment: String(mm || '').trim(), momentKey });
                                                    setNewByggdelMallName('');
                                                    setShowCreateByggdelMallModal(true);
                                                  }}
                                                  style={{
                                                    paddingVertical: 10,
                                                    paddingHorizontal: 2,
                                                    alignItems: 'flex-start',
                                                  }}
                                                  accessibilityRole="button"
                                                  accessibilityLabel="Skapa ny mall"
                                                >
                                                  <Text style={{ color: '#1976D2', fontWeight: '700' }}>+ Skapa ny mall</Text>
                                                </TouchableOpacity>
                                              </View>
                                            )}
                                          </View>
                                        ) : null}
                                      </View>
                                    );
                                  })}
                                </View>
                              )}
                            </View>
                          ) : null}
                        </View>
                      );
                      })}
                    </View>
                  )}

                </View>

                {/* Create mall overlay (inside Byggdel modal for iOS/Expo Go stability) */}
                {showCreateByggdelMallModal ? (
                  <View style={{ pointerEvents: 'box-none', position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}>
                    <View
                      style={{
                        flex: 1,
                        justifyContent: 'flex-end',
                        alignItems: 'center',
                        paddingTop: 14,
                        paddingHorizontal: 14,
                        paddingBottom: createMallKeyboardHeight > 0 ? createMallKeyboardHeight : 14,
                      }}
                    >
                      <View style={{ width: '100%', maxWidth: 380, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd' }}>
                        <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                          <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>Skapa ny mall</Text>
                          {!!(createByggdelMallContext && createByggdelMallContext.moment) ? (
                            <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                              {String(createByggdelMallContext.moment || '').trim()}
                            </Text>
                          ) : null}
                        </View>

                        <View style={{ padding: 16 }}>
                          <TextInput
                            value={newByggdelMallName}
                            onChangeText={setNewByggdelMallName}
                            placeholder="Mallnamn"
                            placeholderTextColor="#888"
                            style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff' }}
                          />
                        </View>

                        <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }}>
                          <TouchableOpacity onPress={closeCreateByggdelMallModal} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                            <Text style={{ color: '#777' }}>Avbryt</Text>
                          </TouchableOpacity>
                          <TouchableOpacity onPress={submitCreateByggdelMall} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                            <Text style={{ color: '#1976D2', fontWeight: '700' }}>{savingByggdelMall ? 'Sparar…' : 'Spara'}</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  </View>
                ) : null}

                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity onPress={closeByggdelModal} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                    <Text style={{ color: '#777' }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const hg = String(byggdelHuvudgruppDraft || '').trim();
                      const mm = String(byggdelMomentDraft || '').trim();

                      if (!hg) {
                        setByggdelTemplate(null);
                        setByggdel('');
                        closeByggdelModal();
                        return;
                      }

                      const hgKeyPrefix = String(hg || '').split('-')[0].trim();
                      const momentsCandidate = (byggdelMomentsByGroup && (byggdelMomentsByGroup[hg] || byggdelMomentsByGroup[hgKeyPrefix])) || [];
                      const availableMoments = Array.isArray(momentsCandidate) ? momentsCandidate : [];

                      if (!mm && availableMoments.length > 0) {
                        Alert.alert('Välj moment', 'Välj ett moment under vald byggdel innan du sparar.');
                        return;
                      }

                      const mid = byggdelMallDraft && byggdelMallDraft.id ? String(byggdelMallDraft.id) : null;
                      const mname = byggdelMallDraft && byggdelMallDraft.name ? String(byggdelMallDraft.name) : '';
                      const tpl = mm
                        ? (mid || mname ? { huvudgrupp: hg, moment: mm, mallId: mid, mallName: mname } : { huvudgrupp: hg, moment: mm })
                        : { huvudgrupp: hg };

                      const finishSave = () => {
                        setByggdelTemplate(tpl);
                        setByggdel(formatByggdelLabelFromTemplate(tpl));
                        setShowCategoryModal(false);
                        closeByggdelModal();
                      };

                      // If a mall is selected, apply its points as the Arbetsberedning checklist.
                      if (controlType === 'Arbetsberedning' && (mid || mname)) {
                        const mallList = Array.isArray(byggdelMallar) ? byggdelMallar : [];
                        const selectedMall = (mid
                          ? mallList.find(m => String(m && m.id ? m.id : '') === String(mid))
                          : null) || mallList.find(m => {
                          const nm = String(m && (m.name ?? '')).trim();
                          const hg2 = String(m && (m.huvudgrupp ?? '')).trim();
                          const mm2 = String(m && (m.moment ?? '')).trim();
                          return !!mname && nm === String(mname).trim() && hg2 === hgKeyPrefix && mm2 === String(mm || '').trim();
                        });
                        const mallPoints = Array.isArray(selectedMall && selectedMall.points) ? selectedMall.points : [];
                        const mallSections = Array.isArray(selectedMall && selectedMall.sections) ? selectedMall.sections : [];
                        const nextChecklist = buildChecklistFromMallPoints({ mallName: mname || (selectedMall && selectedMall.name) || 'Mall', points: mallPoints, sections: mallSections });
                        const shouldConfirm = hasAnyChecklistPoints(checklistRef.current);

                        if (shouldConfirm) {
                          Alert.alert(
                            'Ersätta kontrollpunkter?',
                            'Detta ersätter dina nuvarande punkter.',
                            [
                              { text: 'Avbryt', style: 'cancel' },
                              {
                                text: 'Fortsätt',
                                style: 'destructive',
                                onPress: () => {
                                  setChecklist(nextChecklist);
                                  setExpandedChecklist([]);
                                  finishSave();
                                }
                              }
                            ]
                          );
                          return;
                        }

                        setChecklist(nextChecklist);
                        setExpandedChecklist([]);
                        finishSave();
                        return;
                      }

                      finishSave();
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                  >
                    <Text style={{ color: '#1976D2', fontWeight: '600' }}>Spara</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {showAktivaByggdelarModal ? (
                <View style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 350 }}>
                  <Pressable onPress={() => setShowAktivaByggdelarModal(false)} style={{ position: 'absolute', top: 0, right: 0, bottom: 0, left: 0 }} />
                  <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 20, width: 320, height: '80%', alignItems: 'stretch', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 8 }}>
                    <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Aktiva byggdelar</Text>
                    <ScrollView style={{ flex: 1, marginBottom: 12 }}>
                      {(Array.isArray(byggdelHuvudgruppOptions) ? byggdelHuvudgruppOptions : []).map((hg) => {
                        const prefix = String(hg || '').split('-')[0].trim();
                        const isExpanded = String(aktivaByggdelarExpandedPrefix || '') === String(prefix || '');
                        const momentsCandidate = (byggdelMomentsByGroup && (byggdelMomentsByGroup[hg] || byggdelMomentsByGroup[prefix])) || [];
                        const moments = Array.isArray(momentsCandidate) ? momentsCandidate : [];
                        const draftSet = new Set((Array.isArray(aktivaByggdelarDraftKeys) ? aktivaByggdelarDraftKeys : []).map(x => String(x || '').trim()).filter(Boolean));

                        return (
                          <View key={`ab-hg-active-${hg}`} style={{ marginBottom: 6 }}>
                            <TouchableOpacity
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setAktivaByggdelarExpandedPrefix(prev => (String(prev || '') === String(prefix || '') ? '' : prefix));
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 10 }}
                              hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            >
                              <Text style={{ fontSize: 15, color: '#222', fontWeight: '700', flex: 1 }} numberOfLines={2}>{hg}</Text>
                              <Ionicons name={isExpanded ? 'chevron-up' : 'chevron-down'} size={18} color={'#666'} style={{ marginLeft: 8 }} />
                            </TouchableOpacity>

                            {isExpanded ? (
                              <View style={{ paddingLeft: 14, paddingBottom: 8 }}>
                                {moments.length === 0 ? (
                                  <Text style={{ color: '#666', marginBottom: 6 }}>Inga byggdelar finns ännu för denna nivå.</Text>
                                ) : (
                                  <View style={{ flexDirection: 'column' }}>
                                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setAktivaByggdelarDraftKeys(prev => {
                                            const cur = new Set((Array.isArray(prev) ? prev : []).map(x => String(x || '').trim()).filter(Boolean));
                                            const next = new Set(cur);
                                            (Array.isArray(moments) ? moments : []).forEach(mm => {
                                              const momentLabel = String(mm || '').trim();
                                              if (!prefix || !momentLabel) return;
                                              next.add(`${prefix}||${momentLabel}`);
                                            });
                                            return Array.from(next);
                                          });
                                        }}
                                        style={{ paddingVertical: 6, paddingHorizontal: 0 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Välj alla byggdelar i ${hg}`}
                                      >
                                        <Text style={{ color: '#1976D2', fontWeight: '700', fontSize: 13 }}>Välj alla i nivån</Text>
                                      </TouchableOpacity>
                                      <TouchableOpacity
                                        onPress={() => {
                                          setAktivaByggdelarDraftKeys(prev => {
                                            const cur = new Set((Array.isArray(prev) ? prev : []).map(x => String(x || '').trim()).filter(Boolean));
                                            const next = new Set(cur);
                                            (Array.isArray(moments) ? moments : []).forEach(mm => {
                                              const momentLabel = String(mm || '').trim();
                                              if (!prefix || !momentLabel) return;
                                              next.delete(`${prefix}||${momentLabel}`);
                                            });
                                            return Array.from(next);
                                          });
                                        }}
                                        style={{ paddingVertical: 6, paddingHorizontal: 0 }}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Rensa byggdelar i ${hg}`}
                                      >
                                        <Text style={{ color: '#777', fontWeight: '700', fontSize: 13 }}>Rensa nivån</Text>
                                      </TouchableOpacity>
                                    </View>

                                    {moments.map((mm) => {
                                      const momentLabel = String(mm || '').trim();
                                      const key = `${prefix}||${momentLabel}`;
                                      const checked = !!(prefix && momentLabel && draftSet.has(key));
                                      return (
                                        <TouchableOpacity
                                          key={`ab-mm-active-${prefix}-${momentLabel}`}
                                          onPress={() => {
                                            setAktivaByggdelarDraftKeys(prev => {
                                              const cur = new Set((Array.isArray(prev) ? prev : []).map(x => String(x || '').trim()).filter(Boolean));
                                              if (!prefix || !momentLabel) return Array.from(cur);
                                              if (cur.has(key)) cur.delete(key);
                                              else cur.add(key);
                                              return Array.from(cur);
                                            });
                                          }}
                                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8 }}
                                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                        >
                                          <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={20} color={checked ? '#1976D2' : '#666'} style={{ marginRight: 10 }} />
                                          <Text style={{ fontSize: 14, color: '#222', flex: 1 }} numberOfLines={2}>{momentLabel}</Text>
                                        </TouchableOpacity>
                                      );
                                    })}
                                  </View>
                                )}
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </ScrollView>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <TouchableOpacity onPress={() => setShowAktivaByggdelarModal(false)} style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8 }}>
                        <Text style={{ color: '#777' }}>Avbryt</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          try {
                            const draftSet = new Set((Array.isArray(aktivaByggdelarDraftKeys) ? aktivaByggdelarDraftKeys : [])
                              .map(x => String(x || '').trim())
                              .filter(x => !!x && x.includes('||')));

                            const normalized = Array.from(draftSet);

                            setAktivaByggdelarSelectedKeys(normalized);
                            const pid = project && project.id ? String(project.id) : '';
                            if (pid) {
                              AsyncStorage.setItem(arbetsberedningActiveByggdelKey(pid), JSON.stringify({ selectedKeys: normalized })).catch((e) => {});
                            }
                          } catch (_e) {}
                          setShowAktivaByggdelarModal(false);
                        }}
                        style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginLeft: 8 }}
                      >
                        <Text style={{ color: '#1976D2', fontWeight: '600' }}>Bekräfta</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ) : null}
            </View>
          </Modal>
        )}

        {/* Create mall popup (separate from Byggdel modal to avoid nested Modals) */}
        {controlType === 'Arbetsberedning' && (
          <Modal visible={showCreateByggdelMallModal && !showByggdelModal} transparent animationType="fade" onRequestClose={() => {}}>
            <View style={{ pointerEvents: 'box-none', flex: 1, backgroundColor: 'rgba(0,0,0,0.25)' }}>
              <View
                style={{
                  flex: 1,
                  justifyContent: 'flex-end',
                  alignItems: 'center',
                  paddingTop: 14,
                  paddingHorizontal: 14,
                  paddingBottom: createMallKeyboardHeight > 0 ? createMallKeyboardHeight : 14,
                }}
              >
                <View style={{ width: '90%', maxWidth: 420, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd' }}>
                  <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                    <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }}>Skapa ny mall</Text>
                    {!!(createByggdelMallContext && createByggdelMallContext.moment) ? (
                      <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                        {String(createByggdelMallContext.moment || '').trim()}
                      </Text>
                    ) : null}
                  </View>

                <View style={{ padding: 16 }}>
                  <TextInput
                    value={newByggdelMallName}
                    onChangeText={setNewByggdelMallName}
                    placeholder="Mallnamn"
                    placeholderTextColor="#888"
                    style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff' }}
                  />
                </View>

                  <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }}>
                    <TouchableOpacity onPress={closeCreateByggdelMallModal} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                      <Text style={{ color: '#777' }}>Avbryt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={submitCreateByggdelMall} style={{ paddingVertical: 10, paddingHorizontal: 12 }}>
                      <Text style={{ color: '#1976D2', fontWeight: '700' }}>{savingByggdelMall ? 'Sparar…' : 'Spara'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          </Modal>
        )}

        {/* Byggdel mall editor (kontrollpunkter) */}
        {controlType === 'Arbetsberedning' && (
          <Modal
            visible={showByggdelMallEditor}
            transparent
            animationType="fade"
            onRequestClose={() => {}}
          >
            <View style={{ pointerEvents: 'box-none', flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
              <View style={{ width: '90%', maxWidth: 420, height: '85%', backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', elevation: 8, borderWidth: 1, borderColor: '#ddd', marginBottom: mallEditorKeyboardHeight > 0 ? Math.min(mallEditorKeyboardHeight, 220) : 0 }}>
                <View style={{ backgroundColor: '#fff', paddingVertical: 12, paddingHorizontal: 16, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#eee' }}>
                  <Text style={{ color: '#000', fontSize: 18, fontWeight: '700' }} numberOfLines={2}>
                    {String(byggdelMallEditor && byggdelMallEditor.name ? byggdelMallEditor.name : 'Mall')}
                  </Text>
                  {!!(byggdelMallEditor && (byggdelMallEditor.huvudgrupp || byggdelMallEditor.moment)) ? (
                    <Text style={{ color: '#666', fontSize: 12, marginTop: 4 }} numberOfLines={2}>
                      {String(byggdelMallEditor.huvudgrupp || '').trim()}{byggdelMallEditor.moment ? ` / ${String(byggdelMallEditor.moment || '').trim()}` : ''}
                    </Text>
                  ) : null}
                </View>

                <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16 }}>
                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 10 }}>
                    Rubriker/huvudmoment. Tryck för att visa/dölja kontrollpunkter.
                  </Text>

                  {Array.isArray(byggdelMallSectionsDraft) && byggdelMallSectionsDraft.length > 0 ? (
                    <View style={{ marginBottom: 12 }}>
                      {byggdelMallSectionsDraft.map((sec) => {
                        const sid = String(sec && sec.id ? sec.id : '');
                        const title = String(sec && (sec.title || '')).trim();
                        const pts = Array.isArray(sec && sec.points) ? sec.points : [];
                        const isExpanded = sid && String(byggdelMallEditorExpandedSectionId || '') === sid;

                        return (
                          <View key={`bsec-${sid}`} style={{ marginBottom: 10, backgroundColor: '#fff', borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: '#e0e0e0' }}>
                            <TouchableOpacity
                              onPress={() => {
                                LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                                setByggdelMallEditorExpandedSectionId(prev => (String(prev || '') === sid ? '' : sid));
                              }}
                              style={{ flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: isExpanded ? '#E8F0FF' : '#fff' }}
                              accessibilityRole="button"
                              accessibilityLabel={`Visa eller dölj ${title || 'rubrik'}`}
                            >
                              <Ionicons name={isExpanded ? 'chevron-down' : 'chevron-forward'} size={18} color={isExpanded ? '#1976D2' : '#666'} style={{ marginRight: 10 }} />
                              <Text style={{ flex: 1, color: isExpanded ? '#1976D2' : '#222', fontWeight: '700' }} numberOfLines={2}>
                                {title || '(Rubrik)'}
                              </Text>
                            </TouchableOpacity>

                            {isExpanded ? (
                              <View style={{ padding: 12, paddingTop: 0 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                                  <TextInput
                                    value={title}
                                    onChangeText={(txt) => {
                                      setByggdelMallSectionsDraft(prev => {
                                        const arr = Array.isArray(prev) ? prev : [];
                                        return arr.map(s => {
                                          if (String(s && s.id ? s.id : '') !== sid) return s;
                                          return Object.assign({}, s, { title: txt });
                                        });
                                      });
                                    }}
                                    placeholder="Rubrik / huvudmoment"
                                    placeholderTextColor="#888"
                                    style={{ flex: 1, marginRight: 10, paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, fontWeight: '700', color: '#222', backgroundColor: '#fff' }}
                                  />
                                  <TouchableOpacity
                                    onPress={() => {
                                      Alert.alert(
                                        'Ta bort rubrik?',
                                        `Vill du ta bort "${title || '(Rubrik)'}"?`,
                                        [
                                          { text: 'Avbryt', style: 'cancel' },
                                          {
                                            text: 'Ta bort',
                                            style: 'destructive',
                                            onPress: () => {
                                              setByggdelMallSectionsDraft(prev => (Array.isArray(prev) ? prev.filter(s => String(s && s.id ? s.id : '') !== sid) : []));
                                              setByggdelMallEditorExpandedSectionId(prev => (String(prev || '') === sid ? '' : prev));
                                              setNewByggdelMallPointBySectionId(prev => {
                                                const next = Object.assign({}, (prev && typeof prev === 'object') ? prev : {});
                                                try { delete next[sid]; } catch (_e) {}
                                                return next;
                                              });
                                            }
                                          }
                                        ]
                                      );
                                    }}
                                    accessibilityRole="button"
                                    accessibilityLabel="Ta bort rubrik"
                                    style={{ padding: 6 }}
                                  >
                                    <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                                  </TouchableOpacity>
                                </View>

                                {pts.length > 0 ? (
                                  <View style={{ marginBottom: 10 }}>
                                    {pts.map((p, idx) => {
                                      const statusVal = (sec && Array.isArray(sec.statuses)) ? (sec.statuses[idx] ?? null) : null;
                                      const photosOuter = (sec && Array.isArray(sec.photos)) ? sec.photos : [];
                                      const photoList = Array.isArray(photosOuter[idx]) ? photosOuter[idx] : (photosOuter[idx] ? [photosOuter[idx]] : []);
                                      const hasPhotos = Array.isArray(photoList) && photoList.length > 0;

                                      return (
                                        <View key={`bp-${sid}-${idx}`} style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 10, marginBottom: 8, backgroundColor: '#fff' }}>
                                          <View style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8, paddingTop: 2 }}>
                                            <TouchableOpacity
                                              onPress={() => {
                                                setByggdelMallSectionsDraft(prev => {
                                                  const arr = Array.isArray(prev) ? prev : [];
                                                  return arr.map(s => {
                                                    if (String(s && s.id ? s.id : '') !== sid) return s;
                                                    const pp = Array.isArray(s && s.points) ? s.points : [];
                                                    const statuses = Array.isArray(s && s.statuses) && s.statuses.length === pp.length ? [...s.statuses] : Array(pp.length).fill(null);
                                                    const next = (statuses[idx] === 'ok') ? null : 'ok';
                                                    statuses[idx] = next;
                                                    return Object.assign({}, s, { statuses });
                                                  });
                                                });
                                              }}
                                              style={{ padding: 4, marginRight: 6 }}
                                              accessibilityRole="button"
                                              accessibilityLabel="Markera som godkänd"
                                            >
                                              <Ionicons name={statusVal === 'ok' ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={statusVal === 'ok' ? '#43A047' : '#bbb'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              onPress={() => {
                                                setByggdelMallSectionsDraft(prev => {
                                                  const arr = Array.isArray(prev) ? prev : [];
                                                  return arr.map(s => {
                                                    if (String(s && s.id ? s.id : '') !== sid) return s;
                                                    const pp = Array.isArray(s && s.points) ? s.points : [];
                                                    const statuses = Array.isArray(s && s.statuses) && s.statuses.length === pp.length ? [...s.statuses] : Array(pp.length).fill(null);
                                                    const next = (statuses[idx] === 'avvikelse') ? null : 'avvikelse';
                                                    statuses[idx] = next;
                                                    return Object.assign({}, s, { statuses });
                                                  });
                                                });
                                              }}
                                              style={{ padding: 4 }}
                                              accessibilityRole="button"
                                              accessibilityLabel="Markera som avvikelse"
                                            >
                                              <View style={{ width: 20, height: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: statusVal === 'avvikelse' ? '#D32F2F' : 'transparent' }}>
                                                {statusVal === 'avvikelse' ? (
                                                  <Ionicons name="alert" size={14} color="#fff" />
                                                ) : (
                                                  <Ionicons name="ellipse-outline" size={20} color="#bbb" />
                                                )}
                                              </View>
                                            </TouchableOpacity>
                                          </View>

                                          <TextInput
                                            value={String(p || '')}
                                            onChangeText={(txt) => {
                                              setByggdelMallSectionsDraft(prev => {
                                                const arr = Array.isArray(prev) ? prev : [];
                                                return arr.map(s => {
                                                  if (String(s && s.id ? s.id : '') !== sid) return s;
                                                  const pp = Array.isArray(s && s.points) ? [...s.points] : [];
                                                  if (idx < 0 || idx >= pp.length) return s;
                                                  pp[idx] = txt;
                                                  return Object.assign({}, s, { points: pp });
                                                });
                                              });
                                            }}
                                            multiline
                                            placeholderTextColor="#888"
                                            style={{ color: '#222', flex: 1, marginRight: 10, paddingVertical: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, backgroundColor: '#fff', minHeight: 36, textAlignVertical: 'top' }}
                                          />

                                          <View style={{ flexDirection: 'row', alignItems: 'center', paddingTop: 2 }}>
                                            <TouchableOpacity
                                              onPress={() => {
                                                if (hasPhotos) {
                                                  setPhotoModal({ visible: true, uris: photoList, index: 0, mallSectionId: sid, mallPointIdx: idx });
                                                  return;
                                                }
                                                handlePickMallPointFromLibrary(sid, idx);
                                              }}
                                              style={{ padding: 6, marginRight: 2 }}
                                              accessibilityRole="button"
                                              accessibilityLabel={hasPhotos ? 'Visa bilder' : 'Lägg till bilder'}
                                            >
                                              <Ionicons name={hasPhotos ? 'camera' : 'camera-outline'} size={18} color={'#1976D2'} />
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                              onPress={() => {
                                                setByggdelMallSectionsDraft(prev => {
                                                  const arr = Array.isArray(prev) ? prev : [];
                                                  return arr.map(s => {
                                                    if (String(s && s.id ? s.id : '') !== sid) return s;
                                                    const pp = Array.isArray(s && s.points) ? s.points : [];
                                                    const statuses = Array.isArray(s && s.statuses) && s.statuses.length === pp.length ? s.statuses : Array(pp.length).fill(null);
                                                    const photos = Array.isArray(s && s.photos) && s.photos.length === pp.length ? s.photos : Array(pp.length).fill(null).map(() => []);
                                                    return Object.assign({}, s, {
                                                      points: pp.filter((_, i) => i !== idx),
                                                      statuses: statuses.filter((_, i) => i !== idx),
                                                      photos: photos.filter((_, i) => i !== idx),
                                                    });
                                                  });
                                                });
                                              }}
                                              accessibilityRole="button"
                                              accessibilityLabel="Ta bort kontrollpunkt"
                                              style={{ padding: 6 }}
                                            >
                                              <Ionicons name="trash-outline" size={18} color="#D32F2F" />
                                            </TouchableOpacity>
                                          </View>
                                        </View>
                                      );
                                    })}
                                  </View>
                                ) : (
                                  <Text style={{ color: '#666', marginBottom: 10 }}>Inga kontrollpunkter under denna rubrik ännu.</Text>
                                )}

                                <Text style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>Lägg till kontrollpunkt</Text>
                                <TextInput
                                  value={String((newByggdelMallPointBySectionId && newByggdelMallPointBySectionId[sid]) ? newByggdelMallPointBySectionId[sid] : '')}
                                  onChangeText={(txt) => {
                                    setNewByggdelMallPointBySectionId(prev => Object.assign({}, (prev && typeof prev === 'object') ? prev : {}, { [sid]: txt }));
                                  }}
                                  multiline
                                  placeholder="Ny kontrollpunkt"
                                  placeholderTextColor="#888"
                                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff', marginBottom: 10, minHeight: 44, textAlignVertical: 'top' }}
                                />
                                <TouchableOpacity
                                  onPress={() => {
                                    const raw = (newByggdelMallPointBySectionId && newByggdelMallPointBySectionId[sid]) ? newByggdelMallPointBySectionId[sid] : '';
                                    const txt = String(raw || '').trim();
                                    if (!txt) {
                                      Alert.alert('Ange text', 'Skriv en kontrollpunkt.');
                                      return;
                                    }
                                    setByggdelMallSectionsDraft(prev => {
                                      const arr = Array.isArray(prev) ? prev : [];
                                      return arr.map(s => {
                                        if (String(s && s.id ? s.id : '') !== sid) return s;
                                        const pp = Array.isArray(s && s.points) ? s.points : [];
                                        const statuses = Array.isArray(s && s.statuses) && s.statuses.length === pp.length ? s.statuses : Array(pp.length).fill(null);
                                        const photos = Array.isArray(s && s.photos) && s.photos.length === pp.length ? s.photos : Array(pp.length).fill(null).map(() => []);
                                        return Object.assign({}, s, {
                                          points: [...pp, txt],
                                          statuses: [...statuses, null],
                                          photos: [...photos, []],
                                        });
                                      });
                                    });
                                    setNewByggdelMallPointBySectionId(prev => Object.assign({}, (prev && typeof prev === 'object') ? prev : {}, { [sid]: '' }));
                                  }}
                                  style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1976D2', backgroundColor: '#E8F0FF', alignItems: 'center' }}
                                  accessibilityRole="button"
                                  accessibilityLabel="Lägg till kontrollpunkt"
                                >
                                  <Text style={{ color: '#1976D2', fontWeight: '700' }}>+ Lägg till kontrollpunkt</Text>
                                </TouchableOpacity>
                              </View>
                            ) : null}
                          </View>
                        );
                      })}
                    </View>
                  ) : (
                    <Text style={{ color: '#666', marginBottom: 12 }}>Inga rubriker ännu.</Text>
                  )}

                  <Text style={{ fontSize: 13, color: '#444', marginBottom: 6 }}>Lägg till rubrik</Text>
                  <TextInput
                    value={newByggdelMallSectionTitle}
                    onChangeText={setNewByggdelMallSectionTitle}
                    placeholder="Ny rubrik / huvudmoment"
                    placeholderTextColor="#888"
                    style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff', marginBottom: 10 }}
                  />

                  <TouchableOpacity
                    onPress={() => {
                      const title = String(newByggdelMallSectionTitle || '').trim();
                      if (!title) {
                        Alert.alert('Ange rubrik', 'Skriv en rubrik/huvudmoment.');
                        return;
                      }
                      const sid = `sec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
                      setByggdelMallSectionsDraft(prev => {
                        const arr = Array.isArray(prev) ? prev : [];
                        return [...arr, { id: sid, title, points: [], statuses: [], photos: [] }];
                      });
                      setNewByggdelMallSectionTitle('');
                      LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                      setByggdelMallEditorExpandedSectionId(sid);
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: '#1976D2', backgroundColor: '#E8F0FF', alignItems: 'center', marginBottom: 14 }}
                    accessibilityRole="button"
                    accessibilityLabel="Lägg till rubrik"
                  >
                    <Text style={{ color: '#1976D2', fontWeight: '700' }}>+ Lägg till rubrik</Text>
                  </TouchableOpacity>
                </ScrollView>

                <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: '#eee', flexDirection: 'row', justifyContent: 'space-between' }}>
                  <TouchableOpacity
                    onPress={() => setShowByggdelMallEditor(false)}
                    style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Stäng mall"
                  >
                    <Text style={{ color: '#777' }}>Stäng</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        if (!byggdelMallEditor || !byggdelMallEditor.id) return;
                        if (savingByggdelMallPoints) return;
                        setSavingByggdelMallPoints(true);
                        const secs = Array.isArray(byggdelMallSectionsDraft) ? byggdelMallSectionsDraft : [];
                        const sectionsForSave = secs
                          .map(s => {
                            const title = String(s && (s.title || '')).trim();
                            const rawPts = Array.isArray(s && s.points) ? s.points : [];
                            const rawStatuses = Array.isArray(s && s.statuses) ? s.statuses : [];
                            const rawPhotosOuter = Array.isArray(s && s.photos) ? s.photos : [];
                            const normalizeStatus = (v) => (v === 'ok' || v === 'avvikelse' || v === 'ejaktuell') ? v : null;
                            const items = rawPts
                              .map((p, i) => ({
                                text: String(p || '').trim(),
                                status: rawStatuses[i],
                                photos: rawPhotosOuter[i],
                              }))
                              .filter(it => !!it.text);
                            const pts = items.map(it => it.text);
                            const statuses = items.map(it => normalizeStatus(it.status));
                            const photos = items.map(it => {
                              const list = Array.isArray(it.photos) ? it.photos : (it.photos ? [it.photos] : []);
                              return list
                                .map(item => {
                                  if (!item) return null;
                                  if (typeof item === 'string') return item;
                                  if (item && typeof item === 'object' && item.uri) return { uri: item.uri, comment: item.comment || '' };
                                  return null;
                                })
                                .filter(Boolean);
                            });
                            return { title, points: pts, statuses, photos };
                          })
                          .filter(s => String(s && s.title ? s.title : '').trim() || (Array.isArray(s && s.points) && s.points.length > 0));
                        const flatPoints = sectionsForSave.reduce((acc, s) => acc.concat(Array.isArray(s.points) ? s.points : []), []);
                        const ok = await updateByggdelMall({ mallId: byggdelMallEditor.id, patch: { sections: sectionsForSave, points: flatPoints } });
                        if (!ok) {
                          Alert.alert('Kunde inte spara', 'Försök igen.');
                          return;
                        }
                        await refreshByggdelMallar();
                        setShowByggdelMallEditor(false);
                      } catch (_e) {
                        Alert.alert('Kunde inte spara', 'Försök igen.');
                      } finally {
                        setSavingByggdelMallPoints(false);
                      }
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 12 }}
                    accessibilityRole="button"
                    accessibilityLabel="Spara kontrollpunkter"
                  >
                    <Text style={{ color: '#1976D2', fontWeight: '700' }}>{savingByggdelMallPoints ? 'Sparar…' : 'Spara'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>
        )}
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
          </View>
        )}

        {/* Beskriv arbetsmoment endast för Riskbedömning */}
        {controlType === 'Riskbedömning' && (
          <View style={{ marginTop: 8, marginBottom: 10, paddingHorizontal: 16 }}>
            <Text style={{ fontSize: 15, color: '#222', marginBottom: 6, fontWeight: '600' }}>Beskriv arbetsmoment</Text>
            <TextInput
              value={deliveryDesc}
              onChangeText={setDeliveryDesc}
              placeholder="Vad ska göras? T.ex. Lossning av stålbalkar"
              placeholderTextColor="#888"
              style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 15, backgroundColor: '#fff' }}
              multiline
            />
          </View>
        )}
        {/* Button to choose categories for Arbetsberedning */}
        {controlType === 'Arbetsberedning' && Array.isArray(checklistConfig) && (
          <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
            <TouchableOpacity
              onPress={() => {
                if (byggdelMallLocksCategories) return;
                setShowCategoryModal(true);
              }}
              disabled={byggdelMallLocksCategories}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 10,
                paddingHorizontal: 10,
                borderRadius: 10,
                backgroundColor: (Array.isArray(checklist) && checklist.length > 0) ? 'transparent' : '#E8F0FF',
                borderWidth: (Array.isArray(checklist) && checklist.length > 0) ? 0 : 1,
                borderColor: (Array.isArray(checklist) && checklist.length > 0) ? 'transparent' : '#1976D2',
                opacity: byggdelMallLocksCategories ? 0.4 : 1,
              }}
              accessibilityRole="button"
            >
              <Ionicons name="options-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
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
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>{editParticipantIndex !== null ? editParticipantsLabel : addParticipantsLabel}</Text>
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
        {showCategoryModal && !byggdelMallLocksCategories && (
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
                    applySelectedCategoriesToChecklist(selectedCategories);

                    // Persist as project default (local device) for Arbetsberedning
                    if (controlType === 'Arbetsberedning') {
                      try {
                        const pid = project && project.id ? String(project.id) : '';
                        const cfg = Array.isArray(checklistConfig) ? checklistConfig : [];
                        if (pid && cfg.length > 0 && Array.isArray(selectedCategories) && selectedCategories.length === cfg.length) {
                          const selectedLabels = cfg.filter((_, i) => !!selectedCategories[i]).map(sec => sec && sec.label ? sec.label : '').filter(Boolean);
                          AsyncStorage.setItem(arbetsberedningCategoryKey(pid), JSON.stringify({ selectedLabels })).catch((e) => {});
                        }
                      } catch (_e) {}
                    }
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
      {(controlType === 'Arbetsberedning' || (Array.isArray(checklist) && checklist.length > 0)) && (
        <View style={{ marginTop: 8, marginBottom: 16, paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: (missingFields && missingFields.includes('Kontrollpunkter')) ? '#D32F2F' : '#222', marginBottom: 10, marginLeft: 2 }}>Kontrollpunkter</Text>
          {(!Array.isArray(checklist) || checklist.length === 0) ? (
            <Text style={{ color: '#666', fontSize: 14, marginLeft: 2 }}>
              Inga kategorier är valda än. Tryck på “Välj kategorier att gå igenom” ovan.
            </Text>
          ) : null}
          {(Array.isArray(checklist) ? checklist : []).map((section, sectionIdx) => {
            const expanded = expandedChecklist.includes(sectionIdx);
            // Check if any point in this section is not filled in
            const sectionStatuses = checklist[sectionIdx]?.statuses || [];
            const anyMissing = section.points.some((_, idx) => !sectionStatuses[idx]);
            let sectionHeaderBg = anyMissing ? '#FFE5E5' : '#e9ecef';
            let sectionHeaderText = anyMissing ? '#D32F2F' : '#222';
            // Ikonlogik: visa fotoikon om något foto finns, varning om någon avvikelse, grön check om alla är ifyllda (oavsett status)
            const allFilled = section.points.every((_, idx) => !!sectionStatuses[idx]);
            // Only consider unhandled avvikelser as active warnings
            const hasAvvikelse = (sectionStatuses || []).some((s, si) => s === 'avvikelse' && !(section.remediation && section.remediation[(section.points || [])[si]]));

            // Web: make sections with unhandled deviations stand out in yellow
            if (Platform.OS === 'web' && !anyMissing && hasAvvikelse) {
              sectionHeaderBg = '#FFD600';
              sectionHeaderText = '#222';
            }

            const photos = checklist[sectionIdx]?.photos || [];
            const hasPhoto = photos.some(photoArr => Array.isArray(photoArr) && photoArr.length > 0);
            // Web-only: show a small thumbnail preview in the row when photos exist
            let sectionPhotoItems = [];
            let sectionThumbIndex = 0;
            let sectionThumbUri = null;
            if (hasPhoto) {
              try {
                const out = [];
                const outer = Array.isArray(photos) ? photos : [];
                for (const arr of outer) {
                  const inner = Array.isArray(arr) ? arr : (arr ? [arr] : []);
                  for (const item of inner) {
                    const uri = (item && typeof item === 'object' && item.uri) ? item.uri : item;
                    if (uri) out.push(item);
                  }
                }
                sectionPhotoItems = out;
                if (out.length > 0) {
                  sectionThumbIndex = out.length - 1;
                  const thumbItem = out[sectionThumbIndex];
                  sectionThumbUri = (thumbItem && typeof thumbItem === 'object' && thumbItem.uri) ? thumbItem.uri : thumbItem;
                }
              } catch (_e) {
                sectionPhotoItems = [];
                sectionThumbIndex = 0;
                sectionThumbUri = null;
              }
            }
            // Show green check if all filled, regardless of status
            const showGreenCheck = allFilled;

            // Web-only helper: find the first unhandled deviation in this section
            const firstUnhandledDeviationIdx = (() => {
              try {
                const pts = Array.isArray(section.points) ? section.points : [];
                for (let i = 0; i < pts.length; i++) {
                  if ((sectionStatuses || [])[i] !== 'avvikelse') continue;
                  const pt = pts[i];
                  const rem = section.remediation && section.remediation[pt];
                  if (!rem) return i;
                }
              } catch (_e) {}
              return -1;
            })();

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
                      // Count only unhandled deviations (exclude points with saved remediation info)
                      const deviationCount = (sectionStatuses || []).reduce((acc, s, si) => {
                        const rem = section.remediation && section.remediation[(section.points || [])[si]];
                        return acc + ((s === 'avvikelse' && !rem) ? 1 : 0);
                      }, 0);
                      const okCount = (sectionStatuses || []).filter(s => s === 'ok').length;
                      const notRelevantCount = (sectionStatuses || []).filter(s => s === 'ejaktuell').length;
                      const total = (section.points || []).length || 0;
                      const filledCount = okCount + deviationCount + notRelevantCount;

                      // Web: always show labels + counts (even when 0)
                      if (Platform.OS === 'web') {
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6, flexWrap: 'wrap' }}>
                            <Ionicons name="checkmark-circle" size={18} color="#43A047" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 12, color: '#43A047', marginRight: 10 }}>{`Godkänd ${okCount}`}</Text>
                            <Ionicons name="alert-circle" size={18} color="#D32F2F" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 12, color: '#D32F2F', marginRight: 10 }}>{`Avvikelse ${deviationCount}`}</Text>
                            <Ionicons name="remove-circle" size={18} color="#607D8B" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 12, color: '#607D8B' }}>{`Ej aktuell ${notRelevantCount}`}</Text>
                          </View>
                        );
                      }

                      if (filledCount === 0) {
                        // Show legend only if nothing is filled
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                            <Ionicons name="checkmark-circle" size={18} color="#43A047" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 11, color: '#43A047', marginRight: 8 }}>Godkänd</Text>
                            <Ionicons name="alert-circle" size={18} color="#D32F2F" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 11, color: '#D32F2F', marginRight: 8 }}>Avvikelse</Text>
                            <Ionicons name="remove-circle" size={18} color="#607D8B" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 11, color: '#607D8B' }}>Ej aktuell</Text>
                          </View>
                        );
                      } else {
                        // Native: compact icon + count only
                        return (
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                            <Ionicons name="checkmark-circle" size={18} color="#43A047" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 13, color: '#43A047', fontWeight: '600', marginRight: 12 }}>{okCount}</Text>
                            <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#D32F2F', alignItems: 'center', justifyContent: 'center', marginRight: 2 }}>
                              <Ionicons name="alert" size={13} color="#fff" />
                            </View>
                            <Text style={{ fontSize: 13, color: '#D32F2F', fontWeight: '600', marginRight: 12 }}>{deviationCount}</Text>
                            <Ionicons name="remove-circle" size={18} color="#607D8B" style={{ marginRight: 2 }} />
                            <Text style={{ fontSize: 13, color: '#607D8B', fontWeight: '600' }}>{notRelevantCount}</Text>
                          </View>
                        );
                      }
                    })()}
                  </View>
                  {/* Camera / check icons */}
                  {Platform.OS === 'web' && controlType === 'Skyddsrond' && hasAvvikelse && firstUnhandledDeviationIdx >= 0 && (
                    <TouchableOpacity
                      onPress={(e) => {
                        try { e && e.stopPropagation && e.stopPropagation(); } catch (_e) {}
                        try { setExpandedChecklist([sectionIdx]); } catch (_e) {}
                        try {
                          setRemediationModal({
                            visible: true,
                            sectionIdx,
                            pointIdx: firstUnhandledDeviationIdx,
                            comment: '',
                            name: '',
                            date: '',
                            infoMode: false,
                          });
                        } catch (_e) {}
                      }}
                      style={{ marginLeft: 10, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600' }}
                      activeOpacity={0.85}
                      accessibilityLabel={`Åtgärda avvikelse i ${section.label}`}
                    >
                      <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                    </TouchableOpacity>
                  )}
                  {Platform.OS === 'web' && sectionThumbUri && sectionPhotoItems.length > 0 && (
                    <TouchableOpacity
                      onPress={(e) => {
                        try { e && e.stopPropagation && e.stopPropagation(); } catch (_e) {}
                        setPhotoModal({ visible: true, uris: sectionPhotoItems, index: sectionThumbIndex });
                      }}
                      style={{ marginLeft: 8 }}
                      activeOpacity={0.8}
                      accessibilityLabel={`Visa bilder ${section.label}`}
                    >
                      <Image
                        source={{ uri: sectionThumbUri }}
                        style={{ width: 28, height: 28, borderRadius: 4, backgroundColor: '#eee' }}
                        resizeMode="cover"
                      />
                    </TouchableOpacity>
                  )}
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
                      const photosArr = Array.isArray(section.photos) ? section.photos : [];
                      const hasPhotos = Array.isArray(photosArr[pointIdx]) && photosArr[pointIdx].length > 0;
                      const remediation = section.remediation && section.remediation[point] ? section.remediation[point] : null;
                      const isDeviation = section.statuses[pointIdx] === 'avvikelse';
                      const isHandled = !!remediation;
                      const pointText = (typeof point === 'string') ? point : String(point || '');
                      const actionText = (controlType === 'Arbetsberedning' && Array.isArray(section.comments) && typeof section.comments[pointIdx] === 'string')
                        ? section.comments[pointIdx]
                        : '';
                      return (
                        <View key={`point-${pointIdx}`} style={{ marginBottom: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: controlType === 'Arbetsberedning' ? 'flex-start' : 'center', paddingVertical: 8 }}>
                            {/* Status button (OK) */}
                            <TouchableOpacity
                              onPress={() => {
                                setChecklist(prev => prev.map((s, sIdx) => {
                                  if (sIdx !== sectionIdx) return s;
                                  const statuses = Array.isArray(s.statuses) ? [...s.statuses] : Array(s.points.length).fill(null);
                                  statuses[pointIdx] = statuses[pointIdx] === 'ok' ? null : 'ok';
                                  return { ...s, statuses };
                                }));
                              }}
                              style={{ marginRight: 10, padding: 6 }}
                              accessibilityLabel={`Markera ${pointText} som OK`}
                            >
                              <Ionicons name={section.statuses[pointIdx] === 'ok' ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={section.statuses[pointIdx] === 'ok' ? '#43A047' : '#bbb'} />
                            </TouchableOpacity>
                            {/* Status button (Avvikelse) */}
                            <TouchableOpacity
                              onPress={() => {
                                setChecklist(prev => prev.map((s, sIdx) => {
                                  if (sIdx !== sectionIdx) return s;
                                  const statuses = Array.isArray(s.statuses) ? [...s.statuses] : Array(s.points.length).fill(null);
                                  statuses[pointIdx] = statuses[pointIdx] === 'avvikelse' ? null : 'avvikelse';
                                  return { ...s, statuses };
                                }));
                              }}
                              style={{ marginRight: 10, padding: 6 }}
                              accessibilityLabel={`Markera ${pointText} som avvikelse`}
                            >
                              <View style={{ width: 22, height: 22, borderRadius: 11, alignItems: 'center', justifyContent: 'center', backgroundColor: section.statuses[pointIdx] === 'avvikelse' ? '#D32F2F' : 'transparent' }}>
                                {section.statuses[pointIdx] === 'avvikelse' ? (
                                  <Ionicons name="alert" size={18} color="#fff" />
                                ) : (
                                  <Ionicons name="ellipse-outline" size={22} color="#bbb" />
                                )}
                              </View>
                            </TouchableOpacity>
                            {/* Status button (Ej aktuell) */}
                            <TouchableOpacity
                              onPress={() => {
                                setChecklist(prev => prev.map((s, sIdx) => {
                                  if (sIdx !== sectionIdx) return s;
                                  const statuses = Array.isArray(s.statuses) ? [...s.statuses] : Array(s.points.length).fill(null);
                                  statuses[pointIdx] = statuses[pointIdx] === 'ejaktuell' ? null : 'ejaktuell';
                                  return { ...s, statuses };
                                }));
                              }}
                              style={{ marginRight: 10, padding: 6 }}
                              accessibilityLabel={`Markera ${pointText} som ej aktuell`}
                            >
                              <Ionicons name={section.statuses[pointIdx] === 'ejaktuell' ? 'remove-circle' : 'ellipse-outline'} size={22} color={section.statuses[pointIdx] === 'ejaktuell' ? '#607D8B' : '#bbb'} />
                            </TouchableOpacity>
                            {/* Kontrollpunkt text */}
                            {controlType === 'Arbetsberedning' ? (
                              <View style={{ flex: 1, marginRight: 10 }}>
                                <TextInput
                                  value={pointText}
                                  onChangeText={(txt) => {
                                    setChecklist(prev => prev.map((s, sIdx) => {
                                      if (sIdx !== sectionIdx) return s;
                                      const pointsArr = Array.isArray(s.points) ? [...s.points] : [];
                                      if (pointIdx < 0 || pointIdx >= pointsArr.length) return s;
                                      pointsArr[pointIdx] = txt;
                                      return { ...s, points: pointsArr };
                                    }));
                                  }}
                                  placeholder="Risk / moment"
                                  placeholderTextColor="#888"
                                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff', color: '#222' }}
                                  multiline
                                />
                                <TextInput
                                  value={actionText}
                                  onChangeText={(txt) => {
                                    setChecklist(prev => prev.map((s, sIdx) => {
                                      if (sIdx !== sectionIdx) return s;
                                      const pointsArr = Array.isArray(s.points) ? s.points : [];
                                      const comments = Array.isArray(s.comments) && s.comments.length === pointsArr.length
                                        ? [...s.comments]
                                        : Array(pointsArr.length).fill('');
                                      comments[pointIdx] = txt;
                                      return { ...s, comments };
                                    }));
                                  }}
                                  placeholder="Åtgärd / hantering (hur ska risken hanteras?)"
                                  placeholderTextColor="#888"
                                  style={{ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 8, padding: 10, fontSize: 14, backgroundColor: '#fff', color: '#222', marginTop: 8 }}
                                  multiline
                                  textAlignVertical="top"
                                />
                              </View>
                            ) : (
                              <Text style={{ flex: 1, fontSize: 15, color: '#222' }}>{pointText}</Text>
                            )}
                            {/* Photo button */}
                            <TouchableOpacity
                              onPress={() => {
                                if (hasPhotos) {
                                  setPhotoModal({
                                    visible: true,
                                    uris: section.photos[pointIdx].map(uri => (typeof uri === 'string' ? { uri, comment: '' } : uri)),
                                    index: 0,
                                    sectionIdx,
                                    pointIdx,
                                  });
                                } else {
                                  handleNavigateToCamera(sectionIdx, pointIdx, project);
                                }
                              }}
                              style={{ marginLeft: 8, padding: 6 }}
                              accessibilityLabel={hasPhotos ? `Visa och hantera bilder för ${pointText}` : `Lägg till foto för ${pointText}`}
                            >
                              <Ionicons name={hasPhotos ? 'camera' : 'camera-outline'} size={20} color={'#1976D2'} />
                            </TouchableOpacity>
                            {/* Åtgärda-knapp / Info för avvikelse (Skyddsrond).
                                När en åtgärd sparas lagras remediation-info och avvikelsen
                                betraktas som handlad (visas ej som aktiv varning i header),
                                men vi sparar åtgärden för spårbarhet. */}
                            {controlType === 'Skyddsrond' && isDeviation && (
                              isHandled ? (
                                <>
                                  <TouchableOpacity
                                    onPress={() => {
                                      try {
                                        setRemediationModal({
                                          visible: true,
                                          sectionIdx,
                                          pointIdx,
                                          comment: remediation && remediation.comment ? remediation.comment : '',
                                          name: remediation && remediation.name ? remediation.name : '',
                                          date: remediation && remediation.date ? remediation.date : '',
                                          infoMode: true,
                                        });
                                      } catch (_e) {}
                                    }}
                                    style={{ marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#E8F5E9' }}
                                    accessibilityLabel={`Visa åtgärdsinfo för ${pointText}`}
                                  >
                                    <Text style={{ color: '#388E3C', fontSize: 13, fontWeight: '600' }}>Info</Text>
                                  </TouchableOpacity>
                                  <Text style={{ marginLeft: 8, color: '#388E3C', fontSize: 12 }}>
                                    Åtgärdad {remediation.date ? remediation.date.slice(0, 10) : ''} av {remediation.name || ''}
                                  </Text>
                                </>
                              ) : (
                                <TouchableOpacity
                                  onPress={() => {
                                    try {
                                      setRemediationModal({ visible: true, sectionIdx, pointIdx, comment: '', name: '', date: '', infoMode: false });
                                    } catch (_e) {}
                                  }}
                                  style={{ marginLeft: 8, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 0, backgroundColor: '#FFD600' }}
                                  accessibilityLabel={`Åtgärda avvikelse för ${pointText}`}
                                >
                                  <Text style={{ color: '#222', fontSize: 13, fontWeight: '700' }}>Åtgärda</Text>
                                </TouchableOpacity>
                              )
                            )}
                          </View>
                          <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 6, marginBottom: 6 }} />
                        </View>
                      );
                    })}
                    {/* Add custom checklist point button */}
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', marginTop: 8, marginBottom: 8 }}
                      onPress={() => {
                        setAddPointModal({ visible: true, sectionIdx });
                        setNewPointText('');
                        setNewPointActionText('');
                      }}
                      accessibilityLabel="Lägg till kontrollpunkt"
                    >
                      <Text style={{ fontSize: 20, color: '#1976D2', marginRight: 4 }}>+</Text>
                      <Text style={{ color: '#1976D2', fontWeight: 'bold' }}>Lägg till kontrollpunkt</Text>
                    </TouchableOpacity>
                    {/* Modal for adding a new checklist point */}
                    {addPointModal.visible && addPointModal.sectionIdx === sectionIdx && (
                      <Modal
                        visible={addPointModal.visible}
                        transparent
                        animationType="fade"
                        onRequestClose={() => {
                          setAddPointModal({ visible: false, sectionIdx: null });
                          setNewPointText('');
                          setNewPointActionText('');
                        }}
                      >
                        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center' }}>
                          <View style={{ backgroundColor: '#fff', borderRadius: 10, padding: 20, width: '80%', elevation: 5 }}>
                            <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 8 }}>Ny kontrollpunkt</Text>
                            <TextInput
                              value={newPointText}
                              onChangeText={setNewPointText}
                              placeholder={controlType === 'Arbetsberedning' ? 'Risk / moment' : 'Skriv rubrik på kontrollpunkt'}
                              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 16, backgroundColor: '#fafafa' }}
                              autoFocus
                            />
                            {controlType === 'Arbetsberedning' && (
                              <TextInput
                                value={newPointActionText}
                                onChangeText={setNewPointActionText}
                                placeholder="Åtgärd / hantering (hur ska risken hanteras?)"
                                style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 6, padding: 8, fontSize: 16, backgroundColor: '#fafafa', marginTop: 10 }}
                                multiline
                                textAlignVertical="top"
                              />
                            )}
                            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                              <TouchableOpacity onPress={() => {
                                setAddPointModal({ visible: false, sectionIdx: null });
                                setNewPointText('');
                                setNewPointActionText('');
                              }} style={{ marginRight: 16 }}>
                                <Text style={{ color: '#1976D2' }}>Avbryt</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => {
                                if (!newPointText.trim()) return;
                                setChecklist(prev => prev.map((s, sIdx) => {
                                  if (sIdx !== sectionIdx) return s;
                                  const points = [...s.points, newPointText.trim()];
                                  const statuses = Array.isArray(s.statuses) ? [...s.statuses, null] : Array(points.length).fill(null);
                                  const photos = Array.isArray(s.photos) ? [...s.photos, []] : Array(points.length).fill([]);
                                  if (controlType === 'Arbetsberedning') {
                                    const comments = Array.isArray(s.comments) ? [...s.comments, String(newPointActionText || '')] : Array(points.length).fill('');
                                    if (comments.length === points.length) {
                                      comments[points.length - 1] = String(newPointActionText || '');
                                    }
                                    return { ...s, points, statuses, photos, comments };
                                  }
                                  return { ...s, points, statuses, photos };
                                }));
                                setAddPointModal({ visible: false, sectionIdx: null });
                                setNewPointText('');
                                setNewPointActionText('');
                              }}>
                                <Text style={{ color: '#1976D2', fontWeight: 'bold' }}>Lägg till</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </View>
                      </Modal>
                    )}
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
                // Count only unhandled deviations
                if (statuses[pointIdx] === 'avvikelse' && !(section.remediation && section.remediation[section.points[pointIdx]])) deviationPoints++;
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
      {(controlType === 'Mottagningskontroll' || controlType === 'Skyddsrond' || controlType === 'Riskbedömning') && (
        <View style={{ paddingHorizontal: 16, marginTop: 12 }}>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 8, marginBottom: 12 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
            <Text style={{ fontSize: 15, color: (missingFields && (missingFields.includes('Signaturer') || missingFields.includes('Signatur'))) ? '#D32F2F' : '#222', fontWeight: '600', marginBottom: 8 }}>Signaturer</Text>
            <TouchableOpacity onPress={() => setShowAddSignerModal(true)} style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
              <Text style={{ color: '#1976D2' }}>Lägg till signerare</Text>
            </TouchableOpacity>
          </View>
          {localParticipants && localParticipants.length > 0 ? (
            localParticipants.map((p, pIdx) => {
              const name = (typeof p === 'object' && p !== null) ? (p.name || `${p.company || ''}`) : (p || `${participantsLabel} ${pIdx+1}`);
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
                        <TouchableOpacity onPress={() => { const v = existing.strokes || []; setSignatureForIndex(pIdx); setSigStrokes(v); try { sigStrokesRef.current = v; } catch (_e) {} }} style={{ paddingHorizontal: 10, paddingVertical: 6, marginRight: 8 }}>
                          <Text style={{ color: '#1976D2' }}>Byt</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setMottagningsSignatures(prev => prev.filter(s => s.name !== name))} style={{ paddingHorizontal: 10, paddingVertical: 6 }}>
                          <Text style={{ color: '#D32F2F' }}>Ta bort</Text>
                        </TouchableOpacity>
                      </>
                    ) : (
                      <TouchableOpacity onPress={() => { setSignatureForIndex(pIdx); const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (_e) {} }} style={{ paddingHorizontal: 6, paddingVertical: 2 }} accessibilityLabel="Lägg till signatur">
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
              <TouchableOpacity onPress={() => { setSignatureForIndex('mottagnings'); const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (_e) {} }} style={{ paddingVertical: 4, paddingHorizontal: 6 }} accessibilityLabel="Lägg till signatur">
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
          onPress={() => {
            if (!canFinish && controlType === 'Riskbedömning') {
              // Build missing fields list
              const missing = [];
              if (!dateValue || dateValue.trim().length === 0) missing.push('Datum');
              if (!Array.isArray(localParticipants) || localParticipants.length === 0) missing.push('Deltagare');
              if (!deliveryDesc || deliveryDesc.trim().length === 0) missing.push('Beskriv arbetsmoment');
              if (!Array.isArray(checklist) || checklist.length === 0 || !checklist.every(sec => Array.isArray(sec.statuses) && sec.statuses.length > 0 && sec.statuses.every(s => !!s))) missing.push('Alla kontrollpunkter');
              if (!Array.isArray(mottagningsSignatures) || mottagningsSignatures.length === 0) missing.push('Signatur');
              Alert.alert('Kan inte slutföra', 'Följande saknas: ' + missing.join(', '));
              return;
            }

            // For Skyddsrond + Mottagningskontroll: show a clear popup of missing fields
            // instead of doing nothing when canFinish is false (especially important on web).
            if (!canFinish && (controlType === 'Skyddsrond' || controlType === 'Mottagningskontroll')) {
              handleAttemptFinish();
              return;
            }

            if (canFinish) {
              handleAttemptFinish();
            }
          }}
          style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0, opacity: canFinish ? 1 : 0.55 }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
            <Ionicons name="checkmark-circle" size={18} color={(canFinish || (Platform.OS === 'web' && (controlType === 'Skyddsrond' || controlType === 'Mottagningskontroll'))) ? '#1976D2' : '#AAA'} style={{ marginRight: 8 }} />
            <Text style={{ color: (canFinish || (Platform.OS === 'web' && (controlType === 'Skyddsrond' || controlType === 'Mottagningskontroll'))) ? '#1976D2' : '#AAA', fontWeight: 'bold', fontSize: 16 }}>
              {((initialValues && (initialValues.status === 'UTFÖRD' || initialValues.completed)) ? 'Spara' : 'Slutför')}
            </Text>
          </View>
        </TouchableOpacity>
        {((initialValues && (initialValues.status === 'UTFÖRD' || initialValues.completed)) || !isDirtyRef.current) ? (
          <TouchableOpacity
            onPress={() => {
              if (!isDirtyRef.current) {
                // No changes, exit immediately
                if (typeof onExit === 'function') onExit();
                else if (navigation && navigation.goBack) navigation.goBack();
              } else {
                setShowCancelEditConfirm(true);
              }
            }}
            style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="close-circle-outline" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={{ color: '#D32F2F', fontWeight: 'bold', fontSize: 16 }}>Avbryt</Text>
            </View>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            onPress={handleSaveDraft}
            style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 14, paddingHorizontal: 0 }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center' }}>
              <Ionicons name="save-outline" size={18} color="#D32F2F" style={{ marginRight: 8 }} />
              <Text style={{ color: '#D32F2F', fontWeight: 'bold', fontSize: 16 }}>Spara utkast</Text>
            </View>
          </TouchableOpacity>
        )}

      {/* Modal for cancel edit confirmation */}
      <Modal visible={!!showCancelEditConfirm} transparent animationType="fade" onRequestClose={() => setShowCancelEditConfirm(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 24, width: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 16, color: '#222', textAlign: 'center' }}>Vill du verkligen avbryta ändringen?</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%', marginTop: 12 }}>
              <TouchableOpacity
                onPress={() => setShowCancelEditConfirm(false)}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginRight: 8 }}
              >
                <Text style={{ color: '#1976D2', fontWeight: '600' }}>Nej</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowCancelEditConfirm(false);
                  setShowBackConfirm(false); // Prevent double modal
                  try { isDirtyRef.current = false; } catch (_e) {}
                  try { if (blockedNavEvent) blockedNavEvent.current = null; } catch (_e) {}
                  if (typeof onExit === 'function') onExit();
                  else if (navigation && navigation.goBack) navigation.goBack();
                }}
                style={{ flex: 1, alignItems: 'center', paddingVertical: 12, marginLeft: 8 }}
              >
                <Text style={{ color: '#D32F2F', fontWeight: '600' }}>Ja, avbryt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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
              <TouchableOpacity onPress={() => { const v = []; setSigStrokes(v); try { sigStrokesRef.current = v; } catch (_e) {} setSigCurrent([]); }} style={{ padding: 10 }}>
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
                      const name = (typeof p === 'object' && p !== null) ? (p.name || `${p.company || ''}`) : (p || `${participantsLabel} ${signatureForIndex+1}`);
                      setMottagningsSignatures(prev => {
                        const others = (prev || []).filter(s => s.name !== name);
                        return [...others, { name, strokes: strokesToSave }];
                      });
                    }
                    // Reset local signature drawing state and close modal
                    const v = [];
                    setSigStrokes(v);
                    try { sigStrokesRef.current = v; } catch (_e) {}
                    setSigCurrent([]);
                    setSignatureForIndex(null);
                  } catch (_e) {}
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

