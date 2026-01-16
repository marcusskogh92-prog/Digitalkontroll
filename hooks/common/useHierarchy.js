/**
 * Hook for managing project hierarchy state
 */

import { useCallback } from 'react';
import { PROJECT_PHASES } from '../../features/projects/constants';

/**
 * Toggle expand/collapse for hierarchy items
 */
export function useHierarchyToggle() {
  const toggleExpand = useCallback((level, id, parentArr) => {
    return parentArr.map(item => {
      if (item.id === id) {
        return { ...item, expanded: !item.expanded };
      } else if (item.children) {
        return { ...item, children: toggleExpand(level + 1, id, item.children) };
      }
      return item;
    });
  }, []);

  const toggleMainFolder = useCallback((mainId, hierarchy, setHierarchy, spinMain, setSpinMain) => {
    setHierarchy(prev => prev.map(m => m.id === mainId ? { ...m, expanded: !m.expanded } : { ...m, expanded: false }));
    setSpinMain(prev => ({ ...prev, [mainId]: (prev[mainId] || 0) + 1 }));
  }, []);

  const toggleSubFolder = useCallback((subId, hierarchy, setHierarchy, spinSub, setSpinSub) => {
    setHierarchy(prev => toggleExpand(1, subId, prev));
    setSpinSub(prev => ({ ...prev, [subId]: (prev[subId] || 0) + 1 }));
  }, [toggleExpand]);

  return {
    toggleExpand,
    toggleMainFolder,
    toggleSubFolder,
  };
}

/**
 * Collapse all items in hierarchy
 */
export function collapseHierarchy(hierarchy) {
  if (!Array.isArray(hierarchy)) return hierarchy;
  return hierarchy.map(main => ({
    ...main,
    expanded: false,
    children: Array.isArray(main.children) ? main.children.map(sub => ({
      ...sub,
      expanded: false,
      children: Array.isArray(sub.children) ? sub.children.map(proj => ({
        ...proj,
        expanded: false,
      })) : [],
    })) : [],
  }));
}

/**
 * Ensure hierarchy has phase structure
 * If hierarchy doesn't have phases, return it as-is (phases are handled at a different level)
 */
export function ensurePhaseStructure(hierarchy) {
  if (!Array.isArray(hierarchy)) return hierarchy;
  
  // Check if hierarchy already has phase structure
  const hasPhases = hierarchy.some(item => item.type === 'phase');
  
  if (hasPhases) {
    return hierarchy;
  }
  
  // If no phases, return hierarchy as-is
  // The phase filtering happens at a different level in the component
  return hierarchy;
}
