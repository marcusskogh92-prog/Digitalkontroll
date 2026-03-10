import React from 'react';
import {
  Animated,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { getProjectPhase } from '../../features/projects/constants';
import { LEFT_NAV } from '../../constants/leftNavTheme';

const MAX_VISIBLE_RESULTS = 8;
const DROPDOWN_MAX_WIDTH = 480;
const DROPDOWN_BORDER_RADIUS = 10;
const DROPDOWN_SHADOW = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 4 },
  shadowOpacity: 0.12,
  shadowRadius: 12,
  elevation: 8,
};

const styles = StyleSheet.create({
  overlay: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99998,
    backgroundColor: 'rgba(0,0,0,0)',
  },
  dropdownWrapper: {
    position: 'absolute',
    alignItems: 'flex-start',
    marginTop: 0,
    paddingTop: 0,
  },
  dropdownWrapperWeb: {
    position: 'fixed',
  },
  dropdown: {
    alignSelf: 'flex-start',
    backgroundColor: '#fff',
    borderRadius: DROPDOWN_BORDER_RADIUS,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    ...DROPDOWN_SHADOW,
    marginTop: 0,
    paddingTop: 0,
  },
  scroll: {
    maxHeight: 320,
  },
  scrollContent: {
    paddingTop: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: LEFT_NAV.rowPaddingVertical,
    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
    minHeight: LEFT_NAV.rowMinHeight,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#f1f5f9',
  },
  rowHover: {
    backgroundColor: LEFT_NAV.hoverBg,
  },
  rowSelected: {
    backgroundColor: LEFT_NAV.hoverBg,
  },
  phaseDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: LEFT_NAV.rowIconGap,
    borderWidth: 1,
    borderColor: LEFT_NAV.phaseDotBorder,
  },
  rowLabel: {
    fontSize: LEFT_NAV.rowFontSize,
    color: LEFT_NAV.textDefault,
    fontWeight: '400',
    flex: 1,
    minWidth: 0,
  },
  emptyText: {
    color: LEFT_NAV.textMuted,
    fontSize: LEFT_NAV.rowFontSize,
    textAlign: 'center',
    paddingVertical: 14,
    paddingHorizontal: LEFT_NAV.rowPaddingHorizontal,
  },
});

export function HeaderSearchDropdown({
  headerProjectQuery,
  headerSearchOpen,
  headerSearchBottom,
  headerSearchLeft,
  headerSearchWidth,
  headerProjectMatches,
  hoveredProjectId,
  setHoveredProjectId,
  selectedIndex,
  setSelectedIndex,
  dropdownAnim,
  navigation,
  requestProjectSwitch,
  createPortal,
  portalRootId,
}) {
  const inputWidth = Number(headerSearchWidth) || 200;
  const displayMatches = Array.isArray(headerProjectMatches)
    ? headerProjectMatches.slice(0, MAX_VISIBLE_RESULTS)
    : [];

  const closeDropdown = React.useCallback(() => {
    try {
      navigation?.setParams?.({
        headerSearchOpen: false,
        headerSearchKeepConnected: false,
      });
    } catch (_e) {}
  }, [navigation]);

  const selectProject = React.useCallback(
    (proj) => {
      if (!proj) return;
      closeDropdown();
      requestProjectSwitch(proj, { selectedAction: null });
    },
    [closeDropdown, requestProjectSwitch]
  );

  if (!headerProjectQuery || !headerSearchOpen) {
    return null;
  }

  const dropdownPosition = {
    top: headerSearchBottom ?? 0,
    left: headerSearchLeft ?? 0,
    minWidth: Math.min(inputWidth, DROPDOWN_MAX_WIDTH),
    maxWidth: DROPDOWN_MAX_WIDTH,
  };

  const innerDropdown = (
    <View
      style={[
        styles.dropdownWrapper,
        Platform.OS === 'web' && styles.dropdownWrapperWeb,
        {
          top: dropdownPosition.top,
          left: dropdownPosition.left,
          zIndex: 99999,
          pointerEvents: 'auto',
        },
      ]}
    >
      <Animated.View
        style={[
          styles.dropdown,
          {
            minWidth: dropdownPosition.minWidth,
            maxWidth: dropdownPosition.maxWidth,
            opacity: Platform.OS === 'web' ? dropdownAnim : 1,
            transform:
              Platform.OS === 'web' && dropdownAnim
                ? [
                    {
                      scale: dropdownAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.995, 1],
                      }),
                    },
                  ]
                : undefined,
          },
        ]}
      >
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          nestedScrollEnabled
        >
          {displayMatches.map((proj, index) => {
            const isHovered = hoveredProjectId === proj.id;
            const isSelected = selectedIndex === index;
            const highlight = isHovered || isSelected;

            return (
              <TouchableOpacity
                key={proj.id}
                onMouseEnter={Platform.OS === 'web' ? () => setHoveredProjectId(proj.id) : undefined}
                onMouseLeave={Platform.OS === 'web' ? () => setHoveredProjectId(null) : undefined}
                style={[styles.row, highlight && (Platform.OS === 'web' ? styles.rowHover : styles.rowSelected)]}
                activeOpacity={0.8}
                onPress={() => selectProject(proj)}
              >
                <View
                  style={[
                    styles.phaseDot,
                    { backgroundColor: getProjectPhase(proj)?.color || LEFT_NAV.phaseDotFallback },
                  ]}
                />
                <Text style={styles.rowLabel} numberOfLines={1} ellipsizeMode="tail">
                  {proj.id} - {proj.name}
                </Text>
              </TouchableOpacity>
            );
          })}

          {displayMatches.length === 0 ? (
            <Text style={styles.emptyText}>Inga projekt hittades.</Text>
          ) : null}
        </ScrollView>
      </Animated.View>
    </View>
  );

  const PortalContent = (
    <>
      <View
        onStartShouldSetResponder={() => true}
        onResponderRelease={closeDropdown}
        style={styles.overlay}
      />
      {innerDropdown}
    </>
  );

  if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
    try {
      let portalRoot = document.getElementById(portalRootId);
      if (!portalRoot) {
        portalRoot = document.createElement('div');
        portalRoot.id = portalRootId;
        portalRoot.style.position = 'relative';
        document.body.appendChild(portalRoot);
      }
      return createPortal(PortalContent, portalRoot);
    } catch (_e) {
      return PortalContent;
    }
  }

  return innerDropdown;
}
