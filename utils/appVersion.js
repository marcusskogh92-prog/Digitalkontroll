/**
 * App version utilities
 */

import { Alert } from 'react-native';

let appVersion = '1.0.0';

try {
  const pkg = require('../package.json');
  if (pkg && pkg.version) appVersion = String(pkg.version);
} catch (e) {
  try { 
    Alert.alert('Fel', 'Kunde inte läsa package.json: ' + (e?.message || String(e))); 
  } catch(_e) {}
}

export function getAppVersion() {
  return appVersion;
}
