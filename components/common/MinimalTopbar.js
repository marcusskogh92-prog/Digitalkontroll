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
  breadcrumbPath: {
    fontSize: 13,
    fontWeight: '500',
    color: '#64748b',
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
 * @param {React.ReactNode} [pageTitleIcon] - Ikon framför pageTitle (t.ex. för Planering)
 * @param {Object} [project] - Projekt för rubrik (ikon + nummer – namn + breadcrumb)
 * @param {string} [sectionLabel] - Sektionsnamn för breadcrumb (t.ex. Översikt)
 * @param {string} [itemLabel] - Punktnamn för breadcrumb (t.ex. Tidsplan och viktiga datum)
 * @param {Function} [onCreateProject] - Klick på + Skapa projekt
 * @param {boolean} [showRightPanelToggle] - Visa chevron + kalender
 * @param {boolean} [rightPanelOpen] - Är högerpanelen öppen
 * @param {Function} [onRightPanelToggle] - Klick på panel-toggle
 * @param {boolean} [showActivitiesToggle] - Visa notiser/aktiviteter-knapp (öppnar högerpanel med Aktiviteter)
 * @param {boolean} [activitiesActive] - Högerpanelen visar Aktiviteter (för aktiv styling)
 * @param {Function} [onActivitiesToggle] - Klick på aktiviteter-knappen
 * @param {number} [notificationsBadgeCount] - Antal olästa för badge på klockan
 * @param {boolean} [showCreateProject] - Visa "+ Skapa projekt"-knappen
 */
export function MinimalTopbar({
  pageTitle = 'Startsida',
  pageTitleIcon = null,
  project = null,
  sectionLabel = '',
  itemLabel = '',
  onCreateProject,
  showRightPanelToggle = false,
  rightPanelOpen = false,
  onRightPanelToggle,
  showActivitiesToggle = false,
  activitiesActive = false,
  onActivitiesToggle,
  notificationsBadgeCount = 0,
  showCreateProject = true,
}) {
  const showProjectHeader = !!project;
  const { number, name } = normalizeProjectLabel(project);
  const phase = project ? getProjectPhase(project) : null;
  const section = String(sectionLabel || '').trim();
  const item = String(itemLabel || '').trim();
  const breadcrumb = section && item ? `${section} / ${item}` : section || item;
  const projectPart = [number || name || 'Projekt', name && number ? ` – ${name}` : (name || '')].filter(Boolean).join('') || 'Projekt';

  return (
    <View style={styles.bar}>
      {showProjectHeader ? (
        <View style={styles.projectHeaderWrap}>
          <View style={styles.projectTitleRow}>
            {phase?.icon ? (
              <Ionicons name={phase.icon} size={22} color={phase.color || '#475569'} />
            ) : null}
            <Text style={styles.projectTitleText} numberOfLines={1} ellipsizeMode="tail">
              {projectPart}
              {breadcrumb ? (
                <Text style={styles.breadcrumbPath}> · {breadcrumb}</Text>
              ) : null}
            </Text>
          </View>
        </View>
      ) : (
        <View style={styles.projectTitleRow}>
          {pageTitleIcon || null}
          <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
            {pageTitle || 'Startsida'}
          </Text>
        </View>
      )}
      <View style={styles.actions}>
        {showRightPanelToggle && typeof onRightPanelToggle === 'function' && (
          <View style={styles.panelToggleWrap}>
            <TouchableOpacity
              onPress={onRightPanelToggle}
              style={[styles.iconButton, styles.chevronButton]}
              accessibilityLabel={rightPanelOpen ? 'Stäng panel' : 'Öppna panel'}
              accessibilityRole="button"
              activeOpacity={0.8}
            >
              <Ionicons
                name={rightPanelOpen ? 'chevron-forward' : 'chevron-back'}
                size={14}
                color={rightPanelOpen ? LEFT_NAV.accent : '#64748b'}
              />
            </TouchableOpacity>
          </View>
        )}
        {showActivitiesToggle && typeof onActivitiesToggle === 'function' && (
          <TouchableOpacity
            onPress={onActivitiesToggle}
            style={[styles.iconButton, activitiesActive && styles.iconButtonActive]}
            accessibilityLabel={activitiesActive ? 'Stäng aktiviteter' : 'Öppna aktiviteter'}
            accessibilityRole="button"
            activeOpacity={0.8}
          >
            <View style={{ position: 'relative' }}>
              <Ionicons
                name="notifications-outline"
                size={22}
                color={activitiesActive ? LEFT_NAV.accent : '#64748b'}
              />
              {notificationsBadgeCount > 0 ? (
                <View
                  style={{
                    position: 'absolute',
                    top: -4,
                    right: -4,
                    backgroundColor: '#ef4444',
                    borderRadius: 10,
                    minWidth: 14,
                    height: 14,
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingHorizontal: 4,
                  }}
                >
                  <Text style={{ color: '#fff', fontSize: 10, fontWeight: '700' }}>
                    {notificationsBadgeCount > 9 ? '9+' : notificationsBadgeCount}
                  </Text>
                </View>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        {showRightPanelToggle && typeof onRightPanelToggle === 'function' && (
          <TouchableOpacity
            onPress={onRightPanelToggle}
            style={[styles.iconButton, rightPanelOpen && !activitiesActive && styles.iconButtonActive]}
            accessibilityLabel={rightPanelOpen ? 'Stäng kalender' : 'Öppna kalender'}
            accessibilityRole="button"
            activeOpacity={0.8}
          >
            <Ionicons
              name="calendar-outline"
              size={22}
              color={rightPanelOpen && !activitiesActive ? LEFT_NAV.accent : '#64748b'}
            />
          </TouchableOpacity>
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
