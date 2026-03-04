# Rensa alla företag utom MS Byggsystem och börja om

Syfte: ta bort alla företag (inkl. Wilzéns Bygg-varianter, test azure sharepoint, wilzens-oalert) så att endast **MS Byggsystem** finns kvar. Nya företag skapas då med rätt namn: **företagsnamn-bas** och **företagsnamn-Site**.

---

## 1. Vad som skapas vid "Skapa nytt företag" (nu)

- **Företagsnamn-bas** – systemsite (profilbilder, mallar, systemdata).
- **Företagsnamn-Site** – arbetsyta där projekten skapas (så som koden är byggd).

Koden är uppdaterad så att workspace alltid får suffix **-Site**.

---

## 2. Ordning: först SharePoint/Teams, sedan Firestore

**SharePoint-siter raderas nu** av `purgeCompany` om Graph-token är konfigurerad (samma som vid etablering: `sharepoint.provision_access_token` eller `tenant_id` + `client_id` + `client_secret`). Bas- och arbetsyta-siter (DK Bas, Företagsnamn-Site) tas bort i M365 innan Firestore rensas. Om token saknas eller radering misslyckas loggas det men Firestore-purge körs ändå.

Om du av någon anledning kör purge utan Graph-konfiguration:
1. **Ta bort siter i SharePoint/Teams** (manuellt) för de företag du rensar.
2. **Kör purge** för varje företag i appen (eller via Firebase).

---

## 3. Ta bort siter i Teams/SharePoint

### Alternativ A: SharePoint Admin Center (rekommenderat)

1. Gå till **Microsoft 365 Admin Center** → **SharePoint** (eller direkt [admin.microsoft.com](https://admin.microsoft.com) → **Företagsprogram** → **SharePoint**).
2. Öppna **SharePoint Admin Center** (eller **Aktiva webbplatser**).
3. Hitta siter som hör till de företag du ska rensa, t.ex.:
   - Wilzéns Bygg-bas  
   - Wilzéns Bygg (eller DK - Wilzéns Bygg)  
   - Test Azure sharepoint  
   - Wilzens-oalert (om sådan finns)  
   - Eventuella andra test-siter för samma företag.
4. Välj varje site → **Ta bort** (eller **Radera**). Bekräfta borttagning enligt Microsofts flöde (t.ex. 93 dagar i papperskorgen).

Siter som är kopplade till **MS Byggsystem** ska **inte** tas bort.

### Alternativ B: Teams Admin

Om siterna är Teams-kopplade:

1. **Teams Admin Center** → **Hantera team** / **Teams**.
2. Hitta team/siter för de företag som ska bort.
3. Ta bort team/siten enligt Microsofts instruktioner (team borttaget innebär ofta att kopplad SharePoint-site hamnar i papperskorg eller kan rensas separat).

### Efter borttagning

- Siter hamnar ofta i **papperskorg** i 93 dagar. För att kunna återanvända samma site-namn/slug kan du antingen vänta tills de försvinner eller **tömma papperskorgen** för de siter du vill frigöra namnen för.

---

## 4. Rensa företag i Firestore (purge)

När siter är borttagna (eller om du accepterar att de ligger kvar och bara rensar Firestore):

### Företag som ska bort (enligt din önskan)

| Document-ID i `foretag` | Kommentar |
|-------------------------|-----------|
| `Wilzens Bygg`          | (mellanslag, stor W) |
| `wilzens-bygg`          | (bindestreck) |
| `wilzens bygg`          | (mellanslag, liten w) |
| `test azure sharepoint` | |
| `wilzens-oalert`        | |

**Skyddad (ska inte tas bort):** `MS Byggsystem`

### Så här kör du purge

**I appen (Superadmin):**

1. Logga in som superadmin.
2. Öppna **Företagsinställningar** (eller motsvarande) och gå till företagslistan.
3. För **varje** företag som ska bort (alla utom MS Byggsystem): öppna företaget → menyn (tre prickar) → **Radera företag permanent** (purge). Bekräfta.

Detta anropar Cloud Function **purgeCompany**, som:

- Raderar användare i Auth som tillhör företaget (utom skyddade e-postadresser).
- Raderar alla subcollections under företaget, inkl. **sharepoint_sites**, **sharepoint_navigation**, **sharepoint_system**, profil, members, mallar, byggdelar, planering, etc.
- Raderar själva dokumentet `foretag/{companyId}`.

**OBS:** Du måste göra purge **en gång per företag**. Det finns ingen "rensa alla utom MS Byggsystem"-knapp; kör purge manuellt för varje av de ovan listade.

### Om du vill köra purge från skript/emulator

- Använd t.ex. **Firebase Emulator** och anropa `purgeCompany` med rätt `companyId` för varje företag, eller bygg ett litet admin-script som anropar `purgeCompanyRemote` i en loop (endast för superadmin). Vi har inte ett färdigt skript i repot – det går att lägga till vid behov.

---

## 5. Sammanfattning – steg för steg

1. **SharePoint:** Ta bort siter för Wilzéns Bygg (alla varianter), test azure sharepoint, wilzens-oalert i SharePoint Admin Center (och vid behov Teams). Låt MS Byggsystem-siter vara.
2. **Firestore:** I appen, som superadmin – för vart och ett av företagen ovan: öppna företag → Radera företag permanent (purge). Då rensas alla subcollections inkl. SharePoint-metadata.
3. **Kontroll:** I Firebase Console → Firestore → `foretag` ska endast **MS Byggsystem** (och eventuella andra du valt att behålla) finnas kvar.
4. **Nya företag:** När du skapar ett nytt företag (t.ex. Wilzéns Bygg) skapas **företagsnamn-bas** och **företagsnamn-Site** i SharePoint, och all data kopplas i Firestore som tidigare.

---

## 6. Kodändringar som gjorts

- **purgeCompany** (functions/companyPurge.js): Subcollections **sharepoint_sites**, **sharepoint_navigation**, **sharepoint_system** är tillagda i listan så att all SharePoint-metadata för företaget raderas vid purge.
- **ensureCompanySharePointSites** (functions/sharepointProvisioning.js): Workspace-site får nu **displayName** `företagsnamn-Site` (tidigare bara `företagsnamn`). Bas-site är oförändrad: `företagsnamn-bas`.
