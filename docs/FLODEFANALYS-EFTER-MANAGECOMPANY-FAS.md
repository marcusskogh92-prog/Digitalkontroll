# Flödesanalys efter att ManageCompany kopplats bort

Analys av att alla vägar nu går via **Företagsinställningar-modalen** (AdminCompanyModal) eller **redirect-stub** istället för den gamla ManageCompany-skärmen.

---

## 1. Ingångar som använder modalen korrekt

| Källa | Åtgärd | Flöde |
|-------|--------|--------|
| **HomeScreen** – Register (Byggdelar/Kontoplan/Kategorier) | Klick på Byggdelar, Kontoplan, Kategorier | `openByggdelModal(cid)` / `openKontoplanModal(cid)` / `openKategoriModal(cid)` eller fallback `openCompanyModal(cid, 'register')`. ✅ |
| **HomeScreen** – Admin-panelen | Företagsinställningar, Integrationer (SharePoint), Planering, Användare, generisk ManageCompany | `openCompanyModal(cid)` eller `openCompanyModal(cid, tab)`. ✅ |
| **HomeScreen** – Företagskontextmeny | "Öppna i popup" / "Öppna i full vy" | `openCompanyModal(c?.id)`. ✅ |
| **HomeScreen** – Superadmin: klick på företag i listan | Öppna företag | `openCompanyModal(company?.id)`. ✅ |
| **HomeScreen** – Superadmin: "Skapa nytt företag" | Öppna skapa-företag-modalen | `openCreateCompanyModal()`. ✅ |
| **HeaderAdminMenu** | Menypost "Företag" | `openCompanyModal(cid)` (cid från AsyncStorage). ✅ |
| **HomeHeader** – Register-dropdown (native + web) | Byggdelar, Kontoplan, Kategorier | Samma som HomeScreen: modaler eller `openCompanyModal(cid, 'register')`. ✅ |

Alla dessa anropar **aldrig** `navigate('ManageCompany')`.

---

## 2. Redirect-stub (App.js)

När något **ändå** navigerar till skärmen `ManageCompany` (t.ex. gammal länk, breadcrumb eller kod som inte uppdaterats):

- **ManageCompanyRedirect** körs (Stack.Screen använder denna komponent).
- Den läser `route.params` (companyId, focus, createNew).
- Om `params.createNew` → anropar `openCreateCompanyModal()`.
- Annars → anropar `openCompanyModal(companyId, focus)`.
- Anropar sedan `navigation.goBack()`.

Resultat: användaren lämnar direkt "ManageCompany"-vyn och får istället rätt modal öppen. ✅

---

## 3. AdminCompanyModal vid tomt företag

- När modalen öppnas **utan** valt företag (`visible && !cid`), t.ex. superadmin klickar "Företag" utan valt företag:
- Modalen visar rubriken "Företagsinställningar" och texten **"Välj ett företag i listan till vänster."**
- Ingen profil laddas, inget kraschar. ✅

---

## 4. Kvarvarande referenser till ManageCompany (ofarliga)

| Plats | Hur det används | Status |
|------|------------------|--------|
| **GlobalSidePanelContent.js** | `route: 'ManageCompany'` för att markera aktiv post i sidopanelen. | Aktiv-höjning för "Företagsinställningar" visas nästan aldrig eftersom vi inte stannar på ManageCompany. Rent kosmetiskt; inget fel. |
| **HomeHeader.js** (web) | `items` har fortfarande `screen: 'ManageCompany'` för byggdelstabell/kontoplan. | Klick hanteras av if/else med `openByggdelModal`/`openCompanyModal` – använder **inte** `it.screen` för dessa poster. ✅ |
| **App.js** – breadcrumb | `currentRouteName === 'ManageCompany'` för segment. | I praktiken sällan sant (redirect + goBack). Breadcrumb-länkar som navigerar till ManageCompany triggar redirect + modal. ✅ |
| **AdminSidebar.js** | `navigate('ManageCompany', …)` och `createNew: true`. | AdminSidebar visas bara inuti den **gamla** ManageCompany-skärmen, som aldrig renderas. Därför är denna kod i praktiken död. ✅ |
| **ManageCompany.js** (själva skärmen) | Används inte längre som Stack-komponent. | Finns kvar på disk men körs inte. Kan tas bort eller behållas för referens. |

---

## 5. Sammanfattning

- **Alla användarflöden** som tidigare gick till ManageCompany går nu till Företagsinställningar-modalen eller till rätt under-modal (Kontoplan, Byggdelar, Kategorier, SharePoint, Användare, Planering).
- **Gamla länkar** till ManageCompany (med eller utan companyId/focus/createNew) hanteras av redirect-stubben och ger rätt modal + tillbaka-navigering.
- **Tomt företag** (t.ex. superadmin utan valt företag) ger tydlig text i modalen istället för fel.
- Inga kvarvarande referenser till ManageCompany **bryter** flödet; några är bara konfig/label eller död kod (AdminSidebar).

Om du senare vill städa: du kan ta bort eller arkivera `Screens/ManageCompany.js` och ta bort AdminSidebar från MainLayout om inget annat använder den.
