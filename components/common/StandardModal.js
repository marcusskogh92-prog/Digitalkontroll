/**
 * StandardModal – Golden rule för alla modaler.
 * Samma utseende och beteende som Företagsinställningar:
 * - Mörk banner, titel 14px, undertext 12px
 * - Stäng och Spara mörka med vit text
 * - Draggable (drag i bannern), resizable (dra i kant/hörn, muspekare blir streck med pilar)
 * - Esc stänger, Enter sparar (när fokus inte i input), Tab och pilar fungerar
 * Använd denna komponent för alla nya modaler. Se docs/MODAL_GOLDEN_RULE.md.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import {
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import { MODAL_THEME } from '../../constants/modalTheme';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import { useModalKeyboard } from '../../hooks/useModalKeyboard';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: MODAL_DESIGN_2026.overlayBg,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: MODAL_DESIGN_2026.radius,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.22)',
    ...MODAL_DESIGN_2026.shadowNative,
    flexDirection: 'column',
    maxWidth: '90vw',
    maxHeight: '85vh',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: MODAL_THEME.banner.paddingVertical,
    paddingHorizontal: MODAL_THEME.banner.paddingHorizontal,
    minHeight: MODAL_THEME.banner.minHeight,
    maxHeight: MODAL_THEME.banner.maxHeight,
    backgroundColor: MODAL_THEME.banner.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: MODAL_THEME.banner.borderBottomColor,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleIcon: {
    width: MODAL_THEME.banner.iconSize,
    height: MODAL_THEME.banner.iconSize,
    borderRadius: MODAL_THEME.banner.iconBgRadius,
    backgroundColor: MODAL_THEME.banner.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: MODAL_THEME.banner.titleFontSize,
    fontWeight: MODAL_THEME.banner.titleFontWeight,
    color: MODAL_THEME.banner.titleColor,
  },
  titleDot: {
    fontSize: MODAL_THEME.banner.dotFontSize,
    color: MODAL_THEME.banner.subtitleColor,
    marginHorizontal: 5,
    opacity: 0.8,
  },
  subtitle: {
    fontSize: MODAL_THEME.banner.subtitleFontSize,
    color: MODAL_THEME.banner.subtitleColor,
    fontWeight: '400',
    opacity: 0.95,
  },
  closeBtn: {
    padding: MODAL_THEME.banner.closeBtnPadding,
    borderRadius: MODAL_THEME.banner.iconBgRadius,
    backgroundColor: MODAL_THEME.banner.closeBtnBg ?? MODAL_THEME.banner.iconBg,
  },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: MODAL_THEME.footer.borderTopColor,
    backgroundColor: MODAL_THEME.footer.backgroundColor,
  },
  footerBtnStang: {
    paddingVertical: MODAL_THEME.footer.btnPaddingVertical,
    paddingHorizontal: MODAL_THEME.footer.btnPaddingHorizontal,
    borderRadius: MODAL_THEME.footer.btnBorderRadius,
    borderWidth: 0,
    backgroundColor: MODAL_THEME.footer.btnBackground,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnSave: {
    paddingVertical: MODAL_THEME.footer.btnPaddingVertical,
    paddingHorizontal: MODAL_THEME.footer.btnPaddingHorizontal,
    borderRadius: MODAL_THEME.footer.btnBorderRadius,
    borderWidth: 0,
    backgroundColor: MODAL_THEME.footer.saveBtnBackground,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnText: {
    fontSize: MODAL_THEME.footer.btnFontSize,
    fontWeight: MODAL_THEME.footer.btnFontWeight,
    color: MODAL_THEME.footer.btnTextColor,
  },
  footerBtnSaveText: {
    fontSize: MODAL_THEME.footer.btnFontSize,
    fontWeight: MODAL_THEME.footer.btnFontWeight,
    color: MODAL_THEME.footer.saveBtnTextColor,
  },
});

export default function StandardModal({
  visible,
  onClose,
  title,
  subtitle,
  iconName = 'document-text-outline',
  iconSize = 18,
  children,
  footerExtra,
  saveLabel,
  onSave,
  saving = false,
  saveDisabled,
  defaultWidth = 480,
  defaultHeight = 380,
  minWidth = 380,
  minHeight = 320,
}) {
  const canSave = Boolean(onSave) && !saveDisabled;
  useModalKeyboard(visible, onClose, onSave, { canSave, saving, disabled: !visible });

  const {
    boxStyle,
    overlayStyle,
    headerProps,
    resizeHandles,
  } = useDraggableResizableModal(visible, {
    defaultWidth,
    defaultHeight,
    minWidth,
    minHeight,
  });

  if (!visible) return null;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={[styles.overlay, overlayStyle]}
        onPress={onClose}
      >
        <Pressable
          style={[styles.box, boxStyle]}
          onPress={(e) => e?.stopPropagation?.()}
        >
          <View
            style={[styles.header, headerProps.style]}
            {...(Platform.OS === 'web' ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons
                  name={iconName}
                  size={iconSize}
                  color={MODAL_THEME.banner.titleColor}
                />
              </View>
              <Text style={styles.title} numberOfLines={1}>{title}</Text>
              {subtitle != null && subtitle !== '' && (
                <>
                  <Text style={styles.titleDot}>•</Text>
                  <Text style={styles.subtitle} numberOfLines={1}>{subtitle}</Text>
                </>
              )}
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Stäng"
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons
                name="close"
                size={MODAL_THEME.banner.closeIconSize}
                color={MODAL_THEME.banner.titleColor}
              />
            </TouchableOpacity>
          </View>

          <View style={{ flex: 1, minHeight: 0 }}>
            {children}
          </View>

          <View style={styles.footer}>
            {footerExtra}
            <TouchableOpacity
              style={styles.footerBtnStang}
              onPress={onClose}
            >
              <Text style={styles.footerBtnText}>Stäng</Text>
            </TouchableOpacity>
            {onSave && (
              <TouchableOpacity
                style={[styles.footerBtnSave, (saveDisabled || saving) && { opacity: 0.5 }]}
                onPress={onSave}
                disabled={saveDisabled || saving}
              >
                <Text style={styles.footerBtnSaveText}>
                  {saving ? 'Sparar…' : (saveLabel || 'Spara ändringar')}
                </Text>
              </TouchableOpacity>
            )}
          </View>

          {resizeHandles}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
