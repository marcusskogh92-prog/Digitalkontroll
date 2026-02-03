import { Platform, StyleSheet, Text, View } from 'react-native';

import { PROJECT_TYPOGRAPHY } from './projectTypography';

function normalizeProjectLabel(project) {
  const rawNumber = String(project?.projectNumber || project?.number || '').trim();
  const rawName = String(project?.projectName || '').trim();

  if (rawNumber && rawName) return { number: rawNumber, name: rawName };

  const nameLike = String(project?.name || project?.fullName || '').trim();
  if (!nameLike) return { number: rawNumber || '', name: rawName || '' };

  // Common patterns:
  // - "2026-00010 Test"
  // - "2026-00010 - Test"
  // - "2026-00010 – Test"
  const m = nameLike.match(/^([a-zA-Z]?[0-9]{2,}-[0-9]+)\s*(?:[-–—]\s*)?(.*)$/);
  if (m) {
    return { number: rawNumber || String(m[1] || '').trim(), name: rawName || String(m[2] || '').trim() };
  }

  return { number: rawNumber, name: rawName || nameLike };
}

export default function ProjectPageHeader({
  project,
  sectionLabel,
  itemLabel,
  style,
}) {
  const { number, name } = normalizeProjectLabel(project);
  const title = [number, name].filter(Boolean).join(' – '); // en dash

  const section = String(sectionLabel || '').trim();
  const item = String(itemLabel || '').trim();

  const breadcrumb = (() => {
    if (section && item) return `${section} / ${item}`;
    if (section) return section;
    return '';
  })();

  return (
    <View style={[styles.container, style]}>
      <Text style={PROJECT_TYPOGRAPHY.projectHeaderTitle} numberOfLines={1}>
        {title ? (
          <>
            {number || ''}
            {name ? <Text style={PROJECT_TYPOGRAPHY.projectHeaderTitleName}>{` – ${name}`}</Text> : null}
          </>
        ) : (
          'Projekt'
        )}
      </Text>
      {breadcrumb ? (
        <Text style={PROJECT_TYPOGRAPHY.projectHeaderBreadcrumb} numberOfLines={1}>
          {breadcrumb}
        </Text>
      ) : null}
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
});
