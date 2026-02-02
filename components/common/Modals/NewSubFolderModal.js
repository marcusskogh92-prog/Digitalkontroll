/**
 * NewSubFolderModal - Modal for creating a new subfolder
 * Extracted from HomeScreen.js to improve code organization
 */

import { Modal, Pressable, Text, TextInput, TouchableOpacity, View } from 'react-native';

const NewSubFolderModal = ({
  visible,
  parentId,
  newSubName,
  hierarchy = [],
  onNameChange,
  onClose,
  onCreate,
}) => {
  const parent = hierarchy.find(main => main.id === parentId);
  const isDuplicate = parent ? parent.children.some(sub => sub.name.trim().toLowerCase() === newSubName.trim().toLowerCase()) : false;
  const isDisabled = newSubName.trim() === '' || isDuplicate;
  const hasError = visible && (newSubName.trim() === '' || isDuplicate);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
          onPress={onClose}
        />
        <View style={{ backgroundColor: '#fff', borderRadius: 16, padding: 24, width: 320, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
          <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12, color: '#222', textAlign: 'center' }}>Skapa ny undermapp</Text>
          <TextInput
            value={newSubName}
            onChangeText={onNameChange}
            placeholder="Namn på undermapp..."
            style={{
              borderWidth: 1,
              borderColor: hasError ? '#D32F2F' : '#e0e0e0',
              borderRadius: 8,
              padding: 10,
              fontSize: 16,
              marginBottom: 6
            }}
            autoFocus
          />
          {visible && newSubName.trim() === '' && (
            <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
              Du måste ange ett namn.
            </Text>
          )}
          {visible && newSubName.trim() !== '' && isDuplicate && (
            <Text style={{ color: '#D32F2F', fontSize: 13, marginBottom: 6, textAlign: 'center' }}>
              Namnet används redan.
            </Text>
          )}
          <TouchableOpacity
            style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 10, alignItems: 'center', marginBottom: 8, opacity: isDisabled ? 0.5 : 1 }}
            onPress={onCreate}
            disabled={isDisabled}
          >
            <Text style={{ color: '#fff', fontWeight: '500', fontSize: 16 }}>
              Skapa
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={{ backgroundColor: '#e0e0e0', borderRadius: 8, paddingVertical: 10, alignItems: 'center' }}
            onPress={onClose}
          >
            <Text style={{ color: '#222', fontWeight: '500', fontSize: 16 }}>Avbryt</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

export default NewSubFolderModal;
