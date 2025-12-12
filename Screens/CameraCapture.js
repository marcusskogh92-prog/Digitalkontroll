import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Alert, Dimensions, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#263238';

export default function CameraCapture() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sectionIdx, pointIdx, project } = route.params || {};
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [orientation, setOrientation] = useState('portrait');

  useEffect(() => {
    const handleOrientation = () => {
      const { width, height } = Dimensions.get('window');
      setOrientation(width > height ? 'landscape' : 'portrait');
    };
    Dimensions.addEventListener('change', handleOrientation);
    handleOrientation();
    return () => Dimensions.removeEventListener('change', handleOrientation);
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { status, canAskAgain, granted, expires } = await Camera.requestCameraPermissionsAsync();
        console.log('[CameraCapture] Camera permission status:', status, { granted, canAskAgain, expires });
        setHasPermission(status === 'granted');
        if (status !== 'granted') {
          Alert.alert(
            'Kamerabehörighet krävs',
            'Appen har inte tillgång till kameran. Gå till inställningar och ge behörighet om du vill ta foto.',
            [
              { text: 'OK', onPress: () => {} }
            ]
          );
        }
      } catch (err) {
        console.error('[CameraCapture] Fel vid kontroll av kamerabehörighet:', err);
        Alert.alert('Fel vid kontroll av kamerabehörighet', String(err?.message || err));
        setHasPermission(false);
      }
    })();
  }, []);

  const handleCapture = async () => {
    try {
      if (!cameraRef || isCapturing) return;
      setIsCapturing(true);
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      setPhotoPreview(photo);
    } catch (e) {
      Alert.alert('Fel vid fotografering', String(e?.message || e));
    } finally {
      setIsCapturing(false);
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><Text style={{ color: '#666' }}>Begär behörighet... (se logg för detaljer)</Text></View>;
  }
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#D32F2F', marginBottom: 12, fontWeight: 'bold' }}>Kamerabehörighet nekad.</Text>
        <Text style={{ color: '#666', marginBottom: 12, textAlign: 'center' }}>
          Appen har inte tillgång till kameran. Gå till inställningar och ge behörighet, starta om appen och försök igen.
        </Text>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={18} color={PRIMARY} />
          <Text style={styles.secondaryActionText}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (photoPreview) {
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Image source={{ uri: photoPreview.uri }} style={{ width: '90%', height: '70%', borderRadius: 12 }} resizeMode="contain" />
        <View style={{ flexDirection: 'row', marginTop: 24 }}>
          <TouchableOpacity
            style={[styles.primaryAction, { marginRight: 16, backgroundColor: '#fff', borderColor: PRIMARY, borderWidth: 2 }]}
            onPress={() => setPhotoPreview(null)}
          >
            <MaterialIcons name="refresh" size={20} color={PRIMARY} />
            <Text style={[styles.primaryActionText, { color: PRIMARY }]}>Ta om</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.primaryAction}
            onPress={() => {
              navigation.navigate('SkyddsrondScreen', {
                cameraResult: {
                  uri: photoPreview.uri,
                  sectionIdx,
                  pointIdx
                },
                project
              });
            }}
          >
            <MaterialIcons name="check" size={20} color="#fff" />
            <Text style={styles.primaryActionText}>Spara</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView style={{ flex: 1 }} ref={setCameraRef} />
      {/* Avbryt-knapp i övre vänstra hörnet */}
      <TouchableOpacity style={styles.cancelButton} onPress={() => navigation.goBack()}>
        <MaterialIcons name="close" size={28} color={PRIMARY} />
      </TouchableOpacity>
      {/* Stor foto-knapp: mitten nedtill (porträtt) eller mitten till höger (landskap) */}
      {orientation === 'portrait' ? (
        <View style={styles.cameraButtonBarPortrait} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleCapture}
            disabled={isCapturing}
            activeOpacity={0.7}
          >
            <MaterialIcons name="photo-camera" size={44} color="#fff" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.cameraButtonBarLandscape} pointerEvents="box-none">
          <TouchableOpacity
            style={styles.cameraButton}
            onPress={handleCapture}
            disabled={isCapturing}
            activeOpacity={0.7}
          >
            <MaterialIcons name="photo-camera" size={44} color="#fff" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 16 },
  // ...existing code...
  cancelButton: {
    position: 'absolute',
    top: 36,
    left: 20,
    zIndex: 10,
    backgroundColor: 'rgba(255,255,255,0.85)',
    borderRadius: 24,
    padding: 6,
    elevation: 2,
  },
  cameraButtonBarPortrait: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 36,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    pointerEvents: 'box-none',
  },
  cameraButtonBarLandscape: {
    position: 'absolute',
    right: 36,
    top: '50%',
    transform: [{ translateY: 0 }],
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
    pointerEvents: 'box-none',
  },
  cameraButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: PRIMARY,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 4,
    borderColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  // ...existing code...
});