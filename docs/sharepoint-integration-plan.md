# SharePoint Integration Plan - DigitalKontroll

## 🎯 Mål
Synka DigitalKontroll med SharePoint så att:
- Alla dokument/filer synkas till SharePoint
- Projektstruktur skapas i SharePoint
- Användare kan arbeta i både DigitalKontroll och SharePoint
- Automatisk synkning vid ändringar

## 📊 Nuvarande Situation

### Firebase (Primär Backend)
- **Firestore**: Projekt, kontroller, användare, hierarki
- **Storage**: Bilder, dokument, filer
- **Functions**: Backend-logik
- **Auth**: Användarautentisering

### SharePoint-struktur
Företaget har olika SharePoint-sites för olika delar:
- **Anbud** (site för anbudsprojekt)
- **Entreprenad** (site för entreprenadprojekt)
- **Byggservice** (site för byggserviceprojekt)

### Vad ska synkas?

#### 1. **Projektstruktur från SharePoint** (Prioritet 1) 🔴
- **Valbara mappar**: Användare kan välja vilka SharePoint-mappar som ska synkas
- **Mappning till projektträd**: SharePoint-mappar → DigitalKontroll-projekt
- **Flera sites**: Stöd för att synka från olika SharePoint-sites
- **Konfigurerbar**: Admin kan konfigurera vilka mappar som synkas till vilka huvudmappar/undermappar

#### 2. **Dokument & Filer** (Prioritet 2) 🟡
- Kontroller (KMA-dokument)
- Projektfiler
- Ritningar
- Mötesprotokoll
- Bilder från kameran

#### 3. **Metadata** (Prioritet 3) 🟢
- Projektinfo
- Kontroller-metadata
- Användarinfo (valfritt)

## 🏗️ Arkitektur: Hybridlösning

```
┌─────────────────────────────────────┐
│   React Native App (Expo)          │
│   DigitalKontroll                   │
└──────────────┬──────────────────────┘
               │
       ┌───────┴────────┐
       │                │
┌──────▼──────┐  ┌──────▼──────────┐
│  Firebase   │  │  SharePoint     │
│  (Primär)   │  │  (Synkning)    │
│             │  │                 │
│ - Firestore │  │ - Dokument      │
│ - Storage   │  │ - Projektmappar │
│ - Auth      │  │ - Metadata     │
│ - Functions │  │                 │
└──────┬──────┘  └─────────────────┘
       │                ▲
       │                │
       └────────────────┘
    Sync via Azure Functions
```

## ⚠️ VIKTIGT: Prioritering

### **Rekommendation: Fixa strukturen FÖRST, sedan SharePoint**

**Varför?**
1. ✅ **Undviker omarbetning**: Om vi synkar innan strukturen är klar, måste vi ändra synkningen senare
2. ✅ **Tydlig mappning**: När strukturen är klar vet vi exakt hur Firebase → SharePoint ska mappas
3. ✅ **Testbarhet**: Lättare att testa synkning när strukturen är på plats
4. ✅ **Mindre risk**: Färre ändringar = färre buggar

**Vad behöver fixas först?**
1. **Dokumenthantering i DigitalKontroll** (1-2 veckor)
   - Skapa `features/documents/` struktur
   - Dokumentlista per projekt
   - Dokumentuppladdning
   - Dokumentmetadata
   - Dokumenttyper (KMA, Ritningar, Möten, etc.)

2. **Projektfunktioner-struktur** (1 vecka)
   - Klar struktur för Handlingar, Ritningar, Möten, KMA
   - Tydlig mappning till Firebase Storage
   - Metadata-struktur

**Därefter: SharePoint-synkning** (3-4 veckor med AI)

## 🔧 Teknisk Implementation

### Steg 1: Azure App Registration & Autentisering

**Vad behövs:**
1. Azure App Registration i Azure Portal
2. Microsoft Graph API-behörigheter:
   - `Files.ReadWrite.All` (läsa/skriva filer)
   - `Sites.ReadWrite.All` (läsa/skriva SharePoint-sites)
   - `User.Read` (läsa användarinfo)

**Tidsuppskattning: 2-3 timmar**

### Steg 2: SharePoint Sync Service

**Skapa ny service:**
```
services/
└── sharepoint/
    ├── sharePointService.js      # Huvudservice
    ├── sharePointAuth.js          # OAuth-autentisering
    ├── sharePointSync.js          # Synkning-logik
    └── sharePointMapper.js        # Mappning Firebase ↔ SharePoint
```

**Funktioner:**
- OAuth-autentisering med Microsoft
- Skapa/uppdatera mappar i SharePoint
- Ladda upp filer till SharePoint
- Synka metadata
- Konflikt-hantering

**Tidsuppskattning: 1-2 veckor**

### Steg 3: Firebase Functions - Sync Triggers

**Skapa sync-funktioner:**
```
functions/
└── src/
    ├── sharepoint/
    │   ├── syncDocument.ts        # Synka dokument
    │   ├── syncProject.ts         # Synka projekt
    │   ├── syncHierarchy.ts       # Synka hierarki
    │   └── syncControl.ts         # Synka kontroller
```

**Triggers:**
- När dokument laddas upp → synka till SharePoint
- När projekt skapas/uppdateras → synka struktur
- När kontroll sparas → synka dokument

**Tidsuppskattning: 1-2 veckor**

### Steg 4: Frontend Integration

**Komponenter:**
```
features/documents/
├── components/
│   ├── SharePointSyncStatus.js    # Visa sync-status
│   ├── SharePointSyncButton.js    # Manuell sync
│   └── SharePointLink.js          # Länk till SharePoint
```

**Funktioner:**
- Visa sync-status per dokument
- Manuell sync-knapp
- Öppna i SharePoint-knapp
- Sync-inställningar

**Tidsuppskattning: 1 vecka**

## 📋 Detaljerad Implementeringsplan

### **FAS 0: Dokumenthantering-struktur** (1-2 veckor) 🔴 **START HÄR**

#### Vecka 1: Dokumenthantering i DigitalKontroll
- [ ] Skapa `features/documents/` struktur
- [ ] Dokumentlista per projekt
- [ ] Dokumentuppladdning
- [ ] Dokumentmetadata
- [ ] Dokumenttyper (KMA, Ritningar, Möten, etc.)

**Filer att skapa:**
```
features/documents/
├── components/
│   ├── DocumentList.js
│   ├── DocumentUpload.js
│   ├── DocumentViewer.js
│   └── DocumentMetadata.js
├── hooks/
│   └── useDocuments.js
└── services/
    └── documentService.js
```

#### Vecka 2: Projektfunktioner-struktur
- [ ] Klar struktur för Handlingar, Ritningar, Möten, KMA
- [ ] Tydlig mappning till Firebase Storage
- [ ] Metadata-struktur
- [ ] Testa dokumenthantering

### **FAS 1: Grundläggande SharePoint-anslutning** (1-2 veckor)

#### Vecka 1: Setup & Autentisering
- [ ] Skapa Azure App Registration
- [ ] Konfigurera OAuth-flöde
- [ ] Implementera Microsoft Graph API-klient
- [ ] Testa anslutning till SharePoint

**Filer att skapa:**
```
services/sharepoint/sharePointAuth.js
services/sharepoint/sharePointService.js
```

#### Vecka 2: Grundläggande Sync
- [ ] Skapa mappstruktur i SharePoint
- [ ] Ladda upp testfiler
- [ ] Synka projektstruktur
- [ ] Testa tvåvägs-synkning

**Filer att skapa:**
```
services/sharepoint/sharePointSync.js
services/sharepoint/sharePointMapper.js
```

### **FAS 2: Dokument-synkning** (2-3 veckor)

#### Vecka 3-4: Automatisk dokument-synkning
- [ ] Firebase Function: Synka när dokument laddas upp
- [ ] Mappa Firebase Storage → SharePoint
- [ ] Hantera versionering
- [ ] Konflikt-hantering

**Filer att skapa:**
```
functions/src/sharepoint/syncDocument.ts
```

#### Vecka 5: Frontend-integration
- [ ] Visa sync-status i UI
- [ ] Manuell sync-knapp
- [ ] Öppna i SharePoint
- [ ] Sync-inställningar

**Filer att skapa:**
```
features/documents/components/SharePointSyncStatus.js
features/documents/components/SharePointSyncButton.js
```

### **FAS 3: Projektstruktur-synkning** (2 veckor)

#### Vecka 6-7: Hierarki-synkning
- [ ] Skapa projektmappar i SharePoint
- [ ] Synka huvudmappar → Undermappar → Projekt
- [ ] Synka projektfaser
- [ ] Uppdatera vid ändringar

**Filer att skapa:**
```
functions/src/sharepoint/syncHierarchy.ts
functions/src/sharepoint/syncProject.ts
```

### **FAS 4: Kontroller & KMA-synkning** (1-2 veckor)

#### Vecka 8-9: Kontroll-synkning
- [ ] Synka KMA-dokument till SharePoint
- [ ] Skapa kontrollmappar per projekt
- [ ] Synka metadata
- [ ] Hantera bilder från kameran

**Filer att skapa:**
```
functions/src/sharepoint/syncControl.ts
```

### **FAS 5: Avancerad synkning** (1-2 veckor)

#### Vecka 10-11: Tvåvägs-synkning & Konflikthantering
- [ ] Läsa ändringar från SharePoint
- [ ] Konflikt-hantering
- [ ] Sync-logg
- [ ] Felhantering & retry

## ⏱️ Tidsuppskattning

### **Med AI-hjälp (som nu):**

#### **FAS 0: Dokumenthantering-struktur** (1-2 veckor)
- Skapa dokumenthantering i DigitalKontroll
- Projektfunktioner-struktur
- **Total: 1-2 veckor**

#### **FAS 1-2: Grundläggande SharePoint-synkning** (3-4 veckor)
- OAuth-autentisering
- **Konfigurerbar mapp-synkning**: Välja vilka SharePoint-mappar som ska synkas
- **Mappning till projektträd**: SharePoint-mappar → DigitalKontroll-projekt
- **Stöd för flera sites**: Anbud, Entreprenad, Byggservice
- Konfigurationsskärm för att välja mappar
- Projektstruktur-synkning (SharePoint → DigitalKontroll)
- Grundläggande UI
- **Total: 3-4 veckor**

#### **FAS 3-5: Fullständig synkning** (3-4 veckor)
- Tvåvägs-synkning
- Konflikt-hantering
- Avancerad felhantering
- Sync-logg & monitoring
- **Total: 3-4 veckor**

### **Sammanfattning:**
- **FAS 0 (Struktur):** 1-2 veckor
- **FAS 1-2 (Grundläggande sync):** 3-4 veckor
- **FAS 3-5 (Fullständig sync):** 3-4 veckor
- **TOTALT: 7-10 veckor** (med AI-hjälp)

### **Utan AI-hjälp:**
- **FAS 0:** 2-3 veckor
- **FAS 1-2:** 4-6 veckor
- **FAS 3-5:** 4-6 veckor
- **TOTALT: 10-15 veckor**

## 🛠️ Teknisk Stack

### **Microsoft Graph API**
```javascript
// Exempel: Ladda upp fil till SharePoint
const uploadFileToSharePoint = async (file, siteId, folderPath) => {
  const graphClient = Client.init({
    authProvider: authProvider
  });
  
  const uploadSession = await graphClient
    .api(`/sites/${siteId}/drive/root:/${folderPath}/${file.name}:/createUploadSession`)
    .post({});
    
  // Upload file...
};
```

### **Azure Functions (Node.js)**
```typescript
// functions/src/sharepoint/syncDocument.ts
export const syncDocumentToSharePoint = functions
  .firestore
  .document('foretag/{companyId}/documents/{docId}')
  .onWrite(async (change, context) => {
    // Sync to SharePoint...
  });
```

### **Frontend Service**
```javascript
// services/sharepoint/sharePointService.js
export class SharePointService {
  async syncDocument(documentId, companyId) {
    // Call Firebase Function to sync
  }
  
  async getSyncStatus(documentId) {
    // Check sync status
  }
}
```

## 📁 SharePoint-struktur

### **Nuvarande SharePoint-sites:**
```
SharePoint Site: Anbud
├── Kalkylskede/
│   ├── Entreprenad/
│   │   ├── 2026/
│   │   │   ├── Projekt A/
│   │   │   └── Projekt B/
│   │   └── 2027/
│   └── Byggservice/
│       └── ...

SharePoint Site: Entreprenad
├── Produktion/
│   ├── Entreprenad/
│   │   ├── 2026/
│   │   └── ...
│   └── Byggservice/
│       └── ...

SharePoint Site: Byggservice
├── Produktion/
│   └── ...
└── Eftermarknad/
    └── ...
```

### **Konfigurerbar mappning:**
Användare kan konfigurera vilka SharePoint-mappar som ska synkas till DigitalKontroll-projektträdet. Se `sharepoint-sync-configuration.md` för detaljerad information om konfiguration.

## 🔐 Säkerhet & Behörigheter

### **Azure AD Integration**
- Användare loggar in med Microsoft-konto
- Behörigheter baseras på Azure AD-grupper
- SharePoint-behörigheter synkas automatiskt

### **Firebase → SharePoint Mapping**
- Firebase-användare mappas till Azure AD-användare
- Behörigheter i Firebase → Behörigheter i SharePoint

## 🚀 Nästa Steg

### **Rekommendation: Starta med FAS 0 (Dokumenthantering)**

1. **Vecka 1-2: Dokumenthantering-struktur**
   - Skapa `features/documents/` struktur
   - Implementera dokumentlista, uppladdning, metadata
   - Testa med riktiga projekt

2. **Därefter: FAS 1 (SharePoint-setup)**
   - Skapa Azure App Registration
   - Konfigurera OAuth
   - Testa anslutning

3. **Sedan: FAS 2 (Sync)**
   - Implementera dokument-synkning
   - Testa med riktiga filer

**Total tid: 4-6 veckor för grundläggande funktionalitet (inkl. struktur)**

## ❓ Frågor att besvara

1. **Vilken SharePoint Site ska användas?**
   - Har ni redan en site?
   - Ska vi skapa en ny?

2. **Vilka dokument ska synkas?**
   - Alla dokument?
   - Bara vissa typer?
   - Bara vissa projekt?

3. **Synkning-frekvens?**
   - Realtid?
   - Schemalagd (t.ex. varje timme)?
   - Manuell?

4. **Behörigheter?**
   - Ska alla användare ha samma behörigheter?
   - Ska projektägare ha mer behörighet?

---

## 📝 Sammanfattning

**✅ Genomförbart:** JA - Microsoft Graph API gör det möjligt

**⏱️ Tidsuppskattning (med AI-hjälp):**
- **FAS 0 (Struktur):** 1-2 veckor
- **FAS 1-2 (Grundläggande sync):** 3-4 veckor
- **FAS 3-5 (Fullständig sync):** 3-4 veckor
- **TOTALT: 7-10 veckor**

**🎯 Rekommendation:** 
1. **Först:** Fixa dokumenthanteringsstrukturen i DigitalKontroll (1-2 veckor)
2. **Sedan:** Implementera SharePoint-synkning med konfigurerbar mapp-synkning (3-4 veckor för grundläggande)
   - Konfigurationsskärm för att välja SharePoint-mappar
   - Mappning SharePoint-mappar → DigitalKontroll-projekt
   - Stöd för flera SharePoint-sites (Anbud, Entreprenad, Byggservice)
3. **Därefter:** Utöka med avancerad synkning (3-4 veckor)

**📄 Se även:** `sharepoint-sync-configuration.md` för detaljerad information om konfigurerbar mapp-synkning.

**💡 Fördelar:**
- Behåller Firebase som primär backend (snabb, skalbar)
- Synkar viktiga dokument till SharePoint (compliance, samarbete)
- Användare kan arbeta i båda systemen
- Automatisk synkning = mindre manuellt arbete
- Tydlig struktur = lättare att underhålla
