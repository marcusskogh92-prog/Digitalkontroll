# Varför syns inte företagslogotypen i headern?

## Var logotypen används

- **Komponent:** `CompanyHeaderLogo` i `components/HeaderComponents.js`
- **Placering:** Headern (höger sida) på web, via `App.js` → `headerRight` för alla skärmar inkl. Home.
- **Data:** `companyId` kommer från `route?.params?.companyId` eller från `AsyncStorage` / `window.localStorage` med nyckeln `dk_companyId`. Logotyp-URL hämtas med `resolveCompanyLogoUrl(companyId)` i `components/firebase.js`.

## Möjliga orsaker till att logotypen inte syns

### 1. Ingen eller tom `companyId`

- Headern får `companyId={route?.params?.companyId || ''}`. För Home sätts `companyId` i `params` vid inloggning (LoginScreen), men:
  - Vid **sidladdning/refresh (F5)** på web kan navigationsstate sakna `params` → då använder `CompanyHeaderLogo` bara AsyncStorage/localStorage.
  - Om `dk_companyId` inte finns eller inte har lästs än (t.ex. första render) blir `cid` tom → komponenten returnerar `null` och ingen logotyp visas.
- **Lokalt:** Om du kör utan riktig inloggning (t.ex. dev-bypass) eller i en session där `dk_companyId` aldrig sattes, blir `companyId` tom.

### 2. Företaget har ingen uppladdad logotyp

- `resolveCompanyLogoUrl` returnerar `null` om `profile.logoUrl` och `profile.logoPath` saknas eller inte ger någon URL.
- Då visar `CompanyHeaderLogo` inget (den renderar bara när `logoUrl` är satt).

### 3. Fel eller otillgänglig URL när du kör lokalt

- **SharePoint/Azure:** Om logotypen ligger i SharePoint (`profile.logoPath`) hämtas URL via `getFileUrlFromAzure`. Lokalt kan CORS, annan domän eller saknad auth ge fel så att ingen URL returneras.
- **Firebase Storage (gs://):** På web byggs en publik URL mot `storage.googleapis.com`. Om bucket/regler inte tillåter anrop från `localhost` kan det ge 403 eller liknande, och bilden laddas inte även om URL:en sätts.
- **HTTPS vs localhost:** Vissa logotyper (t.ex. signerade eller domänbegränsade) kan vara ogiltiga när appen körs på `http://localhost`.

### 4. CORS eller att bilden inte laddas

- Även med en korrekt URL kan React Native `<Image source={{ uri: logoUrl }} />` på web få CORS-fel eller blockering så att bilden inte visas (men komponenten har då fortfarande en URL).

## Sammanfattning

| Orsak | Lokalt ofta? | Kommentar |
|-------|----------------|-----------|
| `dk_companyId` / `companyId` tom | Ja | Särskilt vid refresh eller om inloggning inte sätter params/storage. |
| Företag utan uppladdad logotyp | – | Kontrollera i admin att företaget har logoUrl/logoPath. |
| resolveCompanyLogoUrl returnerar null | Ja | SharePoint/Azure eller gs:// kan vara begränsade från localhost. |
| CORS / bilden laddas inte | Ja | Storage-domäner tillåter inte alltid localhost. |

**Rekommendation för lokalt test:** Kontrollera i webbläsaren (DevTools → Application → Local Storage / eller där AsyncStorage lagras) att `dk_companyId` finns och att det företaget har en uppladdad logotyp i Företagsinställningar. Om logotypen ligger i SharePoint eller bakom domänbegränsningar kan den fortfarande inte synas från localhost; då syns den ofta först i produktion (t.ex. www.digitalkontroll.com).
