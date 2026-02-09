/**
 * Admin modal: Kunder. Opens from Administration → Kunder in the top banner.
 * Overlays the current view; no navigation. Reuses KunderTable, KundForm, kunderService.
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
import { auth, deleteCompanyContact, fetchCompanyProfile, updateCompanyContact } from '../firebase';
import ContextMenu from '../ContextMenu';
import KundContacts from '../../modules/kunder/KundContacts';
import KundForm from '../../modules/kunder/KundForm';
import KunderTable from '../../modules/kunder/KunderTable';
import {
  createCustomer,
  deleteCustomer,
  fetchContacts,
  fetchCustomers,
  normalizeCustomerType,
  addContactToCustomer,
  linkExistingContactToCustomer,
  removeContactFromCustomer,
  updateCustomer,
} from '../../modules/kunder/kunderService';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
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
  titleIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 18, fontWeight: '600', color: '#0f172a' },
  subtitle: { fontSize: 13, color: '#64748b', marginTop: 2 },
  closeBtn: { padding: 8 },
  statusOverlay: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 100,
    zIndex: 100,
    alignItems: 'center',
    pointerEvents: 'none',
  },
  statusBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 10,
    borderWidth: 1,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  statusBoxSuccess: {
    backgroundColor: '#f0fdf4',
    borderColor: '#bbf7d0',
  },
  statusBoxError: {
    backgroundColor: '#fef2f2',
    borderColor: '#fecaca',
  },
  toolbarSection: {
    flexShrink: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolbarDivider: {
    height: 1,
    backgroundColor: '#e2e8f0',
    marginTop: 12,
    marginHorizontal: -20,
  },
  tableScroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  tableScrollContent: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 24,
  },
  searchWrap: {
    flex: 1,
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0, marginLeft: 8 },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#f1f5f9',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconBtnPrimary: { backgroundColor: '#1976D2', borderColor: '#1976D2' },
  tableWrap: {},
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  modalBack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 18,
    width: 560,
    maxWidth: '96%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  modalClose: { position: 'absolute', right: 12, top: 10, padding: 6 },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  footerBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
});

export default function AdminCustomersModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [customers, setCustomers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlinePersonalOrOrgNumber, setInlinePersonalOrOrgNumber] = useState('');
  const [inlineAddress, setInlineAddress] = useState('');
  const [inlinePostalCode, setInlinePostalCode] = useState('');
  const [inlineCity, setInlineCity] = useState('');
  const [inlineCustomerType, setInlineCustomerType] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuCustomer, setRowMenuCustomer] = useState(null);
  const [contactMenuVisible, setContactMenuVisible] = useState(false);
  const [contactMenuPos, setContactMenuPos] = useState({ x: 20, y: 64 });
  const [contactMenuCustomer, setContactMenuCustomer] = useState(null);
  const [contactMenuContact, setContactMenuContact] = useState(null);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEdit, setContactEdit] = useState({ id: '', name: '', role: '', phone: '', email: '' });

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);

  const loadCustomers = useCallback(async () => {
    if (!cid) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchCustomers(cid);
      setCustomers(data || []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda kunder.');
    } finally {
      setLoading(false);
    }
  }, [cid]);

  const loadContacts = useCallback(async () => {
    if (!cid) {
      setContacts([]);
      return;
    }
    try {
      const data = await fetchContacts(cid);
      setContacts(data || []);
    } catch {
      setContacts([]);
    }
  }, [cid]);

  useEffect(() => {
    if (!visible) return;
    loadCustomers();
    loadContacts();
  }, [visible, loadCustomers, loadContacts]);

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
    return () => {
      if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    };
  }, [notice, error, statusOpacity]);

  useEffect(() => {
    if (!visible || !cid) {
      setCompanyName('');
      return;
    }
    let cancelled = false;
    fetchCompanyProfile(cid)
      .then((profile) => {
        if (!cancelled && profile) {
          setCompanyName(String(profile?.companyName ?? profile?.name ?? '').trim() || cid);
        }
      })
      .catch(() => {
        if (!cancelled) setCompanyName(cid);
      });
    return () => { cancelled = true; };
  }, [visible, cid]);

  const showNotice = (msg) => {
    setError('');
    setNotice(msg);
  };

  const formatWriteError = (e) => {
    const code = e?.code;
    if (code === 'permission-denied') return 'Saknar behörighet.';
    return e?.message || 'Kunde inte spara.';
  };

  const clearInlineForm = () => {
    setInlineName('');
    setInlinePersonalOrOrgNumber('');
    setInlineAddress('');
    setInlinePostalCode('');
    setInlineCity('');
    setInlineCustomerType('');
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const name = String(inlineName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    try {
      await createCustomer(cid, {
        name,
        personalOrOrgNumber: inlinePersonalOrOrgNumber.trim(),
        address: inlineAddress.trim(),
        postalCode: inlinePostalCode.trim(),
        city: inlineCity.trim(),
        customerType: normalizeCustomerType(inlineCustomerType),
      });
      clearInlineForm();
      await loadCustomers();
      showNotice('Kund tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setInlineSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return customers;
    const s = search.toLowerCase().trim();
    return customers.filter((c) => {
      const name = String(c.name ?? '').toLowerCase();
      const pn = String(c.personalOrOrgNumber ?? '').toLowerCase();
      const addr = String(c.address ?? '').toLowerCase();
      const post = String(c.postalCode ?? '').toLowerCase();
      const city = String(c.city ?? '').toLowerCase();
      const type = String(c.customerType ?? '').toLowerCase();
      return name.includes(s) || pn.includes(s) || addr.includes(s) || post.includes(s) || city.includes(s) || type.includes(s);
    });
  }, [customers, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal = '', bVal = '';
      if (sortColumn === 'name') {
        aVal = String(a.name ?? '').trim();
        bVal = String(b.name ?? '').trim();
      } else if (sortColumn === 'personalOrOrgNumber') {
        aVal = String(a.personalOrOrgNumber ?? '').trim();
        bVal = String(b.personalOrOrgNumber ?? '').trim();
      } else if (sortColumn === 'address') {
        aVal = String(a.address ?? '').trim();
        bVal = String(b.address ?? '').trim();
      } else if (sortColumn === 'postalCode') {
        aVal = String(a.postalCode ?? '').trim();
        bVal = String(b.postalCode ?? '').trim();
      } else if (sortColumn === 'city') {
        aVal = String(a.city ?? '').trim();
        bVal = String(b.city ?? '').trim();
      } else if (sortColumn === 'customerType') {
        aVal = String(a.customerType ?? '').trim();
        bVal = String(b.customerType ?? '').trim();
      }
      const cmp = (aVal || '').localeCompare(bVal || '', 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
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

  const editingCustomer = editingId ? (customers.find((c) => c.id === editingId) || null) : null;

  const handleSaveForm = async (values) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateCustomer(cid, editingId, {
          name: values.name,
          personalOrOrgNumber: values.personalOrOrgNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          customerType: values.customerType,
        });
        showNotice('Kund uppdaterad');
      } else {
        await createCustomer(cid, {
          name: values.name,
          personalOrOrgNumber: values.personalOrOrgNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          customerType: values.customerType,
        });
        showNotice('Kund tillagd');
      }
      setFormModalVisible(false);
      setEditingId(null);
      await loadCustomers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveInlineEdit = async (customerId, values) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      await updateCustomer(cid, customerId, {
        name: values.name,
        personalOrOrgNumber: values.personalOrOrgNumber,
        address: values.address,
        postalCode: values.postalCode,
        city: values.city,
        customerType: normalizeCustomerType(values.customerType),
      });
      showNotice('Kund uppdaterad');
      setEditingId(null);
      await loadCustomers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer) => {
    if (!cid) return;
    const label = String(customer.name ?? '').trim() || 'kunden';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`Radera ${label}?`)
        : await new Promise((resolve) => {
            Alert.alert('Radera kund', `Radera ${label}?`, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteCustomer(cid, customer.id);
      showNotice('Kund borttagen');
      if (editingId === customer.id) {
        setFormModalVisible(false);
        setEditingId(null);
      }
      await loadCustomers();
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    }
  };

  const openRowMenu = (e, customer) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kund', String(customer.name ?? 'Kund'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(customer.id) },
        { text: 'Radera', style: 'destructive', onPress: () => handleDelete(customer) },
      ]);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuCustomer(customer);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  const contactMenuItems = [
    { key: 'edit', label: 'Redigera kontakt', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" /> },
  ];

  const contactsByCustomerId = useMemo(() => {
    const out = {};
    (customers || []).forEach((c) => {
      out[c.id] = (c.contactIds || [])
        .map((id) => contacts.find((ct) => ct.id === id))
        .filter(Boolean)
        .map((ct) => ({ id: ct.id, name: ct.name, role: ct.role, email: ct.email, phone: ct.phone }));
    });
    return out;
  }, [customers, contacts]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="people-outline" size={22} color="#1976D2" />
              </View>
              <View>
                <Text style={styles.title}>Kunder</Text>
                <Text style={styles.subtitle}>Administrera kunder</Text>
              </View>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} accessibilityLabel="Stäng">
              <Ionicons name="close" size={24} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Toolbar section: fixed, always visible */}
          <View style={styles.toolbarSection}>
            {!hasCompany ? (
              <View style={styles.selectCompany}>
                <Text style={styles.selectCompanyText}>Välj företag i sidomenyn eller i headern.</Text>
              </View>
            ) : (
              <>
                <View style={styles.toolbar}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color="#64748b" />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Sök namn, person-/orgnr, adress…"
                      placeholderTextColor="#94a3b8"
                      {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => { setFormModalVisible(true); }}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={loadCustomers}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="refresh" size={16} color="#475569" />
                    </TouchableOpacity>
                  </View>
                </View>
              </>
            )}
            <View style={styles.toolbarDivider} />
          </View>

          {/* Scrollable area: only the customer table */}
          <ScrollView
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!hasCompany ? null : (
              <View style={styles.tableWrap}>
                {loading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Laddar kunder…</Text>
                  </View>
                ) : sorted.length === 0 ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>
                      {search ? 'Inga kunder matchade sökningen.' : 'Inga kunder ännu. Lägg till din första kund.'}
                    </Text>
                  </View>
                ) : (
                  <KunderTable
                    customers={sorted}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onRowPress={() => {}}
                    onRowContextMenu={openRowMenu}
                    onRowMenu={openRowMenu}
                    editingId={editingId}
                    inlineSavingCustomer={saving}
                    onSaveEdit={handleSaveInlineEdit}
                    onCancelEdit={() => setEditingId(null)}
                    contactRegistry={contacts}
                    contactsByCustomerId={contactsByCustomerId}
                    onContactMenu={(e, customer, contact) => {
                      const ne = e?.nativeEvent || e;
                      const x = Number(ne?.pageX ?? 20);
                      const y = Number(ne?.pageY ?? 64);
                      setContactMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
                      setContactMenuCustomer(customer);
                      setContactMenuContact(contact);
                      setContactMenuVisible(true);
                    }}
                    onAddContact={async (customer, contact) => {
                      const res = await addContactToCustomer(cid, customer, contact);
                      await loadContacts();
                      setCustomers((prev) =>
                        prev.map((c) =>
                          c.id === customer.id
                            ? { ...c, contactIds: [...(c.contactIds || []), res.contactId].filter(Boolean) }
                            : c
                        )
                      );
                      showNotice('Kontaktperson inlagd');
                    }}
                    onLinkContact={async (customer, contactId, patch) => {
                      await linkExistingContactToCustomer(cid, customer, contactId, patch);
                      await loadContacts();
                      setCustomers((prev) =>
                        prev.map((c) =>
                          c.id === customer.id ? { ...c, contactIds: [...(c.contactIds || []), contactId] } : c
                        )
                      );
                      showNotice('Kontaktperson inlagd');
                    }}
                    onRemoveContact={async (customer, contactId) => {
                      await removeContactFromCustomer(cid, customer, contactId);
                      await loadContacts();
                      setCustomers((prev) =>
                        prev.map((c) =>
                          c.id === customer.id ? { ...c, contactIds: (c.contactIds || []).filter((id) => id !== contactId) } : c
                        )
                      );
                    }}
                    inlineEnabled={hasCompany}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      name: inlineName,
                      personalOrOrgNumber: inlinePersonalOrOrgNumber,
                      address: inlineAddress,
                      postalCode: inlinePostalCode,
                      city: inlineCity,
                      customerType: inlineCustomerType,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'name') setInlineName(value);
                      if (field === 'personalOrOrgNumber') setInlinePersonalOrOrgNumber(value);
                      if (field === 'address') setInlineAddress(value);
                      if (field === 'postalCode') setInlinePostalCode(value);
                      if (field === 'city') setInlineCity(value);
                      if (field === 'customerType') setInlineCustomerType(value);
                    }}
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

          {/* Status overlay: success/error, no layout shift, fade out */}
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

      {/* Add customer form modal (edit is inline in table) */}
      <Modal visible={formModalVisible} transparent animationType="fade" onRequestClose={() => !saving && setFormModalVisible(false)}>
        <Pressable style={styles.modalBack} onPress={() => !saving && setFormModalVisible(false)}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>Lägg till kund</Text>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !saving && setFormModalVisible(false)}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: '75vh' }} contentContainerStyle={{ paddingBottom: 20 }}>
              <KundForm
                initial={undefined}
                saving={saving}
                onSave={handleSaveForm}
                onCancel={() => !saving && setFormModalVisible(false)}
              />
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ContextMenu
        visible={rowMenuVisible}
        x={rowMenuPos.x}
        y={rowMenuPos.y}
        items={rowMenuItems}
        onClose={() => setRowMenuVisible(false)}
        onSelect={(it) => {
          setRowMenuVisible(false);
          const c = rowMenuCustomer;
          if (!c || !it) return;
          if (it.key === 'edit') {
            setEditingId(c.id);
          } else if (it.key === 'delete') {
            handleDelete(c);
          }
        }}
      />

      <ContextMenu
        visible={contactMenuVisible}
        x={contactMenuPos.x}
        y={contactMenuPos.y}
        items={contactMenuItems}
        onClose={() => setContactMenuVisible(false)}
        onSelect={(it) => {
          setContactMenuVisible(false);
          const customer = contactMenuCustomer;
          const contact = contactMenuContact;
          if (!customer || !contact || !it) return;
          if (it.key === 'edit') {
            setContactEdit({
              id: contact.id,
              name: contact.name || '',
              role: contact.role || '',
              phone: contact.phone || '',
              email: contact.email || '',
            });
            setContactEditOpen(true);
          } else if (it.key === 'delete') {
            const ok = Platform.OS === 'web' ? window.confirm('Radera kontaktpersonen?') : undefined;
            if (Platform.OS !== 'web') {
              Alert.alert('Radera kontakt', 'Radera kontaktpersonen?', [
                { text: 'Avbryt', style: 'cancel' },
                {
                  text: 'Radera',
                  style: 'destructive',
                  onPress: async () => {
                    try {
                      await deleteCompanyContact({ id: contact.id }, cid);
                      await removeContactFromCustomer(cid, customer, contact.id);
                      await loadContacts();
                      showNotice('Kontaktperson raderad');
                    } catch (e) {
                      setError(e?.message || 'Kunde inte radera.');
                    }
                  },
                },
              ]);
              return;
            }
            if (ok) {
              (async () => {
                try {
                  await deleteCompanyContact({ id: contact.id }, cid);
                  await removeContactFromCustomer(cid, customer, contact.id);
                  await loadContacts();
                  showNotice('Kontaktperson raderad');
                } catch (e) {
                  setError(e?.message || 'Kunde inte radera.');
                }
              })();
            }
          }
        }}
      />

      {/* Contact edit modal - simplified inline */}
      {contactEditOpen && (
        <Modal visible={contactEditOpen} transparent animationType="fade" onRequestClose={() => !contactEditSaving && setContactEditOpen(false)}>
          <Pressable style={styles.modalBack} onPress={() => !contactEditSaving && setContactEditOpen(false)}>
            <Pressable style={[styles.modalBox, { width: 420 }]} onPress={(e) => e.stopPropagation()}>
              <View style={styles.modalHeader}>
                <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>Redigera kontakt</Text>
                <TouchableOpacity style={styles.modalClose} onPress={() => !contactEditSaving && setContactEditOpen(false)}>
                  <Ionicons name="close" size={22} color="#334155" />
                </TouchableOpacity>
              </View>
              <View style={{ padding: 16, gap: 10 }}>
                <TextInput
                  value={contactEdit.name}
                  onChangeText={(v) => setContactEdit((prev) => ({ ...prev, name: v }))}
                  placeholder="Namn"
                  style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={contactEdit.role}
                  onChangeText={(v) => setContactEdit((prev) => ({ ...prev, role: v }))}
                  placeholder="Roll"
                  style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={contactEdit.phone}
                  onChangeText={(v) => setContactEdit((prev) => ({ ...prev, phone: v }))}
                  placeholder="Telefon"
                  style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                  placeholderTextColor="#94a3b8"
                />
                <TextInput
                  value={contactEdit.email}
                  onChangeText={(v) => setContactEdit((prev) => ({ ...prev, email: v }))}
                  placeholder="E-post"
                  style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                  placeholderTextColor="#94a3b8"
                />
                <View style={{ flexDirection: 'row', gap: 10 }}>
                  <TouchableOpacity
                    style={[styles.iconBtn, styles.iconBtnPrimary, { flex: 1, height: 40, borderRadius: 10 }]}
                    onPress={async () => {
                      if (!contactEdit.name.trim()) return;
                      setContactEditSaving(true);
                      try {
                        await updateCompanyContact(
                          { id: contactEdit.id, patch: { name: contactEdit.name.trim(), role: contactEdit.role.trim(), phone: contactEdit.phone.trim(), email: contactEdit.email.trim() } },
                          cid
                        );
                        await loadContacts();
                        setContactEditOpen(false);
                        showNotice('Kontakt uppdaterad');
                      } catch (e) {
                        setError(e?.message || 'Kunde inte spara.');
                      } finally {
                        setContactEditSaving(false);
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '500' }}>Spara</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[styles.iconBtn, { flex: 1, height: 40, borderRadius: 10 }]} onPress={() => !contactEditSaving && setContactEditOpen(false)}>
                    <Text style={{ color: '#475569', fontWeight: '500' }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </Modal>
  );
}
