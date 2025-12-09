import { Ionicons } from '@expo/vector-icons';
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
    case 'mottagningskontroll':
      return [
        { label: '1 - Leveranskontroll', description: 'Beskrivning för kontrollpunkt 1', done: false, note: '' },
        { label: '2 - Kvalitet och skick', description: 'Beskrivning för kontrollpunkt 2', done: false, note: '' },
        { label: 'Kontrollpunkt 3', description: 'Beskrivning för kontrollpunkt 3', done: false, note: '' },
        { label: 'Kontrollpunkt 4', description: 'Beskrivning för kontrollpunkt 4', done: false, note: '' },
        { label: 'Kontrollpunkt 5', description: 'Beskrivning för kontrollpunkt 5', done: false, note: '' },
        { label: 'Kontrollpunkt 6', description: 'Beskrivning för kontrollpunkt 6', done: false, note: '' },
      ];
    default:
      return base;
  }
}

// Format Swedish mobile number with spaces: "0701234567" -> "070 123 45 67"
function formatPhoneNumber(num) {
  if (!num) return '';
  // Remove all non-digit characters
  const digits = num.replace(/\D/g, '');
  if (digits.length < 7) return digits;
  // Format as "XXX XXX XX XX" (for 10 digits)
  if (digits.length === 10) {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,8)} ${digits.slice(8,10)}`;
  }
  // Format as "XXX XXX XX" (for 9 digits)
  if (digits.length === 9) {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,8)} ${digits.slice(8,9)}`;
  }
  // Otherwise, just group by 3s
  return digits.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
}

export default function ControlForm({ route, navigation }) {
  // State for expanded checklist items (for mottagningskontroll)
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  // Modal for add/edit participant
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
  const { project, initial, performedBy, companyId } = route.params || {};
  const [type, setType] = useState(initial?.type || '');
  // Set today's date as default if not provided
  const today = new Date();
  const defaultDate = initial?.date || today.toISOString().slice(0, 10);
  const [date, setDate] = useState(defaultDate);
  const [canEditDate, setCanEditDate] = useState(false);
  const [showDateEditModal, setShowDateEditModal] = useState(false);
  const [pendingDate, setPendingDate] = useState(date);
  const datePressTimer = useState(null);
  const [byggdel, setByggdel] = useState(initial?.byggdel || '');
  const [description, setDescription] = useState(initial?.description || '');
  const [participants, setParticipants] = useState([]);
  const [dateError, setDateError] = useState('');

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
        <Text style={[styles.label, { fontWeight: 'bold' }]}>Datum</Text>
        <View style={{ position: 'relative', marginBottom: 8 }}>
          <TextInput
            style={[styles.input, { color: '#888', backgroundColor: '#F7FAFC', borderColor: '#E0E0E0' }]}
            placeholder="ÅÅÅÅ-MM-DD"
            placeholderTextColor="#888"
            value={date}
            editable={false}
          />
          <TouchableOpacity
            style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, zIndex: 2 }}
            activeOpacity={1}
            onLongPress={() => {
              setShowDateEditModal(true);
              setPendingDate(date);
            }}
            delayLongPress={2000}
          >
            <View style={{ flex: 1 }} />
          </TouchableOpacity>
          <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
            Håll in för att ändra datum (2 sek)
          </Text>
          {showDateEditModal && (
            <View style={{ position: 'absolute', top: 50, left: '10%', right: '10%', backgroundColor: '#fff', borderRadius: 12, borderWidth: 2, borderColor: PRIMARY, padding: 20, zIndex: 10, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 6, elevation: 4, minWidth: 280, maxWidth: 400 }}>
              <TouchableOpacity
                onPress={() => { setShowDateEditModal(false); setDateError(''); }}
                style={{ position: 'absolute', top: 12, right: 12, padding: 6, zIndex: 20 }}
                hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
              >
                <MaterialIcons name="close" size={28} color={PRIMARY} />
              </TouchableOpacity>
              <Text style={[styles.sectionTitle, { textAlign: 'center', marginTop: 8 }]}>Ändra datum</Text>
              <TextInput
                style={[styles.input, { marginBottom: 16, color: '#222', backgroundColor: '#F7FAFC', borderColor: PRIMARY, fontSize: 16 }]}
                value={pendingDate}
                onChangeText={setPendingDate}
                placeholder="ÅÅÅÅ-MM-DD"
                placeholderTextColor="#888"
                autoFocus
              />
              <TouchableOpacity
                onPress={() => {
                  const todayStr = new Date().toISOString().slice(0, 10);
                  if (pendingDate > todayStr) {
                    setDateError('Du kan inte välja ett framtida datum');
                    return;
                  }
                  setDate(pendingDate);
                  setShowDateEditModal(false);
                  setDateError('');
                }}
                style={{ backgroundColor: '#F7FAFC', borderRadius: 8, borderWidth: 2, borderColor: '#222', flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 24, marginTop: 8, alignSelf: 'center' }}
              >
                <MaterialIcons name="check" size={22} color="#222" style={{ marginRight: 8 }} />
                <Text style={{ color: '#222', fontSize: 16, fontWeight: 'bold' }}>Spara</Text>
              </TouchableOpacity>
              {dateError ? (
                <Text style={{ color: '#FF3B30', fontSize: 14, marginTop: 10, textAlign: 'center' }}>{dateError}</Text>
              ) : null}
            </View>
          )}
        </View>
        <View style={{ marginTop: 12 }}>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', marginBottom: 10, marginTop: 2 }} />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={styles.sectionTitle}>Deltagare</Text>
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
                  {p.phone ? formatPhoneNumber(p.phone) : ''}
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
          <View style={{ marginTop: 16, marginBottom: 8 }}>
            <Text style={{ fontWeight: 'bold', fontSize: 15, color: '#263238', marginBottom: 4 }}>Leverans av:</Text>
            <View style={{ position: 'relative' }}>
              <TextInput
                style={{
                  backgroundColor: '#fff',
                  borderColor: '#ccc',
                  borderWidth: 1,
                  borderRadius: 8,
                  paddingRight: 40,
                  height: 44,
                  fontSize: 16,
                  color: '#000',
                  fontStyle: description.trim() === '' ? 'italic' : 'normal',
                }}
                placeholder="Beskriv leveransen"
                placeholderTextColor="#D32F2F"
                value={description}
                onChangeText={setDescription}
              />
              {description.trim() === '' ? (
                <MaterialIcons name="close" size={22} color="#D32F2F" style={{ position: 'absolute', right: 10, top: 11 }} />
              ) : (
                <MaterialIcons name="check" size={22} color="#388E3C" style={{ position: 'absolute', right: 10, top: 11 }} />
              )}
            </View>
          </View>
          <View style={{ height: 1, backgroundColor: '#e0e0e0', marginTop: 10, marginBottom: 10 }} />
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
                        style={{ backgroundColor: '#F7FAFC', borderColor: '#222', borderWidth: 1, borderRadius: 8, paddingHorizontal: 10, height: 40, fontSize: 15, color: !participantForm.phone.trim() ? '#D32F2F' : '#000', fontStyle: !participantForm.phone.trim() ? 'italic' : 'normal', marginBottom: 18, width: '100%' }}
                        placeholder="Mobilnummer"
                        placeholderTextColor="#D32F2F"
                        keyboardType="phone-pad"
                        value={formatPhoneNumber(participantForm.phone)}
                        onChangeText={t => {
                          // Remove spaces and non-digits for storage
                          const raw = t.replace(/\D/g, '');
                          setParticipantForm(f => ({ ...f, phone: raw }));
                        }}
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


        <Text style={styles.sectionTitle}>Kontrollpunkter</Text>
        {checklist.map((item, idx) => (
          <View key={idx} style={styles.checkRow}>
            <TouchableOpacity style={[styles.checkbox, item.done && styles.checkboxChecked]} onPress={() => toggleItem(idx)}>
              {item.done ? <Text style={styles.checkboxMark}>✓</Text> : null}
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <TouchableOpacity
                onPress={() => {
                  setExpandedChecklist(expandedChecklist.includes(idx)
                    ? expandedChecklist.filter(i => i !== idx)
                    : [...expandedChecklist, idx]);
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: '#E9ECEF',
                  borderRadius: 8,
                  paddingVertical: 14,
                  paddingHorizontal: 16,
                  marginBottom: 6,
                  borderWidth: 2,
                  borderColor: expandedChecklist.includes(idx) ? '#1976D2' : '#E0E0E0',
                  shadowColor: '#1976D2',
                  shadowOffset: { width: 0, height: 2 },
                  shadowOpacity: expandedChecklist.includes(idx) ? 0.12 : 0.06,
                  shadowRadius: 4,
                  elevation: expandedChecklist.includes(idx) ? 2 : 1,
                }}
              >
                <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#263238', letterSpacing: 0.2 }}>{item.label}</Text>
                {'description' in item && (
                  <Ionicons
                    name={expandedChecklist.includes(idx) ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color={expandedChecklist.includes(idx) ? '#1976D2' : '#888'}
                    style={{ marginLeft: 8 }}
                  />
                )}
              </TouchableOpacity>
              {'description' in item && expandedChecklist.includes(idx) && (
                <>
                  <Text style={{ color: '#555', fontSize: 14, marginBottom: 6, marginTop: 2 }}>{item.description}</Text>
                  <TextInput
                    style={styles.noteInput}
                    placeholder="Anteckning (valfritt)"
                    placeholderTextColor="#888"
                    value={item.note}
                    onChangeText={(t) => setItemNote(idx, t)}
                  />
                </>
              )}
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
