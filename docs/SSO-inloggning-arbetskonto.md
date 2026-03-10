# SSO – Logga in med arbetskonto (Microsoft Entra)

DigitalKontroll stöder inloggning med **Logga in med arbetskonto** (Microsoft Entra / Azure AD). Endast **befintliga användare** kan logga in via SSO (Alternativ A): användaren måste först läggas till av administratör med sin e-postadress.

## Flöde

1. Användaren klickar på **Logga in med arbetskonto** på inloggningssidan (webb).
2. Omdirigering till Microsoft-inloggning (tenant `common` – vilket företag som helst).
3. Efter inloggning + ev. MFA skickas användaren tillbaka till appen med en `code`.
4. Appen byter `code` mot `id_token` (PKCE, ingen client_secret i klienten).
5. Appen anropar Cloud Function `ssoEntraLogin` med `id_token`.
6. Backend verifierar token, hittar företag via `tid` → `foretag/{companyId}/profil` med `azureTenantId`, hittar användare via e-post i det företaget, skapar Firebase custom token.
7. Klienten loggar in med `signInWithCustomToken` och användaren är inloggad.

## Krav

### Azure App Registration

- Samma app (Client ID) som används för SharePoint kan användas.
- Under **Autentisering** → **Redirect URI** måste följande vara tillagda (plattform: **Single-page application**):
  - `https://digitalkontroll.com/` (utan www)
  - `https://www.digitalkontroll.com/` (med www)
  - `https://digitalkontroll-8fd05.web.app/` (om ni använder Firebase-URL)
  - Vid lokal utveckling: `http://localhost:19006/` (eller den port ni använder)
- Under **API-behörigheter**: OpenID Connect (openid, profile, email) behövs för inloggning. Ev. redan aktiverat.

### DigitalKontroll

- **Företag**: Varje företag som ska kunna använda SSO måste ha **Azure Tenant ID** (Wilzéns tenant, etc.) ifyllt under Företagsinställningar → **Azure Tenant ID** (`foretag/{companyId}/profil/public` → `azureTenantId`).
- **Användare**: Användaren måste redan finnas i systemet (skapad av admin med samma e-post som arbetskontot). Roll och behörighet sätts vid skapande som vanligt.

### Firebase

- Cloud Function **ssoEntraLogin** måste vara deployad (`firebase deploy --only functions`).
- I Firebase Functions-konfiguration eller miljö måste **Azure Client ID** finnas (samma som `EXPO_PUBLIC_AZURE_CLIENT_ID` i klienten), t.ex. `functions.config().azure.client_id` eller env `AZURE_CLIENT_ID`.

## Felmeddelanden

- **"Företaget är inte kopplat till DigitalKontroll"** – Inget företag i er databas har det här Azure-tenantens ID i `azureTenantId`. Kontrollera Företagsinställningar för det företag användaren tillhör.
- **"Du har inget konto. Kontakta din administratör för att bli tillagd."** – Användaren finns inte som användare i det företag som tenant-ID:t pekar på. Lägg till användaren med samma e-postadress under Administration → Användare.
- **"Kunde inte skapa session. Försök igen."** – Backend kunde inte skapa Firebase custom token. Om Cloud Logs visar `auth/insufficient-permission` och `iam.serviceAccounts.signBlob denied` måste IAM-behörighet sättas i Google Cloud. Se [SSO-fix-signBlob-behorighet.md](./SSO-fix-signBlob-behorighet.md).

## Conditional Access (MFA)

Ni kan sätta en Conditional Access-policy i Microsoft Entra som endast kräver MFA för den här appen (Enterprise Application), så att övriga tjänster (Outlook, Teams, SharePoint) inte påverkas. Se er IT-dokumentation eller diskussionen om MFA – Kontrollapp.
