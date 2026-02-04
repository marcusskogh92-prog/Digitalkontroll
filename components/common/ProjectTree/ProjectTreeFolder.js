/**
 * ProjectTreeFolder - Renders a folder (main or sub) in the tree
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { LEFT_NAV } from '../../../constants/leftNavTheme';
import { stripNumberPrefixForDisplay } from '../../../utils/labelUtils';
import { AnimatedChevron } from '../leftNavMicroAnimations';
import SidebarItem from '../SidebarItem';
import { DEFAULT_FOLDER_COLOR, getFolderColor } from './folderColors';

export default function ProjectTreeFolder({
  folder,
  level = 0, // 0 = main, 1 = sub
  isExpanded,
  onToggle,
  onCollapseSubtree,
  onPress,
  onLongPress,
  onPressIn,
  onPressOut,
  onAddChild,
  showAddButton = false,
  spinAnim = null,
  compact = false,
  hideFolderIcon = false,
  reserveChevronSpace = false,
  forceChevron = false,
  staticHeader = false,
  isActive = false,
  // When rendered in the project-mode left panel, rows should be edge-to-edge.
  // That means: no rounded row backgrounds, no margin-based indentation.
  edgeToEdge = false,
}) {
  const [chevronSpinTick, setChevronSpinTick] = useState(0);
  const clickTimeoutRef = useRef(null);
  const lastClickTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (clickTimeoutRef.current) {
        clearTimeout(clickTimeoutRef.current);
        clickTimeoutRef.current = null;
      }
    };
  }, []);

  const childNodes = Array.isArray(folder?.children) ? folder.children : [];
  const hasKnownContainerChildren = childNodes.some((c) => {
    const t = c?.type;
    return t === 'folder' || t === 'sub' || t === 'main' || t === 'project' || t === 'projectFunction' || !t;
  });
  const hasPotentialChildren = folder?.childrenLoaded === false || folder?.loading === true;
  const canToggle = typeof onToggle === 'function' && !staticHeader && (forceChevron || hasKnownContainerChildren || hasPotentialChildren);
  const canPress = canToggle || typeof onPress === 'function';
  const isMainFolder = level === 0;
  const displayName = stripNumberPrefixForDisplay(folder?.name);
  const paddingLeft = isMainFolder ? 0 : 12 * Math.max(1, level);
  const fontSize = compact ? (isMainFolder ? 14 : 13) : (isMainFolder ? 16 : 15);
  const fontWeight = isMainFolder ? 'bold' : '600';
  const hasFilesDeep = folder?.hasFilesDeep === true;
  const displayFontWeight = staticHeader ? fontWeight : (hasFilesDeep ? fontWeight : '400');
  const iconSize = compact ? (isMainFolder ? 22 : 20) : (isMainFolder ? 28 : 24); // Larger for better visibility
  const chevronSize = compact ? (isMainFolder ? 18 : 16) : (isMainFolder ? 20 : 18);
  
  // Get folder color - use folder.iconColor or default
  const folderColor = folder?.iconColor 
    ? getFolderColor(folder.iconColor)
    : DEFAULT_FOLDER_COLOR;

  // Render folder icon with spin animation if provided
  const renderFolderIcon = ({ hovered = false, active = false } = {}) => {
    if (hideFolderIcon) return null;

    const iconColor = (isActive || active || ((hovered || isHovered) && canPress)) ? LEFT_NAV.accent : folderColor.color;

    const iconElement = (
      <Ionicons
        name={isExpanded ? 'folder-open' : 'folder'}
        size={iconSize}
        color={iconColor}
      />
    );

    const wrappedIcon = canToggle ? (
      <Pressable
        onPress={(e) => {
          try {
            e?.stopPropagation?.();
          } catch (_e) {}
          handleStructureToggle();
        }}
        style={({ hovered, pressed }) => [
          Platform.OS === 'web' ? { cursor: 'pointer' } : null,
          (hovered || pressed) ? { opacity: 0.9 } : null,
        ]}
        accessibilityRole="button"
        accessibilityLabel={isExpanded ? 'Kollapsa' : 'Expandera'}
      >
        {iconElement}
      </Pressable>
    ) : (
      iconElement
    );

    if (spinAnim) {
      return (
        <Animated.View
          style={{
            marginRight: 8,
            minWidth: iconSize,
            transform: [{
              rotate: spinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg']
              })
            }]
          }}
        >
          {wrappedIcon}
        </Animated.View>
      );
    }

    return (
      <View style={{ marginRight: 8, minWidth: iconSize }}>
        {wrappedIcon}
      </View>
    );
  };

  // Render chevron when folder icons are hidden (used e.g. in project view)
  const renderChevron = () => {
    if (!hideFolderIcon) return null;

    if (!canToggle) {
      if (!reserveChevronSpace) return null;
      return (
        <View
          style={{
            marginRight: 6,
            minWidth: chevronSize,
            alignItems: 'center',
          }}
        />
      );
    }

    return (
      <View
        style={{
          marginRight: 6,
          minWidth: chevronSize,
          alignItems: 'center',
        }}
      >
        <AnimatedChevron
          expanded={Boolean(isExpanded)}
          spinTrigger={chevronSpinTick}
          size={chevronSize}
          color={(isActive || (isHovered && canPress)) ? LEFT_NAV.accent : LEFT_NAV.iconMuted}
        />
      </View>
    );
  };

  const [isHovered, setIsHovered] = useState(false);

  const handleStructureToggle = () => {
    if (!canToggle) return;
    setChevronSpinTick((t) => t + 1);

    // Expand when collapsed; collapse subtree when expanded.
    if (isExpanded) {
      if (typeof onCollapseSubtree === 'function') {
        onCollapseSubtree(folder.id);
      } else {
        onToggle(folder.id);
      }
      return;
    }

    onToggle(folder.id);
  };

  const DOUBLE_CLICK_MS = 350;

  const handlePress = () => {
    const now = Date.now();
    const timeSinceLastClick = now - lastClickTimeRef.current;

    // Dubbelklick när mappen är öppen: stäng (kollapsa).
    if (isExpanded && canToggle && timeSinceLastClick < DOUBLE_CLICK_MS) {
      lastClickTimeRef.current = 0;
      handleStructureToggle();
      return;
    }
    lastClickTimeRef.current = now;

    // Enkelklick: expandera om kollapsad, sedan navigera.
    if (!isExpanded && canToggle) {
      handleStructureToggle();
    }
    if (typeof onPress === 'function') {
      onPress(folder);
    }
  };

  const canDoubleClickStructure = Platform.OS === 'web' && canToggle;

  const scheduleClick = (fn) => {
    if (!canDoubleClickStructure) {
      fn();
      return;
    }
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    clickTimeoutRef.current = setTimeout(() => {
      clickTimeoutRef.current = null;
      fn();
    }, 200);
  };

  const handleDoubleClick = (e) => {
    if (!canDoubleClickStructure) return;
    try {
      e?.preventDefault?.();
      e?.stopPropagation?.();
    } catch (_e) {}
    if (clickTimeoutRef.current) {
      clearTimeout(clickTimeoutRef.current);
      clickTimeoutRef.current = null;
    }
    // Dubbelklick ska bara stänga (kollapsa) – inte växla igen, annars öppnas mappen direkt efter stängning.
    if (isExpanded && canToggle) {
      handleStructureToggle();
    }
  };

  if (edgeToEdge) {
    const indent = isMainFolder ? 0 : 12 * Math.max(1, level);
    const labelWeight = staticHeader
      ? (isMainFolder ? '700' : '600')
      : hasFilesDeep
        ? (isMainFolder ? '700' : '600')
        : '500';

    return (
      <SidebarItem
        fullWidth
        squareCorners={Boolean(Platform.OS === 'web')}
        indentMode="padding"
        indent={indent}
        active={Boolean(isActive)}
        disabled={!canPress}
        onPress={canPress ? handlePress : undefined}
        onDoubleClick={canDoubleClickStructure ? handleDoubleClick : undefined}
        onLongPress={canToggle ? onLongPress : undefined}
        left={(state) => (
          <>
            {hideFolderIcon ? (
              reserveChevronSpace || canToggle ? (
                <View
                  style={{
                    marginRight: 6,
                    minWidth: chevronSize,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <AnimatedChevron
                    expanded={Boolean(isExpanded)}
                    spinTrigger={chevronSpinTick}
                    size={chevronSize}
                    color={(state.active || state.hovered) ? LEFT_NAV.accent : LEFT_NAV.iconMuted}
                  />
                </View>
              ) : null
            ) : null}
            {!hideFolderIcon ? renderFolderIcon(state) : null}
          </>
        )}
        label={displayName}
        labelWeight={labelWeight}
        right={() =>
          isExpanded && showAddButton && onAddChild ? (
            <Pressable
              onPress={(e) => {
                try {
                  e?.stopPropagation?.();
                } catch (_e) {}
                onAddChild?.();
              }}
              style={({ hovered, pressed }) => [
                { padding: 4, marginLeft: 8 },
                Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                (hovered || pressed) ? { opacity: 0.85 } : null,
              ]}
              accessibilityRole="button"
              accessibilityLabel="Lägg till"
            >
              <Ionicons name="add-circle" size={22} color={LEFT_NAV.accent} />
            </Pressable>
          ) : null
        }
      />
    );
  }

  // Main folder has different styling
  if (isMainFolder) {
    const leftPadding = edgeToEdge ? 12 : 8;
    const folderRowStyle = {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: compact ? 5 : 8,
      paddingHorizontal: leftPadding,
      borderRadius: edgeToEdge ? 0 : 8,
      width: edgeToEdge ? '100%' : undefined,
      backgroundColor: isActive ? LEFT_NAV.activeBg : (canPress && isHovered ? LEFT_NAV.hoverBg : 'transparent'),
      ...(Platform.OS === 'web' ? {
        cursor: canPress ? 'pointer' : 'default',
        transition: 'background-color 0.15s ease',
      } : {}),
    };

    if (Platform.OS === 'web') {
      return (
        <div
          style={folderRowStyle}
          onMouseEnter={() => {
            if (canPress) setIsHovered(true);
          }}
          onMouseLeave={() => {
            if (canPress) setIsHovered(false);
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              flex: 1,
              cursor: canPress ? 'pointer' : 'default',
            }}
            onClick={canPress ? () => scheduleClick(handlePress) : undefined}
            onDoubleClick={canDoubleClickStructure ? handleDoubleClick : undefined}
            onContextMenu={
              canToggle
                ? (e) => {
                    try {
                      e.preventDefault();
                    } catch (_) {}
                    if (onLongPress) onLongPress();
                  }
                : undefined
            }
          >
            {renderChevron()}
            {/* Folder icon with color */}
            {renderFolderIcon({ hovered: isHovered, active: isActive })}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: (isActive || (isHovered && canPress)) ? LEFT_NAV.accent : LEFT_NAV.textDefault,
              }}
            >
              {displayName}
            </Text>
          </div>
          
          {isExpanded && showAddButton && onAddChild && (
            <TouchableOpacity
              style={{ marginLeft: 8, padding: 4 }}
              onPress={onAddChild}
            >
              <Ionicons name="add-circle" size={22} color={LEFT_NAV.accent} />
            </TouchableOpacity>
          )}
        </div>
      );
    }

    return (
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 0, borderBottomWidth: isExpanded ? 1 : 0, borderColor: '#e0e0e0' }}>
        {canPress ? (
          <TouchableOpacity
            style={[folderRowStyle, { flex: 1 }]}
            onPress={handlePress}
            onLongPress={canToggle ? onLongPress : undefined}
            onPressIn={onPressIn}
            onPressOut={onPressOut}
            delayLongPress={2000}
            activeOpacity={0.7}
          >
            {renderChevron()}
            {renderFolderIcon({ hovered: isHovered, active: isActive })}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: LEFT_NAV.textDefault,
              }}
            >
              {displayName}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[folderRowStyle, { flex: 1 }]}>
            {renderChevron()}
            {renderFolderIcon({ hovered: isHovered, active: isActive })}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: LEFT_NAV.textDefault,
              }}
            >
              {displayName}
            </Text>
          </View>
        )}
        
        {isExpanded && showAddButton && onAddChild && (
          <TouchableOpacity
            style={{ marginLeft: 8, padding: 4 }}
            onPress={onAddChild}
          >
            <Ionicons name="add-circle" size={22} color={LEFT_NAV.accent} />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Sub folder styling
  const baseRowPadding = edgeToEdge ? 12 : 8;
  const effectivePaddingLeft = edgeToEdge ? (baseRowPadding + paddingLeft) : undefined;

  const subFolderRowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: compact ? 4 : 6,
    paddingHorizontal: baseRowPadding,
    ...(edgeToEdge ? { paddingLeft: effectivePaddingLeft } : {}),
    borderRadius: edgeToEdge ? 0 : 8,
    width: edgeToEdge ? '100%' : undefined,
    backgroundColor: isActive ? LEFT_NAV.activeBg : (canPress && isHovered ? LEFT_NAV.hoverBg : 'transparent'),
    ...(Platform.OS === 'web' ? {
      cursor: canPress ? 'pointer' : 'default',
      transition: 'background-color 0.15s ease',
    } : {}),
  };

  if (Platform.OS === 'web') {
    return (
      <div
        style={{ marginTop: 1, marginBottom: 1, marginLeft: edgeToEdge ? 0 : paddingLeft }}
        onMouseEnter={() => {
          if (canPress) setIsHovered(true);
        }}
        onMouseLeave={() => {
          if (canPress) setIsHovered(false);
        }}
      >
        <div style={subFolderRowStyle}>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              alignItems: 'center',
              flex: 1,
              cursor: canPress ? 'pointer' : 'default',
            }}
            onClick={canPress ? () => scheduleClick(handlePress) : undefined}
            onDoubleClick={canDoubleClickStructure ? handleDoubleClick : undefined}
            onContextMenu={
              canToggle
                ? (e) => {
                    try {
                      e.preventDefault();
                    } catch (_) {}
                    if (onLongPress) onLongPress();
                  }
                : undefined
            }
          >
            {renderChevron()}
            {/* Folder icon with color */}
            {renderFolderIcon()}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: (isActive || (isHovered && canPress)) ? LEFT_NAV.accent : LEFT_NAV.textDefault,
              }}
            >
              {displayName}
            </Text>
          </div>
          
          {isExpanded && showAddButton && onAddChild && (
            <TouchableOpacity
              style={{ padding: 4 }}
              onPress={onAddChild}
            >
              <Ionicons name="add-circle" size={22} color={LEFT_NAV.accent} />
            </TouchableOpacity>
          )}
        </div>
      </div>
    );
  }

  return (
    <View
      style={
        edgeToEdge
          ? { backgroundColor: 'transparent', borderRadius: 0, marginVertical: 1, marginLeft: 0, padding: 0 }
          : { backgroundColor: '#fff', borderRadius: 12, marginVertical: 1, marginLeft: paddingLeft, padding: 5 }
      }
    >
      <TouchableOpacity
        style={subFolderRowStyle}
        onPress={handlePress}
        onLongPress={canToggle ? onLongPress : undefined}
        delayLongPress={2000}
        activeOpacity={0.7}
      >
        {renderChevron()}
        {/* Folder icon with color */}
        {renderFolderIcon({ hovered: isHovered, active: isActive })}
        <Text
          numberOfLines={compact ? 1 : undefined}
          ellipsizeMode="tail"
          style={{
            fontSize,
            fontWeight,
            color: '#222',
          }}
        >
          {displayName}
        </Text>
        
        {isExpanded && showAddButton && onAddChild && (
          <TouchableOpacity
            style={{ padding: 4 }}
            onPress={onAddChild}
          >
            <Ionicons name="add-circle" size={22} color="#1976D2" />
          </TouchableOpacity>
        )}
      </TouchableOpacity>
    </View>
  );
}
