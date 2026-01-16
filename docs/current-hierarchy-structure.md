# Nuvarande Hierarki-struktur - Analys

## 📊 Nuvarande Implementation

### Firestore-struktur
```
foretag/{companyId}/hierarki/state
{
  items: [
    {
      id: 'main1',
      type: 'main',
      name: 'Entreprenad',
      expanded: false,
      children: [
        {
          id: 'sub1',
          type: 'sub',
          name: '2026',
          expanded: false,
          children: [
            {
              id: 'P-1001',
              type: 'project',
              name: 'Opus bilprovning',
              phase: 'kalkylskede', // Metadata för filtrering
              status: 'ongoing',
              // ... andra projektfält
            }
          ]
        }
      ]
    }
  ],
  updatedAt: timestamp
}
```

### Projektfält (från NewProjectModal.js)

När ett projekt skapas sparas följande fält:

```javascript
{
  id: 'P-1001',                    // Projektnummer (unik)
  type: 'project',                  // Typ: alltid 'project'
  name: 'Projektnamn',             // Projektnamn
  phase: 'kalkylskede',             // Projektfas (kalkylskede, produktion, avslut, eftermarknad)
  status: 'ongoing',                // Status (ongoing, completed)
  
  // Kundinformation
  customer: 'Kundnamn',
  clientContactName: 'Kontaktperson',
  clientContactPhone: 'Telefon',
  clientContactEmail: 'Email',
  
  // Adress
  addressStreet: 'Gatunamn',
  addressPostal: 'Postnummer',
  addressCity: 'Stad',
  propertyDesignation: 'Fastighetsbeteckning',
  
  // Ansvarig och deltagare
  responsible: {
    uid: 'user-id',
    displayName: 'Namn',
    email: 'email@example.com'
  },
  participants: [
    {
      uid: 'user-id',
      displayName: 'Namn',
      email: 'email@example.com',
      role: 'role'
    }
  ],
  
  // Skyddsrond
  skyddsrondEnabled: true/false,
  skyddsrondWeeks: 2,
  skyddsrondFirstDueDate: '2026-01-15',
  
  // Metadata
  createdAt: '2026-01-15T10:00:00.000Z',
  updatedAt: '2026-01-15T10:00:00.000Z',
}
```

## 🔍 Analys för SharePoint-synkning

### ✅ Vad som fungerar bra:
1. **Hierarki-struktur är klar**: `main` → `sub` → `project`
2. **Projekt har `phase` metadata**: Kan filtreras per fas
3. **Sparfunktioner finns**: `saveHierarchy()`, `fetchHierarchy()`
4. **Backup-system**: Automatisk backup innan ändringar

### ⚠️ Vad som behöver förbättras för SharePoint:

#### 1. **SharePoint-metadata på projekt**
Behöver lägga till fält för att identifiera projekt som kommer från SharePoint:

```javascript
{
  // ... befintliga fält ...
  
  // SharePoint-metadata (nytt)
  sharePointId: 'sharepoint-item-id',        // SharePoint item ID
  sharePointSite: 'Entreprenad',              // SharePoint site name
  sharePointSiteId: 'site-id-123',            // SharePoint site ID
  sharePointPath: '/Kalkylskede/Entreprenad/2026/Projekt A', // Full sökväg
  sharePointWebUrl: 'https://...',            // Länk till SharePoint
  sharePointSyncEnabled: true,                // Om synkning är aktiverad
  sharePointLastSyncedAt: '2026-01-15T10:00:00.000Z',
  sharePointSyncMappingId: 'mapping-1',       // ID till sync-mappning
}
```

#### 2. **SharePoint-metadata på mappar (valfritt)**
För att kunna synka mappstrukturen:

```javascript
{
  id: 'main1',
  type: 'main',
  name: 'Entreprenad',
  
  // SharePoint-metadata (valfritt)
  sharePointId: 'sharepoint-folder-id',
  sharePointPath: '/Kalkylskede/Entreprenad',
  sharePointSyncEnabled: true,
}
```

#### 3. **Migration av befintliga projekt**
Befintliga projekt behöver inte ha SharePoint-metadata, men när de synkas från SharePoint ska de få dessa fält.

## 🎯 Rekommendation

### **JA, vi kan utveckla SharePoint-synkning nu!**

**Varför:**
1. ✅ Strukturen är klar och fungerar
2. ✅ Vi kan lägga till SharePoint-metadata utan att bryta befintlig funktionalitet
3. ✅ Projekt har redan `phase` för filtrering
4. ✅ Sparfunktioner finns och fungerar

### **Vad behöver vi göra:**

#### Steg 1: Utöka projektstrukturen (1-2 timmar)
- Lägga till SharePoint-metadata-fält i projekt-objekt
- Uppdatera `NewProjectModal` för att stödja SharePoint-metadata (valfritt)
- Uppdatera projekt-uppdateringsfunktioner

#### Steg 2: Skapa SharePoint-sync service (1-2 veckor)
- Implementera `sharePointService.js` för att hämta data från SharePoint
- Implementera `sharePointSync.js` för att synka mappar till projekt
- Skapa konfigurationsskärm

#### Steg 3: Integrera med befintlig struktur (1 vecka)
- Använda befintliga `saveHierarchy()` och `fetchHierarchy()` funktioner
- Lägga till SharePoint-metadata när projekt skapas/uppdateras
- Hantera konflikter och uppdateringar

## 📝 Nästa Steg

1. **Nu**: Utöka projektstrukturen med SharePoint-metadata (1-2 timmar)
2. **Sedan**: Börja implementera SharePoint-sync service (1-2 veckor)
3. **Därefter**: Testa och integrera (1 vecka)

**Total tid: 2-3 veckor för grundläggande funktionalitet**
