# Azure / Microsoft Graph API Migration Status

## ✅ Genomfört

### 1. Azure File Service Struktur ✅
- ✅ `services/azure/config.js` - Konfiguration
- ✅ `services/azure/authService.js` - OAuth-autentisering
- ✅ `services/azure/fileService.js` - Huvudfilservice med Microsoft Graph API
- ✅ `services/azure/siteService.js` - SharePoint site-skapande per företag
- ✅ `services/azure/README.md` - Dokumentation

### 2. Azure-konfiguration ✅
- ✅ Azure App Registration skapad och konfigurerad
- ✅ API-permissions: `Files.ReadWrite.All`, `Sites.ReadWrite.All`, `Sites.Create.All`
- ✅ Admin consent beviljad
- ✅ Redirect URIs: localhost + production
- ✅ `.env`-fil skapad med Client ID, Tenant ID, SharePoint Site URL

### 3. Upload-funktioner Uppdaterade ✅
- ✅ `uploadUserAvatar` → Azure (med fallback till Firebase Storage)
- ✅ `uploadCompanyLogo` → Azure (med fallback till Firebase Storage)
- ✅ Logo-uploads i `ManageCompany.js` uppdaterade

### 4. Per-företag Site-hantering ✅
- ✅ `getCompanySharePointSiteId()` - Läser siteId från Firestore
- ✅ `saveCompanySharePointSiteId()` - Sparar siteId till Firestore
- ✅ `fileService.js` läser per-företag siteId automatiskt
- ✅ Automatisk site-skapande när nytt företag skapas (integrat i `ProjectSidebar.js`)

### 5. Fallback-mekanism ✅
- ✅ Alla uploads försöker Azure först
- ✅ Fallback till Firebase Storage om Azure misslyckas
- ✅ Befintliga filer från Firebase fungerar fortfarande

## ⏳ Återstående

### 1. Kamerabild-uploads → Azure (Jag gör detta) 🔴
**Status:** Kamerabilder sparas för närvarande som base64 data URIs direkt i Firestore.

**Vad som behöver göras:**
- ⏳ Uppdatera `saveControlToFirestore()` för att ladda upp foto-URIs till Azure innan sparande
- ⏳ Hantera lokala `file://` URIs → konvertera till File/Blob → upload till Azure
- ⏳ Hantera `data:` URIs → konvertera till File/Blob → upload till Azure
- ⏳ Ersätta URIs i kontrollobjektet med Azure-URLs efter uppladdning
- ⏳ Implementera mappstruktur: `Projects/{companyId}/{projectFolder}/{projectName}/Controls/{controlId}/Photos/`

**Filer att uppdatera:**
- `components/firebase.js` - `saveControlToFirestore()` funktion
- Eventuellt `components/BaseControlForm.js` - om bilder behöver laddas upp direkt vid capture

### 2. Testning (Vi gör detta tillsammans) 🟡
- ⏳ Testa OAuth-autentisering
- ⏳ Testa user avatar upload → Azure
- ⏳ Testa company logo upload → Azure
- ⏳ Testa site-skapande när nytt företag skapas
- ⏳ Testa kamerabild-uploads (efter implementering)

### 3. Projektstruktur-skapande (Valfritt) 🟢
- ⏳ Automatisk projektmapp-skapande när nytt projekt skapas (`ensureProjectStructure()` finns redan implementerad)

### 4. Valfritt (Framtida) 🟢
- ⏳ Migrera gamla filer från Firebase → Azure (kan göras senare)
- ⏳ Implementera backend-autentisering via Firebase Functions (för production)
- ⏳ Optimera token refresh-logik
- ⏳ Implementera native authentication (för React Native)

## 📁 Filstruktur

```
services/azure/
├── config.js          # Azure konfiguration
├── authService.js     # OAuth-autentisering
├── fileService.js     # Filhantering (upload, get, delete)
└── README.md          # Dokumentation

components/firebase.js  # Uppdaterad med Azure-uploads
Screens/ManageCompany.js  # Uppdaterad med Azure-uploads
```

## 🔧 Konfiguration som krävs

För att systemet ska fungera behöver du:

1. **Azure App Registration**
   - Client ID
   - Tenant ID (eller 'common')
   - Redirect URI

2. **SharePoint Configuration**
   - Site URL (t.ex. `https://yourcompany.sharepoint.com/sites/DigitalKontroll`)
   - Eller Site ID

3. **Environment Variables** (i `.env` fil eller direkt i `config.js`):
   ```
   EXPO_PUBLIC_AZURE_CLIENT_ID=your-client-id
   EXPO_PUBLIC_AZURE_TENANT_ID=your-tenant-id
   EXPO_PUBLIC_SHAREPOINT_SITE_URL=https://yourcompany.sharepoint.com/sites/DigitalKontroll
   EXPO_PUBLIC_AZURE_REDIRECT_URI=http://localhost:19006
   ```

## 📝 Nästa Steg

1. **Konfigurera Azure** (Du gör detta)
   - Skapa Azure App Registration
   - Konfigurera behörigheter
   - Sätt environment variables

2. **Uppdatera kamerabild-uploads** (Jag gör detta)
   - Uppdatera `CameraCapture.js`
   - Uppdatera `BaseControlForm.js`

3. **Testa** (Vi gör detta tillsammans)
   - Testa alla upload-scenarier
   - Verifiera att filer laddas upp till Azure
   - Verifiera fallback till Firebase fungerar

## 🎯 Status

**Azure-konfiguration:** ✅ Klar  
**Grundstruktur:** ✅ Klar  
**Upload-funktioner (avatars, logos):** ✅ Klar  
**Per-företag site-hantering:** ✅ Klar  
**Site-skapande per företag:** ✅ Klar  
**Kamerabild-uploads:** 🔴 Återstående (bör implementeras för full SharePoint-integration)  
**Testning:** 🟡 Kan börja testa nu med avatars och logos  

## 💡 Tips

- Systemet fungerar även om Azure inte är konfigurerat än (fallback till Firebase)
- Du kan börja testa Azure-uploads så snart du har Client ID och Site URL
- Gamla filer från Firebase fungerar fortfarande (ingen migration behövs ännu)
