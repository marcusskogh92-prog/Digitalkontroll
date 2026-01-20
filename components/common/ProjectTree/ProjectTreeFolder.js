/**
 * ProjectTreeFolder - Renders a folder (main or sub) in the tree
 */

import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Animated, Platform } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getFolderColor, DEFAULT_FOLDER_COLOR } from './folderColors';

export default function ProjectTreeFolder({
  folder,
  level = 0, // 0 = main, 1 = sub
  isExpanded,
  onToggle,
  onLongPress,
  onPressIn,
  onPressOut,
  onAddChild,
  showAddButton = false,
  spinAnim = null,
}) {
  const isMainFolder = level === 0;
  const paddingLeft = isMainFolder ? 0 : 12;
  const fontSize = isMainFolder ? 16 : 15;
  const fontWeight = isMainFolder ? 'bold' : '600';
  const iconSize = isMainFolder ? 28 : 24; // Larger for better visibility
  
  // Get folder color - use folder.iconColor or default
  const folderColor = folder?.iconColor 
    ? getFolderColor(folder.iconColor)
    : DEFAULT_FOLDER_COLOR;

  // Render folder icon with spin animation if provided
  const renderFolderIcon = () => {
    const iconElement = (
      <Ionicons
        name={isExpanded ? 'folder-open' : 'folder'}
        size={iconSize}
        color={folderColor.color}
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

  const [isHovered, setIsHovered] = useState(false);

  // Main folder has different styling
  if (isMainFolder) {
    const folderRowStyle = {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 8,
      paddingHorizontal: 8,
      borderRadius: 8,
      backgroundColor: isHovered ? '#E3F2FD' : 'transparent',
      ...(Platform.OS === 'web' ? {
        cursor: 'pointer',
        transition: 'background-color 0.15s ease',
      } : {}),
    };

    if (Platform.OS === 'web') {
      return (
        <div
          style={folderRowStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, cursor: 'pointer' }}
            onClick={() => onToggle(folder.id)}
            onContextMenu={(e) => {
              try { e.preventDefault(); } catch (_) {}
              if (onLongPress) onLongPress();
            }}
          >
            {/* Folder icon with color - main visual element - ALWAYS VISIBLE with spin animation */}
            {renderFolderIcon()}
            <Text
              style={{
                fontSize,
                fontWeight,
                color: '#222',
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
        <TouchableOpacity
          style={[folderRowStyle, { flex: 1 }]}
          onPress={() => onToggle(folder.id)}
          onLongPress={onLongPress}
          onPressIn={onPressIn}
          onPressOut={onPressOut}
          delayLongPress={2000}
          activeOpacity={0.7}
        >
          {/* Folder icon with color - main visual element - ALWAYS VISIBLE with spin animation */}
          {renderFolderIcon()}
          <Text
            style={{
              fontSize,
              fontWeight,
              color: '#222',
            }}
          >
            {folder.name}
          </Text>
        </TouchableOpacity>
        
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: isHovered ? '#E3F2FD' : 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease',
    } : {}),
  };

  if (Platform.OS === 'web') {
    return (
      <div
        style={{ marginVertical: 1, marginLeft: paddingLeft }}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <div style={subFolderRowStyle}>
          <div
            style={{ flexDirection: 'row', alignItems: 'center', flex: 1, cursor: 'pointer' }}
            onClick={() => onToggle(folder.id)}
            onContextMenu={(e) => {
              try { e.preventDefault(); } catch (_) {}
              if (onLongPress) onLongPress();
            }}
          >
            {/* Folder icon with color - main visual element - ALWAYS VISIBLE with spin animation */}
            {renderFolderIcon()}
            <Text
              style={{
                fontSize,
                fontWeight,
                color: '#222',
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
        onPress={() => onToggle(folder.id)}
        onLongPress={onLongPress}
        delayLongPress={2000}
        activeOpacity={0.7}
      >
        {/* Folder icon with color - main visual element - ALWAYS VISIBLE with spin animation */}
        {renderFolderIcon()}
        <Text
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
