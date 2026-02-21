/**
 * Generic Phase Layout - Works for all project phases
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import DigitalkontrollsUtforskare from '../../../components/common/DigitalkontrollsUtforskare';
import { CreateFolderModal, DeleteFolderConfirmModal, RenameFolderModal } from '../../../components/common/Modals/SectionFolderModals';
import ProjectSubTopbar from '../../../components/common/ProjectSubTopbar';
import ProjectTopbar from '../../../components/common/ProjectTopbar';
import { subscribeLatestProjectFFUAnalysis, subscribeLatestProjectKalkylAnalysis } from '../../../components/firebase';
import { ICON_RAIL } from '../../../constants/iconRailTheme';
import { ChecklistEditProvider } from '../../../contexts/ChecklistEditContext';
import { DEFAULT_PHASE, getProjectPhase, PROJECT_PHASES } from '../../../features/projects/constants';
import { stripNumberPrefixForDisplay } from '../../../utils/labelUtils';
import { createSectionFolder, deleteSectionFolder, renameSectionFolder } from '../services/sectionFolderOperations';
import { useMergedSectionItems } from './hooks/useMergedSectionItems';
import { usePhaseNavigation } from './hooks/usePhaseNavigation';
import { useProjectNavigation } from './hooks/useProjectNavigation';
import PhaseLeftPanel from './kalkylskede/components/PhaseLeftPanel';

// Import kalkylskede sections (for now, other phases can use these or have their own)
import AIKalkylAnalysView from '../../../Screens/AIKalkylAnalysView';
import FFUAISummaryView from '../../../Screens/FFUAISummaryView';
import AnbudSection from './kalkylskede/sections/anbud/AnbudSection';
import AnteckningarSection from './kalkylskede/sections/anteckningar/AnteckningarSection';
import BilderSection from './kalkylskede/sections/bilder/BilderSection';
import ForfragningsunderlagSection from './kalkylskede/sections/forfragningsunderlag/ForfragningsunderlagSection';
import KalkylSection from './kalkylskede/sections/kalkyl/KalkylSection';
import KonstruktionSection from './kalkylskede/sections/konstruktion/KonstruktionSection';
import MotenSection from './kalkylskede/sections/moten/MotenSection';
import MyndigheterSection from './kalkylskede/sections/myndigheter/MyndigheterSection';
import OfferterSection from './kalkylskede/sections/offerter/OfferterSection';
import OversiktSection from './kalkylskede/sections/oversikt/OversiktSection';

const SECTION_COMPONENTS = {
  oversikt: OversiktSection,
  forfragningsunderlag: ForfragningsunderlagSection,
  offerter: OfferterSection,
  bilder: BilderSection,
  myndigheter: MyndigheterSection,
  kalkyl: KalkylSection,
  'konstruktion-berakningar': KonstruktionSection,
  anteckningar: AnteckningarSection,
  moten: MotenSection,
  anbud: AnbudSection
};

export default function PhaseLayout({ companyId, projectId, project, phaseKey, hideLeftPanel = false, externalActiveSection = null, externalActiveItem = null, externalActiveNode = null, onExternalSectionChange = null, onExternalItemChange = null, onPhaseChange = null, reactNavigation = null, afRelativePath = '', setAfRelativePath = null, afSelectedItemId = null, setAfSelectedItemId = null, bumpAfMirrorRefreshNonce = null, onHeaderLabelsChange = null }) {
  const { navigation, isLoading: navLoading } = usePhaseNavigation(companyId, projectId, phaseKey, project);

  const formatNavLabel = (value) => stripNumberPrefixForDisplay(value);

  // Use external state if provided (from HomeScreen), otherwise use internal state
  const [internalActiveSection, setInternalActiveSection] = useState(null);
  const [internalActiveItem, setInternalActiveItem] = useState(null);
  const [internalActiveNode, setInternalActiveNode] = useState(null);
  
  const activeSection = externalActiveSection !== null ? externalActiveSection : internalActiveSection;
  const activeItem = externalActiveItem !== null ? externalActiveItem : internalActiveItem;
  const activeNode = externalActiveNode !== null ? externalActiveNode : internalActiveNode;
  
  const setActiveSection = (sectionId) => {
    if (onExternalSectionChange) {
      onExternalSectionChange(sectionId);
    } else {
      setInternalActiveSection(sectionId);
    }
  };
  
  const setActiveItem = (sectionId, itemId, meta = null) => {
    if (onExternalItemChange) {
      onExternalItemChange(sectionId, itemId, meta);
    } else {
      setInternalActiveItem(itemId);

      if (meta && Object.prototype.hasOwnProperty.call(meta, 'activeNode')) {
        setInternalActiveNode(meta.activeNode || null);
      } else if (!itemId) {
        setInternalActiveNode(null);
      }
    }
  };

  const checklistEditRef = useRef(null);
  const [checklistIsDirty, setChecklistIsDirty] = useState(false);
  const [showDirtyConfirm, setShowDirtyConfirm] = useState(false);
  const pendingNavRef = useRef(null);

  const performPendingNavigation = useCallback(() => {
    const fn = pendingNavRef.current;
    pendingNavRef.current = null;
    if (typeof fn === 'function') fn();
  }, []);

  const attemptNavigate = useCallback((fn) => {
    const state = checklistEditRef.current?.getState?.();
    if (state?.isDirty) {
      pendingNavRef.current = fn;
      setShowDirtyConfirm(true);
      return;
    }
    if (typeof fn === 'function') fn();
  }, []);

  // React Navigation: guard when leaving the screen.
  useEffect(() => {
    if (!reactNavigation?.addListener) return;
    const unsubscribe = reactNavigation.addListener('beforeRemove', (e) => {
      const state = checklistEditRef.current?.getState?.();
      if (!state?.isDirty) return;
      e.preventDefault();
      pendingNavRef.current = () => {
        try {
          reactNavigation?.dispatch?.(e.data.action);
        } catch (_e) {}
      };
      setShowDirtyConfirm(true);
    });
    return unsubscribe;
  }, [reactNavigation]);

  // Web: protect against refresh/tab-close when checklist has unsaved draft edits.
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    const handler = (e) => {
      if (!checklistIsDirty) return;
      e.preventDefault();
      e.returnValue = '';
      return '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [checklistIsDirty]);
  
  const [loadingPhase, setLoadingPhase] = useState(true);

  // Set default active section when navigation loads
  useEffect(() => {
    const sections = navigation?.sections ?? [];
    if (navigation && Array.isArray(sections) && sections.length > 0 && !activeSection) {
      const firstSection = sections[0];
      setActiveSection(firstSection.id);
      // Don't auto-select first item - show section summary instead
      setActiveItem(firstSection.id, null, { activeNode: null });
    }
  }, [navigation, activeSection]);

  // Show loading indicator when opening phase
  useEffect(() => {
    if (companyId && projectId && phaseKey) {
      setLoadingPhase(true);
      const timer = setTimeout(() => {
        setLoadingPhase(false);
      }, 500);
      return () => clearTimeout(timer);
    } else {
      setLoadingPhase(false);
    }
  }, [companyId, projectId, phaseKey]);

  const handleSelectSection = (sectionId) => {
    attemptNavigate(() => {
      setActiveSection(sectionId);
      // Don't auto-select first item - show section summary instead
      setActiveItem(sectionId, null, { activeNode: null });
    });
  };

  const handleSelectItem = (sectionId, itemId, meta = null) => {
    attemptNavigate(() => {
      setActiveSection(sectionId);
      setActiveItem(sectionId, itemId, meta);
    });
  };

  const { sections: navSections, subMenuItems: baseSubMenuItems, activeSectionConfig } = useProjectNavigation(navigation, activeSection);

  const projectRootPath = String(
    project?.rootFolderPath ||
    project?.rootPath ||
    project?.sharePointPath ||
    project?.projectPath ||
    project?.path ||
    '',
  ).replace(/^\/+|\/+$/g, '');

  const { subMenuItems, structure, isEditable, saveItems } = useMergedSectionItems(
    companyId || project?.companyId,
    projectId || project?.id,
    activeSection,
    baseSubMenuItems,
    activeSectionConfig,
    projectRootPath,
  );

  const [optimisticSubMenuItems, setOptimisticSubMenuItems] = useState(null);
  const effectiveSubMenuItems = optimisticSubMenuItems ?? subMenuItems;

  // FFU + Kalkyl AI-analys pågår? Prenumeration måste vara aktiv oavsett sektion så analysen fortsätter i bakgrunden
  const [ffuAiAnalyzing, setFfuAiAnalyzing] = useState(false);
  const [kalkylAiAnalyzing, setKalkylAiAnalyzing] = useState(false);
  const cid = String(companyId || project?.companyId || '').trim();
  const pid = String(projectId || project?.id || '').trim();
  useEffect(() => {
    if (!cid || !pid) {
      setFfuAiAnalyzing(false);
      setKalkylAiAnalyzing(false);
      return;
    }
    const unsubFfu = subscribeLatestProjectFFUAnalysis(cid, pid, {
      onNext: (data) => {
        const status = data?.status;
        setFfuAiAnalyzing(String(status || '').toLowerCase() === 'analyzing');
      },
    });
    const unsubKalkyl = subscribeLatestProjectKalkylAnalysis(cid, pid, {
      onNext: (data) => {
        const status = data?.status;
        setKalkylAiAnalyzing(String(status || '').toLowerCase() === 'analyzing');
      },
    });
    return () => {
      try { unsubFfu?.(); } catch (_e) {}
      try { unsubKalkyl?.(); } catch (_e) {}
    };
  }, [cid, pid]);
  const itemLoadingIds = [
    ...(ffuAiAnalyzing && activeSection === 'forfragningsunderlag' ? ['ai-summary'] : []),
    ...(kalkylAiAnalyzing && activeSection === 'kalkyl' ? ['ai-kalkyl-analys'] : []),
  ];
  const sectionLoadingIds = [
    ...(ffuAiAnalyzing ? ['forfragningsunderlag'] : []),
    ...(kalkylAiAnalyzing ? ['kalkyl'] : []),
  ];

  // Rensa optimistic när användaren byter sektion så vi inte behåller föråldrad state
  useEffect(() => {
    setOptimisticSubMenuItems(null);
  }, [activeSection]);

  const activeItemConfig = activeItem
    ? (effectiveSubMenuItems || []).find((i) => i?.id === activeItem) || null
    : null;

  const headerSectionLabel = activeSectionConfig ? formatNavLabel(activeSectionConfig.name) : '';
  const headerItemLabel = activeItemConfig ? formatNavLabel(activeItemConfig.name ?? activeItemConfig.displayName ?? '') : '';

  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [renameModalItem, setRenameModalItem] = useState(null);
  const [deleteModalItem, setDeleteModalItem] = useState(null);
  const [deleteModalHasFiles, setDeleteModalHasFiles] = useState(false);
  const [folderActionLoading, setFolderActionLoading] = useState(false);
  const [reorderToast, setReorderToast] = useState({ visible: false, message: '' });
  const reorderToastTimeoutRef = useRef(null);

  const resolveSiteId = useCallback(async () => {
    const fromProject = String(project?.sharePointSiteId || project?.siteId || project?.siteID || '').trim();
    if (fromProject) return fromProject;
    try {
      const { getCompanySharePointSiteId } = await import('../../../components/firebase');
      const id = await getCompanySharePointSiteId(companyId);
      return String(id || '').trim();
    } catch (_e) {
      return '';
    }
  }, [companyId, project]);

  const handleCreateFolder = useCallback(async (displayName) => {
    const cid = companyId || project?.companyId;
    if (!cid || !projectRootPath || !activeSectionConfig?.name) return;
    setFolderActionLoading(true);
    try {
      const siteId = await resolveSiteId();
      if (!siteId) throw new Error('SharePoint-site hittades inte');
      const { sharePointName, displayName: safeDisplay } = await createSectionFolder({
        siteId,
        companyId: cid,
        projectRootPath,
        sectionFolderName: activeSectionConfig.name,
        folderDisplayName: displayName,
      });
      const customId = `custom-${Date.now()}`;
      // Använd effectiveSubMenuItems så vi inkluderar tidigare optimistiska mappar (t.ex. första mappen)
      const existing = effectiveSubMenuItems || [];
      const nextOrder = Math.max(0, ...existing.map((i) => Number(i?.order) || 0)) + 1;
      const newItem = {
        id: customId,
        sharePointName,
        displayName: safeDisplay,
        name: safeDisplay,
        order: nextOrder,
        isCustom: true,
        component: 'DigitalkontrollsUtforskare',
        rootPath: [projectRootPath, activeSectionConfig.name, sharePointName].filter(Boolean).join('/').replace(/\/+/g, '/'),
      };
      setOptimisticSubMenuItems([...existing, newItem]);
      setCreateModalOpen(false);
      await saveItems([...existing, newItem]);
      setFolderActionLoading(false);
      // Rensa inte optimistic här – Firestore-load kan vara försenad och subMenuItems
      // har inte nya mappen än. Rensas när användaren byter sektion (useEffect).
    } catch (e) {
      console.warn('[PhaseLayout] create folder error:', e);
      setOptimisticSubMenuItems(null);
      setFolderActionLoading(false);
      if (Platform.OS === 'web' && typeof window?.alert === 'function') window.alert(e?.message || 'Kunde inte skapa mappen');
      else Alert.alert('Fel', e?.message || 'Kunde inte skapa mappen');
    }
  }, [companyId, project?.companyId, projectRootPath, activeSectionConfig, effectiveSubMenuItems, saveItems, resolveSiteId]);

  const handleRenameFolder = useCallback(async (newDisplayName) => {
    const item = renameModalItem;
    if (!item || !companyId || !projectRootPath || !activeSectionConfig?.name || !item.sharePointName) return;
    setFolderActionLoading(true);
    try {
      const siteId = await resolveSiteId();
      if (!siteId) throw new Error('SharePoint-site hittades inte');
      const { sharePointName, displayName } = await renameSectionFolder({
        siteId,
        projectRootPath,
        sectionFolderName: activeSectionConfig.name,
        currentSharePointName: item.sharePointName,
        newDisplayName,
      });
      const existing = effectiveSubMenuItems || [];
      const next = existing.map((i) =>
        i?.id === item.id ? { ...i, sharePointName, displayName, name: displayName } : i,
      );
      setOptimisticSubMenuItems(next);
      await saveItems(next);
      setRenameModalItem(null);
    } catch (e) {
      console.warn('[PhaseLayout] rename folder error:', e);
      if (Platform.OS === 'web' && typeof window?.alert === 'function') window.alert(e?.message || 'Kunde inte byta namn');
      else Alert.alert('Fel', e?.message || 'Kunde inte byta namn');
    } finally {
      setFolderActionLoading(false);
    }
  }, [renameModalItem, companyId, projectRootPath, activeSectionConfig, effectiveSubMenuItems, saveItems, resolveSiteId]);

  const handleDeleteFolder = useCallback(async () => {
    const item = deleteModalItem;
    if (!item || !companyId || !projectRootPath || !activeSectionConfig?.name) return;
    const sharePointName = item?.sharePointName ?? item?.name;
    setFolderActionLoading(true);
    try {
      const siteId = await resolveSiteId();
      if (!siteId) throw new Error('SharePoint-site hittades inte');
      if (sharePointName) {
        await deleteSectionFolder({
          siteId,
          projectRootPath,
          sectionFolderName: activeSectionConfig.name,
          sharePointName,
        });
      }
      const existing = effectiveSubMenuItems || [];
      const next = existing.filter((i) => i?.id !== item.id);
      setOptimisticSubMenuItems(next);
      const isBaseItem = !item?.isCustom;
      await saveItems(next, isBaseItem ? { removedBaseIds: [item.id] } : {});
      setDeleteModalItem(null);
      if (activeItem === item.id) handleSelectItem(activeSection, null, { activeNode: null });
    } catch (e) {
      console.warn('[PhaseLayout] delete folder error:', e);
      if (Platform.OS === 'web' && typeof window?.alert === 'function') window.alert(e?.message || 'Kunde inte radera mappen');
      else Alert.alert('Fel', e?.message || 'Kunde inte radera mappen');
    } finally {
      setFolderActionLoading(false);
    }
  }, [deleteModalItem, companyId, projectRootPath, activeSectionConfig, effectiveSubMenuItems, saveItems, resolveSiteId, activeItem, activeSection, handleSelectItem]);

  const handleRequestDelete = useCallback(async (item) => {
    if (!item || item?.isSystemItem || !companyId || !projectRootPath || !activeSectionConfig?.name) return;
    const sharePointName = item?.sharePointName ?? item?.name;
    if (!sharePointName) {
      setDeleteModalItem(item);
      setDeleteModalHasFiles(false);
      return;
    }
    setFolderActionLoading(true);
    try {
      const siteId = await resolveSiteId();
      if (!siteId) {
        setDeleteModalItem(item);
        setDeleteModalHasFiles(false);
        setFolderActionLoading(false);
        return;
      }
      const { getSharePointFolderItems } = await import('../../../services/sharepoint/sharePointStructureService');
      const folderPath = `${projectRootPath}/${activeSectionConfig.name}/${sharePointName}`.replace(/\/+/g, '/');
      const items = await getSharePointFolderItems(siteId, `/${folderPath}`);
      const hasFiles = (items || []).some((it) => it?.type === 'file');
      setDeleteModalItem(item);
      setDeleteModalHasFiles(hasFiles);
    } catch (_e) {
      setDeleteModalItem(item);
      setDeleteModalHasFiles(false);
    } finally {
      setFolderActionLoading(false);
    }
  }, [companyId, projectRootPath, activeSectionConfig, resolveSiteId]);

  const handleReorder = useCallback(
    async (reordered) => {
      const withOrder = (reordered || []).map((it, idx) => ({ ...it, order: idx }));
      setOptimisticSubMenuItems(withOrder);
      setReorderToast({ visible: true, message: 'Uppdaterar ordning…' });
      try {
        await saveItems(withOrder);
        setReorderToast({ visible: true, message: 'Flikordningen uppdaterad' });
      } catch (e) {
        setReorderToast({ visible: false, message: '' });
        return;
      }
      if (reorderToastTimeoutRef.current) clearTimeout(reorderToastTimeoutRef.current);
      reorderToastTimeoutRef.current = setTimeout(() => {
        setReorderToast({ visible: false, message: '' });
        reorderToastTimeoutRef.current = null;
      }, 3000);
    },
    [saveItems],
  );

  useEffect(() => {
    return () => {
      if (reorderToastTimeoutRef.current) clearTimeout(reorderToastTimeoutRef.current);
    };
  }, []);

  // Rapportera header-labels till parent (t.ex. MinimalTopbar) så rubriken kan visas på samma rad som kalender.
  useEffect(() => {
    if (typeof onHeaderLabelsChange === 'function') {
      onHeaderLabelsChange({ sectionLabel: headerSectionLabel, itemLabel: headerItemLabel });
    }
  }, [onHeaderLabelsChange, headerSectionLabel, headerItemLabel]);

  // Background should only be visible for Översikt + 5 specific subpages.
  const bgEnabledItemIds = new Set([
    'checklista',
    'projektinfo',
    'organisation-roller',
    'tidsplan-viktiga-datum',
    'status-beslut',
  ]);

  const shouldUseProjectBackground =
    String(activeSection || '') === 'oversikt' &&
    (!activeItem || bgEnabledItemIds.has(String(activeItem || '')));

  const lockViewportForSection = Platform.OS === 'web' && ['forfragningsunderlag', 'bilder', 'myndigheter', 'anbud', 'kalkyl', 'konstruktion-berakningar', 'offerter'].includes(String(activeSection || ''));

  const renderContent = () => {
    if (navLoading || !navigation) {
      return (
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Laddar...</Text>
        </View>
      );
    }

    if (!activeSection) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Välj en sektion för att börja</Text>
        </View>
      );
    }

    if (activeItemConfig?.component === 'AIKalkylAnalysView') {
      return (
        <AIKalkylAnalysView
          companyId={companyId}
          projectId={projectId}
          project={project}
        />
      );
    }

    if (activeItemConfig?.component === 'FFUAISummaryView') {
      return (
        <FFUAISummaryView
          projectId={projectId}
          companyId={companyId}
          project={project}
        />
      );
    }

    if (activeItemConfig?.component === 'DigitalkontrollsUtforskare' && activeItemConfig?.rootPath) {
      return (
        <DigitalkontrollsUtforskare
            companyId={companyId}
            project={project}
            rootPath={activeItemConfig.rootPath}
            scopeRootPath={activeItemConfig.rootPath}
            title={stripNumberPrefixForDisplay(activeItemConfig.name ?? activeItemConfig.displayName ?? '')}
            subtitle="SharePoint (källan till sanning)"
            breadcrumbBaseSegments={[activeSectionConfig?.name, activeItemConfig.sharePointName].filter(Boolean)}
            onBreadcrumbNavigateToSection={() => handleSelectItem(activeSection, null)}
            showCreateFolderButton
            iconName="folder-outline"
        />
      );
    }

    const SectionComponent = SECTION_COMPONENTS[activeSection];

    if (!SectionComponent) {
      return (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>Sektion "{activeSection}" hittades inte</Text>
        </View>
      );
    }

    const fromEffective = (effectiveSubMenuItems || [])
      .filter((i) => i?.isCustom && (i?.sharePointName || i?.name))
      .map((i) => i.sharePointName || i.name);
    const fromStructure = (structure?.items || [])
      .filter((s) => s?.isCustom && (s?.sharePointName || s?.name))
      .map((s) => s.sharePointName || s.name);
    const customFolderNames = [...new Set([...fromEffective, ...fromStructure])];

    return (
      <SectionComponent
        projectId={projectId}
        companyId={companyId}
        project={project}
        activeItem={activeItem}
        activeNode={activeNode}
        hiddenCustomFolderNames={customFolderNames}
        afRelativePath={afRelativePath}
        setAfRelativePath={setAfRelativePath}
        afSelectedItemId={afSelectedItemId}
        setAfSelectedItemId={setAfSelectedItemId}
        bumpAfMirrorRefreshNonce={bumpAfMirrorRefreshNonce}
        navigation={(navigation?.sections || []).find(s => s.id === activeSection)}
        onSelectItem={handleSelectItem}
        hidePageHeader
      />
    );
  };

  const projectName = project?.name || project?.id || 'Projekt';
  const [phaseDropdownOpen, setPhaseDropdownOpen] = useState(false);
  const [changingPhase, setChangingPhase] = useState(false);
  const [pendingPhaseChange, setPendingPhaseChange] = useState(null);
  
  const currentProjectPhase = getProjectPhase(project);
  const currentPhaseKey = currentProjectPhase?.key || phaseKey || DEFAULT_PHASE;

  // Close dropdown when clicking outside (web only)
  useEffect(() => {
    if (!phaseDropdownOpen || Platform.OS !== 'web') return;
    
    const handleClickOutside = (event) => {
      try {
        const target = event.target;
        if (target && typeof target.closest === 'function') {
          const dropdownElement = document.querySelector('[data-phase-dropdown-project]');
          if (dropdownElement && !dropdownElement.contains(target)) {
            setPhaseDropdownOpen(false);
          }
        }
      } catch (_e) {}
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [phaseDropdownOpen]);

  const handlePhaseChangeRequest = (newPhaseKey) => {
    if (newPhaseKey === currentPhaseKey) {
      setPhaseDropdownOpen(false);
      return;
    }

    const newPhase = PROJECT_PHASES.find(p => p.key === newPhaseKey);
    if (!newPhase) return;

    // Show confirmation dialog
    const phaseName = newPhase.name;
    const currentPhaseName = PROJECT_PHASES.find(p => p.key === currentPhaseKey)?.name || currentPhaseKey;

    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.confirm) {
      const confirmed = window.confirm(
        `Du är på väg att byta projektfas från "${currentPhaseName}" till "${phaseName}".\n\n` +
        `Pågående ändringar kommer att sparas automatiskt.\n\n` +
        `Vill du fortsätta?`
      );
      if (!confirmed) {
        setPhaseDropdownOpen(false);
        return;
      }
    } else {
      Alert.alert(
        'Byt projektfas',
        `Du är på väg att byta projektfas från "${currentPhaseName}" till "${phaseName}".\n\nPågående ändringar kommer att sparas automatiskt.`,
        [
          { text: 'Avbryt', style: 'cancel', onPress: () => setPhaseDropdownOpen(false) },
          { text: 'Fortsätt', onPress: () => proceedWithPhaseChange(newPhaseKey) }
        ]
      );
      return;
    }

    proceedWithPhaseChange(newPhaseKey);
  };

  const proceedWithPhaseChange = async (newPhaseKey) => {
    setPhaseDropdownOpen(false);
    setChangingPhase(true);
    setPendingPhaseChange(newPhaseKey);

    try {
      // Wait a moment to show the loading indicator
      await new Promise(resolve => setTimeout(resolve, 500));

      // Call the phase change handler if provided
      if (onPhaseChange) {
        await onPhaseChange(newPhaseKey);
      }

      // Wait a bit more to ensure smooth transition
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('[PhaseLayout] Error changing phase:', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.alert) {
        window.alert('Kunde inte byta fas. Försök igen.');
      } else {
        Alert.alert('Fel', 'Kunde inte byta fas. Försök igen.');
      }
    } finally {
      setChangingPhase(false);
      setPendingPhaseChange(null);
    }
  };

  // Handler for home button
  const handleGoHome = () => {
    if (Platform.OS === 'web') {
      try {
        if (typeof window !== 'undefined' && window.dispatchEvent) {
          window.dispatchEvent(new CustomEvent('dkBreadcrumbNavigate', { detail: { target: { kind: 'dashboard' } } }));
        }
      } catch (_e) {}
    }
    if (reactNavigation) {
      try {
        if (reactNavigation.reset) {
          reactNavigation.reset({ index: 0, routes: [{ name: 'Home' }] });
          return;
        }
        reactNavigation.navigate('Home');
      } catch (_e) {}
    }
  };

  // Handler for refresh button
  const handleRefresh = () => {
    // Trigger a refresh by updating a non-existent state to force re-render
    // This is a simple approach - in a real app you might want to reload data
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      try {
        window.location.reload();
      } catch (_e) {}
    }
  };

  const [spinHome, setSpinHome] = useState(0);
  const [spinRefresh, setSpinRefresh] = useState(0);
  const [primaryTopbarHeight, setPrimaryTopbarHeight] = useState(52);

  return (
    <ChecklistEditProvider ref={checklistEditRef} onDirtyChange={setChecklistIsDirty}>
    <View style={[styles.container, lockViewportForSection ? styles.lockViewport : null]}>
      {/* Phase selector, home, and refresh buttons are now in GlobalPhaseToolbar - removed from here */}
      {false && onPhaseChange && (
        <View style={[styles.phaseSelectorContainer, styles.stickyNavigation]}>
          {Platform.OS === 'web' ? (
            <div data-phase-dropdown-project style={{ position: 'relative', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, display: 'flex', alignItems: 'center', gap: 6 }}>
              {(() => {
              })()}
            </div>
          ) : (
            <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, position: 'relative', flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              {(() => {
              })()}
            </View>
          )}
        </View>
      )}

      {/* Projekt-rubrik (ikon, nummer, namn, breadcrumb) visas i MinimalTopbar på samma rad som kalender – inte här. */}
      {/* Topbar (primary sections) + Sub-Topbar (section items) */}
      <ProjectTopbar
        sections={navSections}
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        onLayout={(e) => {
          const h = e?.nativeEvent?.layout?.height;
          if (typeof h === 'number' && h > 0) setPrimaryTopbarHeight(h);
        }}
        sectionLoadingIds={sectionLoadingIds}
      />
      <ProjectSubTopbar
        subMenuItems={effectiveSubMenuItems}
        activeItem={activeItem}
        onSelectItem={(itemId) => handleSelectItem(activeSection, itemId, null)}
        primaryTopbarHeight={primaryTopbarHeight}
        isEditable={isEditable}
        sectionDisplayName={stripNumberPrefixForDisplay(activeSectionConfig?.name ?? '')}
        onRequestCreate={isEditable ? () => setCreateModalOpen(true) : undefined}
        onRequestRename={isEditable ? (item) => { if (!item?.isSystemItem) setRenameModalItem(item); } : undefined}
        onRequestDelete={isEditable ? handleRequestDelete : undefined}
        onReorder={isEditable ? handleReorder : undefined}
        itemLoadingIds={itemLoadingIds}
      />

      {/* Main Content Area - Full width layout */}
      <View style={styles.mainContent}>
        {/* Left Panel - Only show if not hidden */}
        {!hideLeftPanel && (
          <PhaseLeftPanel
            navigation={navigation}
            activeSection={activeSection}
            activeItem={activeItem}
            onSelectSection={handleSelectSection}
            onSelectItem={handleSelectItem}
            projectName={projectName}
            companyId={companyId}
            project={project}
          />
        )}

        {/* Right Content - Takes remaining space (breadcrumb visas redan högst upp) */}
        <View style={[styles.contentArea, shouldUseProjectBackground ? styles.contentAreaTransparent : null]}>
          <View style={[styles.contentBody, lockViewportForSection ? styles.contentBodyLocked : null]}>{renderContent()}</View>
        </View>
      </View>

      {/* Section folder modals */}
      <CreateFolderModal
        visible={createModalOpen}
        sectionDisplayName={stripNumberPrefixForDisplay(activeSectionConfig?.name ?? '')}
        onClose={() => setCreateModalOpen(false)}
        onConfirm={handleCreateFolder}
        loading={folderActionLoading}
      />
      <RenameFolderModal
        visible={!!renameModalItem}
        currentDisplayName={renameModalItem ? (renameModalItem.displayName ?? stripNumberPrefixForDisplay(renameModalItem.name ?? '')) : ''}
        onClose={() => setRenameModalItem(null)}
        onConfirm={handleRenameFolder}
        loading={folderActionLoading}
      />
      <DeleteFolderConfirmModal
        visible={!!deleteModalItem}
        folderDisplayName={deleteModalItem ? (deleteModalItem.displayName ?? stripNumberPrefixForDisplay(deleteModalItem.name ?? '')) : ''}
        hasFiles={deleteModalHasFiles}
        onClose={() => setDeleteModalItem(null)}
        onConfirm={handleDeleteFolder}
        loading={folderActionLoading}
      />

      {/* Unsaved changes confirmation (Checklist) */}
      <Modal
        visible={showDirtyConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowDirtyConfirm(false)}
      >
        <Pressable style={styles.dirtyBackdrop} onPress={() => setShowDirtyConfirm(false)}>
          <Pressable style={styles.dirtyModal} onPress={() => {}}>
            <Text style={styles.dirtyTitle}>Ospard ändring</Text>
            <Text style={styles.dirtyText}>Du har ändringar i checklistan som inte är sparade.</Text>

            <View style={styles.dirtyActions}>
              <Pressable
                style={[styles.dirtyButton, styles.dirtyPrimary]}
                onPress={async () => {
                  try {
                    await checklistEditRef.current?.commitChanges?.();
                    setShowDirtyConfirm(false);
                    performPendingNavigation();
                  } catch (_e) {
                    try {
                      Alert.alert('Kunde inte spara', 'Kontrollera anslutningen och försök igen.');
                    } catch (_e2) {}
                  }
                }}
              >
                <Text style={[styles.dirtyButtonText, styles.dirtyPrimaryText]}>Spara och lämna</Text>
              </Pressable>

              <Pressable
                style={[styles.dirtyButton, styles.dirtyDanger]}
                onPress={() => {
                  try {
                    checklistEditRef.current?.resetDirty?.();
                  } catch (_e) {}
                  setShowDirtyConfirm(false);
                  performPendingNavigation();
                }}
              >
                <Text style={styles.dirtyButtonText}>Lämna utan att spara</Text>
              </Pressable>

              <Pressable
                style={[styles.dirtyButton, styles.dirtyNeutral]}
                onPress={() => setShowDirtyConfirm(false)}
              >
                <Text style={styles.dirtyButtonText}>Avbryt</Text>
              </Pressable>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      {/* Reorder toast – bottom right, rail-färg, 3s auto-hide */}
      {reorderToast.visible ? (
        <View
          pointerEvents="none"
          style={[
            styles.reorderToast,
            Platform.OS === 'web' ? { position: 'fixed' } : { position: 'absolute' },
          ]}
        >
          <Text style={styles.reorderToastIcon}>✓</Text>
          <Text style={styles.reorderToastText}>{reorderToast.message}</Text>
        </View>
      ) : null}

      {/* Loading overlay - initial load */}
      {loadingPhase && !changingPhase && (
        <Modal
          visible={loadingPhase}
          transparent
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 32,
              alignItems: 'center',
              minWidth: 280,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#263238',
                marginTop: 16,
                textAlign: 'center',
              }}>
                Öppnar projekt
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#546E7A',
                marginTop: 4,
                textAlign: 'center',
              }}>
                Laddar funktioner...
              </Text>
            </View>
          </View>
        </Modal>
      )}

      {/* Phase Change Loading Modal */}
      {changingPhase && pendingPhaseChange && (
        <Modal
          visible={changingPhase}
          transparent
          animationType="fade"
        >
          <View style={{
            flex: 1,
            backgroundColor: 'rgba(0, 0, 0, 0.5)',
            justifyContent: 'center',
            alignItems: 'center',
          }}>
            <View style={{
              backgroundColor: '#fff',
              borderRadius: 12,
              padding: 32,
              alignItems: 'center',
              minWidth: 280,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.3,
              shadowRadius: 8,
              elevation: 8,
            }}>
              <ActivityIndicator size="large" color="#1976D2" />
              <Text style={{
                fontSize: 18,
                fontWeight: '600',
                color: '#263238',
                marginTop: 16,
                textAlign: 'center',
              }}>
                {(() => {
                  const phaseNames = {
                    'kalkylskede': 'Kalkylskede',
                    'produktion': 'Produktion',
                    'avslut': 'Avslut',
                    'eftermarknad': 'Eftermarknad',
                  };
                  const phaseName = phaseNames[pendingPhaseChange] || 'Laddar...';
                  return `Laddar ${phaseName.toLowerCase()}`;
                })()}
              </Text>
              <Text style={{
                fontSize: 14,
                color: '#546E7A',
                marginTop: 4,
                textAlign: 'center',
              }}>
                Sparar data och laddar innehåll...
              </Text>
            </View>
          </View>
        </Modal>
      )}
    </View>
    </ChecklistEditProvider>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f4f6fa',
    minHeight: 0,
    minWidth: 0,
  },
  lockViewport: {
    ...(Platform.OS === 'web'
      ? {
          height: '100%',
          overflow: 'hidden',
        }
      : null),
  },
  phaseSelectorContainer: {
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e6e6e6',
  },
  stickyNavigation: {
    position: 'sticky',
    top: 0,
    zIndex: 100,
    backgroundColor: '#fff',
  },
  mainContent: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 0,
    minWidth: 0,
  },
  contentArea: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 0,
    minHeight: 0,
    minWidth: 0,
  },

  contentAreaTransparent: {
    backgroundColor: 'transparent',
  },

  projectHeaderTransparent: {
    backgroundColor: 'transparent',
    borderBottomColor: 'transparent',
  },
  contentBody: {
    flex: 1,
    padding: 24,
    minHeight: 0,
    minWidth: 0,
  },
  contentBodyLocked: {
    ...(Platform.OS === 'web'
      ? {
          overflow: 'hidden',
        }
      : null),
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  loadingText: {
    fontSize: 16,
    color: '#666'
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  emptyText: {
    fontSize: 16,
    color: '#999'
  },
  reorderToast: {
    bottom: 24,
    right: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: ICON_RAIL?.bg ?? '#0f1b2d',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    zIndex: 2147483647,
    ...(Platform.OS === 'web'
      ? {
          boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
        }
      : {
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.15,
          shadowRadius: 8,
          elevation: 8,
        }),
  },
  reorderToastIcon: {
    color: '#4ade80',
    fontSize: 14,
    fontWeight: '700',
  },
  reorderToastText: {
    color: '#fff',
    fontSize: 13,
    fontWeight: '500',
  },

  dirtyBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dirtyModal: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: '#fff',
    borderRadius: 14,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 8,
  },
  dirtyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#111827',
  },
  dirtyText: {
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    color: '#374151',
  },
  dirtyActions: {
    marginTop: 14,
    gap: 10,
  },
  dirtyButton: {
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E5E7EB',
    backgroundColor: '#fff',
  },
  dirtyButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#111827',
  },
  dirtyPrimary: {
    backgroundColor: '#111827',
    borderColor: '#111827',
  },
  dirtyPrimaryText: {
    color: '#fff',
  },
  dirtyDanger: {
    backgroundColor: '#fff',
    borderColor: '#FCA5A5',
  },
  dirtyNeutral: {
    backgroundColor: '#F9FAFB',
  },
});
