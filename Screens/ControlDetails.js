
import { ScrollView, StyleSheet, Text, View } from 'react-native';

const PRIMARY = '#263238';

export default function ControlDetails({ route }) {
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
    description,
    participants = [],
    checklist = [],
    status,
    savedAt,
    attachments = []
  } = control;
  // Ensure arrays for robust rendering (extra safety)
  participants = Array.isArray(participants) ? participants : [];
  checklist = Array.isArray(checklist) ? checklist : [];
  attachments = Array.isArray(attachments) ? attachments : [];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>{type || 'Kontroll'}</Text>
      <Text style={styles.subInfo}>Datum: {date || '-'}</Text>
      {status && <Text style={styles.subInfo}>Status: {status}</Text>}
      {savedAt && <Text style={styles.subInfo}>Sparad: {new Date(savedAt).toLocaleString('sv-SE')}</Text>}
      {description && <Text style={styles.bodyText}>Beskrivning: {description}</Text>}

      {/* Deltagare */}
      {participants.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Deltagare</Text>
          {participants.map((p, i) => (
            <Text key={i} style={styles.bodyText}>{p.name}{p.company ? `, ${p.company}` : ''}{p.role ? `, ${p.role}` : ''}</Text>
          ))}
        </View>
      )}

      {/* Checklista */}
      {checklist.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Checklista</Text>
          {checklist.map((item, i) => (
            <View key={i} style={{ marginBottom: 8 }}>
              <Text style={[styles.bodyText, { fontWeight: 'bold' }]}>{item.label || `Punkt ${i + 1}`}</Text>
              {item.questions && item.questions.map((q, qi) => (
                <Text key={qi} style={styles.bodyText}>- {q} {item.answers && item.answers[qi] ? `: ${item.answers[qi]}` : ''}</Text>
              ))}
              {item.note && <Text style={styles.noteText}>Notering: {item.note}</Text>}
            </View>
          ))}
        </View>
      )}

      {/* Bilagor */}
      {attachments.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Bilagor</Text>
          {attachments.map((a, i) => (
            <Text key={i} style={styles.bodyText}>{a.filename || a.uri || 'Bilaga'}</Text>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', padding: 16 },
  title: { fontSize: 22, fontWeight: 'bold', color: PRIMARY, marginBottom: 8 },
  subInfo: { fontSize: 14, color: '#666', marginBottom: 2 },
  section: { marginTop: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: PRIMARY, marginBottom: 8 },
  bodyText: { fontSize: 15, color: '#222' },
  noteText: { fontSize: 13, color: '#444', marginTop: 2 },
});
