/**
 * TimeField
 *
 * Dropdown renders in its own Modal (presentationStyle="overFullScreen") so it sits above DateModal.
 * Fullscreen transparent Pressable catches all clicks outside dropdown; close only, no time change.
 */

import React from 'react';
import { Modal, Platform, Pressable, ScrollView, Text, TextInput, View } from 'react-native';

const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_GAP = 6;

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
  // Prevent a re-open when focus bounces back to the input right after selecting an option.
  const suppressNextFocusRef = React.useRef(false);
  // Track focus so we don't overwrite user's partial input when parent value changes (e.g. 60-min sync).
  const isFocusedRef = React.useRef(false);
  const prevValueRef = React.useRef(value);

  const [displayValue, setDisplayValue] = React.useState(() => String(value || ''));
  // Sync display ONLY when value actually changes from parent (dependency [value]). Never on blur/focus/open.
  React.useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    if (!isFocusedRef.current) setDisplayValue(String(value || ''));
  }, [value]);

  const [openUncontrolled, setOpenUncontrolled] = React.useState(false);
  const inputRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  const scrollRef = React.useRef(null);
  const didInitialScrollRef = React.useRef(false);
  const prevOpenRef = React.useRef(false);
  const [anchor, setAnchor] = React.useState(() => ({ width: 0, height: 0 }));
  const [dropdownScreenPos, setDropdownScreenPos] = React.useState(null);
  const anchorRef = React.useRef(null);
  const v = typeof displayValue === 'string' ? displayValue : '';

  const controlled = !!dropdownKey && typeof setActiveDropdown === 'function';
  const open = controlled ? activeDropdown === dropdownKey : openUncontrolled;

  // Measure anchor in window when dropdown opens (for Modal positioning).
  React.useEffect(() => {
    if (!open || !anchorRef.current) return;
    anchorRef.current.measureInWindow((x, y, width, height) => {
      setDropdownScreenPos({ x: x ?? 0, y: y ?? 0, width: width ?? anchor.width, height: height ?? anchor.height });
    });
  }, [open, anchor.width, anchor.height]);

  React.useEffect(() => {
    if (!open) setDropdownScreenPos(null);
  }, [open]);

  // On open (closed → open), reset the "initial scroll".
  React.useEffect(() => {
    const wasOpen = !!prevOpenRef.current;
    if (open && !wasOpen) didInitialScrollRef.current = false;
    prevOpenRef.current = !!open;
  }, [open]);

  const closeDropdown = React.useCallback(() => {
    if (controlled) setActiveDropdown(null);
    else setOpenUncontrolled(false);
  }, [controlled, setActiveDropdown]);

  const openDropdown = React.useCallback(() => {
    if (open) return;
    if (controlled) setActiveDropdown(dropdownKey);
    else setOpenUncontrolled(true);
  }, [controlled, dropdownKey, open, setActiveDropdown]);

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
    const width = Number(anchor?.width || 0);
    const height = Number(anchor?.height || 0);
    return {
      left: 0,
      top: height + DROPDOWN_GAP,
      width,
      maxHeight: DROPDOWN_MAX_HEIGHT,
    };
  }, [anchor]);

  const canRenderDropdown = Number(anchor?.width || 0) > 0 && Number(anchor?.height || 0) > 0;
  const modalPositioned = dropdownScreenPos
    ? {
        left: dropdownScreenPos.x,
        top: dropdownScreenPos.y + dropdownScreenPos.height + DROPDOWN_GAP,
        width: dropdownScreenPos.width,
        maxHeight: DROPDOWN_MAX_HEIGHT,
      }
    : positioned;

  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>{label}</Text>
      <View
        ref={anchorRef}
        style={{ position: 'relative' }}
        collapsable={false}
        onLayout={(e) => {
          const { width, height } = e.nativeEvent.layout;
          setAnchor({ width: Number(width || 0), height: Number(height || 0) });
        }}
      >
        <TextInput
          ref={inputRef}
          value={v}
          onChangeText={(t) => {
            const normalized = normalizeTimeInput(t);
            setDisplayValue(normalized);
            if (isValidTimeHHMM(normalized)) onChange?.(normalized);
          }}
          onFocus={() => {
            isFocusedRef.current = true;
            if (open) return;
            if (suppressNextFocusRef.current) {
              suppressNextFocusRef.current = false;
              return;
            }
            openDropdown();
          }}
          onPressIn={() => {
            if (!open) openDropdown();
          }}
          onBlur={() => {
            isFocusedRef.current = false;
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

      <Modal
        visible={!!open}
        transparent
        animationType="none"
        presentationStyle="overFullScreen"
        onRequestClose={closeDropdown}
      >
        <View style={{ flex: 1 }}>
          <Pressable
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              backgroundColor: 'transparent',
            }}
            onPress={closeDropdown}
            onPressIn={closeDropdown}
          />
          {canRenderDropdown && (
            <View
              ref={dropdownRef}
              style={{
                position: 'absolute',
                left: modalPositioned.left,
                top: modalPositioned.top,
                width: modalPositioned.width,
                maxHeight: modalPositioned.maxHeight,
                backgroundColor: '#fff',
                borderRadius: 10,
                borderWidth: 1,
                borderColor: '#E2E8F0',
                zIndex: 1000,
                overflow: 'hidden',
              }}
            >
              <ScrollView ref={scrollRef} style={{ maxHeight: modalPositioned.maxHeight }} keyboardShouldPersistTaps="handled">
                {(Array.isArray(options) ? options : []).map((t) => {
                  const m = timeToMinutes(t);
                  const withinWorkday = m != null && m >= WORKDAY_START_MINUTES && m <= WORKDAY_END_MINUTES;
                  const dimTextColor = colors?.textSubtle || '#64748b';
                  return (
                    <Pressable
                      key={t}
                      onPress={() => {
                        setDisplayValue(t);
                        onChange?.(t);
                        suppressNextFocusRef.current = true;
                        closeDropdown();
                      }}
                      style={({ pressed }) => ({
                        paddingVertical: 10,
                        paddingHorizontal: 12,
                        backgroundColor: pressed ? '#F1F5F9' : '#fff',
                        borderBottomWidth: 1,
                        borderBottomColor: '#EEF2F7',
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
                })}
              </ScrollView>
            </View>
          )}
        </View>
      </Modal>
    </View>
  );
}
