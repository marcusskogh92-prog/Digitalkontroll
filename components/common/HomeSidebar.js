import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { loadFolderChildren } from '../../services/azure/hierarchyService';
import { isWeb } from '../../utils/platform';
import ContextMenu from '../ContextMenu';
import { ProjectTree } from './ProjectTree';

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
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const isExpanded = expandedSubs[folder.id] || false;
  const fontSize = Math.max(12, 15 - level);
  const marginLeft = 18 + level * 4;

  const getFullPath = () => {
    if (folder.path && typeof folder.path === 'string' && folder.path.trim().length > 0) {
      let normalized = folder.path.replace(/^\/+/, '').replace(/\/+/, '/').trim();
      normalized = normalized.replace(/\/+$/, '');
      normalized = normalized.replace(/:/g, '');
      if (normalized && normalized.length > 0 && normalized !== '/') {
        return normalized;
      }
    }

    if (parentPath && typeof parentPath === 'string' && parentPath.trim().length > 0) {
      let normalizedParent = parentPath.replace(/^\/+/, '').replace(/\/+/, '/').trim();
      normalizedParent = normalizedParent.replace(/\/+$/, '');
      normalizedParent = normalizedParent.replace(/:/g, '');
      if (normalizedParent && normalizedParent.length > 0) {
        const fullPath = `${normalizedParent}/${folder.name}`;
        return fullPath.replace(/^\/+/, '').replace(/\/+/, '/').replace(/\/+$/, '');
      }
    }

    const fallback = folder.name || '';
    return fallback.replace(/:/g, '');
  };

  const handleToggle = async () => {
    if (onToggle) onToggle(folder.id);

    if (!isExpanded && (!folder.children || folder.children.length === 0) && companyId) {
      try {
        setLoading(true);
        setError(null);

        const folderPath = getFullPath();
        let normalizedPath = folderPath;
        if (normalizedPath && typeof normalizedPath === 'string') {
          normalizedPath = normalizedPath.replace(/:/g, '');
          normalizedPath = normalizedPath.replace(/^\/+/, '').replace(/\/+/, '/').trim();
          normalizedPath = normalizedPath.replace(/\/+$/, '');
        } else {
          normalizedPath = '';
        }

        if (!normalizedPath || normalizedPath.length === 0 || normalizedPath === '/') {
          console.warn('[HomeSidebar] RecursiveFolderView - Empty or invalid folder path for:', folder.name, 'parentPath:', parentPath, 'folder.path:', folder.path, 'constructed path:', folderPath);
        }

        const children = await loadFolderChildren(companyId, normalizedPath);

        setHierarchy(prev => {
          const updateFolder = (folders, currentParentPath = '') =>
            folders.map(f => {
              if (f.id === folder.id) {
                const actualPath = normalizedPath || f.path || (parentPath ? `${parentPath}/${folder.name}` : folder.name);
                const updatedChildren = (children || []).map(child => {
                  let childPath = child.path;
                  if (!childPath || childPath.length === 0) {
                    childPath = actualPath
                      ? `${actualPath}/${child.name}`.replace(/^\/+/, '').replace(/\/+/, '/').replace(/\/+$/, '')
                      : child.name;
                  } else {
                    childPath = childPath.replace(/^\/+/, '').replace(/\/+/, '/').replace(/\/+$/, '');
                  }
                  return { ...child, path: childPath };
                });

                return {
                  ...f,
                  children: updatedChildren,
                  path: actualPath,
                  loading: false,
                  error: null,
                };
              }
              if (f.children) {
                const currentPath = f.path || (currentParentPath ? `${currentParentPath}/${f.name}` : f.name);
                return { ...f, children: updateFolder(f.children, currentPath) };
              }
              return f;
            });
          return updateFolder(prev);
        });

        setLoading(false);
      } catch (err) {
        console.error('[HomeSidebar] RecursiveFolderView - Error loading folder children:', err, 'for path:', getFullPath(), 'folder:', folder.name);
        setError(err.message || 'Kunde inte ladda undermappar');
        setLoading(false);

        setHierarchy(prev => {
          const updateFolder = folders =>
            folders.map(f => {
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
        style={{ flexDirection: 'row', alignItems: 'center', padding: '2px 4px' }}
        onPress={handleToggle}
      >
        <Ionicons
          name={isExpanded ? 'chevron-down' : 'chevron-forward'}
          size={Math.max(12, 16 - level)}
          color="#222"
          style={{ marginRight: 4 }}
        />
        <Text style={{ fontSize, fontWeight: isExpanded ? '600' : '400', color: '#222' }}>{folder.name}</Text>
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
            folder.children
              .filter(child => child.type === 'folder' || !child.type)
              .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
              .map(childFolder => {
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
                if (currentFolderPath && typeof currentFolderPath === 'string') {
                  currentFolderPath = currentFolderPath
                    .replace(/:/g, '')
                    .replace(/^\/+/, '')
                    .replace(/\/+/, '/')
                    .replace(/\/+$/, '');
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

export function HomeSidebar({
  leftTreeScrollRef,
  panResponder,
  selectedProject,
  projectPhaseKey,
  phaseNavigationLoading,
  selectedProjectFolders,
  navigation,
  companyId,
  handleSelectFunction,
  phaseChanging,
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
  spinSidebarHome,
  spinSidebarRefresh,
  onPressHome,
  onPressRefresh,
  createPortal,
}) {
  const spin = phaseChangeSpinAnim.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const filteredHierarchy = hierarchy;

  return (
    <>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
      <View
        {...(panResponder && panResponder.panHandlers)}
        style={
          Platform.OS === 'web'
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
          justifyContent: 'space-between',
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

      {false && !selectedProject ? (
        Platform.OS === 'web' ? (
          <div
            style={{
              padding: '8px',
              borderBottom: '1px solid #e0e0e0',
              marginBottom: 8,
              position: 'relative',
            }}
          >
            {(() => {})()}
          </div>
        ) : (
          <View
            style={{
              paddingHorizontal: 8,
              paddingTop: 8,
              paddingBottom: 12,
              borderBottomWidth: 1,
              borderBottomColor: '#e0e0e0',
              marginBottom: 8,
              position: 'relative',
            }}
          >
            {(() => {})()}
          </View>
        )
      ) : null}

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
                    navigation?.setParams?.({});
                    navigation?.navigate?.('Home');
                  }
                  if (isWeb) {
                    // Keep same behaviour as HomeScreen inline version (web stays inline)
                  }
                  if (isWeb) {
                    // actual navigation handled in HomeScreen via selectedProject state; no-op here
                  }
                }}
                onSelectFunction={handleSelectFunction}
                navigation={navigation}
                companyId={companyId}
                projectStatusFilter={null}
              />
            );
          }

          if (phaseChanging || loadingHierarchy) {
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

          if (filteredHierarchy.length === 0) {
            return (
              <View
                style={{ paddingHorizontal: 4 }}
                nativeID={Platform.OS === 'web' ? 'dk-tree-root' : undefined}
              >
                <Text
                  style={{
                    paddingVertical: 8,
                    paddingHorizontal: 4,
                    color: '#666',
                    fontSize: 14,
                  }}
                >
                  Inga mappar hittades. Skapa projektstruktur i SharePoint och uppdatera.
                </Text>
              </View>
            );
          }

          return (
            <View
              style={{ paddingHorizontal: 4 }}
              nativeID={Platform.OS === 'web' ? 'dk-tree-root' : undefined}
            >
              {filteredHierarchy
                .filter(folder => folder.type === 'folder' || !folder.type)
                .sort((a, b) =>
                  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }),
                )
                .map(folder => (
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

      {!selectedProject && Platform.OS === 'web' && createPortal && typeof document !== 'undefined'
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
                    ...(Platform && Platform.OS === 'web'
                      ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                      : {}),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          syncStatus === 'synced'
                            ? '#2E7D32'
                            : syncStatus === 'syncing'
                            ? '#F57C00'
                            : syncStatus === 'offline'
                            ? '#757575'
                            : syncStatus === 'error'
                            ? '#D32F2F'
                            : '#444',
                      }}
                    >
                      Synk: {syncStatus}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666', marginLeft: 6 }}>
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
                    ...(Platform && Platform.OS === 'web'
                      ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                      : {}),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text
                      style={{
                        fontSize: 12,
                        color:
                          syncStatus === 'synced'
                            ? '#2E7D32'
                            : syncStatus === 'syncing'
                            ? '#F57C00'
                            : syncStatus === 'offline'
                            ? '#757575'
                            : syncStatus === 'error'
                            ? '#D32F2F'
                            : '#444',
                      }}
                    >
                      Synk: {syncStatus}
                    </Text>
                    <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                      Version: {appVersion} {buildStamp ? `(${buildStamp})` : ''}
                    </Text>
                  </View>
                </View>
              );
            }
          })()
        : !selectedProject
        ? (
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
                ...(Platform && Platform.OS === 'web'
                  ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                  : {}),
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      syncStatus === 'synced'
                        ? '#2E7D32'
                        : syncStatus === 'syncing'
                        ? '#F57C00'
                        : syncStatus === 'offline'
                        ? '#757575'
                        : syncStatus === 'error'
                        ? '#D32F2F'
                        : '#444',
                  }}
                >
                  Synk: {syncStatus}
                </Text>
                <Text style={{ fontSize: 12, color: '#666', marginLeft: 8 }}>
                  Version: {appVersion} {buildStamp ? `(${buildStamp})` : ''}
                </Text>
              </View>
            </View>
          )
        : null}
    </>
  );
}
