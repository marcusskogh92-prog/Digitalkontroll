# Analys: Modaler och popups – enhetlig layout och funktion

Syfte: Kartlägga modaler, bekräftelsedialoger och popups så att de följer samma layout och tema.  
**Standard:** `docs/MODAL_GOLDEN_RULE.md`. **Banner:** Ljus #F8FAFC, tunn, ingen bakgrund runt titel-ikon eller stäng-X. Referens: **Lägg till leverantör** (AddSupplierPicker / StandardModal). Tokens: `constants/modalTheme.js` (StandardModal), `constants/modalDesign2026.js` (ModalBase – headerNeutral/headerNeutralCompact = ljus banner).

---

## Genomförda enhetlighetsändringar

- **ConfirmModal:** Radius 8px (enligt golden rule), Avbryt = dimmad röd (#fef2f2, #fecaca, #b91c1c). Overlay rgba(0,0,0,0.35).
- **StandardModal:** Radius 8px, overlay 0.35, blur 4px på web, samma shadow som ModalBase. Primärknapp redan #2D3A4B via MODAL_THEME.
- **InfoPopup:** Radius 8px, overlay 0.35, primärknapp #2D3A4B, Stäng = neutral grå (#f1f5f9) i linje med övriga dialoger.
- **Alert.alert → ConfirmModal:** Bekräftelser (radera/bekräfta) har bytts till ConfirmModal på flera centrala ställen (kontakt, hierarki, projekt, sektion/item, kontrolltyp, företag, användare, SharePoint arkivera m.fl.) så att utseende och Esc/Enter är enhetliga.

---

## Kategorier

| Kategori | Komponent | Användning |
|----------|-----------|------------|
| Formulärmodaler | ModalBase / StandardModal | Företag, Leverantörer, Kunder, Mallar, Användare, Skapa projekt, … |
| Bekräftelse (radera/osv.) | ConfirmModal | Alla “Är du säker?” / radera – enhetlig design. |
| Enkel info/fel | Alert.alert / showAlert | Enkla “Ok”-meddelanden (fel, “Sparad”) – kan ligga kvar. |
| Info-popup med knappar | InfoPopup | Enhetliga färger (primär #2D3A4B, Stäng neutral). |
| Kontextmeny | ContextMenu | Högerklick-menyer. |

---

## Rekommendation framåt

- **Nya bekräftelsedialoger:** Använd alltid **ConfirmModal** (danger=true för radera).
- **Nya formulärmodaler:** Använd **StandardModal** (MODAL_THEME) eller **ModalBase** med `headerVariant="neutral"` / `"neutralCompact"` – båda ger ljus banner (#F8FAFC), tunn, ingen bakgrund runt ikon eller X. **ESC stänger modalen** (standard) – StandardModal och ModalBase använder `useModalKeyboard`.
- **Övriga Alert.alert** som ännu inte bytts: Överväg att byta till ConfirmModal (för ja/nej) eller behåll för enkla “Ok”-meddelanden.

Referenser: `components/common/Modals/ConfirmModal.js`, `components/common/ModalBase.js`, `components/common/StandardModal.js`, `constants/modalTheme.js`, `constants/modalDesign2026.js`.
