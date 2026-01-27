/**
 * ProjectTreeNode - Renders a single project with its functions
 */

import { useState } from 'react';
import { Platform, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_PHASE, getProjectPhase } from '../../../features/projects/constants';
import { isWeb } from '../../../utils/platform';

const PRIMARY_BLUE = '#1976D2';
const HOVER_BG = 'rgba(25, 118, 210, 0.10)';

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
  compact = false,
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

  const handlePress = (e) => {
    // Prevent event propagation to avoid any parent handlers
    if (e && e.stopPropagation) {
      e.stopPropagation();
    }
    
    console.log('[ProjectTreeNode] handlePress - project:', project.id, 'phase:', project?.phase, 'isKalkylskede:', isKalkylskede, 'hasFunctions:', hasFunctions);
    
    // ALL projects should navigate directly (never expand) - projects are now first-class entities
    // The SharePoint folder structure will be shown inside the project view
    console.log('[ProjectTreeNode] Navigating to project (projects are no longer expandable)');
    handleSelect();
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
      // On web, always navigate to ProjectDetails for all projects
      if (navigation) {
        console.log('[ProjectTreeNode] Navigating to project:', projectWithPhase.id, 'phase:', projectWithPhase.phase);
        navigation.navigate('ProjectDetails', {
          project: projectWithPhase,
          companyId
        });
      } else if (onSelect) {
        // Fallback: use onSelect callback
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

  const effectivePhaseKey = project?.phase || (selectedPhase && selectedPhase !== 'all' ? selectedPhase : DEFAULT_PHASE);
  const phase = getProjectPhase({ ...project, phase: effectivePhaseKey });
  const [isHovered, setIsHovered] = useState(false);

  const projectRowStyle = {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: compact ? 5 : 8,
    paddingHorizontal: compact ? 8 : 10,
    borderRadius: 8,
    marginVertical: 2,
    backgroundColor: isSelected 
      ? '#E8F5E9' 
      : isHovered 
        ? HOVER_BG 
        : 'transparent',
    borderWidth: isSelected ? 1 : 0,
    borderColor: isSelected ? (phase?.color || '#43A047') : 'transparent',
    ...(Platform.OS === 'web' ? {
      cursor: 'pointer',
      transition: 'background-color 0.15s ease, border-color 0.15s ease',
    } : {}),
  };

  const projectRowContent = (
    <>
      {/* Projects are no longer expandable - chevron removed */}
      {/* All projects navigate directly to project view */}
      
      {/* Phase indicator (5 states) */}
      <View
        style={{
          width: compact ? 10 : 14,
          height: compact ? 10 : 14,
          borderRadius: compact ? 5 : 7,
          backgroundColor: phase?.color || '#43A047',
          marginRight: compact ? 6 : 8,
          borderWidth: 1,
          borderColor: '#bbb'
        }}
      />
      
      {/* Project name */}
      <Text
        style={{
          fontSize: compact ? 13 : 15,
          color: !isSelected && isHovered ? PRIMARY_BLUE : '#222',
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

  // Functions are no longer shown in the sidebar - they will be shown inside the project view
  const functionsList = null;

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
