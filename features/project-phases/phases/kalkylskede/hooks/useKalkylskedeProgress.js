/**
 * Hook for calculating progress in kalkylskede
 */

import { useState, useEffect, useCallback } from 'react';
import { getAllCompletions } from '../services/kalkylskedeService';

/**
 * Calculate progress for a section
 */
function calculateSectionProgress(section, completions) {
  if (!section || !section.items || section.items.length === 0) {
    return { progress: 0, completed: 0, total: 0 };
  }

  let completed = 0;
  let total = 0;

  section.items.forEach(item => {
    if (!item.enabled) return;

    const itemKey = `${section.id}.${item.id}`;
    const itemCompletion = completions[itemKey];

    if (item.type === 'nested' && item.items) {
      // Handle nested items (like Ritningar)
      item.items.forEach(subItem => {
        if (!subItem.enabled) return;
        total++;
        const subItemKey = `${section.id}.${item.id}.${subItem.id}`;
        const subItemCompletion = completions[subItemKey];
        if (subItemCompletion?.completed) {
          completed++;
        }
      });
    } else {
      total++;
      if (itemCompletion?.completed) {
        completed++;
      }
    }
  });

  const progress = total > 0 ? (completed / total) * 100 : 0;

  return {
    progress: Math.round(progress),
    completed,
    total
  };
}

/**
 * Calculate overall progress for all sections
 */
function calculateOverallProgress(sections, completions) {
  if (!sections || sections.length === 0) {
    return { progress: 0, completed: 0, total: 0 };
  }

  let totalCompleted = 0;
  let totalItems = 0;

  sections.forEach(section => {
    const sectionProgress = calculateSectionProgress(section, completions);
    totalCompleted += sectionProgress.completed;
    totalItems += sectionProgress.total;
  });

  const progress = totalItems > 0 ? (totalCompleted / totalItems) * 100 : 0;

  return {
    progress: Math.round(progress),
    completed: totalCompleted,
    total: totalItems
  };
}

export function useKalkylskedeProgress(companyId, projectId, navigation) {
  const [completions, setCompletions] = useState({});
  const [isLoading, setIsLoading] = useState(true);
  const [sectionProgress, setSectionProgress] = useState({});
  const [overallProgress, setOverallProgress] = useState({ progress: 0 });

  const loadCompletions = useCallback(async () => {
    if (!companyId || !projectId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);

    try {
      const data = await getAllCompletions(companyId, projectId);
      setCompletions(data);
    } catch (error) {
      console.error('[useKalkylskedeProgress] Error loading completions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, projectId]);

  useEffect(() => {
    loadCompletions();
  }, [loadCompletions]);

  // Calculate progress when navigation or completions change
  useEffect(() => {
    if (!navigation || !navigation.sections) {
      return;
    }

    const sectionProgressMap = {};
    navigation.sections.forEach(section => {
      sectionProgressMap[section.id] = calculateSectionProgress(section, completions);
    });

    setSectionProgress(sectionProgressMap);
    setOverallProgress(calculateOverallProgress(navigation.sections, completions));
  }, [navigation, completions]);

  const getSectionProgress = useCallback((sectionId) => {
    return sectionProgress[sectionId] || { progress: 0, completed: 0, total: 0 };
  }, [sectionProgress]);

  const refreshProgress = useCallback(() => {
    loadCompletions();
  }, [loadCompletions]);

  return {
    completions,
    sectionProgress,
    overallProgress,
    isLoading,
    getSectionProgress,
    refreshProgress
  };
}
