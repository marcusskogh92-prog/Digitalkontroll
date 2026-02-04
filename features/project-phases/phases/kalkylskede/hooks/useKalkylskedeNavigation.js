/**
 * Hook for managing kalkylskede navigation
 */

import { useCallback, useEffect, useState } from 'react';
import {
    getProjectPhaseNavigation,
    saveProjectPhaseNavigation
} from '../services/navigationService';

export function useKalkylskedeNavigation(companyId, projectId, project = null) {
  const [navigation, setNavigation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const structureVersion = String(project?.kalkylskedeStructureVersion || '').trim().toLowerCase();

  const loadNavigation = useCallback(async () => {
    if (!companyId) {
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Navigation is now stored at company level, projectId is optional (kept for backwards compatibility)
      const nav = await getProjectPhaseNavigation(companyId, projectId, 'kalkylskede', project);
      setNavigation(nav);
    } catch (err) {
      console.error('[useKalkylskedeNavigation] Error loading navigation:', err);
      setError(err);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, projectId, project, structureVersion]);

  useEffect(() => {
    loadNavigation();
  }, [loadNavigation]);

  const saveNavigation = useCallback(async (updatedNavigation) => {
    if (!companyId) {
      return false;
    }

    try {
      // Navigation is now stored at company level, projectId is optional (kept for backwards compatibility)
      const success = await saveProjectPhaseNavigation(
        companyId,
        projectId,
        'kalkylskede',
        updatedNavigation
      );

      if (success) {
        setNavigation(updatedNavigation);
      }

      return success;
    } catch (err) {
      console.error('[useKalkylskedeNavigation] Error saving navigation:', err);
      return false;
    }
  }, [companyId, projectId]);

  return {
    navigation,
    isLoading,
    error,
    loadNavigation,
    saveNavigation
  };
}
