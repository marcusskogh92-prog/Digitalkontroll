import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import * as CameraModule from 'expo-camera';
import { Camera } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

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
  let resolvedInfo = { type: 'unknown', keys: [] };
  try {
    // Prefer CameraView if available (some builds expose CameraView as the host component)
    if (CameraModule && CameraModule.CameraView) {
      CameraComponent = CameraModule.CameraView;
      resolvedInfo = { type: 'CameraView', keys: Object.keys(CameraModule || {}) };
    } else if (CameraModule && CameraModule.Camera) {
      CameraComponent = CameraModule.Camera;
      resolvedInfo = { type: 'Camera', keys: Object.keys(CameraModule || {}) };
    } else if (Camera) {
      CameraComponent = Camera;
      resolvedInfo = { type: 'expo-camera Camera', keys: [] };
    } else {
      resolvedInfo = { type: 'none', keys: Object.keys(CameraModule || {}) };
    }
  } catch(e) {
    resolvedInfo = { type: 'error', keys: Object.keys(CameraModule || {}), error: String(e) };
  }
  const handlePickFromLibrary = async () => {
    try {
      let perm = null;
      if (typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
        perm = await ImagePicker.getMediaLibraryPermissionsAsync();
      }
      if (!perm || !(perm.granted === true || perm.status === 'granted')) {
        perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      }
      const ok = (perm && (perm.granted === true || perm.status === 'granted'));
      if (!ok) {
        Alert.alert('Behöver tillgång till bildbiblioteket för att välja bilder.');
        return;
      }
      const mediaTypesOption = (ImagePicker && ImagePicker.MediaType && ImagePicker.MediaType.Images) ? ImagePicker.MediaType.Images : undefined;
      const pickerOptions = { quality: 0.8 };
      if (mediaTypesOption) pickerOptions.mediaTypes = mediaTypesOption;
      const res = await ImagePicker.launchImageLibraryAsync(pickerOptions);
      const extractAssets = (r) => {
        if (!r) return [];
        if (Array.isArray(r.assets) && r.assets.length) return r.assets;
        if (Array.isArray(r.selectedAssets) && r.selectedAssets.length) return r.selectedAssets;
        if (r.uri) return [{ uri: r.uri }];
        if (r.cancelled === false && r.uri) return [{ uri: r.uri }];
        return [];
      };
      const assets = extractAssets(res);
      if (assets && assets.length > 0) {
        // Skapa samma payload som vid foto
        const photos = assets.map(a => {
          const uri = a?.uri || a?.uriString || a?.localUri || (a?.base64 ? `data:image/jpeg;base64,${a.base64}` : null);
          return uri ? { uri, comment: '' } : null;
        }).filter(Boolean);
        if (photos.length > 0) {
          const target = route.params?.returnScreen || 'SkyddsrondScreen';
          const payload = {
            cameraResult: {
              uri: photos[0].uri, // För kompatibilitet, men vi skickar alla i returnedMottagningsPhotos
              sectionIdx,
              pointIdx,
              returnedMottagningsPhotos: (route.params?.mottagningsPhotos || []).concat(photos),
            },
            project,
          };
          const returnKey = route.params?.returnKey;
          if (returnKey) {
            try {
              navigation.dispatch(CommonActions.setParams({ params: { cameraResult: payload.cameraResult }, key: returnKey }));
            } catch(e) {}
            try {
              (async () => {
                try {
                  const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
                  const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
                  pending.push(payload.cameraResult);
                  await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
                } catch(_e {}
              })();
            } catch(e) {}
            setTimeout(() => { try { navigation.goBack(); } catch(_e {} }, 300);
          } else {
            try {
              const state = navigation.getState && navigation.getState();
              if (state && Array.isArray(state.routes)) {
                const idx = state.index != null ? state.index : state.routes.findIndex(r => r.key === route.key);
                const prevRoute = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
                if (prevRoute && prevRoute.key) {
                  try {
                    navigation.dispatch(CommonActions.setParams({ params: { cameraResult: payload.cameraResult }, key: prevRoute.key }));
                  } catch(_e {}
                  try {
                    (async () => {
                      const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
                      const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
                      pending.push(payload.cameraResult);
                      await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
                    })();
                  } catch(e) {}
                  setTimeout(() => { try { navigation.goBack(); } catch(e) {} }, 300);
                } else {
                  navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
                }
              } else {
                navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
              }
            } catch(e) {
              navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
            }
          }
        }
      }
    } catch(e) {
      Alert.alert('Kunde inte välja bild: ' + (e?.message || e));
    }
  };

  // Ta bort automatisk kamerabehörighetskontroll vid mount


  const handleCapture = async () => {
    try {
      // Kontrollera kamerabehörighet först
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
        } catch(e) {}
      }
      const status = perm && (perm.status || (perm.granted ? 'granted' : 'denied'));
      if (status !== 'granted') {
        Alert.alert('Kamerabehörighet krävs', 'Appen har inte tillgång till kameran. Gå till inställningar och ge behörighet om du vill ta foto.', [{ text: 'OK', onPress: () => {} }]);
        return;
      }
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
    } catch(e) {
      Alert.alert('Fel vid fotografering', String(e?.message || e));
    } finally {
      setIsCapturing(false);
    }
  };

  useEffect(() => {
    // placeholder for autoSave behavior
  }, [route.params?.autoSave]);

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
        } catch(e) {}
      }
      const status = perm && (perm.status || (perm.granted ? 'granted' : 'denied'));
      setHasPermission(status === 'granted' ? true : false);
      return status === 'granted';
    } catch(e) {
      setHasPermission(false);
      return false;
    }
  };

  // Visa endast fallback om hasPermission === false
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
              setTimeout(() => { try { scrollRef.current && scrollRef.current.scrollToEnd({ animated: true }); } catch(e) {} }, 120);
            }}
            returnKeyType="done"
            onSubmitEditing={() => { try { /* dismiss keyboard */ } catch(e) {} }}
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
              // Merge params into the existing route instead of pushing a new instance
              try {
                  // If caller provided `returnKey`, set params directly on that route (no remount).
                  const payload = {
                    cameraResult: {
                      uri: photoPreview.uri,
                      sectionIdx,
                      pointIdx,
                      returnedMottagningsPhotos: (route.params?.mottagningsPhotos || []).concat({ uri: photoPreview.uri, comment: photoComment || '' }),
                    },
                    project,
                  };
                  // Removed debug logging
                  try {
                    const returnKey = route.params?.returnKey;
                    if (returnKey) {
                      try {
                        navigation.dispatch(CommonActions.setParams({ params: { cameraResult: payload.cameraResult }, key: returnKey }));
                      } catch(e) {}
                      try {
                        const state = navigation.getState && navigation.getState();
                        if (state && Array.isArray(state.routes)) {
                          const idx = state.index != null ? state.index : state.routes.findIndex(r => r.key === route.key);
                          const prevRoute = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
                          if (prevRoute && prevRoute.key) {
                            try {
                              navigation.dispatch(CommonActions.setParams({ params: { cameraResult: payload.cameraResult }, key: prevRoute.key }));
                            } catch(e) {}
                          }
                        }
                      } catch(e) {}
                      try {
                        (async () => {
                          try {
                            const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
                            const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
                            pending.push(payload.cameraResult);
                            await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
                          } catch(e) {}
                        })();
                      } catch(e) {}
                      setTimeout(() => {
                        try { navigation.goBack(); } catch(e) {};
                      }, 300);
                    } else {
                      try {
                        const state = navigation.getState && navigation.getState();
                        if (state && Array.isArray(state.routes)) {
                          const idx = state.index != null ? state.index : state.routes.findIndex(r => r.key === route.key);
                          const prevRoute = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
                            if (prevRoute && prevRoute.key) {
                            try {
                              navigation.dispatch(CommonActions.setParams({ params: { cameraResult: payload.cameraResult }, key: prevRoute.key }));
                            } catch(e) {}
                            try {
                              (async () => {
                                const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
                                const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
                                pending.push(payload.cameraResult);
                                await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
                              })();
                            } catch(e) {}
                            setTimeout(() => { try { navigation.goBack(); } catch(e) {} }, 300);
                          } else {
                            navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
                          }
                        } else {
                          navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
                        }
                      } catch(e) {
                        navigation.navigate({ name: target, params: { cameraResult: payload.cameraResult }, merge: true });
                      }
                    }
                  } catch(e) {
                    navigation.navigate(target, payload);
                  }
              } catch(e) {
                navigation.navigate(target, {
                  cameraResult: {
                    uri: photoPreview.uri,
                    sectionIdx,
                    pointIdx,
                    returnedMottagningsPhotos: (route.params?.mottagningsPhotos || []).concat({ uri: photoPreview.uri, comment: photoComment || '' }),
                  },
                  project,
                });
              }
            }}
            activeOpacity={0.8}
          >
            <MaterialIcons name="save" size={28} color="#fff" style={{ marginBottom: 2 }} />
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
          <View style={styles.libraryButtonWrapperPortrait} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.cameraButton, styles.libraryButton]}
              onPress={handlePickFromLibrary}
              activeOpacity={0.7}
            >
              <MaterialIcons name="photo-library" size={28} color={PRIMARY} />
              <Text style={{ color: PRIMARY, fontWeight: 'bold', fontSize: 10, marginTop: 2 }}>Bibliotek</Text>
            </TouchableOpacity>
          </View>
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
          <View style={styles.libraryButtonWrapperLandscape} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.cameraButton, styles.libraryButton]}
              onPress={handlePickFromLibrary}
              activeOpacity={0.7}
            >
              <MaterialIcons name="photo-library" size={28} color={PRIMARY} />
              <Text style={{ color: PRIMARY, fontWeight: 'bold', fontSize: 10, marginTop: 2 }}>Bibliotek</Text>
            </TouchableOpacity>
          </View>
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
  libraryButtonWrapperPortrait: {
    position: 'absolute',
    right: 24,
    bottom: 0,
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  libraryButtonWrapperLandscape: {
    position: 'absolute',
    right: 24,
    top: '60%',
    zIndex: 10,
    alignItems: 'center',
    justifyContent: 'center',
    pointerEvents: 'box-none',
  },
  libraryButton: {
    backgroundColor: '#fff',
    borderColor: PRIMARY,
    marginTop: 0,
    width: 60,
    height: 60,
    borderRadius: 30,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 0,
    paddingVertical: 0,
    minWidth: 0,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
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
