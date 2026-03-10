/**
 * Premium modal för modulen Eftermarknad (under utveckling).
 * Följer samma layout som Företagsinställningar: mörk banner, ljus innehållsyta, footer med Stäng/OK.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ICON_RAIL } from '../../../constants/iconRailTheme';
import { MODAL_THEME } from '../../../constants/modalTheme';

const BORDER_RADIUS = 16;
const PREVIEW_ITEMS = [
  { icon: 'construct-outline', label: 'Service & garantiärenden' },
  { icon: 'alert-circle-outline', label: 'Felanmälan och uppföljning' },
  { icon: 'document-text-outline', label: 'Dokumentation och historik' },
  { icon: 'people-outline', label: 'Kunduppföljning' },
];

export default function EftermarknadModal({ visible, onClose }) {
  const handlePrimary = () => {
    onClose?.();
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e?.stopPropagation?.()}>
          {/* Mörk banner – samma struktur som Företagsinställningar */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="home-outline" size={12} color={ICON_RAIL.iconColorActive} />
                <Ionicons name="construct-outline" size={12} color={ICON_RAIL.iconColorActive} style={styles.titleIconWrench} />
              </View>
              <Text style={styles.title} numberOfLines={1}>Eftermarknad</Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={onClose}
              accessibilityLabel="Stäng"
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons name="close" size={MODAL_THEME.banner.closeIconSize} color={ICON_RAIL.iconColorActive} />
            </TouchableOpacity>
          </View>

          {/* Ljus innehållsyta */}
          <View style={styles.body}>
            <Text style={styles.subtext}>
              Modulen är under utveckling och kommer lanseras under 2026.
            </Text>
            <View style={styles.previewList}>
              {PREVIEW_ITEMS.map((item) => (
                <View key={item.label} style={styles.previewRow}>
                  <Ionicons name={item.icon} size={18} color="#64748b" style={styles.previewIcon} />
                  <Text style={styles.previewLabel}>{item.label}</Text>
                </View>
              ))}
            </View>
          </View>

          {/* Footer – högerställda knappar */}
          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerBtn} onPress={onClose}>
              <Text style={styles.footerBtnSecondaryText}>Stäng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.footerBtn, styles.footerBtnPrimary]}
              onPress={handlePrimary}
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Text style={styles.footerBtnPrimaryText}>OK</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    padding: 24,
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 480,
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: MODAL_THEME.banner.paddingVertical,
    paddingHorizontal: MODAL_THEME.banner.paddingHorizontal,
    backgroundColor: ICON_RAIL.bg,
    borderBottomWidth: 1,
    borderBottomColor: MODAL_THEME.banner.borderBottomColor,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    minWidth: 0,
  },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: MODAL_THEME.banner.iconBgRadius,
    backgroundColor: MODAL_THEME.banner.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 2,
  },
  titleIconWrench: {
    opacity: 0.95,
  },
  title: {
    fontSize: MODAL_THEME.banner.titleFontSize,
    fontWeight: MODAL_THEME.banner.titleFontWeight,
    color: MODAL_THEME.banner.titleColor ?? ICON_RAIL.iconColorActive,
  },
  closeBtn: {
    padding: MODAL_THEME.banner.closeBtnPadding,
  },
  body: {
    paddingVertical: 20,
    paddingHorizontal: 20,
  },
  subtext: {
    fontSize: 14,
    color: MODAL_THEME.body.labelColor,
    lineHeight: 20,
    marginBottom: 20,
  },
  previewList: {
    gap: 12,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewIcon: {
    width: 22,
    textAlign: 'center',
  },
  previewLabel: {
    fontSize: 14,
    color: MODAL_THEME.body.valueColor ?? '#334155',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: MODAL_THEME.footer.borderTopColor,
    backgroundColor: MODAL_THEME.footer.backgroundColor,
  },
  footerBtn: {
    paddingVertical: MODAL_THEME.footer.btnPaddingVertical,
    paddingHorizontal: MODAL_THEME.footer.btnPaddingHorizontal,
    borderRadius: MODAL_THEME.footer.btnBorderRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnPrimary: {
    marginLeft: 8,
    backgroundColor: MODAL_THEME.footer.btnBackground,
    borderColor: MODAL_THEME.footer.btnBorderColor,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnSecondaryText: {
    fontSize: MODAL_THEME.footer.btnFontSize,
    fontWeight: '600',
    color: '#475569',
  },
  footerBtnPrimaryText: {
    fontSize: MODAL_THEME.footer.btnFontSize,
    fontWeight: '600',
    color: MODAL_THEME.footer.btnTextColor,
  },
});
