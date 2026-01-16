# Projektfaser (Projektskede) - Arkitekturplan

## Översikt

Systemet behöver stödja olika projektfaser:
1. **Kalkylskede** (Tender/Estimate)
2. **Produktion** (Production)
3. **Avslut** (Completion)
4. **Eftermarknad** (After-sales)

## Rekommenderad Arkitektur

### **Alternativ 1: Projektskede som Metadata + Smart Dashboard** ⭐ (REKOMMENDERAD)

**Koncept:**
- Varje projekt har ett `phase`-fält i Firestore
- Dashboard visar alla projekt men kan filtrera/visa per fas
- Funktioner kan vara olika beroende på fas (men samma struktur)
- Tydlig visuell indikator på vilken fas projektet är i

**Fördelar:**
- ✅ Enkel att implementera
- ✅ Flexibel - lätt att lägga till nya faser
- ✅ Tydlig för användare
- ✅ Kan ha olika funktioner per fas om behövs
- ✅ Dashboard kan visa "Vad behöver göras i denna fas?"

**Struktur:**
```javascript
// Firestore: projects/{projectId}
{
  id: "825-10",
  name: "Datacenter TVAB",
  phase: "produktion", // "kalkylskede" | "produktion" | "avslut" | "eftermarknad"
  phaseHistory: [
    { phase: "kalkylskede", changedAt: "2024-01-01", changedBy: "user123" },
    { phase: "produktion", changedAt: "2024-02-15", changedBy: "user123" }
  ],
  // ... andra fält
}
```

**Dashboard:**
- Huvudvy: Alla projekt med fas-indikator
- Filter: Visa per fas
- Översikt per fas: "3 projekt i Kalkylskede", "5 projekt i Produktion"
- Fas-specifik vy: "Vad behöver göras i Produktion?"

---

### **Alternativ 2: Olika Dashboards per Fas**

**Koncept:**
- Separat dashboard för varje fas
- Användare växlar mellan dashboards

**Nackdelar:**
- ❌ Många dashboards att underhålla
- ❌ Svårt att se helhetsbilden
- ❌ Risk för förvirring

**Rekommendation:** ❌ Inte rekommenderat

---

### **Alternativ 3: Projektskede som Projektfunktioner**

**Koncept:**
- Varje fas är en projektfunktion i trädet
- Projekt → Kalkylskede → Funktioner
- Projekt → Produktion → Funktioner

**Nackdelar:**
- ❌ För många nivåer i trädet
- ❌ Projektet måste "finnas" i flera faser samtidigt
- ❌ Komplicerat att hantera

**Rekommendation:** ❌ Inte rekommenderat

---

## Implementeringsplan - Alternativ 1

### **Steg 1: Lägg till Phase i Projektdata**

**Firestore-struktur:**
```javascript
// companies/{companyId}/projects/{projectId}
{
  id: "825-10",
  name: "Datacenter TVAB",
  phase: "produktion", // Default: "kalkylskede"
  phaseHistory: [], // Spåra fasändringar
  // ... befintliga fält
}
```

**Konstanter:**
```javascript
// features/projects/constants.js
export const PROJECT_PHASES = [
  { key: 'kalkylskede', name: 'Kalkylskede', color: '#1976D2', icon: 'calculator-outline' },
  { key: 'produktion', name: 'Produktion', color: '#43A047', icon: 'construct-outline' },
  { key: 'avslut', name: 'Avslut', color: '#F57C00', icon: 'checkmark-circle-outline' },
  { key: 'eftermarknad', name: 'Eftermarknad', color: '#7B1FA2', icon: 'time-outline' },
];

export const DEFAULT_PHASE = 'kalkylskede';
```

### **Steg 2: Uppdatera Projektinfo-formulär**

**Lägg till phase-selector:**
```javascript
// features/projects/components/ProjectInfoForm.js
<Picker
  selectedValue={project.phase || DEFAULT_PHASE}
  onValueChange={(phase) => updateProject({ phase })}
>
  {PROJECT_PHASES.map(phase => (
    <Picker.Item key={phase.key} label={phase.name} value={phase.key} />
  ))}
</Picker>
```

### **Steg 3: Uppdatera Dashboard**

**Fas-indikatorer:**
```javascript
// components/common/Dashboard/DashboardOverview.js
<View style={styles.phaseSection}>
  <Text style={styles.sectionTitle}>Projekt per fas</Text>
  {PROJECT_PHASES.map(phase => {
    const count = projects.filter(p => p.phase === phase.key).length;
    return (
      <TouchableOpacity
        key={phase.key}
        onPress={() => filterByPhase(phase.key)}
      >
        <View style={[styles.phaseCard, { borderLeftColor: phase.color }]}>
          <Ionicons name={phase.icon} size={24} color={phase.color} />
          <Text style={styles.phaseName}>{phase.name}</Text>
          <Text style={styles.phaseCount}>{count}</Text>
        </View>
      </TouchableOpacity>
    );
  })}
</View>
```

**Fas-filter:**
```javascript
// HomeScreen.js
const [phaseFilter, setPhaseFilter] = useState('all');

const filteredProjects = projects.filter(project => {
  if (phaseFilter === 'all') return true;
  return project.phase === phaseFilter;
});
```

### **Steg 4: Visuell Indikator i Projekt-trädet**

**Uppdatera ProjectTreeNode:**
```javascript
// components/common/ProjectTree/ProjectTreeNode.js
const phase = PROJECT_PHASES.find(p => p.key === project.phase) || PROJECT_PHASES[0];

<View style={styles.projectRow}>
  <View style={[styles.phaseIndicator, { backgroundColor: phase.color }]} />
  <Text>{project.id} — {project.name}</Text>
  <Text style={[styles.phaseBadge, { color: phase.color }]}>
    {phase.name}
  </Text>
</View>
```

### **Steg 5: Fas-specifika Funktioner (Optional)**

**Om vissa funktioner bara ska finnas i vissa faser:**
```javascript
// components/common/ProjectTree/constants.js
export function getProjectFunctions(project) {
  const phase = project.phase || 'kalkylskede';
  
  const allFunctions = [...DEFAULT_PROJECT_FUNCTIONS];
  
  // Kalkylskede: Fokus på planering
  if (phase === 'kalkylskede') {
    return allFunctions.filter(f => 
      ['handlingar', 'ritningar', 'moten', 'forfragningsunderlag'].includes(f.functionType)
    );
  }
  
  // Produktion: Alla funktioner
  if (phase === 'produktion') {
    return allFunctions;
  }
  
  // Avslut: Fokus på dokumentation
  if (phase === 'avslut') {
    return allFunctions.filter(f => 
      ['handlingar', 'ritningar', 'kma'].includes(f.functionType)
    );
  }
  
  // Eftermarknad: Begränsade funktioner
  if (phase === 'eftermarknad') {
    return allFunctions.filter(f => 
      ['handlingar', 'moten'].includes(f.functionType)
    );
  }
  
  return allFunctions;
}
```

---

## Användarupplevelse (UX)

### **Dashboard-vy:**

```
┌─────────────────────────────────────────┐
│  Dashboard                               │
├─────────────────────────────────────────┤
│  Projekt per fas:                        │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │ Kalkyl   │ │ Produkt  │ │ Avslut   │ │
│  │   3      │ │   5      │ │   2      │ │
│  └──────────┘ └──────────┘ └──────────┘ │
│                                          │
│  [Filter: Alla | Kalkyl | Produkt...]   │
│                                          │
│  Projektlista:                           │
│  🟦 825-10 Datacenter TVAB [Produktion] │
│  🟦 826-11 Kontor [Kalkylskede]         │
│  🟧 824-09 Lager [Avslut]               │
└─────────────────────────────────────────┘
```

### **Projekt-träd:**

```
Projekt
├── Byggservice
│   └── 8 Tekniska Verken
│       ├── 🟦 825-10 Datacenter [Produktion]
│       │   ├── Handlingar
│       │   ├── Ritningar
│       │   ├── Möten
│       │   ├── Förfrågningsunderlag
│       │   └── KMA
│       └── 🟦 826-11 Kontor [Kalkylskede]
│           ├── Handlingar
│           ├── Ritningar
│           └── Möten
```

---

## Migration

### **Befintliga projekt:**

```javascript
// Migration script
async function migrateProjectPhases() {
  const projects = await fetchAllProjects();
  
  for (const project of projects) {
    // Bestäm fas baserat på status eller annan logik
    let phase = 'produktion'; // default
    
    if (project.status === 'completed') {
      phase = 'avslut';
    } else if (!project.createdAt || isNewProject(project)) {
      phase = 'kalkylskede';
    }
    
    await updateProject(project.id, {
      phase,
      phaseHistory: [{
        phase,
        changedAt: new Date().toISOString(),
        changedBy: 'system'
      }]
    });
  }
}
```

---

## Sammanfattning

**Rekommendation: Alternativ 1 - Projektskede som Metadata + Smart Dashboard**

**Varför:**
1. ✅ Enkel att implementera
2. ✅ Flexibel och skalbar
3. ✅ Tydlig för användare
4. ✅ Kan anpassa funktioner per fas om behövs
5. ✅ Dashboard kan visa översikt och filter

**Implementering:**
1. Lägg till `phase`-fält i projektdata
2. Uppdatera Projektinfo-formulär
3. Lägg till fas-indikatorer i dashboard
4. Lägg till fas-filter
5. Visuell indikator i projekt-trädet
6. (Optional) Fas-specifika funktioner

**Tidsuppskattning:** 1-2 dagar

---

## Nästa Steg

1. Implementera phase-fält i projektdata
2. Uppdatera Projektinfo-formulär
3. Lägg till fas-indikatorer i dashboard
4. Testa och iterera
