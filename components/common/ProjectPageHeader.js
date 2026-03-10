import { Ionicons } from '@expo/vector-icons';
import { Platform, StyleSheet, Text, View } from 'react-native';

import { getProjectPhase } from '../../features/projects/constants';
import { PROJECT_TYPOGRAPHY } from './projectTypography';

function normalizeProjectLabel(project) {
  let number = String(project?.projectNumber || project?.number || '').trim();
  let name = String(project?.projectName || '').trim();
  const nameLike = String(project?.name || project?.fullName || '').trim();

  // Saknas nummer: plocka ut från name/fullName (t.ex. "1010-09 - Demo")
  if (!number && nameLike) {
    const m = nameLike.match(/^([a-zA-Z]?[0-9]{2,}-[0-9]+)\s*(?:[-–—]\s*)?(.*)$/);
    if (m) {
      number = String(m[1] || '').trim();
      if (!name) name = String(m[2] || '').trim();
    }
  }
  // Fallback: id som ser ut som projektnummer
  if (!number && project?.id && /^[a-zA-Z]?[0-9]{2,}-[0-9]+$/.test(String(project.id).trim())) {
    number = String(project.id).trim();
  }
  if (!name) name = nameLike;
  return { number, name };
}

export default function ProjectPageHeader({
  project,
  sectionLabel,
  itemLabel,
  style,
}) {
  const { number, name } = normalizeProjectLabel(project);
  const phase = project ? getProjectPhase(project) : null;
  const section = String(sectionLabel || '').trim();
  const item = String(itemLabel || '').trim();

  const breadcrumb = (() => {
    if (section && item) return `${section} / ${item}`;
    if (section) return section;
    return '';
  })();

  const projectLabel = number || name ? (number && name ? `${number} – ${name}` : (number || name)) : 'Projekt';

  return (
    <View style={[styles.container, style]}>
      <View style={styles.titleRow}>
        {phase?.icon ? (
          <Ionicons
            name={phase.icon}
            size={22}
            color={phase.color || '#475569'}
            style={styles.phaseIcon}
          />
        ) : null}
        <Text style={styles.fullLine} numberOfLines={1}>
          <Text style={PROJECT_TYPOGRAPHY.projectHeaderTitle}>
            {projectLabel}
          </Text>
          {breadcrumb ? (
            <>
              <Text style={styles.separator}>  ·  </Text>
              <Text style={[PROJECT_TYPOGRAPHY.projectHeaderBreadcrumb, styles.breadcrumbInline]}>{breadcrumb}</Text>
            </>
          ) : null}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 18,
    paddingTop: 12,
    paddingBottom: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8EC',
    ...(Platform.OS === 'web' ? { position: 'sticky', top: 0, zIndex: 5 } : {}),
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  phaseIcon: {
    marginRight: 0,
  },
  fullLine: {
    flex: 1,
    minWidth: 0,
    fontSize: 17,
    color: '#111827',
  },
  separator: {
    fontSize: 14,
    fontWeight: '600',
    color: '#94a3b8',
  },
  breadcrumbInline: {
    marginTop: 0,
  },
});
