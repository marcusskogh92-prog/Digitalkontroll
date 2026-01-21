import React from 'react';
import { Animated, Easing, Platform } from 'react-native';

/**
 * Header-projektsök (dropdown mellan loggorna) extraherad från HomeScreen.
 *
 * Ansvarar för:
 * - härledd query + öppet/stängt-läge från route.params
 * - matchning av projekt i hierarkin
 * - layoutparametrar (width/bottom/left)
 * - Escape/scroll/resize-stängning (web)
 * - hover/animering av dropdown
 */
export function useHomeHeaderProjectSearch({ route, navigation, hierarchy }) {
  const headerProjectQuery = String(route?.params?.headerProjectSearchText || '').trim();

  const headerSearchOpen = React.useMemo(() => {
    if (Object.prototype.hasOwnProperty.call(route?.params || {}, 'headerSearchOpen')) {
      return !!route.params.headerSearchOpen;
    }
    return !!headerProjectQuery;
  }, [route?.params, headerProjectQuery]);

  const headerSearchWidth = React.useMemo(() => {
    const w = Number(route?.params?.headerSearchWidth || 0);
    return Number.isFinite(w) && w > 0 ? w : null;
  }, [route?.params]);

  const headerSearchBottom = React.useMemo(() => {
    const b = Number(route?.params?.headerSearchBottom || 0);
    return Number.isFinite(b) && b > 0 ? b : 71;
  }, [route?.params]);

  const headerSearchLeft = React.useMemo(() => {
    const l = Number(route?.params?.headerSearchLeft || 0);
    return Number.isFinite(l) ? l : null;
  }, [route?.params]);

  const headerProjectMatches = React.useMemo(() => {
    if (!headerProjectQuery) return [];
    const q = headerProjectQuery.toLowerCase();
    const out = [];

    for (const main of hierarchy || []) {
      for (const sub of main?.children || []) {
        for (const child of sub?.children || []) {
          if (child?.type !== 'project') continue;
          const id = String(child?.id || '');
          const name = String(child?.name || '');
          if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
            out.push(child);
            if (out.length >= 25) return out;
          }
        }
      }
    }

    return out;
  }, [headerProjectQuery, hierarchy]);

  const [hoveredProjectId, setHoveredProjectId] = React.useState(null);
  const dropdownAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(dropdownAnim, {
      toValue: headerProjectQuery ? 1 : 0,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS === 'web' ? false : true,
    }).start();
  }, [headerProjectQuery, dropdownAnim]);

  // Stäng med Escape, scroll och resize på web
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keyHandler = (e) => {
      try {
        if (e && (e.key === 'Escape' || e.key === 'Esc')) {
          navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: true });
        }
      } catch (_e) {}
    };

    const closeOnScrollOrResize = () => {
      try {
        navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false });
      } catch (_e) {}
    };

    try {
      window.addEventListener('keydown', keyHandler);
      window.addEventListener('scroll', closeOnScrollOrResize, { passive: true });
      window.addEventListener('resize', closeOnScrollOrResize);
    } catch (_e) {}

    return () => {
      try {
        window.removeEventListener('keydown', keyHandler);
        window.removeEventListener('scroll', closeOnScrollOrResize);
        window.removeEventListener('resize', closeOnScrollOrResize);
      } catch (_e) {}
    };
  }, [navigation]);

  return {
    headerProjectQuery,
    headerSearchOpen,
    headerSearchWidth,
    headerSearchBottom,
    headerSearchLeft,
    headerProjectMatches,
    hoveredProjectId,
    setHoveredProjectId,
    dropdownAnim,
  };
}
