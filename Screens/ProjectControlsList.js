import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, TouchableOpacity, View } from 'react-native';

export default function ProjectControlsList({ projectId }) {
  const [controls, setControls] = useState([]);

  const fetchControls = useCallback(async () => {
    let controlsArr = [];
    // Hämta utkast
    const draft = await AsyncStorage.getItem('draft_control');
    if (draft) {
      const parsed = JSON.parse(draft);
      if (parsed.project?.id === projectId) {
        controlsArr.push({ ...parsed, status: 'PÅGÅENDE' });
      }
    }
    // Hämta utförda kontroller
    const completed = await AsyncStorage.getItem('completed_controls');
    if (completed) {
      const parsedCompleted = JSON.parse(completed);
      parsedCompleted.forEach(ctrl => {
        if (ctrl.project?.id === projectId) {
          controlsArr.push(ctrl);
        }
      });
    }
    setControls(controlsArr);
  }, [projectId]);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  return (
    <ScrollView style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
        <Text style={{ fontSize: 20, fontWeight: 'bold' }}>Mottagningskontroller</Text>
        <TouchableOpacity onPress={fetchControls} style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 14 }}>
          <Text style={{ color: '#fff', fontWeight: 'bold' }}>Uppdatera</Text>
        </TouchableOpacity>
      </View>
      {controls.length === 0 ? (
        <Text style={{ color: '#888', fontSize: 16 }}>Inga kontroller skapade ännu.</Text>
      ) : (
        controls.map((control, idx) => (
          <View key={idx} style={{ backgroundColor: '#F7FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold' }}>Kontroll utförd - {control.date ? String(control.date) : 'okänt datum'}</Text>
            <Text style={{ fontSize: 15, color: '#1976D2', marginBottom: 6 }}>{control.status ? String(control.status) : ''}</Text>
            <TouchableOpacity style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 10, alignItems: 'center', marginTop: 8 }}>
              <Text style={{ color: '#fff', fontWeight: 'bold' }}>Visa kontroll</Text>
            </TouchableOpacity>
          </View>
        ))
      )}
    </ScrollView>
  );
}
