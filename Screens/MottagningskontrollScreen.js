import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRoute } from '@react-navigation/native';
import { v4 as uuidv4 } from 'uuid';
import BaseControlForm from '../components/BaseControlForm';
import { saveControlToFirestore, saveDraftToFirestore } from '../components/firebase';

const LABELS = {
  title: 'Mottagningskontroll',
  saveButton: 'Spara',
  saveDraftButton: 'Spara och slutför senare',
};

export default function MottagningskontrollScreen({
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
      // Use existing id if present, otherwise create new
      const controlId = data.id || uuidv4();
      const completed = normalizeControl({ ...data, project, status: 'UTFÖRD', savedAt: new Date().toISOString(), id: controlId });
      try {
        const ok = await saveControlToFirestore(completed);
        if (!ok) throw new Error('Firestore save failed');
      } catch(e) {
        const completedRaw = await AsyncStorage.getItem('completed_controls');
        let completedList = completedRaw ? JSON.parse(completedRaw) : [];
        // Remove all previous versions (by id if present, else by project+type+savedAt)
        let filteredControls = completedList.filter((c) => {
          if (data.id || completed.id) {
            // Remove all with same id
            return c.id !== (data.id || completed.id);
          } else {
            // Remove all with same project+type+savedAt
            return !(
              c.project === data.project &&
              c.type === data.type &&
              c.savedAt === data.savedAt
            );
          }
        });
        filteredControls.push(completed);
        await AsyncStorage.setItem('completed_controls', JSON.stringify(filteredControls));
      }
      // Remove matching draft if exists
      try {
        const draftRaw = await AsyncStorage.getItem('draft_controls');
        if (draftRaw) {
          let drafts = JSON.parse(draftRaw) || [];
          drafts = drafts.filter(d => !(d.project?.id === project?.id && d.type === 'Mottagningskontroll' && (d.id === data.id || d.id === controlId)));
          await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
        }
      } catch(e) {}
    } catch(e) {
      // Hantera fel
    }
  };

  const handleSaveDraft = async (data) => {
    try {
      const draft = normalizeControl({ ...data, project, status: 'UTKAST', savedAt: new Date().toISOString(), type: 'Mottagningskontroll', id: data.id || uuidv4() });
      try {
        const ok = await saveDraftToFirestore(draft);
        if (!ok) throw new Error('Firestore draft save failed');
      } catch(e) {
        let arr = [];
        const existing = await AsyncStorage.getItem('draft_controls');
        if (existing) arr = JSON.parse(existing);
        // Ersätt om samma projekt+typ+id redan finns, annars lägg till
        const idx = arr.findIndex(
          c => c.project?.id === project?.id && c.type === 'Mottagningskontroll' && c.id === draft.id
        );
        if (idx !== -1) {
          arr[idx] = draft;
        } else {
          arr.push(draft);
        }
        await AsyncStorage.setItem('draft_controls', JSON.stringify(arr));
      }
    } catch(e) {
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
    // Migrate legacy single-signature uri to signatures array
    if (c.mottagningsSignature && !c.mottagningsSignatures) {
      // if it's boolean true without uri, leave empty
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

  return (
    <BaseControlForm
      project={project}
      date={date}
      participants={participants}
      labels={LABELS}
      onSave={handleSave}
      onSaveDraft={handleSaveDraft}
      initialValues={initialValues}
      controlType="Mottagningskontroll"
      onExit={onExit}
      onFinished={onFinished}
    />
  );
}
