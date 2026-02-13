/**
 * Global bakgrundssystem 2026 – enhetlig blueprint-bakgrund för webbappen.
 * Samma bild överallt; toning med CSS linear-gradient (overlay).
 */

import { Image, Platform } from 'react-native';

// En enda källa för bakgrundsbilden (Global Background System 2026)
const BACKGROUND_IMAGE_SOURCE = require('../assets/bakgrund-webb.png');

/** På web: URI för bakgrundsbilden (lazy så den finns när komponenter renderas). */
function getBackgroundImageUri() {
  if (Platform.OS !== 'web') return null;
  try {
    const resolved = Image.resolveAssetSource && Image.resolveAssetSource(BACKGROUND_IMAGE_SOURCE);
    return (resolved && resolved.uri) ? resolved.uri : null;
  } catch (_e) {
    return null;
  }
}

/** Cached URI (anropas vid första användning på web). */
let _cachedUri = null;
function getBackgroundImageUriCached() {
  if (Platform.OS !== 'web') return null;
  if (_cachedUri !== null) return _cachedUri;
  _cachedUri = getBackgroundImageUri();
  return _cachedUri;
}

/**
 * Body-bakgrund för web (anropas från App.js).
 * Sätter document.body.style så att hela sidan har bakgrundsbilden.
 */
export function applyGlobalBodyBackground() {
  if (Platform.OS !== 'web' || typeof document === 'undefined' || !document.body) return;
  const uri = getBackgroundImageUriCached();
  if (!uri) return;
  document.body.style.backgroundImage = `url(${uri})`;
  document.body.style.backgroundSize = 'cover';
  document.body.style.backgroundPosition = 'center';
  document.body.style.backgroundAttachment = 'fixed';
}

/** Rail: solid färg (ingen bild). */
export const RAIL_BG = '#0f1b2d';

/** Left panel: ljus grå/vit på web (rail förblir mörk). */
export function getLeftPanelBackgroundStyle() {
  if (Platform.OS === 'web') {
    return { backgroundColor: '#f6f8fb' };
  }
  return {};
}

/** Right panel: ljus grå/vit på web (rail förblir mörk). */
export function getRightPanelBackgroundStyle() {
  if (Platform.OS === 'web') {
    return { backgroundColor: '#f6f8fb' };
  }
  return {};
}

/** Mittenpanel: ljus topp → ännu ljusare botten. */
export function getMainPanelBackgroundStyle() {
  const uri = getBackgroundImageUriCached();
  if (!uri) return { backgroundColor: 'rgba(255, 255, 255, 0.91)' };
  return {
    backgroundColor: 'transparent',
    backgroundImage: `linear-gradient(to bottom, rgba(255, 255, 255, 0.85) 0%, rgba(255, 255, 255, 0.92) 50%, rgba(255, 255, 255, 0.96) 100%), url(${uri})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/** Login-sida: mörkare gradient + bild. */
export function getLoginPageBackgroundStyle() {
  const uri = getBackgroundImageUriCached();
  if (!uri) return { backgroundColor: 'rgba(15, 27, 45, 0.72)' };
  return {
    backgroundColor: 'transparent',
    backgroundImage: `linear-gradient(to bottom, rgba(15, 27, 45, 0.85), rgba(15, 27, 45, 0.60)), url(${uri})`,
    backgroundSize: 'cover',
    backgroundPosition: 'center',
  };
}

/** Divider: samma mörka färg som railen (left ↔ main, main ↔ right). */
export const PANEL_DIVIDER = { borderRightWidth: 1, borderRightColor: RAIL_BG };
export const PANEL_DIVIDER_LEFT = { borderLeftWidth: 1, borderLeftColor: RAIL_BG };

/** Login-kort: ljus, blur. */
export const LOGIN_CARD_STYLE = {
  backgroundColor: 'rgba(255, 255, 255, 0.95)',
  borderRadius: 12,
  ...(Platform.OS === 'web' ? { backdropFilter: 'blur(6px)' } : {}),
};

export { BACKGROUND_IMAGE_SOURCE };
