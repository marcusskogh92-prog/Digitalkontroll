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
- **Dubbelklick på handtag:** Kolumnen auto-anpassas till det bredaste innehållet (Excel-beteende). Se §7.3.
- **Auto-fit vid laddning:** Kolumner anpassas automatiskt till innehållet vid initial rendering. Se §7.4.
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

### 7.3 Dubbelklick på avdelare – auto-fit (Excel-beteende)

Dubbelklick på ett resize-handtag ska automatiskt bredda kolumnen så att **all text i kolumnen syns** – samma beteende som i Excel.

1. **Beräkna optimal bredd**  
   Gå igenom alla synliga rader och mät den längsta texten i kolumnen. Jämför även med kolumnrubrikens text. Funktionen `contentWidthForColumn(headerLabel, cellTexts)` beräknar:  
   ```
   maxLen = Math.max(headerLabel.length, ...cellTexts.map(t => t.length))
   width  = clamp(maxLen * CHARS_TO_WIDTH + CELL_PADDING, MIN_WIDTH, MAX_WIDTH)
   ```
   Konstanter: `CHARS_TO_WIDTH = 8`, `CELL_PADDING = COLUMN_PADDING_LEFT + COLUMN_PADDING_RIGHT + 12`, `MAX_WIDTH = 500–600`.

2. **Text-extraktion**  
   Varje tabell behöver en `getCellText(row, columnKey)`-funktion som returnerar den text som visas i en given cell. Denna ska matcha vad som faktiskt renderas (t.ex. formaterade telefonnummer, komma-separerade roller, etc.).

3. **Dubbelklick-detektion**  
   React Native Webs `onDoubleClick` på `View` fungerar inte alltid pålitligt i kombination med `onMouseDown` + `preventDefault`. Använd istället **tidsstämpel-baserad dubbelklick-detektion** direkt i `onMouseDown`:
   ```javascript
   const lastClickRef = useRef({ column: null, time: 0 });

   const startResize = useCallback((column, e, autoFitFn) => {
     e.preventDefault();
     e.stopPropagation();
     const now = Date.now();
     const last = lastClickRef.current;
     if (last.column === column && now - last.time < 400) {
       lastClickRef.current = { column: null, time: 0 };
       autoFitFn(column);
       return;  // dubbelklick → auto-fit, ingen drag
     }
     lastClickRef.current = { column, time: now };
     // starta vanlig drag-resize...
   }, [columnWidths]);
   ```
   Handtaget anropas: `onMouseDown={(e) => startResize(key, e, widenColumn)}`.

### 7.4 Auto-fit vid laddning

Kolumnerna ska **automatiskt anpassas till innehållet vid initial rendering** så att text inte klipps eller överlappar.

1. **Beräkna vid data-laddning**  
   Kör `contentWidthForColumn` för varje kolumn när data har laddats (t.ex. i en `useEffect`). Använd en `autoFitDoneRef` för att bara köra en gång:
   ```javascript
   const autoFitDoneRef = useRef(false);
   useEffect(() => {
     if (autoFitDoneRef.current || loading || !data.length) return;
     autoFitDoneRef.current = true;
     const newWidths = {};
     COLUMNS.forEach((col) => {
       const cellTexts = data.map((row) => getCellText(row, col));
       newWidths[col] = contentWidthForColumn(HEADER_LABELS[col], cellTexts);
     });
     setColumnWidths(newWidths);
   }, [data, loading]);
   ```

2. **Fallback**  
   Om data inte laddats ännu, använd `DEFAULT_COLUMN_WIDTHS` som startvärde (§7.2 punkt 1). Auto-fit ersätter dessa när data finns.

### 7.5 Referensimplementationer

- **Inköpsplan:** `modules/offerter/inkopsplan/components/InkopsplanTable.js` (dubbelklick auto-fit via `widenColumn` + `contentWidthForColumn`, `didMove`-flagga).
- **Organisation & Roller:** `features/project-phases/phases/kalkylskede/sections/oversikt/items/OrganisationRoller/OrganisationRollerView.js` (tidsstämpel-baserad dubbelklick, auto-fit vid mount, två tabelltyper).
- **Leverantörer:** `modules/leverantorer/LeverantorerTable.tsx` (columnWidths, startResize, ref-uppdatering på mousemove).
- **Kontakter:** `components/common/ContactRegistryTable.js` (samma resize-mönster).
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

**Viktigt:** Alla tabeller med kolumnrubriker på webb – inklusive Digitalkontrolls utforskare – ska använda samma lösning för justerbar bredd (§7), dubbelklick auto-fit (§7.3), auto-fit vid laddning (§7.4) och dessa tokens så att utseende och funktion är enhetlig i hela systemet.
