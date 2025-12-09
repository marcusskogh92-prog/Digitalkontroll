import { Ionicons } from '@expo/vector-icons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';


// Props: project (objekt med id, name, adress, fastighetsbeteckning)
const SkyddsrondScreen = ({ route, navigation: navProp }) => {
  const { project, navigation: navParam } = route.params || {};
  const navigation = navProp || navParam;
  const today = new Date();
  const dateString = today.toLocaleDateString('sv-SE');
  // Veckonummer
  const getWeek = (d) => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay()||7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(),0,1));
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return weekNo;
  };
  const week = getWeek(today);

  // Form state
  const [adress, setAdress] = useState(project?.adress || '');
  const [fastighet, setFastighet] = useState(project?.fastighetsbeteckning || '');
  // Deltagare (samma struktur som i ControlForm)
  const [participants, setParticipants] = useState([]);
  const [participantModalVisible, setParticipantModalVisible] = useState(false);
  const [participantEditIndex, setParticipantEditIndex] = useState(null);
  const [participantForm, setParticipantForm] = useState({ name: '', company: '', role: '', phone: '' });
  const handleSaveParticipant = () => {
    if (!participantForm.name.trim()) return;
    const next = participants.slice();
    if (participantEditIndex === null) {
      next.push({ ...participantForm });
    } else {
      next[participantEditIndex] = { ...participantForm };
    }
    setParticipants(next);
    setParticipantModalVisible(false);
    setParticipantEditIndex(null);
    setParticipantForm({ name: '', company: '', role: '', phone: '' });
  };

  // Spara skyddsrond till projektets kontroller
  const handleSave = async () => {
    if (!project?.id) return;
    // Enkel validering
    if (personer.some(p => !p.namn.trim() || !p.foretag.trim() || !p.roll.trim())) {
      Alert.alert('Fyll i alla obligatoriska fält för deltagare (namn, företag, roll)');
      return;
    }
    const newRond = {
      id: 'skyddsrond-' + Date.now(),
      type: 'Skyddsrond',
      description: `Skyddsrond V.${week}`,
      date: dateString, // dagens datum
      vecka: week,
      projektnummer: project.id,
      projektnamn: project.name,
      adress,
      fastighetsbeteckning: fastighet,
      deltagare: participants,
    };
    try {
      // companyId kan skickas med i route.params, annars defaulta till demo-company
      const companyId = (route.params && route.params.companyId) || 'demo-company';
      const key = `company:${companyId}:project:${project.id}:controls`;
      const prev = await AsyncStorage.getItem(key);
      const arr = prev ? JSON.parse(prev) : [];
      arr.push(newRond);
      await AsyncStorage.setItem(key, JSON.stringify(arr));
      Alert.alert('Skyddsrond sparad!');
      navigation.goBack();
    } catch (e) {
      Alert.alert('Kunde inte spara skyddsronden');
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.header}>{`Skyddsrond V.${week}`}</Text>
      <View style={{ marginBottom: 18, marginTop: 2 }}>
        {[ 
          { label: 'Datum', value: dateString },
          { label: 'Projektnummer', value: project?.id || '' },
          { label: 'Projektnamn', value: project?.name || '' },
          { label: 'Adress', value: adress || '-' },
          { label: 'Fastighetsbeteckning', value: fastighet || '-' }
        ].map((row, i) => {
          const isEmpty = !row.value || row.value === '-';
          return (
            <View key={row.label} style={{ flexDirection: 'column', alignItems: 'flex-start', marginBottom: 0 }}>
              <Text style={{ fontSize: 14, color: '#666', fontWeight: '600', marginBottom: 2 }}>{row.label}:</Text>
              <Text style={{ fontSize: 16, color: isEmpty ? '#D32F2F' : '#222', fontStyle: isEmpty ? 'italic' : 'normal', marginBottom: 8 }}>{isEmpty ? '-' : row.value}</Text>
              <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 4, alignSelf: 'stretch', width: '100%' }} />
            </View>
          );
        })}
      </View>
      <View style={{ marginTop: 12 }}>
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginBottom: 10, marginTop: 2 }} />
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
          <Text style={styles.label}>Deltagare</Text>
          <TouchableOpacity
            onPress={() => {
              setParticipantEditIndex(null);
              setParticipantForm({ name: '', company: '', role: '', phone: '' });
              setParticipantModalVisible(true);
            }}
            style={{ marginLeft: 10, backgroundColor: '#1976D2', borderRadius: 12, width: 24, height: 24, alignItems: 'center', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.10, shadowRadius: 1, elevation: 1 }}
            accessibilityLabel="Lägg till deltagare"
          >
            <Ionicons name="add" size={14} color="#fff" />
          </TouchableOpacity>
        </View>
        {participants.map((p, i) => (
          <View key={i} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', borderRadius: 8, borderWidth: 1, borderColor: '#E0E0E0', paddingVertical: 8, paddingHorizontal: 10, marginBottom: 6 }}>
            <View style={{ flex: 1, paddingLeft: 4 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222' }}>{p.name}</Text>
              <Text style={{ fontSize: 12, color: '#555', marginTop: 2 }}>
                {p.company ? p.company : ''}
                {p.company && (p.role || p.phone) ? ' • ' : ''}
                {p.role ? p.role : ''}
                {p.role && p.phone ? ' • ' : ''}
                {p.phone ? p.phone : ''}
              </Text>
            </View>
            <TouchableOpacity
              style={{ marginLeft: 8, padding: 12, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.01)', alignItems: 'center', justifyContent: 'center' }}
              onPress={() => {
                setParticipantEditIndex(i);
                setParticipantForm({ name: p.name, company: p.company, role: p.role, phone: p.phone });
                setParticipantModalVisible(true);
              }}
              accessibilityLabel="Redigera deltagare"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="create-outline" size={24} color="#888" />
            </TouchableOpacity>
          </View>
        ))}
        {/* add participant button moved to header */}
        {participantModalVisible && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', zIndex: 100, justifyContent: 'center', alignItems: 'center' }}>
            <View style={{ backgroundColor: '#fff', borderRadius: 14, borderWidth: 2, borderColor: '#222', padding: 22, minWidth: 280, maxWidth: 340, width: '80%', shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, alignItems: 'center', position: 'relative' }}>
              <TouchableOpacity
                onPress={() => { setParticipantModalVisible(false); setParticipantEditIndex(null); setParticipantForm({ name: '', company: '', role: '', phone: '' }); }}
                style={{ position: 'absolute', top: 10, right: 10, padding: 6, zIndex: 2 }}
                accessibilityLabel="Stäng"
              >
                <MaterialIcons name="close" size={24} color="#222" />
              </TouchableOpacity>
              <Text style={{ fontSize: 17, color: '#222', fontWeight: 'bold', marginBottom: 14, marginTop: 2 }}>
                {participantEditIndex === null ? 'Lägg till deltagare' : 'Redigera deltagare'}
              </Text>
              <TextInput
                style={{ backgroundColor: '#F7FAFC', borderColor: '#222', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 15, color: !participantForm.name.trim() ? '#D32F2F' : '#000', fontStyle: !participantForm.name.trim() ? 'italic' : 'normal', marginBottom: 10, width: '100%' }}
                placeholder="För- och efternamn"
                placeholderTextColor="#D32F2F"
                value={participantForm.name}
                onChangeText={t => setParticipantForm(f => ({ ...f, name: t }))}
              />
              <TextInput
                style={{ backgroundColor: '#F7FAFC', borderColor: '#222', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 15, color: !participantForm.company.trim() ? '#D32F2F' : '#000', fontStyle: !participantForm.company.trim() ? 'italic' : 'normal', marginBottom: 10, width: '100%' }}
                placeholder="Företag"
                placeholderTextColor="#D32F2F"
                value={participantForm.company}
                onChangeText={t => setParticipantForm(f => ({ ...f, company: t }))}
              />
              <TextInput
                style={{ backgroundColor: '#F7FAFC', borderColor: '#222', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 15, color: !participantForm.role.trim() ? '#D32F2F' : '#000', fontStyle: !participantForm.role.trim() ? 'italic' : 'normal', marginBottom: 10, width: '100%' }}
                placeholder="Roll"
                placeholderTextColor="#D32F2F"
                value={participantForm.role}
                onChangeText={t => setParticipantForm(f => ({ ...f, role: t }))}
              />
              <TextInput
                style={{ backgroundColor: '#F7FAFC', borderColor: '#222', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 15, color: '#000', marginBottom: 18, width: '100%' }}
                placeholder="Mobilnummer"
                placeholderTextColor="#D32F2F"
                keyboardType="phone-pad"
                value={participantForm.phone}
                onChangeText={t => setParticipantForm(f => ({ ...f, phone: t }))}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 12 }}>
                <TouchableOpacity
                  onPress={handleSaveParticipant}
                  style={{ backgroundColor: '#F7FAFC', borderRadius: 8, borderWidth: 2, borderColor: '#222', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, marginRight: participantEditIndex !== null ? 8 : 0 }}
                >
                  <MaterialIcons name="check" size={22} color="#222" style={{ marginRight: 8 }} />
                  <Text style={{ color: '#222', fontSize: 16, fontWeight: 'bold' }}>Spara</Text>
                </TouchableOpacity>
                {participantEditIndex !== null && (
                  <TouchableOpacity
                    onPress={() => {
                      const next = participants.slice();
                      next.splice(participantEditIndex, 1);
                      setParticipants(next);
                      setParticipantModalVisible(false);
                      setParticipantEditIndex(null);
                      setParticipantForm({ name: '', company: '', role: '', phone: '' });
                    }}
                    style={{ backgroundColor: '#FF3B30', borderRadius: 20, borderWidth: 0, alignItems: 'center', justifyContent: 'center', width: 44, height: 44, marginLeft: 8 }}
                  >
                    <MaterialIcons name="delete" size={28} color="#fff" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
      <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
        <Text style={styles.saveButtonText}>Spara skyddsrond</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};


const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    padding: 20,
    backgroundColor: '#fff',
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  label: {
    fontSize: 18,
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 8,
    padding: 10,
    fontSize: 16,
    marginBottom: 8,
    backgroundColor: '#fafafa',
    color: '#222',
  },
  saveButton: {
    backgroundColor: '#1976D2',
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  saveButtonText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
  },
});

export default SkyddsrondScreen;
