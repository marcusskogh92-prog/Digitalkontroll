/**
 * Icon-based navigation rail (2026 SaaS). Full height, mörk neutral.
 * Order: Hem, Notiser, divider, Kalkylskede, Produktion, Avslutat, Eftermarknad, divider,
 * SharePoint, Register, Administration, divider. Bottom: Superadmin (om synlig), divider, profil, Inställningar.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ICON_RAIL } from '../../constants/iconRailTheme';

const STORAGE_KEY = ICON_RAIL.storageKey || 'dk_rail_expanded';

function readRailExpandedFromStorage() {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return true;
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    if (v === 'false') return false;
    if (v === 'true') return true;
  } catch (_e) {}
  return true;
}

function writeRailExpandedToStorage(expanded) {
  if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, expanded ? 'true' : 'false');
  } catch (_e) {}
}

const RAIL_DIVIDER = { type: 'divider' };

const RAIL_NAV_ITEMS = [
  { id: 'dashboard', icon: 'home-outline', label: 'Dashboard' },
  RAIL_DIVIDER,
  { id: 'kalkylskede', icon: 'calculator-outline', label: 'Kalkylskede' },
  { id: 'produktion', icon: 'hammer-outline', label: 'Produktion' },
  { id: 'avslut', icon: 'checkmark-done-outline', label: 'Avslutat' },
  { id: 'eftermarknad', icon: 'construct-outline', label: 'Eftermarknad' },
  RAIL_DIVIDER,
  { id: 'sharepoint', icon: 'cloud-outline', label: 'SharePoint' },
  { id: 'register', icon: 'grid-outline', label: 'Register' },
  { id: 'administration', icon: 'business-outline', label: 'Administration' },
  RAIL_DIVIDER,
];

const SUPERADMIN_RAIL_ITEM = { id: 'superadmin', icon: 'person-outline', label: 'Superadmin' };
const SUPERADMIN_SHIELD_GREEN = '#22c55e';

const styles = StyleSheet.create({
  rail: {
    width: ICON_RAIL.width,
    backgroundColor: ICON_RAIL.bg,
    flexDirection: 'column',
    alignItems: 'center',
    alignSelf: 'stretch',
    paddingVertical: ICON_RAIL.itemPaddingVertical * 2,
    flexShrink: 0,
  },
  logoWrap: {
    width: ICON_RAIL.width - ICON_RAIL.itemPaddingHorizontal * 2,
    height: 36,
    borderRadius: ICON_RAIL.activeBgRadius,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: ICON_RAIL.itemPaddingVertical * 2,
  },
  itemList: {
    flex: 1,
    alignItems: 'center',
    gap: ICON_RAIL.itemPaddingVertical,
    justifyContent: 'flex-start',
  },
  itemTouch: {
    paddingVertical: ICON_RAIL.itemPaddingVertical,
    paddingHorizontal: ICON_RAIL.itemPaddingHorizontal,
    borderRadius: ICON_RAIL.activeBgRadius,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: ICON_RAIL.width - ICON_RAIL.itemPaddingHorizontal * 2,
    flexDirection: 'row',
    position: 'relative',
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: `background-color ${ICON_RAIL.hoverTransitionMs}ms ease` } : {}),
  },
  itemTouchHover: {
    backgroundColor: ICON_RAIL.hoverBg,
  },
  itemTouchActive: {
    backgroundColor: ICON_RAIL.activeBg,
    ...(Platform.OS === 'web' ? { transition: `transform ${ICON_RAIL.activeTransitionMs}ms ease, background-color ${ICON_RAIL.activeTransitionMs}ms ease` } : {}),
  },
  activeBar: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: ICON_RAIL.activeLeftIndicatorWidth,
    backgroundColor: ICON_RAIL.activeLeftIndicatorColor,
    borderTopRightRadius: 2,
    borderBottomRightRadius: 2,
  },
  bottom: {
    alignItems: 'center',
    paddingTop: ICON_RAIL.itemPaddingVertical * 2,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    gap: ICON_RAIL.itemPaddingVertical,
  },
  userTouch: {
    paddingVertical: ICON_RAIL.itemPaddingVertical,
    paddingHorizontal: ICON_RAIL.itemPaddingHorizontal,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  userAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsTouch: {
    position: 'relative',
    paddingVertical: ICON_RAIL.itemPaddingVertical,
    paddingHorizontal: ICON_RAIL.itemPaddingHorizontal,
    borderRadius: ICON_RAIL.activeBgRadius,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: ICON_RAIL.width - ICON_RAIL.itemPaddingHorizontal * 2,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  /** Fast bredd för ikonkolumn så att all text startar på samma linje. Avatar är 36px. */
  iconColumn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  superadminIconWrap: {
    position: 'relative',
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
  },
  superadminShieldBadge: {
    position: 'absolute',
    bottom: -2,
    right: -4,
  },
  railDivider: {
    width: ICON_RAIL.width - ICON_RAIL.itemPaddingHorizontal * 4,
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: ICON_RAIL.itemPaddingVertical,
  },
  itemLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginLeft: 10,
    flex: 1,
    minWidth: 0,
  },
  toggleWrap: {
    width: '100%',
    alignItems: 'flex-end',
  },
  toggleTouch: {
    paddingVertical: ICON_RAIL.itemPaddingVertical,
    paddingHorizontal: ICON_RAIL.itemPaddingHorizontal,
    borderRadius: ICON_RAIL.activeBgRadius,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
});

export function IconRail({
  activeId = 'dashboard',
  onSelect,
  notificationsBadgeCount = 0,
  userDisplayName,
  userPhotoURL,
  onUserPress,
  showSuperadmin = false,
  /** Fas-ids som ännu inte är aktiva – visas dimmade med rött kryss, klick visar info-modal. */
  inactivePhaseIds = [],
}) {
  const [hoveredId, setHoveredId] = useState(null);
  const [railExpanded, setRailExpanded] = useState(true);
  const userAvatarRef = useRef(null);
  const scaleAnims = useRef({}).current;
  const isInactive = (id) => Array.isArray(inactivePhaseIds) && inactivePhaseIds.includes(id);

  useEffect(() => {
    setRailExpanded(readRailExpandedFromStorage());
  }, []);

  const toggleRail = () => {
    const next = !railExpanded;
    setRailExpanded(next);
    writeRailExpandedToStorage(next);
  };

  const expandedWidth = ICON_RAIL.widthExpanded ?? 200;

  const railNavItems = React.useMemo(
    () => (showSuperadmin ? [...RAIL_NAV_ITEMS, SUPERADMIN_RAIL_ITEM] : RAIL_NAV_ITEMS),
    [showSuperadmin]
  );

  const getScaleAnim = (id) => {
    if (!scaleAnims[id]) scaleAnims[id] = new Animated.Value(1);
    return scaleAnims[id];
  };

  const handlePressIn = (id) => {
    if (Platform.OS === 'web') return;
    Animated.spring(getScaleAnim(id), { toValue: 0.92, useNativeDriver: true, speed: 24 }).start();
  };

  const handlePressOut = (id) => {
    if (Platform.OS === 'web') return;
    Animated.spring(getScaleAnim(id), { toValue: 1, useNativeDriver: true, speed: 24 }).start();
  };

  const handleUserPress = () => {
    if (typeof onUserPress !== 'function') return;
    const node = userAvatarRef.current;
    if (node && typeof node.measureInWindow === 'function') {
      node.measureInWindow((x, y, w, h) => {
        onUserPress({ x, y, width: w || 0, height: h || 0 });
      });
    } else {
      onUserPress({ x: 0, y: 0, width: 0, height: 0 });
    }
  };

  return (
    <View
      style={[
        styles.rail,
        {
          width: railExpanded ? expandedWidth : ICON_RAIL.width,
          alignItems: railExpanded ? 'stretch' : 'center',
        },
      ]}
    >
      <View style={[styles.itemList, railExpanded && { alignItems: 'stretch' }]}>
        {railNavItems.map((item, index) => {
          if (item.type === 'divider') {
            return (
              <View
                key={`div-${index}`}
                style={[styles.railDivider, railExpanded && { width: undefined, alignSelf: 'stretch', marginHorizontal: ICON_RAIL.itemPaddingHorizontal }]}
              />
            );
          }
          const isActive = activeId === item.id;
          const isHovered = Platform.OS === 'web' && hoveredId === item.id;
          const inactive = isInactive(item.id);
          const iconColor = inactive ? 'rgba(255,255,255,0.45)' : (isActive ? ICON_RAIL.iconColorActive : ICON_RAIL.iconColor);

          const labelColor = inactive ? 'rgba(255,255,255,0.45)' : (isActive ? ICON_RAIL.iconColorActive : 'rgba(255, 255, 255, 0.9)');
          return (
            <TouchableOpacity
              key={item.id}
              activeOpacity={1}
              onPress={() => onSelect?.(item.id)}
              onPressIn={() => handlePressIn(item.id)}
              onPressOut={() => handlePressOut(item.id)}
              onMouseEnter={Platform.OS === 'web' ? () => setHoveredId(item.id) : undefined}
              onMouseLeave={Platform.OS === 'web' ? () => setHoveredId(null) : undefined}
              style={[
                styles.itemTouch,
                railExpanded && { minWidth: undefined, width: '100%', justifyContent: 'flex-start', paddingLeft: 12 },
                isHovered && !inactive && styles.itemTouchHover,
                isActive && !inactive && styles.itemTouchActive,
                inactive && { opacity: 0.7 },
              ]}
              accessibilityLabel={inactive ? `${item.label} (under uppbyggnad)` : item.label}
              accessibilityRole="button"
            >
              {isActive && !inactive ? <View style={styles.activeBar} /> : null}
              <Animated.View
                style={[
                  { flexDirection: 'row', alignItems: 'center', flex: railExpanded ? 1 : undefined, minWidth: 0 },
                  Platform.OS === 'web' ? undefined : { transform: [{ scale: getScaleAnim(item.id) }] },
                  inactive && { opacity: 0.65 },
                ]}
              >
                <View style={[railExpanded ? styles.iconColumn : { position: 'relative' }]}>
                  {item.id === 'superadmin' ? (
                    <View style={styles.superadminIconWrap}>
                      <View style={{ position: 'relative', width: ICON_RAIL.iconSize, height: ICON_RAIL.iconSize, alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons
                          name="person-outline"
                          size={ICON_RAIL.iconSize}
                          color={iconColor}
                        />
                        <View style={styles.superadminShieldBadge}>
                          <Ionicons name="shield-checkmark" size={14} color={SUPERADMIN_SHIELD_GREEN} />
                        </View>
                      </View>
                    </View>
                  ) : (
                    <Ionicons
                      name={item.icon}
                      size={ICON_RAIL.iconSize}
                      color={iconColor}
                    />
                  )}
                  {inactive ? (
                    <View style={{ position: 'absolute', top: -2, right: -2, width: 14, height: 14, borderRadius: 7, backgroundColor: '#dc2626', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="close" size={10} color="#fff" />
                    </View>
                  ) : null}
                </View>
                {railExpanded ? (
                  <Text numberOfLines={1} style={[styles.itemLabel, { color: labelColor }]}>
                    {item.label}
                  </Text>
                ) : null}
              </Animated.View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.bottom, railExpanded && { alignItems: 'stretch' }]}>
        {typeof onUserPress === 'function' ? (
          <TouchableOpacity
            ref={userAvatarRef}
            onPress={handleUserPress}
            style={[styles.userTouch, railExpanded && { flexDirection: 'row', width: '100%', justifyContent: 'flex-start', paddingLeft: 12 }]}
            accessibilityLabel={userDisplayName || 'Användarmeny'}
            accessibilityRole="button"
            {...(Platform.OS === 'web' && userDisplayName
              ? { title: userDisplayName }
              : {})}
          >
            <View style={styles.userAvatar}>
              {userPhotoURL ? (
                <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155' }} />
              ) : (
                <Ionicons name="person" size={ICON_RAIL.iconSize} color={ICON_RAIL.iconColor} />
              )}
            </View>
            {railExpanded ? (
              <Text numberOfLines={1} style={[styles.itemLabel, { marginLeft: 10 }]}>
                {userDisplayName || 'Profil'}
              </Text>
            ) : null}
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => onSelect?.('inställningar')}
          style={[
            styles.settingsTouch,
            railExpanded && { flexDirection: 'row', width: '100%', justifyContent: 'flex-start', paddingLeft: 12, minWidth: undefined },
            activeId === 'inställningar' && styles.itemTouchActive,
          ]}
          accessibilityLabel="Inställningar"
          accessibilityRole="button"
        >
          {activeId === 'inställningar' ? <View style={styles.activeBar} /> : null}
          {railExpanded ? (
            <View style={styles.iconColumn}>
              <Ionicons
                name="settings-outline"
                size={ICON_RAIL.iconSize}
                color={activeId === 'inställningar' ? ICON_RAIL.iconColorActive : ICON_RAIL.iconColor}
              />
            </View>
          ) : (
            <Ionicons
              name="settings-outline"
              size={ICON_RAIL.iconSize}
              color={activeId === 'inställningar' ? ICON_RAIL.iconColorActive : ICON_RAIL.iconColor}
            />
          )}
          {railExpanded ? (
            <Text numberOfLines={1} style={[styles.itemLabel, { color: activeId === 'inställningar' ? ICON_RAIL.iconColorActive : 'rgba(255, 255, 255, 0.9)' }]}>
              Inställningar
            </Text>
          ) : null}
        </TouchableOpacity>
        {railExpanded ? (
          <View style={styles.toggleWrap}>
            <TouchableOpacity
              activeOpacity={1}
              onPress={toggleRail}
              style={styles.toggleTouch}
              accessibilityLabel="Minimera menyn"
              accessibilityRole="button"
            >
              <Ionicons
                name="chevron-back"
                size={ICON_RAIL.iconSize}
                color={ICON_RAIL.iconColor}
              />
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity
            activeOpacity={1}
            onPress={toggleRail}
            style={styles.toggleTouch}
            accessibilityLabel="Expandera menyn"
            accessibilityRole="button"
          >
            <Ionicons
              name="chevron-forward"
              size={ICON_RAIL.iconSize}
              color={ICON_RAIL.iconColor}
            />
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}
