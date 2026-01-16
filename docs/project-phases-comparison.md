# Projektfaser - Jämförelse av Lösningar

## Användarens Krav

1. ✅ Olika projektfaser (Kalkylskede, Produktion, Avslut, Eftermarknad)
2. ✅ I varje fas ska man kunna skapa huvudmappar och undermappar
3. ✅ Företag är uppdelade i olika områden (Entreprenad, Byggservice, Ramavtal)
4. ✅ Projekt ska ligga i undermappar

## Lösningsalternativ

### **Alternativ A: Fas → Huvudmapp → Undermapp → Projekt** ⚠️

**Struktur:**
```
Kalkylskede
├── Entreprenad
│   ├── 2026
│   │   └── Projekt
│   └── 2027
├── Byggservice
└── Ramavtal

Produktion
├── Entreprenad
│   ├── 2026
│   └── 2027
└── Byggservice
```

**Fördelar:**
- ✅ Tydlig separation per fas
- ✅ Lätt att se "vad finns i Kalkylskede"
- ✅ Kan ha olika mappstruktur per fas

**Nackdelar:**
- ❌ **Duplicering** - "Entreprenad" finns i flera faser
- ❌ **Svårt att flytta projekt** - Måste flytta mellan faser
- ❌ **Sökning** - Svårt att hitta projekt om man inte vet fas
- ❌ **Översikt** - Kan inte se alla "Entreprenad"-projekt på ett ställe
- ❌ **Fler nivåer** - 4 nivåer kan bli djupt

**Användningsfall:**
- ✅ Bra om projekt **aldrig** flyttas mellan faser
- ✅ Bra om varje fas har helt olika mappstruktur
- ❌ Dåligt om projekt flyttas mellan faser ofta

---

### **Alternativ B: Huvudmapp → Undermapp → Projekt (med phase-fält)** ⭐

**Struktur:**
```
Entreprenad
├── 2026
│   ├── 🟦 Projekt A [Kalkylskede]
│   ├── 🟩 Projekt B [Produktion]
│   └── 🟧 Projekt C [Avslut]
└── 2027
    └── 🟦 Projekt D [Kalkylskede]

Byggservice
├── 2026
│   └── 🟩 Projekt E [Produktion]
```

**Fördelar:**
- ✅ **En mapp-struktur** - Alla "Entreprenad"-projekt på ett ställe
- ✅ **Lätt att flytta projekt** - Bara ändra phase-fält
- ✅ **Sökning** - Hittar projekt oavsett fas
- ✅ **Översikt** - Ser alla projekt i en mapp
- ✅ **Filter** - Kan filtrera per fas i samma mapp
- ✅ **Färre nivåer** - 3 nivåer (enklare)

**Nackdelar:**
- ⚠️ Kan bli rörigt om många projekt i olika faser i samma mapp
- ⚠️ Måste ha visuell indikator (färg/badge) för fas

**Användningsfall:**
- ✅ **Perfekt** om projekt flyttas mellan faser
- ✅ **Perfekt** om man vill se alla projekt i en mapp
- ✅ **Perfekt** för sökning och översikt

---

### **Alternativ C: Huvudmapp → Undermapp → Fas → Projekt** ❌

**Struktur:**
```
Entreprenad
├── 2026
│   ├── Kalkylskede
│   │   └── Projekt
│   ├── Produktion
│   │   └── Projekt
│   └── Avslut
│       └── Projekt
```

**Fördelar:**
- ✅ En mapp-struktur
- ✅ Tydlig fas-separation

**Nackdelar:**
- ❌ **För många nivåer** - 4 nivåer blir djupt
- ❌ **Komplicerat** - Svårt att navigera
- ❌ **Projekt kan inte vara i flera faser** - Eller måste dupliceras

**Rekommendation:** ❌ Inte rekommenderat

---

## Rekommendation: **Alternativ B** ⭐

### Varför Alternativ B är bäst:

1. **Praktiskt arbetsflöde:**
   - Projekt startar i Kalkylskede
   - Flyttas till Produktion när det börjar
   - Flyttas till Avslut när det är klart
   - Kan flyttas till Eftermarknad för underhåll
   - **Med Alternativ A måste man flytta projekt mellan faser, vilket är komplicerat**

2. **Organisering:**
   - Företag är organiserade efter områden (Entreprenad, Byggservice)
   - Alla projekt i "Entreprenad" ska ligga tillsammans
   - **Med Alternativ A blir projekt spridda över flera faser**

3. **Sökning och översikt:**
   - Användare vill ofta se "alla Entreprenad-projekt"
   - **Med Alternativ B kan man filtrera per fas i samma vy**
   - **Med Alternativ A måste man kolla i flera faser**

4. **Flexibilitet:**
   - Kan ha olika mappstruktur per område
   - Kan enkelt ändra fas på projekt
   - **Med Alternativ B är det bara att ändra ett fält**

### Implementering av Alternativ B:

**Datastruktur:**
```javascript
// Hierarki (som nu)
[
  {
    id: 'main1',
    name: 'Entreprenad',
    type: 'main',
    children: [
      {
        id: 'sub1',
        name: '2026',
        type: 'sub',
        children: [
          {
            id: 'P-1001',
            name: 'Datacenter',
            type: 'project',
            phase: 'produktion', // ⭐ Lägg till phase-fält
            // ...
          }
        ]
      }
    ]
  }
]
```

**Visuell indikator:**
```javascript
// I projekt-trädet
<View style={styles.projectRow}>
  <View style={[styles.phaseDot, { backgroundColor: phase.color }]} />
  <Text>{project.id} — {project.name}</Text>
  <Text style={[styles.phaseBadge, { color: phase.color }]}>
    {phase.name}
  </Text>
</View>
```

**Filter i dashboard:**
```javascript
// Visa alla projekt, eller filtrera per fas
const filteredProjects = projects.filter(p => {
  if (phaseFilter === 'all') return true;
  return p.phase === phaseFilter;
});
```

**Skapa projekt:**
```javascript
// När projekt skapas, välj fas
const newProject = {
  id: projectNumber,
  name: projectName,
  type: 'project',
  phase: selectedPhase, // Välj fas
  // ...
};
```

**Flytta projekt mellan faser:**
```javascript
// Enkelt - bara uppdatera phase-fältet
await updateProject(projectId, {
  phase: 'produktion',
  phaseHistory: [
    ...project.phaseHistory,
    { phase: 'produktion', changedAt: new Date(), changedBy: userId }
  ]
});
```

---

## Jämförelsetabell

| Kriterium | Alternativ A (Fas → Mappar) | Alternativ B (Mappar + Phase) ⭐ |
|-----------|----------------------------|----------------------------------|
| **Tydlighet** | ✅ Mycket tydlig | ✅ Tydlig med visuell indikator |
| **Flytta projekt** | ❌ Komplicerat | ✅ Enkelt (bara ändra fält) |
| **Sökning** | ❌ Svårt | ✅ Enkelt |
| **Översikt** | ❌ Spridd över faser | ✅ Alla projekt på ett ställe |
| **Duplicering** | ❌ Mappar dupliceras | ✅ Ingen duplicering |
| **Nivåer** | ❌ 4 nivåer (djupt) | ✅ 3 nivåer (enklare) |
| **Flexibilitet** | ⚠️ Begränsad | ✅ Mycket flexibel |
| **Implementering** | ⚠️ Komplicerad | ✅ Enkel |

---

## Slutsats

**Alternativ B (Huvudmapp → Undermapp → Projekt med phase-fält) är bäst** eftersom:

1. ✅ **Matchar arbetsflödet** - Projekt flyttas mellan faser
2. ✅ **Enklare struktur** - Färre nivåer
3. ✅ **Bättre översikt** - Alla projekt i en mapp
4. ✅ **Enklare att implementera** - Bara lägga till phase-fält
5. ✅ **Mer flexibel** - Lätt att ändra fas

**Alternativ A passar bara om:**
- Projekt **aldrig** flyttas mellan faser
- Varje fas har helt olika mappstruktur
- Duplicering av mappar är okej

---

## Rekommendation

**Använd Alternativ B: Huvudmapp → Undermapp → Projekt (med phase-fält)**

**Implementation:**
1. Lägg till `phase`-fält på projekt
2. Lägg till visuell indikator (färg/badge) i trädet
3. Lägg till fas-filter i dashboard
4. Lägg till fas-väljare när projekt skapas
5. Lägg till "Flytta till fas"-funktion

**Tidsuppskattning:** 1-2 dagar
