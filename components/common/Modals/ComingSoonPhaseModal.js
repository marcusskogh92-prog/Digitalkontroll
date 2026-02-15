/**
 * Premium modal för inaktiva faser: Eftermarknad, Produktion, Avslutade projekt.
 * Mörk banner, tvåkolumns-layout (text + illustration), Stäng/OK.
 */

import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import { ICON_RAIL } from '../../../constants/iconRailTheme';
import { MODAL_THEME } from '../../../constants/modalTheme';

const BORDER_RADIUS = 12;
const MODAL_MAX_WIDTH = 560;
const ILLUSTRATION_MAX_WIDTH = 160;

const PHASE_CONFIG = {
  eftermarknad: {
    title: 'Eftermarknad',
    headerIcon: 'construct-outline',
    text: 'Modulen lanseras under 2026 och utvecklas i nära dialog med våra kunder.',
    items: [
      { icon: 'construct-outline', label: 'Service & garantiärenden' },
      { icon: 'alert-circle-outline', label: 'Felanmälan och uppföljning' },
      { icon: 'document-text-outline', label: 'Dokumentation och historik' },
      { icon: 'people-outline', label: 'Kunduppföljning' },
    ],
    illustrationIcon: 'construct-outline',
    illustrationBg: 'rgba(30, 58, 138, 0.08)',
    illustrationColor: '#1e3a8a',
  },
  produktion: {
    title: 'Produktion',
    headerIcon: 'hammer-outline',
    text: 'Produktionsmodulen lanseras under 2026 och utvecklas i nära dialog med våra kunder.',
    items: [
      { icon: 'journal-outline', label: 'Dagbok & egenkontroller' },
      { icon: 'list-outline', label: 'ÄTA-hantering' },
      { icon: 'time-outline', label: 'Tidsuppföljning' },
      { icon: 'shield-checkmark-outline', label: 'Arbetsmiljö & dokumentation' },
    ],
    illustrationIcon: 'document-text-outline',
    illustrationBg: 'rgba(30, 64, 175, 0.08)',
    illustrationColor: '#1e40af',
  },
  avslut: {
    title: 'Avslutade projekt',
    headerIcon: 'checkmark-done-outline',
    text: 'Denna modul samlar färdigställda projekt och efterarbete.',
    items: [
      { icon: 'document-text-outline', label: 'Slutdokumentation' },
      { icon: 'chatbubbles-outline', label: 'Erfarenhetsåterföring' },
      { icon: 'calculator-outline', label: 'Ekonomisk sammanställning' },
      { icon: 'archive-outline', label: 'Projektarkiv' },
    ],
    illustrationIcon: 'checkmark-done-circle-outline',
    illustrationBg: 'rgba(22, 101, 52, 0.08)',
    illustrationColor: '#166534',
  },
};

function IllustrationBlock({ phase }) {
  const config = PHASE_CONFIG[phase];
  if (!config) return null;
  return (
    <View style={[styles.illustrationWrap, { backgroundColor: config.illustrationBg }]}>
      <Ionicons name={config.illustrationIcon} size={64} color={config.illustrationColor} />
    </View>
  );
}

export default function ComingSoonPhaseModal({ visible, phase, onClose }) {
  const config = phase ? PHASE_CONFIG[phase] : null;
  const { width: windowWidth } = useWindowDimensions();
  const showIllustration = windowWidth >= 480;

  if (!config) return null;

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
          {/* Mörk banner */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name={config.headerIcon} size={18} color={ICON_RAIL.iconColorActive} />
              </View>
              <Text style={styles.title} numberOfLines={1}>{config.title}</Text>
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

          {/* Tvåkolumns: vänster text, höger illustration */}
          <View style={styles.body}>
            <View style={styles.bodyLeft}>
              <Text style={styles.bodyTitle}>{config.title}</Text>
              <Text style={styles.subtext}>{config.text}</Text>
              <View style={styles.previewList}>
                {config.items.map((item) => (
                  <View key={item.label} style={styles.previewRow}>
                    <Ionicons name={item.icon} size={18} color="#64748b" style={styles.previewIcon} />
                    <Text style={styles.previewLabel}>{item.label}</Text>
                  </View>
                ))}
              </View>
            </View>
            {showIllustration && (
              <View style={styles.bodyRight}>
                <IllustrationBlock phase={phase} />
              </View>
            )}
          </View>

          {/* Footer */}
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
    width: Platform.OS === 'web' ? '92vw' : '92%',
    maxWidth: MODAL_MAX_WIDTH,
    backgroundColor: '#fff',
    borderRadius: BORDER_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(15, 23, 42, 0.08)',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 10,
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
    flexDirection: 'row',
    paddingVertical: 20,
    paddingHorizontal: 20,
    gap: 20,
  },
  bodyLeft: {
    flex: 1,
    minWidth: 0,
  },
  bodyRight: {
    alignItems: 'center',
    justifyContent: 'center',
    width: ILLUSTRATION_MAX_WIDTH,
    flexShrink: 0,
  },
  bodyTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#0f172a',
    marginBottom: 8,
  },
  subtext: {
    fontSize: 14,
    color: MODAL_THEME.body.labelColor,
    lineHeight: 21,
    marginBottom: 18,
  },
  previewList: {
    gap: 10,
  },
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  previewIcon: {
    width: 22,
  },
  previewLabel: {
    fontSize: 14,
    color: MODAL_THEME.body.valueColor ?? '#334155',
    fontWeight: '500',
  },
  illustrationWrap: {
    width: ILLUSTRATION_MAX_WIDTH,
    height: 120,
    borderRadius: BORDER_RADIUS,
    alignItems: 'center',
    justifyContent: 'center',
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
    borderRadius: BORDER_RADIUS,
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
