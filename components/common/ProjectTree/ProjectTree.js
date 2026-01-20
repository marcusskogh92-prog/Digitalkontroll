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
 *   projectStatusFilter="all"
 *   onToggleMainFolder={handleToggleMainFolder}
 *   onToggleSubFolder={handleToggleSubFolder}
 *   onAddSubFolder={handleAddSubFolder}
 *   onAddProject={handleAddProject}
 * />
 */

import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, Animated, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PlatformComponent } from '../../../utils/platform';
import ProjectTreeNode from './ProjectTreeNode';
import ProjectTreeFolder from './ProjectTreeFolder';
import ProjectTreeFile from './ProjectTreeFile';
import { useProjectTree } from './useProjectTree';

export default function ProjectTree({
  hierarchy = [],
  onSelectProject,
  onSelectFunction,
  navigation,
  companyId,
  projectStatusFilter = 'all',
  onToggleMainFolder,
  onToggleSubFolder,
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
          const folderType = folder.type || 'folder';
          const isPhaseFolder = folder.isPhaseFolder || folderType === 'folder';
          const mainSpinAnim = mainChevronSpinAnim[folder.id];
          const isExpanded = folder.expanded || false;

          return (
            <View key={folder.id} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 8, paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
              {/* Folder (can be phase folder or any SharePoint folder) */}
              <ProjectTreeFolder
                folder={folder}
                level={0}
                isExpanded={isExpanded}
                onToggle={(id) => {
                  if (spinOnce && mainSpinAnim) {
                    spinOnce(mainSpinAnim);
                  }
                  if (onToggleMainFolder) {
                    onToggleMainFolder(id);
                  }
                  // Track active folder for UI color
                  if (folder.path && typeof window !== 'undefined') {
                    try {
                      window.dispatchEvent(new CustomEvent('dkFolderSelected', { 
                        detail: { folderPath: folder.path, folderName: folder.name } 
                      }));
                    } catch (_e) {}
                  }
                }}
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
                showAddButton={isExpanded && !folder.children?.some(child => child.expanded)}
                onAddChild={() => {
                  if (onAddSubFolder) {
                    onAddSubFolder(folder.id);
                  }
                }}
              />

            {/* Children: folders, files, and projects */}
            {isExpanded && (
              !folder.children || folder.children.length === 0 ? (
                <Text style={{ color: '#888', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                  Tom mapp
                </Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  {/* Files */}
                  {folder.children
                    .filter(child => child.type === 'file')
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                    .map((file) => (
                      <ProjectTreeFile
                        key={file.id}
                        file={file}
                        level={1}
                      />
                    ))}
                  
                  {/* Recursive rendering of sub-folders, projects, and files */}
                  {folder.children
                    .filter(child => child.type === 'folder' || child.type === 'sub' || child.type === 'project')
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                    .map((child) => {
                      // Check if child is a project (has project number pattern in name)
                      const { isProjectFolder } = require('./sharePointAdapter');
                      const isProject = child.type === 'project' || (child.type === 'folder' && isProjectFolder(child));
                      
                      if (isProject && child.type !== 'folder') {
                        // Render as project
                        const { getProjectPhase, DEFAULT_PHASE } = require('../../../features/projects/constants');
                        const projectPhase = getProjectPhase(child);
                        const effectivePhase = child?.phase || (selectedPhase && selectedPhase !== 'all' ? selectedPhase : DEFAULT_PHASE);
                        
                        const projectWithFunctions = {
                          ...child,
                          phase: effectivePhase,
                          expanded: expandedProjects[child.id] || false,
                        };
                        
                        const isKalkylskede = projectPhase.key === 'kalkylskede' || (!child?.phase && DEFAULT_PHASE === 'kalkylskede') || effectivePhase === 'kalkylskede';
                        const effectiveExpanded = isKalkylskede ? false : projectWithFunctions.expanded;
                        
                        return (
                          <ProjectTreeNode
                            key={child.id}
                            project={projectWithFunctions}
                            isExpanded={effectiveExpanded}
                            onToggle={isKalkylskede ? undefined : (projectId) => {
                              handleProjectClick({ ...child, id: projectId });
                            }}
                            onSelect={(project) => {
                              if (onSelectProject) {
                                onSelectProject({
                                  ...project,
                                  phase: project.phase || effectivePhase
                                });
                              }
                            }}
                            onSelectFunction={handleFunctionClick}
                            navigation={navigation}
                            companyId={companyId}
                            isSelected={selectedProject && selectedProject.id === child.id}
                            selectedPhase={selectedPhase}
                          />
                        );
                      } else {
                        // Render as folder (recursive)
                        const subSpinAnim = subChevronSpinAnim[child.id];
                        const isSubExpanded = child.expanded || false;
                        
                        return (
                          <View key={child.id} style={{ marginTop: 4 }}>
                            <ProjectTreeFolder
                              folder={child}
                              level={1}
                              isExpanded={isSubExpanded}
                              onToggle={(id) => {
                                if (spinOnce && subSpinAnim) {
                                  spinOnce(subSpinAnim);
                                }
                                if (onToggleSubFolder) {
                                  onToggleSubFolder(id);
                                }
                              }}
                              onLongPress={() => {
                                if (onEditSubFolder) {
                                  onEditSubFolder(child.id, child.name);
                                }
                              }}
                              spinAnim={subSpinAnim}
                              showAddButton={isSubExpanded}
                              onAddChild={() => {
                                if (onAddProject) {
                                  onAddProject(child.id);
                                }
                              }}
                            />
                            
                            {/* Recursively render children */}
                            {isSubExpanded && child.children && child.children.length > 0 && (
                              <View style={{ marginLeft: 12, marginTop: 4 }}>
                                {/* Files */}
                                {child.children
                                  .filter(grandchild => grandchild.type === 'file')
                                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                  .map((file) => (
                                    <ProjectTreeFile
                                      key={file.id}
                                      file={file}
                                      level={2}
                                    />
                                  ))}
                                
                                {/* Recursively render sub-folders and projects */}
                                {child.children
                                  .filter(grandchild => grandchild.type === 'folder' || grandchild.type === 'sub' || grandchild.type === 'project')
                                  .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                  .map((grandchild) => {
                                    const isGrandchildProject = grandchild.type === 'project' || (grandchild.type === 'folder' && isProjectFolder(grandchild));
                                    
                                    if (isGrandchildProject && grandchild.type !== 'folder') {
                                      // Render as project
                                      const { getProjectPhase, DEFAULT_PHASE } = require('../../../features/projects/constants');
                                      const projectPhase = getProjectPhase(grandchild);
                                      const effectivePhase = grandchild?.phase || (selectedPhase && selectedPhase !== 'all' ? selectedPhase : DEFAULT_PHASE);
                                      
                                      const projectWithFunctions = {
                                        ...grandchild,
                                        phase: effectivePhase,
                                        expanded: expandedProjects[grandchild.id] || false,
                                      };
                                      
                                      const isKalkylskede = projectPhase.key === 'kalkylskede' || (!grandchild?.phase && DEFAULT_PHASE === 'kalkylskede') || effectivePhase === 'kalkylskede';
                                      const effectiveExpanded = isKalkylskede ? false : projectWithFunctions.expanded;
                                      
                                      return (
                                        <ProjectTreeNode
                                          key={grandchild.id}
                                          project={projectWithFunctions}
                                          isExpanded={effectiveExpanded}
                                          onToggle={isKalkylskede ? undefined : (projectId) => {
                                            handleProjectClick({ ...grandchild, id: projectId });
                                          }}
                                          onSelect={(project) => {
                                            if (onSelectProject) {
                                              onSelectProject({
                                                ...project,
                                                phase: project.phase || effectivePhase
                                              });
                                            }
                                          }}
                                          onSelectFunction={handleFunctionClick}
                                          navigation={navigation}
                                          companyId={companyId}
                                          isSelected={selectedProject && selectedProject.id === grandchild.id}
                                          selectedPhase={selectedPhase}
                                        />
                                      );
                                    } else {
                                      // Render as folder (would need another level of recursion, but limit to 2 levels for now)
                                      return (
                                        <View key={grandchild.id} style={{ marginTop: 4 }}>
                                          <Text style={{ color: '#666', fontSize: 13, marginLeft: 12 }}>
                                            {grandchild.name} (mapp)
                                          </Text>
                                        </View>
                                      );
                                    }
                                  })}
                              </View>
                            )}
                          </View>
                        );
                      }
                    })}
                </View>
              )
            )}
            </View>
          );
        })}
    </View>
  );
}
