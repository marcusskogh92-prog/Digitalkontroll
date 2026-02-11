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
import ConfirmModal from './Modals/ConfirmModal';
import ContactRegistryTable from './ContactRegistryTable';
import {
  buildAndDownloadExcel,
  computeSyncPlan,
  parseExcelFromBuffer,
  validateHeaders,
  KONTAKTER_EXCEL,
} from '../../utils/registerExcel';
import {
  createCompanyContact,
  deleteCompanyContact,
  ensureCompaniesFromKunderAndLeverantorer,
  fetchCompanyContacts,
  fetchCompanyCustomers,
  fetchCompanyProfile,
  fetchCompanySuppliers,
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
  emptyState: { padding: 32, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  footer: { flexShrink: 0, flexDirection: 'row', justifyContent: 'flex-end', paddingVertical: 12, paddingHorizontal: 20, borderTopWidth: 1, borderTopColor: '#e2e8f0', backgroundColor: '#f8fafc' },
  footerBtn: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10, borderWidth: 1, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  addModalBack: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' },
  addModalBox: { backgroundColor: '#fff', borderRadius: 12, width: Platform.OS === 'web' ? 440 : '90%', maxWidth: 440, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.15, shadowRadius: 12, elevation: 8 },
  addModalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  addModalTitle: { fontSize: 16, fontWeight: '600', color: '#0f172a' },
  addModalBody: { padding: 18 },
  addModalField: { marginBottom: 14 },
  addModalLabel: { fontSize: 12, fontWeight: '500', color: '#475569', marginBottom: 4 },
  addModalInput: { borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  addModalDropdown: { position: 'relative', zIndex: 1000 },
  addModalDropdownList: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, maxHeight: 220, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: 8, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.12, shadowRadius: 6 },
  addModalDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  addModalDropdownItemHighlight: { backgroundColor: '#eef6ff' },
  addModalDropdownItemName: { fontSize: 13, color: '#1e293b', fontWeight: '500', flex: 1 },
  addModalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: 16, borderTopWidth: 1, borderTopColor: '#e2e8f0', marginTop: 8 },
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
  const [inlineLinkedSupplierId, setInlineLinkedSupplierId] = useState('');
  const [inlineCustomerId, setInlineCustomerId] = useState('');
  const [inlineRole, setInlineRole] = useState('');
  const [inlinePhone, setInlinePhone] = useState('');
  const [inlineWorkPhone, setInlineWorkPhone] = useState('');
  const [inlineEmail, setInlineEmail] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuContact, setRowMenuContact] = useState(null);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [companySearchResults, setCompanySearchResults] = useState([]);
  const [companySearchOpen, setCompanySearchOpen] = useState(false);
  const [companySearchActive, setCompanySearchActive] = useState(null);
  const companySearchDebounceRef = useRef(null);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addModalName, setAddModalName] = useState('');
  const [addModalCompanyName, setAddModalCompanyName] = useState('');
  const [addModalLinkedSupplierId, setAddModalLinkedSupplierId] = useState('');
  const [addModalCustomerId, setAddModalCustomerId] = useState('');
  const [addModalRole, setAddModalRole] = useState('');
  const [addModalPhone, setAddModalPhone] = useState('');
  const [addModalWorkPhone, setAddModalWorkPhone] = useState('');
  const [addModalEmail, setAddModalEmail] = useState('');
  const [addModalSaving, setAddModalSaving] = useState(false);
  const [addModalCompanyHoverIndex, setAddModalCompanyHoverIndex] = useState(-1);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const excelInputRef = useRef(null);

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
      if (q.length < 2) {
        setCompanySearchResults([]);
        setCompanySearchOpen(false);
        setCompanySearchActive(null);
        return;
      }
      setCompanySearchActive(context || 'inline');
      companySearchDebounceRef.current = setTimeout(async () => {
        try {
          const [suppliers, customers] = await Promise.all([
            fetchCompanySuppliers(cid),
            fetchCompanyCustomers(cid),
          ]);
          const lower = q.toLowerCase();
          const fromSuppliers = (suppliers || [])
            .filter((s) => String(s?.companyName ?? '').trim().toLowerCase().includes(lower))
            .map((s) => ({
              id: s.id,
              name: String(s.companyName ?? '').trim(),
              type: 'supplier',
              roles: { supplier: true, customer: false },
            }));
          const fromCustomers = (customers || [])
            .filter((c) => String(c?.name ?? '').trim().toLowerCase().includes(lower))
            .map((c) => ({
              id: c.id,
              name: String(c.name ?? '').trim(),
              type: 'customer',
              roles: { customer: true, supplier: false },
            }));
          const combined = [...fromSuppliers, ...fromCustomers].slice(0, 15);
          setCompanySearchResults(combined);
          setCompanySearchOpen(combined.length > 0);
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
    const name = String(company.name ?? '').trim();
    if (company.type === 'supplier') {
      setInlineLinkedSupplierId(company.id || '');
      setInlineCustomerId('');
      setInlineCompanyId('');
      setInlineCompanyName(name);
    } else if (company.type === 'customer') {
      setInlineCustomerId(company.id || '');
      setInlineLinkedSupplierId('');
      setInlineCompanyId('');
      setInlineCompanyName(name);
    } else {
      setInlineCompanyId(company.id || '');
      setInlineCompanyName(name);
      setInlineLinkedSupplierId('');
      setInlineCustomerId('');
    }
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setCompanySearchActive(null);
  }, []);

  const handleAddModalSelectCompany = useCallback((company) => {
    if (!company) return;
    const name = String(company.name ?? '').trim();
    if (company.type === 'supplier') {
      setAddModalLinkedSupplierId(company.id || '');
      setAddModalCustomerId('');
      setAddModalCompanyName(name);
    } else if (company.type === 'customer') {
      setAddModalCustomerId(company.id || '');
      setAddModalLinkedSupplierId('');
      setAddModalCompanyName(name);
    } else {
      setAddModalCompanyName(name);
      setAddModalLinkedSupplierId('');
      setAddModalCustomerId('');
    }
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setCompanySearchActive(null);
  }, []);

  const handleAddModalSave = useCallback(async () => {
    if (!cid) return;
    const n = String(addModalName || '').trim();
    if (!n) return;
    setAddModalSaving(true);
    setError('');
    try {
      await createCompanyContact(
        {
          name: n,
          companyName: companyName || cid,
          contactCompanyName: addModalCompanyName.trim(),
          companyId: undefined,
          linkedSupplierId: addModalLinkedSupplierId.trim() || undefined,
          customerId: addModalCustomerId.trim() || undefined,
          role: addModalRole.trim(),
          phone: String(addModalPhone ?? '').replace(/\D/g, ''),
          workPhone: addModalWorkPhone.trim(),
          email: addModalEmail.trim(),
        },
        cid
      );
      setAddModalVisible(false);
      setAddModalName('');
      setAddModalCompanyName('');
      setAddModalLinkedSupplierId('');
      setAddModalCustomerId('');
      setAddModalRole('');
      setAddModalPhone('');
      setAddModalWorkPhone('');
      setAddModalEmail('');
      await loadContacts();
      showNotice('Kontakt tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setAddModalSaving(false);
    }
  }, [cid, companyName, addModalName, addModalCompanyName, addModalLinkedSupplierId, addModalCustomerId, addModalRole, addModalPhone, addModalWorkPhone, addModalEmail, loadContacts]);

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
      if (values.linkedSupplierId != null) patch.linkedSupplierId = String(values.linkedSupplierId || '').trim() || null;
      if (values.customerId != null) patch.customerId = String(values.customerId || '').trim() || null;
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

  const performDeleteContact = async (contact) => {
    if (!cid || !contact) return;
    setDeleting(true);
    try {
      await deleteCompanyContact({ id: contact.id }, cid);
      showNotice('Kontakt borttagen');
      if (editingId === contact.id) setEditingId(null);
      await loadContacts();
      setDeleteConfirmContact(null);
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    } finally {
      setDeleting(false);
    }
  };

  const requestDeleteContact = (contact) => setDeleteConfirmContact(contact);

  const exportExcel = () => {
    setExcelMenuVisible(false);
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Excel-export är endast tillgängligt i webbversionen.');
      return;
    }
    const rows = (contacts || []).map((c) => KONTAKTER_EXCEL.itemToRow(c));
    buildAndDownloadExcel(
      KONTAKTER_EXCEL.sheetName,
      KONTAKTER_EXCEL.headers,
      rows,
      KONTAKTER_EXCEL.filenamePrefix
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
      const { valid, missing } = validateHeaders(headers, KONTAKTER_EXCEL.headers);
      if (!valid) {
        setError(`Ogiltiga kolumnrubriker. Saknas: ${(missing || []).join(', ')}. Använd Excel-mallen.`);
        return;
      }
      const plan = computeSyncPlan(rows, contacts, {
        keyField: KONTAKTER_EXCEL.keyField,
        getKeyFromRow: (row) => String((row[KONTAKTER_EXCEL.keyField] ?? '').trim()),
        getKeyFromItem: (item) => KONTAKTER_EXCEL.itemToKey(item),
      });
      setImportPlan(plan);
      setImportConfirmVisible(true);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const runKontakterImport = async () => {
    if (!cid || !importPlan) return;
    setImportBusy(true);
    setError('');
    const failed = [];
    try {
      for (const row of importPlan.toCreate) {
        const payload = KONTAKTER_EXCEL.rowToPayload(row);
        const name = (payload.name || '').trim();
        if (!name) continue;
        try {
          await createCompanyContact(
            {
              name: payload.name,
              companyName: cid,
              contactCompanyName: payload.contactCompanyName || '',
              role: payload.role || '',
              phone: payload.phone || '',
              workPhone: payload.workPhone || '',
              email: payload.email || '',
            },
            cid
          );
        } catch (e) {
          failed.push(`Skapa ${name}: ${e?.message || 'fel'}`);
        }
      }
      for (const { id, row } of importPlan.toUpdate) {
        const payload = KONTAKTER_EXCEL.rowToPayload(row);
        try {
          await updateCompanyContact(
            { id, patch: payload },
            cid
          );
        } catch (e) {
          failed.push(`Uppdatera ${payload.name}: ${e?.message || 'fel'}`);
        }
      }
      for (const item of importPlan.toDelete) {
        try {
          await deleteCompanyContact({ id: item.id }, cid);
        } catch (e) {
          failed.push(`Radera ${item.name ?? item.id}: ${e?.message || 'fel'}`);
        }
      }
      setImportConfirmVisible(false);
      setImportPlan(null);
      await loadContacts();
      if (editingId) setEditingId(null);
      if (failed.length > 0) {
        setError(`Import klar. ${failed.length} rad(er) misslyckades: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}`);
      } else {
        showNotice('Import genomförd');
      }
    } catch (e) {
      setError(e?.message || 'Kunde inte importera.');
    } finally {
      setImportBusy(false);
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
          linkedSupplierId: inlineLinkedSupplierId.trim() || undefined,
          customerId: inlineCustomerId.trim() || undefined,
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
      setInlineLinkedSupplierId('');
      setInlineCustomerId('');
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
        { text: 'Radera', style: 'destructive', onPress: () => requestDeleteContact(contact) },
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
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnPrimary]} onPress={() => setAddModalVisible(true)} accessibilityLabel="Lägg till kontakt" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
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
            {!hasCompany ? null : loading ? (
              <View style={styles.tableWrap}>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Laddar kontakter…</Text>
                </View>
              </View>
            ) : (
              <View style={styles.tableWrap}>
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
                {sorted.length === 0 && !search ? (
                  <View style={[styles.emptyState, { marginTop: 12 }]}>
                    <Text style={styles.emptyTitle}>Inga kontakter ännu. Fyll i raden ovan eller använd + för att öppna formuläret.</Text>
                  </View>
                ) : null}
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

      <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => !addModalSaving && setAddModalVisible(false)}>
        <Pressable style={styles.addModalBack} onPress={() => !addModalSaving && setAddModalVisible(false)}>
          <Pressable style={styles.addModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.addModalHeader}>
              <Text style={styles.addModalTitle}>Lägg till kontakt</Text>
              <TouchableOpacity onPress={() => !addModalSaving && setAddModalVisible(false)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#475569" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 400 }} contentContainerStyle={styles.addModalBody} keyboardShouldPersistTaps="handled">
              <View style={styles.addModalField}>
                <Text style={styles.addModalLabel}>Namn *</Text>
                <TextInput value={addModalName} onChangeText={setAddModalName} placeholder="Förnamn Efternamn" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={[styles.addModalField, styles.addModalDropdown]}>
                <Text style={styles.addModalLabel}>Företag</Text>
                <TextInput
                  value={addModalCompanyName}
                  onChangeText={(v) => { setAddModalCompanyName(v); handleCompanySearch(v, 'addModal'); }}
                  onFocus={() => setCompanySearchActive('addModal')}
                  onBlur={() => setTimeout(() => setCompanySearchOpen(false), 200)}
                  placeholder="Min. 2 tecken – välj kund/leverantör"
                  style={styles.addModalInput}
                  placeholderTextColor="#94a3b8"
                  {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                />
                {companySearchOpen && companySearchActive === 'addModal' && (companySearchResults || []).length > 0 && (
                  <View style={styles.addModalDropdownList}>
                    {(companySearchResults || []).slice(0, 15).map((company, i) => (
                      <TouchableOpacity
                        key={company.id || i}
                        style={[styles.addModalDropdownItem, addModalCompanyHoverIndex === i ? styles.addModalDropdownItemHighlight : null]}
                        onPress={() => handleAddModalSelectCompany(company)}
                        onMouseEnter={() => setAddModalCompanyHoverIndex(i)}
                        onMouseLeave={() => setAddModalCompanyHoverIndex(-1)}
                        activeOpacity={0.7}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={styles.addModalDropdownItemName} numberOfLines={1}>{company.name || '—'}</Text>
                        <View style={{ flexDirection: 'row', gap: 4 }}>
                          {company.roles?.supplier ? <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '500' }}>Leverantör</Text></View> : null}
                          {company.roles?.customer ? <View style={{ backgroundColor: '#e0f2fe', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4 }}><Text style={{ fontSize: 11, color: '#0369a1', fontWeight: '500' }}>Kund</Text></View> : null}
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
              <View style={styles.addModalField}>
                <Text style={styles.addModalLabel}>Roll</Text>
                <TextInput value={addModalRole} onChangeText={setAddModalRole} placeholder="t.ex. Platschef" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addModalField}>
                <Text style={styles.addModalLabel}>Mobil</Text>
                <TextInput value={addModalPhone} onChangeText={(v) => setAddModalPhone(String(v).replace(/\D/g, '').slice(0, 15))} placeholder="Siffror" keyboardType="number-pad" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addModalField}>
                <Text style={styles.addModalLabel}>Arbete</Text>
                <TextInput value={addModalWorkPhone} onChangeText={setAddModalWorkPhone} placeholder="Jobbtelefon" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addModalField}>
                <Text style={styles.addModalLabel}>E-post</Text>
                <TextInput value={addModalEmail} onChangeText={setAddModalEmail} placeholder="namn@foretag.se" keyboardType="email-address" autoCapitalize="none" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
              </View>
              <View style={styles.addModalFooter}>
                <TouchableOpacity style={styles.footerBtn} onPress={() => !addModalSaving && setAddModalVisible(false)} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#475569' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.iconBtnPrimary, { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 10 }]} onPress={handleAddModalSave} disabled={addModalSaving || !addModalName.trim()} {...(Platform.OS === 'web' ? { cursor: addModalSaving || !addModalName.trim() ? 'not-allowed' : 'pointer' } : {})}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
                </TouchableOpacity>
              </View>
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
          const c = rowMenuContact;
          if (!c || !it) return;
          if (it.key === 'edit') setEditingId(c.id);
          else if (it.key === 'delete') requestDeleteContact(c);
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmContact}
        message={deleteConfirmContact ? `Radera ${String(deleteConfirmContact.name ?? '').trim() || 'kontakten'}?` : ''}
        cancelLabel="Avbryt"
        confirmLabel="OK"
        compact
        busy={deleting}
        onCancel={() => setDeleteConfirmContact(null)}
        onConfirm={() => performDeleteContact(deleteConfirmContact)}
      />

      {Platform.OS === 'web' && (
        <View style={{ position: 'absolute', opacity: 0, width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
          <input
            ref={excelInputRef}
            type="file"
            accept=".xlsx,.xls"
            onChange={handleExcelFileChange}
            style={{ width: 0, height: 0 }}
          />
        </View>
      )}

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

      <ConfirmModal
        visible={importConfirmVisible}
        message={
          importPlan
            ? `Importen ersätter hela registret.\nSkapas: ${importPlan.toCreate.length}, Uppdateras: ${importPlan.toUpdate.length}, Raderas: ${importPlan.toDelete.length}`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Importera"
        busy={importBusy}
        onCancel={() => {
          if (!importBusy) {
            setImportConfirmVisible(false);
            setImportPlan(null);
          }
        }}
        onConfirm={runKontakterImport}
      />
    </Modal>
  );
}
