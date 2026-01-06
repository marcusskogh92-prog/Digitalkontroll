import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import BaseControlForm from '../components/BaseControlForm';
import { saveControlToFirestore, saveDraftToFirestore } from '../components/firebase';

const LABELS = {
  title: 'Riskbedömning',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};



export default function RiskbedömningScreen({ date, participants = [], project: projectProp, initialValues: initialValuesProp, onExit, onFinished }) {
  const route = useRoute();
  const project = projectProp ?? route.params?.project;
  // Se till att initialValues alltid har mottagningsSignatures för att visa signatursektionen
  const initialValuesRaw = (initialValuesProp ?? route.params?.initialValues) || {};

  const RISKBEDOMNING_CHECKLIST = [
    {
      label: 'Identifiera risker',
      points: [
        'Fallrisk',
        'Klämrisk',
        'Tunga lyft',
        'Maskinrörelser',
        'Elrisk',
      ],
    },
    {
      label: 'Åtgärder vidtagna?',
      points: [
        'Personlig skyddsutrustning (hjälm, skyddsskor, handskar)',
        'Avspärrning/varningsskyltar',
        'Rätt lyftutrustning kontrollerad',
        'Kommunikation med alla inblandade',
      ],
    },
  ];

  const initialValues = {
    ...initialValuesRaw,
    mottagningsSignatures: initialValuesRaw.mottagningsSignatures || [],
  };

  const handleSave = async (data) => {
    try {
      const completed = normalizeControl({ ...data, project, status: 'UTFÖRD', savedAt: new Date().toISOString(), id: data.id || uuidv4() });
      try {
        const ok = await saveControlToFirestore(completed);
        if (!ok) throw new Error('Firestore save failed');
      } catch (e) {
        const completedRaw = await AsyncStorage.getItem('completed_controls');
        const completedList = completedRaw ? JSON.parse(completedRaw) : [];
        completedList.push(completed);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(completedList));
      }
      // Remove matching draft if exists
      try {
        const draftRaw = await AsyncStorage.getItem('draft_controls');
        if (draftRaw) {
          let drafts = JSON.parse(draftRaw) || [];
          drafts = drafts.filter(d => !(d.project?.id === project?.id && d.type === 'Riskbedömning' && d.id === completed.id));
          await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
        }
      } catch (e) {}
    } catch (e) {
      // Hantera fel
    }
  };

  const handleSaveDraft = async (data) => {
    try {
      const draft = normalizeControl({ ...data, project, status: 'UTKAST', savedAt: new Date().toISOString(), type: 'Riskbedömning', id: data.id || uuidv4() });
      try {
        const ok = await saveDraftToFirestore(draft);
        if (!ok) throw new Error('Firestore draft save failed');
      } catch (e) {
        let arr = [];
        const existing = await AsyncStorage.getItem('draft_controls');
        if (existing) arr = JSON.parse(existing);
        // Ersätt om samma projekt+typ+id redan finns, annars lägg till
        const idx = arr.findIndex(
          c => c.project?.id === project?.id && c.type === 'Riskbedömning' && c.id === draft.id
        );
        if (idx !== -1) {
          arr[idx] = draft;
        } else {
          arr.push(draft);
        }
        await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
      }
    } catch (e) {
      // Hantera fel
    }
  };

  // Ensure control object has new fields and migrate legacy ones where possible
  function normalizeControl(obj) {
    const c = { ...obj };
    // Ensure fields exist
    c.materialDesc = c.materialDesc || c.material || '';
    c.qualityDesc = c.qualityDesc || '';
    c.coverageDesc = c.coverageDesc || '';
    // Använd samma signaturfält som Mottagningskontroll för att aktivera signaturflödet
    if (c.mottagningsSignature && !c.mottagningsSignatures) {
      c.mottagningsSignatures = [];
    }
    if (!c.mottagningsSignatures) c.mottagningsSignatures = [];
    if (c.mottagningsSignatureUri && (!c.mottagningsSignatures || c.mottagningsSignatures.length === 0)) {
      c.mottagningsSignatures = [{ name: 'Signerad', uri: c.mottagningsSignatureUri }];
    }
    // Ensure checklist exists
    if (!Array.isArray(c.checklist)) c.checklist = [];
    return c;
  }

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
      project={project}
      date={date}
      participants={participants}
      labels={LABELS}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      initialValues={initialValues}
      controlType="Riskbedömning"
      weatherOptions={WEATHER_OPTIONS}
      checklistConfig={RISKBEDOMNING_CHECKLIST}
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}
