# Implementation: Projektfunktioner i Trädet

## Översikt

Lägg till en ytterligare nivå under projekt i hierarkin för att visa olika funktioner:
- Handlingar (kontroller)
- Ritningar
- Möten
- Förfrågningsunderlag
- KMA

## Datastruktur

### Nuvarande struktur:
```javascript
{
  id: 'main1',
  name: 'Entreprenad',
  expanded: false,
  children: [
    {
      id: 'sub1',
      name: '2026',
      expanded: false,
      children: [
        {
          id: 'P-1001',
          name: 'Opus bilprovning',
          type: 'project',
          status: 'ongoing',
          // ... projektdata
        }
      ]
    }
  ]
}
```

### Ny struktur med funktioner:
```javascript
{
  id: 'P-1001',
  name: 'Opus bilprovning',
  type: 'project',
  status: 'ongoing',
  expanded: false,  // NY: för att expandera projektet
  children: [       // NY: funktioner som children
    {
      id: 'func-handlingar',
      name: 'Handlingar',
      type: 'projectFunction',
      functionType: 'handlingar',
      icon: 'document-text-outline',
      order: 1
    },
    {
      id: 'func-ritningar',
      name: 'Ritningar',
      type: 'projectFunction',
      functionType: 'ritningar',
      icon: 'map-outline',
      order: 2
    },
    {
      id: 'func-moten',
      name: 'Möten',
      type: 'projectFunction',
      functionType: 'moten',
      icon: 'people-outline',
      order: 3
    },
    {
      id: 'func-forfragningsunderlag',
      name: 'Förfrågningsunderlag',
      type: 'projectFunction',
      functionType: 'forfragningsunderlag',
      icon: 'folder-outline',
      order: 4
    },
    {
      id: 'func-kma',
      name: 'KMA',
      type: 'projectFunction',
      functionType: 'kma',
      icon: 'shield-checkmark-outline',
      order: 5
    }
  ]
}
```

## Implementation Plan

### 1. Helper-funktion för standardfunktioner

Lägg till i `HomeScreen.js`:

```javascript
// Standardfunktioner för alla projekt
const DEFAULT_PROJECT_FUNCTIONS = [
  { 
    id: 'func-handlingar', 
    name: 'Handlingar', 
    type: 'projectFunction',
    functionType: 'handlingar',
    icon: 'document-text-outline',
    order: 1
  },
  { 
    id: 'func-ritningar', 
    name: 'Ritningar', 
    type: 'projectFunction',
    functionType: 'ritningar',
    icon: 'map-outline',
    order: 2
  },
  { 
    id: 'func-moten', 
    name: 'Möten', 
    type: 'projectFunction',
    functionType: 'moten',
    icon: 'people-outline',
    order: 3
  },
  { 
    id: 'func-forfragningsunderlag', 
    name: 'Förfrågningsunderlag', 
    type: 'projectFunction',
    functionType: 'forfragningsunderlag',
    icon: 'folder-outline',
    order: 4
  },
  { 
    id: 'func-kma', 
    name: 'KMA', 
    type: 'projectFunction',
    functionType: 'kma',
    icon: 'shield-checkmark-outline',
    order: 5
  }
];

// Helper: säkerställ att projekt har funktioner
function ensureProjectFunctions(project) {
  if (!project || project.type !== 'project') return project;
  
  // Om projektet redan har children, behåll dem
  if (Array.isArray(project.children) && project.children.length > 0) {
    // Kontrollera om det redan finns funktioner
    const hasFunctions = project.children.some(c => c.type === 'projectFunction');
    if (hasFunctions) return project;
  }
  
  // Lägg till standardfunktioner
  return {
    ...project,
    expanded: project.expanded || false,
    children: [...DEFAULT_PROJECT_FUNCTIONS]
  };
}
```

### 2. Uppdatera rendering av projekt

I `HomeScreen.js` runt rad 7587, ändra projekt-renderingen:

```javascript
// FÖRE (rad 7587-7614):
.map((proj) => (
  <TouchableOpacity
    key={proj.id}
    style={{ ... }}
    onPress={() => { /* öppna projekt */ }}
  >
    <View style={{ ... }} />
    <Text>{proj.id} — {proj.name}</Text>
  </TouchableOpacity>
))

// EFTER:
.map((proj) => {
  const projectWithFunctions = ensureProjectFunctions(proj);
  const isExpanded = projectWithFunctions.expanded || false;
  
  return (
    <View key={projectWithFunctions.id} style={{ marginLeft: 14 }}>
      {/* Projektrad med expand/collapse */}
      <TouchableOpacity
        style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          paddingVertical: 6, 
          backgroundColor: '#fff', 
          borderRadius: 8, 
          marginVertical: 2, 
          paddingHorizontal: 8 
        }}
        onPress={() => {
          // Toggle expand/collapse
          setHierarchy(prev => {
            const updateProject = (nodes) => {
              return nodes.map(node => {
                if (node.type === 'project' && node.id === projectWithFunctions.id) {
                  return { ...node, expanded: !node.expanded };
                }
                if (node.children && Array.isArray(node.children)) {
                  return { ...node, children: updateProject(node.children) };
                }
                return node;
              });
            };
            return updateProject(prev);
          });
        }}
      >
        <Ionicons 
          name={isExpanded ? 'chevron-down' : 'chevron-forward'} 
          size={16} 
          color="#666" 
          style={{ marginRight: 6 }} 
        />
        <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: projectWithFunctions.status === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
        <Text style={{ fontSize: 15, color: '#1976D2', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
          {projectWithFunctions.id} — {projectWithFunctions.name}
        </Text>
      </TouchableOpacity>
      
      {/* Visa funktioner när projektet är expanderat */}
      {isExpanded && Array.isArray(projectWithFunctions.children) && (
        <View style={{ marginLeft: 20, marginTop: 4 }}>
          {projectWithFunctions.children
            .filter(child => child.type === 'projectFunction')
            .sort((a, b) => (a.order || 999) - (b.order || 999))
            .map((func) => (
              <TouchableOpacity
                key={func.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 6,
                  paddingHorizontal: 8,
                  backgroundColor: '#f8f9fa',
                  borderRadius: 6,
                  marginVertical: 2,
                }}
                onPress={() => {
                  // Hantera klick på funktion
                  handleProjectFunctionClick(projectWithFunctions, func);
                }}
              >
                <Ionicons 
                  name={func.icon || 'document-outline'} 
                  size={16} 
                  color="#666" 
                  style={{ marginRight: 8 }} 
                />
                <Text style={{ fontSize: 14, color: '#444', flexShrink: 1 }}>
                  {func.name}
                </Text>
              </TouchableOpacity>
            ))}
        </View>
      )}
    </View>
  );
})
```

### 3. Hantera klick på funktioner

Lägg till funktion för att hantera klick:

```javascript
const handleProjectFunctionClick = (project, functionItem) => {
  const functionType = functionItem.functionType;
  
  switch (functionType) {
    case 'handlingar':
      // Öppna projektet med fokus på kontroller (befintlig funktionalitet)
      requestProjectSwitch(project, { 
        selectedAction: { 
          kind: 'showControls',
          functionType: 'handlingar'
        } 
      });
      break;
      
    case 'ritningar':
      // Navigera till ritningar-screen (kommer att skapas)
      navigation.navigate('ProjectDrawings', {
        project,
        companyId
      });
      break;
      
    case 'moten':
      // Navigera till möten-screen (kommer att skapas)
      navigation.navigate('ProjectMeetings', {
        project,
        companyId
      });
      break;
      
    case 'forfragningsunderlag':
      // Navigera till förfrågningsunderlag-screen
      navigation.navigate('ProjectTenderDocs', {
        project,
        companyId
      });
      break;
      
    case 'kma':
      // Navigera till KMA-screen
      navigation.navigate('ProjectKMA', {
        project,
        companyId
      });
      break;
      
    default:
      // Fallback: öppna projektet normalt
      requestProjectSwitch(project, { selectedAction: null });
  }
};
```

### 4. Migrera befintliga projekt

När hierarkin laddas, säkerställ att alla projekt har funktioner:

```javascript
// I useEffect där hierarchy laddas (runt rad 3536):
React.useEffect(() => {
  // ... befintlig kod ...
  
  if (Array.isArray(items) && items.length > 0) {
    // Migrera projekt till att ha funktioner
    const migrateProject = (node) => {
      if (node.type === 'project') {
        return ensureProjectFunctions(node);
      }
      if (node.children && Array.isArray(node.children)) {
        return {
          ...node,
          children: node.children.map(migrateProject)
        };
      }
      return node;
    };
    
    const migrated = items.map(migrateProject);
    setHierarchy(collapseHierarchy(migrated));
  }
  
  // ... resten av koden ...
}, [companyId, routeCompanyId, authClaims?.companyId]);
```

## Fördelar med denna struktur

1. **Konsekvent navigation**: Alla projekt har samma funktioner
2. **Utbyggbar**: Lägg enkelt till nya funktioner
3. **Intuitivt**: Användare ser direkt vad som finns tillgängligt
4. **Bakåtkompatibel**: Befintliga projekt får funktioner automatiskt

## Nästa steg

1. Implementera rendering av funktioner i trädet
2. Skapa screens för varje funktion (Ritningar, Möten, etc.)
3. Lägg till navigation mellan funktioner
4. Testa med befintliga projekt
