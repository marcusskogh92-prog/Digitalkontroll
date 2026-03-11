/**
 * Modal design – en golden rule för alla modaler.
 * Referens: Lägg till leverantör (StandardModal) – ljus banner #F8FAFC, tunn, ingen bakgrund runt ikon/X.
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
  /** Header – neutral (ljus banner). Samma som Lägg till leverantör / StandardModal: #F8FAFC, tunn, ingen bakgrund runt ikon/X. */
  headerNeutral: {
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 12,
    minHeight: 32,
    maxHeight: 40,
  },
  headerNeutralTitleFontSize: 14,
  headerNeutralTitleFontWeight: '600',
  headerNeutralTitleLineHeight: 18,
  headerNeutralSubtitleFontSize: 12,
  headerNeutralSubtitleLineHeight: 16,
  headerNeutralSubtitleOpacity: 0.85,
  headerNeutralTextColor: '#0F172A',
  headerNeutralIconSize: 17,
  headerNeutralCloseIconColor: '#0F172A',
  headerNeutralCloseBtnHover: 'rgba(0,0,0,0.06)',
  /** Kompakt banner – lite högre vid titel+undertitel. Samma ljusa färg. ModalBase: headerVariant="neutralCompact". */
  headerNeutralCompact: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 34,
    maxHeight: 44,
  },
  headerNeutralCompactTitleFontSize: 12,
  headerNeutralCompactTitleFontWeight: '600',
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

  /** Knappar – radius 6, inga pill. Enhetligt i hela systemet. */
  buttonRadius: 6,
  buttonPaddingVertical: 6,
  buttonPaddingHorizontal: 18,
  /** Stäng – grå (enhetlig i alla modaler) */
  buttonCloseBg: '#475569',
  buttonCloseColor: '#fff',
  /** Avbryt – dimmad röd */
  buttonCancelBg: '#fef2f2',
  buttonCancelBorder: '#fecaca',
  buttonCancelText: '#b91c1c',
  /** Spara – dimmad grön */
  buttonSaveBg: '#15803d',
  buttonSaveColor: '#fff',
  /** Primärknapp (t.ex. Skapa) – mörk; Spara i formulär använd buttonSaveBg */
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
