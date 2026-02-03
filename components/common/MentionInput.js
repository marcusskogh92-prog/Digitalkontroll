/**
 * MentionInput – återanvändbar @-taggning i textfält.
 * Visar dropdown med förslag (personer, grupper, Alla) när användaren skriver @.
 * Kan användas i kommentarer, Fråga/Svar, AI-sammanställning m.m.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

function safeText(v) {
  if (v == null) return '';
  return String(v).trim();
}

function getDisplayName(suggestion) {
  if (suggestion?.type === 'all') return suggestion.displayName || 'Alla';
  if (suggestion?.type === 'group') return suggestion.groupName || suggestion.displayName || 'Grupp';
  return suggestion?.displayName || suggestion?.name || '';
}

export default function MentionInput({
  value = '',
  onChangeText,
  onMentionsChange,
  mentions = [],
  suggestions = [],
  placeholder = '',
  editable = true,
  style,
  inputStyle,
  maxLength,
  numberOfLines = 2,
  multiline = true,
}) {
  const DROPDOWN_MAX_HEIGHT = 220;
  const DROPDOWN_MARGIN = 8;

  const [showDropdown, setShowDropdown] = useState(false);
  const [dropdownAbove, setDropdownAbove] = useState(false);
  const [atStart, setAtStart] = useState(0);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [filterQuery, setFilterQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const wrapRef = useRef(null);

  const filtered = suggestions.filter((s) => {
    const name = (getDisplayName(s) || '').toLowerCase();
    const q = (filterQuery || '').toLowerCase().trim();
    if (!q) return true;
    return name.includes(q) || name.split(/\s+/).some((part) => part.startsWith(q));
  });

  const openDropdown = useCallback((start, textUpToCursor) => {
    const afterAt = (textUpToCursor || value.slice(start + 1)).split(/\s/)[0] || '';
    setAtStart(start);
    setFilterQuery(afterAt.trim());
    setShowDropdown(true);
    setSelectedIndex(0);
  }, [value]);

  useEffect(() => {
    if (!showDropdown) return;
    const afterAt = value.slice(atStart + 1);
    const q = (afterAt.split(/\s/)[0] || '').trim();
    setFilterQuery(q);
    setSelectedIndex(0);
  }, [value, atStart, showDropdown]);

  const filteredLength = filtered.length;
  useEffect(() => {
    if (!showDropdown || filteredLength === 0) return;
    setSelectedIndex((i) => Math.min(Math.max(0, i), filteredLength - 1));
  }, [showDropdown, filteredLength]);

  useEffect(() => {
    if (!showDropdown || Platform.OS !== 'web') return;
    const el = wrapRef.current;
    if (!el || typeof el.getBoundingClientRect !== 'function') return;
    const tick = () => {
      try {
        const rect = el.getBoundingClientRect();
        const spaceBelow = typeof window !== 'undefined' ? window.innerHeight - rect.bottom - DROPDOWN_MARGIN : DROPDOWN_MAX_HEIGHT;
        setDropdownAbove(spaceBelow < DROPDOWN_MAX_HEIGHT);
      } catch (_e) {}
    };
    const id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, [showDropdown]);

  const handleChangeText = useCallback((newValue) => {
    onChangeText?.(newValue);
    if (!editable) return;
    const prev = value;
    const lastAt = newValue.lastIndexOf('@');
    const segmentAfterAt = lastAt === -1 ? '' : (newValue.slice(lastAt + 1).split(/\s/)[0] || '');
    const hasSpaceAfterAt = lastAt !== -1 && /\s/.test(newValue.slice(lastAt + 1));
    if (lastAt !== -1 && !hasSpaceAfterAt) {
      if (!showDropdown) openDropdown(lastAt, newValue.slice(lastAt + 1));
      else {
        setFilterQuery(segmentAfterAt.trim());
        setSelectedIndex(0);
      }
      return;
    }
    if (showDropdown && hasSpaceAfterAt) {
      setShowDropdown(false);
    }
  }, [onChangeText, editable, value, showDropdown, atStart, openDropdown]);

  const handleSelectionChange = useCallback((e) => {
    const { start, end } = e?.nativeEvent?.selection ?? {};
    setSelection({ start: start ?? 0, end: end ?? 0 });
  }, []);

  const handleSelectSuggestion = useCallback((s) => {
    const displayName = getDisplayName(s);
    const insert = `@${displayName} `;
    const before = value.slice(0, atStart);
    const segmentAfterAt = value.slice(atStart + 1).split(/\s/)[0] || '';
    const endOfSegment = atStart + 1 + segmentAfterAt.length;
    const after = value.slice(endOfSegment);
    const newText = before + insert + after;
    onChangeText?.(newText);
    const newMention =
      s.type === 'user'
        ? { type: 'user', userId: s.userId, displayName }
        : s.type === 'group'
          ? { type: 'group', groupId: s.groupId, groupName: s.groupName || displayName }
          : s.type === 'all'
            ? { type: 'all', displayName: 'Alla' }
            : s.type === 'contact'
              ? { type: 'contact', contactId: s.contactId, displayName, ...(s.userId ? { userId: s.userId } : {}) }
              : null;
    if (newMention) onMentionsChange?.([...(mentions || []), newMention]);
    setShowDropdown(false);
    if (inputRef.current?.focus) inputRef.current.focus();
  }, [value, atStart, mentions, onChangeText, onMentionsChange]);

  const handleKeyDown = useCallback((e) => {
    if (!showDropdown || filtered.length === 0) return;
    if (Platform.OS !== 'web') return;
    const key = e?.key;
    if (key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((i) => (i + 1) % filtered.length);
      return;
    }
    if (key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((i) => (i - 1 + filtered.length) % filtered.length);
      return;
    }
    if (key === 'Enter') {
      const clamped = Math.max(0, Math.min(selectedIndex, filtered.length - 1));
      const suggestion = filtered[clamped];
      if (suggestion) {
        e.preventDefault();
        handleSelectSuggestion(suggestion);
      }
      return;
    }
    if (key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
    }
  }, [showDropdown, filtered, selectedIndex, handleSelectSuggestion]);

  return (
    <View ref={wrapRef} style={[styles.wrap, style]}>
      <TextInput
        ref={inputRef}
        value={value}
        onChangeText={handleChangeText}
        onSelectionChange={handleSelectionChange}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        placeholderTextColor="#94A3B8"
        editable={editable}
        multiline={multiline}
        numberOfLines={numberOfLines}
        maxLength={maxLength}
        style={[styles.input, inputStyle, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
      />
      {showDropdown && filtered.length > 0 && (
        <View
          style={[
            styles.dropdown,
            dropdownAbove ? styles.dropdownAbove : styles.dropdownBelow,
          ]}
          pointerEvents="box-none"
        >
          <ScrollView
            style={styles.dropdownScroll}
            keyboardShouldPersistTaps="handled"
            nestedScrollEnabled
          >
            {filtered.map((s, i) => (
              <Pressable
                key={s.type === 'user' ? s.userId : s.type === 'group' ? s.groupId : s.type === 'contact' ? `contact-${s.contactId || s.displayName || i}` : 'all'}
                onPress={() => handleSelectSuggestion(s)}
                style={[styles.dropdownItem, i === selectedIndex && styles.dropdownItemSelected]}
              >
                <Text style={styles.dropdownItemText} numberOfLines={1}>
                  @{getDisplayName(s)}
                </Text>
                {s.type === 'group' && <Text style={styles.dropdownItemMeta}>Grupp</Text>}
                {s.type === 'contact' && <Text style={styles.dropdownItemMeta}>Kontakt</Text>}
                {s.type === 'all' && <Text style={styles.dropdownItemMeta}>Alla i projektet</Text>}
              </Pressable>
            ))}
          </ScrollView>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#0F172A',
    backgroundColor: '#fff',
    minHeight: 56,
    maxHeight: 100,
  },
  dropdown: {
    position: 'absolute',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 220,
    zIndex: 10000,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 12px rgba(0,0,0,0.15)' } : { elevation: 8 }),
  },
  dropdownBelow: {
    top: '100%',
    marginTop: 4,
  },
  dropdownAbove: {
    bottom: '100%',
    marginBottom: 4,
  },
  dropdownScroll: {
    maxHeight: 216,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  dropdownItemSelected: {
    backgroundColor: '#E3F2FD',
  },
  dropdownItemText: {
    fontSize: 14,
    color: '#0F172A',
    flex: 1,
  },
  dropdownItemMeta: {
    fontSize: 11,
    color: '#64748b',
  },
});
