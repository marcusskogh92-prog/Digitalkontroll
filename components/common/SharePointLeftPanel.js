import { Ionicons } from '@expo/vector-icons';
import { useEffect, useState } from 'react';
import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import ContextMenu from '../ContextMenu';
import { ProjectTree } from './ProjectTree';
import { isProjectFolder, extractProjectMetadata } from '../../utils/isProjectFolder';
import { filterHierarchyByConfig } from '../../utils/filterSharePointHierarchy';
import { getSharePointNavigationConfig } from '../firebase';

function RecursiveFolderView({
  folder,
  level = 0,
  expandedSubs,
  spinSubs,
  onToggle,
  companyId,
  hierarchy,
  setHierarchy,
  parentPath = '',
  isProject = false,
  onSelectProject = null,
  navigation = null,
}) {
  if (!folder) return null;

  const safeName = folder.name || folder.id || '';
  const fontSize = Math.max(12, 15 - level);
  const marginLeft = 12 + level * 8;
  
  // Check if this folder is a project (if not already determined)
  const folderIsProject = isProject || isProjectFolder(folder);
  
  const handlePress = () => {
    try {
      if (folderIsProject && onSelectProject) {
        // Project folder: navigate to project view
        const projectMetadata = extractProjectMetadata(folder);
        if (projectMetadata) {
          const projectData = {
            id: projectMetadata.id || folder.id || folder.name,
            name: projectMetadata.name || projectMetadata.fullName || folder.name,
            number: projectMetadata.number || '',
            fullName: projectMetadata.fullName || folder.name,
            path: projectMetadata.path || folder.path || folder.name,
            type: 'project',
            ...folder,
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
          onToggle(folder.id);
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
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            backgroundColor: 'transparent',
          }}
        >
          {!folderIsProject && (
            <Ionicons
              name={expandedSubs?.[folder.id] ? 'chevron-down' : 'chevron-forward'}
              size={Math.max(12, 16 - level)}
              color="#222"
              style={{ marginRight: 6 }}
            />
          )}
          {folderIsProject && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: '#43A047',
                marginRight: 8,
                border: '1px solid #bbb',
                display: 'inline-block',
              }}
            />
          )}
          <span style={{ fontSize, color: folderIsProject ? '#1976D2' : '#222', fontWeight: folderIsProject ? '600' : '400' }}>
            {safeName}
          </span>
        </div>

        {!folderIsProject && expandedSubs?.[folder.id] && Array.isArray(folder.children) && folder.children.length > 0 && (
          <div style={{ marginLeft: 8, marginTop: 2 }}>
            {folder.children
              .filter(child => child && (child.type === 'folder' || !child.type))
              .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
              .map(child => {
                const childIsProject = isProjectFolder(child);
                return (
                  <RecursiveFolderView
                    key={child.id || `${safeName}-${level}`}
                    folder={child}
                    level={level + 1}
                    expandedSubs={expandedSubs}
                    spinSubs={spinSubs}
                    onToggle={onToggle}
                    companyId={companyId}
                    hierarchy={hierarchy}
                    setHierarchy={setHierarchy}
                    parentPath={parentPath}
                    isProject={childIsProject}
                    onSelectProject={onSelectProject}
                    navigation={navigation}
                  />
                );
              })}
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
      >
        {!folderIsProject && (
          <Ionicons
            name={expandedSubs?.[folder.id] ? 'chevron-down' : 'chevron-forward'}
            size={Math.max(12, 16 - level)}
            color="#222"
            style={{ marginRight: 4 }}
          />
        )}
        {folderIsProject && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: '#43A047',
              marginRight: 6,
              borderWidth: 1,
              borderColor: '#bbb',
            }}
          />
        )}
        <Text style={{ fontSize, color: folderIsProject ? '#1976D2' : '#222', fontWeight: folderIsProject ? '600' : '400' }}>
          {safeName}
        </Text>
      </TouchableOpacity>

      {!folderIsProject && expandedSubs?.[folder.id] && Array.isArray(folder.children) && folder.children.length > 0 && (
        <View style={{ marginLeft: 8, marginTop: 2 }}>
          {folder.children
            .filter(child => child && (child.type === 'folder' || !child.type))
            .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
            .map(child => {
              const childIsProject = isProjectFolder(child);
              return (
                <RecursiveFolderView
                  key={child.id || `${safeName}-${level}`}
                  folder={child}
                  level={level + 1}
                  expandedSubs={expandedSubs}
                  spinSubs={spinSubs}
                  onToggle={onToggle}
                  companyId={companyId}
                  hierarchy={hierarchy}
                  setHierarchy={setHierarchy}
                  parentPath={parentPath}
                  isProject={childIsProject}
                  onSelectProject={onSelectProject}
                  navigation={navigation}
                />
              );
            })}
        </View>
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
}) {
  const isWeb = Platform.OS === 'web';
  const [filteredHierarchy, setFilteredHierarchy] = useState([]);
  const [navConfig, setNavConfig] = useState(null);

  // Load navigation config and build hierarchy from enabled sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setFilteredHierarchy([]);
        return;
      }

      try {
        const config = await getSharePointNavigationConfig(companyId);
        if (!mounted) return;
        setNavConfig(config);

        // Check if any sites are enabled
        const enabledSites = config?.enabledSites || [];
        if (enabledSites.length === 0) {
          // No sites enabled - show empty (admin must configure)
          if (mounted) setFilteredHierarchy([]);
          return;
        }

        // Build hierarchy from enabled sites (filterHierarchyByConfig now builds from sites, not filters existing hierarchy)
        const filtered = await filterHierarchyByConfig([], companyId, config);
        if (mounted) {
          setFilteredHierarchy(filtered);
        }
      } catch (error) {
        console.error('[SharePointLeftPanel] Error loading/filtering hierarchy:', error);
        // On error, show empty (admin must configure properly)
        if (mounted) setFilteredHierarchy([]);
      }
    })();
    return () => { mounted = false; };
  }, [companyId]);

  return (
    <>
      <View
        style={{
          width: leftWidth,
          padding: 8,
          borderRightWidth: 0,
          borderColor: '#e6e6e6',
          backgroundColor: '#f5f6f7',
          height: webPaneHeight,
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
                      id: selectedProject.id,
                      name: selectedProject.name || selectedProject.id,
                      type: 'project',
                      expanded: true,
                      children: selectedProjectFolders.map(folder => ({
                        ...folder,
                        type: 'projectFunction',
                      })),
                      ...selectedProject,
                    },
                  ]
                : [];

              return (
                <ProjectTree
                  hierarchy={projectHierarchy}
                  selectedProject={selectedProject}
                  selectedPhase={projectPhaseKey}
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

            // Always use filteredHierarchy - never fallback to raw hierarchy
            // If no config exists or no sites enabled, filteredHierarchy will be empty
            const displayHierarchy = filteredHierarchy || [];
            if (!displayHierarchy.length) {
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
                    {navConfig && (!navConfig.enabledSites || navConfig.enabledSites.length === 0)
                      ? 'Inga SharePoint-sites är aktiverade. Konfigurera i Admin → SharePoint Navigation.'
                      : 'Inga mappar hittades. Konfigurera SharePoint Navigation i Admin-vyn eller skapa projektstruktur i SharePoint.'}
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
                    return (
                      <View key={siteItem.id} style={{ marginBottom: 8 }}>
                        {/* Site header */}
                        <View style={{ 
                          flexDirection: 'row', 
                          alignItems: 'center', 
                          paddingVertical: 8,
                          paddingHorizontal: 8,
                          backgroundColor: '#f0f7ff',
                          borderRadius: 4,
                          marginBottom: 4,
                        }}>
                          <Ionicons name="folder" size={16} color="#1976D2" style={{ marginRight: 6 }} />
                          <Text style={{ 
                            fontSize: 14, 
                            fontWeight: '600', 
                            color: '#1976D2',
                            flex: 1,
                          }}>
                            {siteItem.name}
                          </Text>
                        </View>
                        
                        {/* Site folders */}
                        {siteItem.children && siteItem.children.length > 0 ? (
                          <View style={{ marginLeft: 12 }}>
                            {siteItem.children.map(folder => {
                              const folderIsProject = isProjectFolder(folder);
                              
                              return (
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
                                  isProject={folderIsProject}
                                  onSelectProject={onSelectProject}
                                  navigation={navigation}
                                />
                              );
                            })}
                          </View>
                        ) : (
                          <Text style={{ 
                            fontSize: 12, 
                            color: '#888', 
                            fontStyle: 'italic',
                            marginLeft: 12,
                            paddingLeft: 8,
                          }}>
                            Inga mappar
                          </Text>
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
                      expandedSubs={expandedSubs}
                      spinSubs={spinSub}
                      onToggle={handleToggleSubFolder}
                      companyId={companyId}
                      hierarchy={hierarchy}
                      setHierarchy={setHierarchy}
                      parentPath=""
                      isProject={folderIsProject}
                      onSelectProject={onSelectProject}
                      navigation={navigation}
                    />
                  );
                })}
              </View>
            );
          })()}
        </ScrollView>

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
                      pointerEvents: 'auto',
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
                      pointerEvents: 'auto',
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

      {isWeb && (
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
    </>
  );
}
