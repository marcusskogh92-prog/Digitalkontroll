/**
 * Visar pågående bakgrundsaktiviteter (t.ex. Raderar projekt, AI-analys).
 * Fixerad i nedre högra hörnet, icke-blockerande.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { ActivityIndicator, Platform, Text, View } from 'react-native';
import { useBackgroundTasks } from '../../contexts/BackgroundTasksContext';

const WRAPPER = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 9998,
  maxWidth: 320,
  borderRadius: 10,
  backgroundColor: 'rgba(15, 23, 42, 0.94)',
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.2,
  shadowRadius: 8,
  elevation: 8,
  paddingVertical: 10,
  paddingHorizontal: 14,
};

const ROW = {
  flexDirection: 'row',
  alignItems: 'center',
  paddingVertical: 6,
  paddingHorizontal: 4,
};

const LABEL = {
  color: '#f1f5f9',
  fontSize: 13,
  fontWeight: '500',
  marginLeft: 10,
  flex: 1,
};

const DETAIL = {
  color: '#94a3b8',
  fontSize: 12,
  marginLeft: 10,
  marginTop: 2,
};

export function BackgroundTasksIndicator() {
  const { tasks } = useBackgroundTasks();

  if (!tasks || tasks.length === 0) return null;

  return (
    <View
      style={[
        WRAPPER,
        Platform.OS !== 'web' && {
          position: 'absolute',
          bottom: 16,
          right: 16,
        },
      ]}
      pointerEvents="none"
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4, paddingHorizontal: 4 }}>
        <Ionicons name="sync" size={14} color="#94a3b8" />
        <Text style={{ color: '#94a3b8', fontSize: 11, marginLeft: 6, fontWeight: '600' }}>
          Bakgrundsaktivitet
        </Text>
      </View>
      {tasks.map((t) => (
        <View key={t.id} style={ROW}>
          <ActivityIndicator size="small" color="#e2e8f0" />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={LABEL} numberOfLines={1}>
              {t.label}
            </Text>
            {t.detail ? (
              <Text style={DETAIL} numberOfLines={1}>
                {t.detail}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

export default BackgroundTasksIndicator;
