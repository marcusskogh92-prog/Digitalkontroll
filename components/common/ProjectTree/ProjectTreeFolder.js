/**
 * ProjectTreeFolder - Renders a folder (main or sub) in the tree
 */

import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_FOLDER_COLOR, getFolderColor } from './folderColors';

const PRIMARY_BLUE = '#1976D2';
const HOVER_BG = 'rgba(25, 118, 210, 0.10)';

export default function ProjectTreeFolder({
  folder,
  level = 0, // 0 = main, 1 = sub
  isExpanded,
  onToggle,
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
  staticHeader = false,
}) {
  const canToggle = typeof onToggle === 'function' && !staticHeader;
  const canPress = canToggle || typeof onPress === 'function';
  const isMainFolder = level === 0;
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
  const renderFolderIcon = () => {
    if (hideFolderIcon) return null;

    const iconColor = isHovered && canPress ? PRIMARY_BLUE : folderColor.color;

    const iconElement = (
      <Ionicons
        name={isExpanded ? 'folder-open' : 'folder'}
        size={iconSize}
        color={iconColor}
      />
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
          {iconElement}
        </Animated.View>
      );
    }

    return (
      <View style={{ marginRight: 8, minWidth: iconSize }}>
        {iconElement}
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
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={chevronSize}
          color={isHovered && canPress ? PRIMARY_BLUE : '#666'}
        />
      </View>
    );
  };

  const [isHovered, setIsHovered] = useState(false);

  const handleToggle = () => {
    if (!canToggle) return;
    onToggle(folder.id);
  };

  const handlePress = () => {
    if (canToggle) {
      handleToggle();
      return;
    }
    if (typeof onPress === 'function') {
      onPress(folder);
    }
  };

  // Main folder has different styling
  if (isMainFolder) {
    const folderRowStyle = {
      display: 'flex',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: compact ? 5 : 8,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: canPress && isHovered ? HOVER_BG : 'transparent',
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
            onClick={canPress ? handlePress : undefined}
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
                color: isHovered && canPress ? PRIMARY_BLUE : '#222',
              }}
            >
              {folder.name}
            </Text>
          </div>
          
          {isExpanded && showAddButton && onAddChild && (
            <TouchableOpacity
              style={{ marginLeft: 8, padding: 4 }}
              onPress={onAddChild}
            >
              <Ionicons name="add-circle" size={22} color="#1976D2" />
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
            {renderFolderIcon()}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: '#222',
              }}
            >
              {folder.name}
            </Text>
          </TouchableOpacity>
        ) : (
          <View style={[folderRowStyle, { flex: 1 }]}>
            {renderChevron()}
            {renderFolderIcon()}
            <Text
              numberOfLines={compact ? 1 : undefined}
              ellipsizeMode="tail"
              style={{
                fontSize,
                fontWeight: displayFontWeight,
                color: '#222',
              }}
            >
              {folder.name}
            </Text>
          </View>
        )}
        
        {isExpanded && showAddButton && onAddChild && (
          <TouchableOpacity
            style={{ marginLeft: 8, padding: 4 }}
            onPress={onAddChild}
          >
            <Ionicons name="add-circle" size={22} color="#1976D2" />
          </TouchableOpacity>
        )}
      </View>
    );
  }

  // Sub folder styling
  const subFolderRowStyle = {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: compact ? 4 : 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: canPress && isHovered ? HOVER_BG : 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: canPress ? 'pointer' : 'default',
      transition: 'background-color 0.15s ease',
    } : {}),
  };

  if (Platform.OS === 'web') {
    return (
      <div
        style={{ marginTop: 1, marginBottom: 1, marginLeft: paddingLeft }}
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
            onClick={canPress ? handlePress : undefined}
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
                color: isHovered && canPress ? PRIMARY_BLUE : '#222',
              }}
            >
              {folder.name}
            </Text>
          </div>
          
          {isExpanded && showAddButton && onAddChild && (
            <TouchableOpacity
              style={{ padding: 4 }}
              onPress={onAddChild}
            >
              <Ionicons name="add-circle" size={22} color="#1976D2" />
            </TouchableOpacity>
          )}
        </div>
      </div>
    );
  }

  return (
    <View style={{ backgroundColor: '#fff', borderRadius: 12, marginVertical: 1, marginLeft: paddingLeft, padding: 5 }}>
      <TouchableOpacity
        style={subFolderRowStyle}
        onPress={handlePress}
        onLongPress={canToggle ? onLongPress : undefined}
        delayLongPress={2000}
        activeOpacity={0.7}
      >
        {renderChevron()}
        {/* Folder icon with color */}
        {renderFolderIcon()}
        <Text
          numberOfLines={compact ? 1 : undefined}
          ellipsizeMode="tail"
          style={{
            fontSize,
            fontWeight,
            color: '#222',
          }}
        >
          {folder.name}
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
