# SSO – Analys: vad som är gjort och vad som återstår

## ✅ Redan implementerat (kod)

| Del | Status | Fil(er) |
|-----|--------|--------|
| Backend: verifiera id_token, hitta företag (tid → azureTenantId), hitta användare (e-post + companyId), skapa custom token | Klar | `functions/ssoEntraLogin.js` |
| Callable `ssoEntraLogin` exporterad | Klar | `functions/index.js` |
| Frontend: knapp "Logga in med arbetskonto" (webb) | Klar | `Screens/LoginScreen.js` |
| Frontend: SSO-start (redirect till Entra med openid/profile/email, PKCE, tenant common) | Klar | `services/azure/authService.js` (startSSOLogin) |
| Frontend: callback (läs code från URL, byt till id_token, anropa callable, signInWithCustomToken) | Klar | `Screens/LoginScreen.js` (useEffect) + authService (getSSOCallbackParams, exchangeCodeForSSOIdToken) |
| Firestore-index för company lookup (profil, azureTenantId) och användarsökning (users, companyId+email) | Klar | `firestore.indexes.json` |
| Dokumentation | Klar | `docs/SSO-inloggning-arbetskonto.md` |

---

## 🔲 Vad som återstår (konfiguration & deploy)

### 1. Azure App Registration

- **Redirect URI** – Ni har lagt in både `https://www.digitalkontroll.com/` och `https://digitalkontroll.com/` samt localhost som **Ensidesprogram (SPA)**. ✅
- **API-behörigheter** – Kontrollera att appen har OpenID Connect (scope **openid**, **profile**, **email**). I Azure: Appregistreringar → DigitalKontroll → API-behörigheter. Om ni redan använder appen för SharePoint kan dessa ofta redan finnas; annars lägg till "OpenID permissions" (Sign users in).

### 2. Firebase – Cloud Functions

- **Deploya functions** så att `ssoEntraLogin` finns live:
  ```bash
  cd functions && npm install && firebase deploy --only functions
  ```
- **Azure Client ID i backend**: Funktionen `ssoEntraLogin` behöver samma Client ID som klienten (för att verifiera id_token audience). Den läser i ordning:
  - `process.env.SHAREPOINT_CLIENT_ID`
  - `process.env.AZURE_CLIENT_ID`
  - `process.env.EXPO_PUBLIC_AZURE_CLIENT_ID`
  - `functions.config().azure.client_id`
  - `functions.config().sharepoint.client_id`
  
  I **Firebase/Google Cloud** sätts env normalt inte automatiskt från klientens `.env`. Sätt Client ID för Functions på ett av sätten:
  - **Rekommenderat:**  
    `firebase functions:config:set azure.client_id="ER-APP-CLIENT-ID"`
  - Eller i Google Cloud Console → Cloud Functions → (funktionen) → Redigera → Miljövariabler: `AZURE_CLIENT_ID` = er app Client ID.

### 3. Firestore-index

- Indexen för SSO (profil/azureTenantId, users/companyId+email) ligger i `firestore.indexes.json`. De skapas vid:
  ```bash
  firebase deploy --only firestore:indexes
  ```
  eller vid ett fullt `firebase deploy`. Om ni inte kört detta sedan indexen lades till, kör deploy av index en gång.

### 4. Webbapp – build & deploy

- Bygg och publicera webben så att inloggningssidan med knappen "Logga in med arbetskonto" är live:
  ```bash
  npm run build && npx firebase-tools deploy --only hosting
  ```
  (eller via er CI som deployar vid push till main.)

### 5. Data i DigitalKontroll

- **Företag:** Varje företag som ska kunna använda SSO måste ha **Azure Tenant ID** ifyllt i Företagsinställningar (fältet som sparas som `azureTenantId` i `foretag/{companyId}/profil/public`).
- **Användare:** En användare som ska logga in med arbetskonto måste redan finnas i systemet (skapad av admin) med **samma e-postadress** som arbetskontot i Microsoft.

### 6. (Valfritt) Nå sidan utan www

- För att användare ska kunna öppna `https://digitalkontroll.com` (utan www) behöver ni:
  - I **Firebase Hosting** lägga till custom domain **digitalkontroll.com** (utan www), och
  - I **DNS** peka rotdomänen mot samma hosting.
- Azure redirect URI för `https://digitalkontroll.com/` har ni redan. ✅

---

## Snabb-checklista innan första SSO-test

1. [ ] Azure: Redirect URIs för SPA (www, icke-www, localhost) – klart.
2. [ ] Azure: API-behörigheter inkl. openid, profile, email.
3. [ ] Firebase: `firebase deploy --only functions` (så att ssoEntraLogin finns).
4. [ ] Firebase: Azure Client ID satt för Functions (config eller env).
5. [ ] Firebase: `firebase deploy --only firestore:indexes` om indexen inte redan är deployade.
6. [ ] Webb: build + deploy (hosting) så att SSO-knappen är live.
7. [ ] Minst ett företag har azureTenantId ifyllt.
8. [ ] Minst en testanvändare finns med samma e-post som ett Microsoft-konto i den tenanten.

När detta är gjort ska "Logga in med arbetskonto" fungera enligt flödet i `docs/SSO-inloggning-arbetskonto.md`.
