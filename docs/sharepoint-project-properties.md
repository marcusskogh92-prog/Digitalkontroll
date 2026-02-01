# SharePoint Project Properties (ProjectNumber/ProjectName)

Mål: När projektnummer eller projektnamn ändras i appen ska Office-dokument som använder **Quick Parts / Document Properties** automatiskt visa uppdaterade värden – utan att vi skriver om filer.

## Princip
- **Firestore är källa till sanning** för `projectNumber` och `projectName`.
- Vid ändring uppdaterar appen **SharePoint-mappens metadata** (biblioteksfält) för projektets rotmapp via Microsoft Graph.
- Word/Excel-mallar ska använda **Document Properties** (Quick Parts) som pekar på dessa SharePoint-fält.
- **PDF är alltid en snapshot** (exporten skrivs inte om retroaktivt).

## Krav i SharePoint (bibliotekets kolumner)
SharePoint-dokumentbiblioteket behöver ha två kolumner (Site Columns/Library Columns) med följande *internal names*:
- `ProjectNumber`
- `ProjectName`

Obs: Om era internal names skiljer sig måste de mappas om i koden (se `SHAREPOINT_PROJECT_PROPERTIES_FIELDS` i components/firebase.js).

## Hur mallar ska byggas (Word)
1. Öppna mallen (docx) som ska användas.
2. Placera markören där projektnummer/projektnamn ska visas.
3. Insert → **Quick Parts** → **Document Property**.
4. Välj `ProjectNumber` och/eller `ProjectName`.

Beteende:
- När SharePoint-metadata ändras uppdateras fältet vanligtvis när dokumentet öppnas eller när fält uppdateras (t.ex. Update Fields).
- Om texten är hårdkodad i dokumentet kommer den inte ändras automatiskt.

## Hur mallar ska byggas (Excel)
- Använd dokumentegenskaper (Document Properties) för att referera till `ProjectNumber`/`ProjectName` där det är möjligt.
- Samma regel gäller: bara fält som refererar till metadata uppdateras automatiskt.

## Vad uppdateras – och vad uppdateras inte
- Uppdateras automatiskt (om mallar använder Document Properties):
  - Projektnummer/projektnamn som refereras via Quick Parts/Document Properties.
- Uppdateras inte:
  - PDF-exporter (snapshot)
  - Hårdkodad text i befintliga dokument
  - Dokument som inte använder metadatafält

## Ingen massuppdatering av filer
Den här lösningen gör **ingen mass-uppdatering av befintliga filer**.
Den uppdaterar endast metadata på projektmappen så att dokument som *redan* använder Document Properties kan plocka upp nya värden.

## Tekniskt (för utvecklare)
- Graph endpoint som används:
  - `PATCH /sites/{siteId}/drive/items/{itemId}/listItem/fields`
- Appen uppdaterar fält på projektets rotmapp:
  - `ProjectNumber` = aktuellt projektnummer
  - `ProjectName` = aktuellt projektnamn

Funktioner:
- `updateSharePointProjectPropertiesFromFirestoreProject(...)` i `components/firebase.js`
- Metadata patch i `services/azure/fileService.js`
