# System Expansion Plan - DigitalKontroll → Affärssystem

## 📊 Analys av Önskad Struktur

### Nuvarande System (DigitalKontroll)
✅ **Redan implementerat:**
- Projekt-hierarki (Huvudmappar → Undermappar → Projekt)
- Projektfunktioner: Handlingar, Ritningar, Möten, Förfrågningsunderlag, KMA
- Multi-tenant (företag-scoping)
- Användarhantering med roller
- Kontrolltyper (Arbetsberedning, Egenkontroll, Fuktmätning, etc.)
- Firebase backend (Firestore, Storage, Functions)
- Offline-stöd
- Web + Native support

### Önskad Struktur (från OneNote)

#### **1. Projektinfo** 🔴 (Prioriterad - röd understrykning)
- Organisation
- Hämta från Next (inköpssystem)
- Hämta från organisation i Next och klara inköp

#### **2. Möten** ✅ (Delvis implementerat)
- Redan finns som projektfunktion
- Behöver utökas med:
  - Mötesprotokoll
  - Deltagare
  - Agenda
  - Uppgifter från möten

#### **3. Register**
- Personal
- Projekt
- Kund
- Leverantör

#### **4. Dagbok**
- Loggfunktion för dagliga aktiviteter
- Tidsstämplar
- Kategorisering

#### **5. Ekonomi**
- Budget/prognos
- Inköp
- Resurs
- Konto/byggdel

#### **6. Leverantörsportal** 🔴 (Prioriterad - röd understrykning)
- Registrering
- Lämna anbud
- Kvittera ansvarskod
- Kvittera KMA-dokument, ordnings och skyddsregler

#### **7. Miljöbyggnad**
- Modul miljöbyggnad
- Modul Breeam 🔴 (Prioriterad - röd understrykning)

#### **8. Projektportal**
- Bjuda in externa användare
- Välja delade filer
- Sätta rättigheter

#### **9. Inköp**
- Synkning till Next alt. Annat inköpssystem
- Sammanställning inköp

#### **10. KMA** ✅ (Delvis implementerat)
- **Kvalitet:**
  - ✅ Kontrollplan (finns)
  - ✅ Egenkontrollprogram (finns)
  - ✅ Anmälan avvikelse (behöver utökas)
  - ✅ Arbetsberedning (finns)
- **Miljö:**
  - Kemikalieförteckning
  - Miljörond
- **Arbetsmiljö:**
  - ✅ Skyddsrond (finns)
  - God sed
  - Riskobservation
  - Daglig tillsyn lift
  - Anmälan tillbud
  - Anmälan olycka

#### **11. Projektfunktioner** (Bild 3)
- Välja projekt
- Skapa projekt
- Infoga från t.ex Next
- Välja typ av projekt - projektskede
- Uppdatera projekt (anbud → produktion → eftermarknad)

#### **12. Flödesschema**
- Checklista med uppgifter
- Tilldela uppgifter
- Deadlines

#### **13. Dokument**
- Synkning SharePoint
- Prioritet/klar-funktion på filer
- Obligatoriskt på filer med spårning i mappträdet
- AI-stöd för dokumentgenerering
- Skapa dokument från mallar
- Autofyll på mallar

#### **14. Ritningar**
- Synkning till 3D-modell
- Batchning
- Länkar

---

## ✅ Genomförbarhetsanalys

### **JA, det är genomförbart!** 

**Varför:**
1. ✅ Solid grund: Multi-tenant, Firebase, projekt-hierarki
2. ✅ Modulär struktur: Features-mappen redan skapad
3. ✅ Skalbar arkitektur: Lätt att lägga till nya moduler
4. ✅ Befintliga funktioner: Många delar finns redan (KMA, Möten, etc.)

### **Utmaningar:**
1. **Integration med Next** (inköpssystem)
   - Kräver API-integration eller import-funktion
   - Lösning: Skapa import/sync-modul

2. **SharePoint-synkning**
   - Kräver Microsoft Graph API
   - Lösning: Skapa sync-service med OAuth

3. **3D-modell integration**
   - Kräver specialiserad viewer
   - Lösning: Integrera t.ex. Forge Viewer eller Three.js

4. **AI-stöd**
   - Kräver API (OpenAI, Azure AI, etc.)
   - Lösning: Skapa AI-service för dokumentgenerering

---

## 📅 Tidsuppskattning

### **Fas 1: Grundläggande moduler** (4-6 veckor)
- Projektinfo med Next-integration
- Register (Personal, Projekt, Kund, Leverantör)
- Dagbok
- Utöka Möten-funktionalitet

### **Fas 2: Ekonomi & Inköp** (3-4 veckor)
- Ekonomi-modul (budget/prognos)
- Inköp med Next-synkning
- Sammanställning inköp

### **Fas 3: Leverantörsportal** (3-4 veckor)
- Registrering
- Anbudshantering
- Kvitteringar (ansvarskod, KMA-dokument)

### **Fas 4: Dokument & Ritningar** (4-5 veckor)
- SharePoint-synkning
- Dokumentmallar med autofyll
- Ritningar med 3D-integration
- Batchning

### **Fas 5: Avancerade funktioner** (4-6 veckor)
- Flödesschema med uppgifter
- Projektportal med externa användare
- Miljöbyggnad & Breeam
- AI-stöd för dokument

### **Fas 6: KMA-utökningar** (2-3 veckor)
- Kemikalieförteckning
- Miljörond
- God sed
- Riskobservation
- Tillbud/olycka-anmälningar

### **TOTALT: 20-28 veckor** (5-7 månader)

*Notera: Tidsuppskattningen är för en utvecklare. Med flera utvecklare kan tiden minskas.*

---

## 🎯 Implementeringsplan - Steg för Steg

### **Prioritering baserat på OneNote:**
1. 🔴 **Projektinfo** (röd understrykning)
2. 🔴 **Leverantörsportal** (röd understrykning)
3. 🔴 **Breeam** (röd understrykning)
4. Register
5. Ekonomi
6. Dokument & Ritningar
7. Avancerade funktioner

---

## 📋 Detaljerad Implementeringsplan

### **FAS 1: Projektinfo & Grundläggande Register** (4-6 veckor)

#### **Vecka 1-2: Projektinfo-modul**
```
features/projects/
├── components/
│   ├── ProjectInfoForm.js       # Formulär för projektinfo
│   ├── NextIntegration.js       # Next-synkning
│   └── ProjectPhases.js          # Projektskede (anbud → produktion → eftermarknad)
├── hooks/
│   ├── useProjectInfo.js
│   └── useNextSync.js
└── services/
    ├── projectInfoService.js
    └── nextIntegrationService.js
```

**Funktioner:**
- [ ] Projektinfo-formulär med alla fält
- [ ] Next-integration (API eller import)
- [ ] Projektskede-hantering
- [ ] Uppdatering från anbud → produktion → eftermarknad

#### **Vecka 3-4: Register**
```
features/registers/
├── components/
│   ├── PersonnelRegister.js
│   ├── ProjectRegister.js
│   ├── CustomerRegister.js
│   └── SupplierRegister.js
├── hooks/
│   └── useRegisters.js
└── services/
    └── registerService.js
```

**Funktioner:**
- [ ] Personalregister
- [ ] Projektregister
- [ ] Kundregister
- [ ] Leverantörsregister
- [ ] Sök och filter

#### **Vecka 5-6: Dagbok & Utöka Möten**
```
features/diary/
├── components/
│   ├── DiaryEntry.js
│   └── DiaryList.js
└── services/
    └── diaryService.js

features/meetings/
├── components/
│   ├── MeetingProtocol.js       # Utöka befintlig
│   ├── MeetingAgenda.js
│   └── MeetingTasks.js
└── services/
    └── meetingService.js
```

**Funktioner:**
- [ ] Dagbok med tidsstämplar
- [ ] Mötesprotokoll
- [ ] Agenda-hantering
- [ ] Uppgifter från möten

---

### **FAS 2: Ekonomi & Inköp** (3-4 veckor)

#### **Vecka 7-8: Ekonomi-modul**
```
features/economy/
├── components/
│   ├── BudgetView.js
│   ├── ForecastView.js
│   ├── PurchaseView.js
│   └── ResourceView.js
├── hooks/
│   └── useEconomy.js
└── services/
    └── economyService.js
```

**Funktioner:**
- [ ] Budget-hantering
- [ ] Prognos
- [ ] Inköp
- [ ] Resurs-hantering
- [ ] Konto/byggdel-koppling

#### **Vecka 9-10: Inköp med Next-synkning**
```
features/purchasing/
├── components/
│   ├── PurchaseList.js
│   ├── NextSyncStatus.js
│   └── PurchaseCompilation.js
├── hooks/
│   └── usePurchasing.js
└── services/
    ├── purchasingService.js
    └── nextSyncService.js
```

**Funktioner:**
- [ ] Next-synkning (API eller import)
- [ ] Inköpslista
- [ ] Sammanställning inköp
- [ ] Status-synkning

---

### **FAS 3: Leverantörsportal** (3-4 veckor)

#### **Vecka 11-13: Leverantörsportal**
```
features/supplier-portal/
├── components/
│   ├── SupplierRegistration.js
│   ├── TenderSubmission.js
│   ├── ResponsibilityCodeAck.js
│   └── KMAAcknowledgment.js
├── hooks/
│   └── useSupplierPortal.js
└── services/
    └── supplierPortalService.js
```

**Funktioner:**
- [ ] Leverantörsregistrering
- [ ] Anbudshantering
- [ ] Kvittera ansvarskod
- [ ] Kvittera KMA-dokument
- [ ] Kvittera ordnings och skyddsregler
- [ ] Extern inloggning för leverantörer

---

### **FAS 4: Dokument & Ritningar** (4-5 veckor)

#### **Vecka 14-16: Dokumenthantering**
```
features/documents/
├── components/
│   ├── DocumentList.js
│   ├── DocumentTemplates.js
│   ├── DocumentEditor.js
│   ├── SharePointSync.js
│   └── DocumentPriority.js
├── hooks/
│   ├── useDocuments.js
│   └── useSharePointSync.js
└── services/
    ├── documentService.js
    └── sharePointService.js
```

**Funktioner:**
- [ ] SharePoint-synkning
- [ ] Prioritet/klar-funktion
- [ ] Obligatoriska filer med spårning
- [ ] Dokumentmallar
- [ ] Autofyll på mallar
- [ ] AI-stöd (Fas 5)

#### **Vecka 17-18: Ritningar & 3D**
```
features/drawings/
├── components/
│   ├── DrawingList.js            # Utöka befintlig
│   ├── DrawingViewer.js
│   ├── Drawing3DViewer.js
│   └── DrawingBatch.js
├── hooks/
│   └── useDrawings.js
└── services/
    ├── drawingService.js
    └── drawing3DService.js
```

**Funktioner:**
- [ ] 3D-modell integration (Forge Viewer/Three.js)
- [ ] Batchning
- [ ] Länkar mellan ritningar
- [ ] Versionering

---

### **FAS 5: Avancerade Funktioner** (4-6 veckor)

#### **Vecka 19-21: Flödesschema & Projektportal**
```
features/workflow/
├── components/
│   ├── WorkflowBuilder.js
│   ├── TaskList.js
│   ├── TaskAssignment.js
│   └── DeadlineManager.js
└── services/
    └── workflowService.js

features/project-portal/
├── components/
│   ├── ExternalUserInvite.js
│   ├── SharedFilesSelector.js
│   └── PermissionManager.js
└── services/
    └── projectPortalService.js
```

**Funktioner:**
- [ ] Flödesschema med checklistor
- [ ] Tilldela uppgifter
- [ ] Deadlines
- [ ] Bjuda in externa användare
- [ ] Delade filer
- [ ] Rättighetshantering

#### **Vecka 22-24: Miljöbyggnad & Breeam**
```
features/environmental-building/
├── components/
│   ├── EnvironmentalModule.js
│   ├── BreeamModule.js
│   └── BreeamAssessment.js
├── hooks/
│   └── useEnvironmentalBuilding.js
└── services/
    └── environmentalBuildingService.js
```

**Funktioner:**
- [ ] Miljöbyggnad-modul
- [ ] Breeam-modul
- [ ] Breeam-bedömning
- [ ] Rapportering

#### **Vecka 25-26: AI-stöd**
```
features/ai/
├── components/
│   └── AIDocumentGenerator.js
├── hooks/
│   └── useAI.js
└── services/
    └── aiService.js
```

**Funktioner:**
- [ ] AI-stöd för dokumentgenerering
- [ ] Autofyll med AI
- [ ] Projektinfo-suggestions

---

### **FAS 6: KMA-utökningar** (2-3 veckor)

#### **Vecka 27-29: KMA-utökningar**
```
features/kma/
├── components/
│   ├── ChemicalInventory.js       # Ny
│   ├── EnvironmentalRound.js      # Ny
│   ├── GoodPractice.js           # Ny
│   ├── RiskObservation.js        # Ny
│   ├── DailyLiftInspection.js    # Ny
│   ├── IncidentReport.js         # Ny
│   └── AccidentReport.js         # Ny
└── services/
    └── kmaService.js              # Utöka befintlig
```

**Funktioner:**
- [ ] Kemikalieförteckning
- [ ] Miljörond
- [ ] God sed
- [ ] Riskobservation
- [ ] Daglig tillsyn lift
- [ ] Anmälan tillbud
- [ ] Anmälan olycka

---

## 🏗️ Teknisk Arkitektur

### **Nya Features-struktur:**
```
features/
├── projects/          # ✅ Redan skapad
├── controls/          # ✅ Redan skapad
├── drawings/          # ✅ Redan skapad (utöka)
├── meetings/          # ✅ Redan skapad (utöka)
├── kma/              # ✅ Redan skapad (utöka)
├── registers/        # 🆕 Ny
├── diary/            # 🆕 Ny
├── economy/          # 🆕 Ny
├── purchasing/       # 🆕 Ny
├── supplier-portal/  # 🆕 Ny
├── documents/        # 🆕 Ny
├── workflow/         # 🆕 Ny
├── project-portal/   # 🆕 Ny
├── environmental-building/ # 🆕 Ny
└── ai/               # 🆕 Ny
```

### **Nya Projektfunktioner:**
Uppdatera `components/common/ProjectTree/constants.js`:
```javascript
export const DEFAULT_PROJECT_FUNCTIONS = [
  { id: 'func-handlingar', name: 'Handlingar', ... },
  { id: 'func-ritningar', name: 'Ritningar', ... },
  { id: 'func-moten', name: 'Möten', ... },
  { id: 'func-forfragningsunderlag', name: 'Förfrågningsunderlag', ... },
  { id: 'func-kma', name: 'KMA', ... },
  { id: 'func-projektinfo', name: 'Projektinfo', ... },      // 🆕
  { id: 'func-ekonomi', name: 'Ekonomi', ... },              // 🆕
  { id: 'func-inkop', name: 'Inköp', ... },                  // 🆕
  { id: 'func-dokument', name: 'Dokument', ... },            // 🆕
  { id: 'func-flodesschema', name: 'Flödesschema', ... },    // 🆕
  { id: 'func-miljobyggnad', name: 'Miljöbyggnad', ... },    // 🆕
];
```

### **Firestore-struktur:**
```
companies/{companyId}/
├── projects/{projectId}/
│   ├── info/                    # Projektinfo
│   ├── economy/                 # Ekonomi
│   ├── purchases/               # Inköp
│   ├── documents/               # Dokument
│   ├── workflow/                # Flödesschema
│   └── environmental/           # Miljöbyggnad
├── registers/
│   ├── personnel/
│   ├── customers/
│   └── suppliers/
├── diary/
└── supplier-portal/
```

---

## 🚀 Nästa Steg - Rekommendation

### **Starta med FAS 1: Projektinfo** (Prioriterad)

**Varför börja här:**
1. 🔴 Markerad som prioriterad i OneNote
2. Grundläggande funktion som många andra moduler bygger på
3. Relativt enkel att implementera
4. Ger omedelbart värde

**Konkreta steg:**
1. Skapa `features/projects/components/ProjectInfoForm.js`
2. Skapa `features/projects/services/projectInfoService.js`
3. Lägg till "Projektinfo" som projektfunktion
4. Skapa screen för projektinfo
5. Implementera Next-integration (API eller import)

**Tidsuppskattning: 2 veckor**

---

## 📝 Checklista för Varje Modul

För varje ny modul:
- [ ] Skapa feature-mappstruktur
- [ ] Skapa Firestore-collections
- [ ] Skapa service-layer
- [ ] Skapa komponenter
- [ ] Skapa hooks
- [ ] Lägg till som projektfunktion (om relevant)
- [ ] Skapa screen
- [ ] Lägg till navigation
- [ ] Testa på web
- [ ] Testa på native
- [ ] Dokumentation

---

## 🎯 Sammanfattning

**✅ Genomförbart:** JA
**⏱️ Tidsuppskattning:** 20-28 veckor (5-7 månader)
**🎯 Rekommendation:** Starta med Projektinfo (Fas 1)
**📋 Metod:** Ett huvudämne åt gången (som du föreslog)

**Nästa steg:** Börja med Projektinfo-modulen!
