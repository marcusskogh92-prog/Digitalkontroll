import React from 'react';
import { Animated, Easing, Platform } from 'react-native';

const MAX_SEARCH_RESULTS = 8;

/**
 * Header-projektsök (dropdown mellan loggorna / i left panel) extraherad från HomeScreen.
 *
 * Ansvarar för:
 * - härledd query + öppet/stängt-läge från route.params
 * - matchning av projekt (searchableProjects eller hierarchy)
 * - layoutparametrar (width/bottom/left)
 * - Escape/scroll/resize-stängning (web)
 * - Piltangenter + Enter för keyboard-navigering
 * - hover/animering av dropdown
 */
export function useHomeHeaderProjectSearch({ route, navigation, hierarchy, searchableProjects, onSelectProject }) {
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
    const max = MAX_SEARCH_RESULTS;

    // Sök i företagets projekt (samma som vänsterpanelen – alla siter företaget har tillgång till).
    const list = Array.isArray(searchableProjects) ? searchableProjects : [];
    if (list.length > 0) {
      for (const p of list) {
        if (out.length >= max) break;
        const num = String(p?.projectNumber ?? p?.number ?? '').trim();
        const name = String(p?.projectName ?? p?.name ?? '').trim();
        const full = String(p?.fullName ?? '').trim();
        const match =
          num.toLowerCase().includes(q) ||
          name.toLowerCase().includes(q) ||
          full.toLowerCase().includes(q);
        if (!match) continue;
        const path = String(p?.rootFolderPath ?? p?.path ?? '').trim();
        out.push({
          id: num || p?.id,
          name: name || full || num || p?.id,
          projectNumber: num,
          projectName: name,
          fullName: full,
          sharePointSiteId: p?.sharePointSiteId,
          rootFolderPath: path,
          path,
          phase: p?.phase ?? 'kalkylskede',
          ...p,
        });
      }
      return out;
    }

    // Fallback: sök i hierarchy (en site).
    for (const main of hierarchy || []) {
      for (const sub of main?.children || []) {
        for (const child of sub?.children || []) {
          if (child?.type !== 'project') continue;
          const id = String(child?.id || '');
          const name = String(child?.name || '');
          if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
            out.push(child);
            if (out.length >= max) return out;
          }
        }
      }
    }

    return out;
  }, [headerProjectQuery, hierarchy, searchableProjects]);

  const [hoveredProjectId, setHoveredProjectId] = React.useState(null);
  const [selectedIndex, setSelectedIndex] = React.useState(0);
  const dropdownAnim = React.useRef(new Animated.Value(0)).current;

  // Reset selected index when query or matches change
  React.useEffect(() => {
    setSelectedIndex(0);
  }, [headerProjectQuery, headerProjectMatches.length]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(dropdownAnim, {
      toValue: headerProjectQuery ? 1 : 0,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: Platform.OS === 'web' ? false : true,
    }).start();
  }, [headerProjectQuery, dropdownAnim]);

  // Keyboard: Escape stänger, piltangenter navigerar, Enter väljer första/valt resultat
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keyHandler = (e) => {
      try {
        if (e.key === 'Escape' || e.key === 'Esc') {
          navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: true });
          return;
        }
        if (!headerSearchOpen || !headerProjectMatches.length) return;

        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setSelectedIndex((i) => Math.min(i + 1, headerProjectMatches.length - 1));
          return;
        }
        if (e.key === 'ArrowUp') {
          e.preventDefault();
          setSelectedIndex((i) => Math.max(i - 1, 0));
          return;
        }
        if (e.key === 'Enter') {
          e.preventDefault();
          const proj = headerProjectMatches[selectedIndex];
          if (proj && typeof onSelectProject === 'function') {
            onSelectProject(proj);
          }
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
  }, [navigation, headerSearchOpen, headerProjectMatches, selectedIndex, onSelectProject]);

  return {
    headerProjectQuery,
    headerSearchOpen,
    headerSearchWidth,
    headerSearchBottom,
    headerSearchLeft,
    headerProjectMatches,
    hoveredProjectId,
    setHoveredProjectId,
    selectedIndex,
    setSelectedIndex,
    dropdownAnim,
  };
}
