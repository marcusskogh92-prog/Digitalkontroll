# Golden rule: Modaler (en standard)

**Alla modaler ska följa denna standard.** Referens för **banner och text** är **Leverantörer** (AdminSuppliersModal) och **Företagsinställningar** (AdminCompanyModal) – kompakt mörk banner, 28px höjd, titel 12px. Övrig design: mörk banner, primärknapp i bannerns färg (dimmad), ingen ljusblå.

**Referensmodaler (banner/header):** `AdminSuppliersModal.js` (Leverantörer), `AdminCompanyModal.js` (Företagsinställningar)  
**Design-tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026) – använd **headerNeutralCompact** för banner.  
**ModalBase:** `headerVariant="neutralCompact"` ger denna banner.  
**Hook:** `hooks/useDraggableResizableModal.js`

---

## 1. Modal-container

- **Border-radius:** 8px (inga pill-former).
- **Skugga:** `box-shadow: 0 10px 30px rgba(0,0,0,0.08)` – subtil.
- **Overlay:** `rgba(0,0,0,0.35)`, `backdrop-filter: blur(4px)`.

Tokens: `MODAL_DESIGN_2026.radius`, `shadow`, `overlayBg`, `overlayBlur`.

---

## 2. Header (banner)

**Samma som Leverantörer och Företagsinställningar.** Använd `ModalBase` med `headerVariant="neutralCompact"` eller tokens från `headerNeutralCompact` + `headerNeutral` (bakgrund/kant).

- **Bakgrund:** `#1E2A38` (bannerns färg).
- **Kant:** `border-bottom: 1px solid rgba(255,255,255,0.1)`.
- **Höjd:** 28px (min/max). Padding 4px vertikalt, 12px horisontellt.  
  Tokens: `MODAL_DESIGN_2026.headerNeutralCompact`.
- **Titel:** vit text (#fff), **12px**, **font-weight 400** (normal, inte fet), line-height 16px. Ikon + titel (och ev. undertitel) på samma rad.  
  Tokens: `headerNeutralCompactTitleFontSize`, `headerNeutralCompactTitleFontWeight`, `headerNeutralCompactTitleLineHeight`.
- **Ikon:** 14px. Ikonruta (om egen): 22×22px, borderRadius 6px, bakgrund `rgba(255,255,255,0.1)`.  
  Tokens: `headerNeutralCompactIconPx` (14), `headerNeutralCompactIconSize` (22).
- **Stäng-knapp (X):** Vit ikon **18px**, padding 6px, borderRadius 6px, transparent bakgrund. Hover (webb): `rgba(255,255,255,0.12)`.  
  Token: `headerNeutralCompactCloseIconPx` (18).

**Undertitel (valfritt):** separator "—" + text 12px, opacity 0.9. Samma storlek som titel.

---

## 3. Innehåll (body)

- **Padding:** 20px. Sektioner: 10–12px mellanrum.
- **Sektionstitel (t.ex. "Grunduppgifter"):** 12px, font-weight 500, färg `#334155`, margin-bottom 10px.
- **Etiketter:** 12px, färg `#64748b`, margin-bottom 4px.
- **Hint-text:** 10px, färg `#94a3b8`.

För full-bleed (t.ex. tabell): `contentStyle={{ padding: 0 }}`.

---

## 4. Footer och knappar

### Formulärmodaler (Avbryt + Spara/Skapa)

- **Avbryt:** Dimmad röd – bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c`. Border-radius 6px. **Padding 4px 10px.** Text **12px, font-weight 500**.
- **Spara / Primär action (t.ex. "Skapa företag"):** **Bannerns färg, dimmad** – bakgrund `#2D3A4B`, vit text. Border-radius 6px. **Padding 4px 12px.** Text **12px, font-weight 500**. Min-width t.ex. 96px. Ingen ljusblå (#1976D2 eller #475569).

### Enkel Stäng-knapp (ingen Avbryt)

- Samma stil som primär: mörk, bannerns färg (eller dimmad `#2D3A4B`), vit text, 6px radius, kompakt padding.

### Övriga knappar

- Border-radius 6px, inga pill. Primär: mörk bakgrund (bannerns färg / dimmad). Sekundär: outline eller ljus bakgrund.

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

- **Tangentbord:** Esc stänger (vid formulärmodal med osparade ändringar: fråga först). Enter sparar/utför primär åtgärd i formulärmodaler när fokus inte är i input/textarea.
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
| Banner (header) | Bakgrund `#1E2A38` |
| Primärknapp (Spara/Skapa/Stäng) | Bakgrund `#2D3A4B`, text vit (bannerns färg, dimmad) |
| Avbryt | Bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c` |
| Banner höjd | 28px |
| Banner titel | 12px, font-weight 400 |
| Knappar | Padding 4/10–12, text 12px, 500 |
| Content padding | 20px |
| Input | 13px, padding 8/10, radius 6px |
| Modal radius | 8px |
| Overlay | `rgba(0,0,0,0.35)` + blur 4px |
| Resize (webb) | Osynliga zoner 8px, cursor + 1px kant vid hover |

---

## 9. Referenser

- **Banner/header (referens):** `components/common/AdminSuppliersModal.js` (Leverantörer), `components/common/AdminCompanyModal.js` (Företagsinställningar). Båda använder kompakt banner – 28px, titel 12px.
- **ModalBase:** `components/common/ModalBase.js` – använd `headerVariant="neutralCompact"` för samma banner som Leverantörer/Företagsinställningar.
- **Tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026) – `headerNeutralCompact`, `headerNeutral` (bakgrund/kant).
- **Hook:** `hooks/useDraggableResizableModal.js`
- **Tabeller i modaler:** Se `docs/TABLE_GOLDEN_RULE.md` för enhetligt tabellutseende och beteende.
- **Bekräftelsemodal (radera/ersätta):** `components/common/Modals/ConfirmModal.js` – samma design för alla “Radera X?” / “Uppdatera analys?”: röd cirkel med “!”, titel, brödtext, Avbryt (dimmad röd) + Bekräfta (mörk #2D3A4B). Används för radera leverantör, kund, kontakt, byggdel, konto, kategori, uppdatera AI-analys m.m. Ingen ESC/ENTER-text under knapparna (tangenterna fungerar fortfarande).

**Viktigt:** Primärknapp är **mörk = bannerns färg** (dimmad `#2D3A4B`), **inte** ljusblå (#1976D2 eller #475569).
