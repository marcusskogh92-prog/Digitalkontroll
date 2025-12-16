import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import { useCallback, useEffect, useState } from 'react';
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import Svg, { Polyline } from 'react-native-svg';

export default function ProjectControlsList({ projectId }) {
  const navigation = useNavigation();
  const [controls, setControls] = useState([]);

  const formatParticipants = (p) => {
    if (!p) return '-';
    if (Array.isArray(p)) {
      return p.map(item => (typeof item === 'object' && item !== null ? (item.name || item.company || '') : String(item))).filter(Boolean).join(', ') || '-';
    }
    return String(p);
  };

  const fetchControls = useCallback(async () => {
    let controlsArr = [];
    // Hämta alla pågående utkast för projektet
    const draftsRaw = await AsyncStorage.getItem('draft_controls');
    if (draftsRaw) {
      const drafts = JSON.parse(draftsRaw);
      console.log('DEBUG: Alla utkast i draft_controls:', drafts);
      drafts.filter(d => d.project?.id === projectId).forEach(draft => {
        controlsArr.push({ ...draft, status: 'PÅGÅENDE', isDraft: true });
      });
    }
    // Hämta utförda kontroller
    const completed = await AsyncStorage.getItem('completed_controls');
    if (completed) {
      const parsedCompleted = JSON.parse(completed);
      console.log('DEBUG: Alla completed_controls:', parsedCompleted);
      parsedCompleted.forEach(ctrl => {
        if (ctrl.project?.id === projectId) {
          controlsArr.push(ctrl);
        }
      });
    }
    // Sort by date (descending). Use date || savedAt as fallback.
    controlsArr.sort((a, b) => {
      const da = new Date(a.date || a.savedAt || 0).getTime() || 0;
      const db = new Date(b.date || b.savedAt || 0).getTime() || 0;
      return db - da;
    });
    console.log('DEBUG: Alla kontroller som ska visas (sorterade):', controlsArr);
    setControls(controlsArr);
  }, [projectId]);

  useEffect(() => {
    fetchControls();
  }, [fetchControls]);

  // Delete control (draft or completed) by id and type
  const actuallyDeleteControl = async (control) => {
    console.log('DEBUG: Försöker ta bort kontroll:', control);
    if (control.isDraft) {
      // Remove from draft_controls
      const draftsRaw = await AsyncStorage.getItem('draft_controls');
      let drafts = draftsRaw ? JSON.parse(draftsRaw) : [];
      drafts = drafts.filter(
        c => !(c.id === control.id && c.project?.id === control.project?.id && c.type === control.type)
      );
      console.log('DEBUG: Utkast kvar efter borttagning:', drafts);
      await AsyncStorage.setItem('draft_controls', JSON.stringify(drafts));
    } else {
      // Remove from completed_controls
      const completedRaw = await AsyncStorage.getItem('completed_controls');
      let completed = completedRaw ? JSON.parse(completedRaw) : [];
      completed = completed.filter(
        c => !(c.id === control.id && c.project?.id === control.project?.id && c.type === control.type)
      );
      console.log('DEBUG: Klara kontroller kvar efter borttagning:', completed);
      await AsyncStorage.setItem('completed_controls', JSON.stringify(completed));
    }
    fetchControls();
  };

  const handleDeleteControl = (control) => {
    Alert.alert(
      'Radera kontroll',
      'Vill du verkligen radera denna kontroll? Detta går inte att ångra.',
      [
        { text: 'Avbryt', style: 'cancel' },
        {
          text: 'Radera',
          style: 'destructive',
          onPress: () => actuallyDeleteControl(control),
        },
      ]
    );
  };

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
        <>
          {/* Visa pågående utkast överst */}
          {controls.filter(c => c.isDraft).length > 0 && (
            <View style={{ marginBottom: 18 }}>
              <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 8 }}>Pågående kontroller</Text>
              {controls.filter(c => c.isDraft).map((control, idx) => (
                <View key={control.id || idx} style={{ backgroundColor: '#FFF8E1', borderRadius: 10, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#FFD600' }}>
                  <Text style={{ fontSize: 16, fontWeight: 'bold' }}>
                    {control.type} - {
                      control.date
                        ? (() => {
                            const d = new Date(control.date);
                            const week = d && !isNaN(d) ? Math.ceil((((d - new Date(d.getFullYear(),0,1)) / 86400000) + new Date(d.getFullYear(),0,1).getDay()+1)/7) : '';
                            return `${d.toLocaleDateString('sv-SE')} v.${week}`;
                          })()
                        : 'okänt datum'
                    }
                  </Text>
                  <Text style={{ fontSize: 15, color: '#FFA726', marginBottom: 6 }}>{control.status}</Text>
                  <Text style={{ fontSize: 14, color: '#222', marginBottom: 4 }}>Beskrivet material: {control.materialDesc ? String(control.materialDesc) : '-'}</Text>
                  <Text style={{ fontSize: 13, color: '#555' }}>Datum: {control.date ? new Date(control.date).toLocaleDateString('sv-SE') : (control.savedAt ? new Date(control.savedAt).toLocaleDateString('sv-SE') : 'okänt datum')}</Text>
                  <Text style={{ fontSize: 13, color: '#555' }}>Mottagare: {formatParticipants(control.participants)}</Text>
                  {/* Signature preview (first signature if present) */}
                  {control.mottagningsSignatures && control.mottagningsSignatures.length > 0 && (
                    <View style={{ marginTop: 8 }}>
                      {control.mottagningsSignatures[0].uri ? (
                        <Image source={{ uri: control.mottagningsSignatures[0].uri }} style={{ width: 160, height: 60, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' }} />
                      ) : control.mottagningsSignatures[0].strokes ? (
                        <Svg width={160} height={60} viewBox={`0 0 300 120`}>
                          {control.mottagningsSignatures[0].strokes.map((stroke, si) => (
                            <Polyline key={`stroke-${si}`} points={stroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                          ))}
                        </Svg>
                      ) : null}
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                    <TouchableOpacity
                      style={{ backgroundColor: '#FFA726', borderRadius: 8, padding: 10, alignItems: 'center', flex: 1 }}
                      onPress={() => {
                        // Navigera till formulär och återuppta utkastet
                        navigation.navigate('ControlForm', { initialValues: control, project: control.project });
                      }}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Återuppta</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 10, alignItems: 'center', flex: 1, marginLeft: 8 }}
                      onPress={() => handleDeleteControl(control)}
                    >
                      <Text style={{ color: '#fff', fontWeight: 'bold' }}>Radera</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
            </View>
          )}
          {/* Visa utförda kontroller */}
          {controls.filter(c => !c.isDraft).map((control, idx) => (
            <View key={idx} style={{ backgroundColor: '#F7FAFC', borderRadius: 10, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: '#e0e0e0' }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold' }}>{control.type} - {control.date ? new Date(control.date).toLocaleDateString('sv-SE') : (control.savedAt ? new Date(control.savedAt).toLocaleDateString('sv-SE') : 'okänt datum')}</Text>
              <Text style={{ fontSize: 15, color: '#1976D2', marginBottom: 6 }}>{control.status ? String(control.status) : ''}</Text>
              <Text style={{ fontSize: 14, color: '#222', marginBottom: 4 }}>Beskrivet material: {control.materialDesc ? String(control.materialDesc) : '-'}</Text>
              <Text style={{ fontSize: 13, color: '#555' }}>Mottagare: {formatParticipants(control.participants)}</Text>
              {control.mottagningsSignatures && control.mottagningsSignatures.length > 0 && (
                <View style={{ marginTop: 8 }}>
                  {control.mottagningsSignatures[0].uri ? (
                    <Image source={{ uri: control.mottagningsSignatures[0].uri }} style={{ width: 160, height: 60, borderRadius: 6, borderWidth: 1, borderColor: '#e0e0e0' }} />
                  ) : control.mottagningsSignatures[0].strokes ? (
                    <Svg width={160} height={60} viewBox={`0 0 300 120`}>
                      {control.mottagningsSignatures[0].strokes.map((stroke, si) => (
                        <Polyline key={`pst-${si}`} points={stroke.map(p => `${p.x},${p.y}`).join(' ')} fill="none" stroke="#000" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
                      ))}
                    </Svg>
                  ) : null}
                </View>
              )}
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                <TouchableOpacity style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 10, alignItems: 'center', flex: 1, marginRight: 6 }}>
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Skriv ut</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ backgroundColor: '#D32F2F', borderRadius: 8, padding: 10, alignItems: 'center', flex: 1 }}
                  onPress={() => handleDeleteControl(control)}
                >
                  <Text style={{ color: '#fff', fontWeight: 'bold' }}>Radera</Text>
                </TouchableOpacity>
              </View>
            </View>
          ))}
        </>
      )}
    </ScrollView>
  );
}
