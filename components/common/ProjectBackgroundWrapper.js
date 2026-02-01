/**
 * ProjectBackgroundWrapper
 *
 * Project-scope background wrapper (NOT global/body).
 *
 * Design rule:
 * - Dashboard / Översikt areas: subtle background image + overlay + framed content.
 * - Work areas: plain white.
 *
 * This wrapper is meant to be applied selectively per view.
 */

import { Platform, StyleSheet, View } from 'react-native';

import DashboardSurface from './Dashboard/DashboardSurface';

export default function ProjectBackgroundWrapper({
  children,
  style,
  surfaceStyle,
  imageOpacity = 0.16,
  overlayColor = 'rgba(255,255,255,0.85)',
  outerPadding = 18,
  frameStyle,
  framePadding = 0,
  enabled = true,
}) {
  if (!enabled) {
    return <View style={[styles.plain, style]}>{children}</View>;
  }

  return (
    <DashboardSurface
      style={[styles.surfaceRoot, surfaceStyle, style]}
      imageOpacity={imageOpacity}
      overlayColor={overlayColor}
    >
      <View style={[styles.outer, { padding: outerPadding }]}>
        <View style={[styles.frame, frameStyle, { padding: framePadding }]}>
          {children}
        </View>
      </View>
    </DashboardSurface>
  );
}

const styles = StyleSheet.create({
  plain: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#fff',
  },

  surfaceRoot: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },

  outer: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
  },

  frame: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,

    // IMPORTANT: the background must remain visible around/between cards.
    // Keep the wrapper transparent; individual cards/panels handle white surfaces.
    backgroundColor: 'transparent',
    borderRadius: 0,
    borderWidth: 0,
    borderColor: 'transparent',

    shadowColor: 'transparent',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,

    ...(Platform.OS === 'web' ? { overflow: 'visible' } : null),
  },
});
