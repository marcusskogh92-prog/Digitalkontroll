import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';

const LABELS = {
  title: 'Arbetsberedning',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};

const ARBETSBEREDNING_CHECKLIST = [
  { label: 'Arbetsbeskrivning', points: ['Syfte och moment tydligt dokumenterat', 'Tidsplan / uppskattad arbetstid', 'Eventuella start- och stopptider'] },
  { label: 'Riskanalys (RAM)', points: ['Identifierade risker listade', 'Föreslagna åtgärder dokumenterade', 'Ansvarig för åtgärder utsedd'] },
  { label: 'Behörighet & utbildning', points: ['Krävs särskilda certifikat?', 'Personal med rätt kompetens närvarande'] },
  { label: 'Tillstånd & lockout', points: ['Arbetstillstånd på plats (t.ex. heta arbeten)', 'El/isolering eller lockout utförd vid behov'] },
  { label: 'Material & verktyg', points: ['Kontrollerat och godkänt material', 'Verktyg inspekterade och säkra'] },
  { label: 'Maskiner & lyft', points: ['Maskiner besiktigade', 'Lyftplan/riggning kontrollerad', 'Konkret ansvar vid lyft'] },
  { label: 'Personlig skyddsutrustning', points: ['Rätt PPE finns och används', 'Reservutrustning tillgänglig'] },
  { label: 'Trafik & avspärrning', points: ['Skyltning/avspärrning planerad', 'Trafikledning utpekad vid behov'] },
  { label: 'Arbetsområde & ordning', points: ['Fallskydd och räcken på plats', 'Gångvägar fria från hinder', 'Tillräcklig belysning'] },
  { label: 'Kommunikation & ansvar', points: ['Kontaktvägar klara', 'Rollfördelning dokumenterad', 'Radio/telefonnummer testade'] },
  { label: 'Nödlarm & första hjälpen', points: ['Förbandslåda och ansvarig utsedd', 'Evakuering-/larmrutiner klara'] },
  { label: 'Miljöhantering', points: ['Kemikalier/läckagerutiner på plats', 'Avfallshantering och spillplan'] },
  { label: 'Dokumentation & foton', points: ['Signaturer på arbetsberedning', 'Fotos för dokumentation vid start'] },
  { label: 'Avslut & överlämning', points: ['Återställning av plats', 'Borttagning av temporära skydd', 'Överlämningsrapport klar'] },
];

export default function ArbetsberedningScreen({ date, participants = [] }) {
  const route = useRoute();
  const project = route.params?.project;
  const initialValues = route.params?.initialValues;

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        type: 'Arbetsberedning',
        id: data.id || require('uuid').v4(),
      };
      const existing = await AsyncStorage.getItem('completed_controls');
      let arr = [];
      if (existing) arr = JSON.parse(existing);
      arr.push(completed);
      await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
    } catch (e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
    }
  };

  const handleSaveDraft = async (data) => {
    try {
      const draft = {
        ...data,
        status: 'UTKAST',
        savedAt: new Date().toISOString(),
        type: 'Arbetsberedning',
        id: data.id || require('uuid').v4(),
      };
      let arr = [];
      const existing = await AsyncStorage.getItem('draft_controls');
      if (existing) arr = JSON.parse(existing);
      // Ersätt om samma projekt+typ+id redan finns, annars lägg till
      const idx = arr.findIndex(
        c => c.project?.id === project?.id && c.type === 'Arbetsberedning' && c.id === draft.id
      );
      if (idx !== -1) {
        arr[idx] = draft;
      } else {
        arr.push(draft);
      }
      await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
    } catch (e) {
      // Hantera fel
    }
  };

  return (
    <BaseControlForm
      date={date}
      controlType="Arbetsberedning"
      checklistConfig={ARBETSBEREDNING_CHECKLIST}
      labels={LABELS}
      participants={participants}
      project={project}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      initialValues={initialValues}
    />
  );
}
