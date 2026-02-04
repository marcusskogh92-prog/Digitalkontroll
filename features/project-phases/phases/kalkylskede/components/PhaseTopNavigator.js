/**
 * Phase Top Navigator - Top navigation bar for section navigation
 * Note: Digitalkontroll no longer shows or uses progress/percent completion.
 */

import { Ionicons } from '@expo/vector-icons';
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { stripNumberPrefixForDisplay } from '../../../../../utils/labelUtils';

export default function PhaseTopNavigator({
  navigation,
  activeSection,
  onSelectSection
}) {
  if (!navigation || !navigation.sections) {
    return null;
  }

  const calcSortKey = (section) => {
    const numOrder = Number(section?.order);
    if (Number.isFinite(numOrder) && numOrder > 0) return numOrder;

    // Keep unknown/custom sections after known ones.
    return 10_000;
  };

  const sections = [...(navigation.sections || [])].sort((a, b) => {
    const ak = calcSortKey(a);
    const bk = calcSortKey(b);
    if (ak !== bk) return ak - bk;
    const an = String(a?.name || '');
    const bn = String(b?.name || '');
    return an.localeCompare(bn, undefined, { numeric: true, sensitivity: 'base' });
  });

  return (
    <View style={styles.container}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {sections.map(section => {
          const isActive = activeSection === section.id;

          return (
            <TouchableOpacity
              key={section.id}
              style={[styles.navButton, isActive && styles.navButtonActive]}
              onPress={() => {
                if (onSelectSection) {
                  onSelectSection(section.id);
                }
              }}
            >
              {/* Content */}
              <View style={styles.buttonContent}>
                <Ionicons
                  name={section.icon || 'folder-outline'}
                  size={18}
                  color={isActive ? '#1976D2' : '#666'}
                  style={styles.icon}
                />
                <Text style={[styles.buttonText, isActive && styles.buttonTextActive]}>
                  {stripNumberPrefixForDisplay(section.name)}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
    paddingVertical: 6
  },
  scrollContent: {
    paddingHorizontal: 10,
    gap: 6
  },
  navButton: {
    position: 'relative',
    minWidth: 118,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e7eb',
    overflow: 'hidden',
    ...(typeof Platform !== 'undefined' && Platform.OS === 'web' ? { cursor: 'pointer' } : {})
  },
  navButtonActive: {
    backgroundColor: '#EAF4FF',
    borderColor: '#1976D2',
    borderWidth: 2
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6
  },
  icon: {
    marginRight: 2
  },
  buttonText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#4b5563',
    flex: 1
  },
  buttonTextActive: {
    color: '#1976D2',
    fontWeight: '700'
  }
});
