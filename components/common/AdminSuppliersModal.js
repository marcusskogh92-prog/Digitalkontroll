/**
 * Admin modal: Leverantörer. Opens from Administration → Leverantörer.
 * Same UX as Kunder/Kontaktregister: fixed header, fixed toolbar, scrollable table only.
 * Inline add + inline edit (kebab → Redigera), Enter/Esc, status overlay.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
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
import { ICON_RAIL } from '../../constants/iconRailTheme';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';
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
import LeverantorerTable from '../../modules/leverantorer/LeverantorerTable';
import LeverantorForm from '../../modules/leverantorer/LeverantorForm';
import {
    buildAndDownloadExcel,
    computeSyncPlan,
    LEVERANTORER_EXCEL,
    parseExcelFromBuffer,
    validateHeaders,
} from '../../utils/registerExcel';
import ContextMenu from '../ContextMenu';
import { createCategory, deleteCompanyContact, fetchByggdelar, fetchCategories, fetchCompanyProfile, fetchKontoplan, updateCompanyContact } from '../firebase';
import { AdminModalContext } from './AdminModalContext';
import ModalBase from './ModalBase';
import ConfirmModal from './Modals/ConfirmModal';
import SimpleByggdelSelectModal from './Modals/SimpleByggdelSelectModal';
import SimpleKategoriSelectModal from './Modals/SimpleKategoriSelectModal';
import SimpleKontonSelectModal from './Modals/SimpleKontonSelectModal';
import { formatMobileDisplay, mobileDigitsOnly } from '../../utils/formatPhone';

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
  subtitle: { fontSize: 12, color: ICON_RAIL.iconColor, fontWeight: '400', opacity: 0.95, flexShrink: 1, minWidth: 0 },
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
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: D.buttonRadius,
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
    backgroundColor: D.footer.borderTopColor,
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
  /** Sökfält enligt golden rule: input radius 6, border #ddd, padding 8/10, font 13 */
  searchWrap: {
    flex: 1,
    maxWidth: 400,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: D.inputRadius,
    backgroundColor: '#fff',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#1e293b', padding: 0, marginLeft: 8 },
  iconBtn: {
    minWidth: 28,
    height: 28,
    paddingHorizontal: 8,
    borderRadius: D.buttonRadius,
    backgroundColor: D.buttonSecondaryBg,
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
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
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
  emptyTitle: { fontSize: 13, fontWeight: '500', color: '#475569', marginBottom: 6 },
  selectCompany: { padding: 32, alignItems: 'center' },
  selectCompanyText: { fontSize: 13, fontWeight: '500', color: '#475569' },
  /** Footer enligt golden rule: D.footer (padding, border, bg) */
  footer: {
    flexShrink: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingVertical: D.footer.paddingVertical,
    paddingHorizontal: D.footer.paddingHorizontal,
    borderTopWidth: D.footer.borderTopWidth,
    borderTopColor: D.footer.borderTopColor,
    backgroundColor: D.footer.backgroundColor,
  },
  addModalField: { marginBottom: 14 },
  addModalLabel: { fontSize: 12, fontWeight: '500', color: '#475569', marginBottom: 4 },
  addModalInput: { borderWidth: 1, borderColor: '#ddd', borderRadius: D.inputRadius, paddingVertical: 8, paddingHorizontal: 10, fontSize: 13, color: '#111', backgroundColor: '#fff' },
  addModalFieldReadOnly: { borderWidth: 1, borderColor: '#E6E8EC', paddingVertical: 8, paddingHorizontal: 10, borderRadius: D.inputRadius, backgroundColor: '#F8FAFC' },
  editModalBox: { width: Platform.OS === 'web' ? 520 : '92%', maxWidth: 520, minHeight: Platform.OS === 'web' ? 380 : undefined },
  editModalContent: { padding: D.contentPadding, paddingBottom: 24 },
  editModalAvbrytBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, borderWidth: 1, borderColor: '#fecaca', backgroundColor: '#fef2f2' },
  editModalSparaBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569', borderWidth: 0 },
  footerBtn: {
    paddingVertical: D.buttonPaddingVertical,
    paddingHorizontal: D.buttonPaddingHorizontal,
    borderRadius: D.buttonRadius,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    backgroundColor: '#fff',
  },
  /** Stäng-knapp enligt golden rule: primär = bannerns färg (dimmad #2D3A4B), inte ljusgrå */
  mainModalStangBtn: { paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: D.buttonPrimaryBg, borderWidth: 0 },
});

export default function AdminSuppliersModal({ visible, companyId, onClose }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);
  const { openByggdelModal, openKontoplanModal, openKategoriModal, registerSelectionSavedListener } = useContext(AdminModalContext);

  const [companyName, setCompanyName] = useState('');
  void companyName;
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
  const [keepExpandedSupplierId, setKeepExpandedSupplierId] = useState(null);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [showInlineAddRow, setShowInlineAddRow] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuSupplier, setRowMenuSupplier] = useState(null);
  const [contactMenuVisible, setContactMenuVisible] = useState(false);
  const [contactMenuPos, setContactMenuPos] = useState({ x: 20, y: 64 });
  const [contactMenuSupplier, setContactMenuSupplier] = useState(null);
  const [contactMenuContact, setContactMenuContact] = useState(null);
  const [deleteConfirmSupplier, setDeleteConfirmSupplier] = useState(null);
  const [deleteConfirmContact, setDeleteConfirmContact] = useState(null); // { supplier, contact, action: 'removeFromSupplier' | 'deleteFromRegister' }
  const [deleting, setDeleting] = useState(false);
  const [deletingContact, setDeletingContact] = useState(false);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactEditSupplier, setContactEditSupplier] = useState(null);
  const [contactEditContact, setContactEditContact] = useState(null);
  const [contactEdit, setContactEdit] = useState({ id: '', name: '', role: '', phone: '', workPhone: '', email: '' });
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  /** När satt: modalen är i redigeringsläge med förifylld data. Null = lägg till ny. */
  const [addModalEditSupplier, setAddModalEditSupplier] = useState(null);
  const [addModalSaving, setAddModalSaving] = useState(false);
  const [addModalCategoryIds, setAddModalCategoryIds] = useState([]);
  const [addModalByggdelIds, setAddModalByggdelIds] = useState([]);
  const [addModalKontonIds, setAddModalKontonIds] = useState([]);
  const [simpleKategoriModalVisible, setSimpleKategoriModalVisible] = useState(false);
  const [simpleByggdelModalVisible, setSimpleByggdelModalVisible] = useState(false);
  const [simpleKontonModalVisible, setSimpleKontonModalVisible] = useState(false);
  const [addModalDirty, setAddModalDirty] = useState(false);
  const [addModalUnsavedVisible, setAddModalUnsavedVisible] = useState(false);
  const tableScrollRef = useRef(null);
  const excelInputRef = useRef(null);
  const categoryModalSourceRef = useRef(null);
  const addFormSubmitRef = useRef(null);
  const inlineSaveRef = useRef(null);

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);

  const loadSuppliers = useCallback(async (options = {}) => {
    const skipLoading = options.skipLoading === true;
    if (!cid) {
      setSuppliers([]);
      return;
    }
    if (!skipLoading) setLoading(true);
    setError('');
    try {
      const data = await fetchSuppliers(cid);
      setSuppliers(data || []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda leverantörer.');
    } finally {
      if (!skipLoading) setLoading(false);
    }
  }, [cid]);

  useEffect(() => {
    inlineSaveRef.current = handleInlineSave;
  });
  useEffect(() => {
    if (!registerSelectionSavedListener) return;
    registerSelectionSavedListener((payload) => {
      if (payload?.forFormByggdel === true && Array.isArray(payload.selectedCodes)) {
        setAddModalByggdelIds(payload.selectedCodes);
        return;
      }
      if (Array.isArray(payload)) {
        if (categoryModalSourceRef.current === 'addModal') {
          setAddModalCategoryIds(payload);
          categoryModalSourceRef.current = null;
          setTimeout(() => addFormSubmitRef.current?.submit?.(), 0);
        } else if (categoryModalSourceRef.current === 'inline') {
          setInlineCategoryIds(payload);
          categoryModalSourceRef.current = null;
          // Efter kategorival från inline-rad: spara leverantören (kräver minst företagsnamn)
          setTimeout(() => inlineSaveRef.current?.(), 0);
        } else {
          setInlineCategoryIds(payload);
          categoryModalSourceRef.current = null;
        }
      } else if (typeof payload === 'string' && payload.trim()) {
        setKeepExpandedSupplierId(payload.trim());
        loadSuppliers();
        setTimeout(() => setKeepExpandedSupplierId(null), 800);
      } else {
        loadSuppliers();
      }
    });
    return () => registerSelectionSavedListener(null);
  }, [registerSelectionSavedListener, loadSuppliers]);

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
      const categoryIds = Array.isArray(sup.categories) ? sup.categories : (sup.category ? [sup.category] : []);
      const cat = categoryIds
        .map((id) => {
          const c = (companyCategories || []).find((x) => x.id === id);
          return c ? (c.name ?? c.id ?? '') : id;
        })
        .join(' ')
        .toLowerCase();
      const byggdelStr = (Array.isArray(sup.byggdelTags) ? sup.byggdelTags : [])
        .map((code) => {
          const b = (companyByggdelar || []).find((x) => (x.code ?? x.id) === code);
          return b ? `${b.code ?? b.id ?? ''} ${b.name ?? ''}`.trim() : code;
        })
        .join(' ')
        .toLowerCase();
      const kontonStr = (Array.isArray(sup.konton) ? sup.konton : [])
        .map((k) => {
          const acc = (companyKontoplan || []).find((x) => (x.konto ?? x.id) === k);
          return acc ? `${acc.konto ?? acc.id ?? ''} ${acc.benamning ?? ''}`.trim() : k;
        })
        .join(' ')
        .toLowerCase();
      return (
        name.includes(s) ||
        orgnr.includes(s) ||
        addr.includes(s) ||
        post.includes(s) ||
        city.includes(s) ||
        cat.includes(s) ||
        byggdelStr.includes(s) ||
        kontonStr.includes(s)
      );
    });
  }, [suppliers, search, companyCategories, companyByggdelar, companyKontoplan]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    const byggdelSortKey = (s) => {
      const codes = Array.isArray(s.byggdelTags) ? s.byggdelTags : [];
      return codes
        .map((code) => {
          const b = (companyByggdelar || []).find((x) => (x.code ?? x.id) === code);
          return b ? (b.name ?? b.code ?? code) : code;
        })
        .join(', ');
    };
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
      } else if (sortColumn === 'byggdelar') {
        aVal = byggdelSortKey(a);
        bVal = byggdelSortKey(b);
      }
      const cmp = (aVal || '').localeCompare(bVal || '', 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortColumn, sortDirection, companyByggdelar]);

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

  // ESC/ENTER hanteras av ConfirmModal

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
      await loadSuppliers({ skipLoading: true });
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

  /** Bara koppla bort kontakten från leverantören (behåll i kontaktregistret). */
  const performRemoveOnlyFromSupplier = async () => {
    const { supplier, contact } = deleteConfirmContact || {};
    if (!cid || !supplier || !contact) return;
    setDeletingContact(true);
    try {
      await removeContactFromSupplier(cid, supplier.id, contact.id);
      await loadContacts();
      await loadSuppliers({ skipLoading: true });
      showNotice('Kontakt kopplad bort från leverantör');
      setDeleteConfirmContact(null);
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setDeletingContact(false);
    }
  };

  /** Radera kontakten från kontaktregistret och koppla bort från leverantören. */
  const performDeleteContactFromSupplier = async () => {
    const { supplier, contact } = deleteConfirmContact || {};
    if (!cid || !supplier || !contact) return;
    setDeletingContact(true);
    try {
      await deleteCompanyContact({ id: contact.id }, cid);
      await removeContactFromSupplier(cid, supplier.id, contact.id);
      await loadContacts();
      await loadSuppliers({ skipLoading: true });
      showNotice('Kontaktperson raderad');
      setDeleteConfirmContact(null);
    } catch (e) {
      setError(formatWriteError(e));
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
      await loadSuppliers({ skipLoading: true });
      setContactEditOpen(false);
      setContactEditSupplier(null);
      setContactEditContact(null);
      showNotice('Kontakt uppdaterad');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setContactEditSaving(false);
    }
  }, [cid, contactEdit.id, contactEdit.name, contactEdit.role, contactEdit.phone, contactEdit.workPhone, contactEdit.email, contactEditSaving]);

  useEffect(() => {
    if (!visible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (contactEditOpen && !contactEditSaving) {
          setContactEditOpen(false);
          setContactEditSupplier(null);
          setContactEditContact(null);
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
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [visible, onClose, deleteConfirmContact, contactEditOpen, contactEditSaving, contactEdit.name, performContactEditSave]);

  const handleLinkContact = async (supplier, contactId, patch) => {
    if (!cid) return;
    try {
      await linkExistingContactToSupplier(cid, supplier.id, contactId, patch);
      showNotice('Kontakt kopplad');
      await loadSuppliers({ skipLoading: true });
    } catch (e) {
      setError(formatWriteError(e));
    }
  };

  const openRowMenu = (e, supplier) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Leverantör', String(supplier.companyName ?? 'Leverantör'), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => {
          setAddModalEditSupplier(supplier);
          setAddModalCategoryIds(Array.isArray(supplier.categories) ? supplier.categories : (supplier.category ? [supplier.category] : []));
          setAddModalByggdelIds(supplier.byggdelTags || []);
          setAddModalDirty(false);
          setAddModalVisible(true);
        } },
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

  const contactMenuItems = [
    { key: 'edit', label: 'Redigera kontakt', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'removeFromSupplier', label: 'Radera från företag', icon: <Ionicons name="unlink-outline" size={16} color="#0f172a" /> },
    { key: 'deleteFromRegister', label: 'Radera från register', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  const contactsBySupplierId = useMemo(() => {
    const out = {};
    const contactList = contacts || [];
    (suppliers || []).forEach((s) => {
      const seen = new Set();
      const list = [];
      const add = (c) => {
        if (!c || seen.has(c.id)) return;
        seen.add(c.id);
        list.push({ id: c.id, name: c.name, role: c.role, email: c.email, phone: c.phone });
      };
      // 1) Kontakter som finns i leverantörens contactIds (kopplade från leverantörsmodalen)
      (s.contactIds || []).forEach((id) => {
        const c = contactList.find((x) => x.id === id);
        if (c) add(c);
      });
      // 2) Kontakter som har linkedSupplierId = denna leverantör (t.ex. kopplade från Kontaktregistret)
      contactList.forEach((c) => {
        if (String(c?.linkedSupplierId || '').trim() === s.id) add(c);
      });
      // 3) Kontakter som har contactCompanyName = leverantörens företagsnamn (Kontaktregistret, Företag = Wilzéns Mark)
      const supplierNameNorm = String(s.companyName || '').trim().toLowerCase();
      if (supplierNameNorm) {
        contactList.forEach((c) => {
          const cn = String(c?.contactCompanyName || '').trim().toLowerCase();
          if (cn && cn === supplierNameNorm) add(c);
        });
      }
      out[s.id] = list;
    });
    return out;
  }, [suppliers, contacts]);

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: Platform.OS === 'web' ? 1200 : undefined,
    defaultHeight: Platform.OS === 'web' ? 760 : undefined,
    minWidth: 600,
    minHeight: 480,
  });

  const addModalDrag = useDraggableResizableModal(addModalVisible, {
    defaultWidth: 520,
    defaultHeight: 660,
    minWidth: 400,
    minHeight: 520,
  });

  const closeAddModal = useCallback(() => {
    setAddModalVisible(false);
    setAddModalEditSupplier(null);
    setAddModalCategoryIds([]);
    setAddModalByggdelIds([]);
    setAddModalKontonIds([]);
    setSimpleKategoriModalVisible(false);
    setSimpleByggdelModalVisible(false);
    setSimpleKontonModalVisible(false);
    setAddModalDirty(false);
    setAddModalUnsavedVisible(false);
  }, []);

  const requestAddModalClose = useCallback(() => {
    if (addModalSaving) return;
    if (addModalDirty) setAddModalUnsavedVisible(true);
    else closeAddModal();
  }, [addModalDirty, addModalSaving, closeAddModal]);

  useEffect(() => {
    if (!addModalVisible || Platform.OS !== 'web') return;
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        if (simpleKategoriModalVisible) {
          setSimpleKategoriModalVisible(false);
          e.stopImmediatePropagation();
          return;
        }
        if (simpleByggdelModalVisible) {
          setSimpleByggdelModalVisible(false);
          e.stopImmediatePropagation();
          return;
        }
        if (simpleKontonModalVisible) {
          setSimpleKontonModalVisible(false);
          e.stopImmediatePropagation();
          return;
        }
        if (addModalUnsavedVisible) setAddModalUnsavedVisible(false);
        else requestAddModalClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [addModalVisible, addModalUnsavedVisible, simpleKategoriModalVisible, simpleByggdelModalVisible, simpleKontonModalVisible, requestAddModalClose]);

  const hasDragPosition = Platform.OS === 'web' && boxStyle && Object.keys(boxStyle).length > 0;
  const defaultBoxStyle = hasDragPosition
    ? {}
    : {
        width: Platform.OS === 'web' ? '90vw' : '90%',
        maxWidth: 1200,
        height: Platform.OS === 'web' ? '85vh' : '85%',
      };

  if (!visible) return null;

  const footer = (
    <TouchableOpacity style={styles.mainModalStangBtn} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
      <Text style={{ fontSize: 13, fontWeight: D.buttonPrimaryFontWeight, color: D.buttonPrimaryColor }}>Stäng</Text>
    </TouchableOpacity>
  );

  return (
    <>
    <ModalBase
      visible={visible}
      onClose={onClose}
      title="Leverantörer"
      subtitle="Register över leverantörer"
      headerVariant="neutralCompact"
      titleIcon={<Ionicons name="business-outline" size={D.headerNeutralCompactIconPx} color={D.headerNeutralTextColor} />}
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
              <>
                <View style={styles.toolbar}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color="#64748b" />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Sök namn, org-nr, ort, kategori, byggdel, konto…"
                      placeholderTextColor="#94a3b8"
                      {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                    />
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: D.buttonPaddingVertical, paddingHorizontal: 10, borderRadius: D.buttonRadius }}
                      onPress={() => setShowInlineAddRow((v) => !v)}
                      activeOpacity={0.7}
                      accessibilityLabel={showInlineAddRow ? 'Dölj Lägg till snabbt-rad' : 'Visa Lägg till snabbt-rad'}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: showInlineAddRow }}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer', title: showInlineAddRow ? 'Avmarkera för att bara se befintliga leverantörer' : 'Markera för att visa rad för snabbläggning' } : {})}
                    >
                      <Ionicons
                        name={showInlineAddRow ? 'checkbox' : 'square-outline'}
                        size={16}
                        color={showInlineAddRow ? '#334155' : '#94a3b8'}
                      />
                      <Text style={{ fontSize: 12, color: '#475569', fontWeight: '500' }} numberOfLines={1}>
                        Lägg till snabbt
                      </Text>
                    </TouchableOpacity>
                    {Platform.OS === 'web' && (
                      <>
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
                          <Ionicons name="document-outline" size={14} color="#15803d" />
                          <Text style={{ fontSize: 12, fontWeight: D.buttonPrimaryFontWeight, color: '#15803d' }}>Excel</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity
                      style={[styles.iconBtn, styles.iconBtnPrimary]}
                      onPress={() => {
                        setAddModalEditSupplier(null);
                        setAddModalCategoryIds([]);
                        setAddModalByggdelIds([]);
                        setAddModalKontonIds([]);
                        setAddModalDirty(false);
                        setAddModalVisible(true);
                      }}
                      accessibilityLabel="Lägg till leverantör"
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={16} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={loadSuppliers}
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

          <ScrollView
            ref={tableScrollRef}
            style={styles.tableScroll}
            contentContainerStyle={styles.tableScrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
          >
            {!hasCompany ? null : loading ? (
              <View style={styles.tableWrap}>
                <View style={styles.emptyState}>
                  <Text style={styles.emptyTitle}>Laddar leverantörer…</Text>
                </View>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator
                contentContainerStyle={{ flexGrow: 1, minHeight: '100%', alignSelf: 'stretch' }}
                keyboardShouldPersistTaps="handled"
                style={styles.tableScrollHorizontal}
              >
                <View style={[styles.tableWrap, { alignSelf: 'stretch', flex: 1 }]}>
                  <LeverantorerTable
                    suppliers={sorted}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    onRowPress={() => {}}
                    onRowContextMenu={openRowMenu}
                    onRowMenu={openRowMenu}
                    onRowDoubleClick={(supplier) => setEditingId(supplier.id)}
                    editingId={editingId}
                    inlineSavingCustomer={saving}
                    onSaveEdit={handleSaveInlineEdit}
                    onCancelEdit={() => setEditingId(null)}
                    contactRegistry={contacts}
                    contactsBySupplierId={contactsBySupplierId}
                    onAddContact={handleAddContact}
                    onRemoveContact={handleRemoveContact}
                    onLinkContact={handleLinkContact}
                    onContactMenu={(e, supplier, contact) => {
                      if (Platform.OS !== 'web') return;
                      const ne = e?.nativeEvent || e;
                      const x = Number(ne?.pageX ?? 20);
                      const y = Number(ne?.pageY ?? 64);
                      setContactMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
                      setContactMenuSupplier(supplier);
                      setContactMenuContact(contact);
                      setContactMenuVisible(true);
                    }}
                    companyCategories={companyCategories}
                    keepExpandedSupplierId={keepExpandedSupplierId}
                    companyByggdelar={companyByggdelar}
                    companyKontoplan={companyKontoplan}
                    onCategoriesChange={handleCategoriesChange}
                    onByggdelarChange={handleByggdelarChange}
                    onKontonChange={handleKontonChange}
                    onOpenByggdelar={(s) =>
                      openByggdelModal(cid, {
                        entityType: 'supplier',
                        entityId: s.id,
                        entityName: s.companyName ?? '',
                        selectedCodes: (s.byggdelTags ?? []) || [],
                      })
                    }
                    onOpenKonton={(s) =>
                      openKontoplanModal(cid, {
                        entityType: 'supplier',
                        entityId: s.id,
                        entityName: s.companyName ?? '',
                        selectedKonton: (s.konton ?? []) || [],
                      })
                    }
                    onOpenKategorier={(s) =>
                      openKategoriModal(cid, {
                        entityType: 'supplier',
                        entityId: s.id,
                        entityName: s.companyName ?? '',
                        selectedCategoryIds: (s.categories ?? []) || [],
                      })
                    }
                    onEditSupplier={(s) => {
                      setAddModalEditSupplier(s);
                      setAddModalCategoryIds(Array.isArray(s.categories) ? s.categories : (s.category ? [s.category] : []));
                      setAddModalByggdelIds(s.byggdelTags || []);
                      setAddModalKontonIds(Array.isArray(s.konton) ? s.konton : []);
                      setAddModalDirty(false);
                      setAddModalVisible(true);
                    }}
                    onOpenKategoriForInlineAdd={() => {
                      categoryModalSourceRef.current = 'inline';
                      openKategoriModal(cid, {
                        forForm: true,
                        selectedCategoryIds: inlineCategoryIds || [],
                        entityName: 'formulär',
                      });
                    }}
                    inlineEnabled={hasCompany && showInlineAddRow}
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
                </View>
              </ScrollView>
            )}
          </ScrollView>

          {(notice || error) ? (
            <Animated.View style={[styles.statusOverlay, { opacity: statusOpacity }]} pointerEvents="none">
              <View style={[styles.statusBox, notice ? styles.statusBoxSuccess : styles.statusBoxError]}>
                {notice ? (
                  <>
                    <Ionicons name="checkmark-circle" size={16} color="#15803d" />
                    <Text style={{ fontSize: 12, color: '#15803d', fontWeight: D.buttonPrimaryFontWeight }}>{notice}</Text>
                  </>
                ) : (
                  <>
                    <Ionicons name="warning" size={16} color="#dc2626" />
                    <Text style={{ fontSize: 12, color: '#dc2626', fontWeight: D.buttonPrimaryFontWeight }}>{error}</Text>
                  </>
                )}
              </View>
            </Animated.View>
          ) : null}
    </ModalBase>

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
          if (it.key === 'edit') {
            setAddModalEditSupplier(s);
            setAddModalCategoryIds(Array.isArray(s.categories) ? s.categories : (s.category ? [s.category] : []));
            setAddModalByggdelIds(s.byggdelTags || []);
            setAddModalKontonIds(Array.isArray(s.konton) ? s.konton : []);
            setAddModalDirty(false);
            setAddModalVisible(true);
          } else if (it.key === 'delete') requestDelete(s);
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmSupplier}
        title="Radera leverantör"
        message={
          deleteConfirmSupplier
            ? `Du är på väg att permanent radera leverantören "${String(deleteConfirmSupplier.companyName ?? '').trim() || 'leverantören'}".\nDetta går inte att ångra.`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
        busy={deleting}
        onCancel={() => setDeleteConfirmSupplier(null)}
        onConfirm={confirmDelete}
      />

      <ContextMenu
        visible={contactMenuVisible}
        x={contactMenuPos.x}
        y={contactMenuPos.y}
        items={contactMenuItems}
        onClose={() => setContactMenuVisible(false)}
        onSelect={(it) => {
          setContactMenuVisible(false);
          const supplier = contactMenuSupplier;
          const contact = contactMenuContact;
          if (!supplier || !contact || !it) return;
          if (it.key === 'edit') {
            setContactEditSupplier(supplier);
            setContactEditContact(contact);
            setContactEdit({
              id: contact.id,
              name: contact.name || '',
              role: contact.role || '',
              phone: contact.phone || '',
              workPhone: String(contact.workPhone ?? '').trim(),
              email: contact.email || '',
            });
            setContactEditOpen(true);
          } else if (it.key === 'removeFromSupplier') {
            setDeleteConfirmContact({ supplier, contact, action: 'removeFromSupplier' });
          } else if (it.key === 'deleteFromRegister') {
            setDeleteConfirmContact({ supplier, contact, action: 'deleteFromRegister' });
          }
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmContact}
        title={
          deleteConfirmContact?.action === 'deleteFromRegister'
            ? 'Radera från kontaktregister?'
            : 'Koppla bort kontakt?'
        }
        message={
          deleteConfirmContact?.action === 'deleteFromRegister'
            ? `"${String(deleteConfirmContact?.contact?.name ?? '').trim() || 'Kontakten'}" raderas helt från kontaktregistret och kopplas bort från leverantören.`
            : `"${String(deleteConfirmContact?.contact?.name ?? '').trim() || 'Kontakten'}" tas bort från leverantören men finns kvar i kontaktregistret.`
        }
        confirmLabel={deleteConfirmContact?.action === 'deleteFromRegister' ? 'Radera' : 'Koppla bort'}
        danger
        hideKeyboardHints
        busy={deletingContact}
        onCancel={() => setDeleteConfirmContact(null)}
        onConfirm={
          deleteConfirmContact?.action === 'deleteFromRegister'
            ? performDeleteContactFromSupplier
            : performRemoveOnlyFromSupplier
        }
      />

      {/* Redigera kontakt – samma utseende som i Kunder/Kontaktregister */}
      <ModalBase
        visible={contactEditOpen}
        onClose={() => {
          if (!contactEditSaving) {
            setContactEditOpen(false);
            setContactEditSupplier(null);
            setContactEditContact(null);
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
              onPress={() => { if (!contactEditSaving) { setContactEditOpen(false); setContactEditSupplier(null); setContactEditContact(null); } }}
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
              {contactEditSupplier?.companyName ?? '—'}
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

      <ModalBase
        visible={addModalVisible}
        onClose={requestAddModalClose}
        title={addModalEditSupplier ? 'Redigera leverantör' : 'Lägg till leverantör'}
        titleIcon={<Ionicons name={addModalEditSupplier ? 'create-outline' : 'add'} size={D.headerNeutralIconSize} color={D.headerNeutralTextColor} />}
        headerVariant="neutral"
        boxStyle={addModalDrag.boxStyle}
        overlayStyle={addModalDrag.overlayStyle}
        headerProps={addModalDrag.headerProps}
        resizeHandles={addModalDrag.resizeHandles}
        contentStyle={{ padding: 0, flex: 1, minHeight: 0 }}
      >
        <ScrollView style={{ flex: 1, minHeight: 0 }} contentContainerStyle={{ paddingBottom: 12, flexGrow: 1 }} keyboardShouldPersistTaps="handled">
          <LeverantorForm
            ref={addFormSubmitRef}
            initial={addModalEditSupplier}
            byggdelar={companyByggdelar || []}
            saving={addModalSaving}
            onDirtyChange={setAddModalDirty}
            onSave={async (values) => {
              setAddModalSaving(true);
              setError('');
              const isEdit = !!addModalEditSupplier;
              const supplierId = addModalEditSupplier?.id;
              try {
                if (isEdit && supplierId) {
                  await updateSupplier(cid, supplierId, {
                    companyName: values.companyName,
                    organizationNumber: values.organizationNumber || '',
                    address: values.address || '',
                    postalCode: values.postalCode || '',
                    city: values.city || '',
                    category: (values.categories && values.categories[0]) || values.category || '',
                    categories: values.categories || [],
                    byggdelTags: values.byggdelTags || [],
                    konton: values.konton || [],
                  });
                  showNotice('Leverantör uppdaterad');
                } else {
                  await createSupplier(cid, {
                    companyName: values.companyName,
                    organizationNumber: values.organizationNumber || '',
                    address: values.address || '',
                    postalCode: values.postalCode || '',
                    city: values.city || '',
                    category: (values.categories && values.categories[0]) || values.category || '',
                    categories: values.categories || [],
                    byggdelTags: values.byggdelTags || [],
                    konton: values.konton || [],
                  });
                  showNotice('Leverantör tillagd');
                }
                closeAddModal();
                await loadSuppliers();
              } catch (e) {
                setError(formatWriteError(e));
              } finally {
                setAddModalSaving(false);
              }
            }}
            onCancel={requestAddModalClose}
            onOpenKategoriRequest={() => setSimpleKategoriModalVisible(true)}
            categoryIdsForForm={addModalCategoryIds}
            onCategoryIdsChange={setAddModalCategoryIds}
            categoryOptions={companyCategories}
            onOpenByggdelRequest={() => setSimpleByggdelModalVisible(true)}
            formByggdelIds={addModalByggdelIds}
            onByggdelIdsChange={setAddModalByggdelIds}
            onOpenKontonRequest={() => setSimpleKontonModalVisible(true)}
            formKontonIds={addModalKontonIds}
            onKontonIdsChange={setAddModalKontonIds}
            kontonOptions={companyKontoplan}
          />
        </ScrollView>
      </ModalBase>

      <SimpleKategoriSelectModal
        visible={simpleKategoriModalVisible}
        onClose={() => setSimpleKategoriModalVisible(false)}
        categories={companyCategories}
        selectedIds={addModalCategoryIds}
        onSave={(ids) => {
          setAddModalCategoryIds(ids);
          setSimpleKategoriModalVisible(false);
        }}
      />

      <SimpleByggdelSelectModal
        visible={simpleByggdelModalVisible}
        onClose={() => setSimpleByggdelModalVisible(false)}
        byggdelar={companyByggdelar}
        selectedIds={addModalByggdelIds}
        onSave={(ids) => {
          setAddModalByggdelIds(ids);
          setSimpleByggdelModalVisible(false);
        }}
      />

      <SimpleKontonSelectModal
        visible={simpleKontonModalVisible}
        onClose={() => setSimpleKontonModalVisible(false)}
        accounts={companyKontoplan}
        selectedIds={addModalKontonIds}
        onSave={(ids) => {
          setAddModalKontonIds(ids);
          setSimpleKontonModalVisible(false);
        }}
      />

      <Modal
        visible={addModalUnsavedVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAddModalUnsavedVisible(false)}
      >
        <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)' }} onPress={() => setAddModalUnsavedVisible(false)}>
          <Pressable style={{ backgroundColor: '#fff', borderRadius: D.radius, padding: 24, width: '100%', maxWidth: 400 }} onPress={(e) => e.stopPropagation()}>
            <Text style={{ fontSize: 18, fontWeight: '600', color: '#0f172a', marginBottom: 8 }}>Osparade ändringar</Text>
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>Vill du spara ändringarna innan du stänger?</Text>
            <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 12, flexWrap: 'wrap' }}>
              <TouchableOpacity onPress={() => setAddModalUnsavedVisible(false)} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#f1f5f9' }} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#0f172a' }}>Fortsätt redigera</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => { setAddModalUnsavedVisible(false); closeAddModal(); }} style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#fef2f2', borderWidth: 1, borderColor: '#fecaca' }} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#b91c1c' }}>Kasta ändringar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setAddModalUnsavedVisible(false);
                  addFormSubmitRef.current?.submit?.();
                }}
                style={{ paddingVertical: D.buttonPaddingVertical, paddingHorizontal: D.buttonPaddingHorizontal, borderRadius: D.buttonRadius, backgroundColor: '#475569' }}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

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
    </>
  );
}
