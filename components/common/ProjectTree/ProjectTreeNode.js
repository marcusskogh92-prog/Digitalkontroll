/**
 * ProjectTreeNode - Renders a single project with its functions
 */

import { Ionicons } from '@expo/vector-icons';
import React, { useState } from 'react';
import { Text, TouchableOpacity, View, Platform } from 'react-native';
import { DEFAULT_PHASE, getProjectPhase } from '../../../features/projects/constants';
import { isWeb } from '../../../utils/platform';
import ProjectFunctionNode from './ProjectFunctionNode';

export default function ProjectTreeNode({
  project,
  isExpanded,
  onToggle,
  onSelect,
  onSelectFunction,
  navigation,
  companyId,
  isSelected = false,
  selectedPhase = null,
}) {
  // Check if project is in kalkylskede - these should NEVER have functions or expand
  const projectPhase = getProjectPhase(project);
  const isKalkylskede = projectPhase.key === 'kalkylskede' || 
                        (!project?.phase && DEFAULT_PHASE === 'kalkylskede') ||
                        (selectedPhase && selectedPhase === 'kalkylskede' && !project?.phase);
  
  // For kalkylskede projects, filter out all functions
  const projectWithoutFunctions = isKalkylskede 
    ? { ...project, children: (project.children || []).filter(c => c.type !== 'projectFunction') }
    : project;
  
  const hasFunctions = !isKalkylskede && Array.isArray(projectWithoutFunctions.children) && 
    projectWithoutFunctions.children.some(child => child.type === 'projectFunction');

  const functions = hasFunctions 
    ? projectWithoutFunctions.children.filter(child => child.type === 'projectFunction')
        .sort((a, b) => (a.order || 999) - (b.order || 999))
    : [];

  const handlePress = (e) => {
    // Prevent event propagation to avoid any parent handlers
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    
    console.log('[ProjectTreeNode] handlePress - project:', project.id, 'phase:', project?.phase, 'isKalkylskede:', isKalkylskede, 'hasFunctions:', hasFunctions, 'onToggle:', !!onToggle);
    
    // For kalkylskede projects, ALWAYS navigate directly (never expand)
    if (isKalkylskede) {
      console.log('[ProjectTreeNode] Navigating to kalkylskede project (preventing expansion)');
      handleSelect();
      return;
    }
    
    // For other projects, expand if has functions, otherwise navigate
    if (hasFunctions && onToggle) {
      // Toggle expand/collapse if project has functions
      console.log('[ProjectTreeNode] Expanding project (not kalkylskede)');
      onToggle(project.id);
    } else {
      // Direct navigation if no functions
      console.log('[ProjectTreeNode] Navigating (no functions or no onToggle)');
      handleSelect();
    }
  };

  const handleSelect = () => {
    // Always ensure phase is set - use project's phase, selectedPhase context, or DEFAULT_PHASE
    const effectivePhase = project?.phase || (selectedPhase && selectedPhase !== 'all' ? selectedPhase : DEFAULT_PHASE);
    const projectWithPhase = {
      ...project,
      phase: effectivePhase
    };
    
    const projectPhase = getProjectPhase(projectWithPhase);
    const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede') || effectivePhase === 'kalkylskede';
    
    console.log('[ProjectTreeNode] handleSelect - project:', project.id, 'phase:', effectivePhase, 'isKalkylskede:', isKalkylskede);
    
    if (isWeb) {
      // For kalkylskede projects on web, navigate to separate page
      if (isKalkylskede && navigation) {
        console.log('[ProjectTreeNode] Navigating to kalkylskede project:', projectWithPhase.id, 'phase:', projectWithPhase.phase);
        navigation.navigate('ProjectDetails', {
          project: projectWithPhase,
          companyId
        });
      } else if (onSelect) {
        // Web: set selected project (handled by parent) for non-kalkylskede projects
        onSelect(projectWithPhase);
      }
    } else {
      // Native: navigate to ProjectDetails
      if (navigation) {
        navigation.navigate('ProjectDetails', {
          project: {
            id: project.id,
            name: project.name,
            ansvarig: project.ansvarig || '',
            adress: project.adress || '',
            fastighetsbeteckning: project.fastighetsbeteckning || '',
            client: project.client || '',
            status: project.status || 'ongoing',
            phase: project.phase || DEFAULT_PHASE,
            createdAt: project.createdAt || '',
            createdBy: project.createdBy || ''
          },
          companyId
        });
      }
    }
  };

  const statusColor = project.status === 'completed' ? '#222' : '#43A047';
  const phase = getProjectPhase(project);
  const [isHovered, setIsHovered] = useState(false);

  const projectRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginVertical: 2,
    backgroundColor: isSelected 
      ? '#E8F5E9' 
      : isHovered 
        ? '#E3F2FD' 
        : 'transparent',
    borderWidth: isSelected ? 1 : 0,
    borderColor: isSelected ? '#43A047' : 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    } : {}),
  };

  const projectRowContent = (
    <>
      {/* Chevron for expand/collapse (only if has functions AND not kalkylskede) */}
      {(() => {
        const projectPhase = getProjectPhase(project);
        const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
        // Don't show chevron for kalkylskede projects - they navigate instead
        if (isKalkylskede) return null;
        return hasFunctions ? (
          <Ionicons
            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
            size={16}
            color="#666"
            style={{ marginRight: 6 }}
          />
        ) : null;
      })()}
      
      {/* Status indicator - dölj för eftermarknad */}
      {selectedPhase !== 'eftermarknad' && (
        <View
          style={{
            width: 14,
            height: 14,
            borderRadius: 7,
            backgroundColor: statusColor,
            marginRight: 8,
            borderWidth: 1,
            borderColor: '#bbb'
          }}
        />
      )}
      
      {/* Project name */}
      <Text
        style={{
          fontSize: 15,
          color: '#222',
          fontWeight: isSelected ? '700' : '400',
          flexShrink: 1
        }}
        numberOfLines={1}
        ellipsizeMode="tail"
      >
        {project.id} — {project.name}
      </Text>
    </>
  );

  const functionsList = (() => {
    const projectPhase = getProjectPhase(project);
    const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
    // Don't show functions for kalkylskede projects - they navigate instead
    if (isKalkylskede) return null;
    return isExpanded && hasFunctions && functions.length > 0 ? (
      <View style={{ marginLeft: 20, marginTop: 4 }}>
        {functions.map((func) => (
          <ProjectFunctionNode
            key={func.id}
            functionItem={func}
            project={project}
            onSelect={() => {
              if (onSelectFunction) {
                onSelectFunction(project, func);
              }
            }}
          />
        ))}
      </View>
    ) : null;
  })();

  if (Platform.OS === 'web') {
    return (
      <View style={{ marginLeft: 14 }}>
        <div
          style={projectRowStyle}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          onClick={handlePress}
          onContextMenu={(e) => {
            try { e.preventDefault(); } catch (_) {}
            const projectPhase = getProjectPhase(project);
            const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
            if (isKalkylskede) {
              handleSelect();
            }
          }}
        >
          {projectRowContent}
        </div>
        {functionsList}
      </View>
    );
  }

  return (
    <View style={{ marginLeft: 14 }}>
      {/* Project row for native */}
      <TouchableOpacity
        style={projectRowStyle}
        onPress={handlePress}
        onLongPress={() => {
          // On long press, always navigate (for kalkylskede projects)
          const projectPhase = getProjectPhase(project);
          const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
          if (isKalkylskede) {
            handleSelect();
          }
        }}
        activeOpacity={0.7}
      >
        {projectRowContent}
      </TouchableOpacity>
      {functionsList}
    </View>
  );
}
