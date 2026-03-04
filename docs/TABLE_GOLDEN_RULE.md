# Golden rule: Tabeller (en standard)

**Alla tabeller i systemet ska följa samma utseende och funktion** – oavsett om de ligger i Leverantörer, Kunder, Kontakter, Byggdelar, Kontoplan, Kategorier, Användare eller andra sidor. Det ger en tydlig tråd genom hela appen.

**Design-tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026.table*) och `constants/tableLayout.js` (COLUMN_PADDING_LEFT/RIGHT, TABLE).  
**Referenstabeller:** LeverantorerTable, ContactRegistryTable, KunderTable, ByggdelTable, KontoplanTable, KategoriTable, UsersTable, **Digitalkontrolls utforskare** (SharePointFolderFileArea).

---

## 1. Container (tabellram)

- **Border-radius:** 0 (ingen rundning på tabellkanten).
- **Kant:** 1px solid `#e2e8f0`.
- **Bakgrund:** `#fff`.
- **Overflow:** hidden.

Tokens: `MODAL_DESIGN_2026.tableRadius`, `tableBorderColor`.

---

## 2. Header (kolumnrubriker)

- **Bakgrund:** `#f1f5f9`.
- **Kant under:** 1px solid `#e2e8f0`.
- **Padding:** 4px vertikalt, 12px horisontellt (samma som celler).
- **Text:** 12px, font-weight 500, färg `#475569`. Sorteringsikon diskret (t.ex. 14px).

Tokens: `tableHeaderBackgroundColor`, `tableHeaderBorderColor`, `tableCellPaddingVertical`, `tableCellPaddingHorizontal`, `tableHeaderFontSize`, `tableHeaderFontWeight`, `tableHeaderColor`.

---

## 3. Kolumninnehåll (cell-padding)

- **Padding inuti varje cell:** vänster 4px, höger 6px – så att rubrik, input och datacell börjar på samma X.
- **Flex:** 1, minWidth: 0 på innehållscontainrar så att text trunkeras med ellipsis vid behov.

Tokens: `COLUMN_PADDING_LEFT`, `COLUMN_PADDING_RIGHT` från `tableLayout.js`.

---

## 4. Rader (dataceller)

- **Minimihöjd:** 24px.
- **Padding:** 4px vertikalt, 12px horisontellt.
- **Kant under:** 1px solid `#eef0f3`.
- **Bakgrund:** `#fff`. Varannan rad (alt): `#f8fafc`. Hover (webb): `#eef6ff`.

Tokens: `tableRowHeight`, `tableCellPaddingVertical`, `tableCellPaddingHorizontal`, `tableRowBorderColor`, `tableRowBackgroundColor`, `tableRowAltBackgroundColor`, `tableRowHoverBackgroundColor`.

---

## 5. Text i celler

- **Datacell:** 13px, färg `#111` (eller `#1e293b`). Trunkering: numberOfLines={1}, ellipsizeMode="tail".
- **Dämpad text (t.ex. tom/placeholder):** 13px, färg `#64748b`.

Tokens: `tableCellFontSize`, `tableCellColor`, `tableCellMutedColor`.

---

## 6. Åtgärder på rader (beteende)

- **Ingen kebab-kolumn:** Ta inte en synlig kolumn med tre-prickar (kebab) i varje rad.
- **Högerklick:** Öppna context menu på rad (Redigera, Inaktivera/Aktivera, Ta bort etc.). På mobil: long-press.
- **Dubbelklick (valfritt):** Kan öppna redigering eller expandera rad.
- **Klick på rad:** Enkel klick kan växla expandering eller markering – konsekvent per tabelltyp.

---

## 7. Justerbara kolumner (webb)

På webb ska tabeller med kolumnrubriker kunna ha **justerbar bredd** – samma lösning överallt (Leverantörer, Kontakter, Kunder, **Digitalkontrolls utforskare** i Bilder/Myndigheter/Konstruktion m.fl.).

### 7.1 Beteende

- **Resize-handtag** mellan kolumnrubriker (t.ex. 6–10 px bredd, diskret vertikal linje). Cursor: `col-resize`.
- **Drag:** Bredd ändras steglöst under drag; kolumnen följer musen.
- **Ingen kebab-kolumn** för radåtgärder – använd högerklick/long-press (se §6).

### 7.2 Implementation (samma mönster överallt)

För att kolumnerna ska vara justerbara och **inte starta ihoptryckta** eller låsa sig:

1. **Initial state med standardbredder**  
   Använd **fasta startvärden** för alla kolumner (t.ex. modulnivå-konstant eller `DEFAULT_COLUMN_WIDTHS`). Initiera state med dessa så att kolumnerna aldrig börjar med flex-only (som kan krympa).  
   Exempel: `useState(() => ({ ...EXPLORER_TABLE_COLUMN_DEFAULTS }))` eller `useState(DEFAULT_COLUMN_WIDTHS)`.

2. **Inkrementell resize**  
   Vid varje **mousemove** under drag: räkna `delta = clientX - startX`, sätt `newWidth = clamp(startWidth + delta, MIN, MAX)`, anropa `setColumnWidths`, och **uppdatera ref** till `{ startX: clientX, startWidth: newWidth }`.  
   Då blir nästa delta relativt *föregående* musposition, inte klickpunkten – så resizen blir steglös och fel på första event ger inte att kolumnen slår ihop.

3. **Kolumnstil vid fast bredd**  
   När en kolumn har sparad bredd `w`, sätt i stilen:  
   `width: w`, `minWidth: w`, `maxWidth: w`, `flexGrow: 0`, `flexShrink: 0`.  
   Då kan flex-containern inte krympa kolumnen, och basstilars `maxWidth` överridas så att bredden styrs enbart av state.

4. **Handtag**  
   Ett `View` (endast webb) med `onMouseDown={(e) => startResize(columnKey, e)}`, position absolute på kolumnens högerkant, cursor `col-resize`.

### 7.3 Referensimplementationer

- **Leverantörer:** `modules/leverantorer/LeverantorerTable.tsx` (columnWidths, startResize, ref-uppdatering på mousemove).
- **Kontakter:** `components/common/ContactRegistryTable.js` (samma mönster).
- **Digitalkontrolls utforskare:** `components/common/SharePointFiles/SharePointFolderFileArea.js` (EXPLORER_TABLE_COLUMN_DEFAULTS, colStyle med width/minWidth/maxWidth, inkrementell resize). Används i Bilder, Myndigheter, Konstruktion och beräkningar, Förfrågningsunderlag, Kalkyl, Anbud m.fl.

---

## 8. Inline-redigering (om tillämpligt)

- Inline-fält i tabell: samma cell-padding (4/12), font 13px. Border-radius 0 för input i cell.
- Bekräfta: Enter sparar, Esc avbryter. Diskreta ✔ / ✕ eller knappar i raden.

---

## 9. Snabbreferens – tokens

| Element | Token | Värde |
|--------|--------|--------|
| Tabell kant | tableRadius | 0 |
| Radhöjd | tableRowHeight | 24 |
| Cell-padding V/H | tableCellPaddingVertical / Horizontal | 4 / 12 |
| Kant (wrap/header) | tableBorderColor / tableHeaderBorderColor | #e2e8f0 |
| Header-bakgrund | tableHeaderBackgroundColor | #f1f5f9 |
| Header-text | tableHeaderFontSize, tableHeaderColor | 12, #475569 |
| Rad-kant | tableRowBorderColor | #eef0f3 |
| Rad alt/hover | tableRowAltBackgroundColor, tableRowHoverBackgroundColor | #f8fafc, #eef6ff |
| Cell-text | tableCellFontSize, tableCellColor | 13, #111 |
| Kolumn-padding | COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT | 4, 6 |

---

## 10. Referenser

- **Tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026), `constants/tableLayout.js` (COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT, TABLE).
- **Referenstabeller:**  
  - `modules/leverantorer/LeverantorerTable.tsx` (resize, context menu, expand)  
  - `components/common/ContactRegistryTable.js` (samma resize-mönster)  
  - `components/common/SharePointFiles/SharePointFolderFileArea.js` – **Digitalkontrolls utforskare** (Bilder, Myndigheter, Konstruktion, FFU, Kalkyl, Anbud m.fl.; justerbar kolumnbredd enligt §7)  
  - `modules/kunder/KunderTable.tsx`  
  - `components/common/ByggdelTable.js`, `KontoplanTable.js`, `KategoriTable.js`  
  - `components/UsersTable.js` (context menu, ingen kebab)

**Viktigt:** Alla tabeller med kolumnrubriker på webb – inklusive Digitalkontrolls utforskare – ska använda samma lösning för justerbar bredd (§7) och dessa tokens så att utseende och funktion är enhetlig i hela systemet.
