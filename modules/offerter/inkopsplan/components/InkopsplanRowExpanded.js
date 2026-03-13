import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

let createPortal = null;
if (typeof document !== 'undefined') {
  try {
    createPortal = require('react-dom').createPortal;
  } catch (_) {}
}

import { MODAL_DESIGN_2026 } from '../../../../constants/modalDesign2026';
import { COLUMN_PADDING_LEFT, COLUMN_PADDING_RIGHT } from '../../../../constants/tableLayout';

import { generatePersonalizedInquiry } from '../../../../components/firebase';
import {
    fetchSupplierContactsForInkopsplan,
    INKOPSPLAN_SUPPLIER_REQUEST_STATUS,
    markInkopsplanRowSupplierQuoteReceived,
    markInkopsplanRowSupplierRequestSent,
    removeInkopsplanRowSupplier,
    resetInkopsplanRowSupplierRequest,
    setInkopsplanRowSupplierContact,
    setInkopsplanRowSupplierPersonalizedInquiry,
} from '../inkopsplanService';
import AddSupplierPicker from './AddSupplierPicker';
import InkopsplanDocumentsModal from './InkopsplanDocumentsModal';

const TABLE = MODAL_DESIGN_2026;
const MIN_COLUMN_WIDTH = 60;
const MAX_COLUMN_WIDTH = 600;
const RESIZE_HANDLE_WIDTH = 6;
const RESIZE_HANDLE_HIT_WIDTH = 14;
const CHARS_TO_WIDTH = 8;
const CELL_PADDING = COLUMN_PADDING_LEFT + COLUMN_PADDING_RIGHT + 12;
const DEFAULT_LEV_WIDTHS = {
  foretag: 140, kontaktperson: 110, roll: 90, telefon: 200,
  mejladress: 140, status: 200, offert: 90,
};
const LEV_HEADERS = {
  foretag: 'Företag', kontaktperson: 'Kontaktperson', roll: 'Roll', telefon: 'Telefon',
  mejladress: 'Mejladress', status: 'Status', offert: 'Offert',
};

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

function normalizeSupplierKeyLocal(party) {
  const existing = safeText(party?.key);
  if (existing) return existing;
  const t = safeText(party?.registryType);
  const id = safeText(party?.registryId || party?.id);
  if (t && id) return `${t}:${id}`;
  return safeText(party?.id) || safeText(party?.companyName) || safeText(party?.name) || '';
}

function formatYYYYMMDD(fsTs) {
  try {
    const dt = typeof fsTs?.toDate === 'function' ? fsTs.toDate() : null;
    if (!dt) return '';
    const yyyy = dt.getFullYear();
    const mm = String(dt.getMonth() + 1).padStart(2, '0');
    const dd = String(dt.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  } catch (_e) {
    return '';
  }
}

function isWeb() {
  return Platform.OS === 'web';
}

function getLevDisplayText(supplier, columnKey) {
  if (!supplier) return '—';
  if (columnKey === 'foretag') return safeText(supplier?.companyName || supplier?.name || supplier?.id || supplier) || '—';
  if (columnKey === 'kontaktperson') return safeText(supplier?.contactName) || '—';
  if (columnKey === 'roll') return safeText(supplier?.role) || '—';
  if (columnKey === 'telefon') {
    const mobil = safeText(supplier?.mobile);
    const arbete = safeText(supplier?.phone);
    if (mobil && arbete) return `Mobil: ${mobil} / Arbete: ${arbete}`;
    if (mobil) return `Mobil: ${mobil}`;
    if (arbete) return `Arbete: ${arbete}`;
    return '—';
  }
  if (columnKey === 'mejladress') return safeText(supplier?.email) || '—';
  if (columnKey === 'offert') return '—';
  if (columnKey === 'status') {
    const s = safeText(supplier?.requestStatus);
    if (s === 'svar_mottaget') return 'Svar mottaget';
    if (s === 'skickad') return 'Skickad';
    if (supplier?.quoteReceivedAt) return 'Svar mottaget';
    if (supplier?.requestSentAt) return 'Skickad';
    return 'Ej skickad';
  }
  return '—';
}

function contentWidthForColumn(headerLabel, cellTexts) {
  let maxLen = String(headerLabel ?? '').length;
  (cellTexts || []).forEach((t) => {
    const len = String(t ?? '').length;
    if (len > maxLen) maxLen = len;
  });
  return Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, maxLen * CHARS_TO_WIDTH + CELL_PADDING));
}

export default function InkopsplanRowExpanded({ row, companyId, projectId, selectedSupplierKey, onSelectSupplier, onSupplierContextMenu, onRowsChanged, openAddSupplierForRowId, onAddSupplierClosed }) {
  const hasRow = row != null;
  const suppliers = Array.isArray(row?.suppliers) ? row.suppliers : [];
  const rowId = safeText(row?.id);
  const shouldOpenAddSupplier = openAddSupplierForRowId != null && String(openAddSupplierForRowId) === rowId;

  const [addSupplierPickerOpen, setAddSupplierPickerOpen] = useState(false);
  const [documentsModalOpen, setDocumentsModalOpen] = useState(false);
  const [supplierBusyKey, setSupplierBusyKey] = useState('');
  const [generatingAiKey, setGeneratingAiKey] = useState('');
  const [contactDropdownKey, setContactDropdownKey] = useState(null);
  const [contactDropdownRect, setContactDropdownRect] = useState(null);
  const [contactsList, setContactsList] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const contactDropdownRef = useRef(null);
  const [columnWidths, setColumnWidths] = useState(DEFAULT_LEV_WIDTHS);
  const [sort, setSort] = useState({ sortKey: 'foretag', sortDir: 'asc' });
  const sortKey = sort.sortKey;
  const sortDir = sort.sortDir;
  const resizeRef = useRef({ column: null, startX: 0, startWidth: 0 });

  const w = columnWidths;
  const col = useCallback((key) => ({ width: w[key], minWidth: w[key], flexShrink: 0 }), [w]);

  const startResize = useCallback((column, e) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    const clientX = e.clientX ?? e.nativeEvent?.pageX ?? 0;
    resizeRef.current = { column, startX: clientX, startWidth: columnWidths[column], didMove: false };
  }, [columnWidths]);

  const sortedSuppliersRef = useRef([]);

  useEffect(() => {
    if (shouldOpenAddSupplier) setAddSupplierPickerOpen(true);
  }, [shouldOpenAddSupplier]);

  const widenColumn = useCallback((column) => {
    if (Platform.OS !== 'web') return;
    const headerLabel = LEV_HEADERS[column] || '';
    const list = sortedSuppliersRef.current || [];
    const cellTexts = list.map((s) => getLevDisplayText(s, column));
    if (column === 'foretag') cellTexts.push('+ Lägg till leverantör');
    const allTexts = [headerLabel, ...cellTexts];
    const newWidth = contentWidthForColumn(headerLabel, allTexts);
    setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
  }, []);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const onMove = (e) => {
      const { column, startX, startWidth } = resizeRef.current;
      if (column == null) return;
      resizeRef.current.didMove = true;
      const clientX = e.clientX ?? 0;
      const delta = clientX - startX;
      const newWidth = Math.max(MIN_COLUMN_WIDTH, startWidth + delta);
      setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      resizeRef.current = { ...resizeRef.current, startX: clientX, startWidth: newWidth };
    };
    const onUp = () => {
      const { column, didMove } = resizeRef.current;
      if (column != null && !didMove) {
        const headerLabel = LEV_HEADERS[column] || '';
        const list = sortedSuppliersRef.current || [];
        const cellTexts = list.map((s) => getLevDisplayText(s, column));
        if (column === 'foretag') cellTexts.push('+ Lägg till leverantör');
        const allTexts = [headerLabel, ...cellTexts];
        const newWidth = contentWidthForColumn(headerLabel, allTexts);
        setColumnWidths((prev) => ({ ...prev, [column]: newWidth }));
      }
      resizeRef.current = { column: null, startX: 0, startWidth: 0, didMove: false };
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, []);

  const openContactDropdown = useCallback(async (supplierKey, supplier, e) => {
    const sid = safeText(supplier?.registryId);
    if (!companyId || !sid) return;
    setContactDropdownKey(supplierKey);
    setContactSearch('');
    setLoadingContacts(true);
    setContactsList([]);
    if (isWeb() && e?.nativeEvent?.target?.getBoundingClientRect) {
      const rect = e.nativeEvent.target.getBoundingClientRect();
      setContactDropdownRect({
        top: rect.bottom + 4,
        left: rect.left,
        width: Math.max(rect.width, 220),
      });
    } else {
      setContactDropdownRect(null);
    }
    try {
      const list = await fetchSupplierContactsForInkopsplan({
        companyId,
        supplierRegistryId: sid,
        supplierCompanyId: safeText(supplier?.companyId) || null,
      });
      setContactsList(Array.isArray(list) ? list : []);
    } catch (_e) {
      setContactsList([]);
    } finally {
      setLoadingContacts(false);
    }
  }, [companyId]);

  const closeContactDropdown = useCallback(() => {
    setContactDropdownKey(null);
    setContactDropdownRect(null);
    setContactSearch('');
    setContactsList([]);
  }, []);

  useEffect(() => {
    if (!isWeb() || !contactDropdownKey) return;
    const onMouseDown = (e) => {
      const el = contactDropdownRef.current;
      if (el && e.target && !el.contains(e.target)) closeContactDropdown();
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [contactDropdownKey, closeContactDropdown]);

  const handlePickContact = useCallback(async (supplierKey, contact) => {
    const rowId = safeText(row?.id);
    if (!companyId || !projectId || !rowId) return;
    try {
      await setInkopsplanRowSupplierContact({ companyId, projectId, rowId, supplierKey, contact });
      closeContactDropdown();
      try { onRowsChanged?.(); } catch (_e) {}
    } catch (e) {
      Alert.alert('Kunde inte uppdatera kontakt', e?.message || 'Okänt fel');
    }
  }, [companyId, projectId, row?.id, closeContactDropdown, onRowsChanged]);

  const handleRemoveSupplier = async (supplierKey) => {
    const rowId = safeText(row?.id);
    if (!companyId || !projectId || !rowId) return;
    const key = safeText(supplierKey);
    if (!key) return;
    try {
      await removeInkopsplanRowSupplier({ companyId, projectId, rowId, supplierKey: key });
      onSelectSupplier?.(null);
    } catch (e) {
      Alert.alert('Kunde inte ta bort', e?.message || 'Okänt fel');
    }
  };

  const setBusy = (key) => setSupplierBusyKey(safeText(key));

  const handleMarkSent = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await markInkopsplanRowSupplierRequestSent({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte markera skickad', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  const handleMarkQuoteReceived = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await markInkopsplanRowSupplierQuoteReceived({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte markera svar mottaget', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  const handleResetRequest = async (supplierKey) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key) return;
    setBusy(key);
    try {
      await resetInkopsplanRowSupplierRequest({ companyId, projectId, rowId, supplierKey: key });
    } catch (e) {
      Alert.alert('Kunde inte ångra', e?.message || 'Okänt fel');
    } finally {
      setBusy('');
    }
  };

  const inquiryDraftText = safeText(row?.inquiryDraftText) || '';

  const handleGenerateAiInquiry = async (supplierKey, supplier) => {
    const rowId = safeText(row?.id);
    const key = safeText(supplierKey);
    if (!companyId || !projectId || !rowId || !key || !inquiryDraftText) {
      Alert.alert('Saknas', 'Skapa först en generell förfrågan på inköpsraden (knappen Generell förfrågan).');
      return;
    }
    setGeneratingAiKey(key);
    try {
      const { text } = await generatePersonalizedInquiry(companyId, projectId, {
        inquiryDraftText,
        contactName: safeText(supplier?.contactName),
        supplierCompanyName: safeText(supplier?.companyName || supplier?.name),
      });
      if (text) {
        await setInkopsplanRowSupplierPersonalizedInquiry({ companyId, projectId, rowId, supplierKey: key, personalizedInquiryText: text });
      }
    } catch (e) {
      Alert.alert('Kunde inte anpassa förfrågan', e?.message || 'Okänt fel');
    } finally {
      setGeneratingAiKey('');
    }
  };

  const handleSendInquiry = (supplier) => {
    const email = safeText(supplier?.email);
    if (!email) {
      Alert.alert('Saknas', 'Leverantören har ingen mejladress.');
      return;
    }
    const body = safeText(supplier?.personalizedInquiryText) || inquiryDraftText;
    const subject = `Förfrågan ${safeText(row?.name) || 'inköp'}`;
    const mailto = `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    Linking.openURL(mailto).catch(() => Alert.alert('Kunde inte öppna e-post', 'Öppna din e-postklient manuellt.'));
  };

  const getSupplierSortValue = useCallback((s, key) => {
    if (key === 'foretag') return safeText(s?.companyName || s?.name || s?.id || s);
    if (key === 'kontaktperson') return safeText(s?.contactName);
    if (key === 'roll') return safeText(s?.role);
    if (key === 'telefon') return `${safeText(s?.mobile)} ${safeText(s?.phone)}`;
    if (key === 'mejladress') return safeText(s?.email);
    if (key === 'status') {
      const st = safeText(s?.requestStatus);
      if (st === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET || s?.quoteReceivedAt) return 'svar_mottaget';
      if (st === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD || s?.requestSentAt) return 'skickad';
      return 'ej_skickad';
    }
    return '';
  }, []);

  const sortedSuppliers = useMemo(() => {
    const dirMul = sortDir === 'desc' ? -1 : 1;
    return suppliers.slice().sort((a, b) => {
      const va = getSupplierSortValue(a, sortKey);
      const vb = getSupplierSortValue(b, sortKey);
      const c = String(va ?? '').localeCompare(String(vb ?? ''), 'sv');
      return c * dirMul;
    });
  }, [suppliers, sortKey, sortDir, getSupplierSortValue]);

  useEffect(() => {
    sortedSuppliersRef.current = sortedSuppliers;
  }, [sortedSuppliers]);

  const totalTableWidth = useMemo(() => {
    const keys = ['foretag', 'kontaktperson', 'roll', 'telefon', 'mejladress', 'status', 'offert'];
    const sum = keys.reduce((acc, k) => acc + (columnWidths[k] || 0), 0);
    return sum + 6 * RESIZE_HANDLE_HIT_WIDTH;
  }, [columnWidths]);

  const handleSort = useCallback((key) => {
    setSort((prev) => ({
      sortKey: key,
      sortDir: prev.sortKey === key ? (prev.sortDir === 'asc' ? 'desc' : 'asc') : 'asc',
    }));
  }, []);

  const isSorted = (key) => sortKey === key;

  return (
    <View style={[styles.wrap, isWeb() && { minWidth: totalTableWidth }]}>
      <View style={styles.levToolbar}>
        <Pressable
          onPress={() => setDocumentsModalOpen(true)}
          style={({ hovered, pressed }) => [styles.levToolbarBtn, (hovered || pressed) && styles.levToolbarBtnHover]}
        >
          <Ionicons name="document-attach-outline" size={18} color="#475569" />
          <Text style={styles.levToolbarBtnText}>Dokument</Text>
        </Pressable>
      </View>
      <View style={styles.tableWrap}>
        <View style={[styles.tableHeader, isWeb() && styles.tableHeaderGapWeb]}>
          <View style={[styles.headerCell, col('foretag')]}>
            <Pressable onPress={() => handleSort('foretag')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('foretag') && styles.headerTextSorted]} numberOfLines={1}>Företag</Text>
              {isSorted('foretag') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('foretag', e)} onDoubleClick={() => widenColumn('foretag')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('kontaktperson')]}>
            <Pressable onPress={() => handleSort('kontaktperson')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('kontaktperson') && styles.headerTextSorted]} numberOfLines={1}>Kontaktperson</Text>
              {isSorted('kontaktperson') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('kontaktperson', e)} onDoubleClick={() => widenColumn('kontaktperson')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('roll')]}>
            <Pressable onPress={() => handleSort('roll')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('roll') && styles.headerTextSorted]} numberOfLines={1}>Roll</Text>
              {isSorted('roll') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('roll', e)} onDoubleClick={() => widenColumn('roll')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('telefon')]}>
            <Pressable onPress={() => handleSort('telefon')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('telefon') && styles.headerTextSorted]} numberOfLines={1}>Telefon</Text>
              {isSorted('telefon') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('telefon', e)} onDoubleClick={() => widenColumn('telefon')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('mejladress')]}>
            <Pressable onPress={() => handleSort('mejladress')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('mejladress') && styles.headerTextSorted]} numberOfLines={1}>Mejladress</Text>
              {isSorted('mejladress') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('mejladress', e)} onDoubleClick={() => widenColumn('mejladress')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('status')]}>
            <Pressable onPress={() => handleSort('status')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('status') && styles.headerTextSorted]} numberOfLines={1}>Status</Text>
              {isSorted('status') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          {isWeb() && <View style={styles.resizeHandle} onMouseDown={(e) => startResize('status', e)} onDoubleClick={() => widenColumn('status')}><View style={styles.resizeHandleLine} /></View>}
          <View style={[styles.headerCell, col('offert')]}>
            <Pressable onPress={() => handleSort('offert')} style={({ hovered }) => [styles.columnContent, styles.headerSortable, hovered && styles.headerSortableHover]}>
              <Text style={[styles.headerText, isSorted('offert') && styles.headerTextSorted]} numberOfLines={1}>Offert</Text>
              {isSorted('offert') ? <Text style={styles.sortArrow}>{sortDir === 'asc' ? ' ▲' : ' ▼'}</Text> : null}
            </Pressable>
          </View>
          <View style={styles.cellSpacer} />
        </View>

        {sortedSuppliers.length === 0 ? (
          <View style={[styles.tableRow, isWeb() && styles.tableRowGapWeb]}>
            <View style={[styles.cell, col('foretag'), styles.emptyLevCell]}>
              <Text style={styles.muted} numberOfLines={1}>{hasRow ? 'Inga leverantörer kopplade ännu.' : 'Välj en rad i inköpsstrukturen ovan.'}</Text>
              {hasRow && companyId && projectId ? (
                <Pressable
                  onPress={() => setAddSupplierPickerOpen(true)}
                  style={({ hovered, pressed }) => [styles.emptyLevAddBtn, (hovered || pressed) && styles.emptyLevAddBtnHover]}
                  {...(isWeb() ? { cursor: 'pointer' } : {})}
                >
                  <Ionicons name="add-circle-outline" size={18} color="#2563EB" />
                  <Text style={styles.emptyLevAddBtnText}>Lägg till leverantör</Text>
                </Pressable>
              ) : null}
            </View>
            <View style={[styles.cell, col('kontaktperson')]} />
            <View style={[styles.cell, col('roll')]} />
            <View style={[styles.cell, col('telefon')]} />
            <View style={[styles.cell, col('mejladress')]} />
            <View style={[styles.cell, col('status')]} />
            <View style={[styles.cell, col('offert')]} />
            <View style={styles.cellSpacer} />
          </View>
        ) : (
          <>
          {sortedSuppliers.map((s, idx) => {
            const label = safeText(s?.companyName || s?.name || s?.id || s);
            const supplierKey = normalizeSupplierKeyLocal(s);
            const key = supplierKey || `${label}-${idx}`;

            const explicitStatus = safeText(s?.requestStatus);
            let status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;
            if (explicitStatus === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET;
            else if (explicitStatus === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;
            else if (s?.quoteReceivedAt) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET;
            else if (s?.requestSentAt) status = INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;

            const statusText = status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SVAR_MOTTAGET
              ? 'Svar mottaget'
              : status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD
                ? 'Skickad'
                : 'Ej skickad';

            const busy = supplierKey && supplierBusyKey === supplierKey;
            const canMarkSent = !busy && supplierKey && status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;
            const canMarkQuoteReceived = !busy && supplierKey && status === INKOPSPLAN_SUPPLIER_REQUEST_STATUS.SKICKAD;
            const canReset = !busy && supplierKey && status !== INKOPSPLAN_SUPPLIER_REQUEST_STATUS.EJ_SKICKAD;

            const isSelected = selectedSupplierKey != null && selectedSupplierKey === supplierKey;

            return (
              <Pressable
                key={key}
                onPress={() => onSelectSupplier?.(supplierKey)}
                onContextMenu={isWeb() ? (e) => {
                  try { e.preventDefault(); e.stopPropagation(); } catch (_) {}
                  onSupplierContextMenu?.(supplierKey, e);
                } : undefined}
                style={({ hovered }) => [
                  styles.tableRow,
                  isWeb() && styles.tableRowGapWeb,
                  idx % 2 === 1 && styles.tableRowAlt,
                  hovered && styles.tableRowHover,
                  isSelected && styles.tableRowSelected,
                ]}
              >
                <View style={[styles.cell, col('foretag')]}><Text style={styles.cellText} numberOfLines={1}>{label || '—'}</Text></View>
                <View style={[styles.cell, col('kontaktperson'), styles.cellWithDropdown]}>
                  {safeText(s?.registryId) ? (
                    <Pressable
                      onPress={(e) => { e?.stopPropagation?.(); openContactDropdown(supplierKey, s, e); }}
                      style={({ hovered }) => [styles.contactCellTouch, hovered && styles.contactCellTouchHover]}
                    >
                      <Text style={styles.cellText} numberOfLines={1}>{safeText(s?.contactName) || 'Välj kontakt…'}</Text>
                      <Ionicons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                    </Pressable>
                  ) : (
                    <Text style={styles.cellText} numberOfLines={1}>{safeText(s?.contactName) || '—'}</Text>
                  )}
                </View>
                <View style={[styles.cell, col('roll')]}><Text style={[styles.cellText, styles.cellMuted]} numberOfLines={1}>{safeText(s?.role) || '—'}</Text></View>
                <View style={[styles.cell, col('telefon')]}>
                  <Text style={styles.cellText} numberOfLines={1}>
                    {(() => {
                      const mobil = safeText(s?.mobile);
                      const arbete = safeText(s?.phone);
                      if (mobil && arbete) {
                        return (
                          <>
                            <Text style={[styles.cellText, styles.cellTextLabel]}>Mobil: </Text>
                            <Text style={styles.cellTextNumber}>{mobil}</Text>
                            <Text style={[styles.cellText, styles.cellTextLabel]}> / Arbete: </Text>
                            <Text style={styles.cellTextNumber}>{arbete}</Text>
                          </>
                        );
                      }
                      if (mobil) {
                        return (
                          <>
                            <Text style={[styles.cellText, styles.cellTextLabel]}>Mobil: </Text>
                            <Text style={styles.cellTextNumber}>{mobil}</Text>
                          </>
                        );
                      }
                      if (arbete) {
                        return (
                          <>
                            <Text style={[styles.cellText, styles.cellTextLabel]}>Arbete: </Text>
                            <Text style={styles.cellTextNumber}>{arbete}</Text>
                          </>
                        );
                      }
                      return '—';
                    })()}
                  </Text>
                </View>
                <View style={[styles.cell, col('mejladress')]}><Text style={styles.cellText} numberOfLines={1}>{safeText(s?.email) || '—'}</Text></View>
                <View style={[styles.cell, col('status')]}>
                  <Text style={styles.cellText} numberOfLines={1}>{statusText}</Text>
                  <View style={styles.cellActions}>
                    {canMarkSent ? (
                      <Pressable onPress={(e) => { e?.stopPropagation?.(); handleMarkSent(supplierKey); }} disabled={!canMarkSent} style={({ hovered, pressed }) => [styles.actionLinkWrap, (hovered || pressed) && styles.actionLinkHover]}>
                        <Text style={styles.actionLink}>Skickad</Text>
                      </Pressable>
                    ) : null}
                    {canMarkQuoteReceived ? (
                      <Pressable onPress={(e) => { e?.stopPropagation?.(); handleMarkQuoteReceived(supplierKey); }} disabled={!canMarkQuoteReceived} style={({ hovered, pressed }) => [styles.actionLinkWrap, (hovered || pressed) && styles.actionLinkHover]}>
                        <Text style={styles.actionLink}>Svar</Text>
                      </Pressable>
                    ) : null}
                    {canReset ? (
                      <Pressable onPress={(e) => { e?.stopPropagation?.(); handleResetRequest(supplierKey); }} disabled={!canReset} style={({ hovered, pressed }) => [styles.actionLinkWrap, (hovered || pressed) && styles.actionLinkHover]}>
                        <Text style={styles.actionLinkMuted}>Ångra</Text>
                      </Pressable>
                    ) : null}
                  </View>
                </View>
                <View style={[styles.cell, col('offert'), styles.offertCellWrap]}>
                  <Pressable
                    onPress={(e) => { e?.stopPropagation?.(); handleGenerateAiInquiry(supplierKey, s); }}
                    disabled={!!generatingAiKey || !inquiryDraftText}
                    style={({ hovered, pressed }) => [
                      styles.aiForfraganBtn,
                      (hovered || pressed) && styles.aiForfraganBtnHover,
                      (!inquiryDraftText || generatingAiKey) && { opacity: 0.6 },
                    ]}
                  >
                    {generatingAiKey === supplierKey ? (
                      <ActivityIndicator size="small" color="#475569" />
                    ) : (
                      <Text style={styles.aiForfraganBtnText}>Anpassa förfrågan</Text>
                    )}
                  </Pressable>
                  <Pressable
                    onPress={(e) => { e?.stopPropagation?.(); handleSendInquiry(s); }}
                    style={({ hovered, pressed }) => [styles.sendForfraganBtn, (hovered || pressed) && styles.sendForfraganBtnHover]}
                  >
                    <Text style={styles.sendForfraganBtnText}>Skicka förfrågan</Text>
                  </Pressable>
                </View>
              </Pressable>
            );
          })}
          </>
        )}
      </View>

      {addSupplierPickerOpen ? (
        <AddSupplierPicker
          visible
          onClose={() => {
            setAddSupplierPickerOpen(false);
            onAddSupplierClosed?.();
          }}
          companyId={companyId}
          projectId={projectId}
          row={row}
          onAdded={() => { try { onRowsChanged?.(); } catch (_e) {} }}
        />
      ) : null}

      {contactDropdownKey ? (
        isWeb() && contactDropdownRect && createPortal ? (
          createPortal(
            <View
              ref={contactDropdownRef}
              style={[
                styles.contactDropdownFloating,
                {
                  position: 'fixed',
                  top: contactDropdownRect.top,
                  left: contactDropdownRect.left,
                  width: contactDropdownRect.width,
                  zIndex: 10000,
                },
              ]}
            >
              <TextInput
                value={contactSearch}
                onChangeText={setContactSearch}
                placeholder="Sök kontakt…"
                style={styles.contactDropdownSearch}
              />
              <ScrollView style={styles.contactDropdownScroll} keyboardShouldPersistTaps="handled">
                <Pressable
                  onPress={() => handlePickContact(contactDropdownKey, null)}
                  style={({ hovered, pressed }) => [styles.contactDropdownRow, (hovered || pressed) && styles.contactDropdownRowHover]}
                >
                  <Text style={styles.contactDropdownRowName}>— Ingen kontakt</Text>
                </Pressable>
                {loadingContacts ? (
                  <View style={styles.contactDropdownLoading}><ActivityIndicator size="small" color="#64748B" /></View>
                ) : (() => {
                  const q = String(contactSearch || '').trim().toLowerCase();
                  const filtered = q
                    ? contactsList.filter((c) => safeText(c?.name).toLowerCase().includes(q) || safeText(c?.email).toLowerCase().includes(q))
                    : contactsList;
                  if (filtered.length === 0) {
                    return <Text style={styles.contactDropdownEmpty}>Inga kontakter{contactSearch ? ' matchar sökningen' : ''}.</Text>;
                  }
                  return filtered.map((c) => (
                    <Pressable
                      key={safeText(c?.id) || safeText(c?.name) || Math.random()}
                      onPress={() => handlePickContact(contactDropdownKey, c)}
                      style={({ hovered, pressed }) => [styles.contactDropdownRow, (hovered || pressed) && styles.contactDropdownRowHover]}
                    >
                      <Text style={styles.contactDropdownRowName} numberOfLines={1}>{safeText(c?.name) || '—'}</Text>
                    </Pressable>
                  ));
                })()}
              </ScrollView>
            </View>,
            document.body,
          )
        ) : !contactDropdownRect ? (
          <View style={styles.contactDropdownWrap}>
            <View style={styles.contactDropdownHeader}>
              <Text style={styles.contactDropdownTitle}>Välj kontaktperson</Text>
              <Pressable onPress={closeContactDropdown} style={({ hovered, pressed }) => [styles.contactDropdownClose, (hovered || pressed) && { opacity: 0.8 }]}>
                <Ionicons name="close" size={20} color="#64748B" />
              </Pressable>
            </View>
            <TextInput
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="Sök kontakt…"
              style={styles.contactDropdownSearch}
            />
            <ScrollView style={styles.contactDropdownScroll} keyboardShouldPersistTaps="handled">
              <Pressable
                onPress={() => handlePickContact(contactDropdownKey, null)}
                style={({ hovered, pressed }) => [styles.contactDropdownRow, (hovered || pressed) && styles.contactDropdownRowHover]}
              >
                <Text style={styles.contactDropdownRowName}>— Ingen kontakt</Text>
              </Pressable>
              {loadingContacts ? (
                <View style={styles.contactDropdownLoading}><ActivityIndicator size="small" color="#64748B" /></View>
              ) : (() => {
                const q = String(contactSearch || '').trim().toLowerCase();
                const filtered = q
                  ? contactsList.filter((c) => safeText(c?.name).toLowerCase().includes(q) || safeText(c?.email).toLowerCase().includes(q))
                  : contactsList;
                if (filtered.length === 0) {
                  return <Text style={styles.contactDropdownEmpty}>Inga kontakter{contactSearch ? ' matchar sökningen' : ''}.</Text>;
                }
                return filtered.map((c) => (
                  <Pressable
                    key={safeText(c?.id) || safeText(c?.name) || Math.random()}
                    onPress={() => handlePickContact(contactDropdownKey, c)}
                    style={({ hovered, pressed }) => [styles.contactDropdownRow, (hovered || pressed) && styles.contactDropdownRowHover]}
                  >
                    <Text style={styles.contactDropdownRowName} numberOfLines={1}>{safeText(c?.name) || '—'}</Text>
                  </Pressable>
                ));
              })()}
            </ScrollView>
          </View>
        ) : null
      ) : null}

      <InkopsplanDocumentsModal
        visible={documentsModalOpen}
        onClose={() => setDocumentsModalOpen(false)}
        row={row}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: 0,
    paddingBottom: 8,
    backgroundColor: 'transparent',
  },
  levToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  levToolbarBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  levToolbarBtnHover: {
    backgroundColor: '#E2E8F0',
  },
  levToolbarBtnDanger: {
    backgroundColor: '#FEF2F2',
  },
  levToolbarBtnDangerHover: {
    backgroundColor: '#FECACA',
  },
  levToolbarBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  levToolbarBtnTextDanger: {
    color: '#DC2626',
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: TABLE.tableBorderColor,
    borderRadius: TABLE.tableRadius,
    overflow: 'hidden',
    backgroundColor: TABLE.tableRowBackgroundColor,
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: 12,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    backgroundColor: TABLE.tableHeaderBackgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.tableHeaderBorderColor,
  },
  tableHeaderGapWeb: { gap: 0 },
  headerCell: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 0,
    minWidth: 0,
  },
  columnContent: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    flex: 1,
    minWidth: 0,
    alignSelf: 'stretch',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
    width: '100%',
  },
  headerSortable: {
    flexDirection: 'row',
    alignItems: 'center',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  headerSortableHover: {
    backgroundColor: 'rgba(0,0,0,0.04)',
  },
  headerTextSorted: {
    fontWeight: '700',
  },
  sortArrow: {
    fontSize: 10,
    color: TABLE.tableHeaderColor,
    marginLeft: 2,
  },
  headerActionsWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  headerText: {
    fontSize: TABLE.tableHeaderFontSize,
    fontWeight: TABLE.tableHeaderFontWeight,
    color: TABLE.tableHeaderColor,
    textAlign: 'left',
  },
  tableEmpty: {
    minHeight: 140,
    paddingVertical: 24,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    justifyContent: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: TABLE.tableRowHeight,
    paddingVertical: TABLE.tableCellPaddingVertical,
    paddingHorizontal: TABLE.tableCellPaddingHorizontal,
    borderBottomWidth: 1,
    borderBottomColor: TABLE.tableRowBorderColor,
    backgroundColor: TABLE.tableRowBackgroundColor,
  },
  tableRowGapWeb: { gap: RESIZE_HANDLE_HIT_WIDTH },
  tableRowAlt: {
    backgroundColor: TABLE.tableRowAltBackgroundColor,
  },
  tableRowHover: {
    backgroundColor: TABLE.tableRowHoverBackgroundColor,
  },
  tableRowSelected: {
    backgroundColor: '#EFF6FF',
    borderBottomColor: '#BFDBFE',
  },
  addSupplierRow: {
    backgroundColor: TABLE.tableRowAltBackgroundColor,
  },
  cell: {
    paddingLeft: COLUMN_PADDING_LEFT,
    paddingRight: COLUMN_PADDING_RIGHT,
    justifyContent: 'center',
    alignItems: 'flex-start',
    minWidth: 0,
  },
  cellText: {
    fontSize: TABLE.tableCellFontSize,
    fontWeight: '500',
    color: TABLE.tableCellColor,
    minWidth: 0,
    textAlign: 'left',
  },
  cellTextLabel: {
    fontWeight: '700',
  },
  cellTextNumber: {
    fontSize: TABLE.tableCellFontSize,
    fontWeight: '400',
    color: TABLE.tableCellColor,
  },
  cellMuted: {
    color: TABLE.tableCellMutedColor,
  },
  cellWithDropdown: {
    position: 'relative',
  },
  contactCellTouch: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'stretch',
    minWidth: 0,
    paddingVertical: 4,
    paddingHorizontal: 4,
    borderRadius: 6,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  contactCellTouchHover: {
    backgroundColor: '#EFF6FF',
  },
  cellActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  contactDropdownFloating: {
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    overflow: 'hidden',
    maxHeight: 280,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
    elevation: 8,
  },
  contactDropdownWrap: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    backgroundColor: '#fff',
    overflow: 'hidden',
    maxHeight: 320,
  },
  contactDropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  contactDropdownTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  contactDropdownClose: {
    padding: 4,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  contactDropdownSearch: {
    height: 38,
    borderWidth: 0,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 12,
    marginHorizontal: 0,
    fontSize: 13,
    backgroundColor: '#fff',
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  contactDropdownScroll: {
    maxHeight: 220,
  },
  contactDropdownLoading: {
    padding: 24,
    alignItems: 'center',
  },
  contactDropdownEmpty: {
    fontSize: 12,
    color: '#64748B',
    padding: 16,
  },
  contactDropdownRow: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  contactDropdownRowHover: {
    backgroundColor: '#EEF6FF',
  },
  contactDropdownRowName: {
    fontSize: 13,
    fontWeight: '500',
    color: '#0F172A',
  },
  contactDropdownRowMeta: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  resizeHandle: {
    width: RESIZE_HANDLE_HIT_WIDTH,
    minWidth: RESIZE_HANDLE_HIT_WIDTH,
    alignSelf: 'stretch',
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'col-resize' } : {}),
  },
  resizeHandleLine: {
    position: 'absolute',
    left: Math.floor(RESIZE_HANDLE_HIT_WIDTH / 2) - 1,
    top: 4,
    bottom: 4,
    width: 2,
    backgroundColor: '#cbd5e1',
    borderRadius: 1,
  },
  cellSpacer: { flex: 1, minWidth: 0 },

  actionLinkWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  actionLinkHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  actionLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  actionLinkMuted: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
  },

  addLinkWrap: {
    paddingVertical: 4,
    paddingHorizontal: 6,
    borderRadius: 8,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  addLinkHover: {
    backgroundColor: 'rgba(37, 99, 235, 0.08)',
  },
  addLink: {
    fontSize: 12,
    fontWeight: '800',
    color: '#2563EB',
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },
  divider: {
    height: 1,
    backgroundColor: '#E5E7EB',
    marginVertical: 12,
  },
  muted: {
    fontSize: 13,
    color: '#64748B',
  },
  emptyLevCell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
  },
  emptyLevAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 6,
  },
  emptyLevAddBtnHover: {
    backgroundColor: '#EFF6FF',
  },
  emptyLevAddBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#2563EB',
  },
  errorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: 8,
  },

  templateRow: {
    gap: 8,
    marginBottom: 8,
  },
  select: {
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectHover: {
    borderColor: '#D1D5DB',
    backgroundColor: '#F8FAFC',
  },
  selectText: {
    flex: 1,
    minWidth: 0,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectChevron: {
    width: 18,
    textAlign: 'right',
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  selectMenu: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  selectItem: {
    height: 40,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  selectItemHover: {
    backgroundColor: '#F8FAFC',
  },
  selectItemActive: {
    backgroundColor: '#0F172A',
  },
  selectItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
  },
  selectItemTextActive: {
    color: '#FFFFFF',
  },
  hint: {
    fontSize: 12,
    color: '#64748B',
  },

  supplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    paddingVertical: 2,
  },
  supplier: {
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 2,
    flex: 1,
    minWidth: 0,
  },
  removeLinkWrap: {
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 10,
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  removeLinkHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.06)',
  },
  removeLink: {
    fontSize: 12,
    fontWeight: '700',
    color: '#991B1B',
  },
  offertCellWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  aiForfraganBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  aiForfraganBtnHover: {
    backgroundColor: '#CBD5E1',
  },
  aiForfraganBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  sendForfraganBtn: {
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 6,
    backgroundColor: '#2563EB',
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  sendForfraganBtnHover: {
    backgroundColor: '#1D4ED8',
  },
  sendForfraganBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#fff',
  },

  addSupplierBox: {
    marginTop: 8,
    marginBottom: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  addSupplierRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addSupplierInput: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    fontSize: 13,
    color: '#0F172A',
    ...(isWeb() ? { outlineStyle: 'none' } : {}),
  },
  suggestBox: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#fff',
  },
  suggestRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  suggestRowHover: {
    backgroundColor: 'rgba(15, 23, 42, 0.03)',
  },
  suggestText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0f172a',
  },
  suggestMeta: {
    marginTop: 2,
    fontSize: 11,
    color: '#64748b',
  },

  smallBtn: {
    height: 34,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    ...(isWeb() ? { cursor: 'pointer' } : {}),
  },
  smallBtnPrimary: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  smallBtnHover: {
    transform: [{ translateY: -1 }],
  },
  smallBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  smallBtnTextPrimary: {
    color: '#FFFFFF',
  },
});
