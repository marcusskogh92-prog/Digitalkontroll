// Import statements

import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';

// Keep only one declaration of WEATHER_OPTIONS at the top of the file

const WEATHER_OPTIONS = [
  'Sol',
  'Moln',
  'Regn',
  'Snö',
  'Vind',
];

const CHECKLIST_CONFIG = [
  { label: '1 - Leverans', questions: [
    'Är leveransen komplett?',
    'Är leveransen i rätt tid?',
    'Är leveransen i rätt mängd?'
  ], answers: [null, null, null], note: '', status: null },
  { label: '2 - Kvalitet', questions: [
    'Är kvaliteten godkänd?',
    'Finns synliga skador?',
    'Är produkten rätt för ändamålet?'
  ], answers: [null, null, null], note: '', status: null },
  { label: '3 - Dokumentation', questions: [
    'Finns nödvändig dokumentation?',
    'Är dokumentationen korrekt?',
    'Är dokumentationen komplett?'
  ], answers: [null, null, null], note: '', status: null },
];

// Removed duplicate ControlForm declaration

// Duplicate CHECKLIST_CONFIG declaration removed.

const LABELS = {
  title: 'Mottagningskontroll',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};


export default function ControlForm({ date, participants = [] }) {
  const route = useRoute();
  const project = route.params?.project;
  return (
    <BaseControlForm
      date={date}
      participants={participants}
      weatherOptions={WEATHER_OPTIONS}
      checklistConfig={CHECKLIST_CONFIG}
      controlType="Mottagningskontroll"
      project={project}
      labels={LABELS}
    />
  );
}


