/**
 * ModalBase – återanvändbar modal enligt MODAL_DESIGN_2026.
 * Stram SaaS 2026: radius 8, subtil shadow, ljus header, diskret stäng-knapp.
 * Stöd för drag (headerProps) och resize (resizeHandles) från useDraggableResizableModal.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Modal, Platform, Pressable, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: D.overlayBg,
    ...(Platform.OS === 'web' ? { backdropFilter: `blur(${D.overlayBlur}px)` } : {}),
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: D.radius,
    overflow: 'hidden',
    flexDirection: 'column',
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow } : D.shadowNative),
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: D.header.paddingVertical,
    paddingHorizontal: D.header.paddingHorizontal,
    borderBottomWidth: D.header.borderBottomWidth,
    borderBottomColor: D.header.borderBottomColor,
    backgroundColor: D.header.backgroundColor,
  },
  headerNeutral: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: D.headerNeutral.paddingVertical,
    paddingHorizontal: D.headerNeutral.paddingHorizontal,
    minHeight: D.headerNeutral.minHeight,
    maxHeight: D.headerNeutral.maxHeight,
    borderBottomWidth: D.headerNeutral.borderBottomWidth,
    borderBottomColor: D.headerNeutral.borderBottomColor,
    backgroundColor: D.headerNeutral.backgroundColor,
  },
  /** Kompakt banner som Företagsinställningar – 28px höjd, titel 12px */
  headerNeutralCompact: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: D.headerNeutralCompact.paddingVertical,
    paddingHorizontal: D.headerNeutralCompact.paddingHorizontal,
    minHeight: D.headerNeutralCompact.minHeight,
    maxHeight: D.headerNeutralCompact.maxHeight,
    borderBottomWidth: D.headerNeutral.borderBottomWidth,
    borderBottomColor: D.headerNeutral.borderBottomColor,
    backgroundColor: D.headerNeutral.backgroundColor,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  headerLeftCompact: { flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 },
  title: { fontSize: D.titleFontSize, fontWeight: D.titleFontWeight, color: D.titleColor },
  subtitle: { fontSize: D.subtitleFontSize, color: D.subtitleColor, marginTop: 2 },
  titleNeutral: { fontSize: D.headerNeutralTitleFontSize, fontWeight: D.headerNeutralTitleFontWeight, lineHeight: D.headerNeutralTitleLineHeight, color: D.headerNeutralTextColor, marginVertical: 0 },
  subtitleNeutral: { fontSize: D.headerNeutralSubtitleFontSize, lineHeight: D.headerNeutralSubtitleLineHeight, color: D.headerNeutralTextColor, opacity: D.headerNeutralSubtitleOpacity, marginTop: 2, marginVertical: 0 },
  titleNeutralCompact: { fontSize: D.headerNeutralCompactTitleFontSize, fontWeight: D.headerNeutralCompactTitleFontWeight, lineHeight: D.headerNeutralCompactTitleLineHeight, color: D.headerNeutralTextColor, marginVertical: 0 },
  subtitleNeutralCompact: { fontSize: D.headerNeutralCompactTitleFontSize, lineHeight: D.headerNeutralCompactTitleLineHeight, color: D.headerNeutralTextColor, fontWeight: '400', opacity: 0.9, marginVertical: 0 },
  titleLineNeutral: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 6, flexWrap: 'nowrap' },
  separatorNeutral: { fontSize: D.headerNeutralSubtitleFontSize, lineHeight: D.headerNeutralSubtitleLineHeight, color: D.headerNeutralTextColor, opacity: D.headerNeutralSubtitleOpacity, marginVertical: 0 },
  separatorNeutralCompact: { fontSize: D.headerNeutralCompactTitleFontSize, lineHeight: D.headerNeutralCompactTitleLineHeight, color: D.headerNeutralTextColor, opacity: 0.9, marginVertical: 0 },
  closeBtn: {
    padding: D.closeBtn.padding,
    borderRadius: D.closeBtn.borderRadius,
    backgroundColor: D.closeBtn.backgroundColor,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: D.closeBtn.cursor } : {}),
  },
  content: {
    flex: 1,
    minHeight: 0,
    padding: D.contentPadding,
  },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    paddingVertical: D.footer.paddingVertical,
    paddingHorizontal: D.footer.paddingHorizontal,
    borderTopWidth: D.footer.borderTopWidth,
    borderTopColor: D.footer.borderTopColor,
    backgroundColor: D.footer.backgroundColor,
  },
});

/**
 * @param {boolean} visible
 * @param {Function} onClose
 * @param {string} title
 * @param {string} [subtitle]
 * @param {React.ReactNode} [titleIcon] - optional icon element
 * @param {React.ReactNode} children - modal body
 * @param {React.ReactNode} [footer] - optional footer (e.g. Stäng-knapp)
 * @param {Object} [boxStyle] - from useDraggableResizableModal
 * @param {Object} [overlayStyle] - from useDraggableResizableModal
 * @param {Object} [headerProps] - { onMouseDown, style } for drag
 * @param {React.ReactNode} [resizeHandles]
 * @param {Object} [contentStyle] - override content container (e.g. { padding: 0 } for full-bleed table)
 * @param {'light'|'neutral'|'neutralCompact'} [headerVariant] - 'neutral' = mörk banner 38px; 'neutralCompact' = som Företagsinställningar 28px, titel 12px
 */
export default function ModalBase({
  visible,
  onClose,
  title,
  subtitle,
  titleIcon,
  children,
  footer,
  boxStyle = {},
  overlayStyle = {},
  headerProps = {},
  resizeHandles,
  contentStyle,
  headerVariant = 'light',
}) {
  const isNeutralHeader = headerVariant === 'neutral' || headerVariant === 'neutralCompact';
  const isCompact = headerVariant === 'neutralCompact';
  const headerStyle = isCompact ? styles.headerNeutralCompact : (isNeutralHeader ? styles.headerNeutral : styles.header);
  const [closeHover, setCloseHover] = useState(false);
  const closeBtnStyle = [
    styles.closeBtn,
    isNeutralHeader && closeHover && { backgroundColor: D.headerNeutralCloseBtnHover },
  ];
  const closeIconSize = isCompact ? D.headerNeutralCompactCloseIconPx : D.closeIconSize;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[styles.box, boxStyle]} onPress={(e) => e.stopPropagation()}>
          <View
            style={[headerStyle, headerProps.style]}
            {...(Platform.OS === 'web' && headerProps.onMouseDown ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={isCompact ? styles.headerLeftCompact : styles.headerLeft}>
              {titleIcon != null ? <View style={{ marginRight: isCompact ? 6 : 8 }}>{titleIcon}</View> : null}
              {isNeutralHeader ? (
                <View style={styles.titleLineNeutral}>
                  <Text style={isCompact ? styles.titleNeutralCompact : styles.titleNeutral} numberOfLines={1} ellipsizeMode="tail">
                    {title}
                  </Text>
                  {subtitle != null && subtitle !== '' ? (
                    <>
                      <Text style={isCompact ? styles.separatorNeutralCompact : styles.separatorNeutral}>—</Text>
                      <Text style={[isCompact ? styles.subtitleNeutralCompact : styles.subtitleNeutral, { marginTop: 0, flex: 1, minWidth: 0 }]} numberOfLines={1} ellipsizeMode="tail">
                        {subtitle}
                      </Text>
                    </>
                  ) : null}
                </View>
              ) : (
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.title} numberOfLines={1} ellipsizeMode="tail">
                    {title}
                  </Text>
                  {subtitle != null && subtitle !== '' ? (
                    <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
              )}
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={closeBtnStyle}
              accessibilityLabel="Stäng"
              onMouseEnter={Platform.OS === 'web' ? () => setCloseHover(true) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setCloseHover(false) : undefined}
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons
                name="close"
                size={closeIconSize}
                color={isNeutralHeader ? D.headerNeutralCloseIconColor : D.closeIconColor}
              />
            </TouchableOpacity>
          </View>

          <View style={[styles.content, contentStyle]}>{children}</View>

          {footer != null ? <View style={styles.footer}>{footer}</View> : null}

          {resizeHandles}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
