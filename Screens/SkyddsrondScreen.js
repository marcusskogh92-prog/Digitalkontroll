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
  const [personer, setPersoner] = useState([
    { namn: '', foretag: '', roll: '', mobil: '' }
  ]);

  // Hantera ändring av deltagare
  const updatePerson = (idx, field, value) => {
    setPersoner(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p));
  };
  const addPerson = () => setPersoner(prev => [...prev, { namn: '', foretag: '', roll: '', mobil: '' }]);
  const removePerson = (idx) => setPersoner(prev => prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev);

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
      deltagare: personer,
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
      <Text style={[styles.label, { marginTop: 16 }]}>Utförare och närvarande personal</Text>
      {personer.map((p, idx) => (
        <View key={idx} style={{ marginBottom: 12, borderBottomWidth: 1, borderColor: '#eee', paddingBottom: 8 }}>
          <TextInput
            style={styles.input}
            value={p.namn}
            onChangeText={v => updatePerson(idx, 'namn', v)}
            placeholder="För- och efternamn*"
          />
          <TextInput
            style={styles.input}
            value={p.foretag}
            onChangeText={v => updatePerson(idx, 'foretag', v)}
            placeholder="Företag*"
          />
          <TextInput
            style={styles.input}
            value={p.roll}
            onChangeText={v => updatePerson(idx, 'roll', v)}
            placeholder="Roll*"
          />
          <TextInput
            style={styles.input}
            value={p.mobil}
            onChangeText={v => updatePerson(idx, 'mobil', v)}
            placeholder="Mobilnummer (valfritt)"
            keyboardType="phone-pad"
          />
          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity onPress={() => removePerson(idx)} disabled={personer.length === 1}>
              <Text style={{ color: '#D32F2F', fontSize: 14, marginTop: 2 }}>Ta bort</Text>
            </TouchableOpacity>
          </View>
        </View>
      ))}
      <TouchableOpacity onPress={addPerson} style={{ marginBottom: 18 }}>
        <Text style={{ color: '#1976D2', fontWeight: 'bold', fontSize: 16 }}>+ Lägg till person</Text>
      </TouchableOpacity>
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
