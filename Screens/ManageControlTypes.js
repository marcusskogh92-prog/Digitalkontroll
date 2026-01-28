import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Alert, ImageBackground, Platform, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import {
    auth,
    createCompanyControlType,
    createCompanyControlTypeFolder,
    createCompanyMall,
    DEFAULT_CONTROL_TYPES,
    deleteCompanyControlType,
    deleteCompanyControlTypeFolder,
    deleteCompanyMall,
    fetchCompanies,
    fetchCompanyControlTypeFolders,
    fetchCompanyControlTypes,
    fetchCompanyMallar,
    fetchCompanyProfile,
    updateCompanyControlType,
    updateCompanyControlTypeFolder,
    updateCompanyMall,
} from '../components/firebase';
import HeaderAdminMenu from '../components/HeaderAdminMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

// Ikonuppsättning för nya kontrolltyper (ca 36 bygg-/kontrollrelaterade varianter)
const CONTROL_TYPE_ICON_CHOICES = [
  { icon: 'construct-outline', color: '#1976D2' },
  { icon: 'checkmark-done-outline', color: '#388E3C' },
  { icon: 'water-outline', color: '#0288D1' },
  { icon: 'checkbox-outline', color: '#7B1FA2' },
  { icon: 'warning-outline', color: '#FFD600' },
  { icon: 'shield-half-outline', color: '#388E3C' },
  { icon: 'document-text-outline', color: '#455A64' },
  { icon: 'document-outline', color: '#1976D2' },
  { icon: 'clipboard-outline', color: '#1976D2' },
  { icon: 'save-outline', color: '#D32F2F' },
  { icon: 'calendar-outline', color: '#1976D2' },
  { icon: 'cube-outline', color: '#1976D2' },
  { icon: 'camera', color: '#1976D2' },
  { icon: 'images', color: '#00897B' },
  { icon: 'partly-sunny', color: '#FFA000' },
  { icon: 'sunny-outline', color: '#FBC02D' },
  { icon: 'alert-circle', color: '#D32F2F' },
  { icon: 'checkmark-circle', color: '#43A047' },
  { icon: 'remove-circle', color: '#607D8B' },
  { icon: 'close-circle-outline', color: '#D32F2F' },
  { icon: 'options-outline', color: '#6A1B9A' },
  { icon: 'copy-outline', color: '#00897B' },
  { icon: 'business', color: '#2E7D32' },
  { icon: 'home-outline', color: '#1976D2' },
  { icon: 'person-outline', color: '#1976D2' },
  { icon: 'list', color: '#1565C0' },
  { icon: 'filter', color: '#1976D2' },
  { icon: 'search', color: '#1976D2' },
  { icon: 'add-circle-outline', color: '#1976D2' },
  { icon: 'add-circle', color: '#43A047' },
  // Extra bygg-/installationsrelaterade ikoner för EL, VVS, mark, rivning, ventilation m.m.
  { icon: 'flash-outline', color: '#FBC02D' },      // El
  { icon: 'thermometer-outline', color: '#1976D2' }, // Klimat / VVS
  { icon: 'flame-outline', color: '#D32F2F' },       // Heta arbeten / rivning
  { icon: 'leaf-outline', color: '#43A047' },        // Miljö / energi
  { icon: 'rainy-outline', color: '#0288D1' },       // Väder / fukt / mark
  { icon: 'map-outline', color: '#6D4C41' },         // Mark / plats
];

export default function ManageControlTypes({ route, navigation }) {
  const windowWidth = useWindowDimensions().width;
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [companyName, setCompanyName] = useState('');
  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);
  const [selectedControlType, setSelectedControlType] = useState('');

  // Keep selected companyId in storage so global tools (kontaktregister i dropdown) resolve correctly.
  useEffect(() => {
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid) return;
        try { await AsyncStorage.setItem('dk_companyId', cid); } catch (_e) {}
        if (Platform.OS === 'web') {
          try { window?.localStorage?.setItem?.('dk_companyId', cid); } catch (_e) {}
        }
      } catch (_e) {}
    })();
  }, [companyId]);

  const [folders, setFolders] = useState([]);
  const [selectedFolderId, setSelectedFolderId] = useState(''); // '' = none, '__unassigned__' = templates without folder
  const [templates, setTemplates] = useState([]);
  const [templateSearch, setTemplateSearch] = useState('');

  const [folderContextMenu, setFolderContextMenu] = useState(null);
  const [dragOverFolderId, setDragOverFolderId] = useState(null);
  const [draggingTemplate, setDraggingTemplate] = useState(null);

  const [templateContextMenu, setTemplateContextMenu] = useState(null);
  const [showEditTemplateModal, setShowEditTemplateModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [editTemplateTitle, setEditTemplateTitle] = useState('');
  const [editTemplateDescription, setEditTemplateDescription] = useState('');
  const [editTemplateVersion, setEditTemplateVersion] = useState('');
  const [savingEditTemplate, setSavingEditTemplate] = useState(false);

  const [showAddTemplateModal, setShowAddTemplateModal] = useState(false);
  const [newTemplateTitle, setNewTemplateTitle] = useState('');
  const [newTemplateDescription, setNewTemplateDescription] = useState('');
  const [newTemplateVersion, setNewTemplateVersion] = useState('1');
  const [savingTemplate, setSavingTemplate] = useState(false);

  const [newControlTypeName, setNewControlTypeName] = useState('');
  const [savingControlType, setSavingControlType] = useState(false);
  const [showAddModal, setShowAddModal] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(CONTROL_TYPE_ICON_CHOICES[0]?.icon || 'document-text-outline');
  const [selectedIconColor, setSelectedIconColor] = useState(CONTROL_TYPE_ICON_CHOICES[0]?.color || '#6A1B9A');
  
  // Edit control type states
  const [editingControlType, setEditingControlType] = useState(null);
  const [editControlTypeName, setEditControlTypeName] = useState('');
  const [editControlTypeIcon, setEditControlTypeIcon] = useState('');
  const [editControlTypeColor, setEditControlTypeColor] = useState('');
  const [savingEditControlType, setSavingEditControlType] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);

  // Loading and feedback states
  const [loadingFolders, setLoadingFolders] = useState(false);
  const [loadingTemplates, setLoadingTemplates] = useState(false);
  const [message, setMessage] = useState({ type: null, text: '' }); // 'success' | 'error' | null

  // Header is handled globally in App.js (web breadcrumb + logos).

  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        if (email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se') {
          if (mounted) {
            setAllowedTools(true);
            setCanSeeAllCompanies(true);
            setShowHeaderUserMenu(true);
          }
          return;
        }
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch(_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const companyFromClaims = String(claims?.companyId || '').trim();
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
        const cid = companyFromClaims || stored || '';
        const canSeeAll = isSuperClaim || isEmailSuperadmin || (cid === 'MS Byggsystem' && isAdminClaim);
        const allowHeader = isEmailSuperadmin || isSuperClaim || isAdminClaim;
        if (cid === 'MS Byggsystem' && isAdminClaim) {
          if (mounted) setAllowedTools(true);
        }
        if (mounted) {
          setCanSeeAllCompanies(!!canSeeAll);
          setShowHeaderUserMenu(!!allowHeader);
        }
      } catch(_e) {}
      if (mounted) {
        setAllowedTools(prev => prev);
        setCanSeeAllCompanies(prev => prev);
        setShowHeaderUserMenu(prev => prev);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Auto-select first company (or MS Byggsystem if available) for superadmins when no company is selected
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    let mounted = true;
    (async () => {
      try {
        // Only auto-select if user is superadmin and no company is selected
        if (!canSeeAllCompanies) return;
        const currentCompanyId = String(companyId || '').trim();
        if (currentCompanyId) return; // Already have a company selected

        // Fetch companies and auto-select MS Byggsystem if available, otherwise first company
        const companies = await fetchCompanies().catch(() => []);
        if (!mounted || !Array.isArray(companies) || companies.length === 0) return;

        // Prefer "MS Byggsystem" if it exists
        const msByggsystem = companies.find(c => c && String(c.id || '').trim() === 'MS Byggsystem');
        const selectedCompany = msByggsystem || companies[0];
        
        if (selectedCompany && selectedCompany.id) {
          setCompanyId(String(selectedCompany.id).trim());
        }
      } catch (_e) {}
    })();
    return () => { mounted = false; };
  }, [canSeeAllCompanies, companyId]);

  // Ladda kontrolltyper när valt företag ändras
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        if (mounted) {
          setSelectedControlType('');
          setFolders([]);
          setSelectedFolderId('');
          setTemplates([]);
          setTemplateSearch('');
        }
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
        if (mounted && Array.isArray(list) && list.length > 0) setControlTypes(list);
        else if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Resolve companyName for header
  useEffect(() => {
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid) {
          setCompanyName('');
          return;
        }
        const profile = await fetchCompanyProfile(cid).catch(() => null);
        const name = String(profile?.companyName || profile?.name || '').trim();
        setCompanyName(name || cid);
      } catch (_e) {
        setCompanyName(String(companyId || '').trim());
      }
    })();
  }, [companyId]);

  // Calculate control types for company (sorted)
  const controlTypesForCompany = useMemo(() => {
    const list = Array.isArray(controlTypes) ? controlTypes : [];
    return list
      .slice()
      .sort((a, b) => {
        const ao = typeof a.order === 'number' ? a.order : 9999;
        const bo = typeof b.order === 'number' ? b.order : 9999;
        if (ao !== bo) return ao - bo;
        const an = String(a.name || a.key || '').toLowerCase();
        const bn = String(b.name || b.key || '').toLowerCase();
        return an.localeCompare(bn, 'sv');
      });
  }, [controlTypes]);

  // Get selected control type object
  const selectedControlTypeObj = useMemo(() => {
    const ct = String(selectedControlType || '').trim();
    if (!ct) return null;
    return controlTypesForCompany.find((t) => String(t?.name || t?.key || '').trim() === ct) || null;
  }, [controlTypesForCompany, selectedControlType]);

  // Check if folders are enabled for the selected control type (default: false)
  const foldersEnabled = useMemo(() => {
    return !!selectedControlTypeObj?.foldersEnabled;
  }, [selectedControlTypeObj]);

  // Auto-select first control type when a company is chosen
  useEffect(() => {
    try {
      const cid = String(companyId || '').trim();
      if (!cid) return;
      if (String(selectedControlType || '').trim()) return;
      const list = Array.isArray(controlTypes) ? controlTypes : [];
      const firstActive = list.find((ct) => !!String(ct?.name || ct?.key || '').trim() && !ct.hidden);
      const fallback = list.find((ct) => !!String(ct?.name || ct?.key || '').trim());
      const label = String((firstActive || fallback)?.name || (firstActive || fallback)?.key || '').trim();
      if (label) setSelectedControlType(label);
    } catch (_e) {}
  }, [companyId, controlTypes, selectedControlType]);

  // Ladda mallar för företaget (vi filtrerar per kontrolltyp/mapp i UI)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        if (!companyId) {
          if (mounted) {
            setTemplates([]);
            setLoadingTemplates(false);
          }
          return;
        }
        if (mounted) setLoadingTemplates(true);
        const items = await fetchCompanyMallar(companyId);
        if (mounted) {
          setTemplates(Array.isArray(items) ? items : []);
          setLoadingTemplates(false);
        }
      } catch (_e) {
        if (mounted) {
          setTemplates([]);
          setLoadingTemplates(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Ladda mappar för vald kontrolltyp (endast om mappar är aktiverade)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        const ct = String(selectedControlType || '').trim();
        if (!cid || !ct || !foldersEnabled) {
          if (mounted) {
            setFolders([]);
            setSelectedFolderId('');
            setLoadingFolders(false);
          }
          return;
        }
        if (mounted) setLoadingFolders(true);
        const list = await fetchCompanyControlTypeFolders(cid, ct);
        if (mounted) {
          setFolders(Array.isArray(list) ? list : []);
          // Default folder selection: keep current if it exists, else pick first folder
          setSelectedFolderId((prev) => {
            const p = String(prev || '').trim();
            if (p && Array.isArray(list) && list.some(f => String(f?.id || '') === p)) return p;
            if (Array.isArray(list) && list.length > 0) return String(list[0].id);
            return '';
          });
          setLoadingFolders(false);
        }
      } catch (_e) {
        if (mounted) {
          setFolders([]);
          setSelectedFolderId('');
          setLoadingFolders(false);
        }
      }
    })();
    return () => { mounted = false; };
  }, [companyId, selectedControlType, foldersEnabled]);


  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = () => {
      try {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } catch (_e) {}
    };

    const handleRefresh = () => {
      (async () => {
        try {
          const cid = String(companyId || '').trim();
          if (!cid) return;

          // Control types
          try {
            const list = await fetchCompanyControlTypes(cid);
            setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
          } catch (_e) {
            setControlTypes(DEFAULT_CONTROL_TYPES);
          }

          // Company name
          try {
            const profile = await fetchCompanyProfile(cid).catch(() => null);
            const name = String(profile?.companyName || profile?.name || '').trim();
            setCompanyName(name || cid);
          } catch (_e) {
            setCompanyName(cid);
          }

          // Templates
          try {
            setLoadingTemplates(true);
            const items = await fetchCompanyMallar(cid);
            setTemplates(Array.isArray(items) ? items : []);
          } catch (_e) {
            setTemplates([]);
          } finally {
            setLoadingTemplates(false);
          }

          // Folders (only if enabled and a control type is selected)
          try {
            if (foldersEnabled && String(selectedControlType || '').trim()) {
              const ct = String(selectedControlType || '').trim();
              setLoadingFolders(true);
              const list = await fetchCompanyControlTypeFolders(cid, ct);
              setFolders(Array.isArray(list) ? list : []);
              setSelectedFolderId((prev) => {
                const p = String(prev || '').trim();
                if (p && Array.isArray(list) && list.some(f => String(f?.id || '') === p)) return p;
                if (Array.isArray(list) && list.length > 0) return String(list[0].id);
                return '';
              });
            } else {
              setFolders([]);
              setSelectedFolderId('');
            }
          } catch (_e) {
            setFolders([]);
            setSelectedFolderId('');
          } finally {
            setLoadingFolders(false);
          }
        } catch (_e) {}
      })();
    };

    window.addEventListener('dkGoHome', handler);
    window.addEventListener('dkRefresh', handleRefresh);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
      try { window.removeEventListener('dkRefresh', handleRefresh); } catch (_e) {}
    };
  }, [navigation, companyId, foldersEnabled, selectedControlType]);

  // Uppdatera listan om kontrolltyperna ändras via sidomenyn (t.ex. byt namn/dölj/radera)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      try {
        const cid = String(event?.detail?.companyId || '').trim();
        const current = String(companyId || '').trim();
        if (!cid || !current || cid !== current) return;
      } catch (_e) {
        return;
      }

      (async () => {
        try {
          const list = await fetchCompanyControlTypes(companyId);
          setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
        } catch (_e) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      })();
    };

    window.addEventListener('dkControlTypesUpdated', handler);
    return () => {
      try { window.removeEventListener('dkControlTypesUpdated', handler); } catch (_e) {}
    };
  }, [companyId]);

  if (Platform.OS === 'web') {
    const isSmallScreen = windowWidth < 1200;
    const dashboardContainerStyle = { width: '100%', maxWidth: 1180, alignSelf: 'center' };
    const dashboardCardStyle = { borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' };

    const RootContainer = ImageBackground;
    const rootProps = {
      source: require('../assets/images/inlogg.webb.png'),
      resizeMode: 'cover',
      imageStyle: { width: '100%', height: '100%' },
    };

    const hasSelectedCompany = !!String(companyId || '').trim();
    const sidebarRestrictId = canSeeAllCompanies ? null : companyId;

  // Clear selected folder when folders are disabled
  useEffect(() => {
    if (!foldersEnabled && selectedFolderId) {
      setSelectedFolderId('');
    }
  }, [foldersEnabled, selectedFolderId]);

    const templatesForSelectedType = useMemo(() => {
      const ct = String(selectedControlType || '').trim();
      if (!ct) return [];
      const list = Array.isArray(templates) ? templates : [];
      return list.filter((t) => String(t?.controlType || '').trim() === ct);
    }, [templates, selectedControlType]);

    const folderCounts = useMemo(() => {
      const counts = new Map();
      templatesForSelectedType.forEach((t) => {
        const fid = String(t?.folderId || '').trim();
        const key = fid || '__unassigned__';
        counts.set(key, (counts.get(key) || 0) + 1);
      });
      return counts;
    }, [templatesForSelectedType]);

    const selectedFolderName = useMemo(() => {
      const fid = String(selectedFolderId || '').trim();
      if (!fid) return '';
      if (fid === '__unassigned__') return 'Utan mapp';
      const f = (Array.isArray(folders) ? folders : []).find(x => String(x?.id || '') === fid);
      return String(f?.name || '').trim();
    }, [folders, selectedFolderId]);

    const templatesForSelectedFolder = useMemo(() => {
      // If folders are disabled, show all templates regardless of folder
      if (!foldersEnabled) {
        let list = templatesForSelectedType;
        const q = String(templateSearch || '').trim().toLowerCase();
        if (q) {
          list = list.filter((t) => {
            const title = String(t?.title || '').toLowerCase();
            const author = String((t?.createdBy && (t.createdBy.displayName || t.createdBy.email)) || '').toLowerCase();
            return title.includes(q) || author.includes(q);
          });
        }
        // Sort by updatedAt/createdAt desc if present, else title
        return list.slice().sort((a, b) => {
          const at = a?.updatedAt?.seconds || a?.createdAt?.seconds || 0;
          const bt = b?.updatedAt?.seconds || b?.createdAt?.seconds || 0;
          if (at !== bt) return bt - at;
          return String(a?.title || '').localeCompare(String(b?.title || ''), 'sv');
        });
      }
      
      // Folders enabled - filter by selected folder
      const fid = String(selectedFolderId || '').trim();
      let list = templatesForSelectedType;
      if (!fid) {
        // No folder selected, show all templates without folder
        list = list.filter((t) => !String(t?.folderId || '').trim());
      } else {
        list = list.filter((t) => String(t?.folderId || '').trim() === fid);
      }
      const q = String(templateSearch || '').trim().toLowerCase();
      if (q) {
        list = list.filter((t) => {
          const title = String(t?.title || '').toLowerCase();
          const author = String((t?.createdBy && (t.createdBy.displayName || t.createdBy.email)) || '').toLowerCase();
          return title.includes(q) || author.includes(q);
        });
      }
      // Sort by updatedAt/createdAt desc if present, else title
      return list.slice().sort((a, b) => {
        const at = a?.updatedAt?.seconds || a?.createdAt?.seconds || 0;
        const bt = b?.updatedAt?.seconds || b?.createdAt?.seconds || 0;
        if (at !== bt) return bt - at;
        return String(a?.title || '').localeCompare(String(b?.title || ''), 'sv');
      });
    }, [templatesForSelectedType, selectedFolderId, templateSearch, foldersEnabled]);

    const performMoveTemplateToFolder = async ({ templateId, nextFolderId, nextFolderName }) => {
      const cid = String(companyId || '').trim();
      if (!cid) return;
      const tid = String(templateId || '').trim();
      if (!tid) return;

      try {
        await updateCompanyMall(
          {
            id: tid,
            patch: {
              folderId: nextFolderId || null,
              folderName: nextFolderName || null,
            },
          },
          cid
        );
        setTemplates((prev) => (Array.isArray(prev) ? prev.map((t) => (String(t?.id || '') === tid
          ? { ...t, folderId: nextFolderId || null, folderName: nextFolderName || null }
          : t)) : prev));
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: cid } }));
          }
        } catch (_e) {}
      } catch (e) {
        try {
          if (typeof window !== 'undefined' && window.alert) window.alert(String(e?.message || e));
        } catch (_e) {}
      }
    };

    const openAddTemplateModal = () => {
      try {
        if (!String(companyId || '').trim()) return;
        if (!String(selectedControlType || '').trim()) return;
        setNewTemplateTitle('');
        setNewTemplateDescription('');
        setNewTemplateVersion('1');
        setShowAddTemplateModal(true);
      } catch (_e) {}
    };

    const handleCreateTemplateHere = async () => {
      const cid = String(companyId || '').trim();
      const ct = String(selectedControlType || '').trim();
      if (!cid) return;
      if (!ct) return;

      const title = String(newTemplateTitle || '').trim();
      if (!title) {
        try {
          if (typeof window !== 'undefined' && window.alert) window.alert('Ange en titel för mallen.');
        } catch (_e) {}
        return;
      }

      // Allow versions with dots (e.g. 1.0.0). Store as text.
      let rawVersion = String(newTemplateVersion || '').trim();
      if (!rawVersion) rawVersion = '1';
      if (/^[vV]/.test(rawVersion)) {
        rawVersion = rawVersion.slice(1).trim();
        if (!rawVersion) rawVersion = '1';
      }
      const effectiveVersion = rawVersion;

      const fid = String(selectedFolderId || '').trim();
      const folderPayload = fid && fid !== '__unassigned__'
        ? { folderId: fid, folderName: selectedFolderName || null }
        : { folderId: null, folderName: null };

      const defaultLayout = {
        version: 1,
        metaFields: {
          project: { enabled: true, label: 'Projekt' },
          date: { enabled: true, label: 'Datum' },
          weather: { enabled: false, label: 'Väder' },
          location: { enabled: false, label: 'Plats/arbetsplats' },
          responsible: { enabled: true, label: 'Ansvarig person' },
          participants: { enabled: false, label: 'Deltagare' },
          subcontractor: { enabled: false, label: 'Entreprenör/underentreprenör' },
          projectPart: { enabled: false, label: 'Projekt/delmoment' },
          notes: { enabled: true, label: 'Övriga anteckningar' },
        },
        sections: [
          { id: 'section-1', title: 'Kontrollpunkter', fields: [] },
        ],
        signatures: {
          responsible: { enabled: true, label: 'Signatur ansvarig' },
          client: { enabled: false, label: 'Signatur beställare' },
          inspector: { enabled: false, label: 'Signatur kontrollant' },
        },
      };

      try {
        setSavingTemplate(true);
        await createCompanyMall(
          {
            title,
            description: String(newTemplateDescription || '').trim(),
            controlType: ct,
            ...folderPayload,
            layout: defaultLayout,
            version: effectiveVersion,
          },
          cid
        );

        const items = await fetchCompanyMallar(cid);
        setTemplates(Array.isArray(items) ? items : []);
        setShowAddTemplateModal(false);
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: cid } }));
          }
        } catch (_e) {}
      } catch (e) {
        try {
          if (typeof window !== 'undefined' && window.alert) window.alert(String(e?.message || e));
        } catch (_e) {}
      } finally {
        setSavingTemplate(false);
      }
    };

    const openFolderContextMenu = ({ e, folder }) => {
      try {
        const x = (e && (e.clientX || (e.nativeEvent && e.nativeEvent.clientX))) || 0;
        const y = (e && (e.clientY || (e.nativeEvent && e.nativeEvent.clientY))) || 0;
        setFolderContextMenu({ x, y, folder });
      } catch (_e) {
        setFolderContextMenu({ x: 0, y: 0, folder });
      }
    };

    const openTemplateEditor = (tpl) => {
      try {
        if (!tpl) return;
        setEditingTemplate(tpl);
        setEditTemplateTitle(String(tpl?.title || ''));
        setEditTemplateDescription(String(tpl?.description || ''));
        setEditTemplateVersion(String(tpl?.version || '1'));
        setShowEditTemplateModal(true);
      } catch (_e) {}
    };

    const openTemplateContextMenu = ({ e, template }) => {
      try {
        const x = (e && (e.clientX || (e.nativeEvent && e.nativeEvent.clientX))) || 0;
        const y = (e && (e.clientY || (e.nativeEvent && e.nativeEvent.clientY))) || 0;
        setTemplateContextMenu({ x, y, template });
      } catch (_e) {
        setTemplateContextMenu({ x: 0, y: 0, template });
      }
    };

    const toggleTemplateHidden = async (tpl) => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid || !tpl?.id) return;
        const nextHidden = !tpl.hidden;
        await updateCompanyMall({ id: tpl.id, patch: { hidden: nextHidden } }, cid);
        setTemplates((prev) => (Array.isArray(prev) ? prev.map((t) => (String(t?.id || '') === String(tpl.id) ? { ...t, hidden: nextHidden } : t)) : prev));
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: cid } }));
          }
        } catch (_e) {}
      } catch (e) {
        try { if (typeof window !== 'undefined' && window.alert) window.alert(String(e?.message || e)); } catch (_e) {}
      }
    };

    const deleteTemplate = async (tpl) => {
      try {
        const cid = String(companyId || '').trim();
        if (!cid || !tpl?.id) return;
        const ok = (typeof window !== 'undefined' && window.confirm)
          ? window.confirm('Är du säker på att du vill radera den här mallen?')
          : false;
        if (!ok) return;
        await deleteCompanyMall({ id: tpl.id }, cid);
        const items = await fetchCompanyMallar(cid);
        setTemplates(Array.isArray(items) ? items : []);
        setMessage({ type: 'success', text: `Mallen "${tpl.title || 'Namnlös'}" har raderats.` });
        setTimeout(() => setMessage({ type: null, text: '' }), 3000);
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: cid } }));
          }
        } catch (_e) {}
      } catch (e) {
        const errorMsg = String(e?.message || e || 'Ett fel uppstod');
        setMessage({ type: 'error', text: `Kunde inte radera mallen: ${errorMsg}` });
        setTimeout(() => setMessage({ type: null, text: '' }), 5000);
        try { if (typeof window !== 'undefined' && window.alert) window.alert(errorMsg); } catch (_e) {}
      }
    };

    const renameFolder = async (folder) => {
      try {
        const cid = String(companyId || '').trim();
        const ct = String(selectedControlType || '').trim();
        const folderId = String(folder?.id || '').trim();
        const currentName = String(folder?.name || '').trim();
        if (!cid || !ct || !folderId) return;
        const raw = (typeof window !== 'undefined' && window.prompt)
          ? window.prompt('Nytt namn på mapp', currentName)
          : '';
        const nextName = String(raw || '').trim();
        if (!nextName || nextName === currentName) return;

        await updateCompanyControlTypeFolder({ id: folderId, patch: { name: nextName } }, cid);
        setFolders((prev) => (Array.isArray(prev) ? prev.map((f) => (String(f?.id || '') === folderId ? { ...f, name: nextName } : f)) : prev));

        // Update folderName on templates (best-effort)
        const affected = templatesForSelectedType.filter((t) => String(t?.folderId || '').trim() === folderId);
        if (affected.length > 0) {
          const batchSize = 25;
          for (let i = 0; i < affected.length; i += batchSize) {
            const batch = affected.slice(i, i + batchSize);
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(batch.map((t) => updateCompanyMall({ id: t.id, patch: { folderName: nextName } }, cid).catch(() => null)));
          }
          setTemplates((prev) => (Array.isArray(prev) ? prev.map((t) => (
            String(t?.folderId || '').trim() === folderId ? { ...t, folderName: nextName } : t
          )) : prev));
        }
      } catch (_e) {}
    };

    const deleteFolder = async (folder) => {
      try {
        const cid = String(companyId || '').trim();
        const ct = String(selectedControlType || '').trim();
        const folderId = String(folder?.id || '').trim();
        const name = String(folder?.name || '').trim() || 'Namnlös mapp';
        if (!cid || !ct || !folderId) return;

        const affected = templatesForSelectedType.filter((t) => String(t?.folderId || '').trim() === folderId);
        const msg = affected.length > 0
          ? `Radera mappen "${name}"?\n\n${affected.length} mall(ar) i mappen flyttas till "Utan mapp".`
          : `Radera mappen "${name}"?`;
        const ok = (typeof window !== 'undefined' && window.confirm) ? window.confirm(msg) : false;
        if (!ok) return;

        // Move templates out first (so we don't leave dangling folderId)
        if (affected.length > 0) {
          const batchSize = 25;
          for (let i = 0; i < affected.length; i += batchSize) {
            const batch = affected.slice(i, i + batchSize);
            // eslint-disable-next-line no-await-in-loop
            await Promise.all(batch.map((t) => updateCompanyMall({ id: t.id, patch: { folderId: null, folderName: null } }, cid).catch(() => null)));
          }
          setTemplates((prev) => (Array.isArray(prev) ? prev.map((t) => (
            String(t?.folderId || '').trim() === folderId ? { ...t, folderId: null, folderName: null } : t
          )) : prev));
        }

        await deleteCompanyControlTypeFolder({ id: folderId }, cid);
        const folderName = folders.find(f => String(f?.id || '') === folderId)?.name || 'Mappen';
        setFolders((prev) => (Array.isArray(prev) ? prev.filter((f) => String(f?.id || '') !== folderId) : prev));
        setSelectedFolderId((prev) => (String(prev || '').trim() === folderId ? '__unassigned__' : prev));
        setMessage({ type: 'success', text: `${folderName} har raderats.` });
        setTimeout(() => setMessage({ type: null, text: '' }), 3000);
      } catch (e) {
        const errorMsg = String(e?.message || e || 'Ett fel uppstod');
        setMessage({ type: 'error', text: `Kunde inte radera mappen: ${errorMsg}` });
        setTimeout(() => setMessage({ type: null, text: '' }), 5000);
      }
    };

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%' }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          adminMode={true}
          adminCurrentScreen="manage_control_types"
          adminOnSelectCompany={async (payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();
              if (cid) setCompanyId(cid);
              if (payload?.controlType) {
                setSelectedControlType(String(payload.controlType || '').trim());
                setTemplateSearch('');
              }
              if (payload?.createControlType && cid) {
                setNewControlTypeName('');
                const baseIcon = CONTROL_TYPE_ICON_CHOICES[0]?.icon || 'document-text-outline';
                const baseColor = CONTROL_TYPE_ICON_CHOICES[0]?.color || '#6A1B9A';
                setSelectedIcon(baseIcon);
                setSelectedIconColor(baseColor);
                setShowAddModal(true);
              }
            } catch (_e) {}
          }}
          adminShowCompanySelector={canSeeAllCompanies}
          sidebarSelectedCompanyId={companyId}
          topBar={
            <View
              style={{
                height: 96,
                paddingLeft: 24,
                paddingRight: 24,
                backgroundColor: 'rgba(25, 118, 210, 0.2)',
                justifyContent: 'center',
                borderBottomWidth: 1,
                borderColor: 'rgba(25, 118, 210, 0.3)',
                borderLeftWidth: 4,
                borderLeftColor: '#1976D2',
              }}
            >
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                  <View style={{ marginRight: 10 }}>
                    {showHeaderUserMenu ? <HeaderUserMenuConditional /> : <HeaderDisplayName />}
                  </View>
                  <View style={{ marginRight: 10 }}>
                    <HeaderAdminMenu />
                  </View>
                  {allowedTools ? (
                    <TouchableOpacity
                      style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                      onPress={() => setSupportMenuOpen(s => !s)}
                    >
                      <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
                <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }} />
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 1040, maxWidth: '100%' }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                  {Platform.OS !== 'web' ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                      <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(_e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                        <Ionicons name="chevron-back" size={20} color="#222" />
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                          <Ionicons name="options-outline" size={14} color="#fff" />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '500', color: '#222' }} numberOfLines={1} ellipsizeMode="tail">Kontrolltyper</Text>
                      </View>
                    </View>
                  ) : null}
                </View>
              </View>

              {!hasSelectedCompany ? (
                <View style={{
                  paddingVertical: 10,
                  paddingHorizontal: 12,
                  borderRadius: 10,
                  backgroundColor: '#FFF8E1',
                  borderWidth: 1,
                  borderColor: '#FFE082',
                }}>
                  <Text style={{ fontSize: 13, color: '#5D4037' }}>
                    Välj ett företag i listan till vänster för att hantera kontrolltyper, mappar och mallar.
                  </Text>
                </View>
              ) : (
                <View style={{ position: 'relative' }}>
                  {/* Dimmed overlay for superadmins when no company is selected */}
                  {canSeeAllCompanies && !hasSelectedCompany && (
                    <View style={{
                      position: 'absolute',
                      top: 0,
                      left: 0,
                      right: 0,
                      bottom: 0,
                      backgroundColor: 'rgba(255, 255, 255, 0.7)',
                      zIndex: 100,
                      alignItems: 'center',
                      justifyContent: 'center',
                      pointerEvents: 'auto',
                    }}>
                      <View style={{
                        backgroundColor: '#fff',
                        padding: 24,
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#E6E8EC',
                        alignItems: 'center',
                        maxWidth: 400,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 4 },
                        shadowOpacity: 0.1,
                        shadowRadius: 12,
                        elevation: 8,
                      }}>
                        <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                          <Ionicons name="business-outline" size={32} color="#1976D2" />
                        </View>
                        <Text style={{ color: '#475569', fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
                          Välj ett företag
                        </Text>
                        <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                          Välj ett företag i listan till vänster för att hantera kontrolltyper, mappar och mallar.
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Message banner */}
                  {message.type && (
                    <View style={{
                      padding: 12,
                      borderRadius: 10,
                      marginBottom: 12,
                      backgroundColor: message.type === 'success' ? '#E8F5E9' : '#FFEBEE',
                      borderWidth: 1,
                      borderColor: message.type === 'success' ? '#C8E6C9' : '#FFCDD2',
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                    }}>
                      <Ionicons 
                        name={message.type === 'success' ? 'checkmark-circle' : 'alert-circle'} 
                        size={20} 
                        color={message.type === 'success' ? '#2E7D32' : '#C62828'} 
                      />
                      <Text style={{ 
                        flex: 1, 
                        fontSize: 13, 
                        color: message.type === 'success' ? '#2E7D32' : '#C62828',
                        fontWeight: '500'
                      }}>
                        {message.text}
                      </Text>
                      <TouchableOpacity onPress={() => setMessage({ type: null, text: '' })}>
                        <Ionicons name="close" size={18} color={message.type === 'success' ? '#2E7D32' : '#C62828'} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {/* Breadcrumb - matching ContactRegistry style */}
                  {companyName && (
                    <View style={{ padding: 18, backgroundColor: '#F8FAFC', borderBottomWidth: 1, borderBottomColor: '#E6E8EC', marginBottom: 20 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 15, fontWeight: '500', color: '#666' }}>{companyName}</Text>
                        <Ionicons name="chevron-forward" size={14} color="#999" />
                        <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center' }}>
                          <Ionicons name="options-outline" size={20} color="#1976D2" />
                        </View>
                        <Text style={{ fontSize: 15, fontWeight: '700', color: '#111' }}>Kontrolltyper</Text>
                      </View>
                    </View>
                  )}

                  <View style={{ 
                    borderWidth: 1, 
                    borderColor: '#E6E8EC', 
                    borderRadius: 12, 
                    overflow: 'hidden', 
                    flexDirection: isSmallScreen ? 'column' : 'row', 
                    minHeight: 520,
                    position: 'relative',
                    opacity: canSeeAllCompanies && !hasSelectedCompany ? 0.5 : 1,
                  }}>
                    {/* Dimmed overlay for superadmins when no company is selected */}
                    {canSeeAllCompanies && !hasSelectedCompany && (
                      <View style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        right: 0,
                        bottom: 0,
                        backgroundColor: 'rgba(255, 255, 255, 0.8)',
                        zIndex: 100,
                        alignItems: 'center',
                        justifyContent: 'center',
                        pointerEvents: 'auto',
                      }}>
                        <View style={{
                          backgroundColor: '#fff',
                          padding: 24,
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: '#E6E8EC',
                          alignItems: 'center',
                          maxWidth: 400,
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.1,
                          shadowRadius: 12,
                          elevation: 8,
                        }}>
                          <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                            <Ionicons name="business-outline" size={32} color="#1976D2" />
                          </View>
                          <Text style={{ color: '#475569', fontSize: 16, fontWeight: '600', marginBottom: 8, textAlign: 'center' }}>
                            Välj ett företag
                          </Text>
                          <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                            Välj ett företag i listan till vänster för att hantera kontrolltyper, mappar och mallar.
                          </Text>
                        </View>
                      </View>
                    )}
                    {/* Column 1: Kontrolltyper */}
                    <View style={{ 
                      width: isSmallScreen ? '100%' : 300, 
                      backgroundColor: '#F9FAFB', 
                      borderRightWidth: isSmallScreen ? 0 : 1, 
                      borderBottomWidth: isSmallScreen ? 1 : 0,
                      borderRightColor: '#E6E8EC',
                      borderBottomColor: '#E6E8EC',
                    }}>
                      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <View style={{ width: 20, height: 20, borderRadius: 6, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center' }}>
                              <Ionicons name="options-outline" size={12} color="#fff" />
                            </View>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: '#111' }}>Kontrolltyper</Text>
                          </View>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{`Antal: ${controlTypesForCompany.length}`}</Text>
                        </View>
                        <TouchableOpacity
                          disabled={!hasSelectedCompany}
                          onPress={() => {
                            if (!hasSelectedCompany) return;
                            try {
                              setNewControlTypeName('');
                              const baseIcon = CONTROL_TYPE_ICON_CHOICES[0]?.icon || 'document-text-outline';
                              const baseColor = CONTROL_TYPE_ICON_CHOICES[0]?.color || '#6A1B9A';
                              setSelectedIcon(baseIcon);
                              setSelectedIconColor(baseColor);
                              setShowAddModal(true);
                            } catch (_e) {}
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            backgroundColor: hasSelectedCompany ? '#1976D2' : '#B0BEC5',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Lägg till</Text>
                        </TouchableOpacity>
                      </View>
                      <View style={{ padding: 10 }}>
                        {controlTypesForCompany.map((ct) => {
                          const label = String(ct?.name || ct?.key || '').trim();
                          if (!label) return null;
                          const isHidden = !!ct.hidden;
                          const isSelected = String(selectedControlType || '').trim() === label;
                          return (
                            <TouchableOpacity
                              key={label}
                              onPress={() => {
                                setSelectedControlType(label);
                                setTemplateSearch('');
                              }}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 10,
                                backgroundColor: isSelected ? '#E3F2FD' : '#fff',
                                borderWidth: 1,
                                borderColor: isSelected ? '#1976D2' : '#E6E8EC',
                                marginBottom: 8,
                                flexDirection: 'row',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: 10,
                                opacity: isHidden ? 0.55 : 1,
                                ...(Platform.OS === 'web' ? {
                                  transition: 'all 0.2s ease',
                                  cursor: 'pointer',
                                } : {}),
                              }}
                              onMouseEnter={(e) => {
                                if (Platform.OS === 'web' && !isSelected) {
                                  e.currentTarget.style.backgroundColor = '#F5F5F5';
                                  e.currentTarget.style.borderColor = '#D1D5DB';
                                }
                              }}
                              onMouseLeave={(e) => {
                                if (Platform.OS === 'web' && !isSelected) {
                                  e.currentTarget.style.backgroundColor = '#fff';
                                  e.currentTarget.style.borderColor = '#E6E8EC';
                                }
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                <Ionicons name={ct.icon || 'options-outline'} size={16} color={ct.color || '#6A1B9A'} />
                                <Text style={{ fontSize: 13, fontWeight: '500', color: '#222', flex: 1 }} numberOfLines={1}>{label}</Text>
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: isHidden ? '#FFEBEE' : '#E8F5E9', borderWidth: 1, borderColor: isHidden ? '#FFCDD2' : '#C8E6C9' }}>
                                  <Text style={{ fontSize: 11, fontWeight: '500', color: isHidden ? '#C62828' : '#2E7D32' }}>{isHidden ? 'Inaktiv' : 'Aktiv'}</Text>
                              </View>
                                <TouchableOpacity
                                  onPress={(e) => {
                                    e.stopPropagation();
                                    setEditingControlType(ct);
                                    setEditControlTypeName(ct.name || ct.key || '');
                                    setEditControlTypeIcon(ct.icon || 'options-outline');
                                    setEditControlTypeColor(ct.color || '#6A1B9A');
                                    setShowEditModal(true);
                                  }}
                                  style={{ padding: 4 }}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="create-outline" size={16} color="#1976D2" />
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={async (e) => {
                                    e.stopPropagation();
                                    const cid = String(companyId || '').trim();
                                    if (!cid) {
                                      Alert.alert('Fel', 'Inget företag är valt.');
                                      return;
                                    }
                                    
                                    const isBuiltin = !!ct.builtin;
                                    const ctId = String(ct.id || '').trim();
                                    const ctKey = String(ct.key || '').trim();
                                    const ctName = String(ct.name || ct.key || '').trim();
                                    
                                    const confirmMsg = isBuiltin
                                      ? `Dölja kontrolltypen "${ctName}"?\n\nInbyggda kontrolltyper kan inte raderas, men kan döljas för detta företag.`
                                      : `Radera kontrolltypen "${ctName}"?\n\nDetta går inte att ångra.`;
                                    
                                    const confirmed = (typeof window !== 'undefined' && window.confirm) 
                                      ? window.confirm(confirmMsg)
                                      : await new Promise((resolve) => {
                                          Alert.alert(
                                            isBuiltin ? 'Dölj kontrolltyp' : 'Radera kontrolltyp',
                                            confirmMsg,
                                            [
                                              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
                                              { text: isBuiltin ? 'Dölj' : 'Radera', style: 'destructive', onPress: () => resolve(true) },
                                            ]
                                          );
                                        });
                                    
                                    if (!confirmed) return;
                                    
                                    try {
                                      if (isBuiltin || !ctId) {
                                        // För inbyggda kontrolltyper, dölj dem istället för att radera
                                        await updateCompanyControlType({ key: ctKey || ctName, hidden: true }, cid);
                                        setMessage({ type: 'success', text: `Kontrolltypen "${ctName}" har döljts.` });
                                      } else {
                                        await deleteCompanyControlType({ id: ctId }, cid);
                                        setMessage({ type: 'success', text: `Kontrolltypen "${ctName}" har raderats.` });
                                      }
                                      
                                      // Refresh control types list
                                      const list = await fetchCompanyControlTypes(cid);
                                      setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                                      
                                      // If deleted control type was selected, clear selection
                                      if (String(selectedControlType || '').trim() === label) {
                                        setSelectedControlType('');
                                      }
                                      
                                      // Trigger update event for sidebar
                                      if (typeof window !== 'undefined') {
                                        window.dispatchEvent(new CustomEvent('dkControlTypesUpdated', { detail: { companyId: cid } }));
                                      }
                                      
                                      setTimeout(() => setMessage({ type: null, text: '' }), 3000);
                                    } catch (e) {
                                      const errorMsg = String(e?.message || e || 'Ett fel uppstod');
                                      Alert.alert('Fel', `Kunde inte ${isBuiltin ? 'dölja' : 'radera'} kontrolltypen: ${errorMsg}`);
                                      setMessage({ type: 'error', text: `Kunde inte ${isBuiltin ? 'dölja' : 'radera'} kontrolltypen: ${errorMsg}` });
                                      setTimeout(() => setMessage({ type: null, text: '' }), 5000);
                                    }
                                  }}
                                  style={{ padding: 4 }}
                                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                >
                                  <Ionicons name="trash-outline" size={16} color="#D32F2F" />
                                </TouchableOpacity>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Column 2: Mappar */}
                    {selectedControlType && (
                      <View style={{ 
                        width: isSmallScreen ? '100%' : 320, 
                        backgroundColor: '#fff', 
                        borderRightWidth: isSmallScreen ? 0 : 1, 
                        borderBottomWidth: isSmallScreen ? 1 : 0,
                        borderRightColor: '#E6E8EC',
                        borderBottomColor: '#E6E8EC',
                      }}>
                        {/* Breadcrumb */}
                        {selectedControlType && (
                          <View style={{ padding: 12, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                              <Text style={{ fontSize: 13, color: '#666' }}>Kontrolltyper</Text>
                              <Ionicons name="chevron-forward" size={14} color="#999" />
                              <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                                {selectedControlType}
                              </Text>
                            </View>
                          </View>
                        )}
                        
                        <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <Text style={{ fontSize: 14, fontWeight: '500', color: '#111' }}>Mappar</Text>
                            <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{`Antal: ${Array.isArray(folders) ? folders.length : 0}`}</Text>
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                            <TouchableOpacity
                              onPress={async () => {
                                if (!selectedControlType || !companyId) {
                                  Alert.alert('Fel', 'Välj en kontrolltyp och företag först.');
                                  return;
                                }
                                const cid = String(companyId || '').trim();
                                const ct = String(selectedControlType || '').trim();
                                const ctObj = selectedControlTypeObj;
                                const newFoldersEnabled = !foldersEnabled;
                                
                                try {
                                  const ctId = String(ctObj?.id || '').trim();
                                  const ctKey = String(ctObj?.key || '').trim();
                                  
                                  let updated = false;
                                  if (ctId) {
                                    await updateCompanyControlType({ id: ctId, foldersEnabled: newFoldersEnabled }, cid);
                                    updated = true;
                                  } else if (ctKey) {
                                    await updateCompanyControlType({ key: ctKey, foldersEnabled: newFoldersEnabled }, cid);
                                    updated = true;
                                  } else if (ct) {
                                    // Fallback: use the control type name/key directly
                                    await updateCompanyControlType({ key: ct, foldersEnabled: newFoldersEnabled }, cid);
                                    updated = true;
                                  }
                                  
                                  if (!updated) {
                                    throw new Error('Kunde inte hitta kontrolltyp att uppdatera');
                                  }
                                  
                                  // Refresh control types to get updated data
                                  const list = await fetchCompanyControlTypes(cid);
                                  setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                                  
                                  // If disabling folders, clear selected folder
                                  if (!newFoldersEnabled) {
                                    setSelectedFolderId('');
                                  }
                                  
                                  // Show success message
                                  setMessage({ 
                                    type: 'success', 
                                    text: `Mappar har ${newFoldersEnabled ? 'aktiverats' : 'inaktiverats'}.` 
                                  });
                                  setTimeout(() => setMessage({ type: null, text: '' }), 3000);
                                  
                                  // Trigger update event
                                  if (typeof window !== 'undefined') {
                                    window.dispatchEvent(new CustomEvent('dkControlTypesUpdated', { detail: { companyId: cid } }));
                                  }
                                } catch (e) {
                                  console.error('Error updating foldersEnabled:', e);
                                  const errorMsg = String(e?.message || e || 'Ett fel uppstod');
                                  Alert.alert('Fel', `Kunde inte uppdatera inställningen: ${errorMsg}`);
                                }
                              }}
                              disabled={!selectedControlType || !companyId}
                              style={{
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 8,
                                paddingVertical: 4,
                                paddingHorizontal: 8,
                                borderRadius: 6,
                                backgroundColor: foldersEnabled ? '#E8F5E9' : '#F5F5F5',
                                borderWidth: 1,
                                borderColor: foldersEnabled ? '#C8E6C9' : '#E0E0E0',
                                opacity: (!selectedControlType || !companyId) ? 0.5 : 1,
                                ...(Platform.OS === 'web' ? {
                                  cursor: (!selectedControlType || !companyId) ? 'not-allowed' : 'pointer',
                                } : {}),
                              }}
                            >
                              <View style={{
                                width: 36,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: foldersEnabled ? '#4CAF50' : '#BDBDBD',
                                alignItems: foldersEnabled ? 'flex-end' : 'flex-start',
                                justifyContent: 'center',
                                padding: 2,
                              }}>
                                <View style={{
                                  width: 16,
                                  height: 16,
                                  borderRadius: 8,
                                  backgroundColor: '#fff',
                                }} />
                              </View>
                              <Text style={{ fontSize: 12, color: foldersEnabled ? '#2E7D32' : '#757575', fontWeight: '500' }}>
                                {foldersEnabled ? 'Aktiverat' : 'Inaktiverat'}
                              </Text>
                            </TouchableOpacity>
                          </View>
                          {foldersEnabled && (
                            <TouchableOpacity
                              disabled={loadingFolders || !selectedControlType}
                              onPress={async () => {
                                if (!selectedControlType) return;
                                try {
                                  const raw = (typeof window !== 'undefined' && window.prompt)
                                    ? window.prompt('Namn på ny mapp', '')
                                    : '';
                                  const name = String(raw || '').trim();
                                  if (!name) return;
                                  setLoadingFolders(true);
                                  const created = await createCompanyControlTypeFolder({ controlType: selectedControlType, name }, companyId);
                                  const list = await fetchCompanyControlTypeFolders(companyId, selectedControlType);
                                  setFolders(Array.isArray(list) ? list : []);
                                  if (created && created.id) setSelectedFolderId(String(created.id));
                                  setMessage({ type: 'success', text: `Mappen "${name}" har skapats.` });
                                  setTimeout(() => setMessage({ type: null, text: '' }), 3000);
                                  setLoadingFolders(false);
                                } catch (e) {
                                  setLoadingFolders(false);
                                  const errorMsg = String(e?.message || e || 'Ett fel uppstod');
                                  setMessage({ type: 'error', text: `Kunde inte skapa mappen: ${errorMsg}` });
                                  setTimeout(() => setMessage({ type: null, text: '' }), 5000);
                                }
                              }}
                              style={{
                                paddingVertical: 8,
                                paddingHorizontal: 10,
                                borderRadius: 10,
                                backgroundColor: (loadingFolders || !selectedControlType) ? '#B0BEC5' : '#1976D2',
                                flexDirection: 'row',
                                alignItems: 'center',
                                gap: 6,
                              }}
                            >
                              <Ionicons name="add" size={16} color="#fff" />
                              <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Lägg till</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                        
                        {foldersEnabled && (
                          <>
                            
                            <View style={{ padding: 10 }}>
                              {loadingFolders ? (
                                <View style={{ padding: 24, alignItems: 'center' }}>
                                  <ActivityIndicator size="small" color="#1976D2" />
                                  <Text style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Laddar mappar...</Text>
                                </View>
                              ) : (Array.isArray(folders) ? folders : []).length === 0 ? (
                                <View style={{ 
                                  padding: 24, 
                                  alignItems: 'center', 
                                  backgroundColor: '#F8FAFC', 
                                  borderRadius: 12, 
                                  borderWidth: 1, 
                                  borderColor: '#E6E8EC',
                                  marginTop: 8
                                }}>
                                  <View style={{ width: 56, height: 56, borderRadius: 14, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                                    <Ionicons name="folder-outline" size={28} color="#1976D2" />
                                  </View>
                                  <Text style={{ color: '#475569', fontSize: 14, fontWeight: '600', marginBottom: 4, textAlign: 'center' }}>
                                    Inga mappar ännu
                                  </Text>
                                  <Text style={{ color: '#94A3B8', fontSize: 12, textAlign: 'center', marginBottom: 12 }}>
                                    Skapa mappar för att organisera dina mallar.
                                  </Text>
                                  <TouchableOpacity
                                    onPress={async () => {
                                      try {
                                        const raw = (typeof window !== 'undefined' && window.prompt)
                                          ? window.prompt('Namn på ny mapp', '')
                                          : '';
                                        const name = String(raw || '').trim();
                                        if (!name) return;
                                        const created = await createCompanyControlTypeFolder({ controlType: selectedControlType, name }, companyId);
                                        const list = await fetchCompanyControlTypeFolders(companyId, selectedControlType);
                                        setFolders(Array.isArray(list) ? list : []);
                                        if (created && created.id) setSelectedFolderId(String(created.id));
                                      } catch (_e) {}
                                    }}
                                    style={{ 
                                      backgroundColor: '#1976D2', 
                                      paddingVertical: 8, 
                                      paddingHorizontal: 14, 
                                      borderRadius: 10, 
                                      flexDirection: 'row', 
                                      alignItems: 'center', 
                                      gap: 6 
                                    }}
                                  >
                                    <Ionicons name="add" size={14} color="#fff" />
                                    <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>Skapa första mappen</Text>
                                  </TouchableOpacity>
                                </View>
                              ) : (
                                <>
                                  {(Array.isArray(folders) ? folders : []).map((f) => {
                                    const fid = String(f?.id || '').trim();
                                    const label = String(f?.name || '').trim() || 'Namnlös mapp';
                                    const isSelected = String(selectedFolderId || '').trim() === fid;
                                    return (
                                      <TouchableOpacity
                                        key={fid}
                                        onPress={() => setSelectedFolderId(fid)}
                                        onContextMenu={(e) => {
                                          try {
                                            if (e?.preventDefault) e.preventDefault();
                                            if (e?.stopPropagation) e.stopPropagation();
                                          } catch (_e2) {}
                                          openFolderContextMenu({ e, folder: { ...f, id: fid, name: label } });
                                        }}
                                        onDragOver={(e) => {
                                          try { if (e?.preventDefault) e.preventDefault(); } catch (_e2) {}
                                          setDragOverFolderId(fid);
                                        }}
                                        onDragLeave={() => setDragOverFolderId((prev) => (prev === fid ? null : prev))}
                                        onDrop={(e) => {
                                          try { if (e?.preventDefault) e.preventDefault(); } catch (_e2) {}
                                          setDragOverFolderId(null);
                                          try {
                                            const raw = e?.dataTransfer?.getData('text/plain') || '';
                                            const data = raw ? JSON.parse(raw) : null;
                                            const tid = data?.templateId || draggingTemplate?.id;
                                            const ct = String(data?.controlType || '').trim();
                                            if (ct && String(selectedControlType || '').trim() !== ct) return;
                                            if (tid) performMoveTemplateToFolder({ templateId: tid, nextFolderId: fid, nextFolderName: label });
                                          } catch (_e2) {
                                            if (draggingTemplate?.id) performMoveTemplateToFolder({ templateId: draggingTemplate.id, nextFolderId: fid, nextFolderName: label });
                                          }
                                        }}
                                        style={{
                                          paddingVertical: 8,
                                          paddingHorizontal: 10,
                                          borderRadius: 10,
                                          backgroundColor: (dragOverFolderId === fid) ? '#FFF3E0' : (isSelected ? '#E3F2FD' : '#fff'),
                                          borderWidth: 1,
                                          borderColor: (dragOverFolderId === fid) ? '#FB8C00' : (isSelected ? '#1976D2' : '#E6E8EC'),
                                          marginBottom: 8,
                                          flexDirection: 'row',
                                          alignItems: 'center',
                                          justifyContent: 'space-between',
                                          gap: 10,
                                          ...(Platform.OS === 'web' ? {
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer',
                                          } : {}),
                                        }}
                                        onMouseEnter={(e) => {
                                          if (Platform.OS === 'web' && dragOverFolderId !== fid && !isSelected) {
                                            e.currentTarget.style.backgroundColor = '#F5F5F5';
                                            e.currentTarget.style.borderColor = '#D1D5DB';
                                          }
                                        }}
                                        onMouseLeave={(e) => {
                                          if (Platform.OS === 'web' && dragOverFolderId !== fid && !isSelected) {
                                            e.currentTarget.style.backgroundColor = '#fff';
                                            e.currentTarget.style.borderColor = '#E6E8EC';
                                          }
                                        }}
                                      >
                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                          <Ionicons name="folder" size={16} color="#C9A227" />
                                          <Text style={{ fontSize: 13, fontWeight: '500', color: '#222', flex: 1 }} numberOfLines={1}>{label}</Text>
                                        </View>
                                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#555' }}>{folderCounts.get(fid) || 0}</Text>
                                      </TouchableOpacity>
                                    );
                                  })}
                                </>
                              )}
                            </View>
                          </>
                        )}
                      </View>
                    )}

                    {/* Column 3: Mallar */}
                    <View style={{ flex: 1, minWidth: 400, backgroundColor: '#fff' }}>
                      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 14, fontWeight: '500', color: '#111' }}>Mallar</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{`Antal: ${templatesForSelectedFolder.length}`}</Text>
                        </View>
                        <TouchableOpacity
                          disabled={!selectedControlType}
                          onPress={() => {
                            try {
                              openAddTemplateModal();
                            } catch (_e) {}
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            backgroundColor: selectedControlType ? '#1976D2' : '#B0BEC5',
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                          }}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Lägg till</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ padding: 12 }}>
                        <View style={{ marginBottom: 10 }}>
                          <TextInput
                            value={templateSearch}
                            onChangeText={setTemplateSearch}
                            placeholder="Sök mall"
                            style={{ borderWidth: 1, borderColor: '#E6E8EC', backgroundColor: '#fff', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 10, fontSize: 14 }}
                          />
                        </View>

                      <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden' }}>
                        <View style={{ flexDirection: 'row', backgroundColor: '#F9FAFB', borderBottomWidth: 1, borderBottomColor: '#E6E8EC', paddingVertical: 10, paddingHorizontal: 12 }}>
                          <Text style={{ flex: 2.5, fontSize: 12, fontWeight: '500', color: '#374151' }}>Mall</Text>
                          <Text style={{ flex: 1.5, fontSize: 12, fontWeight: '500', color: '#374151' }}>Skapad av</Text>
                          <Text style={{ width: 80, fontSize: 12, fontWeight: '500', color: '#374151', textAlign: 'center' }}>Version</Text>
                          <Text style={{ width: 120, fontSize: 12, fontWeight: '500', color: '#374151', textAlign: 'right' }}>Senast ändrad</Text>
                        </View>

                        {loadingTemplates ? (
                          <View style={{ padding: 24, alignItems: 'center' }}>
                            <ActivityIndicator size="small" color="#1976D2" />
                            <Text style={{ color: '#64748b', fontSize: 13, marginTop: 8 }}>Laddar mallar...</Text>
                          </View>
                        ) : templatesForSelectedFolder.length === 0 ? (
                          <View style={{ 
                            padding: 32, 
                            alignItems: 'center', 
                            backgroundColor: '#F8FAFC', 
                            borderRadius: 12, 
                            borderWidth: 1, 
                            borderColor: '#E6E8EC',
                            marginTop: 12
                          }}>
                            <View style={{ width: 64, height: 64, borderRadius: 16, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                              <Ionicons name="document-text-outline" size={32} color="#1976D2" />
                            </View>
                            <Text style={{ color: '#475569', fontSize: 15, fontWeight: '600', marginBottom: 6 }}>Inga mallar här än</Text>
                            <Text style={{ color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                              {templateSearch ? 'Inga mallar matchade din sökning.' : 'Skapa din första mall för att komma igång.'}
                            </Text>
                          </View>
                        ) : (
                          templatesForSelectedFolder.slice(0, 50).map((t) => {
                            const author = (t?.createdBy && (t.createdBy.displayName || t.createdBy.email)) ? (t.createdBy.displayName || t.createdBy.email) : '—';
                            const ver = t?.version ? `v${t.version}` : '—';
                            const ts = t?.updatedAt?.seconds || t?.createdAt?.seconds || null;
                            const date = ts ? new Date(ts * 1000).toISOString().slice(0, 10) : '—';
                            const isHidden = !!t?.hidden;
                            return (
                              <TouchableOpacity
                                key={String(t?.id || '')}
                                onPress={() => {
                                  try {
                                    openTemplateEditor(t);
                                  } catch (_e) {}
                                }}
                                onContextMenu={(e) => {
                                  try {
                                    if (e?.preventDefault) e.preventDefault();
                                    if (e?.stopPropagation) e.stopPropagation();
                                  } catch (_e2) {}
                                  openTemplateContextMenu({ e, template: t });
                                }}
                                draggable={true}
                                onDragStart={(e) => {
                                  try {
                                    setDraggingTemplate(t);
                                    const payload = JSON.stringify({ templateId: t.id, controlType: String(selectedControlType || '').trim() });
                                    if (e?.dataTransfer && typeof e.dataTransfer.setData === 'function') {
                                      e.dataTransfer.setData('text/plain', payload);
                                      try { e.dataTransfer.effectAllowed = 'move'; } catch (_e2) {}
                                    }
                                  } catch (_e2) {}
                                }}
                                onDragEnd={() => {
                                  setDraggingTemplate(null);
                                  setDragOverFolderId(null);
                                }}
                                style={{ 
                                  flexDirection: 'row', 
                                  paddingVertical: 12, 
                                  paddingHorizontal: 12, 
                                  borderBottomWidth: 1, 
                                  borderBottomColor: '#EEF0F3', 
                                  opacity: isHidden ? 0.5 : 1,
                                  ...(Platform.OS === 'web' ? {
                                    transition: 'background-color 0.2s ease',
                                    cursor: 'pointer',
                                  } : {}),
                                }}
                                onMouseEnter={(e) => {
                                  if (Platform.OS === 'web') {
                                    e.currentTarget.style.backgroundColor = '#F8FAFC';
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (Platform.OS === 'web') {
                                    e.currentTarget.style.backgroundColor = 'transparent';
                                  }
                                }}
                              >
                                <Text style={{ flex: 2.5, fontSize: 13, fontWeight: '500', color: '#111' }} numberOfLines={1}>{String(t?.title || 'Namnlös')}</Text>
                                <Text style={{ flex: 1.5, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(author)}</Text>
                                <Text style={{ width: 80, fontSize: 13, color: '#555', textAlign: 'center' }}>{ver}</Text>
                                <Text style={{ width: 120, fontSize: 13, color: '#555', textAlign: 'right' }}>{date}</Text>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>

                      <View style={{ marginTop: 12 }}>
                        <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                          Tips: Högerklicka på en kontrolltyp för att byta namn, aktivera/dölja eller radera.
                          {'\n'}Dra och släpp mallar på en mapp för att flytta dem.
                        </Text>
                      </View>
                      </View>
                    </View>
                  </View>
                </View>
              )}
            </View>
          </View>
          {Platform.OS === 'web' && folderContextMenu && (
            <ContextMenu
              visible={!!folderContextMenu}
              x={folderContextMenu.x || 0}
              y={folderContextMenu.y || 0}
              onClose={() => setFolderContextMenu(null)}
              items={(() => {
                const f = folderContextMenu?.folder || null;
                if (!f) return [];
                const isUnassigned = !!f.isUnassigned || String(f.id) === '__unassigned__';
                const base = [];
                if (!isUnassigned) {
                  base.push({ key: 'rename', label: 'Byt namn' });
                  base.push({ key: 'delete', label: 'Radera mapp', danger: true });
                } else {
                  base.push({ key: 'noop', label: 'Utan mapp' });
                }
                return base;
              })()}
              onSelect={async (item) => {
                try {
                  const ctx = folderContextMenu;
                  if (!ctx || !ctx.folder || !item) return;
                  const f = ctx.folder;
                  setFolderContextMenu(null);
                  if (item.key === 'rename') {
                    await renameFolder(f);
                    return;
                  }
                  if (item.key === 'delete') {
                    await deleteFolder(f);
                    return;
                  }
                } catch (_e) {}
              }}
            />
          )}
          {Platform.OS === 'web' && templateContextMenu && (
            <ContextMenu
              visible={!!templateContextMenu}
              x={templateContextMenu.x || 0}
              y={templateContextMenu.y || 0}
              onClose={() => setTemplateContextMenu(null)}
              items={(() => {
                const tpl = templateContextMenu?.template;
                if (!tpl) return [];
                const isHidden = !!tpl.hidden;
                return [
                  { key: 'edit', label: 'Redigera' },
                  { key: isHidden ? 'activate' : 'hide', label: isHidden ? 'Aktivera' : 'Dölj' },
                  { key: 'delete', label: 'Radera', danger: true },
                ];
              })()}
              onSelect={async (item) => {
                try {
                  const ctx = templateContextMenu;
                  if (!ctx || !ctx.template || !item) return;
                  const tpl = ctx.template;
                  setTemplateContextMenu(null);
                  if (item.key === 'edit') {
                    openTemplateEditor(tpl);
                    return;
                  }
                  if (item.key === 'hide' || item.key === 'activate') {
                    await toggleTemplateHidden(tpl);
                    return;
                  }
                  if (item.key === 'delete') {
                    await deleteTemplate(tpl);
                    return;
                  }
                } catch (_e) {}
              }}
            />
          )}
          {showAddTemplateModal && (
            <View
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 210,
              }}
            >
              <View
                style={{
                  width: 520,
                  maxWidth: '92%',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                      <Ionicons name="copy-outline" size={16} color="#fff" />
                    </View>
                    <View style={{ minWidth: 0 }}>
                      <Text style={{ fontSize: 16, fontWeight: '800', color: '#222' }} numberOfLines={1}>Ny mall</Text>
                      <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                        {`${selectedControlType}${selectedFolderName ? ` / ${selectedFolderName}` : ''}`}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingTemplate) return;
                      setShowAddTemplateModal(false);
                    }}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f3f4f6' }}
                  >
                    <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Stäng</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn på mall</Text>
                <TextInput
                  value={newTemplateTitle}
                  onChangeText={setNewTemplateTitle}
                  placeholder="Titel på mall"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 10, fontSize: 14, color: '#111' }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Beskrivning (valfritt)</Text>
                <TextInput
                  value={newTemplateDescription}
                  onChangeText={setNewTemplateDescription}
                  placeholder="Kort beskrivning av mallen"
                  multiline
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 10, minHeight: 70, fontSize: 14, color: '#111', textAlignVertical: 'top' }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Version</Text>
                <TextInput
                  value={newTemplateVersion}
                  onChangeText={setNewTemplateVersion}
                  placeholder="1"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 14, width: 120, fontSize: 14, color: '#111' }}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 10 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingTemplate) return;
                      setShowAddTemplateModal(false);
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                  >
                    <Text style={{ color: '#111', fontWeight: '800', fontSize: 13 }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleCreateTemplateHere}
                    disabled={savingTemplate}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: savingTemplate ? '#90A4AE' : '#1976D2', flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Ionicons name="save-outline" size={16} color="#fff" />
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{savingTemplate ? 'Sparar…' : 'Skapa mall'}</Text>
                  </TouchableOpacity>
                </View>

                <View style={{ marginTop: 10 }}>
                  <Text style={{ fontSize: 12, color: '#777' }}>
                    Tips: Du kan flytta mallar med drag & drop mellan mappar.
                  </Text>
                </View>
              </View>
            </View>
          )}
          {showEditTemplateModal && (
            <View
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 220,
              }}
            >
              <View
                style={{
                  width: 560,
                  maxWidth: '92%',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                    <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#111827', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                      <Ionicons name="pencil" size={16} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 16, fontWeight: '800', color: '#111' }} numberOfLines={1}>Redigera mall</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingEditTemplate) return;
                      setShowEditTemplateModal(false);
                      setEditingTemplate(null);
                    }}
                    style={{ paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#f3f4f6' }}
                  >
                    <Text style={{ color: '#111', fontWeight: '800', fontSize: 12 }}>Stäng</Text>
                  </TouchableOpacity>
                </View>

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
                <TextInput
                  value={editTemplateTitle}
                  onChangeText={setEditTemplateTitle}
                  placeholder="Titel på mall"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 10, fontSize: 14, color: '#111' }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Beskrivning (valfritt)</Text>
                <TextInput
                  value={editTemplateDescription}
                  onChangeText={setEditTemplateDescription}
                  placeholder="Kort beskrivning av mallen"
                  multiline
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 10, minHeight: 80, fontSize: 14, color: '#111', textAlignVertical: 'top' }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Version</Text>
                <TextInput
                  value={editTemplateVersion}
                  onChangeText={setEditTemplateVersion}
                  placeholder="1"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 10, borderRadius: 8, backgroundColor: '#fff', marginBottom: 14, width: 140, fontSize: 14, color: '#111' }}
                />

                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <TouchableOpacity
                    onPress={async () => {
                      try {
                        if (!editingTemplate) return;
                        await toggleTemplateHidden(editingTemplate);
                        setShowEditTemplateModal(false);
                        setEditingTemplate(null);
                      } catch (_e) {}
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FFF8E1', borderWidth: 1, borderColor: '#FFE082' }}
                  >
                    <Text style={{ color: '#5D4037', fontWeight: '800', fontSize: 13 }}>{editingTemplate?.hidden ? 'Aktivera' : 'Dölj'}</Text>
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => {
                        if (savingEditTemplate) return;
                        setShowEditTemplateModal(false);
                        setEditingTemplate(null);
                      }}
                      style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#f3f4f6' }}
                    >
                      <Text style={{ color: '#111', fontWeight: '800', fontSize: 13 }}>Avbryt</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={async () => {
                        const cid = String(companyId || '').trim();
                        const tpl = editingTemplate;
                        if (!cid || !tpl?.id) return;
                        const title = String(editTemplateTitle || '').trim();
                        if (!title) {
                          try { if (typeof window !== 'undefined' && window.alert) window.alert('Ange ett namn.'); } catch (_e) {}
                          return;
                        }
                        // Version: keep as string, allow dots
                        let rawVersion = String(editTemplateVersion || '').trim() || '1';
                        if (/^[vV]/.test(rawVersion)) rawVersion = rawVersion.slice(1).trim() || '1';
                        try {
                          setSavingEditTemplate(true);
                          await updateCompanyMall({
                            id: tpl.id,
                            patch: {
                              title,
                              description: String(editTemplateDescription || '').trim(),
                              version: rawVersion,
                            },
                          }, cid);
                          setTemplates((prev) => (Array.isArray(prev) ? prev.map((t) => (String(t?.id || '') === String(tpl.id)
                            ? { ...t, title, description: String(editTemplateDescription || '').trim(), version: rawVersion }
                            : t)) : prev));
                          setShowEditTemplateModal(false);
                          setEditingTemplate(null);
                        } catch (e) {
                          try { if (typeof window !== 'undefined' && window.alert) window.alert(String(e?.message || e)); } catch (_e) {}
                        } finally {
                          setSavingEditTemplate(false);
                        }
                      }}
                      disabled={savingEditTemplate}
                      style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: savingEditTemplate ? '#90A4AE' : '#111827', flexDirection: 'row', alignItems: 'center', gap: 8 }}
                    >
                      <Ionicons name="save-outline" size={16} color="#fff" />
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>{savingEditTemplate ? 'Sparar…' : 'Spara'}</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                <View style={{ marginTop: 12 }}>
                  <TouchableOpacity
                    onPress={async () => {
                      if (!editingTemplate) return;
                      await deleteTemplate(editingTemplate);
                      setShowEditTemplateModal(false);
                      setEditingTemplate(null);
                    }}
                    style={{ paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, backgroundColor: '#FFEBEE', borderWidth: 1, borderColor: '#FFCDD2', alignSelf: 'flex-start' }}
                  >
                    <Text style={{ color: '#C62828', fontWeight: '800', fontSize: 13 }}>Radera mall</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          {showAddModal && (
            <View
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 200,
              }}
            >
              <View
                style={{
                  width: 440,
                  maxWidth: '90%',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="options-outline" size={16} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#222' }}>Ny kontrolltyp</Text>
                </View>

                {companyId ? (
                  <View style={{ backgroundColor: '#E3F2FD', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#1976D2', fontWeight: '600' }}>
                      Sparas i: {companyId}
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#FFEBEE', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#D32F2F', fontWeight: '600' }}>
                      Välj ett företag i listan till vänster först
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
                <TextInput
                  value={newControlTypeName}
                  onChangeText={setNewControlTypeName}
                  placeholder="Namn på kontrolltyp (t.ex. Avprovning)"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, backgroundColor: '#fff', marginBottom: 12 }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Välj ikon</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
                  {CONTROL_TYPE_ICON_CHOICES.map((t, index) => {
                    const active = selectedIcon === t.icon;
                    return (
                      <TouchableOpacity
                        key={t.icon + '-' + index}
                        onPress={() => {
                          setSelectedIcon(t.icon);
                          setSelectedIconColor(t.color || '#6A1B9A');
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: active ? '#6A1B9A' : '#ddd',
                          backgroundColor: active ? '#F3E5F5' : '#fff',
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Ionicons name={t.icon} size={16} color={t.color || '#455A64'} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingControlType) return;
                      setShowAddModal(false);
                      setNewControlTypeName('');
                    }}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: '#555' }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const name = String(newControlTypeName || '').trim();
                      const cid = String(companyId || '').trim();
                      
                      if (!name) {
                        Alert.alert('Fel', 'Ange ett namn för kontrolltypen.');
                        return;
                      }
                      
                      if (!cid) {
                        Alert.alert('Fel', 'Inget företag är valt. Välj ett företag i listan till vänster först.');
                        return;
                      }
                      
                      try {
                        setSavingControlType(true);
                        await createCompanyControlType({ name, icon: selectedIcon, color: selectedIconColor }, cid);
                        setNewControlTypeName('');
                        setShowAddModal(false);
                        setMessage({ type: 'success', text: `Kontrolltypen "${name}" har skapats.` });
                        setTimeout(() => setMessage({ type: null, text: '' }), 3000);
                        try {
                          const list = await fetchCompanyControlTypes(cid);
                          setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                          // Trigger update event for sidebar
                          if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('dkControlTypesUpdated', { detail: { companyId: cid } }));
                          }
                        } catch (_e) {}
                      } catch (e) {
                        const errorMsg = String(e?.message || e || 'Ett fel uppstod');
                        Alert.alert('Fel', `Kunde inte spara kontrolltypen: ${errorMsg}`);
                        setMessage({ type: 'error', text: `Kunde inte spara kontrolltypen: ${errorMsg}` });
                        setTimeout(() => setMessage({ type: null, text: '' }), 5000);
                      } finally {
                        setSavingControlType(false);
                      }
                    }}
                    disabled={savingControlType || !newControlTypeName.trim() || !String(companyId || '').trim()}
                    style={{
                      backgroundColor: savingControlType || !newControlTypeName.trim() || !String(companyId || '').trim() ? '#B0BEC5' : '#6A1B9A',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '500', fontSize: 13 }}>
                      {savingControlType ? 'Sparar…' : 'Spara kontrolltyp'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
          {showEditModal && editingControlType && (
            <View
              style={{
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                backgroundColor: 'rgba(0,0,0,0.35)',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 200,
              }}
            >
              <View
                style={{
                  width: 440,
                  maxWidth: '90%',
                  backgroundColor: '#fff',
                  borderRadius: 12,
                  paddingVertical: 18,
                  paddingHorizontal: 18,
                  shadowColor: '#000',
                  shadowOpacity: 0.2,
                  shadowRadius: 10,
                  shadowOffset: { width: 0, height: 4 },
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}>
                  <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="create-outline" size={16} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '500', color: '#222' }}>Redigera kontrolltyp</Text>
                </View>

                {companyId ? (
                  <View style={{ backgroundColor: '#E3F2FD', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#1976D2', fontWeight: '600' }}>
                      Företag: {companyId}
                    </Text>
                  </View>
                ) : (
                  <View style={{ backgroundColor: '#FFEBEE', padding: 8, borderRadius: 6, marginBottom: 12 }}>
                    <Text style={{ fontSize: 12, color: '#D32F2F', fontWeight: '600' }}>
                      Välj ett företag i listan till vänster först
                    </Text>
                  </View>
                )}

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn</Text>
                <TextInput
                  value={editControlTypeName}
                  onChangeText={setEditControlTypeName}
                  placeholder="Namn på kontrolltyp"
                  style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, backgroundColor: '#fff', marginBottom: 12 }}
                />

                <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Välj ikon</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', marginBottom: 12 }}>
                  {CONTROL_TYPE_ICON_CHOICES.map((t, index) => {
                    const active = editControlTypeIcon === t.icon;
                    return (
                      <TouchableOpacity
                        key={t.icon + '-' + index}
                        onPress={() => {
                          setEditControlTypeIcon(t.icon);
                          setEditControlTypeColor(t.color || '#6A1B9A');
                        }}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingVertical: 4,
                          paddingHorizontal: 8,
                          borderRadius: 8,
                          borderWidth: 1,
                          borderColor: active ? '#6A1B9A' : '#ddd',
                          backgroundColor: active ? '#F3E5F5' : '#fff',
                          marginRight: 8,
                          marginBottom: 8,
                        }}
                      >
                        <Ionicons name={t.icon} size={16} color={t.color || '#455A64'} />
                      </TouchableOpacity>
                    );
                  })}
                </View>

                <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                  <TouchableOpacity
                    onPress={() => {
                      if (savingEditControlType) return;
                      setShowEditModal(false);
                      setEditingControlType(null);
                      setEditControlTypeName('');
                      setEditControlTypeIcon('');
                      setEditControlTypeColor('');
                    }}
                    style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}
                  >
                    <Text style={{ fontSize: 13, color: '#555' }}>Avbryt</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={async () => {
                      const name = String(editControlTypeName || '').trim();
                      const cid = String(companyId || '').trim();
                      const ct = editingControlType;
                      
                      if (!name) {
                        Alert.alert('Fel', 'Ange ett namn för kontrolltypen.');
                        return;
                      }
                      
                      if (!cid) {
                        Alert.alert('Fel', 'Inget företag är valt. Välj ett företag i listan till vänster först.');
                        return;
                      }
                      
                      try {
                        setSavingEditControlType(true);
                        const ctId = String(ct.id || '').trim();
                        const ctKey = String(ct.key || '').trim();
                        
                        if (ctId) {
                          // Custom control type - update by ID
                          await updateCompanyControlType({ id: ctId, name, icon: editControlTypeIcon, color: editControlTypeColor }, cid);
                        } else if (ctKey) {
                          // Built-in control type - update by key
                          await updateCompanyControlType({ key: ctKey, name, icon: editControlTypeIcon, color: editControlTypeColor }, cid);
                        } else {
                          throw new Error('Kunde inte identifiera kontrolltypen.');
                        }
                        
                        setShowEditModal(false);
                        setEditingControlType(null);
                        setEditControlTypeName('');
                        setEditControlTypeIcon('');
                        setEditControlTypeColor('');
                        setMessage({ type: 'success', text: `Kontrolltypen "${name}" har uppdaterats.` });
                        setTimeout(() => setMessage({ type: null, text: '' }), 3000);
                        
                        // Refresh control types list
                        const list = await fetchCompanyControlTypes(cid);
                        setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                        
                        // Update selected control type name if it was edited
                        if (String(selectedControlType || '').trim() === String(ct.name || ct.key || '').trim()) {
                          setSelectedControlType(name);
                        }
                        
                        // Trigger update event for sidebar
                        if (typeof window !== 'undefined') {
                          window.dispatchEvent(new CustomEvent('dkControlTypesUpdated', { detail: { companyId: cid } }));
                        }
                      } catch (e) {
                        const errorMsg = String(e?.message || e || 'Ett fel uppstod');
                        Alert.alert('Fel', `Kunde inte uppdatera kontrolltypen: ${errorMsg}`);
                        setMessage({ type: 'error', text: `Kunde inte uppdatera kontrolltypen: ${errorMsg}` });
                        setTimeout(() => setMessage({ type: null, text: '' }), 5000);
                      } finally {
                        setSavingEditControlType(false);
                      }
                    }}
                    disabled={savingEditControlType || !editControlTypeName.trim() || !String(companyId || '').trim()}
                    style={{
                      backgroundColor: savingEditControlType || !editControlTypeName.trim() || !String(companyId || '').trim() ? '#B0BEC5' : '#6A1B9A',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '500', fontSize: 13 }}>
                      {savingEditControlType ? 'Sparar…' : 'Spara ändringar'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </MainLayout>
      </RootContainer>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Kontrolltyper</Text>
      <Text style={{ fontSize: 14, color: '#555' }}>
        Här kommer du kunna hantera egna kontrolltyper per företag. Funktionen är under utveckling.
      </Text>
    </View>
  );
}
