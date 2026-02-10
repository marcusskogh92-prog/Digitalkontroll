import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Modal, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';

export default function ConfirmModal({
  visible,
  title,
  message,
  cancelLabel = 'Avbryt',
  confirmLabel = 'Bekräfta',
  danger = false,
  busy = false,
  error = '',
  onCancel,
  onConfirm,
}) {
  const handleCancel = () => {
    if (busy) return;
    try {
      onCancel?.();
    } catch (_e) {}
  };

  const handleConfirm = () => {
    if (busy) return;
    try {
      onConfirm?.();
    } catch (_e) {}
  };

  return (
    <Modal visible={!!visible} transparent animationType="fade" onRequestClose={handleCancel}>
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: 'rgba(0,0,0,0.35)',
          padding: 18,
        }}
      >
        <Pressable
          style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
          onPress={handleCancel}
        />

        <View
          style={{
            backgroundColor: '#fff',
            borderRadius: 16,
            padding: 18,
            width: Platform.OS === 'web' ? 520 : 340,
            maxWidth: '96%',
            borderWidth: 1,
            borderColor: '#E2E8F0',
            shadowColor: '#000',
            shadowOpacity: 0.15,
            shadowRadius: 12,
            shadowOffset: { width: 0, height: 6 },
            elevation: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <Text style={{ fontSize: 18, fontWeight: '500', color: '#0F172A' }}>{String(title || '')}</Text>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={busy}
              style={{ padding: 6, opacity: busy ? 0.4 : 1 }}
              accessibilityLabel="Stäng"
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Ionicons name="close" size={22} color="#0F172A" />
            </TouchableOpacity>
          </View>

          <Text
            style={{
              fontSize: 14,
              color: '#334155',
              fontWeight: '400',
              lineHeight: 20,
              marginBottom: 10,
              ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}),
            }}
          >
            {String(message || '')}
          </Text>

          {String(error || '').trim() ? (
            <View style={{ marginBottom: 12, backgroundColor: '#FEF2F2', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ color: '#991B1B', fontSize: 13, fontWeight: '500', marginBottom: 4 }}>Kunde inte slutföra</Text>
              <Text
                style={{
                  color: '#7F1D1D',
                  fontSize: 13,
                  fontWeight: '400',
                  lineHeight: 18,
                  ...(Platform.OS === 'web' ? { whiteSpace: 'pre-wrap' } : {}),
                }}
              >
                {String(error)}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center' }}>
            <TouchableOpacity
              onPress={handleCancel}
              disabled={busy}
              activeOpacity={0.85}
              style={{
                backgroundColor: '#E2E8F0',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 16,
                minWidth: 110,
                alignItems: 'center',
                opacity: busy ? 0.6 : 1,
              }}
            >
              <Text style={{ color: '#0F172A', fontWeight: '500', fontSize: 14 }}>{cancelLabel}</Text>
            </TouchableOpacity>

            <View style={{ width: 10 }} />

            <TouchableOpacity
              onPress={handleConfirm}
              disabled={busy}
              activeOpacity={0.85}
              style={{
                backgroundColor: danger ? '#DC2626' : '#1976D2',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 16,
                minWidth: 140,
                alignItems: 'center',
                flexDirection: 'row',
                justifyContent: 'center',
                opacity: busy ? 0.75 : 1,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
              ) : null}
              <Text style={{ color: '#fff', fontWeight: '500', fontSize: 14 }}>{confirmLabel}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
