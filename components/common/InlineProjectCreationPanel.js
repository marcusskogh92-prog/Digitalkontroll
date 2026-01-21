import { Alert, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function InlineProjectCreationPanel({
  newProjectNumber,
  setNewProjectNumber,
  newProjectName,
  setNewProjectName,
  creatingProject,
  selectedPhase,
  auth,
  creatingProjectInline,
  hierarchy,
  setHierarchy,
  resetProjectFields,
  requestProjectSwitch,
  selectedProjectPath,
  setCreatingProject,
  setCreatingProjectInline,
  setSelectedProject,
  setSelectedProjectPath,
  isProjectNumberUnique,
}) {
  const handleSave = async () => {
    const projNum = newProjectNumber.trim();
    const projName = newProjectName.trim();

    if (!projNum || !projName) {
      Alert.alert('Saknade fält', 'Projektnummer och projektnamn måste fyllas i för att spara projektet.');
      return;
    }

    if (!isProjectNumberUnique(projNum)) {
      Alert.alert('Projektnummer finns redan', 'Detta projektnummer används redan. Välj ett annat.');
      return;
    }

    setCreatingProject(true);
    try {
      const newProj = {
        id: projNum,
        name: projName,
        type: 'project',
        status: 'ongoing',
        phase: selectedPhase,
        createdAt: new Date().toISOString(),
        createdBy: auth?.currentUser?.email || '',
      };

      let updatedHierarchy;
      if (creatingProjectInline?.parentType === 'main') {
        const mainId = creatingProjectInline.parentId;
        updatedHierarchy = hierarchy.map((main) =>
          main.id === mainId
            ? {
                ...main,
                children: [
                  ...(main.children || []),
                  {
                    id: String(Math.random() * 100000).toFixed(0),
                    name: 'Ny undermapp',
                    type: 'sub',
                    phase: selectedPhase,
                    children: [newProj],
                  },
                ],
              }
            : main,
        );
      } else {
        const mainId = creatingProjectInline?.mainId;
        const subId = creatingProjectInline?.parentId;
        updatedHierarchy = hierarchy.map((main) =>
          main.id === mainId
            ? {
                ...main,
                children: (main.children || []).map((sub) =>
                  sub.id === subId
                    ? {
                        ...sub,
                        children: [...(sub.children || []), newProj],
                      }
                    : sub,
                ),
              }
            : main,
        );
      }

      setHierarchy(updatedHierarchy);

      setCreatingProjectInline(null);
      setNewProjectName('');
      setNewProjectNumber('');
      resetProjectFields();
      requestProjectSwitch(newProj, {
        path: selectedProjectPath,
        selectedAction: null,
      });
    } catch (error) {
      console.error('Error creating project:', error);
      Alert.alert('Fel', 'Kunde inte skapa projektet. Försök igen.');
    } finally {
      setCreatingProject(false);
    }
  };

  const handleCancel = () => {
    if (!newProjectNumber.trim() && !newProjectName.trim()) {
      setCreatingProjectInline(null);
      setSelectedProject(null);
      setSelectedProjectPath(null);
      setNewProjectName('');
      setNewProjectNumber('');
      resetProjectFields();
      return;
    }

    Alert.alert('Avbryt skapande?', 'Om du avbryter nu kommer projektet inte att sparas.', [
      { text: 'Fortsätt redigera', style: 'cancel' },
      {
        text: 'Avbryt',
        style: 'destructive',
        onPress: () => {
          setCreatingProjectInline(null);
          setSelectedProject(null);
          setSelectedProjectPath(null);
          setNewProjectName('');
          setNewProjectNumber('');
          resetProjectFields();
        },
      },
    ]);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 4 }}>Skapa nytt projekt</Text>
        <Text style={{ fontSize: 14, color: '#666' }}>Fyll i projektnummer och projektnamn för att spara</Text>
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 8 }}>
            Projektnummer <Text style={{ color: '#D32F2F' }}>*</Text>
          </Text>
          <TextInput
            autoFocus
            placeholder="T.ex. 2026-001"
            value={newProjectNumber}
            onChangeText={setNewProjectNumber}
            style={{
              borderWidth: 1,
              borderColor:
                !newProjectNumber.trim() && (newProjectName.trim() || newProjectNumber.trim()) ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 12,
              fontSize: 15,
              backgroundColor: '#fff',
            }}
          />
          {!newProjectNumber.trim() && (newProjectName.trim() || newProjectNumber.trim()) && (
            <Text style={{ fontSize: 12, color: '#D32F2F', marginTop: 4 }}>Projektnummer krävs</Text>
          )}
        </View>

        <View style={{ marginBottom: 20 }}>
          <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 8 }}>
            Projektnamn <Text style={{ color: '#D32F2F' }}>*</Text>
          </Text>
          <TextInput
            placeholder="T.ex. Opus Bilprovning"
            value={newProjectName}
            onChangeText={setNewProjectName}
            style={{
              borderWidth: 1,
              borderColor:
                !newProjectName.trim() && (newProjectName.trim() || newProjectNumber.trim()) ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 12,
              fontSize: 15,
              backgroundColor: '#fff',
            }}
          />
          {!newProjectName.trim() && (newProjectName.trim() || newProjectNumber.trim()) && (
            <Text style={{ fontSize: 12, color: '#D32F2F', marginTop: 4 }}>Projektnamn krävs</Text>
          )}
        </View>

        <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
          <TouchableOpacity
            onPress={handleSave}
            disabled={creatingProject || !newProjectNumber.trim() || !newProjectName.trim()}
            style={{
              flex: 1,
              backgroundColor:
                newProjectNumber.trim() && newProjectName.trim() ? '#1976D2' : '#ccc',
              borderRadius: 8,
              padding: 14,
              alignItems: 'center',
              opacity:
                creatingProject || !newProjectNumber.trim() || !newProjectName.trim() ? 0.5 : 1,
            }}
          >
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              {creatingProject ? 'Sparar...' : 'Spara projekt'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleCancel}
            style={{
              backgroundColor: '#f5f5f5',
              borderRadius: 8,
              padding: 14,
              alignItems: 'center',
              minWidth: 100,
            }}
          >
            <Text style={{ color: '#222', fontSize: 16, fontWeight: '600' }}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}
