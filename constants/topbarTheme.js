/**
 * Topbar 2026 SaaS theme – primary and sub navigation.
 * Segmented text navigation, no pills/buttons, sticky with scroll effects.
 */

import { LEFT_NAV } from './leftNavTheme';

/** Primary accent for active underline (same as left nav) */
export const TOPBAR_ACCENT = LEFT_NAV.accent;

/** Primary topbar – sections (Översikt, Förfrågningsunderlag, …) */
export const PRIMARY_TOPBAR = {
  /** Inactive label */
  textInactive: '#525252', // neutral-600
  /** Hover & active label */
  textActive: '#171717',   // neutral-900
  /** Hover background */
  hoverBg: 'rgba(37, 99, 235, 0.05)', // primary tint
  hoverBorderRadius: 6,
  /** Active underline */
  underlineHeight: 2,
  underlineColor: TOPBAR_ACCENT,
  underlineBorderRadius: 2,
  /** Typography */
  fontSize: 15,
  fontWeight: '500',
  letterSpacing: 0.2,
  itemGap: 28,
  iconTextGap: 8,
  /** Sticky */
  stickyZIndex: 40,
  paddingVertical: 16,
  paddingHorizontal: 24,
  /** Scroll > 8px */
  scrollShadow: '0 4px 16px rgba(0,0,0,0.05)',
  scrollBg: 'rgba(255,255,255,0.85)',
  scrollBlur: 8,
  transitionMs: 250,
};

/** Approximate height of primary topbar for sub-topbar sticky top (padding + content) */
export const PRIMARY_TOPBAR_HEIGHT = 52;

/** Sub-topbar – section items (Projektinformation, Organisation och roller, …) */
export const SUB_TOPBAR = {
  textInactive: '#737373', // neutral-500
  textActive: '#404040',   // neutral-800
  underlineHeight: 2,
  underlineColor: TOPBAR_ACCENT,
  fontSize: 14,
  fontWeight: '500',
  itemGap: 20,
  stickyZIndex: 39,
  paddingVertical: 10,
  paddingHorizontal: 24,
};
