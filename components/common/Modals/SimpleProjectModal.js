import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';

export default function SimpleProjectModal({
  visible,
  newProjectNumber,
  setNewProjectNumber,
  newProjectName,
  setNewProjectName,
  canCreateSimpleProject,
  creatingProject,
  isProjectNumberUnique,
  onSubmit,
  onRequestClose,
}) {
  const handleClose = () => {
    if (onRequestClose) onRequestClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.25)',
        }}
      >
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          onPress={handleClose}
        />
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            padding: 24,
            width: Platform.OS === 'web' ? 500 : 340,
            maxWidth: '90%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 6,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 20,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111' }}>Skapa nytt projekt</Text>
            <TouchableOpacity
              style={{ padding: 4 }}
              onPress={handleClose}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={24} color="#111" />
            </TouchableOpacity>
          </View>

          <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
            Ange projektnummer och projektnamn för att skapa ett projekt i systemet.
          </Text>

          <View style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Projektnummer *</Text>
              {String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber) ? (
                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
              ) : null}
            </View>
            <TextInput
              value={newProjectNumber}
              onChangeText={v => setNewProjectNumber(typeof v === 'string' ? v : v?.target?.value ?? '')}
              placeholder="T.ex. 2026-001"
              placeholderTextColor="#94A3B8"
              style={{
                borderWidth: 1,
                borderColor:
                  String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber)
                    ? '#E2E8F0'
                    : '#EF4444',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 14,
                fontSize: 14,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web'
                  ? {
                      outline: 'none',
                    }
                  : {}),
              }}
              autoFocus
            />
            {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                <Ionicons name="warning" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>
                  Projektnummer används redan.
                </Text>
              </View>
            ) : null}
          </View>

          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Projektnamn *</Text>
              {String(newProjectName ?? '').trim() !== '' ? (
                <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
              ) : null}
            </View>
            <TextInput
              value={newProjectName}
              onChangeText={v => setNewProjectName(typeof v === 'string' ? v : v?.target?.value ?? '')}
              placeholder="T.ex. Opus Bilprovning"
              placeholderTextColor="#94A3B8"
              style={{
                borderWidth: 1,
                borderColor: String(newProjectName ?? '').trim() !== '' ? '#E2E8F0' : '#EF4444',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 14,
                fontSize: 14,
                backgroundColor: '#fff',
                color: '#111',
                ...(Platform.OS === 'web'
                  ? {
                      outline: 'none',
                    }
                  : {}),
              }}
              onSubmitEditing={() => {
                if (canCreateSimpleProject && !creatingProject && onSubmit) {
                  onSubmit();
                }
              }}
            />
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
            <TouchableOpacity
              disabled={creatingProject}
              onPress={handleClose}
              style={{
                backgroundColor: '#E5E7EB',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 20,
                minWidth: 100,
                alignItems: 'center',
                opacity: creatingProject ? 0.5 : 1,
              }}
              activeOpacity={0.8}
            >
              <Text style={{ color: '#111', fontWeight: '600', fontSize: 14 }}>Avbryt</Text>
            </TouchableOpacity>

            <View style={{ width: 10 }} />

            <TouchableOpacity
              disabled={!canCreateSimpleProject || creatingProject}
              onPress={onSubmit}
              style={{
                backgroundColor: canCreateSimpleProject && !creatingProject ? '#1976D2' : '#94A3B8',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 20,
                minWidth: 100,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                opacity: canCreateSimpleProject && !creatingProject ? 1 : 0.6,
              }}
              activeOpacity={0.85}
            >
              {creatingProject ? (
                <>
                  <View
                    style={{
                      width: 16,
                      height: 16,
                      borderWidth: 2,
                      borderColor: '#fff',
                      borderTopColor: 'transparent',
                      borderRadius: 8,
                    }}
                  />
                  <View style={{ width: 8 }} />
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Skapar...</Text>
                </>
              ) : (
                <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Skapa projekt</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
