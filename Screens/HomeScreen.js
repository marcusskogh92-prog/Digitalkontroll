import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Easing, ImageBackground, Keyboard, KeyboardAvoidingView, Modal, PanResponder, Platform, Pressable, ScrollView, Text, TextInput, TouchableOpacity, useWindowDimensions, View } from 'react-native';
import ContextMenu from '../components/ContextMenu';
import HeaderDisplayName from '../components/HeaderDisplayName';
import HeaderUserMenu from '../components/HeaderUserMenu';
import { Dashboard } from '../components/common/Dashboard';
import { NewProjectModal, SelectProjectModal } from '../components/common/Modals';
import { ProjectTree } from '../components/common/ProjectTree';
import { auth, DEFAULT_CONTROL_TYPES, fetchCompanyControlTypes, fetchCompanyMallar, fetchCompanyMembers, fetchCompanyProfile, fetchControlsForProject, fetchUserProfile, logCompanyActivity, saveControlToFirestore, saveDraftToFirestore, saveHierarchy, saveUserProfile, storage, subscribeCompanyActivity, subscribeCompanyMembers, upsertCompanyMember } from '../components/firebase';
import { formatPersonName } from '../components/formatPersonName';
import { onProjectUpdated } from '../components/projectBus';
import { usePhaseNavigation } from '../features/project-phases/phases/hooks/usePhaseNavigation';
import { DEFAULT_PHASE, getProjectPhase } from '../features/projects/constants';
import { useBreadcrumbNavigation } from '../hooks/common/useBreadcrumbNavigation';
import { useHierarchyToggle } from '../hooks/common/useHierarchy';
import useBackgroundSync from '../hooks/useBackgroundSync';
import { checkSharePointConnection, getProjectFolders } from '../services/azure/hierarchyService';
import { showAlert } from '../utils/alerts';
import { getAppVersion } from '../utils/appVersion';
import { copyProjectWeb, deleteProject } from '../utils/hierarchyOperations';
import { isWeb } from '../utils/platform';
import { isValidIsoDateYmd } from '../utils/validation';
import ProjectDetails from './ProjectDetails';
import TemplateControlScreen from './TemplateControlScreen';
import { loadFolderChildren } from '../services/azure/hierarchyService';
let createPortal = null;
if (isWeb) {
  try { createPortal = require('react-dom').createPortal; } catch(_e) { createPortal = null; }
}
let portalRootId = 'dk-header-portal';

// App version (displayed in sidebar)
const appVersion = getAppVersion();

// Recursive folder component for HomeScreen - handles infinite nesting levels from SharePoint
// Uses React Native components (View, TouchableOpacity) instead of HTML (li, div, ul)
function RecursiveFolderView({ 
  folder, 
  level = 0, 
  expandedSubs, 
  spinSubs, 
  onToggle, 
  companyId,
  hierarchy,
  setHierarchy,
  parentPath = '' // Full path from root to parent folder
}) {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const isExpanded = expandedSubs[folder.id] || false;
  const fontSize = Math.max(12, 15 - level);
  const marginLeft = 18 + (level * 4);
  
  // Construct full path from root to this folder
  // Priority: folder.path (if set correctly) > parentPath + folder.name > folder.name
  const getFullPath = () => {
    // If folder.path exists and looks valid, use it
    if (folder.path && typeof folder.path === 'string' && folder.path.trim().length > 0) {
      let normalized = folder.path.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalized = normalized.replace(/\/+$/, '');
      // CRITICAL: Remove any colons from path (Graph API adds : at end, but we don't want it in the path itself)
      normalized = normalized.replace(/:/g, '');
      if (normalized && normalized.length > 0 && normalized !== '/') {
        return normalized;
      }
    }
    
    // Otherwise, construct from parentPath + folder.name
    if (parentPath && typeof parentPath === 'string' && parentPath.trim().length > 0) {
      let normalizedParent = parentPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
      normalizedParent = normalizedParent.replace(/\/+$/, '');
      // CRITICAL: Remove any colons from parent path
      normalizedParent = normalizedParent.replace(/:/g, '');
      if (normalizedParent && normalizedParent.length > 0) {
        const fullPath = `${normalizedParent}/${folder.name}`;
        // Normalize the constructed path
        return fullPath.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
      }
    }
    
    // Fallback to just folder.name (root level) - remove any colons
    const fallback = folder.name || '';
    return fallback.replace(/:/g, '');
  };
  
  const handleToggle = async () => {
    if (onToggle) {
      onToggle(folder.id);
    }
    
    // If expanding and folder has no children or children not loaded, load them from SharePoint
    if (!isExpanded && (!folder.children || folder.children.length === 0) && companyId) {
      try {
        setLoading(true);
        setError(null);
        
        // Get full path from root to this folder
        const folderPath = getFullPath();
        
        // Normalize path - CRITICAL: Remove any colons (Graph API format issue)
        let normalizedPath = folderPath;
        if (normalizedPath && typeof normalizedPath === 'string') {
          // Remove colons first (Graph API can add : at end)
          normalizedPath = normalizedPath.replace(/:/g, '');
          // Then normalize slashes
          normalizedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+/g, '/').trim();
          normalizedPath = normalizedPath.replace(/\/+$/, '');
        } else {
          normalizedPath = '';
        }
        
        // Validate path - if empty, log warning but still try (will use root endpoint)
        if (!normalizedPath || normalizedPath.length === 0 || normalizedPath === '/') {
          console.warn('[HomeScreen] RecursiveFolderView - Empty or invalid folder path for:', folder.name, 'parentPath:', parentPath, 'folder.path:', folder.path, 'constructed path:', folderPath);
          // Don't set normalizedPath to folder.name here - let loadFolderChildren handle empty path
        }
        
        console.log('[HomeScreen] RecursiveFolderView - Loading children for path:', normalizedPath || '(root)', 'folder:', folder.name, 'level:', level, 'original folderPath:', folderPath);
        
        const children = await loadFolderChildren(companyId, normalizedPath);
        
        // Update hierarchy with loaded children - ensure each child has correct path
        setHierarchy(prev => {
          const updateFolder = (folders, currentParentPath = '') => folders.map(f => {
            if (f.id === folder.id) {
              // Update this folder with children and correct path
              // CRITICAL: Use the actual normalizedPath that was used to load children
              const actualPath = normalizedPath || f.path || (parentPath ? `${parentPath}/${folder.name}` : folder.name);
              
              const updatedChildren = (children || []).map(child => {
                // CRITICAL: Construct child path from actual parent path
                // child.path from loadFolderChildren should already be correct, but double-check
                let childPath = child.path;
                if (!childPath || childPath.length === 0) {
                  // If child doesn't have path, construct it from parent
                  childPath = actualPath 
                    ? `${actualPath}/${child.name}`.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '')
                    : child.name;
                } else {
                  // Normalize existing path to ensure it's correct
                  childPath = childPath.replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
                }
                
                return {
                  ...child,
                  path: childPath // Always use normalized path
                };
              });
              
              return { 
                ...f, 
                children: updatedChildren, 
                path: actualPath, // Always ensure path is set correctly
                loading: false, 
                error: null
              };
            }
            if (f.children) {
              // Recursively update children, passing current folder's path as parentPath
              const currentPath = f.path || (currentParentPath ? `${currentParentPath}/${f.name}` : f.name);
              return { ...f, children: updateFolder(f.children, currentPath) };
            }
            return f;
          });
          return updateFolder(prev);
        });
        
        setLoading(false);
      } catch (err) {
        console.error('[HomeScreen] RecursiveFolderView - Error loading folder children:', err, 'for path:', getFullPath(), 'folder:', folder.name);
        setError(err.message || 'Kunde inte ladda undermappar');
        setLoading(false);
        
        // Update hierarchy with error
        setHierarchy(prev => {
          const updateFolder = (folders) => folders.map(f => {
            if (f.id === folder.id) {
              return { ...f, loading: false, error: err.message || 'Kunde inte ladda undermappar' };
            }
            if (f.children) {
              return { ...f, children: updateFolder(f.children) };
            }
            return f;
          });
          return updateFolder(prev);
        });
      }
    }
  };
  
  return (
    <View style={{ marginLeft, marginTop: 4 }}>
      <TouchableOpacity
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          padding: '2px 4px',
        }}
        onPress={handleToggle}
      >
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={Math.max(12, 16 - level)}
          color="#222"
          style={{ marginRight: 4 }}
        />
        <Text style={{ 
          fontSize, 
          fontWeight: isExpanded ? '600' : '400', 
          color: '#222' 
        }}>
          {folder.name}
        </Text>
      </TouchableOpacity>
      
      {isExpanded && (
        <View style={{ marginLeft: 4, marginTop: 4 }}>
          {loading || folder.loading ? (
            <Text style={{ color: '#888', fontSize: fontSize - 1, marginLeft: 18, fontStyle: 'italic' }}>
              Laddar undermappar från SharePoint...
            </Text>
          ) : error || folder.error ? (
            <Text style={{ color: '#D32F2F', fontSize: fontSize - 1, marginLeft: 18 }}>
              Fel: {error || folder.error}
            </Text>
          ) : folder.children && folder.children.length > 0 ? (
            // Recursively render children - infinite depth, fully driven by SharePoint structure
            folder.children
              .filter(child => child.type === 'folder' || !child.type) // Only folders
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
              .map(childFolder => {
                // Construct parent path for child - use folder's path or construct from parentPath
                // CRITICAL: Normalize path and remove any colons
                let currentFolderPath = folder.path;
                if (!currentFolderPath || currentFolderPath.length === 0) {
                  if (parentPath && folder.name) {
                    currentFolderPath = `${parentPath}/${folder.name}`;
                  } else if (folder.name) {
                    currentFolderPath = folder.name;
                  } else {
                    currentFolderPath = '';
                  }
                }
                // Normalize: remove leading/trailing slashes, remove colons, normalize slashes
                if (currentFolderPath && typeof currentFolderPath === 'string') {
                  currentFolderPath = currentFolderPath.replace(/:/g, '').replace(/^\/+/, '').replace(/\/+/g, '/').replace(/\/+$/, '');
                } else {
                  currentFolderPath = '';
                }
                
                return (
                  <RecursiveFolderView
                    key={childFolder.id}
                    folder={childFolder}
                    level={level + 1}
                    expandedSubs={expandedSubs}
                    spinSubs={spinSubs}
                    onToggle={onToggle}
                    companyId={companyId}
                    hierarchy={hierarchy}
                    setHierarchy={setHierarchy}
                    parentPath={currentFolderPath}
                  />
                );
              })
          ) : (
            <Text style={{ color: '#D32F2F', fontSize: fontSize - 1, marginLeft: 18, fontStyle: 'italic' }}>
              Mappen är tom
            </Text>
          )}
        </View>
      )}
    </View>
  );
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
  const [tasksOpen, setTasksOpen] = useState(true);
  const [controlsOpen, setControlsOpen] = useState(false);
  
  // Close header search on Escape key (web)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    const keyHandler = (e) => {
      try {
        if (e && (e.key === 'Escape' || e.key === 'Esc')) {
          try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: true }); } catch(_e) {}
        }
      } catch(_e) {}
    };

    const closeOnScrollOrResize = () => {
      try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
    };

    try { window.addEventListener('keydown', keyHandler); } catch(_e) {}
    try { window.addEventListener('scroll', closeOnScrollOrResize, { passive: true }); } catch(_e) {}
    try { window.addEventListener('resize', closeOnScrollOrResize); } catch(_e) {}

    return () => {
      try { window.removeEventListener('keydown', keyHandler); } catch(_e) {}
      try { window.removeEventListener('scroll', closeOnScrollOrResize); } catch(_e) {}
      try { window.removeEventListener('resize', closeOnScrollOrResize); } catch(_e) {}
    };
  }, [navigation]);

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

  // Helper: collapse all expanded flags in a hierarchy (used on initial load)
  const collapseHierarchy = (items) => {
    if (!Array.isArray(items)) return [];
    return items.map(m => {
      // Set default phase on main folder if missing
      const mainPhase = m?.phase || DEFAULT_PHASE;
      return {
        ...m,
        type: m?.type || 'main',
        phase: mainPhase,
        expanded: false,
        children: Array.isArray(m.children) ? m.children.map(s => {
          // Set default phase on sub folder if missing (inherit from main)
          const subPhase = s?.phase || mainPhase;
          return {
            ...s,
            type: s?.type || 'sub',
            phase: subPhase,
            expanded: false,
            children: Array.isArray(s.children) ? s.children.map(ch => {
              // Set default phase on project if missing (inherit from sub or main)
              const projectPhase = ch?.phase || subPhase || mainPhase;
              return {
                ...ch,
                phase: projectPhase,
              };
            }) : [],
          };
        }) : [],
      };
    });
  };
  // Admin unlock (tap title 5 times)
  const [showAdminButton, setShowAdminButton] = useState(false);
  const [adminActionRunning, setAdminActionRunning] = useState(false);
  const [supportMenuOpen, setSupportMenuOpen] = useState(false);

  // Support/debug tools should not be visible in normal UI.
  // Shown only in development or after explicit admin-unlock.
  const showSupportTools = __DEV__ || showAdminButton;

  // Extra restriction: only show support/debug tools for admins, or for the dedicated demo company.
  // This keeps normal companies/users clean while still enabling dev workflows.
  const [authClaims, setAuthClaims] = useState(null);

  React.useEffect(() => {
    let active = true;
    async function refreshClaims() {
      try {
        const user = auth?.currentUser;
        if (!user) {
          if (active) setAuthClaims(null);
          return;
        }
        const tokenRes = await user.getIdTokenResult(false).catch((e) => null);
        if (active) setAuthClaims(tokenRes?.claims || null);
      } catch(_e) {
        if (active) setAuthClaims(null);
      }
    }

    refreshClaims();
    const unsub = auth?.onAuthStateChanged ? auth.onAuthStateChanged(() => { refreshClaims(); }) : null;
    return () => {
      active = false;
      try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
    };
  }, []);

  // Ensure SharePoint system folder structure exists (runs once on mount if user is logged in)
  React.useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user) return;
        
        // REMOVED: ensureSystemFolderStructure - SharePoint is now the source of truth
        // Folders should be created directly in SharePoint, not auto-created by Digitalkontroll
      } catch (_e) {
        // Ignore errors
      }
    })();
    return () => { mounted = false; };
  }, []);

  const routeCompanyId = route?.params?.companyId || null;

  const isAdminUser = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  // IMPORTANT: companyId state is initialized later in this component.
  // Do not reference it here (TDZ on web). Use claims/route params instead.
  const debugCompanyId = String(authClaims?.companyId || routeCompanyId || '').trim();
  const isDemoCompany = debugCompanyId === 'MS Byggsystem DEMO' || debugCompanyId === 'demo-service' || debugCompanyId === 'demo-company';
  // Only show support tools for:
  // - Demo company (all users)
  // - MS Byggsystem admins (dev accounts)
  // This prevents other-company admins from seeing dev tools.
  const isMsByggsystemCompany = debugCompanyId === 'MS Byggsystem';
  const canShowSupportToolsInHeader = !!(showSupportTools && (isDemoCompany || (isMsByggsystemCompany && isAdminUser)));
  
  // Dev-only: promote current user to demo/admin and load test hierarchy
  async function handleMakeDemoAdmin() {
    if (!__DEV__) return;
    if (adminActionRunning) return;
    setAdminActionRunning(true);
    try {
      const user = auth.currentUser;
      const demoCompanyId = 'demo-company';
        if (user) {
        await saveUserProfile(user.uid, {
          companyId: demoCompanyId,
          role: 'admin',
          displayName: user.email ? user.email.split('@')[0] : 'Demo Admin',
          email: user.email || null,
          updatedAt: new Date().toISOString()
        });
        await AsyncStorage.setItem('dk_companyId', demoCompanyId);
        setCompanyId(demoCompanyId);
        setHierarchy(collapseHierarchy(testHierarchy));
      }
    } catch(_e) {
      console.log('[Home] make demo admin error', _e?.message || _e);
    } finally {
      setAdminActionRunning(false);
      setShowAdminButton(false);
    }
  }

  // DISABLED: Filtrera bort projekt med namnet '22 test' vid render
  // Detta var en cleanup-kod som automatiskt raderade projekt vid varje mount,
  // vilket kunde orsaka dataförlust. Borttagen för att förhindra oavsiktlig radering.
  // Om cleanup behövs, gör det manuellt eller med en explicit admin-funktion.
  // React.useEffect(() => {
  //   setHierarchy(prev => prev.map(main => ({
  //     ...main,
  //     children: main.children.map(sub => ({
  //       ...sub,
  //       children: sub.children ? sub.children.filter(child => !(child.type === 'project' && child.name.trim().toLowerCase() === '22 test')) : []
  //     }))
  //   })));
  // }, []);
  // State för nytt projekt-modal i undermapp (används bara för native)
  const [newProjectModal, setNewProjectModal] = useState({ visible: false, parentSubId: null });
  // State för enkel modal för kalkylskede (bara projektnummer/namn)
  const [simpleProjectModal, setSimpleProjectModal] = useState({ visible: false, parentSubId: null, parentMainId: null });
  const [simpleProjectSuccessModal, setSimpleProjectSuccessModal] = useState(false);
  const simpleProjectCreatedRef = React.useRef(null);
  // State för inline-projektskapande (web)
  const [creatingProjectInline, setCreatingProjectInline] = useState(null); // { parentType: 'main'|'sub', parentId: string, mainId?: string }
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectNumber, setNewProjectNumber] = useState("");
  const [newProjectPhase, setNewProjectPhase] = useState(DEFAULT_PHASE);

  // Extra project fields (web modal UX)
  const [newProjectCustomer, setNewProjectCustomer] = useState('');
  const [newProjectClientContactName, setNewProjectClientContactName] = useState('');
  const [newProjectClientContactPhone, setNewProjectClientContactPhone] = useState('');
  const [newProjectClientContactEmail, setNewProjectClientContactEmail] = useState('');
  const [newProjectAddressStreet, setNewProjectAddressStreet] = useState('');
  const [newProjectAddressPostal, setNewProjectAddressPostal] = useState('');
  const [newProjectAddressCity, setNewProjectAddressCity] = useState('');
  const [newProjectPropertyDesignation, setNewProjectPropertyDesignation] = useState('');
  const [newProjectParticipantsSearch, setNewProjectParticipantsSearch] = useState('');
  const [newProjectAdvancedOpen, setNewProjectAdvancedOpen] = useState(false);

  const [newProjectResponsible, setNewProjectResponsible] = useState(null);
  const [responsiblePickerVisible, setResponsiblePickerVisible] = useState(false);
  const [newProjectParticipants, setNewProjectParticipants] = useState([]);
  const [participantsPickerVisible, setParticipantsPickerVisible] = useState(false);
  const [companyAdmins, setCompanyAdmins] = useState([]);
  const [loadingCompanyAdmins, setLoadingCompanyAdmins] = useState(false);
  const [newProjectKeyboardLockHeight, setNewProjectKeyboardLockHeight] = useState(0);
  const [, setCompanyAdminsLastFetchAt] = useState(0);
  const companyAdminsUnsubRef = useRef(null);
  const [companyAdminsPermissionDenied, setCompanyAdminsPermissionDenied] = useState(false);

  // All company members (for participants dropdown - includes both admins and regular users)
  const [companyMembers, setCompanyMembers] = useState([]);
  const [loadingCompanyMembers, setLoadingCompanyMembers] = useState(false);
  const [companyMembersPermissionDenied, setCompanyMembersPermissionDenied] = useState(false);

  const [newProjectSkyddsrondEnabled, setNewProjectSkyddsrondEnabled] = useState(false);
  const [newProjectSkyddsrondWeeks, setNewProjectSkyddsrondWeeks] = useState(2);
  const [newProjectSkyddsrondFirstDueDate, setNewProjectSkyddsrondFirstDueDate] = useState('');
  const [skyddsrondWeeksPickerVisible, setSkyddsrondWeeksPickerVisible] = useState(false);
  // States for form improvements
  const [creatingProject, setCreatingProject] = useState(false);
  const [focusedInput, setFocusedInput] = useState(null);
  const [hoveredSkyddsrondBtn, setHoveredSkyddsrondBtn] = useState(false);
  const [responsibleDropdownOpen, setResponsibleDropdownOpen] = useState(false);
  const responsibleDropdownRef = useRef(null);

  // Project status filter (for filtering projects by status)
  const [projectStatusFilter, setProjectStatusFilter] = useState('all');

  const newProjectSkyddsrondFirstDueTrim = String(newProjectSkyddsrondFirstDueDate || '').trim();
  const newProjectSkyddsrondFirstDueValid = (!newProjectSkyddsrondEnabled)
    || (newProjectSkyddsrondFirstDueTrim !== '' && isValidIsoDateYmd(newProjectSkyddsrondFirstDueTrim));

  const resetProjectFields = React.useCallback(() => {
    setNewProjectPhase(DEFAULT_PHASE);
    try { setNewProjectName(''); } catch(_e) {}
    try { setNewProjectNumber(''); } catch(_e) {}
    try { setNewProjectCustomer(''); } catch(_e) {}
    try { setNewProjectClientContactName(''); } catch(_e) {}
    try { setNewProjectClientContactPhone(''); } catch(_e) {}
    try { setNewProjectClientContactEmail(''); } catch(_e) {}
    try { setNewProjectAddressStreet(''); } catch(_e) {}
    try { setNewProjectAddressPostal(''); } catch(_e) {}
    try { setNewProjectAddressCity(''); } catch(_e) {}
    try { setNewProjectPropertyDesignation(''); } catch(_e) {}
    try { setNewProjectParticipantsSearch(''); } catch(_e) {}
    try { setNewProjectAdvancedOpen(false); } catch(_e) {}
    try { setNewProjectResponsible(null); } catch(_e) {}
    try { setResponsiblePickerVisible(false); } catch(_e) {}
    try { setNewProjectKeyboardLockHeight(0); } catch(_e) {}
    try { setNewProjectSkyddsrondEnabled(false); } catch(_e) {}
    try { setNewProjectSkyddsrondWeeks(2); } catch(_e) {}
    try { setNewProjectSkyddsrondFirstDueDate(''); } catch(_e) {}
    try { setSkyddsrondWeeksPickerVisible(false); } catch(_e) {}
    try { setNewProjectParticipants([]); } catch(_e) {}
    try { setParticipantsPickerVisible(false); } catch(_e) {}
    try { setCreatingProject(false); } catch(_e) {}
    try { setFocusedInput(null); } catch(_e) {}
    try { setHoveredSkyddsrondBtn(false); } catch(_e) {}
    // Best-effort: dismiss keyboard on native
    try { if (Platform.OS !== 'web') Keyboard.dismiss();     } catch(_e) {}
  }, []);

  const loadCompanyAdmins = React.useCallback(async ({ force } = { force: false }) => {
    try {
      if (!routeCompanyId) return;
      if (loadingCompanyAdmins && !force) return;
      setLoadingCompanyAdmins(true);
      setCompanyAdminsPermissionDenied(false);
      // Ensure at least the current user is present in members directory
      // (Inline to avoid any scope issues on native/web builds.)
      try {
        const user = auth?.currentUser;
        if (user?.uid) {
          const profile = await fetchUserProfile(user.uid).catch((e) => null);
          const displayName = profile?.displayName || profile?.name || (user.email ? String(user.email).split('@')[0] : null);
          const role = profile?.role || null;
          await upsertCompanyMember({
            companyId: routeCompanyId || null,
            uid: user.uid,
            displayName,
            email: user.email || null,
            role,
          });
        }
      } catch(_e) {}
      // Fetch both admin and superadmin users for responsible person dropdown
      const [admins, superadmins] = await Promise.all([
        fetchCompanyMembers(routeCompanyId, { role: 'admin' }),
        fetchCompanyMembers(routeCompanyId, { role: 'superadmin' })
      ]);
      // Combine and deduplicate by id
      const allAdmins = [...(Array.isArray(admins) ? admins : []), ...(Array.isArray(superadmins) ? superadmins : [])];
      const uniqueAdmins = allAdmins.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
      setCompanyAdmins(uniqueAdmins);
      setCompanyAdminsLastFetchAt(Date.now());
    } catch(_e) {
      const msg = String(_e?.message || _e || '').toLowerCase();
      if (_e?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
      setCompanyAdmins([]);
    } finally {
      setLoadingCompanyAdmins(false);
    }
  }, [routeCompanyId, loadingCompanyAdmins]);

  // Load all company members for participants dropdown
  const loadCompanyMembers = React.useCallback(async ({ force = false } = {}) => {
    if (loadingCompanyMembers && !force) return;
    if (!routeCompanyId) return;
    setLoadingCompanyMembers(true);
    setCompanyMembersPermissionDenied(false);
    try {
      // Fetch ALL members (no role filter) for participants
      const allMembers = await fetchCompanyMembers(routeCompanyId); // No role filter = all members
      setCompanyMembers(Array.isArray(allMembers) ? allMembers : []);
    } catch(_e) {
      const msg = String(_e?.message || _e || '').toLowerCase();
      if (_e?.code === 'permission-denied' || msg.includes('permission')) setCompanyMembersPermissionDenied(true);
      setCompanyMembers([]);
    } finally {
      setLoadingCompanyMembers(false);
    }
  }, [routeCompanyId, loadingCompanyMembers]);

  // If the create-project modal opens before companyId is ready, onShow can early-return.
  // This effect ensures admins are fetched as soon as companyId is available while the modal is open.
  React.useEffect(() => {
    if (!newProjectModal?.visible) return;
    if (!routeCompanyId) return;
    // Avoid refetch loop; only fetch if we have nothing yet.
    if (companyAdmins && companyAdmins.length > 0) return;
    if (loadingCompanyAdmins) return;
    loadCompanyAdmins({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectModal?.visible, routeCompanyId]);

  // Load all company members when modal opens (for participants)
  React.useEffect(() => {
    if (!newProjectModal?.visible) return;
    if (!routeCompanyId) return;
    // Avoid refetch loop; only fetch if we have nothing yet.
    if (companyMembers && companyMembers.length > 0) return;
    if (loadingCompanyMembers) return;
    loadCompanyMembers({ force: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [newProjectModal?.visible, routeCompanyId]);

  // While the ansvarig picker is open, subscribe to admins in realtime.
  // This avoids the common "empty cache" problem on fresh logins.
  React.useEffect(() => {
    if (!responsiblePickerVisible) {
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch(_e) {}
      companyAdminsUnsubRef.current = null;
      return;
    }
    if (!routeCompanyId) return;

    setLoadingCompanyAdmins(true);
    setCompanyAdminsPermissionDenied(false);
    try {
      if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current();
    } catch(_e) {}
    // Subscribe to both admin and superadmin users
    const unsubs = [];
    let adminData = [];
    let superadminData = [];
    
    const updateAdmins = () => {
      const allAdmins = [...adminData, ...superadminData];
      const uniqueAdmins = allAdmins.filter((m, idx, arr) => arr.findIndex(x => x.id === m.id) === idx);
      setCompanyAdmins(uniqueAdmins);
        setCompanyAdminsLastFetchAt(Date.now());
        setLoadingCompanyAdmins(false);
    };
    
    const unsubAdmin = subscribeCompanyMembers(routeCompanyId, {
      role: 'admin',
      onData: (admins) => {
        adminData = Array.isArray(admins) ? admins : [];
        updateAdmins();
      },
      onError: (err) => {
        adminData = [];
        updateAdmins();
        const msg = String(err?.message || err || '').toLowerCase();
        if (err?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
      }
    });
    unsubs.push(unsubAdmin);
    
    const unsubSuperadmin = subscribeCompanyMembers(routeCompanyId, {
      role: 'superadmin',
      onData: (admins) => {
        superadminData = Array.isArray(admins) ? admins : [];
        updateAdmins();
      },
      onError: (err) => {
        superadminData = [];
        updateAdmins();
        const msg = String(err?.message || err || '').toLowerCase();
        if (err?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
      }
    });
    unsubs.push(unsubSuperadmin);
    
    companyAdminsUnsubRef.current = () => {
      unsubs.forEach(unsub => { try { if (typeof unsub === 'function') unsub(); } catch(_e) {} });
    };
    
    // Initial load
    (async () => {
      setLoadingCompanyAdmins(true);
      setCompanyAdminsPermissionDenied(false);
      try {
        const [admins, superadmins] = await Promise.all([
          fetchCompanyMembers(routeCompanyId, { role: 'admin' }),
          fetchCompanyMembers(routeCompanyId, { role: 'superadmin' })
        ]);
        adminData = Array.isArray(admins) ? admins : [];
        superadminData = Array.isArray(superadmins) ? superadmins : [];
        updateAdmins();
      } catch (err) {
        const msg = String(err?.message || err || '').toLowerCase();
        if (err?.code === 'permission-denied' || msg.includes('permission')) setCompanyAdminsPermissionDenied(true);
        setLoadingCompanyAdmins(false);
      }
    })();

    return () => {
      try { if (companyAdminsUnsubRef.current) companyAdminsUnsubRef.current(); } catch(_e) {}
      companyAdminsUnsubRef.current = null;
    };
  }, [responsiblePickerVisible, routeCompanyId]);

  // Track native keyboard height for the create-project modal.
  // We keep this separate from the search modal keyboard handling to avoid stale/reset values.
  const [nativeKeyboardHeight, setNativeKeyboardHeight] = useState(0);
  const nativeKeyboardHeightRef = useRef(0);

  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const subs = [];
    const onShow = (e) => {
      const h = e?.endCoordinates?.height || 0;
      nativeKeyboardHeightRef.current = h;
      setNativeKeyboardHeight(h);
    };
    const onHide = () => {
      nativeKeyboardHeightRef.current = 0;
      setNativeKeyboardHeight(0);
    };

    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch(_e) {}
      }
    };
  }, []);

  // Modal för nytt projekt i undermapp (läggs utanför return)
  // State for project selection modal (for creating controls)
  const [selectProjectModal, setSelectProjectModal] = useState({ visible: false, type: null });
  const [showControlTypeModal, setShowControlTypeModal] = useState(false);
  const [controlTypeScrollMetrics, setControlTypeScrollMetrics] = useState({
    containerHeight: 0,
    contentHeight: 0,
    scrollY: 0,
  });
  const controlTypeCanScroll = controlTypeScrollMetrics.contentHeight > (controlTypeScrollMetrics.containerHeight + 1);
  const controlTypeThumbHeight = React.useMemo(() => {
    const { containerHeight, contentHeight } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const ratio = containerHeight / contentHeight;
    return Math.max(28, containerHeight * ratio);
  }, [controlTypeScrollMetrics]);
  const controlTypeThumbTop = React.useMemo(() => {
    const { containerHeight, contentHeight, scrollY } = controlTypeScrollMetrics;
    if (!containerHeight || !contentHeight || contentHeight <= containerHeight) return 0;
    const maxScroll = Math.max(1, contentHeight - containerHeight);
    const progress = Math.min(1, Math.max(0, scrollY / maxScroll));
    return (containerHeight - controlTypeThumbHeight) * progress;
  }, [controlTypeScrollMetrics, controlTypeThumbHeight]);
  const [projectControlModal, setProjectControlModal] = useState({ visible: false, project: null });
  const [projectControlSelectedType, setProjectControlSelectedType] = useState('');
  const [projectControlTypePickerOpen, setProjectControlTypePickerOpen] = useState(false);
  const [projectControlTemplates, setProjectControlTemplates] = useState([]);
  const [projectControlSelectedTemplateId, setProjectControlSelectedTemplateId] = useState('');
  const [projectControlTemplatePickerOpen, setProjectControlTemplatePickerOpen] = useState(false);
  const [projectControlTemplateSearch, setProjectControlTemplateSearch] = useState('');

  const isBrowserEnv = (Platform.OS === 'web') || (typeof globalThis !== 'undefined' && !!globalThis.document);

  // Check that a project number/id is unique across the whole hierarchy.
  // Must be declared before any JSX/constants that reference it (RN-web TDZ).
  const isProjectNumberUnique = React.useCallback((num) => {
    if (!num) return true;
    const n = String(num ?? '').trim();
    if (!n) return true;
    try {
      // Recursively check all projects - no assumptions about depth
      const findAllProjects = (items) => {
        const projects = [];
        const walk = (nodes) => {
          if (!Array.isArray(nodes)) return;
          nodes.forEach(node => {
            if (node && node.type === 'project' && node.id) {
              projects.push(node);
            }
            if (node && node.children && Array.isArray(node.children)) {
              walk(node.children);
            }
          });
        };
        walk(items);
        return projects;
      };
      
      const allProjects = findAllProjects(hierarchyRef.current || []);
      if (allProjects.some(proj => String(proj.id) === String(n))) {
        return false;
      }
    } catch(_e) {}
    return true;
  }, []);

  // Calculate canCreate outside modal for use in useEffect (must be after isProjectNumberUnique)
  const canCreateProject = React.useMemo(() => {
    return (
      String(newProjectName ?? '').trim() !== ''
      && String(newProjectNumber ?? '').trim() !== ''
      && isProjectNumberUnique(newProjectNumber)
      && !!newProjectResponsible
      && (!!newProjectSkyddsrondFirstDueValid)
    );
  }, [newProjectName, newProjectNumber, newProjectResponsible, newProjectSkyddsrondFirstDueValid, isProjectNumberUnique]);

  // For simple modal (kalkylskede): only need project number and name
  const canCreateSimpleProject = React.useMemo(() => {
    return (
      String(newProjectName ?? '').trim() !== ''
      && String(newProjectNumber ?? '').trim() !== ''
      && isProjectNumberUnique(newProjectNumber)
    );
  }, [newProjectName, newProjectNumber, isProjectNumberUnique]);

  // Close dropdown when clicking outside (web only)
  React.useEffect(() => {
    if (!isBrowserEnv || !responsibleDropdownOpen) return;
    
    const handleClickOutside = (e) => {
      if (responsibleDropdownRef.current && !responsibleDropdownRef.current.contains(e.target)) {
        setResponsibleDropdownOpen(false);
      }
    };

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [responsibleDropdownOpen, isBrowserEnv]);

  // Close dropdown when modal closes
  React.useEffect(() => {
    if (!newProjectModal.visible) {
      setResponsibleDropdownOpen(false);
    }
  }, [newProjectModal.visible]);

  // Keyboard event handler for web (Enter to submit)
  React.useEffect(() => {
    if (!isBrowserEnv || !newProjectModal.visible) return;
    
    const handleKeyDown = (e) => {
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        // Ctrl/Cmd + Enter to submit
        e.preventDefault();
        if (canCreateProject && !creatingProject) {
          // Find and click the create button
          setTimeout(() => {
            try {
              const buttons = Array.from(document.querySelectorAll('button, [role="button"], [data-create-project-btn]'));
              const createBtn = buttons.find(b => {
                const text = b.textContent || b.innerText || '';
                return text.includes('Skapa') && !b.disabled && !b.hasAttribute('disabled');
              });
              if (createBtn) {
                createBtn.click();
              }
            } catch(_e) {}
          }, 10);
        }
      } else if (e.key === 'Escape') {
        // Escape to close dropdown or modal
        if (responsibleDropdownOpen) {
          setResponsibleDropdownOpen(false);
          e.preventDefault();
        } else if (!creatingProject) {
          setNewProjectModal({ visible: false, parentSubId: null });
          resetProjectFields();
        }
      }
    };

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('keydown', handleKeyDown);
      return () => {
        window.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [newProjectModal.visible, canCreateProject, creatingProject, isBrowserEnv]);

  // Ref for main folder long press timers
  const mainTimersRef = React.useRef({});
  // Ref for long press timer
  const projektLongPressTimer = React.useRef(null);
        // State for inline creation of main folder
        const [isCreatingMainFolder, setIsCreatingMainFolder] = useState(false);
        const [newMainFolderName, setNewMainFolderName] = useState('');
      // State for edit modal (main or sub group)
      const [editModal, setEditModal] = useState({ visible: false, type: '', id: null, name: '' });
    // Helper to count ongoing and completed projects
    // eslint-disable-next-line no-unused-vars
    function _countProjectStatus(tree) {
      let ongoing = 0;
      let completed = 0;
      if (!Array.isArray(tree)) return { ongoing, completed };
      try {
        tree.forEach(main => {
          if (main.children && Array.isArray(main.children)) {
            // Recursively count projects - no assumptions about depth
            const walk = (nodes) => {
              if (!Array.isArray(nodes)) return;
              nodes.forEach(node => {
                if (node && node.type === 'project') {
                  if (node.status === 'completed') completed++;
                  else ongoing++;
                }
                if (node && node.children && Array.isArray(node.children)) {
                  walk(node.children);
                }
              });
            };
            walk(main.children || []);
          }
        });
      } catch(_e) {}
      return { ongoing, completed };
    }
  // Helper to remove last main folder
  // eslint-disable-next-line no-unused-vars
  const removeLastMainFolder = () => {
    setHierarchy(prev => prev.length > 0 ? prev.slice(0, -1) : prev);
  };
  // Helper to check if folder name is unique
  const isFolderNameUnique = (name) => {
    // Check if name is unique within the current phase
    return !hierarchy.some(folder => {
      const folderPhase = folder?.phase || DEFAULT_PHASE;
      return folderPhase === selectedPhase && folder.name.trim().toLowerCase() === name.trim().toLowerCase();
    });
  };

  // State for inline creation of subfolder
  const [creatingSubFolderForMainId, setCreatingSubFolderForMainId] = useState(null);
  const [newSubFolderName, setNewSubFolderName] = useState('');
  // Helper to count all projects in the hierarchy
  // eslint-disable-next-line no-unused-vars
  function _countProjects(tree) {
    let count = 0;
    // Recursively count projects - no assumptions about depth
    if (!Array.isArray(tree)) return count;
    const walk = (nodes) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach(node => {
        if (node && node.type === 'project') {
          count++;
        }
        if (node && node.children && Array.isArray(node.children)) {
          walk(node.children);
        }
      });
    };
    walk(tree);
    return count;
  }
  const email = route?.params?.email || '';
  const firstName = formatPersonName(email);
  const userBtnRef = useRef(null);
  const [userMenuVisible, setUserMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const isSuperAdmin = ((auth && auth.currentUser && ['marcus@msbyggsystem.se', 'marcus.skogh@msbyggsystem.se'].includes(String(auth.currentUser.email || '').toLowerCase())) || !!authClaims?.globalAdmin);

  const currentEmailLower = String(auth?.currentUser?.email || '').toLowerCase();
  const isMsAdminClaim = !!(authClaims && (authClaims.admin === true || authClaims.role === 'admin'));
  const allowedTools = (currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se') || (String(authClaims?.companyId || '').trim() === 'MS Byggsystem' && isMsAdminClaim);
  const showHeaderUserMenu = !!(isAdminUser || currentEmailLower === 'marcus@msbyggsystem.se' || currentEmailLower === 'marcus.skogh@msbyggsystem.se');

  const openUserMenu = () => {
    try {
      const node = userBtnRef.current;
      if (node && typeof node.measureInWindow === 'function') {
        node.measureInWindow((x, y, w, h) => {
          setMenuPos({ x: Math.max(8, x), y: y + (h || 36) + 6 });
          setUserMenuVisible(true);
        });
        return;
      }
    } catch (_e) {}
    setUserMenuVisible(true);
  };
  const [, setLoggingOut] = useState(false);
  // companyId kan komma från route.params eller användarprofil
  const [companyId, setCompanyId] = useState(() => route?.params?.companyId || '');

  // Persist companyId locally (used as fallback in other screens) and
  // allow resolving companyId from auth claims when route params are missing.
  React.useEffect(() => {
    (async () => {
      try {
        const current = String(companyId || '').trim();
        const fromClaims = String(authClaims?.companyId || '').trim();
        const cid = current || fromClaims;
        if (!cid) return;
        if (!current && fromClaims) {
          setCompanyId(fromClaims);
        }
        const stored = await AsyncStorage.getItem('dk_companyId');
        if (stored !== cid) {
          await AsyncStorage.setItem('dk_companyId', cid);
        }
      } catch(_e) {}
    })();
  }, [companyId, authClaims?.companyId]);
  // Laddningsstate för hierarkin
  const [loadingHierarchy, setLoadingHierarchy] = useState(true);
  const [hierarchy, setHierarchy] = useState([]);
  const hierarchyRef = useRef([]);
  const [spinMain, setSpinMain] = useState({});
  const [spinSub, setSpinSub] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({}); // For recursive folder expansion (SharePoint folders)
  const [expandedProjects, setExpandedProjects] = useState({}); // For project functions expansion
  const [localFallbackExists, setLocalFallbackExists] = useState(false);
  const [syncStatus, setSyncStatus] = useState('idle');
  const [selectedProject, setSelectedProject] = useState(null);
  const [selectedProjectPath, setSelectedProjectPath] = useState(null); // { mainId, subId, mainName?, subName?, projectId? }
  const selectedProjectRef = useRef(null);
  const [selectedProjectFolders, setSelectedProjectFolders] = useState([]); // SharePoint folders for selected project
  
  // Phase navigation state (for PhaseLeftPanel in leftpanel)
  const [phaseActiveSection, setPhaseActiveSection] = useState(null);
  const [phaseActiveItem, setPhaseActiveItem] = useState(null);
  
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
    projectPhaseKey
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
  const [isInlineLocked, setIsInlineLocked] = useState(false);
  const pendingProjectSwitchRef = useRef(null);
  const pendingBreadcrumbNavRef = useRef(null); // { kind: 'dashboard'|'main'|'sub'|'project', mainId?, subId?, projectId? }
  const [projectInlineViewLabel, setProjectInlineViewLabel] = useState(null); // e.g. 'Skyddsrond'
  const [projectControlsRefreshNonce, setProjectControlsRefreshNonce] = useState(0);
  const [inlineControlEditor, setInlineControlEditor] = useState(null); // { project, controlType }

  // Used to request a specific action when opening a project from the dashboard (e.g. open a draft inline)
  const [projectSelectedAction, setProjectSelectedAction] = useState(null);

  const [dashboardLoading, setDashboardLoading] = useState(false);
  const [dashboardOverview, setDashboardOverview] = useState({
    activeProjects: 0,
    openDeviations: 0,
    skyddsrondOverdue: 0,
    skyddsrondDueSoon: 0,
    controlsToSign: 0,
    drafts: 0,
  });
  const [dashboardRecent, setDashboardRecent] = useState([]);
  const [dashboardRecentProjects, setDashboardRecentProjects] = useState([]);
  const [companyActivity, setCompanyActivity] = useState([]);
  
  // Selected phase for filtering (default: kalkylskede)
  const [selectedPhase, setSelectedPhase] = useState('kalkylskede');
  // Phase dropdown removed - phases are now SharePoint folders
  const [phaseChanging, setPhaseChanging] = useState(false);
  const [loadingPhase, setLoadingPhase] = useState(null); // Store which phase is being loaded
  const phaseChangeSpinAnim = useRef(new Animated.Value(0)).current;
  
  // Function to save all pending data before phase change
  const saveAllPendingData = React.useCallback(async () => {
    try {
      const savePromises = [];
      
      // Save hierarchy if it exists and has changes
      if (hierarchy && hierarchy.length > 0 && companyId) {
        savePromises.push(saveHierarchy(companyId, hierarchy).catch(err => {
          console.error('[HomeScreen] Error saving hierarchy:', err);
          return false;
        }));
      }
      
      // Save any draft controls
      // Note: This would need to be implemented based on your draft saving logic
      
      // Wait for all saves to complete
      await Promise.all(savePromises);
      console.log('[HomeScreen] All pending data saved');
    } catch (error) {
      console.error('[HomeScreen] Error saving pending data:', error);
    }
  }, [hierarchy, companyId]);
  
  // Phase dropdown removed - phases are now SharePoint folders
  // Active folder will be tracked when user navigates to a folder
  const [activeFolderPath, setActiveFolderPath] = useState(null); // Track which SharePoint folder is active
  const [sharePointStatus, setSharePointStatus] = useState({ connected: false, checking: true, error: null, siteId: null, siteUrl: null, siteName: null }); // SharePoint connection status
  const [sharePointTooltipVisible, setSharePointTooltipVisible] = useState(false); // Tooltip visibility for SharePoint icon
  
  // Listen for folder selection events to update active folder
  React.useEffect(() => {
    if (Platform.OS !== 'web' || typeof window === 'undefined') return;
    
    const handleFolderSelected = (event) => {
      try {
        const detail = event?.detail || {};
        if (detail.folderPath) {
          setActiveFolderPath(detail.folderPath);
        }
      } catch (_e) {}
    };
    
    window.addEventListener('dkFolderSelected', handleFolderSelected);
    return () => {
      try {
        window.removeEventListener('dkFolderSelected', handleFolderSelected);
      } catch (_e) {}
    };
  }, []);
  
  // Map SharePoint folder names to phase colors for UI
  const getFolderColor = React.useCallback((folderName) => {
    if (!folderName) return '#1976D2'; // Default blue
    const name = String(folderName).toLowerCase();
    if (name.includes('kalkyl')) return '#1976D2'; // Blue
    if (name.includes('produktion')) return '#43A047'; // Green
    if (name.includes('avslut')) return '#616161'; // Gray
    if (name.includes('eftermarknad')) return '#7B1FA2'; // Purple
    return '#1976D2'; // Default
  }, []);
  
  // Get active folder name from path
  const getActiveFolderName = React.useCallback(() => {
    if (!activeFolderPath) return null;
    const parts = activeFolderPath.split('/');
    return parts[parts.length - 1] || activeFolderPath;
  }, [activeFolderPath]);

  // Check SharePoint connection status and animate icon
  React.useEffect(() => {
    if (!companyId) {
        setSharePointStatus({ connected: false, checking: false, error: null, siteId: null, siteUrl: null, siteName: null });
      return;
    }
    
    let mounted = true;
    (async () => {
      try {
        setSharePointStatus(prev => ({ ...prev, checking: true }));
        const connectionStatus = await checkSharePointConnection(companyId);
        if (mounted) {
          setSharePointStatus({
            connected: connectionStatus.connected,
            checking: false,
            error: connectionStatus.error,
            siteId: connectionStatus.siteId,
            siteUrl: connectionStatus.siteUrl,
            siteName: connectionStatus.siteName
          });
          
          // Start pulsing animation
          if (connectionStatus.connected) {
            // Green pulsing animation
            Animated.loop(
              Animated.sequence([
                Animated.timing(searchSpinAnim, {
                  toValue: 1,
                  duration: 1500,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: false,
                }),
                Animated.timing(searchSpinAnim, {
                  toValue: 0,
                  duration: 1500,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: false,
                }),
              ])
            ).start();
          } else {
            // Red pulsing animation
            Animated.loop(
              Animated.sequence([
                Animated.timing(searchSpinAnim, {
                  toValue: 1,
                  duration: 1000,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: false,
                }),
                Animated.timing(searchSpinAnim, {
                  toValue: 0,
                  duration: 1000,
                  easing: Easing.inOut(Easing.ease),
                  useNativeDriver: false,
                }),
              ])
            ).start();
          }
        }
      } catch (error) {
        if (mounted) {
          setSharePointStatus({
            connected: false,
            checking: false,
            error: error?.message || 'Okänt fel',
            siteId: null,
            siteUrl: null,
            siteName: null
          });
          // Red pulsing animation on error
          Animated.loop(
            Animated.sequence([
              Animated.timing(searchSpinAnim, {
                toValue: 1,
                duration: 1000,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
              Animated.timing(searchSpinAnim, {
                toValue: 0,
                duration: 1000,
                easing: Easing.inOut(Easing.ease),
                useNativeDriver: false,
              }),
            ])
          ).start();
        }
      }
    })();
    
    return () => { mounted = false; };
  }, [companyId]);

  // Dispatch window event helper
  const dispatchWindowEvent = React.useCallback((name, detail) => {
    try {
      if (typeof window === 'undefined') return;
      const evt = (typeof CustomEvent === 'function')
        ? new CustomEvent(name, { detail })
        : (() => {
          const e = document.createEvent('Event');
          e.initEvent(name, true, true);
          e.detail = detail;
          return e;
        })();
      window.dispatchEvent(evt);
    } catch (_e) {}
  }, []);

  // Phase change removed - phases are now SharePoint folders, navigation happens via folder clicks

  // Phase change removed - phases are now SharePoint folders, not internal state

  // Phase changes removed - phases are now SharePoint folders
  // No need to listen for phase change events since phases are SharePoint folders

  // Dashboard drill-down + hover (used mainly on web)
  const [dashboardFocus, setDashboardFocus] = useState(null); // 'activeProjects' | 'drafts' | 'controlsToSign' | 'upcomingSkyddsrond' | 'openDeviations'
  const [dashboardHoveredStatKey, setDashboardHoveredStatKey] = useState(null);
  const [dashboardActiveProjectsList, setDashboardActiveProjectsList] = useState([]);
  const [dashboardDraftItems, setDashboardDraftItems] = useState([]);
  const [dashboardControlsToSignItems, setDashboardControlsToSignItems] = useState([]);
  const [dashboardOpenDeviationItems, setDashboardOpenDeviationItems] = useState([]);
  const [dashboardUpcomingSkyddsrondItems, setDashboardUpcomingSkyddsrondItems] = useState([]);
  const [dashboardDropdownAnchor, setDashboardDropdownAnchor] = useState('overview');
  const [dashboardDropdownTop, setDashboardDropdownTop] = useState(null);
  const [dashboardDropdownRowKey, setDashboardDropdownRowKey] = useState(null);

  // Remote-loaded button images (prefer Firebase Storage; fallback to local assets)
  const [dashboardBtn1Url, setDashboardBtn1Url] = useState(null);
  const [dashboardBtn2Url, setDashboardBtn2Url] = useState(null);
  const [dashboardBtn1Failed, setDashboardBtn1Failed] = useState(false);
  const [dashboardBtn2Failed, setDashboardBtn2Failed] = useState(false);

  const dashboardCardLayoutRef = useRef({ overview: null, reminders: null });
  const dashboardStatRowLayoutRef = useRef({});

  // Try to load dashboard button images from Firebase Storage path
  React.useEffect(() => {
    let mounted = true;
    async function loadButtons() {
      try {
        const paths = [
          'branding/dashboard_buttons/nykontroll.png',
          'branding/dashboard_buttons/dagensuppgifter.png'
        ];
        const results = await Promise.all(paths.map(async (p) => {
          try {
            if (!storage) return null;
            let fullPath = p;
            // Support full gs:// URIs too
            if (typeof p === 'string' && p.trim().toLowerCase().startsWith('gs://')) {
              const m = String(p).trim().match(/^gs:\/\/[^\/]+\/(.+)$/i);
              if (m && m[1]) fullPath = m[1];
              else return null;
            }

            // Ensure path has no leading slash
            const normPath = String(fullPath).replace(/^\/+/, '');

            // On web prefer the public GCS URL (avoids tokenized REST calls that can 403 in browsers)
            try {
              if (Platform && Platform.OS === 'web') {
                const bucketName = (storage && storage.app && storage.app.options && storage.app.options.storageBucket) ? String(storage.app.options.storageBucket) : '';
                const bucketCandidates = [];
                if (bucketName) {
                  bucketCandidates.push(bucketName);
                  if (bucketName.toLowerCase().endsWith('.firebasestorage.app')) {
                    bucketCandidates.push(bucketName.replace(/\.firebasestorage\.app$/i, '.appspot.com'));
                  }
                }
                for (const b of (bucketCandidates.length ? bucketCandidates : [])) {
                  try {
                    const publicUrl = 'https://storage.googleapis.com/' + b + '/' + encodeURI(normPath);
                    return publicUrl;
                  } catch (_e) {
                    // try next bucket candidate
                  }
                }
              }
            } catch (_e) {
              // ignore fallback errors
            }

            // Try a couple of path variants (no leading slash and with a leading slash) using SDK
            const tryPaths = [String(fullPath), String('/' + fullPath)];
            for (const tp of tryPaths) {
              try {
                const sref = storageRef(storage, tp);
                const url = await getDownloadURL(sref);
                if (url) return url;
              } catch (_e) {
                // try next variant
              }
            }

            return null;
          } catch (e) {
            return null;
          }
        }));
        if (!mounted) return;
        // Debug: log what we found so we can inspect console on web
        try { console.log('Dashboard button URLs:', results); } catch (_e) {}
        if (results[0]) setDashboardBtn1Url(results[0]);
        if (results[1]) setDashboardBtn2Url(results[1]);
      } catch (e) {
        // ignore failures; local assets will be used
      }
    }
    loadButtons();
    return () => { mounted = false; };
  }, []);

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
          
          // Auto-save hierarchy when project is updated (including phase changes)
          if (companyId && newHierarchy && newHierarchy.length > 0) {
            saveHierarchy(companyId, newHierarchy).catch(err => {
              console.error('[HomeScreen] Error auto-saving hierarchy after project update:', err);
            });
          }
          
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

  const toggleDashboardFocus = (key, anchor, top) => {
    if (!key) return;
    console.log && console.log('toggleDashboardFocus called', { key, anchor, top, current: dashboardFocus });
    if (anchor) {
      setDashboardDropdownAnchor(anchor);
    }
    // If opening, set top immediately to avoid race on positioning
    if (typeof top === 'number') {
      setDashboardDropdownTop(top);
    } else if (dashboardFocus === key) {
      // closing
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
      setDashboardDropdownRowKey(null);
    }
    setDashboardFocus((prev) => (prev === key ? null : key));
  };

  // Keep ref in sync for popstate handler
  React.useEffect(() => {
    selectedProjectRef.current = selectedProject;
  }, [selectedProject]);

  // Load SharePoint folders for selected project
  React.useEffect(() => {
    if (!selectedProject || !companyId || !projectPhaseKey) {
      setSelectedProjectFolders([]);
      return;
    }

    const projectPhase = getProjectPhase(selectedProject);
    const isKalkylskede = projectPhase.key === 'kalkylskede';
    
    // Don't load folders for kalkylskede projects
    if (isKalkylskede) {
      setSelectedProjectFolders([]);
      return;
    }

    (async () => {
      try {
        const folders = await getProjectFolders(companyId, selectedProject.id, projectPhaseKey);
        setSelectedProjectFolders(folders);
      } catch (error) {
        console.error('[HomeScreen] Error loading project folders:', error);
        setSelectedProjectFolders([]);
      }
    })();
  }, [selectedProject, companyId, projectPhaseKey]);

  // Close dashboard dropdowns when navigating into a project (avoid leaving overlays open)
  React.useEffect(() => {
    try {
      // Clear dropdown focus whenever selectedProject changes (entering or leaving a project)
      setDashboardFocus(null);
      setDashboardDropdownTop(null);
      setDashboardHoveredStatKey(null);
    } catch (e) {}
  }, [selectedProject]);

  const handleInlineLockChange = React.useCallback((locked) => {
    setIsInlineLocked(!!locked);
  }, []);

  const requestProjectSwitch = React.useCallback((project, opts = {}) => {
    if (!project) {
      if (Object.prototype.hasOwnProperty.call(opts, 'selectedAction')) {
        setProjectSelectedAction(opts.selectedAction);
      }
      try { setSelectedProjectPath(null); } catch (_e) {}
      setSelectedProject(null);
      return;
    }

    const nextProject = { ...project };
    const selectedActionProvided = Object.prototype.hasOwnProperty.call(opts, 'selectedAction');
    const clearActionAfter = !!opts.clearActionAfter;

    if (Platform.OS === 'web' && isInlineLocked) {
      pendingProjectSwitchRef.current = {
        project: nextProject,
        selectedAction: selectedActionProvided ? opts.selectedAction : null,
        clearActionAfter,
      };
      try {
        window.dispatchEvent(new CustomEvent('dkInlineAttemptExit'));
      } catch(_e) {
        // Fallback: if event dispatch fails, proceed immediately.
        if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
        try {
          const p = opts?.path;
          setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
        } catch (_e2) {}
        setSelectedProject(nextProject);
        if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
      }
      return;
    }

    if (selectedActionProvided) setProjectSelectedAction(opts.selectedAction);
    try {
      const p = opts?.path;
      setSelectedProjectPath(p ? { ...p, projectId: String(nextProject?.id || '') } : null);
    } catch (_e) {}
    setSelectedProject(nextProject);
    if (clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
  }, [isInlineLocked]);

  // Handle simple project creation for Kalkylskede (must be after requestProjectSwitch declaration)
  const handleCreateSimpleProject = React.useCallback(async () => {
    if (creatingProject || !canCreateSimpleProject) return;
    setCreatingProject(true);
    try {
      const projectId = String(newProjectNumber ?? '').trim();
      const projectName = String(newProjectName ?? '').trim();
      const parentSubId = simpleProjectModal.parentSubId;
      const parentMainId = simpleProjectModal.parentMainId;
      let mainId = parentMainId || null;
      let subId = parentSubId || null;
      
      // If no parentSubId, we need to create project in main folder (but this shouldn't happen in kalkylskede)
      // For now, require parentSubId
      if (!parentSubId) {
        console.error('parentSubId is required. Projects must be created in a subfolder.');
        setCreatingProject(false);
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Projekt måste skapas i en undermapp. Skapa en undermapp först genom att högerklicka på huvudmappen och välja "Lägg till undermapp".');
        } else {
          Alert.alert('Fel', 'Projekt måste skapas i en undermapp. Skapa en undermapp först.');
        }
        return;
      }
      
      // Insert new project into selected subfolder
      setHierarchy(prev => {
        const updated = prev.map(main => {
          // If we have parentMainId, only process that main folder
          if (parentMainId && main.id !== parentMainId) {
            return main;
          }
          
          return {
            ...main,
            children: main.children.map(sub =>
              sub.id === parentSubId
                ? {
                    ...sub,
                    children: [
                      ...(sub.children || []),
                      {
                        id: projectId,
                        name: projectName,
                        type: 'project',
                        status: 'ongoing',
                        phase: selectedPhase || DEFAULT_PHASE,
                        createdAt: new Date().toISOString(),
                        createdBy: auth?.currentUser?.email || ''
                      }
                    ]
                  }
                : sub
            )
          };
        });
        
        // Find mainId if not already set
        if (!mainId) {
          for (const main of updated) {
            for (const sub of main.children || []) {
              if (sub.id === parentSubId) {
                mainId = main.id;
                break;
              }
            }
            if (mainId) break;
          }
        }
        
        return updated;
      });
      
      // Store project info for callback
      simpleProjectCreatedRef.current = { projectId, projectName, mainId, subId: parentSubId };
      
      // Wait a moment for hierarchy to update and save
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Show success popup
      setCreatingProject(false);
      setSimpleProjectSuccessModal(true);
    } catch (error) {
      console.error('Error creating simple project:', error);
      setCreatingProject(false);
    }
  }, [creatingProject, canCreateSimpleProject, newProjectNumber, newProjectName, simpleProjectModal.parentSubId, selectedPhase, setHierarchy, auth?.currentUser?.email]);

  // Handle simple project success modal close and navigation
  const handleSimpleProjectSuccessClose = React.useCallback(() => {
    setSimpleProjectSuccessModal(false);
    const projectInfo = simpleProjectCreatedRef.current;
    simpleProjectCreatedRef.current = null;
    
    // Close modal and reset fields
    setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
    setNewProjectName('');
    setNewProjectNumber('');
    
    // Find and open the created project
    setTimeout(() => {
      if (!projectInfo) return;
      
      // Recursively find project - no assumptions about depth
      const findProjectInHierarchy = (hierarchy, targetId) => {
        const findRecursive = (nodes, path = []) => {
          if (!Array.isArray(nodes)) return null;
          for (const node of nodes) {
            if (node && node.type === 'project' && String(node.id) === String(targetId)) {
              // Return project with path information (last 2 levels if available)
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
        return findRecursive(hierarchy || []);
        return null;
      };

      // Use hierarchyRef to get the latest hierarchy state
      const currentHierarchy = hierarchyRef.current || [];
      const found = findProjectInHierarchy(currentHierarchy, projectInfo.projectId);
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
  }, [requestProjectSwitch]);

  const handleInlineViewChange = React.useCallback((payload) => {
    try {
      if (!payload) {
        setProjectInlineViewLabel(null);
        return;
      }
      if (typeof payload === 'string') {
        const v = String(payload || '').trim();
        setProjectInlineViewLabel(v || null);
        return;
      }
      const label = String(payload?.label || '').trim();
      setProjectInlineViewLabel(label || null);
    } catch (_e) {
      try { setProjectInlineViewLabel(null); } catch (__e) {}
    }
  }, []);

  React.useEffect(() => {
    // Clear leaf when leaving project or switching to template-inline editor.
    if (!selectedProject) {
      setProjectInlineViewLabel(null);
      return;
    }
    if (inlineControlEditor) {
      setProjectInlineViewLabel(null);
    }
  }, [selectedProject, inlineControlEditor]);

  const findProjectPathById = React.useCallback((projectId) => {
    if (!projectId) return null;
    const targetId = String(projectId);
    try {
      const tree = hierarchyRef.current || [];
      const isProjectNode = (node) => {
        try {
          if (!node) return false;
          const t = String(node?.type || node?.kind || node?.nodeType || '').toLowerCase();
          if (t) return t === 'project';
          // fallback: looks like a project (id + name) and isn't a folder with children
          if (node.id == null) return false;
          if (typeof node.name !== 'string') return false;
          if (Array.isArray(node.children)) return false;
          return true;
        } catch (_e) {
          return false;
        }
      };

      for (const main of tree) {
        for (const sub of (main?.children || [])) {
          const proj = (sub?.children || []).find((ch) => ch && String(ch.id) === targetId && isProjectNode(ch));
          if (proj) return { main, sub, project: proj };
        }
      }
    } catch (_e) {}
    return null;
  }, []);

  // Breadcrumb navigation hook
  const { applyBreadcrumbTarget, navigateViaBreadcrumb } = useBreadcrumbNavigation({
    hierarchy,
    setHierarchy,
    findProjectPathById,
    setSelectedProject,
    setSelectedProjectPath,
    setInlineControlEditor,
    setProjectSelectedAction,
    isInlineLocked,
    pendingBreadcrumbNavRef,
    requestProjectSwitch,
  });

  // Allow the global header breadcrumb (App.js) to drive navigation inside Home.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onNav = (event) => {
      try {
        const target = event?.detail?.target ?? event?.detail;
        if (!target) return;
        navigateViaBreadcrumb(target);
      } catch (_e) {}
    };

    try { window.addEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    return () => {
      try { window.removeEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    };
  }, [navigateViaBreadcrumb]);

  // Publish the current Home breadcrumb (Dashboard / main / sub / project / control) for the global header.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    try {
      const selectedProjectId = selectedProject?.id ? String(selectedProject.id) : null;

      const resolveFolderLabel = (node, fallback) => {
        try {
          const text = String(node?.name || node?.title || node?.label || '').trim();
          if (text) return text;
          const idText = String(node?.id || '').trim();
          return idText || fallback;
        } catch (_e) {
          return fallback;
        }
      };

      // Prefer deriving main/sub from the selected project's actual path
      // (or from the explicit click-path when selecting in the tree), so breadcrumb
      // stays correct even if the tree UI isn't expanded.
      let path = null;
      try {
        if (selectedProjectId && selectedProjectPath?.mainId && selectedProjectPath?.subId) {
          const main = (hierarchy || []).find((m) => m && String(m.id) === String(selectedProjectPath.mainId)) || null;
          const sub = main && Array.isArray(main.children)
            ? (main.children || []).find((s) => s && String(s.id) === String(selectedProjectPath.subId))
            : null;
          path = {
            main: main || { id: selectedProjectPath.mainId, name: selectedProjectPath.mainName || '' },
            sub: sub || { id: selectedProjectPath.subId, name: selectedProjectPath.subName || '' },
            project: null,
          };
        }
      } catch (_e) { path = null; }
      try {
        if (!path && selectedProjectId) path = findProjectPathById(selectedProjectId);
      } catch (_e) { /* ignore */ }

      const expandedMain = (path && path.main) ? path.main : (hierarchy || []).find((m) => m && m.expanded);
      const expandedSub = (path && path.sub)
        ? path.sub
        : (expandedMain && Array.isArray(expandedMain.children)
          ? expandedMain.children.find((s) => s && s.expanded)
          : null);

      const projectId = selectedProjectId;
      const projectLabel = selectedProject
        ? `${String(selectedProject?.id || '').trim()} — ${String(selectedProject?.name || '').trim()}`.trim().replace(/^—\s*/, '')
        : '';

      const leafLabel = inlineControlEditor && inlineControlEditor.controlType
        ? String(inlineControlEditor.controlType).trim()
        : (projectInlineViewLabel ? String(projectInlineViewLabel).trim() : '');

      const segments = [];
      segments.push({ label: 'Startsida', target: { kind: 'dashboard' } });
      if (expandedMain) segments.push({ label: resolveFolderLabel(expandedMain, 'Huvudmapp'), target: { kind: 'main', mainId: expandedMain.id } });
      if (expandedMain && expandedSub) segments.push({ label: resolveFolderLabel(expandedSub, 'Undermapp'), target: { kind: 'sub', mainId: expandedMain.id, subId: expandedSub.id } });
      if (projectId) segments.push({ label: projectLabel || 'Projekt', target: { kind: 'project', projectId } });
      if (projectId && leafLabel) segments.push({ label: leafLabel, target: { kind: 'noop' } });

      // Cache latest segments so the global header can read immediately on mount,
      // even if it missed the first event or CustomEvent isn't supported.
      try { window.__dkBreadcrumbHomeSegments = segments; } catch (_e) {}

      try {
        const detail = { scope: 'home', segments };
        const evt = (typeof CustomEvent === 'function')
          ? new CustomEvent('dkBreadcrumbUpdate', { detail })
          : (() => {
            const e = document.createEvent('Event');
            e.initEvent('dkBreadcrumbUpdate', true, true);
            e.detail = detail;
            return e;
          })();
        window.dispatchEvent(evt);
      } catch (_e) {}
    } catch (_e) {}
  }, [hierarchy, selectedProject, selectedProjectPath, projectInlineViewLabel, inlineControlEditor, findProjectPathById]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onDecision = (event) => {
      const decision = event?.detail?.decision;
      const pendingSwitch = pendingProjectSwitchRef.current;
      pendingProjectSwitchRef.current = null;

      const pendingBreadcrumb = pendingBreadcrumbNavRef.current;
      pendingBreadcrumbNavRef.current = null;

      if (decision !== 'draft' && decision !== 'abort') return;

      if (pendingSwitch && pendingSwitch.project) {
        try { setProjectSelectedAction(pendingSwitch.selectedAction ?? null); } catch(_e) {}
        setSelectedProject({ ...pendingSwitch.project });
        if (pendingSwitch.clearActionAfter) setTimeout(() => setProjectSelectedAction(null), 0);
      }

      if (pendingBreadcrumb) {
        applyBreadcrumbTarget(pendingBreadcrumb);
      }
    };

    window.addEventListener('dkInlineExitDecision', onDecision);
    return () => {
      try { window.removeEventListener('dkInlineExitDecision', onDecision); } catch(_e) {}
    };
  }, []);

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

  const toTsMs = React.useCallback((value) => {
    try {
      if (value === null || value === undefined) return 0;
      if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
      if (typeof value === 'string') return new Date(value).getTime() || 0;
      if (typeof value?.toDate === 'function') return value.toDate().getTime() || 0;
      if (typeof value?.seconds === 'number') return (value.seconds * 1000) + (typeof value.nanoseconds === 'number' ? Math.floor(value.nanoseconds / 1e6) : 0);
      return new Date(value).getTime() || 0;
    } catch(_e) {
      return 0;
    }
  }, []);

  const formatRelativeTime = React.useCallback((isoLike) => {
    try {
      const t = toTsMs(isoLike);
      if (!t) return '';
      const diffMs = Date.now() - t;
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      if (diffSec < 60) return 'för nyss';
      const diffMin = Math.floor(diffSec / 60);
      if (diffMin < 60) return `för ${diffMin} minut${diffMin === 1 ? '' : 'er'} sedan`;
      const diffH = Math.floor(diffMin / 60);
      if (diffH < 24) return `för ${diffH} tim${diffH === 1 ? 'me' : 'mar'} sedan`;
      const diffD = Math.floor(diffH / 24);
      if (diffD < 7) return `för ${diffD} dag${diffD === 1 ? '' : 'ar'} sedan`;
      return new Date(t).toLocaleDateString('sv-SE');
    } catch(_e) {
      return '';
    }
  }, [toTsMs]);

  const computeOpenDeviationsCount = React.useCallback((controls) => {
    try {
      let open = 0;
      for (const item of (controls || [])) {
        if (!item || item.type !== 'Skyddsrond') continue;
        // Saved controls may use different shapes over time:
        // - Newer: item.checklist (array of sections) with section.remediation keyed by point text
        // - Older: item.checklistSections with section.remediation indexed by point index
        const sections = Array.isArray(item.checklistSections)
          ? item.checklistSections
          : (Array.isArray(item.checklist) ? item.checklist : null);
        if (!Array.isArray(sections)) continue;
        for (const section of sections) {
          if (!section || !Array.isArray(section.statuses)) continue;
          section.statuses.forEach((status, idx) => {
            if (status !== 'avvikelse') return;
            const points = Array.isArray(section.points) ? section.points : [];
            const pt = points[idx];
            const rem = section.remediation
              ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[idx]
              : null;
            const handled = !!rem;
            if (!handled) open += 1;
          });
        }
      }
      return open;
    } catch(_e) {
      return 0;
    }
  }, []);

  const computeControlsToSign = React.useCallback((drafts) => {
    try {
      let count = 0;
      for (const item of (drafts || [])) {
        if (!item) continue;
        const type = String(item.type || '');
        if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') continue;
        const sigs = item.mottagningsSignatures;
        if (!Array.isArray(sigs) || sigs.length === 0) count++;
      }
      return count;
    } catch(_e) {
      return 0;
    }
  }, []);

  const countActiveProjects = React.useCallback(() => {
    try {
      let active = 0;
      const tree = hierarchyRef.current || [];
      for (const main of tree) {
        for (const sub of (main.children || [])) {
          for (const child of (sub.children || [])) {
            if (child && child.type === 'project') {
              const status = child.status || 'ongoing';
              if (status !== 'completed') active++;
            }
          }
        }
      }
      return active;
    } catch(_e) {
      return 0;
    }
  }, []);

  const loadDashboard = React.useCallback(async () => {
    setDashboardLoading(true);
    try {
      const [draftRaw, completedRaw] = await Promise.all([
        AsyncStorage.getItem('draft_controls'),
        AsyncStorage.getItem('completed_controls'),
      ]);
      const drafts = draftRaw ? (JSON.parse(draftRaw) || []) : [];
      const completed = completedRaw ? (JSON.parse(completedRaw) || []) : [];

      // Important: draft/completed controls are stored locally without company-scoping.
      // Filter them to only include projects that exist in the current company's hierarchy.
      const allowedProjectIds = new Set();
      try {
        // Recursively find all projects - no assumptions about depth
        const findAllProjects = (nodes) => {
          if (!Array.isArray(nodes)) return;
          nodes.forEach(node => {
            if (node && node.type === 'project' && node.id) {
              allowedProjectIds.add(String(node.id));
            }
            if (node && node.children && Array.isArray(node.children)) {
              findAllProjects(node.children);
            }
          });
        };
        findAllProjects(hierarchyRef.current || []);
      } catch(_e) {}

      const pickProjectId = (item) => {
        const pid = item?.project?.id || item?.projectId || item?.project || null;
        return pid ? String(pid) : null;
      };

      const filteredDrafts = (drafts || []).filter((d) => {
        const pid = pickProjectId(d);
        return pid && allowedProjectIds.has(pid);
      });
      const filteredCompleted = (completed || []).filter((c) => {
        const pid = pickProjectId(c);
        return pid && allowedProjectIds.has(pid);
      });

      // Store lists for dashboard drill-down
      try { setDashboardDraftItems(Array.isArray(filteredDrafts) ? filteredDrafts : []); } catch(_e) {}

      try {
        const activeList = [];
        const tree = hierarchyRef.current || [];
        for (const main of tree) {
          for (const sub of (main.children || [])) {
            for (const child of (sub.children || [])) {
              if (!child || child.type !== 'project') continue;
              const status = child.status || 'ongoing';
              if (status === 'completed') continue;
              activeList.push(child);
            }
          }
        }
        setDashboardActiveProjectsList(activeList);
      } catch(_e) {
        try { setDashboardActiveProjectsList([]); } catch(_e) {}
      }

      try {
        const needSign = (filteredDrafts || []).filter((item) => {
          if (!item) return false;
          const type = String(item.type || '');
          if (type !== 'Mottagningskontroll' && type !== 'Riskbedömning') return false;
          const sigs = item.mottagningsSignatures;
          return !Array.isArray(sigs) || sigs.length === 0;
        });
        setDashboardControlsToSignItems(needSign);
      } catch(_e) {
        try { setDashboardControlsToSignItems([]); } catch(_e) {}
      }

      const activeProjects = countActiveProjects();
      const openDeviations = computeOpenDeviationsCount(filteredCompleted);
      const controlsToSign = computeControlsToSign(filteredDrafts);

      // Skyddsrond interval reminders (default: 14 days)
      const MS_DAY = 24 * 60 * 60 * 1000;
      const NOW = Date.now();
      const SOON_THRESHOLD_DAYS = 3;
      const lastSkyddsrondByProject = new Map();
      try {
        (filteredCompleted || []).forEach((c) => {
          if (!c || c.type !== 'Skyddsrond') return;
          const pid = pickProjectId(c);
          if (!pid) return;
          const ts = toTsMs(c.date || c.savedAt || c.updatedAt || c.createdAt || null);
          if (!ts) return;
          const prev = lastSkyddsrondByProject.get(pid) || 0;
          if (ts > prev) lastSkyddsrondByProject.set(pid, ts);
        });
      } catch(_e) {}

      let skyddsrondOverdue = 0;
      let skyddsrondDueSoon = 0;
      const upcomingSkyddsrond = [];
      try {
        const tree = hierarchyRef.current || [];
        for (const main of tree) {
          for (const sub of (main.children || [])) {
            for (const child of (sub.children || [])) {
              if (!child || child.type !== 'project' || !child.id) continue;
              const status = child.status || 'ongoing';
              if (status === 'completed') continue;

              const pid = String(child.id);
              const enabled = child.skyddsrondEnabled !== false;
              if (!enabled) continue;

              const intervalWeeksRaw = Number(child.skyddsrondIntervalWeeks);
              const intervalDaysRaw = Number(child.skyddsrondIntervalDays);
              const intervalDays = (Number.isFinite(intervalWeeksRaw) && intervalWeeksRaw > 0)
                ? (intervalWeeksRaw * 7)
                : (Number.isFinite(intervalDaysRaw) && intervalDaysRaw > 0 ? intervalDaysRaw : 14);

              const lastMs = lastSkyddsrondByProject.get(pid) || 0;
              const firstDueMs = toTsMs(child.skyddsrondFirstDueDate || null);
              const baselineMs = lastMs || toTsMs(child.createdAt || null) || NOW;
              const nextDueMs = lastMs
                ? (baselineMs + intervalDays * MS_DAY)
                : (firstDueMs || (baselineMs + intervalDays * MS_DAY));

              if (NOW > nextDueMs) {
                skyddsrondOverdue += 1;
                upcomingSkyddsrond.push({ project: child, nextDueMs, state: 'overdue' });
              } else if ((nextDueMs - NOW) <= (SOON_THRESHOLD_DAYS * MS_DAY)) {
                skyddsrondDueSoon += 1;
                upcomingSkyddsrond.push({ project: child, nextDueMs, state: 'dueSoon' });
              }
            }
          }
        }
      } catch(_e) {}

      try {
        upcomingSkyddsrond.sort((a, b) => Number(a?.nextDueMs || 0) - Number(b?.nextDueMs || 0));
        setDashboardUpcomingSkyddsrondItems(upcomingSkyddsrond);
      } catch(_e) {
        try { setDashboardUpcomingSkyddsrondItems([]); } catch(_e) {}
      }

      const countOpenDeviationsForControl = (control) => {
        try {
          if (!control || control.type !== 'Skyddsrond') return 0;
          const sections = Array.isArray(control.checklistSections)
            ? control.checklistSections
            : (Array.isArray(control.checklist) ? control.checklist : null);
          if (!Array.isArray(sections)) return 0;
          let open = 0;
          for (const section of sections) {
            if (!section || !Array.isArray(section.statuses)) continue;
            const points = Array.isArray(section.points) ? section.points : [];
            for (let i = 0; i < section.statuses.length; i++) {
              if (section.statuses[i] !== 'avvikelse') continue;
              const pt = points[i];
              const rem = section.remediation
                ? ((pt !== undefined && pt !== null) ? section.remediation[pt] : null) || section.remediation[i]
                : null;
              if (!rem) open += 1;
            }
          }
          return open;
        } catch(_e) {
          return 0;
        }
      };

      try {
        const openDevItems = (filteredCompleted || [])
          .filter((c) => c && c.type === 'Skyddsrond')
          .map((c) => ({ control: c, openCount: countOpenDeviationsForControl(c) }))
          .filter((x) => (x.openCount || 0) > 0);
        setDashboardOpenDeviationItems(openDevItems);
      } catch(_e) {
        try { setDashboardOpenDeviationItems([]); } catch(_e) {}
      }

      const recent = [];
      const pushRecent = (item, kind) => {
        if (!item || typeof item !== 'object') return;
        const ts = item.savedAt || item.updatedAt || item.createdAt || item.date || null;
        const projectId = pickProjectId(item);
        if (!projectId) return;
        // Only show activity for projects we know belong to this company.
        if (!allowedProjectIds.has(projectId)) return;
        const projObj = findProjectById(projectId);
        if (!projObj) return;
        const projectName = projObj?.name || null;
        const desc = String(item.deliveryDesc || item.materialDesc || item.generalNote || item.description || '').trim();
        // Try to enrich with actor info from companyActivity if available
        let actorName = null;
        let actorEmail = null;
        let actorUid = null;
        try {
          if (Array.isArray(companyActivity) && companyActivity.length > 0) {
            // find an activity event matching this project + type and close timestamp
            const approxTs = toTsMs(ts || 0);
            const match = companyActivity.find(ev => {
              try {
                const evProj = ev.projectId || (ev.project && ev.project.id) || null;
                if (!evProj || String(evProj) !== String(projectId)) return false;
                const evType = String(ev.type || ev.eventType || ev.kind || '').toLowerCase();
                const itType = String(item.type || kind || '').toLowerCase();
                if (itType && evType && evType !== itType) {
                  // allow drafts/completed to map to same type name
                }
                const evTs = toTsMs(ev.ts || ev.createdAt || ev.updatedAt || 0);
                if (approxTs && evTs) {
                  const diff = Math.abs(approxTs - evTs);
                  if (diff > 120000) return false; // require within 2 minutes
                }
                return true;
              } catch(_e) { return false; }
            });
            if (match) {
              actorName = match.actorName || match.displayName || match.actor || null;
              actorEmail = match.actorEmail || match.email || null;
              actorUid = match.uid || null;
            }
          }
        } catch(_e) {}
        // Fallbacks: check item/raw for createdBy/author fields
        try {
          if (!actorName) {
            const raw = item.raw || item.payload || item || {};
            // common shapes: createdBy: { uid, email, displayName } or createdBy: 'email' or createdBy: uid
            const cb = raw.createdBy || raw.creator || raw.author || raw.createdByUid || raw.createdById || null;
            if (cb) {
              if (typeof cb === 'string') {
                // Could be email or uid
                actorEmail = actorEmail || (cb.includes('@') ? cb : actorEmail);
                actorUid = actorUid || (cb.includes('@') ? actorUid : cb);
                actorName = actorName || null;
              } else if (typeof cb === 'object') {
                actorName = actorName || cb.displayName || cb.name || cb.fullName || null;
                actorEmail = actorEmail || cb.email || cb.mail || null;
                actorUid = actorUid || cb.uid || cb.id || null;
              }
            }
            // other ad-hoc fields
            actorName = actorName || raw.actorName || raw.actor || raw.username || raw.userName || raw.userDisplayName || null;
            actorEmail = actorEmail || raw.actorEmail || raw.email || null;
            actorUid = actorUid || raw.uid || raw.userId || raw.userUID || null;
          }
        } catch(_e) {}

        recent.push({
          kind,
          type: item.type || kind,
          ts,
          projectId,
          projectName,
          desc,
          openDeviationsCount: (kind === 'completed' && item.type === 'Skyddsrond') ? countOpenDeviationsForControl(item) : 0,
          actorName: actorName || null,
          actorEmail: actorEmail || null,
          uid: actorUid || null,
          raw: item,
        });
      };
      (filteredCompleted || []).forEach((c) => pushRecent(c, 'completed'));
      (filteredDrafts || []).forEach((d) => pushRecent(d, 'draft'));

      // Merge in company activity (e.g. login events and control-related events).
      try {
        const events = Array.isArray(companyActivity) ? companyActivity : [];
        // Add login events (deduped by identity)
        try {
          const loginEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() === 'login').slice().sort((a, b) => {
            const ta = toTsMs(a.ts || a.createdAt || a.updatedAt || 0);
            const tb = toTsMs(b.ts || b.createdAt || b.updatedAt || 0);
            return tb - ta;
          });
          const seen = new Set();
          for (const ev of loginEvents) {
            if (!ev || typeof ev !== 'object') continue;
            const idKey = String(ev.uid || ev.email || ev.displayName || '').trim().toLowerCase();
            const key = idKey || '__noid';
            if (seen.has(key)) continue;
            seen.add(key);
            const who = formatPersonName(ev.displayName || ev.email || ev.uid || '');
            recent.push({
              kind: 'company',
              type: 'login',
              ts: ev.ts || ev.createdAt || ev.updatedAt || null,
              projectId: null,
              projectName: null,
              desc: who ? `Loggade in: ${who}` : 'Loggade in',
              actorName: ev.displayName || null,
              actorEmail: ev.email || null,
              uid: ev.uid || null,
              raw: ev,
            });
          }
        } catch(_e) {}

        // Add other company events (drafts, completed controls, etc.) so actor info is visible
        try {
          const otherEvents = (events || []).filter(ev => ev && typeof ev === 'object' && String(ev.type || '').toLowerCase() !== 'login');
          for (const ev of otherEvents) {
            try {
              const t = ev.type || ev.eventType || ev.kind || null;
              const ts = ev.ts || ev.createdAt || ev.updatedAt || null;
              const projectId = ev.projectId || (ev.project && ev.project.id) || null;
              const projectName = ev.projectName || (ev.project && ev.project.name) || null;
              const desc = ev.label || ev.message || ev.msg || '';
              recent.push({
                kind: ev.kind || 'company',
                type: t,
                ts,
                projectId,
                projectName,
                desc,
                actorName: ev.actorName || ev.displayName || null,
                actorEmail: ev.actorEmail || ev.email || null,
                uid: ev.uid || null,
                raw: ev,
              });
            } catch(_e) {}
          }
        } catch(_e) {}
      } catch(_e) {}
      recent.sort((a, b) => {
        return toTsMs(b.ts) - toTsMs(a.ts);
      });
      const top = recent.slice(0, 8);

      // Derive recent projects from recent activity (unique by projectId)
      const projMap = new Map();
      for (const r of recent) {
        if (!r.projectId) continue;
        const prev = projMap.get(r.projectId);
        const t = toTsMs(r.ts);
        if (!prev || t > prev.ts) projMap.set(r.projectId, { ts: t });
      }
      const recentProjects = Array.from(projMap.entries())
        .map(([projectId, meta]) => {
          const p = findProjectById(projectId);
          return p ? { project: p, projectId: String(projectId), ts: meta.ts } : null;
        })
        .filter(Boolean)
        .sort((a, b) => (b.ts || 0) - (a.ts || 0))
        .slice(0, 8);

      setDashboardOverview({
        activeProjects,
        openDeviations,
        skyddsrondOverdue,
        skyddsrondDueSoon,
        controlsToSign,
        drafts: Array.isArray(filteredDrafts) ? filteredDrafts.length : 0,
      });
      setDashboardRecent(top);
      setDashboardRecentProjects(recentProjects);
    } catch(_e) {
      setDashboardOverview({ activeProjects: 0, openDeviations: 0, skyddsrondOverdue: 0, skyddsrondDueSoon: 0, controlsToSign: 0, drafts: 0 });
      setDashboardRecent([]);
      setDashboardRecentProjects([]);
    } finally {
      setDashboardLoading(false);
    }
  }, [companyActivity, countActiveProjects, computeControlsToSign, computeOpenDeviationsCount, findProjectById, toTsMs]);

  // Web: keep browser back/forward in sync with selectedProject
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history) return;

    // Ensure we have a stable "home" state
    try {
      const st = window.history.state || {};
      if (!st.dkView) window.history.replaceState({ ...st, dkView: 'home' }, '');
    } catch(_e) {}

    const onPopState = (e) => {
      try {
        const st = e?.state || window.history.state || {};
        if (st && st.dkView === 'project' && st.projectId) {
          const proj = findProjectById(st.projectId);
          // Clear any pending dashboard action when navigating with browser back/forward.
          setProjectSelectedAction(null);
          try { setSelectedProjectPath(null); } catch (_e) {}
          if (proj) setSelectedProject({ ...proj });
          else setSelectedProject(null);
        } else {
          setProjectSelectedAction(null);
          try { setSelectedProjectPath(null); } catch (_e) {}
          setSelectedProject(null);
        }
      } catch(_e) {
        setProjectSelectedAction(null);
        try { setSelectedProjectPath(null); } catch (_e2) {}
        setSelectedProject(null);
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      try { window.removeEventListener('popstate', onPopState); } catch(_e) {}
    };
  }, [findProjectById]);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history || typeof window.history.pushState !== 'function') return;

    const proj = selectedProject;
    if (proj && proj.id) {
      try {
        const st = window.history.state || {};
        // Avoid pushing duplicates
        if (st.dkView === 'project' && String(st.projectId || '') === String(proj.id)) return;
        window.history.pushState({ ...st, dkView: 'project', projectId: String(proj.id) }, '');
      } catch(_e) {}
    }
  }, [selectedProject]);

  const closeSelectedProject = React.useCallback(() => {
    // Om vi är i inline-redigeringsläge, ta bort det temporära projektet om inget är ifyllt
    if (creatingProjectInline && selectedProject?.isTemporary) {
      if (!newProjectNumber.trim() && !newProjectName.trim()) {
        setCreatingProjectInline(null);
        setNewProjectName('');
        setNewProjectNumber('');
        resetProjectFields();
        setProjectSelectedAction(null);
        try { setSelectedProjectPath(null); } catch (_e) {}
        setSelectedProject(null);
        return;
      } else {
        Alert.alert(
          'Avbryt skapande?',
          'Om du stänger nu kommer projektet inte att sparas.',
          [
            { text: 'Fortsätt redigera', style: 'cancel' },
            {
              text: 'Stäng',
              style: 'destructive',
              onPress: () => {
                setCreatingProjectInline(null);
                setNewProjectName('');
                setNewProjectNumber('');
                resetProjectFields();
                setProjectSelectedAction(null);
                try { setSelectedProjectPath(null); } catch (_e) {}
                setSelectedProject(null);
              }
            }
          ]
        );
        return;
      }
    }
    
    // UX requirement: the in-app back button should always leave the project
    // and return to the dashboard (not the previously opened project).
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window.history && typeof window.history.replaceState === 'function') {
      try {
        const st = window.history.state || {};
        window.history.replaceState({ ...st, dkView: 'home', projectId: null }, '');
      } catch(_e) {}
    }
    setProjectSelectedAction(null);
    try { setSelectedProjectPath(null); } catch (_e) {}
    setSelectedProject(null);
  }, [creatingProjectInline, selectedProject, newProjectNumber, newProjectName, resetProjectFields]);

  const openInlineControlEditor = React.useCallback((project, controlType, templateId = null) => {
    if (!project || !controlType) return;
    try { setSelectedProjectPath(null); } catch (_e) {}
    setSelectedProject(project);
    setInlineControlEditor({ project, controlType, templateId });
    setProjectSelectedAction(null);
  }, []);

  const closeInlineControlEditor = React.useCallback(() => {
    setInlineControlEditor(null);
  }, []);

  const handleInlineControlFinished = React.useCallback(() => {
    try {
      showAlert('Sparad', 'Kontrollen är sparad.');
    } catch(_e) {}
    setInlineControlEditor(null);
    setProjectControlsRefreshNonce((n) => n + 1);
  }, []);

  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    // Refresh dashboard when returning to start panel or after sync/hierarchy changes.
    if (!selectedProject) loadDashboard();
  }, [selectedProject, syncStatus, hierarchy, companyActivity, loadDashboard]);

  // Realtime company activity feed (company-scoped).
  React.useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    if (!cid) return;
    const unsub = subscribeCompanyActivity(cid, {
      limitCount: 25,
      onData: (items) => {
        try { setCompanyActivity(Array.isArray(items) ? items : []); } catch(_e) {}
      },
      onError: () => {},
    });
    return () => {
      try { if (typeof unsub === 'function') unsub(); } catch(_e) {}
    };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Log a login event (throttled) so other users can see who logs in.
  React.useEffect(() => {
    const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
    const user = auth?.currentUser;
    if (!cid) return;
    if (!user?.uid && !user?.email) return;

    let cancelled = false;
    (async () => {
      try {
        const idPart = user?.uid || user?.email || 'unknown';
        const throttleKey = `dk_last_login_activity:${cid}:${idPart}`;
        const last = await AsyncStorage.getItem(throttleKey);
        if (last) {
          const lastMs = new Date(last).getTime() || 0;
          if (lastMs && (Date.now() - lastMs) < 5 * 60 * 1000) return;
        }
        const ok = await logCompanyActivity({
          type: 'login',
          uid: user?.uid || null,
          email: user?.email || null,
          displayName: user?.displayName || null,
        }, cid);
        if (!ok) return;
        if (cancelled) return;
        await AsyncStorage.setItem(throttleKey, new Date().toISOString());
      } catch(_e) {}
    })();

    return () => { cancelled = true; };
  }, [companyId, routeCompanyId, authClaims?.companyId]);

  // Ensure current user is written to the company members directory (so admin dropdown works)
  React.useEffect(() => {
    if (!companyId) return;
    if (!auth?.currentUser?.uid) return;
    // Inline the upsert to avoid any scope issues on native/web builds.
    (async () => {
      try {
        const user = auth?.currentUser;
        if (!user?.uid) return;
        const profile = await fetchUserProfile(user.uid).catch((e) => null);
        const displayName = profile?.displayName || profile?.name || (user.email ? String(user.email).split('@')[0] : null);
        const role = profile?.role || null;
        await upsertCompanyMember({
          companyId: routeCompanyId || null,
          uid: user.uid,
          displayName,
          email: user.email || null,
          role,
        });
      } catch(_e) {}
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId, auth?.currentUser?.uid]);

  // Keep ref in sync for early-defined helpers/modals
  React.useEffect(() => {
    hierarchyRef.current = hierarchy;
  }, [hierarchy]);

  // Company profile (used for per-company feature visibility)
  const [companyProfile, setCompanyProfile] = useState(null);
  const [controlTypes, setControlTypes] = useState(DEFAULT_CONTROL_TYPES);

  // Load full control type list (default + company-specific) for the active company
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setControlTypes(DEFAULT_CONTROL_TYPES);
        return;
      }
      try {
        const list = await fetchCompanyControlTypes(companyId);
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

  const controlTypeOptions = React.useMemo(() => {
    const baseList = Array.isArray(controlTypes) && controlTypes.length > 0
      ? controlTypes
      : DEFAULT_CONTROL_TYPES;

    // If we have any custom (non-builtin) control types, we treat the
    // per-company list as the source of truth and ignore the older
    // enabledControlTypes filter from the company profile.
    const hasCustomTypes = baseList.some(ct => ct && ct.builtin === false);

    let visible = baseList.filter(ct => ct && ct.hidden !== true);

    const enabled = companyProfile?.enabledControlTypes;
    if (!hasCustomTypes && Array.isArray(enabled) && enabled.length > 0) {
      const enabledSet = new Set(enabled.map(v => String(v || '').trim()).filter(Boolean));
      visible = visible.filter((ct) => {
        const name = String(ct.name || '').trim();
        const key = String(ct.key || '').trim();
        if (!enabledSet.size) return true;
        return (name && enabledSet.has(name)) || (key && enabledSet.has(key));
      });
    }

    return visible.map((ct) => ({
      type: ct.name || ct.key || '',
      icon: ct.icon || 'document-text-outline',
      color: ct.color || '#455A64',
    })).filter(o => o.type);
  }, [controlTypes, companyProfile]);

  // Load company profile when companyId changes
  React.useEffect(() => {
    let active = true;
    if (!companyId) {
      setCompanyProfile(null);
      return () => { active = false; };
    }
    fetchCompanyProfile(companyId)
      .then((p) => { if (active) setCompanyProfile(p || null); })
      .catch((e) => { /* ignore */ });
    return () => { active = false; };
  }, [companyId]);

  // Recompute whether any local fallback data exists (hierarki eller kontroller)
  async function refreshLocalFallbackFlag() {
    try {
      const [h, c, d] = await Promise.all([
        AsyncStorage.getItem('hierarchy_local'),
        AsyncStorage.getItem('completed_controls'),
        AsyncStorage.getItem('draft_controls'),
      ]);
      const exists = !!((h && h !== '[]') || (c && c !== '[]') || (d && d !== '[]'));
      setLocalFallbackExists(exists);
    } catch(_e) {}
  }
  
  // Debug helper: dump local AsyncStorage keys and compare with Firestore counts
  async function dumpLocalRemoteControls() {
    try {
      const keys = ['hierarchy_local', 'completed_controls', 'draft_controls', 'completed_controls_backup', 'draft_controls_backup'];
      const data = {};
      for (const k of keys) {
        try {
          const raw = await AsyncStorage.getItem(k);
          data[k] = raw ? JSON.parse(raw) : null;
        } catch(_e) { data[k] = null; }
      }
      // Build summary
      const summary = {
        completed_count: Array.isArray(data.completed_controls) ? data.completed_controls.length : 0,
        draft_count: Array.isArray(data.draft_controls) ? data.draft_controls.length : 0,
        backups: {
          completed_backup_exists: !!data.completed_controls_backup,
          draft_backup_exists: !!data.draft_controls_backup,
        },
      };

      // Query Firestore for any project IDs found in local completed controls
      const projectIds = new Set();
      (data.completed_controls || []).forEach(c => { if (c && c.project && c.project.id) projectIds.add(String(c.project.id)); });
      (data.draft_controls || []).forEach(d => { if (d && d.project && d.project.id) projectIds.add(String(d.project.id)); });

      const remoteInfo = {};
      for (const pid of projectIds) {
        try {
          const remote = await fetchControlsForProject(pid, companyId).catch((e) => []);
          remoteInfo[pid] = { remote_count: Array.isArray(remote) ? remote.length : 0, sample_ids: (remote || []).slice(0,5).map(r => r.id) };
        } catch(_e) {
          remoteInfo[pid] = { remote_count: -1, error: String(_e) };
        }
      }
      const final = { summary, remote: remoteInfo, sample_local_completed: (data.completed_controls || []).slice(0,5).map(c => ({ id: c.id, projectId: c.project?.id })) };
      try { console.log('[dumpLocalRemoteControls] full dump', final); } catch(_e) {}
      showAlert('Debug: lokal vs moln', JSON.stringify(final, null, 2).slice(0,1000));
    } catch(_e) {
      showAlert('Debug-fel', String(_e));
    }
  }

  // Show the last Firestore error saved by firebase helpers
  async function showLastFsError() {
    try {
      // Prefer the full errors array if available
      const rawArr = await AsyncStorage.getItem('dk_last_fs_errors');
      if (rawArr) {
        let parsedArr = null;
          try { parsedArr = JSON.parse(rawArr); } catch(_e) { parsedArr = [rawArr]; }
        // Show the most recent entry first (arrays can get huge)
        const last = Array.isArray(parsedArr) ? parsedArr[parsedArr.length - 1] : parsedArr;
        return showAlert('Senaste FS-fel', JSON.stringify(last, null, 2).slice(0,2000));
      }
      // Fallback to single-entry key for older records
      const raw = await AsyncStorage.getItem('dk_last_fs_error');
      if (!raw) return showAlert('Senaste FS-fel', 'Ingen fel-logg hittades.');
      let parsed = null;
      try { parsed = JSON.parse(raw); } catch(_e) { parsed = { raw }; }
      showAlert('Senaste FS-fel', JSON.stringify(parsed, null, 2).slice(0,2000));
    } catch(_e) {
      showAlert('Fel', 'Kunde inte läsa dk_last_fs_error: ' + (_e?.message || _e));
    }
  }
  

  // start background sync hook
  useBackgroundSync(companyId, { onStatus: (s) => setSyncStatus(s) });
  const didInitialLoadRef = React.useRef(false);
  const loadedHierarchyForCompanyRef = useRef(null);

  // Left column resizer state (default 300 för bättre bredd på web)
  const [leftWidth, setLeftWidth] = useState(300);
  const leftWidthRef = useRef(leftWidth);
  useEffect(() => { leftWidthRef.current = leftWidth; }, [leftWidth]);
  const initialLeftRef = useRef(0);

  // Right column resizer state (default 420)
  const [rightWidth, setRightWidth] = useState(420);
  const rightWidthRef = useRef(rightWidth);
  useEffect(() => { rightWidthRef.current = rightWidth; }, [rightWidth]);
  const initialRightRef = useRef(0);

  // PanResponder for resizing the left column (works on web + native)
  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, // Låt ScrollView hantera först
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Aktivera bara om det är en tydlig horisontell drag (minst 10px och mer horisontell än vertikal)
      const dx = Math.abs(gestureState.dx || 0);
      const dy = Math.abs(gestureState.dy || 0);
      return dx > 10 && dx > dy * 1.5; // Kräv att horisontell rörelse är minst 1.5x större än vertikal
    },
    onPanResponderGrant: () => {
      initialLeftRef.current = leftWidthRef.current;
    },
    onPanResponderMove: (evt, gestureState) => {
      const dx = gestureState.dx || 0;
      const newWidth = Math.max(240, Math.min(800, initialLeftRef.current + dx));
      setLeftWidth(newWidth);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  })).current;

  // PanResponder for resizing the right column (works on web + native)
  const panResponderRight = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false, // Låt ScrollView hantera först
    onMoveShouldSetPanResponder: (evt, gestureState) => {
      // Aktivera bara om det är en tydlig horisontell drag (minst 10px och mer horisontell än vertikal)
      const dx = Math.abs(gestureState.dx || 0);
      const dy = Math.abs(gestureState.dy || 0);
      return dx > 10 && dx > dy * 1.5; // Kräv att horisontell rörelse är minst 1.5x större än vertikal
    },
    onPanResponderGrant: () => {
      initialRightRef.current = rightWidthRef.current;
    },
    onPanResponderMove: (evt, gestureState) => {
      const dx = gestureState.dx || 0;
      // Dragging the left edge: moving right (dx>0) should decrease width, moving left (dx<0) should increase
      const newWidth = Math.max(340, Math.min(520, initialRightRef.current - dx));
      setRightWidth(newWidth);
    },
    onPanResponderRelease: () => {},
    onPanResponderTerminate: () => {},
  })).current;

  // Ensure panes start at reasonable widths on web after first mount
  const initialPaneWidthsSetRef = useRef(false);
  useEffect(() => {
    if (Platform.OS === 'web' && !initialPaneWidthsSetRef.current) {
      setLeftWidth(300); // Startbredd för left panel
      setRightWidth(420); // Behåll default
      initialPaneWidthsSetRef.current = true;
    }
  }, []);


  // Ladda hierarchy från Firestore när vi har companyId (route/stored/claims).
  // Viktigt på web: claims kommer ofta in efter första render, så vi måste re-run.
  React.useEffect(() => {
    let cancelled = false;

    (async () => {
      // Resolve company id robustly (order matters):
      // 1) explicit state/route
      // 2) persisted selection (dk_companyId)
      // 3) auth claims
      let cid = String(companyId || routeCompanyId || '').trim();

      if (!cid) {
        try {
          const stored = await AsyncStorage.getItem('dk_companyId');
          const storedTrim = String(stored || '').trim();
          if (storedTrim) {
            cid = storedTrim;
            try { setCompanyId(cid); } catch (_e) {}
          }
        } catch(_e) {}
      }

      // Legacy: try user profile by uid if present
      if (!cid && route?.params?.uid) {
        try {
          const userProfile = await fetchUserProfile(route.params.uid).catch(() => null);
          const profCid = String(userProfile?.companyId || '').trim();
          if (profCid) {
            cid = profCid;
            try { setCompanyId(cid); } catch (_e) {}
          }
        } catch(_e) {}
      }

      if (!cid) {
        const fromClaims = String(authClaims?.companyId || '').trim();
        if (fromClaims) {
          cid = fromClaims;
          try { setCompanyId(cid); } catch (_e) {}
        }
      }

      if (!cid) return;

      // Track companyId to reload when it changes
      const hierarchyKey = `${cid}`;
      if (didInitialLoadRef.current && loadedHierarchyForCompanyRef.current === hierarchyKey) return;
      loadedHierarchyForCompanyRef.current = hierarchyKey;

      if (cancelled) return;
      setLoadingHierarchy(true);

      // Load ALL root folders from SharePoint - SharePoint is the single source of truth
      // No Firestore fallback - SharePoint is required
      try {
        const { getSharePointHierarchy } = await import('../services/azure/hierarchyService');
        // Get ALL root folders (all phases) from SharePoint - no filtering
        const sharePointFolders = await getSharePointHierarchy(cid, null);
        
        if (cancelled) return;
        
        // Use SharePoint folders directly - no adapter, no Firestore
        setHierarchy(Array.isArray(sharePointFolders) ? sharePointFolders : []);
        console.log(`[HomeScreen] ✅ Loaded ${sharePointFolders?.length || 0} SharePoint folders for company: ${cid}`);
      } catch (error) {
        console.error('[HomeScreen] Error fetching SharePoint hierarchy:', error);
        if (cancelled) return;
        // SharePoint is required - show empty if connection fails
        setHierarchy([]);
      }

      setLoadingHierarchy(false);
      // mark that initial load completed to avoid initial empty save overwriting server
      didInitialLoadRef.current = true;
    })();

    return () => { cancelled = true; };
  }, [companyId, routeCompanyId, authClaims?.companyId]);
  // Removed selectedPhase from dependencies - SharePoint hierarchy is not phase-filtered

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

  // Spara hierarchy till Firestore varje gång den ändras (och companyId finns)
  React.useEffect(() => {
    if (!companyId) return;
    // don't save before initial load finished (avoid overwriting server with empty on mount)
    if (!didInitialLoadRef.current) return;
    
    // SÄKERHET: Validera att hierarkin inte är tom innan sparande
    const hierarchyArray = Array.isArray(hierarchy) ? hierarchy : [];
    if (hierarchyArray.length === 0) {
      // Om hierarkin är tom, försök ladda från server först
      // Detta förhindrar att tom hierarki skriver över befintlig data
      return;
    }
    
    (async () => {
      try {
        const res = await saveHierarchy(companyId, hierarchy);
        const ok = res === true || (res && res.ok === true);
        if (!ok) {
          // Firestore save failed — persist locally as fallback
          try {
            await AsyncStorage.setItem('hierarchy_local', JSON.stringify(hierarchy || []));
            setLocalFallbackExists(true);
            if (Platform.OS === 'web') {
              console.warn('[HomeScreen] Kunde inte spara hierarki till Firestore, sparad lokalt som backup');
            }
          } catch(_e) {}
        } else {
          // On successful cloud save, also clear local fallback
            try {
            await AsyncStorage.removeItem('hierarchy_local');
            await refreshLocalFallbackFlag();
          } catch(_e) {}
        }
      } catch(_e) {
        console.error('[HomeScreen] Fel vid sparande av hierarki:', _e);
        try {
          await AsyncStorage.setItem('hierarchy_local', JSON.stringify(hierarchy || []));
          setLocalFallbackExists(true);
        } catch(_e) {}
      }
    })();
     
  }, [hierarchy, companyId]);

  // DISABLED: Remove all top-level folders named 'test' after initial load
  // Detta var en cleanup-kod som automatiskt raderade mappar vid varje mount,
  // vilket kunde orsaka dataförlust. Borttagen för att förhindra oavsiktlig radering.
  // Om cleanup behövs, gör det manuellt eller med en explicit admin-funktion.
  // React.useEffect(() => {
  //   setHierarchy(prev => prev.filter(folder => folder.name.trim().toLowerCase() !== 'test'));
  // }, []);
  // Search modal state
  const [searchModalVisible, setSearchModalVisible] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [keyboardHeight, setKeyboardHeight] = useState(0);

  const openSearchModal = React.useCallback(() => {
    // Ensure the popup doesn't start "lifted" due to stale keyboard height
    setKeyboardHeight(0);
    setSearchModalVisible(true);
  }, []);

  const closeSearchModal = React.useCallback(() => {
    setSearchModalVisible(false);
    setSearchText('');
    setKeyboardHeight(0);
  }, []);

  // Header search dropdown (between logos): search among created projects in hierarchy
  const headerProjectQuery = String(route?.params?.headerProjectSearchText || '').trim();
  const headerSearchOpen = React.useMemo(() => {
    // default: open when there is a query; explicit false closes dropdown
    if (Object.prototype.hasOwnProperty.call(route?.params || {}, 'headerSearchOpen')) {
      return !!route.params.headerSearchOpen;
    }
    return !!headerProjectQuery;
  }, [route?.params, headerProjectQuery]);
  const headerSearchWidth = React.useMemo(() => {
    const w = Number(route?.params?.headerSearchWidth || 0);
    return Number.isFinite(w) && w > 0 ? w : null;
  }, [route?.params]);
  const headerSearchBottom = React.useMemo(() => {
    const b = Number(route?.params?.headerSearchBottom || 0);
    return Number.isFinite(b) && b > 0 ? b : 71;
  }, [route?.params]);
  const headerSearchLeft = React.useMemo(() => {
    const l = Number(route?.params?.headerSearchLeft || 0);
    return Number.isFinite(l) ? l : null;
  }, [route?.params]);
  const headerProjectMatches = React.useMemo(() => {
    if (!headerProjectQuery) return [];
    const q = headerProjectQuery.toLowerCase();
    const out = [];

    for (const main of (hierarchy || [])) {
      for (const sub of (main?.children || [])) {
        for (const child of (sub?.children || [])) {
          if (child?.type !== 'project') continue;
          const id = String(child?.id || '');
          const name = String(child?.name || '');
          if (id.toLowerCase().includes(q) || name.toLowerCase().includes(q)) {
            out.push(child);
            if (out.length >= 25) return out;
          }
        }
      }
    }

    return out;
  }, [headerProjectQuery, hierarchy]);

  // Web-only UX: hover highlight + subtle open animation for dropdown
  const [hoveredProjectId, setHoveredProjectId] = useState(null);
  const dropdownAnim = React.useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    Animated.timing(dropdownAnim, {
      toValue: headerProjectQuery ? 1 : 0,
      duration: 140,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: (Platform && Platform.OS === 'web') ? false : true,
    }).start();
  }, [headerProjectQuery, dropdownAnim]);

  // Native: keep search modal above the keyboard
  React.useEffect(() => {
    if (Platform.OS === 'web') return;
    const subs = [];
    const onShow = (e) => setKeyboardHeight(e?.endCoordinates?.height || 0);
    const onHide = () => setKeyboardHeight(0);

    // iOS is often more reliable with *Will* events
    subs.push(Keyboard.addListener('keyboardWillShow', onShow));
    subs.push(Keyboard.addListener('keyboardWillHide', onHide));
    subs.push(Keyboard.addListener('keyboardDidShow', onShow));
    subs.push(Keyboard.addListener('keyboardDidHide', onHide));

    return () => {
      for (const s of subs) {
        try { s.remove(); } catch(_e) {}
      }
    };
  }, []);

  // App (native): filter projects by status

  // Web: right-click context menu for folder tree
  const [contextMenu, setContextMenu] = useState({ visible: false, x: 0, y: 0, target: null });
  const ensuredDefaultMainRef = useRef(false);

  // Web: hover highlight for tree rows
  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const getRowKey = React.useCallback((type, mainId, subId, projectId) => {
    return [type, mainId ?? '', subId ?? '', projectId ?? ''].join(':');
  }, []);

  const closeContextMenu = React.useCallback(() => {
    setContextMenu(prev => ({ ...prev, visible: false, target: null }));
  }, []);

  const getContextCoords = React.useCallback((e) => {
    const ne = e?.nativeEvent || e;
    const rawX = ne?.pageX ?? ne?.clientX ?? 0;
    const rawY = ne?.pageY ?? ne?.clientY ?? 0;
    const menuWidth = 220;
    const menuHeight = 220;
    if (typeof window !== 'undefined') {
      const maxX = Math.max(8, (window.innerWidth || rawX) - menuWidth - 8);
      const maxY = Math.max(8, (window.innerHeight || rawY) - menuHeight - 8);
      return { x: Math.min(rawX, maxX), y: Math.min(rawY, maxY) };
    }
    return { x: rawX, y: rawY };
  }, []);

  const openContextMenu = React.useCallback((e, target) => {
    if (Platform.OS !== 'web') return;
    try { e?.preventDefault?.(); } catch(_e) {}
    const { x, y } = getContextCoords(e);
    setContextMenu({ visible: true, x, y, target });
  }, [getContextCoords]);

  // Web-only: intercept the *real* DOM contextmenu event so the browser menu never opens.
  // RN-web doesn't reliably fire onContextMenu for all components.
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const handler = (ev) => {
      const rootEl = document.getElementById('dk-tree-root');
      if (!rootEl) return;
      if (!rootEl.contains(ev.target)) return;

      // Always block the browser menu within the tree area
      ev.preventDefault();
      ev.stopPropagation();

      const rowEl = ev.target?.closest?.('[data-dk-type]');
      if (!rowEl) return;

      const dkType = rowEl.getAttribute('data-dk-type');
      const mainId = rowEl.getAttribute('data-dk-mainid');
      const subId = rowEl.getAttribute('data-dk-subid');
      const projectId = rowEl.getAttribute('data-dk-projectid');

      let target = null;
      if (dkType === 'main') {
        target = { type: 'main', mainId };
      } else if (dkType === 'sub') {
        target = { type: 'sub', mainId, subId };
      } else if (dkType === 'project') {
        // Recursively lookup project - no assumptions about depth
        const findProjectRecursive = (nodes) => {
          if (!Array.isArray(nodes)) return null;
          for (const node of nodes) {
            if (node && node.type === 'project' && String(node.id) === String(projectId)) {
              return node;
            }
            if (node && node.children && Array.isArray(node.children)) {
              const result = findProjectRecursive(node.children);
              if (result) return result;
            }
          }
          return null;
        };
        const project = findProjectRecursive(hierarchy || []);
        target = { type: 'project', mainId, subId, project };
      }

      if (!target) return;
      openContextMenu(ev, target);
    };

    document.addEventListener('contextmenu', handler, { capture: true });
    return () => document.removeEventListener('contextmenu', handler, { capture: true });
  }, [hierarchy, openContextMenu]);

  // Ensure at least one main folder exists (important since we remove the + button)
  React.useEffect(() => {
    if (!companyId) return;
    if (!didInitialLoadRef.current) return;
    if (ensuredDefaultMainRef.current) return;
    if (Array.isArray(hierarchy) && hierarchy.length === 0) {
      ensuredDefaultMainRef.current = true;
        setHierarchy([
        {
          id: (Math.random() * 100000).toFixed(0),
          name: 'Huvudmapp',
          type: 'main',
          phase: selectedPhase, // Set phase to currently selected phase
          expanded: false,
          children: [],
        },
      ]);
    }
  }, [hierarchy, companyId]);

  const renameMainFolderWeb = React.useCallback((mainId) => {
    const current = hierarchy.find(m => m.id === mainId);
    const currentName = current?.name || '';
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på huvudmapp', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => (m.id === mainId ? { ...m, name: nextName } : m)));
      return;
    }
    setEditModal({ visible: true, type: 'main', id: mainId, name: currentName });
  }, [hierarchy]);

  const renameSubFolderWeb = React.useCallback((subId) => {
    let currentName = '';
    hierarchy.forEach(m => {
      (m.children || []).forEach(s => {
        if (s.id === subId) currentName = s.name || '';
      });
    });
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på undermapp', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => ({
        ...m,
        children: (m.children || []).map(s => (s.id === subId ? { ...s, name: nextName } : s)),
      })));
      return;
    }
    setEditModal({ visible: true, type: 'sub', id: subId, name: currentName });
  }, [hierarchy]);

  const deleteMainFolderGuarded = React.useCallback((mainId) => {
    const mainName = (hierarchy || []).find(m => m.id === mainId)?.name || '';
    if ((hierarchy || []).length <= 1) {
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        window.alert('Kan inte radera.\n\nDet måste finnas minst en huvudmapp.');
      } else {
        Alert.alert('Kan inte radera', 'Det måste finnas minst en huvudmapp.');
      }
      return;
    }
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`);
      if (!ok) return;
      setHierarchy(prev => prev.filter(m => m.id !== mainId));
      return;
    }

    Alert.alert('Radera huvudmapp', `Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera',
        style: 'destructive',
        onPress: () => setHierarchy(prev => prev.filter(m => m.id !== mainId)),
      },
    ]);
  }, [hierarchy]);

  const deleteSubFolder = React.useCallback((mainId, subId) => {
    const main = (hierarchy || []).find(m => m.id === mainId);
    const subName = (main?.children || []).find(s => s.id === subId)?.name || '';

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const ok = window.confirm(`Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`);
      if (!ok) return;
      setHierarchy(prev => prev.map(m => (
        m.id === mainId
          ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
          : m
      )));
      return;
    }

    Alert.alert('Radera undermapp', `Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`, [
      { text: 'Avbryt', style: 'cancel' },
      {
        text: 'Radera',
        style: 'destructive',
        onPress: () => setHierarchy(prev => prev.map(m => (
          m.id === mainId
            ? { ...m, children: (m.children || []).filter(s => s.id !== subId) }
            : m
        ))),
      },
    ]);
  }, [hierarchy]);

  const renameProjectWeb = React.useCallback((projectId) => {
    let currentName = '';
    hierarchy.forEach(m => {
      (m.children || []).forEach(s => {
        (s.children || []).forEach(ch => {
          if (ch?.type === 'project' && ch.id === projectId) currentName = ch.name || '';
        });
      });
    });

    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      const nextName = (window.prompt('Byt namn på projekt', currentName) || '').trim();
      if (!nextName) return;
      setHierarchy(prev => prev.map(m => ({
        ...m,
        children: (m.children || []).map(s => ({
          ...s,
          children: (s.children || []).map(ch => (
            ch?.type === 'project' && ch.id === projectId ? { ...ch, name: nextName } : ch
          )),
        })),
      })));
      return;
    }
  }, [hierarchy]);

  // Hierarchy operations - use utilities
  const deleteMainFolderGuardedCallback = React.useCallback((mainId) => {
    deleteMainFolderGuarded(mainId, hierarchy, setHierarchy);
  }, [hierarchy]);

  const deleteSubFolderCallback = React.useCallback((mainId, subId) => {
    deleteSubFolder(mainId, subId, hierarchy, setHierarchy);
  }, [hierarchy]);

  const deleteProjectCallback = React.useCallback((mainId, subId, projectId) => {
    deleteProject(mainId, subId, projectId, hierarchy, setHierarchy);
  }, [hierarchy]);

  const copyProjectWebCallback = React.useCallback((mainId, subId, project) => {
    copyProjectWeb(mainId, subId, project, hierarchy, setHierarchy, isProjectNumberUnique);
  }, [hierarchy, isProjectNumberUnique]);

  const contextMenuItems = React.useMemo(() => {
    const t = contextMenu.target;
    if (!t) return [];
    // Old local folder/project creation removed - folders are managed in SharePoint
    // Context menu for SharePoint folders is handled in ProjectSidebar
    if (t.type === 'main' || t.type === 'sub' || t.type === 'folder') {
      return [
        // Note: Folder management (create/delete) should be done via SharePoint context menu in ProjectSidebar
        { key: 'openInSharePoint', label: 'Öppna i SharePoint', iconName: 'open-outline', icon: null },
      ];
    }
    if (t.type === 'project') {
      return [
        { key: 'open', label: 'Öppna projekt', iconName: 'document-text-outline', icon: null },
        { key: 'addControl', label: 'Skapa ny kontroll', iconName: 'checkmark-circle-outline', icon: null },
        { key: 'copy', label: 'Kopiera projekt', iconName: 'copy-outline', icon: null },
        { key: 'rename', label: 'Byt namn', iconName: 'create-outline', icon: null },
        { key: 'delete', label: 'Radera', iconName: 'trash-outline', icon: null, danger: true },
      ];
    }
    return [];
  }, [contextMenu.target, hierarchy]);

  const handleContextMenuSelect = React.useCallback((item) => {
    const t = contextMenu.target;
    if (!t) return;

    if (t.type === 'main') {
      const mainId = t.mainId;
      switch (item.key) {
        case 'addMain':
          setIsCreatingMainFolder(true);
          setNewMainFolderName('');
          break;
        case 'addSub':
          // Öppna huvudmappen om den är stängd så att textrutan syns
          const mainFolderForSub = hierarchy.find(m => String(m.id) === String(mainId));
          if (!mainFolderForSub) {
            console.warn('[addSub] Main folder not found:', mainId, 'in hierarchy:', hierarchy.map(m => m.id));
            break;
          }
          const mainIdStr = String(mainId);
          console.log('[addSub] Main folder found:', mainIdStr, 'expanded:', mainFolderForSub.expanded);
          
          // Öppna mappen om den är stängd (TextInput visas oavsett tack vare villkoret i render)
          if (!mainFolderForSub.expanded) {
            handleToggleMainFolder(mainIdStr);
            // Sätt creating state efter en liten delay för att säkerställa att mappen öppnas först
            setTimeout(() => {
              console.log('[addSub] Setting creatingSubFolderForMainId to:', mainIdStr);
              setCreatingSubFolderForMainId(mainIdStr);
              setNewSubFolderName('');
            }, 150);
          } else {
            // Mappen är redan öppen, sätt creating state med en liten delay för att säkerställa render
            console.log('[addSub] Setting creatingSubFolderForMainId to:', mainIdStr, '(mappen är redan öppen)');
            setTimeout(() => {
              setCreatingSubFolderForMainId(mainIdStr);
              setNewSubFolderName('');
            }, 50);
          }
          break;
        case 'addProject':
          // Projekter måste skapas i undermappar, inte direkt i huvudmappar
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert('Projekt måste skapas i en undermapp. Skapa en undermapp först genom att högerklicka på huvudmappen och välja "Lägg till undermapp".');
          } else {
            Alert.alert('Information', 'Projekt måste skapas i en undermapp. Skapa en undermapp först.');
          }
          break;
        case 'rename':
          renameMainFolderWeb(mainId);
          break;
        case 'delete':
          deleteMainFolderGuardedCallback(mainId);
          break;
      }
    }

    if (t.type === 'sub') {
      const mainId = t.mainId;
      const subId = t.subId;
      switch (item.key) {
        case 'addProject':
          // Visa enkel modal för kalkylskede, fullständig modal för andra faser
          if (selectedPhase === 'kalkylskede') {
            setSimpleProjectModal({ visible: true, parentSubId: subId, parentMainId: mainId });
            setNewProjectName('');
            setNewProjectNumber('');
          } else {
            setNewProjectModal({ visible: true, parentSubId: subId });
            setNewProjectName('');
            setNewProjectNumber('');
          }
          break;
        case 'rename':
          renameSubFolderWeb(subId);
          break;
        case 'delete':
          deleteSubFolderCallback(mainId, subId);
          break;
      }
    }

    if (t.type === 'project') {
      const mainId = t.mainId;
      const subId = t.subId;
      const project = t.project;
      switch (item.key) {
        case 'open':
          if (project && Platform.OS === 'web') {
            const main = (hierarchy || []).find((m) => m && String(m.id) === String(mainId)) || null;
            const sub = main && Array.isArray(main.children)
              ? (main.children || []).find((s) => s && String(s.id) === String(subId))
              : null;
            requestProjectSwitch(project, { selectedAction: null, path: { mainId: String(mainId), subId: String(subId), mainName: String(main?.name || ''), subName: String(sub?.name || '') } });
          }
          break;
        case 'addControl':
          if (project) {
            setProjectControlSelectedType(controlTypeOptions[0]?.type || '');
            setProjectControlTypePickerOpen(false);
            setProjectControlTemplates([]);
            setProjectControlSelectedTemplateId('');
            setProjectControlTemplatePickerOpen(false);
            setProjectControlTemplateSearch('');
            (async () => {
              try {
                const cid = String(companyId || routeCompanyId || authClaims?.companyId || '').trim();
                if (cid) {
                  const items = await fetchCompanyMallar(cid).catch(() => []);
                  const list = Array.isArray(items) ? items : [];
                  setProjectControlTemplates(list);
                }
              } catch(_e) {}
              setProjectControlModal({ visible: true, project });
            })();
          }
          break;
        case 'copy':
          copyProjectWebCallback(mainId, subId, project);
          break;
        case 'rename':
          if (project?.id) renameProjectWeb(project.id);
          break;
        case 'delete':
          if (project?.id) deleteProjectCallback(mainId, subId, project.id);
          break;
      }
    }
  }, [contextMenu.target, deleteMainFolderGuardedCallback, deleteSubFolderCallback, renameMainFolderWeb, renameSubFolderWeb, requestProjectSwitch, copyProjectWebCallback, deleteProjectCallback, renameProjectWeb, companyId, routeCompanyId, authClaims?.companyId, controlTypeOptions, fetchCompanyMallar]);

  // Use hierarchy toggle hook
  const { toggleExpand, toggleMainFolder, toggleSubFolder } = useHierarchyToggle();

  const handleToggleMainFolder = (mainId) => {
    toggleMainFolder(mainId, hierarchy, setHierarchy, spinMain, setSpinMain);
  };

  // Toggle folder expansion - works for all levels recursively
  const handleToggleSubFolder = (folderId) => {
    // Toggle expansion state for any folder (no level restrictions)
    setExpandedSubs(prev => ({ ...prev, [folderId]: !prev[folderId] }));
    // Also update spin animation
    setSpinSub(prev => ({ ...prev, [folderId]: (prev[folderId] || 0) + 1 }));
  };

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

  // Stil för återanvändning
// eslint-disable-next-line no-unused-vars
const _kontrollKnappStil = { backgroundColor: '#fff', borderRadius: 16, marginBottom: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', shadowColor: '#1976D2', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2, minHeight: 56, maxWidth: 240, width: '90%', paddingLeft: 14, paddingRight: 10, overflow: 'hidden', borderWidth: 2, borderColor: '#222' };
// eslint-disable-next-line no-unused-vars
const _kontrollTextStil = { color: '#222', fontWeight: '600', fontSize: 17, letterSpacing: 0.5, zIndex: 1 };

    // Dashboard: gemensamma stilar (återanvänd befintliga färger)
    const dashboardContainerStyle = React.useMemo(() => ({ width: '100%', maxWidth: 1180, alignSelf: 'center' }), []);
    const dashboardColumnsStyle = React.useMemo(() => ({ flexDirection: 'row', alignItems: 'flex-start', flexWrap: 'wrap' }), []);
    const dashboardSectionTitleStyle = React.useMemo(() => ({ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 10 }), []);
    const dashboardCardStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 12, backgroundColor: '#fff' }), []);
    const dashboardCardDenseStyle = React.useMemo(() => ({ borderWidth: 1, borderColor: '#e0e0e0', borderRadius: 12, padding: 10, backgroundColor: '#fff' }), []);
    const dashboardEmptyTextStyle = React.useMemo(() => ({ color: '#777', padding: 12 }), []);
    const dashboardMetaTextStyle = React.useMemo(() => ({ fontSize: 12, color: '#888', marginTop: 2 }), []);
    const dashboardLinkTitleStyle = React.useMemo(() => ({ fontSize: 13, color: '#1976D2', fontWeight: '400' }), []);
    const dashboardListItemStyle = React.useCallback((idx) => ({
      paddingVertical: 8,
      paddingHorizontal: 6,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    // Compact variants for the activity list (reduce vertical footprint)
    const dashboardActivityListItemStyle = React.useCallback((idx) => ({
      paddingVertical: 6,
      paddingHorizontal: 6,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    const dashboardActivityTitleCompactStyle = React.useMemo(() => ({ fontSize: 14, color: '#222', fontWeight: '600' }), []);
    const dashboardActivityMetaCompactStyle = React.useMemo(() => ({ fontSize: 12, color: '#777', marginTop: 0 }), []);
    const dashboardStatRowStyle = React.useCallback((idx) => ({
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 8,
      borderTopWidth: idx === 0 ? 0 : 1,
      borderTopColor: '#eee',
    }), []);
    const dashboardStatDotStyle = React.useCallback((color) => ({ width: 10, height: 10, borderRadius: 5, backgroundColor: color, marginRight: 12 }), []);
    const dashboardStatLabelStyle = React.useMemo(() => ({ flex: 1, fontSize: 15, color: '#222' }), []);
    const dashboardStatValueStyle = React.useMemo(() => ({ fontSize: 16, fontWeight: '400', color: '#222' }), []);
    const dashboardActivityTitleStyle = React.useMemo(() => ({ fontSize: 15, color: '#222', fontWeight: '600' }), []);

  // eslint-disable-next-line react-hooks/exhaustive-deps
    const ActivityPanel = React.useCallback(() => {
      return (
        <View style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          <Text style={dashboardSectionTitleStyle}>Senaste aktivitet</Text>
          <View style={dashboardCardDenseStyle}>
            {dashboardLoading ? (
              <Text style={dashboardEmptyTextStyle}>Laddar…</Text>
            ) : (dashboardRecent || []).length === 0 ? (
              <Text style={dashboardEmptyTextStyle}>Ingen aktivitet ännu.</Text>
            ) : (
              (dashboardRecent || []).map((a, idx) => {
                const isLogin = String(a.type || '').toLowerCase() === 'login';
                const hasOpenDeviations = !isLogin && a.kind !== 'draft' && a.type === 'Skyddsrond' && (a.openDeviationsCount || 0) > 0;
                const iconName = isLogin ? 'log-in-outline' : (a.kind === 'draft' ? 'document-text-outline' : (hasOpenDeviations ? 'alert-circle' : 'checkmark-circle'));
                const iconColor = isLogin ? '#1976D2' : (a.kind === 'draft' ? '#FFD600' : (hasOpenDeviations ? '#D32F2F' : '#43A047'));
                // eslint-disable-next-line no-unused-vars
                
                const who = formatPersonName(a.actorName || a.actorEmail || a.actor || a.email || a.uid || '');
                const title = isLogin
                  ? (who ? `Loggade in: ${who}` : 'Loggade in')
                  : (a.kind === 'draft'
                    ? `Utkast sparat: ${a.type}${who ? ` — av ${who}` : ''}`
                    : `Slutförd: ${a.type}${who ? ` — av ${who}` : ''}`);

                return (
                  <TouchableOpacity
                    key={`${a.kind}-${a.ts || 'no-ts'}-${idx}`}
                    activeOpacity={0.85}
                    onPress={() => {
                      if (isLogin) return;
                      if (a.projectId) {
                        const p = findProjectById(a.projectId);
                        if (p) {
                          if (a.kind === 'draft') {
                            const raw = a.raw || null;
                            const stableId = raw?.id || raw?.draftId || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                            const selectedAction = {
                              id: `openDraft:${String(a.projectId)}:${String(stableId)}`,
                              kind: 'openDraft',
                              type: a.type,
                              initialValues: raw || undefined,
                            };
                            requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                          } else {
                            requestProjectSwitch(p, { selectedAction: null });
                          }
                        }
                      }
                    }}
                    style={[{ flexDirection: 'row', alignItems: 'flex-start' }, dashboardActivityListItemStyle(idx)]}
                  >
                    <Ionicons name={iconName} size={16} color={iconColor} style={{ marginTop: 2, marginRight: 8 }} />
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text style={dashboardActivityTitleCompactStyle} numberOfLines={1}>
                        {title}
                      </Text>
                      { (a.projectId || a.projectName) ? (
                        <Text style={{ fontSize: 13, color: '#1976D2', marginTop: 2 }} numberOfLines={1}>
                          {a.projectId ? String(a.projectId) : ''}{(a.projectId && a.projectName) ? ' - ' : ''}{a.projectName ? String(a.projectName) : ''}
                        </Text>
                      ) : null}
                      {a.desc && (!isLogin || a.desc !== title) ? (
                        <Text style={{ fontSize: 12, color: '#666', marginTop: 2 }} numberOfLines={1}>
                          {a.desc}
                        </Text>
                      ) : null}
                      {
                        // Show actor + relative time for non-login activities when available
                        (!isLogin && who) ? (
                          <Text style={dashboardActivityMetaCompactStyle} numberOfLines={1}>
                            {`Av: ${who} ${formatRelativeTime(a.ts)}`}
                          </Text>
                        ) : (
                          <Text style={dashboardActivityMetaCompactStyle}>
                            {formatRelativeTime(a.ts)}
                          </Text>
                        )
                      }
                    </View>

                    {Platform.OS === 'web' && hasOpenDeviations && (
                      <TouchableOpacity
                        onPress={(e) => {
                          try { e && e.stopPropagation && e.stopPropagation(); } catch(_e) {}
                          if (!a.projectId) return;
                          const p = findProjectById(a.projectId);
                          if (!p) return;
                          const raw = a.raw || null;
                          const stableId = raw?.id || raw?.controlId || raw?.localId || raw?.savedAt || a.ts || Date.now();
                          const selectedAction = {
                            id: `openControlDetails:${String(a.projectId)}:${String(stableId)}`,
                            kind: 'openControlDetails',
                            control: raw || undefined,
                          };
                          requestProjectSwitch(p, { selectedAction, clearActionAfter: true });
                        }}
                        style={{ marginLeft: 12, paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, backgroundColor: '#FFD600', alignSelf: 'center' }}
                        activeOpacity={0.85}
                        accessibilityLabel="Åtgärda avvikelse"
                      >
                        <Text style={{ color: '#222', fontWeight: '700', fontSize: 13 }}>Åtgärda</Text>
                      </TouchableOpacity>
                    )}
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        </View>
      );
    }, [
      dashboardRecent,
      dashboardLoading,
      dashboardSectionTitleStyle,
      dashboardCardStyle,
      dashboardCardDenseStyle,
      dashboardEmptyTextStyle,
      dashboardListItemStyle,
      dashboardActivityListItemStyle,
      dashboardActivityTitleStyle,
      dashboardActivityTitleCompactStyle,
      dashboardMetaTextStyle,
      dashboardActivityMetaCompactStyle,
      dashboardLinkTitleStyle,
      findProjectById,
      formatRelativeTime,
      requestProjectSwitch,
      toggleDashboardFocus,
      // Ensure overview/hover/focus state cause re-creation so chevrons and overlays update
      dashboardFocus,
      dashboardHoveredStatKey,
      dashboardDropdownAnchor,
      dashboardDropdownTop,
      dashboardDropdownRowKey,
      dashboardOverview,
      dashboardActiveProjectsList,
      dashboardDraftItems,
      dashboardControlsToSignItems,
      dashboardOpenDeviationItems,
      dashboardUpcomingSkyddsrondItems,
      dashboardStatDotStyle,
      dashboardStatLabelStyle,
      dashboardStatRowStyle,
      dashboardStatValueStyle,
      webPaneHeight,
      hierarchy,
    ]);


  return (
    <View style={{ flex: 1 }}>
      {/* App-only: filter modal */}

      {/* Sök-popup/modal */}
      <Modal
        visible={searchModalVisible}
        transparent
        animationType="fade"
        onRequestClose={closeSearchModal}
      >
        {Platform.OS === 'web' ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 }}>
            <Pressable
              style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
              onPress={closeSearchModal}
            />
            <View
              style={{
                backgroundColor: '#fff',
                borderRadius: 18,
                padding: 24,
                width: 340,
                maxHeight: 700,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.18,
                shadowRadius: 8,
                elevation: 6,
                position: 'relative',
              }}
            >
              <TouchableOpacity
                style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                onPress={closeSearchModal}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={26} color="#222" />
              </TouchableOpacity>
              <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center', marginTop: 6 }}>
                Sök projekt
              </Text>
              <TextInput
                value={searchText}
                onChangeText={setSearchText}
                placeholder="Skriv projektnummer..."
                style={{
                  borderWidth: 1,
                  borderColor: '#222',
                  borderRadius: 16,
                  padding: 10,
                  fontSize: 16,
                  backgroundColor: '#fff',
                  color: '#222',
                  marginBottom: 12
                }}
                autoFocus
                keyboardType="default"
                autoCorrect={false}
                autoCapitalize="none"
              />
              <ScrollView style={{ maxHeight: 520 }} keyboardShouldPersistTaps="handled">
                {/* Recursively find all projects in hierarchy - no assumptions about depth */}
                {(() => {
                  const findAllProjects = (items) => {
                    const projects = [];
                    const walk = (nodes) => {
                      if (!Array.isArray(nodes)) return;
                      nodes.forEach(node => {
                        if (node && node.type === 'project' && node.id) {
                          projects.push(node);
                        }
                        if (node && node.children && Array.isArray(node.children)) {
                          walk(node.children);
                        }
                      });
                    };
                    walk(items);
                    return projects;
                  };
                  
                  const allProjects = findAllProjects(hierarchy);
                  const filtered = searchText.trim() !== '' 
                    ? allProjects.filter(proj => 
                        proj.id.toLowerCase().includes(searchText.toLowerCase()) ||
                        proj.name.toLowerCase().includes(searchText.toLowerCase())
                      )
                    : [];
                  
                  return (
                    <>
                      {filtered.map(proj => (
                        <TouchableOpacity
                          key={proj.id}
                          style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                          onPress={() => {
                            closeSearchModal();
                            requestProjectSwitch(proj, { selectedAction: null });
                          }}
                        >
                          <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                        </TouchableOpacity>
                      ))}
                      {searchText.trim() !== '' && filtered.length === 0 && (
                        <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 12 }}>Inga projekt hittades.</Text>
                      )}
                    </>
                  );
                })()}
              </ScrollView>
            </View>
          </View>
        ) : (
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
            keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 0}
          >
            <View
              style={{
                flex: 1,
                // Center the search dialog vertically on mobile
                justifyContent: 'center',
                alignItems: 'center',
                paddingTop: 20,
                paddingBottom: 8,
              }}
            >
              <Pressable
                style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.25)' }}
                onPress={closeSearchModal}
              />
              <View
                style={{
                  backgroundColor: '#fff',
                  borderRadius: 18,
                  padding: 24,
                  width: 340,
                  maxHeight: Math.max(320, Math.min(600, (windowHeight || 700) - (keyboardHeight || 0) - 80)),
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.18,
                  shadowRadius: 8,
                  elevation: 6,
                  position: 'relative',
                }}
              >
                <TouchableOpacity
                  style={{ position: 'absolute', top: 10, right: 10, zIndex: 2, padding: 6 }}
                  onPress={closeSearchModal}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Ionicons name="close" size={26} color="#222" />
                </TouchableOpacity>
                <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 14, color: '#222', textAlign: 'center', marginTop: 6 }}>
                  Sök projekt
                </Text>
                <TextInput
                  value={searchText}
                  onChangeText={setSearchText}
                  placeholder="Skriv projektnummer..."
                  style={{
                    borderWidth: 1,
                    borderColor: '#222',
                    borderRadius: 16,
                    padding: 10,
                    fontSize: 16,
                    backgroundColor: '#fff',
                    color: '#222',
                    marginBottom: 12
                  }}
                  autoFocus
                  keyboardType="default"
                  autoCorrect={false}
                  autoCapitalize="none"
                />
                <ScrollView
                  style={{
                    maxHeight: Math.max(180, (windowHeight || 700) - (keyboardHeight || 0) - 260),
                  }}
                  keyboardShouldPersistTaps="handled"
                >
                  {hierarchy.flatMap(main =>
                    main.children.flatMap(sub =>
                      (sub.children || [])
                        .filter(child => child.type === 'project' &&
                          searchText.trim() !== '' &&
                          (
                            child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                            child.name.toLowerCase().includes(searchText.toLowerCase())
                          )
                        )
                        .map(proj => (
                          <TouchableOpacity
                            key={proj.id}
                            style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: '#eee', flexDirection: 'row', alignItems: 'center' }}
                            onPress={() => {
                              closeSearchModal();
                              navigation.navigate('ProjectDetails', {
                                project: {
                                  id: proj.id,
                                  name: proj.name,
                                  ansvarig: proj.ansvarig || '',
                                  adress: proj.adress || '',
                                  fastighetsbeteckning: proj.fastighetsbeteckning || '',
                                  client: proj.client || '',
                                  status: proj.status || 'ongoing',
                                  createdAt: proj.createdAt || '',
                                  createdBy: proj.createdBy || ''
                                },
                                companyId
                              });
                            }}
                          >
                            <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 8, borderWidth: 1, borderColor: '#bbb' }} />
                            <Text style={{ fontSize: 16, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">{proj.id} - {proj.name}</Text>
                          </TouchableOpacity>
                        ))
                    )
                  )}
                  {searchText.trim() !== '' && hierarchy.flatMap(main => main.children.flatMap(sub => (sub.children || []).filter(child => child.type === 'project' && (
                    child.id.toLowerCase().includes(searchText.toLowerCase()) ||
                    child.name.toLowerCase().includes(searchText.toLowerCase())
                  )))).length === 0 && (
                    <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', marginTop: 12 }}>Inga projekt hittades.</Text>
                  )}
                </ScrollView>
              </View>
            </View>
          </KeyboardAvoidingView>
        )}
      </Modal>
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
      <Modal
        visible={simpleProjectModal.visible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
          setNewProjectName('');
          setNewProjectNumber('');
        }}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.25)' }}>
          <Pressable
            style={{ position: 'absolute', left: 0, right: 0, top: 0, bottom: 0 }}
            onPress={() => {
              setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
              setNewProjectName('');
              setNewProjectNumber('');
            }}
          />
          <View style={{ 
            backgroundColor: '#fff', 
            borderRadius: 18, 
            padding: 24, 
            width: Platform.OS === 'web' ? 500 : 340, 
            maxWidth: '90%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 6,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#111' }}>Skapa nytt projekt</Text>
              <TouchableOpacity
                style={{ padding: 4 }}
                onPress={() => {
                  setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
                  setNewProjectName('');
                  setNewProjectNumber('');
                }}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons name="close" size={24} color="#111" />
              </TouchableOpacity>
            </View>
            
            <Text style={{ fontSize: 14, color: '#64748b', marginBottom: 20 }}>
              Ange projektnummer och projektnamn för att skapa ett projekt i systemet.
            </Text>

            <View style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Projektnummer *</Text>
                {String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber) ? (
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                ) : null}
              </View>
              <TextInput
                value={newProjectNumber}
                onChangeText={(v) => setNewProjectNumber(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                placeholder="T.ex. 2026-001"
                placeholderTextColor="#94A3B8"
                style={{
                  borderWidth: 1,
                  borderColor: String(newProjectNumber ?? '').trim() !== '' && isProjectNumberUnique(newProjectNumber) ? '#E2E8F0' : '#EF4444',
                  borderRadius: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  backgroundColor: '#fff',
                  color: '#111',
                  ...(Platform.OS === 'web' ? {
                    outline: 'none',
                  } : {}),
                }}
                autoFocus
              />
              {String(newProjectNumber ?? '').trim() !== '' && !isProjectNumberUnique(newProjectNumber) ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 6 }}>
                  <Ionicons name="warning" size={16} color="#B91C1C" style={{ marginRight: 6 }} />
                  <Text style={{ color: '#B91C1C', fontSize: 12, fontWeight: '700' }}>Projektnummer används redan.</Text>
                </View>
              ) : null}
            </View>

            <View style={{ marginBottom: 24 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
                <Text style={{ fontSize: 12, fontWeight: '500', color: '#334155' }}>Projektnamn *</Text>
                {String(newProjectName ?? '').trim() !== '' ? (
                  <Ionicons name="checkmark-circle" size={16} color="#10B981" style={{ marginLeft: 6 }} />
                ) : null}
              </View>
              <TextInput
                value={newProjectName}
                onChangeText={(v) => setNewProjectName(typeof v === 'string' ? v : (v?.target?.value ?? ''))}
                placeholder="T.ex. Opus Bilprovning"
                placeholderTextColor="#94A3B8"
                style={{
                  borderWidth: 1,
                  borderColor: String(newProjectName ?? '').trim() !== '' ? '#E2E8F0' : '#EF4444',
                  borderRadius: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 14,
                  fontSize: 14,
                  backgroundColor: '#fff',
                  color: '#111',
                  ...(Platform.OS === 'web' ? {
                    outline: 'none',
                  } : {}),
                }}
                onSubmitEditing={() => {
                  if (canCreateSimpleProject && !creatingProject) {
                    handleCreateSimpleProject();
                  }
                }}
              />
            </View>

            <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
              <TouchableOpacity
                disabled={creatingProject}
                onPress={() => {
                  setSimpleProjectModal({ visible: false, parentSubId: null, parentMainId: null });
                  setNewProjectName('');
                  setNewProjectNumber('');
                }}
                style={{ 
                  backgroundColor: '#E5E7EB', 
                  borderRadius: 10, 
                  paddingVertical: 12, 
                  paddingHorizontal: 20, 
                  minWidth: 100, 
                  alignItems: 'center',
                  opacity: creatingProject ? 0.5 : 1,
                }}
                activeOpacity={0.8}
              >
                <Text style={{ color: '#111', fontWeight: '600', fontSize: 14 }}>Avbryt</Text>
              </TouchableOpacity>

              <View style={{ width: 10 }} />

              <TouchableOpacity
                disabled={!canCreateSimpleProject || creatingProject}
                onPress={handleCreateSimpleProject}
                style={{
                  backgroundColor: (canCreateSimpleProject && !creatingProject) ? '#1976D2' : '#94A3B8',
                  borderRadius: 10,
                  paddingVertical: 12,
                  paddingHorizontal: 20,
                  minWidth: 100,
                  alignItems: 'center',
                  flexDirection: 'row',
                  justifyContent: 'center',
                  opacity: (canCreateSimpleProject && !creatingProject) ? 1 : 0.6,
                }}
                activeOpacity={0.85}
              >
                {creatingProject ? (
                  <>
                    <View style={{ 
                      width: 16, 
                      height: 16, 
                      borderWidth: 2, 
                      borderColor: '#fff', 
                      borderTopColor: 'transparent', 
                      borderRadius: 8,
                    }} />
                    <View style={{ width: 8 }} />
                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Skapar...</Text>
                  </>
                ) : (
                  <Text style={{ color: '#fff', fontWeight: '700', fontSize: 14 }}>Skapa projekt</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Simple Project Loading Modal */}
      {creatingProject && simpleProjectModal.visible ? (
        <Modal
          visible={true}
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
                Skapar projekt...
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
      ) : null}

      {/* Simple Project Success Modal */}
      <Modal
        visible={simpleProjectSuccessModal}
        transparent
        animationType="fade"
        onRequestClose={handleSimpleProjectSuccessClose}
      >
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}>
          <View style={{ 
            backgroundColor: '#fff', 
            borderRadius: 18, 
            padding: 32, 
            alignItems: 'center',
            minWidth: 320,
            maxWidth: '90%',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.18,
            shadowRadius: 8,
            elevation: 6,
          }}>
            <View style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: '#10B981',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: 16,
            }}>
              <Ionicons name="checkmark" size={36} color="#fff" />
            </View>
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111', marginBottom: 8, textAlign: 'center' }}>
              Projekt skapat!
            </Text>
            {simpleProjectCreatedRef.current ? (
              <Text style={{ fontSize: 14, color: '#64748b', textAlign: 'center', marginBottom: 24 }}>
                {simpleProjectCreatedRef.current.projectId} - {simpleProjectCreatedRef.current.projectName}
              </Text>
            ) : null}
            <TouchableOpacity
              onPress={handleSimpleProjectSuccessClose}
              style={{
                backgroundColor: '#1976D2',
                borderRadius: 10,
                paddingVertical: 12,
                paddingHorizontal: 24,
                minWidth: 120,
                alignItems: 'center',
              }}
              activeOpacity={0.85}
            >
              <Text style={{ color: '#fff', fontWeight: '700', fontSize: 15 }}>OK</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
      
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
            style={{ flex: 1, width: '100%', minHeight: Platform.OS === 'web' ? '100vh' : undefined, height: Platform.OS === 'web' ? windowHeight || undefined : undefined }}
          >
              <View
                style={{ pointerEvents: 'none', position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 0 }}
              />

            {headerProjectQuery && headerSearchOpen ? (
              (() => {
                const innerDropdown = (
                  <View
                    style={{
                      pointerEvents: 'auto',
                      position: Platform.OS === 'web' ? 'fixed' : 'absolute',
                      top: Platform.OS === 'web' ? headerSearchBottom : 8,
                      left: Platform.OS === 'web' && headerSearchLeft !== null ? headerSearchLeft : 0,
                      zIndex: 99999,
                      alignItems: 'flex-start',
                      marginTop: 0,
                      paddingTop: 0,
                    }}
                  >
                    <Animated.View
                      style={{
                          width: headerSearchWidth || 560,
                          backgroundColor: '#fff',
                          borderRadius: 16,
                          borderTopLeftRadius: 0,
                          borderTopRightRadius: 0,
                          overflow: 'hidden',
                          borderLeftWidth: 1,
                          borderRightWidth: 1,
                          borderBottomWidth: 1,
                          borderTopWidth: 0,
                          borderColor: '#666',
                          shadowColor: '#000',
                          shadowOffset: { width: 0, height: 6 },
                          shadowOpacity: 0.18,
                          shadowRadius: 14,
                          elevation: 10,
                          marginTop: 0,
                          paddingTop: 0,
                          opacity: Platform.OS === 'web' ? dropdownAnim : 1,
                          transform: Platform.OS === 'web' ? [{ scale: dropdownAnim.interpolate({ inputRange: [0, 1], outputRange: [0.995, 1] }) }] : undefined,
                        }}
                    >
                      <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingTop: 0 }} keyboardShouldPersistTaps="handled">
                        {headerProjectMatches.map((proj) => (
                          <TouchableOpacity
                            key={proj.id}
                            onMouseEnter={Platform.OS === 'web' ? () => setHoveredProjectId(proj.id) : undefined}
                            onMouseLeave={Platform.OS === 'web' ? () => setHoveredProjectId(null) : undefined}
                            style={{ paddingVertical: 10, paddingHorizontal: 14, borderBottomWidth: 1, borderColor: '#f0f0f0', flexDirection: 'row', alignItems: 'center', backgroundColor: Platform.OS === 'web' && hoveredProjectId === proj.id ? '#F7FBFF' : '#fff' }}
                            activeOpacity={0.8}
                            onPress={() => {
                                // Switch project inline and close the header dropdown (keep the query text).
                                if (Platform.OS === 'web') {
                                  try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
                                }
                                requestProjectSwitch(proj, { selectedAction: null });
                              }}
                          >
                            <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: (proj.status || 'ongoing') === 'completed' ? '#222' : '#43A047', marginRight: 10, borderWidth: 1, borderColor: '#bbb' }} />
                            <Text style={{ fontSize: 15, color: '#222', fontWeight: '600', flexShrink: 1 }} numberOfLines={1} ellipsizeMode="tail">
                              {proj.id} - {proj.name}
                            </Text>
                          </TouchableOpacity>
                        ))}

                        {headerProjectMatches.length === 0 ? (
                          <Text style={{ color: '#888', fontSize: 15, textAlign: 'center', paddingVertical: 14 }}>
                            Inga projekt hittades.
                          </Text>
                        ) : null}
                      </ScrollView>
                    </Animated.View>
                  </View>
                );

                const PortalContent = (
                  <>
                    <View
                      // backdrop to capture outside clicks and close the dropdown
                      onStartShouldSetResponder={() => true}
                      onResponderRelease={() => {
                        if (Platform.OS === 'web') {
                          try { navigation?.setParams?.({ headerSearchOpen: false, headerSearchKeepConnected: false }); } catch(_e) {}
                        }
                      }}
                      style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 99998, backgroundColor: 'rgba(0,0,0,0)' }}
                    />
                    {innerDropdown}
                  </>
                );

                if (Platform.OS === 'web' && createPortal && typeof document !== 'undefined') {
                  try {
                    let portalRoot = document.getElementById(portalRootId);
                    if (!portalRoot) {
                      portalRoot = document.createElement('div');
                      portalRoot.id = portalRootId;
                      portalRoot.style.position = 'relative';
                      document.body.appendChild(portalRoot);
                    }
                    return createPortal(PortalContent, portalRoot);
                  } catch(_e) {
                    return PortalContent;
                  }
                }
                return innerDropdown;
              })()
            ) : null}

            <ScrollView style={{ flex: 1, backgroundColor: 'transparent' }} scrollEnabled={Platform.OS !== 'web'} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
        {/* Header */}
        <View
          onLayout={(e) => {
            const h = e?.nativeEvent?.layout?.height;
            if (Platform.OS === 'web' && typeof h === 'number' && h > 0 && Math.abs(h - headerHeight) > 1) {
              setHeaderHeight(h);
            }
          }}
          style={{ 
            flexDirection: 'row', 
            alignItems: 'center', 
            justifyContent: 'space-between', 
            padding: 16, 
            backgroundColor: (() => {
              // Ljusare blå färg med mer transparens (20% opacity) så bakgrundsbilden syns igenom
              return 'rgba(25, 118, 210, 0.2)'; // #1976D2 med 20% opacity
            })(),
            borderBottomWidth: 1, 
            borderColor: 'rgba(25, 118, 210, 0.3)',
            borderLeftWidth: 4,
            borderLeftColor: '#1976D2',
          }}
        >
          <View>
              {/* User button: icon + full name, opens dropdown */}
            {/* User button: icon + full name, opens dropdown */}
            {Platform.OS !== 'web' ? (() => {
              let displayName = '';
              if (route?.params?.displayName) displayName = route.params.displayName;
              else if (auth?.currentUser) {
                const user = auth.currentUser;
                if (user.displayName && String(user.displayName).trim().includes(' ')) {
                  displayName = String(user.displayName).trim();
                } else {
                  displayName = formatPersonName(user) || (user.displayName ? String(user.displayName).trim() : '');
                }
              }
              displayName = displayName || firstName || 'Användare';
              const _nameSeed = String(displayName || '').trim();
              // eslint-disable-next-line no-unused-vars
              const _hash = Array.from(_nameSeed).reduce((s, c) => (s * 31 + c.charCodeAt(0)) | 0, 0);
              const _colors = ['#F44336','#E91E63','#9C27B0','#3F51B5','#2196F3','#03A9F4','#009688','#4CAF50','#FF9800','#FFC107'];
              const avatarBg = _colors[Math.abs(_hash) % _colors.length];

              const menuItems = [];
              if (isSuperAdmin) {
                // Superadmin: behåll alla befintliga adminval
                menuItems.push({ key: 'manage_company', label: 'Hantera företag', icon: <Ionicons name="business" size={16} color="#2E7D32" /> });
                menuItems.push({ key: 'manage_users', label: 'Hantera användare', icon: <Ionicons name="person-add" size={16} color="#1976D2" /> });
                menuItems.push({ key: 'admin_audit', label: 'Adminlogg', icon: <Ionicons name="list" size={16} color="#1565C0" /> });
              }

              // Alla roller: logga ut längst ned. För admin/användare blir detta enda valet.
              menuItems.push({ key: 'logout', label: 'Logga ut', icon: <Ionicons name="log-out-outline" size={16} color="#D32F2F" /> });

              return (
                <>
                  <TouchableOpacity
                    ref={userBtnRef}
                    onPress={() => { try { openUserMenu(); } catch(_e) {} }}
                    activeOpacity={0.8}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: avatarBg, alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="person" size={16} color="#fff" />
                    </View>
                    <Text style={{ fontSize: 16, color: '#263238', fontWeight: '600' }}>{displayName}</Text>
                    <Ionicons
                      name="chevron-down"
                      size={14}
                      color="#666"
                      style={{ marginLeft: 6, transform: [{ rotate: (userMenuVisible ? '180deg' : '0deg') }] }}
                    />
                  </TouchableOpacity>
                  <ContextMenu
                    visible={userMenuVisible}
                    x={menuPos.x}
                    y={menuPos.y}
                    items={menuItems}
                    onClose={() => setUserMenuVisible(false)}
                    onSelect={async (it) => {
                      try {
                        setUserMenuVisible(false);
                        if (!it) return;
                        if (it.key === 'manage_company') {
                          try { navigation.navigate('ManageCompany'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna Hantera företag'); }
                          return;
                        }
                        if (it.key === 'admin_audit') {
                          try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
                          return;
                        }
                        if (it.key === 'manage_users') {
                          try { navigation.navigate('ManageUsers', { companyId: String(companyId || routeCompanyId || '') }); } catch(_e) { Alert.alert('Valt', it.label); }
                          return;
                        }
                        if (it.key === 'logout') {
                          try { setLoggingOut(true); } catch(_e) {}
                          try { await AsyncStorage.removeItem('dk_companyId'); } catch(_e) {}
                          try { await auth.signOut(); } catch(_e) {}
                          try { setLoggingOut(false); } catch(_e) {}
                          try {
                            navigation.reset({ index: 0, routes: [{ name: 'Login' }] });
                          } catch(_e) {
                            try { navigation.navigate('Login'); } catch(__e) {}
                          }
                          return;
                        }
                        // Default: show label as feedback
                        Alert.alert('Valt', it.label);
                      } catch(_e) {}
                    }}
                  />
                </>
              );
            })() : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 8, marginLeft: 8 }}>
              {Platform.OS === 'web' ? (
                <>
                <View style={{ marginRight: 6 }}>
                    {showHeaderUserMenu ? (
                      <HeaderUserMenu />
                    ) : <HeaderDisplayName />}
                  </View>
              {allowedTools ? (
                <TouchableOpacity
                  style={{ backgroundColor: '#f0f0f0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, alignSelf: 'flex-start' }}
                  onPress={() => setSupportMenuOpen(s => !s)}
                >
                  <Text style={{ color: '#222', fontWeight: '700' }}>{supportMenuOpen ? 'Stäng verktyg' : 'Verktyg'}</Text>
                </TouchableOpacity>
                  ) : null}
                </>
              ) : null}
            </View>
          </View>
          
          {/* SharePoint Status Icon with Site Name - Right side */}
          <View 
            style={{ 
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
            }}
          >
            <View style={{ position: 'relative', alignItems: 'center', justifyContent: 'center' }}>
              {sharePointStatus.checking ? (
                <Animated.View
                  style={{
                    opacity: searchSpinAnim.interpolate({
                      inputRange: [0, 0.5, 1],
                      outputRange: [0.5, 1, 0.5]
                    })
                  }}
                >
                  <Ionicons name="hourglass-outline" size={24} color="#888" />
                </Animated.View>
              ) : sharePointStatus.connected ? (
                <>
                  {/* Cloud icon */}
                  <Ionicons name="cloud" size={32} color="#1976D2" />
                  {/* Green pulsing sync indicator on cloud */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      opacity: searchSpinAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6]
                      }),
                      transform: [{
                        scale: searchSpinAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.9, 1.1, 0.9]
                        })
                      }]
                    }}
                  >
                    <View style={{
                      backgroundColor: '#43A047',
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#fff',
                    }}>
                      <Ionicons name="sync" size={12} color="#fff" />
                    </View>
                  </Animated.View>
                </>
              ) : (
                <>
                  {/* Cloud icon (red/gray when disconnected) */}
                  <Ionicons name="cloud" size={32} color="#999" />
                  {/* Red pulsing error indicator */}
                  <Animated.View
                    style={{
                      position: 'absolute',
                      bottom: -2,
                      right: -2,
                      opacity: searchSpinAnim.interpolate({
                        inputRange: [0, 0.5, 1],
                        outputRange: [0.6, 1, 0.6]
                      }),
                      transform: [{
                        scale: searchSpinAnim.interpolate({
                          inputRange: [0, 0.5, 1],
                          outputRange: [0.9, 1.1, 0.9]
                        })
                      }]
                    }}
                  >
                    <View style={{
                      backgroundColor: '#D32F2F',
                      borderRadius: 10,
                      width: 20,
                      height: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      borderWidth: 2,
                      borderColor: '#fff',
                    }}>
                      <Ionicons name="close" size={12} color="#fff" />
                    </View>
                  </Animated.View>
                </>
              )}
            </View>
            
            {/* Simple text box showing site name - always visible */}
            {sharePointStatus.connected && sharePointStatus.siteName && (
              <View style={{
                backgroundColor: 'rgba(255, 255, 255, 0.9)',
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#ddd',
                ...(Platform.OS === 'web' ? {
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                } : {}),
              }}>
                <Text style={{ 
                  color: '#333', 
                  fontSize: 12, 
                  fontWeight: '600',
                }}>
                  {sharePointStatus.siteName}
                </Text>
              </View>
            )}
          </View>
          
          {/* Support tools menu */}
          {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#1565C0', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  try { navigation.navigate('AdminAuditLog'); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna adminlogg'); }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Adminlogg</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  try { navigation.navigate('ContactRegistry', { companyId }); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna kontaktregister'); }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Kontaktregister</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#43A047', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  try { navigation.navigate('Suppliers', { companyId }); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna leverantörer'); }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Leverantörer</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#FB8C00', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={() => {
                  try { navigation.navigate('Customers', { companyId }); } catch(_e) { Alert.alert('Fel', 'Kunde inte öppna kunder'); }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Kunder</Text>
              </TouchableOpacity>
            )}
            {__DEV__ && showAdminButton && canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  await saveHierarchy('testdemo', testHierarchy);
                  setShowAdminButton(false);
                  alert('Testdata har lagts in!');
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>Fyll på testdata</Text>
              </TouchableOpacity>
            )}
            {__DEV__ && showAdminButton && canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#43A047', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  await handleMakeDemoAdmin();
                  alert('Din användare är nu markerad som demo/admin (client-side).');
                }}
              >
                <Text style={{ color: '#fff', fontWeight: 'bold' }}>{adminActionRunning ? 'Kör...' : 'Gör mig demo-admin'}</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && localFallbackExists && (
              <TouchableOpacity
                style={{ backgroundColor: '#FFB300', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  // migrate local fallback (hierarki + controls) to Firestore with confirmation
                  try {
                    const rawHierarchy = await AsyncStorage.getItem('hierarchy_local');
                    const rawCompleted = await AsyncStorage.getItem('completed_controls');
                    const rawDrafts = await AsyncStorage.getItem('draft_controls');

                    if (!rawHierarchy && !rawCompleted && !rawDrafts) {
                      Alert.alert('Ingen lokal data', 'Ingen lokalt sparad hierarki eller kontroller hittades.');
                      await refreshLocalFallbackFlag();
                      return;
                    }

                    Alert.alert(
                      'Migrera lokal data',
                      'Vill du migrera lokalt sparad hierarki och kontroller till molnet för kontot? Detta kan skriva över befintlig molndata.',
                      [
                        { text: 'Avbryt', style: 'cancel' },
                        { text: 'Migrera', onPress: async () => {
                          try {
                            let successMsgs = [];

                            // Hierarki
                            if (rawHierarchy) {
                              try {
                                const parsed = JSON.parse(rawHierarchy);
                                const res = await saveHierarchy(companyId, parsed);
                                const ok = res === true || (res && res.ok === true);
                                if (ok) {
                                  await AsyncStorage.removeItem('hierarchy_local');
                                  setHierarchy(parsed);
                                  successMsgs.push('Hierarki migrerad');
                                } else {
                                  successMsgs.push('Hierarki misslyckades');
                                }
                              } catch(_e) {
                                successMsgs.push('Hierarki-fel');
                              }
                            }

                            // Controls: backup locally first
                            if (rawCompleted) {
                              try {
                                await AsyncStorage.setItem('completed_controls_backup', rawCompleted);
                                const parsedCompleted = JSON.parse(rawCompleted);
                                let okCount = 0;
                                for (const ctl of parsedCompleted) {
                                  try {
                                    const ok = await saveControlToFirestore(ctl);
                                    if (ok) okCount++;
                                  } catch(_e) {}
                                }
                                if (okCount > 0) {
                                  await AsyncStorage.removeItem('completed_controls');
                                  successMsgs.push(`${okCount} utförda kontroller migrerade`);
                                } else {
                                  successMsgs.push('Inga utförda kontroller migrerade');
                                }
                              } catch(_e) {
                                successMsgs.push('Backup/migrering av utförda kontroller misslyckades');
                              }
                            }

                            if (rawDrafts) {
                              try {
                                await AsyncStorage.setItem('draft_controls_backup', rawDrafts);
                                const parsedDrafts = JSON.parse(rawDrafts);
                                let okDrafts = 0;
                                for (const d of parsedDrafts) {
                                  try {
                                    const ok = await saveDraftToFirestore(d);
                                    if (ok) okDrafts++;
                                  } catch(_e) {}
                                }
                                if (okDrafts > 0) {
                                  await AsyncStorage.removeItem('draft_controls');
                                  successMsgs.push(`${okDrafts} utkast migrerade`);
                                } else {
                                  successMsgs.push('Inga utkast migrerade');
                                }
                              } catch(_e) {
                                successMsgs.push('Backup/migrering av utkast misslyckades');
                              }
                            }

                            Alert.alert('Migrering klar', successMsgs.join('\n'));
                            await refreshLocalFallbackFlag();
                          } catch(_e) {
                            Alert.alert('Fel', 'Kunde inte migrera: ' + (_e?.message || 'okänt fel'));
                          }
                        }}
                      ],
                    );
                  } catch(_e) {
                    Alert.alert('Fel', 'Kunde inte läsa lokal data.');
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Migrera lokal data</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (auth && auth.currentUser) && (
              <TouchableOpacity
                style={{ backgroundColor: '#1976D2', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    // Force refresh token
                    await auth.currentUser.getIdToken(true);
                    showAlert('Token uppdaterad', 'ID-token uppdaterad. Försöker migrera lokal data...');
                    // attempt migration if local data exists
                    const raw = await AsyncStorage.getItem('hierarchy_local');
                    if (!raw) {
                      showAlert('Ingen lokal data', 'Inget att migrera.');
                      await refreshLocalFallbackFlag();
                      return;
                    }
                    const parsed = JSON.parse(raw);
                    const res = await saveHierarchy(companyId, parsed);
                    const ok = res === true || (res && res.ok === true);
                      if (ok) {
                      await AsyncStorage.removeItem('hierarchy_local');
                      await refreshLocalFallbackFlag();
                      setHierarchy(parsed);
                      showAlert('Klar', 'Lokal hierarki migrerad till molnet.');
                    } else {
                      showAlert('Misslyckades', 'Kunde inte spara till molnet. Fel: ' + (res && res.error ? res.error : 'okänt fel'));
                    }
                  } catch(_e) {
                    showAlert('Fel', 'Kunde inte uppdatera token eller migrera: ' + (_e?.message || _e));
                  }
                }}
              >
                <Text style={{ color: '#fff', fontWeight: '700' }}>Uppdatera token & synka</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#eee', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => {
                  try {
                    const user = auth.currentUser;
                    const tokenRes = user ? await auth.currentUser.getIdTokenResult(true).catch((e) => null) : null;
                    const claims = tokenRes?.claims || {};
                    const stored = await AsyncStorage.getItem('dk_companyId');
                    showAlert('Auth info', `user: ${user ? user.email + ' (' + user.uid + ')' : 'not signed in'}\nclaims.companyId: ${claims.companyId || '—'}\ndk_companyId: ${stored || '—'}`);
                  } catch(_e) {
                    showAlert('Fel', 'Kunde inte läsa auth info: ' + (_e?.message || _e));
                  }
                }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa auth-info</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#ddd', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await dumpLocalRemoteControls(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Debug: visa lokal/moln</Text>
              </TouchableOpacity>
            )}
            {canShowSupportToolsInHeader && supportMenuOpen && (
              <TouchableOpacity
                style={{ backgroundColor: '#f5f5f5', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginTop: 8, alignSelf: 'flex-start' }}
                onPress={async () => { await showLastFsError(); }}
              >
                <Text style={{ color: '#222', fontWeight: '700' }}>Visa senaste FS-fel</Text>
              </TouchableOpacity>
            )}
        </View>
        
        {/* Allt under headern är skrollbart */}
        {Platform.OS === 'web' ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                  <View style={{ width: leftWidth, padding: 8, borderRightWidth: 0, borderColor: '#e6e6e6', backgroundColor: '#f5f6f7', height: webPaneHeight, position: 'relative' }}>
                    {/* Thin right-side divider for visual separation */}
                    <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
                    {/* Draggable handle - sits above the divider */}
                    <View
                  {...(panResponder && panResponder.panHandlers)}
                  style={Platform.OS === 'web' ? { 
                    position: 'absolute', 
                    right: -8, 
                    top: 0, 
                    bottom: 0, 
                    width: 16, 
                    cursor: 'col-resize', 
                    zIndex: 9,
                    // Förhindra att handle blockerar scroll
                    pointerEvents: 'auto',
                  } : { 
                    position: 'absolute', 
                    right: -12, 
                    top: 0, 
                    bottom: 0, 
                    width: 24, 
                    zIndex: 9 
                  }}
                    />
              <View style={{ paddingVertical: 8, paddingHorizontal: 6, borderBottomWidth: 1, borderColor: '#e0e0e0', marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                {/* Phase dropdown removed - phases are now SharePoint folders shown directly in left panel */}
                
                {/* Home and Refresh buttons */}
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <TouchableOpacity
                    style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
                    onPress={() => {
                      setSpinSidebarHome((n) => n + 1);
                      if (selectedProject) closeSelectedProject();
                    }}
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
                    onPress={() => {
                      setSpinSidebarRefresh((n) => n + 1);
                      if (selectedProject) {
                        setProjectControlsRefreshNonce((n) => n + 1);
                      } else {
                        try { loadDashboard(); } catch(_e) {}
                      }
                    }}
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
              {/* Phase selector dropdown - removed, now above */}
              {false && !selectedProject ? (
                Platform.OS === 'web' ? (
                  <div style={{ padding: '8px', borderBottom: '1px solid #e0e0e0', marginBottom: 8, position: 'relative' }}>
                    {(() => {
                    })()}
                  </div>
                ) : (
                  <View style={{ paddingHorizontal: 8, paddingTop: 8, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#e0e0e0', marginBottom: 8, position: 'relative' }}>
                    {(() => {
                    })()}
                  </View>
                )
              ) : null}
              <ScrollView 
                ref={leftTreeScrollRef} 
                style={{ flex: 1 }}
                scrollEnabled={true}
                nestedScrollEnabled={true}
              >
                {(() => {
                  // ALWAYS show PhaseLeftPanel when a project is selected (all projects have a phase, default is kalkylskede)
                  // This replaces ProjectTree in the leftpanel
                  console.log('[HomeScreen] LEFT PANEL RENDER (ScrollView) - selectedProject:', !!selectedProject, 'projectPhaseKey:', projectPhaseKey, 'phaseNavigation:', !!phaseNavigation);
                  
                  // If project is selected, show PhaseLeftPanel instead of ProjectTree
                  if (selectedProject && projectPhaseKey) {
                    console.log('[HomeScreen] Project selected in ScrollView, checking phase navigation...');
                    
                    // Show loading while navigation is loading
                    if (phaseNavigationLoading) {
                      console.log('[HomeScreen] Showing loading state in ScrollView');
                      return (
                        <View style={{ padding: 20, alignItems: 'center' }}>
                          <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                        </View>
                      );
                    }
                    
                    // With SharePoint-first approach, show ProjectTree with project folders from SharePoint
                    // instead of PhaseLeftPanel with hardcoded navigation
                    console.log('[HomeScreen] Rendering ProjectTree with SharePoint data for selected project');
                    
                    // Create a hierarchy structure with the selected project as root and its folders as children
                    const projectHierarchy = selectedProject ? [{
                      id: selectedProject.id,
                      name: selectedProject.name || selectedProject.id,
                      type: 'project',
                      expanded: true,
                      children: selectedProjectFolders.map(folder => ({
                        ...folder,
                        type: 'projectFunction',
                      })),
                      ...selectedProject
                    }] : [];
                    
                    return (
                      <ProjectTree
                        hierarchy={projectHierarchy}
                        selectedProject={selectedProject}
                        selectedPhase={projectPhaseKey}
                        onSelectProject={(project) => {
                          if (isWeb) {
                            setSelectedProject({ ...project });
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
                                createdBy: project.createdBy || ''
                              },
                              companyId
                            });
                          }
                        }}
                        onSelectFunction={handleSelectFunction}
                        navigation={navigation}
                        companyId={companyId}
                        projectStatusFilter={projectStatusFilter}
                      />
                    );
                  }
                  
                  // Show loading indicator when changing phase
                  if (phaseChanging || loadingHierarchy) {
                    const spin = phaseChangeSpinAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: ['0deg', '360deg'],
                    });
                    return (
                      <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
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
                          <Text style={{ color: '#888', fontSize: 14, marginTop: 16, textAlign: 'center' }}>
                            Byter fas...
                          </Text>
                        </View>
                      </View>
                    );
                  }
                  
                  // With SharePoint-first approach, hierarchy is already from SharePoint
                  // No need to filter by phase - SharePoint folders represent the structure
                  // Use hierarchy directly from SharePoint without phase filtering
                  const filteredHierarchy = hierarchy;
                  
                  if (filteredHierarchy.length === 0) {
                    console.log('[HomeScreen] No hierarchy, showing empty state');
                    return (
                      <View style={{ paddingHorizontal: 4 }} nativeID={Platform.OS === 'web' ? 'dk-tree-root' : undefined}>
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 0 2px 4px', userSelect: 'none' }}
                        >
                          {(() => {
                            const isHovered = Platform.OS === 'web' && hoveredRowKey === 'create-main-folder';
                            if (isCreatingMainFolder) {
                              return (
                                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                  <Ionicons
                                    name="folder-outline"
                                    size={18}
                                    color="#1976D2"
                                    style={{ marginRight: 4 }}
                                  />
                                  <TextInput
                                    autoFocus
                                    placeholder="Namn på mapp..."
                                    value={newMainFolderName}
                                    onChangeText={setNewMainFolderName}
                                    onSubmitEditing={async () => {
                                      if (newMainFolderName.trim() === '' || !isFolderNameUnique(newMainFolderName)) return;
                                      const newMain = {
                                        id: (Math.random() * 100000).toFixed(0),
                                        name: newMainFolderName.trim(),
                                        type: 'main',
                                        phase: selectedPhase,
                                        expanded: false,
                                        children: [],
                                      };
                                      const newHierarchy = [...hierarchy, newMain];
                                      setHierarchy(newHierarchy);
                                      setNewMainFolderName('');
                                      setIsCreatingMainFolder(false);
                                      try {
                                        const ok = await saveHierarchy(companyId, newHierarchy);
                                        if (!ok) {
                                          await AsyncStorage.setItem('hierarchy_local', JSON.stringify(newHierarchy));
                                          setLocalFallbackExists(true);
                                          Alert.alert('Offline', 'Huvudmappen sparades lokalt. Appen kommer försöka synka senare.');
                                        } else {
                                          try { await AsyncStorage.removeItem('hierarchy_local'); } catch(_e) {}
                                          await refreshLocalFallbackFlag();
                                        }
                                      } catch(_e) {
                                        try { await AsyncStorage.setItem('hierarchy_local', JSON.stringify(newHierarchy)); } catch(_e) {}
                                        Alert.alert('Offline', 'Huvudmappen sparades lokalt. Appen kommer försöka synka senare.');
                                      }
                                    }}
                                    onBlur={() => {
                                      if (newMainFolderName.trim() === '') {
                                        setIsCreatingMainFolder(false);
                                        setNewMainFolderName('');
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      fontSize: 15,
                                      fontWeight: '400',
                                      color: '#222',
                                      padding: '2px 4px',
                                      borderWidth: 1,
                                      borderColor: (newMainFolderName.trim() === '' || !isFolderNameUnique(newMainFolderName)) ? '#D32F2F' : '#1976D2',
                                      borderRadius: 4,
                                      backgroundColor: '#fff',
                                    }}
                                  />
                                  {newMainFolderName.trim() !== '' && !isFolderNameUnique(newMainFolderName) && (
                                    <Text style={{ fontSize: 12, color: '#D32F2F', marginLeft: 4 }}>
                                      Finns redan
                                    </Text>
                                  )}
                                </View>
                              );
                            }
                            return (
                              <TouchableOpacity
                                onPress={() => {
                                  setIsCreatingMainFolder(true);
                                  setNewMainFolderName('');
                                }}
                                onMouseEnter={Platform.OS === 'web' ? () => setHoveredRowKey('create-main-folder') : undefined}
                                onMouseLeave={Platform.OS === 'web' ? () => setHoveredRowKey(null) : undefined}
                                style={{
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  flex: 1,
                                  backgroundColor: isHovered ? '#eee' : 'transparent',
                                  borderRadius: 4,
                                  padding: '2px 4px',
                                  borderWidth: 1,
                                  borderColor: isHovered ? '#1976D2' : 'transparent',
                                  transition: 'background 0.15s, border 0.15s',
                                }}
                                activeOpacity={0.7}
                              >
                                <Ionicons
                                  name="add-circle-outline"
                                  size={18}
                                  color="#1976D2"
                                  style={{ marginRight: 4 }}
                                />
                                <Text style={{ fontSize: 15, fontWeight: isHovered ? '600' : '400', color: '#222', marginLeft: 2 }}>
                                  Skapa mapp
                                </Text>
                              </TouchableOpacity>
                            );
                          })()}
                        </View>
                      </View>
                    );
                  }
                  
                  // Render all folders recursively from root - no assumptions about depth
                  // SharePoint is the source of truth, render all folders recursively
                  return (
                    <View style={{ paddingHorizontal: 4 }} nativeID={Platform.OS === 'web' ? 'dk-tree-root' : undefined}>
                      {filteredHierarchy
                        .filter(folder => folder.type === 'folder' || !folder.type) // Only folders, no projects at root
                        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                        .map((folder) => (
                          <RecursiveFolderView
                            key={folder.id}
                            folder={folder}
                            level={0}
                            expandedSubs={expandedSubs}
                            spinSubs={spinSub}
                            onToggle={handleToggleSubFolder}
                            companyId={companyId}
                            hierarchy={hierarchy}
                            setHierarchy={setHierarchy}
                            parentPath=""
                          />
                        ))}
                    </View>
                  );
                })()}
              </ScrollView>

              {Platform.OS === 'web' && (
                <ContextMenu
                  visible={contextMenu.visible}
                  x={contextMenu.x}
                  y={contextMenu.y}
                  items={contextMenuItems}
                  onSelect={handleContextMenuSelect}
                  onClose={closeContextMenu}
                />
              )}
              
              {/* Sidebar bottom-left: sync status + app version (web portal to avoid clipping) - Only show when no project is selected */}
              {!selectedProject && Platform.OS === 'web' && createPortal && typeof document !== 'undefined' ? (() => {
                try {
                  let footerRoot = document.getElementById('dk-footer-portal');
                  if (!footerRoot) {
                    footerRoot = document.createElement('div');
                    footerRoot.id = 'dk-footer-portal';
                    document.body.appendChild(footerRoot);
                  }

                  const FooterBox = (
                    <View style={{ position: 'fixed', left: 12, bottom: 12, zIndex: 2147483647, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.96)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', shadowColor: '#000', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 12, elevation: 12, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                          Synk: {syncStatus}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>Version: {appVersion}</Text>
                      </View>
                    </View>
                  );

                  return createPortal(FooterBox, footerRoot);
                } catch(_e) {
                    return (
                    <View style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 9999, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', elevation: 8, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                          Synk: {syncStatus}
                        </Text>
                        <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Version: {appVersion}</Text>
                      </View>
                    </View>
                  );
                }
              })() : (!selectedProject ? (
                <View style={{ position: 'absolute', left: 8, bottom: 8, zIndex: 9999, pointerEvents: 'auto', backgroundColor: 'rgba(255,255,255,0.95)', paddingVertical: 6, paddingHorizontal: 10, borderRadius: 8, borderWidth: 1, borderColor: '#e6e6e6', elevation: 8, ...(Platform && Platform.OS === 'web' ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' } : {}) }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: syncStatus === 'synced' ? '#2E7D32' : syncStatus === 'syncing' ? '#F57C00' : syncStatus === 'offline' ? '#757575' : syncStatus === 'error' ? '#D32F2F' : '#444' }}>
                      Synk: {syncStatus}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>Version: {appVersion} ({BUILD_STAMP})</Text>
                  </View>
                </View>
              ) : null)}

            </View>
            {Platform.OS === 'web' && (
              <TouchableOpacity
                onPress={() => scrollToEndSafe(leftTreeScrollRef)}
                activeOpacity={0.85}
                style={{
                  position: 'absolute',
                  right: 10,
                  bottom: 10,
                  zIndex: 20,
                  backgroundColor: '#fff',
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: '#e0e0e0',
                  padding: 6,
                }}
              >
                <Ionicons name="chevron-down" size={18} color="#222" />
              </TouchableOpacity>
            )}

            <View style={{ flex: 1, height: webPaneHeight, position: 'relative' }}>
              {Platform.OS === 'web' ? (
                <View style={{ flex: 1, flexDirection: 'row', minWidth: 0 }}>
                  {/* Main content (dashboard / project / control) */}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <ScrollView ref={rightPaneScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                      {inlineControlEditor && inlineControlEditor.project ? (
                        <View style={{ flex: 1, padding: 18 }}>
                          <TemplateControlScreen
                            project={inlineControlEditor.project}
                            controlType={inlineControlEditor.controlType}
                            route={{ params: { templateId: inlineControlEditor.templateId || null, companyId } }}
                            onExit={closeInlineControlEditor}
                            onFinished={handleInlineControlFinished}
                          />
                        </View>
                      ) : creatingProjectInline && selectedProject?.isTemporary ? (
                        // Inline redigering för att skapa projekt
                        <View style={{ flex: 1, backgroundColor: '#fff' }}>
                          <View style={{ padding: 24, borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
                            <Text style={{ fontSize: 20, fontWeight: '700', color: '#222', marginBottom: 4 }}>Skapa nytt projekt</Text>
                            <Text style={{ fontSize: 14, color: '#666' }}>Fyll i projektnummer och projektnamn för att spara</Text>
                          </View>
                          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 24 }}>
                            {/* Projektnummer - OBLIGATORISKT */}
                            <View style={{ marginBottom: 20 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                                Projektnummer <Text style={{ color: '#D32F2F' }}>*</Text>
                              </Text>
                              <TextInput
                                autoFocus
                                placeholder="T.ex. 2026-001"
                                value={newProjectNumber}
                                onChangeText={setNewProjectNumber}
                                style={{
                                  borderWidth: 1,
                                  borderColor: (!newProjectNumber.trim() && (newProjectName.trim() || newProjectNumber.trim())) ? '#D32F2F' : '#e0e0e0',
                                  borderRadius: 8,
                                  padding: 12,
                                  fontSize: 15,
                                  backgroundColor: '#fff',
                                }}
                              />
                              {!newProjectNumber.trim() && (newProjectName.trim() || newProjectNumber.trim()) && (
                                <Text style={{ fontSize: 12, color: '#D32F2F', marginTop: 4 }}>Projektnummer krävs</Text>
                              )}
                            </View>
                            
                            {/* Projektnamn - OBLIGATORISKT */}
                            <View style={{ marginBottom: 20 }}>
                              <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', marginBottom: 8 }}>
                                Projektnamn <Text style={{ color: '#D32F2F' }}>*</Text>
                              </Text>
                              <TextInput
                                placeholder="T.ex. Opus Bilprovning"
                                value={newProjectName}
                                onChangeText={setNewProjectName}
                                style={{
                                  borderWidth: 1,
                                  borderColor: (!newProjectName.trim() && (newProjectName.trim() || newProjectNumber.trim())) ? '#D32F2F' : '#e0e0e0',
                                  borderRadius: 8,
                                  padding: 12,
                                  fontSize: 15,
                                  backgroundColor: '#fff',
                                }}
                              />
                              {!newProjectName.trim() && (newProjectName.trim() || newProjectNumber.trim()) && (
                                <Text style={{ fontSize: 12, color: '#D32F2F', marginTop: 4 }}>Projektnamn krävs</Text>
                              )}
                            </View>

                            {/* Knappar */}
                            <View style={{ flexDirection: 'row', gap: 12, marginTop: 24 }}>
                              <TouchableOpacity
                                onPress={async () => {
                                  const projNum = newProjectNumber.trim();
                                  const projName = newProjectName.trim();
                                  
                                  if (!projNum || !projName) {
                                    Alert.alert('Saknade fält', 'Projektnummer och projektnamn måste fyllas i för att spara projektet.');
                                    return;
                                  }

                                  if (!isProjectNumberUnique(projNum)) {
                                    Alert.alert('Projektnummer finns redan', 'Detta projektnummer används redan. Välj ett annat.');
                                    return;
                                  }

                                  // Skapa projektet
                                  setCreatingProject(true);
                                  try {
                                    const newProj = {
                                      id: projNum,
                                      name: projName,
                                      type: 'project',
                                      status: 'ongoing',
                                      phase: selectedPhase,
                                      createdAt: new Date().toISOString(),
                                      createdBy: auth?.currentUser?.email || '',
                                    };

                                    // Lägg till i hierarchy
                                    let updatedHierarchy;
                                    if (creatingProjectInline.parentType === 'main') {
                                      const mainId = creatingProjectInline.parentId;
                                      updatedHierarchy = hierarchy.map(main =>
                                        main.id === mainId
                                          ? {
                                              ...main,
                                              children: [
                                                ...(main.children || []),
                                                {
                                                  id: String(Math.random() * 100000).toFixed(0),
                                                  name: 'Ny undermapp',
                                                  type: 'sub',
                                                  phase: selectedPhase,
                                                  children: [newProj],
                                                }
                                              ]
                                            }
                                          : main
                                      );
                                    } else {
                                      const mainId = creatingProjectInline.mainId;
                                      const subId = creatingProjectInline.parentId;
                                      updatedHierarchy = hierarchy.map(main =>
                                        main.id === mainId
                                          ? {
                                              ...main,
                                              children: (main.children || []).map(sub =>
                                                sub.id === subId
                                                  ? {
                                                      ...sub,
                                                      children: [...(sub.children || []), newProj]
                                                    }
                                                  : sub
                                              )
                                            }
                                          : main
                                      );
                                    }

                                    // Uppdatera state och spara hierarchy
                                    setHierarchy(updatedHierarchy);
                                    const saveOk = await saveHierarchy(companyId, updatedHierarchy);
                                    if (!saveOk) {
                                      await AsyncStorage.setItem('hierarchy_local', JSON.stringify(updatedHierarchy));
                                      setLocalFallbackExists(true);
                                      Alert.alert('Offline', 'Projektet sparades lokalt. Appen kommer försöka synka senare.');
                                    } else {
                                      try { await AsyncStorage.removeItem('hierarchy_local'); } catch(_e) {}
                                      await refreshLocalFallbackFlag();
                                    }
                                    
                                    // Stäng inline-redigering och öppna det nya projektet
                                    setCreatingProjectInline(null);
                                    setNewProjectName('');
                                    setNewProjectNumber('');
                                    resetProjectFields();
                                    requestProjectSwitch(newProj, { 
                                      path: selectedProjectPath,
                                      selectedAction: null 
                                    });
                                  } catch (error) {
                                    console.error('Error creating project:', error);
                                    Alert.alert('Fel', 'Kunde inte skapa projektet. Försök igen.');
                                  } finally {
                                    setCreatingProject(false);
                                  }
                                }}
                                disabled={creatingProject || !newProjectNumber.trim() || !newProjectName.trim()}
                                style={{
                                  flex: 1,
                                  backgroundColor: (newProjectNumber.trim() && newProjectName.trim()) ? '#1976D2' : '#ccc',
                                  borderRadius: 8,
                                  padding: 14,
                                  alignItems: 'center',
                                  opacity: creatingProject || !newProjectNumber.trim() || !newProjectName.trim() ? 0.5 : 1,
                                }}
                              >
                                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                                  {creatingProject ? 'Sparar...' : 'Spara projekt'}
                                </Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => {
                                  // Ta bort temporärt projekt om fälten är tomma, annars varna
                                  if (!newProjectNumber.trim() && !newProjectName.trim()) {
                                    setCreatingProjectInline(null);
                                    setSelectedProject(null);
                                    setSelectedProjectPath(null);
                                    setNewProjectName('');
                                    setNewProjectNumber('');
                                    resetProjectFields();
                                  } else {
                                    Alert.alert(
                                      'Avbryt skapande?',
                                      'Om du avbryter nu kommer projektet inte att sparas.',
                                      [
                                        { text: 'Fortsätt redigera', style: 'cancel' },
                                        {
                                          text: 'Avbryt',
                                          style: 'destructive',
                                          onPress: () => {
                                            setCreatingProjectInline(null);
                                            setSelectedProject(null);
                                            setSelectedProjectPath(null);
                                            setNewProjectName('');
                                            setNewProjectNumber('');
                                            resetProjectFields();
                                          }
                                        }
                                      ]
                                    );
                                  }
                                }}
                                style={{
                                  backgroundColor: '#f5f5f5',
                                  borderRadius: 8,
                                  padding: 14,
                                  alignItems: 'center',
                                  minWidth: 100,
                                }}
                              >
                                <Text style={{ color: '#222', fontSize: 16, fontWeight: '600' }}>Avbryt</Text>
                              </TouchableOpacity>
                            </View>
                          </ScrollView>
                        </View>
                      ) : selectedProject ? (
                        <View style={{ flex: 1 }}>
                          <ProjectDetails route={{ params: { project: selectedProject, companyId, selectedAction: projectSelectedAction, onInlineLockChange: handleInlineLockChange, onInlineViewChange: handleInlineViewChange } }} navigation={navigation} inlineClose={closeSelectedProject} refreshNonce={projectControlsRefreshNonce} />
                        </View>
                      ) : (
                        <View style={{ flex: 1, padding: 18 }}>
                          <View style={{ position: 'relative' }}>
                            {Platform.OS === 'web' && dashboardFocus ? (
                              <Pressable
                                style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 10 }}
                                onPress={() => { setDashboardFocus(null); setDashboardDropdownTop(null); setDashboardHoveredStatKey(null); }}
                              />
                            ) : null}

                            <Dashboard
                              dashboardLoading={dashboardLoading}
                              dashboardOverview={dashboardOverview}
                              dashboardRecentProjects={dashboardRecentProjects}
                              companyActivity={companyActivity}
                              dashboardFocus={dashboardFocus}
                              dashboardHoveredStatKey={dashboardHoveredStatKey}
                              dashboardDropdownAnchor={dashboardDropdownAnchor}
                              dashboardDropdownTop={dashboardDropdownTop}
                              dashboardDropdownRowKey={dashboardDropdownRowKey}
                              dashboardActiveProjectsList={dashboardActiveProjectsList}
                              dashboardDraftItems={dashboardDraftItems}
                              dashboardControlsToSignItems={dashboardControlsToSignItems}
                              dashboardOpenDeviationItems={dashboardOpenDeviationItems}
                              dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
                              dashboardBtn1Url={dashboardBtn1Url}
                              dashboardBtn2Url={dashboardBtn2Url}
                              dashboardBtn1Failed={dashboardBtn1Failed}
                              dashboardBtn2Failed={dashboardBtn2Failed}
                              dashboardCardLayoutRef={dashboardCardLayoutRef}
                              dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
                              webPaneHeight={webPaneHeight}
                              onProjectSelect={(project) => requestProjectSwitch(project, { selectedAction: null })}
                              onDraftSelect={(project, draft) => {
                                requestProjectSwitch(project, {
                                                        selectedAction: {
                                                          id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                          kind: 'openDraft',
                                    type: draft?.type || 'Utkast',
                                    initialValues: draft,
                                                        },
                                                        clearActionAfter: true,
                                                      });
                                setDashboardFocus(null);
                                setDashboardDropdownTop(null);
                                setDashboardHoveredStatKey(null);
                              }}
                              onControlToSignSelect={(project, control) => {
                                requestProjectSwitch(project, {
                                                        selectedAction: {
                                    id: `openControl-${control?.id || Date.now()}`,
                                                          kind: 'openControlDetails',
                                    control: control,
                                                        },
                                                        clearActionAfter: true,
                                                      });
                                setDashboardFocus(null);
                                setDashboardDropdownTop(null);
                                setDashboardHoveredStatKey(null);
                              }}
                              onDeviationSelect={(project, entry) => {
                                requestProjectSwitch(project, {
                                                        selectedAction: {
                                    id: `openControl-${entry?.control?.id || Date.now()}`,
                                                          kind: 'openControlDetails',
                                    control: entry.control,
                                                        },
                                                        clearActionAfter: true,
                                                      });
                                setDashboardFocus(null);
                                setDashboardDropdownTop(null);
                                setDashboardHoveredStatKey(null);
                              }}
                              onSkyddsrondSelect={(project) => {
                                requestProjectSwitch(project, { selectedAction: null });
                                setDashboardFocus(null);
                                setDashboardDropdownTop(null);
                                setDashboardHoveredStatKey(null);
                              }}
                              onToggleDashboardFocus={toggleDashboardFocus}
                              onDashboardHover={setDashboardHoveredStatKey}
                              formatRelativeTime={formatRelativeTime}
                              findProjectById={findProjectById}
                              hierarchy={hierarchy}
                              _countProjectStatus={_countProjectStatus}
                              setDashboardBtn1Failed={setDashboardBtn1Failed}
                              setDashboardBtn2Failed={setDashboardBtn2Failed}
                              setDashboardDropdownRowKey={setDashboardDropdownRowKey}
                        selectedPhase={selectedPhase}
                        companyName={companyProfile?.companyName || companyProfile?.name || companyId || null}
                        companyId={companyId || routeCompanyId}
                        currentUserId={auth?.currentUser?.uid || null}
                        onCreateProject={() => {
                          // Find first available subfolder to create project in
                          const firstSubFolder = hierarchy.find(main => 
                            main.children && main.children.length > 0
                          )?.children?.[0];
                          if (firstSubFolder) {
                            setNewProjectModal({ visible: true, parentSubId: firstSubFolder.id });
                          } else {
                            // If no subfolder exists, show message
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              alert('Skapa först en undermapp i sidopanelen för att kunna skapa projekt.');
                            }
                          }
                        }}
                      />
                    </View>
                        </View>
                      )}
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => scrollToEndSafe(rightPaneScrollRef)}
                      activeOpacity={0.85}
                      style={{
                        position: 'absolute',
                        right: 10,
                        bottom: 10,
                        zIndex: 20,
                        backgroundColor: '#fff',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        padding: 6,
                      }}
                    >
                      <Ionicons name="chevron-down" size={18} color="#222" />
                    </TouchableOpacity>
                  </View>

                  {/* Persistent right side: activity - Hide when phase project is selected */}
                  {!selectedProject || !projectPhaseKey ? (
                    <View style={{ width: rightWidth, minWidth: 340, maxWidth: 520, padding: 18, borderLeftWidth: 1, borderLeftColor: '#e6e6e6', backgroundColor: '#F7FAFC', position: 'relative' }}>
                      {/* Divider for visual separation */}
                      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
                      {/* Draggable handle - sits above the left divider of the right panel */}
                      <View
                        {...(panResponderRight && panResponderRight.panHandlers)}
                        style={Platform.OS === 'web' ? { 
                          position: 'absolute', 
                          left: -8, 
                          top: 0, 
                          bottom: 0, 
                          width: 16, 
                          cursor: 'col-resize', 
                          zIndex: 9,
                          // Förhindra att handle blockerar scroll
                          pointerEvents: 'auto',
                        } : { 
                          position: 'absolute', 
                          left: -12, 
                          top: 0, 
                          bottom: 0, 
                          width: 24, 
                          zIndex: 9 
                        }}
                      />
                    <ScrollView 
                      ref={activityScrollRef} 
                      style={{ flex: 1 }} 
                      contentContainerStyle={{ paddingBottom: 24 }}
                      scrollEnabled={true}
                      nestedScrollEnabled={true}
                    >
                      <ActivityPanel />
                    </ScrollView>
                    <TouchableOpacity
                      onPress={() => scrollToEndSafe(activityScrollRef)}
                      activeOpacity={0.85}
                      style={{
                        position: 'absolute',
                        right: 10,
                        bottom: 10,
                        zIndex: 20,
                        backgroundColor: '#fff',
                        borderRadius: 16,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        padding: 6,
                      }}
                    >
                      <Ionicons name="chevron-down" size={18} color="#222" />
                    </TouchableOpacity>
                  </View>
                  ) : null}
                </View>
              ) : (
                <ScrollView ref={rightPaneScrollRef} style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: 24 }}>
                  {selectedProject ? (
                    <View style={{ flex: 1 }}>
                      <ProjectDetails 
                        route={{ 
                          params: { 
                            project: selectedProject, 
                            companyId, 
                            selectedAction: projectSelectedAction, 
                            onInlineLockChange: handleInlineLockChange,
                            phaseActiveSection: phaseActiveSection,
                            phaseActiveItem: phaseActiveItem,
                            onPhaseSectionChange: setPhaseActiveSection,
                            onPhaseItemChange: (sectionId, itemId) => {
                              setPhaseActiveSection(sectionId);
                              setPhaseActiveItem(itemId);
                            }
                          } 
                        }} 
                        navigation={navigation} 
                        inlineClose={closeSelectedProject} 
                        refreshNonce={projectControlsRefreshNonce} 
                      />
                    </View>
                  ) : (
                    <View style={{ flex: 1, padding: 18 }}>
                      <Dashboard
                        dashboardLoading={dashboardLoading}
                        dashboardOverview={dashboardOverview}
                        dashboardRecentProjects={dashboardRecentProjects}
                        companyActivity={companyActivity}
                        dashboardFocus={dashboardFocus}
                        dashboardHoveredStatKey={dashboardHoveredStatKey}
                        dashboardDropdownAnchor={dashboardDropdownAnchor}
                        dashboardDropdownTop={dashboardDropdownTop}
                        dashboardDropdownRowKey={dashboardDropdownRowKey}
                        dashboardActiveProjectsList={dashboardActiveProjectsList}
                        dashboardDraftItems={dashboardDraftItems}
                        dashboardControlsToSignItems={dashboardControlsToSignItems}
                        dashboardOpenDeviationItems={dashboardOpenDeviationItems}
                        dashboardUpcomingSkyddsrondItems={dashboardUpcomingSkyddsrondItems}
                        dashboardBtn1Url={dashboardBtn1Url}
                        dashboardBtn2Url={dashboardBtn2Url}
                        dashboardBtn1Failed={dashboardBtn1Failed}
                        dashboardBtn2Failed={dashboardBtn2Failed}
                        dashboardCardLayoutRef={dashboardCardLayoutRef}
                        dashboardStatRowLayoutRef={dashboardStatRowLayoutRef}
                        webPaneHeight={webPaneHeight}
                        onProjectSelect={(project) => requestProjectSwitch(project, { selectedAction: null })}
                        onDraftSelect={(project, draft) => {
                          requestProjectSwitch(project, {
                                                  selectedAction: {
                                                    id: `openDraft-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                                                    kind: 'openDraft',
                              type: draft?.type || 'Utkast',
                              initialValues: draft,
                                                  },
                                                  clearActionAfter: true,
                                                });
                          setDashboardFocus(null);
                          setDashboardDropdownTop(null);
                          setDashboardHoveredStatKey(null);
                        }}
                        onControlToSignSelect={(project, control) => {
                          requestProjectSwitch(project, {
                                                  selectedAction: {
                              id: `openControl-${control?.id || Date.now()}`,
                                                    kind: 'openControlDetails',
                              control: control,
                                                  },
                                                  clearActionAfter: true,
                                                });
                          setDashboardFocus(null);
                          setDashboardDropdownTop(null);
                          setDashboardHoveredStatKey(null);
                        }}
                        onDeviationSelect={(project, entry) => {
                          requestProjectSwitch(project, {
                                                  selectedAction: {
                              id: `openControl-${entry?.control?.id || Date.now()}`,
                                                    kind: 'openControlDetails',
                              control: entry.control,
                                                  },
                                                  clearActionAfter: true,
                                                });
                          setDashboardFocus(null);
                          setDashboardDropdownTop(null);
                          setDashboardHoveredStatKey(null);
                        }}
                        onSkyddsrondSelect={(project) => {
                          requestProjectSwitch(project, { selectedAction: null });
                          setDashboardFocus(null);
                          setDashboardDropdownTop(null);
                          setDashboardHoveredStatKey(null);
                        }}
                        onToggleDashboardFocus={toggleDashboardFocus}
                        onDashboardHover={setDashboardHoveredStatKey}
                        formatRelativeTime={formatRelativeTime}
                        findProjectById={findProjectById}
                        hierarchy={hierarchy}
                        _countProjectStatus={_countProjectStatus}
                        setDashboardBtn1Failed={setDashboardBtn1Failed}
                        setDashboardBtn2Failed={setDashboardBtn2Failed}
                        setDashboardDropdownRowKey={setDashboardDropdownRowKey}
                        selectedPhase={selectedPhase}
                        companyName={companyProfile?.companyName || companyProfile?.name || companyId || null}
                        companyId={companyId || routeCompanyId}
                        currentUserId={auth?.currentUser?.uid || null}
                        onCreateProject={() => {
                          // Find first available subfolder to create project in
                          const firstSubFolder = hierarchy.find(main => 
                            main.children && main.children.length > 0
                          )?.children?.[0];
                          if (firstSubFolder) {
                            setNewProjectModal({ visible: true, parentSubId: firstSubFolder.id });
                          } else {
                            // If no subfolder exists, show message
                            if (Platform.OS === 'web' && typeof window !== 'undefined') {
                              alert('Skapa först en undermapp i sidopanelen för att kunna skapa projekt.');
                            }
                          }
                        }}
                      />
                    </View>
                  )}
                </ScrollView>
              )}
            </View>
          </View>
        ) : null}
          {/* Uppgifter-sektion + Skapa kontroll-knapp och popup för val av kontrolltyp */}
          <View style={Platform.OS === 'web' ? { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16 } : { marginTop: 18, marginBottom: 16, alignItems: 'flex-start', paddingHorizontal: 16, width: '100%' }}>
            {Platform.OS === 'web' ? (
              <View>
                <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap' }}>
                  {controlTypeOptions.map(({ type, icon, color }) => (
                    <TouchableOpacity
                      key={type}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        backgroundColor: '#fff',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#e0e0e0',
                        paddingVertical: 10,
                        paddingHorizontal: 14,
                        marginRight: 10,
                        marginBottom: 10,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 2 },
                        shadowOpacity: 0.06,
                        shadowRadius: 4,
                        elevation: 2,
                        cursor: 'pointer'
                      }}
                      onPress={() => {
                        setSelectProjectModal({ visible: true, type });
                        setShowControlTypeModal(false);
                      }}
                      activeOpacity={0.85}
                    >
                      <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                      <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{type}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ) : (
              <View>
                <View style={{ width: '100%', marginBottom: 6 }}>
                  <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', shadowColor: '#222', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 }}>
                    <TouchableOpacity
                      onPress={() => {
                        try {
                          if (!mainChevronSpinAnim.tasks) mainChevronSpinAnim.tasks = new Animated.Value(0);
                          spinOnce(mainChevronSpinAnim.tasks);
                        } catch (_) {}
                        setTasksOpen(prev => {
                          const next = !prev;
                          if (next) setControlsOpen(false);
                          return next;
                        });
                      }}
                      activeOpacity={0.85}
                      style={{
                        width: '100%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        minHeight: 44,
                      }}
                    >
                      <Animated.View style={mainChevronSpinAnim.tasks ? { transform: [{ rotate: mainChevronSpinAnim.tasks.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}>
                        <Ionicons name={tasksOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                      </Animated.View>
                      <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Uppgifter'}</Text>
                    </TouchableOpacity>

                    {tasksOpen ? (
                      <View>
                        {[
                          { key: 'task1', label: 'Uppgift 1', icon: 'list-outline', color: '#1976D2' },
                          { key: 'task2', label: 'Uppgift 2', icon: 'time-outline', color: '#00897B' },
                          { key: 'task3', label: 'Uppgift 3', icon: 'checkmark-circle-outline', color: '#7B1FA2' },
                        ].map((btn, idx) => (
                          <AnimatedRow
                            key={btn.key}
                            style={{
                              backgroundColor: '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingVertical: 12,
                              paddingLeft: 28,
                              paddingRight: 18,
                              borderTopWidth: 1,
                              borderColor: '#e0e0e0',
                              minHeight: 44,
                              width: '100%',
                            }}
                            onPress={() => {}}
                          >
                            <Ionicons name={btn.icon} size={18} color={btn.color} style={{ marginRight: 14 }} />
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.2 }}>{btn.label}</Text>
                          </AnimatedRow>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>

                {/* Kontroll: grouped block (same style as Uppgifter) */}
                <View style={{ width: '100%', marginTop: 4, marginBottom: 6, alignSelf: 'stretch' }}>
                  <View style={{ width: '100%', backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', overflow: 'hidden', shadowColor: '#222', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 1 }}>
                    <TouchableOpacity
                      onPress={() => {
                        try {
                          if (!mainChevronSpinAnim.controls) mainChevronSpinAnim.controls = new Animated.Value(0);
                          spinOnce(mainChevronSpinAnim.controls);
                        } catch (_) {}
                        setControlsOpen(prev => {
                          const next = !prev;
                          if (next) setTasksOpen(false);
                          return next;
                        });
                      }}
                      activeOpacity={0.85}
                      style={{
                        width: '100%',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'flex-start',
                        paddingVertical: 12,
                        paddingHorizontal: 12,
                        minHeight: 44,
                      }}
                    >
                      <Animated.View style={mainChevronSpinAnim.controls ? { transform: [{ rotate: mainChevronSpinAnim.controls.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] }) }] } : undefined}>
                        <Ionicons name={controlsOpen ? 'chevron-down' : 'chevron-forward'} size={22} color="#222" />
                      </Animated.View>
                      <Text style={{ color: '#222', fontWeight: '700', fontSize: 16, marginLeft: 8, flex: 1 }}>{'Skapa kontroll'}</Text>
                    </TouchableOpacity>

                    {controlsOpen ? (
                      <View>
                        {/* Skapa ny kontroll (keeps the add icon) */}
                        <AnimatedRow
                          onPress={() => setShowControlTypeModal(true)}
                          style={{
                            backgroundColor: '#fff',
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'flex-start',
                            paddingVertical: 12,
                            paddingLeft: 18,
                            paddingRight: 18,
                            borderTopWidth: 1,
                            borderColor: '#e0e0e0',
                            minHeight: 44,
                            width: '100%',
                          }}
                        >
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: '#1976D2', alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                            <Ionicons name="add" size={16} color="#fff" />
                          </View>
                          <Text style={{ color: '#222', fontWeight: '600', fontSize: 15, letterSpacing: 0.5 }}>Skapa ny kontroll</Text>
                        </AnimatedRow>

                        {/* Valfri 1-4 buttons */}
                        {[1,2,3,4].map((n) => (
                          <AnimatedRow
                            key={`valfri-${n}`}
                            style={{
                              backgroundColor: '#fff',
                              flexDirection: 'row',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              paddingVertical: 12,
                              paddingLeft: 28,
                              paddingRight: 18,
                              borderTopWidth: 1,
                              borderColor: '#e0e0e0',
                              minHeight: 44,
                              width: '100%',
                            }}
                            onPress={() => {}}
                          >
                            <Ionicons name="square-outline" size={18} color="#78909C" style={{ marginRight: 14 }} />
                            <Text style={{ color: '#222', fontWeight: '600', fontSize: 15 }}>{`Valfri ${n}`}</Text>
                          </AnimatedRow>
                        ))}
                      </View>
                    ) : null}
                  </View>
                </View>
              </View>
            )}
          
            {/* Modal för val av kontrolltyp */}
            {/* Modal för val av kontrolltyp */}
            <Modal
              visible={showControlTypeModal}
              transparent
              animationType="fade"
              onRequestClose={() => setShowControlTypeModal(false)}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center', padding: 18 }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, paddingVertical: 20, paddingHorizontal: 20, width: 340, maxWidth: '90%', maxHeight: '60%', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 8, color: '#222', textAlign: 'center', marginTop: 6 }}>
                    Välj kontrolltyp
                  </Text>
                  <View style={{ flexDirection: 'row', marginTop: 4 }}>
                    <ScrollView
                      style={{ maxHeight: 320, flex: 1 }}
                      showsVerticalScrollIndicator
                      onLayout={(e) => {
                        const h = e?.nativeEvent?.layout?.height || 0;
                        setControlTypeScrollMetrics(prev => ({ ...prev, containerHeight: h }));
                      }}
                      onContentSizeChange={(w, h) => {
                        setControlTypeScrollMetrics(prev => ({ ...prev, contentHeight: h || 0 }));
                      }}
                      onScroll={(e) => {
                        const y = e?.nativeEvent?.contentOffset?.y || 0;
                        setControlTypeScrollMetrics(prev => ({ ...prev, scrollY: y }));
                      }}
                      scrollEventThrottle={16}
                    >
                      {controlTypeOptions.map(({ type, icon, color }) => (
                        <TouchableOpacity
                          key={type}
                          style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12, paddingHorizontal: 8, borderRadius: 8, marginBottom: 8, backgroundColor: '#f5f5f5', borderWidth: 1, borderColor: '#e0e0e0' }}
                          onPress={() => {
                            setSelectProjectModal({ visible: true, type });
                            setShowControlTypeModal(false);
                          }}
                        >
                          <Ionicons name={icon} size={22} color={color} style={{ marginRight: 12 }} />
                          <Text style={{ fontSize: 16, color: '#222', fontWeight: '600' }}>{type}</Text>
                        </TouchableOpacity>
                      ))}
                      {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                        <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                          Inga kontrolltyper är aktiverade för företaget.
                        </Text>
                      ) : null}
                    </ScrollView>
                    {controlTypeCanScroll ? (
                      <View
                          style={{
                            pointerEvents: 'none',
                            width: 3,
                            marginLeft: 6,
                            borderRadius: 999,
                            backgroundColor: '#E0E0E0',
                            height: controlTypeScrollMetrics.containerHeight || 0,
                            overflow: 'hidden',
                            alignSelf: 'flex-start',
                            marginTop: 2,
                          }}
                        >
                        <View
                          style={{
                            position: 'absolute',
                            left: 0,
                            right: 0,
                            borderRadius: 999,
                            backgroundColor: '#B0B0B0',
                            height: controlTypeThumbHeight,
                            top: controlTypeThumbTop,
                          }}
                        />
                      </View>
                    ) : null}
                  </View>
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => setShowControlTypeModal(false)}
                  >
                    <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* Modal: skapa ny kontroll för valt projekt via högerklick på projekt i trädet */}
            <Modal
              visible={projectControlModal.visible}
              transparent
              animationType="fade"
              onRequestClose={() => {
                setProjectControlModal({ visible: false, project: null });
                setProjectControlSelectedType('');
                setProjectControlTypePickerOpen(false);
                setProjectControlSelectedTemplateId('');
                setProjectControlTemplatePickerOpen(false);
                setProjectControlTemplateSearch('');
              }}
            >
              <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.25)', justifyContent: 'center', alignItems: 'center' }}>
                <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 24, width: 340, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.18, shadowRadius: 8, elevation: 6 }}>
                  <Text style={{ fontSize: 18, fontWeight: '600', marginBottom: 4, color: '#222', textAlign: 'center' }}>
                    Skapa ny kontroll
                  </Text>
                  {projectControlModal.project && (
                    <Text style={{ fontSize: 14, color: '#555', marginBottom: 14, textAlign: 'center' }}>
                      {projectControlModal.project.id} - {projectControlModal.project.name}
                    </Text>
                  )}
                  <Text style={{ fontSize: 13, color: '#555', marginBottom: 6 }}>Kontrolltyp</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setProjectControlTypePickerOpen(o => !o)}
                    style={{
                      borderWidth: 1,
                      borderColor: '#ddd',
                      borderRadius: 8,
                      paddingVertical: 8,
                      paddingHorizontal: 10,
                      backgroundColor: '#fff',
                      marginBottom: 4,
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexShrink: 1 }}>
                        {(() => {
                          const meta = controlTypeOptions.find(o => o.type === projectControlSelectedType) || null;
                          if (!meta) return null;
                          return (
                            <View
                              style={{
                                width: 22,
                                height: 22,
                                borderRadius: 6,
                                backgroundColor: meta.color || '#00897B',
                                alignItems: 'center',
                                justifyContent: 'flex-start',
                                marginRight: 8,
                              }}
                            >
                              <Ionicons name={meta.icon} size={14} color="#fff" />
                            </View>
                          );
                        })()}
                        <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                          {projectControlSelectedType || 'Välj kontrolltyp'}
                        </Text>
                      </View>
                      <Ionicons
                        name={projectControlTypePickerOpen ? 'chevron-up' : 'chevron-down'}
                        size={18}
                        color="#555"
                      />
                    </View>
                  </TouchableOpacity>
                  {projectControlTypePickerOpen && controlTypeOptions.length > 0 && (
                    <View
                      style={{
                        marginBottom: 10,
                        borderWidth: 1,
                        borderColor: '#ddd',
                        borderRadius: 8,
                        backgroundColor: '#fff',
                        maxHeight: 220,
                        overflow: 'auto',
                      }}
                    >
                      {controlTypeOptions.map(({ type, icon, color }) => {
                        const selected = type === projectControlSelectedType;
                        return (
                          <TouchableOpacity
                            key={type}
                            onPress={() => {
                              setProjectControlSelectedType(type);
                              setProjectControlTypePickerOpen(false);
                            }}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              paddingVertical: 8,
                              paddingHorizontal: 10,
                              backgroundColor: selected ? '#E0F2F1' : '#fff',
                              borderBottomWidth: 1,
                              borderBottomColor: '#eee',
                            }}
                          >
                            <Ionicons name={icon} size={18} color={color} style={{ marginRight: 10 }} />
                            <Text style={{ fontSize: 14, color: '#263238' }}>{type}</Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                  {Array.isArray(companyProfile?.enabledControlTypes) && controlTypeOptions.length === 0 ? (
                    <Text style={{ color: '#D32F2F', textAlign: 'center', marginTop: 6, marginBottom: 8 }}>
                      Inga kontrolltyper är aktiverade för företaget.
                    </Text>
                  ) : null}
                  {/* Mall-val: visas om det finns minst en mall för vald kontrolltyp */}
                  {(() => {
                    const ct = String(projectControlSelectedType || '').trim();
                    const allTemplates = Array.isArray(projectControlTemplates) ? projectControlTemplates : [];
                    const baseForType = ct
                      ? allTemplates.filter(t => String(t.controlType || '').trim() === ct)
                      : [];
                    // Om ingen mall överhuvudtaget finns för vald kontrolltyp, visa inget mall-fält.
                    if (!ct || baseForType.length === 0) return null;

                    let filtered = baseForType;
                    const q = String(projectControlTemplateSearch || '').trim().toLowerCase();
                    if (q) {
                      filtered = filtered.filter((t) => {
                        const title = String(t.title || '').toLowerCase();
                        const desc = String(t.description || '').toLowerCase();
                        const v = t.version != null ? String(t.version).toLowerCase() : '';
                        return title.includes(q) || desc.includes(q) || v.includes(q);
                      });
                    }
                    const selectedTemplate = baseForType.find(t => String(t.id) === String(projectControlSelectedTemplateId)) || null;
                    const selectedLabel = selectedTemplate?.title || 'Välj mall';
                    return (
                      <>
                        <Text style={{ fontSize: 13, color: '#555', marginBottom: 6, marginTop: 10 }}>Mall</Text>
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => setProjectControlTemplatePickerOpen(o => !o)}
                          style={{
                            borderWidth: 1,
                            borderColor: '#ddd',
                            borderRadius: 8,
                            paddingVertical: 8,
                            paddingHorizontal: 10,
                            backgroundColor: '#fff',
                            marginBottom: 4,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <Text style={{ fontSize: 14, fontWeight: '600', color: '#222', flexShrink: 1 }} numberOfLines={1}>
                              {selectedLabel}
                            </Text>
                            <Ionicons
                              name={projectControlTemplatePickerOpen ? 'chevron-up' : 'chevron-down'}
                              size={18}
                              color="#555"
                            />
                          </View>
                        </TouchableOpacity>
                        {projectControlTemplatePickerOpen && (
                          <View
                            style={{
                              marginBottom: 10,
                              borderWidth: 1,
                              borderColor: '#ddd',
                              borderRadius: 8,
                              backgroundColor: '#fff',
                              maxHeight: 220,
                              overflow: 'auto',
                            }}
                          >
                            <TextInput
                              placeholder="Sök mall"
                              value={projectControlTemplateSearch}
                              onChangeText={setProjectControlTemplateSearch}
                              style={{
                                paddingVertical: 6,
                                paddingHorizontal: 10,
                                borderBottomWidth: 1,
                                borderBottomColor: '#eee',
                                fontSize: 13,
                              }}
                            />
                            {filtered.length === 0 ? (
                              <Text
                                style={{ paddingVertical: 6, paddingHorizontal: 8, fontSize: 12, color: '#78909C' }}
                              >
                                Inga mallar hittades för din sökning.
                              </Text>
                            ) : filtered.map((tpl) => {
                              const selected = String(tpl.id) === String(projectControlSelectedTemplateId);
                              const title = tpl.title || 'Namnlös mall';
                              const v = tpl.version != null ? String(tpl.version) : '';
                              const versionLabel = v ? `v${v}` : '';
                              return (
                                <TouchableOpacity
                                  key={tpl.id}
                                  onPress={() => {
                                    setProjectControlSelectedTemplateId(String(tpl.id));
                                    setProjectControlTemplatePickerOpen(false);
                                  }}
                                  style={{
                                    paddingVertical: 5,
                                    paddingHorizontal: 8,
                                    backgroundColor: selected ? '#E3F2FD' : '#fff',
                                    borderBottomWidth: 1,
                                    borderBottomColor: '#eee',
                                  }}
                                >
                                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                    <Text style={{ fontSize: 13, color: '#263238', flexShrink: 1 }} numberOfLines={1}>
                                      {title}
                                    </Text>
                                    {!!versionLabel && (
                                      <Text style={{ fontSize: 11, color: '#78909C', marginLeft: 6 }} numberOfLines={1}>
                                        {versionLabel}
                                      </Text>
                                    )}
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        )}
                      </>
                    );
                  })()}
                  <TouchableOpacity
                    disabled={!projectControlSelectedType}
                    style={{
                      marginTop: 6,
                      marginBottom: 4,
                      alignSelf: 'stretch',
                      backgroundColor: projectControlSelectedType ? '#1976D2' : '#B0BEC5',
                      borderRadius: 10,
                      paddingVertical: 10,
                      alignItems: 'center',
                    }}
                    onPress={() => {
                      if (!projectControlSelectedType) return;
                      const proj = projectControlModal.project;
                      setProjectControlModal({ visible: false, project: null });
                      setProjectControlTypePickerOpen(false);
                      if (proj) {
                        const ct = projectControlSelectedType;
                        const tplId = projectControlSelectedTemplateId || null;
                        openInlineControlEditor(proj, ct, tplId);
                      }
                    }}
                  >
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>Skapa kontroll</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ marginTop: 8, alignSelf: 'center' }}
                    onPress={() => {
                      setProjectControlModal({ visible: false, project: null });
                      setProjectControlSelectedType('');
                      setProjectControlTypePickerOpen(false);
                    }}
                  >
                    <Text style={{ color: '#222', fontSize: 16 }}>Avbryt</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </Modal>
            {/* Modal för att välja projekt till kontroll */}
            {/* Select project modal (render component instead of inlining hooks in a callback) */}
            <SelectProjectModal
              visible={selectProjectModal.visible}
              type={selectProjectModal.type}
              hierarchy={hierarchy}
              searchText={searchText}
              onSearchTextChange={setSearchText}
              onClose={() => setSelectProjectModal({ visible: false, type: null })}
              onSelectProject={(project, type) => {
                if (type) {
                  openInlineControlEditor(project, type);
                }
              }}
            />
            {/* Utförda kontroller header removed from main screen; it's shown inside project details only */}
          </View>
          {/* Projektträd */}
          {/* Rubrik och sök-knapp */}
          <View style={{ width: '100%', alignItems: 'center', marginTop: 18, paddingHorizontal: 16 }}>
            <View style={{ height: 2, backgroundColor: '#e0e0e0', width: '100%', marginBottom: 12 }} />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, paddingHorizontal: 16 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPressIn={() => {
                if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
                projektLongPressTimer.current = setTimeout(() => {
                  setIsCreatingMainFolder(true);
                  setNewMainFolderName('');
                }, 2000);
              }}
              onPressOut={() => {
                if (projektLongPressTimer.current) clearTimeout(projektLongPressTimer.current);
              }}
            >
              <Text style={{ fontSize: 26, fontWeight: '600', color: '#263238', letterSpacing: 0.2, textAlign: 'center' }}>Projekt</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8 }}
                  onPress={() => {
                    spinOnce(filterSpinAnim);
                    setFilterModalVisible(true);
                  }}
                  activeOpacity={0.7}
                >
                  <View style={{ position: 'relative' }}>
                    <Animated.View style={{ transform: [{ rotate: filterRotate }] }}>
                      <Ionicons name="filter" size={22} color="#1976D2" />
                    </Animated.View>
                    {projectStatusFilter !== 'all' && (
                      <View
                        style={{
                          position: 'absolute',
                          right: -1,
                          top: -1,
                          width: 10,
                          height: 10,
                          borderRadius: 5,
                          backgroundColor: projectStatusFilter === 'completed' ? '#222' : '#43A047',
                          borderWidth: 1,
                          borderColor: '#fff',
                        }}
                      />
                    )}
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={{ padding: 6, borderRadius: 8, marginLeft: 10 }}
                  onPress={() => {
                    spinOnce(searchSpinAnim);
                    openSearchModal();
                  }}
                  activeOpacity={0.7}
                >
                  <Animated.View style={{ transform: [{ rotate: searchRotate }] }}>
                    <Ionicons name="search" size={22} color="#1976D2" />
                  </Animated.View>
                </TouchableOpacity>
              </View>
            )}
          </View>
          {!isWeb && (
            <View style={{ flex: 1, paddingHorizontal: 4 }}>
              {/* Phase selector removed - phases are now SharePoint folders shown directly in left panel */}
              
              {loadingHierarchy || hierarchy.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 16, textAlign: 'center', marginTop: 32 }}>
                  Inga mappar eller projekt skapade ännu.
                                          </Text>
                                        ) : (
                <View style={{ paddingHorizontal: 4 }}>
                  {(() => {
                    // ALWAYS show PhaseLeftPanel when a project is selected (all projects have a phase, default is kalkylskede)
                    // This replaces ProjectTree in the leftpanel
                    console.log('[HomeScreen] LEFT PANEL RENDER - selectedProject:', !!selectedProject, 'projectPhaseKey:', projectPhaseKey, 'phaseNavigation:', !!phaseNavigation);
                    
                    // If project is selected, show PhaseLeftPanel instead of ProjectTree
                    if (selectedProject && projectPhaseKey) {
                      console.log('[HomeScreen] Project selected, checking phase navigation...');
                      // Show loading while navigation is loading
                      if (phaseNavigationLoading) {
                        console.log('[HomeScreen] Showing loading state');
                        return (
                          <View style={{ padding: 20, alignItems: 'center' }}>
                            <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                          </View>
                        );
                      }
                      
                      // With SharePoint-first approach, show ProjectTree with project folders from SharePoint
                      // instead of PhaseLeftPanel with hardcoded navigation
                      console.log('[HomeScreen] Rendering ProjectTree with SharePoint data for selected project');
                      
                      // Create a hierarchy structure with the selected project as root and its folders as children
                      const projectHierarchy = selectedProject ? [{
                        id: selectedProject.id,
                        name: selectedProject.name || selectedProject.id,
                        type: 'project',
                        expanded: true,
                        children: selectedProjectFolders.map(folder => ({
                          ...folder,
                          type: 'projectFunction',
                        })),
                        ...selectedProject
                      }] : [];
                      
                      return (
                        <ProjectTree
                          hierarchy={projectHierarchy}
                          selectedProject={selectedProject}
                          selectedPhase={projectPhaseKey}
                          onSelectProject={(project) => {
                            if (isWeb) {
                              setSelectedProject({ ...project });
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
                                  createdBy: project.createdBy || ''
                                },
                                companyId
                              });
                            }
                          }}
                          onSelectFunction={handleSelectFunction}
                          navigation={navigation}
                          companyId={companyId}
                          projectStatusFilter={projectStatusFilter}
                        />
                      );
                    }
                    
                    // No project selected - show ProjectTree
                    console.log('[HomeScreen] No project selected, showing ProjectTree');

                    // Show ProjectTree for normal projects
                    return (
                      <ProjectTree
                        hierarchy={(() => {
                          // Filter hierarchy to selected phase - filter both folders and projects
                          const filtered = hierarchy
                            .filter(main => {
                              // Filter main folders by phase
                              const mainPhase = main?.phase || DEFAULT_PHASE;
                              return mainPhase === selectedPhase;
                            })
                            .map(main => ({
                              ...main,
                              children: (main.children || [])
                                .filter(sub => {
                                  // Filter sub folders by phase
                                  const subPhase = sub?.phase || main?.phase || DEFAULT_PHASE;
                                  return subPhase === selectedPhase;
                                })
                                .map(sub => ({
                                  ...sub,
                                  children: (sub.children || []).filter(project => {
                                    // Filter projects by phase
                                    const projectPhase = project?.phase || sub?.phase || main?.phase || DEFAULT_PHASE;
                                    return projectPhase === selectedPhase;
                                  })
                                }))
                            }));
                          return filtered;
                        })()}
                        selectedProject={selectedProject}
                        selectedPhase={selectedPhase}
                        onSelectProject={(project) => {
                          if (isWeb) {
                            setSelectedProject({ ...project });
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
                                createdBy: project.createdBy || ''
                              },
                              companyId
                            });
                          }
                        }}
                        onSelectFunction={handleSelectFunction}
                        navigation={navigation}
                        companyId={companyId}
                        projectStatusFilter={projectStatusFilter}
                        onToggleMainFolder={handleToggleMainFolder}
                        onToggleSubFolder={handleToggleSubFolder}
                        onAddSubFolder={(mainId) => {
                          // Öppna huvudmappen om den är stängd så att textrutan syns
                          const mainFolder = hierarchy.find(m => m.id === mainId);
                          if (mainFolder && !mainFolder.expanded) {
                            handleToggleMainFolder(mainId);
                          }
                          setCreatingSubFolderForMainId(mainId);
                          setNewSubFolderName("");
                        }}
                        onAddProject={(subId) => {
                          // Visa enkel modal för kalkylskede, fullständig modal för andra faser
                          if (selectedPhase === 'kalkylskede') {
                            const mainFolder = hierarchy.find(m => {
                              return (m.children || []).some(sub => sub.id === subId);
                            });
                            setSimpleProjectModal({ visible: true, parentSubId: subId, parentMainId: mainFolder?.id || null });
                            setNewProjectName("");
                            setNewProjectNumber("");
                          } else {
                            setNewProjectModal({ visible: true, parentSubId: subId });
                            setNewProjectName("");
                            setNewProjectNumber("");
                          }
                        }}
                        onAddMainFolder={() => {
                          setIsCreatingMainFolder(true);
                          setNewMainFolderName("");
                        }}
                        onEditMainFolder={(id, name) => {
                          setEditModal({ visible: true, type: 'main', id, name });
                        }}
                        onEditSubFolder={(id, name) => {
                          setEditModal({ visible: true, type: 'sub', id, name });
                        }}
                        mainChevronSpinAnim={mainChevronSpinAnim}
                        subChevronSpinAnim={subChevronSpinAnim}
                        mainTimersRef={mainTimersRef}
                        spinOnce={spinOnce}
                      />
                    );
                  })()}
                </View>
              )}
            </View>
          )}
      </ScrollView>
        
        {/* Phase Change Loading Modal */}
        <Modal
          visible={phaseChanging}
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
                  const phaseName = phaseNames[loadingPhase] || 'Laddar...';
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
        </RootContainer>
      );
    })()}
    </View>
  );
}
