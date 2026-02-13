/**
 * Admin modal: Kategorier. Opens from Register → Kategorier.
 * Samma UX som Kontoplan/Byggdelar: fast header, toolbar, scroll endast i listan.
 * Data: companies/{companyId}/categories/{categoryId} – name, note.
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
import {
    buildAndDownloadExcel,
    computeSyncPlan,
    KATEGORIER_EXCEL,
    parseExcelFromBuffer,
    validateHeaders,
} from '../../utils/registerExcel';
import ContextMenu from '../ContextMenu';
import {
    createCategory,
    deleteCategory,
    fetchCategories,
    updateCategory,
    updateCompanySupplier,
} from '../firebase';
import KategoriTable from './KategoriTable';
import ConfirmModal from './Modals/ConfirmModal';
import { ICON_RAIL } from '../../constants/iconRailTheme';
import { useDraggableResizableModal } from '../../hooks/useDraggableResizableModal';

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  box: {
    width: Platform.OS === 'web' ? '90vw' : '90%',
    maxWidth: 720,
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
  titleLine: { flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0, gap: 6, flexWrap: 'nowrap' },
  titleDot: { fontSize: 11, color: ICON_RAIL.iconColor, marginHorizontal: 5, opacity: 0.8 },
  subtitle: { fontSize: 12, color: ICON_RAIL.iconColor, fontWeight: '400', opacity: 0.95, flexShrink: 1, minWidth: 0 },
  closeBtn: {
    padding: 5,
    borderRadius: ICON_RAIL.activeBgRadius,
    backgroundColor: ICON_RAIL.activeBg,
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
  tableScroll: { flex: 1, minHeight: 0, overflow: 'hidden' },
  tableScrollContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 24 },
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
    alignItems: 'center',
    gap: 10,
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
  footerBtnPrimary: {
    borderColor: ICON_RAIL.bg,
    backgroundColor: ICON_RAIL.bg,
    borderRadius: ICON_RAIL.activeBgRadius,
    ...(Platform.OS === 'web' ? { cursor: 'pointer', transition: `background-color ${ICON_RAIL.hoverTransitionMs}ms ease, opacity ${ICON_RAIL.hoverTransitionMs}ms ease` } : {}),
  },
  footerBtnDark: {
    borderColor: ICON_RAIL.bg,
    backgroundColor: ICON_RAIL.bg,
    borderRadius: ICON_RAIL.activeBgRadius,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
});

export default function AdminKategoriModal({ visible, companyId, selectionContext, onClose, onSelectionSaved }) {
  const cid = String(companyId || '').trim();
  const hasCompany = Boolean(cid);
  const isFormMode = selectionContext?.forForm === true;
  const isSelectionMode = isFormMode || Boolean(selectionContext?.entityId);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [inlineName, setInlineName] = useState('');
  const [inlineNote, setInlineNote] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuItem, setRowMenuItem] = useState(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [excelMenuVisible, setExcelMenuVisible] = useState(false);
  const [excelMenuPos, setExcelMenuPos] = useState({ x: 20, y: 64 });
  const excelInputRef = useRef(null);
  const [importPlan, setImportPlan] = useState(null);
  const [importConfirmVisible, setImportConfirmVisible] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [filterOnlySelected, setFilterOnlySelected] = useState(false);
  const [localSelectedCategoryIds, setLocalSelectedCategoryIds] = useState([]);
  const [savingSelection, setSavingSelection] = useState(false);

  const statusOpacity = useRef(new Animated.Value(0)).current;
  const statusTimeoutRef = useRef(null);
  const tableScrollRef = useRef(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await fetchCategories(cid || null);
      setCategories(Array.isArray(list) ? list : []);
    } catch (e) {
      setError(e?.message || 'Kunde inte ladda kategorier.');
    } finally {
      setLoading(false);
    }
  }, [cid]);

  const showContent = hasCompany || categories.length > 0;

  useEffect(() => {
    if (!visible) return;
    load();
  }, [visible, load]);

  useEffect(() => {
    if (visible && selectionContext?.selectedCategoryIds) {
      setLocalSelectedCategoryIds(Array.isArray(selectionContext.selectedCategoryIds) ? [...selectionContext.selectedCategoryIds] : []);
      setFilterOnlySelected(false);
    }
  }, [visible, selectionContext?.entityId, selectionContext?.forForm, selectionContext?.selectedCategoryIds]);

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
        e.stopPropagation();
        onClose?.();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
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

  const showNotice = (msg) => {
    setError('');
    setNotice(msg);
  };

  const formatWriteError = (e) => {
    if (e?.code === 'permission-denied') return 'Saknar behörighet.';
    return e?.message || 'Kunde inte spara.';
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return categories;
    const s = search.toLowerCase().trim();
    return categories.filter((c) => {
      const n = String(c.name ?? '').toLowerCase();
      const no = String(c.note ?? '').toLowerCase();
      return n.includes(s) || no.includes(s);
    });
  }, [categories, search]);

  const sorted = useMemo(() => {
    const list = [...filtered];
    list.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      if (sortColumn === 'name') {
        aVal = String(a.name ?? '').trim();
        bVal = String(b.name ?? '').trim();
      } else if (sortColumn === 'note') {
        aVal = String(a.note ?? '').trim();
        bVal = String(b.note ?? '').trim();
      }
      const cmp = (aVal || '').localeCompare(bVal || '', 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortColumn, sortDirection]);

  const sortedForDisplay = useMemo(() => {
    if (!isSelectionMode || !filterOnlySelected || localSelectedCategoryIds.length === 0) return sorted;
    const set = new Set(localSelectedCategoryIds);
    return sorted.filter((item) => set.has(item.id));
  }, [sorted, isSelectionMode, filterOnlySelected, localSelectedCategoryIds]);

  const handleSaveSelection = async () => {
    if (!cid) return;
    if (isFormMode) {
      onSelectionSaved?.(localSelectedCategoryIds);
      onClose();
      return;
    }
    if (!selectionContext?.entityId) return;
    setSavingSelection(true);
    setError('');
    try {
      await updateCompanySupplier(
        { id: selectionContext.entityId, patch: { categories: localSelectedCategoryIds } },
        cid
      );
      showNotice('Val sparade för leverantör');
      onSelectionSaved?.(selectionContext.entityId);
      onClose();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSavingSelection(false);
    }
  };

  const handleSort = (col) => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const handleInlineSave = async () => {
    if (!cid) return;
    const name = String(inlineName ?? '').trim();
    if (!name) return;
    const nameLower = name.toLowerCase();
    const exists = (categories || []).some(
      (c) => String(c.name ?? '').trim().toLowerCase() === nameLower
    );
    if (exists) {
      setError('Kategorinamnet finns redan. Varje kategori ska vara unikt (oberoende av stor eller liten bokstav).');
      return;
    }
    setInlineSaving(true);
    setError('');
    try {
      await createCategory(
        { name, note: String(inlineNote ?? '').trim() },
        cid
      );
      setInlineName('');
      setInlineNote('');
      await load();
      showNotice('Kategori tillagd');
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setInlineSaving(false);
    }
  };

  const handleSaveEdit = async (categoryId, values) => {
    if (!cid) return;
    const newName = String(values.name ?? '').trim();
    if (newName) {
      const newNameLower = newName.toLowerCase();
      const exists = (categories || []).some(
        (c) => c.id !== categoryId && String(c.name ?? '').trim().toLowerCase() === newNameLower
      );
      if (exists) {
        setError('Kategorinamnet finns redan. Varje kategori ska vara unikt (oberoende av stor eller liten bokstav).');
        return;
      }
    }
    setSaving(true);
    setError('');
    try {
      await updateCategory(cid, categoryId, {
        name: newName || values.name,
        note: values.note ?? '',
      });
      showNotice('Kategori uppdaterad');
      setEditingId(null);
      await load();
    } catch (e) {
      setError(formatWriteError(e));
    } finally {
      setSaving(false);
    }
  };

  const requestDelete = (item) => {
    setDeleteConfirmItem(item);
  };

  const confirmDelete = async () => {
    const item = deleteConfirmItem;
    if (!cid || !item) return;
    setDeleting(true);
    try {
      await deleteCategory(cid, item.id);
      showNotice('Kategori raderad');
      if (editingId === item.id) setEditingId(null);
      setDeleteConfirmItem(null);
      await load();
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
    const rows = (categories || []).map((c) => KATEGORIER_EXCEL.itemToRow(c));
    buildAndDownloadExcel(
      KATEGORIER_EXCEL.sheetName,
      KATEGORIER_EXCEL.headers,
      rows,
      KATEGORIER_EXCEL.filenamePrefix
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
      const { valid, missing } = validateHeaders(headers, KATEGORIER_EXCEL.headers);
      if (!valid) {
        setError(`Ogiltiga kolumnrubriker. Saknas: ${(missing || []).join(', ')}. Använd Excel-mallen.`);
        return;
      }
      const plan = computeSyncPlan(rows, categories, {
        keyField: KATEGORIER_EXCEL.keyField,
        getKeyFromRow: (row) => row[KATEGORIER_EXCEL.keyField] ?? '',
        getKeyFromItem: (item) => KATEGORIER_EXCEL.itemToKey(item),
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
    try {
      for (const row of importPlan.toCreate) {
        const payload = KATEGORIER_EXCEL.rowToPayload(row);
        if (!payload.name) continue;
        try {
          await createCategory(payload, cid);
        } catch (e) {
          failed.push(`Skapa ${payload.name}: ${e?.message || 'fel'}`);
        }
      }
      for (const { id, row } of importPlan.toUpdate) {
        const payload = KATEGORIER_EXCEL.rowToPayload(row);
        try {
          await updateCategory(cid, id, payload);
        } catch (e) {
          failed.push(`Uppdatera ${payload.name}: ${e?.message || 'fel'}`);
        }
      }
      for (const item of importPlan.toDelete) {
        try {
          await deleteCategory(cid, item.id);
        } catch (e) {
          failed.push(`Radera ${item.name}: ${e?.message || 'fel'}`);
        }
      }
      setImportConfirmVisible(false);
      setImportPlan(null);
      await load();
      if (editingId) setEditingId(null);
      if (failed.length > 0) {
        setError(`Import klar. ${failed.length} rad(er) misslyckades: ${failed.slice(0, 3).join('; ')}${failed.length > 3 ? '…' : ''}`);
      } else {
        showNotice('Import genomförd');
      }
    } catch (e) {
      setError(e?.message || 'Import misslyckades.');
    } finally {
      setImportBusy(false);
    }
  };

  const openRowMenu = (e, item) => {
    if (Platform.OS !== 'web') {
      Alert.alert('Kategori', `${item.name ?? ''}`.trim(), [
        { text: 'Avbryt', style: 'cancel' },
        { text: 'Redigera', onPress: () => setEditingId(item.id) },
        { text: 'Ta bort', style: 'destructive', onPress: () => requestDelete(item) },
      ]);
      return;
    }
    const ne = e?.nativeEvent || e;
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuItem(item);
    setRowMenuVisible(true);
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Ta bort', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#b91c1c" /> },
  ];

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(visible, {
    defaultWidth: 720,
    defaultHeight: 600,
    minWidth: 400,
    minHeight: 300,
  });

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[styles.box, boxStyle]} onPress={(e) => e.stopPropagation()}>
          <View
            style={[styles.header, headerProps.style]}
            {...(Platform.OS === 'web' ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={styles.headerLeft}>
              <View style={styles.titleIcon}>
                <Ionicons name="pricetag-outline" size={18} color={ICON_RAIL.iconColorActive} />
              </View>
              <View style={styles.titleLine}>
                <Text style={styles.title} numberOfLines={1}>Kategorier</Text>
                <Text style={styles.titleDot}>•</Text>
                <Text style={styles.subtitle} numberOfLines={1}>Register över kategorier</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityLabel="Stäng"
              {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}
            >
              <Ionicons name="close" size={20} color={ICON_RAIL.iconColorActive} />
            </TouchableOpacity>
          </View>

          <View style={styles.toolbarSection}>
            {!showContent ? (
              <View style={styles.selectCompany}>
                <Text style={styles.selectCompanyText}>
                  {!cid && loading ? 'Laddar för ditt företag…' : 'Välj företag i sidomenyn eller i headern.'}
                </Text>
              </View>
            ) : (
              <>
                {isSelectionMode && (
                  <View style={[styles.toolbar, { marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' }]}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                      <Text style={{ fontSize: 13, color: '#64748b' }}>Visa:</Text>
                      <TouchableOpacity
                        onPress={() => setFilterOnlySelected(false)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          backgroundColor: !filterOnlySelected ? '#eff6ff' : 'transparent',
                        }}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '500', color: !filterOnlySelected ? '#2563eb' : '#64748b' }}>Se alla</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => setFilterOnlySelected(true)}
                        style={{
                          paddingVertical: 6,
                          paddingHorizontal: 10,
                          borderRadius: 8,
                          backgroundColor: filterOnlySelected ? '#eff6ff' : 'transparent',
                        }}
                        {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                      >
                        <Text style={{ fontSize: 13, fontWeight: '500', color: filterOnlySelected ? '#2563eb' : '#64748b' }}>
                          Endast valda för {selectionContext?.entityName || (isFormMode ? 'formulär' : 'leverantör')}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}
                <View style={styles.toolbar}>
                  <View style={styles.searchWrap}>
                    <Ionicons name="search" size={16} color="#64748b" />
                    <TextInput
                      style={styles.searchInput}
                      value={search}
                      onChangeText={setSearch}
                      placeholder="Sök kategori, beskrivning…"
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
                        if (r?.scrollTo) r.scrollTo({ y: 0, animated: true });
                        else if (Platform.OS === 'web' && r) {
                          const node = r.getScrollableNode?.() ?? r;
                          if (node?.scrollTop !== undefined) node.scrollTop = 0;
                        }
                      }}
                      accessibilityLabel="Lägg till kategori"
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="add" size={18} color="#fff" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.iconBtn}
                      onPress={load}
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
            {!showContent ? null : (
              <View>
                {loading ? (
                  <View style={styles.emptyState}>
                    <Text style={styles.emptyTitle}>Laddar kategorier…</Text>
                  </View>
                ) : (
                  <KategoriTable
                    items={sortedForDisplay}
                    sortColumn={sortColumn}
                    sortDirection={sortDirection}
                    onSort={handleSort}
                    editingId={editingId}
                    saving={saving}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={() => setEditingId(null)}
                    onRowMenu={openRowMenu}
                    inlineEnabled={showContent && !isSelectionMode}
                    inlineSaving={inlineSaving}
                    inlineValues={{
                      name: inlineName,
                      note: inlineNote,
                    }}
                    onInlineChange={(field, value) => {
                      if (field === 'name') setInlineName(value);
                      if (field === 'note') setInlineNote(value);
                    }}
                    onInlineSave={handleInlineSave}
                    selectionMode={isSelectionMode}
                    selectedCategoryIds={localSelectedCategoryIds}
                    onSelectionChange={isSelectionMode ? setLocalSelectedCategoryIds : undefined}
                  />
                )}
              </View>
            )}
          </ScrollView>

          <View style={styles.footer}>
            {isSelectionMode ? (
              <TouchableOpacity
                style={[styles.footerBtn, styles.footerBtnPrimary]}
                onPress={handleSaveSelection}
                disabled={savingSelection}
                {...(Platform.OS === 'web' ? { cursor: savingSelection ? 'wait' : 'pointer' } : {})}
              >
                <Text style={{ fontSize: 14, fontWeight: '500', color: '#fff' }}>Spara</Text>
              </TouchableOpacity>
            ) : null}
            <View style={{ alignItems: 'center' }}>
              <TouchableOpacity style={[styles.footerBtn, styles.footerBtnDark]} onPress={onClose} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: '#fff' }}>Stäng</Text>
              </TouchableOpacity>
              <Text style={{ fontSize: 10, opacity: 0.35, marginTop: 4, color: '#64748b', textTransform: 'uppercase', letterSpacing: 0.5 }}>ESC</Text>
            </View>
          </View>

          {resizeHandles}

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
          const item = rowMenuItem;
          if (!item || !it) return;
          if (it.key === 'edit') setEditingId(item.id);
          else if (it.key === 'delete') requestDelete(item);
        }}
      />

      <ConfirmModal
        visible={!!deleteConfirmItem}
        title="Radera kategori"
        message={
          deleteConfirmItem
            ? `Du är på väg att permanent radera kategorin "${String(deleteConfirmItem.name ?? '').trim() || 'kategorin'}".\nDetta går inte att ångra.`
            : ''
        }
        cancelLabel="Avbryt"
        confirmLabel="Radera"
        danger
        busy={deleting}
        onCancel={() => setDeleteConfirmItem(null)}
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
        title="Importera kategorier"
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
