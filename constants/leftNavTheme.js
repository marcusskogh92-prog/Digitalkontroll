// Shared styling tokens for left-panel navigation.
// Keep left navigation calm: neutral by default, blue only on interaction.

export const LEFT_NAV = {
  accent: '#1976D2',

  // Default (no hover, not active)
  textDefault: '#222',
  iconDefault: '#222',
  textMuted: '#666',
  iconMuted: '#666',

  // Hover
  hoverText: '#1976D2',
  hoverIcon: '#1976D2',
  hoverBg: 'rgba(25, 118, 210, 0.06)',

  // Active (current page/selection)
  activeBg: 'rgba(25, 118, 210, 0.08)',
  activeBorder: '#1976D2',

  // Web font family to match existing left-nav text
  webFontFamily:
    'Inter_400Regular, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
};
