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
import { MODAL_DESIGN_2026 } from '../../constants/modalDesign2026';
import ModalBase from './ModalBase';
import {
    buildAndDownloadExcel,
    computeSyncPlan,
    KONTAKTER_EXCEL,
    parseExcelFromBuffer,
    validateHeaders,
} from '../../utils/registerExcel';
import ContextMenu from '../ContextMenu';
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
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import ContactRegistryTable from './ContactRegistryTable';
import ConfirmModal from './Modals/ConfirmModal';

const D = MODAL_DESIGN_2026;

const styles = StyleSheet.create({
  statusOverlay: { position: 'absolute', left: 24, right: 24, top: 100, zIndex: 100, alignItems: 'center', pointerEvents: 'none' },
  statusBox: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 8, borderWidth: 1, maxWidth: 400, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 8, elevation: 6 },
  statusBoxSuccess: { backgroundColor: '#f0fdf4', borderColor: '#bbf7d0' },
  statusBoxError: { backgroundColor: '#fef2f2', borderColor: '#fecaca' },
  toolbarSection: { flexShrink: 0, paddingHorizontal: D.contentPadding, paddingTop: D.sectionGap, paddingBottom: 12, backgroundColor: '#fff' },
  toolbar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 },
  toolbarDivider: { height: 1, backgroundColor: '#eee', marginTop: 12, marginHorizontal: -D.contentPadding },
  tableScroll: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tableScrollContent: { paddingHorizontal: D.contentPadding, paddingTop: D.sectionGap, paddingBottom: D.contentPadding },
  tableScrollHorizontal: { flex: 1, minHeight: 0, alignSelf: 'stretch' },
  searchWrap: { flex: 1, maxWidth: 400, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#ddd', borderRadius: D.inputRadius, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0, marginLeft: 8 },
  iconBtn: { minWidth: 28, height: 28, paddingHorizontal: 8, borderRadius: D.buttonRadius, backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconBtnPrimary: { backgroundColor: D.buttonPrimaryBg, borderColor: D.buttonPrimaryBg },
  excelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderRadius: D.buttonRadius,
    backgroundColor: '#ecfdf5',
    borderWidth: 1,
    borderColor: '#a7f3d0',
  },
  tableWrap: {},
  emptyState: { padding: 32, alignItems: 'center', backgroundColor: '#f8fafc', borderRadius: D.radius, borderWidth: 1, borderColor: '#eee' },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  footerBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#ddd', backgroundColor: '#fff' },
  mainModalStangBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569', borderWidth: 0 },
  addModalBack: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: D.overlayBg },
  addModalBox: { backgroundColor: '#fff', borderRadius: D.radius, width: Platform.OS === 'web' ? 440 : '90%', maxWidth: 440, shadowColor: '#000', shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.08, shadowRadius: 30, elevation: 8 },
  addModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: D.header.paddingVertical,
    paddingHorizontal: D.header.paddingHorizontal,
    borderBottomWidth: D.header.borderBottomWidth,
    borderBottomColor: D.header.borderBottomColor,
    backgroundColor: D.header.backgroundColor,
  },
  addModalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  addModalTitleIcon: { width: 28, height: 28, borderRadius: D.buttonRadius, backgroundColor: 'rgba(0,0,0,0.06)', alignItems: 'center', justifyContent: 'center' },
  addModalTitle: { fontSize: D.titleFontSize, fontWeight: D.titleFontWeight, color: D.titleColor, flexShrink: 1, minWidth: 0 },
  addModalCloseBtn: { padding: D.closeBtn.padding, borderRadius: D.closeBtn.borderRadius, backgroundColor: D.closeBtn.backgroundColor },
  addModalBody: { padding: D.contentPadding },
  addModalField: { marginBottom: 14 },
  addModalLabel: { fontSize: 12, fontWeight: '500', color: '#475569', marginBottom: 4 },
  addModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: D.inputRadius, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  addModalDropdown: { position: 'relative', zIndex: 1000 },
  addModalDropdownList: { position: 'absolute', left: 0, right: 0, top: '100%', marginTop: 2, maxHeight: 220, backgroundColor: '#fff', borderWidth: 1, borderColor: '#e2e8f0', borderRadius: D.inputRadius, elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.08, shadowRadius: 6 },
  addModalDropdownItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, paddingHorizontal: 10, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  addModalDropdownItemHighlight: { backgroundColor: '#eef6ff' },
  addModalDropdownItemName: { fontSize: 13, color: '#1e293b', fontWeight: '500', flex: 1 },
  addModalFooter: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, paddingTop: D.sectionGap, borderTopWidth: 1, borderTopColor: '#eee', marginTop: 8 },
  editModalBox: {
    width: Platform.OS === 'web' ? 520 : '92%',
    maxWidth: 520,
    minHeight: Platform.OS === 'web' ? 520 : undefined,
  },
  editModalContent: { padding: D.contentPadding, paddingBottom: 24 },
  editModalAvbrytBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  editModalSparaBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569', borderWidth: 0 },
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
  const [editModalContact, setEditModalContact] = useState(null);
  const [editModalName, setEditModalName] = useState('');
  const [editModalCompanyName, setEditModalCompanyName] = useState('');
  const [editModalLinkedSupplierId, setEditModalLinkedSupplierId] = useState('');
  const [editModalCustomerId, setEditModalCustomerId] = useState('');
  const [editModalRole, setEditModalRole] = useState('');
  const [editModalPhone, setEditModalPhone] = useState('');
  const [editModalWorkPhone, setEditModalWorkPhone] = useState('');
  const [editModalEmail, setEditModalEmail] = useState('');
  const [editModalSaving, setEditModalSaving] = useState(false);
  const [editModalCompanyHoverIndex, setEditModalCompanyHoverIndex] = useState(-1);
  const [showInlineAddRow, setShowInlineAddRow] = useState(false);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const excelInputRef = useRef(null);
  const editModalInitialRef = useRef(null);

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
    if (!editModalContact) {
      editModalInitialRef.current = null;
      setEditModalName('');
      setEditModalCompanyName('');
      setEditModalLinkedSupplierId('');
      setEditModalCustomerId('');
      setEditModalRole('');
      setEditModalPhone('');
      setEditModalWorkPhone('');
      setEditModalEmail('');
      return;
    }
    const c = editModalContact;
    const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');
    const name = String(c.name ?? '').trim();
    const contactCompanyName = String(c.contactCompanyName ?? c.companyName ?? '').trim();
    const linkedSupplierId = String(c.linkedSupplierId ?? '').trim();
    const customerId = String(c.customerId ?? '').trim();
    const role = String(c.role ?? '').trim();
    const phone = digitsOnly(c.phone ?? '');
    const workPhone = String(c.workPhone ?? '').trim();
    const email = String(c.email ?? '').trim();
    setEditModalName(name);
    setEditModalCompanyName(contactCompanyName);
    setEditModalLinkedSupplierId(linkedSupplierId);
    setEditModalCustomerId(customerId);
    setEditModalRole(role);
    setEditModalPhone(phone);
    setEditModalWorkPhone(workPhone);
    setEditModalEmail(email);
    editModalInitialRef.current = { name, contactCompanyName, linkedSupplierId, customerId, role, phone, workPhone, email };
  }, [editModalContact]);

  const handleEditModalSelectCompany = useCallback((company) => {
    if (!company) return;
    const name = String(company.name ?? '').trim();
    if (company.type === 'supplier') {
      setEditModalLinkedSupplierId(company.id || '');
      setEditModalCustomerId('');
      setEditModalCompanyName(name);
    } else if (company.type === 'customer') {
      setEditModalCustomerId(company.id || '');
      setEditModalLinkedSupplierId('');
      setEditModalCompanyName(name);
    } else {
      setEditModalCompanyName(name);
      setEditModalLinkedSupplierId('');
      setEditModalCustomerId('');
    }
    setCompanySearchResults([]);
    setCompanySearchOpen(false);
    setCompanySearchActive(null);
  }, []);

  const handleEditModalSave = useCallback(async () => {
    if (!cid || !editModalContact?.id) return;
    const n = String(editModalName || '').trim();
    if (!n) return;
    setEditModalSaving(true);
    setError('');
    try {
      const patch = {
        name: n,
        contactCompanyName: editModalCompanyName.trim(),
        role: editModalRole.trim(),
        phone: String(editModalPhone ?? '').replace(/\D/g, ''),
        workPhone: editModalWorkPhone.trim(),
        email: editModalEmail.trim(),
      };
      if (editModalLinkedSupplierId !== undefined) patch.linkedSupplierId = editModalLinkedSupplierId.trim() || null;
      if (editModalCustomerId !== undefined) patch.customerId = editModalCustomerId.trim() || null;
      await updateCompanyContact({ id: editModalContact.id, patch }, cid);
      showNotice('Kontakten uppdaterad');
      setEditModalContact(null);
      await loadContacts();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setEditModalSaving(false);
    }
  }, [cid, editModalContact, editModalName, editModalCompanyName, editModalLinkedSupplierId, editModalCustomerId, editModalRole, editModalPhone, editModalWorkPhone, editModalEmail, loadContacts]);

  const isEditModalDirty = useMemo(() => {
    if (!editModalContact || !editModalInitialRef.current) return false;
    const i = editModalInitialRef.current;
    return (
      String(editModalName ?? '').trim() !== i.name ||
      String(editModalCompanyName ?? '').trim() !== i.contactCompanyName ||
      String(editModalLinkedSupplierId ?? '').trim() !== i.linkedSupplierId ||
      String(editModalCustomerId ?? '').trim() !== i.customerId ||
      String(editModalRole ?? '').trim() !== i.role ||
      String(editModalPhone ?? '').replace(/\D/g, '') !== i.phone ||
      String(editModalWorkPhone ?? '').trim() !== i.workPhone ||
      String(editModalEmail ?? '').trim() !== i.email
    );
  }, [editModalContact, editModalName, editModalCompanyName, editModalLinkedSupplierId, editModalCustomerId, editModalRole, editModalPhone, editModalWorkPhone, editModalEmail]);

  const requestCloseEditModal = useCallback(() => {
    if (editModalSaving) return;
    if (isEditModalDirty) {
      Alert.alert(
        'Osparade ändringar',
        'Vill du spara ändringarna innan du stänger?',
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Kasta ändringar', style: 'destructive', onPress: () => setEditModalContact(null) },
          { text: 'Spara', onPress: () => handleEditModalSave() },
        ]
      );
    } else {
      setEditModalContact(null);
    }
  }, [editModalSaving, isEditModalDirty, handleEditModalSave]);

  useEffect(() => {
    if (!editModalContact || Platform.OS !== 'web' || typeof window === 'undefined') return;
    const onEditModalKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        requestCloseEditModal();
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        e.preventDefault();
        e.stopPropagation();
        if (!editModalSaving && editModalName.trim()) handleEditModalSave();
      }
    };
    window.addEventListener('keydown', onEditModalKey, true);
    return () => window.removeEventListener('keydown', onEditModalKey, true);
  }, [editModalContact, editModalSaving, editModalName, requestCloseEditModal, handleEditModalSave]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    if (visible) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = prev; };
    }
  }, [visible]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose]);

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

  // Normalisera för sökning: trim, lowercase, kollapsa mellanslag så att alla kolumner matchar konsekvent
  const normalizeSearchText = (s) => String(s ?? '').toLowerCase().trim().replace(/\s+/g, ' ');
  const digitsOnly = (s) => String(s ?? '').replace(/\D/g, '');

  const filtered = useMemo(() => {
    if (!search.trim()) return contacts;
    const q = search.toLowerCase().trim();
    const qNorm = normalizeSearchText(search);
    const qDigits = digitsOnly(search);
    return contacts.filter((c) => {
      const n = normalizeSearchText(c.name);
      const co = normalizeSearchText(c.contactCompanyName ?? c.companyName ?? c.company ?? '');
      const r = normalizeSearchText(c.role);
      const e = normalizeSearchText(c.email);
      const p = String(c.phone ?? '').trim();
      const wp = String(c.workPhone ?? '').trim();
      const pDigits = digitsOnly(p);
      const wpDigits = digitsOnly(wp);
      const textMatch = n.includes(qNorm) || co.includes(qNorm) || r.includes(qNorm) || e.includes(qNorm);
      const phoneMatch = (qNorm && (p.includes(q) || (qDigits.length >= 2 && pDigits.includes(qDigits)))) || (qNorm && (wp.includes(q) || (qDigits.length >= 2 && wpDigits.includes(qDigits))));
      return textMatch || phoneMatch;
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
        { text: 'Redigera', onPress: () => setEditModalContact(contact) },
        { text: 'Radera', style: 'destructive', onPress: () => requestDeleteContact(contact) },
      ]);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
    const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuContact(contact);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: Platform.OS === 'web' ? 1000 : undefined,
    defaultHeight: Platform.OS === 'web' ? 640 : undefined,
    minWidth: 500,
    minHeight: 400,
  });

  const hasDragPosition = Platform.OS === 'web' && boxStyle && Object.keys(boxStyle).length > 0;
  const defaultBoxStyle = hasDragPosition
    ? {}
    : {
        width: Platform.OS === 'web' ? '90vw' : '90%',
        maxWidth: 1400,
        height: Platform.OS === 'web' ? '85vh' : '85%',
      };

  if (!visible) return null;

  const footer = (
    <TouchableOpacity style={styles.mainModalStangBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
      <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Stäng</Text>
    </TouchableOpacity>
  );

  return (
    <>
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Kontaktregister"
      subtitle="Administrera kontakter"
      headerVariant="neutral"
      titleIcon={<Ionicons name="book-outline" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
      boxStyle={[defaultBoxStyle, boxStyle]}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
    >
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
                  <TouchableOpacity
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4, paddingHorizontal: 6, borderRadius: 6 }}
                    onPress={() => setShowInlineAddRow((v) => !v)}
                    activeOpacity={0.7}
                    accessibilityLabel={showInlineAddRow ? 'Dölj Lägg till snabbt-rad' : 'Visa Lägg till snabbt-rad'}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: showInlineAddRow }}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer', title: showInlineAddRow ? 'Avmarkera för att bara se ifyllda kontakter' : 'Markera för att visa rad för snabbläggning' } : {})}
                  >
                    <Ionicons
                      name={showInlineAddRow ? 'checkbox' : 'square-outline'}
                      size={18}
                      color={showInlineAddRow ? '#0ea5e9' : '#94a3b8'}
                    />
                    <Text style={{ fontSize: 12, color: '#475569', fontWeight: '500' }} numberOfLines={1}>
                      Lägg till snabbt
                    </Text>
                  </TouchableOpacity>
                  {Platform.OS === 'web' && (
                    <>
                      <View style={{ width: 1, height: 20, backgroundColor: '#cbd5e1' }} />
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
                      <Ionicons name="document-outline" size={14} color="#167534" />
                      <Text style={{ fontSize: 12, fontWeight: '500', color: '#167534' }}>Excel</Text>
                    </TouchableOpacity>
                    </>
                  )}
                  <View style={{ width: 1, height: 20, backgroundColor: '#cbd5e1' }} />
                  <TouchableOpacity style={[styles.iconBtn, styles.iconBtnPrimary]} onPress={() => setAddModalVisible(true)} accessibilityLabel="Lägg till kontakt" {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                    <Ionicons name="add" size={16} color="#fff" />
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.iconBtn} onPress={loadContacts} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                    <Ionicons name="refresh" size={14} color="#475569" />
                  </TouchableOpacity>
                </View>
              </View>
            )}
            <View style={styles.toolbarDivider} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {!hasCompany ? null : loading ? (
              <View style={styles.tableWrap}>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Laddar kontakter…</Text>
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={{ flexGrow: 1, minHeight: '100%' }}
                keyboardShouldPersistTaps="handled"
                style={styles.tableScrollHorizontal}
              >
                <View style={styles.tableWrap}>
                <ContactRegistryTable
                  contacts={sorted}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  editingId={null}
                  inlineSavingContact={saving}
                  onSaveEdit={handleSaveInlineEdit}
                  onCancelEdit={() => {}}
                  onRowMenu={openRowMenu}
                  onRowDoubleClick={(contact) => setEditModalContact(contact)}
                  inlineEnabled={hasCompany && showInlineAddRow}
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
              </ScrollView>
            )}
          </ScrollView>

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
    </ModalBase>

    <Modal visible={addModalVisible} transparent animationType="fade" onRequestClose={() => !addModalSaving && setAddModalVisible(false)}>
        <Pressable style={styles.addModalBack} onPress={() => !addModalSaving && setAddModalVisible(false)}>
          <Pressable style={styles.addModalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.addModalHeader}>
              <View style={styles.addModalHeaderLeft}>
                <View style={styles.addModalTitleIcon}>
                  <Ionicons name="person-add-outline" size={18} color={D.titleColor} />
                </View>
                <Text style={styles.addModalTitle} numberOfLines={1} ellipsizeMode="tail">
                  Lägg till kontakt
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !addModalSaving && setAddModalVisible(false)}
                style={styles.addModalCloseBtn}
                accessibilityLabel="Stäng"
                hitSlop={10}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={D.closeIconSize} color={D.closeIconColor} />
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
                <TouchableOpacity style={[styles.iconBtnPrimary, { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius }]} onPress={handleAddModalSave} disabled={addModalSaving || !addModalName.trim()} {...(Platform.OS === 'web' ? { cursor: addModalSaving || !addModalName.trim() ? 'not-allowed' : 'pointer' } : {})}>
                  <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <ModalBase
        visible={!!editModalContact}
        onClose={requestCloseEditModal}
        title="Redigera kontakt"
        headerVariant="neutral"
        titleIcon={<Ionicons name="create-outline" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
        boxStyle={styles.editModalBox}
        contentStyle={styles.editModalContent}
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity style={styles.editModalAvbrytBtn} onPress={requestCloseEditModal} disabled={editModalSaving} {...(Platform.OS === 'web' ? { cursor: editModalSaving ? 'not-allowed' : 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#b91c1c' }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.editModalSparaBtn} onPress={handleEditModalSave} disabled={editModalSaving || !editModalName.trim()} {...(Platform.OS === 'web' ? { cursor: editModalSaving || !editModalName.trim() ? 'not-allowed' : 'pointer' } : {})}>
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Namn *</Text>
          <TextInput value={editModalName} onChangeText={setEditModalName} placeholder="Förnamn Efternamn" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
        </View>
        <View style={[styles.addModalField, styles.addModalDropdown]}>
          <Text style={styles.addModalLabel}>Företag</Text>
          <TextInput
            value={editModalCompanyName}
            onChangeText={(v) => { setEditModalCompanyName(v); handleCompanySearch(v, 'editModal'); }}
            onFocus={() => setCompanySearchActive('editModal')}
            onBlur={() => setTimeout(() => setCompanySearchOpen(false), 200)}
            placeholder="Min. 2 tecken – välj kund/leverantör"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
          {companySearchOpen && companySearchActive === 'editModal' && (companySearchResults || []).length > 0 && (
            <View style={styles.addModalDropdownList}>
              {(companySearchResults || []).slice(0, 15).map((company, i) => (
                <TouchableOpacity
                  key={company.id || i}
                  style={[styles.addModalDropdownItem, editModalCompanyHoverIndex === i ? styles.addModalDropdownItemHighlight : null]}
                  onPress={() => handleEditModalSelectCompany(company)}
                  onMouseEnter={() => setEditModalCompanyHoverIndex(i)}
                  onMouseLeave={() => setEditModalCompanyHoverIndex(-1)}
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
          <TextInput value={editModalRole} onChangeText={setEditModalRole} placeholder="t.ex. Platschef" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Mobil</Text>
          <TextInput value={editModalPhone} onChangeText={(v) => setEditModalPhone(String(v).replace(/\D/g, '').slice(0, 15))} placeholder="Siffror" keyboardType="number-pad" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Arbete</Text>
          <TextInput value={editModalWorkPhone} onChangeText={setEditModalWorkPhone} placeholder="Jobbtelefon" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>E-post</Text>
          <TextInput value={editModalEmail} onChangeText={setEditModalEmail} placeholder="namn@foretag.se" keyboardType="email-address" autoCapitalize="none" style={styles.addModalInput} placeholderTextColor="#94a3b8" {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})} />
        </View>
      </ModalBase>

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
          if (it.key === 'edit') setEditModalContact(c);
          else if (it.key === 'delete') requestDeleteContact(c);
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmContact}
        title="Radera kontakt"
        message={
          deleteConfirmContact
            ? `Du är på väg att permanent radera kontakten "${String(deleteConfirmContact.name ?? '').trim() || 'kontakten'}".\nDetta går inte att ångra.`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
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
    </>
  );
}
