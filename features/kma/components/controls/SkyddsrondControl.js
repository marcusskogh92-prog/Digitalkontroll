
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../../../../components/BaseControlForm';
import { auth, logCompanyActivity, saveControlToFirestore } from '../../../../components/firebase';
import { formatPersonName } from '../../../../components/formatPersonName';
// Skyddsrond checklist config: sections with control points
const SKYDDSROND_CHECKLIST = [
  {
    label: 'Allmän ordning och reda',
    points: [
      'Är gångvägar och arbetsytor fria från hinder?',
      'Är material och verktyg rätt placerade?',
      'Är städning tillfredsställande?',
      'KMA tavla finns på plats?',
      'Arbetsmiljöplan är signerad av beställare?'
    ]
  },
  {
    label: 'Fallrisker och ställningar',
    points: [
      'Finns skyddsräcken där det behövs?',
      'Är ställningar och stegar i gott skick?',
      'Är öppningar och hål skyddade?',
      'Övertagning av ställning har signerats och finns på plats',
      'Sparkskydd finns monterade'
    ]
  },
  {
    label: 'Personlig skyddsutrustning',
    points: [
      'Används hjälm, skyddsskor och väst?',
      'Finns behov av hörselskydd, ögonskydd eller handskar?'
    ]
  },
  {
    label: 'Maskiner och verktyg',
    points: [
      'Är maskiner och verktyg hela och rätt använda?',
      'Finns skydd på maskiner där det krävs?'
    ]
  },
  {
    label: 'El och belysning',
    points: [
      'Är provisorisk el korrekt dragen?',
      'Är kablar hela och rätt placerade?',
      'Är arbetsbelysning tillräcklig?',
      'Ledlister och elkablar sitter upphängda i den mån det går?'
    ]
  },
  {
    label: 'Kemi och farliga ämnen',
    points: [
      'Förvaras kemikalier och farliga ämnen säkert?',
      'Är märkning och skyddsutrustning på plats?',
      'Kemikaliepärm finns på plats?'
    ]
  },
  {
    label: 'Brandskydd',
    points: [
      'Finns brandsläckare och brandfilt?',
      'Är brandsläckare besiktigade och godkända?',
      'Är utrymningsvägar fria och skyltade?',
      'Brandfarliga arbeten hanteras korrekt?'
    ]
  },
  {
    label: 'Lyft och transporter',
    points: [
      'Används rätt lyftanordningar?',
      'Är kranar och truckar besiktigade?'
    ]
  },
  {
    label: 'Första hjälpen och olycksberedskap',
    points: [
      'Finns förbandslåda och rutiner?',
      'Behöver förbandslådor fyllas på med material?',
      'Nödsituation och skyddsorganisation finns anslaget?'
    ]
  },
  {
    label: 'Skyltning och avspärrningar',
    points: [
      'Finns nödvändiga varningsskyltar?',
      'Är riskområden avspärrade?'
    ]
  },
  {
    label: 'Miljö',
    points: [
      'Hanteras avfall och spill korrekt?',
      'Avfallscontainer är skyltade med fraktioner?',
      'Förebyggs utsläpp?'
    ]
  }
];


function getWeekAndYear(dateInput) {
  const d = dateInput ? new Date(dateInput) : new Date();
  d.setHours(0, 0, 0, 0);
  // Thursday in current week decides the year.
  d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
  const week1 = new Date(d.getFullYear(), 0, 4);
  // Calculate full weeks to nearest Thursday
  const weekNo = 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
  return { week: weekNo, year: d.getFullYear() };
}



export default function SkyddsrondControl({
  date,
  participants = [],
  project: projectProp,
  initialValues: initialValuesProp,
  onExit,
  onFinished,
}) {
  const route = useRoute();
  const project = projectProp ?? route.params?.project;
  const initialValuesRaw = (initialValuesProp ?? route.params?.initialValues) || {};
  const initialValues = {
    ...initialValuesRaw,
    mottagningsSignatures: initialValuesRaw.mottagningsSignatures || [],
  };
  const { week, year } = getWeekAndYear(date);
  const LABELS = {
    title: `Skyddsrond ${year} V.${week < 10 ? '0' + week : week}`,
    saveButton: 'Spara',
    saveDraftButton: 'Spara och slutför senare',
  };

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        project: data.project || project,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        type: 'Skyddsrond',
        id: data.id || require('uuid').v4(),
      };
      // Try saving to Firestore first (best-effort). If Firestore fails, fall back to local AsyncStorage.
      try {
        const ok = await saveControlToFirestore(completed);
        if (!ok) throw new Error('Firestore save failed');
      } catch(_e) {
        // fallback to local storage below
      }
      const existing = await AsyncStorage.getItem('completed_controls');
      let arr = [];
      if (existing) arr = JSON.parse(existing);
      // Ersätt befintlig kontroll med samma id, annars lägg till
      const idx = arr.findIndex(c => c.id === completed.id);
      if (idx !== -1) {
        arr[idx] = completed;
      } else {
        arr.push(completed);
      }
      await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      // Log activity (best-effort)
      try {
        const user = auth?.currentUser;
        const actorName = user ? (user.displayName || formatPersonName(user.email || user)) : null;
        await logCompanyActivity({
          type: completed.type || 'Kontroll',
          kind: 'completed',
          projectId: completed.project?.id || null,
          projectName: completed.project?.name || null,
          actorName: actorName || null,
          actorEmail: user?.email || null,
          uid: user?.uid || null,
        });
      } catch(_e) {}
      // Remove any matching drafts for this project+type
      try {
        const draftRaw = await AsyncStorage.getItem('draft_controls');
        if (draftRaw) {
          let drafts = JSON.parse(draftRaw) || [];
          // If we have an id, remove only that draft. Otherwise remove drafts matching project+type.
          if (data && data.id) {
            drafts = drafts.filter(d => !(d.id === data.id && d.project?.id === project?.id && d.type === 'Skyddsrond'));
          } else {
            drafts = drafts.filter(d => !(d.project?.id === project?.id && d.type === 'Skyddsrond'));
          }
          await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
        }
      } catch(_e) {}
      // ...existing code...
    } catch(e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
    }
  };

  const handleSaveDraft = async (data) => {
    // Persistence is handled centrally in BaseControlForm.saveDraftControl().
    // This screen should not write to AsyncStorage to avoid overwriting richer
    // draft objects maintained by the form (which include photos, participants).
    try {
      const draft = {
        ...data,
        project: data.project || project,
        status: 'UTKAST',
        savedAt: new Date().toISOString(),
        type: 'Skyddsrond',
        id: data.id || require('uuid').v4(),
      };
      try {
        const user = auth?.currentUser;
        const actorName = user ? (user.displayName || formatPersonName(user.email || user)) : null;
        await logCompanyActivity({
          type: draft.type || 'Kontroll',
          kind: 'draft',
          projectId: draft.project?.id || null,
          projectName: draft.project?.name || null,
          actorName: actorName || null,
          actorEmail: user?.email || null,
          uid: user?.uid || null,
        });
      } catch(_e) {}
    } catch(_e) {}
  };

  const WEATHER_OPTIONS = [
    { key: 'Soligt', icon: 'sunny' },
    { key: 'Delvis molnigt', icon: 'partly-sunny' },
    { key: 'Molnigt', icon: 'cloudy' },
    { key: 'Regn', icon: 'rainy' },
    { key: 'Snö', icon: 'snow' },
    { key: 'Åska', icon: 'thunderstorm' },
  ];

  return (
    <BaseControlForm
      date={date}
      controlType="Skyddsrond"
      labels={LABELS}
      participants={participants}
      initialValues={initialValues}
      project={project}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      weatherOptions={WEATHER_OPTIONS}
      checklistConfig={SKYDDSROND_CHECKLIST}
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}
