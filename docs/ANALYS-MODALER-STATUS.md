# Status: Alla modaler – enhetlig banner (ljus, tunn, ingen bakgrund ikon/X)

**Golden rule:** `docs/MODAL_GOLDEN_RULE.md`. Referens: **Lägg till leverantör** (AddSupplierPicker). Banner: ljus #F8FAFC, tunn, ingen bakgrund runt titel-ikon eller stäng-X.

---

## Modaler som följer standarden (via tokens)

Alla modaler som använder **StandardModal** eller **ModalBase** med `headerVariant="neutral"` / `"neutralCompact"` får nu **samma utseende**: ljus banner, mörk text, transparent ikon och X. Tokens är uppdaterade i `modalTheme.js` (StandardModal) och `modalDesign2026.js` (ModalBase).

### StandardModal (MODAL_THEME)

| Modal | Fil |
|-------|-----|
| Lägg till leverantör (picker) | `modules/offerter/inkopsplan/components/AddSupplierPicker.js` |
| Lägg till leverantör (inköpsplan) | `modules/offerter/inkopsplan/components/AddInkopsplanSupplierModal.js` |
| E-postmall | `modules/offerter/inkopsplan/components/EmailTemplateEditorModal.js` |
| Kolumner (inköpsplan) | `modules/offerter/inkopsplan/components/InkopsplanColumnsModal.js` |
| Dokument (inköpsplan) | `modules/offerter/inkopsplan/components/InkopsplanDocumentsModal.js` |
| Strukturväljare | `modules/offerter/forfragningar/components/StructurePickerModal.js` |

### ModalBase (MODAL_DESIGN_2026 – headerNeutral/headerNeutralCompact)

| Modal | Fil | headerVariant |
|-------|-----|----------------|
| Leverantörer (admin) | `components/common/AdminSuppliersModal.js` | neutralCompact / neutral |
| Kunder (admin) | `components/common/AdminCustomersModal.js` | neutralCompact / neutral |
| Kontaktregister (admin) | `components/common/AdminContactRegistryModal.js` | neutralCompact |
| Byggdelar (admin) | `components/common/AdminByggdelModal.js` | neutralCompact |
| Kategorier (admin) | `components/common/AdminKategoriModal.js` | neutralCompact |
| Kontoplan (admin) | `components/common/AdminKontoplanModal.js` | neutralCompact |
| Mallar | `components/common/MallarModal.js` | neutralCompact |
| Redigera användare | `components/UserEditModal.js` | neutralCompact |
| Min profil | `components/common/Modals/MyProfileModal.js` | neutral |
| Resursbank | `features/planering/ResursbankModal.js` | neutralCompact |
| Skapa inköpsplan | `modules/offerter/inkopsplan/components/CreateInkopsplanModal.js` | neutralCompact |
| Utkast till förfrågan | `modules/offerter/inkopsplan/components/InquiryDraftModal.js` | neutralCompact |

### Övriga som använder MODAL_DESIGN_2026 (headerNeutral) direkt

| Modal | Fil |
|-------|-----|
| Deltagar-picker | `components/common/ParticipantPickerModal.js` (egen modal, men tokens från D – uppdaterad till ljus banner + transparent ikon, mörk text/X) |

---

## Övriga modaler (egen header eller annan komponent)

Dessa har egen header/banner eller är bekräftelse/info-dialoger. För att få samma **färg och storlek** på bannern kan de antingen bytas till StandardModal/ModalBase, eller så kan deras egna header-stilar uppdateras till #F8FAFC, tunn, ingen bakgrund ikon/X.

- **CreateProjectModal** – egen banner (BANNER_THEME)
- **AdminCreateCompanyModal** – egen kompakt header
- **DateModal** (Tidsplan) – egen header
- **ConfirmModal** – bekräftelse (röd !, Avbryt/Bekräfta) – annan typ, behöver inte samma banner
- **SimpleKontonSelectModal, SimpleByggdelSelectModal, SimpleKategoriSelectModal** – enkla pickers (kan använda ModalBase med neutral om de inte redan gör det)
- **AddByggdelModal, AddKontoplanModal, AddKategoriModal** – submodaler
- **FileActionModal, FilePreviewModal, MoveFilesModal, NewProjectModal, IsoDatePickerModal** – olika typer

---

## Sammanfattning

- **StandardModal** och **ModalBase** (neutral/neutralCompact) använder nu **ljus banner** (#F8FAFC), **tunn** höjd, **ingen bakgrund** runt titel-ikon eller stäng-X. Alla modaler i listorna ovan får detta utseende utan kodändringar i själva modalerna.
- För modaler med **egen header** (t.ex. CreateProjectModal, AdminCreateCompanyModal, DateModal): uppdatera deras header-stilar till samma färg och storlek om full enhetlighet önskas; se MODAL_GOLDEN_RULE.md §2.
