/**
 * ManageSharePointNavigation - Admin screen for configuring SharePoint navigation
 * Allows admins to:
 * - Enable/disable SharePoint sites for sidebar
 * - Set root folders for each enabled site
 * - Mark folders as project-enabled locations
 */

import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { auth, fetchCompanies, getAvailableSharePointSites, getSharePointNavigationConfig, saveSharePointNavigationConfig } from '../components/firebase';
import { getDriveItems } from '../services/azure/hierarchyService';
import HeaderAdminMenu from '../components/HeaderAdminMenu';
import HeaderUserMenuConditional from '../components/HeaderUserMenuConditional';
import MainLayout from '../components/MainLayout';

export default function ManageSharePointNavigation({ navigation }) {
  const [companyId, setCompanyId] = useState('');
  const [loading, setLoading] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);
  const [loadingSites, setLoadingSites] = useState(false);
  const [config, setConfig] = useState({
    enabledSites: [],
    siteConfigs: {},
  });
  const [expandedSites, setExpandedSites] = useState({});
  const [folderTrees, setFolderTrees] = useState({}); // siteId -> folder tree
  const [loadingFolders, setLoadingFolders] = useState({});

  // Load company ID from storage/route
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const stored = await AsyncStorage.getItem('dk_companyId');
        const storedTrim = String(stored || '').trim();
        if (storedTrim && mounted) {
          setCompanyId(storedTrim);
        }
      } catch (_e) {}
    })();
    return () => { mounted = false; };
  }, []);

  // Load available SharePoint sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) return;
      
      setLoadingSites(true);
      try {
        const sites = await getAvailableSharePointSites();
        if (mounted) {
          setAvailableSites(Array.isArray(sites) ? sites : []);
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
  }, [companyId]);

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

  // Load folder tree for a site
  const loadFolderTree = async (siteId) => {
    if (folderTrees[siteId] || loadingFolders[siteId]) return;
    
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

  const toggleSiteEnabled = (siteId) => {
    const enabled = config.enabledSites.includes(siteId);
    const newEnabledSites = enabled
      ? config.enabledSites.filter(id => id !== siteId)
      : [...config.enabledSites, siteId];
    
    setConfig(prev => ({
      ...prev,
      enabledSites: newEnabledSites,
      siteConfigs: enabled
        ? { ...prev.siteConfigs, [siteId]: undefined }
        : { ...prev.siteConfigs, [siteId]: { projectEnabledPaths: [] } },
    }));
    
    // Load folder tree when enabling
    if (!enabled) {
      loadFolderTree(siteId);
    }
  };

  // setRootFolder removed - no longer needed

  const toggleProjectEnabled = (siteId, folderPath) => {
    const siteConfig = config.siteConfigs[siteId] || { projectEnabledPaths: [] };
    const paths = siteConfig.projectEnabledPaths || [];
    const isEnabled = paths.includes(folderPath);
    
    const newPaths = isEnabled
      ? paths.filter(p => p !== folderPath)
      : [...paths, folderPath];
    
    setConfig(prev => ({
      ...prev,
      siteConfigs: {
        ...prev.siteConfigs,
        [siteId]: {
          ...prev.siteConfigs[siteId],
          projectEnabledPaths: newPaths,
        },
      },
    }));
  };

  const saveConfig = async () => {
    if (!companyId) {
      Alert.alert('Fel', 'Inget företag valt');
      return;
    }
    
    setLoading(true);
    try {
      await saveSharePointNavigationConfig(companyId, config);
      Alert.alert('Sparat', 'SharePoint-navigation har sparats');
    } catch (error) {
      console.error('[ManageSharePointNavigation] Error saving config:', error);
      Alert.alert('Fel', `Kunde inte spara: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const renderFolderSelector = (siteId, siteName) => {
    const siteConfig = config.siteConfigs[siteId] || {};
    const folders = folderTrees[siteId] || [];
    const isExpanded = expandedSites[siteId];
    
    return (
      <View style={{ marginTop: 12, padding: 16, backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' }}>
        <Text style={{ fontSize: 14, fontWeight: '600', marginBottom: 12, color: '#222' }}>
          Konfiguration för {siteName}
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
              {(siteConfig.projectEnabledPaths || []).length} valda
            </Text>
          </TouchableOpacity>
          
          {isExpanded && (
            <View style={{ marginTop: 8, maxHeight: 300, ...(Platform.OS === 'web' ? { overflowY: 'auto' } : {}) }}>
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
                  {folders.map(folder => {
                    const isProjectEnabled = (siteConfig.projectEnabledPaths || []).includes(folder.path);
                    return (
                      <TouchableOpacity
                        key={folder.id}
                        onPress={() => toggleProjectEnabled(siteId, folder.path)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          padding: 10,
                          backgroundColor: isProjectEnabled ? '#e3f2fd' : '#f9fafb',
                          borderRadius: 6,
                          borderWidth: 1,
                          borderColor: isProjectEnabled ? '#1976D2' : '#e5e7eb',
                          ...(Platform.OS === 'web' ? {
                            cursor: 'pointer',
                          } : {}),
                        }}
                      >
                        <Ionicons
                          name={isProjectEnabled ? 'checkbox' : 'checkbox-outline'}
                          size={20}
                          color={isProjectEnabled ? '#1976D2' : '#6b7280'}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={{ 
                          fontSize: 14, 
                          color: isProjectEnabled ? '#1976D2' : '#374151',
                          fontWeight: isProjectEnabled ? '500' : '400',
                        }}>
                          {folder.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
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

  return (
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
        <View style={{ height: 96, paddingLeft: 24, paddingRight: 24, backgroundColor: '#fff', justifyContent: 'center', borderBottomWidth: 1, borderBottomColor: '#e0e0e0' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Text style={{ fontSize: 20, fontWeight: '700', color: '#222' }}>
                SharePoint Navigation
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <HeaderAdminMenu />
              <HeaderUserMenuConditional />
            </View>
          </View>
        </View>
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
            <button
              onClick={loading ? undefined : saveConfig}
              disabled={loading}
              style={{
                backgroundColor: loading ? '#94a3b8' : '#2563eb',
                color: '#fff',
                padding: '10px 16px',
                borderRadius: 8,
                border: 'none',
                fontWeight: 600,
                cursor: loading ? 'not-allowed' : 'pointer',
                fontSize: 16,
              }}
            >
              {loading ? 'Sparar...' : 'Spara konfiguration'}
            </button>
          </div>
        ) : (
          <View style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 22, fontWeight: '600', marginBottom: 4, color: '#222' }}>
              SharePoint Navigation
            </Text>
            <Text style={{ fontSize: 14, color: '#6b7280', marginBottom: 16 }}>
              Välj vilka SharePoint-siter som ska visas i vänsterpanelen och kunna användas vid projektskapande.
            </Text>
            <TouchableOpacity
              onPress={saveConfig}
              disabled={loading}
              style={{
                padding: 14,
                backgroundColor: loading ? '#94a3b8' : '#2563eb',
                borderRadius: 8,
                alignItems: 'center',
                opacity: loading ? 0.6 : 1,
              }}
            >
              {loading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
                  Spara konfiguration
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {loadingSites ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <ActivityIndicator size="large" color="#1976D2" />
            <Text style={{ marginTop: 16, color: '#666' }}>Laddar SharePoint-sites...</Text>
          </View>
        ) : availableSites.length === 0 ? (
          <View style={{ padding: 40, alignItems: 'center' }}>
            <Ionicons name="folder-outline" size={48} color="#ccc" />
            <Text style={{ marginTop: 16, color: '#666', textAlign: 'center' }}>
              Inga SharePoint-sites tillgängliga. Kontrollera att du är inloggad och har behörighet.
            </Text>
          </View>
        ) : (
          Platform.OS === 'web' ? (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))',
              gap: 16,
            }}>
              {availableSites.map(site => {
                const isEnabled = config.enabledSites.includes(site.id);
                const siteName = getSiteDisplayName(site);
                
                return (
                  <div
                    key={site.id}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      padding: 16,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.1)',
                    }}
                  >
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}>
                      <h3 style={{
                        fontSize: 16,
                        fontWeight: 600,
                        margin: 0,
                        color: '#222',
                        flex: 1,
                        marginRight: 8,
                      }}>
                        {siteName}
                      </h3>
                      <span
                        style={{
                          fontSize: 12,
                          padding: '4px 10px',
                          borderRadius: 999,
                          fontWeight: 600,
                          backgroundColor: isEnabled ? '#22c55e' : '#e5e7eb',
                          color: isEnabled ? '#065f46' : '#374151',
                        }}
                      >
                        {isEnabled ? 'Aktiv' : 'Inaktiv'}
                      </span>
                    </div>

                    <p style={{
                      fontSize: 12,
                      color: '#6b7280',
                      wordBreak: 'break-all',
                      marginBottom: 16,
                      margin: 0,
                    }}>
                      {site.webUrl || ''}
                    </p>

                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <label style={{
                        display: 'flex',
                        gap: 8,
                        alignItems: 'center',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={() => toggleSiteEnabled(site.id)}
                        />
                        <span>Aktivera</span>
                      </label>

                      <button
                        onClick={() => {
                          setExpandedSites(prev => ({ ...prev, [site.id]: !prev[site.id] }));
                          if (!expandedSites[site.id] && (!folderTrees[site.id] || folderTrees[site.id].length === 0)) {
                            loadFolderTree(site.id);
                          }
                        }}
                        style={{
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #e5e7eb',
                          padding: '8px 12px',
                          borderRadius: 8,
                          cursor: 'pointer',
                          fontWeight: 500,
                          fontSize: 14,
                        }}
                      >
                        Konfigurera
                      </button>
                    </div>

                    {isEnabled && expandedSites[site.id] && renderFolderSelector(site.id, siteName)}
                  </div>
                );
              })}
            </div>
          ) : (
            <View style={{ gap: 16 }}>
              {availableSites.map(site => {
                const isEnabled = config.enabledSites.includes(site.id);
                const siteName = getSiteDisplayName(site);
                
                return (
                  <View
                    key={site.id}
                    style={{
                      backgroundColor: '#fff',
                      borderRadius: 12,
                      padding: 16,
                      borderWidth: 1,
                      borderColor: '#e5e7eb',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 1 },
                      shadowOpacity: 0.1,
                      shadowRadius: 3,
                      elevation: 2,
                    }}
                  >
                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      marginBottom: 8,
                    }}>
                      <Text style={{
                        fontSize: 16,
                        fontWeight: '600',
                        color: '#222',
                        flex: 1,
                        marginRight: 8,
                      }}>
                        {siteName}
                      </Text>
                      <View style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 999,
                        backgroundColor: isEnabled ? '#22c55e' : '#e5e7eb',
                      }}>
                        <Text style={{
                          fontSize: 12,
                          fontWeight: '600',
                          color: isEnabled ? '#065f46' : '#374151',
                        }}>
                          {isEnabled ? 'Aktiv' : 'Inaktiv'}
                        </Text>
                      </View>
                    </View>

                    <Text style={{
                      fontSize: 12,
                      color: '#6b7280',
                      marginBottom: 16,
                    }} numberOfLines={2}>
                      {site.webUrl || ''}
                    </Text>

                    <View style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}>
                      <TouchableOpacity
                        onPress={() => toggleSiteEnabled(site.id)}
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 8,
                        }}
                      >
                        <Ionicons
                          name={isEnabled ? 'checkbox' : 'checkbox-outline'}
                          size={20}
                          color={isEnabled ? '#1976D2' : '#6b7280'}
                        />
                        <Text style={{ fontSize: 14 }}>Aktivera</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => {
                          setExpandedSites(prev => ({ ...prev, [site.id]: !prev[site.id] }));
                          if (!expandedSites[site.id] && (!folderTrees[site.id] || folderTrees[site.id].length === 0)) {
                            loadFolderTree(site.id);
                          }
                        }}
                        style={{
                          backgroundColor: '#f3f4f6',
                          borderWidth: 1,
                          borderColor: '#e5e7eb',
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 8,
                        }}
                      >
                        <Text style={{ fontSize: 14, fontWeight: '500' }}>
                          Konfigurera
                        </Text>
                      </TouchableOpacity>
                    </View>

                    {isEnabled && expandedSites[site.id] && renderFolderSelector(site.id, siteName)}
                  </View>
                );
              })}
            </View>
          )
        )}
      </View>
    </MainLayout>
  );
}
