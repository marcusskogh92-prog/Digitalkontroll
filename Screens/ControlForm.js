import React, { useState } from 'react';
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Ionicons from 'react-native-vector-icons/Ionicons';

const WEATHER_OPTIONS = [
  { label: 'Sol', icon: 'sunny-outline', color: '#FFD600' },
  { label: 'Dimma', icon: 'cloudy-outline', color: '#B0BEC5' },
  { label: 'Regn', icon: 'rainy-outline', color: '#2196F3' },
  { label: 'Snö', icon: 'snow-outline', color: '#90CAF9' },
  { label: 'Vind', icon: 'cloud-outline', color: '#90A4AE' },
  { label: 'Ostadigt', icon: 'partly-sunny-outline', color: '#FFD54F' },
];

function formatPhoneNumber(num) {
  if (!num) return '';
  const digits = num.replace(/\D/g, '');
  if (digits.length < 7) return digits;
  if (digits.length === 10) {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,8)} ${digits.slice(8,10)}`;
  }
  if (digits.length === 9) {
    return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6,8)} ${digits.slice(8,9)}`;
  }
  return digits.replace(/(\d{3})(\d{3})(\d{2})(\d{2})/, '$1 $2 $3 $4');
}

import { useRoute } from '@react-navigation/native';

export default function ControlForm({ date, participants = [] }) {
  const route = useRoute();
  const project = route.params?.project;
  const [weatherModalVisible, setWeatherModalVisible] = useState(false);
  const [selectedWeather, setSelectedWeather] = useState(null);
  const [participantModalVisible, setParticipantModalVisible] = useState(false);
  const [participantEditIndex, setParticipantEditIndex] = useState(null);
  const [participantForm, setParticipantForm] = useState({ name: '', company: '', role: '', phone: '' });
  const [localParticipants, setLocalParticipants] = useState(participants);
  const [checklist, setChecklist] = useState([
    { label: '1 - Leverans', questions: [
      'Är leveransen komplett?',
      'Är produkten oskadad?',
      'Stämmer antal mot följesedel?'
    ], answers: [null, null, null], note: '', status: null },
    { label: '2 - Kvalitet och skick', questions: [
      'Är materialet av rätt kvalitet?',
      'Finns det synliga skador eller brister?',
      'Uppfyller produkten ställda krav?'
    ], answers: [null, null, null], note: '', status: null },
    { label: '3 - Förvaring och täckning', questions: [
      'Förvaras materialet på rätt sätt?',
      'Är materialet skyddat mot väder och vind?',
      'Är täckningen tillräcklig?'
    ], answers: [null, null, null], note: '', status: null },
  ]);

  // Input refs for participant modal
  const nameInputRef = React.useRef();
  const companyInputRef = React.useRef();
  const phoneInputRef = React.useRef();
  const roleInputRef = React.useRef();
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [generalNote, setGeneralNote] = useState('');
  const [signatureName, setSignatureName] = useState('');
  // Date logic
  const todayStr = new Date().toISOString().slice(0, 10);
  const [showDateModal, setShowDateModal] = useState(false);
  const [dateValue, setDateValue] = useState(date || todayStr);
  const [dateInput, setDateInput] = useState(date || todayStr);

  const toggleItem = idx => {
    setExpandedChecklist(expandedChecklist.includes(idx)
      ? expandedChecklist.filter(i => i !== idx)
      : [...expandedChecklist, idx]);
  };

  const setItemNote = (idx, text) => {
    const next = checklist.slice();
    next[idx] = { ...next[idx], note: text };
    setChecklist(next);
  };

  const setAnswer = (idx, qIdx, value) => {
    const next = checklist.slice();
    next[idx].answers[qIdx] = value;
    // Status logic
    if (next[idx].answers.every(a => a === 'Ja')) {
      next[idx].status = 'ok';
    } else if (next[idx].answers.some(a => a === 'Nej')) {
      next[idx].status = 'deviation';
    } else {
      next[idx].status = null;
    }
    setChecklist(next);
  };

  const handleSaveParticipant = () => {
    if (!participantForm.name.trim()) return;
    const next = localParticipants.slice();
    const formatted = { ...participantForm, phone: formatPhoneNumber(participantForm.phone) };
    if (participantEditIndex === null) {
      next.push(formatted);
    } else {
      next[participantEditIndex] = formatted;
    }
    setLocalParticipants(next);
    setParticipantModalVisible(false);
    setParticipantEditIndex(null);
    setParticipantForm({ name: '', company: '', role: '', phone: '' });
  };

  const handleDeleteParticipant = idx => {
    setLocalParticipants(localParticipants.filter((_, i) => i !== idx));
    setParticipantModalVisible(false);
    setParticipantEditIndex(null);
  };

  return (

    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled">
        {/* Projektinfo */}
        <View style={{ padding: 16 }}>
          <Text style={{ fontSize: 24, fontWeight: 'bold', marginBottom: 12, color: '#1976D2', letterSpacing: 0.5 }}>Mottagningskontroll</Text>
          <View style={{ backgroundColor: '#F5F7FB', borderRadius: 12, padding: 14, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 8 }}>
            <Text style={{ fontSize: 16, marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Projektnummer:</Text> {project?.id || '-'}</Text>
            <Text style={{ fontSize: 16, marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Projektnamn:</Text> {project?.name || '-'}</Text>
            <Text style={{ fontSize: 16, marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Ansvarig:</Text> {project?.ansvarig || '-'}</Text>
            <Text style={{ fontSize: 16, marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Kund:</Text> {project?.kund || '-'}</Text>
            <Text style={{ fontSize: 16, marginBottom: 4 }}><Text style={{ fontWeight: 'bold' }}>Adress:</Text> {project?.adress || '-'}</Text>
            <Text style={{ fontSize: 16, marginBottom: 0 }}><Text style={{ fontWeight: 'bold' }}>Fastighetsbeteckning:</Text> {project?.fastighetsbeteckning || '-'}</Text>
          </View>
        </View>

        {/* Datum på egen rad, likt väderlek */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#e0e0e0', position: 'relative' }}>
            <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginRight: 6 }}>Datum:</Text>
            <Text style={{ fontSize: 15, color: '#1976D2', marginRight: 10 }}>{dateValue}</Text>
            <TouchableOpacity
              onPress={() => { setDateInput(dateValue); setShowDateModal(true); }}
              style={{ position: 'absolute', top: -8, right: -8, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.01)' }}
              accessibilityLabel="Ändra datum"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="create-outline" size={24} color="#888" />
            </TouchableOpacity>
          </View>
        </View>
      {/* Modal för att ändra datum */}
      {showDateModal && (
        <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'center', zIndex: 9999 }}>
          <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 16, width: 320, borderWidth: 2, borderColor: '#e0e0e0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 12, marginTop: 240 }}>
            <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#222', marginBottom: 12 }}>Ändra datum</Text>
            <TextInput
              style={{ borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16, backgroundColor: '#fff', textAlign: 'center' }}
              value={dateInput}
              onChangeText={text => {
                // Remove non-digits except '-'
                let digits = text.replace(/[^\d-]/g, '');
                // Auto-insert '-' after year and month
                if (digits.length > 4 && digits[4] !== '-') digits = digits.slice(0,4) + '-' + digits.slice(4);
                if (digits.length > 7 && digits[7] !== '-') digits = digits.slice(0,7) + '-' + digits.slice(7);
                // Limit to 10 chars
                digits = digits.slice(0, 10);
                setDateInput(digits);
                // Auto-save if valid
                if (/^\d{4}-\d{2}-\d{2}$/.test(digits) && digits <= todayStr) {
                  setDateValue(digits);
                  setShowDateModal(false);
                }
              }}
              placeholder="ÅÅÅÅ-MM-DD"
              placeholderTextColor="#888"
              keyboardType="numeric"
              maxLength={10}
            />
            {(() => {
              // Validate date format and future date
              let warning = '';
              let isFuture = false;
              if (/^\d{4}-\d{2}-\d{2}$/.test(dateInput)) {
                isFuture = dateInput > todayStr;
                if (isFuture) warning = 'Du kan inte välja ett datum i framtiden.';
              } else if (dateInput.length > 0) {
                warning = 'Ogiltigt datumformat.';
              }
              return warning ? (
                <Text style={{ color: '#D32F2F', fontSize: 14, marginBottom: 8, textAlign: 'center' }}>{warning}</Text>
              ) : null;
            })()}
            <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 0 }}>
              <TouchableOpacity
                onPress={() => {
                  // Only save if valid and not future
                  const validFormat = /^\d{4}-\d{2}-\d{2}$/.test(dateInput);
                  const isFuture = validFormat && dateInput > todayStr;
                  if (validFormat && !isFuture) {
                    setDateValue(dateInput);
                    setShowDateModal(false);
                  }
                }}
                disabled={!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || (dateInput > todayStr)}
                style={{ opacity: (!/^\d{4}-\d{2}-\d{2}$/.test(dateInput) || (dateInput > todayStr)) ? 0.5 : 1, marginRight: 18 }}
              >
                <Text style={{ color: '#1976D2', fontSize: 16, textAlign: 'center' }}>Spara</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setShowDateModal(false)}>
                <Text style={{ color: '#D32F2F', fontSize: 16, textAlign: 'center' }}>Avbryt</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}

        {/* Väderlek */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F7FAFC', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e0e0e0', position: 'relative' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
              <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#222', marginRight: 8 }}>Väderlek:</Text>
              <Ionicons name={selectedWeather ? selectedWeather.icon : 'cloud-outline'} size={22} color={selectedWeather ? selectedWeather.color : '#888'} style={{ marginRight: 8 }} />
              <Text style={{ fontSize: 15, color: '#1976D2' }}>{selectedWeather ? selectedWeather.label : 'Välj'}</Text>
            </View>
            <TouchableOpacity
              onPress={() => setWeatherModalVisible(true)}
              style={{ position: 'absolute', top: -8, right: -8, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.01)' }}
              accessibilityLabel="Ändra väderlek"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="create-outline" size={24} color="#888" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider mellan väderlek och deltagare */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginHorizontal: 16, marginBottom: 16 }} />

        {/* Deltagare */}
        <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Deltagare</Text>
          <View style={{ backgroundColor: '#F7FAFC', borderRadius: 10, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderColor: '#e0e0e0', flexDirection: 'row', alignItems: 'center', position: 'relative', marginBottom: 8 }}>
            <Text style={{ fontSize: 18, color: '#1976D2', flex: 1 }}>Lägg till deltagare</Text>
            <TouchableOpacity
              onPress={() => { setParticipantEditIndex(null); setParticipantForm({ name: '', company: '', role: '', phone: '' }); setParticipantModalVisible(true); }}
              style={{ position: 'absolute', top: -8, right: -8, padding: 16, borderRadius: 20, backgroundColor: 'rgba(255,255,255,0.01)' }}
              accessibilityLabel="Lägg till deltagare"
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="add-circle-outline" size={24} color="#1976D2" />
            </TouchableOpacity>
          </View>
          {/* Sortera deltagare på namn A-Ö */}
          {localParticipants
            .slice()
            .sort((a, b) => a.name.localeCompare(b.name, 'sv', { sensitivity: 'base' }))
            .map((p, i) => (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                <Text style={{ fontSize: 18, flex: 1 }}>{p.name} {p.company ? `(${p.company})` : ''}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <TouchableOpacity onPress={() => { setParticipantEditIndex(i); setParticipantForm(p); setParticipantModalVisible(true); }} style={{ marginLeft: 8 }}>
                    <Ionicons name="create-outline" size={18} color="#1976D2" />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => handleDeleteParticipant(i)} style={{ marginLeft: 8 }}>
                    <Ionicons name="trash" size={18} color="#D32F2F" />
                  </TouchableOpacity>
                </View>
              </View>
            ))}
        </View>

        {/* Horisontell linje mellan deltagare och checklista */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', marginHorizontal: 16, marginBottom: 16 }} />

        {/* Checklista med sektioner, ja/nej, statusikon och anteckning */}
        <View style={{ paddingHorizontal: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Checklista</Text>
          {checklist.map((item, idx) => (
            <View key={idx} style={{ marginBottom: 16, backgroundColor: '#F5F7FB', borderRadius: 8, padding: 10, borderWidth: 1, borderColor: '#e0e0e0' }}>
              <TouchableOpacity onPress={() => toggleItem(idx)} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ fontWeight: 'bold', fontSize: 16 }}>{item.label}</Text>
                {item.status === 'ok' && <Ionicons name="checkmark-circle" size={22} color="#388E3C" style={{ marginRight: 8 }} />}
                {item.status === 'deviation' && <Ionicons name="alert-circle" size={22} color="#FFA000" style={{ marginRight: 8 }} />}
                <Ionicons name={expandedChecklist.includes(idx) ? 'chevron-down' : 'chevron-forward'} size={22} color="#888" style={{ marginLeft: 8 }} />
              </TouchableOpacity>
              {expandedChecklist.includes(idx) && (
                <View style={{ marginTop: 8 }}>
                  {item.questions.map((q, qIdx) => (
                    <View key={qIdx} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                      <Text style={{ fontSize: 14, color: '#444', flex: 1 }}>{q}</Text>
                      <TouchableOpacity
                        onPress={() => setAnswer(idx, qIdx, 'Ja')}
                        style={{ backgroundColor: item.answers[qIdx] === 'Ja' ? '#388E3C' : '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16, marginRight: 6 }}
                      >
                        <Text style={{ color: item.answers[qIdx] === 'Ja' ? '#fff' : '#388E3C', fontWeight: 'bold', fontSize: 14 }}>Ja</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setAnswer(idx, qIdx, 'Nej')}
                        style={{ backgroundColor: item.answers[qIdx] === 'Nej' ? '#D32F2F' : '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 16 }}
                      >
                        <Text style={{ color: item.answers[qIdx] === 'Nej' ? '#fff' : '#D32F2F', fontWeight: 'bold', fontSize: 14 }}>Nej</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                  {/* Note input for deviations */}
                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 14, fontWeight: 'bold', color: '#222', marginBottom: 4 }}>Anteckningar</Text>
                    <TextInput
                      style={{ backgroundColor: item.answers.some(a => a === 'Nej') && (!item.note || item.note.trim() === '') ? '#FFF3E0' : '#fff', borderRadius: 8, borderWidth: 1, borderColor: item.answers.some(a => a === 'Nej') && (!item.note || item.note.trim() === '') ? '#FFA726' : '#e0e0e0', padding: 10, fontSize: 14, minHeight: 40 }}
                      placeholder="Skriv anteckningar här..."
                      placeholderTextColor="#888"
                      value={item.note}
                      onChangeText={text => setItemNote(idx, text)}
                      multiline
                    />
                    {item.answers.some(a => a === 'Nej') && (!item.note || item.note.trim() === '') && (
                      <Text style={{ color: '#FFA726', fontSize: 13, marginTop: 4 }}>
                        Anteckning krävs vid avvikelse!
                      </Text>
                    )}
                  </View>
                </View>
              )}
            </View>
          ))}
        </View>

        {/* Allmän anteckning längst ner */}
        <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff' }}
            value={generalNote}
            onChangeText={setGeneralNote}
            placeholder="Allmän anteckning..."
            multiline
          />
        </View>

        {/* Signatur */}
        <View style={{ padding: 16, marginTop: 16 }}>
          <Text style={{ fontSize: 16, fontWeight: 'bold', marginBottom: 4 }}>Signatur</Text>
          <TextInput
            style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, backgroundColor: '#fff' }}
            value={signatureName}
            onChangeText={setSignatureName}
            placeholder="Namn på signatur..."
          />
        </View>

        {/* Spara-knapp */}
        <View style={{ padding: 16 }}>
          <TouchableOpacity style={{ backgroundColor: '#1976D2', borderRadius: 8, padding: 14, alignItems: 'center' }} onPress={() => alert('Sparad! (demo)')}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>Spara</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

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

        {/* Modal för deltagare */}
        {participantModalVisible && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'flex-start', alignItems: 'center', zIndex: 9999 }}>
            <View style={{ backgroundColor: '#fff', padding: 24, borderRadius: 16, width: 340, borderWidth: 2, borderColor: '#e0e0e0', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 12, marginTop: 120 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text style={{ fontSize: 18, fontWeight: 'bold', color: '#222' }}>{participantEditIndex === null ? 'Lägg till deltagare' : 'Redigera deltagare'}</Text>
                <TouchableOpacity onPress={() => setParticipantModalVisible(false)} style={{ padding: 4 }}>
                  <Ionicons name="close" size={24} color="#222" />
                </TouchableOpacity>
              </View>
              {/* Input refs for focus navigation */}
              <TextInput
                style={{ borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16, backgroundColor: '#fff' }}
                value={participantForm.name}
                onChangeText={text => setParticipantForm({ ...participantForm, name: text })}
                placeholder="Namn"
                placeholderTextColor="#888"
                returnKeyType="next"
                onSubmitEditing={() => companyInputRef.current && companyInputRef.current.focus()}
                ref={nameInputRef}
              />
              <TextInput
                style={{ borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16, backgroundColor: '#fff' }}
                value={participantForm.company}
                onChangeText={text => setParticipantForm({ ...participantForm, company: text })}
                placeholder="Företag"
                placeholderTextColor="#888"
                returnKeyType="next"
                onSubmitEditing={() => phoneInputRef.current && phoneInputRef.current.focus()}
                ref={companyInputRef}
              />
              <TextInput
                style={{ borderWidth: 1, borderColor: '#888', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16, backgroundColor: '#fff' }}
                value={participantForm.phone}
                onChangeText={text => {
                  // Format as xxx xxx xx xx
                  let digits = text.replace(/\D/g, '').slice(0, 10);
                  let formatted = '';
                  if (digits.length > 0) formatted += digits.slice(0, 3);
                  if (digits.length > 3) formatted += ' ' + digits.slice(3, 6);
                  if (digits.length > 6) formatted += ' ' + digits.slice(6, 8);
                  if (digits.length > 8) formatted += ' ' + digits.slice(8, 10);
                  setParticipantForm({ ...participantForm, phone: formatted });
                }}
                placeholder="Mobilnummer"
                placeholderTextColor="#888"
                keyboardType="numeric"
                maxLength={13}
                returnKeyType="next"
                onSubmitEditing={() => roleInputRef.current && roleInputRef.current.focus()}
                ref={phoneInputRef}
              />
              <TextInput
                style={{ borderWidth: 1, borderColor: '#ccc', borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 16, color: '#222' }}
                value={participantForm.role}
                onChangeText={text => setParticipantForm({ ...participantForm, role: text })}
                placeholder="Roll (t.ex. Montör, Arbetsledare)"
                placeholderTextColor="#888"
                returnKeyType="done"
                onSubmitEditing={handleSaveParticipant}
                ref={roleInputRef}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'center', marginBottom: 0 }}>
                <TouchableOpacity onPress={handleSaveParticipant} style={{ marginRight: 18 }}>
                  <Text style={{ color: '#1976D2', fontSize: 16, textAlign: 'center' }}>Spara</Text>
                </TouchableOpacity>
                {participantEditIndex !== null && (
                  <TouchableOpacity onPress={() => handleDeleteParticipant(participantEditIndex)}>
                    <Ionicons name="trash" size={22} color="#D32F2F" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        )}
      </View>
    );
  }


