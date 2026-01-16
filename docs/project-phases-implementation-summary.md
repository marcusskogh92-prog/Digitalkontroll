# Projektfaser - Implementeringssammanfattning

## Lösning: Phase som Metadata på Projekt

**Behåller befintlig hierarki:** Huvudmapp → Undermapp → Projekt
**Lägger till:** `phase`-fält på varje projekt

## ✅ Implementerat

### 1. Konstanter
- ✅ `features/projects/constants.js` - PROJECT_PHASES, DEFAULT_PHASE, getProjectPhase()

### 2. Visuell Indikator i Trädet
- ✅ `ProjectTreeNode.js` - Visar färgad punkt för fas
- ✅ `HomeScreen.js` (web) - Visar färgad punkt för fas

### 3. Skapa Projekt med Fas
- ✅ `HomeScreen.js` - Fas-väljare i projektformuläret
- ✅ `HomeScreen.js` - Sätter phase när projekt skapas

## 📋 Återstående

### 1. Dashboard - Fas-indikatorer
- [ ] Visa antal projekt per fas
- [ ] Klickbar för att filtrera

### 2. Fas-filter
- [ ] Filter i HomeScreen för att visa projekt per fas
- [ ] "Visa alla" / "Visa Kalkylskede" / etc.

### 3. Flytta Projekt mellan Faser
- [ ] Funktion i ProjectDetails för att ändra fas
- [ ] Spåra fasändringar (phaseHistory)

### 4. Migration
- [ ] Migration-script för befintliga projekt
- [ ] Sätt default phase baserat på status

## Användning

### Nuvarande struktur (oförändrad):
```
Entreprenad (Huvudmapp)
├── 2026 (Undermapp)
│   ├── 🟦 825-10 Datacenter [Kalkylskede]
│   ├── 🟩 826-11 Kontor [Produktion]
│   └── 🟧 824-09 Lager [Avslut]
```

### När projekt skapas:
1. Välj fas i formuläret
2. Projektet får `phase`-fältet
3. Visas med färgad indikator i trädet

### När projekt flyttas:
1. Öppna projekt
2. Ändra fas
3. Projektet behåller sin plats i hierarkin
4. Bara `phase`-fältet ändras

## Fördelar

1. ✅ **Behåller befintlig struktur** - Inga breaking changes
2. ✅ **Enkelt att flytta projekt** - Bara ändra ett fält
3. ✅ **Tydlig visuell indikator** - Färgad punkt visar fas
4. ✅ **Flexibel** - Lätt att lägga till nya faser
5. ✅ **Sökbar** - Kan söka/filtrera per fas
