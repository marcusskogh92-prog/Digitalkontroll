/**
 * DashboardSurface
 *
 * Internal design rule:
 * - "Dashboard / Översikt" views use a subtle background image + overlay + white cards.
 * - "Arbetsyta" views use a neutral white background.
 *
 * This component renders the shared dashboard background (asset) in a subtle, non-distracting way.
 */

import { ImageBackground, Platform, StyleSheet, View } from 'react-native';

const DEFAULT_BG = require('../../../assets/images/inlogg.webb.png');

export default function DashboardSurface({
  children,
  style,
  contentStyle,
  source = DEFAULT_BG,
  imageOpacity = 0.18,
  overlayColor = 'rgba(255,255,255,0.78)',
  resizeMode = 'cover',
}) {
  return (
    <View style={[styles.root, style]}>
      <ImageBackground
        source={source}
        resizeMode={resizeMode}
        imageStyle={[styles.image, { opacity: imageOpacity }]}
        style={StyleSheet.absoluteFill}
      />

      {/* Keep overlay above image, below content. Never intercept clicks. */}
      <View pointerEvents="none" style={[styles.overlay, { backgroundColor: overlayColor }]} />

      <View style={[styles.content, contentStyle]}>
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    backgroundColor: '#fff',
  },

  image: {
    width: '100%',
    height: '100%',
  },

  overlay: {
    ...StyleSheet.absoluteFillObject,
  },

  content: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,

    // Ensure web layouts don't accidentally scroll at the surface.
    ...(Platform.OS === 'web'
      ? { overflow: 'hidden' }
      : null),
  },
});
