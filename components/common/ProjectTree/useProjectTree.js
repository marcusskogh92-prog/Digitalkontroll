/**
 * Hook for ProjectTree state and logic
 */

import { useState, useCallback, useMemo } from 'react';
import { ensureProjectFunctions } from './constants';

export function useProjectTree({ hierarchy, onSelectProject, onSelectFunction }) {
  const [expandedProjects, setExpandedProjects] = useState({});

  const toggleProject = useCallback((projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);

  // Ensure all projects have functions
  const hierarchyWithFunctions = useMemo(() => {
    if (!Array.isArray(hierarchy)) return hierarchy;
    
    const migrateProject = (node) => {
      if (node.type === 'project') {
        const projectWithFunctions = ensureProjectFunctions(node);
        // Preserve expanded state
        if (expandedProjects[node.id] !== undefined) {
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
  }, [hierarchy, expandedProjects]);

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
