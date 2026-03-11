# Modal-standard (en golden rule)

**Alla modaler följer en och samma standard.** Full spec: **docs/MODAL_GOLDEN_RULE.md**.

**Referensmodal:** Lägg till leverantör – `AddSupplierPicker.js` (StandardModal)  
**Tokens:** `constants/modalTheme.js` (MODAL_THEME), `constants/modalDesign2026.js` (MODAL_DESIGN_2026)  
**Hook:** `hooks/useDraggableResizableModal.js`

---

## Kort översikt

- **Modal:** radius 8px, shadow `0 10px 30px rgba(0,0,0,0.08)`, overlay `rgba(0,0,0,0.35)` + blur 4px.
- **Banner:** Ljus `#F8FAFC`, mörk text (#0F172A), tunn (padding 5/12). Ingen bakgrund runt titel-ikon eller stäng-X.
- **Stäng:** Grå (#475569), vit text. **Avbryt:** Dimmad röd (#fef2f2, #fecaca, #b91c1c). **Spara:** Dimmad grön (#15803d), vit text. **Skapa/Primär:** Mörk (#2D3A4B), vit text.
- **Innehåll:** Padding 20px; sektionstitel/etiketter 12px; input 13px, padding 8/10.
- **ESC:** Alla modaler ska kunna stängas med Esc (standard i systemet). `useModalKeyboard` eller motsvarande.
- **Drag/resize (webb):** Dra i bannern. Resize: Windows-liknande – osynliga zoner (8px) vid kanter/hörn, cursor + subtil 1px kant vid hover (inga synliga handtag). `useDraggableResizableModal`.

Detaljer och alla värden står i **MODAL_GOLDEN_RULE.md**.
