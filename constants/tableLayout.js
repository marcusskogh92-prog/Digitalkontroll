import { MODAL_DESIGN_2026 } from './modalDesign2026';

/**
 * Gemensamt tabell-layout för ALLA register (Leverantörer, Kunder, Kontakter, Byggdelar, Kontoplan, Kategorier, Användare).
 * Se docs/TABLE_GOLDEN_RULE.md för utseende och funktion.
 *
 * Använd:
 * - COLUMN_PADDING_LEFT / COLUMN_PADDING_RIGHT i columnContent (rubrik, input och datacell samma start-X).
 * - MODAL_DESIGN_2026.table* för radhöjd, cell-padding, rubrik/cell-font, färger (importera från constants/modalDesign2026).
 * - Ingen kebab-kolumn: radåtgärder via högerklick (context menu). Valfritt: justerbara kolumner på webb.
 */
export const COLUMN_PADDING_LEFT = 4;
export const COLUMN_PADDING_RIGHT = 6;

/** @deprecated Använd COLUMN_PADDING_LEFT / COLUMN_PADDING_RIGHT */
export const COLUMN_PADDING_H = 12;

/** Samlad tabell-design: modalDesign2026.table* + column padding. Importera TABLE eller MODAL_DESIGN_2026 + tableLayout. */
export const TABLE = {
  ...Object.fromEntries(
    Object.entries(MODAL_DESIGN_2026).filter(([k]) => k.startsWith('table'))
  ),
  columnPaddingLeft: COLUMN_PADDING_LEFT,
  columnPaddingRight: COLUMN_PADDING_RIGHT,
};
