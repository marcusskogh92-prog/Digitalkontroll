import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
// ...existing code...

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 16,
  },
  title: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 16,
    color: '#263238',
  },
  label: {
    fontSize: 16,
    color: '#263238',
  },
});

// Frågor för respektive kontrollpunkt
export const LEVERANS_QUESTIONS = [
  'Är leveransen komplett?',
  'Är leveransen oskadad?',
  'Stämmer leveransen mot beställning?'
];

export const KVALITET_QUESTIONS = [
  'Är materialet av rätt kvalitet?',
  'Finns det synliga skador eller brister?',
  'Uppfyller produkten ställda krav?'
];

export const FORVARING_QUESTIONS = [
  'Förvaras materialet på rätt sätt?',
  'Är materialet skyddat mot väder och vind?',
  'Är täckningen tillräcklig?'
];
const WEATHER_OPTIONS = [
  { label: 'Sol', icon: 'sunny-outline', color: '#FFD600' },
  { label: 'Dimma', icon: 'cloudy-outline', color: '#B0BEC5' },
  { label: 'Regn', icon: 'rainy-outline', color: '#2196F3' },
  { label: 'Snö', icon: 'snow-outline', color: '#90CAF9' },
  { label: 'Vind', icon: 'cloud-outline', color: '#90A4AE' },
  { label: 'Ostadigt', icon: 'partly-sunny-outline', color: '#FFD54F' },
];

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
        { label: '2 - Leverans', description: 'Beskrivning för kontrollpunkt 2', done: false, note: '' },
        { label: '3 - Kvalitet och skick', description: 'Beskrivning för kontrollpunkt 3', done: false, note: '' },
        { label: '4 - Förvaring och täckning', description: 'Beskrivning för kontrollpunkt 4', done: false, note: '' },
        { label: '5 - Signatur', description: 'Beskrivning för kontrollpunkt 5', done: false, note: '' },
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
  // Datumhantering
  const today = new Date();
  const defaultDate = today.toISOString().slice(0, 10);
  const params = route?.params || {};
  const project = params.project || {};
  const initial = params.initial || {};
  const performedBy = params.performedBy || '';
  const companyId = params.companyId || '';
  const [date, setDate] = useState(initial?.date || defaultDate);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateInput, setDateInput] = useState(date);
  // Väderlek och temperatur
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [selectedWeather, setSelectedWeather] = useState(null);
  const [temperature, setTemperature] = useState("");
  const [temperatureModalVisible, setTemperatureModalVisible] = useState(false);
  const [temperatureInput, setTemperatureInput] = useState("");
  // Deltagare/mottagare
  const [participantModalVisible, setParticipantModalVisible] = useState(false);
  const [participantEditIndex, setParticipantEditIndex] = useState(null);
  const [type, setType] = useState(initial?.type || '');
  const [mainRecipient, setMainRecipient] = useState(initial?.mainRecipient || { name: '', company: '' });
  const [mainRecipientModalVisible, setMainRecipientModalVisible] = useState(false);
  const [mainRecipientForm, setMainRecipientForm] = useState({ name: '', company: '' });
  const [participants, setParticipants] = useState([]);
  const [participantForm, setParticipantForm] = useState({ name: '', company: '', role: '', phone: '' });
  // Checklist
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [checklist, setChecklist] = useState(() => getDefaultChecklist(type));
  const [answers, setAnswers] = useState({});
  // Functions
  const handleDeleteParticipant = (index) => {
    setParticipants(prev => prev.filter((_, i) => i !== index));
    setParticipantModalVisible(false);
    setParticipantEditIndex(null);
  };
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
  const handleSave = async () => {
    if (!type || !date) return;
    try {
      const key = `company:${companyId || 'demo-company'}:project:${project.id}:controls`;
      const saved = await AsyncStorage.getItem(key);
      const list = saved ? JSON.parse(saved) : [];
      const newEntry = {
        id: (list.length + 1).toString(),
        type,
        date,
        performedBy,
        participants,
        checklist,
        weather: selectedWeather,
        temperature,
        answers,
      };
      await AsyncStorage.setItem(key, JSON.stringify([...list, newEntry]));
      navigation.goBack();
    } catch (e) {
      // Error handling
    }
  };
  const toggleItem = (idx) => {
    setExpandedChecklist(expandedChecklist.includes(idx)
      ? expandedChecklist.filter(i => i !== idx)
      : [...expandedChecklist, idx]);
  };
  const setItemNote = (idx, text) => {
    const next = checklist.slice();
    next[idx] = { ...next[idx], note: text };
    setChecklist(next);
  };
  const handleAnswer = (idx, value) => {
    setAnswers({ ...answers, [idx]: value });
  };
  const getRelevantQuestions = (idx) => {
    if (idx === 1) return LEVERANS_QUESTIONS;
    if (idx === 2) return KVALITET_QUESTIONS;
    if (idx === 3) return FORVARING_QUESTIONS;
    return null;
  };

  // Main return

  return (
    <View style={{ flex: 1 }}>
      <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>{type}</Text>
        {/* Låst datumfält */}
        <TouchableOpacity
          onLongPress={() => setShowDateModal(true)}
          delayLongPress={2000}
          activeOpacity={1}
          style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 16, alignSelf: 'flex-start', marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0' }}
        >
          <Text style={{ color: '#888', fontSize: 15, fontWeight: 'bold', letterSpacing: 0.5 }}>
            Datum: {date}
          </Text>
          <Text style={{ color: '#bbb', fontSize: 12, fontStyle: 'italic' }}>(håll in för att ändra)</Text>
        </TouchableOpacity>

        {/* Projektinformation - visas alltid */}
        <View style={{ backgroundColor: '#f7f7f7', borderRadius: 10, padding: 14, marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginRight: 8 }}>{project?.id || '-'}</Text>
            <Text style={{ fontSize: 18, fontWeight: '700', color: '#222' }}>{project?.name || '-'}</Text>
          </View>
          <View style={{ marginBottom: 2 }}>
            <Text style={{ fontSize: 15, color: '#555' }}>
              <Text style={{ fontWeight: '700' }}>Ansvarig:</Text> {project?.ansvarig ? project.ansvarig : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
            </Text>
            <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
            <Text style={{ fontSize: 15, color: '#555' }}>
              <Text style={{ fontWeight: '700' }}>Kund:</Text> {project?.client ? project.client : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
            </Text>
            <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
            <Text style={{ fontSize: 15, color: '#555' }}>
              <Text style={{ fontWeight: '700' }}>Adress:</Text> {project?.adress ? project.adress : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Saknas</Text>}
            </Text>
            <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 6 }} />
            <Text style={{ fontSize: 15, color: '#555' }}>
              <Text style={{ fontWeight: '700' }}>Fastighetsbeteckning:</Text> {project?.fastighetsbeteckning
                ? project.fastighetsbeteckning
                : <Text style={{ color: '#D32F2F', fontStyle: 'italic' }}>Valfritt</Text>}
            </Text>
          </View>
        </View>

        {/* Väderlek och temperatur */}
        <View style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <TouchableOpacity
              onPress={() => setWeatherModalVisible(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f7f7f7', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0', minHeight: 48 }}
            >
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222' }}>Väderlek vid leverans</Text>
              {selectedWeather ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 10 }}>
                  <Ionicons name={selectedWeather.icon} size={32} color={selectedWeather.color} style={{ marginRight: 10 }} />
                  <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#222' }}>{selectedWeather.label}</Text>
                </View>
              ) : (
                <Text style={{ fontSize: 15, color: '#888', marginLeft: 10 }}>Välj</Text>
              )}
              {selectedWeather ? (
                <Ionicons name="checkmark" size={26} color="#388E3C" style={{ marginLeft: 'auto', marginRight: 2 }} />
              ) : (
                <Text style={{ color: '#D32F2F', fontSize: 24, marginLeft: 'auto', marginRight: 2 }}>×</Text>
              )}
            </TouchableOpacity>
          </View>
          {/* Visa ikon, väderlek och temperatur under raden */}
          <View style={{ marginTop: 8 }}>
            <TouchableOpacity
              onPress={() => setTemperatureModalVisible(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#f7f7f7', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginBottom: 10, borderWidth: 1, borderColor: '#e0e0e0', minHeight: 48 }}
            >
              <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222' }}>Temperatur</Text>
              {temperature ? (
                <Text style={{ fontSize: 15, fontWeight: 'bold', color: '#1976D2', marginLeft: 10 }}>{temperature}°C</Text>
              ) : (
                <Text style={{ fontSize: 15, color: '#888', marginLeft: 10 }}>Välj</Text>
              )}
              <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
                {temperature ? (
                  <Ionicons name="checkmark" size={26} color="#388E3C" style={{ marginLeft: 8 }} />
                ) : (
                  <Text style={{ color: '#D32F2F', fontSize: 24, marginLeft: 8 }}>×</Text>
                )}
              </View>
            </TouchableOpacity>
          </View>
        </View>

        {/* Deltagare (alltid synlig) */}
        <View style={{ marginTop: -10, marginBottom: 18 }}>
          <TouchableOpacity
            onPress={() => {
              setParticipantEditIndex(null);
              setParticipantForm({ name: '', company: '', role: '', phone: '' });
              setParticipantModalVisible(true);
            }}
            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#f7f7f7', borderRadius: 16, paddingVertical: 10, paddingHorizontal: 14, marginVertical: 2, borderWidth: 1, borderColor: '#e0e0e0', minHeight: 48 }}
          >
            <Text style={{ fontWeight: 'bold', fontSize: 16, color: '#222' }}>Deltagare:</Text>
            <Text style={{ fontSize: 15, color: '#1976D2', marginLeft: 10 }}>Lägg till</Text>
            <Ionicons name="person-add" size={24} color="#1976D2" style={{ marginLeft: 'auto' }} />
          </TouchableOpacity>
          {/* Visa lista med deltagare under knappen */}
          {participants.length > 0 && (
            <View style={{ marginTop: 8 }}>
              {participants.map((p, idx) => (
                <View key={idx} style={{ backgroundColor: '#fff', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                    <Text style={{ fontWeight: 'bold', fontSize: 16, flex: 1 }}>{p.name}</Text>
                    <Text style={{ fontSize: 15, color: '#222', marginLeft: 4, minWidth: 80 }}>{p.company}</Text>
                    <TouchableOpacity onPress={() => {
                      setParticipantEditIndex(idx);
                      setParticipantForm(p);
                      setParticipantModalVisible(true);
                    }}>
                      <Ionicons name="create-outline" size={20} color="#1976D2" />
                    </TouchableOpacity>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
                    <Text style={{ fontSize: 14, color: '#555', flex: 1 }}>{p.role}</Text>
                    <Text style={{ fontSize: 14, color: '#555', marginLeft: 4, minWidth: 80 }}>{p.phone}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}
          {/* Horisontell avdelare och rubrik */}
          <View style={{ height: 1, backgroundColor: '#e0e0e0', marginVertical: 12 }} />
          <Text style={{ fontSize: 18, fontWeight: '700', color: '#222', marginBottom: 10 }}>Kontrollpunkter</Text>
        </View>

        {/* Checklist rendering med expanderande punkter och Ja/Nej-frågor */}
        <View style={{ marginBottom: 24 }}>
          {checklist.map((item, idx) => (
            <View key={idx} style={{ marginBottom: 12, backgroundColor: item.done ? '#E0F7FA' : '#FFF3E0', borderRadius: 8, padding: 10 }}>
              <TouchableOpacity onPress={() => toggleItem(idx)}>
                <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.label}</Text>
                <Text style={{ color: '#666', fontSize: 13 }}>{item.description}</Text>
              </TouchableOpacity>
              {expandedChecklist.includes(idx) && (
                <View style={{ marginTop: 8 }}>
                  {/* Ja/Nej-frågor */}
                  <View style={{ flexDirection: 'row', marginBottom: 8 }}>
                    <TouchableOpacity onPress={() => handleAnswer(idx, 'Ja')} style={{ marginRight: 12 }}>
                      <Text style={{ color: answers[idx] === 'Ja' ? '#388E3C' : '#888' }}>Ja</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => handleAnswer(idx, 'Nej')}>
                      <Text style={{ color: answers[idx] === 'Nej' ? '#D32F2F' : '#888' }}>Nej</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Relevant questions */}
                  {getRelevantQuestions(idx) && getRelevantQuestions(idx).map((q, qIdx) => (
                    <Text key={qIdx} style={{ fontSize: 14, color: '#444', marginBottom: 4 }}>- {q}</Text>
                  ))}
                  {/* Note input */}
                  <View style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, color: '#888' }}>Anteckning:</Text>
                    <TouchableOpacity onPress={() => setItemNote(idx, 'Exempel anteckning')}>
                      <Text style={{ color: '#1976D2', fontSize: 13 }}>Lägg till/ändra anteckning</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>
        {/* Spara-knapp */}
        <TouchableOpacity style={{ backgroundColor: '#fff', borderWidth: 1, borderColor: '#e0e0e0', padding: 14, borderRadius: 8, alignItems: 'center', marginBottom: 24 }} onPress={handleSave}>
          <Text style={{ color: '#222', fontWeight: 'bold', fontSize: 16, textAlign: 'center' }}>Spara</Text>
        </TouchableOpacity>
      </ScrollView>

      {/* Modal för temperatur */}
      {temperatureModalVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 16, width: 320, borderWidth: 2, borderColor: '#e0e0e0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#222' }}>Temperatur</Text>
              <TouchableOpacity onPress={() => setTemperatureModalVisible(false)} style={{ padding: 4 }}>
                <Ionicons name="close" size={24} color="#222" />
              </TouchableOpacity>
            </View>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 16, fontSize: 16 }}
              keyboardType="numeric"
              value={temperatureInput}
              onChangeText={setTemperatureInput}
              placeholder="Ange temperatur (°C)"
            />
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 0 }}>
              <TouchableOpacity onPress={() => { setTemperature(temperatureInput); setTemperatureModalVisible(false); }}>
                <Text style={{ color: '#1976D2', fontSize: 16, textAlign: 'center' }}>Spara</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

      {/* Modal för väderlek */}
      {weatherModalVisible && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 9999 }}>
          <View style={{ backgroundColor: '#fff', padding: 20, borderRadius: 10, width: '80%' }}>
            <Text style={{ fontWeight: 'bold', fontSize: 16, marginBottom: 10, textAlign: 'center' }}>Välj väderlek</Text>
            {WEATHER_OPTIONS.map((opt, idx) => (
              <TouchableOpacity key={idx} onPress={() => { setSelectedWeather(opt); setWeatherModalVisible(false); }} style={{ flexDirection: 'row', alignItems: 'center', padding: 10 }}>
                <Ionicons name={opt.icon} size={24} color={opt.color} style={{ marginRight: 10 }} />
                <Text style={{ fontSize: 16 }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginTop: 18 }}>
              <TouchableOpacity onPress={() => setWeatherModalVisible(false)} style={{ marginRight: 18 }}>
                <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setSelectedWeather(null); setWeatherModalVisible(false); }}>
                <Text style={{ color: '#D32F2F', fontSize: 16 }}>Nollställ</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
      </View>
    );
  }

