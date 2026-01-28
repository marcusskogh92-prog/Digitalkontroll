# SharePoint Mappstruktur - Digitalkontroll

## Översikt

Denna dokumentation beskriver mappstrukturen i **Digitalkontroll-siten** (systemet) i SharePoint. Alla admin-filer och systemfiler sparas här, medan projektfiler kan sparas antingen här eller i företagsspecifika sites.

## Mappstruktur

Strukturen använder siffror först för att säkerställa en tydlig prioritetsordning och enkel navigering:

```
Digitalkontroll/
├── 01-Company/                    # Admin-filer (loggor, avatars)
│   ├── {companyId}/
│   │   ├── Logos/                 # Företagsloggor
│   │   └── Users/                 # Användaravatars
│   │       └── {userId}/
│
├── 02-Projects/                    # Projektfiler (om sparas i systemet)
│   ├── {companyId}/
│   │   ├── {mainFolder}/          # T.ex. "Entreprenad"
│   │   │   ├── {subFolder}/       # T.ex. "2026"
│   │   │   │   ├── {projectId}-{projectName}/
│   │   │   │   │   ├── Documents/
│   │   │   │   │   ├── Drawings/
│   │   │   │   │   ├── Meetings/
│   │   │   │   │   └── Controls/
│
├── 03-System/                     # Systemfiler och templates
│   ├── Templates/                 # Systemmallar
│   ├── Exports/                   # Exporterade filer
│   └── Backups/                   # Backups
│
└── 04-Shared/                     # Delade resurser (framtida)
```

## Detaljerad Beskrivning

### 01-Company/
**Syfte:** Lagrar admin-filer som är gemensamma för systemet men organiserade per företag.

- **Logos/**: Företagsloggor som visas i headern och på företagssidor
- **Users/**: Användaravatars som visas i profiler och kommentarer

**Exempel:**
- `01-Company/MS Byggsystem/Logos/1234567890_logo.png`
- `01-Company/MS Byggsystem/Users/user123/1234567890_avatar.jpg`

### 02-Projects/
**Syfte:** Projektfiler kan sparas här om de ska vara i systemet, eller i företagsspecifika sites.

**Struktur:**
- Organiserat per företag → huvudmapp → undermapp → projekt
- Varje projekt har standardmappar: Documents, Drawings, Meetings, Controls

**Exempel:**
- `02-Projects/MS Byggsystem/Entreprenad/2026/PROJ001-Testprojekt/Documents/`
- `02-Projects/MS Byggsystem/Entreprenad/2026/PROJ001-Testprojekt/Drawings/`

### 03-System/
**Syfte:** Systemfiler som inte är kopplade till specifika företag eller projekt.

- **Templates/**: Systemmallar som kan användas av alla företag
- **Exports/**: Exporterade filer (PDF:er, Excel-filer, etc.)
- **Backups/**: Automatiska backups av viktiga data

### 04-Shared/
**Syfte:** Delade resurser mellan företag (framtida funktionalitet).

## Automatisk Skapande

Mappstrukturen skapas automatiskt när:

1. **Första logo-uppladdningen**: `01-Company/` mappen skapas automatiskt
2. **Första avatar-uppladdningen**: `01-Company/{companyId}/Users/` skapas automatiskt
3. **Första projektfilen**: `02-Projects/` och projektstrukturen skapas automatiskt
4. **Manuellt**: Anropa `ensureSystemFolderStructure()` för att skapa hela strukturen

## Funktioner

### `ensureSystemFolderStructure()`
Skapar hela basstrukturen i Digitalkontroll-siten. Anropas automatiskt vid första logo/avatar-uppladdning, eller kan anropas manuellt.

```javascript
import { ensureSystemFolderStructure } from '../services/azure/fileService';

// Skapa hela strukturen
await ensureSystemFolderStructure();
```

### `ensureProjectStructure(companyId, projectId, projectName, mainFolder, subFolder)`
Skapar projektstrukturen med standardmappar.

```javascript
import { ensureProjectStructure } from '../services/azure/fileService';

await ensureProjectStructure(
  'MS Byggsystem',
  'PROJ001',
  'Testprojekt',
  'Entreprenad',
  '2026'
);
```

## Företagsspecifika Sites

För större företag kan projektfiler sparas i företagets egen SharePoint site istället:

- **MS Byggsystem site**: För MS Byggsystem-specifika projektfiler
- **Digitalkontroll site**: För systemfiler och admin-filer

Detta avgörs automatiskt baserat på `sharePointSiteId` i företagsprofilen.

## Best Practices

1. **Admin-filer**: Alltid i Digitalkontroll-siten (`01-Company/`)
2. **Projektfiler**: I Digitalkontroll-siten för mindre företag, i företagsspecifika sites för större företag
3. **Systemfiler**: Alltid i Digitalkontroll-siten (`03-System/`)
4. **Namngivning**: Använd beskrivande namn och inkludera timestamps för unika filer

## Uppdateringar

Strukturen kan utökas i framtiden med:
- `05-Archives/` för arkiverade projekt
- `06-Reports/` för systemrapporter
- Företagsspecifika undermappar under `04-Shared/`
