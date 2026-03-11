# Analys: Golden rules för modaler vs Skapa nytt företag-modalen

**Status:** Denna analys ledde till att vi införde **en** golden rule. Aktuell standard: **docs/MODAL_GOLDEN_RULE.md**.

**Uppdatering (banner enhetlighet):** Alla modaler ska nu ha **ljus banner** (#F8FAFC), tunn, **ingen bakgrund** runt titel-ikon eller stäng-X. Referens: **Lägg till leverantör** (AddSupplierPicker / StandardModal). Både StandardModal (modalTheme.js) och ModalBase (modalDesign2026 – headerNeutral/headerNeutralCompact) använder denna stil, så alla modaler som använder dessa komponenter får samma utseende. Primärknapp = #2D3A4B (mörk, inte ljusblå).

---

## (Historisk) Analys

## 1. Finns det flera golden rules för modaler?

**Ja.** Det används i praktiken **två källor** plus olika tolkningar i koden:

### A) Dokumentation

| Källa | Innehåll |
|-------|----------|
| **docs/MODAL_GOLDEN_RULE.md** | Huvuddokument. Neutral header (40–44px), titel 15px/600. **Spara/Stäng = #475569** (dimmad blå). Avbryt = dimmad röd. ModalBase + MODAL_DESIGN_2026. |
| **docs/MODAL_STANDARD.md** | Kortversion som pekar på MODAL_GOLDEN_RULE.md. Nämner samma färger (#475569 för Spara). |
| **RULES.md §8** | Modal-standard, tema: modalTheme.js, hooks: useDraggableResizableModal, useModalKeyboard. |

### B) Design-tokens (olika värden)

| Fil | Primärknapp / Spara | Banner/header |
|-----|----------------------|---------------|
| **constants/modalDesign2026.js** | `buttonPrimaryBg: '#1976D2'` (blå) | `headerNeutral`: #1E2A38, 38px, titel 15px/600 |
| **constants/modalTheme.js** | `footer.btnBackground: ICON_RAIL.bg` (samma som banner) | Banner: ICON_RAIL.bg, titel 14px/600 |

- **MODAL_GOLDEN_RULE.md** säger alltså **#475569** för Spara.
- **modalDesign2026** har **#1976D2** som primärknapp.
- **modalTheme** har **ICON_RAIL.bg** (bannerns färg) för footer-knappar.

### C) Hur modaler bygger i koden

| Modaler | Använder | Banner | Footer Spara/Avbryt |
|---------|----------|--------|----------------------|
| CreateProjectModal | MODAL_THEME (fallback) | Mörk (#1e293b), BANNER_THEME | Avbryt dimmad röd, Spara = FOOTER_THEME (ICON_RAIL.bg) |
| EditPersonModal, PlaneringView (kund) | MODAL_THEME | MODAL_THEME.banner | Avbryt dimmad röd, Spara mörk (bannerfärg) |
| AdminContactRegistryModal, AdminCustomersModal, m.fl. | MODAL_DESIGN_2026 | D.headerNeutral | Olika; många använder D.buttonPrimaryBg (#1976D2) |
| AdminCreateCompanyModal (Skapa nytt företag) | MODAL_DESIGN_2026 (delvis) | Egen kompakt (28px, 12px/400) | Avbryt dimmad röd, Skapa = #2D3A4B (dimmad banner) |

**Slutsats:** Det finns **flera** golden rules: en i dokumentationen (#475569, 40–44px header), en i modalDesign2026 (#1976D2, 38px), och en i modalTheme (ICON_RAIL.bg, 14px titel). Olika modaler följer olika kombinationer, vilket ger osämja mellan “dimmad blå”, “ren blå” och “bannerfärg”.

---

## 2. Skillnader: Golden rules vs Skapa nytt företag-modalen

Skapa nytt företag-modalen har medvetet gjorts **kompakt** (mindre banner, mindre knappar och text). Jämförelse nedan.

### Banner (header)

| Aspekt | MODAL_GOLDEN_RULE.md | modalDesign2026 (headerNeutral) | Skapa nytt företag-modalen |
|--------|----------------------|---------------------------------|----------------------------|
| Höjd | 40–44px | 38px | **28px** |
| Padding | 8v 14h | 5v 14h | **4v 12h** |
| Titel storlek | 15px | 15px | **12px** |
| Titel vikt | 600 | 600 | **400** (normal) |
| Ikonruta | – | 17px ikon | **22×22px**, 14px ikon |
| Stäng-ikon | 20px | 20px | **18px**, padding 4 |

Modalen har alltså **lägre och mer kompakt** banner och **mindre, icke-fet** titel jämfört med både doc och tokens.

### Innehåll (body)

| Aspekt | Golden rule / MODAL_DESIGN_2026 | Skapa nytt företag-modalen |
|--------|----------------------------------|----------------------------|
| Content padding | 24px | **20px** |
| Sektionstitel (Grunduppgifter) | – (body 14px i modalTheme) | **12px, 500** |
| Etiketter | 13px (modalTheme.body) | **12px** |
| Input font | – | **13px** |
| Input padding | – | **8v 10h** (mindre än många andra) |
| Hint-text | – | **10px** |

Modalen använder **mindre padding och mindre text** i body än standard 24px/14px.

### Footer och knappar

| Aspekt | MODAL_GOLDEN_RULE.md | modalDesign2026 | Skapa nytt företag-modalen |
|--------|----------------------|-----------------|----------------------------|
| Avbryt | #fef2f2, #fecaca, #b91c1c | – | ✅ **Samma** |
| Spara/Primär | **#475569** (dimmad blå) | #1976D2 (blå) | **#2D3A4B** (dimmad bannerfärg) |
| Knapp-padding (doc) | 10px 20px | 6/18 | **4/10, 4/12** |
| Knapp-text | – | 14/600 typiskt | **12px, 500** |
| Footer padding | – | 14v 24h | **8v**, D.footer.paddingHorizontal |

Modalen följer **Avbryt** enligt doc, men **Skapa företag** är “dimmad banner” (#2D3A4B) istället för docens #475569 eller D:s #1976D2. Knapparna är **mindre** (padding och font).

### Övrigt

| Aspekt | Golden rule | Skapa nytt företag-modalen |
|--------|-------------|----------------------------|
| ModalBase | Ska användas | **Används inte** – egen layout (men samma idé: overlay, box, header, scroll, footer) |
| useDraggableResizableModal | Ja | ✅ **Ja** |
| Overlay, radius, shadow | MODAL_DESIGN_2026 | ✅ **D.overlayBg, D.radius, D.shadow** |
| Input radius | 6px | ✅ **D.inputRadius** |

---

## 3. Rekommendationer

1. **Samla golden rules på ett ställe**  
   Besluta om:
   - Spara/primärknapp: **#475569** (doc), **#1976D2** (D) eller **bannerfärg/dimmad** (modalTheme / Skapa företag).
   - Header: **en** standard (t.ex. 38px eller 40–44px, 15px/600) och eventuellt en “kompakt” variant (t.ex. 28px, 12px/400) för små modaler.

2. **Dokumentera två varianter om ni behåller båda**  
   - **Standard:** 38–44px banner, 15px/600 titel, 24px content, knappar enligt vald primärfärg.  
   - **Kompakt (t.ex. Skapa nytt företag):** 28px banner, 12px/400 titel, 20px content, mindre knappar; primärknapp “dimmad banner”.

3. **Uppdatera MODAL_GOLDEN_RULE.md**  
   - Antingen: “Primärknapp = #475569” överallt och ta bort/ändra #1976D2 i modalDesign2026 för formulärmodaler.  
   - Eller: “Primärknapp = dimmad banner (#2D3A4B eller liknande)” och ange att CreateProjectModal/Skapa företag följer det.

4. **Skapa nytt företag-modalen**  
   - Är redan **nära** golden rules (overlay, radius, Avbryt, drag/resize, input radius).  
   - Skillnaderna är **avsiktliga**: kompakt banner, mindre text/fält, mindre knappar, primärknapp i dimmad bannerfärg.  
   - Om ni inför en “kompakt modal”-variant i doc kan denna modal anges som referens för den varianten.

---

## 4. Snabbreferens – var vad står

| Vad | Var |
|-----|-----|
| “Spara = dimmad blå #475569” | MODAL_GOLDEN_RULE.md §4 och §10 |
| “Primärknapp #1976D2” | modalDesign2026.js `buttonPrimaryBg` |
| “Footer = ICON_RAIL.bg” | modalTheme.js `footer.btnBackground` |
| “Avbryt dimmad röd” | MODAL_GOLDEN_RULE.md, CreateProjectModal, AdminCreateCompanyModal |
| “Header 40–44px” | MODAL_GOLDEN_RULE.md §2 |
| “Header 38px” | modalDesign2026.js `headerNeutral.minHeight/maxHeight` |
