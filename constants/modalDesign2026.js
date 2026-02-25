/**
 * Modal design standard 2026 – stram SaaS B2B.
 * Kontaktregister-modalen är referens. Alla modaler använder dessa tokens.
 * Ingen mörk banner, ingen pill-form, ingen glow. Premium affärssystemkänsla.
 */

import { Platform } from 'react-native';

export const MODAL_DESIGN_2026 = {
  /** Modal container */
  radius: 8,
  shadow: Platform.OS === 'web'
    ? '0 10px 30px rgba(0,0,0,0.08)'
    : undefined,
  shadowNative: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 30,
    elevation: 8,
  },

  /** Overlay bakom modal */
  overlayBg: 'rgba(0,0,0,0.35)',
  overlayBlur: 4,

  /** Header – ren, ljus (standard) */
  header: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  titleFontSize: 17,
  titleFontWeight: '600',
  titleColor: '#0f172a',
  subtitleFontSize: 13,
  subtitleColor: '#64748b',
  /** Header – neutral (Kontaktregister): toolbar-kompakt, rail-färg, vit text */
  headerNeutral: {
    backgroundColor: '#1E2A38',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 8,
    paddingHorizontal: 14,
    minHeight: 40,
    maxHeight: 44,
  },
  headerNeutralTitleFontSize: 15,
  headerNeutralTitleFontWeight: '600',
  headerNeutralTitleLineHeight: 18,
  headerNeutralSubtitleFontSize: 12,
  headerNeutralSubtitleLineHeight: 16,
  headerNeutralSubtitleOpacity: 0.85,
  headerNeutralTextColor: '#fff',
  headerNeutralIconSize: 17,
  headerNeutralCloseIconColor: '#fff',
  headerNeutralCloseBtnHover: 'rgba(255,255,255,0.12)',
  /** Stäng-knapp – diskret, ingen cirkel */
  closeBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  closeBtnHover: { backgroundColor: 'rgba(0,0,0,0.06)' },
  closeIconColor: '#64748b',
  closeIconSize: 20,

  /** Content */
  contentPadding: 24,
  sectionGap: 16,

  /** Footer */
  footer: {
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
    paddingVertical: 14,
    paddingHorizontal: 24,
  },

  /** Knappar – radius 6, inga pill */
  buttonRadius: 6,
  buttonPrimaryBg: '#1976D2',
  buttonPrimaryColor: '#fff',
  buttonPrimaryFontWeight: '500',
  buttonSecondaryBorder: '1px solid #ddd',
  buttonSecondaryBg: '#fff',
  buttonSecondaryColor: '#374151',

  /** Inputfält */
  inputRadius: 6,
  inputBorder: '1px solid #ddd',
  inputBorderFocus: '#1976D2',

  /** Tabeller inuti modal – ingen rundning, tajt radhöjd */
  tableRadius: 0,
  tableRowHeight: 24,
  tableCellPaddingVertical: 4,
  tableCellPaddingHorizontal: 12,
};
