/**
 * FragaSvarView
 * (Översikt 04) – placeholder for now.
 */

import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, Text, View } from 'react-native';

export default function FragaSvarView() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#fff' }} contentContainerStyle={{ padding: 18 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
        <Ionicons name="help-circle-outline" size={22} color="#1976D2" style={{ marginRight: 10 }} />
        <Text style={{ fontSize: 22, fontWeight: '800', color: '#111' }}>Frågor & svar</Text>
      </View>
      <Text style={{ fontSize: 14, color: '#475569', marginBottom: 18 }}>
        Här kommer vi lägga in beslut, frågor och svar kopplade till kalkylen.
      </Text>

      <View
        style={{
          borderWidth: 1,
          borderColor: '#E6E8EC',
          borderRadius: 12,
          padding: 14,
          backgroundColor: '#F8FAFC',
          ...(Platform.OS === 'web' ? { boxShadow: '0 2px 10px rgba(0,0,0,0.06)' } : {}),
        }}
      >
        <Text style={{ fontSize: 14, color: '#111', fontWeight: '700', marginBottom: 6 }}>
          Nästa steg
        </Text>
        <Text style={{ fontSize: 13, color: '#475569', lineHeight: 18 }}>
          - Skapa lista av frågor
          {'\n'}- Status per fråga (öppen/besvarad)
          {'\n'}- Koppla till filer i SharePoint
        </Text>
      </View>
    </ScrollView>
  );
}
