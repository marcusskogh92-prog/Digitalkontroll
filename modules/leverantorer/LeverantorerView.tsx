/**
 * Leverantörer – huvudvy: tabell, sök, sortering, lägg till/redigera/radera, byggdelar och kontaktpersoner.
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import * as XLSX from 'xlsx-js-style';
import { HomeHeader } from '../../components/common/HomeHeader';
import ContextMenu from '../../components/ContextMenu';
import { auth, deleteCompanyContact, fetchCompanyProfile, updateCompanyContact } from '../../components/firebase';
import MainLayout from '../../components/MainLayout';
import { useSharePointStatus } from '../../hooks/useSharePointStatus';
import type { Supplier } from './leverantorerService';
import {
    addContactToSupplier,
    createSupplier,
    deleteSupplier,
    fetchByggdelar,
    fetchContacts,
    fetchSuppliers,
    linkExistingContactToSupplier,
    removeContactFromSupplier,
    updateSupplier,
} from './leverantorerService';
import LeverantorerTable, {
    type SortColumn,
    type SortDirection,
} from './LeverantorerTable';
import LeverantorForm, { type LeverantorFormValues } from './LeverantorForm';

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

export default function LeverantorerView({
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
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [contacts, setContacts] = useState<Awaited<ReturnType<typeof fetchContacts>>>([]);
  const [byggdelar, setByggdelar] = useState<Awaited<ReturnType<typeof fetchByggdelar>>>([]);
  const [search, setSearch] = useState('');
  const [sortColumn, setSortColumn] = useState<SortColumn>('companyName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [saving, setSaving] = useState(false);
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [inlineOrganizationNumber, setInlineOrganizationNumber] = useState('');
  const [inlineAddress, setInlineAddress] = useState('');
  const [inlinePostalCode, setInlinePostalCode] = useState('');
  const [inlineCity, setInlineCity] = useState('');
  const [inlineCategory, setInlineCategory] = useState('');
  const [categoryFilters, setCategoryFilters] = useState<string[]>([]);
  const [inlineSaving, setInlineSaving] = useState(false);
  const [excelMenuOpen, setExcelMenuOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuSupplier, setRowMenuSupplier] = useState<Supplier | null>(null);
  const [contactMenuVisible, setContactMenuVisible] = useState(false);
  const [contactMenuPos, setContactMenuPos] = useState({ x: 20, y: 64 });
  const [contactMenuSupplier, setContactMenuSupplier] = useState<Supplier | null>(null);
  const [contactMenuContact, setContactMenuContact] = useState<{ id: string; name: string; role?: string; email?: string; phone?: string } | null>(null);
  const [contactEditOpen, setContactEditOpen] = useState(false);
  const [contactEditSaving, setContactEditSaving] = useState(false);
  const [contactEdit, setContactEdit] = useState({ id: '', name: '', role: '', phone: '', email: '' });

  const hasCompany = Boolean(companyId?.trim());

  const loadSuppliers = useCallback(async () => {
    if (!companyId?.trim()) {
      setSuppliers([]);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const data = await fetchSuppliers(companyId);
      setSuppliers(data ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte ladda leverantörer.');
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

  const loadByggdelar = useCallback(async () => {
    if (!companyId?.trim()) {
      setByggdelar([]);
      return;
    }
    try {
      const data = await fetchByggdelar(companyId);
      setByggdelar(data ?? []);
    } catch {
      setByggdelar([]);
    }
  }, [companyId]);

  // Web: listen for global home/refresh events from the left sidebar.
  // SuppliersScreen returns this module directly on web, so it won't mount the legacy listeners.
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handleGoHome = () => {
      try {
        const nav: any = navigation as any;
        if (typeof nav?.reset === 'function') {
          nav.reset({ index: 0, routes: [{ name: 'Home' }] });
          return;
        }
        if (typeof nav?.navigate === 'function') {
          nav.navigate('Home');
        }
      } catch (_e) {}
    };

    const handleRefresh = () => {
      try {
        loadSuppliers();
        loadContacts();
        loadByggdelar();
      } catch (_e) {}
    };

    window.addEventListener('dkGoHome', handleGoHome);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handleGoHome); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, loadSuppliers, loadContacts, loadByggdelar]);

  useEffect(() => {
    loadSuppliers();
  }, [loadSuppliers]);
  useEffect(() => {
    loadContacts();
  }, [loadContacts]);
  useEffect(() => {
    loadByggdelar();
  }, [loadByggdelar]);

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
      return 'Saknar behörighet att skapa/uppdatera kontakt för leverantör.';
    }
    return e instanceof Error ? e.message : 'Kunde inte utföra åtgärden.';
  };

  const byggdelLabelById = useCallback(
    (id: string): string => {
      const hit = byggdelar.find((b) => b.id === id);
      if (!hit) return id;
      const parts = [hit.moment, hit.name].filter(Boolean);
      return parts.length ? parts.join(' ') : hit.id;
    },
    [byggdelar]
  );

  const handleImportClick = (): void => {
    if (Platform.OS !== 'web') {
      Alert.alert('Info', 'Excel-import är endast tillgängligt i webbversionen.');
      return;
    }
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!companyId?.trim()) {
      setError('Välj ett företag i listan till vänster först.');
      return;
    }
    const file = event?.target?.files?.[0];
    if (!file) return;
    if (fileInputRef.current) fileInputRef.current.value = '';

    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setError('Endast Excel-filer (.xlsx, .xls) stöds.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError('Excel-filen innehåller inga ark.');
        return;
      }
      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, defval: '', raw: false });
      const headerRow = (jsonData[0] || []).map((h) => String(h || '').trim());

      const findColumnIndex = (possible: string[]) => {
        for (const header of possible) {
          const idx = headerRow.findIndex((h) => h.toLowerCase() === header.toLowerCase());
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const idxName = findColumnIndex(['Företagsnamn']);
      const idxOrg = findColumnIndex(['Organisationsnummer', 'Orgnr', 'Org nr', 'OrgNr']);
      const idxAddress = findColumnIndex(['Adress']);
      const idxPost = findColumnIndex(['Postnummer', 'Postnr']);
      const idxCity = findColumnIndex(['Ort']);
      const idxCategory = findColumnIndex(['Kategori']);
      const idxByggdelar = findColumnIndex(['Kopplade byggdelar', 'Byggdelar']);

      const existingOrg = new Set(
        suppliers.map((s) => String(s.organizationNumber || '').trim()).filter(Boolean)
      );
      const seenOrg = new Set<string>();

      let created = 0;
      let skipped = 0;
      let errors = 0;

      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i] || [];
        const companyName = idxName >= 0 ? String(row[idxName] || '').trim() : String(row[0] || '').trim();
        if (!companyName) continue;
        const orgNr = idxOrg >= 0 ? String(row[idxOrg] || '').trim() : '';
        const address = idxAddress >= 0 ? String(row[idxAddress] || '').trim() : '';
        const post = idxPost >= 0 ? String(row[idxPost] || '').trim() : '';
        const city = idxCity >= 0 ? String(row[idxCity] || '').trim() : '';
        const category = idxCategory >= 0 ? String(row[idxCategory] || '').trim() : '';
        const byggdelRaw = idxByggdelar >= 0 ? String(row[idxByggdelar] || '').trim() : '';
        const byggdelTags = byggdelRaw
          ? byggdelRaw.split(',').map((s) => String(s || '').trim()).filter(Boolean)
          : [];

        if (orgNr) {
          if (existingOrg.has(orgNr) || seenOrg.has(orgNr)) {
            skipped++;
            continue;
          }
          seenOrg.add(orgNr);
        }

        try {
          await createSupplier(companyId, {
            companyName,
            organizationNumber: orgNr,
            address,
            postalCode: post,
            city,
            category,
            byggdelTags,
          });
          created++;
        } catch (_e) {
          errors++;
        }
      }

      await loadSuppliers();
      showNotice(`Import klar: ${created} skapade, ${skipped} hoppade över${errors ? `, ${errors} fel` : ''}.`);
    } catch (e) {
      setError(`Kunde inte läsa Excel-filen: ${String(e?.message || e || 'Okänt fel')}`);
    } finally {
      setLoading(false);
    }
  };

  const clearInlineForm = (): void => {
    setInlineCompanyName('');
    setInlineOrganizationNumber('');
    setInlineAddress('');
    setInlinePostalCode('');
    setInlineCity('');
    setInlineCategory('');
  };

  const handleInlineSave = async (): Promise<void> => {
    if (!companyId?.trim()) return;
    const name = String(inlineCompanyName || '').trim();
    if (!name) return;
    setInlineSaving(true);
    try {
      await createSupplier(companyId, {
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
      if (Platform.OS === 'web') {
        setTimeout(() => {
          try {
            const firstInput = document.querySelector('input[placeholder=\"Företagsnamn (ny)\"]');
            if (firstInput) firstInput.focus();
          } catch (_e) {}
        }, 50);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara.');
    } finally {
      setInlineSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const s = search.toLowerCase().trim();
    return suppliers.filter((sup) => {
      const cn = String(sup.companyName ?? '').toLowerCase();
      const org = String(sup.organizationNumber ?? '').toLowerCase();
      const addr = String(sup.address ?? '').toLowerCase();
      const post = String(sup.postalCode ?? '').toLowerCase();
      const city = String(sup.city ?? '').toLowerCase();
      const cat = String(sup.category ?? '').toLowerCase();
      const cats = Array.isArray(sup.categories) ? sup.categories.join(' ').toLowerCase() : '';
      return (
        cn.includes(s) ||
        org.includes(s) ||
        addr.includes(s) ||
        post.includes(s) ||
        city.includes(s) ||
        cat.includes(s) ||
        cats.includes(s)
      );
    });
  }, [suppliers, search]);

  const filteredWithCategories = useMemo(() => {
    if (!categoryFilters.length) return filtered;
    const wanted = categoryFilters.map((c) => String(c || '').trim()).filter(Boolean);
    if (!wanted.length) return filtered;
    return filtered.filter((sup) => {
      const list = Array.isArray(sup.categories) && sup.categories.length
        ? sup.categories
        : sup.category
          ? [sup.category]
          : [];
      const normalized = list.map((c) => String(c || '').trim());
      return wanted.every((cat) => normalized.includes(cat));
    });
  }, [filtered, categoryFilters]);

  const sorted = useMemo(() => {
    const list = [...filteredWithCategories];
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
        aVal = String(a.category ?? '').trim();
        bVal = String(b.category ?? '').trim();
      }
      const cmp = aVal.localeCompare(bVal, 'sv');
      return sortDirection === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredWithCategories, sortColumn, sortDirection]);

  const exportSuppliersToExcel = useCallback(
    (asTemplate: boolean) => {
      if (!companyId?.trim()) {
        setError('Välj ett företag i listan till vänster först.');
        return;
      }
      const headers = [
        'Företagsnamn',
        'Organisationsnummer',
        'Adress',
        'Postnummer',
        'Ort',
        'Kategori',
        'Kopplade byggdelar',
      ];
      const rows = asTemplate
        ? []
        : filtered.map((s) => {
            const byggdelarText = Array.isArray(s.byggdelTags)
              ? s.byggdelTags.map((t) => byggdelLabelById(String(t || '').trim())).filter(Boolean).join(', ')
              : '';
            return [
              String(s.companyName || '').trim(),
              String(s.organizationNumber || '').trim(),
              String(s.address || '').trim(),
              String(s.postalCode || '').trim(),
              String(s.city || '').trim(),
              String(s.category || '').trim(),
              byggdelarText,
            ];
          });

      const worksheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Leverantorer');

      const now = new Date();
      const yyyy = now.getFullYear();
      const mm = String(now.getMonth() + 1).padStart(2, '0');
      const dd = String(now.getDate()).padStart(2, '0');
      const filename = asTemplate
        ? `Leverantorer_Mall_${yyyy}-${mm}-${dd}.xlsx`
        : `Leverantorer_${yyyy}-${mm}-${dd}.xlsx`;
      XLSX.writeFile(workbook, filename);
    },
    [filtered, byggdelLabelById, companyId]
  );

  const handleSort = (col: SortColumn): void => {
    if (sortColumn === col) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(col);
      setSortDirection('asc');
    }
  };

  const editingSupplier = editingId
    ? suppliers.find((s) => s.id === editingId) ?? null
    : null;

  const handleSaveForm = async (values: LeverantorFormValues): Promise<void> => {
    if (!companyId?.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateSupplier(companyId, editingId, {
          companyName: values.companyName,
          organizationNumber: values.organizationNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          category: values.category,
          categories: values.categories,
          byggdelTags: values.byggdelTags,
        });
        showNotice('Leverantör uppdaterad');
      } else {
        await createSupplier(companyId, {
          companyName: values.companyName,
          organizationNumber: values.organizationNumber,
          address: values.address,
          postalCode: values.postalCode,
          city: values.city,
          category: values.category,
          categories: values.categories,
          byggdelTags: values.byggdelTags,
        });
        showNotice('Leverantör tillagd');
      }
      setModalVisible(false);
      setEditingId(null);
      await loadSuppliers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte spara.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (supplier: Supplier): Promise<void> => {
    if (!companyId?.trim()) return;
    const label = String(supplier.companyName ?? '').trim() || 'leverantören';
    const ok =
      Platform.OS === 'web'
        ? window.confirm(`Radera ${label}?`)
        : await new Promise<boolean>((resolve) => {
            Alert.alert('Radera leverantör', `Radera ${label}?`, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
    if (!ok) return;
    try {
      await deleteSupplier(companyId, supplier.id);
      showNotice('Leverantör borttagen');
      if (editingId === supplier.id) {
        setModalVisible(false);
        setEditingId(null);
      }
      await loadSuppliers();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunde inte radera.');
    }
  };

  const openRowMenu = (e: unknown, supplier: Supplier): void => {
    if (Platform.OS !== 'web') {
      Alert.alert(
        'Leverantör',
        String(supplier.companyName ?? 'Leverantör'),
        [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Redigera', onPress: () => setEditingId(supplier.id) || setModalVisible(true) },
          { text: 'Radera', style: 'destructive', onPress: () => handleDelete(supplier) },
        ]
      );
      return;
    }
    const ne = e && typeof e === 'object' && 'nativeEvent' in e ? (e as { nativeEvent: { pageX?: number; pageY?: number } }).nativeEvent : e as { pageX?: number; pageY?: number };
    const x = Number(ne?.pageX ?? 20);
    const y = Number(ne?.pageY ?? 64);
    setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setRowMenuSupplier(supplier);
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
        <Text style={{ fontSize: 18, fontWeight: '500', color: '#111' }}>
          Leverantörer
        </Text>
        <Text style={{ marginTop: 8, fontSize: 14, color: '#64748b' }}>
          Leverantörer är optimerat för webbläget.
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
            if (!inlineSaving && inlineCompanyName.trim()) {
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
  }, [inlineSaving, inlineCompanyName, companyId, inlineOrganizationNumber, inlineAddress, inlinePostalCode, inlineCity, inlineCategory]);

  return (
    <MainLayout
      adminMode
      adminCurrentScreen="suppliers"
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
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      )}
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
                    <Ionicons name="business-outline" size={20} color="#1976D2" />
                  </View>
                  <Text style={styles.titleText}>Leverantörer</Text>
                </View>
              </View>
              <View style={styles.toolbarBottomRow}>
                <View style={styles.searchWrap}>
                  <Ionicons name="search" size={16} color="#64748b" />
                  <TextInput
                    style={styles.searchInput}
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Sök företagsnamn, orgnr, adress, postnr, ort, kategori…"
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
                    onPress={() => setExcelMenuOpen(true)}
                    activeOpacity={0.8}
                    {...(Platform.OS === 'web' ? { cursor: 'pointer', title: 'Excel' } : {})}
                  >
                    <Ionicons name="document-outline" size={16} color="#475569" />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.iconBtn}
                    onPress={loadSuppliers}
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
                <Text style={styles.metaText}>Laddar leverantörer…</Text>
              </View>
            ) : sorted.length === 0 ? (
              <View style={styles.emptyState}>
                <View style={styles.emptyIcon}>
                  <Ionicons name="business-outline" size={32} color="#64748b" />
                </View>
                {suppliers.length === 0 ? (
                  <>
                    <Text style={styles.emptyTitle}>Inga leverantörer ännu</Text>
                    <Text style={styles.emptySub}>
                      {search
                        ? 'Inga leverantörer matchade sökningen.'
                        : 'Lägg till din första leverantör för att komma igång.'}
                    </Text>
                  </>
                ) : categoryFilters.length ? (
                  <>
                    <Text style={styles.emptyTitle}>Inga leverantörer matchar valda kategorier</Text>
                    <Text style={styles.emptySub}>
                      Justera eller rensa filtret för att visa fler.
                    </Text>
                    <TouchableOpacity
                      style={[styles.iconBtn, { marginTop: 12 }]}
                      onPress={() => setCategoryFilters([])}
                      activeOpacity={0.8}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Text style={{ color: '#475569', fontWeight: '500' }}>Visa alla leverantörer</Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.emptyTitle}>Inga leverantörer matchar sökningen</Text>
                    <Text style={styles.emptySub}>
                      Justera sökningen för att visa fler.
                    </Text>
                  </>
                )}
              </View>
            ) : (
              <>
                <View style={styles.meta}>
                  <Text style={styles.metaText}>
                    Visar {sorted.length} av {filtered.length}
                  </Text>
                </View>
                <LeverantorerTable
                  suppliers={sorted}
                  sortColumn={sortColumn}
                  sortDirection={sortDirection}
                  onSort={handleSort}
                  onRowPress={() => {}}
                  onRowContextMenu={openRowMenu}
                  onRowMenu={(e, supplier) => openRowMenu(e, supplier)}
                  categoryFilters={categoryFilters}
                  onCategoryFiltersChange={setCategoryFilters}
                  contactRegistry={contacts}
                  contactsBySupplierId={Object.fromEntries(
                    suppliers.map((s) => [
                      s.id,
                      contacts
                        .filter((c) => c?.linkedSupplierId === s.id)
                        .map((c) => ({
                          id: c.id,
                          name: c.name,
                          role: c.role,
                          email: c.email,
                          phone: c.phone,
                        })),
                    ])
                  )}
                  onContactMenu={(e, supplier, contact) => {
                    const ne = (e as { nativeEvent?: { pageX?: number; pageY?: number } })?.nativeEvent || (e as { pageX?: number; pageY?: number });
                    const x = Number(ne?.pageX ?? 20);
                    const y = Number(ne?.pageY ?? 64);
                    setContactMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
                    setContactMenuSupplier(supplier);
                    setContactMenuContact(contact);
                    setContactMenuVisible(true);
                  }}
                  onAddContact={async (supplier, contact) => {
                    try {
                      await addContactToSupplier(companyId, supplier.id, supplier.companyName ?? '', contact);
                      await loadContacts();
                      showNotice('Kontaktperson inlagd');
                    } catch (e) {
                      setError(formatWriteError(e));
                    }
                  }}
                  onLinkContact={async (supplier, contactId, patch) => {
                    try {
                      await linkExistingContactToSupplier(companyId, supplier.id, contactId, patch);
                      await loadContacts();
                      showNotice('Kontaktperson inlagd');
                    } catch (e) {
                      setError(formatWriteError(e));
                    }
                  }}
                  onRemoveContact={async (supplier, contactId) => {
                    try {
                      await removeContactFromSupplier(companyId, supplier.id, contactId);
                      await loadContacts();
                    } catch (e) {
                      setError(formatWriteError(e));
                    }
                  }}
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
                  {editingId ? 'Redigera leverantör' : 'Lägg till leverantör'}
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
            <ScrollView
              style={{ maxHeight: '75vh' }}
              contentContainerStyle={{ paddingBottom: 20 }}
              keyboardShouldPersistTaps="handled"
            >
              <LeverantorForm
                initial={editingSupplier ?? undefined}
                byggdelar={byggdelar}
                saving={saving}
                onSave={handleSaveForm}
                onCancel={() => !saving && (setModalVisible(false), setEditingId(null))}
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
          const s = rowMenuSupplier;
          if (!s || !it) return;
          if (it.key === 'edit') {
            setEditingId(s.id);
            setModalVisible(true);
          } else if (it.key === 'delete') {
            handleDelete(s);
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
          const supplier = contactMenuSupplier;
          const contact = contactMenuContact;
          if (!supplier || !contact || !it) return;
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
                    await removeContactFromSupplier(companyId, supplier.id, contact.id);
                    await loadContacts();
                    showNotice('Kontaktperson raderad');
                  } catch (e) {
                    setError(formatWriteError(e));
                  }
                }},
              ]);
              return;
            }
            if (ok) {
              (async () => {
                try {
                  await deleteCompanyContact({ id: contact.id }, companyId);
                  await removeContactFromSupplier(companyId, supplier.id, contact.id);
                  await loadContacts();
                  showNotice('Kontaktperson raderad');
                } catch (e) {
                  setError(formatWriteError(e));
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
                      setError(formatWriteError(e));
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
      <Modal
        visible={excelMenuOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setExcelMenuOpen(false)}
      >
        <Pressable
          style={styles.modalBack}
          onPress={() => setExcelMenuOpen(false)}
        >
          <Pressable style={[styles.modalBox, { width: 360 }]} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitle}>
                <View style={styles.titleIcon}>
                  <Ionicons name="document-outline" size={20} color="#1976D2" />
                </View>
                <Text style={[styles.titleText, { fontSize: 16 }]}>Excel</Text>
              </View>
              <TouchableOpacity
                style={styles.modalClose}
                onPress={() => setExcelMenuOpen(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Ionicons name="close" size={22} color="#334155" />
              </TouchableOpacity>
            </View>
            <View style={{ padding: 16, gap: 10 }}>
              <TouchableOpacity
                style={[styles.iconBtn, { width: '100%', height: 44, borderRadius: 10, justifyContent: 'center' }]}
                onPress={() => {
                  setExcelMenuOpen(false);
                  exportSuppliersToExcel(false);
                }}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={{ color: '#475569', fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
                  Exportera till Excel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { width: '100%', height: 44, borderRadius: 10, justifyContent: 'center' }]}
                onPress={() => {
                  setExcelMenuOpen(false);
                  exportSuppliersToExcel(true);
                }}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={{ color: '#475569', fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
                  Exportera tom mall
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.iconBtn, { width: '100%', height: 44, borderRadius: 10, justifyContent: 'center' }]}
                onPress={() => {
                  setExcelMenuOpen(false);
                  handleImportClick();
                }}
                activeOpacity={0.8}
                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
              >
                <Text style={{ color: '#475569', fontSize: 14, fontWeight: '500', textAlign: 'center' }}>
                  Importera från Excel
                </Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </MainLayout>
  );
}
