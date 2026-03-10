/**
 * Kunder – huvudvy (samma layout som Leverantörer, separat data).
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { HomeHeader } from '../../components/common/HomeHeader';
import ContextMenu from '../../components/ContextMenu';
import { auth, deleteCompanyContact, ensureCompaniesFromKunderAndLeverantorer, fetchCompanyProfile, updateCompanyContact } from '../../components/firebase';
import MainLayout from '../../components/MainLayout';
import { useSharePointStatus } from '../../hooks/useSharePointStatus';
import KundContacts from './KundContacts';
import KundForm, { type KundFormValues } from './KundForm';
import KunderTable, { type SortColumn, type SortDirection } from './KunderTable';
import type { Customer } from './kunderService';
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
} from './kunderService';

const styles = StyleSheet.create({
  container: { width: '100%', backgroundColor: 'transparent' },
  card: {
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  errorBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  errorText: { fontSize: 13, color: '#dc2626', fontWeight: '500' },
  noticeBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#f0fdf4',
    borderWidth: 1,
    borderColor: '#bbf7d0',
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeText: { fontSize: 13, color: '#15803d', fontWeight: '500' },
  toolbar: {
    padding: 14,
    backgroundColor: '#f8fafc',
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 0,
  },
  toolbarRow: {
    flexDirection: 'column',
    gap: 12,
  },
  toolbarTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toolbarBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  titleIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: { fontSize: 15, fontWeight: '500', color: '#0f172a' },
  companyHint: { fontSize: 13, fontWeight: '400', color: '#64748b', marginLeft: 4 },
  searchWrap: {
    flex: 1,
    maxWidth: 520,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 10,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#111',
    padding: 0,
    marginLeft: 8,
  },
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
  tableWrap: { marginTop: 12 },
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  metaText: { fontSize: 13, color: '#64748b', fontWeight: '500' },
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 16,
    backgroundColor: '#f1f5f9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },
  selectCompany: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
  },
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
    maxHeight: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 12,
    overflow: 'hidden',
  },
  modalHeader: {
    height: 56,
    borderBottomWidth: 1,
    borderBottomColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  modalTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalClose: {
    position: 'absolute',
    right: 12,
    top: 10,
    padding: 6,
  },
});

const NOOP_ASYNC = async (): Promise<void> => {};

export default function KunderView({
  navigation,
  route,
}: {
  navigation: unknown;
  route: { params?: { companyId?: string }; name?: string };
}): React.ReactElement {
  const routeCompanyId = String(route?.params?.companyId ?? '').trim();
  const [companyId, setCompanyId] = useState(routeCompanyId);
  const [companyName, setCompanyName] = useState('');
  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchSpinAnim = React.useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({
    companyId,
    searchSpinAnim,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof fetchContacts>>>([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('name');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
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
  const [rowMenuCustomer, setRowMenuCustomer] = useState<Customer | null>(null);
  const [contactMenuVisible, setContactMenuVisible] = useState(false);
  const [contactMenuPos, setContactMenuPos] = useState({ x: 20, y: 64 });
  const [contactMenuCustomer, setContactMenuCustomer] = useState<Customer | null>(null);
  const [contactMenuContact, setContactMenuContact] = useState<{ id: string; name: string; role?: string; email?: string; phone?: string } | null>(null);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEdit, setContactEdit] = useState({ id: '', name: '', role: '', phone: '', email: '' });

  const hasCompany = Boolean(companyId?.trim());

  const loadCustomers = useCallback(async () => {
    if (!companyId?.trim()) {
      setCustomers([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      await ensureCompaniesFromKunderAndLeverantorer(companyId).catch(() => {});
      const data = await fetchCustomers(companyId);
      setCustomers(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte ladda kunder.');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  const loadContacts = useCallback(async () => {
    if (!companyId?.trim()) {
      setContacts([]);
      return;
    }
    try {
      const data = await fetchContacts(companyId);
      setContacts(data ?? []);
    } catch {
      setContacts([]);
    }
  }, [companyId]);

  useEffect(() => {
    loadCustomers();
  }, [loadCustomers]);
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  // Listen for global home/refresh events from AdminSidebar (web)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handleGoHome = () => {
      try {
        navigation?.reset?.({ index: 0, routes: [{ name: 'Home' }] });
      } catch (_e) {}
    };

    const handleRefresh = () => {
      try {
        loadCustomers();
        loadContacts();
      } catch (_e) {}
    };

    window.addEventListener('dkGoHome', handleGoHome);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handleGoHome); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, loadCustomers, loadContacts]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!companyId?.trim()) {
        if (!cancelled) setCompanyName('');
        return;
      }
      try {
        const profile = await fetchCompanyProfile(companyId);
        if (!cancelled && profile) {
          const name =
            String(profile?.companyName ?? profile?.name ?? '').trim() || companyId;
          setCompanyName(name);
        }
      } catch {
        if (!cancelled) setCompanyName(companyId ?? '');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = auth?.currentUser ?? null;
        if (!user) {
          if (!cancelled) {
            setAllowedTools(false);
            setCanSeeAllCompanies(false);
            setShowHeaderUserMenu(false);
          }
          return;
        }
        const tokenRes = await user.getIdTokenResult(true).catch(() => null);
        const claims = tokenRes?.claims ?? {};
        const isSuperadmin = !!claims.superadmin;
        const isAdmin = !!claims.admin || isSuperadmin;
        if (!cancelled) {
          setAllowedTools(!!isAdmin);
          setCanSeeAllCompanies(!!isSuperadmin);
          setShowHeaderUserMenu(true);
        }
      } catch {
        if (!cancelled) {
          setAllowedTools(false);
          setCanSeeAllCompanies(false);
          setShowHeaderUserMenu(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const showNotice = (msg: string): void => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const formatWriteError = (e: unknown): string => {
    const code = (e && typeof e === 'object' && 'code' in e) ? String((e as { code?: string }).code || '') : '';
    if (code === 'permission-denied') {
      return 'Saknar behörighet att skapa/uppdatera kund i detta företag.';
    }
    return e instanceof Error ? e.message : 'Kunde inte spara.';
  };

  const clearInlineForm = (): void => {
    setInlineName('');
    setInlinePersonalOrOrgNumber('');
    setInlineAddress('');
    setInlinePostalCode('');
    setInlineCity('');
    setInlineCustomerType('');
  };

  const handleInlineSave = async (): Promise<void> => {
    if (!companyId?.trim()) return;
    const name = String(inlineName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    try {
      await createCustomer(companyId, {
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
      if (Platform.OS === 'web') {
        setTimeout(() => {
          try {
            const firstInput = document.querySelector('input[placeholder=\"Namn (ny)\"]');
            if (firstInput) firstInput.focus();
          } catch (_e) {}
        }, 50);
      }
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
      return (
        name.includes(s) ||
        pn.includes(s) ||
        addr.includes(s) ||
        post.includes(s) ||
        city.includes(s) ||
        type.includes(s)
      );
    });
  }, [customers, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal = '';
      let bVal = '';
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
      const cmp = aVal.localeCompare(bVal, 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (col: SortColumn): void => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const editingCustomer = editingId
    ? customers.find((c) => c.id === editingId) ?? null
    : null;

  const handleSaveForm = async (values: KundFormValues): Promise<void> => {
    if (!companyId?.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateCustomer(companyId, editingId, {
          name: values.name,
          personalOrOrgNumber: values.personalOrOrgNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          customerType: values.customerType,
        });
        showNotice('Kund uppdaterad');
      } else {
        await createCustomer(companyId, {
          name: values.name,
          personalOrOrgNumber: values.personalOrOrgNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          customerType: values.customerType,
        });
        showNotice('Kund tillagd');
      }
      setModalVisible(false);
      setEditingId(null);
      await loadCustomers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (customer: Customer): Promise<void> => {
    if (!companyId?.trim()) return;
    const label = String(customer.name ?? '').trim() || 'kunden';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`Radera ${label}?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Radera kund', `Radera ${label}?`, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteCustomer(companyId, customer.id);
      showNotice('Kund borttagen');
      if (editingId === customer.id) {
        setModalVisible(false);
        setEditingId(null);
      }
      await loadCustomers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte radera.');
    }
  };

  const openRowMenu = (e: unknown, customer: Customer): void => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kund', String(customer.name ?? 'Kund'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(customer.id) || setModalVisible(true) },
        { text: 'Radera', style: 'destructive', onPress: () => handleDelete(customer) },
      ]);
      return;
    }
    const ne = e && typeof e === 'object' && 'nativeEvent' in e ? (e as { nativeEvent: { pageX?: number; pageY?: number } }).nativeEvent : e as { pageX?: number; pageY?: number };
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuCustomer(customer);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    {
      key: 'edit',
      label: 'Redigera',
      icon: <Ionicons name="create-outline" size={16} color="#0f172a" />,
    },
    {
      key: 'delete',
      label: 'Radera',
      danger: true,
      icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" />,
    },
  ];

  const contactMenuItems = [
    { key: 'edit', label: 'Redigera kontakt', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" /> },
  ];

  if (Platform.OS !== 'web') {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '500', color: '#111' }}>Kunder</Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#64748b' }}>
          Kunder är optimerat för webbläget.
        </Text>
      </View>
    );
  }

  // Keyboard handler: Enter creates inline row (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        const target = e.target as HTMLElement | null;
        if (target && target.tagName === 'INPUT') {
          const placeholder = (target as HTMLInputElement).placeholder || '';
          if (placeholder.endsWith('(ny)')) {
            e.preventDefault();
            if (!inlineSaving && inlineName.trim()) {
              handleInlineSave();
            }
          }
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [inlineSaving, inlineName, inlinePersonalOrOrgNumber, inlineAddress, inlinePostalCode, inlineCity, inlineCustomerType, companyId]);

  return (
    <MainLayout
      adminMode
      adminCurrentScreen="customers"
      contentFullWidth
      contentPadding={24}
      adminHideCompanyBanner
      adminOnSelectCompany={(payload: { companyId?: string; id?: string }) => {
        const cid = String(payload?.companyId ?? payload?.id ?? '').trim();
        if (cid && canSeeAllCompanies) {
          setCompanyId(cid);
          setModalVisible(false);
          setEditingId(null);
        }
      }}
      adminShowCompanySelector={canSeeAllCompanies}
      sidebarSelectedCompanyId={companyId}
      sidebarCompaniesMode
      sidebarShowMembers={false}
      sidebarHideCompanyActions
      sidebarAutoExpandMembers
      sidebarAllowCompanyManagementActions={false}
      topBar={
        <HomeHeader
          headerHeight={headerHeight}
          setHeaderHeight={setHeaderHeight}
          navigation={navigation}
          route={route}
          auth={auth}
          selectedProject={null}
          isSuperAdmin={false}
          allowedTools={allowedTools}
          showHeaderUserMenu={showHeaderUserMenu}
          canShowSupportToolsInHeader={allowedTools}
          supportMenuOpen={supportMenuOpen}
          setSupportMenuOpen={setSupportMenuOpen}
          companyId={companyId}
          routeCompanyId={routeCompanyId}
          showAdminButton={false}
          adminActionRunning={false}
          localFallbackExists={false}
          handleMakeDemoAdmin={NOOP_ASYNC}
          refreshLocalFallbackFlag={NOOP_ASYNC}
          dumpLocalRemoteControls={NOOP_ASYNC}
          showLastFsError={NOOP_ASYNC}
          saveControlToFirestore={NOOP_ASYNC}
          saveDraftToFirestore={NOOP_ASYNC}
          searchSpinAnim={searchSpinAnim}
          sharePointStatus={sharePointStatus}
        />
      }
      rightPanel={null}
    >
      <View style={styles.container}>
        <View style={styles.card}>
          {error ? (
            <View style={styles.errorBox}>
              <Ionicons name="warning" size={20} color="#dc2626" />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}
          {notice ? (
            <View style={styles.noticeBox}>
              <Ionicons name="checkmark-circle" size={20} color="#15803d" />
              <Text style={styles.noticeText}>{notice}</Text>
            </View>
          ) : null}

          <View style={styles.toolbar}>
            <View style={styles.toolbarRow}>
              <View style={styles.toolbarTopRow}>
                <View style={styles.titleRow}>
                  {companyName ? (
                    <>
                      <Text style={styles.companyHint}>{companyName}</Text>
                      <Ionicons name="chevron-forward" size={14} color="#94a3b8" />
                    </>
                  ) : null}
                  <View style={styles.titleIcon}>
                    <Ionicons name="people-outline" size={20} color="#1976D2" />
                  </View>
                  <Text style={styles.titleText}>Kunder</Text>
                </View>
              </View>
              <View style={styles.toolbarBottomRow}>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color="#64748b" />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Sök namn, person-/orgnr, adress, postnr, ort, typ…"
                    placeholderTextColor="#94a3b8"
                    {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {hasCompany && (
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => {
                        setEditingId(null);
                        setModalVisible(true);
                      }}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                  )}
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={loadCustomers}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                  >
                    <Ionicons name="refresh" size={16} color="#475569" />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>

          <View style={styles.tableWrap}>
            {!hasCompany ? (
              <View style={styles.selectCompany}>
                <Text style={styles.selectCompanyText}>
                  Välj ett företag i listan till vänster
                </Text>
              </View>
            ) : loading ? (
              <View style={styles.emptyState}>
                <Text style={styles.metaText}>Laddar kunder…</Text>
              </View>
            ) : sorted.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="people-outline" size={32} color="#64748b" />
                </View>
                <Text style={styles.emptyTitle}>Inga kunder ännu</Text>
                <Text style={styles.emptySub}>
                  {search ? 'Inga kunder matchade sökningen.' : 'Lägg till din första kund för att komma igång.'}
                </Text>
              </View>
            ) : (
              <>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>
                    Visar {sorted.length} av {filtered.length}
                  </Text>
                </View>
                <KunderTable
                  customers={sorted}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onRowPress={(cust) => {
                    setEditingId(cust.id);
                  }}
                  onRowContextMenu={openRowMenu}
                  onRowMenu={(e, customer) => openRowMenu(e, customer)}
                  contactRegistry={contacts}
                  contactsByCustomerId={Object.fromEntries(
                    customers.map((c) => [
                      c.id,
                      (c.contactIds || [])
                        .map((id) => contacts.find((ct) => ct.id === id))
                        .filter(Boolean)
                        .map((ct) => ({
                          id: ct.id,
                          name: ct.name,
                          role: ct.role,
                          email: ct.email,
                          phone: ct.phone,
                        })),
                    ])
                  )}
                  onContactMenu={(e, customer, contact) => {
                    const ne = (e as { nativeEvent?: { pageX?: number; pageY?: number } })?.nativeEvent || (e as { pageX?: number; pageY?: number });
                    const x = Number(ne?.pageX ?? 20);
                    const y = Number(ne?.pageY ?? 64);
                    setContactMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
                    setContactMenuCustomer(customer);
                    setContactMenuContact(contact);
                    setContactMenuVisible(true);
                  }}
                  onAddContact={async (customer, contact) => {
                    const res = await addContactToCustomer(companyId, customer, contact);
                    await loadContacts();
                    setCustomers((prev) =>
                      prev.map((c) =>
                        c.id === customer.id
                          ? {
                              ...c,
                              contactIds: Array.from(
                                new Set([...(c.contactIds || []), res.contactId].filter(Boolean))
                              ),
                            }
                          : c
                      )
                    );
                    showNotice('Kontaktperson inlagd');
                  }}
                  onLinkContact={async (customer, contactId, patch) => {
                    await linkExistingContactToCustomer(companyId, customer, contactId, patch);
                    await loadContacts();
                    setCustomers((prev) =>
                      prev.map((c) =>
                        c.id === customer.id
                          ? { ...c, contactIds: Array.from(new Set([...(c.contactIds || []), contactId])) }
                          : c
                      )
                    );
                    showNotice('Kontaktperson inlagd');
                  }}
                  onRemoveContact={async (customer, contactId) => {
                    await removeContactFromCustomer(companyId, customer, contactId);
                    await loadContacts();
                    setCustomers((prev) =>
                      prev.map((c) =>
                        c.id === customer.id
                          ? { ...c, contactIds: (c.contactIds || []).filter((id) => id !== contactId) }
                          : c
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
              </>
            )}
          </View>
        </View>
      </View>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => !saving && (setModalVisible(false), setEditingId(null))}
      >
        <Pressable
          style={styles.modalBack}
          onPress={() => !saving && (setModalVisible(false), setEditingId(null))}
        >
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitle}>
                <View style={styles.titleIcon}>
                  <Ionicons
                    name={editingId ? 'create-outline' : 'add-outline'}
                    size={20}
                    color="#1976D2"
                  />
                </View>
                <Text style={[styles.titleText, { fontSize: 16 }]}>
                  {editingId ? 'Redigera kund' : 'Lägg till kund'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !saving && (setModalVisible(false), setEditingId(null))}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: '75vh' }} contentContainerStyle={{ paddingBottom: 20 }}>
              <KundForm
                initial={editingCustomer ?? undefined}
                saving={saving}
                onSave={handleSaveForm}
                onCancel={() => !saving && (setModalVisible(false), setEditingId(null))}
              />
              {editingCustomer && (
                <View style={{ paddingHorizontal: 20 }}>
                  <KundContacts
                    companyId={companyId}
                    customer={editingCustomer}
                    allContacts={contacts}
                    onContactsChange={() => {
                      loadContacts();
                      loadCustomers();
                    }}
                  />
                </View>
              )}
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
            setModalVisible(true);
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
            const ok = Platform.OS === 'web'
              ? window.confirm('Vill du verkligen radera kontaktpersonen?')
              : undefined;
            if (Platform.OS !== 'web') {
              Alert.alert('Radera kontakt', 'Vill du verkligen radera kontaktpersonen?', [
                { text: 'Avbryt', style: 'cancel' },
                { text: 'Radera', style: 'destructive', onPress: async () => {
                  try {
                    await deleteCompanyContact({ id: contact.id }, companyId);
                    await removeContactFromCustomer(companyId, customer, contact.id);
                    await loadContacts();
                    showNotice('Kontaktperson raderad');
                  } catch (e) {
                    setError(e instanceof Error ? e.message : 'Kunde inte radera.');
                  }
                }},
              ]);
              return;
            }
            if (ok) {
              (async () => {
                try {
                  await deleteCompanyContact({ id: contact.id }, companyId);
                  await removeContactFromCustomer(companyId, customer, contact.id);
                  await loadContacts();
                  showNotice('Kontaktperson raderad');
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Kunde inte radera.');
                }
              })();
            }
          }
        }}
      />
      <Modal
        visible={contactEditOpen}
        transparent
        animationType="fade"
        onRequestClose={() => !contactEditSaving && setContactEditOpen(false)}
      >
        <Pressable
          style={styles.modalBack}
          onPress={() => !contactEditSaving && setContactEditOpen(false)}
        >
          <Pressable style={[styles.modalBox, { width: 420 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitle}>
                <View style={styles.titleIcon}>
                  <Ionicons name="create-outline" size={20} color="#1976D2" />
                </View>
                <Text style={[styles.titleText, { fontSize: 16 }]}>Redigera kontakt</Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => !contactEditSaving && setContactEditOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
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
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
              <TextInput
                value={contactEdit.role}
                onChangeText={(v) => setContactEdit((prev) => ({ ...prev, role: v }))}
                placeholder="Roll"
                style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
              <TextInput
                value={contactEdit.phone}
                onChangeText={(v) => setContactEdit((prev) => ({ ...prev, phone: v }))}
                placeholder="Telefon"
                style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
              <TextInput
                value={contactEdit.email}
                onChangeText={(v) => setContactEdit((prev) => ({ ...prev, email: v }))}
                placeholder="E-post"
                style={[styles.searchInput, { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 10, padding: 10 }]}
                placeholderTextColor="#94a3b8"
                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
              />
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <TouchableOpacity
                  style={[styles.iconBtn, styles.iconBtnPrimary, { flex: 1, height: 40, borderRadius: 10 }]}
                  onPress={async () => {
                    if (!contactEdit.name.trim()) {
                      setError('Namn är obligatoriskt.');
                      return;
                    }
                    setContactEditSaving(true);
                    try {
                      await updateCompanyContact({ id: contactEdit.id, patch: {
                        name: contactEdit.name.trim(),
                        role: contactEdit.role.trim(),
                        phone: contactEdit.phone.trim(),
                        email: contactEdit.email.trim(),
                      } }, companyId);
                      await loadContacts();
                      setContactEditOpen(false);
                      showNotice('Kontakt uppdaterad');
                    } catch (e) {
                      setError(e instanceof Error ? e.message : 'Kunde inte spara.');
                    } finally {
                      setContactEditSaving(false);
                    }
                  }}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#fff', fontWeight: '500' }}>Spara</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.iconBtn, { flex: 1, height: 40, borderRadius: 10 }]}
                  onPress={() => !contactEditSaving && setContactEditOpen(false)}
                  activeOpacity={0.8}
                >
                  <Text style={{ color: '#475569', fontWeight: '500' }}>Avbryt</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </MainLayout>
  );
}
