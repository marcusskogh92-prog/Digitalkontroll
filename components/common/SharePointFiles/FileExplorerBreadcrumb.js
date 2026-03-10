/**
 * FileExplorerBreadcrumb – Golden rule breadcrumb för Utforskaren.
 * Start > Projekt 1010-09 > Förfrågningsunderlag > Kalkyl
 * Chevron separators, hover underline, aktiv nivå mörkare.
 */

import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

export default function FileExplorerBreadcrumb({
  parts = [],
  onNavigate,
  activePath,
  style,
}) {
  return (
    <View style={[styles.root, style]}>
      {parts.map((part, idx) => {
        const isLast = idx === parts.length - 1;
        const isActive = String(activePath || '') === String(part.relativePath || '');
        const canNavigate = !isLast || !isActive;

        return (
          <View key={`${idx}-${part.label}`} style={styles.segment}>
            {idx > 0 ? (
              <Ionicons
                name="chevron-forward"
                size={12}
                color="#94a3b8"
                style={styles.separator}
              />
            ) : null}
            <Pressable
              onPress={() => canNavigate && onNavigate?.(part.relativePath, idx)}
              style={(state) => {
                const h = (state && state.hovered) === true;
                const p = (state && state.pressed) === true;
                return [
                  styles.crumb,
                  isActive && styles.crumbActive,
                  (h || p) && canNavigate && styles.crumbHover,
                ];
              }}
              {...(Platform.OS === 'web' ? { cursor: canNavigate ? 'pointer' : 'default' } : {})}
            >
              {(state) => {
                const h = (state && state.hovered) === true;
                const p = (state && state.pressed) === true;
                const showHover = (h || p) && canNavigate;
                return (
                  <Text
                    style={[
                      styles.crumbText,
                      isActive && styles.crumbTextActive,
                      showHover && styles.crumbTextHover,
                    ]}
                    numberOfLines={1}
                  >
                    {part.label || '…'}
                  </Text>
                );
              }}
            </Pressable>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 0,
  },
  segment: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  separator: {
    marginHorizontal: 4,
    opacity: 0.8,
  },
  crumb: {
    paddingVertical: 2,
    paddingHorizontal: 4,
    borderRadius: 6,
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease' } : {}),
  },
  crumbHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  crumbActive: {
    backgroundColor: 'transparent',
  },
  crumbText: {
    fontSize: 13,
    fontWeight: '400',
    color: '#94a3b8',
    ...(Platform.OS === 'web' ? { textDecorationLine: 'none', transition: 'color 150ms ease' } : {}),
  },
  crumbTextActive: {
    color: '#334155',
    fontWeight: '500',
  },
  crumbTextHover: {
    color: '#64748b',
    textDecorationLine: 'underline',
  },
});
