// Shared styling tokens for left-panel navigation.
// Tajt, kompakt: mindre radhöjd och padding – samma i dashboard och projekt.

export const LEFT_NAV = {
  accent: '#2563EB',

  // Row sizing/spacing (single source of truth) – extra tajt
  rowMinHeight: 28,
  /** Compact row height for section/site headers (e.g. dashboard sites, phase sections). */
  rowMinHeightCompact: 24,
  rowPaddingVertical: 2,
  rowPaddingHorizontal: 12,
  rowBorderRadius: 6,
  rowBorderLeftWidth: 4,
  rowFontSize: 13,
  rowIconGap: 8,
  /** Indentation per level (e.g. children under a site). Use everywhere for consistency. */
  indentPerLevel: 12,
  /** Chevron size (12–14px, low visual weight). Same in dashboard and project sidebar. */
  chevronSize: 12,
  /** Expand/collapse animation duration (ms). */
  expandTransitionMs: 200,

  // Default (no hover, not active)
  textDefault: '#1e293b',
  iconDefault: '#475569',
  textMuted: '#64748b',
  iconMuted: '#94a3b8',

  // Hover
  hoverText: '#2563EB',
  hoverIcon: '#2563EB',
  hoverBg: '#f1f5f9',

  // Active (current page/selection) – subtil, tydlig
  activeBg: '#EEF4FF',
  activeBorder: '#2563EB',

  // Small count pill (e.g. item counters)
  countPillBg: '#0000000A',
  countPillBorder: '#0000000F',
  countTextSize: 12,

  // Status/utility text in the left panel
  subtleText: '#94A3B8',
  errorText: '#B91C1C',

  // Project phase dot
  phaseDotBorder: '#BBB',
  phaseDotFallback: '#43A047',

  // Web font family to match existing left-nav text
  webFontFamily:
    'Inter_400Regular, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};
