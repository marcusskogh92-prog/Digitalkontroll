/**
 * Återanvändbar sektion för relationsfält (Kategorier, Byggdelar, Konton) i leverantörsformuläret.
 * Modern layout: rubrik + "+ Lägg till"-länk på samma rad, valda objekt som taggar med möjlighet att ta bort.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY_BLUE = '#2563eb';
const PRIMARY_BLUE_HOVER = '#1d4ed8';

export interface RelationItem {
  id: string;
  label: string;
}

export interface SupplierRelationSectionProps {
  title: string;
  items: RelationItem[];
  onAdd: () => void;
  onRemove: (id: string) => void;
  emptyMessage?: string;
}

const styles = StyleSheet.create({
  section: {
    marginBottom: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  title: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
  },
  addLink: {
    paddingVertical: 2,
    paddingHorizontal: 0,
  },
  addLinkText: {
    fontSize: 13,
    fontWeight: '500',
    color: PRIMARY_BLUE,
  },
  emptyHint: {
    fontSize: 12,
    color: '#9ca3af',
    marginTop: 2,
  },
  tagsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingLeft: 10,
    paddingRight: 4,
    borderRadius: 999,
    backgroundColor: '#f3f4f6',
    gap: 4,
  },
  tagText: {
    fontSize: 12,
    color: '#374151',
  },
  tagRemove: {
    padding: 2,
    borderRadius: 999,
  },
});

export default function SupplierRelationSection({
  title,
  items,
  onAdd,
  onRemove,
  emptyMessage = 'Inga valda ännu',
}: SupplierRelationSectionProps): React.ReactElement {
  const [hovered, setHovered] = useState(false);
  const AddTrigger = Platform.OS === 'web' ? View : TouchableOpacity;
  const addTriggerProps =
    Platform.OS === 'web'
      ? {
          onClick: onAdd,
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              onAdd();
            }
          },
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          style: [styles.addLink, { cursor: 'pointer' as const }],
          role: 'button' as const,
          tabIndex: 0,
        }
      : { onPress: onAdd, style: styles.addLink, activeOpacity: 0.7 };

  const addLinkTextStyle = [
    styles.addLinkText,
    Platform.OS === 'web' && hovered && { color: PRIMARY_BLUE_HOVER, textDecorationLine: 'underline' as const },
  ];

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <AddTrigger {...addTriggerProps}>
          <Text style={addLinkTextStyle}>+ Lägg till</Text>
        </AddTrigger>
      </View>
      {items.length === 0 ? (
        <Text style={styles.emptyHint}>{emptyMessage}</Text>
      ) : (
        <View style={styles.tagsWrap}>
          {items.map((item) => (
            <View key={item.id} style={styles.tag}>
              <Text style={styles.tagText} numberOfLines={1}>
                {item.label}
              </Text>
              <TouchableOpacity
                style={styles.tagRemove}
                onPress={() => onRemove(item.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' as const } : {})}
              >
                <Ionicons name="close" size={14} color="#6b7280" />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}
