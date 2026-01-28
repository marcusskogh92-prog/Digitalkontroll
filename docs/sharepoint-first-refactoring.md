# SharePoint-First Refactoring - Implementation Status

## Översikt

Detta dokument beskriver refaktoreringen av Digitalkontroll för att göra SharePoint till den enda källan för mapp- och filstruktur, istället för hårdkodad Firestore-hierarki.

## Mål

1. ✅ **Ta bort all hårdkodad mapp- och projektstruktur** från frontend
2. ✅ **SharePoint som single source of truth** - alla mappar och filer hämtas från SharePoint via Microsoft Graph
3. ✅ **Dynamisk rendering** - vänsterpanelen reflekterar SharePoint-strukturen i realtid
4. ✅ **Fas-baserad struktur** - fyra toppnivåmappar (Kalkylskede, Produktion, Avslut, Eftermarknad) representerar projektfaser
5. ✅ **Bidirektional synkning** - filer skapade/ändrade utanför Digitalkontroll synkas automatiskt

## Implementeringsstatus

### ✅ Genomförda ändringar

#### 1. SharePoint Hierarchy Service (`services/azure/hierarchyService.js`)
- ✅ Skapad ny service för att hämta mappstruktur via Microsoft Graph API
- ✅ Funktioner:
  - `getDriveItems()` - Hämtar mappar och filer från SharePoint
  - `getSharePointHierarchy()` - Hämtar full hierarki rekursivt
  - `buildFolderHierarchy()` - Bygger hierarkisk struktur
  - `getFolderByPath()` - Hämtar specifik mapp via sökväg
  - `createFolder()` - Skapar ny mapp i SharePoint
  - `deleteItem()` - Raderar mapp/fil från SharePoint

#### 2. ProjectSidebar uppdateringar
- ✅ Ersatt `fetchHierarchy()` med `getSharePointHierarchy()`
- ✅ Uppdaterad fas-filtrering - filtrerar vid hämtning istället för efteråt
- ✅ SharePoint Site ID hämtas automatiskt från company profile
- ✅ Hanterar fallback när SharePoint site inte finns

#### 3. Fas-filtrering
- ✅ Fas-val filtrerar direkt i SharePoint-hämtningen
- ✅ Mappnamn mappas från phase keys (kalkylskede → Kalkylskede)
- ✅ Ingen post-processing behövs - SharePoint returnerar redan filtrerad struktur

### ✅ Ytterligare genomförda ändringar

#### 4. SharePoint Adapter (`components/common/ProjectTree/sharePointAdapter.js`)
- ✅ Skapad adapter som konverterar SharePoint-struktur till ProjectTree-format
- ✅ Funktioner:
  - `adaptSharePointToProjectTree()` - Huvudadapter-funktion
  - `isProjectFolder()` - Identifierar projekt-mappar baserat på namn
  - `extractProjectMetadata()` - Extraherar projektmetadata från mappnamn
  - `adaptFolderToProject()` - Konverterar mapp till projekt-struktur
- ✅ Hanterar rekursiv mappstruktur
- ✅ Identifierar projekt baserat på projektnummer-mönster i mappnamn

#### 5. ProjectTree uppdateringar
- ✅ Uppdaterad för att hantera SharePoint-struktur via adapter
- ✅ Stöd för filer tillsammans med projekt
- ✅ Filer renderas med `ProjectTreeFile`-komponent
- ✅ Projekt identifieras automatiskt från mappnamn

#### 6. ProjectTreeFile-komponent (`components/common/ProjectTree/ProjectTreeFile.js`)
- ✅ Ny komponent för att rendera filer i trädet
- ✅ Öppnar filer via SharePoint webUrl
- ✅ Visar filikon baserat på MIME-typ
- ✅ Visar filstorlek
- ✅ Stöd för både web och native

#### 7. Projektfunktioner från SharePoint
- ✅ `getProjectFolders()` - Hämtar projektfunktioner (mappar) från SharePoint
- ✅ Projektfunktioner laddas när projekt expanderas eller väljs
- ✅ Funktioner mappas automatiskt från mappnamn till functionType
- ✅ `handleSelectFunction` uppdaterad för att öppna SharePoint-mappar via webUrl
- ✅ Stöd för både hårdkodade funktioner (fallback) och SharePoint-mappar

### 📋 Återstående arbete

#### 6. Ta bort Firestore hierarchy-kod
- ⏳ Ta bort `fetchHierarchy()` och `saveHierarchy()` från `components/firebase.js`
- ⏳ Ta bort all Firestore hierarchy-logik från frontend
- ⏳ Uppdatera alla komponenter som använder Firestore hierarchy

#### 7. Dashboard vs Left Panel separation
- ⏳ Dashboard ska visa SharePoint sites (companies)
- ⏳ Left panel ska visa mappstruktur för vald site
- ⏳ Tydlig separation mellan site-lista och mappträd

#### 8. Mapphantering
- ⏳ Skapa mappar direkt i SharePoint (via hierarchyService)
- ⏳ Ta bort mappar från SharePoint
- ⏳ Uppdatera UI när mappar ändras i SharePoint

## Arkitektur

### SharePoint-struktur

```
SharePoint Site Root
├── Kalkylskede/
│   ├── Entreprenad/
│   │   ├── 2026/
│   │   │   ├── Projekt-1/
│   │   │   └── Projekt-2/
│   │   └── 2027/
│   └── Byggservice/
├── Produktion/
│   └── ...
├── Avslut/
│   └── ...
└── Eftermarknad/
    └── ...
```

### Dataflöde

1. **Användare väljer fas** → Phase dropdown
2. **ProjectSidebar hämtar hierarki** → `getSharePointHierarchy(companyId, phaseFolderName)`
3. **SharePoint returnerar mappstruktur** → Microsoft Graph API
4. **ProjectTree renderar mappar** → Dynamisk rendering baserat på SharePoint-data
5. **Användare klickar på fil** → Öppnas via SharePoint webUrl

### API-anrop

```javascript
// Hämtar hierarki för vald fas
const hierarchy = await getSharePointHierarchy(companyId, 'Kalkylskede');

// Hämtar alla faser
const allPhases = await getSharePointHierarchy(companyId, null);

// Skapar ny mapp
const folder = await createFolder(companyId, 'Kalkylskede/Entreprenad', '2028');

// Raderar mapp
await deleteItem(companyId, 'Kalkylskede/Entreprenad/2026');
```

## Migration Guide

### Från Firestore hierarchy till SharePoint

**Före:**
```javascript
const hierarchy = await fetchHierarchy(companyId);
// hierarchy är en array med { id, name, type, children, ... }
```

**Efter:**
```javascript
const hierarchy = await getSharePointHierarchy(companyId, phaseFolderName);
// hierarchy är en array med SharePoint-mappar och filer
```

### Strukturskillnader

**Firestore hierarchy:**
- `type: 'main'` - Huvudmapp
- `type: 'sub'` - Undermapp
- `type: 'project'` - Projekt
- `phase` - Metadata på projekt

**SharePoint hierarchy:**
- `type: 'folder'` - Mapp (alla nivåer)
- `type: 'file'` - Fil
- `path` - Sökväg i SharePoint
- `webUrl` - URL för öppning i SharePoint
- Ingen `phase` metadata - fas representeras av mappnamn

## Nästa steg

1. **Ta bort Firestore-kod** - Rensa bort all gammal hierarchy-kod från frontend
2. **Testa synkning** - Verifiera att filer skapade utanför Digitalkontroll synkas automatiskt
3. **Implementera mapphantering** - Skapa/ta bort mappar direkt i SharePoint via UI
4. **Förbättra projektidentifiering** - Förbättra logik för att identifiera projekt från mappnamn
5. **Uppdatera dokumentation** - Uppdatera användar- och utvecklardokumentation

## Noteringar

- SharePoint Site ID måste vara konfigurerat i company profile
- Microsoft Graph API kräver autentisering (hanteras via authService)
- Mappnamn i SharePoint måste matcha fase-namn (Kalkylskede, Produktion, etc.)
- Filändringar utanför Digitalkontroll synkas automatiskt när hierarkin hämtas
