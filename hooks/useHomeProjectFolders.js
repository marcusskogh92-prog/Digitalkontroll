import React from 'react';
import { getProjectFolders } from '../services/azure/hierarchyService';

// Laddar SharePoint-mappar (funktioner) för valt projekt på HomeScreen.
// Abstraherar bort logiken från HomeScreen så komponenten bara
// behöver veta ATT det finns mappar, inte HUR de laddas.
export function useHomeProjectFolders({
  companyId,
  selectedProject,
  projectPhaseKey,
  setSelectedProjectFolders,
  setSelectedProjectFoldersLoading,
}) {
  const requestIdRef = React.useRef(0);

  React.useEffect(() => {
    const projectId = selectedProject?.id != null ? String(selectedProject.id) : null;
    const projectPathRaw = String(
      selectedProject?.path || selectedProject?.projectPath || selectedProject?.sharePointPath || ''
    ).trim();
    const projectPath = projectPathRaw || null;

    // Always advance request id on dependency changes so late responses are ignored.
    const requestId = (requestIdRef.current || 0) + 1;
    requestIdRef.current = requestId;

    if (!projectId || !companyId || !projectPhaseKey) {
      setSelectedProjectFolders([]);
      if (typeof setSelectedProjectFoldersLoading === 'function') {
        setSelectedProjectFoldersLoading(false);
      }
      return;
    }

    // Solution A: reset immediately + show loading until we have a fresh tree.
    setSelectedProjectFolders([]);
    if (typeof setSelectedProjectFoldersLoading === 'function') {
      setSelectedProjectFoldersLoading(true);
    }

    let cancelled = false;
    (async () => {
      try {
        const folders = await getProjectFolders(
          companyId,
          projectId,
          projectPhaseKey,
          projectPath,
        );
        if (cancelled || requestIdRef.current !== requestId) return;
        setSelectedProjectFolders(Array.isArray(folders) ? folders : []);
      } catch (error) {
        if (cancelled || requestIdRef.current !== requestId) return;
        console.error('[useHomeProjectFolders] Error loading project folders:', error);
        setSelectedProjectFolders([]);
      } finally {
        if (cancelled || requestIdRef.current !== requestId) return;
        if (typeof setSelectedProjectFoldersLoading === 'function') {
          setSelectedProjectFoldersLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    companyId,
    selectedProject?.id,
    selectedProject?.path,
    selectedProject?.projectPath,
    selectedProject?.sharePointPath,
    projectPhaseKey,
    setSelectedProjectFolders,
    setSelectedProjectFoldersLoading,
  ]);
}

export default useHomeProjectFolders;
