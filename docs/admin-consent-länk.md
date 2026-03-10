# Admin consent – godkänn DigitalKontroll för ett företag

## Är allt rätt för att ett företag (t.ex. Wilzén) ska kunna godkänna?

Ja, om följande gäller:

- [x] **Azure App** (DigitalKontroll) är multitenant: *Flera Entra ID-klientorganisationer* och *Tillåt alla klientorganisationer*.
- [x] **Redirect URI** i Azure innehåller `https://www.digitalkontroll.com/` (och ev. `/consent`).
- [x] **EXPO_PUBLIC_AZURE_TENANT_ID=common** i `.env` (används vid build så att alla godkända organisationer kan logga in).
- [x] **EXPO_PUBLIC_AZURE_CLIENT_ID** är satt till appens Client ID.

Då kan vilket företags IT-admin som helst öppna länken nedan, logga in med sitt arbetskonto och godkänna appen för sin organisation. Därefter kan alla användare på det företaget logga in på https://www.digitalkontroll.com/ med sina arbetsmejl.

---

## Länk att skicka till företagets IT

Skicka denna länk till företagets IT-admin (t.ex. Wilzén eller något annat företag). De öppnar länken, loggar in med sitt arbetskonto och godkänner – sedan kan alla på det företaget använda DigitalKontroll.

### Generell länk (fungerar för vilket företag som helst)

```
https://login.microsoftonline.com/common/adminconsent?client_id=a70c7fdb-140f-47fe-9469-dd426be72f9b&redirect_uri=https%3A%2F%2Fwww.digitalkontroll.com%2F&state=consent
```

### Samma länk (klickbar) för Wilzén

[https://login.microsoftonline.com/common/adminconsent?client_id=a70c7fdb-140f-47fe-9469-dd426be72f9b&redirect_uri=https%3A%2F%2Fwww.digitalkontroll.com%2F&state=wilzen](https://login.microsoftonline.com/common/adminconsent?client_id=a70c7fdb-140f-47fe-9469-dd426be72f9b&redirect_uri=https%3A%2F%2Fwww.digitalkontroll.com%2F&state=wilzen)

### Samma länk för annat företag

Samma URL fungerar för **alla** företag. Du kan byta `state` om du vill (t.ex. `state=acme` för företag Acme) – det påverkar bara vad som skickas tillbaka till er app efter godkännandet och kan användas för statistik/spårning. Krävs inte för att godkännandet ska fungera.

---

## Var hittar IT "SSO / Microsoft-inloggning" i appen?

Efter att ni godkänt appen kan ni verifiera att Microsoft-inloggning (SSO) är aktiverad:

1. Logga in på **www.digitalkontroll.com** med ett konto som har tillgång till **Superadmin** (t.ex. MS Byggsystem).
2. Öppna **Superadmin** → **Företag** och välj ert företag i listan till vänster.
3. Öppna **Företagsinställningar** (modalen för valt företag).
4. Klicka på fliken **"Microsoft-inloggning"**. Där finns en **färdig admin consent-länk** (med knapp "Kopiera länk") som du skickar till företagets IT, samt valfritt fält **Företagets Tenant ID** om IT har gett er deras tenant ID – lägg in det i DigitalKontroll här (inte i Azure), spara med "Spara ändringar".

---

## Var lägger man in företagets Tenant ID?

**I DigitalKontroll**, inte i Azure. Öppna Företagsinställningar för företaget → fliken **Microsoft-inloggning** → fältet **Företagets Tenant ID (valfritt)**. Klistra in det tenant ID som företagets IT har gett er och klicka **Spara ändringar**. Inloggning fungerar även utan detta (appen använder "common" för multitenant); fältet är för dokumentation/verifiering om IT kräver det.

---

## Test på localhost

När du utvecklar eller testar på `http://localhost:19006` (eller annan port) måste **exakt den adressen** (med avslutande `/`) finnas som Redirect URI i Azure App-registreringen → Autentisering → Redirect URIs. T.ex. `http://localhost:19006/`. Annars kommer Microsoft-inloggning och SharePoint-synk att misslyckas efter inloggning (användaren kommer inte tillbaka till appen med koden).

---

## Synka mot företagets interna SharePoint

För att koppla företagets **egna** SharePoint-siter (från deras Microsoft 365-tenant) till Digitalkontroll:

1. **Företagets Tenant ID** måste vara ifyllt under Företagsinställningar → Microsoft-inloggning (se ovan).
2. **En administratör för företaget** ska logga in på Digitalkontroll med sitt arbetskonto (samma organisation som SharePoint) och öppna Företagsinställningar → fliken **SharePoint**.
3. Klicka på **"Synka mot [Företag] interna SharePoint-miljö"**. Logga in med företagets Microsoft-konto när Microsoft öppnas – då visas siter från företagets tenant i pickern.

Som superadmin kan man förbereda allt (t.ex. fylla i Tenant ID), men själva kopplingen bör göras av en företagsadmin som har ett konto i företagets Microsoft 365. Efter inloggning omdirigeras användaren tillbaka till appen och Företagsinställningar → SharePoint öppnas automatiskt med site-pickern.

---

## Kort instruktion till IT

> **Godkänn DigitalKontroll för er organisation**  
> Öppna länken ovan i webbläsaren och logga in med ett **administratörskonto** (Global admin eller Application admin) i er Microsoft 365/Entra. Klicka på Godkänn. Därefter kan alla användare med arbetsmejl i er organisation logga in på https://www.digitalkontroll.com/.
