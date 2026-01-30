import { Ionicons } from '@expo/vector-icons';
import { Modal, Platform, Pressable, ScrollView, Text, View } from 'react-native';

export default function RightSidePanel({
  visible,
  title,
  onClose,
  width = 520,
  children,
  footer = null,
  scroll = true,
}) {
  if (!visible) return null;

  const pos = Platform.OS === 'web' ? 'fixed' : 'absolute';

  const content = (
    <View style={{ flex: 1 }}>
      <View
        style={{
          padding: 14,
          borderBottomWidth: 1,
          borderBottomColor: '#E6E8EC',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Text style={{ flex: 1, fontSize: 16, fontWeight: '800', color: '#111' }} numberOfLines={1}>
          {String(title || '').trim()}
        </Text>
        <Pressable onPress={onClose} style={{ padding: 8 }}>
          <Ionicons name="close" size={20} color="#64748b" />
        </Pressable>
      </View>

      {scroll ? (
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 14 }}>
          {children}
        </ScrollView>
      ) : (
        <View style={{ flex: 1, padding: 14 }}>{children}</View>
      )}

      {footer ? (
        <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: '#E6E8EC' }}>{footer}</View>
      ) : null}
    </View>
  );

  return (
    <Modal visible={!!visible} transparent animationType={Platform.OS === 'web' ? 'fade' : 'slide'} onRequestClose={onClose}>
      <View
        style={{
          position: pos,
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.35)',
          zIndex: 600,
        }}
      >
        <Pressable onPress={onClose} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
        <View
          style={{
            position: 'absolute',
            top: 0,
            right: 0,
            bottom: 0,
            width: Platform.OS === 'web' ? width : '100%',
            maxWidth: '100%',
            backgroundColor: '#fff',
            borderLeftWidth: 1,
            borderLeftColor: '#E6E8EC',
            shadowColor: '#000',
            shadowOffset: { width: -2, height: 0 },
            shadowOpacity: 0.1,
            shadowRadius: 10,
            elevation: 12,
          }}
        >
          {content}
        </View>
      </View>
    </Modal>
  );
}
