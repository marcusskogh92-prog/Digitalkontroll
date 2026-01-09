import React from 'react';
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native';

// Cross-platform safe context menu.
// Designed primarily for web usage (right-click) but won't break native.
export default function ContextMenu({ visible, x, y, items = [], onSelect, onClose }) {
  if (!visible) return null;

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
            left: x,
            top: y,
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
