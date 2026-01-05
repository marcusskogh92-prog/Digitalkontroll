import { useRoute } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import BaseControlForm from '../components/BaseControlForm';
import { saveControlToFirestore } from '../components/firebase';

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
        project: data.project || project,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        type: 'Arbetsberedning',
        id: data.id || uuidv4(),
      };
      // Central helper handles permission-denied and local fallback.
      await saveControlToFirestore(completed);
    } catch (e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
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
      initialValues={initialValues}
    />
  );
}
