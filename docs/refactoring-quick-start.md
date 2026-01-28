# Quick Start: Refaktorering

## Vad vi har skapat

### ✅ 1. Platform Utilities
- `utils/platform/index.js` - Enhetlig API för web/native
- `hooks/usePlatform.js` - React hook för platform-checks

**Användning:**
```javascript
// FÖRE (gammalt sätt):
if (Platform.OS === 'web') {
  // web code
} else {
  // native code
}

// EFTER (nytt sätt):
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

### ✅ 2. Refaktoreringsplan
- `docs/refactoring-plan.md` - Detaljerad plan
- `docs/project-functions-implementation.md` - Plan för projektfunktioner

## Nästa steg - Prioriterad ordning

### Steg 1: Testa platform-utils (5 min)
1. Öppna `HomeScreen.js`
2. Hitta en `Platform.OS === 'web'` check
3. Ersätt med `isWeb` från `utils/platform`
4. Testa att det fungerar

**Exempel:**
```javascript
// FÖRE (rad ~262 i HomeScreen.js):
const isWeb = Platform.OS === 'web';

// EFTER:
import { isWeb } from '../utils/platform';
```

### Steg 2: Skapa mappstruktur (2 min)
Kör dessa kommandon i terminalen:

```bash
cd "/Users/marcusskogh/MS Byggsystem/05 - Projekt/Digitalkontroll/Kod"

# Skapa mappar
mkdir -p components/common/ProjectTree
mkdir -p components/common/Dashboard
mkdir -p components/web
mkdir -p components/native
mkdir -p features/projects/{components,hooks,services}
mkdir -p features/controls/{components,hooks,services}
mkdir -p utils/platform
mkdir -p services/firebase
```

### Steg 3: Extrahera ProjectTree (1-2 timmar)
1. Kopiera träd-rendering från `HomeScreen.js` (runt rad 7500-7620)
2. Skapa `components/common/ProjectTree/ProjectTree.js`
3. Flytta state till `hooks/useProjectTree.js`
4. Uppdatera `HomeScreen.js` att använda nya komponenten

### Steg 4: Extrahera Dashboard (1-2 timmar)
1. Kopiera dashboard-kod från `HomeScreen.js` (runt rad 6000-6400)
2. Skapa `components/common/Dashboard/Dashboard.js`
3. Dela upp i mindre komponenter
4. Uppdatera `HomeScreen.js`

### Steg 5: Dela upp firebase.js (1 timme)
1. Skapa `services/firebase/auth.js`
2. Skapa `services/firebase/firestore.js`
3. Skapa `services/firebase/storage.js`
4. Flytta funktioner från `components/firebase.js`
5. Uppdatera imports överallt

## Migrationsstrategi

### ⚠️ VIKTIGT: Stegvis migration

**GÖR INTE:**
- ❌ Refaktorera allt på en gång
- ❌ Ta bort gamla filer innan nya är testade
- ❌ Ändra funktionalitet under refaktorering

**GÖR:**
- ✅ Refaktorera en komponent i taget
- ✅ Testa noggrant efter varje steg
- ✅ Behåll gamla filer tills nya fungerar
- ✅ Commita ofta (små commits)

## Exempel: Refaktorera en liten del först

### Exempel 1: showAlert-funktionen

**FÖRE (i HomeScreen.js rad ~46):**
```javascript
function showAlert(title, message, buttons) {
  if (Platform && Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.alert === 'function') {
    // ...
  }
  // ...
}
```

**EFTER:**
1. Skapa `utils/alerts.js`:
```javascript
import { isWeb } from './platform';

export function showAlert(title, message, buttons) {
  if (isWeb && typeof window !== 'undefined' && typeof window.alert === 'function') {
    // ...
  }
  // ...
}
```

2. Uppdatera `HomeScreen.js`:
```javascript
import { showAlert } from '../utils/alerts';
// Ta bort den gamla funktionen
```

## Fördelar redan nu

Även om vi bara refaktorerar lite:

1. **Mindre kodduplicering**: Platform-utils används överallt
2. **Lättare att testa**: Mindre komponenter
3. **Bättre struktur**: Tydligare var saker ligger
4. **Förberedelse**: Redo för att lägga till nya funktioner

## Tidsestimering

- **Steg 1-2**: 10 minuter (setup)
- **Steg 3**: 1-2 timmar (ProjectTree)
- **Steg 4**: 1-2 timmar (Dashboard)
- **Steg 5**: 1 timme (firebase.js)
- **Totalt**: ~4-6 timmar för grundläggande refaktorering

## När vi är klara

Efter refaktorering:
- ✅ HomeScreen.js: ~200-300 rader (istället för 7740)
- ✅ Tydlig separation web/native
- ✅ Lätt att lägga till nya funktioner
- ✅ Lättare att underhålla
- ✅ Redo för teamutveckling

## Frågor?

Om något är oklart:
1. Kolla `docs/refactoring-plan.md` för detaljer
2. Börja med små ändringar
3. Testa ofta
4. Commita ofta
