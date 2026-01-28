/**
 * Hook for ProjectTree state and logic
 * Now fetches project functions (folders) from SharePoint instead of using hardcoded functions
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { DEFAULT_PHASE, getProjectPhase } from '../../../features/projects/constants';
import { getProjectFolders } from '../../../services/azure/hierarchyService';

export function useProjectTree({ hierarchy, onSelectProject, onSelectFunction, selectedPhase, companyId, selectedProjectId = null }) {
  const [expandedProjects, setExpandedProjects] = useState({});
  const [projectFunctionsCache, setProjectFunctionsCache] = useState({}); // Cache for SharePoint project functions

  const toggleProject = useCallback((projectId) => {
    setExpandedProjects(prev => ({
      ...prev,
      [projectId]: !prev[projectId]
    }));
  }, []);
  
  // When a project is selected, preload its functions
  useEffect(() => {
    if (selectedProjectId && companyId && !projectFunctionsCache[selectedProjectId]) {
      // Find project in hierarchy
      const findProject = (nodes) => {
        if (!Array.isArray(nodes)) return null;
        for (const node of nodes) {
          if (node.type === 'project' && node.id === selectedProjectId) {
            return node;
          }
          if (node.children && Array.isArray(node.children)) {
            const found = findProject(node.children);
            if (found) return found;
          }
        }
        return null;
      };
      
      const project = findProject(hierarchy);
      if (project) {
        const projectPhase = getProjectPhase(project);
        const isKalkylskede = projectPhase.key === 'kalkylskede' || (!project?.phase && DEFAULT_PHASE === 'kalkylskede');
        
        if (!isKalkylskede) {
          // Preload functions for selected project
          (async () => {
            try {
              const phaseKey = project.phase || selectedPhase || DEFAULT_PHASE;
              const functions = await getProjectFolders(
                companyId,
                project.id,
                phaseKey,
                project.path || project.projectPath || null,
              );
              
              setProjectFunctionsCache(prev => ({
                ...prev,
                [project.id]: functions
              }));
            } catch (error) {
              console.error('[useProjectTree] Error preloading project functions:', error);
            }
          })();
        }
      }
    }
  }, [selectedProjectId, companyId, hierarchy, selectedPhase, projectFunctionsCache]);

  // Load project functions from SharePoint when project is expanded or when hierarchy changes
  useEffect(() => {
    if (!companyId) return;

    // Find all projects that need functions loaded
    // Load for: 1) expanded projects, 2) projects that don't have functions cached yet
    const projectsToLoad = [];
    const findProjects = (nodes) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach(node => {
        if (node.type === 'project') {
          const projectPhase = getProjectPhase(node);
          const isKalkylskede = projectPhase.key === 'kalkylskede' || (!node?.phase && DEFAULT_PHASE === 'kalkylskede');
          
          // Only load functions for non-kalkylskede projects
          // Load if expanded OR if not yet cached (preload for better UX)
          if (!isKalkylskede && !projectFunctionsCache[node.id]) {
            // Only load if project is expanded or if we want to preload
            // For now, only load when expanded to avoid too many API calls
            if (expandedProjects[node.id]) {
              projectsToLoad.push(node);
            }
          }
        }
        if (node.children && Array.isArray(node.children)) {
          findProjects(node.children);
        }
      });
    };
    
    findProjects(hierarchy);
    
    // Load functions for each project
    projectsToLoad.forEach(async (project) => {
      try {
        const phaseKey = project.phase || selectedPhase || DEFAULT_PHASE;
        const functions = await getProjectFolders(
          companyId,
          project.id,
          phaseKey,
          project.path || project.projectPath || null,
        );
        
        setProjectFunctionsCache(prev => ({
          ...prev,
          [project.id]: functions
        }));
      } catch (error) {
        console.error('[useProjectTree] Error loading project functions from SharePoint:', error);
        // On error, set empty array to prevent retrying
        setProjectFunctionsCache(prev => ({
          ...prev,
          [project.id]: []
        }));
      }
    });
  }, [hierarchy, expandedProjects, companyId, selectedPhase, projectFunctionsCache]);

  // Ensure all projects have functions from SharePoint (except kalkylskede projects)
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
        
        // Get functions from SharePoint cache (if loaded)
        // Also check if project already has functions from SharePoint adapter
        const existingSharePointFunctions = (node.children || []).filter(c => 
          c.type === 'projectFunction' && (c.webUrl || c.sharePointPath)
        );
        const sharePointFunctions = projectFunctionsCache[node.id] || existingSharePointFunctions || [];
        
        // If we have SharePoint functions, use them (they take priority over hardcoded)
        // Otherwise, check if project already has functions from adapter
        const hasSharePointFunctions = sharePointFunctions.length > 0 || existingSharePointFunctions.length > 0;
        
        // Merge SharePoint functions with any existing children (files, etc.)
        const nonFunctionChildren = (node.children || []).filter(c => 
          c.type !== 'projectFunction' && c.type !== 'file'
        );
        const files = (node.children || []).filter(c => c.type === 'file');
        
        // Use SharePoint functions if available, otherwise project might have functions from adapter
        const projectWithFunctions = {
          ...node,
          expanded: expandedProjects[node.id] || false,
          children: hasSharePointFunctions 
            ? [...sharePointFunctions, ...nonFunctionChildren, ...files]
            : [...nonFunctionChildren, ...files] // No functions yet - will be loaded when expanded
        };
        
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
  }, [hierarchy, expandedProjects, selectedPhase, projectFunctionsCache]);

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
