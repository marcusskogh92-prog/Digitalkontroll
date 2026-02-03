/**
 * ProjectTreeNode - Renders a single project with its functions
 */

import { View } from 'react-native';
import { LEFT_NAV } from '../../../constants/leftNavTheme';
import { DEFAULT_PHASE, getProjectPhase } from '../../../features/projects/constants';
import { isWeb } from '../../../utils/platform';
import SidebarItem from '../SidebarItem';

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
  edgeToEdge = false,
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

  // Functions are no longer shown in the sidebar - they will be shown inside the project view
  const functionsList = null;

  return (
    <View>
      <SidebarItem
        fullWidth
        squareCorners={Boolean(edgeToEdge && isWeb)}
        indentMode={edgeToEdge ? 'padding' : 'margin'}
        indent={14}
        active={Boolean(isSelected)}
        onPress={handlePress}
        onContextMenu={(e) => {
          try {
            e?.preventDefault?.();
          } catch (_) {}
          const projectPhase = getProjectPhase(project);
          const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
          if (isKalkylskede) {
            handleSelect();
          }
        }}
        left={() => (
          <View
            style={{
              width: compact ? 10 : 14,
              height: compact ? 10 : 14,
              borderRadius: compact ? 5 : 7,
              backgroundColor: phase?.color || LEFT_NAV.phaseDotFallback,
              borderWidth: 1,
              borderColor: LEFT_NAV.phaseDotBorder,
            }}
          />
        )}
        label={`${project.id} — ${project.name}`}
        labelWeight={isSelected ? '700' : '500'}
      />
      {functionsList}
    </View>
  );
}
