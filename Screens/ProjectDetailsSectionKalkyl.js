import React from 'react';
import { View, Text } from 'react-native';

export default function ProjectDetailsSectionKalkyl({ activeSection }) {
  if (activeSection !== 'kalkyl') return null;
  return (
    <View style={{ padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 16, color: '#222' }}>
        Kalkyl
      </Text>
      <Text style={{ color: '#666', fontSize: 14 }}>
        Kalkyl-funktionalitet kommer snart...
      </Text>
    </View>
  );
}
