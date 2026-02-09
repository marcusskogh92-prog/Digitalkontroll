Quick notes for deploying Cloud Functions (DigitalKontroll)

1) Install dependencies

```bash
# Functions: provisionCompany

This folder contains Cloud Functions for Digitalkontroll.

This repo now includes a callable `provisionCompany` function that provisions a new company when invoked by an authenticated client.

Quick steps

1) Install dependencies

```bash
cd functions
npm install
```

If you want, I can help run the emulator locally (if you want me to run commands) or guide you through `firebase deploy` interactively.
Additional developer steps to resolve emulator warnings

1) Update Firebase CLI and login

```bash
npm i -g firebase-tools
firebase login
```

2) Initialize local emulators (only needs to be done once)

```bash
cd .. # project root
firebase init emulators
```

Enable `auth` and `firestore` in the init wizard so the auth emulator can start.

3) Optionally set a superadmin user (server/admin) for testing

You can run the helper script in this folder (requires credentials):

```bash
# Set environment variable to your service account JSON if needed
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/serviceAccount.json"
cd functions
node setSuperadmin.js marcus.skogh@msbyggsystem
```

4) Start emulators and test

```bash
cd functions
npx firebase emulators:start --only functions,firestore,auth --project digitalkontroll-8fd05
```

Then, in another terminal run the test script:

```bash
cd functions
export FIRESTORE_EMULATOR_HOST=localhost:8080
export FIREBASE_AUTH_EMULATOR_HOST=localhost:9099
node testCall.js
```

2) Run emulator for testing

```bash
cd functions
npx firebase emulators:start --only functions,firestore,auth
```

3) Deploy to Firebase

```bash
# Ensure firebase-tools is installed and you are logged in/select the correct project
npm i -g firebase-tools
firebase login
firebase use --add
cd functions
npm install
firebase deploy --only functions:provisionCompany
```

Testing notes

- The callable expects `{ companyId, companyName }` and requires the caller to be authenticated.
- For local testing, use the emulator and call the function from the app while the emulator is running.

Security notes

- The function runs with Admin SDK privileges. Ensure your Firebase project credentials and IAM are secured.
- The client also performs an optimistic `saveCompanyProfile` write; the repo `firestore.rules` has been updated to allow authenticated users to create a new company `profil` document. Subsequent updates are restricted to company members.
- If you require stricter control over who can create companies, add server-side allowlist checks in `provisionCompany` (e.g., validate caller email against a list in Firestore).

If you want, I can help run the emulator locally or walk through `firebase deploy` on your machine.

---

## SharePoint (createSharePointSite och provisionCompany)

För att skapa siter via "+ Ny site" eller vid företagsskapande måste Cloud Functions ha SharePoint-konfiguration.

### Steg för steg – alternativ A: Client credentials (rekommenderat, ingen access token)

Backend hämtar själv en token med Azure App:ens **Tenant ID**, **Client ID** och **Client Secret**. Inget behov av att klistra in en tillfällig access token.

Kör alla kommandon från **projektets rot** (mappen där `firebase.json` ligger).

1. **Sätt SharePoint-URL** (ersätt med er egen om den skiljer sig):
   ```bash
   firebase functions:config:set sharepoint.site_url="https://msbyggsystem.sharepoint.com/sites/DigitalKontroll"
   ```

2. **Sätt Tenant ID** (Katalog-ID från Azure-appens översikt):
   ```bash
   firebase functions:config:set sharepoint.tenant_id="7cc624b0-5031-459a-b8a9-aa23a72cffdb"
   ```
   (Ersätt med ert Katalog-ID (klientorganisations-ID) från Azure.)

3. **Sätt Client ID** (Program-ID från Azure-appens översikt):
   ```bash
   firebase functions:config:set sharepoint.client_id="6c4578e5-3d26-47c1-a5c1-9d4ddf847df8"
   ```
   (Ersätt med ert Program-ID (klient) från Azure.)

4. **Sätt Client Secret** – värdet från Azure → **Certifikat och hemligheter** (kopia av "Värde", inte "Hemlighets-ID"):
   ```bash
   firebase functions:config:set sharepoint.client_secret="DITT_CLIENT_SECRET_VÄRDE"
   ```
   (Ersätt med det faktiska secret-värdet. Om du inte ser det måste du skapa en ny hemlighet i Azure och kopiera värdet direkt.)

5. **Deploya funktionerna:**
   ```bash
   firebase deploy --only functions:createSharePointSite,functions:provisionCompany
   ```

6. **Testa:** Öppna DigitalKontroll → välj företag → SharePoint → **"+ Ny site"** → ange namn.

**Azure-appen** måste ha API-behörighet **Sites.Create.All** (Microsoft Graph, Application permission). Kontrollera under **API-behörigheter** i Azure.

---

### Steg för steg – alternativ B: Statisk access token (kortlivad)

Om du istället vill använda en färdig access token (gäller typ 1 timme):

1. Sätt `sharepoint.site_url` (som ovan).
2. Sätt token en gång:  
   `firebase functions:config:set sharepoint.provision_access_token="DIN_ACCESS_TOKEN_HÄR"`
3. Deploya:  
   `firebase deploy --only functions:createSharePointSite,functions:provisionCompany`

Token måste ha scope **Sites.Create.All**. Efter ~1 timme måste du hämta en ny token och sätta + deploya igen om du inte använder client credentials (alternativ A).

---

**Sätt konfiguration (välj ett sätt):**

### A) Firebase config (rekommenderat)

Kör från **projektets rot** (där `firebase.json` ligger):

```bash
# Hostname/URL – använd er befintliga SharePoint-tenant-URL (t.ex. er DK Bas- eller webbplats-URL)
firebase functions:config:set sharepoint.site_url="https://msbyggsystem.sharepoint.com/sites/DigitalKontroll"

# Token – en Graph access token med behörighet Sites.Create.All (app-only eller delegerad)
firebase functions:config:set sharepoint.provision_access_token="ER_GRAPH_ACCESS_TOKEN"
```

Sedan deploya om funktionerna så att de får den nya config:

```bash
firebase deploy --only functions:createSharePointSite,functions:provisionCompany
```

(Ersätt URL och token med era egna värden. Token kan vara en statisk token från Azure App-registrering med client credentials, eller motsvarande.)

### B) Miljövariabler i Google Cloud Console

1. Gå till [Google Cloud Console](https://console.cloud.google.com) → projektet **digitalkontroll-8fd05** → **Cloud Functions**.
2. Öppna funktionen **createSharePointSite** (och ev. **provisionCompany**) → **Redigera**.
3. Under **Konfiguration** → **Miljövariabler** lägg till:
   - `SHAREPOINT_SITE_URL` = `https://msbyggsystem.sharepoint.com/sites/DigitalKontroll` (eller er tenant-URL)
   - `SHAREPOINT_PROVISION_ACCESS_TOKEN` = er Graph access token
4. Spara och vänta tills funktionen är omdeployad.

**Värden som används i koden:** `sharedConfig.js` läser hostname från `SHAREPOINT_SITE_URL` eller `sharepoint.site_url`; token från `SHAREPOINT_PROVISION_ACCESS_TOKEN` eller `sharepoint.provision_access_token`. URL behöver bara peka på er tenant (t.ex. vilken site som helst under `*.sharepoint.com`); hostname blir `msbyggsystem.sharepoint.com`.
