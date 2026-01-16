# Omstrukturering av Kontrollscreens

## Nuvarande Situation

### Screens som ska omstruktureras:
- `ArbetsberedningScreen.js`
- `EgenkontrollScreen.js`
- `FuktmätningScreen.js`
- `RiskbedömningScreen.js`
- `SkyddsrondScreen.js`
- `MottagningskontrollScreen.js`

### Var de används:
1. **App.js** - Navigation screens (rad 15, 20-21, 27, 29-30)
2. **ProjectDetails.js** - Starta kontroller (rad 1095-1120)
3. **ControlDetails.js** - Redigera kontroller (rad 313-318)
4. **HomeScreen.js** - Inline controls på web (via `openInlineControl`)

### Vad de gör:
- Wrappers runt `BaseControlForm`
- Specifika checklistConfig och labels per kontrolltyp
- Sparar till Firestore via `saveControlToFirestore`

---

## Ny Struktur (enligt expansion plan)

### Dessa kontrolltyper hör till KMA-modulen:
- **Arbetsberedning** → KMA (Kvalitet)
- **Egenkontroll** → KMA (Kvalitet)
- **Fuktmätning** → KMA (Miljö)
- **Riskbedömning** → KMA (Arbetsmiljö)
- **Skyddsrond** → KMA (Arbetsmiljö)
- **Mottagningskontroll** → KMA (Kvalitet)

### Ny plats:
```
features/kma/
├── components/
│   ├── controls/
│   │   ├── ArbetsberedningControl.js
│   │   ├── EgenkontrollControl.js
│   │   ├── FuktmätningControl.js
│   │   ├── RiskbedömningControl.js
│   │   ├── SkyddsrondControl.js
│   │   └── MottagningskontrollControl.js
│   └── KMAOverview.js
├── screens/
│   └── KMAScreen.js              # Huvudskärm för KMA
└── services/
    └── kmaService.js
```

---

## Omstruktureringsplan

### Steg 1: Skapa ny struktur
1. Skapa `features/kma/components/controls/`
2. Flytta screens dit (omdöpa till Control-komponenter)
3. Skapa `features/kma/screens/KMAScreen.js`

### Steg 2: Uppdatera navigation
1. Ta bort screens från `App.js`
2. Lägg till `KMAScreen` i navigation
3. Uppdatera `ProjectDetails.js` att navigera till KMA med kontrolltyp
4. Uppdatera `ControlDetails.js` att navigera till KMA med kontrolltyp

### Steg 3: Uppdatera projektfunktioner
1. KMA-funktionen i projekt-trädet ska öppna `KMAScreen`
2. `KMAScreen` visar alla kontrolltyper
3. Användare väljer kontrolltyp → öppnar rätt Control-komponent

### Steg 4: Ta bort gamla screens
1. Ta bort från `Screens/`
2. Ta bort imports från `App.js`
3. Ta bort navigation routes

---

## Detaljerad Implementation

### 1. Skapa Control-komponenter

**Exempel: `features/kma/components/controls/ArbetsberedningControl.js`**
```javascript
import BaseControlForm from '../../../components/BaseControlForm';
// ... samma logik som ArbetsberedningScreen
```

### 2. Skapa KMAScreen

**`features/kma/screens/KMAScreen.js`**
```javascript
// Visar lista över alla KMA-kontrolltyper
// Användare väljer typ → öppnar rätt Control-komponent
```

### 3. Uppdatera navigation

**App.js:**
- Ta bort: `ArbetsberedningScreen`, `EgenkontrollScreen`, etc.
- Lägg till: `KMAScreen`

**ProjectDetails.js:**
- Ändra `handleStartControl` att navigera till `KMAScreen` med kontrolltyp

**ControlDetails.js:**
- Ändra redigera-knapp att navigera till `KMAScreen` med kontrolltyp

---

## Fördelar med ny struktur

1. ✅ **Tydligare organisation** - Alla KMA-kontroller på ett ställe
2. ✅ **Lättare att utöka** - Lägg till nya kontrolltyper i KMA-modulen
3. ✅ **Bättre separation** - Features är isolerade
4. ✅ **Konsistent med expansion plan** - KMA är en projektfunktion

---

## Tidsuppskattning

- **Steg 1-2**: 2-3 timmar
- **Steg 3**: 1-2 timmar
- **Steg 4**: 30 minuter
- **Testning**: 1-2 timmar

**Totalt: 4-7 timmar**

---

## Checklista

- [ ] Skapa `features/kma/components/controls/`
- [ ] Flytta och omdöpa screens till Control-komponenter
- [ ] Skapa `KMAScreen.js`
- [ ] Uppdatera `App.js` navigation
- [ ] Uppdatera `ProjectDetails.js`
- [ ] Uppdatera `ControlDetails.js`
- [ ] Uppdatera `HomeScreen.js` inline controls
- [ ] Testa att allt fungerar
- [ ] Ta bort gamla screens
- [ ] Ta bort gamla imports
