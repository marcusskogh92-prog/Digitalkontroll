# Projektfaser i Hierarkin - Arkitekturplan

## Översikt

Systemet behöver stödja projektfaser som en nivå i hierarkin, där varje fas har sina egna huvudmappar och undermappar:

**Struktur:**
```
Företag
├── Kalkylskede
│   ├── Entreprenad (Huvudmapp)
│   │   ├── 2026 (Undermapp)
│   │   │   ├── Projekt 1
│   │   │   └── Projekt 2
│   │   └── 2027 (Undermapp)
│   ├── Byggservice (Huvudmapp)
│   └── Ramavtal (Huvudmapp)
├── Produktion
│   ├── Entreprenad (Huvudmapp)
│   │   ├── 2026 (Undermapp)
│   │   └── 2027 (Undermapp)
│   └── Byggservice (Huvudmapp)
├── Avslut
│   └── ...
└── Eftermarknad
    └── ...
```

## Nuvarande Struktur

### Nuvarande hierarki:
```javascript
[
  {
    id: 'main1',
    name: 'Entreprenad',
    type: 'main',
    expanded: false,
    children: [
      {
        id: 'sub1',
        name: '2026',
        type: 'sub',
        expanded: false,
        children: [
          {
            id: 'P-1001',
            name: 'Opus bilprovning',
            type: 'project',
            status: 'ongoing',
            // ...
          }
        ]
      }
    ]
  }
]
```

## Ny Struktur med Faser

### Ny hierarki:
```javascript
[
  {
    id: 'phase-kalkylskede',
    name: 'Kalkylskede',
    type: 'phase',
    expanded: true,
    children: [
      {
        id: 'main1',
        name: 'Entreprenad',
        type: 'main',
        expanded: false,
        children: [
          {
            id: 'sub1',
            name: '2026',
            type: 'sub',
            expanded: false,
            children: [
              {
                id: 'P-1001',
                name: 'Opus bilprovning',
                type: 'project',
                status: 'ongoing',
                phase: 'kalkylskede', // För konsistens
                // ...
              }
            ]
          }
        ]
      },
      {
        id: 'main2',
        name: 'Byggservice',
        type: 'main',
        // ...
      }
    ]
  },
  {
    id: 'phase-produktion',
    name: 'Produktion',
    type: 'phase',
    expanded: false,
    children: [
      // Huvudmappar för produktion
    ]
  },
  {
    id: 'phase-avslut',
    name: 'Avslut',
    type: 'phase',
    expanded: false,
    children: [
      // Huvudmappar för avslut
    ]
  },
  {
    id: 'phase-eftermarknad',
    name: 'Eftermarknad',
    type: 'phase',
    expanded: false,
    children: [
      // Huvudmappar för eftermarknad
    ]
  }
]
```

## Firestore-struktur

### Nuvarande:
```
companies/{companyId}/
└── hierarchy/
    └── data: [
      { id: 'main1', type: 'main', name: 'Entreprenad', children: [...] },
      { id: 'sub1', type: 'sub', name: '2026', children: [...] },
      { id: 'P-1001', type: 'project', name: '...', ... }
    ]
```

### Ny struktur:
```
companies/{companyId}/
└── hierarchy/
    └── data: [
      { id: 'phase-kalkylskede', type: 'phase', name: 'Kalkylskede', children: [...] },
      { id: 'phase-produktion', type: 'phase', name: 'Produktion', children: [...] },
      { id: 'phase-avslut', type: 'phase', name: 'Avslut', children: [...] },
      { id: 'phase-eftermarknad', type: 'phase', name: 'Eftermarknad', children: [...] }
    ]
```

**Varje phase har children med huvudmappar:**
```javascript
{
  id: 'phase-kalkylskede',
  type: 'phase',
  name: 'Kalkylskede',
  children: [
    {
      id: 'main1',
      type: 'main',
      name: 'Entreprenad',
      phase: 'kalkylskede', // För referens
      children: [
        {
          id: 'sub1',
          type: 'sub',
          name: '2026',
          phase: 'kalkylskede',
          children: [
            {
              id: 'P-1001',
              type: 'project',
              name: 'Opus bilprovning',
              phase: 'kalkylskede',
              // ...
            }
          ]
        }
      ]
    }
  ]
}
```

## Konstanter

```javascript
// features/projects/constants.js
export const PROJECT_PHASES = [
  { 
    id: 'phase-kalkylskede',
    key: 'kalkylskede', 
    name: 'Kalkylskede', 
    color: '#1976D2', 
    icon: 'calculator-outline',
    order: 1
  },
  { 
    id: 'phase-produktion',
    key: 'produktion', 
    name: 'Produktion', 
    color: '#43A047', 
    icon: 'construct-outline',
    order: 2
  },
  { 
    id: 'phase-avslut',
    key: 'avslut', 
    name: 'Avslut', 
    color: '#F57C00', 
    icon: 'checkmark-circle-outline',
    order: 3
  },
  { 
    id: 'phase-eftermarknad',
    key: 'eftermarknad', 
    name: 'Eftermarknad', 
    color: '#7B1FA2', 
    icon: 'time-outline',
    order: 4
  },
];
```

## Implementation Plan

### Steg 1: Uppdatera Hierarchy-struktur

**Skapa helper-funktioner:**
```javascript
// hooks/common/useHierarchy.js
export function ensurePhaseStructure(hierarchy) {
  // Om hierarchy inte har faser, lägg till dem
  const hasPhases = hierarchy.some(item => item.type === 'phase');
  
  if (!hasPhases) {
    // Migrera befintlig struktur till faser
    return migrateToPhaseStructure(hierarchy);
  }
  
  return hierarchy;
}

function migrateToPhaseStructure(oldHierarchy) {
  // Flytta allt till "Produktion" som default
  return PROJECT_PHASES.map(phase => {
    if (phase.key === 'produktion') {
      // Flytta befintlig struktur hit
      return {
        ...phase,
        type: 'phase',
        expanded: true,
        children: oldHierarchy.map(item => ({
          ...item,
          phase: 'produktion'
        }))
      };
    } else {
      // Tomma faser för de andra
      return {
        ...phase,
        type: 'phase',
        expanded: false,
        children: []
      };
    }
  });
}
```

### Steg 2: Uppdatera ProjectTree-komponenter

**Lägg till PhaseNode:**
```javascript
// components/common/ProjectTree/ProjectPhaseNode.js
export default function ProjectPhaseNode({
  phase,
  isExpanded,
  onToggle,
  children
}) {
  const phaseConfig = PROJECT_PHASES.find(p => p.key === phase.key);
  
  return (
    <View>
      <TouchableOpacity onPress={() => onToggle(phase.id)}>
        <View style={styles.phaseHeader}>
          <Ionicons 
            name={phaseConfig.icon} 
            size={20} 
            color={phaseConfig.color} 
          />
          <Text style={[styles.phaseName, { color: phaseConfig.color }]}>
            {phase.name}
          </Text>
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={18}
            color="#666"
          />
        </View>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={styles.phaseContent}>
          {/* Rendera huvudmappar här */}
          {children.map(main => (
            <ProjectTreeFolder
              key={main.id}
              folder={main}
              // ...
            />
          ))}
        </View>
      )}
    </View>
  );
}
```

**Uppdatera ProjectTree:**
```javascript
// components/common/ProjectTree/ProjectTree.js
export default function ProjectTree({ hierarchy, ... }) {
  const hierarchyWithPhases = ensurePhaseStructure(hierarchy);
  
  return (
    <View>
      {hierarchyWithPhases.map(item => {
        if (item.type === 'phase') {
          return (
            <ProjectPhaseNode
              key={item.id}
              phase={item}
              isExpanded={expandedPhases[item.id] || false}
              onToggle={handleTogglePhase}
              children={item.children || []}
            />
          );
        }
        // Fallback för gammal struktur (under migration)
        return <ProjectTreeFolder key={item.id} folder={item} />;
      })}
    </View>
  );
}
```

### Steg 3: Uppdatera HomeScreen

**Lägg till phase-expansion state:**
```javascript
// HomeScreen.js
const [expandedPhases, setExpandedPhases] = useState({
  'phase-kalkylskede': false,
  'phase-produktion': true, // Default expanded
  'phase-avslut': false,
  'phase-eftermarknad': false,
});

const handleTogglePhase = (phaseId) => {
  setExpandedPhases(prev => ({
    ...prev,
    [phaseId]: !prev[phaseId]
  }));
};
```

**Uppdatera "Skapa huvudmapp" för att kräva fas:**
```javascript
// När användare skapar huvudmapp, välj fas först
const handleAddMainFolder = () => {
  // Visa modal för att välja fas
  setNewMainModal({ visible: true, phase: null });
};

// När användare väljer fas och namn:
const createMainFolder = (phaseKey, folderName) => {
  const phaseId = `phase-${phaseKey}`;
  // Lägg till huvudmapp i rätt fas
  setHierarchy(prev => prev.map(phase => 
    phase.id === phaseId
      ? {
          ...phase,
          children: [
            ...phase.children,
            {
              id: generateId(),
              type: 'main',
              name: folderName,
              phase: phaseKey,
              expanded: false,
              children: []
            }
          ]
        }
      : phase
  ));
};
```

**Uppdatera "Skapa undermapp" för att behålla fas:**
```javascript
// När användare skapar undermapp, använd samma fas som huvudmappen
const handleAddSubFolder = (mainId, phaseKey) => {
  setNewSubModal({ 
    visible: true, 
    parentId: mainId,
    phase: phaseKey 
  });
};
```

**Uppdatera "Skapa projekt" för att behålla fas:**
```javascript
// När användare skapar projekt, använd samma fas som undermappen
const handleAddProject = (subId, phaseKey) => {
  setNewProjectModal({ 
    visible: true, 
    parentSubId: subId,
    phase: phaseKey 
  });
  
  // När projekt skapas:
  const newProject = {
    id: projectNumber,
    name: projectName,
    type: 'project',
    phase: phaseKey, // Sätt fas
    status: 'ongoing',
    // ...
  };
};
```

### Steg 4: Migration av Befintlig Data

**Migration script:**
```javascript
// scripts/migrate-to-phases.js
async function migrateHierarchyToPhases() {
  const companies = await fetchAllCompanies();
  
  for (const company of companies) {
    const hierarchy = await fetchHierarchy(company.id);
    
    // Kontrollera om redan migrerad
    const hasPhases = hierarchy.some(item => item.type === 'phase');
    if (hasPhases) continue;
    
    // Migrera till fas-struktur
    const newHierarchy = migrateToPhaseStructure(hierarchy);
    
    // Spara
    await saveHierarchy(company.id, newHierarchy);
  }
}
```

**Migration-logik:**
```javascript
function migrateToPhaseStructure(oldHierarchy) {
  // Alla befintliga projekt går till "Produktion"
  return PROJECT_PHASES.map(phase => {
    if (phase.key === 'produktion') {
      return {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        expanded: true,
        children: oldHierarchy.map(main => ({
          ...main,
          phase: 'produktion',
          children: (main.children || []).map(sub => ({
            ...sub,
            phase: 'produktion',
            children: (sub.children || []).map(project => ({
              ...project,
              phase: 'produktion'
            }))
          }))
        }))
      };
    } else {
      return {
        id: phase.id,
        type: 'phase',
        name: phase.name,
        expanded: false,
        children: []
      };
    }
  });
}
```

## Användarupplevelse (UX)

### Projekt-träd:

```
Projekt
├── 🟦 Kalkylskede
│   ├── Entreprenad
│   │   ├── 2026
│   │   │   ├── 825-10 Datacenter
│   │   │   └── 826-11 Kontor
│   │   └── 2027
│   ├── Byggservice
│   └── Ramavtal
├── 🟩 Produktion
│   ├── Entreprenad
│   │   ├── 2026
│   │   │   └── 824-09 Lager
│   └── Byggservice
├── 🟧 Avslut
│   └── Entreprenad
│       └── 2025
│           └── 820-01 Gammalt projekt
└── 🟪 Eftermarknad
    └── Entreprenad
        └── 2024
            └── 815-05 Underhåll
```

### Skapa ny huvudmapp:

1. Klicka på fas (t.ex. "Kalkylskede")
2. Klicka "Lägg till huvudmapp"
3. Välj fas (om inte redan vald)
4. Ange namn (t.ex. "Entreprenad")
5. Huvudmappen skapas i rätt fas

### Flytta projekt mellan faser:

1. Högerklicka på projekt
2. Välj "Flytta till fas..."
3. Välj ny fas
4. Projektet flyttas (eller kopieras)

## Fördelar med denna struktur

1. ✅ **Tydlig separation** - Varje fas har sina egna mappar
2. ✅ **Flexibel** - Kan skapa mappar i varje fas
3. ✅ **Skalbar** - Lätt att lägga till nya faser
4. ✅ **Organiserad** - Tydlig struktur för användare
5. ✅ **Sökbar** - Kan söka/filtrera per fas

## Implementation Checklist

- [ ] Skapa PROJECT_PHASES konstanter
- [ ] Uppdatera Firestore-struktur för att stödja phase-typ
- [ ] Skapa ProjectPhaseNode-komponent
- [ ] Uppdatera ProjectTree för att hantera faser
- [ ] Uppdatera HomeScreen för phase-expansion
- [ ] Uppdatera "Skapa huvudmapp" för att kräva fas
- [ ] Uppdatera "Skapa undermapp" för att behålla fas
- [ ] Uppdatera "Skapa projekt" för att behålla fas
- [ ] Skapa migration-script
- [ ] Testa migration
- [ ] Uppdatera dokumentation

## Tidsuppskattning

- **Steg 1-2**: 4-6 timmar (Struktur + Komponenter)
- **Steg 3**: 3-4 timmar (HomeScreen uppdateringar)
- **Steg 4**: 2-3 timmar (Migration)
- **Testning**: 2-3 timmar

**Totalt: 11-16 timmar** (1.5-2 dagar)
