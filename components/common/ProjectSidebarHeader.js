/**
 * Kompakt projekt-header för left panel (projektvy).
 * Visar projektnummer + namn och skede med ikon/färg.
 * Återanvändbar för dashboard projektlista senare.
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import { getPhaseMeta } from '../../features/projects/constants';

const PHASE_ICON_GAP = 6;
const PHASE_ROW_MARGIN_TOP = 4;
const HEADER_PADDING_VERTICAL = 8;

const styles = StyleSheet.create({
  container: {
    paddingVertical: HEADER_PADDING_VERTICAL,
    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
    flexShrink: 0,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: LEFT_NAV.rowFontSize,
    fontWeight: '600',
    color: LEFT_NAV.textDefault,
  },
  phaseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: PHASE_ROW_MARGIN_TOP,
  },
  phaseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: PHASE_ICON_GAP,
  },
  phaseLabel: {
    fontSize: 12,
    fontWeight: '400',
  },
});

/**
 * @param {Object} props
 * @param {Object} [props.project] - Projekt med projectNumber, projectName, phase
 * @param {string} [props.projectNumber] - Överstyr om project saknas
 * @param {string} [props.projectName] - Överstyr om project saknas
 * @param {string} [props.phaseKey] - Skede (kalkylskede, produktion, avslut, eftermarknad). Default: project?.phase
 */
export function ProjectSidebarHeader({ project, projectNumber, projectName, phaseKey }) {
  const num = projectNumber ?? project?.projectNumber ?? project?.number ?? project?.id ?? '';
  const name = projectName ?? project?.projectName ?? project?.name ?? '';
  const phase = phaseKey ?? project?.phase ?? 'kalkylskede';
  const meta = getPhaseMeta(phase);

  const title = [String(num).trim(), String(name).trim()].filter(Boolean).join(' — ') || 'Projekt';

  return (
    <View style={styles.container} pointerEvents="box-none">
      <View style={styles.titleRow}>
        <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
          {title}
        </Text>
      </View>
      <View style={styles.phaseRow}>
        <View style={[styles.phaseDot, { backgroundColor: meta.color }]} />
        <Text style={[styles.phaseLabel, { color: meta.color }]} numberOfLines={1}>
          {meta.label}
        </Text>
      </View>
    </View>
  );
}
