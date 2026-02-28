import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from 'react-native';
import { MODAL_THEME } from '../../../constants/modalTheme';
import { PROJECT_PHASES } from '../../../features/projects/constants';
import { useDraggableResizableModal } from '../../../hooks/useDraggableResizableModal';
import { useModalKeyboard } from '../../../hooks/useModalKeyboard';
import { getSharePointNavigationConfig } from '../../firebase';
import { isProjectFolder } from '../../../utils/isProjectFolder';
import { createFolderInSite, renameDriveItemByPath, deleteDriveItemByPath } from '../../../services/azure/hierarchyService';

// Säker referens så att StyleSheet och JSX inte kraschar om MODAL_THEME inte laddas
const BANNER_THEME = (MODAL_THEME && MODAL_THEME.banner) ? MODAL_THEME.banner : {
  paddingVertical: 7,
  paddingHorizontal: 14,
  backgroundColor: '#1e293b',
  borderBottomColor: 'rgba(255,255,255,0.06)',
  iconSize: 28,
  iconBgRadius: 8,
  iconBg: 'rgba(255,255,255,0.1)',
  titleFontSize: 14,
  titleFontWeight: '600',
  titleColor: '#f1f5f9',
  subtitleFontSize: 12,
  subtitleColor: '#94a3b8',
  closeBtnPadding: 5,
  closeIconSize: 20,
};
const FOOTER_THEME = (MODAL_THEME && MODAL_THEME.footer) ? MODAL_THEME.footer : {
  backgroundColor: '#f8fafc',
  borderTopColor: '#e2e8f0',
  btnPaddingVertical: 10,
  btnPaddingHorizontal: 20,
  btnBorderRadius: 8,
  btnBackground: '#1e293b',
  btnBorderColor: '#1e293b',
  btnTextColor: '#fff',
  btnFontSize: 14,
  btnFontWeight: '600',
};

// STRUCTURES removed - projects are no longer phase-based

export default function CreateProjectModal({
  visible,
  onClose,
  availableSites = [],
  onCreateProject,
  onSave,
  isCreating = false,
  isSaving = false,
  companyId = null,
  initialProject = null,
}) {
  const isEditMode = !!initialProject;
  const [projectNumber, setProjectNumber] = useState('');
  const [projectName, setProjectName] = useState('');
  const [selectedProjectRoot, setSelectedProjectRoot] = useState(null); // { siteId, siteName, folderPath, folderName }

  // Project structure/phase selection (default: Kalkylskede)
  const [selectedStructureKey, setSelectedStructureKey] = useState('kalkylskede');
  const initialProjectFilledRef = useRef(null);
  
  // State for location picker
  const [locationPickerOpen, setLocationPickerOpen] = useState(false);
  const [locationPickerStep, setLocationPickerStep] = useState('sites'); // 'sites' or 'folders'
  const [activeSite, setActiveSite] = useState(null); // Site selected in step 1
  const [currentPath, setCurrentPath] = useState(''); // Current folder path being viewed
  const [locationFolders, setLocationFolders] = useState([]);
  const [loadingLocationFolders, setLoadingLocationFolders] = useState(false);
  const [locationPathHistory, setLocationPathHistory] = useState([]); // For breadcrumb navigation
  const [navConfig, setNavConfig] = useState(null);
  const [locationFoldersRefreshKey, setLocationFoldersRefreshKey] = useState(0);
  const [locationNewFolderName, setLocationNewFolderName] = useState('');
  const [locationCreatingFolder, setLocationCreatingFolder] = useState(false);
  const [locationShowNewFolderInput, setLocationShowNewFolderInput] = useState(false);
  const [locationError, setLocationError] = useState('');
  const [locationContextMenu, setLocationContextMenu] = useState(null); // { folder: { name, path }, x, y }
  const [locationRenamingFolder, setLocationRenamingFolder] = useState(null); // { folder: { name, path } }
  const [locationRenameValue, setLocationRenameValue] = useState('');
  const [locationDeleting, setLocationDeleting] = useState(false);
  const [locationRenaming, setLocationRenaming] = useState(false);

  // State for structure picker (web dropdown)
  
  // Refs för att mäta dropdown-trigger positioner
  const locationPickerRef = useRef(null);
  const [locationPickerPosition, setLocationPickerPosition] = useState({ top: 0, left: 0, width: 0 });

  // Pre-fill form when opening in edit mode
  useEffect(() => {
    if (!visible || !initialProject) {
      if (!visible) initialProjectFilledRef.current = null;
      return;
    }
    const pid = String(initialProject?.projectId || initialProject?.projectNumber || '').trim();
    if (initialProjectFilledRef.current === pid) return;
    initialProjectFilledRef.current = pid;
    setProjectNumber(String(initialProject?.projectNumber || initialProject?.id || '').trim());
    setProjectName(String(initialProject?.projectName || initialProject?.name || '').trim());
    const siteId = String(initialProject?.sharePointSiteId || initialProject?.siteId || '').trim();
    const path = String(initialProject?.rootFolderPath || initialProject?.path || '').trim().replace(/^\/+/, '').replace(/\/+$/, '');
    const folderName = path ? path.split('/').pop() : 'Root';
    const site = (availableSites || []).find((s) => String(s?.id || '').trim() === siteId);
    const siteName = site ? (site.name || (site.webUrl || '').split('/').filter(Boolean).pop() || '') : (initialProject?.siteName || '');
    setSelectedProjectRoot(siteId ? { siteId, siteName: siteName || 'Site', folderPath: path, folderName: folderName || 'Root' } : null);
    const phase = String(initialProject?.phase || 'kalkylskede').trim().toLowerCase();
    setSelectedStructureKey(phase === 'kalkyl' ? 'kalkylskede' : phase || 'kalkylskede');
  }, [visible, initialProject, availableSites]);

  // Load folders when in folders step and path changes
  useEffect(() => {
    if (!locationPickerOpen || locationPickerStep !== 'folders' || !activeSite) {
      return;
    }

    let cancelled = false;

    async function loadFolders() {
      setLoadingLocationFolders(true);
      try {
        // Root-nivå: använd samma källa som SharePointLeftPanel (filterHierarchyByConfig)
        // så att vi får EXAKT samma mapplista som i vänsterpanelen för den aktiva siten.
        if (!currentPath) {
          try {
            const { filterHierarchyByConfig } = await import('../../../utils/filterSharePointHierarchy');
            const filtered = await filterHierarchyByConfig([], companyId, navConfig || undefined);
            if (cancelled) return;

            // Hitta den aktiva siten i det filtrerade trädet
            const siteNode = (filtered || []).find((site) => {
              if (!site) return false;
              const siteId = String(site.siteId || '').trim();
              const activeId = String(activeSite?.id || '').trim();
              return siteId && activeId && siteId === activeId;
            });

            const siteFolders = Array.isArray(siteNode?.children) ? siteNode.children : [];

            const folders = siteFolders
              .filter((item) => item && (item.type === 'folder' || item.folder))
              .map((item) => {
                const name = String(item.name || '').trim();
                let path = String(item.path || '').trim();
                if (!path) {
                  const base = String(currentPath || '').replace(/\/+$/, '');
                  path = base ? `${base}/${name}` : name;
                }
                return { name, path };
              })
              .filter((item) => !isProjectFolder({ name: item.name }));

            setLocationFolders(folders);
            return;
          } catch (e) {
            console.error('[CreateProjectModal] Error filtering hierarchy by config, falling back to raw root folders:', e);
            const { getSharePointHierarchy } = await import('../../../services/azure/hierarchyService');
            const rootFolders = await getSharePointHierarchy(companyId, null, 1);
            if (cancelled) return;

            const folders = (rootFolders || [])
              .filter((item) => item && (item.folder || item.type === 'folder'))
              .map((item) => {
                const name = String(item.name || '').trim();
                let path = String(item.path || '').trim();
                if (!path) {
                  const base = String(currentPath || '').replace(/\/+$/, '');
                  path = base ? `${base}/${name}` : name;
                }
                return { name, path };
              })
              .filter((item) => !isProjectFolder({ name: item.name }));

            setLocationFolders(folders);
            return;
          }
        }

        // Undermappar: använd getDriveItems med vald site så att rätt site + nya mappar syns
        const { getDriveItems } = await import('../../../services/azure/hierarchyService');
        const items = await getDriveItems(activeSite.id, currentPath || '');
        if (cancelled) return;

        const folders = (items || [])
          .filter((item) => item && (item.folder || item.type === 'folder'))
          .map((item) => {
            const name = String(item.name || '').trim();
            const base = String(currentPath || '').replace(/\/+$/, '');
            const path = base ? `${base}/${name}` : name;
            return { name, path };
          })
          .filter((item) => !isProjectFolder({ name: item.name }));

        setLocationFolders(folders);
      } catch (error) {
        console.error('[CreateProjectModal] Error loading location folders:', error);
        if (!cancelled) {
          setLocationFolders([]);
        }
      } finally {
        if (!cancelled) setLoadingLocationFolders(false);
      }
    }

    loadFolders();

    return () => {
      cancelled = true;
    };
  }, [locationPickerOpen, locationPickerStep, activeSite, currentPath, companyId, navConfig, locationFoldersRefreshKey]);
  
  // Load navigation config when modal opens
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (visible && companyId) {
        try {
          const config = await getSharePointNavigationConfig(companyId);
          if (mounted) setNavConfig(config);
        } catch (error) {
          console.error('[CreateProjectModal] Error loading nav config:', error);
        }
      }
    })();
    return () => { mounted = false; };
  }, [visible, companyId]);

  // Reset all form fields when modal opens
  useEffect(() => {
    if (visible) {
      // Reset all form fields
      setProjectNumber('');
      setProjectName('');
      setSelectedProjectRoot(null);

      // Default structure when opening modal
      setSelectedStructureKey('');
      
      // Reset location picker state
      setLocationPickerOpen(false);
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationFolders([]);
      setLoadingLocationFolders(false);
      setLocationPathHistory([]);
      
      // Reset dropdown positions
      setLocationPickerPosition({ top: 0, left: 0, width: 0 });
    }
  }, [visible]);

  // Location picker state initieras via openLocationPicker

  // Derived booleans for status + validering
  const hasProjectNumber = projectNumber.trim().length > 0;
  const hasProjectName = projectName.trim().length > 0;
  const isProjectSectionComplete = hasProjectNumber && hasProjectName;

  const hasProjectRoot = !!selectedProjectRoot;
  const isStorageSectionComplete = hasProjectRoot;

  const hasStructure = !!selectedStructureKey;
  const isStructureSectionComplete = hasStructure;

  const selectedStructureLabel = (() => {
    try {
      const key = String(selectedStructureKey || '').trim();
      const hit = (PROJECT_PHASES || []).find((p) => String(p?.key || '').trim() === key);
      return String(hit?.name || '').trim();
    } catch (_e) {
      return '';
    }
  })();

  const canCreate = Boolean(
    isProjectSectionComplete &&
    isStorageSectionComplete &&
    isStructureSectionComplete
  );

  const getSiteDisplayName = (site) => {
    if (!site) return '';
    const raw = String(site.name || site.webUrl || '').trim();
    if (!raw) return '';
    if (!raw.startsWith('http')) return raw;
    try {
      const url = new URL(raw);
      const pathParts = url.pathname.split('/').filter(Boolean);
      const last = pathParts[pathParts.length - 1] || url.hostname.replace('.sharepoint.com', '');
      return last
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase());
    } catch (_e) {
      return raw;
    }
  };

  const handleSelectLocation = (site, folderPath, folderName) => {
    setSelectedProjectRoot({
      siteId: site.id,
      siteName: getSiteDisplayName(site),
      folderPath: folderPath || '',
      folderName: folderName || 'Root',
    });
    setLocationPickerOpen(false);
    // Reset picker state
    setLocationPickerStep('sites');
    setActiveSite(null);
    setCurrentPath('');
    setLocationPathHistory([]);
  };

  const handleSelectSite = (site) => {
    // Step 1: Site selected, move to folders step
    setActiveSite(site);
    setLocationPickerStep('folders');
    setCurrentPath('');
    setLocationPathHistory([]);
  };

  const handleNavigateToFolder = (folder) => {
    const newPath = folder.path;
    setLocationPathHistory([...locationPathHistory, { path: currentPath, name: currentPath ? currentPath.split('/').pop() : 'Root' }]);
    setCurrentPath(newPath);
    // Lagringsplats sätts inte här – bara när användaren klickar "Välj denna plats/mapp" (handleSelectLocation).
  };

  const handleNavigateBack = () => {
    if (locationPathHistory.length > 0) {
      const previous = locationPathHistory[locationPathHistory.length - 1];
      setLocationPathHistory(locationPathHistory.slice(0, -1));
      setCurrentPath(previous.path);
    } else {
      // If at root level, go back to sites step
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationPathHistory([]);
    }
  };

  const handleCreateFolderInLocation = useCallback(async () => {
    const name = String(locationNewFolderName || '').trim();
    if (!name || !activeSite?.id) return;
    setLocationCreatingFolder(true);
    try {
      await createFolderInSite(activeSite.id, currentPath || '', name);
      setLocationNewFolderName('');
      setLocationShowNewFolderInput(false);
      setLocationFoldersRefreshKey((k) => k + 1);
    } catch (e) {
      console.error('[CreateProjectModal] Create folder:', e);
      setLocationError(e?.message || 'Kunde inte skapa mapp');
    } finally {
      setLocationCreatingFolder(false);
    }
  }, [activeSite?.id, currentPath, locationNewFolderName]);

  const handleLocationFolderContextMenu = useCallback((e, folder) => {
    if (Platform.OS !== 'web') return;
    e.preventDefault();
    e.stopPropagation();
    setLocationContextMenu({ folder, x: e.nativeEvent.clientX, y: e.nativeEvent.clientY });
  }, []);

  const handleLocationRenameFolder = useCallback(async () => {
    const f = locationRenamingFolder;
    const newName = String(locationRenameValue || '').trim();
    if (!f || !newName || !activeSite?.id) {
      setLocationRenamingFolder(null);
      setLocationRenameValue('');
      return;
    }
    setLocationRenaming(true);
    setLocationError('');
    try {
      await renameDriveItemByPath(activeSite.id, f.path, newName);
      setLocationRenamingFolder(null);
      setLocationRenameValue('');
      setLocationFoldersRefreshKey((k) => k + 1);
    } catch (e) {
      console.error('[CreateProjectModal] Rename folder:', e);
      setLocationError(e?.message || 'Kunde inte byta namn');
    } finally {
      setLocationRenaming(false);
    }
  }, [activeSite?.id, locationRenamingFolder, locationRenameValue]);

  const handleLocationDeleteFolder = useCallback(async () => {
    const f = locationContextMenu?.folder;
    setLocationContextMenu(null);
    if (!f || !activeSite?.id) return;
    if (typeof window !== 'undefined' && !window.confirm(`Ta bort mappen "${f.name}"? Detta kan inte ångras.`)) return;
    setLocationDeleting(true);
    setLocationError('');
    try {
      await deleteDriveItemByPath(activeSite.id, f.path);
      setLocationFoldersRefreshKey((k) => k + 1);
    } catch (e) {
      console.error('[CreateProjectModal] Delete folder:', e);
      setLocationError(e?.message || 'Kunde inte ta bort mapp');
    } finally {
      setLocationDeleting(false);
    }
  }, [activeSite?.id, locationContextMenu]);

  const openLocationPicker = (startStep = 'sites') => {
    setLocationContextMenu(null);
    setLocationRenamingFolder(null);
    setLocationRenameValue('');

    if (startStep === 'folders' && selectedProjectRoot?.siteId) {
      const site = availableSites.find((s) => String(s.id) === String(selectedProjectRoot.siteId));
      setActiveSite(site || null);
      setLocationPickerStep('folders');
      setCurrentPath(selectedProjectRoot.folderPath || '');
      setLocationPathHistory([]);
    } else {
      setLocationPickerStep('sites');
      setActiveSite(null);
      setCurrentPath('');
      setLocationPathHistory([]);
    }
    setLocationError('');
    setLocationShowNewFolderInput(false);
    setLocationNewFolderName('');
    setLocationPickerOpen(true);
  };

  const handleCreate = () => {
    if (!canCreate || !selectedProjectRoot) return;
    if (isEditMode) {
      if (!onSave) return;
      onSave({
        projectId: initialProject?.projectId || initialProject?.projectNumber,
        projectNumber,
        projectName,
        siteId: selectedProjectRoot.siteId,
        rootFolderPath: selectedProjectRoot.folderPath,
        initialRootFolderPath: initialProject?.rootFolderPath || initialProject?.path,
        parentFolderPath: selectedProjectRoot.folderPath,
        parentFolderName: selectedProjectRoot.folderName,
        structureKey: String(selectedStructureKey || '').trim(),
      });
      onClose();
      return;
    }
    if (!onCreateProject) return;

    const structureKey = String(selectedStructureKey || '').trim();
    const isFree = structureKey === 'free';

    console.log('[CreateProjectModal] Creating project with:', {
      projectNumber,
      projectName,
      siteId: selectedProjectRoot.siteId,
      parentFolderPath: selectedProjectRoot.folderPath,
      selectedStructureKey: structureKey,
    });

    onCreateProject({
      projectNumber,
      projectName,
      siteId: selectedProjectRoot.siteId,
      parentFolderPath: selectedProjectRoot.folderPath,
      parentFolderName: selectedProjectRoot.folderName,
      structureType: isFree ? 'free' : 'system',
      systemPhase: isFree ? null : structureKey,
    });
  };

  const canSave = canCreate && (isEditMode ? !isSaving : !isCreating);
  useModalKeyboard(visible, onClose, handleCreate, { canSave });

  const { boxStyle, overlayStyle, headerProps, resizeHandles } = useDraggableResizableModal(!!visible, {
    defaultWidth: 1120,
    defaultHeight: 780,
    minWidth: 520,
    minHeight: 480,
  });

  const locModal = useDraggableResizableModal(!!locationPickerOpen, {
    defaultWidth: 640,
    defaultHeight: 480,
    minWidth: 420,
    minHeight: 360,
  });

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.overlay, overlayStyle]} onPress={onClose}>
        <Pressable style={[styles.modal, boxStyle]} onPress={(e) => e.stopPropagation()} data-modal="true">
          {/* Banner – golden rule: en rad, flyttbar (drag i bannern på webb) */}
          <View
            style={[styles.banner, headerProps?.style]}
            {...(Platform.OS === 'web' && headerProps?.onMouseDown ? { onMouseDown: headerProps.onMouseDown } : {})}
          >
            <View style={styles.bannerLeft}>
              <View style={styles.bannerIcon}>
                <Ionicons name={isEditMode ? 'pencil-outline' : 'add-circle-outline'} size={20} color={BANNER_THEME.titleColor} />
              </View>
              <Text style={styles.bannerTitle} numberOfLines={1}>
                {isEditMode ? 'Ändra projekt' : 'Skapa nytt projekt'}
                <Text style={styles.bannerSubtitleInline}> – {isEditMode ? 'Projektnummer, namn och lagring' : 'Projektnummer, plats och struktur'}</Text>
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.bannerClose} accessibilityLabel="Stäng" {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}>
              <Ionicons name="close" size={BANNER_THEME.closeIconSize} color={BANNER_THEME.titleColor} />
            </TouchableOpacity>
          </View>

          {/* Loading overlay */}
          {(isCreating || (isEditMode && isSaving)) && (
            <View style={styles.loadingOverlay}>
              <View style={styles.loadingContent}>
                <ActivityIndicator size="large" color="#1976D2" />
                <Text style={styles.loadingText}>{isEditMode ? 'Sparar...' : 'Skapar projekt...'}</Text>
                <Text style={styles.loadingSubtext}>
                  {isEditMode ? 'Uppdaterar projekt' : 'Skapar projektmapp och struktur i SharePoint'}
                </Text>
              </View>
            </View>
          )}

          <View style={styles.modalBody}>
          <View style={styles.layoutRow}>
            {/* SIDEBAR – STATUS */}
            <View style={styles.sidebar}>
              {/* Projekt */}
              <View
                style={[
                  styles.statusSection,
                  isProjectSectionComplete && styles.statusSectionDone,
                  !isProjectSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isProjectSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isProjectSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Projekt</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasProjectNumber ? '✓' : '•'} Projektnummer
                  </Text>
                  <Text style={styles.statusItemText}>
                    {hasProjectName ? '✓' : '•'} Projektnamn
                  </Text>
                </View>
              </View>

              {/* Lagring */}
              <View
                style={[
                  styles.statusSection,
                  isStorageSectionComplete && styles.statusSectionDone,
                  !isStorageSectionComplete && isProjectSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isStorageSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isStorageSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Lagring</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasProjectRoot ? '✓' : '•'} Projektplats
                  </Text>
                </View>
              </View>

              {/* Mappstruktur */}
              <View
                style={[
                  styles.statusSection,
                  isStructureSectionComplete && styles.statusSectionDone,
                  !isStructureSectionComplete && isStorageSectionComplete && styles.statusSectionActive,
                ]}
              >
                <View style={styles.statusHeaderRow}>
                  <View
                    style={[
                      styles.circle,
                      isStructureSectionComplete && styles.circleDone,
                    ]}
                  >
                    {isStructureSectionComplete ? <Text style={styles.circleText}>✓</Text> : null}
                  </View>
                  <Text style={styles.statusTitle}>Mappstruktur</Text>
                </View>
                <View style={styles.statusItems}>
                  <Text style={styles.statusItemText}>
                    {hasStructure ? '✓' : '•'} {selectedStructureLabel || 'Välj struktur'}
                  </Text>
                </View>
              </View>

            </View>

            {/* HÖGER – FORMULÄR */}
            <View style={styles.content}>
              {/* Projektinformation */}
              <Text style={styles.sectionTitle}>Projektinformation</Text>

              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Projektnummer *</Text>
                <TextInput
                  value={projectNumber}
                  onChangeText={setProjectNumber}
                  placeholder="Projektnummer"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>

              <View style={styles.section}>
                <Text style={styles.label}>Projektnamn *</Text>
                <TextInput
                  value={projectName}
                  onChangeText={setProjectName}
                  placeholder="Projektnamn"
                  placeholderTextColor="#9CA3AF"
                  style={styles.input}
                />
              </View>

              {/* Lagring – rubriken "Välj lagringsplats" är knappen */}
              <View style={[styles.section, styles.sectionAfterTitle]}>
                {(!availableSites || availableSites.length === 0) && (
                  <Text style={styles.helperText}>
                    Inga SharePoint-ytor är konfigurerade ännu.
                  </Text>
                )}
                {availableSites && availableSites.length > 0 && (
                  <>
                    <TouchableOpacity
                      onPress={() => openLocationPicker(selectedProjectRoot?.siteId ? 'folders' : 'sites')}
                      style={styles.locationHeaderButton}
                      activeOpacity={0.7}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Ionicons name="cloud" size={18} color="#1976D2" style={styles.sectionHeaderIcon} />
                      <Text style={styles.locationHeaderButtonText} numberOfLines={1}>
                        {selectedProjectRoot
                          ? (selectedProjectRoot.folderPath
                              ? `${selectedProjectRoot.siteName} / ${selectedProjectRoot.folderPath}`
                              : selectedProjectRoot.siteName)
                          : 'Välj lagringsplats'}
                      </Text>
                      <Ionicons name="chevron-forward" size={16} color="#64748b" />
                    </TouchableOpacity>
                    {selectedProjectRoot && (
                      <View style={styles.locationBreadcrumbWrap}>
                        <Text style={styles.locationBreadcrumbText} numberOfLines={1}>
                          {selectedProjectRoot.folderPath
                            ? `${selectedProjectRoot.siteName} / ${selectedProjectRoot.folderPath}`
                            : selectedProjectRoot.siteName}
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* Mappstruktur */}
              <View style={[styles.sectionHeaderRow, { marginTop: 6 }]}> 
                <Ionicons name="albums-outline" size={18} color="#1976D2" style={styles.sectionHeaderIcon} />
                <Text style={styles.sectionHeaderTitle}>Mappstruktur</Text>
              </View>

              <View style={[styles.section, styles.sectionAfterTitle]}>
                <Text style={styles.label}>Välj struktur *</Text>

                {(() => {
                  const STRUCTURE_CARDS = [
                    {
                      key: 'kalkylskede',
                      name: 'Kalkylskede',
                      color: '#2563EB',
                      icon: 'calculator-outline',
                      description: 'Kalkyl, offerter, översikt, checklista. AI-stöd.',
                      detailDescription: 'Färdig mappstruktur för kalkyl, offerter, översikt och checklista. Stöd för AI-analys och dokumentation.',
                      disabled: false,
                    },
                    {
                      key: 'produktion',
                      name: 'Produktion',
                      color: '#16A34A',
                      icon: 'construct-outline',
                      description: 'Kommer snart.',
                      detailDescription: 'Struktur för produktion. Denna fas är under uppbyggnad och aktiveras i en senare version.',
                      disabled: true,
                    },
                    {
                      key: 'eftermarknad',
                      name: 'Eftermarknad',
                      color: '#9333EA',
                      icon: 'time-outline',
                      description: 'Kommer snart.',
                      detailDescription: 'Struktur för eftermarknad. Denna fas är under uppbyggnad och aktiveras i en senare version.',
                      disabled: true,
                    },
                    {
                      key: 'avslut',
                      name: 'Avslutat',
                      color: '#374151',
                      icon: 'checkmark-circle-outline',
                      description: 'Kommer snart.',
                      detailDescription: 'Struktur för avslut och överlämning. Denna fas är under uppbyggnad och aktiveras i en senare version.',
                      disabled: true,
                    },
                    {
                      key: 'free',
                      name: 'Valfri',
                      color: '#D97706',
                      icon: 'folder-open-outline',
                      description: 'Endast projektmapp.',
                      detailDescription: 'Skapar bara projektmappen utan systemmappar. Använd om du vill styra mappstrukturen helt själv.',
                      disabled: false,
                    },
                  ];

                  const selectedCard = STRUCTURE_CARDS.find((c) => String(selectedStructureKey) === String(c.key));

                  return (
                    <>
                      <View style={styles.structureCardsGrid}>
                        {STRUCTURE_CARDS.map((card) => {
                          const selected = String(selectedStructureKey) === String(card.key);
                          return (
                            <TouchableOpacity
                              key={card.key}
                              onPress={() => {
                                if (card.disabled) return;
                                setSelectedStructureKey(card.key);
                              }}
                              activeOpacity={0.85}
                              style={[
                                styles.structureCard,
                                { borderColor: card.color },
                                selected && styles.structureCardSelected,
                                selected && { borderColor: card.color },
                                card.disabled && styles.structureCardDisabled,
                              ]}
                              {...(Platform.OS === 'web' ? { cursor: card.disabled ? 'not-allowed' : 'pointer' } : {})}
                            >
                              <View style={styles.structureCardHeader}>
                                {card.disabled ? (
                                  <View style={styles.structureCardInactiveIcon}>
                                    <Ionicons name="close" size={10} color="#fff" />
                                  </View>
                                ) : (
                                  <Ionicons
                                    name={card.icon}
                                    size={18}
                                    color={card.color}
                                    style={{ marginRight: 6 }}
                                  />
                                )}
                                {card.disabled && <View style={{ width: 6 }} />}
                                <Text
                                  style={[
                                    styles.structureCardTitle,
                                    !card.disabled && { color: card.color },
                                    card.disabled && styles.structureCardTitleDisabled,
                                  ]}
                                  numberOfLines={1}
                                >
                                  {card.name}
                                </Text>
                              </View>
                              <Text
                                style={[
                                  styles.structureCardDescription,
                                  card.disabled && styles.structureCardDescriptionDisabled,
                                ]}
                                numberOfLines={2}
                              >
                                {card.description}
                              </Text>
                              {selected && !card.disabled && (
                                <View style={[styles.structureCardCheck, { borderColor: card.color }]}>
                                  <Ionicons name="checkmark-circle" size={20} color={card.color} />
                                </View>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                      {selectedCard && (
                        <Text style={styles.structureDetailDescription}>
                          {selectedCard.detailDescription}
                        </Text>
                      )}
                    </>
                  );
                })()}
              </View>


              {/* Footer – golden rule: Avbryt dimmad röd, Spara/Skapa projekt mörk */}
              <View style={styles.footerRow}>
                <TouchableOpacity onPress={onClose} style={styles.footerBtnAvbryt} {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}>
                  <Text style={styles.footerBtnAvbrytText}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCreate}
                  style={[
                    styles.footerBtnDark,
                    (!canSave) && styles.footerBtnDisabled,
                  ]}
                  disabled={!canSave}
                  {...(Platform.OS === 'web' ? { cursor: !canSave ? 'not-allowed' : 'pointer' } : {})}
                >
                  {(isCreating || (isEditMode && isSaving)) ? (
                    <View style={styles.createBtnLoading}>
                      <ActivityIndicator size="small" color="#fff" style={{ marginRight: 8 }} />
                      <Text style={styles.footerBtnText}>{isEditMode ? 'Sparar...' : 'Skapar...'}</Text>
                    </View>
                  ) : (
                    <Text style={styles.footerBtnText}>{isEditMode ? 'Spara' : 'Skapa projekt'}</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
          </View>
          
          {/* Dropdown overlays - renderas ovanför allt innehåll */}
          {locationPickerOpen && (
            <TouchableOpacity
              style={styles.dropdownBackdrop}
              activeOpacity={1}
              onPress={() => {
                setLocationPickerOpen(false);
                // Reset location picker state when closed
                setLocationPickerStep('sites');
                setActiveSite(null);
                setCurrentPath('');
                setLocationPathHistory([]);
              }}
            />
          )}

          {/* Lagringsplats-utforskare – egen modal, golden rules (flyttbar, storleksändring) */}
          {locationPickerOpen && (
            <Modal visible transparent animationType="fade" onRequestClose={() => setLocationPickerOpen(false)}>
              <Pressable style={[styles.locationExplorerOverlay, locModal.overlayStyle]} onPress={() => setLocationPickerOpen(false)}>
                <Pressable style={[styles.locationExplorerBox, locModal.boxStyle]} onPress={(e) => e.stopPropagation()}>
                  <View
                    style={[styles.locationExplorerBanner, locModal.headerProps?.style]}
                    {...(Platform.OS === 'web' && locModal.headerProps?.onMouseDown ? { onMouseDown: locModal.headerProps.onMouseDown } : {})}
                  >
                    <Text style={styles.locationExplorerBannerTitle}>Välj lagringsplats</Text>
                    <TouchableOpacity onPress={() => setLocationPickerOpen(false)} style={styles.locationExplorerClose} accessibilityLabel="Stäng" {...(Platform.OS === 'web' ? { onMouseDown: (e) => e.stopPropagation() } : {})}>
                      <Ionicons name="close" size={20} color="#f1f5f9" />
                    </TouchableOpacity>
                  </View>
                  <View style={styles.locationExplorerBody}>
                    <View style={styles.locationExplorerLeft}>
                      <Text style={styles.locationExplorerPanelTitle}>SharePoint-sites</Text>
                      <ScrollView style={styles.locationExplorerSites} nestedScrollEnabled>
                        {availableSites.map((site) => {
                          const isSelected = activeSite?.id === site.id;
                          return (
                            <Pressable
                              key={site.id}
                              onPress={() => handleSelectSite(site)}
                              style={({ hovered, pressed }) => [
                                styles.locationExplorerSiteRow,
                                isSelected && styles.locationExplorerSiteRowSelected,
                                !isSelected && (hovered || pressed) && styles.locationExplorerSiteRowHover,
                              ]}
                              {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                            >
                              <Ionicons name="cloud-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                              <Text style={styles.locationExplorerSiteName} numberOfLines={1}>{getSiteDisplayName(site)}</Text>
                            </Pressable>
                          );
                        })}
                      </ScrollView>
                    </View>
                    <View style={styles.locationExplorerRight}>
                      <Text style={styles.locationExplorerPanelTitle}>
                        {activeSite ? getSiteDisplayName(activeSite) : 'Välj en site till vänster'}
                      </Text>
                      {!activeSite && (
                        <Text style={styles.helperText}>Välj en site i listan till vänster för att se mappar.</Text>
                      )}
                      {activeSite && (
                        <>
                          {locationPathHistory.length > 0 && (
                            <View style={styles.locationExplorerBreadcrumb}>
                              <Pressable onPress={handleNavigateBack} style={({ hovered, pressed }) => [styles.breadcrumbBack, (hovered || pressed) && styles.locationBreadcrumbBackHover]}>
                                <Text style={styles.breadcrumbText}>← Tillbaka</Text>
                              </Pressable>
                              <Text style={styles.locationExplorerBreadcrumbPath} numberOfLines={1}>
                                {locationPathHistory.map(h => h.name).join(' / ')}
                                {currentPath ? ` / ${currentPath.split('/').pop()}` : ''}
                              </Text>
                            </View>
                          )}
                          <View style={styles.locationExplorerNewFolderRow}>
                            {!locationShowNewFolderInput ? (
                              <Pressable
                                onPress={() => setLocationShowNewFolderInput(true)}
                                style={({ hovered, pressed }) => [styles.locationNewFolderBtn, (hovered || pressed) && styles.locationNewFolderBtnHover]}
                                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                              >
                                <Ionicons name="add" size={16} color="#64748b" style={{ marginRight: 4 }} />
                                <Text style={styles.locationNewFolderBtnText}>Ny mapp</Text>
                              </Pressable>
                            ) : (
                              <View style={styles.locationNewFolderForm}>
                                <TextInput
                                  placeholder="Mappnamn"
                                  value={locationNewFolderName}
                                  onChangeText={setLocationNewFolderName}
                                  style={styles.locationNewFolderInput}
                                  editable={!locationCreatingFolder}
                                  {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                                />
                                <TouchableOpacity
                                  onPress={() => { setLocationShowNewFolderInput(false); setLocationNewFolderName(''); setLocationError(''); }}
                                  style={styles.locationNewFolderCancelBtn}
                                  {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                >
                                  <Text style={styles.locationNewFolderCancelText}>Avbryt</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                  onPress={handleCreateFolderInLocation}
                                  disabled={!String(locationNewFolderName || '').trim() || locationCreatingFolder}
                                  style={[styles.locationNewFolderCreateBtn, (!String(locationNewFolderName || '').trim() || locationCreatingFolder) && styles.locationNewFolderCreateBtnDisabled]}
                                  {...(Platform.OS === 'web' ? { cursor: (!String(locationNewFolderName || '').trim() || locationCreatingFolder) ? 'not-allowed' : 'pointer' } : {})}
                                >
                                  {locationCreatingFolder ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.locationNewFolderCreateText}>Skapa</Text>}
                                </TouchableOpacity>
                              </View>
                            )}
                          </View>
                          {locationError ? <Text style={styles.locationExplorerError}>{locationError}</Text> : null}
                          {locationRenamingFolder && (
                            <View style={styles.locationRenameRow}>
                              <TextInput
                                value={locationRenameValue}
                                onChangeText={setLocationRenameValue}
                                placeholder="Nytt mappnamn"
                                style={styles.locationNewFolderInput}
                                editable={!locationRenaming}
                                {...(Platform.OS === 'web' ? { outlineStyle: 'none' } : {})}
                              />
                              <TouchableOpacity
                                onPress={() => { setLocationRenamingFolder(null); setLocationRenameValue(''); setLocationError(''); }}
                                style={styles.locationNewFolderCancelBtn}
                                {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                              >
                                <Text style={styles.locationNewFolderCancelText}>Avbryt</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={handleLocationRenameFolder}
                                disabled={!String(locationRenameValue || '').trim() || locationRenaming}
                                style={[styles.locationNewFolderCreateBtn, (!String(locationRenameValue || '').trim() || locationRenaming) && styles.locationNewFolderCreateBtnDisabled]}
                                {...(Platform.OS === 'web' ? { cursor: (!String(locationRenameValue || '').trim() || locationRenaming) ? 'not-allowed' : 'pointer' } : {})}
                              >
                                {locationRenaming ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.locationNewFolderCreateText}>Spara</Text>}
                              </TouchableOpacity>
                            </View>
                          )}
                          <ScrollView style={styles.locationExplorerFolders} nestedScrollEnabled>
                            {loadingLocationFolders ? (
                              <Text style={styles.helperText}>Laddar mappar...</Text>
                            ) : locationFolders.length === 0 ? (
                              <>
                                {!currentPath && (
                                  <Pressable
                                    onPress={() => handleSelectLocation(activeSite, '', 'Root')}
                                    style={({ hovered, pressed }) => [styles.folderRow, (hovered || pressed) && styles.locationExplorerFolderRowHover]}
                                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                  >
                                    <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                    <Text style={styles.folderName}>{getSiteDisplayName(activeSite)}</Text>
                                  </Pressable>
                                )}
                                <Text style={styles.helperText}>Inga mappar hittades</Text>
                              </>
                            ) : (
                              <>
                                {!currentPath && (
                                  <Pressable
                                    onPress={() => handleSelectLocation(activeSite, '', 'Root')}
                                    style={({ hovered, pressed }) => [styles.folderRow, (hovered || pressed) && styles.locationExplorerFolderRowHover]}
                                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                  >
                                    <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                    <Text style={styles.folderName}>{getSiteDisplayName(activeSite)}</Text>
                                  </Pressable>
                                )}
                                {locationFolders.map((folder) => (
                                  <Pressable
                                    key={folder.path}
                                    onPress={() => handleNavigateToFolder(folder)}
                                    onContextMenu={Platform.OS === 'web' ? (e) => handleLocationFolderContextMenu(e, folder) : undefined}
                                    style={({ hovered, pressed }) => [styles.folderRow, (hovered || pressed) && styles.locationExplorerFolderRowHover]}
                                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                  >
                                    <Ionicons name="folder-outline" size={18} color="#1976D2" style={{ marginRight: 8 }} />
                                    <Text style={styles.folderName}>{folder.name}</Text>
                                  </Pressable>
                                ))}
                                {currentPath && (
                                  <Pressable
                                    onPress={() => handleSelectLocation(activeSite, currentPath, currentPath.split('/').pop())}
                                    style={({ hovered, pressed }) => [styles.selectLocationButton, { marginTop: 8 }, (hovered || pressed) && styles.locationExplorerSelectBtnHover]}
                                    {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                                  >
                                    <Text style={styles.selectLocationButtonText}>
                                      Välj "{currentPath.split('/').pop()}"
                                    </Text>
                                  </Pressable>
                                )}
                              </>
                            )}
                          </ScrollView>
                        </>
                      )}
                    </View>
                  </View>
                  <View style={styles.locationExplorerFooter}>
                    <Pressable
                      onPress={() => setLocationPickerOpen(false)}
                      style={({ hovered, pressed }) => [styles.locationExplorerCloseBtn, (hovered || pressed) && styles.locationExplorerCloseBtnHover]}
                      {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                    >
                      <Text style={styles.locationExplorerCloseBtnText}>Stäng</Text>
                    </Pressable>
                  </View>
                  {locationContextMenu && Platform.OS === 'web' && (
                    <Pressable
                      style={[styles.locationContextMenuBackdrop, { position: 'fixed', left: 0, top: 0, right: 0, bottom: 0, zIndex: 9999 }]}
                      onPress={() => setLocationContextMenu(null)}
                    >
                      <Pressable
                        style={[styles.locationContextMenuBox, { position: 'fixed', left: locationContextMenu.x, top: locationContextMenu.y, zIndex: 10000 }]}
                        onPress={(e) => { if (e?.stopPropagation) e.stopPropagation(); }}
                      >
                        <TouchableOpacity
                          style={styles.locationContextMenuItem}
                          onPress={() => {
                            setLocationRenamingFolder(locationContextMenu.folder);
                            setLocationRenameValue(locationContextMenu.folder.name || '');
                            setLocationContextMenu(null);
                          }}
                          {...(Platform.OS === 'web' ? { cursor: 'pointer' } : {})}
                        >
                          <Ionicons name="pencil-outline" size={16} color="#475569" style={{ marginRight: 8 }} />
                          <Text style={styles.locationContextMenuItemText}>Byt namn</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                          style={[styles.locationContextMenuItem, styles.locationContextMenuItemDanger]}
                          onPress={handleLocationDeleteFolder}
                          disabled={locationDeleting}
                          {...(Platform.OS === 'web' ? { cursor: locationDeleting ? 'not-allowed' : 'pointer' } : {})}
                        >
                          {locationDeleting ? <ActivityIndicator size="small" color="#b91c1c" style={{ marginRight: 8 }} /> : <Ionicons name="trash-outline" size={16} color="#b91c1c" style={{ marginRight: 8 }} />}
                          <Text style={styles.locationContextMenuItemTextDanger}>Ta bort</Text>
                        </TouchableOpacity>
                      </Pressable>
                    </Pressable>
                  )}
                  {locModal.resizeHandles}
                </Pressable>
              </Pressable>
            </Modal>
          )}

          {resizeHandles}
      </Pressable>
    </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  modal: {
    width: '92%',
    maxWidth: 1120,
    backgroundColor: '#fff',
    borderRadius: 14,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
    flexDirection: 'column',
    display: 'flex',
    ...(Platform.OS === 'web' ? {
      isolation: 'isolate',
      minHeight: 0,
    } : {}),
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: BANNER_THEME.paddingVertical,
    paddingHorizontal: BANNER_THEME.paddingHorizontal,
    backgroundColor: BANNER_THEME.backgroundColor,
    borderBottomWidth: 1,
    borderBottomColor: BANNER_THEME.borderBottomColor,
  },
  bannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  bannerIcon: {
    width: BANNER_THEME.iconSize,
    height: BANNER_THEME.iconSize,
    borderRadius: BANNER_THEME.iconBgRadius,
    backgroundColor: BANNER_THEME.iconBg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    fontSize: BANNER_THEME.titleFontSize,
    fontWeight: BANNER_THEME.titleFontWeight,
    color: BANNER_THEME.titleColor,
  },
  bannerSubtitle: {
    fontSize: BANNER_THEME.subtitleFontSize,
    color: BANNER_THEME.subtitleColor,
    marginTop: 2,
  },
  bannerSubtitleInline: {
    fontSize: BANNER_THEME.subtitleFontSize,
    fontWeight: '400',
    color: BANNER_THEME.subtitleColor,
  },
  bannerClose: {
    padding: BANNER_THEME.closeBtnPadding,
    borderRadius: BANNER_THEME.iconBgRadius,
    backgroundColor: BANNER_THEME.iconBg,
  },
  modalBody: {
    flex: 1,
    minHeight: 0,
    padding: 24,
    flexDirection: 'column',
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 16,
  },
  section: {
    marginBottom: 20,
    ...(Platform.OS === 'web' ? {
      // Web: ensure sections don't clip dropdowns
      overflow: 'visible',
      position: 'relative',
    } : {}),
  },
  sectionAfterTitle: {
    marginTop: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
    marginTop: 0,
  },
  label: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  input: {
    height: 42,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    paddingHorizontal: 12,
  },
  siteRow: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  siteRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  siteText: {
    fontSize: 14,
  },
  siteUrl: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  dropdownContainer: {
    marginTop: 4,
    position: 'relative',
    backgroundColor: '#ffffff',
    zIndex: 1000, // Very high z-index to ensure dropdowns are above all modal content
    ...(Platform.OS === 'web' ? {
      // Web: ensure container doesn't clip dropdown
      overflow: 'visible',
    } : {}),
  },
  dropdownDisabled: {
    opacity: 0.6,
  },
  dropdownHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 8,
    backgroundColor: '#fafafa',
  },
  dropdownText: {
    fontSize: 14,
  },
  dropdownChevron: {
    fontSize: 12,
    color: '#374151',
  },
  dropdownChevronWrapper: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#e5e7eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  locationHeaderButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    backgroundColor: '#f8fafc',
  },
  locationHeaderButtonText: {
    flex: 1,
    fontSize: 14,
    fontWeight: '600',
    color: '#1e293b',
    marginLeft: 8,
  },
  locationBreadcrumbWrap: {
    marginTop: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
    borderRadius: 6,
  },
  locationBreadcrumbText: {
    fontSize: 12,
    color: '#64748b',
    fontWeight: '400',
  },
  // Legacy style - behålls för kompatibilitet men används inte längre
  dropdownList: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9999,
    zIndex: 10000,
  },
  // Ny style för dropdown som renderas direkt i modal-root
  dropdownListAbsolute: {
    position: 'absolute',
    marginTop: 4,
    backgroundColor: '#ffffff',
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderWidth: 1,
    borderColor: '#eee',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 10000,
    zIndex: 99999, // Mycket hög z-index för att ligga ovanför allt
    maxHeight: 300,
    minWidth: 200,
    ...(Platform.OS === 'web' ? {
      opacity: 1,
      backdropFilter: 'none',
      isolation: 'isolate',
      willChange: 'transform',
      boxShadow: '0 12px 40px rgba(0, 0, 0, 0.25)',
      // Säkerställ att dropdown är ovanför allt på web
      position: 'fixed', // Använd fixed på web för att undvika parent stacking contexts
    } : {}),
  },
  dropdownBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 99998, // Under dropdown men ovanför modal-innehåll
  },
  layoutRow: {
    flexDirection: 'row',
    marginTop: 8,
    flex: 1,
    minHeight: 0,
  },
  sidebar: {
    width: 220,
    paddingRight: 16,
    borderRightWidth: 1,
    borderRightColor: '#eee',
  },
  content: {
    flex: 1,
    paddingLeft: 16,
    position: 'relative',
    zIndex: 1, // Lower z-index than dropdowns
    ...(Platform.OS === 'web' ? {
      // Web: ensure content doesn't clip dropdowns
      overflow: 'visible',
    } : {}),
  },
  statusSection: {
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#e5e7eb',
    backgroundColor: '#f9fafb',
    marginBottom: 10,
  },
  statusSectionActive: {
    borderColor: '#2563eb',
    backgroundColor: '#eff6ff',
  },
  statusSectionDone: {
    borderColor: '#22c55e',
    backgroundColor: '#ecfdf3',
  },
  statusHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  statusTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  statusItems: {
    marginLeft: 28,
  },
  statusItemText: {
    fontSize: 12,
    color: '#374151',
  },
  circle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#2563eb',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  circleDone: {
    borderColor: '#22c55e',
    backgroundColor: '#22c55e',
  },
  circleText: {
    fontSize: 12,
    color: '#fff',
    fontWeight: '500',
  },
  helperText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 6,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  sectionHeaderIcon: {
    marginRight: 6,
    marginTop: 1,
  },
  sectionHeaderTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  folderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#eee',
    marginBottom: 2,
    backgroundColor: '#fff',
  },
  folderRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  folderName: {
    fontSize: 14,
    fontWeight: '500',
  },
  folderPath: {
    fontSize: 11,
    color: '#777',
    marginTop: 2,
  },
  structureOptionRow: {
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 6,
  },
  structureOptionRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  structureOptionTitle: {
    fontSize: 14,
    fontWeight: '500',
    color: '#111827',
  },
  structureOptionDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
    lineHeight: 16,
    whiteSpace: Platform.OS === 'web' ? 'pre-line' : 'normal',
  },
  structureRow: {
    flexDirection: 'row',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#fff',
    marginBottom: 4,
  },
  structureRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  structureRowDisabled: {
    opacity: 0.45,
  },
  structureTitle: {
    fontSize: 14,
    fontWeight: '500',
    lineHeight: 18,
  },
  structureDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 1,
    lineHeight: 16,
    whiteSpace: Platform.OS === 'web' ? 'pre-line' : 'normal',
  },
  structureCardsGrid: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 8,
    flexWrap: 'nowrap',
  },
  structureCard: {
    flex: 1,
    minWidth: 0,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderWidth: 2,
    backgroundColor: '#ffffff',
    position: 'relative',
    ...(Platform.OS === 'web' ? { boxSizing: 'border-box' } : {}),
  },
  structureCardSelected: {
    ...(Platform.OS === 'web' ? { boxShadow: '0 0 0 1px currentColor' } : {}),
  },
  structureCardDisabled: {
    opacity: 0.7,
  },
  structureCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  structureCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1f2937',
    flex: 1,
  },
  structureCardTitleDisabled: {
    color: '#6B7280',
  },
  structureCardDescription: {
    fontSize: 11,
    color: '#64748b',
    lineHeight: 14,
    paddingRight: 20,
  },
  structureCardDescriptionDisabled: {
    color: '#9CA3AF',
  },
  structureCardCheck: {
    position: 'absolute',
    top: 6,
    right: 6,
  },
  structureCardInactiveIcon: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#dc2626',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 0,
  },
  structureDetailDescription: {
    marginTop: 10,
    fontSize: 13,
    color: '#64748b',
    lineHeight: 19,
  },
  disabledText: {
    color: '#999',
  },
  radio: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 2,
    borderColor: '#1976D2',
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2, // Liten justering för vertikal centrering med text
  },
  radioDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#1976D2',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  footerRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    position: 'relative',
    zIndex: 1,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    borderTopColor: FOOTER_THEME.borderTopColor,
    backgroundColor: FOOTER_THEME.backgroundColor,
  },
  footerBtnAvbryt: {
    paddingVertical: FOOTER_THEME.btnPaddingVertical,
    paddingHorizontal: FOOTER_THEME.btnPaddingHorizontal,
    borderRadius: FOOTER_THEME.btnBorderRadius,
    borderWidth: 1,
    borderColor: '#fecaca',
    backgroundColor: '#fef2f2',
  },
  footerBtnAvbrytText: {
    fontSize: FOOTER_THEME.btnFontSize,
    fontWeight: FOOTER_THEME.btnFontWeight,
    color: '#b91c1c',
  },
  footerBtnDark: {
    paddingVertical: FOOTER_THEME.btnPaddingVertical,
    paddingHorizontal: FOOTER_THEME.btnPaddingHorizontal,
    borderRadius: FOOTER_THEME.btnBorderRadius,
    borderWidth: 1,
    borderColor: FOOTER_THEME.btnBorderColor,
    backgroundColor: FOOTER_THEME.btnBackground,
    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : {}),
  },
  footerBtnDisabled: {
    opacity: 0.6,
  },
  footerBtnText: {
    fontSize: FOOTER_THEME.btnFontSize,
    fontWeight: FOOTER_THEME.btnFontWeight,
    color: FOOTER_THEME.btnTextColor,
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginRight: 12,
  },
  cancelText: {
    color: '#374151',
  },
  createBtn: {
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 10,
    backgroundColor: '#2563eb',
  },
  createBtnDisabled: {
    backgroundColor: '#d1d5db',
  },
  createText: {
    color: '#fff',
    fontWeight: '500',
  },
  freeRow: {
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#eee',
    backgroundColor: '#f9f9f9',
  },
  freeRowSelected: {
    borderColor: '#1976D2',
    backgroundColor: '#F0F6FF',
  },
  freeTitle: {
    fontSize: 14,
    fontWeight: '500',
  },
  freeDescription: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  // Additional styles for dropdown lists to ensure they're above all content
  siteDropdownList: {
    // Site dropdown specific - already has high z-index from dropdownList
  },
  structureDropdownList: {
    // Structure dropdown specific - already has high z-index from dropdownList
    // Ensure it's above footer buttons and other content
    zIndex: 10001, // Even higher than site dropdown
    elevation: 10000,
  },
  // Location picker styles
  locationPickerHeader: {
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#eee',
    marginBottom: 8,
  },
  locationPickerTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 6,
    color: '#374151',
  },
  locationPickerSites: {
    maxHeight: 200,
  },
  locationBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    marginBottom: 8,
  },
  breadcrumbBack: {
    marginRight: 8,
  },
  breadcrumbText: {
    fontSize: 12,
    color: '#1976D2',
    fontWeight: '500',
  },
  breadcrumbPath: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  locationFolders: {
    maxHeight: 250,
  },
  selectLocationButton: {
    marginTop: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
    backgroundColor: '#1976D2',
    borderRadius: 8,
    alignItems: 'center',
  },
  selectLocationButtonSelected: {
    backgroundColor: '#22c55e',
  },
  selectLocationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '500',
  },
  locationExplorerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  locationExplorerBox: {
    width: '100%',
    maxWidth: 640,
    maxHeight: '85%',
    backgroundColor: '#fff',
    borderRadius: 12,
    overflow: 'hidden',
    flexDirection: 'column',
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.2)' } : { elevation: 8 }),
  },
  locationExplorerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: '#1e293b',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  locationExplorerBannerTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#f1f5f9',
  },
  locationExplorerClose: {
    padding: 4,
  },
  locationExplorerBody: {
    flex: 1,
    flexDirection: 'row',
    minHeight: 320,
  },
  locationExplorerLeft: {
    width: 220,
    borderRightWidth: 1,
    borderRightColor: '#e2e8f0',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  locationExplorerPanelTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  locationExplorerSites: {
    flex: 1,
  },
  locationExplorerSiteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 2,
  },
  locationExplorerSiteRowSelected: {
    backgroundColor: '#eff6ff',
    borderWidth: 1,
    borderColor: '#bfdbfe',
  },
  locationExplorerSiteRowHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#f1f5f9' } : {}),
  },
  locationExplorerSiteName: {
    flex: 1,
    fontSize: 13,
    color: '#1e293b',
  },
  locationExplorerRight: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 12,
    minWidth: 0,
  },
  locationExplorerBreadcrumb: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: '#f1f5f9',
    borderRadius: 6,
    gap: 8,
  },
  locationExplorerBreadcrumbPath: {
    flex: 1,
    fontSize: 12,
    color: '#64748b',
  },
  locationExplorerFolders: {
    flex: 1,
  },
  locationExplorerNewFolderRow: {
    marginBottom: 8,
  },
  locationNewFolderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  locationNewFolderBtnText: {
    fontSize: 13,
    color: '#64748b',
  },
  locationNewFolderBtnHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#f1f5f9' } : {}),
  },
  locationNewFolderForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  locationNewFolderInput: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    borderRadius: 8,
    paddingHorizontal: 10,
    fontSize: 14,
    color: '#1e293b',
    backgroundColor: '#fff',
  },
  locationNewFolderCancelBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  locationNewFolderCancelText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#b91c1c',
  },
  locationNewFolderCreateBtn: {
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 8,
    backgroundColor: '#1e293b',
  },
  locationNewFolderCreateBtnDisabled: {
    opacity: 0.6,
  },
  locationNewFolderCreateText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#fff',
  },
  locationExplorerError: {
    fontSize: 12,
    color: '#dc2626',
    marginBottom: 8,
  },
  locationRenameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  locationContextMenuBackdrop: {
    backgroundColor: 'transparent',
  },
  locationContextMenuBox: {
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e2e8f0',
    paddingVertical: 4,
    minWidth: 160,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  locationContextMenuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  locationContextMenuItemText: {
    fontSize: 14,
    color: '#334155',
  },
  locationContextMenuItemDanger: {},
  locationContextMenuItemTextDanger: {
    fontSize: 14,
    fontWeight: '500',
    color: '#b91c1c',
  },
  locationExplorerFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#e2e8f0',
    backgroundColor: '#f8fafc',
  },
  locationExplorerCloseBtn: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: '#fef2f2',
    borderWidth: 1,
    borderColor: '#fecaca',
  },
  locationExplorerCloseBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#b91c1c',
  },
  locationExplorerCloseBtnHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#fee2e2' } : {}),
  },
  locationExplorerFolderRowHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#f8fafc', borderColor: '#e2e8f0' } : {}),
  },
  locationBreadcrumbBackHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#e2e8f0', borderRadius: 4 } : {}),
  },
  locationExplorerSelectBtnHover: {
    ...(Platform.OS === 'web' ? { backgroundColor: '#1565c0', opacity: 0.95 } : {}),
  },
  // Loading overlay styles
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 12,
    zIndex: 100000,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    fontSize: 18,
    fontWeight: '500',
    color: '#1976D2',
    marginTop: 16,
    marginBottom: 8,
  },
  loadingSubtext: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    maxWidth: 300,
  },
  createBtnLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
