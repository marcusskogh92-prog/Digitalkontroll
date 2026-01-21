import { Ionicons } from '@expo/vector-icons';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

export default function SimpleProjectSuccessModal({ visible, project, onClose }) {
  const handleClose = () => {
    if (onClose) onClose();
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.5)',
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 18,
            padding: 32,
            alignItems: 'center',
            minWidth: 320,
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
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#10B981',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}
          >
            <Ionicons name="checkmark" size={36} color="#fff" />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: '#111',
              marginBottom: 8,
              textAlign: 'center',
            }}
          >
            Projekt skapat!
          </Text>
          {project ? (
            <Text
              style={{
                fontSize: 14,
                color: '#64748b',
                textAlign: 'center',
                marginBottom: 24,
              }}
            >
              {project.projectId} - {project.projectName}
            </Text>
          ) : null}
          <TouchableOpacity
            onPress={handleClose}
            activeOpacity={0.85}
            style={{
              backgroundColor: '#1976D2',
              borderRadius: 10,
              paddingVertical: 12,
              paddingHorizontal: 24,
              minWidth: 120,
              alignItems: 'center',
            }}
          >
            <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>OK</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
