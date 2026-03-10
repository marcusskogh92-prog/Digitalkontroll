# Analys: Wilzéns Bygg – felmeddelande vid skapande, namn på siter

## 1. Vad som hände

- Du skapade företaget **Wilzéns Bygg** (företagsnamn + ID t.ex. wilzensbygg) i modalen "Skapa nytt företag".
- Du fick ett **felmeddelande** i webbklienten (konsolen: CORS 403).
- **Företaget skapades** och **minst en site skapades i SharePoint** (du ser t.ex. "Wilzéns Bygg-bas" och "DK - Wilzéns Bygg").
- I SharePoint Nav Företagsöversikt visas **Wilzéns Bygg** med **0 siter** och status **Varning**.
- Du undrar varför det blev felmeddelande trots att saker skapats, och varför namnen blir "Wilzéns Bygg-bas" / "DK - Wilzéns Bygg" istället för t.ex. "Wilzéns Bygg-Site".

---

## 2. Felmeddelandet (CORS 403)

**Konsol:**  
`Origin http://localhost:19006 is not allowed by Access-Control-Allow-Origin. Status code 403`  
`Fetch API cannot load https://us-central1-digitalkontroll-81925.cloudfunctions.net/provisionCompany due to access control checks.`

**Förklaring:**

- Anropet går från **localhost:19006** (Expo/webb) till Cloud Function **provisionCompany**.
- Svaret från servern (403) kommer **utan** CORS-header som tillåter `http://localhost:19006`.
- Webbläsaren **blockerar då svaret** och visar CORS-fel; klienten får aldrig ett lyckat svar och visar därför fel i UI:t.

**Viktigt:** Det betyder **inte** nödvändigtvis att backend misslyckades. Om provisioning lyckades på servern (Firestore + SharePoint) så är företaget och siterna skapade – men klienten fick aldrig bekräftelsen och kan visa fel eller "0 siter" eftersom den inte gick vidare med uppdatering/synk.

**Åtgärd:**  
Konfigurera Cloud Functions så att **localhost** (t.ex. `http://localhost:19006`) är tillåten origin för anrop till `provisionCompany` (och övriga callable-funktioner). I Firebase görs det antingen via CORS-inställningar för HTTP-funktioner eller genom att använda Firebase Callable SDK korrekt (Callable har egen CORS-hantering; kontrollera att ingen proxy eller brandvägg ger 403 innan anropet når Firebase).

---

## 3. Namn på siter – varför "Wilzéns Bygg-bas" och "DK - Wilzéns Bygg"?

### 3.1 Hur provisioning namnger siter (provisionCompany)

I **functions/sharepointProvisioning.js** (`ensureCompanySharePointSites`) skapas **två** siter per företag:

| Site        | displayName (i koden)     | Betydelse                          |
|------------|----------------------------|------------------------------------|
| **Bas**    | `companyName + "-bas"`     | Systemsite, t.ex. "Wilzéns Bygg-bas" |
| **Workspace** | `companyName`           | Projekt/workspace, t.ex. "Wilzéns Bygg" |

- **Bas:** `baseDisplayName = "${companyName}-bas"` → **"Wilzéns Bygg-bas"**.
- **Workspace:** `workspaceDisplayName = "${companyName}"` → **"Wilzéns Bygg"** (utan "-Site").

Så med nuvarande logik finns **ingen** site som heter "Wilzéns Bygg-**Site**"; det är inte ett namn som används vid automatisk provisioning.

### 3.2 Var kommer "DK - Wilzéns Bygg" ifrån?

Formatet **"DK - …"** (eller "… – DK …") används i **createSharePointSiteImpl** (manuell "Lägg till site"):

- `displayName = \`${baseName} – DK ${siteNamePart}\``  
  t.ex. "Wilzéns Bygg – DK [namndel]".

Om användaren eller ett äldre flöde skapat en site med t.ex. siteNamePart = "Wilzéns Bygg" (eller liknande) kan displayName bli något i stil med "Wilzéns Bygg – DK Wilzéns Bygg", som sedan kan visas eller normaliseras till **"DK - Wilzéns Bygg"** i listor/SharePoint.

**Slutsats:**  
- **"Wilzéns Bygg-bas"** = automatiskt skapad **bas-site** vid provisioning (rätt enligt nuvarande kod).  
- **"DK - Wilzéns Bygg"** = troligen från **tidigare test** eller **manuell** "Lägg till site", inte från den senaste provisionCompany-anropet.  
- **"Wilzéns Bygg-Site"** = används **inte** idag i automatisk provisioning; workspace heter bara `companyName` ("Wilzéns Bygg").

---

## 4. Varför "0 siter" och "Varning" för Wilzéns Bygg?

Möjliga orsaker:

1. **CORS 403** – Klienten fick aldrig lyckat svar från `provisionCompany`, så den kunde inte uppdatera lokalt state / inte trigga omräkning eller synk. Om backend ändå skrev till Firestore borde företaget ha `sharepoint_system/config` och `sharepoint_navigation` med baseSite/workspaceSite – då har provisioning lyckats och "0 siter" kan bero på hur Företagsöversikten räknar (t.ex. annan källa eller cache).
2. **Synk/source** – Om "Antal siter" och "Varning" kommer från en **synkad lista** (t.ex. SharePoint Nav) som byggs från annan källa än den Firestore-struktur som provisioning skriver till, kan den visa 0 tills synken uppdaterats eller källan justerats.
3. **Tidigare fel** – Om ett **tidigare** försök (för några veckor sedan) skapade företag/siter men något gick fel med koppling eller metadata, kan det finnas kvar "gamla" poster som gör att räkning eller status blir fel.

**Rekommendation:**  
Kontrollera i Firestore för `foretag/wilzensbygg` (eller motsvarande companyId):

- `foretag/{companyId}/sharepoint_system/config` – finns `sharepoint.baseSite` och `sharepoint.workspaceSite` med `siteId`?
- `foretag/{companyId}/sharepoint_navigation/config` – finns `enabledSites` och `siteConfigs`?
- `foretag/{companyId}/profil/public` – finns `sharePointSiteId` / `primarySharePointSite`?

Om dessa finns är provisioning lyckad; då är "0 siter" / "Varning" ett visnings- eller synkproblem, inte att siter inte skapats.

---

## 5. Sammanfattning och åtgärder

| Fråga | Svar |
|-------|------|
| Varför felmeddelande trots att företag/site skapades? | CORS 403 – svaret från provisionCompany når inte klienten (localhost blockeras), så UI visar fel trots lyckad backend. |
| Varför "Wilzéns Bygg-bas"? | Enligt nuvarande kod: bas-site namnges alltid som `companyName + "-bas"`. Det är avsiktligt. |
| Varför "DK - Wilzéns Bygg"? | Troligen från äldre försök eller manuell "Lägg till site" (format "… – DK …"), inte från senaste provisionCompany. |
| Varför inte "Wilzéns Bygg-Site"? | Workspace-site får idag bara `companyName` som displayName (ingen "-Site"-suffix). Det kan ändras om ni vill ha enhetlig "-Site"-namnkonvention. |
| Varför 0 siter / Varning? | Troligen kombination av: CORS (klienten fick inte success) och hur Företagsöversikten räknar/synkar – inte nödvändigtvis att siter saknas i backend. |

**Konkreta åtgärder:**

1. **CORS för localhost**  
   Säkerställ att Cloud Functions tillåter `http://localhost:19006` (och ev. andra localhost-portar) så att anrop från utveckling inte ger 403 och CORS-fel.

2. **Verifiera data**  
   Kontrollera Firestore för Wilzéns Bygg (companyId) enligt avsnitt 4. Om baseSite/workspaceSite finns där är provisioning lyckad.

3. **Namnkonvention (valfritt)**  
   Om ni vill att **workspace**-siten ska heta t.ex. "Wilzéns Bygg-Site" kan `workspaceDisplayName` i `ensureCompanySharePointSites` ändras till t.ex. `${companyName}-Site` (eller liknande). Då påverkar det endast **nya** företag; befintliga siter byter inte namn automatiskt.

4. **Gamla namn**  
   "DK - Wilzéns Bygg" och eventuella andra gamla test-siter kan lämnas som de är eller kopplas bort/renameras manuellt i SharePoint eller i er app om ni vill städa.

Om du vill kan nästa steg vara att antingen (a) skissera exakt CORS-konfiguration för Functions, eller (b) föreslå en konkret kodändring för workspace-namnet till "-Site".
