# Modal-standard (SaaS 2026 B2B)

**Full spec och golden rule:** `docs/MODAL_GOLDEN_RULE.md` – alla nya modaler ska följa den från och med nu.

Alla modaler använder **MODAL_DESIGN_2026** och **ModalBase**.

---

## Referens

- **Komponent:** `components/common/ModalBase.js`
- **Tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026)
- **Referensmodal:** `components/common/AdminContactRegistryModal.js` (Kontaktregister + Redigera kontakt)
- **Hook för drag/resize:** `hooks/useDraggableResizableModal.js`

---

## Snabböversikt

- **Modal:** radius 8px, shadow `0 10px 30px rgba(0,0,0,0.08)`, overlay `rgba(0,0,0,0.35)` + max 4px blur.
- **Header (standard för nya modaler):** Neutral – mörk `#1E2A38`, vit text, ikon + titel (+ undertitel med "—"). Stäng (X) vit, diskret hover.
- **Stäng-knapp i footer:** Dimmad blå – bakgrund `#475569`, vit text.
- **Formulärmodaler:** Avbryt = dimmad röd (#fef2f2, #fecaca, #b91c1c). Spara = dimmad blå (#475569, vit text). Dirty-prompt vid stängning; ESC/Enter som stäng respektive spara.
- **Innehåll:** Padding 24px; sektioner 16px mellanrum. Tabeller: radius 0, radhöjd 24px, cell 4px 12px. Inline-fält i tabell: kantiga (borderRadius 0).
- **Checkbox (t.ex. Lägg till snabbt):** Av = tom ruta (square-outline, #94a3b8). På = checkbox, #0ea5e9.
- **Tangentbord:** Esc = stäng (vid dirty, fråga först). Enter = spara i formulärmodaler när möjligt.
- **Drag/resize (webb):** Header för flytt, hooken för resize-handtag.

Implementationssteg och alla detaljer står i **MODAL_GOLDEN_RULE.md**.
