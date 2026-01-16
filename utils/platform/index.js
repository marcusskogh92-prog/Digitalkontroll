/**
 * Platform utilities - Enhetlig API för web/native
 * 
 * Använd dessa istället för Platform.OS === 'web' överallt
 */

import { Platform } from 'react-native';

// Platform checks
export const isWeb = Platform.OS === 'web';
export const isNative = Platform.OS !== 'web';
export const isIOS = Platform.OS === 'ios';
export const isAndroid = Platform.OS === 'android';

/**
 * Platform-specifik komponent wrapper
 * 
 * @example
 * <PlatformComponent
 *   web={(props) => <WebSpecificComponent {...props} />}
 *   native={(props) => <NativeSpecificComponent {...props} />}
 * />
 */
export function PlatformComponent({ web, native, fallback = null, ...props }) {
  if (isWeb && web) {
    const WebComponent = web;
    return typeof WebComponent === 'function' ? <WebComponent {...props} /> : WebComponent;
  }
  if (isNative && native) {
    const NativeComponent = native;
    return typeof NativeComponent === 'function' ? <NativeComponent {...props} /> : NativeComponent;
  }
  return fallback;
}

/**
 * Platform-specifika styles
 * 
 * @example
 * const styles = platformStyles(
 *   { padding: 20 }, // web
 *   { padding: 10 } // native
 * );
 */
export function platformStyles(webStyle, nativeStyle) {
  return isWeb ? webStyle : nativeStyle;
}

/**
 * Platform-specifikt värde
 * 
 * @example
 * const padding = platformValue(20, 10); // 20 för web, 10 för native
 */
export function platformValue(webValue, nativeValue) {
  return isWeb ? webValue : nativeValue;
}

/**
 * Platform-specifik funktion
 * 
 * @example
 * const handleClick = platformFunction(
 *   () => console.log('web click'),
 *   () => console.log('native press')
 * );
 */
export function platformFunction(webFn, nativeFn) {
  return isWeb ? webFn : nativeFn;
}

/**
 * Conditional rendering baserat på platform
 */
export function IfWeb({ children }) {
  return isWeb ? children : null;
}

export function IfNative({ children }) {
  return isNative ? children : null;
}

export function IfIOS({ children }) {
  return isIOS ? children : null;
}

export function IfAndroid({ children }) {
  return isAndroid ? children : null;
}
