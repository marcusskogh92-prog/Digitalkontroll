import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { Camera, CameraView } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
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
  const [pictureSize, setPictureSize] = useState(null);
  const cameraViewRef = useRef(null);
  // Ingen separat aspect state behövs, vi styr via orientation

  useEffect(() => {
    const handleOrientation = () => {
      const { width, height } = Dimensions.get('window');
      setOrientation(width > height ? 'landscape' : 'portrait');
    };
    const subscription = Dimensions.addEventListener('change', handleOrientation);
    handleOrientation();
    return () => {
      if (subscription && typeof subscription.remove === 'function') {
        subscription.remove();
      } else if (typeof subscription === 'function') {
        // For older RN versions
        subscription();
      }
    };
  }, []);

  // Hämta tillgängliga 4:3-storlekar och välj en (t.ex. största)
  useEffect(() => {
    (async () => {
      if (cameraViewRef.current) {
        try {
          const sizes = await cameraViewRef.current.getAvailablePictureSizesAsync('4:3');
          if (sizes && sizes.length > 0) {
            // Välj största 4:3-storlek
            const sorted = sizes.sort((a, b) => {
              const [aw, ah] = a.split('x').map(Number);
              const [bw, bh] = b.split('x').map(Number);
              return bw * bh - aw * ah;
            });
            setPictureSize(sorted[0]);
          }
        } catch (e) {
          // fallback: ingen pictureSize
        }
      }
    })();
  }, [cameraViewRef.current]);

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
      // Använd pictureSize om satt
      const options = { quality: 0.8 };
      if (pictureSize) options.pictureSize = pictureSize;
      const photo = await cameraRef.takePictureAsync(options);

      let finalPhoto = photo;
      // Cropping logic for portrait mode to ensure 4:3
      if (orientation === 'portrait' && photo && photo.width && photo.height) {
        // Only crop if not already 4:3
        const targetRatio = 4 / 3;
        const actualRatio = photo.height / photo.width;
        if (Math.abs(actualRatio - targetRatio) > 0.01) {
          // Crop to 4:3 (height = width * 4/3)
          const cropWidth = photo.width;
          const cropHeight = Math.round(photo.width * 4 / 3);
          if (cropHeight <= photo.height) {
            const cropOriginY = Math.round((photo.height - cropHeight) / 2);
            const manipResult = await ImageManipulator.manipulateAsync(
              photo.uri,
              [{ crop: { originX: 0, originY: cropOriginY, width: cropWidth, height: cropHeight } }],
              { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
            );
            finalPhoto = { ...manipResult, _orientation: orientation };
          } else {
            // fallback: don't crop if image is too small
            finalPhoto = { ...photo, _orientation: orientation };
          }
        } else {
          finalPhoto = { ...photo, _orientation: orientation };
        }
      } else {
        finalPhoto = { ...photo, _orientation: orientation };
      }

      setPhotoPreview(finalPhoto);
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
    // Visa preview med rätt aspect ratio
    const isPortrait = photoPreview._orientation === 'portrait';
    const aspectRatio = isPortrait ? 4 / 3 : 3 / 4;
    return (
      <View style={{ flex: 1, backgroundColor: '#000', justifyContent: 'center', alignItems: 'center' }}>
        <Image
          source={{ uri: photoPreview.uri }}
          style={{
            width: isPortrait ? '92%' : undefined,
            height: isPortrait ? undefined : '68%',
            aspectRatio,
            borderRadius: 16,
            marginTop: 24,
            marginBottom: 12,
            maxWidth: 420,
            maxHeight: 420,
            resizeMode: 'contain',
            backgroundColor: '#111',
          }}
        />
        <View style={styles.previewButtonBar}>
          <TouchableOpacity
            style={[styles.previewButton, styles.previewButtonRetake]}
            onPress={() => setPhotoPreview(null)}
            activeOpacity={0.8}
          >
            <MaterialIcons name="refresh" size={32} color={PRIMARY} style={{ marginBottom: 2 }} />
            <Text style={styles.previewButtonTextRetake}>Ta om</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.previewButton, styles.previewButtonSave]}
            onPress={() => {
              // Always pass savedChecklist back and use replace to avoid stacking
              navigation.replace('SkyddsrondScreen', {
                cameraResult: {
                  uri: photoPreview.uri,
                  sectionIdx,
                  pointIdx
                },
                project,
                savedChecklist: route.params?.savedChecklist
              });
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check-circle" size={32} color="#fff" style={{ marginBottom: 2 }} />
            <Text style={styles.previewButtonTextSave}>Spara</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <CameraView
        style={{ flex: 1 }}
        ref={ref => {
          setCameraRef(ref);
          cameraViewRef.current = ref;
        }}
        ratio={orientation === 'portrait' ? '4:3' : '3:4'}
        pictureSize={pictureSize}
      />
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
  previewButtonBar: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 24,
    marginBottom: 8,
    gap: 32,
  },
  previewButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 32,
    minWidth: 110,
    paddingVertical: 16,
    paddingHorizontal: 18,
    marginHorizontal: 8,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 6,
  },
  previewButtonRetake: {
    backgroundColor: '#fff',
    borderWidth: 2,
    borderColor: PRIMARY,
  },
  previewButtonSave: {
    backgroundColor: PRIMARY,
    borderWidth: 2,
    borderColor: '#fff',
  },
  previewButtonTextRetake: {
    color: PRIMARY,
    fontWeight: 'bold',
    fontSize: 18,
    marginTop: 2,
    letterSpacing: 0.5,
  },
  previewButtonTextSave: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 18,
    marginTop: 2,
    letterSpacing: 0.5,
  },
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