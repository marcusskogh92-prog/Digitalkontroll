# Azure / Microsoft Graph API File Service

Denna service hanterar filuppladdningar till SharePoint via Microsoft Graph API.

## 🔧 Konfiguration

### 1. Azure App Registration

1. Gå till [Azure Portal](https://portal.azure.com)
2. Navigera till **Azure Active Directory** → **App registrations**
3. Klicka på **+ New registration**
4. Fyll i:
   - **Name**: `DigitalKontroll File Storage`
   - **Supported account types**: `Accounts in this organizational directory only`
   - **Redirect URI**: 
     - Type: `Web`
     - URI: `http://localhost:19006` (för development)
     - URI: `https://your-domain.com` (för production)

### 2. Konfigurera API-behörigheter

1. I Azure Portal, gå till din App Registration
2. Klicka på **API permissions**
3. Klicka på **+ Add a permission**
4. Välj **Microsoft Graph**
5. Välj **Application permissions** (eller **Delegated permissions** om du använder OAuth)
6. Lägg till följande behörigheter:
   - `Files.ReadWrite.All` (Läs och skriv filer i SharePoint)
   - `Sites.ReadWrite.All` (Läs och skriv SharePoint-sites)
   - `User.Read` (Läs användarprofil)
7. Klicka på **Grant admin consent** (om du är admin)

### 3. Skapa Client Secret (för backend-autentisering)

**OBS:** För production, rekommenderas att använda **Firebase Functions** eller **Azure Functions** för att hantera OAuth-token exchange. Client Secret ska **ALDRIG** exponeras i client-kod!

Om du vill använda backend-autentisering:

1. I Azure Portal, gå till din App Registration
2. Klicka på **Certificates & secrets**
3. Klicka på **+ New client secret**
4. Fyll i:
   - **Description**: `DigitalKontroll File Storage Secret`
   - **Expires**: Välj expiry (rekommendation: 24 månader)
5. **KOPIERA SECRET VALUE** (den visas bara en gång!)

### 4. Hämta SharePoint Site ID

1. Gå till din SharePoint-site
2. URL:en ser ut så här: `https://yourcompany.sharepoint.com/sites/DigitalKontroll`
3. Site ID kan hämtas via Graph API eller Microsoft Graph Explorer

**Alternativt:** Använd site URL direkt (service hanterar site ID automatiskt).

### 5. Konfigurera Environment Variables

Skapa en `.env` fil (eller använd Expo environment variables):

```bash
# Azure App Registration
EXPO_PUBLIC_AZURE_CLIENT_ID=your-client-id-here
EXPO_PUBLIC_AZURE_TENANT_ID=your-tenant-id-here  # Optional, defaults to 'common'

# SharePoint Configuration
EXPO_PUBLIC_SHAREPOINT_SITE_URL=https://yourcompany.sharepoint.com/sites/DigitalKontroll
EXPO_PUBLIC_SHAREPOINT_SITE_ID=site-id-here  # Optional if using site URL

# OAuth Redirect URI
EXPO_PUBLIC_AZURE_REDIRECT_URI=http://localhost:19006  # For development
```

**Eller** uppdatera `services/azure/config.js` direkt (inte rekommenderat för production):

```javascript
export const AZURE_CONFIG = {
  clientId: 'your-client-id-here',
  tenantId: 'your-tenant-id-here',
  sharePointSiteUrl: 'https://yourcompany.sharepoint.com/sites/DigitalKontroll',
  // ...
};
```

## 📁 Filstruktur i SharePoint

Filer lagras enligt följande struktur:

```
SharePoint Site: DigitalKontroll
├── Company/{companyId}/
│   ├── Logos/
│   │   └── {timestamp}_{filename}  # Företagsloggor
│   ├── Users/{userId}/
│   │   └── {timestamp}_{filename}  # Användaravatarer
│   ├── Projects/{projectId}/
│   │   ├── Controls/{controlId}/
│   │   │   └── Photos/             # Kamerabilder från kontroller
│   │   ├── Documents/              # Projektdokument
│   │   └── Drawings/               # Ritningar
│   └── ...
```

## 🚀 Användning

### Upload fil

```javascript
import { uploadFile } from '../services/azure/fileService';

const fileUrl = await uploadFile({
  file: fileObject,
  path: `Company/${companyId}/Users/${userId}/avatar.jpg`,
  companyId: 'MS Byggsystem',
});
```

### Upload company logo

```javascript
import { uploadCompanyLogo } from '../components/firebase';

const logoUrl = await uploadCompanyLogo({
  companyId: 'MS Byggsystem',
  file: logoFile,
});
```

### Upload user avatar

```javascript
import { uploadUserAvatar } from '../components/firebase';

const avatarUrl = await uploadUserAvatar({
  companyId: 'MS Byggsystem',
  uid: 'user-id',
  file: avatarFile,
});
```

## 🔐 Säkerhet

**VIKTIGT:** För production:

1. **Använd backend-autentisering**: Client Secret ska **ALDRIG** exponeras i client-kod
2. **Använd Firebase Functions** eller **Azure Functions** för OAuth-token exchange
3. **Implementera token refresh** på backend
4. **Validera behörigheter** på backend innan fil-uploads

**Nuvarande implementation:**
- Client-side OAuth (för development/testing)
- Token refresh implementerat (men kan förbättras)
- Fallback till Firebase Storage om Azure-fel uppstår

## 🔄 Fallback till Firebase

Om Azure-upload misslyckas, faller systemet tillbaka till Firebase Storage automatiskt. Detta säkerställer att:

- Gamla filer fortfarande fungerar (från Firebase Storage)
- Nya filer försöker Azure först, sedan Firebase om Azure inte fungerar
- Systemet fungerar även om Azure inte är konfigurerat ännu

## 🐛 Troubleshooting

### "Azure Client ID not configured"
- Kontrollera att `EXPO_PUBLIC_AZURE_CLIENT_ID` är satt i `.env` eller `config.js`

### "SharePoint Site ID or URL not configured"
- Kontrollera att `EXPO_PUBLIC_SHAREPOINT_SITE_URL` eller `EXPO_PUBLIC_SHAREPOINT_SITE_ID` är satt

### "Failed to get access token"
- Kontrollera att Azure App Registration är korrekt konfigurerad
- Kontrollera att OAuth-redirect URI matchar
- Försök autentisera igen (tokens kan ha gått ut)

### "File upload failed: 401 Unauthorized"
- Token kan ha gått ut, försök autentisera igen
- Kontrollera att API-behörigheter är korrekt konfigurerade
- Kontrollera att admin consent är given för behörigheterna

## 📝 Nästa Steg

1. ✅ Azure File Service implementerad
2. ✅ OAuth-autentisering implementerad
3. ✅ User avatar uploads → Azure
4. ✅ Company logo uploads → Azure
5. ⏳ Kamerabild-uploads → Azure (kommer härnäst)
6. ⏳ Migrera gamla filer från Firebase → Azure (valfritt)
7. ⏳ Implementera backend-autentisering via Firebase Functions (för production)

## 📚 Resurser

- [Microsoft Graph API Documentation](https://docs.microsoft.com/en-us/graph/overview)
- [SharePoint REST API](https://docs.microsoft.com/en-us/sharepoint/dev/sp-add-ins/get-to-know-the-sharepoint-rest-service)
- [Azure AD App Registration](https://docs.microsoft.com/en-us/azure/active-directory/develop/quickstart-register-app)
