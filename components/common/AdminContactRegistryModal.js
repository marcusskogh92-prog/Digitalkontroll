/**
 * Admin modal: Kontaktregister. Opens from Administration → Kontaktregister.
 * Same UX as Kunder modal: fixed size, sticky toolbar, scrollable table, status overlay, inline edit.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Animated,
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
import ContextMenu from '../ContextMenu';
import ContactRegistryTable from './ContactRegistryTable';
import {
  createCompanyContact,
  deleteCompanyContact,
  ensureCompaniesFromKunderAndLeverantorer,
  fetchCompanyContacts,
  fetchCompanyProfile,
  searchCompanies,
  updateCompanyContact,
} from '../firebase';

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.4)' },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 1400,
    height: Platform.OS === 'web' ? '85vh' : '85%',
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 16,
    flexDirection: 'column',
  },
  header: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  titleIcon: { width: 40, height: 40, borderRadius: 10, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 8 },
  statusOverlay: { position: 'absolute', left: 20, right: 20, top: 100, zIndex: 100, alignItems: 'center', pointerEvents: 'none' },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 8, elevation: 8 },
  statusBoxSuccess: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusBoxError: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  toolbarSection: { flexShrink: 0, paddingHorizontal: 20, paddingTop: 16, paddingBottom: 12, backgroundColor: '#fff' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarDivider: { height: 1, backgroundColor: '#e2e8f0', marginTop: 12, marginHorizontal: -20 },
  tableScroll: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tableScrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
  searchWrap: { flex: 1, maxWidth: 400, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0, marginLeft: 8 },
  iconBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  iconBtnPrimary: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  tableWrap: {},
  emptyState: { padding: 32, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  footer: { flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
});

export default function AdminContactRegistryModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlineCompanyId, setInlineCompanyId] = useState('');
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [inlineRole, setInlineRole] = useState('');
  const [inlinePhone, setInlinePhone] = useState('');
  const [inlineWorkPhone, setInlineWorkPhone] = useState('');
  const [inlineEmail, setInlineEmail] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuContact, setRowMenuContact] = useState(null);
  const [companySearchResults, setCompanySearchResults] = useState([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearchActive, setCompanySearchActive] = useState(null);
  const companySearchDebounceRef = useRef(null);

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);
  const scrollRef = useRef(null);

  const loadContacts = useCallback(async () => {
    if (!cid) {
      setContacts([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchCompanyContacts(cid);
      setContacts(Array.isArray(data) ? data : []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda kontakter.');
    } finally {
      setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    if (!visible) return;
    loadContacts();
  }, [visible, loadContacts]);

  useEffect(() => {
    if (!visible || !cid) return;
    ensureCompaniesFromKunderAndLeverantorer(cid).catch(() => {});
  }, [visible, cid]);

  const handleCompanySearch = useCallback(
    (query, context) => {
      if (companySearchDebounceRef.current) clearTimeout(companySearchDebounceRef.current);
      const q = String(query ?? '').trim();
      if (q.length < 3) {
        setCompanySearchResults([]);
        setCompanySearchOpen(false);
        setCompanySearchActive(null);
        return;
      }
      setCompanySearchActive(context || 'inline');
      companySearchDebounceRef.current = setTimeout(async () => {
        try {
          const results = await searchCompanies(cid, q);
          setCompanySearchResults(results || []);
          setCompanySearchOpen(true);
        } catch {
          setCompanySearchResults([]);
        }
        companySearchDebounceRef.current = null;
      }, 300);
    },
    [cid]
  );

  const handleSelectCompany = useCallback((company) => {
    if (!company) return;
    setInlineCompanyId(company.id || '');
    setInlineCompanyName(company.name || '');
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setCompanySearchActive(null);
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  useLayoutEffect(() => {
    if (!notice && !error) return;
    statusOpacity.setValue(1);
  }, [notice, error, statusOpacity]);

  useEffect(() => {
    if (!notice && !error) return;
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    const delay = notice ? 3000 : 4000;
    statusTimeoutRef.current = setTimeout(() => {
      Animated.timing(statusOpacity, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => {
        setNotice('');
        setError('');
      });
      statusTimeoutRef.current = null;
    }, delay);
    return () => { if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current); };
  }, [notice, error, statusOpacity]);

  useEffect(() => {
    if (!visible || !cid) {
      setCompanyName('');
      return;
    }
    let cancelled = false;
    fetchCompanyProfile(cid)
      .then((profile) => {
        if (!cancelled && profile) setCompanyName(String(profile?.companyName ?? profile?.name ?? '').trim() || cid);
      })
      .catch(() => { if (!cancelled) setCompanyName(cid); });
    return () => { cancelled = true; };
  }, [visible, cid]);

  const showNotice = (msg) => {
    setError('');
    setNotice(msg);
  };

  const formatWriteError = (e) => {
    if (e?.code === 'permission-denied') return 'Saknar behörighet.';
    return e?.message || 'Kunde inte spara.';
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase().trim();
    return contacts.filter((c) => {
      const n = String(c.name ?? '').toLowerCase();
      const co = String(c.contactCompanyName ?? c.companyName ?? '').toLowerCase();
      const r = String(c.role ?? '').toLowerCase();
      const p = String(c.phone ?? '').toLowerCase();
      const wp = String(c.workPhone ?? '').toLowerCase();
      const e = String(c.email ?? '').toLowerCase();
      return n.includes(q) || co.includes(q) || r.includes(q) || p.includes(q) || wp.includes(q) || e.includes(q);
    });
  }, [contacts, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const cmp = (a, b) => String(a || '').localeCompare(String(b || ''), 'sv');
    list.sort((a, b) => {
      let aVal = '', bVal = '';
      if (sortColumn === 'name') {
        aVal = String(a.name ?? '').trim();
        bVal = String(b.name ?? '').trim();
      } else if (sortColumn === 'contactCompanyName') {
        aVal = String(a.contactCompanyName ?? a.companyName ?? '').trim();
        bVal = String(b.contactCompanyName ?? b.companyName ?? '').trim();
      } else if (sortColumn === 'role') {
        aVal = String(a.role ?? '').trim();
        bVal = String(b.role ?? '').trim();
      } else if (sortColumn === 'phone') {
        aVal = String(a.phone ?? '').trim();
        bVal = String(b.phone ?? '').trim();
      } else if (sortColumn === 'workPhone') {
        aVal = String(a.workPhone ?? '').trim();
        bVal = String(b.workPhone ?? '').trim();
      } else if (sortColumn === 'email') {
        aVal = String(a.email ?? '').trim();
        bVal = String(b.email ?? '').trim();
      }
      const result = cmp(aVal, bVal);
      return sortDirection === 'asc' ? result : -result;
    });
    return list;
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const handleSaveInlineEdit = async (contactId, values) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      const patch = {
        name: values.name.trim(),
        contactCompanyName: values.contactCompanyName.trim(),
        role: values.role.trim(),
        phone: String(values.phone ?? '').replace(/\D/g, ''),
        workPhone: String(values.workPhone ?? '').trim(),
        email: values.email.trim(),
      };
      if (values.companyId != null) patch.companyId = String(values.companyId || '').trim() || null;
      await updateCompanyContact({ id: contactId, patch }, cid);
      showNotice('Kontakt uppdaterad');
      setEditingId(null);
      await loadContacts();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (contact) => {
    if (!cid) return;
    const label = String(contact.name ?? '').trim() || 'kontakten';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`Radera ${label}?`)
        : await new Promise((resolve) => {
            Alert.alert('Radera kontakt', `Radera ${label}?`, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteCompanyContact({ id: contact.id }, cid);
      showNotice('Kontakt borttagen');
      if (editingId === contact.id) setEditingId(null);
      await loadContacts();
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    }
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const name = String(inlineName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    setError('');
    try {
      await createCompanyContact(
        {
          name,
          companyName: companyName || cid,
          contactCompanyName: inlineCompanyName.trim(),
          companyId: inlineCompanyId.trim() || undefined,
          role: inlineRole.trim(),
          phone: String(inlinePhone ?? '').replace(/\D/g, ''),
          workPhone: inlineWorkPhone.trim(),
          email: inlineEmail.trim(),
        },
        cid
      );
      setInlineName('');
      setInlineCompanyId('');
      setInlineCompanyName('');
      setInlineRole('');
      setInlinePhone('');
      setInlineWorkPhone('');
      setInlineEmail('');
      await loadContacts();
      showNotice('Kontakt tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setInlineSaving(false);
    }
  };

  const openRowMenu = (e, contact) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kontakt', String(contact?.name ?? 'Kontakt'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(contact.id) },
        { text: 'Radera', style: 'destructive', onPress: () => handleDelete(contact) },
      ]);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuContact(contact);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="book-outline" size={22} color="#1976D2" />
              </View>
              <View>
                <Text style={styles.title}>Kontaktregister</Text>
                <Text style={styles.subtitle}>Administrera kontakter</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
              <Ionicons name="close" size={24} color="#475569" />
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarSection}>
            {!hasCompany ? (
              <View style={styles.selectCompany}>
                <Text style={styles.selectCompanyText}>Välj företag i sidomenyn eller i headern.</Text>
              </View>
            ) : (
              <View style={styles.toolbar}>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color="#64748b" />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Sök namn, företag, roll, mobil, arbete, e-post…"
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnPrimary]} onPress={() => scrollRef.current?.scrollTo?.({ y: 0, animated: true })} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                    <Ionicons name="add" size={18} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={loadContacts} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                    <Ionicons name="refresh" size={16} color="#475569" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={styles.toolbarDivider} />
          </View>

          <ScrollView ref={scrollRef} style={styles.tableScroll} contentContainerStyle={styles.tableScrollContent} keyboardShouldPersistTaps="handled">
            {!hasCompany ? null : (
              <View style={styles.tableWrap}>
                {loading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Laddar kontakter…</Text>
                  </View>
                ) : sorted.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>
                      {search ? 'Inga kontakter matchade sökningen.' : 'Inga kontakter ännu. Lägg till med raden ovan.'}
                    </Text>
                  </View>
                ) : (
                  <ContactRegistryTable
                    contacts={sorted}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    editingId={editingId}
                    inlineSavingContact={saving}
                    onSaveEdit={handleSaveInlineEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onRowMenu={openRowMenu}
                    inlineEnabled={hasCompany}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      name: inlineName,
                      companyId: inlineCompanyId,
                      contactCompanyName: inlineCompanyName,
                      role: inlineRole,
                      phone: inlinePhone,
                      workPhone: inlineWorkPhone,
                      email: inlineEmail,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'name') setInlineName(value);
                      if (field === 'companyId') setInlineCompanyId(value);
                      if (field === 'contactCompanyName') setInlineCompanyName(value);
                      if (field === 'role') setInlineRole(value);
                      if (field === 'phone') setInlinePhone(value);
                      if (field === 'workPhone') setInlineWorkPhone(value);
                      if (field === 'email') setInlineEmail(value);
                    }}
                    companySearchResults={companySearchResults}
                    companySearchOpen={companySearchOpen}
                    companySearchActive={companySearchActive}
                    setCompanySearchOpen={setCompanySearchOpen}
                    setCompanySearchActive={setCompanySearchActive}
                    onCompanySearch={handleCompanySearch}
                    onSelectCompany={handleSelectCompany}
                    onInlineSave={handleInlineSave}
                  />
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            <TouchableOpacity style={styles.footerBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Stäng</Text>
            </TouchableOpacity>
          </View>

          {(notice || error) ? (
            <Animated.View style={[styles.statusOverlay, { opacity: statusOpacity }]} pointerEvents="none">
              <View style={[styles.statusBox, notice ? styles.statusBoxSuccess : styles.statusBoxError]}>
                {notice ? (
                  <>
                    <Ionicons name="checkmark-circle" size={18} color="#15803d" />
                    <Text style={{ fontSize: 13, color: '#15803d', fontWeight: '500' }}>{notice}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="warning" size={18} color="#dc2626" />
                    <Text style={{ fontSize: 13, color: '#dc2626', fontWeight: '500' }}>{error}</Text>
                  </>
                )}
              </View>
            </Animated.View>
          ) : null}
        </Pressable>
      </Pressable>

      <ContextMenu
        visible={rowMenuVisible}
        x={rowMenuPos.x}
        y={rowMenuPos.y}
        items={rowMenuItems}
        onClose={() => setRowMenuVisible(false)}
        onSelect={(it) => {
          setRowMenuVisible(false);
          const c = rowMenuContact;
          if (!c || !it) return;
          if (it.key === 'edit') setEditingId(c.id);
          else if (it.key === 'delete') handleDelete(c);
        }}
      />
    </Modal>
  );
}
