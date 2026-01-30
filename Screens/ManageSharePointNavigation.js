/**
 * ManageSharePointNavigation - Admin screen for configuring SharePoint navigation
 * Allows admins to:
 * - Enable/disable SharePoint sites for sidebar
 * - Set root folders for each enabled site
 * - Mark folders as project-enabled locations
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, Platform, Text, TouchableOpacity, View } from 'react-native';
import { HomeHeader } from '../components/common/HomeHeader';
import SharePointSiteIcon from '../components/common/SharePointSiteIcon';
import { auth, getAvailableSharePointSites, getCompanySharePointSiteId, getSharePointNavigationConfig, saveSharePointNavigationConfig } from '../components/firebase';
import MainLayout from '../components/MainLayout';
import { useSharePointStatus } from '../hooks/useSharePointStatus';
import { getDriveItems } from '../services/azure/hierarchyService';

export default function ManageSharePointNavigation({ navigation, route }) {
  const [companyId, setCompanyId] = useState(() => {
    try {
      const fromRoute = String(route?.params?.companyId || '').trim();
      return fromRoute || '';
    } catch (_e) {
      return '';
    }
  });
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [config, setConfig] = useState({
    enabledSites: [],
    siteConfigs: {},
  });
  const [navigationState, setNavigationState] = useState(null); // CompanySharePointNavigation
  const [navigationInitialized, setNavigationInitialized] = useState(false);
  const [selectedSiteId, setSelectedSiteId] = useState(null);
  const [expandedSites, setExpandedSites] = useState({});
  const [folderTrees, setFolderTrees] = useState({}); // siteId -> folder tree
  const [loadingFolders, setLoadingFolders] = useState({});
  const [saveCompleted, setSaveCompleted] = useState(false);
  const saveTimeoutRef = useRef(null);
  const pendingNavigationRef = useRef(null);
  const [showHeaderUserMenu, setShowHeaderUserMenu] = useState(false);
  const [isSuperadmin, setIsSuperadmin] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState({}); // siteId -> { [path]: boolean }

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

  // Load company ID from storage/route (fallback if route param missing)
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        // Only fall back to AsyncStorage if we don't already have a companyId
        const current = String(companyId || '').trim();
        if (current) {
          return;
        }
        const stored = await AsyncStorage.getItem('dk_companyId');
        const storedTrim = String(stored || '').trim();
        if (storedTrim && mounted) {
          setCompanyId(storedTrim);
        }
      } catch (_e) {}
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Lyssna på globalt "dkGoHome"-event från AdminSidebar (web) och gå tillbaka till dashboard
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
        const cid = String(companyId || '').trim();
        if (!cid) return;

        // Reload available sites
        try {
          setLoadingSites(true);
          const allSites = await getAvailableSharePointSites();
          let nextSites = Array.isArray(allSites) ? allSites : [];

          if (!isSuperadmin) {
            const primarySiteId = await getCompanySharePointSiteId(cid).catch(() => null);
            if (primarySiteId) {
              nextSites = nextSites.filter((s) => String(s.id || '').trim() === String(primarySiteId || '').trim());
            } else {
              nextSites = [];
            }
          }

          setAvailableSites(nextSites);
        } catch (_e) {
          setAvailableSites([]);
        } finally {
          setLoadingSites(false);
        }

        // Reload navigation config
        try {
          setLoading(true);
          const navConfig = await getSharePointNavigationConfig(cid);
          setConfig(navConfig || { enabledSites: [], siteConfigs: {} });
          setNavigationInitialized(false);
        } catch (_e) {
          // Keep current config if fetch fails
        } finally {
          setLoading(false);
        }

        // Force reload folder trees
        try {
          setFolderTrees({});
          setExpandedFolders({});
          if (selectedSiteId) {
            loadFolderTree(selectedSiteId, { force: true });
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
  }, [navigation, companyId, isSuperadmin, selectedSiteId]);

  // Load available SharePoint sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) return;

      setLoadingSites(true);
      try {
        const allSites = await getAvailableSharePointSites();
        let nextSites = Array.isArray(allSites) ? allSites : [];

        // Vanlig företags-admin ska bara se företagets dedikerade site.
        if (!isSuperadmin) {
          const primarySiteId = await getCompanySharePointSiteId(companyId).catch(() => null);
          if (!primarySiteId) {
            if (mounted) {
              setAvailableSites([]);
              Alert.alert('Ingen SharePoint-site kopplad', 'Detta företag har ingen SharePoint-site kopplad ännu. Be en superadmin konfigurera en primär SharePoint-site under företagshanteringen.');
            }
            return;
          }
          nextSites = nextSites.filter((s) => String(s.id || '').trim() === String(primarySiteId || '').trim());
        }

        if (mounted) {
          setAvailableSites(nextSites);
        }
      } catch (error) {
        console.error('[ManageSharePointNavigation] Error loading sites:', error);
        if (mounted) {
          Alert.alert('Fel', `Kunde inte ladda SharePoint-sites: ${error.message}`);
        }
      } finally {
        if (mounted) setLoadingSites(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId, isSuperadmin]);

  // Load navigation config
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) return;
      
      setLoading(true);
      try {
        const navConfig = await getSharePointNavigationConfig(companyId);
        if (mounted) {
          setConfig(navConfig || { enabledSites: [], siteConfigs: {} });
          setNavigationInitialized(false);
        }
      } catch (error) {
        console.error('[ManageSharePointNavigation] Error loading config:', error);
        if (mounted) {
          Alert.alert('Fel', `Kunde inte ladda konfiguration: ${error.message}`);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  // Konfigurera header-beteende + roll (samma logik som på andra admin-sidor)
  useEffect(() => {
    if (Platform.OS !== 'web') return undefined;
    let mounted = true;
    (async () => {
      try {
        const email = String(auth?.currentUser?.email || '').toLowerCase();
        const isEmailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.com' || email === 'marcus.skogh@msbyggsystem';
        let tokenRes = null;
        try { tokenRes = await auth.currentUser?.getIdTokenResult(false).catch(() => null); } catch (_e) { tokenRes = null; }
        const claims = tokenRes?.claims || {};
        const isSuperClaim = !!(claims && (claims.superadmin === true || claims.role === 'superadmin'));
        const isAdminClaim = !!(claims && (claims.admin === true || claims.role === 'admin'));
        const superFlag = isEmailSuperadmin || isSuperClaim;
        const allowHeader = superFlag || isAdminClaim;
        if (mounted) {
          setShowHeaderUserMenu(!!allowHeader);
          setIsSuperadmin(!!superFlag);
        }
      } catch (_e) {
        if (mounted) setShowHeaderUserMenu(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Load folder tree for a site
  const loadFolderTree = async (siteId, { force = false } = {}) => {
    if (!force && (folderTrees[siteId] || loadingFolders[siteId])) return;
    
    setLoadingFolders(prev => ({ ...prev, [siteId]: true }));
    try {
      const items = await getDriveItems(siteId, '');
      const folders = (items || []).filter(item => item.folder);
      
      // Build tree structure
      const buildTree = (items, parentPath = '') => {
        return items.map(item => ({
          id: item.id,
          name: item.name,
          path: parentPath ? `${parentPath}/${item.name}` : item.name,
          webUrl: item.webUrl,
          children: [], // Will be loaded on demand
        }));
      };
      
      const tree = buildTree(folders);
      setFolderTrees(prev => ({ ...prev, [siteId]: tree }));
    } catch (error) {
      console.error('[ManageSharePointNavigation] Error loading folders:', error);
      Alert.alert('Fel', `Kunde inte ladda mappar: ${error.message}`);
    } finally {
      setLoadingFolders(prev => ({ ...prev, [siteId]: false }));
    }
  };

  const loadFolderChildren = async (siteId, folderPath) => {
    if (!siteId || !folderPath) return;
    setLoadingFolders(prev => ({ ...prev, [`${siteId}::${folderPath}`]: true }));
    try {
      const items = await getDriveItems(siteId, folderPath);
      const folders = (items || []).filter(item => item.folder);

      const children = folders.map(item => ({
        id: item.id,
        name: item.name,
        path: `${folderPath.replace(/\/+$/, '')}/${item.name}`.replace(/^\/+/, ''),
        webUrl: item.webUrl,
        children: [],
      }));

      setFolderTrees(prev => {
        const prevTree = prev[siteId] || [];

        const attachChildren = (nodes) => nodes.map((node) => {
          if (!node) return node;
          if (node.path === folderPath) {
            return { ...node, children };
          }
          if (Array.isArray(node.children) && node.children.length > 0) {
            return { ...node, children: attachChildren(node.children) };
          }
          return node;
        });

        return {
          ...prev,
          [siteId]: attachChildren(prevTree),
        };
      });
    } catch (error) {
      console.error('[ManageSharePointNavigation] Error loading child folders:', error);
    } finally {
      setLoadingFolders(prev => {
        const copy = { ...prev };
        delete copy[`${siteId}::${folderPath}`];
        return copy;
      });
    }
  };
  // Bygg CompanySharePointNavigation från befintligt config + sites
  const buildNavigationFromConfig = (cid, sites, cfg) => {
    const safeCompanyId = String(cid || '').trim();
    const enabledSites = Array.isArray(cfg?.enabledSites) ? cfg.enabledSites : [];
    const siteConfigs = cfg?.siteConfigs || {};

    const byId = new Map((Array.isArray(sites) ? sites : []).map((s) => [s.id, s]));

    const resultSites = [];
    byId.forEach((site, siteId) => {
      const baseName = site.displayName || site.name || site.webUrl || siteId;
      const enabled = enabledSites.includes(siteId);
      const cfgForSite = siteConfigs[siteId] || {};
      const paths = Array.isArray(cfgForSite.projectEnabledPaths) ? cfgForSite.projectEnabledPaths : [];
      const folders = paths.map((p) => ({
        path: p,
        name: p.split('/').slice(-1)[0] || p,
        enabled: true,
      }));

      resultSites.push({
        siteId,
        siteName: baseName,
        enabled,
        folders,
      });
    });

    return {
      companyId: safeCompanyId,
      sites: resultSites,
    };
  };

  const navigationToConfig = (nav) => {
    if (!nav || !Array.isArray(nav.sites)) {
      return { enabledSites: [], siteConfigs: {} };
    }
    const enabledSites = [];
    const siteConfigs = {};

    nav.sites.forEach((site) => {
      if (site.enabled) {
        enabledSites.push(site.siteId);
      }
      const enabledFolders = (site.folders || []).filter((f) => f.enabled);
      if (enabledFolders.length > 0 || site.enabled) {
        siteConfigs[site.siteId] = {
          projectEnabledPaths: enabledFolders.map((f) => f.path),
        };
      }
    });

    return { enabledSites, siteConfigs };
  };

  const queueSave = async (nextNavigation) => {
    pendingNavigationRef.current = nextNavigation;

    let cid = String(companyId || '').trim();
    if (!cid) {
      try {
        const stored = await AsyncStorage.getItem('dk_companyId');
        const storedTrim = String(stored || '').trim();
        if (storedTrim) {
          cid = storedTrim;
          setCompanyId(storedTrim);
        }
      } catch (_e) {}
    }

    const nav = pendingNavigationRef.current;
    if (!nav || !cid) return;

    setSaving(true);
    try {
      const cfg = navigationToConfig(nav);
      await saveSharePointNavigationConfig(cid, {
        ...cfg,
        companyId: nav.companyId,
        sites: nav.sites,
      });
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      setSaveCompleted(true);
      saveTimeoutRef.current = setTimeout(() => {
        setSaveCompleted(false);
        saveTimeoutRef.current = null;
      }, 2000);
    } catch (error) {
      console.error('[ManageSharePointNavigation] Error saving config:', error);
      Alert.alert('Fel', `Kunde inte spara: ${error.message}`);
    } finally {
      setSaving(false);
    }
  };

  const toggleSiteEnabled = (siteId) => {
    setNavigationState((prev) => {
      if (!prev) return prev;
      const nextSites = (prev.sites || []).map((s) =>
        s.siteId === siteId ? { ...s, enabled: !s.enabled } : s
      );
      const nextNav = { ...prev, sites: nextSites };
      queueSave(nextNav);
      return nextNav;
    });
    setSelectedSiteId((current) => current || siteId);
    if (!folderTrees[siteId]) {
      loadFolderTree(siteId);
    }
  };

  const toggleProjectEnabled = (siteId, folderPath, folderName) => {
    setNavigationState((prev) => {
      if (!prev) return prev;
      const nextSites = (prev.sites || []).map((site) => {
        if (site.siteId !== siteId) return site;
        const currentFolders = Array.isArray(site.folders) ? site.folders : [];
        const normalizedPath = String(folderPath || '').replace(/\/+$/, '');
        const idx = currentFolders.findIndex((f) => String(f.path || '').replace(/\/+$/, '') === normalizedPath);
        let nextFolders;

        if (idx === -1) {
          // Aktivera en ny mapp: ta bort alla mappar som är föräldrar eller barn
          // till denna path, så att endast den mest specifika nivån gäller.
          const withPrunedAncestorsAndDescendants = currentFolders.filter((f) => {
            const existingPath = String(f.path || '').replace(/\/+$/, '');
            if (!existingPath) return false;
            if (existingPath === normalizedPath) return false;

            const isAncestor = normalizedPath.startsWith(`${existingPath}/`);
            const isDescendant = existingPath.startsWith(`${normalizedPath}/`);
            return !isAncestor && !isDescendant;
          });

          nextFolders = [
            ...withPrunedAncestorsAndDescendants,
            {
              path: normalizedPath,
              name: folderName || normalizedPath.split('/').slice(-1)[0] || normalizedPath,
              enabled: true,
            },
          ];
        } else {
          // Toggla befintlig path av/på utan att röra andra paths.
          const existing = currentFolders[idx];
          const toggled = { ...existing, enabled: !existing.enabled };
          nextFolders = [
            ...currentFolders.slice(0, idx),
            toggled,
            ...currentFolders.slice(idx + 1),
          ];
        }
        return { ...site, folders: nextFolders };
      });
      const nextNav = { ...prev, sites: nextSites };
      queueSave(nextNav);
      return nextNav;
    });
  };

  const renderFolderSelector = (siteId, siteName) => {
    const folders = folderTrees[siteId] || [];
    const navSite = (navigationState?.sites || []).find((s) => s.siteId === siteId) || { folders: [] };
    const selectedPaths = (navSite.folders || []).filter((f) => f.enabled).map((f) => f.path);
    const isExpanded = expandedSites[siteId];
    const expandedForSite = expandedFolders[siteId] || {};

    const renderFolderRows = (nodes, level = 0) => {
      if (!Array.isArray(nodes) || nodes.length === 0) return null;
      return nodes.map((folder) => {
        const folderPath = folder.path || folder.name || '';
        const hasChildren = Array.isArray(folder.children) && folder.children.length > 0;
        const isFolderExpanded = !!expandedForSite[folderPath];
        const isSelectedPath = selectedPaths.includes(folderPath);

        return (
          <View key={folder.id || folderPath} style={{ marginBottom: 4 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingVertical: 8,
                paddingHorizontal: 10,
                borderRadius: 6,
                backgroundColor: isSelectedPath ? '#E5F3FF' : '#F9FAFB',
                borderWidth: 1,
                borderColor: isSelectedPath ? '#1D4ED8' : '#E5E7EB',
                marginLeft: level * 12,
              }}
            >
              <TouchableOpacity
                onPress={() => {
                  const nextExpanded = !isFolderExpanded;
                  setExpandedFolders(prev => ({
                    ...prev,
                    [siteId]: {
                      ...(prev[siteId] || {}),
                      [folderPath]: nextExpanded,
                    },
                  }));
                  if (nextExpanded && (!folder.children || folder.children.length === 0)) {
                    loadFolderChildren(siteId, folderPath);
                  }
                }}
                style={{ marginRight: 6 }}
              >
                <Ionicons
                  name={isFolderExpanded ? 'chevron-down' : 'chevron-forward'}
                  size={16}
                  color="#1976D2"
                />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => toggleProjectEnabled(siteId, folderPath, folder.name)}
                style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}
              >
                <Ionicons
                  name={isSelectedPath ? 'checkbox' : 'square-outline'}
                  size={18}
                  color={isSelectedPath ? '#2563EB' : '#6B7280'}
                  style={{ marginRight: 8 }}
                />
                <Text
                  style={{
                    fontSize: 14,
                    color: '#111827',
                    fontWeight: isSelectedPath ? '600' : '400',
                  }}
                  numberOfLines={1}
                >
                  {folder.name}
                </Text>
              </TouchableOpacity>
            </View>

            {isFolderExpanded && hasChildren && (
              <View style={{ marginTop: 4 }}>
                {renderFolderRows(folder.children, level + 1)}
              </View>
            )}
          </View>
        );
      });
    };
    
    return (
      <View style={{ marginTop: 0, padding: 16, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 12, color: '#222' }}>
          Aktiverade mappar för site: {siteName}
        </Text>
        
        <View>
          <TouchableOpacity
            onPress={() => {
              setExpandedSites(prev => ({ ...prev, [siteId]: !prev[siteId] }));
              if (!isExpanded && folders.length === 0) {
                loadFolderTree(siteId);
              }
            }}
            style={{ 
              flexDirection: 'row', 
              alignItems: 'center', 
              marginBottom: isExpanded ? 12 : 0,
              padding: 8,
              backgroundColor: '#f9fafb',
              borderRadius: 6,
            }}
          >
            <Ionicons
              name={isExpanded ? 'chevron-down' : 'chevron-forward'}
              size={18}
              color="#1976D2"
              style={{ marginRight: 8 }}
            />
            <Text style={{ fontSize: 14, fontWeight: '600', color: '#1976D2', flex: 1 }}>
              Projekt-aktiverade platser
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              {selectedPaths.length} valda
            </Text>
          </TouchableOpacity>
          
          {isExpanded && (
            <View style={{ marginTop: 8 }}>
              {loadingFolders[siteId] ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#1976D2" />
                  <Text style={{ fontSize: 12, color: '#666', marginTop: 8 }}>Laddar mappar...</Text>
                </View>
              ) : folders.length === 0 ? (
                <Text style={{ fontSize: 12, color: '#888', fontStyle: 'italic', padding: 12 }}>
                  Inga mappar hittades
                </Text>
              ) : (
                <View style={{ gap: 4 }}>
                  {renderFolderRows(folders, 0)}
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    );
  };

  const getSiteDisplayName = (site) => {
    if (!site) return '';
    return site.name || site.displayName || site.id || '';
  };

  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, []);

  // Initiera CompanySharePointNavigation när både config och sites är laddade
  useEffect(() => {
    if (!companyId) return;
    if (!Array.isArray(availableSites) || availableSites.length === 0) return;
    if (!config) return;
    if (navigationInitialized) return;

    const built = buildNavigationFromConfig(companyId, availableSites, config);
    setNavigationState(built);
    setNavigationInitialized(true);

    if (!selectedSiteId && built.sites && built.sites.length > 0) {
      const firstEnabled = built.sites.find((s) => s.enabled) || built.sites[0];
      setSelectedSiteId(firstEnabled.siteId);
    }
  }, [companyId, availableSites, config, navigationInitialized, selectedSiteId]);

  const content = (
    <View style={{ flex: 1 }}>
      {/* Fullscreen overlay vid sparning / laddning av config */}
      {(saving || loading) && (
        <View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 9999,
            backgroundColor: 'rgba(255,255,255,0.75)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <View style={{ backgroundColor: '#111827', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 16, minWidth: 260, maxWidth: 360, alignItems: 'center' }}>
            <ActivityIndicator color="#fff" />
            <Text style={{ color: '#fff', fontWeight: '800', marginTop: 8, fontSize: 13, textAlign: 'center' }}>
              {saving ? 'Sparar SharePoint-navigation…' : 'Laddar SharePoint-navigation…'}
            </Text>
          </View>
        </View>
      )}
      <MainLayout
      adminMode={true}
      adminCurrentScreen="sharepoint_navigation"
      adminOnSelectCompany={(company) => {
        if (company && company.id) {
          setCompanyId(String(company.id).trim());
        }
      }}
      adminShowCompanySelector={true}
      sidebarSelectedCompanyId={companyId}
      topBar={
        <HomeHeader
          headerHeight={headerHeight}
          setHeaderHeight={setHeaderHeight}
          navigation={navigation}
          route={route}
          auth={auth}
          selectedProject={null}
          isSuperAdmin={false}
          allowedTools={false}
          showHeaderUserMenu={showHeaderUserMenu}
          canShowSupportToolsInHeader={false}
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
    >
      <View style={{ width: '100%', maxWidth: 1200, margin: '0 auto', padding: 24 }}>
        {/* Header */}
        {Platform.OS === 'web' ? (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            marginBottom: 24,
          }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 600, marginBottom: 4, margin: 0, color: '#222' }}>
                SharePoint Navigation
              </h1>
              <p style={{ fontSize: 14, color: '#6b7280', margin: 0 }}>
                Välj vilka SharePoint-siter som ska visas i vänsterpanelen och kunna användas vid projektskapande.
              </p>
            </div>
            <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>
              Ändringar sparas automatiskt.
            </p>
          </div>
        ) : (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 4, color: '#222' }}>
              SharePoint Navigation
            </Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              Välj vilka SharePoint-siter som ska visas i vänsterpanelen och kunna användas vid projektskapande.
            </Text>
            <Text style={{ fontSize: 12, color: '#6b7280' }}>
              Ändringar sparas automatiskt.
            </Text>
          </View>
        )}

        {loadingSites ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Text style={{ marginTop: 16, color: '#666' }}>Laddar SharePoint-sites...</Text>
          </View>
        ) : availableSites.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <SharePointSiteIcon size={48} color="#D1D5DB" />
            <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>
              Inga SharePoint-sites tillgängliga. Kontrollera att du är inloggad och har behörighet.
            </Text>
          </View>
        ) : (
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 24 }}>
            {/* Vänster kolumn – siter */}
            <View style={{ width: 260 }}>
              <View
                style={{
                  padding: 16,
                  backgroundColor: '#ffffff',
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: '#d1d5db',
                }}
              >
                <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#111' }}>
                  SharePoint-siter
                </Text>
                <Text style={{ fontSize: 12, color: '#6b7280', marginBottom: 12 }}>
                  Välj vilka siter som ska användas i Digitalkontroll.
                </Text>
                {(navigationState?.sites || []).map((site) => {
                  const isSelected = selectedSiteId === site.siteId;
                  return (
                    <TouchableOpacity
                      key={site.siteId}
                      onPress={() => setSelectedSiteId(site.siteId)}
                      style={{
                        paddingVertical: 10,
                        paddingHorizontal: 10,
                        borderRadius: 8,
                        marginBottom: 6,
                        backgroundColor: isSelected ? '#E5F3FF' : '#FFFFFF',
                        borderWidth: 1,
                        borderColor: isSelected ? '#1D4ED8' : '#E5E7EB',
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, minWidth: 0 }}>
                        <TouchableOpacity
                          onPress={() => toggleSiteEnabled(site.siteId)}
                          style={{ marginRight: 8 }}
                        >
                          <Ionicons
                            name={site.enabled ? 'checkbox' : 'square-outline'}
                            size={18}
                            color={site.enabled ? '#2563EB' : '#6B7280'}
                          />
                        </TouchableOpacity>
                        <SharePointSiteIcon
                          size={18}
                          color={site.enabled ? '#2563EB' : '#9CA3AF'}
                          style={{ marginRight: 8 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 13, fontWeight: '600', color: '#111' }} numberOfLines={1}>
                            {site.siteName}
                          </Text>
                          <Text style={{ fontSize: 11, color: '#6B7280' }} numberOfLines={1}>
                            {site.enabled ? 'Aktiverad' : 'Inaktiverad'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Mittenkolumn – aktiverade mappar för vald site */}
            <View style={{ flex: 1 }}>
              {(() => {
                const activeSite = (navigationState?.sites || []).find((s) => s.siteId === selectedSiteId);
                if (!activeSite) {
                  return (
                    <Text style={{ fontSize: 13, color: '#6B7280' }}>
                      Välj en site till vänster för att konfigurera mappar.
                    </Text>
                  );
                }

                const reactSite = availableSites.find((s) => s.id === activeSite.siteId);
                const displayName = activeSite.siteName || getSiteDisplayName(reactSite);

                return renderFolderSelector(activeSite.siteId, displayName);
              })()}
            </View>

            {/* Högerkolumn – förklaring / preview-placeholder */}
            <View style={{ width: 260 }}>
              <View style={{
                backgroundColor: '#F9FAFB',
                borderRadius: 12,
                padding: 16,
                borderWidth: 1,
                borderColor: '#E5E7EB',
              }}>
                <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 8, color: '#111' }}>
                  Hur fungerar detta?
                </Text>
                <Text style={{ fontSize: 12, color: '#4B5563', marginBottom: 8 }}>
                  Endast markerade mappar visas i leftpanelen för användare.
                </Text>
                <Text style={{ fontSize: 12, color: '#6B7280' }}>
                  I nästa steg kan vi lägga till en förhandsvisning av hur navigationen ser ut för användarna baserat på dina val här.
                </Text>
              </View>
            </View>
          </View>
        )}
      </View>
    </MainLayout>
  </View>
  );

  return content;
}
