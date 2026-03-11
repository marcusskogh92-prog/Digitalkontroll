/**
 * Context navigation panel. Visas till höger om IconRail.
 * Collapsible, slide 180ms ease. Valfritt resizable via leftWidth/setLeftWidth/panResponder.
 * 2026: smal, enhetlig divider + toggle som matchar rail.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { getLeftPanelBackgroundStyle, PANEL_DIVIDER } from '../../constants/backgroundTheme';
import { GLOBAL_SIDE_PANEL } from '../../constants/iconRailTheme';
import { CONTEXT_PANEL_BG, CONTEXT_PANEL_BORDER_COLOR } from './layoutConstants';

const RESIZE_HANDLE_WIDTH = 4;
const COLLAPSE_ZONE_WIDTH = 10;
const TAB_BUTTON_WIDTH = 20;
const TAB_BUTTON_HEIGHT = 36;
const TAB_STICK_OUT = 18;
const DIVIDER_BG = 'rgba(15, 23, 42, 0.06)';
const PILL_BG = '#334155';
const PILL_BG_HOVER = '#475569';
const CHEVRON_COLOR = '#fff';

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { overflow: 'visible' } : {}),
  },
  panel: {
    backgroundColor: Platform.OS === 'web' ? CONTEXT_PANEL_BG : GLOBAL_SIDE_PANEL.bg,
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { borderRightWidth: 1, borderRightColor: CONTEXT_PANEL_BORDER_COLOR } : {}),
  },
  panelContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  dividerStrip: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    backgroundColor: DIVIDER_BG,
    ...(Platform.OS === 'web' ? { overflow: 'visible', zIndex: 10 } : {}),
  },
  dividerStripExpanded: {
    width: RESIZE_HANDLE_WIDTH + COLLAPSE_ZONE_WIDTH,
    minWidth: RESIZE_HANDLE_WIDTH + COLLAPSE_ZONE_WIDTH,
  },
  dividerStripCollapsed: {
    width: COLLAPSE_ZONE_WIDTH,
    minWidth: COLLAPSE_ZONE_WIDTH,
  },
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    minWidth: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' } : {}),
  },
  collapseZone: {
    width: COLLAPSE_ZONE_WIDTH,
    minWidth: COLLAPSE_ZONE_WIDTH,
    justifyContent: 'center',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { overflow: 'visible' } : {}),
  },
  collapseButton: {
    width: TAB_BUTTON_WIDTH,
    height: TAB_BUTTON_HEIGHT,
    borderRadius: 6,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: PILL_BG,
    marginRight: -TAB_STICK_OUT,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', boxShadow: '0 1px 4px rgba(0,0,0,0.15)', zIndex: 11 } : {}),
  },
  collapseButtonHover: {
    backgroundColor: PILL_BG_HOVER,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 6px rgba(0,0,0,0.2)' } : {}),
  },
});

export function GlobalSidePanel({
  children,
  collapsed = false,
  onCollapseChange,
  visible = true,
  showCollapseButton = true,
  leftWidth: leftWidthProp,
  setLeftWidth,
  panResponder,
  resizeHandlers,
}) {
  const effectiveExpandedWidth = leftWidthProp ?? GLOBAL_SIDE_PANEL.width;
  const widthAnim = useRef(new Animated.Value(effectiveExpandedWidth)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const targetWidth = visible && !collapsed ? effectiveExpandedWidth : 0;
    const targetOpacity = visible && !collapsed ? 1 : 0;

    Animated.parallel([
      Animated.timing(widthAnim, {
        toValue: targetWidth,
        duration: GLOBAL_SIDE_PANEL.slideDurationMs,
        easing: Easing.ease,
        useNativeDriver: false,
      }),
      Animated.timing(opacityAnim, {
        toValue: targetOpacity,
        duration: GLOBAL_SIDE_PANEL.slideDurationMs,
        easing: Easing.ease,
        useNativeDriver: true,
      }),
    ]).start();
  }, [collapsed, visible, effectiveExpandedWidth, widthAnim, opacityAnim]);

  const showResize = !collapsed && visible && setLeftWidth && (resizeHandlers || panResponder);
  const [collapseHover, setCollapseHover] = useState(false);

  const collapseButtonStyle = [
    styles.collapseButton,
    Platform.OS === 'web' && collapseHover && styles.collapseButtonHover,
  ];

  return (
    <View style={styles.wrapper}>
      <Animated.View
        style={[
          styles.panel,
          {
            width: widthAnim,
            minWidth: widthAnim,
          },
          Platform.OS === 'web' && getLeftPanelBackgroundStyle(),
        ]}
      >
        <Animated.View style={[styles.panelContent, { opacity: opacityAnim }]}>
          {children}
        </Animated.View>
      </Animated.View>
      {(showResize || (visible && showCollapseButton)) && (
        <View style={[styles.dividerStrip, collapsed ? styles.dividerStripCollapsed : styles.dividerStripExpanded]}>
          {showResize && (
            <View style={styles.resizeHandle} {...(resizeHandlers || panResponder?.panHandlers || {})} />
          )}
          {visible && showCollapseButton && (
            <View style={styles.collapseZone}>
              {Platform.OS !== 'web' && (
                <TouchableOpacity
                  onPress={() => onCollapseChange?.(!collapsed)}
                  style={collapseButtonStyle}
                  accessibilityLabel={collapsed ? 'Öppna panel' : 'Stäng panel'}
                >
                <Ionicons
                  name={collapsed ? 'chevron-forward' : 'chevron-back'}
                  size={16}
                  color={CHEVRON_COLOR}
                />
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );
}
