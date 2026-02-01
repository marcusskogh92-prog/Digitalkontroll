import { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

const POS = Platform.OS === 'web' ? 'fixed' : 'absolute';

export const FILE_ACTION_MODAL_STYLES = StyleSheet.create({
  title: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111',
    lineHeight: 18,
  },
  description: {
    marginTop: 6,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 16,
  },
  label: {
    fontSize: 12,
    fontWeight: '400',
    color: '#111',
  },
});

export default function FileActionModal({
  visible,
  title,
  description,
  onClose,

  primaryLabel,
  onPrimary,
  primaryDisabled = false,

  secondaryLabel = 'Avbryt',

  maxWidth = 480,
  maxHeight = null,

  enableEnterSubmit = true,
  children,
}) {
  const show = !!visible;

  const canPrimary = typeof onPrimary === 'function' && !!primaryLabel && !primaryDisabled;

  const keyHandlerEnabled = Platform.OS === 'web' && show;

  const resolvedMaxHeight = useMemo(() => {
    if (typeof maxHeight === 'number' && Number.isFinite(maxHeight) && maxHeight > 0) return maxHeight;
    return null;
  }, [maxHeight]);

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
        return;
      }

      if (key === 'Enter') {
        if (!enableEnterSubmit) return;

        // Avoid stealing Enter from multiline fields.
        const tag = String(e?.target?.tagName || '').toUpperCase();
        if (tag === 'TEXTAREA') return;

        if (canPrimary) {
          e.preventDefault?.();
          onPrimary();
        }
      }
    };

    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [keyHandlerEnabled, enableEnterSubmit, canPrimary, onPrimary, onClose]);

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
          style={[
            styles.card,
            { maxWidth },
            resolvedMaxHeight ? { maxHeight: resolvedMaxHeight } : null,
          ]}
        >
          {!!title && (
            <Text style={FILE_ACTION_MODAL_STYLES.title} numberOfLines={2}>
              {String(title)}
            </Text>
          )}
          {!!description && (
            <Text style={FILE_ACTION_MODAL_STYLES.description} numberOfLines={3}>
              {String(description)}
            </Text>
          )}

          <View style={styles.body}>{children}</View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (typeof onClose === 'function') onClose();
              }}
              style={({ hovered, pressed }) => ({
                paddingVertical: 10,
                paddingHorizontal: 14,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
              })}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#111' }}>{secondaryLabel}</Text>
            </Pressable>

            {primaryLabel && typeof onPrimary === 'function' ? (
              <Pressable
                onPress={() => {
                  if (!primaryDisabled) onPrimary();
                }}
                disabled={primaryDisabled}
                style={({ hovered, pressed }) => ({
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderRadius: 10,
                  backgroundColor: primaryDisabled ? '#94A3B8' : (hovered || pressed ? '#155FB5' : '#1976D2'),
                  ...(Platform.OS === 'web' ? { cursor: primaryDisabled ? 'not-allowed' : 'pointer' } : null),
                })}
              >
                <Text style={{ fontSize: 12, fontWeight: '600', color: '#fff' }}>{primaryLabel}</Text>
              </Pressable>
            ) : null}
          </View>
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
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  dismiss: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  card: {
    width: '100%',
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    padding: 24,
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)' } : { elevation: 6 }),
  },
  body: {
    marginTop: 14,
  },
  actions: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
  },
});
