import { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, View } from 'react-native';

const POS = Platform.OS === 'web' ? 'fixed' : 'absolute';

export default function FilePreviewModal({
  visible,
  onClose,
  maxWidth = 1400,
  children,
}) {
  const show = !!visible;

  const keyHandlerEnabled = Platform.OS === 'web' && show;

  const cardStyle = useMemo(() => {
    if (Platform.OS === 'web') {
      return {
        width: '100%',
        maxWidth,
        height: '90vh',
        maxHeight: '90vh',
      };
    }

    return {
      width: '100%',
      maxWidth,
      height: '90%',
      maxHeight: '90%',
    };
  }, [maxWidth]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (!show) return;

    const body = typeof document !== 'undefined' ? document.body : null;
    if (!body) return;

    const prevOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    return () => {
      body.style.overflow = prevOverflow;
    };
  }, [show]);

  useEffect(() => {
    if (!keyHandlerEnabled) return;

    const handler = (e) => {
      const key = String(e?.key || '');
      if (key === 'Escape') {
        e.preventDefault?.();
        if (typeof onClose === 'function') onClose();
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [keyHandlerEnabled, onClose]);

  if (!show) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={() => {
        if (typeof onClose === 'function') onClose();
      }}
    >
      <View style={styles.overlay}>
        <Pressable
          style={styles.dismiss}
          onPress={() => {
            if (typeof onClose === 'function') onClose();
          }}
        />

        <Pressable
          onPress={(e) => {
            try { e?.stopPropagation?.(); } catch (_e) {}
          }}
          style={[styles.card, cardStyle]}
        >
          <View style={styles.body}>{children}</View>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: POS,
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999999,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 14px 40px rgba(0,0,0,0.30)' } : { elevation: 8 }),
  },
  body: {
    flex: 1,
    minHeight: 0,
  },
});
