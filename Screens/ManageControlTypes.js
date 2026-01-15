import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useMemo, useState } from 'react';
import { ImageBackground, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import {
    auth,
    createCompanyControlType,
    createCompanyControlTypeFolder,
    createCompanyMall,
    DEFAULT_CONTROL_TYPES,
    deleteCompanyControlTypeFolder,
    deleteCompanyMall,
    fetchCompanyControlTypeFolders,
    fetchCompanyControlTypes,
    fetchCompanyMallar,
    updateCompanyControlTypeFolder,
    updateCompanyMall,
} from '../components/firebase';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';
import WebBreadcrumbHeader from '../components/WebBreadcrumbHeader';

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
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
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
          if (mounted) setTemplates([]);
          return;
        }
        const items = await fetchCompanyMallar(companyId);
        if (mounted) setTemplates(Array.isArray(items) ? items : []);
      } catch (_e) {
        if (mounted) setTemplates([]);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Ladda mappar för vald kontrolltyp
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const cid = String(companyId || '').trim();
        const ct = String(selectedControlType || '').trim();
        if (!cid || !ct) {
          if (mounted) {
            setFolders([]);
            setSelectedFolderId('');
          }
          return;
        }
        const list = await fetchCompanyControlTypeFolders(cid, ct);
        if (mounted) {
          setFolders(Array.isArray(list) ? list : []);
          // Default folder selection: keep current if it exists, else pick first folder, else "unassigned".
          setSelectedFolderId((prev) => {
            const p = String(prev || '').trim();
            if (p && (p === '__unassigned__' || (Array.isArray(list) && list.some(f => String(f?.id || '') === p)))) return p;
            if (Array.isArray(list) && list.length > 0) return String(list[0].id);
            return '__unassigned__';
          });
        }
      } catch (_e) {
        if (mounted) {
          setFolders([]);
          setSelectedFolderId('__unassigned__');
        }
      }
    })();
    return () => { mounted = false; };
  }, [companyId, selectedControlType]);


  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = () => {
      try {
        navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
      } catch (_e) {}
    };

    window.addEventListener('dkGoHome', handler);
    return () => {
      try { window.removeEventListener('dkGoHome', handler); } catch (_e) {}
    };
  }, [navigation]);

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

    const selectedControlTypeObj = useMemo(() => {
      const ct = String(selectedControlType || '').trim();
      if (!ct) return null;
      return controlTypesForCompany.find((t) => String(t?.name || t?.key || '').trim() === ct) || null;
    }, [controlTypesForCompany, selectedControlType]);

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
      const fid = String(selectedFolderId || '').trim() || '__unassigned__';
      let list = templatesForSelectedType;
      if (fid === '__unassigned__') {
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
    }, [templatesForSelectedType, selectedFolderId, templateSearch]);

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
        try {
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId: cid } }));
          }
        } catch (_e) {}
      } catch (e) {
        try { if (typeof window !== 'undefined' && window.alert) window.alert(String(e?.message || e)); } catch (_e) {}
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
        setFolders((prev) => (Array.isArray(prev) ? prev.filter((f) => String(f?.id || '') !== folderId) : prev));
        setSelectedFolderId((prev) => (String(prev || '').trim() === folderId ? '__unassigned__' : prev));
      } catch (_e) {}
    };

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={async (payload) => {
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
          sidebarTitle="Kontrolltyper"
          sidebarIconName="options-outline"
          sidebarIconColor="#6A1B9A"
          sidebarSearchPlaceholder="Sök kontroll"
          sidebarCompaniesMode={true}
          sidebarShowMembers={false}
          sidebarRestrictCompanyId={sidebarRestrictId}
          sidebarHideCompanyActions={true}
          sidebarAutoExpandMembers={true}
          sidebarControlTypesMode={true}
          topBar={
            <View style={{ height: 96, paddingLeft: 24, paddingRight: 24, backgroundColor: '#fff', justifyContent: 'center' }}>
              <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', marginLeft: 8 }}>
                  <View style={{ marginRight: 10 }}>
                    {showHeaderUserMenu ? <HeaderUserMenuConditional /> : <HeaderDisplayName />}
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
                  {Platform.OS === 'web' ? (
                    <WebBreadcrumbHeader
                      navigation={navigation}
                      label="Kontrolltyper"
                      iconName="options-outline"
                      iconColor="#6A1B9A"
                    />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                      <TouchableOpacity onPress={() => { try { navigation.goBack(); } catch(_e){} }} style={{ padding: 8, marginRight: 8 }} accessibilityLabel="Tillbaka">
                        <Ionicons name="chevron-back" size={20} color="#222" />
                      </TouchableOpacity>
                      <View style={{ flexDirection: 'row', alignItems: 'center', minWidth: 0 }}>
                        <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#6A1B9A', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                          <Ionicons name="options-outline" size={14} color="#fff" />
                        </View>
                        <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }} numberOfLines={1} ellipsizeMode="tail">Kontrolltyper</Text>
                      </View>
                    </View>
                  )}
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
                <>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: (selectedControlTypeObj?.color || '#6A1B9A'), alignItems: 'center', justifyContent: 'center' }}>
                        <Ionicons name={selectedControlTypeObj?.icon || 'options-outline'} size={18} color="#fff" />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ fontSize: 18, fontWeight: '800', color: '#111' }} numberOfLines={1}>
                          {selectedControlType ? selectedControlType : 'Välj en kontrolltyp'}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                          {selectedControlType ? `Mappar: ${Array.isArray(folders) ? folders.length : 0} • Mallar: ${templatesForSelectedType.length}` : 'Välj kontrolltyp i sidomenyn eller listan här.'}
                        </Text>
                      </View>
                    </View>
                    {selectedControlType ? (
                      <TouchableOpacity
                        onPress={async () => {
                          try {
                            openAddTemplateModal();
                          } catch (_e) {}
                        }}
                        style={{ backgroundColor: '#1976D2', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                      >
                        <Ionicons name="add" size={16} color="#fff" />
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Lägg till mall</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  <View style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, overflow: 'hidden', flexDirection: 'row', minHeight: 520 }}>
                    {/* Column 1: Kontrolltyper */}
                    <View style={{ width: 300, backgroundColor: '#F9FAFB', borderRightWidth: 1, borderRightColor: '#E6E8EC' }}>
                      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff' }}>
                        <Text style={{ fontSize: 14, fontWeight: '800', color: '#111' }}>Kontrolltyper</Text>
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{`Antal: ${controlTypesForCompany.length}`}</Text>
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
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                <Ionicons name={ct.icon || 'options-outline'} size={16} color={ct.color || '#6A1B9A'} />
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#222', flex: 1 }} numberOfLines={1}>{label}</Text>
                              </View>
                              <View style={{ paddingVertical: 2, paddingHorizontal: 8, borderRadius: 999, backgroundColor: isHidden ? '#FFEBEE' : '#E8F5E9', borderWidth: 1, borderColor: isHidden ? '#FFCDD2' : '#C8E6C9' }}>
                                <Text style={{ fontSize: 11, fontWeight: '700', color: isHidden ? '#C62828' : '#2E7D32' }}>{isHidden ? 'Inaktiv' : 'Aktiv'}</Text>
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Column 2: Mappar */}
                    <View style={{ width: 320, backgroundColor: '#fff', borderRightWidth: 1, borderRightColor: '#E6E8EC' }}>
                      <View style={{ padding: 12, borderBottomWidth: 1, borderBottomColor: '#E6E8EC', backgroundColor: '#fff', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111' }}>Mappar</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                            {selectedControlType ? 'Skapa mappar för att organisera mallar.' : 'Välj en kontrolltyp först.'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          disabled={!selectedControlType}
                          onPress={async () => {
                            if (!selectedControlType) return;
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
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Lägg till mapp</Text>
                        </TouchableOpacity>
                      </View>

                      <View style={{ padding: 10 }}>
                        <TouchableOpacity
                          onPress={() => setSelectedFolderId('__unassigned__')}
                          onContextMenu={(e) => {
                            try {
                              if (e?.preventDefault) e.preventDefault();
                              if (e?.stopPropagation) e.stopPropagation();
                            } catch (_e2) {}
                            openFolderContextMenu({ e, folder: { id: '__unassigned__', name: 'Utan mapp', isUnassigned: true } });
                          }}
                          onDragOver={(e) => {
                            try { if (e?.preventDefault) e.preventDefault(); } catch (_e2) {}
                            setDragOverFolderId('__unassigned__');
                          }}
                          onDragLeave={() => setDragOverFolderId((prev) => (prev === '__unassigned__' ? null : prev))}
                          onDrop={(e) => {
                            try { if (e?.preventDefault) e.preventDefault(); } catch (_e2) {}
                            setDragOverFolderId(null);
                            try {
                              const raw = e?.dataTransfer?.getData('text/plain') || '';
                              const data = raw ? JSON.parse(raw) : null;
                              const tid = data?.templateId || draggingTemplate?.id;
                              const ct = String(data?.controlType || '').trim();
                              if (ct && String(selectedControlType || '').trim() !== ct) return;
                              if (tid) performMoveTemplateToFolder({ templateId: tid, nextFolderId: null, nextFolderName: null });
                            } catch (_e2) {
                              if (draggingTemplate?.id) performMoveTemplateToFolder({ templateId: draggingTemplate.id, nextFolderId: null, nextFolderName: null });
                            }
                          }}
                          style={{
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            borderRadius: 10,
                            backgroundColor: (dragOverFolderId === '__unassigned__')
                              ? '#FFF3E0'
                              : ((selectedFolderId === '__unassigned__' || !selectedFolderId) ? '#E3F2FD' : '#fff'),
                            borderWidth: 1,
                            borderColor: (dragOverFolderId === '__unassigned__')
                              ? '#FB8C00'
                              : ((selectedFolderId === '__unassigned__' || !selectedFolderId) ? '#1976D2' : '#E6E8EC'),
                            marginBottom: 8,
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 10,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: '700', color: '#222', flex: 1 }} numberOfLines={1}>Utan mapp</Text>
                          <Text style={{ fontSize: 12, fontWeight: '700', color: '#555' }}>{folderCounts.get('__unassigned__') || 0}</Text>
                        </TouchableOpacity>

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
                              }}
                            >
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                                <Ionicons name="folder" size={16} color="#C9A227" />
                                <Text style={{ fontSize: 13, fontWeight: '700', color: '#222', flex: 1 }} numberOfLines={1}>{label}</Text>
                              </View>
                              <Text style={{ fontSize: 12, fontWeight: '700', color: '#555' }}>{folderCounts.get(fid) || 0}</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>

                    {/* Column 3: Mallar */}
                    <View style={{ flex: 1, padding: 12, backgroundColor: '#fff' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 10 }}>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 14, fontWeight: '800', color: '#111' }}>Mallar</Text>
                          <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                            {selectedControlType ? `${selectedControlType}${selectedFolderName ? ` / ${selectedFolderName}` : ''}` : 'Välj en kontrolltyp först.'}
                          </Text>
                        </View>
                      </View>

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
                          <Text style={{ flex: 1.4, fontSize: 12, fontWeight: '800', color: '#374151' }}>Mall</Text>
                          <Text style={{ flex: 1, fontSize: 12, fontWeight: '800', color: '#374151' }}>Skapad av</Text>
                          <Text style={{ width: 70, fontSize: 12, fontWeight: '800', color: '#374151', textAlign: 'center' }}>Version</Text>
                          <Text style={{ width: 120, fontSize: 12, fontWeight: '800', color: '#374151', textAlign: 'right' }}>Senast ändrad</Text>
                        </View>

                        {templatesForSelectedFolder.length === 0 ? (
                          <View style={{ padding: 14 }}>
                            <Text style={{ color: '#666', fontSize: 13 }}>Inga mallar här än.</Text>
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
                                style={{ flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#EEF0F3', opacity: isHidden ? 0.5 : 1 }}
                              >
                                <Text style={{ flex: 1.4, fontSize: 13, fontWeight: '700', color: '#111' }} numberOfLines={1}>{String(t?.title || 'Namnlös')}</Text>
                                <Text style={{ flex: 1, fontSize: 13, color: '#555' }} numberOfLines={1}>{String(author)}</Text>
                                <Text style={{ width: 70, fontSize: 13, color: '#555', textAlign: 'center' }}>{ver}</Text>
                                <Text style={{ width: 120, fontSize: 13, color: '#555', textAlign: 'right' }}>{date}</Text>
                              </TouchableOpacity>
                            );
                          })
                        )}
                      </View>

                      <View style={{ marginTop: 10 }}>
                        <TouchableOpacity
                          disabled={!selectedControlType}
                          onPress={() => {
                            try {
                              openAddTemplateModal();
                            } catch (_e) {}
                          }}
                          style={{
                            alignSelf: 'flex-start',
                            backgroundColor: selectedControlType ? '#1976D2' : '#B0BEC5',
                            paddingVertical: 10,
                            paddingHorizontal: 14,
                            borderRadius: 10,
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 8,
                          }}
                        >
                          <Ionicons name="add" size={16} color="#fff" />
                          <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Lägg till mall</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>

                  <View style={{ marginTop: 12 }}>
                    <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                      Tips: Högerklicka på ett företagsnamn i listan till vänster och välj "Lägg till kontrolltyp".
                      {'\n'}Högerklicka på en kontrolltyp för att byta namn, aktivera/dölja eller radera.
                      {'\n'}Dra och släpp mallar på en mapp för att flytta dem.
                    </Text>
                  </View>
                </>
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
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>Ny kontrolltyp</Text>
                </View>

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
                      if (!companyId || !name) return;
                      try {
                        setSavingControlType(true);
                        await createCompanyControlType({ name, icon: selectedIcon, color: selectedIconColor }, companyId);
                        setNewControlTypeName('');
                        setShowAddModal(false);
                        try {
                          const list = await fetchCompanyControlTypes(companyId);
                          setControlTypes(Array.isArray(list) && list.length > 0 ? list : DEFAULT_CONTROL_TYPES);
                        } catch (_e) {}
                      } catch (_e) {
                      } finally {
                        setSavingControlType(false);
                      }
                    }}
                    disabled={savingControlType || !newControlTypeName.trim()}
                    style={{
                      backgroundColor: savingControlType || !newControlTypeName.trim() ? '#B0BEC5' : '#6A1B9A',
                      paddingVertical: 8,
                      paddingHorizontal: 14,
                      borderRadius: 8,
                      alignItems: 'center',
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>
                      {savingControlType ? 'Sparar…' : 'Spara kontrolltyp'}
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
