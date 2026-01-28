# Projektfaser - Slutlig Arkitektur (Tydlig Separation)

## Användarens Krav

1. ✅ **Tydlig separation** - Inte blanda projekt i olika faser i samma träd
2. ✅ **Enkelt att växla** - Dropdown eller liknande för att välja fas
3. ✅ **Skapa mappar per fas** - Kunna skapa huvudmappar/undermappar i varje fas
4. ✅ **Tydlighet** - Mycket tydligt vilken fas man jobbar i

## Slutlig Lösning: Faser som Hierarkinivå + Dashboard Dropdown

### Struktur:
```
Dashboard
└── [Dropdown: Välj fas]
    ├── Kalkylskede
    │   ├── Entreprenad (Huvudmapp)
    │   │   ├── 2026 (Undermapp)
    │   │   │   └── Projekt
    │   │   └── 2027 (Undermapp)
    │   ├── Byggservice (Huvudmapp)
    │   └── Ramavtal (Huvudmapp)
    │
    ├── Produktion
    │   ├── Entreprenad (Huvudmapp)
    │   └── Byggservice (Huvudmapp)
    │
    ├── Avslut
    │   └── ...
    │
    └── Eftermarknad
        └── ...
```

### Firestore-struktur:
```javascript
// companies/{companyId}/hierarchy/data
[
  {
    id: 'phase-kalkylskede',
    type: 'phase',
    name: 'Kalkylskede',
    expanded: false,
    children: [
      {
        id: 'main1',
        type: 'main',
        name: 'Entreprenad',
        phase: 'kalkylskede',
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
                name: 'Datacenter',
                phase: 'kalkylskede',
                // ...
              }
            ]
          }
        ]
      }
    ]
  },
  {
    id: 'phase-produktion',
    type: 'phase',
    name: 'Produktion',
    expanded: false,
    children: [
      // Huvudmappar för produktion
    ]
  },
  // ... andra faser
]
```

## Implementation Plan

### Steg 1: Uppdatera Hierarchy-struktur

**Lägg till phase-typ:**
```javascript
// hooks/common/useHierarchy.js
export function ensurePhaseStructure(hierarchy) {
  const hasPhases = hierarchy.some(item => item.type === 'phase');
  
  if (!hasPhases) {
    // Migrera befintlig struktur
    return migrateToPhaseStructure(hierarchy);
  }
  
  return hierarchy;
}

function migrateToPhaseStructure(oldHierarchy) {
  return PROJECT_PHASES.map(phase => {
    if (phase.key === 'produktion') {
      // Flytta allt till Produktion som default
      return {
        id: `phase-${phase.key}`,
        type: 'phase',
        name: phase.name,
        expanded: false,
        children: oldHierarchy.map(item => ({
          ...item,
          phase: 'produktion',
          children: (item.children || []).map(sub => ({
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
      // Tomma faser för de andra
      return {
        id: `phase-${phase.key}`,
        type: 'phase',
        name: phase.name,
        expanded: false,
        children: []
      };
    }
  });
}
```

### Steg 2: Skapa PhaseSelector-komponent

**Dashboard dropdown:**
```javascript
// components/common/PhaseSelector.js
export default function PhaseSelector({ selectedPhase, onPhaseChange }) {
  return (
    <View style={styles.selector}>
      <Text style={styles.label}>Välj fas:</Text>
      <View style={styles.phaseButtons}>
        {PROJECT_PHASES.map(phase => (
          <TouchableOpacity
            key={phase.key}
            onPress={() => onPhaseChange(phase.key)}
            style={[
              styles.phaseButton,
              selectedPhase === phase.key && styles.phaseButtonActive
            ]}
          >
            <View style={[styles.phaseDot, { backgroundColor: phase.color }]} />
            <Text style={[
              styles.phaseButtonText,
              selectedPhase === phase.key && styles.phaseButtonTextActive
            ]}>
              {phase.name}
            </Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  );
}
```

### Steg 3: Uppdatera HomeScreen

**Lägg till phase-state och filter:**
```javascript
// HomeScreen.js
const [selectedPhase, setSelectedPhase] = useState('kalkylskede');

// Filtrera hierarki baserat på vald fas
const filteredHierarchy = useMemo(() => {
  if (!hierarchy || hierarchy.length === 0) return [];
  
  // Om hierarki har faser, visa bara vald fas
  const hasPhases = hierarchy.some(item => item.type === 'phase');
  
  if (hasPhases) {
    return hierarchy.filter(item => {
      if (item.type === 'phase') {
        return item.id === `phase-${selectedPhase}`;
      }
      return false;
    });
  }
  
  // Fallback för gammal struktur
  return hierarchy;
}, [hierarchy, selectedPhase]);
```

### Steg 4: Skapa ProjectPhaseNode-komponent

**Rendera fas-nivå:**
```javascript
// components/common/ProjectTree/ProjectPhaseNode.js
export default function ProjectPhaseNode({
  phase,
  isExpanded,
  onToggle,
  children,
  // ... andra props för huvudmappar/undermappar
}) {
  const phaseConfig = PROJECT_PHASES.find(p => p.id === `phase-${phase.key}`);
  
  return (
    <View style={styles.phaseContainer}>
      <TouchableOpacity
        onPress={() => onToggle(phase.id)}
        style={styles.phaseHeader}
      >
        <Ionicons name={phaseConfig.icon} size={20} color={phaseConfig.color} />
        <Text style={[styles.phaseName, { color: phaseConfig.color }]}>
          {phase.name}
        </Text>
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={18}
          color="#666"
        />
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

### Steg 5: Uppdatera ProjectTree

**Hantera phase-typ:**
```javascript
// components/common/ProjectTree/ProjectTree.js
export default function ProjectTree({ hierarchy, selectedPhase, ... }) {
  const hierarchyWithPhases = ensurePhaseStructure(hierarchy);
  
  // Filtrera till vald fas
  const filteredHierarchy = hierarchyWithPhases.filter(item => {
    if (item.type === 'phase') {
      return item.id === `phase-${selectedPhase}`;
    }
    return false;
  });
  
  return (
    <View>
      {filteredHierarchy.map(item => {
        if (item.type === 'phase') {
          return (
            <ProjectPhaseNode
              key={item.id}
              phase={item}
              isExpanded={expandedPhases[item.id] || false}
              onToggle={handleTogglePhase}
              children={item.children || []}
              // ... andra props
            />
          );
        }
        // Fallback för gammal struktur
        return <ProjectTreeFolder key={item.id} folder={item} />;
      })}
    </View>
  );
}
```

### Steg 6: Uppdatera "Skapa huvudmapp"

**Kräv fas-val:**
```javascript
// HomeScreen.js
const handleAddMainFolder = () => {
  // Visa modal för att välja fas
  setNewMainModal({ 
    visible: true, 
    phase: selectedPhase // Default till vald fas
  });
};

// När huvudmapp skapas:
const createMainFolder = (phaseKey, folderName) => {
  const phaseId = `phase-${phaseKey}`;
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

## Användarupplevelse

### Dashboard:
```
┌─────────────────────────────────────────┐
│  Dashboard                               │
├─────────────────────────────────────────┤
│  Välj fas:                               │
│  [🟦 Kalkylskede] [🟩 Produktion]       │
│  [🟧 Avslut] [🟪 Eftermarknad]          │
│                                          │
│  ┌────────────────────────────────────┐ │
│  │ 🟦 Kalkylskede                     │ │
│  │ ├── Entreprenad                    │ │
│  │ │   ├── 2026                       │ │
│  │ │   │   └── 825-10 Datacenter      │ │
│  │ │   └── 2027                       │ │
│  │ └── Byggservice                    │ │
│  └────────────────────────────────────┘ │
└─────────────────────────────────────────┘
```

### När användare byter fas:
1. Klickar på "Produktion" i dropdown
2. Trädet uppdateras och visar bara Produktion
3. Alla projekt i Produktion visas
4. Kan skapa nya mappar i Produktion

## Fördelar

1. ✅ **Mycket tydlig separation** - Varje fas är helt separat
2. ✅ **Enkelt att växla** - Bara klicka på fas i dropdown
3. ✅ **Kan skapa mappar per fas** - Varje fas har sina egna mappar
4. ✅ **Inget blandat träd** - Ser bara en fas åt gången
5. ✅ **Tydlighet** - Mycket tydligt vilken fas man jobbar i

## Implementation Checklist

- [ ] Skapa ensurePhaseStructure helper
- [ ] Skapa ProjectPhaseNode-komponent
- [ ] Skapa PhaseSelector-komponent
- [ ] Uppdatera ProjectTree för phase-typ
- [ ] Uppdatera HomeScreen med phase-state och filter
- [ ] Uppdatera "Skapa huvudmapp" för att kräva fas
- [ ] Uppdatera "Skapa undermapp" för att behålla fas
- [ ] Uppdatera "Skapa projekt" för att behålla fas
- [ ] Skapa migration-script
- [ ] Testa migration
- [ ] Uppdatera dokumentation

## Tidsuppskattning

- **Steg 1-3**: 4-6 timmar (Struktur + Komponenter)
- **Steg 4-6**: 3-4 timmar (HomeScreen uppdateringar)
- **Steg 7**: 2-3 timmar (Migration)
- **Testning**: 2-3 timmar

**Totalt: 11-16 timmar** (1.5-2 dagar)
