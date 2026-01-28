/**
 * PhaseSelector - Komponent för att välja projektfas
 */

import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PROJECT_PHASES } from '../../features/projects/constants';

export default function PhaseSelector({ selectedPhase, onPhaseChange }) {
  return (
    <View style={styles.container}>
      <Text style={styles.label}>Välj fas:</Text>
      <View style={styles.phaseButtons}>
        {PROJECT_PHASES.map(phase => {
          const isSelected = selectedPhase === phase.key;
          return (
            <TouchableOpacity
              key={phase.key}
              onPress={() => onPhaseChange(phase.key)}
              style={[
                styles.phaseButton,
                isSelected && { 
                  backgroundColor: phase.color + '20',
                  borderColor: phase.color,
                  borderWidth: 2
                }
              ]}
              activeOpacity={0.7}
            >
              <View
                style={[
                  styles.phaseDot,
                  { backgroundColor: phase.color }
                ]}
              />
              <Ionicons
                name={phase.icon}
                size={18}
                color={phase.color}
                style={{ marginRight: 4 }}
              />
              <Text
                style={[
                  styles.phaseButtonText,
                  isSelected && { 
                    color: phase.color,
                    fontWeight: '700'
                  }
                ]}
              >
                {phase.name}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: 16,
    backgroundColor: '#fff',
    borderRadius: 12,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    color: '#222',
    marginBottom: 12,
  },
  phaseButtons: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  phaseButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#f5f5f5',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    marginRight: 8,
    marginBottom: 8,
  },
  phaseDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 6,
  },
  phaseButtonText: {
    fontSize: 15,
    color: '#222',
    fontWeight: '500',
  },
});
