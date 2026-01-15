import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';

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
            borderRadius: 8,
            borderWidth: 1,
            borderColor: '#e0e0e0',
            paddingVertical: 6,
            minWidth: 190,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.12,
            shadowRadius: 10,
            elevation: 10,
          }}
        >
          {items.map((item, idx) => {
            const disabled = !!item.disabled;
            return (
              <TouchableOpacity
                key={item.key || idx}
                disabled={disabled}
                activeOpacity={0.8}
                onPress={() => {
                  if (disabled) return;
                  onSelect && onSelect(item);
                  onClose && onClose();
                }}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                  borderColor: '#f3f3f3',
                  opacity: disabled ? 0.5 : 1,
                  backgroundColor: item.danger ? '#fff0f0' : '#fff',
                }}
              >
                <View style={{ width: 22, marginRight: 10, alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon ? (
                    (React.isValidElement(item.icon) ? item.icon : <Text style={{ fontSize: 18 }}>{String(item.icon)}</Text>)
                  ) : null}
                </View>
                <Text style={{ fontSize: 15, color: '#222' }}>{item.label}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}
