/**
 * PersonSelector - Modal for selecting a single person (internal user or contact).
 * Used by Projektinformation ("Välj kontaktperson").
 * Golden rule: neutralCompact header, mörk banner 28px, tokens from modalDesign2026.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { MODAL_DESIGN_2026 as D } from '../../../../../constants/modalDesign2026';
import { ICON_RAIL } from '../../../../../constants/iconRailTheme';
import { useSystemModal } from '../../../../../components/common/Modals/SystemModalProvider';
import { createCompanyContact, fetchCompanyContacts, fetchCompanyMembers } from '../../../../../components/firebase';

function PersonSelectorRow({ selected, name, meta, onPress }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: !!selected }}
      style={({ hovered, pressed }) => [
        styles.row,
        (hovered || pressed) ? styles.rowHover : null,
        Platform.OS === 'web' ? styles.rowWeb : null,
      ]}
    >
      {selected ? <View pointerEvents="none" style={styles.rowSelectedIndicator} /> : null}
      <Text style={styles.rowName} numberOfLines={1}>{String(name || '—')}</Text>
      <Text style={styles.rowMeta} numberOfLines={1}>{String(meta || '')}</Text>
    </Pressable>
  );
}

function CollapsibleSection({ title, count, defaultOpen = true, children }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View>
      <Pressable
        onPress={() => setOpen((v) => !v)}
        style={({ hovered }) => [
          styles.sectionHeader,
          Platform.OS === 'web' && hovered ? styles.sectionHeaderHover : null,
        ]}
      >
        <Ionicons name={open ? 'chevron-down' : 'chevron-forward'} size={14} color="#475569" />
        <Text style={styles.sectionHeaderText}>{title}</Text>
        {typeof count === 'number' ? (
          <Text style={styles.sectionHeaderCount}>({count})</Text>
        ) : null}
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function PersonSelectorContent({
  requestClose,
  onSelect,
  companyId,
  filterCompanyId = null,
  value = null,
  placeholder = 'Välj person...',
  label = 'Person'
}) {
  const [search, setSearch] = useState('');
  const [users, setUsers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [addMode, setAddMode] = useState(false);
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState('');
  const [addPhone, setAddPhone] = useState('');
  const [addEmail, setAddEmail] = useState('');
  const [addSaving, setAddSaving] = useState(false);

  const loadData = useCallback(async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const members = await fetchCompanyMembers(companyId);
      const resolvedMembers = Array.isArray(members?.out) ? members.out : (Array.isArray(members) ? members : []);
      setUsers(
        Array.isArray(resolvedMembers)
          ? resolvedMembers.map((m) => ({
              type: 'user',
              id: m.uid || m.id,
              name: m.displayName || m.name || m.email || 'Okänd användare',
              email: m.email || null,
              phone: m.phone || null,
              role: m.role || null,
            }))
          : []
      );
      const contactList = await fetchCompanyContacts(companyId);
      setContacts(
        Array.isArray(contactList)
          ? contactList.map((c) => ({
              type: 'contact',
              id: c.id,
              name: c.name || 'Okänd kontakt',
              email: c.email || null,
              phone: c.phone || null,
              workPhone: c.workPhone || null,
              role: c.role || null,
              companyName: c.contactCompanyName || null,
              linkedSupplierId: c.linkedSupplierId || null,
              customerId: c.customerId || null,
            }))
          : []
      );
    } catch (error) {
      console.error('[PersonSelector] Error loading data:', error);
      setUsers([]);
      setContacts([]);
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const q = String(search || '').trim().toLowerCase();
  const fcid = String(filterCompanyId || '').trim();

  const all = useMemo(() => {
    const merged = [...users, ...contacts]
      .map((p) => {
        const id = String(p?.id || '').trim();
        const type = String(p?.type || '').trim();
        if (!id || !type) return null;
        return { ...p, _key: `${type}:${id}` };
      })
      .filter(Boolean);
    if (!q) return merged.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'sv'));
    return merged
      .filter((p) => {
        const hay = [p?.name, p?.email, p?.phone, p?.role, p?.companyName]
          .map((x) => String(x || '').toLowerCase())
          .join(' ');
        return hay.includes(q);
      })
      .sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'sv'));
  }, [users, contacts, q]);

  const isCompanyMatch = useCallback(
    (p) => {
      if (!fcid) return false;
      return String(p?.linkedSupplierId || '').trim() === fcid || String(p?.customerId || '').trim() === fcid;
    },
    [fcid]
  );

  const companyContacts = useMemo(() => (fcid ? all.filter((p) => p.type === 'contact' && isCompanyMatch(p)) : []), [fcid, all, isCompanyMatch]);
  const otherPeople = useMemo(() => (fcid ? all.filter((p) => !(p.type === 'contact' && isCompanyMatch(p))) : all), [fcid, all, isCompanyMatch]);

  const handleSelect = useCallback(
    (person) => {
      onSelect?.(person);
      requestClose();
    },
    [onSelect, requestClose]
  );

  const handleAddContact = useCallback(async () => {
    const name = addName.trim();
    if (!name || !companyId) return;
    setAddSaving(true);
    try {
      const id = await createCompanyContact(
        {
          name,
          companyName: companyId,
          contactCompanyName: '',
          role: addRole.trim(),
          phone: addPhone.trim().replace(/\D/g, ''),
          workPhone: '',
          email: addEmail.trim(),
        },
        companyId
      );
      const newPerson = { type: 'contact', id, name, email: addEmail.trim() || null, phone: addPhone.trim() || null, role: addRole.trim() || null };
      onSelect?.(newPerson);
      requestClose();
    } catch (e) {
      console.error('[PersonSelector] Error creating contact:', e);
    } finally {
      setAddSaving(false);
    }
  }, [addName, addRole, addPhone, addEmail, companyId, onSelect, requestClose]);

  const renderRow = useCallback(
    (p) => {
      const selected = value && String(value?.id || '') === String(p?.id || '') && String(value?.type || '') === String(p?.type || '');
      const metaParts = [];
      const role = String(p?.role || '').trim();
      const companyName = String(p?.companyName || '').trim();
      const email = String(p?.email || '').trim();
      if (role) metaParts.push(role);
      if (companyName) metaParts.push(companyName);
      if (email) metaParts.push(email);
      const meta = metaParts.join(' · ');
      const metaText = meta || (p.type === 'user' ? `user · ${String(p?.email || '').trim()}` : 'Kontakt');
      return <PersonSelectorRow key={p._key} selected={selected} name={p?.name} meta={metaText} onPress={() => handleSelect(p)} />;
    },
    [value, handleSelect]
  );

  return (
    <View style={styles.card}>
      {/* Golden rule: neutralCompact header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerIcon}>
            <Ionicons name="person-outline" size={14} color="#fff" />
          </View>
          <Text style={styles.headerTitle} numberOfLines={1}>{label || placeholder}</Text>
          <Text style={styles.headerDot}>—</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>Sök bland interna användare och kontakter</Text>
        </View>
        <Pressable
          onPress={requestClose}
          style={({ hovered }) => [styles.headerCloseBtn, hovered ? styles.headerCloseBtnHover : null]}
        >
          <Ionicons name="close" size={18} color="#fff" />
        </Pressable>
      </View>

      <View style={styles.body}>
        {/* Search + add button */}
        <View style={styles.toolbarRow}>
          <View style={styles.searchWrap}>
            <Ionicons name="search-outline" size={14} color="#94a3b8" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Sök namn, företag, e-post, telefon"
              placeholderTextColor="#94a3b8"
              style={[styles.searchInput, Platform.OS === 'web' ? { outlineStyle: 'none' } : null]}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
          <TouchableOpacity
            style={styles.addBtn}
            onPress={() => setAddMode((v) => !v)}
            activeOpacity={0.8}
            {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
          >
            <Ionicons name={addMode ? 'close' : 'add'} size={16} color="#fff" />
            <Text style={styles.addBtnText}>{addMode ? 'Avbryt' : 'Ny kontakt'}</Text>
          </TouchableOpacity>
        </View>

        {addMode ? (
          <View style={styles.addForm}>
            <View style={styles.addFormRow}>
              <View style={styles.addFormField}>
                <Text style={styles.addFormLabel}>Namn *</Text>
                <TextInput value={addName} onChangeText={setAddName} placeholder="Förnamn Efternamn" style={styles.addFormInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addFormField}>
                <Text style={styles.addFormLabel}>Roll</Text>
                <TextInput value={addRole} onChangeText={setAddRole} placeholder="t.ex. Platschef" style={styles.addFormInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
            </View>
            <View style={styles.addFormRow}>
              <View style={styles.addFormField}>
                <Text style={styles.addFormLabel}>Telefon</Text>
                <TextInput value={addPhone} onChangeText={setAddPhone} placeholder="07x xxx xx xx" keyboardType="phone-pad" style={styles.addFormInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addFormField}>
                <Text style={styles.addFormLabel}>E-post</Text>
                <TextInput value={addEmail} onChangeText={setAddEmail} placeholder="namn@foretag.se" keyboardType="email-address" autoCapitalize="none" style={styles.addFormInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
            </View>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <TouchableOpacity style={styles.addFormCancelBtn} onPress={() => setAddMode(false)} activeOpacity={0.8}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#b91c1c' }}>Avbryt</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.addFormSaveBtn, (!addName.trim() || addSaving) ? { opacity: 0.5 } : null]} onPress={handleAddContact} disabled={!addName.trim() || addSaving} activeOpacity={0.8}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#fff' }}>{addSaving ? 'Sparar…' : 'Skapa & välj'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {/* Person list */}
        <View style={styles.listBox}>
          <ScrollView style={styles.list} keyboardShouldPersistTaps="handled">
            {loading ? (
              <View style={styles.emptyRow}>
                <Text style={styles.helperText}>Laddar…</Text>
              </View>
            ) : all.length === 0 ? (
              <View style={styles.emptyRow}>
                <Text style={styles.helperText}>Inga träffar.</Text>
              </View>
            ) : (
              <>
                {companyContacts.length > 0 ? (
                  <CollapsibleSection title="Kontakter inom företaget" count={companyContacts.length} defaultOpen={true}>
                    {companyContacts.map(renderRow)}
                  </CollapsibleSection>
                ) : null}
                {otherPeople.length > 0 ? (
                  <CollapsibleSection title="Övriga" count={otherPeople.length} defaultOpen={!fcid || companyContacts.length === 0}>
                    {otherPeople.map(renderRow)}
                  </CollapsibleSection>
                ) : null}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.footerCloseBtn} onPress={requestClose} activeOpacity={0.8}>
          <Text style={styles.footerCloseBtnText}>Stäng</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

export default function PersonSelector({
  visible,
  onClose,
  onSelect,
  companyId,
  filterCompanyId = null,
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
          filterCompanyId,
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
  }, [visible, openSystemModal, closeSystemModal, onClose, onSelect, companyId, filterCompanyId, value, placeholder, label]);

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
    maxWidth: 680,
    backgroundColor: '#fff',
    borderRadius: D.radius,
    overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: D.shadow || '0 10px 30px rgba(0,0,0,0.08)' } : D.shadowNative || {}),
  },
  header: {
    backgroundColor: ICON_RAIL.bg,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    minHeight: 28,
    maxHeight: 28,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    minWidth: 0,
  },
  headerIcon: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 12,
    fontWeight: '400',
    color: '#fff',
    lineHeight: 16,
  },
  headerDot: {
    fontSize: 11,
    color: ICON_RAIL.iconColor,
    marginHorizontal: 3,
    opacity: 0.8,
  },
  headerSubtitle: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '400',
    opacity: 0.85,
    flexShrink: 1,
    minWidth: 0,
  },
  headerCloseBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: 'transparent',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  headerCloseBtnHover: {
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  body: {
    padding: D.contentPadding,
    gap: 12,
  },
  toolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
    padding: 0,
    marginLeft: 8,
  },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    backgroundColor: '#2D3A4B',
  },
  addBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
  addForm: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: D.radius,
    backgroundColor: '#f8fafc',
    padding: 14,
    gap: 10,
  },
  addFormRow: {
    flexDirection: 'row',
    gap: 10,
  },
  addFormField: {
    flex: 1,
  },
  addFormLabel: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    marginBottom: 4,
  },
  addFormInput: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    paddingVertical: 8,
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#111',
    backgroundColor: '#fff',
  },
  addFormCancelBtn: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  addFormSaveBtn: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    backgroundColor: '#2D3A4B',
  },
  listBox: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: D.radius,
    overflow: 'hidden',
    backgroundColor: '#fff',
    maxHeight: 380,
  },
  list: {
    flex: 1,
  },
  emptyRow: {
    paddingVertical: 20,
    paddingHorizontal: 14,
    alignItems: 'center',
  },
  helperText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  sectionHeaderHover: {
    backgroundColor: '#f1f5f9',
  },
  sectionHeaderText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHeaderCount: {
    fontSize: 11,
    fontWeight: '400',
    color: '#94a3b8',
  },
  row: {
    position: 'relative',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
    backgroundColor: '#fff',
  },
  rowHover: {
    backgroundColor: '#f8fafc',
  },
  rowWeb: Platform.OS === 'web' ? {
    cursor: 'pointer',
    transitionProperty: 'background-color',
    transitionDuration: '100ms',
  } : {},
  rowSelectedIndicator: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: '#2D3A4B',
  },
  rowName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0f172a',
  },
  rowMeta: {
    marginTop: 1,
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: D.footer.paddingVertical,
    paddingHorizontal: D.footer.paddingHorizontal,
    borderTopWidth: D.footer.borderTopWidth,
    borderTopColor: D.footer.borderTopColor,
    backgroundColor: D.footer.backgroundColor,
  },
  footerCloseBtn: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    backgroundColor: '#2D3A4B',
  },
  footerCloseBtnText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#fff',
  },
});
