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
}) {
  React.useEffect(() => {
    if (!selectedProject || !companyId || !projectPhaseKey) {
      setSelectedProjectFolders([]);
      return;
    }

    // Ladda inte mappar för kalkylskede-projekt
    if (projectPhaseKey === 'kalkylskede') {
      setSelectedProjectFolders([]);
      return;
    }

    (async () => {
      try {
        const folders = await getProjectFolders(
          companyId,
          selectedProject.id,
          projectPhaseKey,
        );
        setSelectedProjectFolders(folders);
      } catch (error) {
        console.error('[useHomeProjectFolders] Error loading project folders:', error);
        setSelectedProjectFolders([]);
      }
    })();
  }, [companyId, selectedProject, projectPhaseKey, setSelectedProjectFolders]);
}

export default useHomeProjectFolders;
