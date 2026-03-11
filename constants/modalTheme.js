/**
 * Modal-tema – ljus, clean banner och footer.
 * Banner: ljusgrå #F8FAFC med mörk text. Stäng-knapp: ljusgrå. Spara-knapp: behåller MODAL_PRIMARY_BG.
 */

import { Platform } from 'react-native';
import { ICON_RAIL } from './iconRailTheme';

/** Primärknapp (Skapa) – mörk. Spara-knapp använd MODAL_SAVE_BG (dimmad grön). */
export const MODAL_PRIMARY_BG = '#2D3A4B';
/** Stäng – grå, enhetlig i hela systemet */
export const MODAL_CLOSE_BG = '#475569';
/** Spara – dimmad grön, enhetlig i hela systemet */
export const MODAL_SAVE_BG = '#15803d';

export const MODAL_THEME = {
  /** Banner (header) – ljus, clean, samma storlek som övriga modaler (headerNeutralCompact) */
  banner: {
    backgroundColor: '#F8FAFC',
    borderBottomColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    maxHeight: 44,
    titleFontSize: 14,
    titleFontWeight: '600',
    titleColor: '#0F172A',
    subtitleFontSize: 12,
    dotFontSize: 11,
    subtitleColor: '#64748B',
    iconSize: 24,
    iconBgRadius: ICON_RAIL.activeBgRadius,
    /** Titeln-ikon: ingen bakgrund, smälter in i bannern */
    iconBg: 'transparent',
    closeBtnPadding: 4,
    closeIconSize: 18,
    /** Stäng-knapp: ingen markerad knapp, bara synligt X */
    closeBtnBg: 'transparent',
  },
  /** Footer – Stäng grå (#475569), Spara dimmad grön (#15803d). Enhetligt i hela systemet. */
  footer: {
    backgroundColor: '#F8FAFC',
    borderTopColor: '#E2E8F0',
    btnPaddingVertical: 6,
    btnPaddingHorizontal: 18,
    btnBorderRadius: ICON_RAIL.activeBgRadius,
    /** Stäng-knapp – grå */
    btnBackground: MODAL_CLOSE_BG,
    btnBorderColor: '#E2E8F0',
    btnTextColor: '#fff',
    /** Spara-knapp – dimmad grön */
    saveBtnBackground: MODAL_SAVE_BG,
    saveBtnTextColor: '#fff',
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
