import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { Alert, FlatList, ImageBackground, KeyboardAvoidingView, Platform, Text, TextInput, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import { auth, createCompanyMall, DEFAULT_CONTROL_TYPES, deleteCompanyMall, fetchCompanyControlTypes, fetchCompanyMallar, updateCompanyMall } from '../components/firebase';
import { CompanyHeaderLogo, DigitalKontrollHeaderLogo } from '../components/HeaderComponents';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageTemplates({ route, navigation }) {
  const DESCRIPTION_MAX_LENGTH = 50;
  const META_FIELD_CONFIG = [
    { key: 'project', label: 'Projekt', defaultEnabled: true },
    { key: 'date', label: 'Datum', defaultEnabled: true },
    { key: 'weather', label: 'Väder', defaultEnabled: false },
    { key: 'location', label: 'Plats/arbetsplats', defaultEnabled: false },
    { key: 'responsible', label: 'Ansvarig person', defaultEnabled: true },
    { key: 'participants', label: 'Deltagare', defaultEnabled: false },
    { key: 'subcontractor', label: 'Entreprenör/underentreprenör', defaultEnabled: false },
    { key: 'projectPart', label: 'Projekt/delmoment', defaultEnabled: false },
    { key: 'notes', label: 'Övriga anteckningar', defaultEnabled: true },
  ];
  const SIGNATURE_CONFIG = [
    { key: 'responsible', label: 'Signatur ansvarig', defaultEnabled: true },
    { key: 'client', label: 'Signatur beställare', defaultEnabled: false },
    { key: 'inspector', label: 'Signatur kontrollant', defaultEnabled: false },
  ];
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDescription, setNewDescription] = useState('');
  const [controlType, setControlType] = useState('');
  const [templatesVersion, setTemplatesVersion] = useState(0);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [hoveredTemplateId, setHoveredTemplateId] = useState(null);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null); // null = skapa ny, objekt = redigera befintlig mall
  const [modalControlType, setModalControlType] = useState('');
  const [modalTypePickerOpen, setModalTypePickerOpen] = useState(false);
  const [typePickerOpen, setTypePickerOpen] = useState(false);
  const [modalMetaFields, setModalMetaFields] = useState(null);
  const [modalSignatures, setModalSignatures] = useState(null);
  const [modalVersion, setModalVersion] = useState('1');
  const [modalMetaSectionOpen, setModalMetaSectionOpen] = useState(false);
  const [modalSignatureSectionOpen, setModalSignatureSectionOpen] = useState(false);
  const [modalAuthorSectionOpen, setModalAuthorSectionOpen] = useState(false);
  const [modalControlSectionOpen, setModalControlSectionOpen] = useState(false);
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const lastClickRef = useRef({ id: null, time: 0 });
  const [listContextMenu, setListContextMenu] = useState(null);
  const [hasClickedCompanyInSidebar, setHasClickedCompanyInSidebar] = useState(false);

  const handleWheelScroll = (e) => {
    try {
      const target = e.currentTarget || (e.nativeEvent && e.nativeEvent.target);
      if (!target) return;
      const deltaY = typeof e.deltaY === 'number' ? e.deltaY : (e.nativeEvent && typeof e.nativeEvent.deltaY === 'number' ? e.nativeEvent.deltaY : 0);
      const scrollTop = target.scrollTop || 0;
      const scrollHeight = target.scrollHeight || 0;
      const clientHeight = target.clientHeight || 0;
      const isScrollingDown = deltaY > 0;
      const isScrollingUp = deltaY < 0;

      const atBottom = scrollTop + clientHeight >= scrollHeight - 1;
      const atTop = scrollTop <= 0;

      if ((isScrollingDown && atBottom) || (isScrollingUp && atTop)) {
        if (typeof e.preventDefault === 'function') e.preventDefault();
        if (typeof e.stopPropagation === 'function') e.stopPropagation();
      }
    } catch (_e) {}
  };

  useEffect(() => {
    try {
      navigation.setOptions({
        headerTitle: () => null,
        headerLeft: () => (
          <View style={{ paddingLeft: 0, height: '100%', justifyContent: 'center' }}>
            <DigitalKontrollHeaderLogo />
          </View>
        ),
        headerRight: () => (
          <View style={{ paddingRight: 0, height: '100%', justifyContent: 'center' }}>
            <CompanyHeaderLogo />
          </View>
        ),
        headerBackTitle: '',
      });
    } catch (_e) {}
  }, [navigation]);

  const [allowedTools, setAllowedTools] = useState(false);
  const [canSeeAllCompanies, setCanSeeAllCompanies] = useState(false);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  // Ladda kontrolltyper per företag (standard + ev. företags-specifika)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const list = await fetchCompanyControlTypes(companyId || null);
        if (mounted && Array.isArray(list) && list.length > 0) {
          setControlTypes(list);
        } else if (mounted) {
          setControlTypes(DEFAULT_CONTROL_TYPES);
        }
      } catch (_e) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);


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

  useEffect(() => {
    (async () => {
      try {
        if (!companyId) {
          setTemplates([]);
          setSelectedTemplateId(null);
          return;
        }
        setLoading(true);
        const items = await fetchCompanyMallar(companyId);
        const list = Array.isArray(items) ? items : [];
        setTemplates(list);
        // Om vi har ett valt templateId, försök återställa markeringen
        if (selectedTemplateId) {
          const exists = list.some(t => String(t.id) === String(selectedTemplateId));
          if (!exists) {
            setSelectedTemplateId(null);
          }
        }
      } catch (e) {
        console.warn(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [companyId, selectedTemplateId]);

  // Lyssna på sidomenyn när mallar uppdateras (t.ex. raderas eller dölj/aktiveras via högerklick)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    if (typeof window === 'undefined') return undefined;

    const handler = (event) => {
      try {
        const cid = String(event?.detail?.companyId || '').trim();
        if (!cid || String(cid) !== String(companyId || '').trim()) return;
      } catch (_e) {}

      (async () => {
        try {
          if (!companyId) {
            setTemplates([]);
            setSelectedTemplateId(null);
            return;
          }
          setLoading(true);
          const items = await fetchCompanyMallar(companyId);
          const list = Array.isArray(items) ? items : [];
          setTemplates(list);
          if (selectedTemplateId) {
            const exists = list.some(t => String(t.id) === String(selectedTemplateId));
            if (!exists) {
              setSelectedTemplateId(null);
            }
          }
        } catch (e) {
          console.warn(e);
        } finally {
          setLoading(false);
        }
      })();
    };

    window.addEventListener('dkTemplatesUpdated', handler);
    return () => {
      try { window.removeEventListener('dkTemplatesUpdated', handler); } catch (_e) {}
    };
  }, [companyId, selectedTemplateId]);

  const handleAddTemplate = async (overrideControlType) => {
    if (!companyId) return Alert.alert('Fel', 'Välj först ett företag till vänster.');
    const title = String(newTitle || '').trim();
    if (!title) return Alert.alert('Fel', 'Ange en titel för mallen.');
     const ct = String(overrideControlType || modalControlType || controlType || '').trim();
     if (!ct) return Alert.alert('Fel', 'Välj vilken kontrolltyp mallen gäller.');

    const metaFields = modalMetaFields || (() => {
      const base = {};
      META_FIELD_CONFIG.forEach(cfg => {
        base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
      });
      return base;
    })();

    const signatures = modalSignatures || (() => {
      const base = {};
      SIGNATURE_CONFIG.forEach(cfg => {
        base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
      });
      return base;
    })();

    const defaultLayout = {
      version: 1,
      metaFields,
      sections: [
        {
          id: 'section-1',
          title: 'Kontrollpunkter',
          fields: [],
        },
      ],
      signatures,
    };

    // Tillåt versionsnummer med punkter (t.ex. 1.0.0 eller 100.00).
    // Ta bort ev. inledande "v"/"V" och spara resten som text.
    let rawVersion = String(modalVersion || '').trim();
    if (!rawVersion) rawVersion = '1';
    if (/^[vV]/.test(rawVersion)) {
      rawVersion = rawVersion.slice(1).trim();
      if (!rawVersion) rawVersion = '1';
    }
    const effectiveVersion = rawVersion;

    try {
      await createCompanyMall({ title, description: newDescription, controlType: ct, layout: defaultLayout, version: effectiveVersion }, companyId);
      setNewTitle('');
      setNewDescription('');
      setShowAddModal(false);
      const items = await fetchCompanyMallar(companyId);
      const list = Array.isArray(items) ? items : [];
      setTemplates(list);
      // Markera den senast skapade mallen om möjligt
      try {
        const last = list[list.length - 1];
        if (last && last.id) setSelectedTemplateId(last.id);
      } catch (_e) {}
      setTemplatesVersion(v => v + 1);
      try {
        Alert.alert('Mall skapad', `Mallen har skapats under kontrolltypen "${ct}".`);
      } catch (_e) {}
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const KLICKAhandleDeleteTemplate = (id) => {
    if (!companyId || !id) return;

    const performDelete = async () => {
      try {
        await deleteCompanyMall({ id }, companyId);
        const items = await fetchCompanyMallar(companyId);
        const list = Array.isArray(items) ? items : [];
        setTemplates(list);
        if (selectedTemplateId && String(selectedTemplateId) === String(id)) {
          setSelectedTemplateId(null);
        }
        setTemplatesVersion(v => v + 1);
        try {
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId } }));
          }
        } catch (_e) {}
      } catch (e) {
        Alert.alert('Fel', String(e?.message || e));
      }
    };

    try {
      if (Platform.OS === 'web') {
        if (typeof window !== 'undefined') {
          const ok = window.confirm('Är du säker på att du vill ta bort den här mallen?');
          if (!ok) return;
        }
        performDelete();
        return;
      }

      Alert.alert(
        'Ta bort mall',
        'Är du säker på att du vill ta bort den här mallen?',
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Ta bort',
            style: 'destructive',
            onPress: performDelete,
          },
        ]
      );
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleTemplateRowPress = (tpl) => {
    if (!tpl) return;
    setSelectedTemplateId(prev => (prev && String(prev) === String(tpl.id) ? prev : tpl.id));

    if (Platform.OS === 'web') {
      const now = Date.now();
      const last = lastClickRef.current || { id: null, time: 0 };
      const DOUBLE_CLICK_MS = 350;

      if (last.id === tpl.id && now - last.time < DOUBLE_CLICK_MS) {
        // Double-click: open inline preview
        lastClickRef.current = { id: null, time: 0 };
        setPreviewTemplate(tpl);
        return;
      }

      lastClickRef.current = { id: tpl.id, time: now };
    } else {
      // Native: treat single tap as preview for now
      setPreviewTemplate(tpl);
    }
  };

  const getEffectiveLayout = (template) => {
    const raw = (template && template.layout) ? template.layout : {};
    const metaFieldsRaw = raw.metaFields || {};
    const signaturesRaw = raw.signatures || {};

    const metaFields = META_FIELD_CONFIG.reduce((acc, cfg) => {
      const existing = metaFieldsRaw[cfg.key] || {};
      acc[cfg.key] = {
        enabled: typeof existing.enabled === 'boolean' ? existing.enabled : cfg.defaultEnabled,
        label: existing.label || cfg.label,
      };
      return acc;
    }, {});

    const signatures = SIGNATURE_CONFIG.reduce((acc, cfg) => {
      const existing = signaturesRaw[cfg.key] || {};
      acc[cfg.key] = {
        enabled: typeof existing.enabled === 'boolean' ? existing.enabled : cfg.defaultEnabled,
        label: existing.label || cfg.label,
      };
      return acc;
    }, {});

    const sections = Array.isArray(raw.sections) && raw.sections.length > 0
      ? raw.sections
      : [
          {
            id: 'section-1',
            title: 'Kontrollpunkter',
            fields: [],
          },
        ];

    return {
      ...raw,
      metaFields,
      signatures,
      sections,
    };
  };

  const buildChecklistFromLayout = (layout) => {
    try {
      if (!layout || !Array.isArray(layout.sections)) return [];
      const sections = layout.sections || [];
      const out = sections
        .map((section) => {
          const label = String(section?.title || section?.label || '').trim();
          const fields = Array.isArray(section?.fields) ? section.fields : [];
          const points = fields
            .map((field) => String(field?.label || field?.title || '').trim())
            .filter(Boolean);
          if (!label && points.length === 0) return null;
          return { label, points };
        })
        .filter(Boolean);
      return out;
    } catch (_e) {
      return [];
    }
  };

  const handleSaveEditedTemplate = async () => {
    if (!companyId || !editingTemplate) return;

    const title = String(newTitle || '').trim();
    const description = String(newDescription || '').trim();
    const ct = String(modalControlType || controlType || '').trim();
    if (!title || !ct) {
      Alert.alert('Fel', 'Ange både kontrolltyp och namn på mallen.');
      return;
    }

    const baseLayout = getEffectiveLayout(editingTemplate);
    const nextLayout = {
      ...baseLayout,
      metaFields: modalMetaFields || baseLayout.metaFields || {},
      signatures: modalSignatures || baseLayout.signatures || {},
    };

    // Tillåt versionsnummer med punkter (t.ex. 1.0.0 eller 100.00).
    // Ta bort ev. inledande "v"/"V" och spara resten som text.
    let rawVersion = String(modalVersion || '').trim();
    if (!rawVersion) rawVersion = String(editingTemplate.version || '1');
    if (/^[vV]/.test(rawVersion)) {
      rawVersion = rawVersion.slice(1).trim();
      if (!rawVersion) rawVersion = String(editingTemplate.version || '1');
    }
    const effectiveVersion = rawVersion;

    try {
      await updateCompanyMall(
        {
          id: editingTemplate.id,
          patch: {
            title,
            description,
            controlType: ct,
            layout: nextLayout,
            version: effectiveVersion,
          },
        },
        companyId,
      );

      const items = await fetchCompanyMallar(companyId);
      const list = Array.isArray(items) ? items : [];
      setTemplates(list);
      setSelectedTemplateId(editingTemplate.id);
      setTemplatesVersion(v => v + 1);
      setShowAddModal(false);
      setEditingTemplate(null);
      try {
        Alert.alert('Mall uppdaterad', `Mallen "${title}" har sparats.`);
      } catch (_e) {}
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleToggleMetaField = async (template, key) => {
    if (!template || !key) return;
    const layout = getEffectiveLayout(template);
    const current = layout.metaFields[key];
    const nextLayout = {
      ...layout,
      metaFields: {
        ...layout.metaFields,
        [key]: { ...current, enabled: !current.enabled },
      },
    };

    setTemplates(prev => prev.map(t => (t.id === template.id ? { ...t, layout: nextLayout } : t)));
    try {
      await updateCompanyMall({ id: template.id, patch: { layout: nextLayout } }, companyId);
      setTemplatesVersion(v => v + 1);
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const handleToggleSignatureField = async (template, key) => {
    if (!template || !key) return;
    const layout = getEffectiveLayout(template);
    const current = layout.signatures[key];
    const nextLayout = {
      ...layout,
      signatures: {
        ...layout.signatures,
        [key]: { ...current, enabled: !current.enabled },
      },
    };

    setTemplates(prev => prev.map(t => (t.id === template.id ? { ...t, layout: nextLayout } : t)));
    try {
      await updateCompanyMall({ id: template.id, patch: { layout: nextLayout } }, companyId);
      setTemplatesVersion(v => v + 1);
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e));
    }
  };

  const renderTemplate = ({ item }) => {
    const isHovered = hoveredTemplateId && String(hoveredTemplateId) === String(item.id);
    const isHidden = !!item.hidden;
    const creatorName = (() => {
      const cb = item && item.createdBy ? item.createdBy : null;
      if (!cb) return '';
      const name = cb.displayName && String(cb.displayName).trim();
      const email = cb.email && String(cb.email).trim();
      return name || email || '';
    })();
    const createdDate = (() => {
      try {
        const ts = item && item.createdAt ? item.createdAt : null;
        if (!ts) return '';
        if (typeof ts.toDate === 'function') {
          return ts.toDate().toLocaleDateString('sv-SE');
        }
        if (ts instanceof Date) {
          return ts.toLocaleDateString('sv-SE');
        }
        return '';
      } catch (_e) {
        return '';
      }
    })();
    const versionLabel = item && item.version ? String(item.version) : '';

    return (
      <View
        style={{
          paddingVertical: 8,
          borderBottomWidth: 1,
          borderColor: '#f0f0f0',
          backgroundColor: isHovered ? '#eee' : '#fff',
          paddingRight: 8,
        }}
        onMouseEnter={() => setHoveredTemplateId(item.id)}
        onMouseLeave={() => setHoveredTemplateId(prev => (prev && String(prev) === String(item.id) ? null : prev))}
        onContextMenu={(e) => {
          if (Platform.OS !== 'web') return;
          try {
            if (e && typeof e.preventDefault === 'function') e.preventDefault();
            if (e && typeof e.stopPropagation === 'function') e.stopPropagation();
          } catch (_e) {}

          const native = e && e.nativeEvent ? e.nativeEvent : e;
          const x = (native && (native.pageX || native.clientX)) || 0;
          const y = (native && (native.pageY || native.clientY)) || 0;

          setSelectedTemplateId(item.id);
          setListContextMenu({
            x,
            y,
            template: item,
          });
        }}
      >
        <TouchableOpacity
          onPress={() => handleTemplateRowPress(item)}
          style={{ flexDirection: 'row', alignItems: 'center' }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
            {/* Rubrik – tar all yta till vänster */}
            <View style={{ flex: 1, marginRight: 8 }}>
              <Text
                style={{
                  fontSize: 12,
                  color: isHidden ? '#9E9E9E' : '#000',
                  fontStyle: isHidden ? 'italic' : 'normal',
                }}
                numberOfLines={1}
              >
                {(item.title || 'Namnlös mall') + (isHidden ? ' (inaktiv)' : '')}
              </Text>
            </View>
            {/* Skapad av och Datum i en kompakt grupp längst till höger */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
              <View style={{ width: 130, marginRight: 8 }}>
                <Text
                  style={{ fontSize: 12, color: '#607D8B' }}
                  numberOfLines={1}
                >
                  {creatorName}
                </Text>
              </View>
              <View style={{ width: 80, marginRight: 8 }}>
                <Text
                  style={{ fontSize: 12, color: '#607D8B' }}
                  numberOfLines={1}
                >
                  {createdDate}
                </Text>
              </View>
            </View>
          </View>
          <View
            style={{
              width: 128,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'flex-end',
              marginLeft: 4,
            }}
          >
            <Text style={{ fontSize: 12, color: '#455A64' }}>
              {versionLabel ? `v${versionLabel}` : ''}
            </Text>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

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
    const isMultiCompanyAdmin = !!canSeeAllCompanies;

    return (
      <RootContainer {...rootProps} style={{ flex: 1, width: '100%', minHeight: '100vh' }}>
        <View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.35)', zIndex: 0 }} />
        <MainLayout
          onSelectProject={(payload) => {
            try {
              if (payload?.createNew) return;
              const cid = String(payload?.companyId || payload?.id || '').trim();
              const tplId = payload?.templateId;
              const tpl = payload?.template;
              setCompanyId(cid || '');
              if (cid) {
                setHasClickedCompanyInSidebar(true);
              }
              if (tplId) {
                setSelectedTemplateId(tplId);
                if (tpl && tpl.controlType) {
                  setControlType(String(tpl.controlType));
                }

                // På webben: behandla dubbelklick i trädet som förhandsvisning av mallen
                if (Platform.OS === 'web' && tpl) {
                  const now = Date.now();
                  const last = lastClickRef.current || { id: null, time: 0 };
                  const DOUBLE_CLICK_MS = 350;
                  const clickId = `sidebar-${tpl.id}`;

                  if (last.id === clickId && now - last.time < DOUBLE_CLICK_MS) {
                    lastClickRef.current = { id: null, time: 0 };
                    setPreviewTemplate(tpl);
                  } else {
                    lastClickRef.current = { id: clickId, time: now };
                  }
                } else if (tpl) {
                  // Native: enkeltryck räcker för att visa förhandsvisning
                  setPreviewTemplate(tpl);
                }
              } else if (payload?.controlType) {
                setControlType(String(payload.controlType));
                setSelectedTemplateId(null);
              }
              if (payload?.openTemplateModal && cid && payload?.controlType) {
                const ctLabel = String(payload.controlType || '').trim();

                // Om en befintlig mall skickas med i payload => redigeringsläge
                if (tpl) {
                  setEditingTemplate(tpl);
                  setNewTitle(String(tpl.title || ''));
                  setNewDescription(String(tpl.description || ''));
                  setModalControlType(ctLabel || String(tpl.controlType || ''));
                  setControlType(ctLabel || String(tpl.controlType || ''));

                  const layout = getEffectiveLayout(tpl);
                  setModalMetaFields(layout.metaFields || null);
                  setModalSignatures(layout.signatures || null);
                  setModalVersion(String(tpl.version || '1'));
                } else {
                  // Skapa ny mall
                  setEditingTemplate(null);
                  setNewTitle('');
                  setNewDescription('');
                  setModalControlType(ctLabel);
                  setModalMetaFields(() => {
                    const base = {};
                    META_FIELD_CONFIG.forEach(cfg => {
                      base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
                    });
                    return base;
                  });
                  setModalSignatures(() => {
                    const base = {};
                    SIGNATURE_CONFIG.forEach(cfg => {
                      base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
                    });
                    return base;
                  });
                  setModalVersion('1');
                }

                setModalMetaSectionOpen(false);
                setModalControlSectionOpen(false);
                setModalSignatureSectionOpen(false);
                setModalAuthorSectionOpen(false);
                setShowAddModal(true);
              }
            } catch (_e) {}
          }}
          sidebarTitle="Mallar"
          sidebarIconName="copy-outline"
          sidebarIconColor="#00897B"
          sidebarSearchPlaceholder="Sök företag"
          sidebarCompaniesMode={true}
          sidebarShowMembers={false}
          sidebarRestrictCompanyId={sidebarRestrictId}
          sidebarHideCompanyActions={true}
          sidebarAutoExpandMembers={true}
          sidebarTemplatesMode={true}
          sidebarTemplatesVersion={templatesVersion}
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
                <View style={{ alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#222', paddingVertical: 6, paddingHorizontal: 12, alignItems: 'center', minWidth: 72 }}
                    onPress={async () => {
                      setLoggingOut(true);
                      try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
                      await auth.signOut();
                      setLoggingOut(false);
                      navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                    }}
                  >
                    <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>{loggingOut ? 'Loggar ut…' : 'Logga ut'}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          }
        >
          <View style={dashboardContainerStyle}>
            <View style={[dashboardCardStyle, { alignSelf: 'flex-start', width: 880, maxWidth: '100%' }] }>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                <TouchableOpacity
                  onPress={() => {
                    try {
                      if (previewTemplate) {
                        // Stäng endast förhandsvisningen av mallen och stanna kvar på sidan
                        setPreviewTemplate(null);
                        return;
                      }
                      navigation.goBack();
                    } catch (e) {}
                  }}
                  style={{ padding: 8, marginRight: 8 }}
                  accessibilityLabel="Tillbaka"
                >
                  <Ionicons name="chevron-back" size={20} color="#222" />
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                  <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: '#00897B', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                    <Ionicons name="copy-outline" size={14} color="#fff" />
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>
                    {previewTemplate ? `Förhandsvisning av mall: ${previewTemplate.title || 'Namnlös mall'}` : 'Mallar'}
                  </Text>
                </View>
              </View>

              <View style={{ maxWidth: 680 }}>
                {(!hasSelectedCompany || (isMultiCompanyAdmin && !hasClickedCompanyInSidebar)) && (
                  <View style={{
                    width: '84%',
                    marginLeft: '8%',
                    marginBottom: 12,
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    backgroundColor: '#FFF8E1',
                    borderWidth: 1,
                    borderColor: '#FFE082',
                  }}>
                    <Text style={{ fontSize: 13, color: '#5D4037' }}>
                      Välj ett företag i listan till vänster för att se och hantera dess mallar.
                    </Text>
                  </View>
                )}

                {!previewTemplate && (
                <View style={{ marginTop: 4, width: '100%', alignItems: 'flex-start' }}>
                  <Text style={{ marginBottom: 4, marginLeft: '8%', fontSize: 13, color: '#444' }}>Sammanfattning</Text>
                  <View
                    style={{
                      width: '84%',
                      marginLeft: '8%',
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      borderRadius: 6,
                      backgroundColor: '#f5f5f5',
                      borderWidth: 1,
                      borderColor: '#ddd',
                    }}
                  >
                    <Text style={{ color: '#333', fontSize: 13 }}>
                      {!hasSelectedCompany
                        ? 'Inget företag valt ännu.'
                        : (isMultiCompanyAdmin && !hasClickedCompanyInSidebar)
                          ? 'Välj ett företag i listan till vänster för att se dess mallar.'
                          : (loading
                            ? 'Läser mallar…'
                            : `Antal mallar: ${templates.length}`)}
                    </Text>
                  </View>
                </View>
                )}

                {!previewTemplate && (
                <View style={{ marginTop: 18, width: '84%', marginLeft: '8%', position: 'relative', zIndex: 10 }}>
                  <Text style={{ fontSize: 13, color: '#555', lineHeight: 18 }}>
                    Skapa och hantera återanvändbara mallar kopplade till företaget.
                    Dessa kan användas som underlag vid onboarding och uppsättning av projekt.
                  </Text>
                </View>
                )}

                {!previewTemplate && (
                <View style={{ marginTop: 18, width: '84%', marginLeft: '8%' }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Kontrolltyp</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setTypePickerOpen(o => !o)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      paddingVertical: 6,
                      paddingHorizontal: 8,
                      backgroundColor: '#fff',
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                        {(() => {
                          const ctMeta = (controlTypes || []).find(
                            (ct) => String(ct?.name || ct?.key || '').trim() === String(controlType || '').trim()
                          );
                          if (!ctMeta) return null;
                          return (
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                backgroundColor: ctMeta.color || '#00897B',
                                alignItems: 'center',
                                justifyContent: 'center',
                                marginRight: 6,
                              }}
                            >
                              <Ionicons
                                name={ctMeta.icon || 'document-text-outline'}
                                size={14}
                                color="#fff"
                              />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                          {controlType || 'Välj kontrolltyp'}
                        </Text>
                      </View>
                      <Ionicons
                        name={typePickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={16}
                        color="#555"
                      />
                    </View>
                  </TouchableOpacity>
                  {typePickerOpen && (
                    <View
                      style={{
                        position: 'absolute',
                        top: 40,
                        left: 0,
                        right: 0,
                        zIndex: 50,
                        marginTop: 4,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        maxHeight: 180,
                        overflow: 'auto',
                      }}
                      onWheel={handleWheelScroll}
                    >
                      {controlTypes.map((ct) => {
                        const label = ct.name || ct.key || '';
                        if (!label) return null;
                        const selected = String(label) === String(controlType || '');
                        return (
                          <TouchableOpacity
                            key={ct.id || ct.key || label}
                            onPress={() => {
                              setControlType(label);
                              setTypePickerOpen(false);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 6,
                              paddingHorizontal: 8,
                              backgroundColor: selected ? '#E0F2F1' : '#fff',
                            }}
                          >
                            <Ionicons
                              name={ct.icon || 'document-text-outline'}
                              size={14}
                              color={ct.color || '#455A64'}
                              style={{ marginRight: 6 }}
                            />
                            <Text style={{ fontSize: 13, color: '#263238' }}>{label}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Ny mall</Text>
                  <Text style={{ fontSize: 13, color: '#555', marginBottom: 8 }}>
                    Högerklicka på en kontrolltyp i listan till vänster och välj "Lägg till mall" eller använd knappen nedan.
                  </Text>
                  {!String(controlType || '').trim() && hasSelectedCompany && (
                    <Text style={{ fontSize: 12, color: '#D32F2F', marginBottom: 4 }}>
                      Välj först en kontrolltyp ovan för att kunna öppna formuläret.
                    </Text>
                  )}
                  {!hasSelectedCompany && (
                    <Text style={{ fontSize: 12, color: '#D32F2F', marginBottom: 4 }}>
                      Välj först ett företag till vänster.
                    </Text>
                  )}
                  {(() => {
                    const ct = String(controlType || '').trim();
                    const canOpen = hasSelectedCompany && !!ct;
                    return (
                  <TouchableOpacity
                    onPress={() => {
                      if (!canOpen) return;
                      setEditingTemplate(null);
                      setNewTitle('');
                      setNewDescription('');
                      setModalControlType(ct);
                      setModalMetaFields(() => {
                        const base = {};
                        META_FIELD_CONFIG.forEach(cfg => {
                          base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
                        });
                        return base;
                      });
                      setModalSignatures(() => {
                        const base = {};
                        SIGNATURE_CONFIG.forEach(cfg => {
                          base[cfg.key] = { enabled: cfg.defaultEnabled, label: cfg.label };
                        });
                        return base;
                      });
                      setModalVersion('1');
                      setModalMetaSectionOpen(false);
                      setModalControlSectionOpen(false);
                      setModalSignatureSectionOpen(false);
                      setModalAuthorSectionOpen(false);
                      setShowAddModal(true);
                    }}
                    disabled={!canOpen}
                    style={{
                      backgroundColor: canOpen ? '#00897B' : '#B0BEC5',
                      padding: 10,
                      borderRadius: 8,
                      marginTop: 4,
                      alignItems: 'center',
                      alignSelf: 'flex-start',
                      minWidth: 160,
                      opacity: canOpen ? 1 : 0.9,
                    }}
                  >
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Öppna formulär för ny mall</Text>
                  </TouchableOpacity>
                    );
                  })()}
                </View>
                )}

                {previewTemplate && (
                  <View style={{ marginTop: 22, width: '100%', alignItems: 'center' }}>
                    <View
                      style={{
                        width: 794,
                        maxWidth: '92%',
                        backgroundColor: '#fff',
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        borderRadius: 6,
                        paddingVertical: 24,
                        paddingHorizontal: 32,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.08,
                        shadowRadius: 6,
                        elevation: 1,
                      }}
                    >
                      {(() => {
                        const layout = getEffectiveLayout(previewTemplate);
                        const meta = (layout && layout.metaFields) ? layout.metaFields : {};
                        const today = new Date();
                        const todayStr = !isNaN(today) ? today.toISOString().slice(0, 10) : '';

                        const isEnabled = (key) => {
                          try {
                            const cfg = (META_FIELD_CONFIG || []).find(c => c.key === key);
                            const field = meta && meta[key] ? meta[key] : null;
                            if (!cfg && !field) return false;
                            if (field && typeof field.enabled === 'boolean') return field.enabled;
                            return cfg ? !!cfg.defaultEnabled : false;
                          } catch (_e) {
                            return false;
                          }
                        };

                        return (
                          <View>
                            {/* Företagslogga + horisontell linje samma som i formulären */}
                            <View style={{ marginBottom: 8 }}>
                              <CompanyHeaderLogo />
                            </View>
                            <View
                              style={{
                                height: 2,
                                backgroundColor: '#e0e0e0',
                                width: '100%',
                                marginBottom: 14,
                              }}
                            />

                            {/* Projekt */}
                            {isEnabled('project') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="document-text-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Projekt:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>12345 – Projektnamn (hämtas från valt projekt)</Text>
                              </View>
                            )}

                            {/* Datum */}
                            {isEnabled('date') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="calendar-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Datum:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>{`Skapad: ${todayStr || 'ÅÅÅÅ-MM-DD'}`}</Text>
                              </View>
                            )}

                            {/* Väder */}
                            {isEnabled('weather') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="partly-sunny" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Väderlek:</Text>
                                <View style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap' }}>
                                  {['Soligt', 'Delvis molnigt', 'Molnigt', 'Regn'].map(label => (
                                    <View
                                      key={label}
                                      style={{
                                        backgroundColor: '#f5f5f5',
                                        borderRadius: 12,
                                        paddingVertical: 3,
                                        paddingHorizontal: 9,
                                        marginRight: 6,
                                        marginBottom: 4,
                                      }}
                                    >
                                      <Text style={{ fontSize: 12.5, color: '#222' }}>{label}</Text>
                                    </View>
                                  ))}
                                </View>
                              </View>
                            )}

                            {/* Plats/arbetsplats */}
                            {isEnabled('location') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="document-text-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Plats/arbetsplats:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>Exempel: Byggarbetsplats / adress</Text>
                              </View>
                            )}

                            {/* Ansvarig person */}
                            {isEnabled('responsible') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="person-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Ansvarig person:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>Förnamn Efternamn (ansvarig för kontrollen)</Text>
                              </View>
                            )}

                            {/* Deltagare */}
                            {isEnabled('participants') && (
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8 }}>
                                <Ionicons name="person-outline" size={18} color="#1976D2" style={{ marginRight: 8, marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                    <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Deltagare:</Text>
                                    <Text style={{ fontSize: 14, color: '#555' }}>Person 1</Text>
                                  </View>
                                  <View style={{ marginLeft: 0 }}>
                                    {['Person 2', 'Person 3'].map(name => (
                                      <Text key={name} style={{ fontSize: 14, color: '#555' }}>{name}</Text>
                                    ))}
                                  </View>
                                </View>
                              </View>
                            )}

                            {/* Entreprenör/underentreprenör */}
                            {isEnabled('subcontractor') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="document-text-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Entreprenör/underentreprenör:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>Exempel: Företagsnamn AB</Text>
                              </View>
                            )}

                            {/* Projekt/delmoment */}
                            {isEnabled('projectPart') && (
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                                <Ionicons name="cube-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginRight: 6 }}>Projekt/delmoment:</Text>
                                <Text style={{ flex: 1, fontSize: 14, color: '#555' }}>Exempel: Stomme / Etapp 2</Text>
                              </View>
                            )}

                            {/* Övriga anteckningar */}
                            {isEnabled('notes') && (
                              <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 4 }}>
                                <Ionicons name="document-text-outline" size={18} color="#1976D2" style={{ marginRight: 8, marginTop: 2 }} />
                                <View style={{ flex: 1 }}>
                                  <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', marginBottom: 4 }}>Övriga anteckningar:</Text>
                                  <View style={{
                                    borderWidth: 1,
                                    borderColor: '#e0e0e0',
                                    borderRadius: 8,
                                    backgroundColor: '#fff',
                                    paddingVertical: 8,
                                    paddingHorizontal: 10,
                                  }}>
                                    <Text style={{ fontSize: 13, color: '#777' }}>
                                      Här kan du skriva kompletterande information eller noteringar som hör till kontrollen.
                                    </Text>
                                  </View>
                                </View>
                              </View>
                            )}
                          </View>
                        );
                      })()}
                    </View>
                  </View>
                )}

                {!typePickerOpen && !previewTemplate && (
                  <View style={{ marginTop: 22, width: '92%', marginLeft: '8%' }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 8 }}>Befintliga mallar</Text>
                    {hasSelectedCompany && String(controlType || '').trim() && templates.length > 0 && (
                      <Text style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
                        Visar mallar för kontrolltypen "{controlType}".
                      </Text>
                    )}
                    {hasSelectedCompany && !String(controlType || '').trim() && templates.length > 0 && (
                      <Text style={{ fontSize: 12, color: '#777', marginBottom: 4 }}>
                        Välj en kontrolltyp ovan för att filtrera listan.
                      </Text>
                    )}
                    {(() => {
                      const ct = String(controlType || '').trim();
                      const filtered = ct
                        ? templates.filter(t => String(t.controlType || '').trim() === ct)
                        : [];

                      return (
                        <>
                          {loading && hasSelectedCompany ? (
                            <Text style={{ fontSize: 13, color: '#666' }}>Laddar mallar…</Text>
                          ) : !hasSelectedCompany ? (
                            <Text style={{ fontSize: 13, color: '#666' }}>Välj ett företag för att se dess mallar.</Text>
                          ) : templates.length === 0 ? (
                            <Text style={{ fontSize: 13, color: '#666' }}>Inga mallar registrerade ännu.</Text>
                          ) : (
                            <>
                              <View
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  paddingVertical: 4,
                                  paddingRight: 8,
                                  borderBottomWidth: 1,
                                  borderColor: '#e0e0e0',
                                  backgroundColor: '#fafafa',
                                }}
                              >
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                  {/* Rubrik-kolumn – flexibel till vänster */}
                                  <View style={{ flex: 1, marginRight: 8 }}>
                                    <Text
                                      style={{
                                        fontSize: 12,
                                        fontWeight: '600',
                                        color: '#555',
                                      }}
                                      numberOfLines={1}
                                    >
                                      Rubrik
                                    </Text>
                                  </View>
                                  {/* Grupp med Skapad av och Datum längst till höger */}
                                  <View style={{ flexDirection: 'row', alignItems: 'center', marginLeft: 'auto' }}>
                                    <View style={{ width: 130, marginRight: 8 }}>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '600',
                                          color: '#555',
                                        }}
                                        numberOfLines={1}
                                      >
                                        Skapad av
                                      </Text>
                                    </View>
                                    <View style={{ width: 80, marginRight: 8 }}>
                                      <Text
                                        style={{
                                          fontSize: 12,
                                          fontWeight: '600',
                                          color: '#555',
                                        }}
                                        numberOfLines={1}
                                      >
                                        Datum
                                      </Text>
                                    </View>
                                  </View>
                                </View>
                                <View style={{ marginLeft: 4, width: 128, alignItems: 'flex-end' }}>
                                  <Text
                                    style={{
                                      fontSize: 12,
                                      fontWeight: '600',
                                      color: '#555',
                                    }}
                                    numberOfLines={1}
                                  >
                                    Version
                                  </Text>
                                </View>
                              </View>
                              {ct && filtered.length === 0 ? (
                                <Text style={{ fontSize: 13, color: '#D32F2F', marginTop: 6 }}>
                                  Inga mallar skapade.
                                </Text>
                              ) : (
                                <FlatList
                                  data={filtered}
                                  keyExtractor={(i) => String(i.id || Math.random())}
                                  renderItem={renderTemplate}
                                />
                              )}
                            </>
                          )}
                        </>
                      );
                    })()}
                  </View>
                )}

                {/* Tidigare visades "Mallinnehåll" här när en mall var markerad.
                    Det är nu borttaget från huvudsidan – innehållet hanteras i
                    stället i Ny/Redigera-mall-dialogen. */}
              </View>
            </View>
          </View>
        </MainLayout>
        {Platform.OS === 'web' && listContextMenu && (
          <ContextMenu
            visible={!!listContextMenu}
            x={listContextMenu.x || 0}
            y={listContextMenu.y || 0}
            onClose={() => setListContextMenu(null)}
            items={(() => {
              const tpl = listContextMenu && listContextMenu.template;
              const isHidden = !!(tpl && tpl.hidden);
              return [
                { key: 'edit', label: 'Redigera' },
                { key: isHidden ? 'activate' : 'hide', label: isHidden ? 'Aktivera' : 'Dölj' },
                { key: 'delete', label: 'Radera', danger: true },
              ];
            })()}
            onSelect={async (item) => {
              const ctx = listContextMenu;
              if (!ctx || !ctx.template || !companyId || !item) return;

              const tpl = ctx.template;

              const notifyTemplatesChange = () => {
                try {
                  if (Platform.OS === 'web' && typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('dkTemplatesUpdated', { detail: { companyId } }));
                  }
                } catch (_e) {}
              };

              try {
                if (item.key === 'edit') {
                  try {
                    const editTpl = tpl;
                    if (!editTpl) return;
                    setEditingTemplate(editTpl);
                    setNewTitle(String(editTpl.title || ''));
                    setNewDescription(String(editTpl.description || ''));

                    const ctLabel = String(editTpl.controlType || '').trim();
                    if (ctLabel) {
                      setModalControlType(ctLabel);
                      setControlType(ctLabel);
                    }

                    const layout = getEffectiveLayout(editTpl);
                    setModalMetaFields(layout.metaFields || null);
                    setModalSignatures(layout.signatures || null);
                    setModalVersion(String(editTpl.version || '1'));

                    setModalMetaSectionOpen(false);
                    setModalControlSectionOpen(false);
                    setModalSignatureSectionOpen(false);
                    setModalAuthorSectionOpen(false);
                    setShowAddModal(true);
                  } catch (_e) {}
                  return;
                }

                if (item.key === 'hide' || item.key === 'activate') {
                  const targetHidden = item.key === 'hide';
                  await updateCompanyMall({ id: tpl.id, patch: { hidden: targetHidden } }, companyId);
                  setTemplates(prev => prev.map(t => (t.id === tpl.id ? { ...t, hidden: targetHidden } : t)));
                  notifyTemplatesChange();
                  return;
                }

                if (item.key === 'delete') {
                  handleDeleteTemplate(tpl.id);
                  return;
                }
              } catch (e) {
                Alert.alert('Fel', String(e?.message || e));
              }
            }}
          />
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
                width: 460,
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
                <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#00897B', alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                  <Ionicons name="copy-outline" size={16} color="#fff" />
                </View>
                <Text style={{ fontSize: 16, fontWeight: '700', color: '#222' }}>
                  {editingTemplate
                    ? `Redigera mall: ${String(editingTemplate.title || 'Namnlös mall')}`
                    : 'Ny mall'}
                </Text>
              </View>

              <View style={{ marginBottom: 10 }}>
                <Text style={{ fontSize: 13, color: '#555', marginBottom: 4 }}>Kontrolltyp</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setModalTypePickerOpen(o => !o)}
                  style={{
                    borderWidth: 1,
                    borderColor: '#ddd',
                    borderRadius: 8,
                    paddingVertical: 6,
                    paddingHorizontal: 8,
                    backgroundColor: '#fff',
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minWidth: 200 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                  {(() => {
                    const ctMeta = (controlTypes || []).find(
                      (ct) => String(ct?.name || ct?.key || '').trim() === String(modalControlType || controlType || '').trim()
                    );
                    if (!ctMeta) return null;
                    return (
                      <View
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          backgroundColor: ctMeta.color || '#00897B',
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 6,
                        }}
                      >
                        <Ionicons
                          name={ctMeta.icon || 'document-text-outline'}
                          size={14}
                          color="#fff"
                        />
                      </View>
                    );
                  })()}
                    <Text style={{ fontSize: 13, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                      {modalControlType || controlType || 'Välj kontrolltyp'}
                    </Text>
                  </View>
                  <Ionicons
                    name={modalTypePickerOpen ? 'chevron-up' : 'chevron-down'}
                    size={16}
                    color="#555"
                  />
                  </View>
                </TouchableOpacity>
                {modalTypePickerOpen && (
                  <View
                    style={{
                      marginTop: 4,
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      backgroundColor: '#fff',
                      maxHeight: 180,
                      overflow: 'auto',
                    }}
                    onWheel={handleWheelScroll}
                  >
                    {controlTypes.map((ct) => {
                      const label = ct.name || ct.key || '';
                      if (!label) return null;
                      const selected = String(label) === String(modalControlType || controlType || '');
                      return (
                        <TouchableOpacity
                          key={ct.id || ct.key || label}
                          onPress={() => {
                            setModalControlType(label);
                            setControlType(label);
                            setModalTypePickerOpen(false);
                          }}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            backgroundColor: selected ? '#E0F2F1' : '#fff',
                          }}
                        >
                          <Ionicons
                            name={ct.icon || 'document-text-outline'}
                            size={14}
                            color={ct.color || '#455A64'}
                            style={{ marginRight: 6 }}
                          />
                          <Text style={{ fontSize: 13, color: '#263238' }}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                )}
              </View>

              <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Namn på mall</Text>
              <TextInput
                value={newTitle}
                onChangeText={setNewTitle}
                placeholder="Titel på mall"
                placeholderTextColor="#D32F2F"
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  padding: 8,
                  borderRadius: 6,
                  backgroundColor: '#fff',
                  marginBottom: 10,
                  fontSize: 14,
                  color: '#111',
                }}
              />

              <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Beskrivning (valfritt)</Text>
              <TextInput
                value={newDescription}
                onChangeText={setNewDescription}
                placeholder="Kort beskrivning av mallen"
                multiline
                maxLength={DESCRIPTION_MAX_LENGTH}
                placeholderTextColor="#D32F2F"
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  padding: 8,
                  borderRadius: 6,
                  minHeight: 60,
                  textAlignVertical: 'top',
                  backgroundColor: '#fff',
                  marginBottom: 10,
                  fontSize: 14,
                  color: '#111',
                }}
              />

              <Text style={{ fontSize: 13, fontWeight: '600', marginBottom: 6 }}>Innehåll i mall</Text>

              <View
                style={{
                  marginTop: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  backgroundColor: '#fafafa',
                  marginBottom: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setModalMetaSectionOpen(open => {
                      const next = !open;
                      if (next) {
                        setModalSignatureSectionOpen(false);
                        setModalAuthorSectionOpen(false);
                        setModalControlSectionOpen(false);
                      }
                      return next;
                    });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>Standardfält i toppen</Text>
                  <Ionicons
                    name={modalMetaSectionOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#555"
                  />
                </TouchableOpacity>
                {modalMetaSectionOpen && (META_FIELD_CONFIG || []).map((cfg) => {
                  const field = (modalMetaFields && modalMetaFields[cfg.key]) || { enabled: cfg.defaultEnabled, label: cfg.label };
                  const enabled = !!field.enabled;
                  return (
                    <TouchableOpacity
                      key={cfg.key}
                      onPress={() => {
                        setModalMetaFields(prev => {
                          const base = { ...(prev || {}) };
                          const current = base[cfg.key] || { enabled: cfg.defaultEnabled, label: cfg.label };
                          base[cfg.key] = { ...current, enabled: !current.enabled };
                          return base;
                        });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
                    >
                      <Ionicons
                        name={enabled ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={enabled ? '#00897B' : '#B0BEC5'}
                        style={{ marginRight: 8 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#222' }}>{field.label || cfg.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                style={{
                  marginTop: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  backgroundColor: '#fafafa',
                  marginBottom: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setModalControlSectionOpen(open => {
                      const next = !open;
                      if (next) {
                        setModalMetaSectionOpen(false);
                        setModalSignatureSectionOpen(false);
                        setModalAuthorSectionOpen(false);
                      }
                      return next;
                    });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>Kontroll</Text>
                  <Ionicons
                    name={modalControlSectionOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#555"
                  />
                </TouchableOpacity>
                {modalControlSectionOpen && (
                  <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: '#555' }}>
                      Här kommer kontroll-specifika inställningar att läggas till.
                    </Text>
                  </View>
                )}
              </View>

              <View
                style={{
                  marginTop: 4,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  backgroundColor: '#fafafa',
                  marginBottom: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setModalSignatureSectionOpen(open => {
                      const next = !open;
                      if (next) {
                        setModalMetaSectionOpen(false);
                        setModalAuthorSectionOpen(false);
                        setModalControlSectionOpen(false);
                      }
                      return next;
                    });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingVertical: 8 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>Signaturer</Text>
                  <Ionicons
                    name={modalSignatureSectionOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#555"
                  />
                </TouchableOpacity>
                {modalSignatureSectionOpen && (SIGNATURE_CONFIG || []).map((cfg) => {
                  const field = (modalSignatures && modalSignatures[cfg.key]) || { enabled: cfg.defaultEnabled, label: cfg.label };
                  const enabled = !!field.enabled;
                  return (
                    <TouchableOpacity
                      key={cfg.key}
                      onPress={() => {
                        setModalSignatures(prev => {
                          const base = { ...(prev || {}) };
                          const current = base[cfg.key] || { enabled: cfg.defaultEnabled, label: cfg.label };
                          base[cfg.key] = { ...current, enabled: !current.enabled };
                          return base;
                        });
                      }}
                      style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 4 }}
                    >
                      <Ionicons
                        name={enabled ? 'checkmark-circle' : 'ellipse-outline'}
                        size={16}
                        color={enabled ? '#00897B' : '#B0BEC5'}
                        style={{ marginRight: 8 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: '#222' }}>{field.label || cfg.label}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View
                style={{
                  marginTop: 4,
                  borderRadius: 8,
                  backgroundColor: '#F5F5F5',
                  borderWidth: 1,
                  borderColor: '#E0E0E0',
                  marginBottom: 10,
                }}
              >
                <TouchableOpacity
                  onPress={() => {
                    setModalAuthorSectionOpen(open => {
                      const next = !open;
                      if (next) {
                        setModalMetaSectionOpen(false);
                        setModalSignatureSectionOpen(false);
                      }
                      return next;
                    });
                  }}
                  style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 10, paddingTop: 8, paddingBottom: 4 }}
                >
                  <Text style={{ fontSize: 12, fontWeight: '600', color: '#333' }}>Skapad av & version</Text>
                  <Ionicons
                    name={modalAuthorSectionOpen ? 'chevron-up' : 'chevron-down'}
                    size={14}
                    color="#555"
                  />
                </TouchableOpacity>
                {modalAuthorSectionOpen && (
                  <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>
                      Skapad av
                    </Text>
                    <Text style={{ fontSize: 13, color: '#222', marginBottom: 6 }}>
                      {(() => {
                        const u = auth && auth.currentUser ? auth.currentUser : null;
                        const name = (u && u.displayName) ? String(u.displayName).trim() : '';
                        const email = (u && u.email) ? String(u.email).trim() : '';
                        return name || email || 'Okänd användare';
                      })()}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>Skapad datum</Text>
                    <Text style={{ fontSize: 13, color: '#222', marginBottom: 6 }}>
                      {new Date().toLocaleDateString('sv-SE')}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#555', marginBottom: 2 }}>Version</Text>
                    <TextInput
                      value={modalVersion}
                      onChangeText={setModalVersion}
                      placeholder="1"
                      // Tillåt fria versionssträngar, inklusive punkter (t.ex. 1.0.0)
                      keyboardType={Platform.OS === 'ios' ? 'numbers-and-punctuation' : 'default'}
                      style={{ borderWidth: 1, borderColor: '#ddd', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, backgroundColor: '#fff', maxWidth: 80 }}
                    />
                  </View>
                )}
              </View>

              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 4 }}>
                <TouchableOpacity
                  onPress={() => {
                    setShowAddModal(false);
                    setEditingTemplate(null);
                  }}
                  style={{ paddingVertical: 8, paddingHorizontal: 12, marginRight: 8 }}
                >
                  <Text style={{ fontSize: 13, color: '#555' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => {
                    if (editingTemplate) return handleSaveEditedTemplate();
                    return handleAddTemplate(modalControlType);
                  }}
                  style={{
                    backgroundColor: !newTitle.trim() || !String(modalControlType || controlType || '').trim() ? '#B0BEC5' : '#00897B',
                    paddingVertical: 8,
                    paddingHorizontal: 14,
                    borderRadius: 8,
                    alignItems: 'center',
                  }}
                  disabled={!newTitle.trim() || !String(modalControlType || controlType || '').trim()}
                >
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }}>Spara mall</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        )}
      </RootContainer>
    );
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
      <View style={{ padding: 16 }}>
        <Text style={{ fontSize: 18, fontWeight: '700', marginBottom: 12 }}>Mallar</Text>
        <Text style={{ fontSize: 14, color: '#555', marginBottom: 12 }}>
          Skapa och hantera återanvändbara mallar kopplade till ditt företag.
        </Text>

        <View style={{ marginTop: 4 }}>
          <Text style={{ marginBottom: 6 }}>Titel</Text>
          <TextInput
            value={newTitle}
            onChangeText={setNewTitle}
            placeholder="Titel på mall"
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6 }}
          />
          <Text style={{ marginTop: 12, marginBottom: 6 }}>Beskrivning (valfritt)</Text>
          <TextInput
            value={newDescription}
            onChangeText={setNewDescription}
            placeholder="Kort beskrivning"
            multiline
            maxLength={DESCRIPTION_MAX_LENGTH}
            style={{ borderWidth: 1, borderColor: '#ddd', padding: 8, borderRadius: 6, minHeight: 60, textAlignVertical: 'top' }}
          />
          <TouchableOpacity
            onPress={handleAddTemplate}
            style={{ backgroundColor: '#00897B', padding: 12, borderRadius: 8, marginTop: 12, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontWeight: '700' }}>Lägg till mall</Text>
          </TouchableOpacity>
        </View>

        <View style={{ marginTop: 18 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', marginBottom: 8 }}>Befintliga mallar</Text>
          {loading ? (
            <Text style={{ color: '#666' }}>Laddar mallar…</Text>
          ) : (
            <FlatList
              data={templates}
              keyExtractor={(i) => String(i.id || Math.random())}
              renderItem={renderTemplate}
            />
          )}
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}
