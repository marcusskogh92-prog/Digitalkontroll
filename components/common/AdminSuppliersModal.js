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
import LeverantorerTable from '../../modules/leverantorer/LeverantorerTable';
import {
    addContactToSupplier,
    createSupplier,
    deleteSupplier,
    fetchContacts,
    fetchSuppliers,
    linkExistingContactToSupplier,
    removeContactFromSupplier,
    updateSupplier,
} from '../../modules/leverantorer/leverantorerService';
import {
    buildAndDownloadExcel,
    computeSyncPlan,
    LEVERANTORER_EXCEL,
    parseExcelFromBuffer,
    validateHeaders,
} from '../../utils/registerExcel';
import ContextMenu from '../ContextMenu';
import { createCategory, fetchByggdelar, fetchCategories, fetchCompanyProfile, fetchKontoplan } from '../firebase';
import ConfirmModal from './Modals/ConfirmModal';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 1200,
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
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
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
  const [companyCategories, setCompanyCategories] = useState([]);
  const [companyByggdelar, setCompanyByggdelar] = useState([]);
  const [companyKontoplan, setCompanyKontoplan] = useState([]);
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
  const [inlineCategoryIds, setInlineCategoryIds] = useState([]);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuSupplier, setRowMenuSupplier] = useState(null);
  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const tableScrollRef = useRef(null);
  const excelInputRef = useRef(null);

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

  const loadCompanyRegisters = useCallback(async () => {
    if (!cid) {
      setCompanyCategories([]);
      setCompanyByggdelar([]);
      setCompanyKontoplan([]);
      return;
    }
    try {
      const [cats, bygg, konto] = await Promise.all([
        fetchCategories(cid),
        fetchByggdelar(cid),
        fetchKontoplan(cid),
      ]);
      setCompanyCategories(cats || []);
      setCompanyByggdelar(bygg || []);
      setCompanyKontoplan(konto || []);
    } catch {
      setCompanyCategories([]);
      setCompanyByggdelar([]);
      setCompanyKontoplan([]);
    }
  }, [cid]);

  useEffect(() => {
    if (!visible) return;
    loadSuppliers();
    loadContacts();
    loadCompanyRegisters();
  }, [visible, loadSuppliers, loadContacts, loadCompanyRegisters]);

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
    setInlineCategoryIds([]);
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const name = String(inlineCompanyName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    try {
      const payload = {
        companyName: name,
        organizationNumber: (inlineOrganizationNumber || '').trim(),
        address: (inlineAddress || '').trim(),
        postalCode: (inlinePostalCode || '').trim(),
        city: (inlineCity || '').trim(),
      };
      if (Array.isArray(inlineCategoryIds) && inlineCategoryIds.length > 0) {
        payload.categories = inlineCategoryIds;
        payload.category = inlineCategoryIds[0];
      } else if ((inlineCategory || '').trim()) {
        payload.category = inlineCategory.trim();
      }
      await createSupplier(cid, payload);
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

  const requestDelete = (supplier) => {
    setDeleteConfirmSupplier(supplier);
  };

  const confirmDelete = async () => {
    const supplier = deleteConfirmSupplier;
    if (!cid || !supplier) return;
    setDeleting(true);
    try {
      await deleteSupplier(cid, supplier.id);
      showNotice('Leverantör borttagen');
      if (editingId === supplier.id) setEditingId(null);
      setDeleteConfirmSupplier(null);
      await loadSuppliers();
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    } finally {
      setDeleting(false);
    }
  };

  const exportExcel = () => {
    setExcelMenuVisible(false);
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Excel-export är endast tillgängligt i webbversionen.');
      return;
    }
    const rows = (suppliers || []).map((s) => LEVERANTORER_EXCEL.itemToRow(s));
    buildAndDownloadExcel(
      LEVERANTORER_EXCEL.sheetName,
      LEVERANTORER_EXCEL.headers,
      rows,
      LEVERANTORER_EXCEL.filenamePrefix
    );
    showNotice('Excel-mall nedladdad');
  };

  const handleExcelFileChange = (e) => {
    const file = e?.target?.files?.[0];
    if (!file || !cid) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const ab = ev?.target?.result;
      if (!ab) return;
      const { headers, rows, errors } = parseExcelFromBuffer(ab);
      if (errors.length > 0) {
        setError(errors[0]);
        return;
      }
      const { valid, missing } = validateHeaders(headers, LEVERANTORER_EXCEL.headers);
      if (!valid) {
        setError(`Ogiltiga kolumnrubriker. Saknas: ${(missing || []).join(', ')}. Använd Excel-mallen.`);
        return;
      }
      const plan = computeSyncPlan(rows, suppliers, {
        keyField: LEVERANTORER_EXCEL.keyField,
        getKeyFromRow: (row) => {
          const org = (row[LEVERANTORER_EXCEL.keyField] ?? '').trim();
          const name = (row['Leverantör'] ?? '').trim();
          return org || name || '';
        },
        getKeyFromItem: (item) => LEVERANTORER_EXCEL.itemToKey(item),
      });
      setImportPlan(plan);
      setImportConfirmVisible(true);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const runImport = async () => {
    if (!cid || !importPlan) return;
    setImportBusy(true);
    setError('');
    const failed = [];
    let newCategoriesCount = 0;
    try {
      const existingCategories = await fetchCategories(cid);
      const nameToCategory = new Map();
      (existingCategories || []).forEach((c) => {
        const key = (c.name ?? '').trim().toLowerCase();
        if (key && !nameToCategory.has(key)) {
          nameToCategory.set(key, { id: c.id, name: (c.name ?? '').trim() });
        }
      });

      const allRows = [...importPlan.toCreate, ...importPlan.toUpdate.map((x) => ({ row: x.row }))];
      const uniqueNamesByKey = new Map();
      allRows.forEach(({ row }) => {
        const payload = LEVERANTORER_EXCEL.rowToPayload(row);
        (payload.categories || []).forEach((n) => {
          const t = (n || '').trim();
          if (!t) return;
          const key = t.toLowerCase();
          if (!uniqueNamesByKey.has(key)) uniqueNamesByKey.set(key, t);
        });
      });

      for (const [key, canonicalName] of uniqueNamesByKey) {
        if (nameToCategory.has(key)) continue;
        try {
          const id = await createCategory(
            { name: canonicalName, note: '', skapadVia: 'import' },
            cid
          );
          nameToCategory.set(key, { id, name: canonicalName });
          newCategoriesCount += 1;
        } catch (e) {
          failed.push(`Kategori "${canonicalName}": ${e?.message || 'fel'}`);
        }
      }

      const categoryNamesToIds = (names) =>
        (names || [])
          .map((n) => nameToCategory.get((n || '').trim().toLowerCase())?.id)
          .filter(Boolean);

      for (const row of importPlan.toCreate) {
        const payload = LEVERANTORER_EXCEL.rowToPayload(row);
        const name = (payload.companyName || '').trim();
        if (!name) continue;
        try {
          await createSupplier(cid, {
            companyName: payload.companyName,
            organizationNumber: payload.organizationNumber || '',
            city: payload.city || '',
            categories: categoryNamesToIds(payload.categories),
          });
        } catch (e) {
          failed.push(`Skapa ${name}: ${e?.message || 'fel'}`);
        }
      }
      for (const { id, row } of importPlan.toUpdate) {
        const payload = LEVERANTORER_EXCEL.rowToPayload(row);
        try {
          await updateSupplier(cid, id, {
            companyName: payload.companyName,
            organizationNumber: payload.organizationNumber || '',
            city: payload.city || '',
            categories: categoryNamesToIds(payload.categories),
          });
        } catch (e) {
          failed.push(`Uppdatera ${payload.companyName}: ${e?.message || 'fel'}`);
        }
      }
      for (const item of importPlan.toDelete) {
        try {
          await deleteSupplier(cid, item.id);
        } catch (e) {
          failed.push(`Radera ${item.companyName ?? item.id}: ${e?.message || 'fel'}`);
        }
      }
      setImportConfirmVisible(false);
      setImportPlan(null);
      await loadSuppliers();
      await loadCompanyRegisters();
      if (editingId) setEditingId(null);
      if (failed.length > 0) {
        setError(`Import klar. ${failed.length} rad(er) misslyckades: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}`);
      } else {
        const msg =
          newCategoriesCount > 0
            ? `Import genomförd. ${newCategoriesCount} nya kategorier skapades automatiskt.`
            : 'Import genomförd';
        showNotice(msg);
      }
    } catch (e) {
      setError(e?.message || 'Import misslyckades.');
    } finally {
      setImportBusy(false);
    }
  };

  const handleCategoriesChange = async (supplier, categoryIds) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      const patch = { categories: categoryIds };
      if (categoryIds.length > 0) patch.category = categoryIds[0];
      await updateSupplier(cid, supplier.id, patch);
      showNotice('Kategorier uppdaterade');
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleByggdelarChange = async (supplier, byggdelCodes) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      await updateSupplier(cid, supplier.id, { byggdelTags: byggdelCodes });
      showNotice('Byggdelar uppdaterade');
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleKontonChange = async (supplier, konton) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      await updateSupplier(cid, supplier.id, { konton });
      showNotice('Kontoplan uppdaterad');
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const handleAddContact = async (supplier, contact) => {
    if (!cid) return;
    try {
      await addContactToSupplier(cid, supplier.id, supplier.companyName ?? '', contact);
      showNotice('Kontakt tillagd');
      await loadContacts();
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    }
  };

  const handleRemoveContact = async (supplier, contactId) => {
    if (!cid) return;
    try {
      await removeContactFromSupplier(cid, supplier.id, contactId);
      showNotice('Kontakt borttagen');
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    }
  };

  const handleLinkContact = async (supplier, contactId, patch) => {
    if (!cid) return;
    try {
      await linkExistingContactToSupplier(cid, supplier.id, contactId, patch);
      showNotice('Kontakt kopplad');
      await loadSuppliers();
    } catch (e) {
      setError(formatWriteError(e));
    }
  };

  const openRowMenu = (e, supplier) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Leverantör', String(supplier.companyName ?? 'Leverantör'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(supplier.id) },
        { text: 'Radera', style: 'destructive', onPress: () => requestDelete(supplier) },
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
                <Text style={styles.subtitle}>Register över leverantörer</Text>
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
                    {Platform.OS === 'web' && (
                      <TouchableOpacity
                        style={styles.excelBtn}
                        onPress={(ev) => {
                          const ne = ev?.nativeEvent || ev;
                          const target = ne?.target;
                          if (target && typeof target.getBoundingClientRect === 'function') {
                            const r = target.getBoundingClientRect();
                            setExcelMenuPos({ x: r.left, y: r.bottom + 4 });
                          } else {
                            setExcelMenuPos({ x: 20, y: 200 });
                          }
                          setExcelMenuVisible(true);
                        }}
                        accessibilityLabel="Importera / exportera Excel"
                        {...(Platform.OS === 'web' ? { cursor: 'pointer', title: 'Importera / exportera Excel' } : {})}
                      >
                        <Ionicons name="grid-outline" size={18} color="#167534" />
                        <Text style={{ fontSize: 13, fontWeight: '500', color: '#167534' }}>Excel</Text>
                      </TouchableOpacity>
                    )}
                    <View style={{ width: 1, height: 24, backgroundColor: '#e2e8f0' }} />
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => {
                        const r = tableScrollRef.current;
                        if (r && typeof r.scrollTo === 'function') r.scrollTo({ y: 0, animated: true });
                      }}
                      accessibilityLabel="Lägg till leverantör"
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
            ref={tableScrollRef}
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
                    onAddContact={handleAddContact}
                    onRemoveContact={handleRemoveContact}
                    onLinkContact={handleLinkContact}
                    companyCategories={companyCategories}
                    companyByggdelar={companyByggdelar}
                    companyKontoplan={companyKontoplan}
                    onCategoriesChange={handleCategoriesChange}
                    onByggdelarChange={handleByggdelarChange}
                    onKontonChange={handleKontonChange}
                    inlineEnabled={hasCompany}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      companyName: inlineCompanyName,
                      organizationNumber: inlineOrganizationNumber,
                      address: inlineAddress,
                      postalCode: inlinePostalCode,
                      city: inlineCity,
                      category: inlineCategory,
                      categories: inlineCategoryIds,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'companyName') setInlineCompanyName(String(value ?? ''));
                      if (field === 'organizationNumber') setInlineOrganizationNumber(String(value ?? ''));
                      if (field === 'address') setInlineAddress(String(value ?? ''));
                      if (field === 'postalCode') setInlinePostalCode(String(value ?? ''));
                      if (field === 'city') setInlineCity(String(value ?? ''));
                      if (field === 'category') setInlineCategory(String(value ?? ''));
                      if (field === 'categories') setInlineCategoryIds(Array.isArray(value) ? value : []);
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
          else if (it.key === 'delete') requestDelete(s);
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmSupplier}
        title="Radera leverantör"
        message={deleteConfirmSupplier ? `Vill du verkligen radera ${String(deleteConfirmSupplier.companyName ?? '').trim() || 'leverantören'}?` : ''}
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
        busy={deleting}
        onCancel={() => setDeleteConfirmSupplier(null)}
        onConfirm={confirmDelete}
      />

      {Platform.OS === 'web' && (
        <>
          <View style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <input
              ref={excelInputRef}
              type="file"
              accept=".xlsx,.xls"
              onChange={handleExcelFileChange}
              style={{ width: 0, height: 0 }}
            />
          </View>
          <ContextMenu
            visible={excelMenuVisible}
            x={excelMenuPos.x}
            y={excelMenuPos.y}
            items={[
              { key: 'export', label: 'Exportera Excel' },
              { key: 'import', label: 'Importera Excel' },
            ]}
            onClose={() => setExcelMenuVisible(false)}
            onSelect={(it) => {
              setExcelMenuVisible(false);
              if (it?.key === 'export') exportExcel();
              else if (it?.key === 'import') setTimeout(() => excelInputRef.current?.click(), 0);
            }}
          />
        </>
      )}

      <ConfirmModal
        visible={importConfirmVisible}
        title="Importera leverantörer"
        message={
          importPlan
            ? `Importen ersätter hela registret.\nSkapas: ${importPlan.toCreate.length}, Uppdateras: ${importPlan.toUpdate.length}, Raderas: ${importPlan.toDelete.length}`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Importera"
        busy={importBusy}
        onCancel={() => { setImportConfirmVisible(false); setImportPlan(null); }}
        onConfirm={runImport}
      />
    </Modal>
  );
}
