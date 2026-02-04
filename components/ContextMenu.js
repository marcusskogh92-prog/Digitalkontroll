import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import { Modal, Platform, Pressable, Text, TouchableOpacity, useWindowDimensions, View } from 'react-native';

// Cross-platform safe context menu.
// Designed primarily for web usage (right-click) but won't break native.
export default function ContextMenu({
  visible,
  x,
  y,
  items = [],
  onSelect,
  onClose,
  align = 'left',
  direction = 'down',
  offsetX = 0,
  offsetY = 0,
  compact = false,
  maxWidth,
}) {
  const dims = useWindowDimensions();
  const menuRef = React.useRef(null);
  const [menuSize, setMenuSize] = React.useState({ width: 0, height: 0 });
  const [pos, setPos] = React.useState({ left: 20, top: 64 });

  const safeX = Number.isFinite(Number(x)) ? Number(x) : 20;
  const safeY = Number.isFinite(Number(y)) ? Number(y) : 64;

  const clamp = React.useCallback((nextLeft, nextTop) => {
    const vw = Number((typeof window !== 'undefined' ? window?.innerWidth : null) || dims?.width || 0);
    const vh = Number((typeof window !== 'undefined' ? window?.innerHeight : null) || dims?.height || 0);
    const padding = 12;

    const width = Math.max(1, Number(menuSize?.width || 0));
    const height = Math.max(1, Number(menuSize?.height || 0));

    if (!vw || !vh || !Number.isFinite(width) || !Number.isFinite(height)) {
      return { left: nextLeft, top: nextTop };
    }

    const left = Math.max(padding, Math.min(nextLeft, vw - width - padding));
    const top = Math.max(padding, Math.min(nextTop, vh - height - padding));
    return { left, top };
  }, [dims?.width, dims?.height, menuSize?.width, menuSize?.height]);

  const computePosition = React.useCallback(() => {
    const baseX = safeX + Number(offsetX || 0);
    const baseY = safeY + Number(offsetY || 0);

    const width = Number(menuSize?.width || 0);
    const height = Number(menuSize?.height || 0);

    // If we don't know menu size yet, place at the anchor and let onLayout re-run.
    if (!width || !height) {
      return clamp(baseX, baseY);
    }

    const wantRight = String(align || 'left').toLowerCase() === 'right';
    const wantUp = String(direction || 'down').toLowerCase() === 'up';

    const leftAligned = baseX;
    const rightAligned = baseX - width;
    const downTop = baseY;
    const upTop = baseY - height;

    const vw = Number((typeof window !== 'undefined' ? window?.innerWidth : null) || dims?.width || 0);
    const vh = Number((typeof window !== 'undefined' ? window?.innerHeight : null) || dims?.height || 0);
    const padding = 12;

    let left = wantRight ? rightAligned : leftAligned;
    if (vw) {
      const overRight = left + width + padding > vw;
      const overLeft = left < padding;

      if (overRight) {
        // Try flipping alignment first (right <-> left), then clamp.
        const flipped = wantRight ? leftAligned : rightAligned;
        if (flipped >= padding && flipped + width + padding <= vw) {
          left = flipped;
        } else {
          left = vw - width - padding;
        }
      } else if (overLeft) {
        const flipped = wantRight ? leftAligned : rightAligned;
        if (flipped >= padding && flipped + width + padding <= vw) {
          left = flipped;
        } else {
          left = padding;
        }
      }
    }

    let top = wantUp ? upTop : downTop;
    if (vh) {
      const overBottom = top + height + padding > vh;
      const overTop = top < padding;

      if (overBottom) {
        const flipped = wantUp ? downTop : upTop;
        if (flipped >= padding && flipped + height + padding <= vh) {
          top = flipped;
        } else {
          top = vh - height - padding;
        }
      } else if (overTop) {
        const flipped = wantUp ? downTop : upTop;
        if (flipped >= padding && flipped + height + padding <= vh) {
          top = flipped;
        } else {
          top = padding;
        }
      }
    }

    return clamp(left, top);
  }, [safeX, safeY, offsetX, offsetY, align, direction, menuSize?.width, menuSize?.height, dims?.width, dims?.height, clamp]);

  React.useEffect(() => {
    if (!visible) return;
    const next = computePosition();
    setPos((prev) => {
      const pl = Number(prev?.left || 0);
      const pt = Number(prev?.top || 0);
      if (Math.abs(pl - next.left) < 0.5 && Math.abs(pt - next.top) < 0.5) return prev;
      return next;
    });
  }, [visible, computePosition]);

  React.useEffect(() => {
    if (!visible) return;
    if (Platform.OS !== 'web') return;
    const onResize = () => {
      try {
        const next = computePosition();
        setPos(next);
      } catch (_e) {}
    };
    try {
      window.addEventListener('resize', onResize);
      window.addEventListener('scroll', onResize, true);
    } catch (_e) {}
    return () => {
      try {
        window.removeEventListener('resize', onResize);
        window.removeEventListener('scroll', onResize, true);
      } catch (_e) {}
    };
  }, [visible, computePosition]);

  const left = Number(pos?.left || safeX);
  const top = Number(pos?.top || safeY);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1 }}>
        <Pressable
          style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0 }}
          onPress={() => onClose && onClose()}
        />

        <View
          ref={menuRef}
          onLayout={(e) => {
            try {
              const w = Number(e?.nativeEvent?.layout?.width || 0);
              const h = Number(e?.nativeEvent?.layout?.height || 0);
              if (w > 0 && h > 0) {
                setMenuSize((prev) => {
                  const pw = Number(prev?.width || 0);
                  const ph = Number(prev?.height || 0);
                  if (Math.abs(pw - w) < 0.5 && Math.abs(ph - h) < 0.5) return prev;
                  return { width: w, height: h };
                });
              }
            } catch (_e) {}
          }}
          style={{
            position: 'absolute',
            left,
            top,
            backgroundColor: '#fff',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: '#e0e0e0',
            paddingVertical: compact ? 4 : 8,
            minWidth: compact ? 180 : 200,
            ...(maxWidth != null ? { maxWidth: Number(maxWidth) } : {}),
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
                    paddingVertical: compact ? 4 : 8,
                    paddingHorizontal: compact ? 10 : 12,
                    borderBottomWidth: idx < items.length - 1 ? 1 : 0,
                    borderColor: '#f0f0f0',
                  }}
                >
                  {item.label ? (
                    <Text style={{ fontSize: compact ? 10 : 11, color: '#999', fontWeight: '600', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      {item.label}
                    </Text>
                  ) : (
                    <View style={{ height: 1, backgroundColor: '#e8e8e8', marginVertical: 4 }} />
                  )}
                </View>
              );
            }
            
            const iconColor = item.danger 
              ? '#B91C1C' 
              : (isSelected && item.phaseColor 
                ? item.phaseColor 
                : '#666');
            const textColor = item.danger 
              ? '#B91C1C' 
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
                  paddingVertical: compact ? 5 : 10,
                  paddingHorizontal: compact ? 10 : 14,
                  borderBottomWidth: idx < items.length - 1 && !items[idx + 1]?.isSeparator ? 1 : 0,
                  borderColor: '#f0f0f0',
                  opacity: disabled ? 0.5 : 1,
                  backgroundColor: isSelected 
                    ? (item.phaseColor ? item.phaseColor + '10' : '#e3f2fd')
                    : (item.danger ? '#FEF2F2' : '#fff'),
                  ...(Platform.OS === 'web' ? {
                    transition: 'background-color 0.15s ease',
                  } : {}),
                }}
                onMouseEnter={Platform.OS === 'web' ? (e) => {
                  if (!disabled && e?.currentTarget) {
                    if (item.danger) {
                      e.currentTarget.style.backgroundColor = '#FECACA';
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
                      e.currentTarget.style.backgroundColor = '#FEF2F2';
                    } else if (isSelected && item.phaseColor) {
                      e.currentTarget.style.backgroundColor = item.phaseColor + '10';
                    } else {
                      e.currentTarget.style.backgroundColor = '#fff';
                    }
                  }
                } : undefined}
              >
                <View style={{ width: compact ? 20 : 24, marginRight: compact ? 8 : 12, alignItems: 'center', justifyContent: 'center' }}>
                  {item.icon ? (
                    React.isValidElement(item.icon)
                      ? item.icon
                      : (item.iconName
                        ? <Ionicons name={item.iconName} size={compact ? 16 : 18} color={iconColor} />
                        : <Text style={{ fontSize: compact ? 14 : 18 }}>{String(item.icon)}</Text>)
                  ) : null}
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{
                    fontSize: compact ? 12 : 14,
                    color: textColor,
                    fontWeight: (item.danger || isSelected) ? '600' : '400',
                  }} numberOfLines={1}>
                    {item.label}
                  </Text>
                  {String(item?.subtitle || '').trim() ? (
                    <Text style={{ fontSize: 12, color: '#64748b', marginTop: 2 }} numberOfLines={1}>
                      {String(item.subtitle)}
                    </Text>
                  ) : null}
                </View>
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
