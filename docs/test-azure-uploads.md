# Test-guide: Avatar & Logo Uploads till Azure/SharePoint

## 📋 Förberedelser

1. **Kontrollera `.env`-filen:**
   ```bash
   # Öppna .env och verifiera att dessa värden finns:
   EXPO_PUBLIC_AZURE_CLIENT_ID=din-client-id
   EXPO_PUBLIC_AZURE_TENANT_ID=din-tenant-id
   EXPO_PUBLIC_SHAREPOINT_SITE_URL=https://msbyggsystem.sharepoint.com/sites/DigitalKontroll
   ```

2. **Starta utvecklingsservern:**
   ```bash
   npm run web
   # Eller:
   expo start --web --port 19006
   ```

3. **Öppna webbläsarens Developer Console:**
   - **Chrome/Edge:** `F12` eller `Ctrl+Shift+I` (Windows) / `Cmd+Option+I` (Mac)
   - Gå till fliken **"Console"**
   - Du kommer se meddelanden om Azure-uploads här

---

## 🧪 Test 1: Company Logo Upload

### Steg:
1. **Logga in** i appen
2. Gå till **"Hantera företag"** (via kugghjulsikonen i header → "Hantera företag")
3. Välj **"MS Byggsystem"** i listan till vänster
4. Scrolla ner till **"Företagslogo"**
5. Klicka på **"Välj fil"** eller drag & drop en bildfil
6. Vänta på att uppladdningen slutförs

### Vad händer:
- Första gången: En popup öppnas för Azure-autentisering (Microsoft-inloggning)
  - Logga in med ditt `marcus@msbyggsystem.se`-konto
  - Godkänn behörigheter
- Filen laddas upp till: `Company/MS Byggsystem/Logos/` i SharePoint
- Du ser en varning om uppladdningen lyckades

### Så här verifierar du:

#### ✅ I Console (F12):
- **Lyckat:** `[uploadCompanyLogo] ✅ Uploaded to Azure: https://msbyggsystem.sharepoint.com/...`
- **Misslyckat (fallback):** `[uploadCompanyLogo] ⚠️ Azure upload failed, falling back to Firebase: ...`

#### ✅ I SharePoint:
1. Gå till: `https://msbyggsystem.sharepoint.com/sites/DigitalKontroll`
2. Navigera till: **Files** → **Company** → **MS Byggsystem** → **Logos**
3. Du bör se din uppladdade fil här

---

## 🧪 Test 2: User Avatar Upload

### Steg:
1. Gå till **"Hantera användare"** (via kugghjulsikonen → "Hantera användare")
2. Välj **"MS Byggsystem"** i listan (om inte redan valt)
3. Välj en användare från listan
4. Klicka på **"Redigera"**-knappen
5. Under **"Avatar"**:
   - Välj antingen en förinställd ikon, ELLER
   - Klicka på **bildikonen** (lilla ikonen med kamera/bild) för att ladda upp egen bild
6. Välj en bildfil från datorn
7. Klicka **"Spara"**

### Vad händer:
- Filen laddas upp till: `Company/MS Byggsystem/Users/{userId}/` i SharePoint
- Avatar-URL sparas i användarens profil

### Så här verifierar du:

#### ✅ I Console (F12):
- **Lyckat:** `[uploadUserAvatar] ✅ Uploaded to Azure: https://msbyggsystem.sharepoint.com/...`
- **Misslyckat (fallback):** `[uploadUserAvatar] ⚠️ Azure upload failed, falling back to Firebase: ...`

#### ✅ I SharePoint:
1. Gå till: `https://msbyggsystem.sharepoint.com/sites/DigitalKontroll`
2. Navigera till: **Files** → **Company** → **MS Byggsystem** → **Users** → `{userId}`
3. Du bör se din uppladdade avatar-fil här

---

## 🐛 Felsökning

### Problem: "Failed to get access token" eller OAuth-popup öppnas inte

**Lösning:**
- Kontrollera att `.env`-filen är korrekt konfigurerad
- Verifiera att `EXPO_PUBLIC_AZURE_CLIENT_ID` och `EXPO_PUBLIC_AZURE_TENANT_ID` är rätt
- Starta om utvecklingsservern efter att ha ändrat `.env`

### Problem: "SharePoint Site ID or URL not configured"

**Lösning:**
- Kontrollera att `EXPO_PUBLIC_SHAREPOINT_SITE_URL` är satt i `.env`
- URL bör vara: `https://msbyggsystem.sharepoint.com/sites/DigitalKontroll`

### Problem: "Permission denied" eller "Insufficient permissions"

**Lösning:**
- Verifiera att du har loggat in med korrekt Azure-konto
- Kontrollera att admin consent är beviljad för API-permissions i Azure Portal
- Verifiera att app-registreringen har `Files.ReadWrite.All` permission

### Problem: Uppladdning faller tillbaka till Firebase

**Lösning:**
- Detta är OK! Systemet faller tillbaka automatiskt om Azure misslyckas
- Kolla Console för felmeddelanden om varför Azure misslyckades
- Vanliga orsaker:
  - Ingen autentisering (första gången måste man logga in)
  - Token har gått ut (logga in igen)
  - Site URL är fel

---

## 📊 Förväntat resultat

### ✅ Lyckat test:
- Console visar: `✅ Uploaded to Azure: https://...`
- Filen syns i SharePoint på rätt plats
- Bilden visas i appen (logo i header, avatar i användarlistan)

### ⚠️ Fallback till Firebase:
- Console visar: `⚠️ Azure upload failed, falling back to Firebase`
- Filen laddas upp till Firebase Storage istället
- Bilden visas fortfarande i appen (systemet fungerar, men använder Firebase)

---

## 🎯 Nästa steg efter testning

Om testning lyckas:
- ✅ Systemet är redo för produktion
- ✅ Alla nya uploads går till SharePoint
- ✅ Befintliga filer från Firebase fungerar fortfarande

Om testning visar problem:
- Kolla Console-meddelanden
- Verifiera Azure-konfiguration i `.env`
- Kontrollera att admin consent är beviljad i Azure Portal

---

## 💡 Tips

- **Första gången** du testar kommer OAuth-popup att öppnas för autentisering
- Token cachar i 1 timme, så du behöver bara logga in igen efter 1 timme
- Om Azure misslyckas faller systemet automatiskt tillbaka till Firebase (ingen dataförlust)
- Alla Console-meddelanden börjar med `[uploadUserAvatar]` eller `[uploadCompanyLogo]` för lätt filtrering
