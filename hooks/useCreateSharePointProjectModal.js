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
import { Alert, Platform } from 'react-native';

import { ensureDefaultProjectOrganisationGroup, fetchCompanyProfile, fetchCompanyProject, fetchCompanySharePointSiteMetas, formatSharePointProjectFolderName, hasDuplicateProjectNumber, saveSharePointProjectMetadata, syncSharePointSiteVisibilityRemote, updateSharePointProjectPropertiesFromFirestoreProject, upsertCompanyProject } from '../components/firebase';

export function useCreateSharePointProjectModal({ companyId }) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);

  // Hämta SharePoint-ytor för företaget baserat på Digitalkontrolls metadata:
  // - Endast role === "projects" får användas för projekt
  // - Best-effort: trigga server-side sync så legacy bolag får metadata utan manuella steg
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      if (!companyId) {
        setAvailableSites([]);
        return;
      }

      try {
        try {
          await syncSharePointSiteVisibilityRemote({ companyId });
        } catch (_e) {}

        const metas = await fetchCompanySharePointSiteMetas(companyId);
        if (cancelled) return;

        const normalizeRole = (role) => {
          const r = String(role || '').trim().toLowerCase();
          if (!r) return null;
          if (r === 'projects' || r === 'project' || r === 'project-root' || r === 'project_root' || r === 'projectroot') return 'projects';
          if (r === 'system' || r === 'system-base' || r === 'system_base' || r === 'systembase') return 'system';
          return r;
        };

        const sites = (metas || [])
          .filter((m) => m && m.visibleInLeftPanel === true && normalizeRole(m.role) === 'projects')
          .map((m) => ({
            id: String(m.siteId || m.id || '').trim(),
            name: String(m.siteName || m.siteUrl || m.webUrl || 'SharePoint-site'),
            type: 'meta',
            webUrl: m.siteUrl || m.webUrl || null,
          }))
          .filter((s) => !!s.id);

        sites.sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), undefined, { sensitivity: 'base' }));
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
      const pnTrim = String(projectNumber || '').trim();

      // Statuskontroll: om projektet redan är arkiverat får det inte återskapas via UI.
      try {
        const existing = await fetchCompanyProject(companyId, pnTrim);
        const existingStatus = String(existing?.status || '').trim().toLowerCase();
        if (existing && existingStatus === 'archived') {
          const text = 'Detta projekt är arkiverat. Återställning kan endast göras av superadmin.';
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.alert(text); } catch (_e) {}
          } else {
            try { Alert.alert('Projekt arkiverat', text); } catch (_e) {}
          }
          return;
        }
      } catch (_e) {
        // Non-fatal: if we can't check, continue with creation.
      }

      // KRITISK: Projektnummer måste vara unikt per företag.
      // Blockera innan vi skapar SharePoint-mappar eller skriver till Firestore.
      try {
        const dup = await hasDuplicateProjectNumber(companyId, pnTrim);
        if (dup) {
          const text = `Det finns redan ett projekt med projektnummer ${pnTrim}. Projektnummer måste vara unikt.`;
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.alert(text); } catch (_e) {}
          } else {
            try { Alert.alert('Fel', text); } catch (_e) {}
          }
          return;
        }
      } catch (e) {
        const text = 'Kunde inte kontrollera om projektnumret är unikt. Försök igen.';
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          try { window.alert(text); } catch (_e) {}
        } else {
          try { Alert.alert('Fel', text); } catch (_e) {}
        }
        return;
      }

      // eslint-disable-next-line no-console
      console.log('[useCreateSharePointProjectModal] Starting project creation with payload:', {
        projectNumber,
        projectName,
        siteId,
        structureType,
        systemPhase,
        parentFolderPath,
      });
      
      const { ensureFolderPath, ensureKalkylskedeProjectFolderStructure } = await import('../services/azure/fileService');

      // Create project folder name: "{projektnummer} – {projektnamn}"
      const projectFolderName = formatSharePointProjectFolderName(projectNumber, projectName);
      if (!projectFolderName) throw new Error('Ogiltigt projektnamn');
      
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
      
      await ensureFolderPath(projectPath, companyId, siteId, { siteRole: 'projects' });
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] ✅ Project folder created: ${projectPath}`);

      // Firestore is source of truth for project list.
      // Persist a strong Firestore ↔ SharePoint linkage on the project doc.
      try {
        const selectedSite = (availableSites || []).find((s) => String(s?.id || '').trim() === String(siteId || '').trim()) || null;
        const siteUrl = selectedSite?.webUrl || selectedSite?.siteUrl || selectedSite?.url || null;

        const initialPhaseKey =
          systemPhase === 'produktion'
            ? 'produktion'
            : systemPhase === 'avslut'
            ? 'avslut'
            : systemPhase === 'eftermarknad'
            ? 'eftermarknad'
            : (systemPhase === 'kalkyl' || systemPhase === 'kalkylskede')
            ? 'kalkylskede'
            : 'kalkylskede';

        await upsertCompanyProject(companyId, String(projectNumber), {
          projectNumber: String(projectNumber),
          projectName: String(projectName),
          fullName: projectFolderName,
          status: 'active',
          sharePointSiteId: String(siteId),
          sharePointSiteUrl: siteUrl ? String(siteUrl) : null,
          rootFolderPath: String(projectPath),
          siteRole: 'projects',

          // Versioned default structure:
          // v2 => Kalkyl late (between Möten and Anbud). Existing projects remain v1.
          ...(initialPhaseKey === 'kalkylskede' ? { kalkylskedeStructureVersion: 'v2' } : {}),
        });
      } catch (projErr) {
        // Non-fatal: SharePoint folder was created, but project won't appear in left panel until Firestore write succeeds.
        // eslint-disable-next-line no-console
        console.warn('[useCreateSharePointProjectModal] Warning saving Firestore project doc:', projErr?.message || projErr);
      }

      // Ensure project has a default internal main group under "Organisation och roller".
      // Best-effort and non-blocking: project creation should not fail because this init fails.
      try {
        const profile = await fetchCompanyProfile(companyId);
        const companyName = String(profile?.companyName || profile?.name || companyId).trim();
        await ensureDefaultProjectOrganisationGroup(companyId, String(projectNumber), { companyName });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useCreateSharePointProjectModal] Warning ensuring default organisation group:', e?.message || e);
      }

      // Persist metadata for phase/structure so UI can show the correct indicator
      try {
        const phaseKeyForMeta =
          structureType === 'system' && systemPhase
            ? String(systemPhase || '').trim() || 'kalkylskede'
            : 'free';
        await saveSharePointProjectMetadata(companyId, {
          siteId,
          projectPath,
          projectNumber: String(projectNumber),
          projectName: String(projectName),
          phaseKey: phaseKeyForMeta,
          structureType: String(structureType || '').trim() || null,
          ...(phaseKeyForMeta === 'kalkylskede' ? { structureVersion: 'v2' } : {}),
        });
      } catch (metaError) {
        // eslint-disable-next-line no-console
        console.warn('[useCreateSharePointProjectModal] Warning saving project metadata:', metaError?.message || metaError);
      }

      // Update SharePoint folder properties for Office Quick Parts / Document Properties.
      // Best-effort and non-blocking: no files are rewritten.
      try {
        await updateSharePointProjectPropertiesFromFirestoreProject(companyId, {
          sharePointSiteId: String(siteId),
          rootFolderPath: String(projectPath),
          projectNumber: String(projectNumber),
          projectName: String(projectName),
          fullName: projectFolderName,
        });
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useCreateSharePointProjectModal] Warning updating SharePoint project properties:', e?.message || e);
      }

      // Apply system structure inside the project folder.
      // This must complete before closing modal to ensure structure is created.
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
      
      if ((structureType === 'system' && systemPhase) || systemPhase === 'kalkyl' || systemPhase === 'kalkylskede') {
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
        try {
          // eslint-disable-next-line no-console
          console.log(`[useCreateSharePointProjectModal] ===== STARTING STRUCTURE CREATION =====`);
          // eslint-disable-next-line no-console
          console.log(`[useCreateSharePointProjectModal] phaseKey: "${phaseKey}", projectPath: "${projectPath}"`);

          // Locked structure for Kalkylskede: always ensure the full fixed structure.
          if (phaseKey === 'kalkylskede') {
            // New structure (v2): Kalkyl is late (between Möten and Anbud).
            // IMPORTANT: Do not change folder prefixes without mirroring UI ordering.
            await ensureKalkylskedeProjectFolderStructure(projectPath, companyId, siteId, 'v2');
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] ✅ Ensured locked kalkylskede structure`);
            // eslint-disable-next-line no-console
            console.log(`[useCreateSharePointProjectModal] ===== STRUCTURE CREATION COMPLETE =====`);
            setVisible(false);
            return;
          }

          const { getDefaultNavigation } = await import('../features/project-phases/constants');
          const navigation = getDefaultNavigation(phaseKey);
          if (!navigation || !Array.isArray(navigation.sections)) {
            throw new Error('Navigation structure not found');
          }

          // eslint-disable-next-line no-console
          console.log(`[useCreateSharePointProjectModal] ✅ Navigation loaded: ${navigation.sections.length} sections`);

          const sectionPromises = navigation.sections.map(async (section) => {
            const sectionFolderName = section.name;
            const sectionPath = `${projectPath}/${sectionFolderName}`;

            try {
              await ensureFolderPath(sectionPath, companyId, siteId, { siteRole: 'projects' });

              if (section.items && Array.isArray(section.items)) {
                const enabledItems = section.items.filter((item) => item && item.enabled !== false);
                const itemPromises = enabledItems.map(async (item) => {
                  const itemPath = `${sectionPath}/${item.name}`;
                  try {
                    await ensureFolderPath(itemPath, companyId, siteId, { siteRole: 'projects' });
                  } catch (itemError) {
                    // eslint-disable-next-line no-console
                    console.error(`[useCreateSharePointProjectModal] Error creating item folder ${itemPath}:`, itemError?.message || itemError);
                  }
                });
                await Promise.allSettled(itemPromises);
              }
            } catch (sectionError) {
              // eslint-disable-next-line no-console
              console.error(`[useCreateSharePointProjectModal] Error creating section folder ${sectionPath}:`, sectionError);
            }
          });

          await Promise.allSettled(sectionPromises);
          const totalItems = navigation.sections.reduce((sum, s) => sum + (s.items?.filter((i) => i && i.enabled !== false).length || 0), 0);
          // eslint-disable-next-line no-console
          console.log(`[useCreateSharePointProjectModal] ✅ Created structure: ${navigation.sections.length} sections, ${totalItems} items`);
        } catch (error) {
          // eslint-disable-next-line no-console
          console.error(`[useCreateSharePointProjectModal] Could not create structure for phase ${phaseKey}:`, error);
          // Fallback to standard subfolders
          const standardSubfolders = ['Documents', 'Drawings', 'Meetings', 'Controls'];
          for (const subfolder of standardSubfolders) {
            const subfolderPath = `${projectPath}/${subfolder}`;
            try {
              await ensureFolderPath(subfolderPath, companyId, siteId, { siteRole: 'projects' });
            } catch (subfolderError) {
              // eslint-disable-next-line no-console
              console.warn(`[useCreateSharePointProjectModal] Warning creating subfolder ${subfolderPath}:`, subfolderError);
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
