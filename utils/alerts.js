/**
 * Alert utilities - Platform-aware alerts
 */

import { Platform, Alert } from 'react-native';
import { isWeb } from './platform';

/**
 * Show alert - uses window.alert on web, Alert.alert on native
 */
export function showAlert(title, message, buttons) {
  // Prefer window.alert on web so buttonless alerts work in browsers
  if (isWeb && typeof window !== 'undefined' && typeof window.alert === 'function') {
    const msg = (typeof message === 'string') ? message : (message && typeof message === 'object' ? JSON.stringify(message, null, 2) : String(message));
    try { 
      window.alert(String(title || '') + '\n\n' + msg); 
    } catch(_e) { /* ignore */ }
    return;
  }
  try {
    if (buttons) Alert.alert(title || '', message || '', buttons);
    else Alert.alert(title || '', message || '');
  } catch (_e) { /* ignore */ }
}
