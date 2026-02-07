import { Ionicons } from '@expo/vector-icons';
import { Platform, Text, View } from 'react-native';

export default function FFUAISummaryView({ projectId }) {
  const pid = projectId ? String(projectId) : '';

  return (
    <View style={{ flex: 1, padding: 18 }}>
      <View style={{ maxWidth: 980 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <Ionicons name="sparkles-outline" size={22} color="#1976D2" style={{ marginRight: 10 }} />
          <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>
            AI-sammanställning – Förfrågningsunderlag
          </Text>
        </View>

        <Text style={{ fontSize: 15, color: '#333', lineHeight: 22 }}>
          Här visas AI-analys baserad på innehållet i förfrågningsunderlaget.
        </Text>

        <View style={{ marginTop: 16, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: '#e6e6e6', backgroundColor: '#fff' }}>
          <Text style={{ fontSize: 13, color: '#666', lineHeight: 18 }}>
            {pid ? `Projekt: ${pid}` : 'Projekt: —'}
          </Text>
          <Text style={{ marginTop: 10, fontSize: 14, color: '#444', lineHeight: 20 }}>
            Tomt läge. Ingen analys har körts ännu.
          </Text>
          {Platform.OS === 'web' ? (
            <Text style={{ marginTop: 8, fontSize: 12, color: '#888' }}>
              Denna vy är en systemvy (ingen SharePoint-mapp, inga filer).
            </Text>
          ) : null}
        </View>
      </View>
    </View>
  );
}
