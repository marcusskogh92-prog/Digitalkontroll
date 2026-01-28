import { Ionicons } from '@expo/vector-icons';
import { Platform, Text, TouchableOpacity, View } from 'react-native';

const linkStyle = { color: '#1976D2', fontWeight: '700' };
const sepStyle = { color: '#9E9E9E', fontWeight: '600' };
const currentStyle = { color: '#222', fontWeight: '700' };

const dispatchWindowEvent = (name, detail) => {
  try {
    if (typeof window === 'undefined') return;
    const evt = (typeof CustomEvent === 'function')
      ? new CustomEvent(name, { detail })
      : (() => {
        const e = document.createEvent('Event');
        e.initEvent(name, true, true);
        e.detail = detail;
        return e;
      })();
    window.dispatchEvent(evt);
  } catch (_e) {}
};

export default function WebBreadcrumbHeader({
  navigation,
  homeLabel = 'Startsida',
  label,
  iconName,
  iconColor = '#1976D2',
  extraLabel,
  onPressLabel,
  maxWidth = 680,
}) {
  if (Platform.OS !== 'web') return null;

  const goHome = () => {
    // If we're inside Home (embedded views), let Home handle it.
    dispatchWindowEvent('dkBreadcrumbNavigate', { target: { kind: 'dashboard' } });

    // If we're on a stack route (admin pages), navigate Home as well.
    try {
      if (navigation?.reset) {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
        return;
      }
    } catch (_e) {}
    try { navigation?.navigate?.('Home'); } catch (_e) {}
  };

  const safeLabel = String(label || '').trim();
  const safeExtra = String(extraLabel || '').trim();
  const hasExtra = !!safeExtra;

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, maxWidth }}>
      <TouchableOpacity onPress={goHome} style={{ paddingVertical: 4, paddingHorizontal: 2 }} accessibilityRole="link">
        <Text numberOfLines={1} style={{ fontSize: 13, ...linkStyle }}>{homeLabel}</Text>
      </TouchableOpacity>

      <Text style={{ fontSize: 13, ...sepStyle }}> / </Text>

      <TouchableOpacity
        onPress={typeof onPressLabel === 'function' ? onPressLabel : undefined}
        disabled={typeof onPressLabel !== 'function'}
        style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, paddingVertical: 4, paddingHorizontal: 2 }}
        accessibilityRole={typeof onPressLabel === 'function' ? 'link' : undefined}
      >
        {iconName ? (
          <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: iconColor, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
            <Ionicons name={iconName} size={12} color="#fff" />
          </View>
        ) : null}
        <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, ...(typeof onPressLabel === 'function' ? linkStyle : currentStyle), flexShrink: 1 }}>
          {safeLabel}
        </Text>
      </TouchableOpacity>

      {hasExtra ? (
        <>
          <Text style={{ fontSize: 13, ...sepStyle }}> / </Text>
          <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, ...currentStyle, flexShrink: 1 }}>
            {safeExtra}
          </Text>
        </>
      ) : null}
    </View>
  );
}
