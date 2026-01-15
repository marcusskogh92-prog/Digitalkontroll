import React from 'react';
import { Platform, Text, View } from 'react-native';

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

const useHomeBreadcrumbSegments = (enabled) => {
  const [segments, setSegments] = React.useState(null);

  React.useEffect(() => {
    if (!enabled) return;
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    try {
      const cached = window.__dkBreadcrumbHomeSegments;
      if (Array.isArray(cached) && cached.length > 0) setSegments(cached);
    } catch (_e) {}

    const onUpdate = (event) => {
      try {
        const detail = event?.detail || {};
        if (detail.scope !== 'home') return;
        const segs = Array.isArray(detail.segments) ? detail.segments : [];
        setSegments(segs);
      } catch (_e) {}
    };

    try { window.addEventListener('dkBreadcrumbUpdate', onUpdate); } catch (_e) {}
    return () => {
      try { window.removeEventListener('dkBreadcrumbUpdate', onUpdate); } catch (_e) {}
    };
  }, [enabled]);

  return segments;
};

export default function WebBreadcrumbInline({
  navigation,
  label,
  preferHomeSegments = false,
  maxWidth = 520,
}) {
  const isWeb = Platform.OS === 'web';
  const homeSegments = useHomeBreadcrumbSegments(!!preferHomeSegments);

  if (!isWeb) return null;

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

  const renderSegments = (() => {
    if (preferHomeSegments && Array.isArray(homeSegments) && homeSegments.length > 0) {
      return homeSegments.map((s, idx) => {
        const target = s?.target;
        const kind = String(target?.kind || '').trim();
        const isLast = idx === homeSegments.length - 1;
        const clickable = kind && kind !== 'noop';
        const onPress = clickable
          ? () => dispatchWindowEvent('dkBreadcrumbNavigate', { target })
          : null;
        return { label: s?.label, onPress, isLast };
      });
    }

    const safeLabel = String(label || '').trim();
    return [
      { label: 'Startsida', onPress: goHome, isLast: !safeLabel },
      ...(safeLabel ? [{ label: safeLabel, onPress: null, isLast: true }] : []),
    ];
  })();

  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0, maxWidth }}>
      <Text numberOfLines={1} ellipsizeMode="tail" style={{ fontSize: 13, flexShrink: 1 }}>
        {renderSegments.map((seg, idx) => {
          const text = String(seg?.label || '').trim();
          if (!text) return null;
          const isLast = !!seg?.isLast;
          const onPress = typeof seg?.onPress === 'function' ? seg.onPress : null;
          return (
            <Text key={`${idx}-${text}`}>
              {idx > 0 ? <Text style={sepStyle}> / </Text> : null}
              <Text onPress={onPress || undefined} style={isLast ? currentStyle : linkStyle}>
                {text}
              </Text>
            </Text>
          );
        })}
      </Text>
    </View>
  );
}
