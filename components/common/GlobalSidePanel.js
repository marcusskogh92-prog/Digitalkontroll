/**
 * Context navigation panel. Visas till höger om IconRail.
 * Collapsible, slide 180ms ease. Valfritt resizable via leftWidth/setLeftWidth/panResponder.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, TouchableOpacity, View } from 'react-native';
import { getLeftPanelBackgroundStyle, PANEL_DIVIDER } from '../../constants/backgroundTheme';
import { GLOBAL_SIDE_PANEL } from '../../constants/iconRailTheme';

const RESIZE_HANDLE_WIDTH = 6;

const styles = StyleSheet.create({
  wrapper: {
    flexDirection: 'row',
    alignItems: 'stretch',
    alignSelf: 'stretch',
    minHeight: 0,
    overflow: 'hidden',
  },
  panel: {
    backgroundColor: GLOBAL_SIDE_PANEL.bg,
    minHeight: 0,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { ...PANEL_DIVIDER } : {}),
  },
  panelContent: {
    flex: 1,
    flexDirection: 'column',
    alignItems: 'stretch',
    minWidth: 0,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  resizeHandle: {
    width: RESIZE_HANDLE_WIDTH,
    minWidth: RESIZE_HANDLE_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'col-resize' } : {}),
  },
  collapseButton: {
    width: 24,
    alignSelf: 'stretch',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: GLOBAL_SIDE_PANEL.borderColor,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
});

export function GlobalSidePanel({
  children,
  collapsed = false,
  onCollapseChange,
  visible = true,
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
      {showResize && (
        <View style={styles.resizeHandle} {...(resizeHandlers || panResponder?.panHandlers || {})} />
      )}
      {visible && (
        <TouchableOpacity
          onPress={() => onCollapseChange?.(!collapsed)}
          style={styles.collapseButton}
          accessibilityLabel={collapsed ? 'Öppna panel' : 'Stäng panel'}
        >
          <Ionicons
            name={collapsed ? 'chevron-forward' : 'chevron-back'}
            size={18}
            color="#64748b"
          />
        </TouchableOpacity>
      )}
    </View>
  );
}
