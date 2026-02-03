// Shared styling tokens for left-panel navigation.
// Keep left navigation calm: neutral by default, blue only on interaction.

export const LEFT_NAV = {
  accent: '#1976D2',

  // Row sizing/spacing (single source of truth)
  rowPaddingVertical: 6,
  rowPaddingHorizontal: 8,
  rowBorderRadius: 6,
  rowBorderLeftWidth: 2,
  rowFontSize: 14,
  rowIconGap: 6,

  // Default (no hover, not active)
  textDefault: '#222',
  iconDefault: '#222',
  textMuted: '#666',
  iconMuted: '#666',

  // Hover
  hoverText: '#1976D2',
  hoverIcon: '#1976D2',
  // Match start-view list hover highlight
  hoverBg: '#E3F2FD',

  // Active (current page/selection)
  // Keep active highlight consistent with hover to match start-view behavior
  activeBg: '#E3F2FD',
  activeBorder: '#1976D2',

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
