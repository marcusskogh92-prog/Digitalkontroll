import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Text, View } from 'react-native';

export default function PhaseChangeLoadingModal({ visible, loadingPhase, title, subtitle, mode = 'loading' }) {
  const phaseNames = {
    kalkylskede: 'Kalkylskede',
    produktion: 'Produktion',
    avslut: 'Avslut',
    eftermarknad: 'Eftermarknad',
  };

  const phaseName = phaseNames[loadingPhase] || 'Laddar...';
  const isSuccess = String(mode || '').toLowerCase() === 'success';
  const resolvedTitle = title || (isSuccess ? 'Ändringar sparade' : `Laddar ${String(phaseName).toLowerCase()}`);
  const resolvedSubtitle = subtitle != null ? subtitle : (isSuccess ? '' : 'Sparar data och laddar innehåll...');

  return (
    <Modal visible={!!visible} transparent animationType="fade">
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 12,
            padding: 32,
            alignItems: 'center',
            minWidth: 280,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 8,
          }}
        >
          {isSuccess ? (
            <View
              style={{
                width: 64,
                height: 64,
                borderRadius: 32,
                backgroundColor: '#10B981',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Ionicons name="checkmark" size={36} color="#fff" />
            </View>
          ) : (
            <ActivityIndicator size="large" color="#1976D2" />
          )}
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#263238',
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            {resolvedTitle}
          </Text>
          {resolvedSubtitle ? (
            <Text
              style={{
                fontSize: 14,
                color: '#546E7A',
                marginTop: 4,
                textAlign: 'center',
              }}
            >
              {resolvedSubtitle}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}
