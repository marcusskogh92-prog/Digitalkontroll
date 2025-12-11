import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
// Refs for input focus (must be inside the component, not in render)
import { ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import NativeSignatureModal from './NativeSignatureModal';

export default function BaseControlForm({
  project,
  participants = [],
  date,
  weatherOptions = [],
  checklistConfig = [],
  controlType = '',
  labels = {},
  onSave,
  onSaveDraft,
  initialValues = {},
}) {
  const nameRef = useRef();
  const companyRef = useRef();
  const roleRef = useRef();
  const phoneRef = useRef();
  // Common state
  const [dateValue, setDateValue] = useState(date || '');
  const [showDateModal, setShowDateModal] = useState(false);
  const [tempDate, setTempDate] = useState('');
  const [selectedWeather, setSelectedWeather] = useState(initialValues.weather || null);
  const [localParticipants, setLocalParticipants] = useState(participants);
  const [showAddParticipantModal, setShowAddParticipantModal] = useState(false);
  const [participantName, setParticipantName] = useState('');
  const [participantCompany, setParticipantCompany] = useState('');
  const [participantRole, setParticipantRole] = useState('');
  const [participantPhone, setParticipantPhone] = useState('');
  const [checklist, setChecklist] = useState(checklistConfig);
  const [deliveryDesc, setDeliveryDesc] = useState(initialValues.deliveryDesc || '');
  const [generalNote, setGeneralNote] = useState(initialValues.generalNote || '');
  const [expandedChecklist, setExpandedChecklist] = useState([]);
  const [signatureForIndex, setSignatureForIndex] = useState(null);

  // Example save handlers (should be replaced with real logic)
  const handleSave = () => {
    if (onSave) onSave({
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      checklist,
      deliveryDesc,
      generalNote,
      type: controlType,
    });
  };
  const handleSaveDraft = () => {
    if (onSaveDraft) onSaveDraft({
      date: dateValue,
      project,
      weather: selectedWeather,
      participants: localParticipants,
      checklist,
      deliveryDesc,
      generalNote,
      type: controlType,
    });
  };

  // Render
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ flex: 1 }}>
        {/* Project Info and meta */}
        <View style={{ padding: 16, paddingBottom: 0 }}>
        {/* Project number and name */}
        {project && (
          <>
            <Text style={{ fontSize: 28, color: '#222', fontWeight: 'bold', marginBottom: 8, letterSpacing: 0.2 }}>
              {project.id ? project.id : ''}{project.id && project.name ? ' – ' : ''}{project.name ? project.name : ''}
            </Text>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 10 }} />
          </>
        )}
        {/* Date row - long press to edit */}
        {/* Date row with icon, text, and edit button */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <Ionicons name="calendar-outline" size={26} color="#1976D2" style={{ marginRight: 10 }} />
            <Text style={{ fontSize: 18, color: '#222', fontWeight: '600' }}>
              {(dateValue ? new Date(dateValue) : new Date()).toLocaleDateString('sv-SE')} • Vecka {(() => {
                const d = dateValue ? new Date(dateValue) : new Date();
                d.setHours(0, 0, 0, 0);
                d.setDate(d.getDate() + 3 - ((d.getDay() + 6) % 7));
                const week1 = new Date(d.getFullYear(), 0, 4);
                return 1 + Math.round(((d.getTime() - week1.getTime()) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
              })()}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => {
              setTempDate(dateValue ? new Date(dateValue).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
              setShowDateModal(true);
            }}
            style={{ marginLeft: 12, padding: 4 }}
            activeOpacity={0.7}
            accessibilityLabel="Ändra datum"
          >
            <Ionicons name="create-outline" size={22} color="#888" />
          </TouchableOpacity>
        </View>
        {/* Soft horizontal divider under date */}
        <View style={{ height: 1, backgroundColor: '#f0f0f0', width: '100%', marginBottom: 12, marginTop: 0 }} />
        {/* Date edit modal */}
        {showDateModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
            <View style={{ height: 500 }} />
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 280, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
              {/* Close (X) icon in top right */}
              <TouchableOpacity onPress={() => setShowDateModal(false)} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, padding: 4 }} accessibilityLabel="Stäng">
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Ändra datum</Text>
              <TextInput
                value={tempDate}
                onChangeText={text => {
                  // Only allow numbers and hyphens, auto-insert hyphens for yyyy-mm-dd
                  let cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned.length > 8) cleaned = cleaned.slice(0, 8);
                  let formatted = cleaned;
                  if (cleaned.length > 4) formatted = cleaned.slice(0, 4) + '-' + cleaned.slice(4);
                  if (cleaned.length > 6) formatted = formatted.slice(0, 7) + '-' + formatted.slice(7);
                  setTempDate(formatted);
                }}
                style={{
                  borderWidth: 1,
                  borderColor: '#bbb',
                  borderRadius: 8,
                  padding: 8,
                  fontSize: 16,
                  color: '#222',
                  backgroundColor: '#fafafa',
                  width: 160,
                  marginBottom: 8
                }}
                placeholder="ÅÅÅÅ-MM-DD"
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={10}
              />
              {/* Red warning if date is in the future */}
              {(() => {
                if (tempDate.length === 10) {
                  const today = new Date();
                  const inputDate = new Date(tempDate);
                  if (!isNaN(inputDate) && inputDate > today) {
                    return <Text style={{ color: '#D32F2F', marginBottom: 8, fontSize: 13 }}>Du kan inte välja ett framtida datum.</Text>;
                  }
                }
                return null;
              })()}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    setDateValue(tempDate);
                    setShowDateModal(false);
                  }}
                  disabled={(() => {
                    if (tempDate.length === 10) {
                      const today = new Date();
                      const inputDate = new Date(tempDate);
                      return isNaN(inputDate) || inputDate > today;
                    }
                    return true;
                  })()}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '400', fontSize: 16, opacity: (() => {
                    if (tempDate.length === 10) {
                      const today = new Date();
                      const inputDate = new Date(tempDate);
                      return (!isNaN(inputDate) && inputDate <= today) ? 1 : 0.4;
                    }
                    return 0.4;
                  })() }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => setShowDateModal(false)}
                >
                  <Text style={{ color: '#D32F2F', fontWeight: '400', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          {/* Divider under participants (should only be in main flow, not modal) */}
          </View>
        )}
        {/* Participants row */}
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, justifyContent: 'space-between' }}>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <Ionicons name="person-outline" size={26} color="#1976D2" style={{ marginRight: 7, marginTop: 2 }} />
            <View>
              <Text style={{ fontSize: 18, color: '#222', fontWeight: '600', marginBottom: 2 }}>Deltagare:</Text>
              {localParticipants && localParticipants.length > 0 ? (
                localParticipants.map((p, idx) => {
                  // If p is a string, show as name only. If object, show all fields.
                  if (typeof p === 'string') {
                    return (
                      <View key={idx} style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 6, minWidth: 180 }}>
                        <Text style={{ fontSize: 16, color: '#222', fontWeight: '500' }}>{p}</Text>
                      </View>
                    );
                  } else if (typeof p === 'object' && p !== null) {
                    return (
                      <View key={idx} style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 8, marginBottom: 6, minWidth: 180 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '500', marginRight: 8 }}>{p.name || ''}</Text>
                          {p.company ? <Text style={{ fontSize: 16, color: '#555', fontWeight: '400' }}>{p.company}</Text> : null}
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          {p.role ? <Text style={{ fontSize: 13, color: '#888', marginRight: 12 }}>{p.role}</Text> : null}
                          {p.phone ? <Text style={{ fontSize: 13, color: '#888' }}>{p.phone}</Text> : null}
                        </View>
                      </View>
                    );
                  }
                  return null;
                })
              ) : null}
            </View>
          </View>
          <TouchableOpacity onPress={() => setShowAddParticipantModal(true)} style={{ padding: 4 }} accessibilityLabel="Lägg till deltagare">
            <Ionicons name="add-circle-outline" size={26} color="#1976D2" />
          </TouchableOpacity>
        </View>
        {/* Divider under participants, before weather */}
        <View style={{ height: 1, backgroundColor: '#e0e0e0', width: '100%', marginTop: 10, marginBottom: 10 }} />
                {/* Add Participant Modal */}
        {showAddParticipantModal && (
          <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', zIndex: 200 }}>
            <View style={{ height: 200 }} />
            <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 300, minHeight: 300, alignItems: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
              {/* Close (X) icon in top right */}
              <TouchableOpacity onPress={() => setShowAddParticipantModal(false)} style={{ position: 'absolute', top: 10, right: 10, zIndex: 10, padding: 4 }} accessibilityLabel="Stäng">
                <Ionicons name="close" size={24} color="#888" />
              </TouchableOpacity>
              <Text style={{ fontSize: 18, fontWeight: 'bold', marginBottom: 12, color: '#222' }}>Lägg till deltagare</Text>
              <TextInput
                value={participantName}
                onChangeText={setParticipantName}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholder="Namn"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => companyRef && companyRef.current && companyRef.current.focus()}
                ref={nameRef}
              />
              <TextInput
                value={participantCompany}
                onChangeText={setParticipantCompany}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholder="Företag"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => roleRef && roleRef.current && roleRef.current.focus()}
                ref={companyRef}
              />
              <TextInput
                value={participantRole}
                onChangeText={setParticipantRole}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 10 }}
                placeholderTextColor="#888"
                placeholder="Roll"
                autoCapitalize="words"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => phoneRef && phoneRef.current && phoneRef.current.focus()}
                ref={roleRef}
              />
              <TextInput
                value={participantPhone}
                onChangeText={text => {
                  // Only allow numbers, auto-insert spaces: xxx xxx xx xx
                  let cleaned = text.replace(/[^0-9]/g, '');
                  if (cleaned.length > 10) cleaned = cleaned.slice(0, 10);
                  let formatted = cleaned;
                  if (cleaned.length > 3) formatted = cleaned.slice(0, 3) + ' ' + cleaned.slice(3);
                  if (cleaned.length > 6) formatted = formatted.slice(0, 7) + ' ' + formatted.slice(7);
                  if (cleaned.length > 8) formatted = formatted.slice(0, 10) + ' ' + formatted.slice(10);
                  setParticipantPhone(formatted);
                }}
                style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 8, padding: 8, fontSize: 16, color: '#222', backgroundColor: '#fafafa', width: 220, marginBottom: 16 }}
                placeholderTextColor="#888"
                placeholder="Mobilnummer"
                keyboardType="numeric"
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={13}
                returnKeyType="done"
                onSubmitEditing={() => {
                  if (participantName.trim()) {
                    setLocalParticipants([
                      ...localParticipants,
                      {
                        name: participantName.trim(),
                        company: participantCompany.trim(),
                        role: participantRole.trim(),
                        phone: participantPhone.trim(),
                      },
                    ]);
                    setShowAddParticipantModal(false);
                    setParticipantName('');
                    setParticipantCompany('');
                    setParticipantRole('');
                    setParticipantPhone('');
                  }
                }}
                ref={phoneRef}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', width: '100%' }}>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginRight: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    // Add participant to list
                    if (participantName.trim()) {
                      setLocalParticipants([
                        ...localParticipants,
                        {
                          name: participantName.trim(),
                          company: participantCompany.trim(),
                          role: participantRole.trim(),
                          phone: participantPhone.trim(),
                        },
                      ]);
                      setShowAddParticipantModal(false);
                      setParticipantName('');
                      setParticipantCompany('');
                      setParticipantRole('');
                      setParticipantPhone('');
                    }
                  }}
                  disabled={!participantName.trim()}
                >
                  <Text style={{ color: '#1976D2', fontWeight: '400', fontSize: 16, opacity: participantName.trim() ? 1 : 0.4 }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ flex: 1, alignItems: 'center', marginLeft: 8, backgroundColor: 'transparent', paddingVertical: 10, paddingHorizontal: 0 }}
                  onPress={() => {
                    setShowAddParticipantModal(false);
                    setParticipantName('');
                    setParticipantCompany('');
                    setParticipantRole('');
                    setParticipantPhone('');
                  }}
                >
                  <Text style={{ color: '#D32F2F', fontWeight: '400', fontSize: 16 }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
        </View>
      {/* Divider under participants, before weather (removed duplicate) */}
      {/* Weather row */}
      <Text style={{ fontSize: 15, color: '#333', marginBottom: 2 }}>
        Väder: {selectedWeather ? selectedWeather : '–'}
      </Text>
      {/* Weather Selection */}
      <View style={{ paddingHorizontal: 16, marginBottom: 12, marginTop: 8 }}>
        <Text style={{ fontWeight: 'bold', marginBottom: 8 }}>Välj väder</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
          {weatherOptions.map((option, idx) => (
            <TouchableOpacity
              key={option}
              onPress={() => setSelectedWeather(option)}
              style={{
                backgroundColor: selectedWeather === option ? '#1976D2' : '#E0E0E0',
                borderRadius: 16,
                paddingVertical: 8,
                paddingHorizontal: 16,
                marginRight: 8,
                marginBottom: 8,
              }}
            >
              <Text style={{ color: selectedWeather === option ? '#fff' : '#333' }}>{option}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
      {/* Date, Delivery Description, Participants, Checklist, Signature, Save Buttons */}
      {/* ...existing code... */}
      <TouchableOpacity onPress={handleSave} style={{ backgroundColor: '#f5f5f5', borderRadius: 8, padding: 14, alignItems: 'center', margin: 16, borderWidth: 1, borderColor: '#bbb' }}>
        <Text style={{ color: '#222', fontWeight: 'bold', fontSize: 16 }}>{labels.saveButton || 'Spara'}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={handleSaveDraft} style={{ backgroundColor: '#FFA726', borderRadius: 8, padding: 14, alignItems: 'center', marginHorizontal: 16, marginBottom: 20 }}>
        <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{labels.saveDraftButton || 'Spara och slutför senare'}</Text>
      </TouchableOpacity>
      {/* Signature Modal Example */}
      <NativeSignatureModal
        visible={signatureForIndex !== null}
        onOK={() => setSignatureForIndex(null)}
        onCancel={() => setSignatureForIndex(null)}
      />
    </View>
  </ScrollView>
  );
}
