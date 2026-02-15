/**
 * ContactPickerCompact – dropdown för tabellcell, visar kontaktnamn och öppnar väljare
 */

import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

function safeText(v) {
  return String(v ?? '').trim();
}

function normalizeKey(s) {
  if (!s) return '';
  return String(s).toLowerCase().normalize('NFD').replace(/\p{Diacritic}+/gu, '');
}

export default function ContactPickerCompact({
  value,
  contacts = [],
  supplierId,
  onPick,
  onCreate,
  disabled,
}) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  const filtered = useMemo(() => {
    const list = Array.isArray(contacts) ? contacts : [];
    const q = normalizeKey(search);
    if (!q) return list.slice(0, 12);
    return list
      .filter((c) => {
        const key = normalizeKey(`${c?.name} ${c?.email} ${c?.contactCompanyName}`);
        return key.includes(q);
      })
      .slice(0, 12);
  }, [contacts, search]);

  const displayName = value ? safeText(value?.name || value) : '';
  const canCreate = search.length >= 2;

  return (
    <View>
      <Pressable
        onPress={() => !disabled && setOpen(true)}
        style={[styles.trigger, disabled && styles.triggerDisabled]}
      >
        <Text style={[styles.triggerText, !displayName && styles.triggerPlaceholder]} numberOfLines={1}>
          {displayName || 'Välj kontakt'}
        </Text>
        <Ionicons name="chevron-down" size={12} color="#64748b" />
      </Pressable>

      <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <Pressable style={styles.panel} onPress={(e) => e?.stopPropagation?.()}>
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Sök kontakt..."
              style={styles.search}
              autoFocus
            />
            <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
              {canCreate ? (
                <Pressable
                  onPress={() => {
                    onCreate?.(search);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, styles.optionCreateRow, pressed && styles.optionPressed]}
                >
                  <Ionicons name="add-circle-outline" size={16} color="#2563eb" />
                  <Text style={styles.optionCreate}>Skapa "{search}"</Text>
                </Pressable>
              ) : null}
              {filtered.map((c) => (
                <Pressable
                  key={c.id}
                  onPress={() => {
                    onPick?.(c);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <Text style={styles.optionText} numberOfLines={1}>{safeText(c?.name) || '—'}</Text>
                  {c?.email ? <Text style={styles.optionMeta} numberOfLines={1}>{c.email}</Text> : null}
                </Pressable>
              ))}
              {filtered.length === 0 && !canCreate ? (
                <Text style={styles.empty}>Inga kontakter</Text>
              ) : null}
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
    minHeight: 28,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  triggerDisabled: { opacity: 0.6 },
  triggerText: { fontSize: 12, color: '#334155', flex: 1 },
  triggerPlaceholder: { color: '#94a3b8' },
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  panel: {
    width: '100%',
    maxWidth: 320,
    maxHeight: 320,
    backgroundColor: '#fff',
    borderRadius: 8,
    overflow: 'hidden',
    padding: 12,
  },
  search: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 6,
    padding: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  list: {
    maxHeight: 220,
  },
  option: {
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  optionPressed: { backgroundColor: 'rgba(15,23,42,0.04)' },
  optionText: { fontSize: 13, color: '#0f172a' },
  optionMeta: { fontSize: 11, color: '#64748b', marginTop: 2 },
  optionCreateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  optionCreate: { fontSize: 13, color: '#2563eb' },
  empty: { fontSize: 12, color: '#94a3b8', padding: 12 },
});
