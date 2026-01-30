import { StyleSheet } from 'react-native';

// Shared, UI-only typography tokens for project views.
// Keep these conservative to avoid layout shifts.

export const PROJECT_TYPOGRAPHY = StyleSheet.create({
  // ProjectPageHeader (global header in PhaseLayout)
  projectHeaderTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#111827',
  },
  projectHeaderTitleName: {
    fontWeight: '400',
    color: '#111827',
  },
  projectHeaderBreadcrumb: {
    marginTop: 6,
    fontSize: 14,
    fontWeight: '600',
    color: '#475569',
  },

  // Per-view local header (when global header is hidden)
  viewTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#111827',
  },
  viewSubtitle: {
    marginTop: 4,
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },

  // Intro/paragraph text under the header
  introText: {
    fontSize: 15,
    lineHeight: 22,
    color: '#475569',
  },

  // Small section headings within a view
  sectionHeading: {
    fontSize: 13,
    fontWeight: '700',
    color: '#111827',
  },
});
