# Fas ut gamla ManageCompany – vad som ska kopplas om

Syfte: använd bara **Superadmin-panelen + Företagsinställningar-modalen** (AdminCompanyModal). Den fullskärmsvyn **ManageCompany** ska inte längre anropas.

---

## 1. HomeScreen.js

| Var | Nuvarande beteende | Önskat beteende |
|-----|---------------------|------------------|
| **handleRegisterItemPress** – Byggdelar, Kontoplan, Kategorier | Om `openByggdelModal`/`openKontoplanModal`/`openKategoriModal` finns → modal. Annars `navigate('ManageCompany', { focus: 'byggdel'|'kontoplan'|'kategorier' })`. | Behåll modal som primär. **Fallback:** anropa `openCompanyModal(cid, 'register')` om det finns, annars t.ex. visa toast "Öppna från Register-panelen" eller lämna oförändrat. |
| **handleAdminItemPress** – integrationer (SharePoint) | `openCompanyModal(cid, 'sharepoint')` eller fallback ManageCompany. | **Fallback:** inte navigera till ManageCompany. T.ex. `openCompanyModal(cid, 'sharepoint')` om cid finns, annars sätta rail till superadmin. |
| **handleAdminItemPress** – foretagsinstallningar | `openCompanyModal(cid)` eller fallback ManageCompany (showCompanyList / companyId). | **Fallback:** inte ManageCompany. T.ex. öppna modal med första företaget för superadmin, eller `openCompanyModal(cid)`. |
| **handleAdminItemPress** – `item.route === 'ManageCompany'` (generisk) | Superadmin → ManageCompany showCompanyList, annars ManageCompany companyId. | Ersätt med: superadmin → öppna modal (t.ex. första företaget eller ingen companyId), annars `openCompanyModal(cid)`. |
| **Företagskontextmeny "Öppna i full vy"** (`open_full`) | `navigate('ManageCompany', { companyId: c?.id })`. | Byt till `openCompanyModal(c?.id)` så att samma företag öppnas i modalen istället. |

---

## 2. HeaderAdminMenu.js

| Var | Nuvarande beteende | Önskat beteende |
|-----|---------------------|------------------|
| Klick på **"Företag"** (manage_company) | `navigation.navigate('ManageCompany')`. | Anropa `openCompanyModal(cid)` med nuvarande `cid` (från AsyncStorage). Om superadmin och ingen cid, t.ex. `openCompanyModal()` eller öppna create-modal. |

---

## 3. HomeHeader.js (Register-dropdown)

| Var | Nuvarande beteende | Önskat beteende |
|-----|---------------------|------------------|
| Byggdelar | `openByggdelModal(cid)` else `navigate('ManageCompany', { focus: 'byggdel' })`. | Behåll modal. **Fallback:** `openCompanyModal(cid, 'register')` om tillgänglig. |
| Kontoplan | `openKontoplanModal(cid)` else ManageCompany kontoplan. | Som ovan, fallback till modalen med flik register. |
| Kategorier | `openKategoriModal(cid)` else ManageCompany kategorier. | Som ovan. |

---

## 4. AdminSidebar.js

AdminSidebar används **bara** när man är på skärmen **ManageCompany** (via MainLayout). När ManageCompany fasas ut visas denna sida inte längre, så **inga användare når AdminSidebar**. Därför behöver du inte ändra AdminSidebar för att “koppla om” – den används bara inifrån ManageCompany.

Om du senare tar bort ManageCompany-skrärmen helt kan du:
- antingen **ta bort** AdminSidebar (och dess anrop från MainLayout),  
- eller **låta** den vara kvar om MainLayout används av andra skärmar med `adminMode` (då måste de skärmarna inte navigera till ManageCompany).

---

## 5. GlobalSidePanelContent.js

Här är det bara **konfiguration** (route: `'ManageCompany'`, focus: …). Själva navigationen sker i HomeScreen (`handleRegisterItemPress`, `handleAdminItemPress`).  
Ingen kod här anropar `navigate('ManageCompany')`. När alla anrop till ManageCompany är borta kan du om ni vill byta `route` till t.ex. `'CompanyModal'` eller bara låta den vara för aktiv-markering; det påverkar inte fasningen.

---

## 6. App.js

| Var | Nuvarande beteende | Önskat beteende |
|-----|---------------------|------------------|
| **Stack.Screen name="ManageCompany"** | Visar ManageCompany-komponenten. | **Variant A:** Behåll skärmen men gör komponenten till en **redirect-stub** som t.ex. går tillbaka (goBack) och anropar `openCompanyModal` (kräver att stub får companyId från route params och tillgång till context). **Variant B:** Ta bort Screen och alla navigationsanrop till ManageCompany (se ovan). |
| **Breadcrumb/segments** för `currentRouteName === 'ManageCompany'` | Visar "Företag" och företagsnamn. | När ManageCompany inte längre används kan du ta bort detta block eller ersätta med segment för modalen om ni visar den någonstans i breadcrumb. |

---

## 7. ManageCompany.js

- **Om alla anrop** (enligt punkt 1–3 och 6) **är omkopplade** så att ingen navigerar till ManageCompany, kan du antingen:
  - **Ta bort** skärmen (och importen i App.js), eller  
  - **Ersätta** innehållet med en enkel stub som t.ex. visar "Företagsinställningar öppnas i modalen" och anropar goBack.
- **MainLayout** med **AdminSidebar** används idag inifrån ManageCompany; om ManageCompany tas bort används inte den layouten för denna vy längre.

---

## Sammanfattning – åtgärder i prioritetsordning

1. **HomeScreen.js** – Ta bort alla fallbacks som gör `navigate('ManageCompany', …)`. Ersätt med `openCompanyModal(cid, tab)` eller lämplig hantering. Ändra "Öppna i full vy" till `openCompanyModal(c?.id)`.
2. **HeaderAdminMenu.js** – Byt "Företag" från `navigate('ManageCompany')` till `openCompanyModal(cid)` (ev. med cid från AsyncStorage/layout).
3. **HomeHeader.js** – Fallbacks för Byggdelar/Kontoplan/Kategorier: använd `openCompanyModal(cid, 'register')` istället för ManageCompany.
4. **App.js** – Antingen ManageCompany som redirect-stub, eller ta bort Stack.Screen och alla referenser till ManageCompany.
5. **ManageCompany.js** – Stubba eller ta bort; ta bort eller behåll AdminSidebar/MainLayout beroende på om andra skärmar använder dem.

När detta är gjort används i praktiken bara panelen + Företagsinställningar-modalen, och gamla ManageCompany är fasade ut.
