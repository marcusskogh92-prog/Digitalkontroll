# Golden rule: Modaler (en standard)

**Alla modaler ska följa denna standard.** Referens för **banner och utseende** är **Lägg till leverantör** (AddSupplierPicker / StandardModal): ljus, tunn banner, ingen bakgrund runt titel-ikon eller stäng-X, clean look.

**Referensmodal:** Lägg till leverantör (Inköp) – `AddSupplierPicker.js` använder `StandardModal`; tokens i `constants/modalTheme.js`.  
**Design-tokens:** `constants/modalTheme.js` (MODAL_THEME) för StandardModal; `constants/modalDesign2026.js` (MODAL_DESIGN_2026) för ModalBase – **headerNeutral** / **headerNeutralCompact** ska matcha (ljus banner).  
**Komponenter:** `StandardModal.js`, `ModalBase.js` (headerVariant="neutralCompact" eller "neutral").  
**Hook:** `hooks/useDraggableResizableModal.js`

**Ikoner (enhetligt):** Filter/kolumner: `filter-outline` (Ionicons). Papperskorg (radera): alltid röd `#b91c1c`. Se `constants/iconConstants.js`.

---

## 1. Modal-container

- **Border-radius:** 8px (inga pill-former).
- **Skugga:** `box-shadow: 0 10px 30px rgba(0,0,0,0.08)` – subtil.
- **Overlay:** `rgba(0,0,0,0.35)`, `backdrop-filter: blur(4px)`.

Tokens: `MODAL_DESIGN_2026.radius`, `shadow`, `overlayBg`, `overlayBlur`.

---

## 2. Header (banner)

**Ljus, tunn banner – samma som "Lägg till leverantör".** Alla modaler ska använda denna stil.

- **Bakgrund:** `#F8FAFC` (ljusgrå, clean).
- **Kant:** `border-bottom: 1px solid #E2E8F0`.
- **Höjd:** Tunn – padding 5px vertikalt, 12px horisontellt. Ingen tjock banner.  
  Tokens: `MODAL_THEME.banner` (StandardModal) eller `MODAL_DESIGN_2026.headerNeutral` / `headerNeutralCompact` (ModalBase).
- **Titel:** mörk text **#0F172A**, 14px, font-weight 600. Ikon + titel (och ev. undertitel) på samma rad.
- **Titel-ikon:** Ingen bakgrund runt ikonen – ikonen smälter in i bannern. Token: `iconBg: 'transparent'`.
- **Stäng-knapp (X):** Bara ett synligt X – ingen bakgrund/cirkel runt. Ikonfärg #0F172A. Token: `closeBtnBg: 'transparent'`.
- **Undertitel (valfritt):** #64748B, 12px. Separator mellan titel och undertitel: **prick (•)**, inte streck (—).

**Viktigt:** Ingen mörk banner (#1E2A38). Ingen bakgrund runt ikon eller X – båda ska smälta in i bannern.

---

## 3. Innehåll (body)

- **Padding:** 20px. Sektioner: 10–12px mellanrum.
- **Sektionstitel (t.ex. "Grunduppgifter"):** 12px, font-weight 500, färg `#334155`, margin-bottom 10px.
- **Etiketter:** 12px, färg `#64748b`, margin-bottom 4px.
- **Hint-text:** 10px, färg `#94a3b8`.

För full-bleed (t.ex. tabell): `contentStyle={{ padding: 0 }}`.

---

## 4. Footer och knappar (enhetligt i hela systemet)

- **Stäng:** Grå – bakgrund `#475569`, vit text. Border-radius 6px, kompakt padding. Använd överallt där modalen bara har en stäng-knapp.
- **Avbryt:** Dimmad röd – bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c`. Border-radius 6px. **Padding 4px 10px.** Text **12px, font-weight 500**.
- **Spara:** Dimmad grön – bakgrund `#15803d`, vit text. Border-radius 6px. **Padding 4px 12px.** Använd för Spara/Spara val i formulär och pickers.
- **Skapa / Primär action (t.ex. "Skapa företag"):** Mörk `#2D3A4B`, vit text – för skapande, inte för spara. Tokens: `buttonPrimaryBg` / `MODAL_PRIMARY_BG`.

Tokens: `constants/modalDesign2026.js` – `buttonCloseBg`, `buttonCancelBg`/`buttonCancelBorder`/`buttonCancelText`, `buttonSaveBg`/`buttonSaveColor`. `constants/modalTheme.js` – `MODAL_CLOSE_BG`, `MODAL_SAVE_BG`.

### Övriga knappar

- Border-radius 6px, inga pill. Sekundär: outline eller ljus bakgrund.

---

## 5. Inputfält

- **Border-radius:** 6px. Border 1px solid `#ddd`. Focus: subtil (t.ex. `#1976D2` för fokusring om behov).
- **Padding:** 8px vertikalt, 10px horisontellt. Font 13px, färg `#1e293b`. Margin mellan fält 12px.
- **Disabled/read-only:** Bakgrund `#f8fafc`, text `#64748b`.

---

## 6. Tabeller inuti modalen

- **Border-radius:** 0 på tabellkanten. Radhöjd 24px. Cell-padding: 4px vertikalt, 12px horisontellt.
- Inline-fält i tabell: `borderRadius: 0`.

---

## 7. Beteende

- **Tangentbord – ESC:** **Alla modaler ska gå att stänga med Esc.** Detta är standard i systemet. StandardModal och ModalBase använder `useModalKeyboard`; SystemModalProvider (t.ex. deltagar-picker) och ConfirmModal har egen ESC-listeners. Nya modaler ska antingen använda StandardModal/ModalBase eller säkerställa att Esc anropar stäng (t.ex. via `useModalKeyboard(visible, onClose, …)` eller `onRequestClose` där plattformen stödjer det).
- **En modal åt gången:** Endast en admin-modal (Leverantörer, Kunder, Kontaktregister, osv.) ska vara öppen samtidigt. AdminModalContext stänger övriga när en ny öppnas.
- **Tangentbord – Enter:** Vid formulärmodal med osparade ändringar: fråga först vid Esc. Enter sparar/utför primär åtgärd när fokus inte är i input/textarea.
- **Flytta (webb):** Dra i headern. Använd `useDraggableResizableModal`; skicka `headerProps.onMouseDown` på bannern. Stäng-knappen: `onMouseDown: (e) => e.stopPropagation()`.
- **Storleksändring (webb):** Windows-liknande resize – implementeras av `useDraggableResizableModal`. Se §7.1.

### 7.1 Resize (webb) – Windows-liknande

- **Inga synliga handtag:** Ta bort alla synliga resize-ikoner, trianglar eller grip-markeringar i kanter och hörn. Modalen ska inte se "dragbar" ut förrän användaren hovrar nära en kant.
- **Osynliga resize-zoner:** 6–8px breda zoner längs alla fyra kanter (höger, vänster, nederkant, överkant) och i alla fyra hörn. Zonerna är rent hit-test; ingen permanent visuell indikator.
- **Vid hover över resize-zon:**
  - **Cursor:** `ew-resize` (vänster/höger), `ns-resize` (överkant/nederkant), `nwse-resize` (hörn nw/se), `nesw-resize` (hörn ne/sw).
  - **Subtil markering:** En 1px linje längs aktuell kant (t.ex. `rgba(0,0,0,0.12)`). I hörn: de två mötande kanterna. Markeringen ska vara diskret och försvinna direkt när musen lämnar zonen.
- **Resize-funktionalitet:** Oförändrad – ingen layout shift, inga glitchar. Alla fyra kanter och alla fyra hörn ska kunna användas för storleksändring.
- **Implementering:** Hooken `useDraggableResizableModal` returnerar `resizeHandles`; rendera dessa i modalen (t.ex. sist i modal-boxen). Ingen egen resize-UI behövs – hooken levererar zoner, cursor och hover-styling.

---

## 8. Snabbreferens – färger och mått

| Element | Värde |
|--------|--------|
| Banner (header) | Bakgrund `#F8FAFC`, kant `#E2E8F0`, tunn (padding 5/12) |
| Titel / X-ikon | #0F172A; ingen bakgrund runt ikon eller X |
| Stäng | Bakgrund `#475569`, text vit (grå) |
| Avbryt | Dimmad röd: bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c` |
| Spara | Dimmad grön: bakgrund `#15803d`, text vit |
| Skapa/Primär (t.ex. Skapa projekt) | Bakgrund `#2D3A4B`, text vit |
| Banner titel | 14px, font-weight 600 |
| Knappar | Padding 4/10–12, text 12px, 500 |
| Content padding | 20px |
| Input | 13px, padding 8/10, radius 6px |
| Modal radius | 8px |
| Overlay | `rgba(0,0,0,0.35)` + blur 4px |
| Resize (webb) | Osynliga zoner 8px, cursor + 1px kant vid hover |

---

## 9. Referenser

- **Banner/header (referens):** Lägg till leverantör – `AddSupplierPicker.js` (använder `StandardModal`). Ljus banner #F8FAFC, tunn, ingen bakgrund runt titel-ikon eller X. Tokens: `constants/modalTheme.js` (MODAL_THEME).
- **StandardModal:** `components/common/StandardModal.js` – använder MODAL_THEME; rekommenderas för nya modaler.
- **ModalBase:** `components/common/ModalBase.js` – använd `headerVariant="neutral"` eller `"neutralCompact"`; tokens i `modalDesign2026.js` ska matcha (ljus banner).
- **Tokens:** `constants/modalTheme.js` (MODAL_THEME), `constants/modalDesign2026.js` (MODAL_DESIGN_2026) – headerNeutral/headerNeutralCompact = ljus banner.
- **Hook:** `hooks/useDraggableResizableModal.js`
- **Tabeller i modaler:** Se `docs/TABLE_GOLDEN_RULE.md` för enhetligt tabellutseende och beteende.
- **Bekräftelsemodal (radera/ersätta):** `components/common/Modals/ConfirmModal.js` – samma design för alla “Radera X?” / “Uppdatera analys?”: röd cirkel med “!”, titel, brödtext, Avbryt (dimmad röd) + Bekräfta (mörk #2D3A4B). Används för radera leverantör, kund, kontakt, byggdel, konto, kategori, uppdatera AI-analys m.m. Ingen ESC/ENTER-text under knapparna (tangenterna fungerar fortfarande).

**Viktigt:** Primärknapp är **mörk** (#2D3A4B), **inte** ljusblå (#1976D2 eller #475569). Banner ska vara **ljus** (#F8FAFC), inte mörk.
