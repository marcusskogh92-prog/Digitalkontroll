import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';
import { auth, logCompanyActivity, saveControlToFirestore } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';

const LABELS = {
  title: 'Egenkontroll',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};

export default function EgenkontrollScreen({
  date,
  participants = [],
  project: projectProp,
  initialValues: initialValuesProp,
  onExit,
  onFinished,
}) {
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
        type: 'Egenkontroll',
        id: data.id || require('uuid').v4(),
      };
      try {
        const ok = await saveControlToFirestore(completed);
        if (!ok) throw new Error('Firestore save failed');
      } catch(_e) {
        const existing = await AsyncStorage.getItem('completed_controls');
        let arr = [];
        if (existing) arr = JSON.parse(existing);
        arr.push(completed);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      }
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
      try {
        const draftRaw = await AsyncStorage.getItem('draft_controls');
        if (draftRaw) {
          let drafts = JSON.parse(draftRaw) || [];
          drafts = drafts.filter(d => !(d.project?.id === project?.id && d.type === 'Egenkontroll' && d.id === completed.id));
          await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
        }
      } catch(_e) {}
      alert('Kontrollen har sparats som utförd!');
      } catch(e) {
      alert('Kunde inte spara kontrollen: ' + (e && e.message ? e.message : String(e)));
    }
  };

  return (
    <BaseControlForm
      date={date}
      controlType="Egenkontroll"
      hideWeather={true}
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
