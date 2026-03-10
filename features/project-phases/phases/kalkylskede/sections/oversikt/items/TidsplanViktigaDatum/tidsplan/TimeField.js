/**
 * TimeField
 *
 * Click-to-open dropdown for picking a time (HH:MM).
 * Uses a portal to render the dropdown at document.body level so it is never
 * clipped by overflow:hidden/scroll on parent containers (e.g. DateModal's ScrollView).
 * Closes on: click outside, time selection, or Escape.
 */

import React from 'react';
import { Platform, Pressable, ScrollView, Text, View } from 'react-native';
import ReactDOM from 'react-dom';

const DROPDOWN_MAX_HEIGHT = 200;
const DROPDOWN_GAP = 4;
const TIME_ITEM_HEIGHT = 36;
const DEFAULT_SCROLL_MINUTES = 7 * 60;

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

export const HALF_HOUR_TIME_OPTIONS = buildHalfHourTimes('00:00', '23:30');

function DropdownPortal({ anchorRect, options, selected, onSelect, onClose, colors, fwReg }) {
  const scrollRef = React.useRef(null);
  const dropdownRef = React.useRef(null);
  const didScrollRef = React.useRef(false);

  React.useEffect(() => {
    if (didScrollRef.current) return;
    const list = Array.isArray(options) ? options : [];
    if (list.length === 0) return;
    const valueMin = isValidTimeHHMM(selected) ? timeToMinutes(selected) : null;
    const targetMin = valueMin != null ? valueMin : DEFAULT_SCROLL_MINUTES;
    let idx = list.findIndex((t) => timeToMinutes(t) === targetMin);
    if (idx < 0) {
      const next = list.findIndex((t) => (timeToMinutes(t) || 0) >= targetMin);
      idx = next >= 0 ? next : list.length - 1;
    }
    idx = Math.max(0, Math.min(idx, list.length - 1));
    const y = idx * TIME_ITEM_HEIGHT;
    const t = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollTop = y;
        didScrollRef.current = true;
      }
    }, 30);
    return () => clearTimeout(t);
  }, [options, selected]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    const onClickOutside = (e) => {
      if (dropdownRef.current && dropdownRef.current.contains(e.target)) return;
      onClose();
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onClickOutside, true);
    return () => {
      document.removeEventListener('keydown', onKey, true);
      document.removeEventListener('mousedown', onClickOutside, true);
    };
  }, [onClose]);

  if (!anchorRect) return null;

  const style = {
    position: 'fixed',
    left: anchorRect.left,
    top: anchorRect.bottom + DROPDOWN_GAP,
    width: anchorRect.width,
    maxHeight: DROPDOWN_MAX_HEIGHT,
    backgroundColor: '#fff',
    borderRadius: 10,
    border: '1px solid #E2E8F0',
    zIndex: 99999,
    overflow: 'hidden',
    boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  };

  return ReactDOM.createPortal(
    <div ref={dropdownRef} style={style}>
      <div
        ref={scrollRef}
        style={{
          maxHeight: DROPDOWN_MAX_HEIGHT,
          overflowY: 'auto',
          overflowX: 'hidden',
        }}
      >
        {options.map((t) => {
          const m = timeToMinutes(t);
          const withinWorkday = m != null && m >= WORKDAY_START_MINUTES && m <= WORKDAY_END_MINUTES;
          const isSelected = t === selected;
          const dimColor = colors?.textSubtle || '#64748b';
          return (
            <div
              key={t}
              onClick={() => onSelect(t)}
              onMouseDown={(e) => e.preventDefault()}
              style={{
                paddingTop: 8,
                paddingBottom: 8,
                paddingLeft: 12,
                paddingRight: 12,
                backgroundColor: isSelected ? '#EFF6FF' : '#fff',
                borderBottom: '1px solid #EEF2F7',
                cursor: 'pointer',
                fontSize: 13,
                fontWeight: isSelected ? '600' : fwReg || '400',
                color: isSelected ? '#1976D2' : withinWorkday ? (colors?.text || '#111') : dimColor,
                opacity: withinWorkday || isSelected ? 1 : 0.65,
              }}
              onMouseEnter={(e) => {
                if (!isSelected) e.currentTarget.style.backgroundColor = '#F8FAFC';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.backgroundColor = isSelected ? '#EFF6FF' : '#fff';
              }}
            >
              {t}
            </div>
          );
        })}
      </div>
    </div>,
    document.body
  );
}

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
  const [displayValue, setDisplayValue] = React.useState(() => String(value || ''));
  const prevValueRef = React.useRef(value);

  React.useEffect(() => {
    if (value === prevValueRef.current) return;
    prevValueRef.current = value;
    setDisplayValue(String(value || ''));
  }, [value]);

  const controlled = !!dropdownKey && typeof setActiveDropdown === 'function';
  const [openLocal, setOpenLocal] = React.useState(false);
  const open = controlled ? activeDropdown === dropdownKey : openLocal;

  const buttonRef = React.useRef(null);
  const [anchorRect, setAnchorRect] = React.useState(null);

  const v = typeof displayValue === 'string' ? displayValue : '';

  const options = React.useMemo(() => {
    const list = HALF_HOUR_TIME_OPTIONS;
    const min = Number(minDropdownMinutes);
    if (!Number.isFinite(min)) return list;
    return list.filter((t) => {
      const m = timeToMinutes(t);
      return m != null && m >= min;
    });
  }, [minDropdownMinutes]);

  const closeDropdown = React.useCallback(() => {
    if (controlled) setActiveDropdown(null);
    else setOpenLocal(false);
    setAnchorRect(null);
  }, [controlled, setActiveDropdown]);

  const toggleDropdown = React.useCallback(() => {
    if (open) {
      closeDropdown();
      return;
    }
    if (buttonRef.current) {
      const el = buttonRef.current;
      if (typeof el.getBoundingClientRect === 'function') {
        const rect = el.getBoundingClientRect();
        setAnchorRect({ left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width });
      } else if (typeof el.measureInWindow === 'function') {
        el.measureInWindow((x, y, w, h) => {
          setAnchorRect({ left: x, top: y, bottom: y + h, width: w });
        });
      }
    }
    if (controlled) setActiveDropdown(dropdownKey);
    else setOpenLocal(true);
  }, [open, controlled, dropdownKey, setActiveDropdown, closeDropdown]);

  const handleSelect = React.useCallback((t) => {
    setDisplayValue(t);
    onChange?.(t);
    closeDropdown();
  }, [onChange, closeDropdown]);

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>{label}</Text>
        <Pressable
          style={{
            borderWidth: 1,
            borderColor: '#E2E8F0',
            borderRadius: 10,
            paddingVertical: 9,
            paddingHorizontal: 10,
            backgroundColor: '#fff',
          }}
        >
          <Text style={{ fontSize: 13, color: v ? colors.text : '#94A3B8' }} numberOfLines={1}>
            {v || placeholder || 'HH:MM'}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, minWidth: 0, gap: 6 }}>
      <Text style={{ fontSize: 12, fontWeight: fwMed, color: colors.textSubtle }}>{label}</Text>
      <Pressable
        ref={buttonRef}
        onPress={toggleDropdown}
        style={({ hovered }) => ({
          borderWidth: 1,
          borderColor: open ? '#1976D2' : hovered ? '#CBD5E1' : '#E2E8F0',
          borderRadius: 10,
          paddingVertical: 9,
          paddingHorizontal: 10,
          backgroundColor: '#fff',
          cursor: 'pointer',
        })}
      >
        <Text style={{ fontSize: 13, color: v ? colors.text : '#94A3B8' }} numberOfLines={1}>
          {v || placeholder || 'HH:MM'}
        </Text>
      </Pressable>

      {open && anchorRect && (
        <DropdownPortal
          anchorRect={anchorRect}
          options={options}
          selected={v}
          onSelect={handleSelect}
          onClose={closeDropdown}
          colors={colors}
          fwReg={fwReg}
        />
      )}
    </View>
  );
}
