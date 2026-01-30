import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import * as XLSX from 'xlsx';
import { HomeHeader } from '../components/common/HomeHeader';
import ContextMenu from '../components/ContextMenu';
import {
    auth,
    createCompanySupplier,
    deleteCompanySupplier,
    fetchCompanyProfile,
    fetchCompanySuppliers,
    updateCompanySupplier,
} from '../components/firebase';
import MainLayout from '../components/MainLayout';
import { useSharePointStatus } from '../hooks/useSharePointStatus';

export default function SuppliersScreen({ navigation, route }) {
  const routeCompanyId = String(route?.params?.companyId || '').trim();
  const isCustomers = route?.name === 'Customers'; // Check if this is customers screen
  
  // For superadmins, don't auto-select company - require explicit selection
  const [companyId, setCompanyId] = useState(() => {
    return routeCompanyId || '';
  });
  const [companyName, setCompanyName] = useState('');

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [headerHeight, setHeaderHeight] = useState(0);
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const { sharePointStatus } = useSharePointStatus({ companyId, searchSpinAnim });

  const noopAsync = async () => {};

  const showSimpleAlert = (title, message) => {
    try {
      const t = String(title || '').trim() || 'Info';
      const m = String(message || '').trim();
      if (Platform.OS === 'web' && typeof window !== 'undefined') window.alert(m ? `${t}\n\n${m}` : t);
      else Alert.alert(t, m || '');
    } catch (_e) {}
  };

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [suppliers, setSuppliers] = useState([]);
  const [search, setSearch] = useState('');

  const [visibleLimit, setVisibleLimit] = useState(500);
  const [sortColumn, setSortColumn] = useState('companyName'); // 'companyName', 'organizationNumber', 'vatNumber', 'address', 'category'
  const [sortDirection, setSortDirection] = useState('asc'); // 'asc' or 'desc'

  const [editingId, setEditingId] = useState(null);
  const [companyNameField, setCompanyNameField] = useState('');
  const [organizationNumber, setOrganizationNumber] = useState('');
  const [vatNumber, setVatNumber] = useState('');
  const [address, setAddress] = useState('');
  const [category, setCategory] = useState('');
  const [saving, setSaving] = useState(false);

  const [rowMenuVisible, setRowMenuVisible] = useState(false);
  const [rowMenuPos, setRowMenuPos] = useState({ x: 20, y: 64 });
  const [rowMenuSupplier, setRowMenuSupplier] = useState(null);

  // Inline editing state for new supplier row
  const [showInlineRow, setShowInlineRow] = useState(false);
  const [inlineCompanyName, setInlineCompanyName] = useState('');
  const [inlineOrganizationNumber, setInlineOrganizationNumber] = useState('');
  const [inlineVatNumber, setInlineVatNumber] = useState('');
  const [inlineAddress, setInlineAddress] = useState('');
  const [inlineCategory, setInlineCategory] = useState('');
  const [inlineSaving, setInlineSaving] = useState(false);

  const [supplierModalVisible, setSupplierModalVisible] = useState(false);
  const [importModalVisible, setImportModalVisible] = useState(false);
  const [importData, setImportData] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef(null);

  const loadSuppliers = async () => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setSuppliers([]);
      return;
    }

    setLoading(true);
    setError('');
    try {
      const data = await fetchCompanySuppliers(cid);
      setSuppliers(data || []);
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte ladda leverantörer.'));
    } finally {
      setLoading(false);
    }
  };

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
        loadSuppliers();
      } catch (_e) {}
    };

    window.addEventListener('dkGoHome', handleGoHome);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handleGoHome); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigation, companyId]);

  useEffect(() => {
    loadSuppliers();
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid) {
          if (!cancelled) setCompanyName('');
          return;
        }
        const profile = await fetchCompanyProfile(cid);
        if (!cancelled && profile) {
          const name = String(profile?.companyName || profile?.name || '').trim();
          setCompanyName(name || cid);
        }
      } catch (_e) {
        if (!cancelled) setCompanyName(companyId || '');
      }
    })();
    return () => { cancelled = true; };
  }, [companyId]);

  // Check permissions
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = auth && auth.currentUser ? auth.currentUser : null;
        if (!user) {
          if (!cancelled) {
            setAllowedTools(false);
            setCanSeeAllCompanies(false);
            setShowHeaderUserMenu(false);
          }
          return;
        }

        const tokenRes = await user.getIdTokenResult(true).catch(() => null);
        const claims = tokenRes?.claims || {};
        const isSuperadmin = !!claims.superadmin;
        const isAdmin = !!claims.admin || isSuperadmin;
        
        if (!cancelled) {
          setAllowedTools(isAdmin);
          setCanSeeAllCompanies(isSuperadmin);
          setShowHeaderUserMenu(true);
        }
      } catch (_e) {
        if (!cancelled) {
          setAllowedTools(false);
          setCanSeeAllCompanies(false);
          setShowHeaderUserMenu(false);
        }
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const showNotice = (msg) => {
    setNotice(msg);
    setTimeout(() => setNotice(''), 3000);
  };

  const clearForm = () => {
    setEditingId(null);
    setCompanyNameField('');
    setOrganizationNumber('');
    setVatNumber('');
    setAddress('');
    setCategory('');
    setSupplierModalVisible(false);
  };

  const startEdit = (supplier) => {
    if (!supplier) return;
    setEditingId(supplier.id);
    setCompanyNameField(String(supplier?.companyName || '').trim());
    setOrganizationNumber(String(supplier?.organizationNumber || '').trim());
    setVatNumber(String(supplier?.vatNumber || '').trim());
    setAddress(String(supplier?.address || '').trim());
    setCategory(String(supplier?.category || '').trim());
    setSupplierModalVisible(true);
  };

  const handleSave = async () => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag i listan till vänster först.');
      return;
    }

    const cn = String(companyNameField || '').trim();
    if (!cn) {
      setError('Företagsnamn är obligatoriskt.');
      return;
    }

    setSaving(true);
    setError('');
    try {
      if (editingId) {
        await updateCompanySupplier({ 
          id: editingId, 
          patch: {
            companyName: cn,
            organizationNumber: String(organizationNumber || '').trim(),
            vatNumber: String(vatNumber || '').trim(),
            address: String(address || '').trim(),
            category: String(category || '').trim(),
          }
        }, cid);
        showNotice('Leverantör uppdaterad');
      } else {
        await createCompanySupplier({
          companyName: cn,
          organizationNumber: String(organizationNumber || '').trim(),
          vatNumber: String(vatNumber || '').trim(),
          address: String(address || '').trim(),
          category: String(category || '').trim(),
        }, cid);
        showNotice('Leverantör tillagd');
      }
      await loadSuppliers();
      clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setSaving(false);
    }
  };

  const filtered = useMemo(() => {
    if (!search.trim()) return suppliers;
    const s = search.toLowerCase().trim();
    return suppliers.filter((supplier) => {
      const cn = String(supplier?.companyName || '').toLowerCase();
      const org = String(supplier?.organizationNumber || '').toLowerCase();
      const vat = String(supplier?.vatNumber || '').toLowerCase();
      const addr = String(supplier?.address || '').toLowerCase();
      const cat = String(supplier?.category || '').toLowerCase();
      return cn.includes(s) || org.includes(s) || vat.includes(s) || addr.includes(s) || cat.includes(s);
    });
  }, [suppliers, search]);

  const sorted = useMemo(() => {
    const filteredCopy = [...filtered];
    filteredCopy.sort((a, b) => {
      let aVal = '';
      let bVal = '';
      
      if (sortColumn === 'companyName') {
        aVal = String(a?.companyName || '').trim();
        bVal = String(b?.companyName || '').trim();
      } else if (sortColumn === 'organizationNumber') {
        aVal = String(a?.organizationNumber || '').trim();
        bVal = String(b?.organizationNumber || '').trim();
      } else if (sortColumn === 'vatNumber') {
        aVal = String(a?.vatNumber || '').trim();
        bVal = String(b?.vatNumber || '').trim();
      } else if (sortColumn === 'address') {
        aVal = String(a?.address || '').trim();
        bVal = String(b?.address || '').trim();
      } else if (sortColumn === 'category') {
        aVal = String(a?.category || '').trim();
        bVal = String(b?.category || '').trim();
      }
      
      const comparison = aVal.localeCompare(bVal, 'sv');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return filteredCopy;
  }, [filtered, sortColumn, sortDirection]);

  const shownSuppliers = sorted.slice(0, visibleLimit);

  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };

  const handleInlineSave = async () => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag i listan till vänster först.');
      return;
    }

    const cn = String(inlineCompanyName || '').trim();
    if (!cn) {
      return;
    }

    setInlineSaving(true);
    setError('');
    try {
      const payload = {
        companyName: cn,
        organizationNumber: String(inlineOrganizationNumber || '').trim(),
        vatNumber: String(inlineVatNumber || '').trim(),
        address: String(inlineAddress || '').trim(),
        category: String(inlineCategory || '').trim(),
      };

      await createCompanySupplier(payload, cid);
      await loadSuppliers();
      
      // Clear inline form and hide row
      setInlineCompanyName('');
      setInlineOrganizationNumber('');
      setInlineVatNumber('');
      setInlineAddress('');
      setInlineCategory('');
      setShowInlineRow(false);
      
      showNotice('Leverantör tillagd');
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte spara.'));
    } finally {
      setInlineSaving(false);
    }
  };

  const handleImportClick = () => {
    if (Platform.OS === 'web') {
      if (fileInputRef.current) {
        fileInputRef.current.click();
      }
    } else {
      Alert.alert('Info', 'Excel-import är endast tillgängligt i webbversionen.');
    }
  };

  const handleFileSelect = async (event) => {
    const file = event?.target?.files?.[0];
    if (!file) return;

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }

    // Check file type
    const fileName = String(file.name || '').toLowerCase();
    if (!fileName.endsWith('.xlsx') && !fileName.endsWith('.xls')) {
      setError('Endast Excel-filer (.xlsx, .xls) stöds.');
      return;
    }

    try {
      setLoading(true);
      setError('');

      // Read file as array buffer
      const arrayBuffer = await file.arrayBuffer();
      const workbook = XLSX.read(arrayBuffer, { type: 'array' });
      
      // Get first sheet
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setError('Excel-filen innehåller inga ark.');
        return;
      }

      const worksheet = workbook.Sheets[firstSheetName];
      const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
        header: 1, 
        defval: '',
        raw: false 
      });

      // Skip empty rows and parse data
      const parsedData = [];
      const headerRow = jsonData[0] || [];
      
      // Try to find column indices (flexible mapping)
      const findColumnIndex = (possibleHeaders) => {
        for (const header of possibleHeaders) {
          const idx = headerRow.findIndex(h => 
            String(h || '').toLowerCase().includes(String(header).toLowerCase())
          );
          if (idx >= 0) return idx;
        }
        return -1;
      };

      const companyNameIdx = findColumnIndex(['företagsnamn', 'company name', 'company', 'företag', 'namn']);
      const orgNrIdx = findColumnIndex(['orgnr', 'org nr', 'organization number', 'organisationsnummer']);
      const vatIdx = findColumnIndex(['vat', 'vat-nummer', 'vatnummer', 'vat number', 'moms']);
      const addressIdx = findColumnIndex(['adress', 'address']);
      const categoryIdx = findColumnIndex(['kategori', 'category', 'företagskategori']);

      // If no headers found, assume first row is headers and try column positions
      const startRow = (companyNameIdx >= 0 || orgNrIdx >= 0) ? 1 : 0;

      for (let i = startRow; i < jsonData.length; i++) {
        const row = jsonData[i] || [];
        const companyName = companyNameIdx >= 0 ? String(row[companyNameIdx] || '').trim() : String(row[0] || '').trim();
        
        // Skip empty rows
        if (!companyName) continue;

        parsedData.push({
          companyName,
          organizationNumber: orgNrIdx >= 0 ? String(row[orgNrIdx] || '').trim() : String(row[1] || '').trim(),
          vatNumber: vatIdx >= 0 ? String(row[vatIdx] || '').trim() : String(row[2] || '').trim(),
          address: addressIdx >= 0 ? String(row[addressIdx] || '').trim() : String(row[3] || '').trim(),
          category: categoryIdx >= 0 ? String(row[categoryIdx] || '').trim() : String(row[4] || '').trim(),
        });
      }

      if (parsedData.length === 0) {
        setError('Ingen data hittades i Excel-filen. Kontrollera att filen har data och korrekta kolumnrubriker.');
        return;
      }

      setImportData(parsedData);
      setImportModalVisible(true);
    } catch (e) {
      setError(`Kunde inte läsa Excel-filen: ${String(e?.message || e || 'Okänt fel')}`);
      console.error('[Excel Import]', e);
    } finally {
      setLoading(false);
    }
  };

  const handleImportConfirm = async () => {
    const cid = String(companyId || '').trim();
    if (!cid) {
      setError('Välj ett företag i listan till vänster först.');
      return;
    }

    if (!importData || importData.length === 0) {
      setError('Ingen data att importera.');
      return;
    }

    setImporting(true);
    setError('');
    let successCount = 0;
    let errorCount = 0;

    try {
      for (const item of importData) {
        try {
          if (!String(item?.companyName || '').trim()) continue;
          
          await createCompanySupplier({
            companyName: String(item.companyName || '').trim(),
            organizationNumber: String(item.organizationNumber || '').trim(),
            vatNumber: String(item.vatNumber || '').trim(),
            address: String(item.address || '').trim(),
            category: String(item.category || '').trim(),
          }, cid);
          successCount++;
        } catch (e) {
          console.warn('[Import] Failed to import row:', item, e);
          errorCount++;
        }
      }

      await loadSuppliers();
      setImportModalVisible(false);
      setImportData([]);
      
      if (errorCount === 0) {
        showNotice(`${successCount} leverantör(er) importerades framgångsrikt.`);
      } else {
        showNotice(`${successCount} leverantör(er) importerades. ${errorCount} misslyckades.`);
      }
    } catch (e) {
      setError(`Importfel: ${String(e?.message || e || 'Okänt fel')}`);
    } finally {
      setImporting(false);
    }
  };

  const handleAddNew = () => {
    setShowInlineRow(true);
    setInlineCompanyName('');
    setInlineOrganizationNumber('');
    setInlineVatNumber('');
    setInlineAddress('');
    setInlineCategory('');
    // Focus first field after a short delay
    if (Platform.OS === 'web') {
      setTimeout(() => {
        try {
          const firstInput = document.querySelector('input[placeholder="Företagsnamn"]');
          if (firstInput) firstInput.focus();
        } catch(_e) {}
      }, 100);
    }
  };

  const handleDelete = async (supplier) => {
    try {
      const cid = String(companyId || '').trim();
      if (!cid) {
        setError('Välj ett företag i listan till vänster först.');
        return;
      }
      const id = String(supplier?.id || '').trim();
      if (!id) return;

      const label = String(supplier?.companyName || '').trim() || 'leverantören';
      if (Platform.OS === 'web') {
        const ok = typeof window !== 'undefined' && window.confirm ? window.confirm(`Radera ${label}?`) : false;
        if (!ok) return;
      } else {
        const ok = await new Promise((resolve) => {
          Alert.alert('Radera leverantör', `Radera ${label}?`, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Radera', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });
        if (!ok) return;
      }

      await deleteCompanySupplier({ id }, cid);
      await loadSuppliers();
      if (editingId && editingId === id) clearForm();
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte radera.'));
    }
  };

  const isWeb = Platform.OS === 'web';

  const openRowMenu = (e, supplier) => {
    try {
      if (Platform.OS !== 'web') {
        const s = supplier || null;
        if (!s) return;
        Alert.alert('Leverantör', String(s?.companyName || 'Leverantör'), [
          { text: 'Avbryt', style: 'cancel' },
          { text: 'Redigera', onPress: () => startEdit(s) },
          { text: 'Radera', style: 'destructive', onPress: () => handleDelete(s) },
        ]);
        return;
      }

      if (e && typeof e.preventDefault === 'function') e.preventDefault();
      if (e && typeof e.stopPropagation === 'function') e.stopPropagation();

      const ne = e?.nativeEvent || e;
      const x = Number(ne?.pageX ?? ne?.clientX ?? ne?.locationX ?? 20);
      const y = Number(ne?.pageY ?? ne?.clientY ?? ne?.locationY ?? 64);
      setRowMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
      setRowMenuSupplier(supplier || null);
      setRowMenuVisible(true);
    } catch (_err) {
      setRowMenuPos({ x: 20, y: 64 });
      setRowMenuSupplier(supplier || null);
      setRowMenuVisible(true);
    }
  };

  const rowMenuItems = [
    { key: 'edit', label: 'Redigera', icon: <Ionicons name="create-outline" size={16} color="#0f172a" /> },
    { key: 'delete', label: 'Radera', danger: true, icon: <Ionicons name="trash-outline" size={16} color="#C62828" /> },
  ];

  if (!isWeb) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700' }}>Leverantörer</Text>
        <Text style={{ marginTop: 8, color: '#555' }}>Leverantörer är just nu optimerat för webbläget.</Text>
      </View>
    );
  }

  const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
  const dashboardCardStyle = { 
    borderWidth: 1, 
    borderColor: '#E6E8EC', 
    borderRadius: 18, 
    padding: 20, 
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  };

  const hasSelectedCompany = !!String(companyId || '').trim();
  const screenTitle = isCustomers ? 'Kunder' : 'Leverantörer';

  // Keyboard event handler for Enter to save inline row (web only)
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !hasSelectedCompany || !showInlineRow) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
        // Only trigger if we're in an inline input field
        const target = e.target;
        if (target && target.tagName === 'INPUT' && target.placeholder && 
            ['Företagsnamn', 'Orgnr', 'VAT-nummer', 'Adress', 'Företagskategori'].includes(target.placeholder)) {
          // If in last field (Företagskategori), save
          if (target.placeholder === 'Företagskategori') {
            e.preventDefault();
            if (!inlineSaving && inlineCompanyName.trim() && String(companyId || '').trim()) {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasSelectedCompany, showInlineRow, inlineSaving, inlineCompanyName, companyId]);

  return (
    <>
      {Platform.OS === 'web' && (
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          onChange={handleFileSelect}
          style={{ display: 'none' }}
        />
      )}
      <MainLayout
        adminMode={true}
        adminCurrentScreen={isCustomers ? 'customers' : 'suppliers'}
        adminOnSelectCompany={(payload) => {
          try {
            const cid = String(payload?.companyId || payload?.id || '').trim();
            if (!cid) return;
            if (!canSeeAllCompanies) {
              return;
            }
            setCompanyId(cid);
            clearForm();
          } catch (_e) {}
        }}
        adminShowCompanySelector={canSeeAllCompanies}
        sidebarSelectedCompanyId={companyId}
        sidebarCompaniesMode={true}
        sidebarShowMembers={false}
        sidebarHideCompanyActions={true}
        sidebarAutoExpandMembers={true}
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
            routeCompanyId={route?.params?.companyId || ''}
            showAdminButton={false}
            adminActionRunning={false}
            localFallbackExists={false}
            handleMakeDemoAdmin={noopAsync}
            refreshLocalFallbackFlag={noopAsync}
            dumpLocalRemoteControls={async () => showSimpleAlert('Info', 'Debug-funktionen är inte kopplad på denna vy.')}
            showLastFsError={async () => showSimpleAlert('Info', 'FS-felvisning är inte kopplad på denna vy.')}
            saveControlToFirestore={noopAsync}
            saveDraftToFirestore={noopAsync}
            searchSpinAnim={searchSpinAnim}
            sharePointStatus={sharePointStatus}
          />
        }
        rightPanel={null}
      >
        <View style={dashboardContainerStyle}>
          <View style={dashboardCardStyle}>
            {error ? (
              <View style={{ 
                paddingVertical: 14, 
                paddingHorizontal: 16, 
                borderRadius: 12, 
                backgroundColor: '#FEE2E2', 
                borderWidth: 1, 
                borderColor: '#FECACA', 
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Ionicons name="warning" size={20} color="#DC2626" />
                <Text style={{ fontSize: 13, color: '#DC2626', fontWeight: '600' }}>{error}</Text>
              </View>
            ) : null}

            {notice ? (
              <View style={{ 
                paddingVertical: 14, 
                paddingHorizontal: 16, 
                borderRadius: 12, 
                backgroundColor: '#ECFDF5', 
                borderWidth: 1, 
                borderColor: '#A7F3D0', 
                marginBottom: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 10,
              }}>
                <Ionicons name="checkmark-circle" size={20} color="#059669" />
                <Text style={{ fontSize: 13, color: '#059669', fontWeight: '700' }}>{notice}</Text>
              </View>
            ) : null}

            <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 16, overflow: 'hidden', backgroundColor: '#fff' }}>
              <View style={{ padding: 18, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E6E8EC' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    {companyName ? (
                      <>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: '#666' }}>{companyName}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#999" />
                      </>
                    ) : null}
                    <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="business-outline" size={20} color="#43A047" />
                    </View>
                    <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>{screenTitle}</Text>
                  </View>
                  <View style={{ flex: 1, maxWidth: 400, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 10, backgroundColor: '#fff', paddingHorizontal: 12, paddingVertical: 8 }}>
                    <Ionicons name="search" size={16} color="#64748b" style={{ marginRight: 8 }} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                      placeholder="Sök företagsnamn, orgnr, VAT, adress, kategori..."
                      style={{ 
                        flex: 1, 
                        fontSize: 13, 
                        color: '#111',
                        ...(Platform.OS === 'web' ? {
                          outline: 'none',
                        } : {}),
                      }}
                      placeholderTextColor="#94A3B8"
                  />
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {hasSelectedCompany && (
                    <>
                      <TouchableOpacity
                        onPress={handleAddNew}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#1976D2',
                          alignItems: 'center',
                          justifyContent: 'center',
                          ...(Platform.OS === 'web' ? {
                            transition: 'background-color 0.2s',
                            cursor: 'pointer',
                          } : {}),
                        }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name="add" size={18} color="#fff" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={handleImportClick}
                        style={{
                          width: 36,
                          height: 36,
                          borderRadius: 18,
                          backgroundColor: '#F1F5F9',
                          borderWidth: 1,
                          borderColor: '#E2E8F0',
                          alignItems: 'center',
                          justifyContent: 'center',
                          ...(Platform.OS === 'web' ? {
                            transition: 'background-color 0.2s',
                            cursor: 'pointer',
                          } : {}),
                        }}
                        activeOpacity={0.8}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 2 }}>
                          <Ionicons name="arrow-forward" size={11} color="#475569" />
                          <View style={{ 
                            width: 18, 
                            height: 18, 
                            borderRadius: 3,
                            backgroundColor: '#fff',
                            borderWidth: 1,
                            borderColor: '#1D6F42',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <Ionicons name="document" size={11} color="#1D6F42" />
                          </View>
                        </View>
                      </TouchableOpacity>
                    </>
                  )}
                  <TouchableOpacity
                    onPress={loadSuppliers}
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 18,
                      backgroundColor: '#F1F5F9',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      alignItems: 'center',
                      justifyContent: 'center',
                      ...(Platform.OS === 'web' ? {
                        transition: 'background-color 0.2s',
                        cursor: 'pointer',
                      } : {}),
                    }}
                    activeOpacity={0.8}
                  >
                    <Ionicons name="refresh" size={16} color="#475569" />
                  </TouchableOpacity>
                </View>
                </View>
              </View>
              <View style={{ padding: 18 }}>
                {hasSelectedCompany ? (
                  <>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                      <Text style={{ fontSize: 13, color: '#64748b', fontWeight: '500' }}>
                    Visar {Math.min(shownSuppliers.length, filtered.length)} av {filtered.length}
                  </Text>
                  {filtered.length > shownSuppliers.length ? (
                    <TouchableOpacity
                      onPress={() => setVisibleLimit((v) => Math.min(filtered.length, (Number(v) || 500) + 500))}
                          style={{ 
                            paddingVertical: 8, 
                            paddingHorizontal: 14, 
                            borderRadius: 10, 
                            backgroundColor: '#EFF6FF',
                            borderWidth: 1,
                            borderColor: '#BFDBFE',
                            ...(Platform.OS === 'web' ? {
                              transition: 'background-color 0.2s',
                              cursor: 'pointer',
                            } : {}),
                          }}
                          activeOpacity={0.8}
                        >
                          <Text style={{ color: '#1976D2', fontWeight: '700', fontSize: 13 }}>Visa fler</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>

                    <View style={{ 
                      backgroundColor: '#F8FAFC', 
                      paddingVertical: 12, 
                      paddingHorizontal: 14, 
                      borderRadius: 12, 
                      borderWidth: 1, 
                      borderColor: '#E6E8EC', 
                      marginBottom: 12 
                    }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <TouchableOpacity
                          onPress={() => handleSort('companyName')}
                          style={{
                            flex: 2.0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Företagsnamn</Text>
                          {sortColumn === 'companyName' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('organizationNumber')}
                          style={{
                            flex: 1.0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Orgnr</Text>
                          {sortColumn === 'organizationNumber' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('vatNumber')}
                          style={{
                            flex: 1.0,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>VAT-nummer</Text>
                          {sortColumn === 'vatNumber' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('address')}
                          style={{
                            flex: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Adress</Text>
                          {sortColumn === 'address' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleSort('category')}
                          style={{
                            flex: 1.5,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 4,
                            ...(Platform.OS === 'web' ? {
                              cursor: 'pointer',
                              transition: 'opacity 0.2s',
                            } : {}),
                          }}
                          activeOpacity={0.7}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#475569' }}>Företagskategori</Text>
                          {sortColumn === 'category' ? (
                            <Ionicons 
                              name={sortDirection === 'asc' ? 'chevron-up' : 'chevron-down'} 
                              size={14} 
                              color="#1976D2" 
                            />
                          ) : (
                            <Ionicons name="swap-vertical-outline" size={14} color="#CBD5E1" />
                          )}
                        </TouchableOpacity>
                  </View>
                </View>

                {loading ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <Text style={{ color: '#64748b', fontSize: 14, fontWeight: '500' }}>Laddar leverantörer…</Text>
                      </View>
                ) : (
                  <>
                    {/* Show inline row if showInlineRow is true, even if list is empty */}
                    {showInlineRow && hasSelectedCompany ? (
                      <View style={{ 
                        borderWidth: 1, 
                        borderColor: '#E6E8EC', 
                        borderRadius: 12, 
                        overflow: 'hidden', 
                        backgroundColor: '#fff',
                        marginBottom: 12
                      }}>
                        <View style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          paddingVertical: 6, 
                          paddingHorizontal: 14, 
                          backgroundColor: '#F8FAFC',
                        }}>
                          <TextInput
                            value={inlineCompanyName}
                            onChangeText={setInlineCompanyName}
                            placeholder="Företagsnamn"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Orgnr"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 2.0,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineOrganizationNumber}
                            onChangeText={setInlineOrganizationNumber}
                            placeholder="Orgnr"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="VAT-nummer"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.0,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineVatNumber}
                            onChangeText={setInlineVatNumber}
                            placeholder="VAT-nummer"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Adress"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.0,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineAddress}
                            onChangeText={setInlineAddress}
                            placeholder="Adress"
                            returnKeyType="next"
                            blurOnSubmit={false}
                            onSubmitEditing={() => {
                              if (Platform.OS === 'web') {
                                setTimeout(() => {
                                  try {
                                    const nextInput = document.querySelector('input[placeholder="Företagskategori"]');
                                    if (nextInput) nextInput.focus();
                                  } catch(_e) {}
                                }, 50);
                              }
                            }}
                            style={{ 
                              flex: 1.5,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                          <TextInput
                            value={inlineCategory}
                            onChangeText={setInlineCategory}
                            placeholder="Företagskategori"
                            returnKeyType="done"
                            blurOnSubmit={true}
                            onSubmitEditing={() => {
                              if (!inlineSaving && inlineCompanyName.trim() && String(companyId || '').trim()) {
                                handleInlineSave();
                              }
                            }}
                            style={{ 
                              flex: 1.5,
                              fontSize: 13, 
                              color: '#111',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              marginLeft: 8,
                              borderWidth: 1,
                              borderColor: '#E2E8F0',
                              borderRadius: 6,
                              backgroundColor: '#fff',
                              ...(Platform.OS === 'web' ? {
                                outline: 'none',
                              } : {}),
                            }}
                            placeholderTextColor="#94A3B8"
                          />
                        </View>
                      </View>
                    ) : null}
                    {filtered.length === 0 && !showInlineRow ? (
                      <View style={{ 
                        padding: 32, 
                        alignItems: 'center', 
                        backgroundColor: '#F8FAFC', 
                        borderRadius: 12, 
                        borderWidth: 1, 
                        borderColor: '#E6E8EC' 
                      }}>
                        <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                          <Ionicons name="business-outline" size={32} color="#43A047" />
                        </View>
                        <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Inga leverantörer ännu</Text>
                        <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                          {search ? 'Inga leverantörer matchade din sökning.' : 'Lägg till din första leverantör för att komma igång.'}
                        </Text>
                      </View>
                    ) : filtered.length > 0 ? (
                      <View>
                        <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' }}>
                          {/* Supplier rows */}
                          {shownSuppliers.map((supplier, idx) => (
                            <TouchableOpacity
                              key={supplier.id || idx}
                              onPress={(e) => startEdit(supplier)}
                              onLongPress={(e) => openRowMenu(e, supplier)}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                paddingVertical: 10,
                                paddingHorizontal: 14,
                                borderBottomWidth: idx < shownSuppliers.length - 1 ? 1 : 0,
                                borderBottomColor: '#EEF0F3',
                                backgroundColor: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                                ...(Platform.OS === 'web' ? {
                                  transition: 'background-color 0.2s',
                                  cursor: 'pointer',
                                  ':hover': { backgroundColor: '#F1F5F9' },
                                } : {}),
                              }}
                              activeOpacity={0.7}
                            >
                              <Text style={{ flex: 2.0, fontSize: 13, color: '#111', fontWeight: '500' }}>{supplier?.companyName || '—'}</Text>
                              <Text style={{ flex: 1.0, fontSize: 13, color: '#64748b' }}>{supplier?.organizationNumber || '—'}</Text>
                              <Text style={{ flex: 1.0, fontSize: 13, color: '#64748b' }}>{supplier?.vatNumber || '—'}</Text>
                              <Text style={{ flex: 1.5, fontSize: 13, color: '#64748b' }}>{supplier?.address || '—'}</Text>
                              <Text style={{ flex: 1.5, fontSize: 13, color: '#64748b' }}>{supplier?.category || '—'}</Text>
                            </TouchableOpacity>
                          ))}
                        </View>
                      </View>
                    ) : null}
                  </>
                )}
                  </>
                ) : (
                  <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#E6E8EC' }}>
                    <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600' }}>Välj ett företag i listan till vänster</Text>
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Supplier Modal */}
          <Modal
            visible={supplierModalVisible}
            transparent
            animationType="fade"
            onRequestClose={() => {
              if (!saving) {
                clearForm();
              }
            }}
          >
            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={() => {
                  if (!saving) {
                    clearForm();
                  }
                }}
              />
              <View style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                width: 520,
                maxWidth: '96%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: 0.18,
                shadowRadius: 18,
                elevation: 12,
                overflow: 'hidden',
              }}>
                <View style={{
                  height: 56,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E6E8EC',
                  backgroundColor: '#F8FAFC',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  paddingHorizontal: 16,
                }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
                    <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name={editingId ? "create-outline" : "add-outline"} size={20} color="#43A047" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '700', color: '#111' }}>{editingId ? 'Redigera leverantör' : 'Lägg till leverantör'}</Text>
                  </View>
                  <TouchableOpacity
                    style={{ position: 'absolute', right: 12, top: 10, padding: 6 }}
                    onPress={() => {
                      if (!saving) {
                        clearForm();
                      }
                    }}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                  >
                    <Ionicons name="close" size={22} color="#111" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 600 }} contentContainerStyle={{ padding: 20 }}>
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Företagsnamn *</Text>
                  <TextInput
                    value={companyNameField}
                    onChangeText={setCompanyNameField}
                    placeholder="Företagsnamn"
                    style={{ 
                      borderWidth: 1, 
                      borderColor: companyNameField.trim() ? '#E2E8F0' : '#EF4444', 
                      paddingVertical: 10, 
                      paddingHorizontal: 12, 
                      borderRadius: 10, 
                      fontSize: 13, 
                      marginBottom: 16,
                      backgroundColor: '#fff',
                      color: '#111',
                      ...(Platform.OS === 'web' ? {
                        outline: 'none',
                        transition: 'border-color 0.2s',
                      } : {}),
                    }}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Organisationsnummer</Text>
                  <TextInput
                    value={organizationNumber}
                    onChangeText={setOrganizationNumber}
                    placeholder="Organisationsnummer"
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#E2E8F0', 
                      paddingVertical: 10, 
                      paddingHorizontal: 12, 
                      borderRadius: 10, 
                      fontSize: 13, 
                      marginBottom: 16,
                      backgroundColor: '#fff',
                      color: '#111',
                      ...(Platform.OS === 'web' ? {
                        outline: 'none',
                      } : {}),
                    }}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>VAT-nummer</Text>
                  <TextInput
                    value={vatNumber}
                    onChangeText={setVatNumber}
                    placeholder="VAT-nummer"
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#E2E8F0', 
                      paddingVertical: 10, 
                      paddingHorizontal: 12, 
                      borderRadius: 10, 
                      fontSize: 13, 
                      marginBottom: 16,
                      backgroundColor: '#fff',
                      color: '#111',
                      ...(Platform.OS === 'web' ? {
                        outline: 'none',
                      } : {}),
                    }}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Adress</Text>
                  <TextInput
                    value={address}
                    onChangeText={setAddress}
                    placeholder="Adress"
                    multiline
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#E2E8F0', 
                      paddingVertical: 10, 
                      paddingHorizontal: 12, 
                      borderRadius: 10, 
                      fontSize: 13, 
                      marginBottom: 16,
                      minHeight: 80,
                      textAlignVertical: 'top',
                      backgroundColor: '#fff',
                      color: '#111',
                      ...(Platform.OS === 'web' ? {
                        outline: 'none',
                      } : {}),
                    }}
                    placeholderTextColor="#94A3B8"
                  />

                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#334155', marginBottom: 6 }}>Företagskategori</Text>
                  <TextInput
                    value={category}
                    onChangeText={setCategory}
                    placeholder="Företagskategori"
                    style={{ 
                      borderWidth: 1, 
                      borderColor: '#E2E8F0', 
                      paddingVertical: 10, 
                      paddingHorizontal: 12, 
                      borderRadius: 10, 
                      fontSize: 13, 
                      marginBottom: 16,
                      backgroundColor: '#fff',
                      color: '#111',
                      ...(Platform.OS === 'web' ? {
                        outline: 'none',
                      } : {}),
                    }}
                    placeholderTextColor="#94A3B8"
                  />

                  <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                    <TouchableOpacity
                      onPress={handleSave}
                      disabled={saving || !companyNameField.trim()}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: companyNameField.trim() ? '#43A047' : '#E2E8F0',
                        alignItems: 'center',
                        ...(Platform.OS === 'web' ? {
                          cursor: companyNameField.trim() ? 'pointer' : 'not-allowed',
                          transition: 'background-color 0.2s',
                        } : {}),
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: companyNameField.trim() ? '#fff' : '#94A3B8', fontWeight: '700', fontSize: 14 }}>
                        {saving ? 'Sparar...' : 'Spara'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={clearForm}
                      disabled={saving}
                      style={{
                        flex: 1,
                        paddingVertical: 12,
                        paddingHorizontal: 16,
                        borderRadius: 10,
                        backgroundColor: '#F1F5F9',
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        alignItems: 'center',
                        ...(Platform.OS === 'web' ? {
                          cursor: 'pointer',
                          transition: 'background-color 0.2s',
                        } : {}),
                      }}
                      activeOpacity={0.8}
                    >
                      <Text style={{ color: '#475569', fontWeight: '700', fontSize: 14 }}>Avbryt</Text>
                    </TouchableOpacity>
                  </View>
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* Import Preview Modal */}
          <Modal
            visible={importModalVisible}
            animationType="slide"
            transparent={true}
            onRequestClose={() => {
              if (!importing) {
                setImportModalVisible(false);
                setImportData([]);
              }
            }}
          >
            <View style={{ 
              flex: 1, 
              backgroundColor: 'rgba(0,0,0,0.5)', 
              justifyContent: 'center', 
              alignItems: 'center',
              padding: 20,
            }}>
              <View style={{ 
                backgroundColor: '#fff', 
                borderRadius: 18, 
                width: '100%', 
                maxWidth: 800, 
                maxHeight: '80%',
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.25,
                shadowRadius: 12,
                elevation: 8,
              }}>
                <View style={{ 
                  padding: 24, 
                  borderBottomWidth: 1, 
                  borderBottomColor: '#E6E8EC',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                }}>
                  <Text style={{ fontSize: 20, fontWeight: '700', color: '#111' }}>
                    Förhandsvisning av import ({importData.length} leverantörer)
                  </Text>
                  {!importing && (
                    <TouchableOpacity
                      onPress={() => {
                        setImportModalVisible(false);
                        setImportData([]);
                      }}
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 16,
                        backgroundColor: '#F1F5F9',
                        alignItems: 'center',
                        justifyContent: 'center',
                        ...(Platform.OS === 'web' ? {
                          cursor: 'pointer',
                        } : {}),
                      }}
                      activeOpacity={0.8}
                    >
                      <Ionicons name="close" size={20} color="#64748b" />
                    </TouchableOpacity>
                  )}
                </View>

                <ScrollView style={{ maxHeight: 400 }}>
                  <View style={{ padding: 20 }}>
                    <View style={{ 
                      borderWidth: 1, 
                      borderColor: '#E6E8EC', 
                      borderRadius: 12, 
                      overflow: 'hidden',
                      backgroundColor: '#fff',
                    }}>
                      {/* Header */}
                      <View style={{ 
                        flexDirection: 'row', 
                        backgroundColor: '#F8FAFC',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        borderBottomWidth: 1,
                        borderBottomColor: '#E6E8EC',
                      }}>
                        <Text style={{ flex: 2.0, fontSize: 12, fontWeight: '700', color: '#475569' }}>Företagsnamn</Text>
                        <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '700', color: '#475569' }}>Orgnr</Text>
                        <Text style={{ flex: 1.0, fontSize: 12, fontWeight: '700', color: '#475569' }}>VAT</Text>
                        <Text style={{ flex: 1.5, fontSize: 12, fontWeight: '700', color: '#475569' }}>Adress</Text>
                        <Text style={{ flex: 1.5, fontSize: 12, fontWeight: '700', color: '#475569' }}>Kategori</Text>
                      </View>

                      {/* Rows */}
                      {importData.slice(0, 50).map((item, idx) => (
                        <View
                          key={idx}
                          style={{
                            flexDirection: 'row',
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderBottomWidth: idx < Math.min(importData.length - 1, 49) ? 1 : 0,
                            borderBottomColor: '#EEF0F3',
                            backgroundColor: idx % 2 === 0 ? '#fff' : '#F8FAFC',
                          }}
                        >
                          <Text style={{ flex: 2.0, fontSize: 13, color: '#111', fontWeight: '500' }}>{item.companyName || '—'}</Text>
                          <Text style={{ flex: 1.0, fontSize: 13, color: '#64748b' }}>{item.organizationNumber || '—'}</Text>
                          <Text style={{ flex: 1.0, fontSize: 13, color: '#64748b' }}>{item.vatNumber || '—'}</Text>
                          <Text style={{ flex: 1.5, fontSize: 13, color: '#64748b' }}>{item.address || '—'}</Text>
                          <Text style={{ flex: 1.5, fontSize: 13, color: '#64748b' }}>{item.category || '—'}</Text>
                        </View>
                      ))}
                      {importData.length > 50 && (
                        <View style={{ padding: 12, backgroundColor: '#F8FAFC', alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#64748b' }}>
                            ... och {importData.length - 50} till
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </ScrollView>

                <View style={{ 
                  padding: 20, 
                  borderTopWidth: 1, 
                  borderTopColor: '#E6E8EC',
                  flexDirection: 'row',
                  gap: 12,
                }}>
                  <TouchableOpacity
                    onPress={handleImportConfirm}
                    disabled={importing}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      backgroundColor: importing ? '#E2E8F0' : '#43A047',
                      alignItems: 'center',
                      ...(Platform.OS === 'web' ? {
                        cursor: importing ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                      } : {}),
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: importing ? '#94A3B8' : '#fff', fontWeight: '700', fontSize: 14 }}>
                      {importing ? 'Importerar...' : `Importera ${importData.length} leverantörer`}
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      if (!importing) {
                        setImportModalVisible(false);
                        setImportData([]);
                      }
                    }}
                    disabled={importing}
                    style={{
                      flex: 1,
                      paddingVertical: 12,
                      paddingHorizontal: 16,
                      borderRadius: 10,
                      backgroundColor: '#F1F5F9',
                      borderWidth: 1,
                      borderColor: '#E2E8F0',
                      alignItems: 'center',
                      ...(Platform.OS === 'web' ? {
                        cursor: importing ? 'not-allowed' : 'pointer',
                        transition: 'background-color 0.2s',
                      } : {}),
                    }}
                    activeOpacity={0.8}
                  >
                    <Text style={{ color: importing ? '#94A3B8' : '#475569', fontWeight: '700', fontSize: 14 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Modal>

          {/* Context Menu */}
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
                startEdit(s);
              } else if (it.key === 'delete') {
                handleDelete(s);
              }
            }}
          />
        </View>
      </MainLayout>
    </>
  );
}
