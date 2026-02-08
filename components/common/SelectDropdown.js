import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

let createPortal = null;
if (Platform.OS === 'web') {
  try { createPortal = require('react-dom').createPortal; } catch (_e) { createPortal = null; }
}
const portalRootId = 'dk-select-dropdown-portal';

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
    width: '100%',
  },
  field: {
    minHeight: 38,
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    padding: 8,
    paddingRight: 35,
    backgroundColor: '#fff',
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 6,
  },
  input: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    width: '100%',
    fontSize: 14,
    color: '#222',
    paddingVertical: 2,
    paddingHorizontal: 0,
    backgroundColor: 'transparent',
    borderWidth: 0,
    borderColor: 'transparent',
    borderRadius: 0,
    boxShadow: 'none',
    outlineStyle: 'none',
  },
  chevron: {
    position: 'absolute',
    right: 8,
    top: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    pointerEvents: 'none',
  },
  chevronButton: {
    position: 'absolute',
    right: 4,
    top: 0,
    bottom: 0,
    width: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 0,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e0e0e0',
    borderRadius: 6,
    borderTopWidth: 0,
    borderTopLeftRadius: 0,
    borderTopRightRadius: 0,
    maxHeight: 280,
    overflow: 'scroll',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 25,
    zIndex: 6001,
    pointerEvents: 'auto',
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 4px 20px rgba(0, 0, 0, 0.25)',
          overflowY: 'auto',
          maxHeight: '280px',
        }
      : {}),
  },
  listPortalWrap: {
    position: 'fixed',
    zIndex: 6001,
    pointerEvents: 'auto',
  },
  listPortal: {
    position: 'relative',
    top: 0,
    left: 0,
    right: 0,
    pointerEvents: 'auto',
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    maxHeight: 96,
    overflow: 'scroll',
    ...(Platform.OS === 'web'
      ? {
          overflowY: 'auto',
        }
      : {}),
  },
  item: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    ...(Platform.OS === 'web' ? { transition: 'background-color 120ms ease' } : {}),
  },
  itemSelected: {
    backgroundColor: '#f5f5f5',
  },
  itemHover: {
    backgroundColor: '#F7FBFF',
  },
  itemText: {
    fontSize: 14,
    color: '#222',
  },
  itemTextSelected: {
    color: '#1976D2',
    fontWeight: '600',
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 14,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    gap: 6,
  },
  chipText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '400',
  },
  chipRemove: {
    width: 16,
    height: 16,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#e2e8f0',
  },
  chipRemoveText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 12,
  },
});

export function SelectDropdownChip({
  label,
  removable = true,
  onRemove,
  title,
}) {
  return (
    <View style={styles.chip} {...(title ? { title } : {})}>
      <Text style={styles.chipText}>{label}</Text>
      {removable ? (
        <TouchableOpacity
          onPress={onRemove}
          style={styles.chipRemove}
          activeOpacity={0.8}
        >
          <Text style={styles.chipRemoveText}>×</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

export function SelectDropdownChips({ values = [], onRemove, style, removable = true }) {
  if (!values.length) return null;
  return (
    <View style={[styles.chipRow, style]}>
      {values.map((chip) => (
        <SelectDropdownChip
          key={chip}
          label={chip}
          removable={removable}
          onRemove={removable ? () => onRemove?.(chip) : undefined}
        />
      ))}
    </View>
  );
}

export default function SelectDropdown({
  value,
  options,
  placeholder = '',
  multiple = false,
  searchable = false,
  keepOpenOnSelect,
  disabled = false,
  visible,
  onToggleVisible,
  onSelect,
  onChange,
  renderOptionRight,
  fieldStyle,
  listStyle,
  itemStyle,
  itemSelectedStyle,
  itemTextStyle,
  itemTextSelectedStyle,
  inputStyle,
  variant,
  chipsPlacement = 'inside',
  usePortal = true,
}) {
  const wrapperRef = useRef(null);
  const [openInternal, setOpenInternal] = useState(false);
  const [queryInternal, setQueryInternal] = useState('');
  const [activeIndex, setActiveIndex] = useState(-1);
  const [portalPos, setPortalPos] = useState({ top: 0, left: 0, width: 0 });

  const open = typeof visible === 'boolean' ? visible : openInternal;
  const setOpen = useCallback((next) => {
    if (typeof visible === 'boolean' && onToggleVisible) {
      onToggleVisible();
    } else {
      setOpenInternal(next);
    }
  }, [onToggleVisible, visible]);


  const toggleOpen = () => {
    if (disabled) return;
    if (typeof visible === 'boolean' && onToggleVisible) {
      onToggleVisible();
      return;
    }
    setOpenInternal((prev) => !prev);
  };

  const list = useMemo(() => (Array.isArray(options) ? options : []), [options]);
  const query = String(queryInternal || '').trim();
  const filtered = useMemo(() => {
    if (!searchable || !query) return list;
    const q = query.toLowerCase();
    return list.filter((opt) => {
      const label = typeof opt === 'object' ? opt.label || opt.value : opt;
      return String(label || '').toLowerCase().includes(q);
    });
  }, [list, query, searchable]);

  const selectedValues = multiple ? (Array.isArray(value) ? value : []) : [];
  const selectedLabel = useMemo(() => {
    if (multiple) return '';
    const v = value;
    const found = list.find((opt) => (typeof opt === 'object' ? opt.value === v : opt === v));
    if (found && typeof found === 'object') return found.label || String(found.value || '');
    return v != null ? String(v) : '';
  }, [list, multiple, value]);

  const doSelect = (opt, opts = {}) => {
    const deferClose = !!opts.deferClose;
    const optValue = typeof opt === 'object' ? opt.value : opt;
    if (multiple) {
      const next = selectedValues.includes(optValue)
        ? selectedValues.filter((v) => v !== optValue)
        : [...selectedValues, optValue];
      onChange?.(next);
      if (!keepOpenOnSelect && !searchable) {
        if (deferClose) setTimeout(() => setOpen(false), 0);
        else setOpen(false);
      }
      return;
    }
    onSelect?.(optValue);
    if (!keepOpenOnSelect) {
      if (deferClose) setTimeout(() => setOpen(false), 0);
      else setOpen(false);
    }
  };

  useEffect(() => {
    if (!open || Platform.OS !== 'web') return;
    const onDown = (e) => {
      const node = wrapperRef.current;
      const target = e?.target;
      if (node && target && node.contains(target)) return;
      try {
        if (usePortal) {
          const portalNode = document.getElementById(portalRootId);
          if (portalNode && target && portalNode.contains(target)) return;
          if (target && typeof target.closest === 'function') {
            if (target.closest('[data-dk-select-dropdown="true"]')) return;
          }
        }
      } catch (_e) {}
      setOpen(false);
      setActiveIndex(-1);
    };
    const updatePosition = () => {
      try {
        const node = wrapperRef.current;
        if (node && typeof node.measureInWindow === 'function') {
          node.measureInWindow((x, y, w, h) => {
            const vw = Number((typeof window !== 'undefined' ? window?.innerWidth : null) || 0);
            const width = Math.max(0, Number(w || 0));
            const maxLeft = vw ? Math.max(0, vw - width) : x || 0;
            const nextLeft = Math.min(Number(x || 0), maxLeft);
            setPortalPos({
              top: (y || 0) + (h || 0),
              left: nextLeft,
              width,
            });
          });
          return;
        }
        if (node && typeof node.getBoundingClientRect === 'function') {
          const rect = node.getBoundingClientRect();
          const vw = Number((typeof window !== 'undefined' ? window?.innerWidth : null) || 0);
          const width = Math.max(0, Number(rect.width || 0));
          const maxLeft = vw ? Math.max(0, vw - width) : rect.left;
          const nextLeft = Math.min(Number(rect.left || 0), maxLeft);
          setPortalPos({
            top: rect.top + rect.height,
            left: nextLeft,
            width,
          });
        }
      } catch (_e) {}
    };

    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('touchstart', onDown, true);
    if (usePortal) {
      window.addEventListener('resize', updatePosition, true);
      window.addEventListener('scroll', updatePosition, true);
      updatePosition();
    }
    return () => {
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      if (usePortal) {
        window.removeEventListener('resize', updatePosition, true);
        window.removeEventListener('scroll', updatePosition, true);
      }
    };
  }, [open, setOpen, usePortal]);

  const ensurePortalRoot = () => {
    if (!createPortal || Platform.OS !== 'web') return null;
    try {
      let root = document.getElementById(portalRootId);
      if (!root) {
        root = document.createElement('div');
        root.id = portalRootId;
        root.style.position = 'relative';
        root.style.zIndex = '99999';
        document.body.appendChild(root);
      }
      return root;
    } catch (_e) {
      return null;
    }
  };

  const inputValue = multiple ? queryInternal : selectedLabel;
  const inputPlaceholder = !multiple
    ? placeholder
    : chipsPlacement === 'inside' && selectedValues.length
      ? ''
      : placeholder;

  const isModalVariant = String(variant || '').toLowerCase() === 'modal';
  const fieldVariantStyle = isModalVariant
    ? {
        borderColor: '#e2e8f0',
        borderRadius: 10,
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 16,
      }
    : null;
  const inputVariantStyle = isModalVariant ? { fontSize: 13, color: '#111' } : null;
  const listVariantStyle = isModalVariant ? { borderColor: '#e2e8f0', borderRadius: 10 } : null;
  const itemTextVariantStyle = isModalVariant ? { fontSize: 13, color: '#111' } : null;
  const fieldOpenStyle = open ? { borderBottomLeftRadius: 0, borderBottomRightRadius: 0 } : null;
  const dropdownList = (
    <View style={[styles.list, listVariantStyle, listStyle, Platform.OS === 'web' ? styles.listPortal : null]}>
      {(filtered.length ? filtered : ['Ingen träff']).map((opt, idx) => {
        const valueKey = typeof opt === 'object' ? opt.value : opt;
        const label = typeof opt === 'object' ? opt.label || opt.value : opt;
        const selected = multiple ? selectedValues.includes(valueKey) : valueKey === value;
        return (
          <TouchableOpacity
            key={`${valueKey}-${idx}`}
            style={[
              styles.item,
              itemStyle,
              idx === activeIndex ? styles.itemHover : null,
              selected ? styles.itemSelected : null,
              selected ? itemSelectedStyle : null,
              Platform.OS === 'web' ? { cursor: 'pointer' } : null,
            ]}
            onMouseDown={
              Platform.OS === 'web'
                ? (e) => {
                    if (e?.preventDefault) e.preventDefault();
                    if (e?.stopPropagation) e.stopPropagation();
                    if (label === 'Ingen träff') return;
                    doSelect(opt, { deferClose: true });
                    if (multiple) setQueryInternal('');
                  }
                : undefined
            }
            onPress={() => {
              if (Platform.OS === 'web') return;
              if (label === 'Ingen träff') return;
              doSelect(opt);
              if (multiple) setQueryInternal('');
            }}
            onMouseEnter={Platform.OS === 'web' ? () => setActiveIndex(idx) : undefined}
            onMouseLeave={Platform.OS === 'web' ? () => setActiveIndex(-1) : undefined}
            activeOpacity={0.8}
          >
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text
                style={[
                  styles.itemText,
                  itemTextVariantStyle,
                  itemTextStyle,
                  selected ? styles.itemTextSelected : null,
                  selected ? itemTextSelectedStyle : null,
                ]}
              >
                {label}
              </Text>
              {renderOptionRight ? renderOptionRight(opt) : null}
            </View>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  return (
    <View style={styles.wrap} ref={wrapperRef}>
      {chipsPlacement === 'above' && multiple ? (
        <SelectDropdownChips
          values={selectedValues}
          onRemove={(chip) => doSelect(chip)}
          style={{ marginBottom: 8 }}
        />
      ) : null}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={toggleOpen}
        disabled={disabled}
        style={[styles.field, fieldVariantStyle, fieldOpenStyle, fieldStyle]}
      >
        {chipsPlacement === 'inside' && multiple && selectedValues.length ? (
          <SelectDropdownChips values={selectedValues} onRemove={(chip) => doSelect(chip)} />
        ) : null}
        {Platform.OS === 'web' ? (
          // @ts-ignore - web-only input for search support
          <input
            value={inputValue}
            placeholder={inputPlaceholder}
            disabled={disabled || (!multiple && !searchable)}
            onChange={(e) => {
              if (!searchable) return;
              setQueryInternal(e.target.value);
              if (!open) setOpen(true);
              setActiveIndex(0);
            }}
            onFocus={() => {
              if (!open) setOpen(true);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setOpen(false);
                setActiveIndex(-1);
                return;
              }
              if (e.key === 'Enter') {
                if (filtered.length) {
                  const idx = activeIndex >= 0 ? activeIndex : 0;
                  doSelect(filtered[idx]);
                  if (multiple) setQueryInternal('');
                }
                e.preventDefault();
              }
              if (e.key === 'ArrowDown') {
                setActiveIndex((prev) => Math.min(prev + 1, filtered.length - 1));
                e.preventDefault();
              }
              if (e.key === 'ArrowUp') {
                setActiveIndex((prev) => Math.max(prev - 1, 0));
                e.preventDefault();
              }
            }}
            style={StyleSheet.flatten([styles.input, inputVariantStyle, inputStyle])}
          />
        ) : (
          <TextInput
            value={inputValue}
            placeholder={inputPlaceholder}
            editable={false}
            style={[styles.input, inputVariantStyle, inputStyle]}
          />
        )}
        <TouchableOpacity
          style={styles.chevronButton}
          onPress={() => {
            if (Platform.OS !== 'web') toggleOpen();
          }}
          onMouseDown={
            Platform.OS === 'web'
              ? (e) => {
                  if (e?.preventDefault) e.preventDefault();
                  if (e?.stopPropagation) e.stopPropagation();
                  toggleOpen();
                }
              : undefined
          }
          activeOpacity={0.8}
          disabled={disabled}
        >
          <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color="#666" />
        </TouchableOpacity>
      </TouchableOpacity>

      {open && Platform.OS === 'web' && createPortal && usePortal
        ? (() => {
            const root = ensurePortalRoot();
            if (!root) return null;
            return createPortal(
              <View
                style={[
                  styles.listPortalWrap,
                  { top: portalPos.top || 0, left: portalPos.left || 0, width: portalPos.width || 0 },
                ]}
                data-dk-select-dropdown="true"
              >
                {dropdownList}
              </View>,
              root
            );
          })()
        : open
          ? dropdownList
          : null}
    </View>
  );
}
