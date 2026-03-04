/**
 * Modal design – en golden rule för alla modaler.
 * Referens: AdminCreateCompanyModal (Skapa nytt företag). Mörk banner, primärknapp = bannerns färg (dimmad), ingen ljusblå.
 * Se docs/MODAL_GOLDEN_RULE.md.
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
  /** Header – neutral (mörk banner). Standard: #1E2A38, vit text. */
  headerNeutral: {
    backgroundColor: '#1E2A38',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 5,
    paddingHorizontal: 14,
    minHeight: 38,
    maxHeight: 38,
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
  /** Standard kompakt banner – samma som Leverantörer och Företagsinställningar. 28px höjd, titel 12px normal. ModalBase: headerVariant="neutralCompact". */
  headerNeutralCompact: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 28,
    maxHeight: 28,
  },
  headerNeutralCompactTitleFontSize: 12,
  headerNeutralCompactTitleFontWeight: '400',
  headerNeutralCompactTitleLineHeight: 16,
  headerNeutralCompactIconSize: 22,
  headerNeutralCompactIconPx: 14,
  headerNeutralCompactCloseIconPx: 18,
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

  /** Knappar – radius 6, inga pill. Primär = bannerns färg (dimmad), inte ljusblå. */
  buttonRadius: 6,
  buttonPaddingVertical: 6,
  buttonPaddingHorizontal: 18,
  /** Primärknapp (Spara/Skapa): dimmad bannern #1E2A38 – golden rule enhetlig med banner */
  buttonPrimaryBg: '#2D3A4B',
  buttonPrimaryColor: '#fff',
  buttonPrimaryFontWeight: '500',
  buttonSecondaryBorder: '1px solid #ddd',
  buttonSecondaryBg: '#fff',
  buttonSecondaryColor: '#374151',

  /** Inputfält */
  inputRadius: 6,
  inputBorder: '1px solid #ddd',
  inputBorderFocus: '#1976D2',

  /** Tabeller – golden rule för alla register (Leverantörer, Kunder, Kontakter, Byggdelar, Kontoplan, Kategorier, Användare). Se docs/TABLE_GOLDEN_RULE.md. */
  tableRadius: 0,
  tableRowHeight: 24,
  tableCellPaddingVertical: 4,
  tableCellPaddingHorizontal: 12,
  tableBorderColor: '#e2e8f0',
  tableHeaderBackgroundColor: '#f1f5f9',
  tableHeaderBorderColor: '#e2e8f0',
  tableHeaderFontSize: 12,
  tableHeaderFontWeight: '500',
  tableHeaderColor: '#475569',
  tableRowBorderColor: '#eef0f3',
  tableRowBackgroundColor: '#fff',
  tableRowAltBackgroundColor: '#f8fafc',
  tableRowHoverBackgroundColor: '#eef6ff',
  tableCellFontSize: 13,
  tableCellColor: '#111',
  tableCellMutedColor: '#64748b',
};
