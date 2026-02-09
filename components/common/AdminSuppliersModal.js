/**
 * Admin modal: Leverantörer. Opens from Administration → Leverantörer.
 * Same UX as Kunder/Kontaktregister: fixed header, fixed toolbar, scrollable table only.
 * Inline add + inline edit (kebab → Redigera), Enter/Esc, status overlay.
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
import { fetchCompanyProfile } from '../firebase';
import ContextMenu from '../ContextMenu';
import LeverantorerTable from '../../modules/leverantorer/LeverantorerTable';
import {
  createSupplier,
  deleteSupplier,
  fetchContacts,
  fetchSuppliers,
  updateSupplier,
} from '../../modules/leverantorer/leverantorerService';

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
  statusBoxSuccess: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusBoxError: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
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

export default function AdminSuppliersModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [contacts, setContacts] = useState([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('companyName');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [inlineOrganizationNumber, setInlineOrganizationNumber] = useState('');
  const [inlineAddress, setInlineAddress] = useState('');
  const [inlinePostalCode, setInlinePostalCode] = useState('');
  const [inlineCity, setInlineCity] = useState('');
  const [inlineCategory, setInlineCategory] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuSupplier, setRowMenuSupplier] = useState(null);

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);

  const loadSuppliers = useCallback(async () => {
    if (!cid) {
      setSuppliers([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchSuppliers(cid);
      setSuppliers(data || []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda leverantörer.');
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
    loadSuppliers();
    loadContacts();
  }, [visible, loadSuppliers, loadContacts]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = prev;
      };
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
    return () => {
      cancelled = true;
    };
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
    setInlineCompanyName('');
    setInlineOrganizationNumber('');
    setInlineAddress('');
    setInlinePostalCode('');
    setInlineCity('');
    setInlineCategory('');
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const name = String(inlineCompanyName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    try {
      await createSupplier(cid, {
        companyName: name,
        organizationNumber: inlineOrganizationNumber.trim(),
        address: inlineAddress.trim(),
        postalCode: inlinePostalCode.trim(),
        city: inlineCity.trim(),
        category: inlineCategory.trim(),
      });
      clearInlineForm();
      await loadSuppliers();
      showNotice('Leverantör tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setInlineSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const s = search.toLowerCase().trim();
    return suppliers.filter((sup) => {
      const name = String(sup.companyName ?? '').toLowerCase();
      const orgnr = String(sup.organizationNumber ?? '').toLowerCase();
      const addr = String(sup.address ?? '').toLowerCase();
      const post = String(sup.postalCode ?? '').toLowerCase();
      const city = String(sup.city ?? '').toLowerCase();
      const cat = String(sup.category ?? (Array.isArray(sup.categories) ? sup.categories.join(' ') : '')).toLowerCase();
      return name.includes(s) || orgnr.includes(s) || addr.includes(s) || post.includes(s) || city.includes(s) || cat.includes(s);
    });
  }, [suppliers, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortColumn === 'companyName') {
        aVal = String(a.companyName ?? '').trim();
        bVal = String(b.companyName ?? '').trim();
      } else if (sortColumn === 'organizationNumber') {
        aVal = String(a.organizationNumber ?? '').trim();
        bVal = String(b.organizationNumber ?? '').trim();
      } else if (sortColumn === 'address') {
        aVal = String(a.address ?? '').trim();
        bVal = String(b.address ?? '').trim();
      } else if (sortColumn === 'postalCode') {
        aVal = String(a.postalCode ?? '').trim();
        bVal = String(b.postalCode ?? '').trim();
      } else if (sortColumn === 'city') {
        aVal = String(a.city ?? '').trim();
        bVal = String(b.city ?? '').trim();
      } else if (sortColumn === 'category') {
        aVal = String(a.category ?? (Array.isArray(a.categories) ? a.categories[0] : '')).trim();
        bVal = String(b.category ?? (Array.isArray(b.categories) ? b.categories[0] : '')).trim();
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

  const handleSaveInlineEdit = async (supplierId, values) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      await updateSupplier(cid, supplierId, {
        companyName: values.companyName,
        organizationNumber: values.organizationNumber,
        address: values.address,
        postalCode: values.postalCode,
        city: values.city,
        category: values.category,
      });
      showNotice('Leverantör uppdaterad');
      setEditingId(null);
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier) => {
    if (!cid) return;
    const label = String(supplier.companyName ?? '').trim() || 'leverantören';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`Radera ${label}?`)
        : await new Promise((resolve) => {
            Alert.alert('Radera leverantör', `Radera ${label}?`, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteSupplier(cid, supplier.id);
      showNotice('Leverantör borttagen');
      if (editingId === supplier.id) setEditingId(null);
      await loadSuppliers();
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    }
  };

  const openRowMenu = (e, supplier) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Leverantör', String(supplier.companyName ?? 'Leverantör'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(supplier.id) },
        { text: 'Radera', style: 'destructive', onPress: () => handleDelete(supplier) },
      ]);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuSupplier(supplier);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  const contactsBySupplierId = useMemo(() => {
    const out = {};
    (suppliers || []).forEach((s) => {
      const ids = s.contactIds || [];
      out[s.id] = ids
        .map((id) => contacts.find((c) => c.id === id))
        .filter(Boolean)
        .map((c) => ({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone }));
    });
    return out;
  }, [suppliers, contacts]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.box} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="business-outline" size={22} color="#1976D2" />
              </View>
              <View>
                <Text style={styles.title}>Leverantörer</Text>
                <Text style={styles.subtitle}>Administrera leverantörer</Text>
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
              <>
                <View style={styles.toolbar}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color="#64748b" />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Sök namn, orgnr, adress, kategori…"
                      placeholderTextColor="#94a3b8"
                      {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => {}}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={loadSuppliers}
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

          <ScrollView
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            keyboardShouldPersistTaps="handled"
          >
            {!hasCompany ? null : (
              <View style={styles.tableWrap}>
                {loading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Laddar leverantörer…</Text>
                  </View>
                ) : (
                  <LeverantorerTable
                    suppliers={sorted}
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
                    contactsBySupplierId={contactsBySupplierId}
                    inlineEnabled={hasCompany}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      companyName: inlineCompanyName,
                      organizationNumber: inlineOrganizationNumber,
                      address: inlineAddress,
                      postalCode: inlinePostalCode,
                      city: inlineCity,
                      category: inlineCategory,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'companyName') setInlineCompanyName(value);
                      if (field === 'organizationNumber') setInlineOrganizationNumber(value);
                      if (field === 'address') setInlineAddress(value);
                      if (field === 'postalCode') setInlinePostalCode(value);
                      if (field === 'city') setInlineCity(value);
                      if (field === 'category') setInlineCategory(value);
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
          const s = rowMenuSupplier;
          if (!s || !it) return;
          if (it.key === 'edit') setEditingId(s.id);
          else if (it.key === 'delete') handleDelete(s);
        }}
      />
    </Modal>
  );
}
