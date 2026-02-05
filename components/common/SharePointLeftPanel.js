import { Ionicons } from '@expo/vector-icons';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Animated, Modal, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { LEFT_NAV } from '../../constants/leftNavTheme';
import { DEFAULT_PHASE, getPhaseConfig } from '../../features/projects/constants';
import { ensureDkBasStructure, ensureFolderPath, ensureKalkylskedeProjectFolderStructure, moveDriveItemByIdGuarded, renameDriveItemByIdGuarded } from '../../services/azure/fileService';
import { folderHasFilesDeep, getDriveItemByPath, getDriveItems, loadFolderChildren, moveDriveItemAcrossSitesByPath } from '../../services/azure/hierarchyService';
import { filterHierarchyByConfig } from '../../utils/filterSharePointHierarchy';
import { extractProjectMetadata, isProjectFolder } from '../../utils/isProjectFolder';
import { stripNumberPrefixForDisplay } from '../../utils/labelUtils';
import ContextMenu from '../ContextMenu';
import { archiveCompanyProject, auth, fetchSharePointProjectMetadataMap, getCompanySharePointSiteIdByRole, getCompanyVisibleSharePointSiteIds, getSharePointNavigationConfig, isLockedKalkylskedeSharePointFolderPath, normalizeSharePointPath, subscribeCompanyProjects, syncSharePointSiteVisibilityRemote, upsertCompanyProject } from '../firebase';
import { AnimatedChevron, MicroPulse, MicroShake } from './leftNavMicroAnimations';
import { ProjectTree } from './ProjectTree';
import SharePointSiteIcon from './SharePointSiteIcon';
import SidebarItem from './SidebarItem';

function isHiddenSystemRootFolderName(name) {
  const n = String(name || '').trim().toLowerCase();
  if (!n) return false;
  if (n === 'company' || n === 'projects') return true;
  if (n === '01-company' || n === '02-projects') return true;
  if (n === '01_company' || n === '02_projects') return true;
  if (n.startsWith('01-company') || n.startsWith('02-projects')) return true;
  return false;
}

function RecursiveFolderView({
  folder,
  level = 0,
  expandedSubs,
  spinSubs,
  lockedSubs,
  lockTickSubs,
  onToggle,
  companyId,
  hierarchy,
  setHierarchy,
  parentPath = '',
  isProject = false,
  onSelectProject = null,
  navigation = null,
  projectMetadataMap = null,
  fallbackPhaseKey = null,
  onOpenSpContextMenu = null,
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (!folder) return null;

  const safeName = folder.name || folder.id || '';
  const marginLeft = 12 + level * 8;
  const folderSpin = spinSubs?.[folder.id] || 0;
  const isExpanded = expandedSubs?.[folder.id] === true;
  const visibleChildren = Array.isArray(folder.children)
    ? folder.children
        .filter(child => child && (child.type === 'folder' || !child.type))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    : [];
  
  // Check if this folder is a project (if not already determined)
  const folderIsProject = isProject || isProjectFolder(folder);

  const folderLocked = !folderIsProject && ((lockedSubs?.[folder.id] === true) || (folder?.childrenLoaded === true && visibleChildren.length === 0));
  const lockTrigger = lockTickSubs?.[folder.id] || 0;
  const showChevron = !folderIsProject && !folderLocked && (!folder?.childrenLoaded || visibleChildren.length > 0);

  const extractedMeta = folderIsProject ? extractProjectMetadata(folder) : null;
  const projectPath = extractedMeta?.path || folder.path || folder.name || '';
  const siteId =
    String(
      folder.siteId ||
      folder.siteID ||
      folder?.site?.id ||
      folder?.site?.siteId ||
      hierarchy?.siteId ||
      hierarchy?.siteID ||
      ''
    ).trim();
  const projectMetaKey = siteId && projectPath ? `${siteId}|${projectPath}` : null;
  const savedMeta = projectMetaKey && projectMetadataMap ? projectMetadataMap.get(projectMetaKey) : null;
  const effectivePhaseKey =
    (savedMeta?.phaseKey && String(savedMeta.phaseKey).trim()) ||
    (folder?.phase && String(folder.phase).trim()) ||
    (fallbackPhaseKey && fallbackPhaseKey !== 'all' ? String(fallbackPhaseKey).trim() : null) ||
    DEFAULT_PHASE;
  const indicatorColor = getPhaseConfig(effectivePhaseKey)?.color || '#43A047';
  
  const handlePress = () => {
    try {
      if (folderIsProject) {
        // Project folder: navigate to project view
        const projectMetadata = extractedMeta;
        if (projectMetadata) {
          const projectData = {
            ...folder,
            // Display identity
            id: projectMetadata.id || projectMetadata.number || folder.name,
            number: projectMetadata.number || projectMetadata.id || '',
            name: projectMetadata.name || projectMetadata.fullName || folder.name,
            projectNumber: projectMetadata.number || projectMetadata.id || '',
            projectName: projectMetadata.name || '',
            fullName: projectMetadata.fullName || folder.name,
            // SharePoint identity (internal)
            sharePointId: projectMetadata.sharePointId || folder.id || null,
            // Location
            path: projectMetadata.path || folder.path || folder.name,
            siteId,
            // Project context
            type: 'project',
            phase: effectivePhaseKey,
            status: savedMeta?.status || (effectivePhaseKey === 'avslut' ? 'completed' : 'ongoing'),
          };
          
          if (onSelectProject) {
            onSelectProject(projectData);
          } else if (navigation) {
            navigation.navigate('ProjectDetails', {
              project: projectData,
              companyId,
            });
          }
        }
      } else {
        // Regular folder: expand/collapse
        if (onToggle) {
          onToggle(folder);
        }
      }
    } catch (error) {
      console.error('[RecursiveFolderView] Error handling folder press:', error);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ marginLeft, marginTop: 4 }}>
        <div
          onClick={handlePress}
          onContextMenu={(e) => {
            try {
              if (typeof onOpenSpContextMenu === 'function') onOpenSpContextMenu(e, folder);
            } catch (_e) {}
          }}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            backgroundColor: isHovered ? LEFT_NAV.hoverBg : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
        >
          {showChevron ? (
            <View style={{ marginRight: 6 }}>
              <AnimatedChevron
                expanded={isExpanded}
                spinTrigger={folderSpin}
                size={Math.max(12, 16 - level)}
                color={isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconDefault}
              />
            </View>
          ) : (
            <div style={{ width: Math.max(12, 16 - level), marginRight: 6 }} />
          )}

          {!folderIsProject && (
            <MicroShake trigger={lockTrigger}>
              <MicroPulse trigger={folderSpin}>
                <Ionicons
                  name={'folder-outline'}
                  size={Math.max(12, 16 - level)}
                  color={isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconDefault}
                  style={{ marginRight: 6 }}
                />
              </MicroPulse>
            </MicroShake>
          )}

          {folderIsProject && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: indicatorColor,
                marginRight: 8,
                border: '1px solid #bbb',
                display: 'inline-block',
              }}
            />
          )}

          <span
            style={{
              fontSize: 14,
              color: isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
              fontWeight: isHovered ? '600' : '500',
              fontFamily: LEFT_NAV.webFontFamily,
            }}
          >
            {safeName}
          </span>
        </div>

        {!folderIsProject && showChevron && isExpanded && visibleChildren.length > 0 && (
          <div style={{ marginLeft: 8, marginTop: 2 }}>
            {visibleChildren.map(child => {
              const childIsProject = isProjectFolder(child);
              return (
                <RecursiveFolderView
                  key={child.id || `${safeName}-${level}`}
                  folder={child}
                  level={level + 1}
                  expandedSubs={expandedSubs}
                  spinSubs={spinSubs}
                  lockedSubs={lockedSubs}
                  lockTickSubs={lockTickSubs}
                  onToggle={onToggle}
                  companyId={companyId}
                  hierarchy={hierarchy}
                  setHierarchy={setHierarchy}
                  parentPath={parentPath}
                  isProject={childIsProject}
                  onSelectProject={onSelectProject}
                  navigation={navigation}
                  projectMetadataMap={projectMetadataMap}
                  fallbackPhaseKey={fallbackPhaseKey}
                  onOpenSpContextMenu={onOpenSpContextMenu}
                />
              );
            })}
          </div>
        )}

        {!folderIsProject && showChevron && isExpanded && visibleChildren.length === 0 && (folder?.loading || folder?.error) && (
          <div style={{ marginLeft: 20, marginTop: 2 }}>
            <span
              style={{
                fontSize: 12,
                color: '#888',
                fontStyle: 'italic',
              }}
            >
              {folder?.loading ? 'Laddar…' : folder?.error ? String(folder.error) : ''}
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <View style={{ marginLeft, marginTop: 4 }}>
      <TouchableOpacity
        style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          paddingVertical: 2, 
          paddingHorizontal: 4,
          backgroundColor: folderIsProject ? 'transparent' : 'transparent',
        }}
        onPress={handlePress}
        onLongPress={(e) => {
          try {
            if (typeof onOpenSpContextMenu === 'function') onOpenSpContextMenu(e, folder);
          } catch (_e) {}
        }}
        onContextMenu={Platform.OS === 'web' ? (e) => {
          try {
            if (typeof onOpenSpContextMenu === 'function') onOpenSpContextMenu(e, folder);
          } catch (_e) {}
        } : undefined}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          {showChevron ? (
            <View style={{ marginRight: 4 }}>
              <AnimatedChevron
                expanded={isExpanded}
                spinTrigger={folderSpin}
                size={Math.max(12, 16 - level)}
                color={LEFT_NAV.iconDefault}
              />
            </View>
          ) : (
            <View style={{ width: Math.max(12, 16 - level), marginRight: 4 }} />
          )}

          {!folderIsProject && (
            <MicroShake trigger={lockTrigger}>
              <MicroPulse trigger={folderSpin}>
                <Ionicons
                  name={'folder-outline'}
                  size={Math.max(12, 16 - level)}
                  color={LEFT_NAV.iconDefault}
                  style={{ marginRight: 6 }}
                />
              </MicroPulse>
            </MicroShake>
          )}

          {folderIsProject && (
            <View
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: indicatorColor,
                marginRight: 6,
                borderWidth: 1,
                borderColor: '#bbb',
              }}
            />
          )}

          <Text
            style={{
              fontSize: 14,
              color: LEFT_NAV.textDefault,
              fontWeight: '500',
            }}
          >
            {safeName}
          </Text>
        </View>
      </TouchableOpacity>
      {!folderIsProject && showChevron && isExpanded && visibleChildren.length > 0 && (
        <View style={{ marginLeft: 8, marginTop: 2 }}>
          {visibleChildren.map(child => {
            const childIsProject = isProjectFolder(child);
            return (
              <RecursiveFolderView
                key={child.id || `${safeName}-${level}`}
                folder={child}
                level={level + 1}
                expandedSubs={expandedSubs}
                spinSubs={spinSubs}
                lockedSubs={lockedSubs}
                lockTickSubs={lockTickSubs}
                onToggle={onToggle}
                companyId={companyId}
                hierarchy={hierarchy}
                setHierarchy={setHierarchy}
                parentPath={parentPath}
                isProject={childIsProject}
                onSelectProject={onSelectProject}
                navigation={navigation}
                projectMetadataMap={projectMetadataMap}
                fallbackPhaseKey={fallbackPhaseKey}
                onOpenSpContextMenu={onOpenSpContextMenu}
              />
            );
          })}
        </View>
      )}

      {!folderIsProject && showChevron && isExpanded && visibleChildren.length === 0 && (folder?.loading || folder?.error) && (
        <Text
          style={{
            fontSize: 12,
            color: '#888',
            fontStyle: 'italic',
            marginLeft: 16,
            paddingLeft: 4,
          }}
        >
          {folder?.loading ? 'Laddar…' : folder?.error ? String(folder.error) : ''}
        </Text>
      )}
    </View>
  );
}

export function SharePointLeftPanel({
  leftWidth,
  webPaneHeight,
  panResponder,
  spinSidebarHome,
  spinSidebarRefresh,
  onPressHome,
  onPressRefresh,
  leftTreeScrollRef,
  selectedProject,
  projectPhaseKey,
  phaseNavigation,
  phaseNavigationLoading,
  selectedProjectFolders,
  navigation,
  companyId,
    reloadKey,
  handleSelectFunction,
  projectStatusFilter,
  loadingHierarchy,
  phaseChangeSpinAnim,
  hierarchy,
  expandedSubs,
  spinSub,
  handleToggleSubFolder,
  setHierarchy,
  contextMenu,
  contextMenuItems,
  handleContextMenuSelect,
  closeContextMenu,
  syncStatus,
  appVersion,
  buildStamp,
  scrollToEndSafe,
  createPortal,
  onSelectProject, // Optional callback for project selection (from HomeScreen)
  onOpenPhaseItem, // Optional callback to open a phase navigation item
  phaseActiveSection = null,
  phaseActiveItem = null,
  phaseActiveNode = null,

  // AF-only folder mirror state (shared with middle panel)
  afRelativePath = '',
  onAfRelativePathChange = null,
  afSelectedItemId = null,
  onAfSelectedItemIdChange = null,
  afMirrorRefreshNonce = 0,
}) {
  const isWeb = Platform.OS === 'web';
  const [filteredHierarchy, setFilteredHierarchy] = useState([]);
  const [, setNavConfig] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [expandedSites, setExpandedSites] = useState({}); // siteId -> boolean
  const [spinSites, setSpinSites] = useState({}); // siteId -> spin counter for chevron animation
  const [expandedSiteSections, setExpandedSiteSections] = useState({}); // `${siteId}|projects|folders` -> boolean (false = collapsed)
    const [siteSectionToggleTick, setSiteSectionToggleTick] = useState({}); // `${siteId}|projects|folders` -> number
  const [projectMetadataMap, setProjectMetadataMap] = useState(null);
  const [firestoreProjects, setFirestoreProjects] = useState([]);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [hoveredSiteId, setHoveredSiteId] = useState(null);
  const [hoveredProjectKey, setHoveredProjectKey] = useState(null);
  const [hoveredSectionKey, setHoveredSectionKey] = useState(null);
  const [spExpandedFolders, setSpExpandedFolders] = useState({});
  const [spSpinFolders, setSpSpinFolders] = useState({});
  const [spLockedFolders, setSpLockedFolders] = useState({}); // folderId -> true (leaf)
  const [spLockedTick, setSpLockedTick] = useState({}); // folderId -> number (shake trigger)
  const [canArchiveProjects, setCanArchiveProjects] = useState(false);
  const [archivingProjectId, setArchivingProjectId] = useState(null);
  const [authUid, setAuthUid] = useState(null);
  const [projectContextMenu, setProjectContextMenu] = useState({ visible: false, x: 0, y: 0, target: null });
  const [projectContextMenuItems, setProjectContextMenuItems] = useState([]);
  const [projectFolderTree, setProjectFolderTree] = useState([]);
  const [lastProjectId, setLastProjectId] = useState(null);
  const contentCacheRef = useRef(new Map()); // path -> boolean
  const contentPendingRef = useRef(new Set()); // path
  const projectBackfillRef = useRef(new Set()); // key: companyId|siteId|projectNumber
  const projectSelfHealCacheRef = useRef(new Map()); // key: siteId|path -> { checkedAtMs, exists }
  const kalkylStructureSelfHealCacheRef = useRef(new Map()); // key: siteId|rootPath -> { checkedAtMs }
  const projectStructureSelfHealCacheRef = useRef(new Map()); // key: siteId|rootPath -> { checkedAtMs }
  const [sharepointSyncState, setSharepointSyncState] = useState('idle');
  const [sharepointSyncError, setSharepointSyncError] = useState(null);
  const syncInFlightRef = useRef(null);
  const ensureInFlightRef = useRef(new Map());
  const ensurePassInFlightRef = useRef(null);
  const syncNavDoneRef = useRef(false);
  const syncEnsureDoneRef = useRef(false);
  const lastCompanyIdRef = useRef(null);

  const VERIFICATION_TTL_MS = 6 * 60 * 60 * 1000;
  const STORAGE_KEYS = {
    verified: 'sharepointStructureVerified',
    verifiedAt: 'verifiedAt',
  };

  const setSyncState = (nextState, errorMessage = null) => {
    setSharepointSyncState(nextState);
    setSharepointSyncError(errorMessage);
    try {
      if (nextState === 'error') {
        console.error('[SharePointSync] error', errorMessage || 'Unknown error');
      } else {
        console.log(`[SharePointSync] ${nextState}`);
      }
    } catch (_e) {}
  };

  const readSyncVerification = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) {
      return { valid: false, verifiedAt: null };
    }
    const raw = window.localStorage.getItem(STORAGE_KEYS.verified);
    const tsRaw = window.localStorage.getItem(STORAGE_KEYS.verifiedAt);
    const verifiedAt = tsRaw ? Number(tsRaw) : null;
    if (raw !== 'true' || !verifiedAt || Number.isNaN(verifiedAt)) {
      return { valid: false, verifiedAt: null };
    }
    const age = Date.now() - verifiedAt;
    return { valid: age >= 0 && age <= VERIFICATION_TTL_MS, verifiedAt };
  };

  const writeSyncVerification = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.setItem(STORAGE_KEYS.verified, 'true');
      window.localStorage.setItem(STORAGE_KEYS.verifiedAt, String(Date.now()));
    } catch (_e) {}
  };

  const clearSyncVerification = () => {
    if (Platform.OS !== 'web' || typeof window === 'undefined' || !window.localStorage) return;
    try {
      window.localStorage.removeItem(STORAGE_KEYS.verified);
      window.localStorage.removeItem(STORAGE_KEYS.verifiedAt);
    } catch (_e) {}
  };

  const maybeMarkSyncReady = () => {
    if (syncNavDoneRef.current && syncEnsureDoneRef.current) {
      setSyncState('ready');
    }
  };

  const runEnsureSingleFlight = (key, task) => {
    if (!key) return task();
    const existing = ensureInFlightRef.current.get(key);
    if (existing) return existing;
    const promise = (async () => {
      try {
        return await task();
      } finally {
        ensureInFlightRef.current.delete(key);
      }
    })();
    ensureInFlightRef.current.set(key, promise);
    return promise;
  };

  const getTwoDigitPrefix = (name) => {
    const s = String(name || '').trim();
    const m = s.match(/^([0-9]{2})\s*[-–—]/);
    return m ? m[1] : null;
  };

  const activeOverviewPrefix = (() => {
    if (String(phaseActiveSection || '') !== 'oversikt') return null;
    if (!phaseActiveItem) return null;
    const section = phaseNavigation?.sections?.find((s) => s?.id === 'oversikt');
    const items = Array.isArray(section?.items) ? section.items : [];
    const item = items.find((i) => String(i?.id || '') === String(phaseActiveItem || ''));
    return getTwoDigitPrefix(item?.name);
  })();

  const activePhaseSectionPrefix = (() => {
    if (!phaseActiveSection) return null;
    const section = phaseNavigation?.sections?.find((s) => String(s?.id || '') === String(phaseActiveSection || ''));
    return getTwoDigitPrefix(section?.name);
  })();

  const isFfuActive = String(phaseActiveSection || '') === 'forfragningsunderlag';
  const afMirrorRootPath = useMemo(() => {
    if (!selectedProject) return '';
    const basePath = String(
      selectedProject?.rootFolderPath ||
      selectedProject?.rootPath ||
      selectedProject?.sharePointPath ||
      selectedProject?.sharepointPath ||
      selectedProject?.sharePointBasePath ||
      selectedProject?.sharepointBasePath ||
      selectedProject?.basePath ||
      ''
    )
      .trim()
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/, '/');

    const FORFRAGNINGSUNDERLAG_FOLDER = '02 - Förfrågningsunderlag';
    if (!basePath) return '';
    return `${basePath}/${FORFRAGNINGSUNDERLAG_FOLDER}`.replace(/^\/+/, '').replace(/\/+/, '/');
  }, [selectedProject]);

  const closeProjectContextMenu = () => setProjectContextMenu({ visible: false, x: 0, y: 0, target: null });

  const isSiteSectionExpanded = (siteId, sectionKey) => {
    const sid = String(siteId || '').trim();
    if (!sid) return true;
    const k = `${sid}|${sectionKey}`;
    return expandedSiteSections[k] !== false;
  };

  const toggleSiteSectionExpanded = (siteId, sectionKey) => {
    const sid = String(siteId || '').trim();
    if (!sid) return;
    const k = `${sid}|${sectionKey}`;
    setExpandedSiteSections(prev => ({
      ...prev,
      [k]: prev[k] === false,
    }));

    // Micro-feedback trigger (once per click)
    setSiteSectionToggleTick((prev) => ({ ...(prev || {}), [k]: (prev?.[k] || 0) + 1 }));
  };

  const openProjectContextMenu = (event, target) => {
    if (!canArchiveProjects) return;
    try {
      if (event?.preventDefault) event.preventDefault();
    } catch (_e) {}

    try {
      closeSpContextMenu();
    } catch (_e) {}

    const ne = event?.nativeEvent || event || {};
    const x = Number(ne.clientX ?? ne.pageX ?? 0) || 0;
    const y = Number(ne.clientY ?? ne.pageY ?? 0) || 0;

    setProjectContextMenuItems([
      { key: 'archive-project', label: 'Arkivera projekt', iconName: 'archive-outline', danger: true },
    ]);
    setProjectContextMenu({ visible: true, x, y, target: target || null });
  };

  // SharePoint folder management (DK Site / role === "projects" only)
  const [spContextMenu, setSpContextMenu] = useState({ visible: false, x: 0, y: 0, target: null });
  const [spContextMenuItems, setSpContextMenuItems] = useState([]);
  const [spActionModal, setSpActionModal] = useState({ visible: false, kind: null, title: '', siteId: null, itemId: null, itemPath: '', basePath: '' });
  const [spActionValue, setSpActionValue] = useState('');
  const [spActionBusy, setSpActionBusy] = useState(false);

  const getSpLockedContext = (siteId, itemPath) => {
    const sid = String(siteId || '').trim();
    const path = normalizeSharePointPath(itemPath);
    if (!sid || !path) return null;

    const projects = Array.isArray(firestoreProjects) ? firestoreProjects : [];
    for (const p of projects) {
      const psid = String(p?.sharePointSiteId || '').trim();
      if (!psid || psid !== sid) continue;

      const root = normalizeSharePointPath(p?.rootFolderPath || p?.path || '');
      if (!root) continue;
      if (!(path === root || path.startsWith(`${root}/`))) continue;

      const lifecycle = String(p?.status || '').trim().toLowerCase();
      if (lifecycle === 'archived') return null;

      const phase = String(p?.phase || '').trim().toLowerCase();
      if (phase !== 'kalkylskede' && phase !== 'kalkyl') return null;

      const locked = isLockedKalkylskedeSharePointFolderPath({
        projectRootPath: root,
        itemPath: path,
        structureVersion: p?.kalkylskedeStructureVersion || null,
      });
      if (!locked) return null;
      return { projectRootPath: root, itemPath: path };
    }

    return null;
  };

  const closeSpContextMenu = () => setSpContextMenu({ visible: false, x: 0, y: 0, target: null });

  const openSpContextMenu = (event, target) => {
    try {
      if (event?.preventDefault) event.preventDefault();
    } catch (_e) {}

    try {
      if (typeof closeContextMenu === 'function') closeContextMenu();
    } catch (_e) {}

    const ne = event?.nativeEvent || event || {};
    const x = Number(ne.clientX ?? ne.pageX ?? 0) || 0;
    const y = Number(ne.clientY ?? ne.pageY ?? 0) || 0;

    const t = target || null;
    const type = String(t?.type || '').trim();
    const isFolder = type === 'folder';
    const isSite = type === 'site';
    const siteId = String(t?.siteId || t?.id || '').trim();
    const folderPath = isFolder ? normalizeSharePointPath(t?.path || '') : '';
    const lockCtx = isFolder ? getSpLockedContext(siteId, folderPath) : null;

    // Only allow folder management for project sites (this panel only renders those).
    const items = [];
    if (isSite) {
      items.push({ key: 'sp-create-root', label: 'Skapa mapp', iconName: 'add-circle-outline' });
    }
    if (isFolder) {
      items.push({ key: 'sp-create-child', label: 'Skapa undermapp', iconName: 'add-circle-outline' });
      // Locked system folders: allow only creating extra subfolders (no rename/move/delete).
      if (!lockCtx) {
        items.push({ key: 'sp-rename', label: 'Byt namn', iconName: 'pencil-outline' });
        items.push({ key: 'sp-move', label: 'Flytta…', iconName: 'arrow-forward-outline' });
        items.push({ key: 'sp-archive', label: 'Arkivera', iconName: 'archive-outline', danger: true });
      }
    }

    setSpContextMenuItems(items);
    setSpContextMenu({ visible: true, x, y, target: t });
  };

  const closeSpActionModal = () => {
    if (spActionBusy) return;
    setSpActionModal({ visible: false, kind: null, title: '', siteId: null, itemId: null, itemPath: '', basePath: '' });
    setSpActionValue('');
  };

  const insertFolderIntoFilteredHierarchy = (siteId, basePath, folderNode) => {
    const sid = String(siteId || '').trim();
    if (!sid || !folderNode) return;

    const base = String(basePath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const folderPath = String(folderNode?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const folderName = String(folderNode?.name || '').trim();
    if (!folderPath || !folderName) return;

    const addChildSortedUnique = (children) => {
      const list = Array.isArray(children) ? [...children] : [];
      const exists = list.some((c) => String(c?.path || '').trim() === folderPath || String(c?.name || '').trim() === folderName);
      if (!exists) list.push(folderNode);
      list.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
      return list;
    };

    const insertIntoFolderByPath = (nodes) => {
      if (!Array.isArray(nodes)) return nodes;
      return nodes.map((n) => {
        if (!n) return n;
        if (String(n?.type || '').trim() === 'folder' && String(n?.siteId || '').trim() === sid) {
          const nPath = String(n?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
          if (nPath === base) {
            return { ...n, children: addChildSortedUnique(n.children) };
          }
        }
        if (Array.isArray(n.children) && n.children.length > 0) {
          return { ...n, children: insertIntoFolderByPath(n.children) };
        }
        return n;
      });
    };

    setFilteredHierarchy((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((siteNode) => {
        if (!siteNode) return siteNode;
        if (String(siteNode?.type || '').trim() !== 'site') return siteNode;
        if (String(siteNode?.siteId || '').trim() !== sid) return siteNode;

        if (!base) {
          return { ...siteNode, children: addChildSortedUnique(siteNode.children) };
        }

        return { ...siteNode, children: insertIntoFolderByPath(siteNode.children) };
      });
    });
  };

  const setFolderStateInFilteredHierarchy = (siteId, folderPath, patch) => {
    const sid = String(siteId || '').trim();
    const targetPath = String(folderPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    if (!sid || !targetPath) return;

    const apply = (nodes) =>
      (nodes || []).map((n) => {
        if (!n) return n;
        if (String(n?.type || '').trim() === 'folder' && String(n?.siteId || '').trim() === sid) {
          const p = String(n?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
          if (p === targetPath) {
            return { ...n, ...(patch || {}) };
          }
        }
        if (Array.isArray(n.children) && n.children.length > 0) {
          return { ...n, children: apply(n.children) };
        }
        return n;
      });

    setFilteredHierarchy((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((siteNode) => {
        if (!siteNode) return siteNode;
        if (String(siteNode?.type || '').trim() !== 'site') return siteNode;
        if (String(siteNode?.siteId || '').trim() !== sid) return siteNode;
        return { ...siteNode, children: apply(siteNode.children) };
      });
    });
  };

  const upsertFolderChildrenInFilteredHierarchy = (siteId, folderPath, nextChildren) => {
    const sid = String(siteId || '').trim();
    const targetPath = String(folderPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    if (!sid || !targetPath) return;

    const normalizePath = (p) => String(p || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const dedupeMerge = (existing, incoming) => {
      const byPath = new Map();
      (Array.isArray(existing) ? existing : []).forEach((c) => {
        const key = normalizePath(c?.path || c?.name || '');
        if (key) byPath.set(key, c);
      });
      (Array.isArray(incoming) ? incoming : []).forEach((c) => {
        const key = normalizePath(c?.path || c?.name || '');
        if (!key) return;
        const prev = byPath.get(key);
        byPath.set(key, prev ? { ...prev, ...c } : c);
      });
      const out = [...byPath.values()];
      out.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { numeric: true, sensitivity: 'base' }));
      return out;
    };

    const apply = (nodes) =>
      (nodes || []).map((n) => {
        if (!n) return n;
        if (String(n?.type || '').trim() === 'folder' && String(n?.siteId || '').trim() === sid) {
          const p = normalizePath(n?.path || '');
          if (p === targetPath) {
            return {
              ...n,
              loading: false,
              error: null,
              childrenLoaded: true,
              children: dedupeMerge(n.children, nextChildren),
            };
          }
        }
        if (Array.isArray(n.children) && n.children.length > 0) {
          return { ...n, children: apply(n.children) };
        }
        return n;
      });

    setFilteredHierarchy((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((siteNode) => {
        if (!siteNode) return siteNode;
        if (String(siteNode?.type || '').trim() !== 'site') return siteNode;
        if (String(siteNode?.siteId || '').trim() !== sid) return siteNode;
        return { ...siteNode, children: apply(siteNode.children) };
      });
    });
  };

  const toggleSpFolder = async (folder) => {
    const fid = String(folder?.id || '').trim();
    const sid = String(folder?.siteId || '').trim();
    const fpath = String(folder?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    if (!fid) return;

    const bumpLocked = () => {
      setSpLockedFolders((prev) => ({ ...(prev || {}), [fid]: true }));
      setSpLockedTick((prev) => ({ ...(prev || {}), [fid]: (prev?.[fid] || 0) + 1 }));
    };

    const currentlyExpanded = spExpandedFolders?.[fid] === true;
    setSpSpinFolders((prev) => ({ ...prev, [fid]: (prev?.[fid] || 0) + 1 }));

    // If we already know it's a leaf, don't expand - just shake/lock.
    if (spLockedFolders?.[fid] === true || (folder?.childrenLoaded === true && Array.isArray(folder?.children) && folder.children.length === 0)) {
      setSpExpandedFolders((prev) => ({ ...prev, [fid]: false }));
      bumpLocked();
      return;
    }

    if (currentlyExpanded) {
      setSpExpandedFolders((prev) => ({ ...prev, [fid]: false }));
      return;
    }

    // Attempt to expand
    if (!sid || !fpath) return;
    setSpExpandedFolders((prev) => ({ ...prev, [fid]: true }));

    // If children are already loaded, we can decide immediately.
    if (folder?.childrenLoaded === true) {
      const folderChildren = Array.isArray(folder?.children) ? folder.children : [];
      const childFolders = folderChildren.filter((c) => c && (c.type === 'folder' || !c.type));
      if (childFolders.length === 0) {
        setSpExpandedFolders((prev) => ({ ...prev, [fid]: false }));
        bumpLocked();
      }
      return;
    }

    setFolderStateInFilteredHierarchy(sid, fpath, { loading: true, error: null });
    try {
      const items = await getDriveItems(sid, fpath);
      const folders = (items || []).filter((it) => it && (it.folder || it.remoteItem?.folder || it.package));
      const childrenNodes = folders
        .map((it) => {
          const name = String(it?.name || '').trim();
          if (!name) return null;
          const childPath = `${fpath}/${name}`.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/g, '/');
          return {
            id: it.id || `${sid}-${childPath}`,
            driveItemId: it.id || null,
            name,
            type: 'folder',
            path: childPath,
            siteId: sid,
            webUrl: it.webUrl || null,
            children: [],
            childrenLoaded: false,
            lastModified: it.lastModifiedDateTime || null,
          };
        })
        .filter(Boolean);

      upsertFolderChildrenInFilteredHierarchy(sid, fpath, childrenNodes);

      // Leaf folder: don't show chevron/empty area; shake to indicate "locked".
      if (childrenNodes.length === 0) {
        setSpExpandedFolders((prev) => ({ ...prev, [fid]: false }));
        bumpLocked();
      }
    } catch (e) {
      const msg = e?.message || 'Kunde inte ladda undermappar';
      setFolderStateInFilteredHierarchy(sid, fpath, { loading: false, error: msg, childrenLoaded: false });
    }
  };

  const removeFolderFromFilteredHierarchy = (siteId, folderPath) => {
    const sid = String(siteId || '').trim();
    const targetPath = String(folderPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    if (!sid || !targetPath) return;

    const removeRecursive = (nodes) => {
      if (!Array.isArray(nodes)) return nodes;
      const kept = nodes
        .filter((n) => {
          if (!n) return false;
          if (String(n?.type || '').trim() !== 'folder') return true;
          if (String(n?.siteId || '').trim() !== sid) return true;
          const p = String(n?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
          return p !== targetPath;
        })
        .map((n) => {
          if (!n) return n;
          if (Array.isArray(n.children) && n.children.length > 0) {
            return { ...n, children: removeRecursive(n.children) };
          }
          return n;
        });
      return kept;
    };

    setFilteredHierarchy((prev) => {
      if (!Array.isArray(prev)) return prev;
      return prev.map((siteNode) => {
        if (!siteNode) return siteNode;
        if (String(siteNode?.type || '').trim() !== 'site') return siteNode;
        if (String(siteNode?.siteId || '').trim() !== sid) return siteNode;
        return { ...siteNode, children: removeRecursive(siteNode.children) };
      });
    });
  };

  const runSpAction = async () => {
    const kind = spActionModal?.kind;
    const siteId = String(spActionModal?.siteId || '').trim();
    const itemId = String(spActionModal?.itemId || '').trim();
    const itemPath = String(spActionModal?.itemPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const basePath = String(spActionModal?.basePath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const value = String(spActionValue || '').trim();

    if (!siteId) return;
    if (!kind) return;

    setSpActionBusy(true);
    try {
      const lockCtx = (kind === 'rename' || kind === 'move' || kind === 'delete')
        ? getSpLockedContext(siteId, itemPath)
        : null;
      if (lockCtx && (kind === 'rename' || kind === 'move' || kind === 'delete')) {
        throw new Error('Denna systemmapp är låst och kan inte bytas namn på, flyttas eller raderas.');
      }

      if (kind === 'create') {
        if (!value) throw new Error('Mappnamn saknas');
        const nextPath = basePath ? `${basePath}/${value}` : value;
        await ensureFolderPath(nextPath, companyId, siteId, { siteRole: 'projects' });

        // Make it show up immediately in Digitalkontroll without waiting for a full refresh.
        const optimisticNode = {
          id: `${siteId}-${String(nextPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim()}-${Date.now()}`,
          driveItemId: null,
          name: value,
          type: 'folder',
          path: String(nextPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim(),
          siteId,
          webUrl: null,
          children: [],
          lastModified: null,
        };
        insertFolderIntoFilteredHierarchy(siteId, basePath, optimisticNode);

        // Best-effort: enrich node with real driveItem id/webUrl if available.
        try {
          const item = await getDriveItemByPath(siteId, nextPath).catch(() => null);
          if (item?.id) {
            insertFolderIntoFilteredHierarchy(siteId, basePath, {
              ...optimisticNode,
              id: item.id,
              driveItemId: item.id,
              webUrl: item?.webUrl || null,
              lastModified: item?.lastModifiedDateTime || null,
            });
          }
        } catch (_e) {}
      } else if (kind === 'rename') {
        if (!value) throw new Error('Nytt namn saknas');
        if (itemId) {
          await renameDriveItemByIdGuarded({ siteId, itemId, newName: value, projectRootPath: null, itemPath });
        } else {
          // Fallback to resolving by path
          const item = await getDriveItemByPath(siteId, itemPath);
          await renameDriveItemByIdGuarded({ siteId, itemId: item?.id, newName: value, projectRootPath: null, itemPath });
        }
      } else if (kind === 'move') {
        // value = new parent path (relative). Empty string means root.
        const parentItem = await getDriveItemByPath(siteId, value);
        const parentId = parentItem?.id;
        if (!parentId) throw new Error('Kunde inte hitta målmapp');

        if (itemId) {
          await moveDriveItemByIdGuarded({ siteId, itemId, newParentItemId: parentId, projectRootPath: null, itemPath });
        } else {
          const item = await getDriveItemByPath(siteId, itemPath);
          await moveDriveItemByIdGuarded({ siteId, itemId: item?.id, newParentItemId: parentId, projectRootPath: null, itemPath });
        }
      }

      closeSpActionModal();
      try {
        if (typeof onPressRefresh === 'function') onPressRefresh();
      } catch (_e) {}
    } catch (e) {
      const msg = e?.message || String(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try { window.alert(msg); } catch (_e2) {}
      } else {
        try { Alert.alert('Fel', msg); } catch (_e2) {}
      }
    } finally {
      setSpActionBusy(false);
    }
  };

  const handleSpContextMenuSelect = async (item) => {
    const key = String(item?.key || '').trim();
    const target = spContextMenu?.target;
    const targetType = String(target?.type || '').trim();
    const siteId = String(target?.siteId || target?.id || '').trim();

    if (!key || !siteId) return;

    if (key === 'sp-create-root') {
      setSpActionValue('');
      setSpActionModal({ visible: true, kind: 'create', title: 'Skapa mapp (rot)', siteId, itemId: null, itemPath: '', basePath: '' });
      return;
    }

    if (targetType !== 'folder') return;

    const folderPath = String(target?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
    const driveItemId = String(target?.driveItemId || '').trim();
    const lockCtx = getSpLockedContext(siteId, folderPath);

    if (key === 'sp-create-child') {
      setSpActionValue('');
      setSpActionModal({ visible: true, kind: 'create', title: `Skapa undermapp i ${String(target?.name || '').trim() || 'mapp'}`, siteId, itemId: null, itemPath: folderPath, basePath: folderPath });
      return;
    }
    if (key === 'sp-rename') {
      if (lockCtx) {
        const msg = 'Denna systemmapp är låst och kan inte bytas namn på.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e) {}
        } else {
          try { Alert.alert('Låst mapp', msg); } catch (_e) {}
        }
        return;
      }
      setSpActionValue(String(target?.name || '').trim());
      setSpActionModal({ visible: true, kind: 'rename', title: 'Byt namn', siteId, itemId: driveItemId || null, itemPath: folderPath, basePath: '' });
      return;
    }
    if (key === 'sp-move') {
      if (lockCtx) {
        const msg = 'Denna systemmapp är låst och kan inte flyttas.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e) {}
        } else {
          try { Alert.alert('Låst mapp', msg); } catch (_e) {}
        }
        return;
      }
      setSpActionValue('');
      setSpActionModal({ visible: true, kind: 'move', title: 'Flytta till (ange målmappens sökväg)', siteId, itemId: driveItemId || null, itemPath: folderPath, basePath: '' });
      return;
    }
    if (key === 'sp-archive') {
      if (lockCtx) {
        const msg = 'Denna systemmapp är låst och kan inte arkiveras.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e) {}
        } else {
          try { Alert.alert('Låst mapp', msg); } catch (_e) {}
        }
        return;
      }

      const normalizedPath = normalizeSharePointPath(folderPath);
      const rootName = String(normalizedPath || '').split('/')[0] || '';
      const rootLower = rootName.toLowerCase();
      const blockedRoots = new Set(['projekt', 'mappar', 'arkiv', 'metadata', 'system']);
      const isBlockedRoot = !normalizedPath || (normalizedPath.indexOf('/') === -1 && blockedRoots.has(rootLower));
      if (isBlockedRoot) {
        const msg = 'Denna huvudmapp kan inte arkiveras.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e) {}
        } else {
          try { Alert.alert('Inte tillåtet', msg); } catch (_e) {}
        }
        return;
      }

      const name = String(target?.name || '').trim() || 'mappen';
      const confirmText = `Arkivera "${name}"?`;

      const confirm = (Platform.OS === 'web' && typeof window !== 'undefined')
        ? window.confirm(confirmText)
        : await new Promise((resolve) => {
            Alert.alert('Arkivera', confirmText, [
              { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
              { text: 'Arkivera', style: 'destructive', onPress: () => resolve(true) },
            ]);
          });
      if (!confirm) return;

      try {
        const systemSiteId = await getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: true });
        if (!systemSiteId) {
          throw new Error('Ingen DK Bas-site hittades för arkivering.');
        }

        await ensureDkBasStructure(systemSiteId);

      const isProject = isProjectFolder(target);
      if (isProject) {
        const msg = 'Projekt arkiveras via projektlistan.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e) {}
        } else {
          try { Alert.alert('Inte tillåtet', msg); } catch (_e) {}
        }
        return;
      }

      const pathParts = String(normalizedPath || '').split('/').filter(Boolean);
      const destName = pathParts[pathParts.length - 1] || name;
      const destParentPath = pathParts.length > 1
        ? `Arkiv/Mappar/${pathParts.slice(0, -1).join('/')}`
        : 'Arkiv/Mappar';

        console.log('[Archive] start', {
          siteId,
          path: normalizedPath,
          destSiteId: systemSiteId,
          destParentPath,
          destName,
          type: 'folder',
        });

        await moveDriveItemAcrossSitesByPath({
          sourceSiteId: siteId,
          sourcePath: normalizedPath,
          destSiteId: systemSiteId,
          destParentPath,
          destName,
        });

        console.log('[Archive] moved', {
          from: `${siteId}:${normalizedPath}`,
          to: `${systemSiteId}:${destParentPath}/${destName}`,
        });

        // Update UI immediately; refresh is still triggered to resync from SharePoint.
        try { removeFolderFromFilteredHierarchy(siteId, folderPath); } catch (_e) {}
        try {
          if (typeof onPressRefresh === 'function') onPressRefresh();
        } catch (_e) {}
      } catch (e) {
        console.error('[Archive] error', e?.message || e);
        const msg = e?.message || String(e);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e2) {}
        } else {
          try { Alert.alert('Fel', msg); } catch (_e2) {}
        }
      }
      return;
    }
  };

  const handleProjectContextMenuSelect = async (item) => {
    const key = String(item?.key || '').trim();
    const target = projectContextMenu?.target;
    const pid = String(target?.projectId || target?.projectNumber || '').trim();

    closeProjectContextMenu();

    if (!key || key !== 'archive-project') return;
    if (!canArchiveProjects) return;
    if (!companyId || !pid) return;

    const confirmText =
      'Projektet flyttas till arkiv och försvinner från aktiva projekt.\n' +
      'Detta kan återställas av superadmin.';

    const confirm = (Platform.OS === 'web' && typeof window !== 'undefined')
      ? window.confirm(confirmText)
      : await new Promise((resolve) => {
          Alert.alert('Arkivera projekt', confirmText, [
            { text: 'Avbryt', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Arkivera', style: 'destructive', onPress: () => resolve(true) },
          ]);
        });

    if (!confirm) return;

    setArchivingProjectId(pid);
    try {
      const res = await archiveCompanyProject(companyId, pid);
      if (res && res.ok) {
        try {
          if (typeof onPressRefresh === 'function') onPressRefresh();
        } catch (_e) {}
      } else {
        const msg = res?.error || 'Arkivering misslyckades';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(msg); } catch (_e2) {}
        } else {
          try { Alert.alert('Fel', msg); } catch (_e2) {}
        }
      }
    } catch (e) {
      const msg = e?.message || String(e);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try { window.alert(msg); } catch (_e2) {}
      } else {
        try { Alert.alert('Fel', msg); } catch (_e2) {}
      }
    } finally {
      setArchivingProjectId(null);
    }
  };

  useEffect(() => {
    const isLocalWeb =
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.location?.hostname === 'string' &&
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (isLocalWeb) {
      console.warn('[SharePointLeftPanel] debug banner (section repair enabled)');
    }
  }, []);

  // Track auth state so permission checks re-run when auth.currentUser becomes available.
  useEffect(() => {
    let unsub = null;
    try {
      if (auth && typeof auth.onAuthStateChanged === 'function') {
        unsub = auth.onAuthStateChanged((u) => {
          setAuthUid(u?.uid || null);
        });
      } else {
        setAuthUid(auth?.currentUser?.uid || null);
      }
    } catch (_e) {
      setAuthUid(auth?.currentUser?.uid || null);
    }
    return () => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (_e) {}
    };
  }, []);

  // Reset sync verification when company changes.
  useEffect(() => {
    const current = String(companyId || '').trim() || null;
    const last = lastCompanyIdRef.current || null;
    if (last && current && last !== current) {
      clearSyncVerification();
    }
    lastCompanyIdRef.current = current;
  }, [companyId]);

  // Permissions: Only superadmin or company admin may archive projects.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = auth?.currentUser || null;
        if (!user || !companyId) {
          if (!cancelled) setCanArchiveProjects(false);
          return;
        }

        let tokenRes = null;
        try { tokenRes = await user.getIdTokenResult(false).catch(() => null); } catch (_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};

        const emailLower = String(user?.email || '').toLowerCase();
        const isEmailSuper = emailLower === 'marcus@msbyggsystem.se' || emailLower === 'marcus.skogh@msbyggsystem.se';
        const isSuper = isEmailSuper || claims.superadmin === true || claims.globalAdmin === true || String(claims.role || '').toLowerCase() === 'superadmin';

        const sameCompany = String(claims.companyId || '').trim() === String(companyId || '').trim();
        const isCompanyAdmin = sameCompany && (claims.admin === true || String(claims.role || '').toLowerCase() === 'admin');

        if (!cancelled) setCanArchiveProjects(!!(isSuper || isCompanyAdmin));
      } catch (_e) {
        if (!cancelled) setCanArchiveProjects(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, authUid]);

  // Firestore is the source of truth for the project list.
  // Subscribe to projects (siteRole === "projects") so the left panel updates immediately.
  useEffect(() => {
    if (!companyId) {
      setFirestoreProjects([]);
      setProjectsLoading(false);
      return;
    }

    setProjectsLoading(true);
    const unsub = subscribeCompanyProjects(
      companyId,
      { siteRole: 'projects' },
      (projects) => {
        setFirestoreProjects(Array.isArray(projects) ? projects : []);
        setProjectsLoading(false);
      },
      (err) => {
        console.error('[SharePointLeftPanel] Error subscribing to Firestore projects:', err);
        setFirestoreProjects([]);
        setProjectsLoading(false);
      }
    );

    return () => {
      try {
        if (typeof unsub === 'function') unsub();
      } catch (_e) {}
    };
  }, [companyId]);

  // Best-effort backfill: if we can see project folders in SharePoint (DK Site),
  // ensure corresponding Firestore project docs exist.
  useEffect(() => {
    if (!companyId) return;
    if (!Array.isArray(filteredHierarchy) || filteredHierarchy.length === 0) return;

    const existingProjectIds = new Set(
      (firestoreProjects || [])
        .map((p) => String(p?.projectNumber || p?.projectId || p?.id || '').trim())
        .filter(Boolean)
    );

    const scanFoldersForProjects = (siteId, siteUrl, nodes) => {
      (nodes || []).forEach((n) => {
        if (!n) return;
        try {
          if (isProjectFolder(n)) {
            const meta = extractProjectMetadata(n);
            const num = String(meta?.number || meta?.id || '').trim();
            const name = String(meta?.name || '').trim();
            const fullName = String(meta?.fullName || n?.name || '').trim();
            const path = String(meta?.path || n?.path || n?.sharePointPath || n?.name || '').trim();
            if (!num || !path || !siteId) return;

            const key = `${companyId}|${siteId}|${num}`;
            if (existingProjectIds.has(num)) return;
            if (projectBackfillRef.current.has(key)) return;
            projectBackfillRef.current.add(key);

            // Firestore doc id is projectNumber.
            upsertCompanyProject(companyId, num, {
              projectNumber: num,
              projectName: name || null,
              fullName: fullName || null,
              sharePointSiteId: String(siteId),
              sharePointSiteUrl: siteUrl ? String(siteUrl) : null,
              rootFolderPath: path,
              siteRole: 'projects',
              status: 'active',
            }).catch((e) => {
              console.warn('[SharePointLeftPanel] Backfill project doc failed:', e?.message || e);
            });
          }
        } catch (_e) {}

        if (Array.isArray(n.children) && n.children.length > 0) {
          scanFoldersForProjects(siteId, siteUrl, n.children);
        }
      });
    };

    (filteredHierarchy || []).forEach((siteNode) => {
      if (!siteNode) return;
      const sid = String(siteNode?.siteId || siteNode?.id || '').trim();
      if (!sid) return;
      const siteUrl = siteNode?.webUrl || siteNode?.siteUrl || null;
      const children = Array.isArray(siteNode?.children) ? siteNode.children : [];
      scanFoldersForProjects(sid, siteUrl, children);
    });
  }, [companyId, filteredHierarchy, firestoreProjects]);

  // Self-heal: if a project exists in Firestore but its root folder is missing in SharePoint,
  // create it automatically in the DK Site (siteRole = "projects").
  useEffect(() => {
    if (!companyId) return;
    if (projectsLoading) return;

    const verification = readSyncVerification();
    if (verification.valid) {
      syncEnsureDoneRef.current = true;
      maybeMarkSyncReady();
      return;
    }

    if (!Array.isArray(firestoreProjects) || firestoreProjects.length === 0) {
      syncEnsureDoneRef.current = true;
      writeSyncVerification();
      console.log('[SharePointSync] ensured');
      maybeMarkSyncReady();
      return;
    }

    if (ensurePassInFlightRef.current) return;

    let cancelled = false;

    const isNotFoundError = (err) => {
      const msg = String(err?.message || err || '').toLowerCase();
      return msg.includes('404') || msg.includes('itemnotfound') || msg.includes('not found');
    };

    const run = (async () => {
      setSyncState('syncing');

      // Keep this small so we don't spam Graph. Remaining projects will be checked on next refresh.
      const batch = firestoreProjects.slice(0, 12);
      for (const p of batch) {
        if (cancelled) return;
        const role = String(p?.siteRole || '').trim().toLowerCase();
        if (role !== 'projects') continue;

        const lifecycle = String(p?.status || '').trim().toLowerCase();
        if (lifecycle === 'archived') {
          console.warn('[SharePointLeftPanel] Self-heal skipped (archived project)', {
            projectId: p?.id || p?.projectNumber || null,
          });
          continue;
        }

        const siteId = String(p?.sharePointSiteId || '').trim();
        const path = String(p?.rootFolderPath || p?.path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
        if (!siteId || !path) continue;

        const cacheKey = `${siteId}|${path}`;
        const cached = projectSelfHealCacheRef.current.get(cacheKey);
        const now = Date.now();
        if (cached && typeof cached.checkedAtMs === 'number' && now - cached.checkedAtMs < 5 * 60 * 1000) {
          continue;
        }

        try {
          await getDriveItemByPath(siteId, path);
          projectSelfHealCacheRef.current.set(cacheKey, { checkedAtMs: now, exists: true });
        } catch (e) {
          if (!isNotFoundError(e)) {
            projectSelfHealCacheRef.current.set(cacheKey, { checkedAtMs: now, exists: false });
            continue;
          }

          try {
            await runEnsureSingleFlight(
              `ensure:${siteId}|${path}`,
              () => ensureFolderPath(path, companyId, siteId, { siteRole: 'projects' })
            );
            projectSelfHealCacheRef.current.set(cacheKey, { checkedAtMs: Date.now(), exists: true });
          } catch (createErr) {
            // Guard rails in fileService will prevent creating system folders on DK Site.
            console.warn('[SharePointLeftPanel] Self-heal folder create failed:', createErr?.message || createErr);
            projectSelfHealCacheRef.current.set(cacheKey, { checkedAtMs: Date.now(), exists: false });
          }
        }

        // Ensure locked kalkylskede structure exists (best-effort, throttled).
        const phase = String(p?.phase || '').trim().toLowerCase();
        if (phase === 'kalkylskede' || phase === 'kalkyl') {
          const sKey = `${siteId}|${path}`;
          const cached2 = kalkylStructureSelfHealCacheRef.current.get(sKey);
          const now2 = Date.now();
          if (!cached2 || typeof cached2.checkedAtMs !== 'number' || now2 - cached2.checkedAtMs > 10 * 60 * 1000) {
            try {
              await runEnsureSingleFlight(
                `kalkyl:${siteId}|${path}`,
                () => ensureKalkylskedeProjectFolderStructure(path, companyId, siteId)
              );
            } catch (e2) {
              console.warn('[SharePointLeftPanel] Self-heal kalkyl structure failed:', e2?.message || e2);
            } finally {
              kalkylStructureSelfHealCacheRef.current.set(sKey, { checkedAtMs: Date.now() });
            }
          }
        }
      }

      if (!cancelled) {
        syncEnsureDoneRef.current = true;
        writeSyncVerification();
        console.log('[SharePointSync] ensured');
        maybeMarkSyncReady();
      }
    })()
      .catch((e) => {
        if (cancelled) return;
        setSyncState('error', e?.message || 'SharePoint sync failed');
      })
      .finally(() => {
        ensurePassInFlightRef.current = null;
      });

    ensurePassInFlightRef.current = run;

    return () => {
      cancelled = true;
    };
  }, [companyId, firestoreProjects, projectsLoading]);

  // When we're inside a project, always ensure the (current) project has the expected structure.
  // For now we reuse the kalkylskede locked structure for all phases, so the leftpanel experience is consistent
  // even if Produktion/Avslut/Eftermarknad aren't fully implemented yet.
  useEffect(() => {
    if (!companyId || !selectedProject) return;

    const siteId = String(
      selectedProject?.siteId || selectedProject?.siteID || selectedProject?.site?.id || ''
    ).trim();

    const rootPath = String(
      selectedProject?.path || selectedProject?.projectPath || selectedProject?.sharePointPath || ''
    )
      .replace(/:/g, '')
      .replace(/^\/+/, '')
      .replace(/\/+$/, '')
      .replace(/\/+/, '/')
      .trim();

    if (!siteId || !rootPath) return;

    const cacheKey = `${siteId}|${rootPath}`;
    const cached = projectStructureSelfHealCacheRef.current.get(cacheKey);
    const now = Date.now();
    if (cached && typeof cached.checkedAtMs === 'number' && now - cached.checkedAtMs < 10 * 60 * 1000) {
      return;
    }

    (async () => {
      try {
        await runEnsureSingleFlight(
          `kalkyl:${siteId}|${rootPath}`,
          () => ensureKalkylskedeProjectFolderStructure(rootPath, companyId, siteId)
        );
      } catch (e) {
        console.warn('[SharePointLeftPanel] Self-heal project structure failed:', e?.message || e);
      } finally {
        projectStructureSelfHealCacheRef.current.set(cacheKey, { checkedAtMs: Date.now() });
      }
    })();
  }, [
    companyId,
    selectedProject,
    selectedProject?.id,
    selectedProject?.path,
    selectedProject?.projectPath,
    selectedProject?.sharePointPath,
    selectedProject?.siteId,
    selectedProject?.siteID,
  ]);
  // Throttle section auto-repair so we don't spam create calls, but also don't get stuck
  // permanently empty due to transient Graph/load failures.
  // Map: sharePointPath -> lastAttemptMs
  const sectionRepairAttemptedRef = useRef(new Map());

  const openPhaseNavigationFromFolder = (folderNode, ctx) => {
    if (typeof onOpenPhaseItem !== 'function') return;

    const buildActiveNode = (sectionId, itemId, node) => {
      const spPath = String(node?.path || node?.sharePointPath || '').trim();

      // Stable keys used by view mappings.
      const key =
        String(sectionId || '') === 'forfragningsunderlag' && String(itemId || '') === 'administrativa-foreskrifter'
          ? 'AF'
          : null;

      return {
        id: itemId || sectionId || String(node?.id || '').trim() || null,
        key,
        type: itemId ? 'phase-item-folder' : 'phase-section-folder',
        sharePointPath: spPath || null,
      };
    };

    // 1) Clicking a top-level section folder inside the project should open the section summary.
    // Parent is the project root header (type: 'project').
    if (ctx?.parent?.type === 'project') {
      const prefix = getTwoDigitPrefix(folderNode?.name);
      const sections = Array.isArray(phaseNavigation?.sections) ? phaseNavigation.sections : [];
      const sectionByPrefix = prefix
        ? sections.find((s) => getTwoDigitPrefix(s?.name) === prefix)
        : null;

      const section = sectionByPrefix || null;
      if (section?.id) {
        // FFU: clicking the section itself should always show the root view in the middle panel
        // (never remember last visited subfolder).
        if (String(section.id) === 'forfragningsunderlag') {
          if (typeof onAfRelativePathChange === 'function') {
            onAfRelativePathChange('');
          }
          if (typeof onAfSelectedItemIdChange === 'function') {
            onAfSelectedItemIdChange(null);
          }
        }

        onOpenPhaseItem(section.id, null, {
          folderNode,
          activeNode: buildActiveNode(section.id, null, folderNode),
        });
      }
      return;
    }

    // 1b) Clicking a section *item* folder (e.g. "01 - Administrativa föreskrifter (AF)") should open the matching item.
    // Parent is a phase section folder under the project root.
    if (ctx?.parent && ctx?.grandparent?.type === 'project') {
      const sectionPrefix = getTwoDigitPrefix(ctx.parent?.name);
      const itemPrefix = getTwoDigitPrefix(folderNode?.name);

      if (sectionPrefix && itemPrefix) {
        const sections = Array.isArray(phaseNavigation?.sections) ? phaseNavigation.sections : [];
        const section = sections.find((s) => getTwoDigitPrefix(s?.name) === sectionPrefix) || null;
        const items = Array.isArray(section?.items) ? section.items : [];
        const item = items.find((i) => getTwoDigitPrefix(i?.name) === itemPrefix) || null;

        if (section?.id && item?.id) {
          onOpenPhaseItem(section.id, item.id, {
            folderNode,
            activeNode: buildActiveNode(section.id, item.id, folderNode),
          });
          return;
        }
      }
    }

    // 2) Clicking an overview "page" folder under "01 - Översikt" should open the matching overview item.
    const parentName = String(ctx?.parent?.name || '').trim().toLowerCase();
    const isOverviewParent = parentName.startsWith('01 - översikt') || parentName.startsWith('01 - oversikt');
    if (!isOverviewParent) return;

    const prefix = getTwoDigitPrefix(folderNode?.name);
    if (!prefix || !['01', '02', '03', '04'].includes(prefix)) return;

    const section = phaseNavigation?.sections?.find((s) => s?.id === 'oversikt');
    const items = Array.isArray(section?.items) ? section.items : [];
    const item = items.find((i) => String(i?.name || '').trim().startsWith(`${prefix} -`));
    if (!item?.id) return;

    onOpenPhaseItem('oversikt', item.id, {
      folderNode,
      activeNode: buildActiveNode('oversikt', item.id, folderNode),
    });
  };

  useEffect(() => {
    if (!companyId || !selectedProject) return;
    if (!Array.isArray(projectFolderTree) || projectFolderTree.length === 0) return;

    const targets = [];
    const collect = (nodes) => {
      (nodes || []).forEach((n) => {
        if (!n) return;
        const p = String(n.path || n.sharePointPath || '').trim();
        if (p) {
          const cached = contentCacheRef.current.get(p);
          if (typeof cached === 'boolean' && n.hasFilesDeep !== cached) {
            targets.push({ path: p, value: cached });
          } else if (typeof cached !== 'boolean' && n.hasFilesDeep === undefined && !contentPendingRef.current.has(p)) {
            targets.push({ path: p, value: null });
          }
        }
        if (Array.isArray(n.children) && n.children.length > 0) collect(n.children);
      });
    };
    collect(projectFolderTree);

    // Apply any cached values immediately.
    const cachedUpdates = targets.filter((t) => typeof t.value === 'boolean');
    if (cachedUpdates.length > 0) {
      setProjectFolderTree((prev) => {
        const apply = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            const p = String(n.path || n.sharePointPath || '').trim();
            const match = cachedUpdates.find((u) => u.path === p);
            const next = match ? { ...n, hasFilesDeep: match.value } : n;
            if (Array.isArray(next.children) && next.children.length > 0) {
              return { ...next, children: apply(next.children) };
            }
            return next;
          });
        return apply(prev);
      });
    }

    const toCheck = targets
      .filter((t) => t.value === null)
      .map((t) => t.path)
      .filter((p) => !contentPendingRef.current.has(p))
      .slice(0, 12);

    if (toCheck.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const path of toCheck) {
        if (cancelled) return;
        contentPendingRef.current.add(path);
        try {
          const hasFiles = await folderHasFilesDeep(companyId, path, 4);
          contentCacheRef.current.set(path, hasFiles);
          if (cancelled) return;
          setProjectFolderTree((prev) => {
            const apply = (nodes) =>
              (nodes || []).map((n) => {
                if (!n) return n;
                const p = String(n.path || n.sharePointPath || '').trim();
                const next = p === path ? { ...n, hasFilesDeep: hasFiles } : n;
                if (Array.isArray(next.children) && next.children.length > 0) {
                  return { ...next, children: apply(next.children) };
                }
                return next;
              });
            return apply(prev);
          });
        } catch (_e) {
          contentCacheRef.current.set(path, false);
        } finally {
          contentPendingRef.current.delete(path);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, selectedProject, projectFolderTree]);

  useEffect(() => {
    if (!selectedProject || !Array.isArray(selectedProjectFolders)) {
      setProjectFolderTree([]);
      setLastProjectId(null);
      return;
    }

    const currentProjectId = String(selectedProject?.id || '').trim() || null;

    const projectRootPathRaw = String(
      selectedProject?.path || selectedProject?.projectPath || selectedProject?.sharePointPath || ''
    ).trim();

    const normalizeAscii = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\u00c5\u00c4]/g, 'a')
        .replace(/[\u00e5\u00e4]/g, 'a')
        .replace(/[\u00d6]/g, 'o')
        .replace(/[\u00f6]/g, 'o')
        .replace(/\s+/g, ' ');

    const resolveProjectRootPathFromHierarchy = () => {
      try {
        const targetNumber = String(
          selectedProject?.projectNumber || selectedProject?.number || selectedProject?.id || ''
        ).trim();
        const targetName = String(selectedProject?.projectName || selectedProject?.name || selectedProject?.fullName || '').trim();
        const targetNumberNorm = normalizeAscii(targetNumber);
        const targetNameNorm = normalizeAscii(targetName);
        if (!targetNumberNorm && !targetNameNorm) return '';

        const stack = Array.isArray(hierarchy) ? [...hierarchy] : Array.isArray(hierarchy?.children) ? [...hierarchy.children] : [];

        while (stack.length > 0) {
          const node = stack.shift();
          if (!node) continue;

          if (isProjectFolder(node)) {
            const meta = extractProjectMetadata(node);
            const numberNorm = normalizeAscii(meta?.number || meta?.id || node?.projectNumber || node?.number || '');
            const nameNorm = normalizeAscii(meta?.name || meta?.fullName || node?.projectName || node?.name || '');

            const numberMatches = Boolean(targetNumberNorm && numberNorm && numberNorm === targetNumberNorm);
            const nameMatches = Boolean(targetNameNorm && nameNorm && nameNorm.includes(targetNameNorm));

            if (numberMatches || (targetNumberNorm && nameMatches)) {
              return String(meta?.path || node?.path || node?.sharePointPath || node?.name || '').trim();
            }
          }

          if (Array.isArray(node.children) && node.children.length > 0) {
            stack.push(...node.children);
          }
        }

        return '';
      } catch (_e) {
        return '';
      }
    };

    let projectRootPath = projectRootPathRaw || resolveProjectRootPathFromHierarchy();

    if (!projectRootPath) {
      const targetNumber = String(selectedProject?.projectNumber || selectedProject?.number || selectedProject?.id || '').trim();
      const targetNumberNorm = normalizeAscii(targetNumber);
      const fullName = String(selectedProject?.fullName || '').trim();
      if (fullName && targetNumberNorm && normalizeAscii(fullName).includes(targetNumberNorm)) {
        projectRootPath = fullName;
      }
    }

    const normalizeNode = (node) => {
      const safeName = String(node?.name || '').trim();
      const basePath = String(node?.path || node?.sharePointPath || '').trim();
      const derivedPath =
        !basePath && projectRootPath && safeName
          ? `${projectRootPath}/${safeName}`.replace(/^\/+/, '').replace(/\/+$/, '')
          : basePath.replace(/^\/+/, '').replace(/\/+$/, '');

      return {
        ...node,
        id: node?.id || derivedPath || safeName,
        name: node?.name || safeName,
        type: 'folder',
        path: derivedPath,
        sharePointPath: derivedPath,
        expanded: Boolean(node?.expanded),
        loading: Boolean(node?.loading),
        error: node?.error || null,
        children: Array.isArray(node?.children) ? node.children : [],
      };
    };

    const mergeTrees = (incomingNodes, existingNodes) => {
      const existingById = new Map((existingNodes || []).filter(Boolean).map((n) => [n.id, n]));

      return (incomingNodes || []).filter(Boolean).map((incoming) => {
        const existing = existingById.get(incoming.id);
        if (!existing) return incoming;

        const incomingChildren = Array.isArray(incoming.children) ? incoming.children : [];
        const existingChildren = Array.isArray(existing.children) ? existing.children : [];
        const childrenToUse = incomingChildren.length > 0 ? incomingChildren : existingChildren;

        return {
          ...incoming,
          expanded: typeof existing.expanded === 'boolean' ? existing.expanded : Boolean(incoming.expanded),
          loading: typeof existing.loading === 'boolean' ? existing.loading : Boolean(incoming.loading),
          error: existing.error || incoming.error || null,
          children: mergeTrees(childrenToUse, existingChildren),
        };
      });
    };

    const incoming = selectedProjectFolders.map(normalizeNode);

    // If we switched projects, reset to incoming (even if empty) to avoid leaking old state.
    if (currentProjectId && currentProjectId !== lastProjectId) {
      setLastProjectId(currentProjectId);
      setProjectFolderTree(incoming);
      return;
    }

    // If incoming is temporarily empty, keep existing local tree so expand/collapse works.
    if (incoming.length === 0) {
      return;
    }

    setProjectFolderTree((prev) => mergeTrees(incoming, prev));
  }, [
    selectedProject,
    selectedProject?.id,
    selectedProject?.path,
    selectedProject?.projectPath,
    selectedProject?.sharePointPath,
    selectedProjectFolders,
    lastProjectId,
    hierarchy,
  ]);

  const handleToggleProjectFolder = async (folderId) => {
    if (!folderId) return;

    let pathToLoad = null;
    let shouldDispatch = null;
    let toggledFolderName = null;

    setProjectFolderTree((prev) => {
      const walk = (nodes) =>
        (nodes || []).map((n) => {
          if (!n) return n;
          if (n.id === folderId) {
            const nextExpanded = !n.expanded;
            toggledFolderName = String(n.name || '').trim();
            const folderPathRaw = String(n.path || n.sharePointPath || '').trim();
            const normalizedPath = folderPathRaw
              .replace(/:/g, '')
              .replace(/^\/+/, '')
              .replace(/\/+/, '/')
              .trim()
              .replace(/\/+$/, '');

            const shouldLoad =
              nextExpanded && !n.loading && !n.error && (!Array.isArray(n.children) || n.children.length === 0);

            if (shouldLoad && normalizedPath) {
              pathToLoad = normalizedPath;
            }
            if (normalizedPath) {
              shouldDispatch = { folderPath: normalizedPath, folderName: n.name };
            }

            return {
              ...n,
              expanded: nextExpanded,
              ...(shouldLoad ? { loading: true, error: null } : {}),
            };
          }
          if (Array.isArray(n.children) && n.children.length > 0) {
            return { ...n, children: walk(n.children) };
          }
          return n;
        });

      return walk(prev);
    });

    if (shouldDispatch && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('dkFolderSelected', { detail: shouldDispatch }));
      } catch (_e) {}
    }

    if (!companyId || !pathToLoad) {
      const isLocalWeb =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.location?.hostname === 'string' &&
        /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

      if (isLocalWeb && String(toggledFolderName || '').toLowerCase().includes('översikt')) {
        console.warn('[SharePointLeftPanel] Overview click: missing companyId/pathToLoad', {
          companyId,
          folderId,
          toggledFolderName,
          pathToLoad,
        });
      }

      setProjectFolderTree((prev) => {
        const clearLoadingIfNeeded = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            if (n.id === folderId) {
              return { ...n, loading: false };
            }
            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: clearLoadingIfNeeded(n.children) };
            }
            return n;
          });
        return clearLoadingIfNeeded(prev);
      });
      return;
    }

    try {
      const normalizeAscii = (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .replace(/[\u00c5\u00c4]/g, 'a')
          .replace(/[\u00e5\u00e4]/g, 'a')
          .replace(/[\u00d6]/g, 'o')
          .replace(/[\u00f6]/g, 'o')
          .replace(/\s+/g, ' ');

      const stripNumericPrefix = (value) => String(value || '').replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

      const replaceLastPathSegment = (path, newLastSegment) => {
        const p = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
        const parts = p.split('/').filter(Boolean);
        if (parts.length === 0) return String(newLastSegment || '').trim();
        parts[parts.length - 1] = String(newLastSegment || '').trim();
        return parts.join('/');
      };

      const getMatchedSectionForToggle = () => {
        const lastSeg = String(pathToLoad || '').split('/').filter(Boolean).pop() || '';
        let toggledBase = normalizeAscii(stripNumericPrefix(toggledFolderName || lastSeg));
        // Backwards-compatible aliasing for renamed system folders.
        // Allows matching old SharePoint folder names before the auto-migration has run.
        if (toggledBase === 'ue och offerter') toggledBase = 'offerter';
        if (!toggledBase) return null;

        const fallbackByBase = {
          oversikt: {
            id: 'oversikt',
            name: '01 - Översikt',
          },
          forfragningsunderlag: {
            id: 'forfragningsunderlag',
            name: '02 - Förfrågningsunderlag',
          },
        };

        const sections = Array.isArray(phaseNavigation?.sections) ? phaseNavigation.sections : [];
        if (sections.length === 0) {
          return fallbackByBase[toggledBase] || null;
        }

        const matched = sections.find((s) => {
          const sectionBase = normalizeAscii(stripNumericPrefix(s?.name || s?.id || ''));
          return sectionBase && sectionBase === toggledBase;
        });

        return matched || fallbackByBase[toggledBase] || null;
      };

      const matchedSection = getMatchedSectionForToggle();
      const isSectionFolder = Boolean(matchedSection);
      const isOverviewFolder = matchedSection?.id === 'oversikt';

      const loadChildrenWithFallback = async () => {
        const first = await loadFolderChildren(companyId, pathToLoad);
        const firstChildren = Array.isArray(first) ? first : [];
        if (firstChildren.length > 0 || !isSectionFolder) return { pathUsed: pathToLoad, children: firstChildren };

        const lastSeg = String(pathToLoad || '').split('/').filter(Boolean).pop() || '';
        const baseName = stripNumericPrefix(lastSeg);
        const targetBase = normalizeAscii(stripNumericPrefix(toggledFolderName || lastSeg));

        // 0) Try to resolve the actual folder name by listing the parent path.
        // This catches subtle naming differences (dash variants, extra spaces, etc.).
        const parts = String(pathToLoad || '').split('/').filter(Boolean);
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        if (parentPath) {
          try {
            const siblings = await loadFolderChildren(companyId, parentPath);
            const siblingList = Array.isArray(siblings) ? siblings : [];
            const sectionSibling = siblingList.find((s) => {
              const name = String(s?.name || '').trim();
              return normalizeAscii(stripNumericPrefix(name)) === targetBase;
            });
            const resolvedName = String(sectionSibling?.name || '').trim();
            if (resolvedName && resolvedName !== lastSeg) {
              const siblingPath = replaceLastPathSegment(pathToLoad, resolvedName);
              const siblingChildren = await loadFolderChildren(companyId, siblingPath);
              const list = Array.isArray(siblingChildren) ? siblingChildren : [];
              if (list.length > 0) return { pathUsed: siblingPath, children: list };
              // Even if empty, prefer the resolved sibling path so auto-repair uses the correct name.
              return { pathUsed: siblingPath, children: firstChildren };
            }
          } catch (_e) {
            // ignore and continue
          }
        }

        const candidates = [];
        // 1) Try stripping numeric prefix if present.
        if (baseName && baseName !== lastSeg) {
          candidates.push(replaceLastPathSegment(pathToLoad, baseName));
        }
        // 2) Try adding numeric prefix if missing.
        if (baseName && baseName === lastSeg) {
          const sectionName = String(matchedSection?.name || '').trim();
          if (sectionName) {
            candidates.push(replaceLastPathSegment(pathToLoad, sectionName));
          }

          // common Swedish variants
          if (normalizeAscii(baseName) === 'oversikt') {
            candidates.push(replaceLastPathSegment(pathToLoad, `01 - ${baseName}`));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 - Översikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 - Oversikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 – Översikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 — Översikt'));
          }
        }

        const uniqueCandidates = [...new Set(candidates.filter(Boolean))].filter((p) => p !== pathToLoad);
        for (const candidatePath of uniqueCandidates) {
          try {
            const candidateChildren = await loadFolderChildren(companyId, candidatePath);
            const list = Array.isArray(candidateChildren) ? candidateChildren : [];
            if (list.length > 0) {
              return { pathUsed: candidatePath, children: list };
            }
          } catch (_e) {
            // ignore and continue
          }
        }

        return { pathUsed: pathToLoad, children: firstChildren };
      };

      let { pathUsed, children } = await loadChildrenWithFallback();

      const isLocalWeb =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.location?.hostname === 'string' &&
        /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

      if (isLocalWeb && (isOverviewFolder || matchedSection?.id === 'forfragningsunderlag')) {
        console.warn('[SharePointLeftPanel] Section expand', {
          toggledFolderName,
          pathToLoad,
          pathUsed,
          childrenCount: Array.isArray(children) ? children.length : 0,
          matchedSectionId: matchedSection?.id,
        });
      }

      let sectionRepairTriedThisTime = false;
      let sectionRepairFailedThisTime = false;

      // Auto-repair: if a phase section folder is empty, create expected subfolders (once) and reload.
      if (isSectionFolder) {
        const key = String(pathUsed || '').trim();
        const currentList = Array.isArray(children) ? children : [];

        const now = Date.now();
        const lastAttempt = key ? sectionRepairAttemptedRef.current.get(key) : null;
        const alreadyAttempted = typeof lastAttempt === 'number';

        // Allow re-attempt after a short cooldown to recover from intermittent empty reads.
        const cooldownMs = 30_000;

        // Retry on localhost so we can recover from earlier failed attempts in the same session.
        const shouldAttemptRepair = Boolean(
          key &&
            currentList.length === 0 &&
            (!alreadyAttempted || now - lastAttempt > cooldownMs || isLocalWeb)
        );

        if (shouldAttemptRepair) {
          const items = Array.isArray(matchedSection?.items) ? matchedSection.items : [];

          // If phaseNavigation isn't loaded yet (or items missing), we still want to be able to repair.
          // Use known defaults for the most important sections.
          const fallbackBySectionId = {
            oversikt: ['01 - Projektinformation', '02 - Organisation och roller', '03 - Tidsplan och viktiga datum', '04 - FrågaSvar'],
            forfragningsunderlag: [
              'AI-sammanställning',
            ],
          };

          const fallbackFolderNames = fallbackBySectionId[String(matchedSection?.id || '')] || [];

          const folderNames = (
            items.length > 0
              ? items.map((it) => String(it?.name || '').trim()).filter(Boolean)
              : fallbackFolderNames
          ).filter(Boolean);

          if (folderNames.length > 0) {
            sectionRepairAttemptedRef.current.set(key, now);
            sectionRepairTriedThisTime = true;

            if (isLocalWeb) {
              console.warn('[SharePointLeftPanel] Section auto-repair creating folders', {
                key,
                folderNames,
                matchedSectionId: matchedSection?.id,
              });
            }
            await Promise.all(
              folderNames.map((folderName) => {
                const fullPath = `${key}/${folderName}`;
                return runEnsureSingleFlight(
                  `ensure:${companyId || 'no-company'}|${fullPath}`,
                  () => ensureFolderPath(fullPath, companyId, null, { siteRole: 'projects' })
                );
              })
            );
            const repaired = await loadFolderChildren(companyId, key);
            children = Array.isArray(repaired) ? repaired : [];

            if (isLocalWeb) {
              console.warn('[SharePointLeftPanel] Section auto-repair reload result', {
                key,
                childrenCount: Array.isArray(children) ? children.length : 0,
                matchedSectionId: matchedSection?.id,
              });
            }

            if (Array.isArray(children) && children.length === 0) {
              sectionRepairFailedThisTime = true;
            }
          }
        }
      }

      setProjectFolderTree((prev) => {
        const normalizePathKey = (value) =>
          String(value || '')
            .replace(/:/g, '')
            .replace(/^\/+/, '')
            .replace(/\/+$/g, '')
            .replace(/\/+/g, '/')
            .trim();

        // NOTE: We prefer id match, but fall back to normalized path match.
        // This protects against transient data-shape differences where ids are prefixed/synthesized.
        const targetIds = new Set([folderId].filter(Boolean));
        const targetPaths = new Set(
          [pathUsed, pathToLoad]
            .map(normalizePathKey)
            .filter(Boolean)
        );

        let applied = false;

        const applyChildren = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;

            const nodePath = normalizePathKey(n.path || n.sharePointPath);
            const isTarget = targetIds.has(n.id) || (nodePath && targetPaths.has(nodePath));

            if (isTarget) {
              applied = true;
              const sectionLabel = String(matchedSection?.name || '').trim();
              return {
                ...n,
                loading: false,
                error:
                  isSectionFolder && sectionRepairTriedThisTime && sectionRepairFailedThisTime
                    ? `Kunde inte skapa undermappar i ${sectionLabel || 'sektionen'} (kontrollera behörighet i SharePoint)`
                    : null,
                ...(pathUsed && (n.path !== pathUsed || n.sharePointPath !== pathUsed)
                  ? { path: pathUsed, sharePointPath: pathUsed }
                  : null),
                children: Array.isArray(children) ? children : [],
              };
            }

            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: applyChildren(n.children) };
            }
            return n;
          });

        const next = applyChildren(prev);

        const isLocalWeb =
          Platform.OS === 'web' &&
          typeof window !== 'undefined' &&
          typeof window.location?.hostname === 'string' &&
          /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

        if (isLocalWeb && !applied) {
          console.warn('[SharePointLeftPanel] applyChildren: target not found', {
            folderId,
            pathToLoad,
            pathUsed,
            targetPaths: [...targetPaths],
          });
        }

        return next;
      });
    } catch (err) {
      const message = err?.message || 'Kunde inte ladda undermappar';
      setProjectFolderTree((prev) => {
        const applyError = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            if (n.id === folderId) {
              return { ...n, loading: false, error: message };
            }
            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: applyError(n.children) };
            }
            return n;
          });
        return applyError(prev);
      });
    }
  };

  const collapseProjectFolderSubtree = (folderId) => {
    if (!folderId) return;

    setProjectFolderTree((prev) => {
      const collapseAll = (n) => {
        if (!n) return n;
        const children = Array.isArray(n.children) ? n.children : [];
        return {
          ...n,
          expanded: false,
          children: children.map(collapseAll),
        };
      };

      const walk = (nodes) =>
        (nodes || []).map((n) => {
          if (!n) return n;
          if (n.id === folderId) {
            return collapseAll(n);
          }
          if (Array.isArray(n.children) && n.children.length > 0) {
            return { ...n, children: walk(n.children) };
          }
          return n;
        });

      return walk(prev);
    });
  };

  // Load navigation config and build hierarchy from enabled sites
  useEffect(() => {
    let mounted = true;
    const runSync = async () => {
      if (!companyId) {
        if (mounted) {
          setFilteredHierarchy([]);
          setNavLoading(false);
          setSyncState('idle');
        }
        syncNavDoneRef.current = false;
        syncEnsureDoneRef.current = false;
        return;
      }

      if (syncInFlightRef.current) {
        try {
          await syncInFlightRef.current;
        } catch (_e) {}
        return;
      }

      const verification = readSyncVerification();
      syncNavDoneRef.current = false;
      syncEnsureDoneRef.current = !!verification.valid;
      console.log('[SharePointSync] start');
      setSyncState('syncing');

      const promise = (async () => {
        try {
          setNavLoading(true);
          const config = await getSharePointNavigationConfig(companyId);
          if (!mounted) return;
          setNavConfig(config);

          // Ensure visibility metadata exists (server-side migration). Best-effort.
          try {
            await syncSharePointSiteVisibilityRemote({ companyId });
          } catch (_e) {
            // Non-fatal: UI can still fall back to legacy behavior.
          }

          // Enabled sites are controlled by Firestore metadata (sharepoint_sites).
          // Navigation config is only used for optional folder/path config.
          let visibleSiteIds = [];
          try {
            visibleSiteIds = await getCompanyVisibleSharePointSiteIds(companyId);
          } catch (_e) {
            visibleSiteIds = [];
          }

          const effectiveConfig = {
            // Only render project sites. System sites (e.g. DK Bas) must never appear.
            enabledSites: Array.isArray(visibleSiteIds) ? visibleSiteIds : [],
            siteConfigs: config?.siteConfigs || {},
          };

          // Build hierarchy from enabled sites
          const filtered = await filterHierarchyByConfig([], companyId, effectiveConfig);
          if (mounted) {
            setFilteredHierarchy(filtered);
          }

          syncNavDoneRef.current = true;
          maybeMarkSyncReady();
        } catch (error) {
          console.error('[SharePointLeftPanel] Error loading/filtering hierarchy:', error);
          if (mounted) setFilteredHierarchy([]);
          setSyncState('error', error?.message || 'SharePoint sync failed');
        } finally {
          if (mounted) setNavLoading(false);
        }
      })();

      syncInFlightRef.current = promise;
      try {
        await promise;
      } finally {
        syncInFlightRef.current = null;
      }
    };

    runSync();
    return () => { mounted = false; };
  }, [companyId, reloadKey]);

  // Load saved phase/structure metadata so we can color projects consistently.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setProjectMetadataMap(null);
        return;
      }

      try {
        const map = await fetchSharePointProjectMetadataMap(companyId);
        if (mounted) setProjectMetadataMap(map);
      } catch (error) {
        console.error('[SharePointLeftPanel] Error loading project metadata map:', error);
        if (mounted) setProjectMetadataMap(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [companyId, reloadKey]);

  return (
    <>
      <View
        style={{
          width: leftWidth,
          // Web: when a project is open, the left panel must be edge-to-edge.
          // Any outer padding makes every row highlight look inset/pill-like.
          padding: isWeb && selectedProject ? 0 : 8,
          borderRightWidth: 0,
          borderColor: '#e6e6e6',
          backgroundColor: '#f5f6f7',
          flexShrink: 0,
          alignSelf: 'stretch',
          minHeight: 0,
          position: 'relative',
        }}
      >
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
        <View
          {...(panResponder && panResponder.panHandlers)}
          style={
            isWeb
              ? {
                  position: 'absolute',
                  right: -8,
                  top: 0,
                  bottom: 0,
                  width: 16,
                  cursor: 'col-resize',
                  zIndex: 9,
                  pointerEvents: 'auto',
                }
              : {
                  position: 'absolute',
                  right: -12,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  zIndex: 9,
                }
          }
        />

        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderBottomWidth: 1,
            borderColor: '#e0e0e0',
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressHome}
              activeOpacity={0.7}
              accessibilityLabel="Hem"
            >
              <Ionicons
                name="home-outline"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarHome * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressRefresh}
              activeOpacity={0.7}
              accessibilityLabel="Uppdatera"
            >
              <Ionicons
                name="refresh"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarRefresh * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={leftTreeScrollRef}
          style={{ flex: 1 }}
          scrollEnabled
          nestedScrollEnabled
        >
          {(() => {
            if (selectedProject && projectPhaseKey) {
              if (phaseNavigationLoading) {
                return (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                  </View>
                );
              }

              const projectHierarchy = selectedProject
                ? [
                    {
                      ...selectedProject,
                      id: selectedProject.id,
                      name: (() => {
                        const rawName = String(
                          selectedProject.projectName || selectedProject.name || selectedProject.fullName || ''
                        ).trim();

                        let number = String(
                          selectedProject.projectNumber || selectedProject.number || ''
                        ).trim();

                        // Fallback: some callers might set `id` to a non-human identifier.
                        // If number is missing, try to parse it from the beginning of name/fullName.
                        if (!number) {
                          const firstToken = String(rawName.split(/\s+/)[0] || '').trim();
                          if (firstToken && firstToken.includes('-')) {
                            number = firstToken;
                          }
                        }

                        const cleanedName = (() => {
                          if (!rawName) return '';
                          if (selectedProject.projectName) return rawName;
                          if (number && rawName.startsWith(number)) {
                            let rest = rawName.slice(number.length).trim();
                            if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) {
                              rest = rest.slice(1).trim();
                            }
                            return rest || rawName;
                          }
                          return rawName;
                        })();

                        if (number && cleanedName) return `${number} — ${cleanedName}`;
                        return number || cleanedName || selectedProject.id;
                      })(),
                      type: 'project',
                      expanded: true,
                      children: projectFolderTree,
                    },
                  ]
                : [];

              return (
                <View style={{ flex: 1, minHeight: 0 }}>
                  <ProjectTree
                    hierarchy={projectHierarchy}
                    selectedProject={selectedProject}
                    selectedPhase={projectPhaseKey}
                    compact={isWeb}
                    hideFolderIcons
                    staticRootHeader
                    edgeToEdge={Boolean(isWeb && selectedProject)}
                    activePhaseSection={phaseActiveSection}
                    activeOverviewPrefix={activeOverviewPrefix}
                    activePhaseSectionPrefix={activePhaseSectionPrefix}
                    afMirror={{
                      enabled: Boolean(isFfuActive && afMirrorRootPath),
                      companyId,
                      project: selectedProject,
                      rootPath: afMirrorRootPath,
                      relativePath: afRelativePath,
                      onRelativePathChange: onAfRelativePathChange,
                      selectedItemId: afSelectedItemId,
                      onSelectedItemIdChange: onAfSelectedItemIdChange,
                      refreshNonce: afMirrorRefreshNonce,
                    }}
                    onToggleSubFolder={handleToggleProjectFolder}
                    onCollapseSubtree={collapseProjectFolderSubtree}
                    onPressFolder={openPhaseNavigationFromFolder}
                    onSelectProject={project => {
                      if (isWeb) {
                        // On web, keep navigation inline
                        // The caller is responsible for updating selectedProject
                        if (project && project.id) {
                          // noop here; HomeScreen handles selection via requestProjectSwitch
                        }
                      } else {
                        navigation.navigate('ProjectDetails', {
                          project: {
                            id: project.id,
                            name: project.name,
                            ansvarig: project.ansvarig || '',
                            adress: project.adress || '',
                            fastighetsbeteckning: project.fastighetsbeteckning || '',
                            client: project.client || '',
                            status: project.status || 'ongoing',
                            createdAt: project.createdAt || '',
                            createdBy: project.createdBy || '',
                          },
                          companyId,
                        });
                      }
                    }}
                    onSelectFunction={handleSelectFunction}
                    navigation={navigation}
                    companyId={companyId}
                    projectStatusFilter={projectStatusFilter}
                  />
                </View>
              );
            }

            if (loadingHierarchy) {
              const spin = phaseChangeSpinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              });
              return (
                <View
                  style={{
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 200,
                  }}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Animated.View
                      style={{
                        width: 32,
                        height: 32,
                        borderWidth: 3,
                        borderColor: '#e0e0e0',
                        borderTopColor: '#1976D2',
                        borderRadius: 16,
                        transform: [{ rotate: spin }],
                      }}
                    />
                    <Text
                      style={{
                        color: '#888',
                        fontSize: 14,
                        marginTop: 16,
                        textAlign: 'center',
                      }}
                    >
                      Laddar projektstruktur...
                    </Text>
                  </View>
                </View>
              );
            }

            if (!selectedProject && sharepointSyncState === 'error') {
              return (
                <View style={{ paddingHorizontal: 4 }}>
                  <View style={{ paddingVertical: 16 }}>
                    <Text style={{ paddingHorizontal: 4, color: '#D32F2F', fontSize: 14 }}>
                      {sharepointSyncError || 'SharePoint-synk misslyckades'}
                    </Text>
                  </View>
                </View>
              );
            }

            if (!selectedProject && sharepointSyncState !== 'ready') {
              return (
                <View style={{ paddingHorizontal: 4 }}>
                  <View style={{ paddingVertical: 16 }}>
                    <Text style={{ paddingHorizontal: 4, color: '#666', fontSize: 14 }}>
                      Laddar mappar...
                    </Text>
                  </View>
                </View>
              );
            }

            // Always use filteredHierarchy - never fallback to raw hierarchy
            // If no config exists or no sites enabled, filteredHierarchy will be empty
            const displayHierarchy = filteredHierarchy || [];
            if (navLoading) {
              return (
                <View
                  style={{ paddingHorizontal: 4 }}
                  nativeID={isWeb ? 'dk-tree-root' : undefined}
                >
                  <View style={{ paddingVertical: 16 }}>
                    <Text
                      style={{
                        paddingHorizontal: 4,
                        color: '#666',
                        fontSize: 14,
                      }}
                    >
                      Laddar SharePoint-mappar...
                    </Text>
                  </View>
                </View>
              );
            }

            if (!displayHierarchy.length) {
              // If sites are not visible (metadata missing), we can't group by site.
              // Still show Firestore projects if any exist.
              if (Array.isArray(firestoreProjects) && firestoreProjects.length > 0) {
                const items = firestoreProjects
                  .filter((p) => String(p?.siteRole || '').trim().toLowerCase() === 'projects')
                  .filter((p) => String(p?.status || '').trim().toLowerCase() !== 'archived')
                  .sort((a, b) => String(a?.projectNumber || '').localeCompare(String(b?.projectNumber || ''), undefined, { numeric: true, sensitivity: 'base' }));

                return (
                  <View style={{ paddingHorizontal: 4 }} nativeID={isWeb ? 'dk-tree-root' : undefined}>
                    <Text style={{ paddingVertical: 8, paddingHorizontal: 4, color: '#666', fontSize: 14 }}>
                      Projekt (från Firestore)
                    </Text>
                    {items.map((p) => {
                      const number = String(p?.projectNumber || p?.id || '').trim();
                      const name = String(p?.projectName || '').trim();
                      const fullName = String(p?.fullName || `${number} ${name}`.trim()).trim();
                      const siteId = String(p?.sharePointSiteId || '').trim();
                      const path = String(p?.rootFolderPath || '').trim();
                      const metaKey = siteId && path ? `${siteId}|${path}` : null;
                      const savedMeta = metaKey && projectMetadataMap ? projectMetadataMap.get(metaKey) : null;
                      const effectivePhaseKey = (savedMeta?.phaseKey && String(savedMeta.phaseKey).trim()) || DEFAULT_PHASE;
                      const phaseStatus = String(savedMeta?.status || (effectivePhaseKey === 'avslut' ? 'completed' : 'ongoing'));
                      const indicatorColor = getPhaseConfig(effectivePhaseKey)?.color || '#43A047';
                      const rowKey = `${siteId || 'no-site'}|${number || p?.id || ''}`;

                      const onSelect = () => {
                        const projectData = {
                          id: number || String(p?.id || '').trim(),
                          number,
                          name: name || fullName,
                          projectNumber: number,
                          projectName: name,
                          fullName,
                          siteId,
                          path,
                          sharePointPath: path,
                          type: 'project',
                          phase: effectivePhaseKey,
                          // Keep existing semantics: this is phase/progress status (ongoing/completed).
                          status: phaseStatus,
                          // Lifecycle status (active/archived) lives in Firestore.
                          lifecycleStatus: String(p?.status || 'active'),
                        };
                        if (onSelectProject) onSelectProject(projectData);
                      };

                      const onOpenMenu = (e) => {
                        try {
                          if (!canArchiveProjects) return;
                          openProjectContextMenu(e, { projectId: number, fullName, projectNumber: number, sharePointSiteId: siteId, rootFolderPath: path });
                        } catch (_e) {}
                      };

                      if (isWeb) {
                        const isHovered = hoveredProjectKey === rowKey;
                        return (
                          <div
                            key={number || p?.id || rowKey}
                            onClick={onSelect}
                            onContextMenu={onOpenMenu}
                            onMouseEnter={() => setHoveredProjectKey(rowKey)}
                            onMouseLeave={() => setHoveredProjectKey(null)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              padding: '6px 8px',
                              cursor: 'pointer',
                              borderRadius: 4,
                              backgroundColor: isHovered ? LEFT_NAV.hoverBg : 'transparent',
                              transition: 'background-color 0.15s ease',
                            }}
                          >
                            <div style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: indicatorColor, marginRight: 8, border: '1px solid #bbb', display: 'inline-block' }} />
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: isHovered ? '600' : '500',
                                color: isHovered ? LEFT_NAV.hoverText : LEFT_NAV.textDefault,
                                fontFamily: LEFT_NAV.webFontFamily,
                                flex: 1,
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                              }}
                            >
                              {fullName || number}
                            </span>
                          </div>
                        );
                      }

                      return (
                        <TouchableOpacity
                          key={number || p?.id || rowKey}
                          onPress={onSelect}
                          onLongPress={onOpenMenu}
                          activeOpacity={0.8}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, paddingHorizontal: 8, borderRadius: 4 }}
                        >
                          <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: indicatorColor, marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                          <Text style={{ fontSize: 14, fontWeight: '500', color: LEFT_NAV.textDefault, flex: 1 }} numberOfLines={1}>
                            {fullName || number}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                );
              }

              return (
                <View
                  style={{ paddingHorizontal: 4 }}
                  nativeID={isWeb ? 'dk-tree-root' : undefined}
                >
                  <Text
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      color: '#666',
                      fontSize: 14,
                    }}
                  >
                    {'Inga SharePoint-siter är synliga för detta företag. Be en superadmin koppla en SharePoint-site (Admin → Företag → "Koppla SharePoint Site").'}
                  </Text>
                </View>
              );
            }

            // Show sites as root level, with their folders as children
            return (
              <View
                style={{ paddingHorizontal: 4 }}
                nativeID={isWeb ? 'dk-tree-root' : undefined}
              >
                {displayHierarchy.map(siteItem => {
                  // Site items have type 'site' and contain folders as children
                  if (siteItem.type === 'site') {
                    const isExpanded = expandedSites[siteItem.siteId] !== false; // default: expanded
                    const siteSpin = spinSites[siteItem.siteId] || 0;
                    const isSiteHovered = hoveredSiteId === siteItem.siteId;

                    const toggleSiteExpanded = () => {
                      setExpandedSites(prev => ({
                        ...prev,
                        [siteItem.siteId]: !isExpanded,
                      }));
                      setSpinSites(prev => ({
                        ...prev,
                        [siteItem.siteId]: (prev[siteItem.siteId] || 0) + 1,
                      }));
                    };

                    return (
                      <View key={siteItem.id} style={{ marginBottom: 8 }}>
                        {/* Site header */}
                        <SidebarItem
                          onPress={toggleSiteExpanded}
                          onLongPress={(e) => {
                            try { openSpContextMenu(e, siteItem); } catch (_e) {}
                          }}
                          onContextMenu={(e) => {
                            try { openSpContextMenu(e, siteItem); } catch (_e) {}
                          }}
                          onHoverIn={() => setHoveredSiteId(siteItem.siteId)}
                          onHoverOut={() => setHoveredSiteId(null)}
                          hovered={isSiteHovered}
                          style={{ marginBottom: 4 }}
                          left={() => (
                            <>
                              <View style={{ marginRight: 4 }}>
                                <AnimatedChevron
                                  expanded={isExpanded}
                                  spinTrigger={siteSpin}
                                  size={16}
                                  color={isSiteHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconDefault}
                                />
                              </View>
                              <MicroPulse trigger={siteSpin}>
                                <SharePointSiteIcon
                                  size={18}
                                  color={isSiteHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconDefault}
                                  style={{ marginRight: 6 }}
                                />
                              </MicroPulse>
                            </>
                          )}
                          label={stripNumberPrefixForDisplay(siteItem.name)}
                          labelWeight={isSiteHovered ? '600' : '500'}
                        />
                        
                        {/* Site folders */}
                        {isExpanded && (
                          <View style={{ marginLeft: 12 }}>
                            {(() => {
                              const sid = String(siteItem?.siteId || '').trim();
                              const projectsForSite = (firestoreProjects || [])
                                .filter((p) => String(p?.siteRole || '').trim().toLowerCase() === 'projects')
                                .filter((p) => String(p?.status || '').trim().toLowerCase() !== 'archived')
                                .filter((p) => String(p?.sharePointSiteId || '').trim() === sid)
                                .sort((a, b) => String(a?.projectNumber || '').localeCompare(String(b?.projectNumber || ''), undefined, { numeric: true, sensitivity: 'base' }));

                              const children = Array.isArray(siteItem?.children) ? siteItem.children : [];
                              const nonProjectFolders = children.filter(
                                (f) => f && !isProjectFolder(f) && !isHiddenSystemRootFolderName(f?.name),
                              );

                              const projectsExpanded = isSiteSectionExpanded(sid, 'projects');
                              const foldersExpanded = isSiteSectionExpanded(sid, 'folders');

                              const renderSectionHeader = (sectionKey, label, count, expanded) => {
                                const sectionIcon = sectionKey === 'projects' ? 'briefcase-outline' : 'folder-outline';
                                const hoverKey = `${sid}|${sectionKey}`;
                                const isHovered = hoveredSectionKey === hoverKey;
                                const pulseTrigger = siteSectionToggleTick?.[hoverKey] || 0;
                                return (
                                  <SidebarItem
                                    key={`${sid}|hdr|${sectionKey}`}
                                    onPress={() => toggleSiteSectionExpanded(sid, sectionKey)}
                                    onHoverIn={() => setHoveredSectionKey(hoverKey)}
                                    onHoverOut={() => setHoveredSectionKey(null)}
                                    hovered={isHovered}
                                    muted
                                    style={{ marginTop: 4 }}
                                    left={() => (
                                      <>
                                        <View style={{ marginRight: 6 }}>
                                          <AnimatedChevron
                                            expanded={expanded}
                                            spinTrigger={pulseTrigger}
                                            size={16}
                                            color={isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted}
                                          />
                                        </View>
                                        <MicroPulse trigger={pulseTrigger}>
                                          <Ionicons
                                            name={sectionIcon}
                                            size={16}
                                            color={isHovered ? LEFT_NAV.hoverIcon : LEFT_NAV.iconMuted}
                                            style={{ marginRight: 6 }}
                                          />
                                        </MicroPulse>
                                      </>
                                    )}
                                    label={label}
                                    labelWeight={'700'}
                                    count={count}
                                  />
                                );
                              };

                              return (
                                <>
                                  {renderSectionHeader('projects', 'Projekt', projectsForSite.length, projectsExpanded)}

                                  {projectsExpanded ? (
                                    (() => {
                                      if (projectsLoading && projectsForSite.length === 0) {
                                        return (
                                          <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 20, paddingVertical: 6 }}>
                                            Laddar projekt...
                                          </Text>
                                        );
                                      }

                                      if (projectsForSite.length > 0) {
                                        return (
                                          <View style={{ marginBottom: 6, marginLeft: 8 }}>
                                            {projectsForSite.map((p) => {
                                      const number = String(p?.projectNumber || p?.id || '').trim();
                                      const name = String(p?.projectName || '').trim();
                                      const fullName = String(p?.fullName || `${number} ${name}`.trim()).trim();
                                      const path = String(p?.rootFolderPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
                                      const metaKey = sid && path ? `${sid}|${path}` : null;
                                      const savedMeta = metaKey && projectMetadataMap ? projectMetadataMap.get(metaKey) : null;
                                      const effectivePhaseKey =
                                        (savedMeta?.phaseKey && String(savedMeta.phaseKey).trim()) ||
                                        (projectPhaseKey && projectPhaseKey !== 'all' ? String(projectPhaseKey).trim() : null) ||
                                        DEFAULT_PHASE;
                                      const phaseStatus = String(savedMeta?.status || (effectivePhaseKey === 'avslut' ? 'completed' : 'ongoing'));
                                      const indicatorColor = getPhaseConfig(effectivePhaseKey)?.color || '#43A047';
                                      const rowKey = `${sid || 'no-site'}|${number || p?.id || ''}`;
                                      const isDisabled = archivingProjectId && String(archivingProjectId) === String(number);

                                      const onSelect = () => {
                                        const projectData = {
                                          id: number || String(p?.id || '').trim(),
                                          number,
                                          name: name || fullName,
                                          projectNumber: number,
                                          projectName: name,
                                          fullName,
                                          siteId: sid,
                                          sharePointSiteId: sid,
                                          sharePointSiteUrl: p?.sharePointSiteUrl || siteItem?.webUrl || null,
                                          path,
                                          sharePointPath: path,
                                          projectPath: path,
                                          type: 'project',
                                          phase: effectivePhaseKey,
                                          status: phaseStatus,
                                          lifecycleStatus: String(p?.status || 'active'),
                                        };
                                        if (onSelectProject) onSelectProject(projectData);
                                      };

                                      const onOpenMenu = (e) => {
                                        try {
                                          if (!canArchiveProjects) return;
                                          openProjectContextMenu(e, { projectId: number, fullName, projectNumber: number, sharePointSiteId: sid, rootFolderPath: path });
                                        } catch (_e) {}
                                      };

                                      if (isWeb) {
                                        const isHovered = hoveredProjectKey === rowKey;
                                        const selectedId = String(selectedProject?.id || selectedProject?.projectNumber || selectedProject?.number || '').trim();
                                        const isActive = !!selectedId && String(selectedId) === String(number || p?.id || '').trim();
                                        return (
                                          <SidebarItem
                                            key={number || p?.id || rowKey}
                                            onPress={isDisabled ? undefined : onSelect}
                                            onContextMenu={isDisabled ? undefined : onOpenMenu}
                                            onHoverIn={() => setHoveredProjectKey(rowKey)}
                                            onHoverOut={() => setHoveredProjectKey(null)}
                                            hovered={isHovered}
                                            active={isActive}
                                            disabled={isDisabled}
                                            left={() => (
                                              <View
                                                style={{
                                                  width: 10,
                                                  height: 10,
                                                  borderRadius: 5,
                                                  backgroundColor: indicatorColor,
                                                  marginRight: 8,
                                                  borderWidth: 1,
                                                  borderColor: '#bbb',
                                                }}
                                              />
                                            )}
                                            label={fullName || number}
                                          />
                                        );
                                      }

                                      const selectedId = String(selectedProject?.id || selectedProject?.projectNumber || selectedProject?.number || '').trim();
                                      const isActive = !!selectedId && String(selectedId) === String(number || p?.id || '').trim();
                                      return (
                                        <SidebarItem
                                          key={number || p?.id || rowKey}
                                          onPress={onSelect}
                                          onLongPress={onOpenMenu}
                                          disabled={isDisabled}
                                          active={isActive}
                                          left={() => (
                                            <View
                                              style={{
                                                width: 10,
                                                height: 10,
                                                borderRadius: 5,
                                                backgroundColor: indicatorColor,
                                                marginRight: 8,
                                                borderWidth: 1,
                                                borderColor: '#bbb',
                                              }}
                                            />
                                          )}
                                          label={fullName || number}
                                        />
                                      );
                                    })}
                                          </View>
                                        );
                                      }

                                      return (
                                        <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 20, paddingVertical: 6 }}>
                                          Inga projekt
                                        </Text>
                                      );
                                    })()
                                  ) : null}

                                  {renderSectionHeader('folders', 'Mappar', nonProjectFolders.length, foldersExpanded)}

                                  {foldersExpanded ? (
                                    <>
                                      {nonProjectFolders.length > 0 ? (
                                        <View style={{ marginTop: 2, marginLeft: 8 }}>
                                          {nonProjectFolders.map((folder) => (
                                    <RecursiveFolderView
                                      key={folder.id}
                                      folder={folder}
                                      level={0}
                                      expandedSubs={spExpandedFolders}
                                      spinSubs={spSpinFolders}
                                      lockedSubs={spLockedFolders}
                                      lockTickSubs={spLockedTick}
                                      onToggle={toggleSpFolder}
                                      companyId={companyId}
                                      hierarchy={hierarchy}
                                      setHierarchy={setHierarchy}
                                      parentPath=""
                                      isProject={false}
                                      onSelectProject={onSelectProject}
                                      navigation={navigation}
                                      projectMetadataMap={projectMetadataMap}
                                      fallbackPhaseKey={projectPhaseKey}
                                      onOpenSpContextMenu={openSpContextMenu}
                                    />
                                          ))}
                                        </View>
                                      ) : (
                                        <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', marginLeft: 20, paddingVertical: 6 }}>
                                          Inga mappar
                                        </Text>
                                      )}
                                    </>
                                  ) : null}
                                </>
                              );
                            })()}
                          </View>
                        )}
                      </View>
                    );
                  }
                  
                  // Fallback for old structure (direct folders)
                  const folderIsProject = isProjectFolder(siteItem);
                  return (
                    <RecursiveFolderView
                      key={siteItem.id}
                      folder={siteItem}
                      level={0}
                      expandedSubs={spExpandedFolders}
                      spinSubs={spSpinFolders}
                      lockedSubs={spLockedFolders}
                      lockTickSubs={spLockedTick}
                      onToggle={toggleSpFolder}
                      companyId={companyId}
                      hierarchy={hierarchy}
                      setHierarchy={setHierarchy}
                      parentPath=""
                      isProject={folderIsProject}
                      onSelectProject={onSelectProject}
                      navigation={navigation}
                      projectMetadataMap={projectMetadataMap}
                      fallbackPhaseKey={projectPhaseKey}
                      onOpenSpContextMenu={openSpContextMenu}
                    />
                  );
                })}
              </View>
            );
          })()}
        </ScrollView>

        <ContextMenu
          visible={spContextMenu.visible}
          x={spContextMenu.x}
          y={spContextMenu.y}
          items={spContextMenuItems}
          onSelect={handleSpContextMenuSelect}
          onClose={closeSpContextMenu}
        />

        <ContextMenu
          visible={projectContextMenu.visible}
          x={projectContextMenu.x}
          y={projectContextMenu.y}
          items={projectContextMenuItems}
          onSelect={handleProjectContextMenuSelect}
          onClose={closeProjectContextMenu}
        />

        <Modal
          visible={!!spActionModal?.visible}
          transparent
          animationType="fade"
          onRequestClose={closeSpActionModal}
        >
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 16 }}>
            <View style={{ width: '100%', maxWidth: 520, backgroundColor: '#fff', borderRadius: 12, padding: 16, borderWidth: 1, borderColor: '#e0e0e0' }}>
              <Text style={{ fontSize: 16, fontWeight: '700', color: '#222', marginBottom: 10 }}>
                {String(spActionModal?.title || 'Åtgärd')}
              </Text>
              <TextInput
                value={spActionValue}
                onChangeText={setSpActionValue}
                editable={!spActionBusy}
                placeholder={spActionModal?.kind === 'move' ? 'Ex: Projekthantering/2026 (tomt = rot)' : 'Skriv här…'}
                autoCapitalize="none"
                style={{
                  borderWidth: 1,
                  borderColor: '#ddd',
                  borderRadius: 10,
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  fontSize: 14,
                  color: '#111',
                }}
              />
              <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 12 }}>
                <TouchableOpacity
                  onPress={closeSpActionModal}
                  disabled={spActionBusy}
                  style={{ paddingVertical: 10, paddingHorizontal: 12, marginRight: 10 }}
                >
                  <Text style={{ color: '#666', fontSize: 14, fontWeight: '600' }}>Avbryt</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={runSpAction}
                  disabled={spActionBusy}
                  style={{ paddingVertical: 10, paddingHorizontal: 14, backgroundColor: '#1976D2', borderRadius: 10, opacity: spActionBusy ? 0.6 : 1 }}
                >
                  <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700' }}>
                    {spActionBusy ? 'Jobbar…' : 'OK'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {isWeb && (
          <ContextMenu
            visible={contextMenu.visible}
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onSelect={handleContextMenuSelect}
            onClose={closeContextMenu}
          />
        )}

        {!selectedProject && isWeb && createPortal && typeof document !== 'undefined'
          ? (() => {
              try {
                let footerRoot = document.getElementById('dk-footer-portal');
                if (!footerRoot) {
                  footerRoot = document.createElement('div');
                  footerRoot.id = 'dk-footer-portal';
                  document.body.appendChild(footerRoot);
                }

                const FooterBox = (
                  <View
                    style={{
                      position: 'fixed',
                      left: 12,
                      bottom: 12,
                      zIndex: 2147483647,
                      // Don't block interactions in the left tree (hover/click on folders).
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.12,
                      shadowRadius: 12,
                      elevation: 12,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                      </Text>
                    </View>
                  </View>
                );

                return createPortal(FooterBox, footerRoot);
              } catch (_e) {
                return (
                  <View
                    style={{
                      position: 'absolute',
                      left: 8,
                      bottom: 8,
                      zIndex: 9999,
                      // Don't block interactions in the left tree.
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      elevation: 8,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                        {buildStamp ? ` (${buildStamp})` : ''}
                      </Text>
                    </View>
                  </View>
                );
              }
            })()
          : null}
      </View>

    </>
  );
}
