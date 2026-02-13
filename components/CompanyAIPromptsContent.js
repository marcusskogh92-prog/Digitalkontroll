/**
 * AI-analys-flik i Företagsinställningar: kategorier (Förfrågningsunderlag, Ritningar).
 * Klick öppnar AiPromptManagerDrawer – multi-prompt manager i slide-panel.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import AiPromptManagerDrawer from './aiPromptManager/AiPromptManagerDrawer';

const AI_PROMPT_TYPES = [
  { key: 'ffu', label: 'Förfrågningsunderlag', description: 'Extra instruktion till AI när den analyserar dokument i förfrågningsunderlaget. Hantera flera prompter per kategori.' },
  { key: 'ritningar', label: 'Ritningar', description: 'Extra instruktion till AI för ritningsanalys (kommer att användas när funktionen är aktiverad).' },
];

export default function CompanyAIPromptsContent({ companyId }) {
  const cid = String(companyId || '').trim();
  const [drawerVisible, setDrawerVisible] = useState(false);
  const [drawerCategory, setDrawerCategory] = useState('ffu');

  const openDrawer = (categoryKey) => {
    setDrawerCategory(categoryKey);
    setDrawerVisible(true);
  };

  if (!cid) {
    return (
      <View style={{ padding: 24 }}>
        <Text style={{ fontSize: 13, color: '#64748b' }}>Välj ett företag.</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minHeight: 0 }}>
      <Text style={{ fontSize: 13, color: '#64748b', marginBottom: 16, lineHeight: 20 }}>
        Företagets extra instruktioner till AI per analystyp. Sparas företagsbaserat. Hantera flera prompter per kategori genom att öppna en kategori nedan.
      </Text>

      {AI_PROMPT_TYPES.map(({ key, label, description }) => (
        <TouchableOpacity
          key={key}
          onPress={() => openDrawer(key)}
          activeOpacity={0.85}
          style={{
            backgroundColor: '#fff',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 12,
            padding: 16,
            marginBottom: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Ionicons name="document-text-outline" size={20} color="#475569" style={{ marginRight: 10 }} />
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#1e293b' }}>{label}</Text>
            </View>
            <Text style={{ fontSize: 13, color: '#64748b', lineHeight: 18 }}>{description}</Text>
          </View>
          <Ionicons name="chevron-forward" size={22} color="#94a3b8" />
        </TouchableOpacity>
      ))}

      <AiPromptManagerDrawer
        visible={drawerVisible}
        companyId={cid}
        categoryKey={drawerCategory}
        onClose={() => setDrawerVisible(false)}
      />
    </View>
  );
}
