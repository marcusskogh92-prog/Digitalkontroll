/**
 * PersonSelector - Modal for selecting a single person (internal user or contact).
 * Used by Projektinformation ("Välj kontaktperson").
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSystemModal } from '../../../../../components/common/Modals/SystemModalProvider';
import { fetchCompanyContacts, fetchCompanyMembers } from '../../../../../components/firebase';

function PersonSelectorRow({ selected, name, meta, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ hovered, focused, pressed }) => [
        styles.row,
        (hovered || focused || pressed) ? styles.rowHover : null,
        Platform.OS === 'web' ? styles.rowWeb : null,
      ]}
    >
      {selected ? <View pointerEvents="none" style={styles.rowSelectedIndicator} /> : null}
      <Text style={styles.rowName} numberOfLines={1}>{String(name || '—')}</Text>
      <Text style={styles.rowMeta} numberOfLines={1}>{String(meta || '')}</Text>
    </Pressable>
  );
}

function PersonSelectorContent({
  requestClose,
  onSelect,
  companyId,
  value = null, // { type: 'user'|'contact', id: string, name: string, email?: string, phone?: string }
  placeholder = 'Välj person...',
  label = 'Person'
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    loadData();
  }, [companyId]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load users
      const members = await fetchCompanyMembers(companyId);
      const resolvedMembers = Array.isArray(members?.out) ? members.out : (Array.isArray(members) ? members : []);
      const userList = Array.isArray(resolvedMembers) ? resolvedMembers.map(m => ({
        type: 'user',
        id: m.uid || m.id,
        name: m.displayName || m.name || m.email || 'Okänd användare',
        email: m.email || null,
        phone: m.phone || null,
        role: m.role || null
      })) : [];
      setUsers(userList);

      // Load contacts
      const contactList = await fetchCompanyContacts(companyId);
      const formattedContacts = Array.isArray(contactList) ? contactList.map(c => ({
        type: 'contact',
        id: c.id,
        name: c.name || 'Okänd kontakt',
        email: c.email || null,
        phone: c.phone || null,
        role: c.role || null,
        companyName: c.contactCompanyName || c.companyName || null
      })) : [];
      setContacts(formattedContacts);
    } catch (error) {
      console.error('[PersonSelector] Error loading data:', error);
      setUsers([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  };

  const normalizeSearch = (s) => String(s || '').trim().toLowerCase();
  const q = normalizeSearch(search);

  const merged = [...(Array.isArray(users) ? users : []), ...(Array.isArray(contacts) ? contacts : [])]
    .map((p) => {
      const id = String(p?.id || '').trim();
      const type = String(p?.type || '').trim();
      if (!id || !type) return null;
      return { ...p, _key: `${type}:${id}` };
    })
    .filter(Boolean)
    .filter((p) => {
      if (!q) return true;
      const hay = [p?.name, p?.email, p?.phone, p?.role, p?.companyName]
        .map((x) => String(x || '').toLowerCase())
        .join(' ');
      return hay.includes(q);
    })
    .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'sv'));

  const handleSelect = (person) => {
    if (onSelect) {
      onSelect(person);
    }
    requestClose();
  };

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.iconBadge}>
            <Ionicons name="person-outline" size={16} color="#1976D2" />
          </View>
          <View style={{ minWidth: 0 }}>
            <Text style={styles.title} numberOfLines={1}>{label || placeholder}</Text>
            <Text style={styles.subtitle} numberOfLines={1}>Sök bland interna användare och kontakter</Text>
          </View>
        </View>

        <Pressable
          onPress={requestClose}
          title={Platform.OS === 'web' ? 'Stäng' : undefined}
          style={({ hovered, pressed }) => [
            styles.secondaryButton,
            hovered || pressed ? styles.secondaryButtonHot : null,
            Platform.OS === 'web' ? { cursor: 'pointer' } : null,
          ]}
        >
          {({ hovered, pressed }) => (
            <Text style={[styles.secondaryButtonLabel, { color: (hovered || pressed) ? '#1976D2' : '#6B7280' }]}>Stäng</Text>
          )}
        </Pressable>
      </View>

      <View style={styles.body}>
        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={16} color="#6B7280" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Sök namn, företag, e-post, telefon"
            placeholderTextColor="#94A3B8"
            style={[styles.input, Platform.OS === 'web' ? { outline: 'none' } : null]}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.listBox}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.emptyRow}>
                <Text style={styles.helperText}>Laddar…</Text>
              </View>
            ) : (
              <>
                {merged.length === 0 ? (
                  <View style={styles.emptyRow}>
                    <Text style={styles.helperText}>Inga träffar.</Text>
                  </View>
                ) : (
                  merged.slice(0, 300).map((p) => {
                    const selected = value && String(value?.id || '') === String(p?.id || '') && String(value?.type || '') === String(p?.type || '');

                    const metaParts = [];
                    const role = String(p?.role || '').trim();
                    const companyName = String(p?.companyName || '').trim();
                    const email = String(p?.email || '').trim();
                    if (role) metaParts.push(role);
                    if (companyName) metaParts.push(companyName);
                    if (email) metaParts.push(email);
                    const meta = metaParts.join(' • ');
                    const metaText = meta || (p.type === 'user' ? 'Intern användare' : 'Kontakt');

                    return (
                      <PersonSelectorRow
                        key={p._key}
                        selected={selected}
                        name={p?.name}
                        meta={metaText}
                        onPress={() => handleSelect(p)}
                      />
                    );
                  })
                )}
              </>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  );
}

export default function PersonSelector({
  visible,
  onClose,
  onSelect,
  companyId,
  value = null,
  placeholder = 'Välj person...',
  label = 'Person'
}) {
  const { openSystemModal, closeSystemModal } = useSystemModal();
  const modalIdRef = React.useRef(null);

  useEffect(() => {
    if (visible && !modalIdRef.current) {
      modalIdRef.current = openSystemModal({
        component: PersonSelectorContent,
        props: {
          onSelect,
          companyId,
          value,
          placeholder,
          label,
        },
        onClose,
      });
      return;
    }

    if (!visible && modalIdRef.current) {
      closeSystemModal(modalIdRef.current);
      modalIdRef.current = null;
    }
  }, [visible, openSystemModal, closeSystemModal, onClose, onSelect, companyId, value, placeholder, label]);

  useEffect(() => {
    return () => {
      if (modalIdRef.current) {
        closeSystemModal(modalIdRef.current);
        modalIdRef.current = null;
      }
    };
  }, [closeSystemModal]);

  return null;
}

const styles = StyleSheet.create({
  card: {
    width: '100%',
    maxWidth: 720,
    backgroundColor: '#fff',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 32px rgba(0,0,0,0.20)' } : { elevation: 6 }),
  },
  header: {
    paddingHorizontal: 18,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E6E8EC',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    minWidth: 0,
  },
  iconBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: '500',
    color: '#111',
  },
  subtitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  body: {
    padding: 18,
    gap: 12,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 13,
    fontWeight: '400',
    backgroundColor: '#fff',
    color: '#111',
  },
  listBox: {
    borderWidth: 1,
    borderColor: '#EEF0F3',
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#fff',
    height: 420,
  },
  list: {
    flex: 1,
  },
  emptyRow: {
    paddingVertical: 14,
    paddingHorizontal: 12,
    flex: 1,
    justifyContent: 'center',
  },
  helperText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  row: {
    position: 'relative',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF0F3',
    backgroundColor: '#fff',
  },
  rowHover: {
    backgroundColor: '#F6F8FB',
  },
  rowWeb: Platform.OS === 'web' ? {
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
    transitionTimingFunction: 'ease',
  } : {},
  rowSelectedIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#1976D2',
  },
  rowName: {
    fontSize: 13,
    fontWeight: '400',
    color: '#111',
  },
  rowMeta: {
    marginTop: 2,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  secondaryButton: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#fff',
  },
  secondaryButtonHot: {
    backgroundColor: '#F8FAFC',
  },
  secondaryButtonLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
});
