import { useEffect, useMemo } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ICON_RAIL } from '../../../constants/iconRailTheme';

const POS = Platform.OS === 'web' ? 'fixed' : 'absolute';
const RAIL_BG = ICON_RAIL?.bg ?? '#0f1b2d';

/** Golden rule: 12px rounded, soft shadows, Inter, subtle hover, SaaS 2026 */
export const FILE_ACTION_MODAL_STYLES = StyleSheet.create({
  title: {
    fontSize: 15,
    fontWeight: '600',
    color: '#1e293b',
    lineHeight: 22,
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  description: {
    marginTop: 6,
    fontSize: 13,
    fontWeight: '400',
    color: '#64748b',
    lineHeight: 18,
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  label: {
    fontSize: 13,
    fontWeight: '400',
    color: '#334155',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
});

export default function FileActionModal({
  visible,
  title,
  description,
  /** Golden rule: mörk banner. bannerTitle = stor text, bannerSubtitle = liten text (valfritt) */
  bannerTitle = null,
  bannerSubtitle = null,
  onClose,

  primaryLabel,
  onPrimary,
  primaryDisabled = false,
  /** 'danger' = red, 'dark' = mörk som rail (Byt namn), 'default' = blue */
  primaryVariant = 'default',

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
          {bannerTitle ? (
            <View style={[styles.banner, { backgroundColor: RAIL_BG }]}>
              <Text style={styles.bannerTitle}>
                {String(bannerTitle)}
                {bannerSubtitle ? (
                  <Text style={styles.bannerSubtitleInline}> {String(bannerSubtitle)}</Text>
                ) : null}
              </Text>
            </View>
          ) : (
            <View style={styles.headerArea}>
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
            </View>
          )}

          <View style={[styles.body, bannerTitle ? styles.bodyWithBanner : null]}>{children}</View>

          <View style={styles.actions}>
            <Pressable
              onPress={() => {
                if (typeof onClose === 'function') onClose();
              }}
              style={(state) => {
                const h = (state && state.hovered) === true;
                const p = (state && state.pressed) === true;
                return [
                  styles.btnSecondary,
                  (h || p) && styles.btnSecondaryHover,
                ];
              }}
            >
              <Text style={styles.btnSecondaryText}>{secondaryLabel}</Text>
            </Pressable>

            {primaryLabel && typeof onPrimary === 'function' ? (
              <Pressable
                onPress={() => {
                  if (!primaryDisabled) onPrimary();
                }}
                disabled={primaryDisabled}
                style={(state) => {
                  const h = (state && state.hovered) === true;
                  const p = (state && state.pressed) === true;
                  const isDanger = primaryVariant === 'danger';
                  const isDark = primaryVariant === 'dark';
                  const baseBg = primaryDisabled
                    ? '#cbd5e1'
                    : isDanger
                      ? (h || p ? '#b91c1c' : '#dc2626')
                      : isDark
                        ? (h || p ? '#1a2742' : RAIL_BG)
                        : (h || p ? '#1d4ed8' : '#2563eb');
                  return [
                    styles.btnPrimary,
                    { backgroundColor: baseBg },
                    Platform.OS === 'web' && { cursor: primaryDisabled ? 'not-allowed' : 'pointer' },
                  ];
                }}
              >
                <Text style={styles.btnPrimaryText}>{primaryLabel}</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
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
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    ...(Platform.OS === 'web'
      ? { boxShadow: '0 8px 32px rgba(0,0,0,0.08), 0 2px 8px rgba(0,0,0,0.04)' }
      : { elevation: 12 }),
  },
  headerArea: {
    paddingTop: 24,
    paddingHorizontal: 24,
  },
  banner: {
    paddingVertical: 12,
    paddingHorizontal: 24,
  },
  bannerTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  bannerSubtitle: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  bannerSubtitleInline: {
    fontSize: 12,
    fontWeight: '400',
    color: 'rgba(255, 255, 255, 0.85)',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  body: {
    marginTop: 16,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  bodyWithBanner: {
    marginTop: 20,
  },
  actions: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  btnSecondary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease, border-color 150ms ease' } : {}),
  },
  btnSecondaryHover: {
    backgroundColor: '#f8fafc',
    borderColor: '#e2e8f0',
  },
  btnSecondaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
  btnPrimary: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    ...(Platform.OS === 'web' ? { transition: 'background-color 150ms ease' } : {}),
  },
  btnPrimaryText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
    fontFamily: Platform.select({ web: 'Inter, system-ui, sans-serif', default: undefined }),
  },
});
