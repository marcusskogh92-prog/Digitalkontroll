/**
 * Hook for ProjectTree state and logic
 */

import { useState, useCallback, useMemo } from 'react';
import { ensureProjectFunctions } from './constants';
import { getProjectPhase, DEFAULT_PHASE } from '../../../features/projects/constants';

export function useProjectTree({ hierarchy, onSelectProject, onSelectFunction, selectedPhase }) {
  const [expandedProjects, setExpandedProjects] = useState({});

  const toggleProject = useCallback((projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);

  // Ensure all projects have functions (except kalkylskede projects)
  const hierarchyWithFunctions = useMemo(() => {
    if (!Array.isArray(hierarchy)) return hierarchy;
    
    const migrateProject = (node) => {
      if (node.type === 'project') {
        // Check if project is in kalkylskede - don't add functions
        const projectPhase = getProjectPhase(node);
        const isKalkylskede = projectPhase.key === 'kalkylskede' || (!node?.phase && DEFAULT_PHASE === 'kalkylskede') || 
                              (selectedPhase && selectedPhase === 'kalkylskede' && !node?.phase);
        
        if (isKalkylskede) {
          // Remove all functions from kalkylskede projects
          const nonFunctionChildren = (node.children || []).filter(c => c.type !== 'projectFunction');
          return {
            ...node,
            phase: node.phase || 'kalkylskede',
            expanded: false, // Never expand kalkylskede projects
            children: nonFunctionChildren
          };
        }
        
        const projectWithFunctions = ensureProjectFunctions(node);
        // Preserve expanded state (but not for kalkylskede)
        if (expandedProjects[node.id] !== undefined && !isKalkylskede) {
          projectWithFunctions.expanded = expandedProjects[node.id];
        }
        return projectWithFunctions;
      }
      if (node.children && Array.isArray(node.children)) {
        return {
          ...node,
          children: node.children.map(migrateProject)
        };
      }
      return node;
    };
    
    return hierarchy.map(main => ({
      ...main,
      children: Array.isArray(main.children) ? main.children.map(sub => ({
        ...sub,
        children: Array.isArray(sub.children) ? sub.children.map(migrateProject) : []
      })) : []
    }));
  }, [hierarchy, expandedProjects, selectedPhase]);

  const handleProjectClick = useCallback((project) => {
    // Only toggle if project has functions
    const hasFunctions = Array.isArray(project.children) && 
      project.children.some(child => child.type === 'projectFunction');
    
    if (hasFunctions) {
      toggleProject(project.id);
    }
  }, [toggleProject]);

  const handleFunctionClick = useCallback((project, functionItem) => {
    if (onSelectFunction) {
      onSelectFunction(project, functionItem);
    }
  }, [onSelectFunction]);

  return {
    hierarchy: hierarchyWithFunctions,
    expandedProjects,
    toggleProject,
    handleProjectClick,
    handleFunctionClick,
  };
}
