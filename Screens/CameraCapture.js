import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { useNavigation, useRoute } from '@react-navigation/native';
import * as CameraModule from 'expo-camera';
import { Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useEffect, useRef, useState } from 'react';
import { Alert, Dimensions, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

const PRIMARY = '#263238';

export default function CameraCapture() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sectionIdx, pointIdx, project } = route.params || {};
  const [hasPermission, setHasPermission] = useState(null);
  const [cameraRef, setCameraRef] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);
  const [photoPreview, setPhotoPreview] = useState(null);
  const [photoComment, setPhotoComment] = useState('');
  const [orientation, setOrientation] = useState('portrait');
  const [pictureSize, setPictureSize] = useState(null);
  const cameraViewRef = useRef(null);
  const scrollRef = useRef(null);
  // Resolve Camera component robustly across Expo versions / bundlers
  // We will pick the first entry that is actually a renderable component (function/class)
  let CameraComponent = null;
  try {
    // Prefer CameraView if available (some builds expose CameraView as the host component)
    if (CameraModule && CameraModule.CameraView) CameraComponent = CameraModule.CameraView;
    else if (typeof Camera === 'function') CameraComponent = Camera;
    else if (CameraModule) {
      if (typeof CameraModule.Camera === 'function') CameraComponent = CameraModule.Camera;
      else if (typeof CameraModule.default === 'function') CameraComponent = CameraModule.default;
      else if (CameraModule.Camera) CameraComponent = CameraModule.Camera; // fallback even if object
      else CameraComponent = null;
    }
  } catch (e) {
    CameraComponent = null;
  }
  // Log resolved shape to help debug incorrect module shapes at runtime
  try { console.log('[CameraCapture] Resolved CameraComponent type:', typeof CameraComponent, 'keys:', CameraModule && Object.keys(CameraModule || {})); } catch (e) {}
  try { if (CameraComponent && typeof CameraComponent === 'object') console.warn('[CameraCapture] CameraComponent resolved to object — attempting to use CameraView fallback if available'); } catch (e) {}
  const resolvedInfo = (() => {
    try {
      return { type: typeof CameraComponent, keys: CameraModule ? Object.keys(CameraModule || {}) : [] };
    } catch (e) {
      return { type: typeof CameraComponent, keys: [] };
    }
  })();

  // Exposed permission check so UI can retry if needed
  const checkCameraPermission = async () => {
    try {
      let perm = null;
      const tryFns = [
        'getCameraPermissionsAsync',
        'requestCameraPermissionsAsync',
        'getPermissionsAsync',
        'requestPermissionsAsync'
      ];
      for (const fn of tryFns) {
        try {
          if (CameraModule && typeof CameraModule[fn] === 'function') {
            perm = await CameraModule[fn]();
            if (perm) break;
          }
          if (CameraModule && CameraModule.Camera && typeof CameraModule.Camera[fn] === 'function') {
            perm = await CameraModule.Camera[fn]();
            if (perm) break;
          }
        } catch (e) {}
      }
      console.log('[CameraCapture] camera permission result:', perm);
      if (!perm) {
        console.warn('[CameraCapture] No camera permission API available on this platform');
        setHasPermission(false);
        Alert.alert('Kamerabehörighet', 'Kan inte kontrollera kamerabehörighet på denna plattform.');
        return;
      }
      const status = perm && (perm.status || (perm.granted ? 'granted' : 'denied'));
      setHasPermission(status === 'granted');
      if (status !== 'granted') {
        Alert.alert('Kamerabehörighet krävs', 'Appen har inte tillgång till kameran. Gå till inställningar och ge behörighet om du vill ta foto.', [{ text: 'OK', onPress: () => {} }]);
      }
    } catch (err) {
      console.error('[CameraCapture] permission check error', err);
      Alert.alert('Fel vid kontroll av kamerabehörighet', String(err?.message || err));
      setHasPermission(false);
    }
  };

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
        subscription();
      }
    };
  }, []);

  useEffect(() => {
    (async () => {
      if (cameraViewRef.current) {
        try {
          const desiredRatio = orientation === 'portrait' ? '3:4' : '4:3';
          const sizes = await cameraViewRef.current.getAvailablePictureSizesAsync(desiredRatio);
          if (sizes && sizes.length > 0) {
            const sorted = sizes.sort((a, b) => {
              const [aw, ah] = a.split('x').map(Number);
              const [bw, bh] = b.split('x').map(Number);
              return bw * bh - aw * ah;
            });
            setPictureSize(sorted[0]);
          }
        } catch (e) {
          // ignore
        }
      }
    })();
  }, [cameraViewRef.current, orientation]);

  useEffect(() => {
    // call the permission check that is declared below
    if (typeof checkCameraPermission === 'function') checkCameraPermission();
  }, []);

  const handleCapture = async () => {
    try {
      if (!cameraRef || isCapturing) return;
      setIsCapturing(true);
      const options = { quality: 0.8 };
      if (pictureSize) options.pictureSize = pictureSize;
      const photo = await cameraRef.takePictureAsync(options);

      let finalPhoto = photo;
      if (orientation === 'portrait' && photo && photo.width && photo.height) {
        const targetRatio = 4 / 3;
        const actualRatio = photo.height / photo.width;
        if (Math.abs(actualRatio - targetRatio) > 0.01) {
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
            finalPhoto = { ...photo, _orientation: orientation };
          }
        } else {
          finalPhoto = { ...photo, _orientation: orientation };
        }
      } else {
        finalPhoto = { ...photo, _orientation: orientation };
      }

      setPhotoPreview(finalPhoto);
      setPhotoComment('');
    } catch (e) {
      Alert.alert('Fel vid fotografering', String(e?.message || e));
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    // placeholder for autoSave behavior
  }, [route.params?.autoSave]);

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
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TouchableOpacity style={styles.secondaryAction} onPress={() => navigation.goBack()}>
            <MaterialIcons name="arrow-back" size={18} color={PRIMARY} />
            <Text style={styles.secondaryActionText}>Tillbaka</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.secondaryAction, { marginLeft: 12 }]} onPress={() => checkCameraPermission()}>
            <MaterialIcons name="autorenew" size={18} color={PRIMARY} />
            <Text style={styles.secondaryActionText}>Be om behörighet</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  if (photoPreview) {
    const isPortrait = photoPreview._orientation === 'portrait';
    const aspectRatio = isPortrait ? 3 / 4 : 4 / 3;
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: '#000' }} behavior={Platform.OS === 'ios' ? 'padding' : 'position'} keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 120}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-start', alignItems: 'center', paddingTop: 24 }} keyboardShouldPersistTaps="handled">
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
          <View style={{ width: '92%', marginTop: 12 }}>
          <Text style={{ color: '#fff', marginBottom: 6 }}>Kommentar</Text>
          <TextInput
            value={photoComment}
            onChangeText={(t) => setPhotoComment(t)}
            placeholder="Lägg till kommentar till bilden..."
            placeholderTextColor="#ddd"
            multiline
            numberOfLines={3}
            blurOnSubmit={true}
            onFocus={() => {
              // Delay to allow keyboard to open then scroll the input into view
              setTimeout(() => { try { scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }); } catch (e) {} }, 120);
            }}
            returnKeyType="done"
            onSubmitEditing={() => { try { /* dismiss keyboard */ } catch (e) {} }}
            style={{ backgroundColor: 'rgba(255,255,255,0.06)', padding: 8, borderRadius: 8, color: '#fff', minHeight: 48 }}
          />
        </View>
        <View style={styles.previewButtonBar}>
          <TouchableOpacity
            style={[styles.previewButton, styles.previewButtonRetake]}
            onPress={() => { setPhotoPreview(null); setPhotoComment(''); }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="refresh" size={22} color={PRIMARY} style={{ marginBottom: 2 }} />
            <Text style={styles.previewButtonTextRetake}>Ta om</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.previewButton, styles.previewButtonSave]}
            onPress={() => {
              const target = route.params?.returnScreen || 'SkyddsrondScreen';
              navigation.navigate(target, {
                cameraResult: {
                  uri: photoPreview.uri,
                  sectionIdx,
                  pointIdx,
                  returnedMottagningsPhotos: (route.params?.mottagningsPhotos || []).concat({ uri: photoPreview.uri, comment: photoComment || '' }),
                },
                project,
                savedChecklist: route.params?.savedChecklist
              });
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="check-circle" size={22} color="#fff" style={{ marginBottom: 2 }} />
            <Text style={styles.previewButtonTextSave}>Spara</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      {(CameraComponent) ? (
      <CameraComponent
        style={{ flex: 1 }}
        ref={ref => {
          setCameraRef(ref);
          cameraViewRef.current = ref;
        }}
        ratio={orientation === 'portrait' ? '3:4' : '4:3'}
        pictureSize={pictureSize}
      />
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <Text style={{ color: '#fff', marginBottom: 12 }}>Kunde inte ladda kamerakomponent.</Text>
          <Text style={{ color: '#fff', marginBottom: 6, fontSize: 12, opacity: 0.9 }}>
            {'Debug: ' + resolvedInfo.type + (Array.isArray(resolvedInfo.keys) && resolvedInfo.keys.length ? ' (' + resolvedInfo.keys.join(', ') + ')' : '')}
          </Text>
          <TouchableOpacity onPress={() => checkCameraPermission()} style={{ padding: 10, backgroundColor: '#fff', borderRadius: 8 }}>
            <Text style={{ color: PRIMARY }}>Försök igen</Text>
          </TouchableOpacity>
        </View>
      )}
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
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
    marginBottom: 18,
    paddingHorizontal: 18,
  },
  previewButton: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    minWidth: 86,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 6,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
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
    fontWeight: '700',
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.2,
  },
  previewButtonTextSave: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
    marginTop: 4,
    letterSpacing: 0.2,
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
  secondaryAction: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'transparent'
  },
  secondaryActionText: {
    color: PRIMARY,
    marginLeft: 8,
    fontSize: 14,
  },
});
