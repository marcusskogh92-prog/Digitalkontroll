/**
 * Gemensamt tabell-layout för ALLA admin-register (Leverantörer, Kontakter, Kunder, Byggdelar, Kontoplan, Kategorier).
 *
 * Alla register ska använda:
 * - Samma columnContent (paddingLeft 4, paddingRight 6) – rubrik, input och datacell samma start-X.
 * - Samma input-regler: width 100% / flex 1, margin 0, ingen extra margin eller maxWidth.
 * - Samma kebab-kolumn: width 30px, paddingLeft 0, paddingRight 0, divider borderLeft.
 *
 * columnContent:
 *   paddingLeft: 4,
 *   paddingRight: 6,
 *   justifyContent: 'flex-start',
 *   alignItems: 'flex-start',
 *   flex: 1,
 *   minWidth: 0,
 *   alignSelf: 'stretch'
 *
 * actionsCol (kebab):
 *   width: 30,
 *   minWidth: 30,
 *   maxWidth: 30,
 *   paddingLeft: 0,
 *   paddingRight: 0,
 *   justifyContent: 'center',
 *   alignItems: 'center'
 */
export const COLUMN_PADDING_LEFT = 4;
export const COLUMN_PADDING_RIGHT = 6;

/** @deprecated Använd COLUMN_PADDING_LEFT / COLUMN_PADDING_RIGHT */
export const COLUMN_PADDING_H = 12;
