import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useRef, useState } from 'react';
import { Alert, Animated, Easing, ImageBackground, Platform, Pressable, ScrollView, useWindowDimensions, View } from 'react-native';
import { formatRelativeTime } from '../components/common/Dashboard/dashboardUtils';
import { useDashboard } from '../components/common/Dashboard/useDashboard';
import { HeaderSearchDropdown } from '../components/common/HeaderSearchDropdown';
import { HomeHeader } from '../components/common/HomeHeader';
import HomeMainPaneContainer from '../components/common/HomeMainPaneContainer';
import { HomeMobileProjectTreeContainer } from '../components/common/HomeMobileProjectTreeContainer';
import { HomeTasksSection } from '../components/common/HomeTasksSection';
import { NewProjectModal, SimpleProjectLoadingModal, SimpleProjectModal, SimpleProjectSuccessModal } from '../components/common/Modals';
import CreateProjectModal from '../components/common/Modals/CreateProjectModal';
import { SearchProjectModal } from '../components/common/SearchProjectModal';
import { SharePointLeftPanel } from '../components/common/SharePointLeftPanel';
import { DK_MIDDLE_PANE_BOTTOM_GUTTER } from '../components/common/layoutConstants';
import { auth, saveControlToFirestore, saveDraftToFirestore, subscribeUserNotifications } from '../components/firebase';
import { onProjectUpdated } from '../components/projectBus';
import { usePhaseNavigation } from '../features/project-phases/phases/hooks/usePhaseNavigation';
import { DEFAULT_PHASE, getProjectPhase } from '../features/projects/constants';
import { useAdminSupportTools } from '../hooks/useAdminSupportTools';
import useBackgroundSync from '../hooks/useBackgroundSync';
import { useCompanyControlTypes } from '../hooks/useCompanyControlTypes';
import useCreateSharePointProjectModal from '../hooks/useCreateSharePointProjectModal';
import { useHomeHeaderProjectSearch } from '../hooks/useHomeHeaderProjectSearch';
import { useHomeInlineBrowserIntegration } from '../hooks/useHomeInlineBrowserIntegration';
import { useHomePaneResizing } from '../hooks/useHomePaneResizing';
import { useHomeProjectFolders } from '../hooks/useHomeProjectFolders';
import { useHomeProjectSelection } from '../hooks/useHomeProjectSelection';
import { useHomeSearchAndScroll } from '../hooks/useHomeSearchAndScroll';
import { useHomeTasksSection } from '../hooks/useHomeTasksSection';
import { useHomeTreeInteraction } from '../hooks/useHomeTreeInteraction';
import { useHomeUserActivity } from '../hooks/useHomeUserActivity';
import { useHomeWebNavigation } from '../hooks/useHomeWebNavigation';
import { useProjectCreation } from '../hooks/useProjectCreation';
import { useSharePointHierarchy } from '../hooks/useSharePointHierarchy';
import { useSharePointStatus } from '../hooks/useSharePointStatus';
import { useTreeContextMenu } from '../hooks/useTreeContextMenu';
import { extractProjectMetadata, isProjectFolder } from '../utils/isProjectFolder';

// Web-only: lazily resolve ReactDOM.createPortal at runtime so the file
// still works in native bundles where react-dom is not available.
let createPortal = null;
let portalRootId = 'dk-header-portal';
if (typeof Platform !== 'undefined' && Platform.OS === 'web') {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const reactDom = require('react-dom');
    createPortal = reactDom?.createPortal || null;
  } catch (_e) {
    createPortal = null;
  }
}

// App version string for footer/debug info (web).
// Default to a safe value and try to read from package.json at runtime in dev.
let appVersion = '1.0.0';
try {
  // eslint-disable-next-line global-require
  const pkg = require('../package.json');
  if (pkg && pkg.version) {
    appVersion = String(pkg.version);
  }
} catch (_e) {
  // Swallow errors silently; footer will just show default version.
}

export default function HomeScreen({ navigation, route }) {

  const [spinSidebarHome, setSpinSidebarHome] = useState(0);
  const [spinSidebarRefresh, setSpinSidebarRefresh] = useState(0);
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const [headerHeight, setHeaderHeight] = useState(0);
  const leftTreeScrollRef = useRef(null);
  const rightPaneScrollRef = useRef(null);
  const activityScrollRef = useRef(null);
  const filterSpinAnim = useRef(new Animated.Value(0)).current;
  const searchSpinAnim = useRef(new Animated.Value(0)).current;
  const mainChevronSpinAnim = useRef({}).current; // per-huvudmapp
  const subChevronSpinAnim = useRef({}).current;  // per-undermapp

  const spinOnce = (anim) => {
    if (!anim) return;
    try { anim.setValue(0); } catch(_e) {}
      try {
      Animated.timing(anim, {
        toValue: 1,
        duration: 300,
        easing: Easing.out(Easing.ease),
        useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
      }).start();
    } catch(_e) {}
  };

  // Gemensam alert-helper för web + native
  const showAlert = React.useCallback((title, message) => {
    try {
      const t = String(title || '').trim() || 'Info';
      const m = String(message || '').trim();
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert(m ? `${t}\n\n${m}` : t);
      } else {
        Alert.alert(t, m || '');
      }
    } catch (_e) {}
  }, []);

  // Small press feedback row used for task/control rows
  function AnimatedRow({ children, onPress, style }) {
    const scale = useRef(new Animated.Value(1)).current;
    const pressIn = () => {
      try { Animated.timing(scale, { toValue: 0.985, duration: 120, useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    };
    const pressOut = () => {
      try { Animated.timing(scale, { toValue: 1, duration: 120, useNativeDriver: (Platform && Platform.OS === 'web') ? false : true }).start(); } catch(_e) {}
    };
    return (
      <Pressable onPressIn={pressIn} onPressOut={pressOut} onPress={onPress}>
        <Animated.View style={[{ transform: [{ scale }] }, style]}>
          {children}
        </Animated.View>
      </Pressable>
    );
  }

  const filterRotate = filterSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const searchRotate = searchSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  // App-specifik sökpopup + scroll-konfiguration (native tangentbord + scrollEnabled)
  const {
    searchModalVisible,
    searchText,
    setSearchText,
    keyboardHeight,
    openSearchModal,
    closeSearchModal,
    scrollEnabled,
  } = useHomeSearchAndScroll();

  // Centraliserad state/logik för uppgifts-/kontrollsektionen (HomeTasksSection)
  const {
    tasksOpen,
    setTasksOpen,
    controlsOpen,
    setControlsOpen,
    selectProjectModal,
    setSelectProjectModal,
    showControlTypeModal,
    setShowControlTypeModal,
    controlTypeScrollMetrics,
    setControlTypeScrollMetrics,
    controlTypeCanScroll,
    controlTypeThumbHeight,
    controlTypeThumbTop,
    projectControlModal,
    setProjectControlModal,
    projectControlSelectedType,
    setProjectControlSelectedType,
    projectControlTypePickerOpen,
    setProjectControlTypePickerOpen,
    projectControlTemplates,
    setProjectControlTemplates,
    projectControlSelectedTemplateId,
    setProjectControlSelectedTemplateId,
    projectControlTemplatePickerOpen,
    setProjectControlTemplatePickerOpen,
    projectControlTemplateSearch,
    setProjectControlTemplateSearch,
  } = useHomeTasksSection();
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');
  const isBrowserEnv = (typeof window !== 'undefined' && Platform.OS === 'web');
  const isWeb = Platform.OS === 'web';

  const webPaneHeight = Platform.OS === 'web'
    ? Math.max(240, (windowHeight || 800) - (headerHeight || 140))
    : undefined;

  const scrollToEndSafe = (ref) => {
    const node = ref?.current;
    if (!node) return;
    try {
      if (typeof node.scrollToEnd === 'function') node.scrollToEnd({ animated: true });
      else if (typeof node.scrollTo === 'function') node.scrollTo({ y: 1e9, animated: true });
    } catch(_e) {}
  };

  // collapseHierarchy nu tillgänglig via useHomeTreeInteraction
  // Admin/support/debug-verktyg (tidigare inline i HomeScreen)
  const routeCompanyId = route?.params?.companyId || null;
  const [companyId, setCompanyId] = useState(() => routeCompanyId || '');

  const {
    showAdminButton,
    setShowAdminButton,
    adminActionRunning,
    supportMenuOpen,
    setSupportMenuOpen,
    authClaims,
    isAdminUser,
    canShowSupportToolsInHeader,
    localFallbackExists,
    setLocalFallbackExists,
    handleMakeDemoAdmin,
    refreshLocalFallbackFlag,
    dumpLocalRemoteControls,
    showLastFsError,
  } = useAdminSupportTools({ route, companyId, setCompanyId, showAlert });

  const isSuperAdmin = ((auth && auth.currentUser && ['marcus@msbyggsystem.se', 'marcus.skogh@msbyggsystem.se'].includes(String(auth.currentUser.email || '').toLowerCase())) || !!authClaims?.globalAdmin);

  const currentEmailLower = String(auth?.currentUser?.email || '').toLowerCase();
  const isMsAdminClaim = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  const allowedTools = (currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se') || (String(authClaims?.companyId || '').trim() === 'MS Byggsystem' && isMsAdminClaim);
  const showHeaderUserMenu = !!(isAdminUser || currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se');
  // companyId kan komma från route.params eller användarprofil
  // Persist companyId locally (used as fallback in other screens) and
  // allow resolving companyId from auth claims when route params are missing.
  React.useEffect(() => {
    (async () => {
      try {
        const current = String(companyId || '').trim();
        const fromClaims = String(authClaims?.companyId || '').trim();
        let cid = current || fromClaims;
        if (!cid) {
          const stored = String(await AsyncStorage.getItem('dk_companyId') || '').trim();
          const fromLs = Platform.OS === 'web' && typeof window?.localStorage?.getItem === 'function'
            ? String(window.localStorage.getItem('dk_companyId') || '').trim()
            : '';
          cid = stored || fromLs;
          if (cid) setCompanyId(cid);
        }
        if (!cid) return;
        if (!current && cid) setCompanyId(cid);
        const stored = await AsyncStorage.getItem('dk_companyId');
        if (stored !== cid) await AsyncStorage.setItem('dk_companyId', cid);
      } catch(_e) {}
    })();
  }, [companyId, authClaims?.companyId]);

  const [hierarchyReloadKey, setHierarchyReloadKey] = useState(0);

  // Inloggnings-/activity-effekter (login-logg + company members) extraherade till useHomeUserActivity
  useHomeUserActivity({ companyId, routeCompanyId, authClaims });

  // Auto-refresh av SharePoint-hierarkin på webben (polling)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const interval = setInterval(() => {
      setHierarchyReloadKey((k) => k + 1);
    }, 60000); // var 60:e sekund
    return () => clearInterval(interval);
  }, []);

  // Refresh SharePoint metadata/hierarchy when a project updates its phase metadata.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined' || typeof window.addEventListener !== 'function') return;

    const onMetaUpdated = () => {
      setHierarchyReloadKey((k) => k + 1);
    };

    window.addEventListener('dkSharePointMetaUpdated', onMetaUpdated);
    return () => {
      try { window.removeEventListener('dkSharePointMetaUpdated', onMetaUpdated); } catch (_e) {}
    };
  }, []);

  // Laddningsstate för hierarkin + referens till aktuell hierarki (SharePoint)
  const {
    loadingHierarchy,
    hierarchy,
    setHierarchy,
    hierarchyRef,
  } = useSharePointHierarchy({
    companyId,
    setCompanyId,
    routeCompanyId,
    authClaims,
    route,
    reloadKey: hierarchyReloadKey,
  });

  // Projekt-skapande (modals, formulär, ansvariga, skyddsrond m.m.)
  const {
    newProjectModal,
    setNewProjectModal,
    simpleProjectModal,
    setSimpleProjectModal,
    simpleProjectSuccessModal,
    setSimpleProjectSuccessModal,
    simpleProjectCreatedRef,
    creatingProjectInline,
    setCreatingProjectInline,
    newProjectName,
    setNewProjectName,
    newProjectNumber,
    setNewProjectNumber,
    newProjectPhase,
    setNewProjectPhase,
    newProjectCustomer,
    setNewProjectCustomer,
    newProjectClientContactName,
    setNewProjectClientContactName,
    newProjectClientContactPhone,
    setNewProjectClientContactPhone,
    newProjectClientContactEmail,
    setNewProjectClientContactEmail,
    newProjectAddressStreet,
    setNewProjectAddressStreet,
    newProjectAddressPostal,
    setNewProjectAddressPostal,
    newProjectAddressCity,
    setNewProjectAddressCity,
    newProjectPropertyDesignation,
    setNewProjectPropertyDesignation,
    newProjectParticipantsSearch,
    setNewProjectParticipantsSearch,
    newProjectAdvancedOpen,
    setNewProjectAdvancedOpen,
    focusedInput,
    setFocusedInput,
    hoveredSkyddsrondBtn,
    setHoveredSkyddsrondBtn,
    newProjectResponsible,
    setNewProjectResponsible,
    responsiblePickerVisible,
    setResponsiblePickerVisible,
    newProjectParticipants,
    setNewProjectParticipants,
    participantsPickerVisible,
    setParticipantsPickerVisible,
    companyAdmins,
    setCompanyAdmins,
    loadingCompanyAdmins,
    companyAdminsPermissionDenied,
    responsibleDropdownOpen,
    setResponsibleDropdownOpen,
    responsibleDropdownRef,
    nativeKeyboardHeight,
    nativeKeyboardHeightRef,
    companyMembers,
    setCompanyMembers,
    loadingCompanyMembers,
    setLoadingCompanyMembers,
    companyMembersPermissionDenied,
    setCompanyMembersPermissionDenied,
    newProjectSkyddsrondEnabled,
    setNewProjectSkyddsrondEnabled,
    newProjectSkyddsrondWeeks,
    setNewProjectSkyddsrondWeeks,
    newProjectSkyddsrondFirstDueDate,
    setNewProjectSkyddsrondFirstDueDate,
    skyddsrondWeeksPickerVisible,
    setSkyddsrondWeeksPickerVisible,
    creatingProject,
    setCreatingProject,
    newProjectKeyboardLockHeight,
    setNewProjectKeyboardLockHeight,
    newProjectSkyddsrondFirstDueValid,
    isProjectNumberUnique,
    canCreateProject,
    canCreateSimpleProject,
    resetProjectFields,
    loadCompanyAdmins,
    handleCreateSimpleProject,
  } = useProjectCreation({
    auth,
    hierarchy,
    setHierarchy,
    hierarchyRef,
    companyId,
    isBrowserEnv,
  });

  // Load company admins is now handled inside useProjectCreation
  // expandedProjects och projektval hanteras av useHomeTreeInteraction / useHomeProjectSelection
  const [projectControlsRefreshNonce, setProjectControlsRefreshNonce] = useState(0);

  // Projektval + inline-editor centraliseras i useHomeProjectSelection
  const {
    selectedProject,
    setSelectedProject,
    selectedProjectPath,
    setSelectedProjectPath,
    selectedProjectRef,
    selectedProjectFolders,
    setSelectedProjectFolders,
    selectedProjectFoldersLoading,
    setSelectedProjectFoldersLoading,
    projectSelectedAction,
    setProjectSelectedAction,
    inlineControlEditor,
    setInlineControlEditor,
    projectInlineViewLabel,
    setProjectInlineViewLabel,
    isInlineLocked,
    handleInlineLockChange,
    pendingProjectSwitchRef,
    pendingBreadcrumbNavRef,
    requestProjectSwitch,
    closeSelectedProject,
    openInlineControlEditor,
    closeInlineControlEditor,
    handleInlineControlFinished,
    handleInlineViewChange,
  } = useHomeProjectSelection({
    showAlert,
    resetProjectFields,
    creatingProjectInline,
    setCreatingProjectInline,
    newProjectName,
    setNewProjectName,
    newProjectNumber,
    setNewProjectNumber,
    setProjectControlsRefreshNonce,
  });

  const [syncStatus, setSyncStatus] = useState('idle');
  
  // Phase navigation state (for PhaseLeftPanel in leftpanel)
  const [phaseActiveSection, setPhaseActiveSection] = useState(null);
  const [phaseActiveItem, setPhaseActiveItem] = useState(null);
  const [phaseActiveNode, setPhaseActiveNode] = useState(null);

  // Project module routing (web): decouple Offerter from kalkylskede PhaseLayout.
  // When moduleId === 'offerter', WebMainPane renders OfferterLayout.
  const [projectModuleRoute, setProjectModuleRoute] = useState(null); // { moduleId, itemId }

  // AF (Administrativa föreskrifter) explorer state (used to mirror folder contents in left panel).
  const [afRelativePath, setAfRelativePath] = useState('');
  const [afSelectedItemId, setAfSelectedItemId] = useState(null);
  const [afMirrorRefreshNonce, setAfMirrorRefreshNonce] = useState(0);

  // Notiser (för banner-dropdown; tidigare i WebMainPane som högerpanel)
  const [userNotifications, setUserNotifications] = useState([]);
  const [notificationsError, setNotificationsError] = useState(null);
  const effectiveCompanyIdForNotif = (companyId != null && String(companyId).trim()) ? String(companyId).trim() : (routeCompanyId != null && String(routeCompanyId).trim()) ? String(routeCompanyId).trim() : (authClaims?.companyId != null && String(authClaims.companyId).trim()) ? String(authClaims.companyId).trim() : '';
  const currentUserId = auth?.currentUser?.uid ?? null;
  React.useEffect(() => {
    if (!effectiveCompanyIdForNotif || !currentUserId) {
      setUserNotifications([]);
      setNotificationsError(null);
      return () => {};
    }
    setNotificationsError(null);
    const unsub = subscribeUserNotifications(effectiveCompanyIdForNotif, currentUserId, {
      onData: (list) => {
        setUserNotifications(Array.isArray(list) ? list : []);
        setNotificationsError(null);
      },
      onError: (err) => {
        setUserNotifications([]);
        const msg = err?.message || '';
        const isPermission = msg.toLowerCase().includes('permission') || err?.code === 'permission-denied';
        setNotificationsError(
          isPermission
            ? 'Behörighet saknas. Deploya regler: firebase deploy --only firestore:rules. Logga sedan ut och in igen.'
            : (msg || 'Kunde inte ladda notiser')
        );
      },
      limitCount: 30,
    });
    return () => { try { unsub?.(); } catch (_e) {} };
  }, [effectiveCompanyIdForNotif, currentUserId]);
  const notificationsUnreadCount = userNotifications.filter((n) => !n?.read).length;

  const derivePhaseKeyFromProjectRootPath = React.useCallback((rootPath) => {
    const p = String(rootPath || '').trim().replace(/^\/+/, '');
    const seg = p.split('/')[0] ? String(p.split('/')[0]).trim().toLowerCase() : '';
    if (!seg) return DEFAULT_PHASE;
    if (seg === 'kalkylskede') return 'kalkylskede';
    if (seg === 'produktion') return 'produktion';
    if (seg === 'avslut') return 'avslut';
    if (seg === 'eftermarknad') return 'eftermarknad';
    return DEFAULT_PHASE;
  }, []);

  const openProjectTokenRef = React.useRef(0);

  // Single project entrypoint: always goes through requestProjectSwitch,
  // always resets UI state (Översikt/root), and best-effort hydrates
  // SharePoint root folder path + phase for consistent left panel loading.
  const openProject = React.useCallback(async (projectOrId, opts = {}) => {
    const token = (openProjectTokenRef.current || 0) + 1;
    openProjectTokenRef.current = token;

    const selectedActionProvided = Object.prototype.hasOwnProperty.call(opts, 'selectedAction');
    const clearActionAfter = !!opts.clearActionAfter;
    const selectedAction = selectedActionProvided ? opts.selectedAction : null;
    const keepModuleRoute = opts && opts.keepModuleRoute === true;

    const resolveBase = () => {
      if (!projectOrId) return null;
      if (typeof projectOrId === 'string' || typeof projectOrId === 'number') {
        const pid = String(projectOrId).trim();
        if (!pid) return null;
        return { id: pid, name: pid, projectNumber: pid };
      }
      if (typeof projectOrId === 'object') return projectOrId;
      return null;
    };

    const base = resolveBase();
    const pid = String(base?.id || base?.projectId || '').trim();
    if (!pid) return;

    // If an inline editor is locked, requestProjectSwitch will defer the switch
    // until the user confirms. In that case, avoid resetting UI state early.
    const shouldResetNow = !(Platform.OS === 'web' && isInlineLocked);

    if (shouldResetNow) {
      try {
        setPhaseActiveSection(null);
        setPhaseActiveItem(null);
        setPhaseActiveNode(null);
      } catch (_e) {}

      if (!keepModuleRoute) {
        try {
          setProjectModuleRoute(null);
        } catch (_e) {}
      }

      try {
        setAfRelativePath('');
        setAfSelectedItemId(null);
        setAfMirrorRefreshNonce((n) => n + 1);
      } catch (_e) {}
    }

    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();

    // Best-effort: ensure we have canonical Firestore project fields.
    let project = { ...base, id: pid };
    try {
      if (cid && (!project?.name || !String(project.name).trim() || !project?.projectName)) {
        const { fetchCompanyProject } = await import('../components/firebase');
        const fetched = await fetchCompanyProject(cid, pid).catch(() => null);
        if (fetched) project = { ...fetched, ...project, id: pid };
      }
    } catch (_e) {}

    const safeText = (v) => String(v || '').trim();
    let existingPath = safeText(project?.rootFolderPath || project?.sharePointRootPath || project?.projectPath || project?.path);
    let existingSiteId = safeText(project?.sharePointSiteId || project?.siteId || project?.siteID);

    // Prefer SharePoint hierarchy-derived path (same source as left panel).
    // This avoids brittle Graph search and makes dashboard opens behave like left panel opens.
    if (cid) {
      try {
        const tree = hierarchyRef?.current || [];
        const target = safeText(project?.projectNumber || project?.number || pid) || pid;
        let match = null;
        const walk = (nodes) => {
          if (!Array.isArray(nodes) || match) return;
          for (const n of nodes) {
            if (!n || match) continue;

            const folderLike = String(n?.type || '').toLowerCase() === 'folder' || Array.isArray(n?.children);
            if (folderLike && isProjectFolder(n)) {
              const meta = extractProjectMetadata(n);
              const metaId = safeText(meta?.id || meta?.number);
              if (metaId && (metaId === target || metaId === pid || String(n?.name || '').trim().startsWith(String(target)))) {
                match = { node: n, meta };
                break;
              }
            }

            if (Array.isArray(n?.children) && n.children.length > 0) {
              walk(n.children);
            }
          }
        };
        walk(tree);

        const hierarchyPath = safeText(match?.meta?.path || match?.node?.path || match?.node?.name);
        if (hierarchyPath) {
          const derivedPhase = derivePhaseKeyFromProjectRootPath(hierarchyPath);
          project = {
            ...project,
            id: pid,
            name: safeText(match?.meta?.name) || project?.name || project?.projectName || pid,
            projectName: safeText(match?.meta?.name) || project?.projectName || project?.name || '',
            fullName: safeText(match?.meta?.fullName) || project?.fullName || '',
            projectNumber: safeText(match?.meta?.number) || project?.projectNumber || project?.number || pid,
            number: safeText(match?.meta?.number) || project?.number || project?.projectNumber || pid,
            path: hierarchyPath,
            projectPath: hierarchyPath,
            rootFolderPath: hierarchyPath,
            phase: derivedPhase || project?.phase || DEFAULT_PHASE,
          };
          existingPath = hierarchyPath;
        }
      } catch (_e) {}
    }

    const ensureSiteId = async () => {
      if (existingSiteId) return existingSiteId;
      if (!cid) return null;
      try {
        const { getCompanySharePointSiteId } = await import('../components/firebase');
        const sid = await getCompanySharePointSiteId(cid).catch(() => null);
        existingSiteId = safeText(sid);
        return existingSiteId || null;
      } catch (_e) {
        return null;
      }
    };

    const resolveRootPathViaDriveTraversal = async () => {
      const sid = await ensureSiteId();
      if (!sid) return null;

      try {
        const { getDriveItems } = await import('../services/azure/hierarchyService');

        const phaseCandidates = [
          { key: 'kalkylskede', folder: 'Kalkylskede' },
          { key: 'produktion', folder: 'Produktion' },
          { key: 'eftermarknad', folder: 'Eftermarknad' },
          { key: 'avslut', folder: 'Avslut' },
        ];

        const target = safeText(project?.projectNumber || project?.number || pid) || pid;
        const matchProjectFolder = (folderName) => {
          const name = safeText(folderName);
          if (!name) return false;
          const nameMatch = name.match(/^([A-Z]?[0-9]+(?:-[0-9]+)?)/);
          const nameId = nameMatch ? safeText(nameMatch[1]) : null;
          return nameId === target || name === target;
        };

        const walk = async (currentPath, depthLeft) => {
          if (depthLeft < 0) return null;
          if (openProjectTokenRef.current !== token) return null;

          const items = await getDriveItems(sid, currentPath).catch(() => []);
          for (const item of Array.isArray(items) ? items : []) {
            if (!item?.folder) continue;
            if (matchProjectFolder(item.name)) {
              const fullPath = currentPath ? `${currentPath}/${item.name}` : item.name;
              return safeText(fullPath);
            }
          }

          if (depthLeft === 0) return null;
          for (const item of Array.isArray(items) ? items : []) {
            if (!item?.folder) continue;
            const childPath = currentPath ? `${currentPath}/${item.name}` : item.name;
            const found = await walk(childPath, depthLeft - 1);
            if (found) return found;
          }
          return null;
        };

        for (const ph of phaseCandidates) {
          const found = await walk(ph.folder, 6);
          if (found) {
            return { path: found, phaseKey: ph.key };
          }
        }
      } catch (_e) {}

      return null;
    };

    // Hydrate SharePoint root folder path so folder loading becomes deterministic.
    // Order of preference:
    // 1) hierarchy-derived path (above)
    // 2) deterministic drive traversal (no Graph search endpoint)
    // 3) legacy searchDriveItems resolver
    if (!existingPath && cid) {
      try {
        const found = await resolveRootPathViaDriveTraversal();
        if (found?.path) {
          const derivedPhase = found.phaseKey || derivePhaseKeyFromProjectRootPath(found.path);
          project = {
            ...project,
            id: pid,
            siteId: existingSiteId || undefined,
            sharePointSiteId: existingSiteId || undefined,
            path: found.path,
            projectPath: found.path,
            rootFolderPath: found.path,
            phase: derivedPhase || project?.phase || DEFAULT_PHASE,
          };
          existingPath = safeText(found.path);
        }
      } catch (_e) {}
    }

    if (!existingPath && cid) {
      try {
        const siteId = existingSiteId || (await ensureSiteId());
        if (siteId) {
          const { resolveProjectRootFolderPath } = await import('../services/azure/fileService');
          const rootFolderPath = await resolveProjectRootFolderPath({
            siteId,
            projectNumber: safeText(project?.projectNumber || project?.number || project?.id || pid),
            projectName: safeText(project?.projectName || project?.name),
            fullName: safeText(project?.fullName),
          }).catch(() => null);

          if (rootFolderPath) {
            const derivedPhase = derivePhaseKeyFromProjectRootPath(rootFolderPath);
            project = {
              ...project,
              id: pid,
              siteId,
              sharePointSiteId: siteId,
              path: rootFolderPath,
              projectPath: rootFolderPath,
              rootFolderPath,
              phase: derivedPhase || project?.phase || DEFAULT_PHASE,
            };
          }
        }
      } catch (_e) {}
    } else if (existingPath) {
      try {
        const derivedPhase = derivePhaseKeyFromProjectRootPath(existingPath);
        project = {
          ...project,
          id: pid,
          phase: derivedPhase || project?.phase || DEFAULT_PHASE,
        };
      } catch (_e) {}
    }

    // Drop stale async results if user clicked another project.
    if (openProjectTokenRef.current !== token) return;

    requestProjectSwitch(project, {
      selectedAction,
      clearActionAfter,
      path: null,
    });
  }, [authClaims?.companyId, companyId, derivePhaseKeyFromProjectRootPath, hierarchyRef, isInlineLocked, requestProjectSwitch, routeCompanyId]);

  // Critical UX: never carry UI state (tab/folder) between projects.
  const prevSelectedProjectIdRef = React.useRef(null);
  React.useEffect(() => {
    const nextId = selectedProject?.id != null ? String(selectedProject.id) : null;
    const prevId = prevSelectedProjectIdRef.current;
    if (prevId === nextId) return;
    prevSelectedProjectIdRef.current = nextId;

    try {
      setPhaseActiveSection(null);
      setPhaseActiveItem(null);
      setPhaseActiveNode(null);
    } catch (_e) {}

    try {
      setAfRelativePath('');
      setAfSelectedItemId(null);
      setAfMirrorRefreshNonce((n) => n + 1);
    } catch (_e) {}

    try {
      setProjectSelectedAction(null);
      setInlineControlEditor(null);
      setProjectInlineViewLabel(null);
    } catch (_e) {}

    try {
      setProjectModuleRoute(null);
    } catch (_e) {}
  }, [selectedProject?.id, setProjectSelectedAction, setInlineControlEditor, setProjectInlineViewLabel]);

  React.useEffect(() => {
    // Only keep explorer state while AF is the active node.
    if (String(phaseActiveNode?.key || '') !== 'AF') {
      setAfRelativePath('');
      setAfSelectedItemId(null);
    }
  }, [phaseActiveNode?.key]);
  
  // Get project phase for phase navigation
  const projectPhase = selectedProject ? (() => {
    try {
      const phase = getProjectPhase(selectedProject);
      console.log('[HomeScreen] getProjectPhase result:', phase);
      return phase;
    } catch (_e) {
      console.error('[HomeScreen] Error getting project phase:', _e);
      return null;
    }
  })() : null;
  
  const projectPhaseKey = projectPhase?.key || null;
  console.log('[HomeScreen] projectPhaseKey:', projectPhaseKey, 'selectedProject:', selectedProject?.id);
  
  // Use phase navigation hook (will return null navigation if no phaseKey)
  const { navigation: phaseNavigation, isLoading: phaseNavigationLoading } = usePhaseNavigation(
    companyId,
    selectedProject?.id || null,
    projectPhaseKey,
    selectedProject || null
  );
  
  console.log('[HomeScreen] phaseNavigation hook result:', {
    hasNavigation: !!phaseNavigation,
    isLoading: phaseNavigationLoading,
    sectionsCount: phaseNavigation?.sections?.length || 0
  });
  
  // Initialize active section when navigation loads (Översikt should be active from start, but no item selected to show summary)
  React.useEffect(() => {
    if (phaseNavigation && phaseNavigation.sections && phaseNavigation.sections.length > 0 && !phaseActiveSection) {
      const firstSection = phaseNavigation.sections[0];
      setPhaseActiveSection(firstSection.id);
      // Don't auto-select first item - show section summary instead
      setPhaseActiveItem(null);
    }
  }, [phaseNavigation, phaseActiveSection]);

  // Ladda SharePoint-mappar (funktioner) för valt projekt
  useHomeProjectFolders({
    companyId,
    selectedProject,
    projectPhaseKey,
    setSelectedProjectFolders,
    setSelectedProjectFoldersLoading,
  });

  // Legacy phase dropdown removed - phases are now driven by SharePoint & project phases
  const phaseChangeSpinAnim = useRef(new Animated.Value(0)).current;

  // Träd-/mappinteraktioner (SharePoint-hierarkin) extraherade till useHomeTreeInteraction
  const {
    isCreatingMainFolder,
    setIsCreatingMainFolder,
    creatingSubFolderForMainId,
    setCreatingSubFolderForMainId,
    newSubFolderName,
    setNewSubFolderName,
    newMainFolderName,
    setNewMainFolderName,
    spinSub,
    setSpinSub,
    expandedSubs,
    setExpandedSubs,
    mainTimersRef,
    projektLongPressTimer,
    countProjectStatus: _countProjectStatus,
    handleToggleMainFolder,
    handleToggleSubFolder,
  } = useHomeTreeInteraction({ hierarchy, setHierarchy });
  
  const {
    sharePointStatus,
  } = useSharePointStatus({ companyId, searchSpinAnim });

  // Dashboard state and logic is handled by useDashboard hook

  // Listen for project updates emitted from ProjectDetails (or other screens)
  React.useEffect(() => {
    const unsub = onProjectUpdated((updatedProject) => {
      try {
        if (!updatedProject || !updatedProject.id) return;
        
        // Check if project ID changed
        const projectIdChanged = updatedProject._idChanged && updatedProject._oldId;
        const oldId = projectIdChanged ? String(updatedProject._oldId) : null;
        const newId = String(updatedProject.id);
        
        // Clean up temporary fields from updatedProject before using it
        const cleanUpdatedProject = { ...updatedProject };
        delete cleanUpdatedProject._oldId;
        delete cleanUpdatedProject._idChanged;
        
        setHierarchy((prev) => {
          const walk = (nodes) => {
            const next = (nodes || []).map((n) => {
              if (!n) return n;
              
              // If project ID changed, find project with old ID and replace it with new project
              if (projectIdChanged && oldId) {
                const nodeId = String(n.id || '');
                if (n.type === 'project' && nodeId === oldId) {
                  console.log('[HomeScreen] Found project with old ID in hierarchy, replacing with new ID:', oldId, '->', newId);
                  // Replace old project with new project (keeping children if they exist)
                  const newProject = { ...cleanUpdatedProject };
                  // Preserve children if the old project had any
                  if (n.children && Array.isArray(n.children)) {
                    newProject.children = n.children;
                  }
                  return newProject;
                }
              } else {
                // Normal update: find project with matching ID and update it
                if (n.type === 'project' && String(n.id) === newId) {
                  return Object.assign({}, n, cleanUpdatedProject);
                }
              }
              
              // Recursively walk children
              if (Array.isArray(n.children) && n.children.length > 0) {
                const newChildren = walk(n.children);
                if (newChildren !== n.children) {
                  return Object.assign({}, n, { children: newChildren });
                }
              }
              return n;
            });
            return next;
          };
          const newHierarchy = walk(prev || []);
          try { hierarchyRef.current = newHierarchy; } catch (_e) {}
          
          return newHierarchy;
        });

        // Update selectedProject if it matches the updated project
        // Handle case where project ID changed (old ID -> new ID)
        setSelectedProject((prev) => {
          if (!prev) return prev;
          
          // Check if this is the same project (by comparing IDs)
          const prevId = String(prev.id);
          const newId = String(updatedProject.id);
          
          // If IDs match, update the project
          if (prevId === newId) {
            return Object.assign({}, prev, updatedProject);
          }
          
          // If project ID changed, check if prev.id matches the old ID
          if (updatedProject._idChanged && updatedProject._oldId) {
            const oldId = String(updatedProject._oldId);
            if (prevId === oldId) {
              console.log('[HomeScreen] Project ID changed, updating selectedProject from', oldId, 'to', newId);
              // Update selectedProject with new ID
              const updated = Object.assign({}, updatedProject);
              delete updated._oldId; // Remove temporary fields
              delete updated._idChanged;
              return updated;
            }
          }
          
          return prev;
        });
      } catch (e) {
        console.warn('onProjectUpdated handler error', e);
      }
    });
    return () => { try { if (typeof unsub === 'function') unsub(); } catch(_) {} };
  }, []);

  // Keep ref in sync for popstate handler
  React.useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  // Close dashboard dropdowns when navigating into a project (avoid leaving overlays open)
  React.useEffect(() => {
    try {
      setDashboardFocus(null);
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
    } catch (e) {}
  }, [selectedProject]);

  // Handle simple project success modal close and navigation (uses data from useProjectCreation)
  const handleSimpleProjectSuccessClose = React.useCallback(() => {
    setSimpleProjectSuccessModal(false);
    const projectInfo = simpleProjectCreatedRef.current;
    simpleProjectCreatedRef.current = null;

    setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
    setNewProjectName('');
    setNewProjectNumber('');

    setTimeout(() => {
      if (!projectInfo) return;

      const findProjectInHierarchy = (tree, targetId) => {
        const findRecursive = (nodes, path = []) => {
          if (!Array.isArray(nodes)) return null;
          for (const node of nodes) {
            if (node && node.type === 'project' && String(node.id) === String(targetId)) {
              const pathInfo = path.length >= 2
                ? { mainId: path[path.length - 2]?.id, subId: path[path.length - 1]?.id, mainName: path[path.length - 2]?.name || '', subName: path[path.length - 1]?.name || '' }
                : path.length >= 1
                ? { mainId: path[path.length - 1]?.id, subId: null, mainName: path[path.length - 1]?.name || '', subName: '' }
                : { mainId: null, subId: null, mainName: '', subName: '' };
              return { project: node, ...pathInfo };
            }
            if (node && node.children && Array.isArray(node.children)) {
              const result = findRecursive(node.children, [...path, node]);
              if (result) return result;
            }
          }
          return null;
        };
        return findRecursive(tree || []);
      };

      const currentHierarchy = hierarchyRef.current || [];
      const found = findProjectInHierarchy(currentHierarchy, projectInfo.projectId);
      if (found && found.project) {
        requestProjectSwitch(found.project, {
          selectedAction: null,
          path: {
            mainId: String(found.mainId),
            subId: String(found.subId),
            mainName: found.mainName,
            subName: found.subName,
          },
        });
      }
    }, 100);
  }, [requestProjectSwitch]);

  // Recursively find project by ID - no assumptions about depth
  const findProjectById = React.useCallback((projectId) => {
    if (!projectId) return null;
    const targetId = String(projectId);
    try {
      const findRecursive = (nodes) => {
        if (!Array.isArray(nodes)) return null;
        for (const node of nodes) {
          if (node && node.type === 'project' && String(node.id) === targetId) {
            return node;
          }
          if (node && node.children && Array.isArray(node.children)) {
            const result = findRecursive(node.children);
            if (result) return result;
          }
        }
        return null;
      };
      return findRecursive(hierarchyRef.current || []);
    } catch(_e) {
      return null;
    }
  }, []);

  // Web-breadcrumb + browser-historik är nu extraherad till useHomeWebNavigation
  const { applyBreadcrumbTarget, navigateViaBreadcrumb } = useHomeWebNavigation({
    hierarchy,
    setHierarchy,
    hierarchyRef,
    selectedProject,
    selectedProjectPath,
    inlineControlEditor,
    projectInlineViewLabel,
    isInlineLocked,
    pendingBreadcrumbNavRef,
    requestProjectSwitch,
    openProject,
    setSelectedProject,
    setSelectedProjectPath,
    setInlineControlEditor,
    setProjectSelectedAction,
    projectModuleRoute,
    setProjectModuleRoute,
    findProjectById,
  });
  // Web-only: koordinera inline-editor och projektbyte via dkInlineExitDecision
  useHomeInlineBrowserIntegration({
    pendingProjectSwitchRef,
    pendingBreadcrumbNavRef,
    setProjectSelectedAction,
    requestProjectSwitch,
    applyBreadcrumbTarget,
  });

  // Dashboard time/metric helpers (toTsMs, formatRelativeTime,
  // computeOpenDeviationsCount, computeControlsToSign,
  // countActiveProjectsInHierarchy, countOpenDeviationsForControl)
  // importeras från components/common/Dashboard/dashboardUtils.

  // Dashboard loadDashboard is provided by useDashboard

  // Browser-historik (popstate/pushState) hanteras också i useHomeWebNavigation

  // Inloggnings-/activity-effekter flyttade till useHomeUserActivity ovan

  // Company profile + kontrolltyper är nu extraherade till useCompanyControlTypes
  const {
    companyProfile,
    controlTypeOptions,
  } = useCompanyControlTypes({ companyId });

  // Ny SharePoint-baserad projektmodal (CreateProjectModal)
  const {
    visible: createProjectVisible,
    isCreating: isCreatingProject,
    availableSites: createProjectSites,
    openModal: openCreateProjectModal,
    closeModal: closeCreateProjectModal,
    handleCreateProject,
  } = useCreateSharePointProjectModal({ companyId });

  // Dashboard: centralised state and logic
  const {
    dashboardLoading,
    dashboardOverview,
    dashboardRecentProjects,
    companyActivity,
    dashboardFocus,
    dashboardHoveredStatKey,
    dashboardActiveProjectsList,
    dashboardDraftItems,
    dashboardControlsToSignItems,
    dashboardOpenDeviationItems,
    dashboardUpcomingSkyddsrondItems,
    dashboardDropdownAnchor,
    dashboardDropdownTop,
    dashboardDropdownRowKey,
    dashboardBtn1Url,
    dashboardBtn2Url,
    dashboardBtn1Failed,
    dashboardBtn2Failed,
    dashboardCardLayoutRef,
    dashboardStatRowLayoutRef,
    setDashboardDropdownRowKey,
    setDashboardBtn1Failed,
    setDashboardBtn2Failed,
    setDashboardDropdownTop,
    setDashboardHoveredStatKey,
    setDashboardFocus,
    loadDashboard,
    toggleDashboardFocus,
  } = useDashboard({
    companyId,
    routeCompanyId,
    authClaims,
    currentUserId: auth?.currentUser?.uid || null,
    hierarchy,
    hierarchyRef,
    selectedProject,
    syncStatus,
    findProjectById,
  });

  // start background sync hook
  useBackgroundSync(companyId, { onStatus: (s) => setSyncStatus(s) });

  // Panel-bredd och resize-hantering (vänster/höger)
  const {
    leftWidth,
    rightWidth,
    panResponder,
    panResponderRight,
  } = useHomePaneResizing();

  // SharePoint-hierarki laddas nu via useSharePointHierarchy-hooken ovan

  // Visa migreringsknappen även om det finns lokala kontroller (completed/draft)
  React.useEffect(() => {
    (async () => {
      try {
        const completed = await AsyncStorage.getItem('completed_controls');
        const drafts = await AsyncStorage.getItem('draft_controls');
        if ((completed && completed !== '[]') || (drafts && drafts !== '[]')) {
          setLocalFallbackExists(true);
        }
      } catch(_e) {
        // ignore
      }
    })();
  }, []);
  // Sökpopup + keyboard/scroll hanteras nu av useHomeSearchAndScroll

  // Header search dropdown (between logos): search among created projects in hierarchy
  const {
    headerProjectQuery,
    headerSearchOpen,
    headerSearchWidth,
    headerSearchBottom,
    headerSearchLeft,
    headerProjectMatches,
    hoveredProjectId,
    setHoveredProjectId,
    dropdownAnim,
  } = useHomeHeaderProjectSearch({ route, navigation, hierarchy });

  // --- Safe-aliaser för render, så JSX aldrig kraschar på undefined ---
  const selectedProjectSafe = selectedProject ?? null;
  const projectPhaseKeySafe = projectPhaseKey ?? null;
  const hierarchySafe = Array.isArray(hierarchy) ? hierarchy : [];
  const selectedProjectFoldersSafe = Array.isArray(selectedProjectFolders) ? selectedProjectFolders : [];
  const selectedProjectFoldersLoadingSafe = Boolean(selectedProjectFoldersLoading);
  const controlTypeOptionsSafe = Array.isArray(controlTypeOptions) ? controlTypeOptions : [];
  const projectStatusFilterSafe = projectStatusFilter || 'all';

  // Toggle main folder expansion (legacy hierarchy "expanded" flag, used by mobile ProjectTree and breadcrumbs)
  // Web: right-click context menu for folder tree
  const {
    contextMenu,
    contextMenuItems,
    handleContextMenuSelect,
    closeContextMenu,
    hoveredRowKey,
    setHoveredRowKey,
    getRowKey,
    openContextMenu,
  } = useTreeContextMenu({
    hierarchy,
    setHierarchy,
    companyId,
    routeCompanyId,
    authClaims,
    controlTypeOptions,
    requestProjectSwitch,
    setSimpleProjectModal,
    setNewProjectName,
    setNewProjectNumber,
    setNewProjectModal,
    setIsCreatingMainFolder,
    setNewMainFolderName,
    handleToggleMainFolder,
    setCreatingSubFolderForMainId,
    setNewSubFolderName,
    setProjectControlSelectedType,
    setProjectControlTypePickerOpen,
    setProjectControlTemplates,
    setProjectControlSelectedTemplateId,
    setProjectControlTemplatePickerOpen,
    setProjectControlTemplateSearch,
    setProjectControlModal,
  });

  // Handle project function selection
  // Now supports both hardcoded functions and SharePoint folders
  const handleSelectFunction = (project, functionItem) => {
    // If function has SharePoint webUrl, open it directly
    if (functionItem.webUrl && Platform.OS === 'web') {
      try {
        window.open(functionItem.webUrl, '_blank');
        return;
      } catch (error) {
        console.error('[HomeScreen] Error opening SharePoint folder:', error);
      }
    }
    
    const functionType = functionItem.functionType;
    
    switch (functionType) {
      case 'handlingar':
        // Öppna projektet med fokus på kontroller
        requestProjectSwitch(project, { 
          selectedAction: { 
            kind: 'showControls',
            functionType: 'handlingar',
            sharePointPath: functionItem.sharePointPath || functionItem.path,
            webUrl: functionItem.webUrl,
          } 
        });
        break;
        
      case 'overblick':
        // För eftermarknad: visa projektöversikt med alla projektfält
        requestProjectSwitch(project, { 
          selectedAction: { 
            kind: 'overblick',
            sharePointPath: functionItem.sharePointPath || functionItem.path,
            webUrl: functionItem.webUrl,
          } 
        });
        break;
        
      case 'ritningar':
        // Open SharePoint folder for ritningar, or navigate to ritningar-screen
        if (functionItem.webUrl && Platform.OS === 'web') {
          try {
            window.open(functionItem.webUrl, '_blank');
          } catch (_e) {
            showAlert('Info', 'Ritningar-funktionen kommer snart!');
          }
        } else {
          showAlert('Info', 'Ritningar-funktionen kommer snart!');
        }
        break;
        
      case 'moten':
        // Open SharePoint folder for möten, or navigate to möten-screen
        if (functionItem.webUrl && Platform.OS === 'web') {
          try {
            window.open(functionItem.webUrl, '_blank');
          } catch (_e) {
            showAlert('Info', 'Möten-funktionen kommer snart!');
          }
        } else {
          showAlert('Info', 'Möten-funktionen kommer snart!');
        }
        break;
        
      case 'forfragningsunderlag':
        // Open SharePoint folder for förfrågningsunderlag
        if (functionItem.webUrl && Platform.OS === 'web') {
          try {
            window.open(functionItem.webUrl, '_blank');
          } catch (_e) {
            showAlert('Info', 'Förfrågningsunderlag-funktionen kommer snart!');
          }
        } else {
          showAlert('Info', 'Förfrågningsunderlag-funktionen kommer snart!');
        }
        break;
        
      case 'kma':
        // Open SharePoint folder for KMA, or navigate to KMA-screen
        if (functionItem.webUrl && Platform.OS === 'web') {
          try {
            window.open(functionItem.webUrl, '_blank');
          } catch (_e) {
            showAlert('Info', 'KMA-funktionen kommer snart!');
          }
        } else {
          showAlert('Info', 'KMA-funktionen kommer snart!');
        }
        break;
        
      default:
        // For unknown function types, try to open SharePoint folder if available
        if (functionItem.webUrl && Platform.OS === 'web') {
          try {
            window.open(functionItem.webUrl, '_blank');
          } catch (_e) {
            showAlert('Info', `Funktionen "${functionItem.name}" öppnas i SharePoint.`);
          }
        } else {
          showAlert('Info', `Funktionen "${functionItem.name}" kommer snart!`);
        }
        // Fallback: öppna projektet normalt
        requestProjectSwitch(project, { selectedAction: null });
    }
  };

    // Dashboard-aktivitetsvy är nu extraherad till components/common/Dashboard/DashboardActivity.


  return (
    <View style={{ flex: 1 }}>
      {/* App-only: filter modal */}

      {/* Sök-popup/modal */}
      <SearchProjectModal
        visible={searchModalVisible}
        searchText={searchText}
        onSearchTextChange={setSearchText}
        onClose={closeSearchModal}
        hierarchy={hierarchy}
        windowHeight={windowHeight}
        keyboardHeight={keyboardHeight}
        requestProjectSwitch={requestProjectSwitch}
        navigation={navigation}
        companyId={companyId}
      />
      <NewProjectModal
        visible={newProjectModal.visible}
        parentSubId={newProjectModal.parentSubId}
        onClose={() => {
          setNewProjectModal({ visible: false, parentSubId: null });
        }}
        // Project form fields
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        newProjectNumber={newProjectNumber}
        setNewProjectNumber={setNewProjectNumber}
        newProjectPhase={newProjectPhase}
        setNewProjectPhase={setNewProjectPhase}
        newProjectCustomer={newProjectCustomer}
        setNewProjectCustomer={setNewProjectCustomer}
        newProjectClientContactName={newProjectClientContactName}
        setNewProjectClientContactName={setNewProjectClientContactName}
        newProjectClientContactPhone={newProjectClientContactPhone}
        setNewProjectClientContactPhone={setNewProjectClientContactPhone}
        newProjectClientContactEmail={newProjectClientContactEmail}
        setNewProjectClientContactEmail={setNewProjectClientContactEmail}
        newProjectAddressStreet={newProjectAddressStreet}
        setNewProjectAddressStreet={setNewProjectAddressStreet}
        newProjectAddressPostal={newProjectAddressPostal}
        setNewProjectAddressPostal={setNewProjectAddressPostal}
        newProjectAddressCity={newProjectAddressCity}
        setNewProjectAddressCity={setNewProjectAddressCity}
        newProjectPropertyDesignation={newProjectPropertyDesignation}
        setNewProjectPropertyDesignation={setNewProjectPropertyDesignation}
        newProjectParticipantsSearch={newProjectParticipantsSearch}
        setNewProjectParticipantsSearch={setNewProjectParticipantsSearch}
        newProjectAdvancedOpen={newProjectAdvancedOpen}
        setNewProjectAdvancedOpen={setNewProjectAdvancedOpen}
        // Responsible and participants
        newProjectResponsible={newProjectResponsible}
        setNewProjectResponsible={setNewProjectResponsible}
        responsiblePickerVisible={responsiblePickerVisible}
        setResponsiblePickerVisible={setResponsiblePickerVisible}
        newProjectParticipants={newProjectParticipants}
        setNewProjectParticipants={setNewProjectParticipants}
        participantsPickerVisible={participantsPickerVisible}
        setParticipantsPickerVisible={setParticipantsPickerVisible}
        // Company data
        companyAdmins={companyAdmins}
        loadingCompanyAdmins={loadingCompanyAdmins}
        companyAdminsPermissionDenied={companyAdminsPermissionDenied}
        companyMembers={companyMembers}
        loadingCompanyMembers={loadingCompanyMembers}
        companyMembersPermissionDenied={companyMembersPermissionDenied}
        loadCompanyAdmins={loadCompanyAdmins}
        // Skyddsrond fields
        newProjectSkyddsrondEnabled={newProjectSkyddsrondEnabled}
        setNewProjectSkyddsrondEnabled={setNewProjectSkyddsrondEnabled}
        newProjectSkyddsrondWeeks={newProjectSkyddsrondWeeks}
        setNewProjectSkyddsrondWeeks={setNewProjectSkyddsrondWeeks}
        newProjectSkyddsrondFirstDueDate={newProjectSkyddsrondFirstDueDate}
        setNewProjectSkyddsrondFirstDueDate={setNewProjectSkyddsrondFirstDueDate}
        newProjectSkyddsrondFirstDueValid={newProjectSkyddsrondFirstDueValid}
        skyddsrondWeeksPickerVisible={skyddsrondWeeksPickerVisible}
        setSkyddsrondWeeksPickerVisible={setSkyddsrondWeeksPickerVisible}
        // Form state
        creatingProject={creatingProject}
        setCreatingProject={setCreatingProject}
        focusedInput={focusedInput}
        setFocusedInput={setFocusedInput}
        hoveredSkyddsrondBtn={hoveredSkyddsrondBtn}
        setHoveredSkyddsrondBtn={setHoveredSkyddsrondBtn}
        responsibleDropdownOpen={responsibleDropdownOpen}
        setResponsibleDropdownOpen={setResponsibleDropdownOpen}
        newProjectKeyboardLockHeight={newProjectKeyboardLockHeight}
        setNewProjectKeyboardLockHeight={setNewProjectKeyboardLockHeight}
        // Callbacks and functions
        resetProjectFields={resetProjectFields}
        isProjectNumberUnique={isProjectNumberUnique}
        canCreateProject={canCreateProject}
        setHierarchy={setHierarchy}
        currentHierarchy={hierarchy}
        onProjectCreated={({ projectId, projectName, mainId, subId }) => {
          // Find the created project in hierarchy and open it
          const findProjectInHierarchy = (hierarchy, targetId) => {
            for (const main of hierarchy || []) {
              for (const sub of main.children || []) {
                for (const project of sub.children || []) {
                  if (project.type === 'project' && String(project.id) === String(targetId)) {
                    return {
                      project,
                      mainId: main.id,
                      subId: sub.id,
                      mainName: main.name || '',
                      subName: sub.name || ''
                    };
                  }
                }
              }
            }
            return null;
          };

          // Wait a bit for hierarchy to update, then find and open project
          setTimeout(() => {
            const found = findProjectInHierarchy(hierarchy, projectId);
            if (found && found.project) {
              requestProjectSwitch(found.project, {
                selectedAction: null,
                path: {
                  mainId: String(found.mainId),
                  subId: String(found.subId),
                  mainName: found.mainName,
                  subName: found.subName
                }
              });
            }
          }, 100);
        }}
        // Platform and environment
        isBrowserEnv={isBrowserEnv}
        windowWidth={windowWidth}
        nativeKeyboardHeight={nativeKeyboardHeight}
        nativeKeyboardHeightRef={nativeKeyboardHeightRef}
      />
      
      {/* Simple Project Modal for Kalkylskede */}
      <SimpleProjectModal
        visible={simpleProjectModal.visible}
        newProjectNumber={newProjectNumber}
        setNewProjectNumber={setNewProjectNumber}
        newProjectName={newProjectName}
        setNewProjectName={setNewProjectName}
        canCreateSimpleProject={canCreateSimpleProject}
        creatingProject={creatingProject}
        isProjectNumberUnique={isProjectNumberUnique}
        onSubmit={handleCreateSimpleProject}
        onRequestClose={() => {
          setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
          setNewProjectName('');
          setNewProjectNumber('');
        }}
      />

      {/* Simple Project Loading Modal */}
      <SimpleProjectLoadingModal visible={creatingProject && simpleProjectModal.visible} />

      {/* Simple Project Success Modal */}
      <SimpleProjectSuccessModal
        visible={simpleProjectSuccessModal}
        project={simpleProjectCreatedRef.current}
        onClose={handleSimpleProjectSuccessClose}
      />

      {/* Ny SharePoint-baserad "Skapa projekt"-modal för dashboard-knappen */}
      <CreateProjectModal
        visible={createProjectVisible}
        onClose={closeCreateProjectModal}
        availableSites={createProjectSites}
        onCreateProject={handleCreateProject}
        isCreating={isCreatingProject}
        companyId={companyId}
      />
      
      {(() => {
        const RootContainer = ImageBackground;
        const rootContainerProps = {
          source: require('../assets/images/inlogg.webb.png'),
          resizeMode: 'cover',
          imageStyle: { width: '100%', height: '100%' },
        };

        return (
          <RootContainer
            {...rootContainerProps}
            style={{
              flex: 1,
              width: '100%',
              ...(Platform.OS === 'web'
                ? {
                    minHeight: 0,
                    height: '100vh',
                    overflow: 'hidden',
                  }
                : {}),
            }}
          >
              <View
                style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 0 }}
              />

            <HeaderSearchDropdown
              headerProjectQuery={headerProjectQuery}
              headerSearchOpen={headerSearchOpen}
              headerSearchBottom={headerSearchBottom}
              headerSearchLeft={headerSearchLeft}
              headerSearchWidth={headerSearchWidth}
              headerProjectMatches={headerProjectMatches}
              hoveredProjectId={hoveredProjectId}
              setHoveredProjectId={setHoveredProjectId}
              dropdownAnim={dropdownAnim}
              navigation={navigation}
              requestProjectSwitch={requestProjectSwitch}
              createPortal={createPortal}
              portalRootId={portalRootId}
            />

            {Platform.OS === 'web' ? (
              <View style={{ flex: 1, backgroundColor: 'transparent', minHeight: 0, overflow: 'hidden' }}>
                {/* Header */}
                <HomeHeader
                  headerHeight={headerHeight}
                  setHeaderHeight={setHeaderHeight}
                  navigation={navigation}
                  route={route}
                  auth={auth}
                  selectedProject={selectedProjectSafe}
                  isSuperAdmin={isSuperAdmin}
                  allowedTools={allowedTools}
                  showHeaderUserMenu={showHeaderUserMenu}
                  canShowSupportToolsInHeader={canShowSupportToolsInHeader}
                  supportMenuOpen={supportMenuOpen}
                  setSupportMenuOpen={setSupportMenuOpen}
                  companyId={companyId}
                  routeCompanyId={routeCompanyId}
                  showAdminButton={showAdminButton}
                  adminActionRunning={adminActionRunning}
                  localFallbackExists={localFallbackExists}
                  handleMakeDemoAdmin={handleMakeDemoAdmin}
                  refreshLocalFallbackFlag={refreshLocalFallbackFlag}
                  dumpLocalRemoteControls={dumpLocalRemoteControls}
                  showLastFsError={showLastFsError}
                  saveControlToFirestore={saveControlToFirestore}
                  saveDraftToFirestore={saveDraftToFirestore}
                  searchSpinAnim={searchSpinAnim}
                  sharePointStatus={sharePointStatus}
                  userNotifications={userNotifications}
                  notificationsUnreadCount={notificationsUnreadCount}
                  notificationsError={notificationsError}
                  formatRelativeTime={formatRelativeTime}
                />

                {/* Web: scroll ägs av HomeMainPaneContainer/WebMainPane (inte här) */}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'stretch', minHeight: 0, minWidth: 0 }}>
                  <SharePointLeftPanel
                    leftWidth={leftWidth}
                    webPaneHeight={webPaneHeight}
                    panResponder={panResponder}
                    spinSidebarHome={spinSidebarHome}
                    spinSidebarRefresh={spinSidebarRefresh}
                    onPressHome={() => {
                      setSpinSidebarHome((n) => n + 1);
                      if (selectedProject) closeSelectedProject();
                    }}
                    onPressRefresh={() => {
                      setSpinSidebarRefresh((n) => n + 1);
                      // Tvinga om-laddning av SharePoint-hierarkin
                      try { setHierarchyReloadKey((k) => k + 1); } catch (_e) {}

                      if (selectedProject) {
                        setProjectControlsRefreshNonce((n) => n + 1);
                      } else {
                        try { loadDashboard(); } catch(_e) {}
                      }
                    }}
                    leftTreeScrollRef={leftTreeScrollRef}
                    selectedProject={selectedProjectSafe}
                    projectPhaseKey={projectPhaseKeySafe}
                    phaseNavigation={phaseNavigation}
                    phaseNavigationLoading={phaseNavigationLoading}
                    selectedProjectFolders={selectedProjectFoldersSafe}
                    selectedProjectFoldersLoading={selectedProjectFoldersLoadingSafe}
                    navigation={navigation}
                    companyId={companyId}
                    reloadKey={hierarchyReloadKey}
                    handleSelectFunction={handleSelectFunction}
                    projectStatusFilter={projectStatusFilterSafe}
                    loadingHierarchy={loadingHierarchy}
                    phaseChangeSpinAnim={phaseChangeSpinAnim}
                    hierarchy={hierarchy}
                    expandedSubs={expandedSubs}
                    spinSub={spinSub}
                    handleToggleSubFolder={handleToggleSubFolder}
                    setHierarchy={setHierarchy}
                    contextMenu={contextMenu}
                    contextMenuItems={contextMenuItems}
                    handleContextMenuSelect={handleContextMenuSelect}
                    closeContextMenu={closeContextMenu}
                    syncStatus={syncStatus}
                    appVersion={appVersion}
                    buildStamp={typeof BUILD_STAMP !== 'undefined' ? BUILD_STAMP : null}
                    scrollToEndSafe={scrollToEndSafe}
                    createPortal={createPortal}
                    onSelectProject={(projectData) => {
                      try {
                        if (!projectData || !projectData.id) {
                          console.warn('[HomeScreen] Invalid projectData in onSelectProject:', projectData);
                          return;
                        }

                        const project = {
                          id: projectData.id,
                          name: projectData.name || projectData.fullName || projectData.id,
                          phase: projectData.phase || DEFAULT_PHASE,
                          ...projectData,
                        };

                        openProject(project, { selectedAction: null });
                      } catch (error) {
                        console.error('[HomeScreen] Error in onSelectProject callback:', error);
                      }
                    }}
                    onOpenPhaseItem={(sectionId, itemId, meta) => {
                      try {
                        const sid = String(sectionId || '').trim();
                        const iid = String(itemId || '').trim();

                        const normalizeOfferterItemId = (raw) => {
                          const v = String(raw || '').trim();
                          if (!v) return 'forfragningar';
                          if (v === 'inkomna-offerter' || v === '02-offerter' || v === '02_offerter') return 'offerter';
                          return v;
                        };

                        // Offerter is a standalone project module (not a kalkylskede subsection).
                        if (sid === 'offerter') {
                          const nextItem = normalizeOfferterItemId(iid || 'forfragningar');
                          setProjectModuleRoute({ moduleId: 'offerter', itemId: nextItem });
                          setPhaseActiveSection('offerter');
                          setPhaseActiveItem(nextItem);
                          setPhaseActiveNode(null);
                          return;
                        }

                        // FFU: AI-sammanställning is a system view under Förfrågningsunderlag.
                        // It must NOT be treated as a folder, and must have its own route/view.
                        if (sid === 'forfragningsunderlag' && iid === 'ai-summary') {
                          setProjectModuleRoute({ moduleId: 'ffu-ai-summary' });
                          setPhaseActiveSection('forfragningsunderlag');
                          setPhaseActiveItem('ai-summary');
                          setPhaseActiveNode(null);
                          return;
                        }

                        // Any other phase section -> clear module route.
                        setProjectModuleRoute(null);
                        setPhaseActiveSection(sid || null);
                        setPhaseActiveItem(iid || null);
                        if (meta && Object.prototype.hasOwnProperty.call(meta, 'activeNode')) {
                          setPhaseActiveNode(meta.activeNode || null);
                        } else if (!iid) {
                          setPhaseActiveNode(null);
                        }
                      } catch (_e) {}
                    }}

                    phaseActiveSection={phaseActiveSection}
                    phaseActiveItem={phaseActiveItem}
                    phaseActiveNode={phaseActiveNode}

                    // AF-only folder mirror state
                    afRelativePath={afRelativePath}
                    onAfRelativePathChange={setAfRelativePath}
                    afSelectedItemId={afSelectedItemId}
                    onAfSelectedItemIdChange={setAfSelectedItemId}
                    afMirrorRefreshNonce={afMirrorRefreshNonce}
                  />

                  <HomeMainPaneContainer
                    webPaneHeight={webPaneHeight}
                    rightPaneScrollRef={rightPaneScrollRef}
                    activityScrollRef={activityScrollRef}
                    inlineControlEditor={inlineControlEditor}
                    closeInlineControlEditor={closeInlineControlEditor}
                    handleInlineControlFinished={handleInlineControlFinished}
                    creatingProjectInline={creatingProjectInline}
                    selectedProject={selectedProject}
                    selectedProjectSafe={selectedProjectSafe}
                    auth={auth}
                    creatingProject={creatingProject}
                    newProjectNumber={newProjectNumber}
                    setNewProjectNumber={setNewProjectNumber}
                    newProjectName={newProjectName}
                    setNewProjectName={setNewProjectName}
                    hierarchy={hierarchy}
                    hierarchySafe={hierarchySafe}
                    setHierarchy={setHierarchy}
                    resetProjectFields={resetProjectFields}
                    requestProjectSwitch={requestProjectSwitch}
                    openProject={openProject}
                    selectedProjectPath={selectedProjectPath}
                    setCreatingProject={setCreatingProject}
                    setCreatingProjectInline={setCreatingProjectInline}
                    setSelectedProject={setSelectedProject}
                    setSelectedProjectPath={setSelectedProjectPath}
                    isProjectNumberUnique={isProjectNumberUnique}
                    projectSelectedAction={projectSelectedAction}
                    handleInlineLockChange={handleInlineLockChange}
                    handleInlineViewChange={handleInlineViewChange}
                    projectControlsRefreshNonce={projectControlsRefreshNonce}
                    navigation={navigation}
                    toggleDashboardFocus={toggleDashboardFocus}
                    closeSelectedProject={closeSelectedProject}
                    dashboardFocus={dashboardFocus}
                    setDashboardFocus={setDashboardFocus}
                    dashboardDropdownTop={dashboardDropdownTop}
                    setDashboardDropdownTop={setDashboardDropdownTop}
                    dashboardHoveredStatKey={dashboardHoveredStatKey}
                    setDashboardHoveredStatKey={setDashboardHoveredStatKey}
                    dashboardDropdownAnchor={dashboardDropdownAnchor}
                    dashboardDropdownRowKey={dashboardDropdownRowKey}
                    setDashboardDropdownRowKey={setDashboardDropdownRowKey}
                    dashboardLoading={dashboardLoading}
                    dashboardOverview={dashboardOverview}
                    dashboardRecentProjects={dashboardRecentProjects}
                    companyActivity={companyActivity}
                    dashboardActiveProjectsList={dashboardActiveProjectsList}
                    dashboardDraftItems={dashboardDraftItems}
                    dashboardControlsToSignItems={dashboardControlsToSignItems}
                    dashboardOpenDeviationItems={dashboardOpenDeviationItems}
                    dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
                    dashboardBtn1Url={dashboardBtn1Url}
                    dashboardBtn2Url={dashboardBtn2Url}
                    dashboardBtn1Failed={dashboardBtn1Failed}
                    dashboardBtn2Failed={dashboardBtn2Failed}
                    setDashboardBtn1Failed={setDashboardBtn1Failed}
                    setDashboardBtn2Failed={setDashboardBtn2Failed}
                    dashboardCardLayoutRef={dashboardCardLayoutRef}
                    dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
                    formatRelativeTime={formatRelativeTime}
                    findProjectById={findProjectById}
                    _countProjectStatus={_countProjectStatus}
                    companyProfile={companyProfile}
                    companyId={companyId}
                    routeCompanyId={routeCompanyId}
                    setNewProjectModal={setNewProjectModal}
                    scrollToEndSafe={scrollToEndSafe}
                    rightWidth={rightWidth}
                    panResponderRight={panResponderRight}
                    projectPhaseKeySafe={projectPhaseKeySafe}
                    phaseActiveSection={phaseActiveSection}
                    phaseActiveItem={phaseActiveItem}
                    phaseActiveNode={phaseActiveNode}
                    setPhaseActiveSection={setPhaseActiveSection}
                    setPhaseActiveItem={setPhaseActiveItem}
                    setPhaseActiveNode={setPhaseActiveNode}
                    onOpenCreateProjectModal={openCreateProjectModal}

                    // AF-only explorer state shared with left panel
                    afRelativePath={afRelativePath}
                    setAfRelativePath={setAfRelativePath}
                    afSelectedItemId={afSelectedItemId}
                    setAfSelectedItemId={setAfSelectedItemId}
                    bumpAfMirrorRefreshNonce={() => setAfMirrorRefreshNonce((n) => n + 1)}

                    projectModuleRoute={projectModuleRoute}
                  />
                </View>
              </View>
            ) : (
              <View style={{ flex: 1, backgroundColor: 'transparent', minHeight: 0 }}>
                {/* Header (always visible) */}
                <HomeHeader
                  headerHeight={headerHeight}
                  setHeaderHeight={setHeaderHeight}
                  navigation={navigation}
                  route={route}
                  auth={auth}
                  selectedProject={selectedProjectSafe}
                  isSuperAdmin={isSuperAdmin}
                  allowedTools={allowedTools}
                  showHeaderUserMenu={showHeaderUserMenu}
                  canShowSupportToolsInHeader={canShowSupportToolsInHeader}
                  supportMenuOpen={supportMenuOpen}
                  setSupportMenuOpen={setSupportMenuOpen}
                  companyId={companyId}
                  routeCompanyId={routeCompanyId}
                  showAdminButton={showAdminButton}
                  adminActionRunning={adminActionRunning}
                  localFallbackExists={localFallbackExists}
                  handleMakeDemoAdmin={handleMakeDemoAdmin}
                  refreshLocalFallbackFlag={refreshLocalFallbackFlag}
                  dumpLocalRemoteControls={dumpLocalRemoteControls}
                  showLastFsError={showLastFsError}
                  saveControlToFirestore={saveControlToFirestore}
                  saveDraftToFirestore={saveDraftToFirestore}
                  searchSpinAnim={searchSpinAnim}
                  sharePointStatus={sharePointStatus}
                  userNotifications={userNotifications}
                  notificationsUnreadCount={notificationsUnreadCount}
                  notificationsError={notificationsError}
                  formatRelativeTime={formatRelativeTime}
                />

                {/* Allt under headern är skrollbart */}
                <ScrollView
                  style={{ flex: 1, backgroundColor: 'transparent' }}
                  scrollEnabled={scrollEnabled}
                  contentContainerStyle={{ flexGrow: 1, paddingBottom: DK_MIDDLE_PANE_BOTTOM_GUTTER }}
                >
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            <SharePointLeftPanel
              leftWidth={leftWidth}
              webPaneHeight={webPaneHeight}
              panResponder={panResponder}
              spinSidebarHome={spinSidebarHome}
              spinSidebarRefresh={spinSidebarRefresh}
              onPressHome={() => {
                setSpinSidebarHome((n) => n + 1);
                if (selectedProject) closeSelectedProject();
              }}
              onPressRefresh={() => {
                setSpinSidebarRefresh((n) => n + 1);
                // Tvinga om-laddning av SharePoint-hierarkin
                try { setHierarchyReloadKey((k) => k + 1); } catch (_e) {}

                if (selectedProject) {
                  setProjectControlsRefreshNonce((n) => n + 1);
                } else {
                  try { loadDashboard(); } catch(_e) {}
                }
              }}
              leftTreeScrollRef={leftTreeScrollRef}
              selectedProject={selectedProjectSafe}
              projectPhaseKey={projectPhaseKeySafe}
              phaseNavigation={phaseNavigation}
              phaseNavigationLoading={phaseNavigationLoading}
              selectedProjectFolders={selectedProjectFoldersSafe}
              selectedProjectFoldersLoading={selectedProjectFoldersLoadingSafe}
              navigation={navigation}
              companyId={companyId}
              reloadKey={hierarchyReloadKey}
              handleSelectFunction={handleSelectFunction}
              projectStatusFilter={projectStatusFilterSafe}
              loadingHierarchy={loadingHierarchy}
              phaseChangeSpinAnim={phaseChangeSpinAnim}
              hierarchy={hierarchy}
              expandedSubs={expandedSubs}
              spinSub={spinSub}
              handleToggleSubFolder={handleToggleSubFolder}
              setHierarchy={setHierarchy}
              contextMenu={contextMenu}
              contextMenuItems={contextMenuItems}
              handleContextMenuSelect={handleContextMenuSelect}
              closeContextMenu={closeContextMenu}
              syncStatus={syncStatus}
              appVersion={appVersion}
              buildStamp={typeof BUILD_STAMP !== 'undefined' ? BUILD_STAMP : null}
              scrollToEndSafe={scrollToEndSafe}
              createPortal={createPortal}
              onSelectProject={(projectData) => {
                try {
                  if (!projectData || !projectData.id) {
                    console.warn('[HomeScreen] Invalid projectData in onSelectProject:', projectData);
                    return;
                  }
                  
                  // Convert projectData to format expected by requestProjectSwitch
                  const project = {
                    id: projectData.id,
                    name: projectData.name || projectData.fullName || projectData.id,
                    phase: projectData.phase || DEFAULT_PHASE,
                    ...projectData,
                  };
                  
                  openProject(project, { selectedAction: null });
                } catch (error) {
                  console.error('[HomeScreen] Error in onSelectProject callback:', error);
                }
              }}
              onOpenPhaseItem={(sectionId, itemId, meta) => {
                try {
                  setPhaseActiveSection(sectionId || null);
                  setPhaseActiveItem(itemId || null);
                  if (meta && Object.prototype.hasOwnProperty.call(meta, 'activeNode')) {
                    setPhaseActiveNode(meta.activeNode || null);
                  } else if (!itemId) {
                    setPhaseActiveNode(null);
                  }
                } catch (_e) {}
              }}
              phaseActiveSection={phaseActiveSection}
              phaseActiveItem={phaseActiveItem}
              phaseActiveNode={phaseActiveNode}

              // AF-only folder mirror state
              afRelativePath={afRelativePath}
              onAfRelativePathChange={setAfRelativePath}
              afSelectedItemId={afSelectedItemId}
              onAfSelectedItemIdChange={setAfSelectedItemId}
              afMirrorRefreshNonce={afMirrorRefreshNonce}
            />

            <HomeMainPaneContainer
                    authClaims={authClaims}
              webPaneHeight={webPaneHeight}
              rightPaneScrollRef={rightPaneScrollRef}
              activityScrollRef={activityScrollRef}
              inlineControlEditor={inlineControlEditor}
              closeInlineControlEditor={closeInlineControlEditor}
              handleInlineControlFinished={handleInlineControlFinished}
              creatingProjectInline={creatingProjectInline}
              selectedProject={selectedProject}
              selectedProjectSafe={selectedProjectSafe}
              auth={auth}
              creatingProject={creatingProject}
              newProjectNumber={newProjectNumber}
              setNewProjectNumber={setNewProjectNumber}
              newProjectName={newProjectName}
              setNewProjectName={setNewProjectName}
              hierarchy={hierarchy}
              hierarchySafe={hierarchySafe}
              setHierarchy={setHierarchy}
              resetProjectFields={resetProjectFields}
              requestProjectSwitch={requestProjectSwitch}
              openProject={openProject}
              selectedProjectPath={selectedProjectPath}
              setCreatingProject={setCreatingProject}
              setCreatingProjectInline={setCreatingProjectInline}
              setSelectedProject={setSelectedProject}
              setSelectedProjectPath={setSelectedProjectPath}
              isProjectNumberUnique={isProjectNumberUnique}
              projectSelectedAction={projectSelectedAction}
              handleInlineLockChange={handleInlineLockChange}
              handleInlineViewChange={handleInlineViewChange}
              projectControlsRefreshNonce={projectControlsRefreshNonce}
              navigation={navigation}
              toggleDashboardFocus={toggleDashboardFocus}
              closeSelectedProject={closeSelectedProject}
              dashboardFocus={dashboardFocus}
              setDashboardFocus={setDashboardFocus}
              dashboardDropdownTop={dashboardDropdownTop}
              setDashboardDropdownTop={setDashboardDropdownTop}
              dashboardHoveredStatKey={dashboardHoveredStatKey}
              setDashboardHoveredStatKey={setDashboardHoveredStatKey}
              dashboardDropdownAnchor={dashboardDropdownAnchor}
              dashboardDropdownRowKey={dashboardDropdownRowKey}
              setDashboardDropdownRowKey={setDashboardDropdownRowKey}
              dashboardLoading={dashboardLoading}
              dashboardOverview={dashboardOverview}
              dashboardRecentProjects={dashboardRecentProjects}
              companyActivity={companyActivity}
              dashboardActiveProjectsList={dashboardActiveProjectsList}
              dashboardDraftItems={dashboardDraftItems}
              dashboardControlsToSignItems={dashboardControlsToSignItems}
              dashboardOpenDeviationItems={dashboardOpenDeviationItems}
              dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
              dashboardBtn1Url={dashboardBtn1Url}
              dashboardBtn2Url={dashboardBtn2Url}
              dashboardBtn1Failed={dashboardBtn1Failed}
              dashboardBtn2Failed={dashboardBtn2Failed}
              setDashboardBtn1Failed={setDashboardBtn1Failed}
              setDashboardBtn2Failed={setDashboardBtn2Failed}
              dashboardCardLayoutRef={dashboardCardLayoutRef}
              dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
              formatRelativeTime={formatRelativeTime}
              findProjectById={findProjectById}
              _countProjectStatus={_countProjectStatus}
              companyProfile={companyProfile}
              companyId={companyId}
              routeCompanyId={routeCompanyId}
              setNewProjectModal={setNewProjectModal}
              scrollToEndSafe={scrollToEndSafe}
              rightWidth={rightWidth}
              panResponderRight={panResponderRight}
              projectPhaseKeySafe={projectPhaseKeySafe}
              phaseActiveSection={phaseActiveSection}
              phaseActiveItem={phaseActiveItem}
              phaseActiveNode={phaseActiveNode}
              setPhaseActiveSection={setPhaseActiveSection}
              setPhaseActiveItem={setPhaseActiveItem}
              setPhaseActiveNode={setPhaseActiveNode}
              onOpenCreateProjectModal={openCreateProjectModal}

              // AF-only explorer state shared with left panel
              afRelativePath={afRelativePath}
              setAfRelativePath={setAfRelativePath}
              afSelectedItemId={afSelectedItemId}
              setAfSelectedItemId={setAfSelectedItemId}
              bumpAfMirrorRefreshNonce={() => setAfMirrorRefreshNonce((n) => n + 1)}
            />
          </View>
        ) : null}
          {/* Uppgifter-sektion + Skapa kontroll-knapp och popup för val av kontrolltyp */}
          <HomeTasksSection
            controlTypeOptions={controlTypeOptionsSafe}
            companyProfile={companyProfile}
            tasksOpen={tasksOpen}
            setTasksOpen={setTasksOpen}
            controlsOpen={controlsOpen}
            setControlsOpen={setControlsOpen}
            mainChevronSpinAnim={mainChevronSpinAnim}
            spinOnce={spinOnce}
            AnimatedRow={AnimatedRow}
            selectProjectModal={selectProjectModal}
            setSelectProjectModal={setSelectProjectModal}
            showControlTypeModal={showControlTypeModal}
            setShowControlTypeModal={setShowControlTypeModal}
            controlTypeScrollMetrics={controlTypeScrollMetrics}
            setControlTypeScrollMetrics={setControlTypeScrollMetrics}
            controlTypeCanScroll={controlTypeCanScroll}
            controlTypeThumbHeight={controlTypeThumbHeight}
            controlTypeThumbTop={controlTypeThumbTop}
            projectControlModal={projectControlModal}
            setProjectControlModal={setProjectControlModal}
            projectControlSelectedType={projectControlSelectedType}
            setProjectControlSelectedType={setProjectControlSelectedType}
            projectControlTypePickerOpen={projectControlTypePickerOpen}
            setProjectControlTypePickerOpen={setProjectControlTypePickerOpen}
            projectControlTemplates={projectControlTemplates}
            setProjectControlTemplates={setProjectControlTemplates}
            projectControlSelectedTemplateId={projectControlSelectedTemplateId}
            setProjectControlSelectedTemplateId={setProjectControlSelectedTemplateId}
            projectControlTemplatePickerOpen={projectControlTemplatePickerOpen}
            setProjectControlTemplatePickerOpen={setProjectControlTemplatePickerOpen}
            projectControlTemplateSearch={projectControlTemplateSearch}
            setProjectControlTemplateSearch={setProjectControlTemplateSearch}
            hierarchy={hierarchy}
            searchText={searchText}
            setSearchText={setSearchText}
            openInlineControlEditor={openInlineControlEditor}
          />
            {/* Utförda kontroller header removed from main screen; it's shown inside project details only */}
          {/* Mobilens projektträd (rubrik + filter/sök + träd) */}
          <HomeMobileProjectTreeContainer
            isWeb={isWeb}
            loadingHierarchy={loadingHierarchy}
            hierarchy={hierarchy}
            hierarchySafe={hierarchySafe}
            selectedProjectSafe={selectedProjectSafe}
            projectPhaseKeySafe={projectPhaseKeySafe}
            phaseNavigationLoading={phaseNavigationLoading}
            selectedProjectFoldersSafe={selectedProjectFoldersSafe}
            navigation={navigation}
            companyId={companyId}
            projectStatusFilter={projectStatusFilter}
            setProjectStatusFilter={setProjectStatusFilter}
            handleSelectFunction={handleSelectFunction}
            handleToggleMainFolder={handleToggleMainFolder}
            handleToggleSubFolder={handleToggleSubFolder}
            setCreatingSubFolderForMainId={setCreatingSubFolderForMainId}
            setNewSubFolderName={setNewSubFolderName}
            setSimpleProjectModal={setSimpleProjectModal}
            setNewProjectName={setNewProjectName}
            setNewProjectNumber={setNewProjectNumber}
            setNewProjectModal={setNewProjectModal}
            setIsCreatingMainFolder={setIsCreatingMainFolder}
            setNewMainFolderName={setNewMainFolderName}
            mainChevronSpinAnim={mainChevronSpinAnim}
            subChevronSpinAnim={subChevronSpinAnim}
            mainTimersRef={mainTimersRef}
            spinOnce={spinOnce}
            projektLongPressTimer={projektLongPressTimer}
            filterSpinAnim={filterSpinAnim}
            filterRotate={filterRotate}
            searchSpinAnim={searchSpinAnim}
            searchRotate={searchRotate}
            openSearchModal={openSearchModal}
          />
                </ScrollView>
              </View>

              )}
        
        </RootContainer>
      );
    })()}
    </View>
  );
}
