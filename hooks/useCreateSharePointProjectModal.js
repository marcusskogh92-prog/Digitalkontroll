/**
 * useCreateSharePointProjectModal
 *
 * Hook som kapslar all state/hantering för CreateProjectModal.
 *
 * Ansvar:
 * - Håller koll på om modalen är öppen/stängd
 * - Tillhandahåller lista över tillgängliga SharePoint-ytor (sites)
 * - Exponerar callback för att skapa projekt i SharePoint (placeholder nu)
 *
 * Viktigt:
 * - Ingen UI-logik här, bara state + callbacks
 * - Kan senare kopplas mot riktiga SharePoint-tjänster (Graph API)
 */

import { useCallback, useEffect, useState } from 'react';

import { getSharePointNavigationConfig } from '../components/firebase';

export function useCreateSharePointProjectModal({ companyId }) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);

  // Hämta SharePoint-ytor för företaget baserat på adminens navigation:
  // - Använder samma konfiguration som vänsterpanelen (sharepoint_navigation/config)
  // - Bygger sitelistan direkt från konfigurerade siter (navConfig.sites)
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      if (!companyId) {
        setAvailableSites([]);
        return;
      }

      try {
        const navConfig = await getSharePointNavigationConfig(companyId);

          if (cancelled) return;

          const enabledSites = Array.isArray(navConfig?.enabledSites)
            ? navConfig.enabledSites
            : [];

          const sitesFromConfig = Array.isArray(navConfig?.sites)
            ? navConfig.sites
            : [];

          const enabledSet = new Set(enabledSites.map((id) => String(id || '').trim()).filter(Boolean));

          const sites = sitesFromConfig
            .filter((site) => {
              const sid = String(site?.siteId || site?.id || '').trim();
              return !!sid && enabledSet.has(sid);
            })
            .map((site) => ({
              id: String(site.siteId || site.id).trim(),
              name: site.siteName || site.displayName || site.name || site.webUrl || 'SharePoint-site',
              type: 'navigation',
              webUrl: site.webUrl || null,
            }));

          // Om inget är aktiverat ännu – visa ingen lista (admin måste konfigurera i SharePoint Navigation)
          setAvailableSites(sites);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[useCreateSharePointProjectModal] Error loading sites:', error);
        setAvailableSites([]);
      }
    }

    loadSites();

    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const openModal = useCallback(() => {
    setVisible(true);
  }, []);

  const closeModal = useCallback(() => {
    if (isCreating) return;
    setVisible(false);
  }, [isCreating]);

  const handleCreateProject = useCallback(async (payload) => {
    if (!payload || isCreating) return;

    const {
      projectNumber,
      projectName,
      siteId,
      structureType,
      systemPhase,
      parentFolderPath,
      parentFolderName,
    } = payload;

    if (!companyId || !projectNumber || !projectName || !siteId || parentFolderPath === undefined || parentFolderPath === null) {
      // eslint-disable-next-line no-console
      console.warn('[useCreateSharePointProjectModal] Missing required fields for project creation', {
        companyId,
        projectNumber,
        projectName,
        siteId,
        parentFolderPath,
      });
      return;
    }

    setIsCreating(true);
    try {
      // eslint-disable-next-line no-console
      console.log('[useCreateSharePointProjectModal] Starting project creation with payload:', {
        projectNumber,
        projectName,
        siteId,
        structureType,
        systemPhase,
        parentFolderPath,
      });
      
      const { ensureFolderPath } = await import('../services/azure/fileService');
      
      // Create project folder name: "{projectNumber} {projectName}"
      const projectFolderName = `${String(projectNumber)} ${String(projectName)}`;
      
      // Build project path: parentFolderPath/projectFolderName
      const basePath = parentFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
      const projectPath = basePath ? `${basePath}/${projectFolderName}` : projectFolderName;
      
      // Create the project folder first (critical path)
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] ===== CREATING PROJECT FOLDER =====`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] Project path: "${projectPath}"`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] Site ID: "${siteId}"`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] Company ID: "${companyId}"`);
      
      await ensureFolderPath(projectPath, companyId, siteId);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] ✅ Project folder created: ${projectPath}`);

      // Apply system structure inside the project folder if structureType is 'system'
      // This must complete before closing modal to ensure structure is created
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] ===== STRUCTURE CHECK =====`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] structureType: "${structureType}" (type: ${typeof structureType})`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] systemPhase: "${systemPhase}" (type: ${typeof systemPhase})`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] structureType === 'system': ${structureType === 'system'}`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] systemPhase is truthy: ${!!systemPhase}`);
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] Will create structure: ${structureType === 'system' && systemPhase ? 'YES' : 'NO'}`);
      
      if (structureType === 'system' && systemPhase) {
        // eslint-disable-next-line no-console
        console.log(`[useCreateSharePointProjectModal] ===== ENTERING STRUCTURE CREATION BLOCK =====`);
        // Map structure values to phase keys (handle both 'kalkyl' and 'kalkylskede')
        const phaseKey =
          systemPhase === 'produktion'
            ? 'produktion'
            : systemPhase === 'avslut'
            ? 'avslut'
            : systemPhase === 'eftermarknad'
            ? 'eftermarknad'
            : (systemPhase === 'kalkyl' || systemPhase === 'kalkylskede')
            ? 'kalkylskede'
            : 'kalkylskede'; // Default to kalkylskede
        
        // eslint-disable-next-line no-console
        console.log(`[useCreateSharePointProjectModal] Mapped phaseKey: "${phaseKey}"`);

        // Create phase-specific structure inside the project folder
        if (phaseKey === 'kalkylskede') {
          // eslint-disable-next-line no-console
          console.log('[useCreateSharePointProjectModal] ===== STARTING KALKYLSKEDE STRUCTURE CREATION =====');
          // eslint-disable-next-line no-console
          console.log(`[useCreateSharePointProjectModal] phaseKey: "${phaseKey}", projectPath: "${projectPath}"`);
          try {
            // eslint-disable-next-line no-console
            console.log('[useCreateSharePointProjectModal] Loading kalkylskede navigation structure...');
            const { getDefaultNavigation } = await import('../features/project-phases/constants');
            const navigation = getDefaultNavigation('kalkylskede');
            
            if (!navigation || !navigation.sections) {
              throw new Error('Navigation structure not found');
            }
            
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] ✅ Navigation loaded: ${navigation.sections.length} sections`);
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] Creating ${navigation.sections.length} sections with items...`);
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] Project path: ${projectPath}, siteId: ${siteId}, companyId: ${companyId}`);
            
            // Create all section folders (huvudmappar) in parallel for speed
            const sectionPromises = navigation.sections.map(async (section) => {
              // Use section name as-is (includes number prefix like "01 - Översikt")
              const sectionFolderName = section.name;
              const sectionPath = `${projectPath}/${sectionFolderName}`;
              
              try {
                // eslint-disable-next-line no-console
                console.log(`[useCreateSharePointProjectModal] Creating section: ${sectionFolderName} at path: ${sectionPath} (siteId: ${siteId})`);
                // Create the section folder (huvudmapp)
                await ensureFolderPath(sectionPath, companyId, siteId);
                // eslint-disable-next-line no-console
                console.log(`[useCreateSharePointProjectModal] ✅ Section folder created: ${sectionFolderName}`);
                
                // Create all items (undermappar) inside this section in parallel
                if (section.items && Array.isArray(section.items)) {
                  const enabledItems = section.items.filter(item => item.enabled !== false);
                  // eslint-disable-next-line no-console
                  console.log(`[useCreateSharePointProjectModal] Creating ${enabledItems.length} items in ${sectionFolderName}`);
                  
                  const itemPromises = enabledItems.map(async (item) => {
                    const itemPath = `${sectionPath}/${item.name}`;
                    try {
                      // eslint-disable-next-line no-console
                      console.log(`[useCreateSharePointProjectModal] Creating item: ${item.name} at path: ${itemPath}`);
                      await ensureFolderPath(itemPath, companyId, siteId);
                      // eslint-disable-next-line no-console
                      console.log(`[useCreateSharePointProjectModal] ✅ Item folder created: ${item.name}`);
                    } catch (itemError) {
                      // eslint-disable-next-line no-console
                      console.error(`[useCreateSharePointProjectModal] Error creating item folder ${itemPath}:`, itemError?.message || itemError);
                      // Don't throw - continue with other items
                    }
                  });
                  
                  // Wait for all items in this section to be created
                  const itemResults = await Promise.allSettled(itemPromises);
                  const failedItems = itemResults.filter(r => r.status === 'rejected');
                  if (failedItems.length > 0) {
                    // eslint-disable-next-line no-console
                    console.warn(`[useCreateSharePointProjectModal] ${failedItems.length} items failed in ${sectionFolderName}`);
                  }
                }
              } catch (sectionError) {
                // eslint-disable-next-line no-console
                console.error(`[useCreateSharePointProjectModal] Error creating section folder ${sectionPath}:`, sectionError);
                // Don't throw - continue with other sections
              }
            });
            
            // Wait for all sections to be created (in parallel)
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] Waiting for ${sectionPromises.length} sections to complete...`);
            const sectionResults = await Promise.allSettled(sectionPromises);
            const failedSections = sectionResults.filter(r => r.status === 'rejected');
            const successfulSections = sectionResults.filter(r => r.status === 'fulfilled');
            
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] Section creation complete: ${successfulSections.length} succeeded, ${failedSections.length} failed`);
            
            if (failedSections.length > 0) {
              // eslint-disable-next-line no-console
              console.warn(`[useCreateSharePointProjectModal] ${failedSections.length} sections failed to create:`, failedSections.map(r => r.reason?.message || r.reason));
            }
            
            // Log detailed results for each section
            sectionResults.forEach((result, index) => {
              if (result.status === 'rejected') {
                // eslint-disable-next-line no-console
                console.error(`[useCreateSharePointProjectModal] Section ${index + 1} failed:`, result.reason);
              } else {
                // eslint-disable-next-line no-console
                console.log(`[useCreateSharePointProjectModal] Section ${index + 1} succeeded`);
              }
            });
            
            const totalItems = navigation.sections.reduce((sum, s) => sum + (s.items?.filter(i => i.enabled !== false).length || 0), 0);
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] ✅ Created kalkylskede structure: ${navigation.sections.length} sections, ${totalItems} items`);
          } catch (error) {
            // eslint-disable-next-line no-console
            console.error(`[useCreateSharePointProjectModal] Could not create kalkylskede structure:`, error);
            // eslint-disable-next-line no-console
            console.error('[useCreateSharePointProjectModal] Error details:', error.message, error.stack);
            // Fallback to standard subfolders
            // eslint-disable-next-line no-console
            console.log('[useCreateSharePointProjectModal] Falling back to standard subfolders');
            const standardSubfolders = ['Documents', 'Drawings', 'Meetings', 'Controls'];
            for (const subfolder of standardSubfolders) {
              const subfolderPath = `${projectPath}/${subfolder}`;
              try {
                await ensureFolderPath(subfolderPath, companyId, siteId);
              } catch (subfolderError) {
                // eslint-disable-next-line no-console
                console.warn(`[useCreateSharePointProjectModal] Warning creating subfolder ${subfolderPath}:`, subfolderError);
              }
            }
          }
        } else {
          // For other phases, create standard subfolders
          const standardSubfolders = ['Documents', 'Drawings', 'Meetings', 'Controls'];
          for (const subfolder of standardSubfolders) {
            const subfolderPath = `${projectPath}/${subfolder}`;
            try {
              await ensureFolderPath(subfolderPath, companyId, siteId);
            } catch (error) {
              // eslint-disable-next-line no-console
              console.warn(`[useCreateSharePointProjectModal] Warning creating subfolder ${subfolderPath}:`, error);
            }
          }
        }
      } else {
        // eslint-disable-next-line no-console
        console.log(`[useCreateSharePointProjectModal] ===== SKIPPING STRUCTURE CREATION =====`);
        // eslint-disable-next-line no-console
        console.log(`[useCreateSharePointProjectModal] Reason: structureType=${structureType}, systemPhase=${systemPhase}`);
        // eslint-disable-next-line no-console
        console.log(`[useCreateSharePointProjectModal] Condition check: structureType === 'system' = ${structureType === 'system'}, systemPhase is truthy = ${!!systemPhase}`);
      }

      // Project folder and structure created successfully - close modal
      // eslint-disable-next-line no-console
      console.log('[useCreateSharePointProjectModal] ✅ Project creation complete, closing modal');
      setVisible(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useCreateSharePointProjectModal] Error creating project', error);
      // Don't show alert - user already sees loading state, errors are logged
      // Modal will close and user can see if project was created in the tree
    } finally {
      setIsCreating(false);
    }
  }, [companyId, isCreating]);

  return {
    visible,
    isCreating,
    availableSites,
    openModal,
    closeModal,
    handleCreateProject,
  };
}

export default useCreateSharePointProjectModal;
