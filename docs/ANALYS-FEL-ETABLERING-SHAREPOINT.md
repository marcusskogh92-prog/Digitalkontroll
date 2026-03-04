# Analys: Varför etablering/SharePoint misslyckas (CORS, 403, 404)

## Sammanfattning

Felkoden och URL:erna i dina skärmdumpar visar att **appen anropar andra Firebase-projekt** än det som är konfigurerat i denna kodbas. Det förklarar 403, CORS och 404.

---

## 1. Vad felkoderna betyder

### Bild 1 – Skapa nytt företag (localhost:19006)

- **URL:** `https://us-central1-digitalkontroll-9b0f0.cloudfunctions.net/provisionCompany`
- **Status:** **403 Forbidden**
- **Meddelande:** "Origin http://localhost:19006 is not allowed by Access-Control-Allow-Origin"

**403** betyder att servern **förstod** anropet men **nekade** det. För Firebase Callable kan det bero på:

- Projektet **9b0f0** har inte `localhost` (eller localhost:19006) i **Authorized domains**, eller
- Du är inloggad mot ett **annat** projekt (t.ex. 8fd05) medan anropet gick till **9b0f0** – då stämmer inte token mot det projekt där funktionen kör.

### Bild 2 – Etablera SharePoint (localhost:8080)

- **URL:** `https://us-central1-digitalkontroll-8f42b.cloudfunctions.net/provisionCompanySharePoint`
- **Fel:** CORS – "No 'Access-Control-Allow-Origin' header", **preflight 404**

**404 på preflight** betyder att URL:en antingen:

- inte har någon funktion som svarar (t.ex. `provisionCompanySharePoint` är **inte deployad** till projekt **8f42b**), eller
- att projektet 8f42b inte är det där du deployat functions.

---

## 2. Projekt‑ID: varför det strular

I **denna kodbas** gäller överallt:

| Vad | Projekt‑ID |
|-----|------------|
| `components/firebase.js` (Firebase config) | **digitalkontroll-8fd05** |
| `.firebaserc` (default project) | **digitalkontroll-8fd05** |
| Scripts / README / GitHub workflows | **digitalkontroll-8fd05** |
| Din skärmdump "Authorized domains" | **digitalkontroll-8fd05** |

Men i **felmeddelandena** anropas:

- **digitalkontroll-9b0f0** (provisionCompany) → 403  
- **digitalkontroll-8f42b** (provisionCompanySharePoint) → 404  

Alltså: den **app som körs** (localhost:19006 / localhost:8080) använder **inte** samma projekt som i denna repo (8fd05). Den anropar 9b0f0 respektive 8f42b. Därför:

1. **403** – antingen saknas localhost på 9b0f0, eller så är token från 8fd05 ogiltig för 9b0f0.
2. **404** – på 8f42b finns troligen inte `provisionCompanySharePoint` deployad (eller du har inte deployat till 8f42b).

Konsekvens: **Bara Site skapas / inte kopplat till företag / etablering misslyckas** beror på att anropen antingen blockas (403) eller träffar fel projekt (404), så backend körs inte som tänkt eller inte alls.

---

## 3. Vad du ska göra (åtgärdslista)

### Steg 1: Använd **ett** projekt – 8fd05

- Öppna **Firebase Console** och välj projekt **digitalkontroll-8fd05**.
- Alla functions ska deployas **hit** (se nedan).
- Appen som du kör lokalt (localhost:19006 / 8080) måste använda **samma** projekt (8fd05). I denna repo gör den det om du inte överstyrt config någon annanstans.

Kontrollera i webbläsaren (F12 → Console) efter inladdning av appen. Du kan köra:

```js
firebase.app().options.projectId
```

Om du ser `digitalkontroll-9b0f0` eller `digitalkontroll-8f42b` kommer anropen gå till fel projekt. Då måste du hitta var den konfigurationen kommer ifrån (annan branch, EAS/Expo-miljö, gammal build, annan `firebaseConfig`).

### Steg 2: Deploya functions till **digitalkontroll-8fd05**

I projektets rot (där `.firebaserc` ligger):

```bash
cd functions
npm install
npx firebase use digitalkontroll-8fd05
npx firebase deploy --only functions
```

Det säkerställer att **provisionCompany** och **provisionCompanySharePoint** finns på **8fd05** (samma projekt som i firebase.js).

### Steg 3: Authorized domains (redan gjort för 8fd05)

På bilden har du redan **localhost** under Authorized domains för **digitalkontroll-8fd05**. Det räcker för 8fd05.  
Om du **fortfarande** använder 9b0f0/8f42b i appen måste du antingen:

- lägga till localhost där också, **eller**
- (rekommenderat) se till att appen använder 8fd05 så att allt hamnar i samma projekt.

### Steg 4: Testa utan lokal CORS

1. Bygg/starta appen **utan** att överstyra Firebase-projekt (så att den använder 8fd05 från firebase.js).
2. Testa **Skapa nytt företag** från localhost – då ska anropet gå till `us-central1-digitalkontroll-8fd05.cloudfunctions.net/provisionCompany`.
3. Testa **Etablera SharePoint** från SharePoint Nav – då ska anropet gå till `.../provisionCompanySharePoint` på **samma** projekt (8fd05).

Om du vill undvika localhost helt: deploya webben (Hosting) och testa på `https://digitalkontroll-8fd05.web.app` (eller din egen domän). Då är CORS sällan ett problem.

---

## 4. Varför "bara Site" / "inte kopplat till företag"

- Om **provisionCompany** får **403** når anropet aldrig backend (eller nekas) → inget företag/inget SharePoint skapas korrekt.
- Om **provisionCompanySharePoint** får **404** finns inte funktionen på det projekt som anropas → etablering kan inte köras.
- När backend **inte** körs eller körs mot fel projekt skrivs inget till `foretag/{companyId}/sharepoint_sites` → siter visas som "Ej kopplad" / under Digitalkontroll i översikten.

När **ett** projekt används (8fd05), functions är deployade dit, och localhost är tillagd där, ska både skapande av företag och "Etablera SharePoint" fungera och koppla Site + Bas till rätt företag.

---

## 5. "functions/internal: internal" + CORS 408 (localhost)

Om du ser **408 Request Timeout** och **"functions/internal: internal"** i modalen, men **siten skapas i SharePoint** (t.ex. "funkar det-Site" syns i SharePoint):

- **Orsak:** `provisionCompany` skapar företag + Site + Bas och kan ta **över 60 sekunder**. Cloud Functions standard-timeout är **60 s** – när den överskrids avbryts anropet och klienten får timeout (408). Svaret har då inte rätt CORS-hantering → du ser både timeout och CORS i konsolen. Backend hinner ofta skapa Site innan timeout, därför syns siten i SharePoint trots "fel" i appen.
- **Åtgärd:** Functions är nu satta till **180 sekunder** timeout för `provisionCompany` och `provisionCompanySharePoint`. **Deploya om** så att den nya timeouten gäller:
  ```bash
  cd functions && npx firebase deploy --only functions:provisionCompany,functions:provisionCompanySharePoint
  ```

---

## 6. "Internal error" på webben / bara Site skapas

Om det **fortfarande** blir "internal error" på www.digitalkontroll.com och bara Site skapas:

1. **Deploya senaste functions** (annars kör webben mot gammal kod som kastar vid SharePoint-fel):
   ```bash
   cd functions
   npm install
   npx firebase use digitalkontroll-8fd05
   npx firebase deploy --only functions:provisionCompany,functions:provisionCompanySharePoint
   ```
2. Efter deploy returnerar `provisionCompany` alltid **200** när företaget är skapat, även om SharePoint strular. Då får du istället en **dialog** med texten "SharePoint kunde inte etableras" och en **Detalj:** med det verkliga felmeddelandet (t.ex. token saknas).
3. **Kolla Cloud-loggar** för att se exakt var det faller:
   - Firebase Console → Functions → **Loggar** (eller Google Cloud Console → Logging).
   - Filtrera på `provisionCompany` eller `ensureCompanySharePointSites`.
   - Vanliga orsaker: `SharePoint token could not be obtained`, `SharePoint hostname is not configured`, eller Graph-fel vid skapande av Bas.

När du ser det verkliga felmeddelandet (antingen i dialogen eller i loggarna) kan du åtgärda konfigurationen (t.ex. sätta SharePoint-token i functions config).

---

## 7. Snabbkontroll i appen

I `components/firebase.js` är projektet hårdkodat till **digitalkontroll-8fd05**. Om du vill dubbelkolla vad den **körande** appen använder kan du tillfälligt logga:

```js
console.log('[Firebase] projectId', app?.options?.projectId);
```

Om du ser 9b0f0 eller 8f42b kommer anropen gå till fel projekt – då måste du ta bort var den konfigurationen kommer ifrån (annan miljö/build/config).
