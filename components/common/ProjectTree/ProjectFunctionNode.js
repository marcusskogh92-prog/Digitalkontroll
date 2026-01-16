/**
 * ProjectFunctionNode - Renders a function under a project
 */

import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

export default function ProjectFunctionNode({
  functionItem,
  project,
  onSelect,
}) {
  return (
    <TouchableOpacity
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 8,
        backgroundColor: '#f8f9fa',
        borderRadius: 6,
        marginVertical: 2,
      }}
      onPress={onSelect}
      activeOpacity={0.7}
    >
      <Ionicons
        name={functionItem.icon || 'document-outline'}
        size={16}
        color="#666"
        style={{ marginRight: 8 }}
      />
      <Text
        style={{
          fontSize: 14,
          color: '#444',
          flexShrink: 1
        }}
      >
        {functionItem.name}
      </Text>
    </TouchableOpacity>
  );
}
