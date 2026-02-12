# Modal-standard (Golden Rule)

Alla modaler i Digitalkontroll ska följa samma utseende och beteende som **Företagsinställningar** (AdminCompanyModal). Detta dokument beskriver hur man implementerar och underhåller standarden.

## Referens

- **Referensmodal:** `components/common/AdminCompanyModal.js`
- **Tema:** `constants/iconRailTheme.js` (ICON_RAIL)
- **Hook för drag/resize:** `hooks/useDraggableResizableModal.js`

---

## 1. Utseende

### Banner (header)

- **Bakgrund:** `ICON_RAIL.bg` (#0f1b2d)
- **Padding:** `paddingVertical: 7`, `paddingHorizontal: 14`
- **Titel:** `fontSize: 14`, `fontWeight: '600'`, `color: ICON_RAIL.iconColorActive` (vit)
- **Undertitel:** `fontSize: 12`, `color: ICON_RAIL.iconColor`
- **Titel + undertitel:** alltid på en rad (flexDirection: 'row', numberOfLines={1}, ev. punkt mellan)
- **Ikonruta:** 28×28 px, `borderRadius: ICON_RAIL.activeBgRadius` (8), `backgroundColor: ICON_RAIL.activeBg`, ljus/vit ikon
- **Stäng-ikon (X):** samma mörka bakgrund som banner (t.ex. `ICON_RAIL.activeBg`), vit ikon, `padding: 5`

### Innehåll

- Samma textstorlek och typografi som i Företagsinställningar (t.ex. sectionTitle 14px, infoLabel 13px).

### Footer

- **Stäng-knapp:** mörk som bannern – `backgroundColor: ICON_RAIL.bg`, `borderColor: ICON_RAIL.bg`, vit text (`color: '#fff'`), `fontWeight: '600'`
- **Spara / primär knapp:** samma mörka stil som Stäng
- **Avvikande primär:** om det behövs disabled-state, använd samma stil med `opacity: 0.5`

---

## 2. Tangentbord

- **Esc:** Stänger modalen. Använd `onRequestClose={onClose}` på `<Modal>` och ev. `window.addEventListener('keydown', ...)` för Escape som anropar `onClose`.
- **Enter:** Utför primär action (t.ex. Spara) endast när fokus *inte* är i input/textarea/select – annars risk för oavsiktlig submit.
- **Tab / piltangenter:** Fånga inte Tab eller piltangenter i onKeyDown om det inte behövs, så att fokusnavigering och formulär fungerar.

---

## 3. Drag och storleksändring (webb)

- **Flytta:** Användaren ska kunna dra modalen genom att klicka och hålla i **bannern** och flytta musen. Använd `useDraggableResizableModal`: koppla `headerProps.onMouseDown` till header-View och `boxStyle`/`overlayStyle` till overlay och box.
- **Storlek:** Högerkant (bredd), nederkant (höjd), nedre högra hörnet (båda). Steglös ändring. Hooken returnerar `resizeHandles` som ska renderas inuti modal-boxen.
- **Resize-cursor:** När musen är över kant eller hörn ska muspekaren bli:
  - Höger kant: `cursor: 'ew-resize'` (↔)
  - Nederkant: `cursor: 'ns-resize'` (↕)
  - Nedre högra hörnet: `cursor: 'nwse-resize'` (↘↖)
  Dessa sätts i `useDraggableResizableModal` på resize-handlarna. Stäng-knappen (X) ska ha `onMouseDown: (e) => e.stopPropagation()` så att klick på X inte startar drag.

På **native** (ej webb) används inte drag/resize; hooken returnerar tomma värden.

---

## 4. Implementationssteg för nya eller befintliga modaler

1. Importera `ICON_RAIL` från `constants/iconRailTheme` och (på webb) `useDraggableResizableModal` från `hooks/useDraggableResizableModal`.
2. Använd samma header-struktur och färger som i AdminCompanyModal (mörk banner, titel 14px, undertitel 12px, en rad, mörk stäng-ikon).
3. Använd samma footer-stil för Stäng och Spara (mörk knapp, vit text).
4. På webb: anropa `useDraggableResizableModal(visible, { defaultWidth, defaultHeight, minWidth, minHeight })` och applicera `boxStyle`, `overlayStyle`, `headerProps` och rendera `resizeHandles`.
5. Säkerställ Esc (onRequestClose) och Enter (vid behov, med fokuskontroll) enligt avsnitt 2.

---

## 5. Modaler som redan följer standarden

- AdminCompanyModal (Företagsinställningar)
- AdminByggdelModal
- AdminKontoplanModal
- AdminKategoriModal

Övriga modaler ska uppdateras till denna standard vid nästa ändring enligt RULES.md punkt 8.
