/**
 * Generic hook for managing phase navigation (works for all phases)
 */

import { useCallback, useEffect, useState } from 'react';
import {
    getProjectPhaseNavigation,
    saveProjectPhaseNavigation
} from '../kalkylskede/services/navigationService';

export function usePhaseNavigation(companyId, projectId, phaseKey, project = null) {
  const [navigation, setNavigation] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  const loadNavigation = useCallback(async () => {
    // If phaseKey exists, always return default navigation (even if companyId/projectId missing)
    if (!phaseKey) {
      setNavigation(null);
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // If companyId and projectId exist, try to fetch custom navigation
      if (companyId && projectId) {
        const nav = await getProjectPhaseNavigation(companyId, projectId, phaseKey, project);
        setNavigation(nav);
      } else {
        // Otherwise, return default navigation immediately
        const { getDefaultNavigationForProject } = require('../../constants');
        const defaultNav = getDefaultNavigationForProject(phaseKey, project);
        setNavigation(defaultNav);
      }
    } catch (err) {
      console.error('[usePhaseNavigation] Error loading navigation:', err);
      setError(err);
      // Even on error, return default navigation so UI can still render
      const { getDefaultNavigationForProject } = require('../../constants');
      const defaultNav = getDefaultNavigationForProject(phaseKey, project);
      setNavigation(defaultNav);
    } finally {
      setIsLoading(false);
    }
  }, [companyId, projectId, phaseKey, project]);

  useEffect(() => {
    loadNavigation();
  }, [loadNavigation]);

  const saveNavigation = useCallback(async (updatedNavigation) => {
    if (!companyId || !projectId || !phaseKey) {
      return false;
    }

    try {
      const success = await saveProjectPhaseNavigation(
        companyId,
        projectId,
        phaseKey,
        updatedNavigation
      );

      if (success) {
        setNavigation(updatedNavigation);
      }

      return success;
    } catch (err) {
      console.error('[usePhaseNavigation] Error saving navigation:', err);
      return false;
    }
  }, [companyId, projectId, phaseKey]);

  return {
    navigation,
    isLoading,
    error,
    loadNavigation,
    saveNavigation
  };
}
