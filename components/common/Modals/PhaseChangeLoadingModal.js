import { ActivityIndicator, Modal, Text, View } from 'react-native';

export default function PhaseChangeLoadingModal({ visible, loadingPhase }) {
  const phaseNames = {
    kalkylskede: 'Kalkylskede',
    produktion: 'Produktion',
    avslut: 'Avslut',
    eftermarknad: 'Eftermarknad',
  };

  const phaseName = phaseNames[loadingPhase] || 'Laddar...';

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
          <ActivityIndicator size="large" color="#1976D2" />
          <Text
            style={{
              fontSize: 18,
              fontWeight: '600',
              color: '#263238',
              marginTop: 16,
              textAlign: 'center',
            }}
          >
            {`Laddar ${phaseName.toLowerCase()}`}
          </Text>
          <Text
            style={{
              fontSize: 14,
              color: '#546E7A',
              marginTop: 4,
              textAlign: 'center',
            }}
          >
            Sparar data och laddar innehåll...
          </Text>
        </View>
      </View>
    </Modal>
  );
}
