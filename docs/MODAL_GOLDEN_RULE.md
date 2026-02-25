# Golden rule: Modaler (SaaS 2026 B2B)

**Från och med nu ska varje ny modal som skapas se ut och bete sig enligt denna standard.** Referens är **Kontaktregister** (AdminContactRegistryModal) och **Redigera kontakt** (underlagen i samma modal). Designen är stram, professionell och affärssystemlik – SaaS 2026 B2B.

**Referensmodaler:**  
- Huvudmodal med tabell: `components/common/AdminContactRegistryModal.js`  
- Formulärmodal (redigera): samma fil, Redigera kontakt-modalen  

**Komponent:** `components/common/ModalBase.js`  
**Design-tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026)

---

## 1. Modal-container (MODAL_DESIGN_2026)

- **Border-radius:** 8px (inga 12px eller större, inga pill-former).
- **Skugga:** `box-shadow: 0 10px 30px rgba(0,0,0,0.08)` – subtil, ingen glow.
- **Overlay:** `background: rgba(0,0,0,0.35)`, subtil `backdrop-blur` max 4px.

---

## 2. Header

Nya modaler ska använda **neutral header** (samma som Kontaktregister) om inte särskild anledning finns.

### Neutral header (rekommenderad standard)

- **Bakgrund:** `#1E2A38` (rail-färg).
- **Kant:** `border-bottom: 1px solid rgba(255,255,255,0.1)`.
- **Padding:** 8px vertikalt, 14px horisontellt. Min-height 40px, max-height 44px.
- **Titel:** vit text (#fff), font-size 15px, font-weight 600, line-height 18px. Ikon (t.ex. 17px) + titel på samma rad.
- **Undertitel (valfritt):** separator "—" + undertitel i vit text, opacity 0.85, font-size 12px.
- **Stäng-knapp (X):** Vit ikon, padding 6px, borderRadius 6px, transparent bakgrund, hover `rgba(255,255,255,0.12)`. Ikon 20px.

I ModalBase: `headerVariant="neutral"`, `titleIcon={<Ionicons … />}`.

### Ljus header (alternativ)

- Bakgrund `#fff`, border-bottom `#eee`, titel `#0f172a`, undertitel `#64748b`. Stäng-ikon `#64748b`.  
- Använd `headerVariant="light"` (eller utelämna för default).

---

## 3. Innehåll (body)

- **Padding:** 24px (`contentPadding`). Sektioner: 16px mellanrum (`sectionGap`).
- För full-bleed (t.ex. toolbar + tabell): `contentStyle={{ padding: 0 }}`.

---

## 4. Footer och knappar

### Stäng-knapp (huvudåtgärd att stänga modalen)

- **Utseende:** Dimmad blå/mörk – bakgrund `#475569`, vit text, ingen kant. Border-radius 6px, padding 10px 20px.
- Samma stil som Spara i formulärmodaler (enhetlig “primär” avslutningskänsla).

### Formulärmodaler (t.ex. Redigera / Lägg till)

- **Avbryt:** Dimmad röd – bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c`. Border-radius 6px.
- **Spara / Primär action:** Dimmad bannerfärg – bakgrund `#475569`, vit text, border-radius 8px, padding 10px 20px.

### Övriga knappar

- Border-radius 6px, inga pill. Primär: mörk bakgrund. Sekundär: outline eller ljus bakgrund.

---

## 5. Tabeller inuti modalen

- **Border-radius:** 0 (tabellens yttre följer content, ingen rundning på tabellkanten).
- **Radhöjd:** 24px (`tableRowHeight`). Cell-padding: 4px vertikalt, 12px horisontellt.
- **Resizable kolumner (webb):** Dra i headern mellan kolumner. Synlig resize-line (2px, `#cbd5e1`) mellan kolumnerna.
- **Inline-fält i tabell (t.ex. “Lägg till snabbt”):** Kantiga – `borderRadius: 0` på input, inte 6px.

---

## 6. Inputfält och checkboxar

- **Vanliga inputfält (formulär):** Border-radius 6px, border 1px solid #ddd, subtil focus.
- **Checkbox / toggle (t.ex. “Lägg till snabbt”):**  
  - **Av:** Tom ruta – ikon `square-outline`, färg `#94a3b8`.  
  - **På:** Ikon `checkbox`, färg `#0ea5e9`.

---

## 7. Formulärmodaler (typ Redigera / Lägg till)

När modalen är en “enkel” formulärmodal (ett formulär + Avbryt/Spara):

- **Storlek:** Tillräckligt stor så att all info syns utan scroll (t.ex. bredd 520px, minHeight 520px).
- **Stängning med osparade ändringar:** Vid stäng (X, Avbryt, klick utanför, ESC) – om något fält har ändrats, visa dialog: “Osparade ändringar” / “Vill du spara ändringarna innan du stänger?” med Avbryt (stanna), Kasta ändringar, Spara.
- **Tangentbord:**  
  - **ESC:** Samma som stäng – om dirty, fråga först.  
  - **Enter:** Sparar (samma som Spara) när Namn/obligatoriskt fält är ifyllt; använd `preventDefault` så att formuläret inte submit:ar på fel ställe.
- **Efter spara:** Visa bekräftelse (t.ex. `showNotice('… uppdaterad')`), stäng modal, uppdatera data.

---

## 8. ModalBase – återanvändbar komponent

Alla nya modaler ska använda **ModalBase** för:

- Standard radius (8px), shadow, overlay
- Header (neutral eller ljus) med titel, valfri undertitel, diskret stäng (X)
- Standard content-padding (24px) – kan överstyras med `contentStyle` för full-bleed
- Footer-plats för Stäng / Avbryt / Spara

**Drag och resize (webb):** Använd `useDraggableResizableModal` och skicka `boxStyle`, `overlayStyle`, `headerProps` och `resizeHandles` till ModalBase. Kontaktregister-modalen är referensimplementation.

---

## 9. Beteende

- **Tangentbord:** Esc stänger modalen (eller vid formulärmodal med dirty: fråga först). Enter sparar/utför primär åtgärd i formulärmodaler; i övriga modaler endast när fokus inte är i input/textarea.
- **Flytta (webb):** Dra i headern; använd `useDraggableResizableModal` och `headerProps.onMouseDown`. Stäng-knappen ska ha `onMouseDown: (e) => e.stopPropagation()`.
- **Storleksändring (webb):** Dra i höger kant, nederkant eller nedre hörn. Hooken ger synliga grip-markeringar.

---

## 10. Snabbreferens – färger och värden

| Element | Värde |
|--------|--------|
| Header neutral (banner) | `#1E2A38` |
| Stäng / Spara (dimmad) | Bakgrund `#475569`, text vit |
| Avbryt (formulärmodal) | Bakgrund `#fef2f2`, kant `#fecaca`, text `#b91c1c` |
| Inline-fält i tabell | `borderRadius: 0` |
| Checkbox av | Ikon `square-outline`, färg `#94a3b8` |
| Checkbox på | Ikon `checkbox`, färg `#0ea5e9` |
| Tabell radhöjd | 24px |
| Tabell cell-padding | 4px vertikalt, 12px horisontellt |
| Modal radius | 8px |
| Overlay | `rgba(0,0,0,0.35)` |

---

## 11. Modaler som ska uppdateras till denna standard

- AdminContactRegistryModal ✅ (referens)
- AdminCustomersModal
- AdminSuppliersModal
- AdminKontoplanModal
- AdminByggdelModal
- AdminKategoriModal
- AdminCompanyModal
- Skapa projekt, Skapa inköpsplan, Förfrågningsmall
- Övriga systemmodaler

---

## 12. Referenser

- **Komponent:** `components/common/ModalBase.js`
- **Tokens:** `constants/modalDesign2026.js`
- **Referensmodal:** `components/common/AdminContactRegistryModal.js` (huvudmodal + Redigera kontakt)
- **Hook:** `hooks/useDraggableResizableModal.js`
