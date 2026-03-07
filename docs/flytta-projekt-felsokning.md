# Flytta projekt (DigitalKontroll ↔ SharePoint)

## Så flyttar du ett projekt

1. I vänsterpanelen (Kalkylskede): högerklicka på projektet → **Ändra**.
2. I modalen: klicka på **Projektplats** (eller den nuvarande sökvägen) för att öppna platsväljaren.
3. Platsväljaren öppnas på **parent-mappen** till projektet (du ser projektmappen och syskonmappar). Navigera till den **mål-mapp** som projektet ska flyttas till (klicka på en mapp för att gå in, använd **← En nivå upp** om du är inne i en mapp) → **Välj denna plats/mapp**.
4. Klicka **Spara**.

Projektmappen flyttas då i SharePoint till den valda platsen, och projektet uppdateras i DigitalKontroll (Firestore). Du får meddelandet *"Projektet har flyttats i SharePoint och sparats."* vid lyckad flytt.

**Flytta till en annan site:** Om företaget har flera SharePoint-siter kopplade kan du flytta projektet till en annan site: öppna platsväljaren, klicka på den andra siten i listan till vänster, navigera till önskad mapp på den siten och klicka "Välj denna plats/mapp". Vid Spara kopieras projektmappen till den nya siten och tas bort från den gamla (flytt mellan siter).

---

## Felsökning (404/400)

### Orsak till felen

1. **404 på `/drive/root/children`**  
   URL:en till Graph innehöll **siteId med punkt** (t.ex. `...sharepoint.com.ebca13b3-...cc73.55d0881c-...`).  
   Graph kräver **komma**: `hostname,site-guid,web-guid`. Med punkt blir URL:en ogiltig → 404.

2. **400 på `/listitem/fields`**  
   Samma felaktiga siteId användes vid PATCH. Dessutom har många dokumentbibliotek **inte** kolumnerna ProjectNumber/ProjectName → Graph svarar 400 "Field not recognized".

## Genomförda åtgärder

### Normalisering av siteId (punkt → komma)
- **`services/azure/graphSiteId.js`** – `normalizeSiteIdForGraph()` byter de två punkterna efter `.sharepoint.com` till kommatecken.
- Normalisering anropas i:
  - hierarchyService (getDriveItems, getDriveItemByPath, move, rename, …)
  - fileService (listFolders, getDriveItemByPath, patchDriveItemListItemFields, …)
  - sharePointStructureService (getSharePointFolderItems, getSharePointFolderTree)
  - CreateProjectModal (vid mapplistning och Spara)
  - useCreateSharePointProjectModal (när platslistan byggs)
  - filterSharePointHierarchy (vid laddning av vänsterpanelen)
  - HomeScreen handleEditProjectSave
  - updateSharePointProjectPropertiesFromFirestoreProject (firebase.js)

### Sista-gång-fix innan fetch
Om den byggda URL:en **fortfarande** innehåller felaktig siteId (t.ex. p.g.a. cache eller gammal bundle) åtgärdas det precis innan `fetch`:
- **hierarchyService.js** – getDriveItems: plockar ut siteId ur endpoint, kollar om den innehåller punkt, normaliserar och byter ut i URL.
- **sharePointStructureService.js** – getSharePointFolderItems: samma logik.
- **fileService.js** – patchDriveItemListItemFields: samma kontroll på `sid` innan endpoint byggs.

### Minska 400 vid enbart flytt
- **HomeScreen.js** – `updateSharePointProjectPropertiesFromFirestoreProject` anropas bara när **projektnummer eller projektnamn** har ändrats (`didRename`). Vid enbart flytt (samma namn) skickas inget PATCH till listitem/fields → ingen 400 från den anropen.

### Best-effort för metadata
- **firebase.js** – I `updateSharePointProjectPropertiesFromFirestoreProject` fångas 400 / "not recognized" och loggas som varning utan att kasta vidare, så flytten kan lyckas även om biblioteket saknar kolumnerna.

## Om du fortfarande får 404

- **404 med kommatecken i URL:en**  
  Då är formatet rätt men resursen hittas inte. Kontrollera:
  - Att rätt SharePoint-webbplats är kopplad till företaget (Firestore / inställningar).
  - Att inloggad användare har behörighet till den webbplatsen.
  - Att siteId inte är från en borttagen eller fel webbplats (jämför med webbplats-URL i SharePoint).

- **Rensa cache och bygg**  
  Kör t.ex.:
  ```bash
  npx expo start --clear
  ```
  eller rensa webbläsarens cache och gör en hård omladdning (Ctrl+Shift+R / Cmd+Shift+R).
