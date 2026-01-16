import React from 'react';
import { Modal, Platform, Pressable, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

// Cross-platform safe context menu.
// Designed primarily for web usage (right-click) but won't break native.
export default function ContextMenu({ visible, x, y, items = [], onSelect, onClose }) {
  if (!visible) return null;

  const safeX = Number.isFinite(Number(x)) ? Number(x) : 20;
  const safeY = Number.isFinite(Number(y)) ? Number(y) : 64;

  // Keep menu within viewport on web (prevents it rendering off-screen near edges).
  // Best-effort sizing; avoids measuring/layout complexity.
  const clampToViewport = () => {
    try {
      if (typeof window === 'undefined') return { left: safeX, top: safeY };
      const vw = Number(window?.innerWidth || 0);
      const vh = Number(window?.innerHeight || 0);
      if (!vw || !vh) return { left: safeX, top: safeY };

      const padding = 12;
      const menuWidth = 190;
      const rowHeight = 40;
      const chrome = 12;
      const menuHeight = Math.max(1, Array.isArray(items) ? items.length : 0) * rowHeight + chrome;

      const left = Math.max(padding, Math.min(safeX, vw - menuWidth - padding));
      const top = Math.max(padding, Math.min(safeY, vh - menuHeight - padding));
      return { left, top };
    } catch {
      return { left: safeX, top: safeY };
    }
  };

  const { left, top } = clampToViewport();

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
          onPress={() => onClose && onClose()}
        />

        <View
          style={{
            position: 'absolute',
            left,
            top,
            backgroundColor: '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#e0e0e0',
            paddingVertical: 8,
            minWidth: 200,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 12,
            elevation: 12,
            ...(Platform.OS === 'web' ? {
              boxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            } : {}),
          }}
        >
          {items.map((item, idx) => {
            const disabled = !!item.disabled;
            const isSeparator = !!item.isSeparator;
            const isSelected = !!item.isSelected;
            
            if (isSeparator) {
              return (
                <View
                  key={item.key || `sep-${idx}`}
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 12,
                    borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                    borderColor: '#f0f0f0',
                  }}
                >
                  {item.label ? (
                    <Text style={{ fontSize: 11, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </Text>
                  ) : (
                    <View style={{ height: 1, backgroundColor: '#e8e8e8', marginVertical: 4 }} />
                  )}
                </View>
              );
            }
            
            const iconColor = item.danger 
              ? '#D32F2F' 
              : (isSelected && item.phaseColor 
                ? item.phaseColor 
                : '#666');
            const textColor = item.danger 
              ? '#D32F2F' 
              : (isSelected && item.phaseColor 
                ? item.phaseColor 
                : '#222');
            
            return (
              <TouchableOpacity
                key={item.key || idx}
                disabled={disabled}
                activeOpacity={0.7}
                onPress={() => {
                  if (disabled) return;
                  onSelect && onSelect(item);
                  if (!item.keepOpen) {
                    onClose && onClose();
                  }
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 14,
                  borderBottomWidth: idx < items.length - 1 && !items[idx + 1]?.isSeparator ? 1 : 0,
                  borderColor: '#f0f0f0',
                  opacity: disabled ? 0.5 : 1,
                  backgroundColor: isSelected 
                    ? (item.phaseColor ? item.phaseColor + '10' : '#e3f2fd')
                    : (item.danger ? '#fff5f5' : '#fff'),
                  ...(Platform.OS === 'web' ? {
                    transition: 'background-color 0.15s ease',
                  } : {}),
                }}
                onMouseEnter={Platform.OS === 'web' ? (e) => {
                  if (!disabled && e?.currentTarget) {
                    if (item.danger) {
                      e.currentTarget.style.backgroundColor = '#ffe5e5';
                    } else if (isSelected && item.phaseColor) {
                      e.currentTarget.style.backgroundColor = item.phaseColor + '15';
                    } else {
                      e.currentTarget.style.backgroundColor = '#f5f5f5';
                    }
                  }
                } : undefined}
                onMouseLeave={Platform.OS === 'web' ? (e) => {
                  if (e?.currentTarget) {
                    if (item.danger) {
                      e.currentTarget.style.backgroundColor = '#fff5f5';
                    } else if (isSelected && item.phaseColor) {
                      e.currentTarget.style.backgroundColor = item.phaseColor + '10';
                    } else {
                      e.currentTarget.style.backgroundColor = '#fff';
                    }
                  }
                } : undefined}
              >
                <View style={{ width: 24, marginRight: 12, alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon ? (
                    React.isValidElement(item.icon) 
                      ? item.icon 
                      : (item.iconName 
                        ? <Ionicons name={item.iconName} size={18} color={iconColor} />
                        : <Text style={{ fontSize: 18 }}>{String(item.icon)}</Text>)
                  ) : null}
                </View>
                <Text style={{ 
                  fontSize: 14, 
                  color: textColor,
                  fontWeight: isSelected ? '600' : '400',
                  flex: 1,
                }}>
                  {item.label}
                </Text>
                {isSelected && (
                  <View style={{ marginLeft: 8 }}>
                    <Ionicons name="checkmark" size={16} color={item.phaseColor || '#1976D2'} />
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
