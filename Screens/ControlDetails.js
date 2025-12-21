

import Ionicons from '@expo/vector-icons/Ionicons';
import { useNavigation } from '@react-navigation/native';
import { useState } from 'react';
import { Image, Modal, Pressable, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

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
  const checklistSections = (checklist || []).map((section) => {
    if (!section || !Array.isArray(section.points)) return null;
    const approved = [];
    const deviation = [];
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
      {weather && (
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
      {weather && <View style={styles.divider} />}

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
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Ionicons name="checkmark-circle" size={18} color="#388E3C" style={{ marginRight: 6 }} />
                  <Text style={styles.bodyText}>{pt}</Text>
                </View>
              ))}
              {section.deviation.map((pt, i) => (
                <View key={i} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                  <Ionicons name="alert-circle" size={18} color="#D32F2F" style={{ marginRight: 6 }} />
                  <Text style={[styles.bodyText, { color: '#D32F2F' }]}>{pt}</Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      )}
      {checklistSections.length > 0 && <View style={styles.divider} />}

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
