import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#263238';

export default function CameraCapture() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sectionIdx, pointIdx, project } = route.params || {};
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);

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
      <View style={styles.bottomBar}>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.goBack()}>
          <MaterialIcons name="close" size={20} color={PRIMARY} />
          <Text style={styles.secondaryActionText}>Avbryt</Text>
        </TouchableOpacity>
        <View style={{ flex: 1 }} />
        <TouchableOpacity style={styles.primaryAction} onPress={handleCapture} disabled={isCapturing}>
          <MaterialIcons name="photo-camera" size={20} color="#fff" />
          <Text style={styles.primaryActionText}>{isCapturing ? 'Tar foto...' : 'Ta foto'}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', padding: 16 },
  bottomBar: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 12, backgroundColor: 'rgba(0,0,0,0.3)', flexDirection: 'row', alignItems: 'center' },
  primaryAction: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: PRIMARY, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 10 },
  primaryActionText: { color: '#fff', fontWeight: '700' },
  secondaryAction: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 2, borderColor: PRIMARY, backgroundColor: '#F5F8FA', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10 },
  secondaryActionText: { color: PRIMARY, fontWeight: '700' }
});