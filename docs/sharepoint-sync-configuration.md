# SharePoint Sync Configuration - Valbara Mappar

## 🎯 Mål
Låta användare välja vilka SharePoint-mappar som ska synkas till DigitalKontroll-projektträdet, med stöd för olika SharePoint-sites (Anbud, Entreprenad, Byggservice).

## 📊 Nuvarande Situation

### SharePoint-struktur (exempel):
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

### DigitalKontroll-projektträd:
```
MS Byggsystem
├── Kalkylskede
│   ├── Entreprenad (Huvudmapp)
│   │   ├── 2026 (Undermapp)
│   │   │   ├── Projekt A
│   │   │   └── Projekt B
│   │   └── 2027
│   └── Byggservice
├── Produktion
│   └── ...
```

## 🏗️ Lösning: Konfigurerbar Mapp-synkning

### Koncept
Användare kan konfigurera vilka SharePoint-mappar som ska synkas till vilka huvudmappar/undermappar i DigitalKontroll. Detta görs via en konfigurationsskärm.

### Firestore-struktur

#### 1. SharePoint Sync Configuration (per företag)
```javascript
// foretag/{companyId}/sharepoint_sync/config
{
  enabled: true,
  mappings: [
    {
      id: 'mapping-1',
      name: 'Entreprenad - Kalkylskede',
      sharePointSite: 'Entreprenad', // SharePoint site name
      sharePointSiteId: 'site-id-123', // SharePoint site ID
      sharePointPath: '/Kalkylskede/Entreprenad', // Mapp-sökväg i SharePoint
      targetPhase: 'kalkylskede', // Projektfas i DigitalKontroll
      targetMainFolder: 'Entreprenad', // Huvudmapp i DigitalKontroll (skapas om den inte finns)
      targetSubFolder: null, // Undermapp (valfritt, null = skapa undermappar från SharePoint)
      syncDirection: 'sharepoint-to-digitalkontroll', // eller 'bidirectional'
      syncEnabled: true,
      lastSyncAt: timestamp,
      lastSyncStatus: 'success', // 'success', 'error', 'pending'
      autoSync: true, // Automatisk synkning vid ändringar
      syncFrequency: 'realtime', // 'realtime', 'hourly', 'daily', 'manual'
    },
    {
      id: 'mapping-2',
      name: 'Byggservice - Produktion',
      sharePointSite: 'Byggservice',
      sharePointSiteId: 'site-id-456',
      sharePointPath: '/Produktion/Byggservice',
      targetPhase: 'produktion',
      targetMainFolder: 'Byggservice',
      targetSubFolder: null,
      syncDirection: 'sharepoint-to-digitalkontroll',
      syncEnabled: true,
      autoSync: true,
      syncFrequency: 'realtime',
    }
  ],
  globalSettings: {
    defaultSyncDirection: 'sharepoint-to-digitalkontroll',
    defaultSyncFrequency: 'realtime',
    conflictResolution: 'sharepoint-wins', // 'sharepoint-wins', 'digitalkontroll-wins', 'manual'
  }
}
```

#### 2. Sync Status (per mapping)
```javascript
// foretag/{companyId}/sharepoint_sync/status/{mappingId}
{
  mappingId: 'mapping-1',
  status: 'syncing', // 'idle', 'syncing', 'error', 'success'
  lastSyncAt: timestamp,
  lastSyncDuration: 1234, // ms
  itemsSynced: 45,
  itemsFailed: 0,
  error: null,
  nextSyncAt: timestamp,
}
```

#### 3. Sync Log (för debugging)
```javascript
// foretag/{companyId}/sharepoint_sync/logs/{logId}
{
  mappingId: 'mapping-1',
  timestamp: timestamp,
  type: 'sync', // 'sync', 'error', 'conflict'
  message: 'Synced 5 projects from SharePoint',
  details: {
    projectsCreated: 2,
    projectsUpdated: 3,
    projectsSkipped: 0,
  }
}
```

## 🎨 UI: Konfigurationsskärm

### Komponent: `SharePointSyncConfig.js`

**Funktioner:**
1. **Lista över mappningar**
   - Visa alla konfigurerade SharePoint-mappar
   - Status för varje mappning (synkad, fel, väntande)
   - Aktivera/inaktivera synkning per mappning

2. **Lägg till ny mappning**
   - Välj SharePoint-site (dropdown med tillgängliga sites)
   - Välj mapp-sökväg i SharePoint (träd-vy eller sökväg)
   - Välj projektfas i DigitalKontroll (Kalkylskede, Produktion, etc.)
   - Välj huvudmapp i DigitalKontroll (eller skapa ny)
   - Välj undermapp (valfritt)
   - Välj synkningsriktning och frekvens

3. **Redigera mappning**
   - Ändra inställningar för befintlig mappning
   - Testa synkning
   - Visa sync-logg

4. **Manuell synkning**
   - Knapp för att synka alla mappningar
   - Knapp för att synka en specifik mappning

### UI-struktur:
```
┌─────────────────────────────────────────┐
│ SharePoint-synkning                    │
├─────────────────────────────────────────┤
│                                         │
│ ✅ Entreprenad - Kalkylskede           │
│    Site: Entreprenad                   │
│    Mapp: /Kalkylskede/Entreprenad      │
│    → DigitalKontroll: Kalkylskede /    │
│      Entreprenad                       │
│    Status: Synkad (2 min sedan)        │
│    [Redigera] [Synka nu]               │
│                                         │
│ ✅ Byggservice - Produktion            │
│    Site: Byggservice                   │
│    Mapp: /Produktion/Byggservice       │
│    → DigitalKontroll: Produktion /    │
│      Byggservice                       │
│    Status: Synkad (5 min sedan)        │
│    [Redigera] [Synka nu]               │
│                                         │
│ ⚠️ Anbud - Kalkylskede                │
│    Status: Fel (kunde inte ansluta)    │
│    [Redigera] [Synka nu]               │
│                                         │
│ [+ Lägg till mappning]                 │
│                                         │
└─────────────────────────────────────────┘
```

## 🔧 Teknisk Implementation

### 1. SharePoint Service - Lista Sites & Mappar

```javascript
// services/sharepoint/sharePointService.js

/**
 * Hämta alla SharePoint-sites som användaren har tillgång till
 */
async function getSharePointSites(accessToken) {
  const graphClient = Client.init({
    authProvider: async () => accessToken
  });
  
  const sites = await graphClient
    .api('/sites?search=*')
    .get();
    
  return sites.value.map(site => ({
    id: site.id,
    name: site.displayName,
    webUrl: site.webUrl,
  }));
}

/**
 * Hämta mappstruktur från en SharePoint-site
 */
async function getSharePointFolders(siteId, folderPath = '/', accessToken) {
  const graphClient = Client.init({
    authProvider: async () => accessToken
  });
  
  const drive = await graphClient
    .api(`/sites/${siteId}/drive`)
    .get();
    
  const items = await graphClient
    .api(`/sites/${siteId}/drive/root:${folderPath}:/children`)
    .get();
    
  return items.value
    .filter(item => item.folder) // Bara mappar
    .map(item => ({
      id: item.id,
      name: item.name,
      path: item.parentReference.path,
      children: [], // Lazy-load vid behov
    }));
}

/**
 * Hämta projekt/mappar från SharePoint som kan synkas
 */
async function getSharePointProjects(siteId, folderPath, accessToken) {
  const graphClient = Client.init({
    authProvider: async () => accessToken
  });
  
  const items = await graphClient
    .api(`/sites/${siteId}/drive/root:${folderPath}:/children`)
    .get();
    
  return items.value.map(item => ({
    id: item.id,
    name: item.name,
    type: item.folder ? 'folder' : 'file',
    path: item.parentReference.path,
    lastModified: item.lastModifiedDateTime,
    webUrl: item.webUrl,
  }));
}
```

### 2. Sync Service - Synka Mappar till Projekt

```javascript
// services/sharepoint/sharePointSync.js

/**
 * Synka en SharePoint-mapp till DigitalKontroll-projektträd
 */
async function syncSharePointFolderToProjects(mapping, companyId) {
  const {
    sharePointSiteId,
    sharePointPath,
    targetPhase,
    targetMainFolder,
    targetSubFolder,
  } = mapping;
  
  // 1. Hämta mappar från SharePoint
  const sharePointFolders = await getSharePointFolders(
    sharePointSiteId,
    sharePointPath,
    accessToken
  );
  
  // 2. Hämta nuvarande hierarki från DigitalKontroll
  const currentHierarchy = await fetchHierarchy(companyId);
  
  // 3. Hitta eller skapa huvudmapp
  let mainFolder = currentHierarchy.find(
    item => item.type === 'main' && item.name === targetMainFolder
  );
  
  if (!mainFolder) {
    // Skapa ny huvudmapp
    mainFolder = {
      id: `main-${Date.now()}`,
      name: targetMainFolder,
      type: 'main',
      children: [],
    };
    currentHierarchy.push(mainFolder);
  }
  
  // 4. Mappa SharePoint-mappar till projekt
  for (const spFolder of sharePointFolders) {
    // Om targetSubFolder är satt, skapa undermappar
    // Annars skapa projekt direkt
    
    if (targetSubFolder) {
      // Hitta eller skapa undermapp
      let subFolder = mainFolder.children.find(
        item => item.type === 'sub' && item.name === targetSubFolder
      );
      
      if (!subFolder) {
        subFolder = {
          id: `sub-${Date.now()}`,
          name: targetSubFolder,
          type: 'sub',
          children: [],
        };
        mainFolder.children.push(subFolder);
      }
      
      // Skapa eller uppdatera projekt
      const existingProject = subFolder.children.find(
        p => p.type === 'project' && p.sharePointId === spFolder.id
      );
      
      if (existingProject) {
        // Uppdatera befintligt projekt
        existingProject.name = spFolder.name;
        existingProject.sharePointPath = spFolder.path;
        existingProject.sharePointWebUrl = spFolder.webUrl;
        existingProject.lastSyncedAt = new Date().toISOString();
      } else {
        // Skapa nytt projekt
        const newProject = {
          id: `P-${Date.now()}`,
          name: spFolder.name,
          type: 'project',
          phase: targetPhase,
          sharePointId: spFolder.id,
          sharePointPath: spFolder.path,
          sharePointWebUrl: spFolder.webUrl,
          sharePointSite: mapping.sharePointSite,
          lastSyncedAt: new Date().toISOString(),
          // ... andra projektfält
        };
        subFolder.children.push(newProject);
      }
    } else {
      // Skapa undermappar från SharePoint-mappar
      // (om SharePoint-mappen innehåller undermappar)
      // ... liknande logik
    }
  }
  
  // 5. Spara uppdaterad hierarki
  await saveHierarchy(companyId, currentHierarchy);
  
  // 6. Uppdatera sync-status
  await updateSyncStatus(companyId, mapping.id, {
    status: 'success',
    lastSyncAt: new Date(),
    itemsSynced: sharePointFolders.length,
  });
}
```

### 3. Firebase Function - Automatisk Synkning

```typescript
// functions/src/sharepoint/autoSync.ts

/**
 * Automatisk synkning baserat på konfiguration
 */
export const autoSyncSharePoint = functions.pubsub
  .schedule('every 1 hours')
  .onRun(async (context) => {
    // Hämta alla aktiva mappningar
    const companies = await admin.firestore()
      .collectionGroup('sharepoint_sync')
      .where('enabled', '==', true)
      .get();
    
    for (const companyDoc of companies.docs) {
      const config = companyDoc.data();
      const companyId = companyDoc.ref.parent.parent?.id;
      
      if (!companyId) continue;
      
      // Synka varje mappning
      for (const mapping of config.mappings || []) {
        if (!mapping.syncEnabled) continue;
        
        // Kontrollera om det är dags att synka
        const shouldSync = shouldSyncNow(mapping);
        if (!shouldSync) continue;
        
        try {
          await syncSharePointFolderToProjects(mapping, companyId);
        } catch (error) {
          console.error(`Sync failed for ${mapping.id}:`, error);
          await updateSyncStatus(companyId, mapping.id, {
            status: 'error',
            error: error.message,
          });
        }
      }
    }
  });
```

## 📁 Mappning: SharePoint → DigitalKontroll

### Exempel 1: Enkel mappning
```
SharePoint:
  Site: Entreprenad
  Mapp: /Kalkylskede/Entreprenad/2026
    ├── Projekt A
    └── Projekt B

DigitalKontroll:
  Kalkylskede
    └── Entreprenad (Huvudmapp)
        └── 2026 (Undermapp)
            ├── Projekt A (projekt)
            └── Projekt B (projekt)
```

### Exempel 2: Flera undermappar
```
SharePoint:
  Site: Byggservice
  Mapp: /Produktion/Byggservice
    ├── 2026
    │   ├── Projekt X
    │   └── Projekt Y
    └── 2027
        └── Projekt Z

DigitalKontroll:
  Produktion
    └── Byggservice (Huvudmapp)
        ├── 2026 (Undermapp)
        │   ├── Projekt X
        │   └── Projekt Y
        └── 2027 (Undermapp)
            └── Projekt Z
```

## 🎯 Användarflöde

### 1. Konfigurera synkning (Admin)
1. Gå till Inställningar → SharePoint-synkning
2. Klicka på "+ Lägg till mappning"
3. Välj SharePoint-site (t.ex. "Entreprenad")
4. Bläddra eller ange mapp-sökväg (t.ex. "/Kalkylskede/Entreprenad")
5. Välj projektfas i DigitalKontroll (t.ex. "Kalkylskede")
6. Välj eller skapa huvudmapp (t.ex. "Entreprenad")
7. Välj synkningsfrekvens (Realtid, Varje timme, Manuell)
8. Spara

### 2. Automatisk synkning
- Systemet synkar automatiskt enligt konfiguration
- Nya mappar i SharePoint → Nya projekt i DigitalKontroll
- Borttagna mappar i SharePoint → (valfritt) Markera projekt som "borttaget" i DigitalKontroll

### 3. Manuell synkning
- Klicka på "Synka nu" för en specifik mappning
- Eller "Synka alla" för att synka alla aktiva mappningar

## 🔐 Säkerhet & Behörigheter

### Azure AD-behörigheter
- Användare måste ha behörighet att läsa SharePoint-mappar
- Admin-användare kan konfigurera synkning
- Vanliga användare kan se synkade projekt men inte ändra konfiguration

### Firestore Rules
```javascript
// SharePoint sync config
match /foretag/{company}/sharepoint_sync/config {
  allow read: if isCompanyMember(company);
  allow write: if isCompanyMember(company) && 
    (request.auth.token.admin == true || request.auth.token.role == 'admin');
}

// Sync status
match /foretag/{company}/sharepoint_sync/status/{mappingId} {
  allow read: if isCompanyMember(company);
  allow write: if isCompanyMember(company) && 
    (request.auth.token.admin == true || request.auth.token.role == 'admin');
}
```

## 📝 Sammanfattning

**✅ Fördelar:**
- Flexibel: Välj exakt vilka mappar som ska synkas
- Stöd för flera SharePoint-sites
- Tydlig mappning: SharePoint → DigitalKontroll
- Konfigurerbar: Användare bestämmer synkningsfrekvens
- Skalbar: Lätt att lägga till nya mappningar

**🎯 Nästa steg:**
1. Skapa konfigurationsskärm (`SharePointSyncConfig.js`)
2. Implementera SharePoint Service för att lista sites/mappar
3. Implementera Sync Service för att synka mappar till projekt
4. Skapa Firebase Functions för automatisk synkning
5. Testa med riktiga SharePoint-sites
