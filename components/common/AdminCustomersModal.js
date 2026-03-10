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
import { MODAL_DESIGN_2026 as D } from '../../constants/modalDesign2026';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
import { ICON_RAIL } from '../../constants/iconRailTheme';
import KundForm from '../../modules/kunder/KundForm';
import KunderTable from '../../modules/kunder/KunderTable';
import {
    addContactToCustomer,
    createCustomer,
    deleteCustomer,
    fetchContacts,
    fetchCustomers,
    linkExistingContactToCustomer,
    normalizeCustomerType,
    removeContactFromCustomer,
    updateCustomer,
} from '../../modules/kunder/kunderService';
import { formatMobileDisplay, mobileDigitsOnly } from '../../utils/formatPhone';
import {
    buildAndDownloadExcel,
    computeSyncPlan,
    KUNDER_EXCEL,
    parseExcelFromBuffer,
    validateHeaders,
} from '../../utils/registerExcel';
import ContextMenu from '../ContextMenu';
import { deleteCompanyContact, fetchCompanyProfile, updateCompanyContact } from '../firebase';
import ModalBase from './ModalBase';
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
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: ICON_RAIL.bg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  titleIcon: {
    width: 28,
    height: 28,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { fontSize: 14, fontWeight: '600', color: ICON_RAIL.iconColorActive },
  titleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    gap: 6,
    flexWrap: 'nowrap',
  },
  titleDot: { fontSize: 11, color: ICON_RAIL.iconColor, marginHorizontal: 5, opacity: 0.8 },
  subtitle: {
    fontSize: 12,
    color: ICON_RAIL.iconColor,
    fontWeight: '400',
    opacity: 0.95,
    flexShrink: 1,
    minWidth: 0,
  },
  closeBtn: {
    padding: 5,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? {
          cursor: 'pointer',
          transition: `background-color ${ICON_RAIL.hoverTransitionMs}ms ease, opacity ${ICON_RAIL.hoverTransitionMs}ms ease`,
        }
      : {}),
  },
  statusOverlay: {
    position: 'absolute',
    left: D.contentPadding,
    right: D.contentPadding,
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
    borderRadius: 8,
    borderWidth: 1,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 6,
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
    paddingHorizontal: D.contentPadding,
    paddingTop: D.sectionGap,
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
    backgroundColor: '#eee',
    marginTop: 12,
    marginHorizontal: -D.contentPadding,
  },
  tableScroll: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  tableScrollContent: {
    paddingHorizontal: D.contentPadding,
    paddingTop: D.sectionGap,
    paddingBottom: D.contentPadding,
  },
  tableScrollHorizontal: {
    flex: 1,
    minHeight: 0,
    alignSelf: 'stretch',
  },
  searchWrap: {
    flex: 1,
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    backgroundColor: '#fff',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#111', padding: 0, marginLeft: 8 },
  iconBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: D.buttonRadius,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#ddd',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
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
  emptyState: {
    padding: 32,
    alignItems: 'center',
    backgroundColor: '#f8fafc',
    borderRadius: D.radius,
    borderWidth: 1,
    borderColor: '#eee',
  },
  emptyTitle: { fontSize: 15, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 15, fontWeight: '500', color: '#475569' },
  modalBack: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalBox: {
    backgroundColor: '#fff',
    borderRadius: 14,
    width: 560,
    maxWidth: '96%',
    maxHeight: '85%',
    overflow: 'hidden',
  },
  modalHeader: {
    flexShrink: 0,
    minHeight: 38,
    maxHeight: 38,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    backgroundColor: ICON_RAIL.bg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 5,
    paddingHorizontal: 14,
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, minWidth: 0 },
  modalTitle: { fontSize: 14, fontWeight: '600', color: ICON_RAIL.iconColorActive, flexShrink: 1, minWidth: 0 },
  modalCloseBtn: {
    padding: 5,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
  },
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  footerBtn: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  mainModalStangBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569', borderWidth: 0 },
  addModalLabel: { fontSize: 12, fontWeight: '500', color: '#475569', marginBottom: 4 },
  addModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: D.inputRadius, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  addModalField: { marginBottom: 14 },
  addModalFieldReadOnly: { borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 8, paddingHorizontal: 10, borderRadius: D.inputRadius, backgroundColor: '#F8FAFC' },
  editModalBox: { width: Platform.OS === 'web' ? 520 : '92%', maxWidth: 520, minHeight: Platform.OS === 'web' ? 380 : undefined },
  editModalContent: { padding: D.contentPadding, paddingBottom: 24 },
  editModalAvbrytBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  editModalSparaBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569', borderWidth: 0 },
});

export default function AdminCustomersModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);

  const [companyName, setCompanyName] = useState('');
  void companyName;
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
  /** När satt: formmodalen är i redigeringsläge med denna kund. Null = lägg till ny. */
  const [formModalEditCustomer, setFormModalEditCustomer] = useState(null);
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
  const [deleteConfirmCustomer, setDeleteConfirmCustomer] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState(null); // { customer, contact }
  const [deletingContact, setDeletingContact] = useState(false);
  const [showInlineAddRow, setShowInlineAddRow] = useState(false);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const excelInputRef = useRef(null);
  const [contactMenuVisible, setContactMenuVisible] = useState(false);
  const [contactMenuPos, setContactMenuPos] = useState({ x: 20, y: 64 });
  const [contactMenuCustomer, setContactMenuCustomer] = useState(null);
  const [contactMenuContact, setContactMenuContact] = useState(null);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEditCustomer, setContactEditCustomer] = useState(null); // kund för Företag-visning
  const [contactEdit, setContactEdit] = useState({ id: '', name: '', role: '', phone: '', workPhone: '', email: '' });

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

  const closeFormModal = useCallback(() => {
    setFormModalVisible(false);
    setFormModalEditCustomer(null);
  }, []);

  const handleSaveForm = async (values) => {
    if (!cid) return;
    setSaving(true);
    setError('');
    try {
      const editId = formModalEditCustomer?.id;
      if (editId) {
        await updateCustomer(cid, editId, {
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
      closeFormModal();
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

  const performDeleteCustomer = async (customer) => {
    if (!cid || !customer) return;
    setDeleting(true);
    try {
      await deleteCustomer(cid, customer.id);
      showNotice('Kund borttagen');
      if (editingId === customer.id) setEditingId(null);
      if (formModalEditCustomer?.id === customer.id) closeFormModal();
      await loadCustomers();
      setDeleteConfirmCustomer(null);
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    } finally {
      setDeleting(false);
    }
  };

  const requestDeleteCustomer = (customer) => setDeleteConfirmCustomer(customer);

  const exportExcel = () => {
    setExcelMenuVisible(false);
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Excel-export är endast tillgängligt i webbversionen.');
      return;
    }
    const rows = (customers || []).map((c) => KUNDER_EXCEL.itemToRow(c));
    buildAndDownloadExcel(
      KUNDER_EXCEL.sheetName,
      KUNDER_EXCEL.headers,
      rows,
      KUNDER_EXCEL.filenamePrefix
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
      const { valid, missing } = validateHeaders(headers, KUNDER_EXCEL.headers);
      if (!valid) {
        setError(`Ogiltiga kolumnrubriker. Saknas: ${(missing || []).join(', ')}. Använd Excel-mallen.`);
        return;
      }
      const plan = computeSyncPlan(rows, customers, {
        keyField: KUNDER_EXCEL.keyField,
        getKeyFromRow: (row) => KUNDER_EXCEL.itemToKey(KUNDER_EXCEL.rowToPayload(row)),
        getKeyFromItem: (item) => KUNDER_EXCEL.itemToKey(item),
      });
      setImportPlan(plan);
      setImportConfirmVisible(true);
    };
    reader.readAsArrayBuffer(file);
    if (excelInputRef.current) excelInputRef.current.value = '';
  };

  const runKunderImport = async () => {
    if (!cid || !importPlan) return;
    setImportBusy(true);
    setError('');
    const failed = [];
    try {
      for (const row of importPlan.toCreate) {
        const payload = KUNDER_EXCEL.rowToPayload(row);
        const name = (payload.name || '').trim();
        if (!name) continue;
        try {
          await createCustomer(cid, payload);
        } catch (e) {
          failed.push(`Skapa ${name}: ${e?.message || 'fel'}`);
        }
      }
      for (const { id, row } of importPlan.toUpdate) {
        const payload = KUNDER_EXCEL.rowToPayload(row);
        try {
          await updateCustomer(cid, id, payload);
        } catch (e) {
          failed.push(`Uppdatera ${payload.name}: ${e?.message || 'fel'}`);
        }
      }
      for (const item of importPlan.toDelete) {
        try {
          await deleteCustomer(cid, item.id);
        } catch (e) {
          failed.push(`Radera ${item.name ?? item.id}: ${e?.message || 'fel'}`);
        }
      }
      setImportConfirmVisible(false);
      setImportPlan(null);
      await loadCustomers();
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

  /** Bara koppla bort kontakten från kunden (behåll i kontaktregistret). */
  const performRemoveOnlyFromCustomer = async () => {
    const { customer, contact } = deleteConfirmContact || {};
    if (!cid || !customer || !contact) return;
    setDeletingContact(true);
    try {
      await removeContactFromCustomer(cid, customer, contact.id);
      await loadContacts();
      showNotice('Kontakt kopplad bort från kund');
      setDeleteConfirmContact(null);
    } catch (e) {
      setError(e?.message || 'Kunde inte koppla bort.');
    } finally {
      setDeletingContact(false);
    }
  };

  /** Radera kontakten från kontaktregistret och koppla bort från kunden. */
  const performDeleteContact = async () => {
    const { customer, contact } = deleteConfirmContact || {};
    if (!cid || !customer || !contact) return;
    setDeletingContact(true);
    try {
      await deleteCompanyContact({ id: contact.id }, cid);
      await removeContactFromCustomer(cid, customer, contact.id);
      await loadContacts();
      showNotice('Kontaktperson raderad');
      setDeleteConfirmContact(null);
    } catch (e) {
      setError(e?.message || 'Kunde inte radera.');
    } finally {
      setDeletingContact(false);
    }
  };

  /** Spara redigerad kontakt (anropas av Spara-knappen och Enter). */
  const performContactEditSave = useCallback(async () => {
    if (!contactEdit.name.trim() || contactEditSaving) return;
    setContactEditSaving(true);
    try {
      await updateCompanyContact(
        {
          id: contactEdit.id,
          patch: {
            name: contactEdit.name.trim(),
            role: contactEdit.role.trim(),
            phone: String(contactEdit.phone ?? '').replace(/\D/g, ''),
            workPhone: contactEdit.workPhone.trim(),
            email: contactEdit.email.trim(),
          },
        },
        cid
      );
      await loadContacts();
      setContactEditOpen(false);
      setContactEditCustomer(null);
      showNotice('Kontakt uppdaterad');
    } catch (e) {
      setError(e?.message || 'Kunde inte spara.');
    } finally {
      setContactEditSaving(false);
    }
  }, [cid, contactEdit.id, contactEdit.name, contactEdit.role, contactEdit.phone, contactEdit.workPhone, contactEdit.email, contactEditSaving]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (formModalVisible) {
          if (!saving) {
            setFormModalVisible(false);
            setFormModalEditCustomer(null);
          }
          return;
        }
        if (contactEditOpen) {
          if (!contactEditSaving) {
            setContactEditOpen(false);
            setContactEditCustomer(null);
          }
          return;
        }
        if (deleteConfirmContact) {
          setDeleteConfirmContact(null);
          return;
        }
        onClose?.();
      } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.altKey && contactEditOpen) {
        e.preventDefault();
        e.stopPropagation();
        if (!contactEditSaving && contactEdit.name.trim()) performContactEditSave();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [visible, onClose, formModalVisible, contactEditOpen, deleteConfirmContact, saving, contactEditSaving, contactEdit.name, performContactEditSave]);

  const openRowMenu = (e, customer) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kund', String(customer.name ?? 'Kund'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => {
          setFormModalEditCustomer(customer);
          setFormModalVisible(true);
        } },
        { text: 'Radera', style: 'destructive', onPress: () => requestDeleteCustomer(customer) },
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
        .map((ct) => ({ id: ct.id, name: ct.name, role: ct.role, email: ct.email, phone: ct.phone, workPhone: ct.workPhone ?? '' }));
    });
    return out;
  }, [customers, contacts]);

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
      title="Kunder"
      subtitle="Administrera kunder"
      headerVariant="neutral"
      titleIcon={<Ionicons name="people-outline" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
      boxStyle={[defaultBoxStyle, boxStyle]}
      overlayStyle={overlayStyle}
      headerProps={headerProps}
      resizeHandles={resizeHandles}
      footer={footer}
      contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
    >
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
                      placeholder="Sök namn, person-/orgnr, adress, ort, kundtyp…"
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
                      {...(Platform.OS === 'web' ? { cursor: 'pointer', title: showInlineAddRow ? 'Avmarkera för att bara se befintliga kunder' : 'Markera för att visa rad för snabbläggning' } : {})}
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
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => { setFormModalEditCustomer(null); setFormModalVisible(true); }}
                      accessibilityLabel="Lägg till kund"
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={loadCustomers}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="refresh" size={14} color="#475569" />
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
            showsVerticalScrollIndicator
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
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator
                    contentContainerStyle={{ flexGrow: 1, minHeight: '100%', minWidth: '100%' }}
                    keyboardShouldPersistTaps="handled"
                    style={styles.tableScrollHorizontal}
                  >
                    <View style={[styles.tableWrap, { minWidth: '100%', flex: 1 }]}>
                  <KunderTable
                    customers={sorted}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onRowPress={() => {}}
                    onRowContextMenu={openRowMenu}
                    onRowMenu={openRowMenu}
                    onRowDoubleClick={(customer) => setEditingId(customer.id)}
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
                    inlineEnabled={hasCompany && showInlineAddRow}
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
                    </View>
                  </ScrollView>
                )}
              </View>
            )}
          </ScrollView>

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
    </ModalBase>

      {/* Add/Edit customer form modal – same as leverantör: Redigera öppnar denna modal */}
      <Modal visible={formModalVisible} transparent animationType="fade" onRequestClose={() => !saving && closeFormModal()}>
        <Pressable style={styles.modalBack} onPress={() => !saving && closeFormModal()}>
          <Pressable style={styles.modalBox} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderLeft}>
                <View style={styles.titleIcon}>
                  <Ionicons name={formModalEditCustomer ? 'create-outline' : 'person-add-outline'} size={18} color={ICON_RAIL.iconColorActive} />
                </View>
                <Text style={styles.modalTitle}>{formModalEditCustomer ? 'Redigera kund' : 'Lägg till kund'}</Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => !saving && closeFormModal()}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={20} color={ICON_RAIL.iconColorActive} />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: '75vh' }} contentContainerStyle={{ paddingBottom: 20 }}>
              <KundForm
                initial={formModalEditCustomer ?? undefined}
                saving={saving}
                onSave={handleSaveForm}
                onCancel={() => !saving && closeFormModal()}
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
            setFormModalEditCustomer(c);
            setFormModalVisible(true);
          } else if (it.key === 'delete') {
            requestDeleteCustomer(c);
          }
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmCustomer}
        title="Radera kund"
        message={
          deleteConfirmCustomer
            ? `Du är på väg att permanent radera kunden "${String(deleteConfirmCustomer.name ?? '').trim() || 'kunden'}".\nDetta går inte att ångra.`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
        busy={deleting}
        onCancel={() => setDeleteConfirmCustomer(null)}
        onConfirm={() => performDeleteCustomer(deleteConfirmCustomer)}
      />

      <ConfirmModal
        visible={!!deleteConfirmContact}
        title="Ta bort kontakt?"
        message={
          deleteConfirmContact
            ? `Kontakter synkas mellan kunder och kontaktregistret. Vill du bara koppla bort "${String(deleteConfirmContact.contact?.name ?? '').trim() || 'kontakten'}" från kunden, eller även radera från kontaktregistret?`
            : 'Kontakter synkas mellan kunder och kontaktregistret. Vill du bara koppla bort kontakten från kunden, eller även radera från kontaktregistret?'
        }
        confirmLabel="Koppla bort kontakt"
        secondConfirmLabel="Radera från kontaktregister"
        danger
        hideCancel
        hideKeyboardHints
        busy={deletingContact}
        onCancel={() => setDeleteConfirmContact(null)}
        onConfirm={performRemoveOnlyFromCustomer}
        onSecondConfirm={performDeleteContact}
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
        onConfirm={runKunderImport}
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
            setContactEditCustomer(customer);
            setContactEdit({
              id: contact.id,
              name: contact.name || '',
              role: contact.role || '',
              phone: contact.phone || '',
              workPhone: String(contact.workPhone ?? '').trim(),
              email: contact.email || '',
            });
            setContactEditOpen(true);
          } else if (it.key === 'delete') {
            setDeleteConfirmContact({ customer, contact });
          }
        }}
      />

      {/* Contact edit modal – samma utseende som Redigera kontakt i Kontaktregistret */}
      <ModalBase
        visible={contactEditOpen}
        onClose={() => {
          if (!contactEditSaving) {
            setContactEditOpen(false);
            setContactEditCustomer(null);
          }
        }}
        title="Redigera kontakt"
        headerVariant="neutral"
        titleIcon={<Ionicons name="create-outline" size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
        boxStyle={styles.editModalBox}
        contentStyle={styles.editModalContent}
        footer={
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <TouchableOpacity
              style={styles.editModalAvbrytBtn}
              onPress={() => { if (!contactEditSaving) { setContactEditOpen(false); setContactEditCustomer(null); } }}
              disabled={contactEditSaving}
              {...(Platform.OS === 'web' ? { cursor: contactEditSaving ? 'not-allowed' : 'pointer' } : {})}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#b91c1c' }}>Avbryt</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.editModalSparaBtn}
              onPress={performContactEditSave}
              disabled={contactEditSaving || !contactEdit.name.trim()}
              {...(Platform.OS === 'web' ? { cursor: contactEditSaving || !contactEdit.name.trim() ? 'not-allowed' : 'pointer' } : {})}
            >
              <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
            </TouchableOpacity>
          </View>
        }
      >
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Namn *</Text>
          <TextInput
            value={contactEdit.name}
            onChangeText={(v) => setContactEdit((prev) => ({ ...prev, name: v }))}
            placeholder="Förnamn Efternamn"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Företag</Text>
          <View style={styles.addModalFieldReadOnly}>
            <Text style={{ fontSize: 14, color: '#111', fontWeight: '600' }} numberOfLines={1}>
              {contactEditCustomer?.name ?? '—'}
            </Text>
          </View>
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Roll</Text>
          <TextInput
            value={contactEdit.role}
            onChangeText={(v) => setContactEdit((prev) => ({ ...prev, role: v }))}
            placeholder="t.ex. Platschef"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Mobil</Text>
          <TextInput
            value={formatMobileDisplay(contactEdit.phone)}
            onChangeText={(v) => setContactEdit((prev) => ({ ...prev, phone: mobileDigitsOnly(v) }))}
            placeholder="xxx xxx xx xx"
            keyboardType="number-pad"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>Arbete</Text>
          <TextInput
            value={contactEdit.workPhone}
            onChangeText={(v) => setContactEdit((prev) => ({ ...prev, workPhone: v }))}
            placeholder="Jobbtelefon"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
        <View style={styles.addModalField}>
          <Text style={styles.addModalLabel}>E-post</Text>
          <TextInput
            value={contactEdit.email}
            onChangeText={(v) => setContactEdit((prev) => ({ ...prev, email: v }))}
            placeholder="namn@foretag.se"
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.addModalInput}
            placeholderTextColor="#94a3b8"
            {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
          />
        </View>
      </ModalBase>
    </>
  );
}
