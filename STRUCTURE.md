# Projektstruktur - DigitalKontroll

## Översikt

Detta dokument beskriver den nya, refaktorerade strukturen för DigitalKontroll-projektet.

## Mappstruktur

```
Kod/
├── Screens/                    # Huvudskärmar (endast routing/orchestration)
│   ├── HomeScreen.js           # ~200-300 rader (efter refaktorering)
│   ├── ProjectDetails.js       # ~300-400 rader (efter refaktorering)
│   └── ...
│
├── components/                 # Återanvändbara komponenter
│   ├── common/                 # Plattformsoberoende komponenter
│   │   ├── ProjectTree/        # Projekt-träd komponenter
│   │   │   ├── ProjectTree.js
│   │   │   ├── ProjectTreeNode.js
│   │   │   ├── ProjectFunctionNode.js
│   │   │   ├── ProjectTreeFolder.js
│   │   │   ├── useProjectTree.js
│   │   │   ├── constants.js
│   │   │   └── index.js
│   │   ├── Dashboard/          # Dashboard-komponenter
│   │   └── Modals/             # Modal-komponenter
│   │
│   ├── web/                    # Endast web-specifika komponenter
│   │   ├── WebBreadcrumbHeader.js
│   │   └── ...
│   │
│   ├── native/                 # Endast native-specifika komponenter
│   │   └── ...
│   │
│   └── forms/                  # Formulärkomponenter
│       └── ControlForm/
│
├── features/                   # Feature-baserad struktur
│   ├── projects/
│   │   ├── components/
│   │   ├── hooks/
│   │   └── services/
│   ├── controls/
│   ├── drawings/               # Ny funktion
│   ├── meetings/               # Ny funktion
│   └── kma/                    # Ny funktion
│
├── hooks/                      # Globala hooks
│   ├── common/
│   │   └── useHierarchy.js
│   ├── usePlatform.js
│   └── useBackgroundSync.js
│
├── utils/                      # Hjälpfunktioner
│   ├── platform/
│   │   └── index.js           # Platform-utilities
│   ├── validation.js
│   ├── alerts.js
│   └── appVersion.js
│
└── services/                   # Business logic
    └── firebase/               # Delad upp firebase.js
        ├── auth.js
        ├── firestore.js
        ├── storage.js
        └── index.js
```

## Filstorlekar (mål)

### Efter refaktorering:
- **HomeScreen.js**: ~200-300 rader (från 7,740)
- **ProjectDetails.js**: ~300-400 rader (från 4,167)
- **BaseControlForm.js**: ~500-800 rader (från 5,272)
- **Komponenter**: 100-300 rader vardera
- **Hooks**: 50-200 rader vardera

## Platform-hantering

### FÖRE (gammalt sätt):
```javascript
if (Platform.OS === 'web') {
  // web code
} else {
  // native code
}
```

### EFTER (nytt sätt):
```javascript
import { isWeb, PlatformComponent } from '../utils/platform';

if (isWeb) {
  // web code
}

// Eller för komponenter:
<PlatformComponent
  web={<WebComponent />}
  native={<NativeComponent />}
/>
```

## Nya funktioner

### Projektfunktioner i trädet

Varje projekt kan nu expanderas för att visa:
- Handlingar (kontroller)
- Ritningar
- Möten
- Förfrågningsunderlag
- KMA

Se `docs/project-functions-implementation.md` för detaljer.

## Migrationsstatus

### ✅ Klart:
- [x] Mappstruktur skapad
- [x] Platform-utilities (`utils/platform/`)
- [x] Validation utilities
- [x] Alert utilities
- [x] ProjectTree-komponenter skapade
- [x] useProjectTree hook
- [x] useHierarchy hook

### 🔄 Pågående:
- [ ] Integrera ProjectTree i HomeScreen.js
- [ ] Extrahera Dashboard från HomeScreen.js
- [ ] Dela upp firebase.js
- [ ] Refaktorera ProjectDetails.js

### 📋 Planerat:
- [ ] Skapa screens för nya funktioner (Ritningar, Möten, etc.)
- [ ] Feature-struktur för nya funktioner
- [ ] Ytterligare komponenter

## Användning

### Importera komponenter:
```javascript
// ProjectTree
import { ProjectTree } from '../components/common/ProjectTree';

// Platform utilities
import { isWeb, PlatformComponent } from '../utils/platform';

// Hooks
import { usePlatform } from '../hooks/usePlatform';
import { useHierarchyToggle } from '../hooks/common/useHierarchy';
```

## Fördelar

1. **Läsbarhet**: Mindre filer, tydligare struktur
2. **Underhållbarhet**: Lätt att hitta och ändra kod
3. **Testbarhet**: Mindre komponenter är lättare att testa
4. **Återanvändbarhet**: Komponenter kan användas flera gånger
5. **Teamutveckling**: Mindre merge-konflikter
6. **Skalbarhet**: Lätt att lägga till nya funktioner

## Nästa steg

1. Integrera ProjectTree i HomeScreen.js
2. Testa att allt fungerar
3. Fortsätt med Dashboard-extraktion
4. Dela upp firebase.js
5. Implementera nya funktioner (Ritningar, Möten, etc.)
