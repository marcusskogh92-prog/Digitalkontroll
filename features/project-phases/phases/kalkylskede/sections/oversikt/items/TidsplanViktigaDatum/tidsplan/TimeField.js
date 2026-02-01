/**
 * TimeField
 *
 * Extracted from DateModal as a pure structural split.
 * No intended behavior/UI changes.
 */

import React from 'react';
import { Dimensions, Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

let globalOpenId = null;
let globalClose = null;
let nextTimeFieldId = 1;

const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_GAP = 6;
const VIEWPORT_PADDING = 8;

// Visual recommendation only (Outlook-like): normal workday.
// Does NOT affect selection/validation; only dropdown text styling.
const WORKDAY_START_MINUTES = 7 * 60;
const WORKDAY_END_MINUTES = 16 * 60;

export function isValidTimeHHMM(value) {
  const s = String(value || '').trim();
  if (!s) return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(s);
}

export function normalizeTimeInput(value) {
  return String(value || '')
    .replace(/[^0-9:]/g, '')
    .slice(0, 5);
}

export function timeToMinutes(value) {
  if (!isValidTimeHHMM(value)) return null;
  const [hh, mm] = String(value).split(':');
  return Number(hh) * 60 + Number(mm);
}

export function buildHalfHourTimes(startHHMM, endHHMM) {
  const s = timeToMinutes(startHHMM);
  const e = timeToMinutes(endHHMM);
  if (s == null || e == null) return [];
  const out = [];
  for (let m = s; m <= e; m += 30) {
    const hh = String(Math.floor(m / 60)).padStart(2, '0');
    const mm = String(m % 60).padStart(2, '0');
    out.push(`${hh}:${mm}`);
  }
  return out;
}

// Suggestion list is a helper only; manual input is always allowed.
export const HALF_HOUR_TIME_OPTIONS = buildHalfHourTimes('00:00', '23:30');

export default function TimeField({
  label,
  value,
  onChange,
  placeholder,
  minDropdownMinutes,
  dropdownKey,
  activeDropdown,
  setActiveDropdown,
  colors,
  fwReg,
  fwMed,
}) {
  const idRef = React.useRef(null);
  if (idRef.current == null) idRef.current = nextTimeFieldId++;
  const id = idRef.current;

  // Prevent a re-open when focus bounces back to the input right after selecting an option.
  // This is consumed by the next onFocus only.
  const suppressNextFocusRef = React.useRef(false);

  const [openUncontrolled, setOpenUncontrolled] = React.useState(false);
  const inputRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const didInitialScrollRef = React.useRef(false);
  const prevOpenRef = React.useRef(false);
  const [anchor, setAnchor] = React.useState(() => ({ x: 0, y: 0, width: 0, height: 0 }));
  const [viewport, setViewport] = React.useState(() => {
    const w = Dimensions.get('window');
    return { width: Number(w?.width || 0), height: Number(w?.height || 0) };
  });
  const v = String(value || '');

  const controlled = !!dropdownKey && typeof setActiveDropdown === 'function';
  const open = controlled ? activeDropdown === dropdownKey : openUncontrolled;

  // On open (closed → open), reset the "initial scroll" so we can scroll to workday start.
  React.useEffect(() => {
    const wasOpen = !!prevOpenRef.current;
    if (open && !wasOpen) {
      didInitialScrollRef.current = false;
    }
    prevOpenRef.current = !!open;
  }, [open]);

  // A portal-based Modal is used so the dropdown escapes parent stacking contexts
  // (ScrollView/Modal content can create stacking contexts where zIndex is insufficient).
  // measureInWindow is required to position the dropdown relative to the input on-screen.
  const closeDropdown = React.useCallback(() => {
    if (controlled) setActiveDropdown(null);
    else setOpenUncontrolled(false);
    if (globalOpenId === id) {
      globalOpenId = null;
      globalClose = null;
    }
  }, [controlled, id, setActiveDropdown]);

  const measureAnchor = React.useCallback(() => {
    const node = inputRef.current;
    if (!node) return false;
    const run = () => {
      try {
        if (typeof node.measureInWindow === 'function') {
          node.measureInWindow((x, y, width, height) => {
            setAnchor({ x: Number(x || 0), y: Number(y || 0), width: Number(width || 0), height: Number(height || 0) });
          });
          return;
        }
        if (typeof node.measure === 'function') {
          node.measure((x, y, width, height, pageX, pageY) => {
            setAnchor({ x: Number(pageX || 0), y: Number(pageY || 0), width: Number(width || 0), height: Number(height || 0) });
          });
        }
      } catch {
        // no-op
      }
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run);
    else setTimeout(run, 0);
    return true;
  }, []);

  const updateViewport = React.useCallback(() => {
    const w = Dimensions.get('window');
    setViewport({ width: Number(w?.width || 0), height: Number(w?.height || 0) });
  }, []);

  const openDropdown = React.useCallback(() => {

    // Idempotent: if we're already the active open dropdown, do nothing.
    // This prevents close→open loops when multiple input events fire (e.g. focus + pressIn).
    if (open && globalOpenId === id) {
      return;
    }

    // Close any OTHER open dropdown first.
    if (globalClose && globalOpenId !== id) {
      try {
        globalClose();
      } catch {
        // no-op
      }
    }
    globalOpenId = id;
    globalClose = closeDropdown;

    if (controlled) setActiveDropdown(dropdownKey);
    else setOpenUncontrolled(true);

    updateViewport();
    if (!measureAnchor()) {
      closeDropdown();
    }
  }, [closeDropdown, controlled, dropdownKey, id, measureAnchor, open, setActiveDropdown, updateViewport]);

  React.useEffect(() => {
    if (!open) return;
    if (!inputRef.current) {
      closeDropdown();
      return;
    }
    globalOpenId = id;
    globalClose = closeDropdown;
    updateViewport();
    if (!measureAnchor()) {
      closeDropdown();
    }
  }, [closeDropdown, id, measureAnchor, open, updateViewport]);

  // Ensure we don't leave global state behind if parent modal unmounts.
  React.useEffect(() => {
    return () => {
      if (globalOpenId === id) {
        globalOpenId = null;
        globalClose = null;
      }
    };
  }, [id]);

  // Resize/orientation safety: re-measure while open; if re-measure isn't possible, close.
  React.useEffect(() => {
    if (!open) return;

    const onChange = () => {
      updateViewport();
      if (!inputRef.current) {
        closeDropdown();
        return;
      }
      if (!measureAnchor()) {
        closeDropdown();
      }
    };

    const dimSub = Dimensions.addEventListener?.('change', onChange);

    let removeWeb = null;
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.addEventListener) {
      window.addEventListener('resize', onChange);
      removeWeb = () => window.removeEventListener('resize', onChange);
    }

    return () => {
      try {
        if (typeof dimSub?.remove === 'function') dimSub.remove();
        else if (typeof Dimensions.removeEventListener === 'function') Dimensions.removeEventListener('change', onChange);
      } catch {
        // no-op
      }
      try {
        removeWeb?.();
      } catch {
        // no-op
      }
    };
  }, [closeDropdown, measureAnchor, open, updateViewport]);

  // Keyboard safety: Escape closes on web.
  React.useEffect(() => {
    if (!open) return;
    if (!(Platform.OS === 'web' && typeof window !== 'undefined' && window?.addEventListener)) return;

    const onKeyDown = (e) => {
      const key = String(e?.key || '');
      if (key === 'Escape') {
        closeDropdown();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [closeDropdown, open]);

  const options = React.useMemo(() => {
    const list = HALF_HOUR_TIME_OPTIONS;
    const min = Number(minDropdownMinutes);
    if (!Number.isFinite(min)) return list;
    return list.filter((t) => {
      const m = timeToMinutes(t);
      return m != null && m >= min;
    });
  }, [minDropdownMinutes]);

  const positioned = React.useMemo(() => {
    const vw = Number(viewport?.width || 0);
    const vh = Number(viewport?.height || 0);

    const width = Number(anchor?.width || 0);
    const height = Number(anchor?.height || 0);
    const x = Number(anchor?.x || 0);
    const y = Number(anchor?.y || 0);

    const maxH = DROPDOWN_MAX_HEIGHT;
    const gap = DROPDOWN_GAP;

    const safePad = VIEWPORT_PADDING;

    const vwSafe = Math.max(0, vw);
    const vhSafe = Math.max(0, vh);

    let left = x;
    let w = width;

    if (vwSafe > 0) {
      const maxWidth = Math.max(0, vwSafe - safePad * 2);
      if (w > maxWidth && maxWidth > 0) w = maxWidth;
      const maxLeft = Math.max(safePad, vwSafe - w - safePad);
      left = Math.min(Math.max(safePad, left), maxLeft);
    }

    const belowTop = y + height + gap;
    const belowBottom = belowTop + maxH;
    const shouldFlip = vhSafe > 0 ? (belowBottom > (vhSafe - safePad)) : false;

    let top = shouldFlip ? (y - gap - maxH) : belowTop;
    if (vhSafe > 0) {
      const maxTop = Math.max(safePad, vhSafe - maxH - safePad);
      top = Math.min(Math.max(safePad, top), maxTop);
    }

    return { left, top, width: w, maxHeight: maxH };
  }, [anchor, viewport]);

  const canRenderDropdown = Number(anchor?.width || 0) > 0 && Number(anchor?.height || 0) > 0;

  return (
    <View style={{ flex: 1, minWidth: 160, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>{label}</Text>
      <View style={{ position: 'relative' }}>
        <TextInput
          ref={inputRef}
          value={v}
          onChangeText={(t) => onChange?.(normalizeTimeInput(t))}
          onFocus={() => {
            if (suppressNextFocusRef.current) {
              suppressNextFocusRef.current = false;
              return;
            }

            openDropdown();
          }}
          onPressIn={() => {
            openDropdown();
          }}
          onBlur={() => {
            // Do not close on blur.
          }}
          placeholder={placeholder || 'HH:MM'}
          placeholderTextColor="#94A3B8"
          style={{
            flex: 1,
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 10,
            paddingVertical: 9,
            paddingHorizontal: 10,
            fontSize: 13,
            color: colors.text,
            backgroundColor: '#fff',
            ...(Platform.OS === 'web' ? { outline: 'none' } : {}),
          }}
        />
      </View>

      <Modal visible={!!open} transparent animationType="none" onRequestClose={closeDropdown}>
        <View style={{ flex: 1 }}>
          <Pressable
            onPressIn={() => {
              closeDropdown();
            }}
            onPress={() => {
              closeDropdown();
            }}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'rgba(15, 23, 42, 0.06)',
            }}
          />

          {!canRenderDropdown ? null : (
            <View
              style={{
                position: 'absolute',
                left: positioned.left,
                top: positioned.top,
                width: positioned.width,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                borderRadius: 10,
                backgroundColor: '#fff',
                overflow: 'hidden',
                ...(Platform.OS === 'web' ? { boxShadow: '0 10px 20px rgba(0,0,0,0.10)' } : {}),
              }}
            >
              <ScrollView ref={scrollRef} style={{ maxHeight: positioned.maxHeight }} keyboardShouldPersistTaps="handled">
                {(Array.isArray(options) ? options : []).map((t) => (
                  (() => {
                    const m = timeToMinutes(t);
                    const withinWorkday = m != null && m >= WORKDAY_START_MINUTES && m <= WORKDAY_END_MINUTES;
                    const dimTextColor = colors?.textSubtle || '#64748b';
                    const isWorkdayStart = t === '07:00';

                    return (
                  <Pressable
                    key={t}
                    onLayout={
                      !open || didInitialScrollRef.current || !isWorkdayStart
                        ? undefined
                        : (e) => {
                            if (didInitialScrollRef.current) return;
                            didInitialScrollRef.current = true;
                            const y = Number(e?.nativeEvent?.layout?.y || 0);
                            try {
                              scrollRef.current?.scrollTo?.({ y, animated: false });
                            } catch {
                              // no-op
                            }
                          }
                    }
                    onPress={() => {
                      onChange?.(t);
                      // Prevent a post-select focus bounce from immediately re-opening the dropdown.
                      suppressNextFocusRef.current = true;
                      closeDropdown();
                    }}
                    style={({ hovered, pressed }) => ({
                      paddingVertical: 10,
                      paddingHorizontal: 10,
                      borderBottomWidth: 1,
                      borderBottomColor: '#EEF2F7',
                      backgroundColor: hovered || pressed ? '#F8FAFC' : '#fff',
                    })}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: fwReg,
                        color: withinWorkday ? colors.text : dimTextColor,
                        ...(withinWorkday ? {} : { opacity: 0.65 }),
                      }}
                      numberOfLines={1}
                    >
                      {t}
                    </Text>
                  </Pressable>
                    );
                  })()
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
