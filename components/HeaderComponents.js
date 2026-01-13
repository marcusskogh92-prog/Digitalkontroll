import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import React from 'react';
import { Image, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { resolveCompanyLogoUrl } from './firebase';

export function CompanyHeaderLogo({ companyId }) {
  const [logoUrl, setLogoUrl] = React.useState(null);

  React.useEffect(() => {
    let active = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('dk_companyId');
        let cid = String(companyId || '').trim() || String(stored || '').trim();
        // On web also try window.localStorage in case AsyncStorage isn't populated
        try {
          if ((!cid || cid === '') && typeof window !== 'undefined' && window.localStorage) {
            cid = String(window.localStorage.getItem('dk_companyId') || '').trim();
          }
        } catch (_e) {}
        if (!cid) {
          if (active) setLogoUrl(null);
          return;
        }
        const url = await resolveCompanyLogoUrl(cid);
        if (active) setLogoUrl(url || null);
      } catch (_e) {
        if (active) setLogoUrl(null);
      }
    })();
    return () => { active = false; };
  }, [companyId]);

    return (
    logoUrl ? (
      <Image
        source={{ uri: logoUrl }}
        style={{ width: 250, height: 60 }}
        resizeMode="contain"
        accessibilityLabel="Företagslogotyp"
      />
    ) : null
  );
}

export function DigitalKontrollHeaderLogo() {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
      <Image
        source={Platform.OS === 'web'
          ? require('../assets/images/app.icon.webb.png')
          : require('../assets/images/app.icon.png')}
        style={{ width: 40, height: 40, marginRight: 10 }}
        resizeMode="contain"
        accessibilityLabel="DigitalKontroll ikon"
      />
      <Text style={{ fontSize: 20, color: '#111', fontFamily: 'Inter_700Bold' }}>DigitalKontroll</Text>
    </View>
  );
}

export function HomeHeaderSearch({ navigation, route }) {
  const query = String(route?.params?.headerProjectSearchText || '');
  const [isFocused, setIsFocused] = React.useState(false);
  const containerRef = React.useRef(null);
  const [measuredWidth, setMeasuredWidth] = React.useState(null);

  // Determine whether header search dropdown is considered open.
  // Prefer explicit route param when present, otherwise fall back to query presence.
  const headerSearchOpen = React.useMemo(() => {
    if (Object.prototype.hasOwnProperty.call(route?.params || {}, 'headerSearchOpen')) {
      return !!route.params.headerSearchOpen;
    }
    return !!query;
  }, [route?.params?.headerSearchOpen, query]);

  const headerSearchKeepConnected = React.useMemo(() => {
    if (Object.prototype.hasOwnProperty.call(route?.params || {}, 'headerSearchKeepConnected')) {
      return !!route.params.headerSearchKeepConnected;
    }
    return false;
  }, [route?.params?.headerSearchKeepConnected]);

  const setHeaderSearchParams = React.useCallback((params) => {
    if (Platform.OS !== 'web') return;
    try { navigation?.setParams?.(params); } catch (_e) {}
  }, [navigation]);

  React.useEffect(() => {
    if (measuredWidth) {
      setHeaderSearchParams({ headerSearchWidth: measuredWidth });
    }
  }, [measuredWidth, setHeaderSearchParams]);

  const measureAbsolute = React.useCallback(() => {
    try {
      const node = containerRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          if (typeof w === 'number' && w > 0) setMeasuredWidth(prev => (prev && Math.abs(prev - w) < 1 ? prev : w));
          const bottomY = (y || 0) + (h || 0) - 1;
          const leftX = (x || 0);
          setHeaderSearchParams({ headerSearchWidth: w, headerSearchBottom: bottomY, headerSearchLeft: leftX, headerSearchTop: y || 0 });
        });
      }
    } catch (_e) {}
  }, [setHeaderSearchParams]);

  React.useEffect(() => {
    if (Platform.OS === 'web') {
      const timer = setTimeout(measureAbsolute, 50);
      return () => clearTimeout(timer);
    }
  }, [measureAbsolute, query]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onResize = () => measureAbsolute();
    try { window.addEventListener('resize', onResize); } catch (_e) {}
    return () => { try { window.removeEventListener('resize', onResize); } catch (_e) {} };
  }, [measureAbsolute]);

  const submitSearch = React.useCallback(() => {
    try {
      const q = String(query || '').trim();
      setHeaderSearchParams({ headerProjectSearchText: q, headerSearchOpen: true });
    } catch (_e) {}
  }, [setHeaderSearchParams, query]);

  return (
    <View
      ref={containerRef}
      onLayout={(e) => {
        const w = e?.nativeEvent?.layout?.width;
        if (typeof w === 'number' && w > 0) {
          if (!measuredWidth || Math.abs(measuredWidth - w) > 1) setMeasuredWidth(w);
        }
        measureAbsolute();
      }}
      style={{ width: '100%', maxWidth: 720, minWidth: 260 }}
    >
      <View
          style={{
            height: 46,
            borderWidth: 1,
            borderColor: (isFocused || headerSearchKeepConnected) ? '#666' : '#e0e0e0',
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
            borderBottomLeftRadius: (headerSearchOpen || headerSearchKeepConnected) ? 0 : 16,
            borderBottomRightRadius: (headerSearchOpen || headerSearchKeepConnected) ? 0 : 16,
            borderBottomWidth: (headerSearchOpen || headerSearchKeepConnected) ? 0 : 1,
            backgroundColor: '#fff',
            paddingHorizontal: 14,
            flexDirection: 'row',
            alignItems: 'center',
          }}
      >
        <TouchableOpacity
          onPress={submitSearch}
          activeOpacity={0.7}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={{ marginRight: 10 }}
          accessibilityLabel="Sök"
        >
          <Ionicons name="search" size={18} color="#666" />
        </TouchableOpacity>

        <TextInput
          value={query}
          onChangeText={(t) => {
            setHeaderSearchParams({ headerProjectSearchText: t, headerSearchOpen: true });
          }}
          placeholder="Sök projekt…"
          placeholderTextColor="#888"
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 15,
            color: '#222',
            paddingVertical: 0,
            fontFamily: 'Inter_400Regular',
            fontWeight: '400',
            ...(Platform.OS === 'web'
              ? { outlineStyle: 'none', outlineWidth: 0 }
              : null),
          }}
          returnKeyType="search"
          onSubmitEditing={submitSearch}
          onFocus={() => {
            setIsFocused(true);
            setHeaderSearchParams({ headerSearchOpen: true, headerSearchKeepConnected: false });
          }}
          onBlur={() => {
            setIsFocused(false);
            setHeaderSearchParams({ headerSearchOpen: false });
          }}
          autoCorrect={false}
          autoCapitalize="none"
        />
      </View>
    </View>
  );
}
