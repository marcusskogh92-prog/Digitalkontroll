import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import BaseControlForm from '../components/BaseControlForm';

const LABELS = {
  title: 'Riskbedömning',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};

export default function RiskbedömningScreen({ date, participants = [] }) {
  const route = useRoute();
  const project = route.params?.project;

  const handleSave = async (data) => {
    try {
      const completed = {
        ...data,
        status: 'UTFÖRD',
        savedAt: new Date().toISOString(),
        id: data.id || require('uuid').v4(), // Ensure unique ID is generated if data.id is missing
      };
      const existing = await AsyncStorage.getItem('completed_controls');
      let arr = [];
      if (existing) arr = JSON.parse(existing);
      arr.push(completed);
      await AsyncStorage.setItem('completed_controls', JSON.stringify(arr));
      const draft = await AsyncStorage.getItem('draft_control');
      if (draft) {
        const parsed = JSON.parse(draft);
        if (parsed.project?.id === project?.id) {
          await AsyncStorage.removeItem('draft_control');
        }
      }
      alert('Kontrollen har sparats som utförd!');
    } catch (e) {
      alert('Kunde inte spara kontrollen: ' + e.message);
    }
  };

  return (
    <BaseControlForm
      date={date}
      controlType="Riskbedömning"
      labels={LABELS}
      participants={participants}
      project={project}
      onSave={handleSave}
    />
  );
}
