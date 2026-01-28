import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CommonActions, useNavigation, useRoute } from '@react-navigation/native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImageManipulator from 'expo-image-manipulator';
import { useRef, useState } from 'react';
import { Alert, Image, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

// Load ImagePicker dynamically to avoid bundling native-only exports on web
let ImagePicker = null;

export default function CameraCapture() {
  const navigation = useNavigation();
  const route = useRoute();
  const { sectionIdx, pointIdx, project, controlType: controlTypeParam } = route.params || {};
  
  const cameraRef = useRef(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState(null);
  const [facing, setFacing] = useState('back');
  const [photoComment, setPhotoComment] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);
  const [selectedTags, setSelectedTags] = useState({
    deviation: false,
    before: false,
    after: false,
  });

  // Get project info from route params
  const projectName = project?.name || project?.id || 'Projekt';
  const projectId = project?.id || '';
  const controlType = controlTypeParam || 'Kontroll';
  
  // Format date - using native Date since dayjs might not be installed
  const date = new Date();
  const formattedDate = date.toLocaleDateString('sv-SE', { 
    day: 'numeric', 
    month: 'long', 
    year: 'numeric' 
  });
  
  // Calculate week number
  const getWeekNumber = (d) => {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  };
  const week = `Vecka ${getWeekNumber(date)}`;

  const handlePickFromLibrary = async () => {
    try {
      if (!ImagePicker) {
        try { ImagePicker = await import('expo-image-picker'); } catch(_e) { ImagePicker = null; }
      }
      let perm = null;
      if (ImagePicker && typeof ImagePicker.getMediaLibraryPermissionsAsync === 'function') {
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
      const mediaTypesOption = (ImagePicker && ImagePicker.MediaTypeOptions && ImagePicker.MediaTypeOptions.Images)
        ? ImagePicker.MediaTypeOptions.Images
        : (ImagePicker && ImagePicker.MediaType && ImagePicker.MediaType.Images)
          ? ImagePicker.MediaType.Images
          : undefined;
      const pickerOptions = { quality: 0.8 };
      if (mediaTypesOption) pickerOptions.mediaTypes = mediaTypesOption;
      const res = (ImagePicker && typeof ImagePicker.launchImageLibraryAsync === 'function') 
        ? await ImagePicker.launchImageLibraryAsync(pickerOptions) 
        : null;
      
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
        const photos = assets.map(a => {
          const uri = a?.uri || a?.uriString || a?.localUri || (a?.base64 ? `data:image/jpeg;base64,${a.base64}` : null);
          return uri ? { uri, comment: '', tags: selectedTags } : null;
        }).filter(Boolean);
        
        if (photos.length > 0) {
          handleSavePhoto(photos[0]);
        }
      }
    } catch(e) {
      Alert.alert('Kunde inte välja bild: ' + (e?.message || e));
    }
  };

  const takePicture = async () => {
    if (!cameraRef.current || isCapturing) return;
    
    try {
      setIsCapturing(true);
      const result = await cameraRef.current.takePictureAsync({
        quality: 0.9,
      });
      
      if (result) {
        setPhoto({ ...result, tags: selectedTags });
      }
    } catch(e) {
      Alert.alert('Fel vid fotografering', String(e?.message || e));
    } finally {
      setIsCapturing(false);
    }
  };

  const handleSavePhoto = (photoToSave) => {
    const target = route.params?.returnScreen || 'SkyddsrondScreen';
    const payload = {
      cameraResult: {
        uri: photoToSave.uri,
        sectionIdx,
        pointIdx,
        comment: photoComment || '',
        tags: photoToSave.tags || selectedTags,
        returnedMottagningsPhotos: (route.params?.mottagningsPhotos || []).concat({ 
          uri: photoToSave.uri, 
          comment: photoComment || '',
          tags: photoToSave.tags || selectedTags,
        }),
      },
      project,
    };

    const returnKey = route.params?.returnKey;
    
    if (returnKey) {
      try {
        navigation.dispatch(CommonActions.setParams({ 
          params: { cameraResult: payload.cameraResult }, 
          key: returnKey 
        }));
      } catch(_e) {}
      
      try {
        (async () => {
          try {
            const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
            const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
            pending.push(payload.cameraResult);
            await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
          } catch(_e) {}
        })();
      } catch(_e) {}
      
      setTimeout(() => {
        try { navigation.goBack(); } catch(_e) {}
      }, 300);
    } else {
      try {
        const state = navigation.getState && navigation.getState();
        if (state && Array.isArray(state.routes)) {
          const idx = state.index != null ? state.index : state.routes.findIndex(r => r.key === route.key);
          const prevRoute = (typeof idx === 'number' && idx > 0) ? state.routes[idx - 1] : null;
          
          if (prevRoute && prevRoute.key) {
            try {
              navigation.dispatch(CommonActions.setParams({ 
                params: { cameraResult: payload.cameraResult }, 
                key: prevRoute.key 
              }));
            } catch(_e) {}
            
            try {
              (async () => {
                const pendingRaw = await AsyncStorage.getItem('pending_camera_photos');
                const pending = pendingRaw ? JSON.parse(pendingRaw) : [];
                pending.push(payload.cameraResult);
                await AsyncStorage.setItem('pending_camera_photos', JSON.stringify(pending));
              })();
            } catch(_e) {}
            
            setTimeout(() => { 
              try { navigation.goBack(); } catch(_e) {} 
            }, 300);
          } else {
            navigation.navigate({ 
              name: target, 
              params: { cameraResult: payload.cameraResult }, 
              merge: true 
            });
          }
        } else {
          navigation.navigate({ 
            name: target, 
            params: { cameraResult: payload.cameraResult }, 
            merge: true 
          });
        }
      } catch(_e) {
        navigation.navigate({ 
          name: target, 
          params: { cameraResult: payload.cameraResult }, 
          merge: true 
        });
      }
    }
  };

  if (!permission) {
    return (
      <View style={styles.center}>
        <Text style={styles.centerText}>Kontrollerar kameratillstånd...</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="camera-outline" size={64} color="#666" style={{ marginBottom: 16 }} />
        <Text style={styles.centerText}>Kameratillstånd krävs</Text>
        <Text style={[styles.centerText, { fontSize: 14, color: '#999', marginTop: 8, marginBottom: 24 }]}>
          Appen behöver tillgång till kameran för att ta bilder.
        </Text>
        <TouchableOpacity style={styles.permissionButton} onPress={requestPermission}>
          <Text style={styles.permissionButtonText}>Tillåt kamera</Text>
        </TouchableOpacity>
        <TouchableOpacity 
          style={[styles.permissionButton, { marginTop: 12, backgroundColor: 'transparent' }]} 
          onPress={() => navigation.goBack()}
        >
          <Text style={[styles.permissionButtonText, { color: '#007AFF' }]}>Tillbaka</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (photo) {
    return (
      <KeyboardAvoidingView 
        style={styles.previewContainer} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'position'} 
        keyboardVerticalOffset={Platform.OS === 'ios' ? 80 : 120}
      >
        <ScrollView 
          style={styles.previewScroll}
          contentContainerStyle={styles.previewContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header with project info */}
          <View style={styles.previewHeader}>
            <View style={styles.previewHeaderLeft}>
              <Ionicons name="business" size={16} color="#007AFF" style={{ marginRight: 6 }} />
              <Text style={styles.previewProjectName}>{projectName}</Text>
              <Ionicons name="chevron-forward" size={14} color="#666" />
            </View>
            <View style={styles.previewHeaderRight}>
              <Ionicons name="shield" size={14} color="#FFD700" style={{ marginRight: 4 }} />
              <Text style={styles.previewControlType}>{controlType}</Text>
            </View>
          </View>

          {/* Image preview */}
          <Image source={{ uri: photo.uri }} style={styles.previewImage} resizeMode="contain" />

          {/* Tags row */}
          <View style={styles.tagsRow}>
            <View style={styles.tagItem}>
              <Ionicons name="calendar-outline" size={16} color="#666" style={{ marginRight: 4 }} />
              <Text style={styles.tagText}>{formattedDate}</Text>
            </View>
            
            <TouchableOpacity
              style={[styles.tagButton, selectedTags.deviation && styles.tagButtonActive]}
              onPress={() => setSelectedTags(prev => ({ ...prev, deviation: !prev.deviation }))}
            >
              <Text style={[styles.tagButtonText, selectedTags.deviation && styles.tagButtonTextActive]}>
                Avvikelse
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tagButton, styles.tagButtonBlue, selectedTags.before && styles.tagButtonActive]}
              onPress={() => setSelectedTags(prev => ({ ...prev, before: !prev.before }))}
            >
              <Ionicons name="checkmark-circle" size={14} color={selectedTags.before ? '#fff' : '#007AFF'} style={{ marginRight: 4 }} />
              <Text style={[styles.tagButtonText, styles.tagButtonTextBlue, selectedTags.before && styles.tagButtonTextActive]}>
                Före
              </Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={[styles.tagButton, styles.tagButtonGreen, selectedTags.after && styles.tagButtonActive]}
              onPress={() => setSelectedTags(prev => ({ ...prev, after: !prev.after }))}
            >
              <Ionicons name="checkmark-circle" size={14} color={selectedTags.after ? '#fff' : '#10B981'} style={{ marginRight: 4 }} />
              <Text style={[styles.tagButtonText, styles.tagButtonTextGreen, selectedTags.after && styles.tagButtonTextActive]}>
                Efter
              </Text>
            </TouchableOpacity>
          </View>

          {/* Comment input */}
          <View style={styles.commentContainer}>
            <Text style={styles.commentLabel}>Kommentar (valfritt)</Text>
            <TextInput
              value={photoComment}
              onChangeText={setPhotoComment}
              placeholder="Lägg till kommentar till bilden..."
              placeholderTextColor="#999"
              multiline
              numberOfLines={3}
              style={styles.commentInput}
            />
          </View>

          {/* Action buttons */}
          <View style={styles.previewActions}>
            <TouchableOpacity
              style={[styles.actionButton, styles.actionButtonPrimary]}
              onPress={() => handleSavePhoto({ ...photo, tags: selectedTags })}
            >
              <Text style={styles.actionButtonTextPrimary}>Använd bild</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              onPress={() => {
                setPhoto(null);
                setPhotoComment('');
                setSelectedTags({ deviation: false, before: false, after: false });
              }}
            >
              <Text style={styles.actionButtonText}>Ta om</Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView ref={cameraRef} style={styles.camera} facing={facing}>
        {/* Top Overlay */}
        <View style={styles.topOverlay}>
          <View style={styles.topOverlayHeader}>
            <View style={styles.topOverlayLeft}>
              <Ionicons name="business" size={16} color="#10B981" style={{ marginRight: 6 }} />
              <Text style={styles.projectName}>{projectName}</Text>
            </View>
            <TouchableOpacity 
              style={styles.closeButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="close" size={24} color="#fff" />
            </TouchableOpacity>
          </View>
          <View style={styles.topOverlayMeta}>
            <Ionicons name="shield" size={14} color="#FFD700" style={{ marginRight: 4 }} />
            <Text style={styles.metaText}>
              {controlType} • {formattedDate} • {week}
            </Text>
          </View>
        </View>

        {/* Bottom Controls */}
        <View style={styles.bottomBar}>
          <TouchableOpacity 
            style={styles.flipButton}
            onPress={() => setFacing(facing === 'back' ? 'front' : 'back')}
          >
            <Ionicons name="camera-reverse" size={28} color="#fff" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.shutter}
            onPress={takePicture}
            disabled={isCapturing}
            activeOpacity={0.8}
          >
            {isCapturing ? (
              <View style={styles.shutterLoading}>
                <View style={styles.shutterLoadingInner} />
              </View>
            ) : null}
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.libraryButton}
            onPress={handlePickFromLibrary}
          >
            <Ionicons name="images-outline" size={28} color="#fff" />
          </TouchableOpacity>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1, 
    backgroundColor: 'black' 
  },
  camera: { 
    flex: 1 
  },
  
  // Top Overlay
  topOverlay: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 50 : 40,
    left: 16,
    right: 16,
    backgroundColor: 'rgba(0,0,0,0.6)',
    padding: 12,
    borderRadius: 12,
    zIndex: 10,
  },
  topOverlayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  topOverlayLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  projectName: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  closeButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topOverlayMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaText: {
    color: '#ccc',
    fontSize: 13,
  },

  // Bottom Bar
  bottomBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 40 : 30,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  flipButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutter: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: 'white',
    borderWidth: 6,
    borderColor: '#ddd',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterLoading: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: '#007AFF',
    borderTopColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterLoadingInner: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#007AFF',
    opacity: 0.3,
  },
  libraryButton: {
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Preview
  previewContainer: { 
    flex: 1, 
    backgroundColor: 'black' 
  },
  previewScroll: {
    flex: 1,
  },
  previewContent: {
    flexGrow: 1,
    paddingBottom: 24,
  },
  previewHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  previewHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  previewProjectName: {
    color: '#007AFF',
    fontSize: 15,
    fontWeight: '600',
    marginRight: 4,
  },
  previewHeaderRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  previewControlType: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '500',
  },
  previewImage: {
    width: '100%',
    aspectRatio: 4 / 3,
    backgroundColor: '#111',
    marginTop: 8,
  },
  
  // Tags
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    gap: 8,
    flexWrap: 'wrap',
  },
  tagItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  tagText: {
    color: '#666',
    fontSize: 13,
  },
  tagButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: '#D32F2F',
  },
  tagButtonBlue: {
    borderColor: '#007AFF',
  },
  tagButtonGreen: {
    borderColor: '#10B981',
  },
  tagButtonActive: {
    backgroundColor: '#D32F2F',
  },
  tagButtonText: {
    color: '#D32F2F',
    fontSize: 13,
    fontWeight: '600',
  },
  tagButtonTextBlue: {
    color: '#007AFF',
  },
  tagButtonTextGreen: {
    color: '#10B981',
  },
  tagButtonTextActive: {
    color: '#fff',
  },

  // Comment
  commentContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  commentLabel: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  commentInput: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 8,
    padding: 12,
    color: '#fff',
    fontSize: 14,
    minHeight: 80,
    textAlignVertical: 'top',
  },

  // Actions
  previewActions: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    padding: 16,
    borderRadius: 12,
    backgroundColor: '#333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionButtonPrimary: {
    backgroundColor: '#007AFF',
  },
  actionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  actionButtonTextPrimary: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },

  // Center (permission)
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000',
    padding: 24,
  },
  centerText: {
    color: '#fff',
    fontSize: 16,
    textAlign: 'center',
  },
  permissionButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
