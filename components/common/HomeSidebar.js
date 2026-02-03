import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { folderHasFilesDeep, loadFolderChildren } from '../../services/azure/hierarchyService';
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
  const [projectFolderTree, setProjectFolderTree] = useState([]);
  const [lastProjectId, setLastProjectId] = useState(null);
  const contentCacheRef = useRef(new Map());
  const contentPendingRef = useRef(new Set());

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

  // Keep a local, mutable tree for the selected-project folders so we can expand and lazy-load children.
  // This avoids requiring a setter from the parent.
  useEffect(() => {
    if (!selectedProject || !Array.isArray(selectedProjectFolders)) {
      setProjectFolderTree([]);
      setLastProjectId(null);
      return;
    }

    const currentProjectId = String(selectedProject?.id || '').trim() || null;

    const projectRootPath = String(
      selectedProject?.path || selectedProject?.projectPath || selectedProject?.sharePointPath || ''
    ).trim();

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

    if (currentProjectId && currentProjectId !== lastProjectId) {
      setLastProjectId(currentProjectId);
      setProjectFolderTree(incoming);
      return;
    }

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
  ]);

  const handleToggleProjectFolder = async (folderId) => {
    if (!folderId) return;

    let pathToLoad = null;
    let shouldDispatch = null;

    setProjectFolderTree((prev) => {
      const walk = (nodes) =>
        (nodes || []).map((n) => {
          if (!n) return n;
          if (n.id === folderId) {
            const nextExpanded = !n.expanded;
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
      const children = await loadFolderChildren(companyId, pathToLoad);
      setProjectFolderTree((prev) => {
        const applyChildren = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            if (n.id === folderId) {
              return { ...n, loading: false, error: null, children: Array.isArray(children) ? children : [] };
            }
            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: applyChildren(n.children) };
            }
            return n;
          });
        return applyChildren(prev);
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
                    ...selectedProject,
                    id: selectedProject.id,
                    name: (() => {
                      const rawName = String(
                        selectedProject.projectName || selectedProject.name || selectedProject.fullName || ''
                      ).trim();

                      let number = String(
                        selectedProject.projectNumber || selectedProject.number || ''
                      ).trim();

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
              <ProjectTree
                hierarchy={projectHierarchy}
                selectedProject={selectedProject}
                selectedPhase={projectPhaseKey}
                compact={isWeb}
                hideFolderIcons
                staticRootHeader
                onToggleSubFolder={handleToggleProjectFolder}
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

              // Web: vi visar nu bara SharePoint-molnet i headern,
              // så den gamla "Synk: ..."-brickan används inte längre.
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
                    ...(Platform && Platform.OS === 'web'
                      ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                      : {}),
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text style={{ fontSize: 12, color: '#666' }}>
                      Version: {appVersion} {buildStamp ? `(${buildStamp})` : ''}
                    </Text>
                  </View>
                </View>
              );
            }
          })()
        : null}
    </>
  );
}
