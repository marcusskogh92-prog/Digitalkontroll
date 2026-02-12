/**
 * Minimal topbar (2026 SaaS layout). Vit bakgrund, 56–64px, endast sidtitel + snabbåtgärd.
 * Ingen navigation, ingen färgad bakgrund.
 */

import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LAYOUT_2026 } from '../../constants/iconRailTheme';
import { LEFT_NAV } from '../../constants/leftNavTheme';

const TOPBAR_HEIGHT = 60;
const GRID = 8;

const styles = StyleSheet.create({
  bar: {
    height: TOPBAR_HEIGHT,
    minHeight: TOPBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID * 2,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: LAYOUT_2026.dividerColor,
    flexShrink: 0,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: GRID,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: GRID,
    paddingHorizontal: GRID * 2,
    borderRadius: 8,
    backgroundColor: LEFT_NAV.accent,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  primaryButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  iconButton: {
    paddingVertical: GRID,
    paddingHorizontal: GRID,
    borderRadius: 8,
    marginRight: 4,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  iconButtonActive: {
    backgroundColor: 'rgba(37, 99, 235, 0.12)',
  },
  panelToggleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 4,
  },
  chevronButton: {
    marginRight: 0,
    paddingHorizontal: 6,
  },
});

/**
 * @param {string} [pageTitle] - Sidtitel / projektnamn
 * @param {Function} [onCreateProject] - Klick på + Skapa projekt (döljs på dashboard om showRightPanelToggle)
 * @param {boolean} [showRightPanelToggle] - Visa chevron + kalender för högerpanel (dashboard)
 * @param {boolean} [rightPanelOpen] - Är högerpanelen öppen
 * @param {Function} [onRightPanelToggle] - Klick på panel-toggle
 * @param {boolean} [showCreateProject] - Visa "+ Skapa projekt"-knappen (false på dashboard)
 */
export function MinimalTopbar({
  pageTitle = 'Startsida',
  onCreateProject,
  showRightPanelToggle = false,
  rightPanelOpen = false,
  onRightPanelToggle,
  showCreateProject = true,
}) {
  return (
    <View style={styles.bar}>
      <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
        {pageTitle || 'Startsida'}
      </Text>
      <View style={styles.actions}>
        {showRightPanelToggle && typeof onRightPanelToggle === 'function' && (
          <View style={styles.panelToggleWrap}>
            <TouchableOpacity
              onPress={onRightPanelToggle}
              style={[styles.iconButton, styles.chevronButton]}
              accessibilityLabel={rightPanelOpen ? 'Stäng kalender' : 'Öppna kalender'}
              accessibilityRole="button"
              activeOpacity={0.8}
            >
              <Ionicons
                name={rightPanelOpen ? 'chevron-forward' : 'chevron-back'}
                size={14}
                color={rightPanelOpen ? LEFT_NAV.accent : '#64748b'}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onRightPanelToggle}
              style={[styles.iconButton, rightPanelOpen && styles.iconButtonActive]}
              accessibilityLabel={rightPanelOpen ? 'Stäng kalender' : 'Öppna kalender'}
              accessibilityRole="button"
              activeOpacity={0.8}
            >
              <Ionicons
                name="calendar-outline"
                size={22}
                color={rightPanelOpen ? LEFT_NAV.accent : '#64748b'}
              />
            </TouchableOpacity>
          </View>
        )}
        {showCreateProject && typeof onCreateProject === 'function' && (
          <TouchableOpacity
            onPress={onCreateProject}
            style={styles.primaryButton}
            accessibilityLabel="Skapa nytt projekt"
            activeOpacity={0.85}
          >
            <Ionicons name="add" size={20} color="#fff" />
            <Text style={styles.primaryButtonText}>Skapa projekt</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

export const MINIMAL_TOPBAR_HEIGHT = TOPBAR_HEIGHT;
