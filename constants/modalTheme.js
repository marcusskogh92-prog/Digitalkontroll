/**
 * Golden rule: Modal-tema för alla modaler i systemet.
 * Alla modaler ska använda dessa värden för konsekvent utseende (banner, knappar, textstorlek).
 * Se docs/MODAL_GOLDEN_RULE.md.
 */

import { Platform } from 'react-native';
import { ICON_RAIL } from './iconRailTheme';

export const MODAL_THEME = {
  /** Banner (header) – mörk som Företagsinställningar */
  banner: {
    backgroundColor: ICON_RAIL.bg,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    /** Titel i banner */
    titleFontSize: 14,
    titleFontWeight: '600',
    titleColor: ICON_RAIL.iconColorActive,
    /** Undertext / punkt */
    subtitleFontSize: 12,
    dotFontSize: 11,
    subtitleColor: ICON_RAIL.iconColor,
    /** Ikonruta i banner */
    iconSize: 28,
    iconBgRadius: ICON_RAIL.activeBgRadius,
    iconBg: ICON_RAIL.activeBg,
    /** Stäng-knapp (X) i banner */
    closeBtnPadding: 5,
    closeIconSize: 20,
  },
  /** Footer-knappar – både Stäng och Spara ska vara mörka med vit text */
  footer: {
    backgroundColor: '#f8fafc',
    borderTopColor: '#e2e8f0',
    btnPaddingVertical: 10,
    btnPaddingHorizontal: 20,
    btnBorderRadius: ICON_RAIL.activeBgRadius,
    btnBackground: ICON_RAIL.bg,
    btnBorderColor: ICON_RAIL.bg,
    btnTextColor: '#fff',
    btnFontSize: 14,
    btnFontWeight: '600',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  /** Innehållsområde */
  body: {
    sectionTitleFontSize: 14,
    sectionTitleColor: '#334155',
    labelFontSize: 13,
    labelColor: '#64748b',
    valueFontSize: 13,
    valueColor: '#0f172a',
  },
  /** Resize-handles: bredd/höjd i px så att muspekaren blir streck med pilar (Windows-liknande) */
  resizeHandleWidth: 8,
  resizeCornerSize: 20,
};

export { ICON_RAIL };
