/**
 * ProjectTree - Main component for rendering project hierarchy
 * 
 * This component renders the full project tree structure:
 * - Main folders (Huvudmappar)
 * - Sub folders (Undermappar)
 * - Projects (with expandable functions)
 * 
 * Usage:
 * <ProjectTree
 *   hierarchy={hierarchy}
 *   onSelectProject={handleSelectProject}
 *   onSelectFunction={handleSelectFunction}
 *   navigation={navigation}
 *   companyId={companyId}
 *   onToggleMainFolder={handleToggleMainFolder}
 *   onToggleSubFolder={handleToggleSubFolder}
 *   onAddSubFolder={handleAddSubFolder}
 *   onAddProject={handleAddProject}
 * />
 */

import { Ionicons } from '@expo/vector-icons';
import { Text, TouchableOpacity, View } from 'react-native';
import SharePointFolderHierarchyTree from '../SharePointFiles/SharePointFolderHierarchyTree';
import ProjectTreeFolder from './ProjectTreeFolder';
import ProjectTreeNode from './ProjectTreeNode';
import { useProjectTree } from './useProjectTree';

export default function ProjectTree({
  hierarchy = [],
  onSelectProject,
  onSelectFunction,
  navigation,
  companyId,
  onToggleMainFolder,
  onToggleSubFolder,
  onCollapseSubtree,
  onPressFolder,
  onAddSubFolder,
  onAddProject,
  onAddMainFolder,
  onEditMainFolder,
  onEditSubFolder,
  mainChevronSpinAnim = {},
  subChevronSpinAnim = {},
  mainTimersRef = null,
  spinOnce,
  selectedProject = null,
  selectedPhase = null,
  compact = false,
  hideFolderIcons = false,
  staticRootHeader = false,
  activePhaseSection = null,
  activeOverviewPrefix = null,
  activePhaseSectionPrefix = null,
  afMirror = null,
  // When used inside the project-mode left panel, the tree should be flat/edge-to-edge
  // (no white rounded cards or indentation wrappers that make hover/active look inset).
  edgeToEdge = false,
}) {
  const {
    hierarchy: hierarchyWithFunctions,
    expandedProjects,
    handleProjectClick,
    handleFunctionClick,
  } = useProjectTree({
    hierarchy,
    onSelectProject,
    onSelectFunction,
    selectedPhase,
    companyId,
    selectedProjectId: selectedProject?.id || null,
  });

  if (!Array.isArray(hierarchyWithFunctions) || hierarchyWithFunctions.length === 0) {
    return (
      <View style={{ padding: 20, alignItems: 'center', justifyContent: 'center', minHeight: 200 }}>
        <View style={{ alignItems: 'center', marginBottom: 20 }}>
          <Ionicons name="folder-outline" size={48} color="#ccc" style={{ marginBottom: 12 }} />
          <Text style={{ color: '#888', fontSize: 14, marginBottom: 16, textAlign: 'center' }}>
            Inga mappar ännu
          </Text>
        </View>
        {onAddMainFolder && (
          <TouchableOpacity
            onPress={() => {
              if (onAddMainFolder) {
                onAddMainFolder();
              }
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: '#1976D2',
              paddingVertical: 12,
              paddingHorizontal: 20,
              borderRadius: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.1,
              shadowRadius: 4,
              elevation: 2,
            }}
          >
            <Ionicons name="add" size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '600' }}>
              Skapa mapp
            </Text>
          </TouchableOpacity>
        )}
      </View>
    );
  }

  return (
    <View>
      {/* Add folder button at top */}
      {onAddMainFolder && (
        <TouchableOpacity
          onPress={() => {
            if (onAddMainFolder) {
              onAddMainFolder();
            }
          }}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: '#1976D2',
            paddingVertical: 10,
            paddingHorizontal: 16,
            borderRadius: 8,
            marginBottom: 12,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 2,
          }}
        >
          <Ionicons name="add" size={18} color="#fff" style={{ marginRight: 8 }} />
          <Text style={{ color: '#fff', fontSize: 15, fontWeight: '600' }}>
            Skapa mapp
          </Text>
        </TouchableOpacity>
      )}
      
      {/* Render SharePoint folders directly - recursive structure */}
      {[...hierarchyWithFunctions]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        .map((folder) => {
          // Handle both old structure (main/sub) and new SharePoint structure (folder)
          const mainSpinAnim = mainChevronSpinAnim[folder.id];
          const isExpanded = folder.expanded || false;
          const isProjectRootHeader = staticRootHeader && folder?.type === 'project';

          const handleToggleMain = onToggleMainFolder
            ? (id) => {
                if (spinOnce && mainSpinAnim) {
                  spinOnce(mainSpinAnim);
                }
                onToggleMainFolder(id);
                if (folder.path && typeof window !== 'undefined') {
                  try {
                    window.dispatchEvent(
                      new CustomEvent('dkFolderSelected', {
                        detail: { folderPath: folder.path, folderName: folder.name },
                      }),
                    );
                  } catch (_e) {}
                }
              }
            : undefined;

          const handleAddChild = onAddSubFolder ? () => onAddSubFolder(folder.id) : undefined;

          return (
            <View
              key={folder.id}
              style={(() => {
                if (edgeToEdge && compact) {
                  return {
                    backgroundColor: 'transparent',
                    borderRadius: 0,
                    borderWidth: 0,
                    borderColor: 'transparent',
                    marginBottom: 0,
                    paddingVertical: 0,
                    paddingHorizontal: 0,
                  };
                }
                return compact
                  ? {
                      backgroundColor: '#fff',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      marginBottom: 6,
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                    }
                  : {
                      backgroundColor: '#fff',
                      borderRadius: 10,
                      borderWidth: 1,
                      borderColor: '#e0e0e0',
                      marginBottom: 8,
                      paddingVertical: 10,
                      paddingHorizontal: 12,
                      shadowColor: '#1976D2',
                      shadowOffset: { width: 0, height: 2 },
                      shadowOpacity: 0.1,
                      shadowRadius: 6,
                      elevation: 2,
                    };
              })()}
            >
              {/* Folder (can be phase folder or any SharePoint folder) */}
              <ProjectTreeFolder
                folder={folder}
                level={0}
                isExpanded={isExpanded}
                compact={compact}
                hideFolderIcon={hideFolderIcons}
                staticHeader={isProjectRootHeader}
                edgeToEdge={edgeToEdge && compact}
                onCollapseSubtree={onCollapseSubtree}
                onToggle={isProjectRootHeader ? undefined : handleToggleMain}
                onLongPress={() => {
                  if (onEditMainFolder) {
                    onEditMainFolder(folder.id, folder.name);
                  }
                }}
                onPressIn={() => {
                  if (mainTimersRef && mainTimersRef.current) {
                    if (mainTimersRef.current[folder.id]) clearTimeout(mainTimersRef.current[folder.id]);
                    mainTimersRef.current[folder.id] = setTimeout(() => {
                      if (onEditMainFolder) {
                        onEditMainFolder(folder.id, folder.name);
                      }
                    }, 2000);
                  }
                }}
                onPressOut={() => {
                  if (mainTimersRef && mainTimersRef.current && mainTimersRef.current[folder.id]) {
                    clearTimeout(mainTimersRef.current[folder.id]);
                  }
                }}
                spinAnim={mainSpinAnim}
                showAddButton={!isProjectRootHeader && isExpanded && !folder.children?.some(child => child.expanded)}
                onAddChild={!isProjectRootHeader ? handleAddChild : undefined}
              />

              {isProjectRootHeader && (
                <View
                  style={{
                    height: 1,
                    backgroundColor: '#e6e6e6',
                    marginTop: compact ? 10 : 12,
                    marginBottom: compact ? 8 : 10,
                  }}
                />
              )}

              {(() => {
                const { isProjectFolder } = require('./sharePointAdapter');
                const { getProjectPhase, DEFAULT_PHASE } = require('../../../features/projects/constants');

                const isOverviewFolder = (node) => {
                  const name = String(node?.name || '').trim().toLowerCase();
                  if (!name) return false;
                  return name.startsWith('01 - översikt') || name.startsWith('01 - oversikt');
                };

                const getTwoDigitPrefix = (name) => {
                  const s = String(name || '').trim();
                  const m = s.match(/^([0-9]{2})\s*[-–—]/);
                  return m ? m[1] : null;
                };

                const isOverviewPageNode = (node, parentNode) => {
                  if (!node || !parentNode) return false;
                  if (!isOverviewFolder(parentNode)) return false;

                  const prefix = getTwoDigitPrefix(node?.name);
                  return prefix === '01' || prefix === '02' || prefix === '03' || prefix === '04';
                };

                const renderNodes = (nodes, level, parentNode = null, grandparentNode = null) => {
                  if (!Array.isArray(nodes) || nodes.length === 0) return null;

                  const sortedNodes = [...nodes].sort((a, b) =>
                    (a?.name || '').localeCompare(b?.name || '', undefined, { numeric: true, sensitivity: 'base' }),
                  );

                  const containers = sortedNodes.filter((n) => {
                    const t = n?.type;
                    return t === 'folder' || t === 'sub' || t === 'project' || t === 'projectFunction' || !t;
                  });

                  return (
                    <>
                      {containers.map((node) => {
                        const isProject = node.type === 'project' || (node.type === 'folder' && isProjectFolder(node));

                        if (isProject && node.type !== 'folder') {
                          const projectPhase = getProjectPhase(node);
                          const effectivePhase =
                            node?.phase || (selectedPhase && selectedPhase !== 'all' ? selectedPhase : DEFAULT_PHASE);

                          const projectWithFunctions = {
                            ...node,
                            phase: effectivePhase,
                            expanded: expandedProjects[node.id] || false,
                          };

                          const isKalkylskede =
                            projectPhase.key === 'kalkylskede' ||
                            (!node?.phase && DEFAULT_PHASE === 'kalkylskede') ||
                            effectivePhase === 'kalkylskede';
                          const effectiveExpanded = isKalkylskede ? false : projectWithFunctions.expanded;

                          return (
                            <ProjectTreeNode
                              key={node.id}
                              project={projectWithFunctions}
                              isExpanded={effectiveExpanded}
                              onToggle={
                                isKalkylskede
                                  ? undefined
                                  : (projectId) => {
                                      handleProjectClick({ ...node, id: projectId });
                                    }
                              }
                              onSelect={(project) => {
                                if (onSelectProject) {
                                  onSelectProject({
                                    ...project,
                                    phase: project.phase || effectivePhase,
                                  });
                                }
                              }}
                              onSelectFunction={handleFunctionClick}
                              navigation={navigation}
                              companyId={companyId}
                              isSelected={selectedProject && selectedProject.id === node.id}
                              selectedPhase={selectedPhase}
                              compact={compact}
                              edgeToEdge={edgeToEdge && compact}
                            />
                          );
                        }

                        const folderNode = {
                          ...node,
                          type: node?.type === 'projectFunction' ? 'folder' : (node?.type || 'folder'),
                        };

                        const isOverviewPage = isOverviewPageNode(folderNode, parentNode);

                        const isPhaseSectionFolder =
                          parentNode?.type === 'project' &&
                          Boolean(getTwoDigitPrefix(folderNode?.name));

                        const isParentPhaseSectionFolder =
                          parentNode?.type === 'folder' &&
                          grandparentNode?.type === 'project' &&
                          Boolean(getTwoDigitPrefix(parentNode?.name));

                        const isPhaseItemFolder =
                          isParentPhaseSectionFolder &&
                          Boolean(getTwoDigitPrefix(folderNode?.name));

                        const isFfuSectionFolder = (() => {
                          if (!afMirror || !afMirror.enabled) return false;
                          if (!isPhaseSectionFolder) return false;
                          if (!afMirror.rootPath) return false;
                          if (typeof afMirror.onRelativePathChange !== 'function') return false;

                          const name = String(folderNode?.name || '').trim().toLowerCase();
                          return name.includes('förfrågningsunderlag') || name.includes('forfragningsunderlag');
                        })();

                        const isActivePhaseSectionFolder =
                          isPhaseSectionFolder &&
                          Boolean(activePhaseSectionPrefix) &&
                          getTwoDigitPrefix(folderNode?.name) === String(activePhaseSectionPrefix);

                        const isActiveOverviewPage =
                          isOverviewPage &&
                          String(activePhaseSection || '') === 'oversikt' &&
                          Boolean(activeOverviewPrefix) &&
                          getTwoDigitPrefix(folderNode?.name) === String(activeOverviewPrefix);

                        const subSpinAnim = subChevronSpinAnim[folderNode.id];
                        const isSubExpanded = folderNode.expanded || false;

                        const handlePressFolder =
                          (isOverviewPage || isPhaseSectionFolder || isPhaseItemFolder) && typeof onPressFolder === 'function'
                            ? () => {
                                onPressFolder(folderNode, { parent: parentNode, grandparent: grandparentNode });
                              }
                            : undefined;

                        return (
                          <View key={folderNode.id} style={{ marginTop: 4 }}>
                            <ProjectTreeFolder
                              folder={folderNode}
                              level={level}
                              isExpanded={isSubExpanded}
                              compact={compact}
                              hideFolderIcon={hideFolderIcons}
                              reserveChevronSpace={isOverviewPage}
                              forceChevron={Boolean(isPhaseSectionFolder)}
                              isActive={isActiveOverviewPage || isActivePhaseSectionFolder}
                              edgeToEdge={edgeToEdge && compact}
                              onCollapseSubtree={onCollapseSubtree}
                              onPress={handlePressFolder}
                              onToggle={
                                isOverviewPage
                                  ? undefined
                                  : (id) => {
                                      if (spinOnce && subSpinAnim) {
                                        spinOnce(subSpinAnim);
                                      }
                                      if (onToggleSubFolder) {
                                        onToggleSubFolder(id);
                                      }
                                    }
                              }
                              onLongPress={() => {
                                if (onEditSubFolder) {
                                  onEditSubFolder(folderNode.id, folderNode.name);
                                }
                              }}
                              spinAnim={subSpinAnim}
                              showAddButton={!isOverviewPage && isSubExpanded}
                              onAddChild={
                                !isOverviewPage && onAddProject
                                  ? () => {
                                      onAddProject(folderNode.id);
                                    }
                                  : undefined
                              }
                            />

                            {isSubExpanded && !isOverviewPage && (
                              isFfuSectionFolder ? (
                                <SharePointFolderHierarchyTree
                                  indentLevel={level + 1}
                                  compact={compact}
                                  edgeToEdge={Boolean(edgeToEdge && compact)}
                                  companyId={afMirror.companyId}
                                  project={afMirror.project}
                                  rootPath={afMirror.rootPath}
                                  relativePath={afMirror.relativePath}
                                  onRelativePathChange={afMirror.onRelativePathChange}
                                  selectedItemId={afMirror.selectedItemId}
                                  onSelectedItemIdChange={afMirror.onSelectedItemIdChange}
                                  refreshNonce={afMirror.refreshNonce}
                                  systemFolderName="AI-sammanställning"
                                  ensureSystemFolder
                                  pinSystemFolderLast
                                  systemFolderRootOnly
                                />
                              ) : folderNode.loading ? (
                                <Text
                                  style={{
                                    color: '#888',
                                    fontSize: compact ? 12 : 13,
                                    marginLeft: compact ? 14 : 18,
                                    marginTop: 4,
                                    fontStyle: 'italic',
                                  }}
                                >
                                  Laddar undermappar...
                                </Text>
                              ) : folderNode.error ? (
                                <Text
                                  style={{
                                    color: '#D32F2F',
                                    fontSize: compact ? 12 : 13,
                                    marginLeft: compact ? 14 : 18,
                                    marginTop: 4,
                                  }}
                                >
                                  Fel: {folderNode.error}
                                </Text>
                              ) : !folderNode.children || folderNode.children.length === 0 ? null : (() => {
                                const children = Array.isArray(folderNode.children) ? folderNode.children : [];
                                const hasFolderChildren = children.some((c) => {
                                  const t = c?.type;
                                  return t === 'folder' || t === 'sub' || t === 'project' || t === 'projectFunction' || !t;
                                });
                                const hasFileChildren = children.some((c) => c?.type === 'file');

                                if (!hasFolderChildren && hasFileChildren) return null;

                                return (
                                  <View style={{ marginLeft: edgeToEdge && compact ? 0 : (compact ? 10 : 12), marginTop: 4 }}>
                                    {renderNodes(children, level + 1, folderNode, parentNode)}
                                  </View>
                                );
                              })()
                            )}
                          </View>
                        );
                      })}
                    </>
                  );
                };

                if (!isExpanded) return null;
                if (folder.loading) {
                  return (
                    <Text
                      style={{
                        color: '#888',
                        fontSize: compact ? 12 : 14,
                        marginLeft: compact ? 14 : 18,
                        marginTop: compact ? 6 : 8,
                        fontStyle: 'italic',
                      }}
                    >
                      Laddar...
                    </Text>
                  );
                }
                if (!folder.children || folder.children.length === 0) return null;
                {
                  const children = Array.isArray(folder.children) ? folder.children : [];
                  const hasFolderChildren = children.some((c) => {
                    const t = c?.type;
                    return t === 'folder' || t === 'sub' || t === 'project' || t === 'projectFunction' || !t;
                  });
                  const hasFileChildren = children.some((c) => c?.type === 'file');

                  if (!hasFolderChildren && hasFileChildren) return null;

                  return <View style={{ marginTop: compact ? 6 : 8 }}>{renderNodes(children, 1, folder, null)}</View>;
                }
              })()}
            </View>
          );
        })}
    </View>
  );
}
