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
      {[...hierarchyWithFunctions]
        .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
        .map((main) => {
          const mainSpinAnim = mainChevronSpinAnim[main.id];
          const isMainExpanded = main.expanded || false;

          return (
            <View key={main.id} style={{ backgroundColor: '#fff', borderRadius: 10, borderWidth: 1, borderColor: '#e0e0e0', marginBottom: 0, paddingVertical: 10, paddingHorizontal: 12, shadowColor: '#1976D2', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.10, shadowRadius: 6, elevation: 2 }}>
              {/* Main folder */}
              <ProjectTreeFolder
                folder={main}
                level={0}
                isExpanded={isMainExpanded}
                onToggle={(id) => {
                  if (spinOnce && mainSpinAnim) {
                    spinOnce(mainSpinAnim);
                  }
                  if (onToggleMainFolder) {
                    onToggleMainFolder(id);
                  }
                }}
                onLongPress={() => {
                  if (onEditMainFolder) {
                    onEditMainFolder(main.id, main.name);
                  }
                }}
                onPressIn={() => {
                  if (mainTimersRef && mainTimersRef.current) {
                    if (mainTimersRef.current[main.id]) clearTimeout(mainTimersRef.current[main.id]);
                    mainTimersRef.current[main.id] = setTimeout(() => {
                      if (onEditMainFolder) {
                        onEditMainFolder(main.id, main.name);
                      }
                    }, 2000);
                  }
                }}
                onPressOut={() => {
                  if (mainTimersRef && mainTimersRef.current && mainTimersRef.current[main.id]) {
                    clearTimeout(mainTimersRef.current[main.id]);
                  }
                }}
                spinAnim={mainSpinAnim}
                showAddButton={isMainExpanded && !main.children?.some(sub => sub.expanded)}
                onAddChild={() => {
                  if (onAddSubFolder) {
                    onAddSubFolder(main.id);
                  }
                }}
              />

            {/* Sub folders and projects */}
            {isMainExpanded && (
              !main.children || main.children.length === 0 ? (
                <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                  Inga undermappar skapade
                </Text>
              ) : (
                <View>
                  {main.children
                    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                    .map((sub) => {
                    const subSpinAnim = subChevronSpinAnim[sub.id];
                    const isSubExpanded = sub.expanded || false;
                    const allProjects = sub.children 
                      ? sub.children.filter(child => child.type === 'project')
                      : [];
                    
                    const projects = projectStatusFilter === 'all'
                      ? allProjects
                      : allProjects.filter(p => {
                          const status = p?.status || 'ongoing';
                          return projectStatusFilter === 'completed' 
                            ? status === 'completed' 
                            : status !== 'completed';
                        });

                    return (
                      <View key={sub.id} style={{ marginTop: 4 }}>
                        {/* Sub folder */}
                        <ProjectTreeFolder
                          folder={sub}
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
                              onEditSubFolder(sub.id, sub.name);
                            }
                          }}
                          spinAnim={subSpinAnim}
                          showAddButton={isSubExpanded}
                          onAddChild={() => {
                            if (onAddProject) {
                              onAddProject(sub.id);
                            }
                          }}
                        />

                        {/* Projects */}
                        {isSubExpanded && (
                          <View style={{ marginLeft: 12, marginTop: 4 }}>
                            {projects.length === 0 ? (
                              <Text style={{ color: '#D32F2F', fontSize: 14, marginLeft: 18, marginTop: 8 }}>
                                {allProjects.length === 0 
                                  ? 'Inga projekt skapade' 
                                  : 'Inga projekt matchar filtret'}
                              </Text>
                            ) : (
                              projects
                                .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }))
                                .map((proj) => {
                                  const projectWithFunctions = {
                                    ...proj,
                                    expanded: expandedProjects[proj.id] || false,
                                  };
                                  
                                  return (
                                    <ProjectTreeNode
                                      key={proj.id}
                                      project={projectWithFunctions}
                                      isExpanded={projectWithFunctions.expanded}
                                      onToggle={(projectId) => {
                                        handleProjectClick({ ...proj, id: projectId });
                                      }}
                                      onSelect={(project) => {
                                        if (onSelectProject) {
                                          onSelectProject(project);
                                        }
                                      }}
                                      onSelectFunction={handleFunctionClick}
                                      navigation={navigation}
                                      companyId={companyId}
                                      isSelected={selectedProject && selectedProject.id === proj.id}
                                      selectedPhase={selectedPhase}
                                    />
                                  );
                                })
                            )}
                          </View>
                        )}
                      </View>
                    );
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
