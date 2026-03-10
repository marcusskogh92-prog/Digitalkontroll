/**
 * Modal-tema – följer docs/MODAL_GOLDEN_RULE.md (en standard, referens: Skapa nytt företag).
 * Primärknapp = bannerns färg (dimmad #2D3A4B), inte ljusblå.
 */

import { Platform } from 'react-native';
import { ICON_RAIL } from './iconRailTheme';

/** Dimmad bannern – används för primärknapp (Spara/Skapa) enligt golden rule */
export const MODAL_PRIMARY_BG = '#2D3A4B';

export const MODAL_THEME = {
  /** Banner (header) – mörk #1E2A38 */
  banner: {
    backgroundColor: ICON_RAIL.bg,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 7,
    paddingHorizontal: 14,
    titleFontSize: 14,
    titleFontWeight: '600',
    titleColor: ICON_RAIL.iconColorActive,
    subtitleFontSize: 12,
    dotFontSize: 11,
    subtitleColor: ICON_RAIL.iconColor,
    iconSize: 28,
    iconBgRadius: ICON_RAIL.activeBgRadius,
    iconBg: ICON_RAIL.activeBg,
    closeBtnPadding: 5,
    closeIconSize: 20,
  },
  /** Footer – primärknapp = dimmad bannern (#2D3A4B). Se MODAL_GOLDEN_RULE.md. */
  footer: {
    backgroundColor: '#f8fafc',
    borderTopColor: '#e2e8f0',
    btnPaddingVertical: 6,
    btnPaddingHorizontal: 18,
    btnBorderRadius: ICON_RAIL.activeBgRadius,
    btnBackground: MODAL_PRIMARY_BG,
    btnBorderColor: MODAL_PRIMARY_BG,
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

/** Golden rule: Laddningsindikator – används i modaler och vyer för konsekvent loading-UI */
export const LOADING_THEME = {
  /** Färg på ActivityIndicator (mörk slate, matchar primärknappar) */
  spinnerColor: '#1e293b',
  /** Storlek: 'large' för helsids-/modal-loading, 'small' för inline/knappar */
  spinnerSizeLarge: 'large',
  spinnerSizeSmall: 'small',
  /** Text under spinnern */
  textColor: '#64748b',
  textFontSize: 13,
  /** Container: minHeight så att loading känns centrerad i modaler */
  containerMinHeight: 200,
};

export { ICON_RAIL };
