# Refaktoreringsplan: Strukturförbättringar

## Problemidentifiering

### Nuvarande problem:
- **HomeScreen.js**: 7,740 rader (!!)
- **BaseControlForm.js**: 5,272 rader
- **ProjectDetails.js**: 4,167 rader
- **127 Platform.OS-kontroller** i HomeScreen.js ensamt
- Web/native-logik blandad överallt
- Svårt att hitta och underhålla kod
- Risk för merge-konflikter vid teamutveckling

## Ny Struktur

```
Kod/
├── Screens/                    # Huvudskärmar (endast routing/logik)
│   ├── HomeScreen.js           # ~200-300 rader (endast orchestration)
│   ├── ProjectDetails.js       # ~300-400 rader
│   └── ...
│
├── components/                 # Återanvändbara komponenter
│   ├── common/                 # Plattformsoberoende
│   │   ├── ProjectTree/
│   │   │   ├── ProjectTree.js
│   │   │   ├── ProjectTreeNode.js
│   │   │   ├── ProjectFunctionNode.js
│   │   │   └── useProjectTree.js
│   │   ├── Dashboard/
│   │   │   ├── Dashboard.js
│   │   │   ├── DashboardOverview.js
│   │   │   ├── DashboardReminders.js
│   │   │   └── DashboardActivity.js
│   │   └── ...
│   │
│   ├── web/                    # Endast web-specifik
│   │   ├── WebBreadcrumbHeader.js (finns redan)
│   │   ├── WebProjectTree.js
│   │   ├── WebDashboard.js
│   │   └── ...
│   │
│   ├── native/                 # Endast native-specifik
│   │   ├── NativeProjectTree.js
│   │   ├── NativeDashboard.js
│   │   └── ...
│   │
│   └── forms/                  # Formulärkomponenter
│       ├── ControlForm/
│       │   ├── ControlForm.js
│       │   ├── ControlFormFields.js
│       │   ├── ControlFormValidation.js
│       │   └── useControlForm.js
│       └── ...
│
├── features/                   # Feature-baserad struktur
│   ├── projects/
│   │   ├── components/
│   │   │   ├── ProjectCard.js
│   │   │   ├── ProjectList.js
│   │   │   └── ProjectForm.js
│   │   ├── hooks/
│   │   │   ├── useProjects.js
│   │   │   └── useProjectHierarchy.js
│   │   ├── services/
│   │   │   └── projectService.js
│   │   └── types.js
│   │
│   ├── controls/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── services/
│   │
│   ├── drawings/               # Ny funktion
│   │   ├── components/
│   │   ├── hooks/
│   │   └── services/
│   │
│   └── meetings/               # Ny funktion
│       ├── components/
│       ├── hooks/
│       └── services/
│
├── hooks/                      # Globala hooks
│   ├── usePlatform.js          # Platform-helper
│   ├── useAuth.js
│   └── ...
│
├── utils/                      # Hjälpfunktioner
│   ├── platform/
│   │   ├── web.js
│   │   ├── native.js
│   │   └── index.js
│   ├── validation.js
│   └── formatting.js
│
└── services/                   # Business logic
    ├── firebase/               # Dela upp firebase.js
    │   ├── auth.js
    │   ├── firestore.js
    │   ├── storage.js
    │   └── index.js
    └── ...
```

## Refaktoreringssteg

### Fas 1: Skapa ny struktur (ingen funktionalitet ändras)

1. **Skapa mappstruktur**
   ```bash
   mkdir -p components/common/ProjectTree
   mkdir -p components/web
   mkdir -p components/native
   mkdir -p components/forms/ControlForm
   mkdir -p features/projects/{components,hooks,services}
   mkdir -p features/controls/{components,hooks,services}
   mkdir -p utils/platform
   mkdir -p services/firebase
   ```

2. **Skapa platform-helper**
   - `utils/platform/index.js` - Enhetlig platform-API
   - `hooks/usePlatform.js` - React hook för platform

### Fas 2: Extrahera komponenter från HomeScreen.js

**HomeScreen.js innehåller:**
- Projekt-träd rendering (~2000 rader)
- Dashboard (~1500 rader)
- Modals (~1000 rader)
- State management (~500 rader)
- Web-specifik logik (~1500 rader)
- Native-specifik logik (~500 rader)
- Utility functions (~500 rader)

**Extrahera till:**

1. **ProjectTree-komponenter**
   - `components/common/ProjectTree/ProjectTree.js` - Huvudkomponent
   - `components/common/ProjectTree/ProjectTreeNode.js` - En projektrad
   - `components/common/ProjectTree/ProjectFunctionNode.js` - Funktion under projekt
   - `components/web/WebProjectTree.js` - Web-specifik styling/logik
   - `components/native/NativeProjectTree.js` - Native-specifik styling/logik
   - `hooks/useProjectTree.js` - State och logik för trädet

2. **Dashboard-komponenter**
   - `components/common/Dashboard/Dashboard.js`
   - `components/common/Dashboard/DashboardOverview.js`
   - `components/common/Dashboard/DashboardReminders.js`
   - `components/common/Dashboard/DashboardActivity.js`

3. **Modal-komponenter**
   - `components/common/Modals/NewProjectModal.js`
   - `components/common/Modals/NewFolderModal.js`
   - `components/common/Modals/SearchModal.js`

### Fas 3: Extrahera från ProjectDetails.js

**ProjectDetails.js innehåller:**
- Projektinfo-formulär (~800 rader)
- Kontrolllista (~1000 rader)
- PDF-export (~500 rader)
- State management (~500 rader)

**Extrahera till:**
- `features/projects/components/ProjectInfoForm.js`
- `features/projects/components/ProjectControlsList.js`
- `features/projects/hooks/useProjectDetails.js`

### Fas 4: Dela upp firebase.js

**firebase.js innehåller:**
- Auth-funktioner
- Firestore-funktioner
- Storage-funktioner
- Company-funktioner
- User-funktioner
- Control-funktioner

**Dela upp i:**
- `services/firebase/auth.js`
- `services/firebase/firestore.js`
- `services/firebase/storage.js`
- `services/firebase/companies.js`
- `services/firebase/users.js`
- `services/firebase/controls.js`
- `services/firebase/index.js` - Re-exports

### Fas 5: Skapa platform-abstraktioner

**Problem:** 127 Platform.OS-kontroller i HomeScreen.js

**Lösning:** Skapa enhetlig API

```javascript
// utils/platform/index.js
import { Platform } from 'react-native';

export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS !== 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

// Platform-specifika komponenter
export const PlatformComponent = ({ web, native, ...props }) => {
  if (isWeb && web) return web(props);
  if (isNative && native) return native(props);
  return null;
};

// Platform-specifika styles
export const platformStyles = (webStyle, nativeStyle) => {
  return isWeb ? webStyle : nativeStyle;
};
```

## Implementation Prioritet

### Prioritet 1: Kritiskt (gör först)
1. ✅ Skapa mappstruktur
2. ✅ Skapa platform-utils
3. ✅ Extrahera ProjectTree från HomeScreen
4. ✅ Extrahera Dashboard från HomeScreen

### Prioritet 2: Viktigt (gör nästa)
5. ✅ Dela upp firebase.js
6. ✅ Extrahera modals från HomeScreen
7. ✅ Refaktorera ProjectDetails.js

### Prioritet 3: Önskvärt (gör senare)
8. ✅ Skapa feature-struktur för nya funktioner
9. ✅ Extrahera forms till egna komponenter
10. ✅ Skapa typer/interfaces

## Exempel: Refaktorera ProjectTree

### FÖRE (i HomeScreen.js):
```javascript
// 2000+ rader med träd-rendering, state, web/native-logik blandad
```

### EFTER:

**components/common/ProjectTree/ProjectTree.js:**
```javascript
import React from 'react';
import { PlatformComponent } from '../../../utils/platform';
import WebProjectTree from '../../web/WebProjectTree';
import NativeProjectTree from '../../native/NativeProjectTree';
import { useProjectTree } from '../../../hooks/useProjectTree';

export default function ProjectTree({ hierarchy, onSelectProject, companyId }) {
  const treeProps = useProjectTree({ hierarchy, companyId });
  
  return (
    <PlatformComponent
      web={(props) => <WebProjectTree {...props} {...treeProps} />}
      native={(props) => <NativeProjectTree {...props} {...treeProps} />}
    />
  );
}
```

**hooks/useProjectTree.js:**
```javascript
import { useState, useCallback } from 'react';

export function useProjectTree({ hierarchy, companyId }) {
  const [expandedProjects, setExpandedProjects] = useState({});
  
  const toggleProject = useCallback((projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);
  
  // All träd-logik här
  
  return {
    expandedProjects,
    toggleProject,
    // ... andra värden/funktioner
  };
}
```

## Fördelar med ny struktur

1. **Läsbarhet**: Filer är 200-500 rader istället för 7000+
2. **Underhållbarhet**: Lätt att hitta och ändra kod
3. **Testbarhet**: Mindre komponenter är lättare att testa
4. **Återanvändbarhet**: Komponenter kan användas flera gånger
5. **Teamutveckling**: Mindre merge-konflikter
6. **Skalbarhet**: Lätt att lägga till nya funktioner

## Migrationsstrategi

### Stegvis migration (ingen downtime)

1. **Skapa nya filer** parallellt med gamla
2. **Importera nya komponenter** i gamla filer
3. **Testa noggrant** att allt fungerar
4. **Ta bort gamla implementationer** när nya är verifierade
5. **Upprepa** för nästa komponent

### Exempel migration:

```javascript
// HomeScreen.js - FÖRE
export default function HomeScreen() {
  // 7000+ rader kod
}

// HomeScreen.js - EFTER (stegvis)
import ProjectTree from '../components/common/ProjectTree/ProjectTree';
import Dashboard from '../components/common/Dashboard/Dashboard';

export default function HomeScreen() {
  // ~200 rader orchestration
  return (
    <View>
      <ProjectTree {...props} />
      <Dashboard {...props} />
    </View>
  );
}
```

## Checklista

- [ ] Skapa mappstruktur
- [ ] Skapa platform-utils
- [ ] Extrahera ProjectTree
- [ ] Extrahera Dashboard
- [ ] Extrahera Modals
- [ ] Dela upp firebase.js
- [ ] Refaktorera ProjectDetails
- [ ] Skapa feature-struktur
- [ ] Uppdatera imports överallt
- [ ] Testa allt noggrant
- [ ] Ta bort gamla implementationer
