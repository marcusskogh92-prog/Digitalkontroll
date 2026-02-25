/**
 * Enkel modal för att välja konton (t.ex. för leverantörsformuläret).
 * Tunn mörk banner, sökruta, lista med checkboxes, Stäng / Spara val.
 * Flyttbar och storleksjusterbar på webb (golden rule).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useMemo, useState } from 'react';
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useDraggableResizableModal } from '../../../hooks/useDraggableResizableModal';
import { MODAL_DESIGN_2026 as D } from '../../../constants/modalDesign2026';

const HEADER_BG = D.headerNeutral?.backgroundColor ?? '#1E2A38';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: D.overlayBg,
  },
  box: {
    backgroundColor: '#fff',
    borderRadius: D.radius,
    overflow: 'hidden',
    flexDirection: 'column',
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow } : D.shadowNative),
  },
  /** Tunn mörk banner – samma färg som övriga modaler */
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    minHeight: 36,
    maxHeight: 38,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    backgroundColor: HEADER_BG,
  },
  title: {
    fontSize: 14,
    fontWeight: '600',
    color: D.headerNeutralTextColor,
  },
  closeBtn: {
    padding: 4,
    margin: -4,
    borderRadius: 4,
    backgroundColor: 'transparent',
  },
  content: {
    flex: 1,
    minHeight: 0,
    padding: 12,
  },
  searchWrap: {
    marginBottom: 10,
  },
  searchInput: {
    height: 34,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 13,
    color: '#111',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {}),
  },
  scroll: {
    flex: 1,
    minHeight: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    gap: 10,
  },
  checkbox: {
    width: 18,
    height: 18,
    borderRadius: 4,
    borderWidth: 2,
    borderColor: '#cbd5e1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#2563eb',
    borderColor: '#2563eb',
  },
  rowLabel: {
    fontSize: 13,
    color: '#334155',
    flex: 1,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderTopWidth: 1,
    borderTopColor: '#eee',
    gap: 10,
  },
  btnStang: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: D.buttonRadius,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  btnStangText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#b91c1c',
  },
  btnSpara: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: D.buttonRadius,
    backgroundColor: '#475569',
  },
  btnSparaText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#fff',
  },
});

function getKontoValue(account) {
  return account.konto ?? account.id ?? '';
}

function getAccountLabel(acc) {
  const value = getKontoValue(acc);
  const ben = (acc.benamning ?? '').trim();
  return ben ? `${value} – ${ben}` : value || '—';
}

export default function SimpleKontonSelectModal({
  visible,
  onClose,
  accounts = [],
  selectedIds = [],
  onSave,
}) {
  const [localSelected, setLocalSelected] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(!!visible, {
    defaultWidth: 380,
    defaultHeight: 400,
    minWidth: 320,
    minHeight: 320,
  });

  useEffect(() => {
    if (visible) {
      setLocalSelected(Array.isArray(selectedIds) ? [...selectedIds] : []);
      setSearchQuery('');
    }
  }, [visible, selectedIds]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, onClose]);

  const filteredAccounts = useMemo(() => {
    const list = Array.isArray(accounts) ? accounts : [];
    const q = (searchQuery || '').trim().toLowerCase();
    if (!q) return list;
    return list.filter((acc) => {
      const label = getAccountLabel(acc);
      return label.toLowerCase().includes(q);
    });
  }, [accounts, searchQuery]);

  const toggle = (value) => {
    if (!value) return;
    setLocalSelected((prev) => {
      const set = new Set(prev);
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return Array.from(set);
    });
  };

  const handleSave = () => {
    onSave?.(localSelected);
    onClose?.();
  };

  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[styles.box, boxStyle]} onPress={(e) => e.stopPropagation()}>
          <View
            style={[styles.header, headerProps?.style]}
            {...(Platform.OS === 'web' && headerProps?.onMouseDown ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <Text style={styles.title} numberOfLines={1}>Välj konton</Text>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              hitSlop={12}
              {...(Platform.OS === 'web' ? { cursor: 'pointer', onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons name="close" size={18} color={D.headerNeutralCloseIconColor} />
            </TouchableOpacity>
          </View>

          <View style={styles.content}>
            <View style={styles.searchWrap}>
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Sök konto eller benämning..."
                placeholderTextColor="#94a3b8"
              />
            </View>
            <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
              {filteredAccounts.map((acc) => {
                const value = getKontoValue(acc);
                const label = getAccountLabel(acc);
                const isSelected = localSelected.includes(value);
                return (
                  <TouchableOpacity
                    key={value}
                    style={styles.row}
                    onPress={() => toggle(value)}
                    activeOpacity={0.7}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <View style={[styles.checkbox, isSelected ? styles.checkboxChecked : null]}>
                      {isSelected ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
                    </View>
                    <Text style={styles.rowLabel} numberOfLines={1}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {(!accounts || accounts.length === 0) ? (
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.rowLabel, { color: '#94a3b8' }]}>Inga konton i företagets kontoplan.</Text>
                </View>
              ) : filteredAccounts.length === 0 ? (
                <View style={[styles.row, { borderBottomWidth: 0 }]}>
                  <Text style={[styles.rowLabel, { color: '#94a3b8' }]}>Ingen träff.</Text>
                </View>
              ) : null}
            </ScrollView>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.btnStang}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.btnStangText}>Stäng</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSave}
              style={styles.btnSpara}
              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
            >
              <Text style={styles.btnSparaText}>Spara val</Text>
            </TouchableOpacity>
          </View>

          {resizeHandles}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
