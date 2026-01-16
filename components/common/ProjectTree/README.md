# ProjectTree Component

## Översikt

Detta är en refaktorerad version av projekt-trädet från HomeScreen.js.

## Struktur

```
ProjectTree/
├── ProjectTree.js          # Huvudkomponent (orchestration)
├── ProjectTreeNode.js      # En projektrad
├── ProjectFunctionNode.js  # Funktion under projekt (ny)
├── ProjectTreeFolder.js    # Mapp (huvud/undermapp)
├── useProjectTree.js       # State och logik
└── types.js                # TypeScript types (om vi migrerar)
```

## Användning

```javascript
import ProjectTree from '../components/common/ProjectTree/ProjectTree';

<ProjectTree
  hierarchy={hierarchy}
  onSelectProject={handleSelectProject}
  onSelectFunction={handleSelectFunction}
  companyId={companyId}
/>
```

## Migration från HomeScreen.js

1. Extrahera träd-rendering (~2000 rader)
2. Separera web/native-logik
3. Flytta state till useProjectTree hook
4. Skapa återanvändbara komponenter
