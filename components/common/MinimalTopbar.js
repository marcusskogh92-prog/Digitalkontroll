/**
 * Minimal topbar (2026 SaaS layout). Samma rad som kalenderknappen.
 * Vid projekt: ikon + projektnummer – projektnamn, breadcrumb under. Annars sidtitel.
 */

import React from 'react';
import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LAYOUT_2026 } from '../../constants/iconRailTheme';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import { getProjectPhase } from '../../features/projects/constants';

const TOPBAR_HEIGHT = 60;
const TOPBAR_HEIGHT_WITH_BREADCRUMB = 72;
const GRID = 8;

function normalizeProjectLabel(project) {
  if (!project) return { number: '', name: '' };
  let number = String(project?.projectNumber || project?.number || '').trim();
  let name = String(project?.projectName || '').trim();
  const nameLike = String(project?.name || project?.fullName || '').trim();
  if (!number && nameLike) {
    const m = nameLike.match(/^([a-zA-Z]?[0-9]{2,}-[0-9]+)\s*(?:[-–—]\s*)?(.*)$/);
    if (m) {
      number = String(m[1] || '').trim();
      if (!name) name = String(m[2] || '').trim();
    }
  }
  if (!number && project?.id && /^[a-zA-Z]?[0-9]{2,}-[0-9]+$/.test(String(project.id).trim())) {
    number = String(project.id).trim();
  }
  if (!name) name = nameLike;
  return { number, name };
}

const styles = StyleSheet.create({
  bar: {
    minHeight: TOPBAR_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: GRID * 2,
    paddingVertical: GRID,
    backgroundColor: 'transparent',
    borderBottomWidth: 1,
    borderBottomColor: LAYOUT_2026.dividerColor,
    flexShrink: 0,
  },
  barWithBreadcrumb: {
    minHeight: TOPBAR_HEIGHT_WITH_BREADCRUMB,
    alignItems: 'flex-start',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
  },
  projectHeaderWrap: {
    flex: 1,
    minWidth: 0,
    justifyContent: 'center',
  },
  projectTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  projectTitleText: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  projectTitleName: {
    fontWeight: '400',
  },
  breadcrumbRow: {
    marginTop: 2,
  },
  breadcrumbText: {
    marginTop: 2,
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
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
 * @param {string} [pageTitle] - Sidtitel när inget projekt (t.ex. Startsida)
 * @param {Object} [project] - Projekt för rubrik (ikon + nummer – namn + breadcrumb)
 * @param {string} [sectionLabel] - Sektionsnamn för breadcrumb (t.ex. Översikt)
 * @param {string} [itemLabel] - Punktnamn för breadcrumb (t.ex. Tidsplan och viktiga datum)
 * @param {Function} [onCreateProject] - Klick på + Skapa projekt
 * @param {boolean} [showRightPanelToggle] - Visa chevron + kalender
 * @param {boolean} [rightPanelOpen] - Är högerpanelen öppen
 * @param {Function} [onRightPanelToggle] - Klick på panel-toggle
 * @param {boolean} [showCreateProject] - Visa "+ Skapa projekt"-knappen
 */
export function MinimalTopbar({
  pageTitle = 'Startsida',
  project = null,
  sectionLabel = '',
  itemLabel = '',
  onCreateProject,
  showRightPanelToggle = false,
  rightPanelOpen = false,
  onRightPanelToggle,
  showCreateProject = true,
}) {
  const showProjectHeader = !!project;
  const { number, name } = normalizeProjectLabel(project);
  const phase = project ? getProjectPhase(project) : null;
  const section = String(sectionLabel || '').trim();
  const item = String(itemLabel || '').trim();
  const breadcrumb = section && item ? `${section} / ${item}` : section || item;

  return (
    <View style={[styles.bar, showProjectHeader && styles.barWithBreadcrumb]}>
      {showProjectHeader ? (
        <View style={styles.projectHeaderWrap}>
          <View style={styles.projectTitleRow}>
            {phase?.icon ? (
              <Ionicons name={phase.icon} size={22} color={phase.color || '#475569'} />
            ) : null}
            <Text style={styles.projectTitleText} numberOfLines={1} ellipsizeMode="tail">
              {number || name ? (
                <>
                  {number || ''}
                  {name ? <Text style={styles.projectTitleName}>{number ? ` – ${name}` : name}</Text> : null}
                </>
              ) : (
                'Projekt'
              )}
            </Text>
          </View>
          {breadcrumb ? (
            <Text style={styles.breadcrumbText} numberOfLines={1} ellipsizeMode="tail">
              {breadcrumb}
            </Text>
          ) : null}
        </View>
      ) : (
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {pageTitle || 'Startsida'}
        </Text>
      )}
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
