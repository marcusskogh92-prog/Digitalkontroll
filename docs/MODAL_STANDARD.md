# Modal-standard (en golden rule)

**Alla modaler följer en och samma standard.** Full spec: **docs/MODAL_GOLDEN_RULE.md**.

**Referensmodal:** `components/common/AdminCreateCompanyModal.js` (Skapa nytt företag)  
**Tokens:** `constants/modalDesign2026.js` (MODAL_DESIGN_2026)  
**Hook:** `hooks/useDraggableResizableModal.js`

---

## Kort översikt

- **Modal:** radius 8px, shadow `0 10px 30px rgba(0,0,0,0.08)`, overlay `rgba(0,0,0,0.35)` + blur 4px.
- **Banner:** Mörk `#1E2A38`, vit text. Standard kompakt: 28px höjd, titel 12px normal (400).
- **Avbryt:** Dimmad röd (#fef2f2, #fecaca, #b91c1c).
- **Spara/Skapa/Primär:** **Bannerns färg, dimmad (#2D3A4B)**, vit text – **inte ljusblå**.
- **Innehåll:** Padding 20px; sektionstitel/etiketter 12px; input 13px, padding 8/10.
- **Drag/resize (webb):** Dra i bannern. Resize: Windows-liknande – osynliga zoner (8px) vid kanter/hörn, cursor + subtil 1px kant vid hover (inga synliga handtag). `useDraggableResizableModal`.

Detaljer och alla värden står i **MODAL_GOLDEN_RULE.md**.
