/**
 * usePlatform hook - React hook för platform-checks
 * 
 * @example
 * const { isWeb, isNative, platformStyles } = usePlatform();
 */

import { useMemo } from 'react';
import { Platform } from 'react-native';
import { 
  isWeb as _isWeb, 
  isNative as _isNative,
  platformStyles as _platformStyles,
  platformValue as _platformValue,
  platformFunction as _platformFunction
} from '../utils/platform';

export function usePlatform() {
  return useMemo(() => ({
    isWeb: _isWeb,
    isNative: _isNative,
    isIOS: Platform.OS === 'ios',
    isAndroid: Platform.OS === 'android',
    platform: Platform.OS,
    platformStyles: _platformStyles,
    platformValue: _platformValue,
    platformFunction: _platformFunction,
  }), []);
}
