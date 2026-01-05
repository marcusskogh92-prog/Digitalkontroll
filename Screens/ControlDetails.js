

import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNavigation } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, TextInput } from 'react-native';
// import { Ionicons } from '@expo/vector-icons';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import SignatureModal from '../components/SignatureModal';

const CONTROL_TYPE_ICONS = {
  'Arbetsberedning': { icon: 'construct-outline', color: '#1976D2', label: 'Arbetsberedning' },
  'Egenkontroll': { icon: 'checkmark-done-outline', color: '#388E3C', label: 'Egenkontroll' },
  'Fuktmätning': { icon: 'water-outline', color: '#0288D1', label: 'Fuktmätning' },
  'Mottagningskontroll': { icon: 'checkbox-outline', color: '#7B1FA2', label: 'Mottagningskontroll' },
  'Riskbedömning': { icon: 'warning-outline', color: '#FFD600', label: 'Riskbedömning' },
  'Skyddsrond': { icon: 'shield-half-outline', color: '#388E3C', label: 'Skyddsrond' },
};

const PRIMARY = '#263238';

export default function ControlDetails({ route }) {
  // Modal state for åtgärd
  const [actionModal, setActionModal] = useState({ visible: false, section: '', point: '', img: null, comment: '', signature: '', name: '' });
  const [_, setForceUpdate] = useState(0); // för att tvinga omrendering
  const navigation = useNavigation();
  const [photoModalVisible, setPhotoModalVisible] = useState(false);
  const [selectedPhoto, setSelectedPhoto] = useState(null);
  const { control, project } = route.params || {};
  if (!control) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <Text style={{ color: '#555' }}>Kunde inte hitta kontrollen.</Text>
      </View>
    );
  }

  let {
    type,
    date,
    deliveryDesc,
    description,
    participants = [],
    checklist = [],
    status,
    savedAt,
    weather,
    mottagningsPhotos = [],
    mottagningsSignatures = [],
    attachments = []
  } = control;
  participants = Array.isArray(participants) ? participants : [];
  checklist = Array.isArray(checklist) ? checklist : [];
  attachments = Array.isArray(attachments) ? attachments : [];
  mottagningsPhotos = Array.isArray(mottagningsPhotos) ? mottagningsPhotos : [];
  mottagningsSignatures = Array.isArray(mottagningsSignatures) ? mottagningsSignatures : [];

  // Format week number
  function getWeek(dateStr) {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() + 4 - (d.getDay() || 7));
    const yearStart = new Date(d.getFullYear(), 0, 1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    return weekNo;
  }
  const week = getWeek(date);
  // Status text
  const statusText = status === 'UTFÖRD' || status === 'Slutförd' ? 'Slutförd' : 'Pågående';

  // Checklist points: group by section, show approved and deviation points with icons
  // checklistSections ska alltid innehålla remediation-array
  const checklistSections = (checklist || []).map((section) => {
    if (!section || !Array.isArray(section.points)) return null;
    const approved = [];
    const deviation = [];
    // Gör remediation till ett objekt per punkt
    let remediation = section.remediation;
    if (!remediation || typeof remediation !== 'object') remediation = {};
    (section.points || []).forEach((pt, idx) => {
      const status = section.statuses && section.statuses[idx];
      if (status === 'ok') approved.push(pt);
      if (status === 'avvikelse') deviation.push(pt);
    });
    if (approved.length === 0 && deviation.length === 0) return null;
    return {
      label: section.label,
      approved,
      deviation,
      remediation,
    };
  }).filter(Boolean);

  // Get icon and label for this control type
  const { icon, color, label } = CONTROL_TYPE_ICONS[type] || { icon: 'alert-circle', color: '#D32F2F', label: type || 'Kontroll' };

  return (
    <ScrollView style={styles.container}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Ionicons name={icon} size={28} color={color} style={{ marginRight: 8 }} />
          <Text style={styles.title}>{label}</Text>
        </View>
        <TouchableOpacity
          onPress={() => {
            // Determine which form screen to navigate to based on control type
            let screen = null;
            switch (type) {
              case 'Riskbedömning': screen = 'RiskbedömningScreen'; break;
              case 'Arbetsberedning': screen = 'ArbetsberedningScreen'; break;
              case 'Egenkontroll': screen = 'EgenkontrollScreen'; break;
              case 'Fuktmätning': screen = 'FuktmätningScreen'; break;
              case 'Mottagningskontroll': screen = 'MottagningskontrollScreen'; break;
              case 'Skyddsrond': screen = 'SkyddsrondScreen'; break;
              default: screen = null;
            }
            if (screen) {
              navigation.navigate(screen, { initialValues: control, project });
            }
          }}
          style={{ padding: 6, marginLeft: 8 }}
          accessibilityLabel="Redigera kontroll"
        >
          <Ionicons name="create-outline" size={22} color="#1976D2" />
        </TouchableOpacity>
      </View>
      <View style={styles.divider} />
      {/* Datum-rubrik med ikon och undertexter */}
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
        <Ionicons name="calendar-outline" size={20} color="#1976D2" style={{ marginRight: 6 }} />
        <Text style={styles.sectionTitle}>Datum</Text>
      </View>
      <Text style={styles.subInfo}>Skapad: {date ? new Date(date).toISOString().slice(0, 10) : '-'}</Text>
      <Text style={styles.subInfo}>Status: {statusText}</Text>
      {savedAt && <Text style={styles.subInfo}>Sparad senast: {new Date(savedAt).toISOString().slice(0, 10)}</Text>}
      <View style={styles.divider} />
      {/* Vecka visas ej som rubrik men kan läggas till om önskas */}

      {/* Deltagare */}
      {participants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deltagare</Text>
          {participants.map((p, i) => {
            let name, company, role;
            if (typeof p === 'string') {
              name = p;
              company = '';
              role = '';
            } else if (p && typeof p === 'object') {
              name = p.name || '';
              company = p.company || '';
              role = p.role || '';
            }
            return (
              <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                <Ionicons name="person-outline" size={18} color="#1976D2" style={{ marginRight: 6 }} />
                <Text style={styles.bodyText}>
                  {name}
                  {company ? `, ${company}` : ''}
                  {role ? `, ${role}` : ''}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {participants.length > 0 && <View style={styles.divider} />}

      {/* Väderlek */}
      {weather && type !== 'Egenkontroll' && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Väderlek</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {(() => {
              // Match icon to weather string
              const weatherIcons = {
                'Soligt': 'sunny',
                'Delvis molnigt': 'partly-sunny',
                'Molnigt': 'cloudy',
                'Regn': 'rainy',
                'Snö': 'snow',
                'Åska': 'thunderstorm',
              };
              const iconName = weatherIcons[weather];
              if (iconName) {
                const cmap = { sunny: '#FFD54F', 'partly-sunny': '#FFB74D', cloudy: '#90A4AE', rainy: '#4FC3F7', snow: '#90CAF9', thunderstorm: '#9575CD' };
                return <Ionicons name={iconName} size={22} color={cmap[iconName] || '#1976D2'} style={{ marginRight: 8 }} />;
              }
              return null;
            })()}
            <Text style={styles.bodyText}>{weather}</Text>
          </View>
        </View>
      )}
      {weather && type !== 'Egenkontroll' && <View style={styles.divider} />}

      {/* Beskrivning av moment */}
      {(deliveryDesc || description) && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Beskrivning av moment</Text>
          <Text style={styles.bodyText}>{deliveryDesc || description}</Text>
        </View>
      )}



      {/* Kontrollpunkter */}
      {checklistSections.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Kontrollpunkter</Text>
          {checklistSections.map((section, idx) => (
            <View key={idx} style={{ marginBottom: 8 }}>
              {idx > 0 && <View style={styles.divider} />}
              <Text style={{ fontWeight: '600', fontSize: 15, color: '#444', marginBottom: 2 }}>{section.label}</Text>
              {section.approved.map((pt, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2, flexWrap: 'wrap' }}>
                  <Ionicons name="checkmark-circle" size={18} color="#388E3C" style={{ marginRight: 6 }} />
                  <Text style={[styles.bodyText, { flex: 1, flexWrap: 'wrap' }]}>{pt}</Text>
                </View>
              ))}
              {section.deviation.map((pt, i) => {
                const remediationKey = pt.trim();
                const remediation = section.remediation && section.remediation[remediationKey] ? section.remediation[remediationKey] : null;
                const isHandled = !!remediation;
                if (section.remediation) {
                  console.log('DEBUG: Render remediation keys:', Object.keys(section.remediation), 'pt:', pt, 'trim:', remediationKey, 'found:', !!remediation);
                }
                return (
                  <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, flexWrap: 'wrap' }}>
                    <Ionicons name={isHandled ? "checkmark-circle" : "alert-circle"} size={18} color={isHandled ? "#388E3C" : "#D32F2F"} style={{ marginRight: 6 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.bodyText, { color: isHandled ? '#1976D2' : '#D32F2F', flexWrap: 'wrap' }]}>{pt}</Text>
                      {isHandled && remediation && (
                        <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                          Åtgärdad {remediation.date ? remediation.date.slice(0, 10) : ''} av {remediation.name || ''}
                        </Text>
                      )}
                    </View>
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      )}


      {(() => {
        // Gruppera avvikelser per sektion
        const grouped = {};
        checklistSections.forEach(section => {
          if (section.deviation && section.deviation.length > 0) {
            if (!grouped[section.label]) grouped[section.label] = [];
            section.deviation.forEach((pt) => {
              grouped[section.label].push({
                pt,
                remediation: section.remediation && section.remediation[pt] ? section.remediation[pt] : null
              });
            });
          }
        });
        const sectionLabels = Object.keys(grouped);
        if (sectionLabels.length === 0) return null;
        // Visa åtgärdsknapp endast för Skyddsrond
        const isSkyddsrond = type === 'Skyddsrond';
        return (
          <>
            <View style={styles.divider} />
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Avvikelser/risker:</Text>
              {sectionLabels.map((label, idx) => (
                <View key={label} style={{ marginBottom: 4 }}>
                  <Text style={{ fontWeight: '600', color: '#444', marginBottom: 2 }}>{label}:</Text>
                  {grouped[label].map((item, i) => {
                    const { pt, remediation } = item;
                    const isHandled = !!remediation;
                    return (
                      <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 2, flexWrap: 'wrap', marginLeft: 12 }}>
                        <Ionicons name={isHandled ? "checkmark-circle" : "alert-circle"} size={18} color={isHandled ? "#388E3C" : "#D32F2F"} style={{ marginRight: 6, marginTop: 2 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.bodyText, { color: isHandled ? '#222' : '#D32F2F', flexWrap: 'wrap' }]}>{pt}</Text>
                          {isHandled && remediation && (
                            <Text style={{ fontSize: 12, color: '#888', marginTop: 2 }}>
                              Åtgärdad {remediation.date ? remediation.date.slice(0, 10) : ''} av {remediation.name || ''}
                            </Text>
                          )}
                        </View>
                        {isSkyddsrond && (
                          isHandled ? (
                            <TouchableOpacity
                              style={{ marginLeft: 8, backgroundColor: '#FFC107', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10, flexDirection: 'row', alignItems: 'center' }}
                              onPress={() => setActionModal({ visible: true, section: label, point: pt, img: remediation.img, comment: remediation.comment, signature: remediation.signature, name: remediation.name, date: remediation.date, infoMode: true })}
                            >
                              <Ionicons name="information-circle-outline" size={16} color="#222" style={{ marginRight: 4 }} />
                              <Text style={{ color: '#222', fontSize: 13 }}>Info</Text>
                            </TouchableOpacity>
                          ) : (
                            <TouchableOpacity
                              style={{ marginLeft: 8, backgroundColor: '#1976D2', borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 }}
                              onPress={() => setActionModal({ visible: true, section: label, point: pt, img: null, comment: '', signature: '', name: '', infoMode: false })}
                            >
                              <Text style={{ color: '#fff', fontSize: 13 }}>Åtgärda</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                    );
                  })}
                </View>
              ))}
            </View>
            <View style={styles.divider} />

            {/* Modal för åtgärd */}
            <Modal
              visible={actionModal.visible}
              transparent
              animationType="slide"
              onRequestClose={() => setActionModal(a => ({ ...a, visible: false, /* INGEN SPARLOGIK HÄR */ }))}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 14, padding: 22, width: 320, alignItems: 'center' }}>
                  {/* X-stäng uppe till höger */}
                  <TouchableOpacity
                    style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                    onPress={() => setActionModal(a => ({ ...a, visible: false, /* INGEN SPARLOGIK HÄR */ }))}
                  >
                    <Ionicons name="close" size={26} color="#222" />
                  </TouchableOpacity>
                  {actionModal.infoMode ? (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 10 }}>Åtgärdsinfo</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 8, textAlign: 'center' }}>{actionModal.section}: {actionModal.point}</Text>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Beskrivning:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.comment}</Text>
                      {actionModal.img && (
                        <Image source={{ uri: actionModal.img }} style={{ width: 120, height: 90, borderRadius: 8, marginBottom: 10 }} />
                      )}
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Namn:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.name}</Text>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Signatur:</Text>
                      {actionModal.signature ? (
                        <Image source={{ uri: actionModal.signature }} style={{ width: 80, height: 32, backgroundColor: '#fff', borderRadius: 4, marginBottom: 10 }} />
                      ) : (
                        <Text style={{ color: '#888', fontSize: 15, marginBottom: 10 }}>Ingen signatur</Text>
                      )}
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Åtgärdat datum:</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 10 }}>{actionModal.date ? actionModal.date.slice(0, 10) : '-'}</Text>
                    </>
                  ) : (
                    <>
                      <Text style={{ fontWeight: 'bold', fontSize: 18, marginBottom: 6 }}>Åtgärda brist</Text>
                      <Text style={{ fontSize: 15, color: '#222', marginBottom: 4, textAlign: 'center' }}>{actionModal.section}: {actionModal.point}</Text>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>Datum:</Text>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, backgroundColor: '#f3f3f3', marginBottom: 2 }}
                          onLongPress={() => {
                            Alert.prompt(
                              'Ändra datum',
                              'Skriv nytt datum (YYYY-MM-DD)',
                              [
                                {
                                  text: 'Avbryt',
                                  style: 'cancel',
                                },
                                {
                                  text: 'OK',
                                  onPress: (newDate) => {
                                    if (!/^\d{4}-\d{2}-\d{2}$/.test(newDate)) {
                                      Alert.alert('Fel', 'Datumet måste vara på formatet YYYY-MM-DD');
                                      return;
                                    }
                                    const today = new Date().toISOString().slice(0, 10);
                                    if (newDate > today) {
                                      Alert.alert('Fel', 'Du kan inte välja ett datum i framtiden.');
                                      return;
                                    }
                                    setActionModal(a => ({ ...a, date: newDate }));
                                  },
                                },
                              ],
                              'plain-text',
                              actionModal.date || new Date().toISOString().slice(0, 10)
                            );
                          }}
                        >
                          <Text style={{ fontSize: 15, color: '#888' }}>{actionModal.date || new Date().toISOString().slice(0, 10)}</Text>
                        </TouchableOpacity>
                        <Text style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>Håll inne för att ändra datum</Text>
                      </View>
                      <Text style={{ fontSize: 14, color: '#555', marginBottom: 6 }}>Beskriv åtgärd:</Text>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <TextInput
                          value={actionModal.comment}
                          onChangeText={t => setActionModal(a => ({ ...a, comment: t }))}
                          placeholder="Beskriv vad som åtgärdats..."
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, fontSize: 15, minHeight: 40, backgroundColor: '#fafbfc' }}
                          multiline
                          placeholderTextColor="#aaa"
                        />
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <TouchableOpacity
                          style={{ backgroundColor: '#1976D2', borderRadius: 50, padding: 10, marginRight: 10 }}
                          onPress={async () => {
                                                                                Alert.alert('DEBUG', `project.id: ${project?.id}\nproject: ${JSON.stringify(project)}\nAsyncStorage-key: project_${project?.id}`);
                                                                                console.log('DEBUG: project.id', project?.id, 'project:', project, 'AsyncStorage-key:', `project_${project?.id}`);
                                                      Alert.alert('DEBUG', 'Spara-knappen trycktes');
                                                      console.log('DEBUG: Spara-knappen trycktes', actionModal, control, project);
                            // Välj/tar foto
                            const result = await ImagePicker.launchCameraAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 0.7 });
                            if (!result.canceled && result.assets && result.assets.length > 0) {
                              setActionModal(a => ({ ...a, img: result.assets[0].uri }));
                            }
                          }}
                        >
                          <Ionicons name="camera" size={24} color="#fff" />
                        </TouchableOpacity>
                        {actionModal.img && (
                          <Image source={{ uri: actionModal.img }} style={{ width: 60, height: 45, borderRadius: 8 }} />
                        )}
                      </View>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Namn på åtgärdande person:</Text>
                        <TextInput
                          value={actionModal.name}
                          onChangeText={t => setActionModal(a => ({ ...a, name: t }))}
                          placeholder="Namn..."
                          style={{ borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, fontSize: 15, backgroundColor: '#fafbfc' }}
                          placeholderTextColor="#aaa"
                        />
                      </View>
                      <View style={{ width: '100%', marginBottom: 10 }}>
                        <Text style={{ fontSize: 14, color: '#555', marginBottom: 4 }}>Signatur:</Text>
                        <TouchableOpacity
                          style={{ flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#bbb', borderRadius: 6, padding: 8, backgroundColor: '#fafbfc', minHeight: 44 }}
                          onPress={() => setActionModal(a => ({ ...a, showSignatureModal: true }))}
                        >
                          {actionModal.signature ? (
                            <Image source={{ uri: actionModal.signature }} style={{ width: 80, height: 32, backgroundColor: '#fff', borderRadius: 4 }} />
                          ) : (
                            <>
                              <Ionicons name="pencil" size={20} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={{ color: '#888', fontSize: 15 }}>Tryck för signatur</Text>
                            </>
                          )}
                        </TouchableOpacity>
                        <SignatureModal
                          visible={!!actionModal.showSignatureModal}
                          onOK={uri => setActionModal(a => ({ ...a, signature: uri, showSignatureModal: false }))}
                          onCancel={() => setActionModal(a => ({ ...a, showSignatureModal: false }))}
                        />
                      </View>
                      <TouchableOpacity
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          justifyContent: 'center',
                          minHeight: 40,
                          paddingVertical: 8,
                          marginTop: 18,
                          backgroundColor: (actionModal.comment && actionModal.name && actionModal.signature) ? '#1976D2' : '#e0e0e0',
                          borderRadius: 8,
                          shadowColor: '#1976D2',
                          shadowOffset: { width: 0, height: 2 },
                          shadowOpacity: 0.10,
                          shadowRadius: 4,
                        }}
                        onPress={async () => {
                          if (!(actionModal.comment && actionModal.name && actionModal.signature)) {
                            // Visa alert med saknade fält
                            const missing = [];
                            if (!actionModal.comment) missing.push('Beskriv åtgärd');
                            if (!actionModal.name) missing.push('Namn');
                            if (!actionModal.signature) missing.push('Signatur');
                            Alert.alert('Saknas', 'Följande fält måste fyllas i: ' + missing.join(', '));
                            return;
                          }
                          // Immutabel kopia av checklistan och kontrollen
                          let newChecklist = Array.isArray(control.checklist) ? control.checklist.map(s => ({ ...s, remediation: { ...(s.remediation || {}) } })) : [];
                          const sectionIdx = newChecklist.findIndex(s => s.label === actionModal.section);
                          if (sectionIdx !== -1) {
                            // Hitta exakt rätt punkttext (pt) i sektionen, trimma för säker matchning
                                              const pt = (newChecklist[sectionIdx].points || []).find(p => p.trim() === actionModal.point.trim());
                                              const remediationKey = (pt || actionModal.point).trim();
                                              newChecklist[sectionIdx].remediation[remediationKey] = {
                                                comment: actionModal.comment,
                                                img: actionModal.img,
                                                signature: actionModal.signature,
                                                name: actionModal.name,
                                                date: new Date().toISOString(),
                                              };
                          } else {
                            Alert.alert('DEBUG', 'Kunde inte hitta sektionen: ' + actionModal.section);
                            console.log('DEBUG: Sektion ej hittad', actionModal.section, newChecklist);
                          }
                          const updatedControl = { ...control, checklist: newChecklist };
                          // Spara till AsyncStorage (uppdatera kontrollen i projektet)
                          let saveSuccess = false;
                          try {
                            const projectKey = `project_${project.id}`;
                            let raw = await AsyncStorage.getItem(projectKey);
                            let proj = raw ? JSON.parse(raw) : null;
                            if (!proj) {
                              // Skapa projektet om det saknas
                              proj = { ...project, controls: [] };
                              await AsyncStorage.setItem(projectKey, JSON.stringify(proj));
                              raw = await AsyncStorage.getItem(projectKey);
                              proj = raw ? JSON.parse(raw) : null;
                              Alert.alert('DEBUG', 'Projektet saknades och skapades!');
                              console.log('DEBUG: Skapade nytt projekt i AsyncStorage', projectKey, proj);
                            }
                            if (proj && Array.isArray(proj.controls)) {
                              let idx = proj.controls.findIndex(c => c.id === control.id);
                              if (idx !== -1) {
                                proj.controls[idx] = updatedControl;
                              } else {
                                // Lägg till kontrollen om den saknas
                                proj.controls.push(updatedControl);
                                Alert.alert('DEBUG', 'Kontrollen saknades och lades till!');
                                console.log('DEBUG: Lade till kontroll i projekt', updatedControl);
                              }
                              await AsyncStorage.setItem(projectKey, JSON.stringify(proj));
                              saveSuccess = true;
                              Alert.alert('DEBUG', 'Sparat kontrollen!');
                              console.log('DEBUG: Kontroll sparad', updatedControl);
                            } else {
                              Alert.alert('DEBUG', 'Projekt eller controls-array saknas även efter försök att skapa!');
                              console.log('DEBUG: Projekt eller controls-array saknas', proj);
                            }
                          } catch (e) {
                            saveSuccess = false;
                            Alert.alert('DEBUG', 'Fel vid sparande: ' + e.message);
                            console.log('DEBUG: Fel vid sparande', e);
                          }
                          // Uppdatera checklistSections så att UI reflekterar ändringen direkt
                          if (Array.isArray(updatedControl.checklist)) {
                            const updatedSections = updatedControl.checklist.map(s => ({
                              ...s,
                              remediation: s.remediation || {},
                              approved: Array.isArray(s.approved) ? s.approved : [],
                              deviation: Array.isArray(s.deviation) ? s.deviation : [],
                            }));
                            setChecklistSections(updatedSections);
                          }
                          setActionModal(a => ({ ...a, visible: false }));
                          setForceUpdate(f => f + 1); // tvinga omrendering
                          // Navigera alltid tillbaka till projektet
                          if (saveSuccess) {
                                // Uppdatera checklistSections så att UI reflekterar ändringen direkt
                                if (Array.isArray(updatedControl.checklist)) {
                                  const updatedSections = updatedControl.checklist.map(s => ({
                                    ...s,
                                    remediation: s.remediation || {},
                                    approved: Array.isArray(s.approved) ? s.approved : [],
                                    deviation: Array.isArray(s.deviation) ? s.deviation : [],
                                  }));
                                  setChecklistSections(updatedSections);
                                }
                                setActionModal(a => ({ ...a, visible: false }));
                                setForceUpdate(f => f + 1); // tvinga omrendering
                                // Navigera alltid tillbaka till projektet
                                if (saveSuccess) {
                                  Alert.alert('Åtgärd sparad', 'Din åtgärd har sparats.', [
                                    { text: 'OK', onPress: () => navigation.navigate('ProjectDetails', { project }) }
                                  ]);
                                } else {
                                  Alert.alert('Fel', 'Kunde inte spara åtgärden. Försök igen.');
                                }
                            Alert.alert('Åtgärd sparad', 'Din åtgärd har sparats.', [
                              { text: 'OK', onPress: () => navigation.navigate('ProjectDetails', { project }) }
                            ]);
                          } else {
                            Alert.alert('Fel', 'Kunde inte spara åtgärden. Försök igen.');
                          }
                        }}
                      >
                        <Ionicons name="save-outline" size={22} color={(actionModal.comment && actionModal.name && actionModal.signature) ? '#fff' : '#888'} style={{ marginRight: 8 }} />
                        <Text style={{
                          color: (actionModal.comment && actionModal.name && actionModal.signature) ? '#fff' : '#888',
                          fontWeight: 'bold',
                          fontSize: 17,
                          letterSpacing: 0.5,
                          textAlign: 'center',
                        }}>Spara</Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              </View>
            </Modal>
          </>
        );
      })()}

      {/* Åtgärder vidtagna (om finns) tas bort, endast en rad ska visas */}

      {/* Signaturer */}
      {mottagningsSignatures.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Signaturer</Text>
          {mottagningsSignatures.map((s, i) => (
            <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
              <Ionicons name="pencil" size={18} color="#1976D2" style={{ marginRight: 6 }} />
              <Text style={styles.bodyText}>{s.name || 'Signerad'}</Text>
            </View>
          ))}
        </View>
      )}
      {mottagningsSignatures.length > 0 && <View style={styles.divider} />}

      {/* Bifogade bilder */}
      {mottagningsPhotos.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bifogade bilder</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {mottagningsPhotos.map((img, idx) => {
              const uri = img.uri || img;
              return (
                <TouchableOpacity
                  key={idx}
                  style={{ marginRight: 8 }}
                  onPress={() => {
                    setSelectedPhoto(uri);
                    setPhotoModalVisible(true);
                  }}
                  accessibilityLabel="Visa bild i stor vy"
                >
                  <Image source={{ uri }} style={{ width: 84, height: 84, borderRadius: 8, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#eee' }} />
                  {img.comment ? (
                    <View style={{ position: 'absolute', left: 6, right: 6, bottom: 6, backgroundColor: 'rgba(0,0,0,0.45)', paddingVertical: 2, paddingHorizontal: 6, borderRadius: 6 }}>
                      <Text numberOfLines={1} style={{ color: '#fff', fontSize: 12 }}>{img.comment}</Text>
                    </View>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <Modal
            visible={photoModalVisible}
            transparent={true}
            animationType="fade"
            onRequestClose={() => setPhotoModalVisible(false)}
          >
            <Pressable style={styles.modalOverlay} onPress={() => setPhotoModalVisible(false)}>
              <View style={styles.modalContent}>
                {selectedPhoto && (
                  <Image
                    source={{ uri: selectedPhoto }}
                    style={{ width: '100%', height: 350, borderRadius: 12, resizeMode: 'contain', backgroundColor: '#000' }}
                  />
                )}
                <Text style={{ color: '#fff', marginTop: 12, textAlign: 'center' }}>Tryck utanför bilden för att stänga</Text>
              </View>
            </Pressable>
          </Modal>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  divider: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
    width: '100%',
  },
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: PRIMARY, marginBottom: 8 },
  subInfo: { fontSize: 14, color: '#666', marginBottom: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginBottom: 8 },
  bodyText: { fontSize: 15, color: '#222' },
  noteText: { fontSize: 13, color: '#444', marginTop: 2 },
});
