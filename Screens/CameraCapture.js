import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as Camera from 'expo-camera';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#263238';

export default function CameraCapture() {
  const navigation = useNavigation();
  const route = useRoute();
  const { measurementIndex } = route.params || {};
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  useEffect(() => {
    (async () => {
      const { status } = await Camera.requestCameraPermissionsAsync();
      setHasPermission(status === 'granted');
    })();
  }, []);

  const handleCapture = async () => {
    try {
      if (!cameraRef || isCapturing) return;
      setIsCapturing(true);
      const photo = await cameraRef.takePictureAsync({ quality: 0.8 });
      navigation.navigate('ControlDetails', { cameraResult: { uri: photo.uri, index: measurementIndex } });
    } catch (e) {
      Alert.alert('Fel vid fotografering', String(e?.message || e));
    } finally {
      setIsCapturing(false);
    }
  };

  if (hasPermission === null) {
    return <View style={styles.container}><Text style={{ color: '#666' }}>Begär behörighet...</Text></View>;
  }
  if (hasPermission === false) {
    return (
      <View style={styles.container}>
        <Text style={{ color: '#666', marginBottom: 12 }}>Kamerabehörighet nekad.</Text>
        <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.goBack()}>
          <MaterialIcons name="arrow-back" size={18} color={PRIMARY} />
          <Text style={styles.secondaryActionText}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <Camera.Camera style={{ flex: 1 }} ref={setCameraRef} />
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