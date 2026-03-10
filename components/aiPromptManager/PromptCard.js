/**
 * En prompt-rad i listan: aktiv-toggle, namn, taggar, senast ändrad, kebab-meny.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Platform, Switch, Text, TouchableOpacity, View } from 'react-native';

function formatDate(d) {
  if (!d) return '–';
  if (typeof d.toLocaleDateString === 'function') {
    return d.toLocaleDateString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  }
  return String(d);
}

export default function PromptCard({ template, onToggleActive, onOpenKebab }) {
  const isActive = template.active !== false;
  const isDefault = template.isDefault === true;
  const tags = [...(template.tags || []), ...(isDefault ? ['Standard'] : [])];
  if ((template.systemPrompt || template.userTemplate || '').includes('JSON')) {
    if (!tags.includes('JSON')) tags.push('JSON');
  }

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 14,
        borderBottomWidth: 1,
        borderBottomColor: '#f1f5f9',
        backgroundColor: isActive ? '#fff' : '#f8fafc',
        borderLeftWidth: 4,
        borderLeftColor: isDefault && isActive ? '#2563eb' : 'transparent',
        opacity: isActive ? 1 : 0.75,
        gap: 12,
      }}
    >
      <View style={{ paddingVertical: 4 }}>
        <Switch
          value={isActive}
          onValueChange={() => onToggleActive(template)}
          trackColor={{ false: '#e2e8f0', true: '#93c5fd' }}
          thumbColor="#fff"
        />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#1e293b' }} numberOfLines={1}>
          {template.name || 'Namnlös'}
        </Text>
        {tags.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {tags.map((t) => (
              <View
                key={t}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 6,
                  backgroundColor: t === 'Standard' ? '#dbeafe' : '#f1f5f9',
                }}
              >
                <Text style={{ fontSize: 11, fontWeight: '500', color: t === 'Standard' ? '#1d4ed8' : '#475569' }}>{t}</Text>
              </View>
            ))}
          </View>
        ) : null}
        <Text style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>Senast ändrad: {formatDate(template.updatedAt)}</Text>
      </View>
      <TouchableOpacity
        onPress={(e) => {
          const ev = e?.nativeEvent;
          const pageX = ev?.pageX ?? 0;
          const pageY = ev?.pageY ?? 0;
          onOpenKebab(template, pageX, pageY);
        }}
        style={{ padding: 8 }}
        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
      >
        <Ionicons name="ellipsis-vertical" size={20} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
}
