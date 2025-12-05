
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';
import { useMemo, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#263238';

function getDefaultChecklist(type) {
  const base = [
    { label: 'Genomgång utförd', done: false, note: '' },
    { label: 'Avvikelser kontrollerade', done: false, note: '' },
    { label: 'Signerat av ansvarig', done: false, note: '' },
  ];
  switch ((type || '').toLowerCase()) {
    case 'arbetsberedning':
      return [

        { label: 'Genomgång av arbetsplats', done: false, note: '' },
        { label: 'Brister noterade', done: false, note: '' },
        { label: 'Åtgärdslista skapad', done: false, note: '' },
      ];
    default:
      return base;
  }
}

export default function ControlForm({ route, navigation }) {
  const { project, initial, performedBy, companyId } = route.params || {};
  const [type, setType] = useState(initial?.type || '');
  const [date, setDate] = useState(initial?.date || '');
  const [byggdel, setByggdel] = useState(initial?.byggdel || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [participants, setParticipants] = useState([{ name: '', company: '', role: '', phone: '' }]);

  const needsByggdel = useMemo(() => (type && type !== 'Skyddsrond'), [type]);
  const [checklist, setChecklist] = useState(() => getDefaultChecklist(type));

  // Byggdel is optional when saving; do not require two digits
  const canSave = type && date && description;

  const toggleItem = (idx) => {
    const next = checklist.slice();
    next[idx] = { ...next[idx], done: !next[idx].done };
    setChecklist(next);
  };

  const setItemNote = (idx, text) => {
    const next = checklist.slice();
    next[idx] = { ...next[idx], note: text };
    setChecklist(next);
  };

  const handleSave = async () => {
    if (!canSave) return;
    try {
      const key = `company:${companyId || 'demo-company'}:project:${project.id}:controls`;
      const saved = await AsyncStorage.getItem(key);
      const list = saved ? JSON.parse(saved) : [];
      const newEntry = {
        id: (list.length + 1).toString(),
        type,
        date,
        byggdel: needsByggdel ? byggdel : '',
        description,
        performedBy: performedBy || null,
        participants: (participants || []).filter(p => (p.name||'').trim() || (p.company||'').trim() || (p.role||'').trim() || (p.phone||'').trim()),
        checklist,
      };
      const updated = [...list, newEntry];
      await AsyncStorage.setItem(key, JSON.stringify(updated));
      navigation.goBack();
    } catch (e) {
      // In a later step we can show a popup
    }
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Ny kontroll: {type}</Text>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <Text style={styles.label}>Datum</Text>
        <TextInput
          style={styles.input}
          placeholder="ÅÅÅÅ-MM-DD"
          placeholderTextColor="#888"
          value={date}
          onChangeText={setDate}
        />
        <View style={{ marginTop: 12 }}>
          <Text style={styles.sectionTitle}>Deltagare</Text>
          {participants.map((p, i) => (
            <View key={i} style={styles.participantCard}>
              <TextInput
                style={styles.input}
                placeholder="Namn"
                placeholderTextColor="#888"
                value={p.name}
                onChangeText={(t) => {
                  const next = participants.slice();
                  next[i] = { ...next[i], name: t };
                  setParticipants(next);
                }}
              />
              <TextInput
                style={styles.input}
                placeholder="Företag"
                placeholderTextColor="#888"
                value={p.company}
                onChangeText={(t) => {
                  const next = participants.slice();
                  next[i] = { ...next[i], company: t };
                  setParticipants(next);
                }}
              />
              <TextInput
                style={styles.input}
                placeholder="Roll"
                placeholderTextColor="#888"
                value={p.role}
                onChangeText={(t) => {
                  const next = participants.slice();
                  next[i] = { ...next[i], role: t };
                  setParticipants(next);
                }}
              />
              <TextInput
                style={styles.input}
                placeholder="Mobilnummer"
                placeholderTextColor="#888"
                keyboardType="phone-pad"
                value={p.phone}
                onChangeText={(t) => {
                  const next = participants.slice();
                  next[i] = { ...next[i], phone: t };
                  setParticipants(next);
                }}
              />
            </View>
          ))}
          <TouchableOpacity
            style={styles.addParticipantButton}
            onPress={() => setParticipants([
              ...participants,
              { name: '', company: '', role: '', phone: '' }
            ])}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <MaterialIcons name="add" size={20} color={PRIMARY} />
              <Text style={styles.addParticipantText}>Lägg till deltagare</Text>
            </View>
          </TouchableOpacity>
        </View>


        <Text style={styles.sectionTitle}>Kontrollpunkter</Text>
        {checklist.map((item, idx) => (
          <View key={idx} style={styles.checkRow}>
            <TouchableOpacity style={[styles.checkbox, item.done && styles.checkboxChecked]} onPress={() => toggleItem(idx)}>
              {item.done ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={styles.checkLabel}>{item.label}</Text>
              <TextInput
                style={styles.noteInput}
                placeholder="Anteckning (valfritt)"
                placeholderTextColor="#888"
                value={item.note}
                onChangeText={(t) => setItemNote(idx, t)}
              />
            </View>
          </View>
        ))}

        <TouchableOpacity style={[styles.primaryButton, !canSave && styles.primaryDisabled]} onPress={canSave ? async () => { try { await Haptics.selectionAsync(); } catch {}; await handleSave(); } : undefined} disabled={!canSave}>
          <Text style={styles.primaryText}>Skapa kontroll</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.secondaryButton} onPress={async () => { try { await Haptics.selectionAsync(); } catch {}; navigation.goBack(); }}>
          <Text style={styles.secondaryText}>Avbryt</Text>
        </TouchableOpacity>
      </KeyboardAvoidingView>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 20, fontWeight: 'bold', color: PRIMARY, marginBottom: 12 },
  label: { fontSize: 14, color: '#333', marginBottom: 6, marginTop: 8 },
  input: {
    backgroundColor: '#fff',
    borderColor: '#ccc',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    fontSize: 16,
    color: '#000',
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginTop: 12, marginBottom: 8 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  checkboxChecked: { backgroundColor: PRIMARY },
  checkboxMark: { color: '#fff', fontWeight: '700' },
  checkLabel: { fontSize: 15, color: '#222', marginBottom: 6 },
  noteInput: {
    backgroundColor: '#fff',
    borderColor: '#ddd',
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    height: 40,
    fontSize: 14,
    color: '#000',
  },
  participantCard: {
    backgroundColor: '#F7FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    padding: 12,
    marginBottom: 10,
  },
  addParticipantButton: {
    backgroundColor: '#E9ECEF',
    borderRadius: 8,
    paddingVertical: 10,
    alignItems: 'center',
    marginTop: 4,
  },
  addParticipantText: { color: PRIMARY, fontSize: 15, fontWeight: '700', marginLeft: 6 },
  primaryButton: {
    backgroundColor: PRIMARY,
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 12,
  },
  primaryDisabled: { opacity: 0.6 },
  primaryText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  secondaryButton: {
    backgroundColor: '#FF3B30',
    borderRadius: 8,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  secondaryText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
});
