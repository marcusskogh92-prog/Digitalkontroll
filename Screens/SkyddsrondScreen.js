import { StyleSheet, Text, View } from 'react-native';

// Props: projectNumber, projectName ska skickas in från parent eller context
const SkyddsrondScreen = ({ projectNumber, projectName }) => {
  // Hämta dagens datum
  const today = new Date();
  const dateString = today.toLocaleDateString('sv-SE');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>Skyddsrond</Text>
      <Text style={styles.label}>Datum: {dateString}</Text>
      <Text style={styles.label}>Projektnummer: {projectNumber}</Text>
      <Text style={styles.label}>Projektnamn: {projectName}</Text>
      {/* Beskrivning, deltagare, kontrollpunkter kommer här */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
});

export default SkyddsrondScreen;
