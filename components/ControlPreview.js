import { Image, StyleSheet, Text, View } from 'react-native';

export default function ControlPreview({ control = {}, project = {}, company = {} }) {
  const title = control.type || 'Mottagningskontroll';
  const date = control.date || '';
  const companyName = company.name || 'FÖRETAG AB';
  const logo = company.logoUrl ? { uri: company.logoUrl } : require('../assets/images/foretag_ab.png');

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <View style={styles.logoWrap}>
          <Image source={logo} style={styles.logo} resizeMode="contain" />
          <Text style={styles.company}>{companyName}</Text>
        </View>
        <View style={styles.metaWrap}>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.meta}>Datum: {date}</Text>
          <Text style={styles.meta}>Projekt: {project.id ? `${project.id} - ${project.name || ''}` : project.name || ''}</Text>
        </View>
      </View>
      <View style={styles.thinLine} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { padding: 12, backgroundColor: '#fff' },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  logoWrap: { flexDirection: 'column', alignItems: 'flex-start' },
  logo: { height: 48, width: 140, marginBottom: 6 },
  company: { fontWeight: '700', color: '#263238' },
  metaWrap: { alignItems: 'flex-end' },
  title: { fontSize: 20, fontWeight: '800', color: '#263238' },
  meta: { color: '#666', marginTop: 4 },
  thinLine: { height: 2, backgroundColor: '#000', marginTop: 10 },
});
