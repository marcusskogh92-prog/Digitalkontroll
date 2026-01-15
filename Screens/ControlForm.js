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
  { label: '1 - Leverans', points: [
    'Är leveransen komplett?',
    'Är leveransen i rätt tid?',
    'Är leveransen i rätt mängd?'
  ] },
  { label: '2 - Kvalitet', points: [
    'Är kvaliteten godkänd?',
    'Finns synliga skador?',
    'Är produkten rätt för ändamålet?'
  ] },
  { label: '3 - Dokumentation', points: [
    'Finns nödvändig dokumentation?',
    'Är dokumentationen korrekt?',
    'Är dokumentationen komplett?'
  ] }
];

// Removed duplicate ControlForm declaration

// Duplicate CHECKLIST_CONFIG declaration removed.

const DEFAULT_LABELS = {
  title: 'Mottagningskontroll',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};


export default function ControlForm({ date, participants = [], project: projectProp, initialValues: initialValuesProp, onExit, onFinished }) {
  const route = useRoute();
  const project = projectProp ?? route.params?.project;
  const initialValues = initialValuesProp ?? route.params?.initialValues;
  const routeControlType = route.params?.controlType;
  const labels = routeControlType
    ? { ...DEFAULT_LABELS, title: routeControlType }
    : DEFAULT_LABELS;
  return (
    <BaseControlForm
      date={date}
      participants={participants}
      weatherOptions={WEATHER_OPTIONS}
      checklistConfig={CHECKLIST_CONFIG}
      controlType="Mottagningskontroll"
      project={project}
      labels={labels}
      initialValues={initialValues}
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}


