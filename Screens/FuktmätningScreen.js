import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';
import { saveControlToFirestore } from '../components/firebase';

const LABELS = {
  title: 'Fuktmätning',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};

export default function FuktmätningScreen({ date, participants = [], project: projectProp, initialValues: initialValuesProp, onExit, onFinished }) {
  const route = useRoute();
  const project = projectProp ?? route.params?.project;
  const initialValues = (initialValuesProp ?? route.params?.initialValues) || undefined;

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        project: data.project || project,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        type: 'Fuktmätning',
        id: data.id || require('uuid').v4(),
      };
      try {
        const ok = await saveControlToFirestore(completed);
        if (!ok) throw new Error('Firestore save failed');
      } catch (e) {
        const existing = await AsyncStorage.getItem('completed_controls');
        let arr = [];
        if (existing) arr = JSON.parse(existing);
        arr.push(completed);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      }
      try {
        const draftRaw = await AsyncStorage.getItem('draft_controls');
        if (draftRaw) {
          let drafts = JSON.parse(draftRaw) || [];
          drafts = drafts.filter(d => !(d.project?.id === project?.id && d.type === 'Fuktmätning' && d.id === completed.id));
          await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
        }
      } catch (e) {}
      alert('Kontrollen har sparats som utförd!');
    } catch (e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
    }
  };

  return (
    <BaseControlForm
      date={date}
      controlType="Fuktmätning"
      labels={LABELS}
      participants={participants}
      project={project}
      onSave={handleSave}
      initialValues={initialValues}
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}
