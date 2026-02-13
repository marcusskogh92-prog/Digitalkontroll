# Golden rule: Modaler

Alla modaler i systemet ska ha samma utseende och beteende som **Företagsinställningar**. Detta gäller befintliga modaler (vid underhåll) och **alla nya modaler**.

## 1. Utseende

- **Banner (header):** Mörk bakgrund (`#0f1b2d` / `ICON_RAIL.bg`), en rad med titel och ev. undertext.
- **Text i banner:** Titel 14px, undertext 12px, vit/ljusgrå text. Punkt mellan titel och undertext.
- **Stäng-knapp (X):** Mörk bakgrund, vit ikon. I footern: **Stäng**-knappen ska vara mörk med vit text (samma färg som bannern).
- **Spara-knapp:** Mörk med vit text. Ingen ljus knapp för primära åtgärder.
- **Innehåll:** Tydliga rubriker (14px), etiketter och värden enligt `constants/modalTheme.js`.

Använd **`constants/modalTheme.js`** (MODAL_THEME) och **`components/common/StandardModal.js`** för konsekvens.

## 2. Beteende

- **Flytta:** Användaren kan klicka och dra i **bannern** för att flytta modalen (endast webb).
- **Storleksändring:** Användaren kan dra i **höger kant**, **nedre kant** eller **nedre högra hörnet** för att ändra storlek steglöst (endast webb).
- **Muspekare vid kant:** När musen är över kanten/hörnet ska muspekaren bli ett **streck med pilar** (ew-resize, ns-resize, nwse-resize) så att det syns att man kan dra för att ändra storlek.
- **Tangentbord:**
  - **Esc** stänger modalen.
  - **Enter** sparar/utför primär åtgärd, *utom* när fokus ligger i input/textarea (då sker ingen submit).
  - **Tab** och **piltangenter** ska fungera normalt inom modalen (naturlig fokusordning).

## 3. Implementation

### Nya modaler

Använd **`StandardModal`**:

```jsx
import StandardModal from '../common/StandardModal';

<StandardModal
  visible={visible}
  onClose={onClose}
  title="Min modal"
  subtitle="Kort beskrivning"
  iconName="document-text-outline"
  saveLabel="Spara"
  onSave={handleSave}
  saving={saving}
  saveDisabled={!isDirty}
  defaultWidth={800}
  defaultHeight={500}
>
  <ScrollView style={{ flex: 1 }}>{/* innehåll */}</ScrollView>
</StandardModal>
```

StandardModal ger automatiskt: mörk banner, drag i bannern, resize (kant/hörn), Esc/Enter, Stäng + Spara mörka med vit text.

### Befintliga modaler (vid refaktor)

För modaler som inte kan bytas till StandardModal direkt:

1. Importera **`useDraggableResizableModal`** och **`useModalKeyboard`**.
2. Använd **`MODAL_THEME`** från `constants/modalTheme.js` för banner, footer och textstorlekar.
3. Sätt **Stäng**- och **Spara**-knappar till mörk bakgrund och vit text (tema).
4. Lägg till keyboard: Esc → onClose, Enter → onSave (när fokus inte i input).
5. Lägg till drag (banner) och resize-handles (höger, nederkant, nedre högra hörnet) med rätt cursor (ew-resize, ns-resize, nwse-resize).

### Resize-cursors

Resize-handlarna ska ha tillräcklig hit-yta (minst 8px) och följande cursor på webb:

- Höger kant: `cursor: 'ew-resize'`
- Nederkant: `cursor: 'ns-resize'`
- Nedre högra hörnet: `cursor: 'nwse-resize'`

Implementeringen finns i **`hooks/useDraggableResizableModal.js`**.

## 4. Loading state (golden rule)

När en modal eller vy visar laddning ska en **animerad spinner + text** användas, inte enbart statisk text.

- **Komponent:** `components/common/LoadingState.js`
- **Tema:** `constants/modalTheme.js` → `LOADING_THEME` (spinnerColor, textColor, containerMinHeight)
- **Användning:**
  - I modaler (t.ex. innan innehåll har laddats): `<LoadingState message="Laddar…" size="large" />`
  - Inline / mindre ytor: `<LoadingState message="Laddar siter…" size="small" minHeight={80} />`
- **Utseende:** ActivityIndicator (mörk #1e293b), centrerad, med valfri text under (standard "Laddar…", färg #64748b).

## 5. Referens

- **Utseende:** Företagsinställningar (AdminCompanyModal) när den är öppen.
- **Tema:** `constants/modalTheme.js`
- **Komponent:** `components/common/StandardModal.js`
- **Loading:** `components/common/LoadingState.js`, `LOADING_THEME` i modalTheme.js
- **Hooks:** `hooks/useDraggableResizableModal.js`, `hooks/useModalKeyboard.js`
