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

import { ensureDefaultProjectOrganisationGroup, fetchCompanyProfile, fetchCompanyProject, fetchCompanySharePointSiteMetas, getCompanySharePointSiteIdByRole, formatSharePointProjectFolderName, hasDuplicateProjectNumber, saveSharePointProjectMetadata, syncSharePointSiteVisibilityRemote, updateSharePointProjectPropertiesFromFirestoreProject, upsertCompanyProject } from '../components/firebase';
import { seedProjectChecklistFromTemplate } from '../features/checklist/checklistService';
import { normalizeSiteIdForGraph } from '../services/azure/graphSiteId';

export function useCreateSharePointProjectModal({ companyId }) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);

  // Hämta SharePoint-ytor för företaget – samma logik som vänsterpanelen, men DK Bas (system) ska aldrig visas.
  // Endast role "projects" eller "custom" (Extra); system-site är alltid dold och låst för projektskapande.
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

        const [metas, systemSiteId] = await Promise.all([
          fetchCompanySharePointSiteMetas(companyId),
          getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: false }).catch(() => null),
        ]);
        if (cancelled) return;

        const normalizeRole = (role) => {
          const r = String(role || '').trim().toLowerCase();
          if (!r) return null;
          if (r === 'projects' || r === 'project' || r === 'project-root' || r === 'project_root' || r === 'projectroot') return 'projects';
          if (r === 'system' || r === 'system-base' || r === 'system_base' || r === 'systembase') return 'system';
          if (r === 'custom' || r === 'extra') return 'custom';
          return r;
        };

        const canShowInProjectPicker = (m) => {
          const role = normalizeRole(m?.role);
          if (role === 'system') return false;
          return (role === 'projects' || role === 'custom') && m?.visibleInLeftPanel === true;
        };

        const systemId = systemSiteId ? String(systemSiteId).trim() : null;

        const isDkBas = (nameOrMeta) => {
          const name = typeof nameOrMeta === 'string'
            ? nameOrMeta
            : String(nameOrMeta?.siteName || nameOrMeta?.name || nameOrMeta?.siteUrl || '').trim();
          return /dk\s*bas/i.test(name);
        };

        const normalizedSystemId = systemId ? normalizeSiteIdForGraph(systemId) : null;
        const sites = (metas || [])
          .filter((m) => m && canShowInProjectPicker(m))
          .filter((m) => {
            const id = String(m.siteId || m.id || '').trim();
            return id && normalizeSiteIdForGraph(id) !== normalizedSystemId;
          })
          .filter((m) => !isDkBas(m))
          .map((m) => {
            const rawId = String(m.siteId || m.id || '').trim();
            const role = normalizeRole(m?.role);
            return {
              id: normalizeSiteIdForGraph(rawId),
              name: String(m.siteName || m.siteUrl || m.webUrl || 'SharePoint-site'),
              type: 'meta',
              webUrl: m.siteUrl || m.webUrl || null,
              isCompanyTenant: role === 'custom' || role === 'extra',
            };
          })
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
      
      const { ensureFolderPath, ensureKalkylskedeProjectFolderStructure, getDriveItemByPath } = await import('../services/azure/fileService');

      // För company-tenant (t.ex. Wilzéns Anbud): använd tenant-token så mappar skapas på kundens SharePoint
      const selectedSite = (availableSites || []).find((s) => String(s?.id || '').trim() === String(siteId || '').trim()) || null;
      let tenantToken = null;
      if (selectedSite?.isCompanyTenant && companyId) {
        try {
          const { fetchCompanyProfile } = await import('../components/firebase');
          const { getAccessTokenForTenant } = await import('../services/azure/authService');
          const profile = await fetchCompanyProfile(companyId);
          const azureTenantId = (profile && profile.azureTenantId) ? String(profile.azureTenantId).trim() : '';
          if (azureTenantId) tenantToken = await getAccessTokenForTenant(azureTenantId, companyId);
          if (!tenantToken) {
            const msg = 'Kunde inte hämta åtkomst till företagets SharePoint. Kontrollera att företagets Azure-tenant är konfigurerad i Företagsinställningar.';
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              try { window.alert(msg); } catch (_e) {}
            } else {
              try { Alert.alert('SharePoint-åtkomst', msg); } catch (_e) {}
            }
            throw new Error(msg);
          }
        } catch (e) {
          if (e?.message?.includes('Azure-tenant')) throw e;
          // eslint-disable-next-line no-console
          console.warn('[useCreateSharePointProjectModal] Tenant token for project creation:', e?.message || e);
          const msg = 'Kunde inte ansluta till företagets SharePoint. Försök igen eller kontakta support.';
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            try { window.alert(msg); } catch (_e) {}
          } else {
            try { Alert.alert('SharePoint-fel', msg); } catch (_e) {}
          }
          throw e;
        }
      }

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
      
      await ensureFolderPath(projectPath, companyId, siteId, { siteRole: 'projects', accessTokenOverride: tenantToken || undefined, strict: true });
      // eslint-disable-next-line no-console
      console.log(`[useCreateSharePointProjectModal] ✅ Project folder created: ${projectPath}`);

      // Resolve stable IDs (driveId + folderId) for robust ID-based deletes.
      let projectFolderId = null;
      let projectDriveId = null;
      try {
        const item = await getDriveItemByPath(projectPath, siteId, tenantToken || undefined);
        projectFolderId = item?.id || null;
        projectDriveId = item?.parentReference?.driveId || null;
      } catch (_e) {
        projectFolderId = null;
        projectDriveId = null;
      }

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

          // Robust linkage for ID-based delete
          ...(projectFolderId ? { sharePointFolderId: String(projectFolderId) } : {}),
          ...(projectDriveId ? { sharePointDriveId: String(projectDriveId) } : {}),

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

      // Seed checklist from system template when project is in Kalkylskede (Anbud).
      try {
        await seedProjectChecklistFromTemplate(companyId, String(projectNumber), 'kalkylskede');
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn('[useCreateSharePointProjectModal] Warning seeding project checklist:', e?.message || e);
      }

      // Persist metadata for phase/structure so UI can show the correct indicator
      const phaseKeyForMeta =
        structureType === 'system' && systemPhase
          ? String(systemPhase || '').trim() || 'kalkylskede'
          : 'free';
      const phaseKey =
        systemPhase === 'produktion'
          ? 'produktion'
          : systemPhase === 'avslut'
            ? 'avslut'
            : systemPhase === 'eftermarknad'
              ? 'eftermarknad'
              : systemPhase === 'kalkyl' || systemPhase === 'kalkylskede'
                ? 'kalkylskede'
                : 'kalkylskede';

      try {
        await saveSharePointProjectMetadata(companyId, {
          siteId,
          projectPath,
          ...(projectFolderId ? { folderId: String(projectFolderId) } : {}),
          ...(projectDriveId ? { driveId: String(projectDriveId) } : {}),
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

      // När användaren valt Kalkylskede: skapa mappstruktur och kopiera checklista-Excel från företagets mall
      // direkt här så filen finns när projektet öppnas (annars måste användaren klicka "Skapa checklista från företagets mall").
      const needsStructure = (structureType === 'system' && systemPhase) || systemPhase === 'kalkyl' || systemPhase === 'kalkylskede';
      if (needsStructure && phaseKey === 'kalkylskede') {
        try {
          await ensureKalkylskedeProjectFolderStructure(projectPath, companyId, siteId, 'v2', tenantToken || undefined);
          const { copyChecklistMallToProject } = await import('../lib/mallarDkBasService');
          await copyChecklistMallToProject(companyId, siteId, projectPath);
          // eslint-disable-next-line no-console
          console.log('[useCreateSharePointProjectModal] Checklista Excel från företagets mall skapad i projektet');
        } catch (excelErr) {
          // Företaget kan sakna aktiv mall eller DK Bas – blockera inte projektcreation.
          // eslint-disable-next-line no-console
          console.warn('[useCreateSharePointProjectModal] Checklista-mall kunde inte kopieras (användaren kan skapa från mall manuellt):', excelErr?.message || excelErr);
        }
      }

      // Stäng modalen när projektet finns i Firestore och (vid Kalkylskede) checklista-Excel är skapad.
      // eslint-disable-next-line no-console
      console.log('[useCreateSharePointProjectModal] ✅ Project saved, closing modal (structure continues in background)');
      setVisible(false);
      setIsCreating(false);

      // Bakgrund: uppdatera SharePoint-egenskaper och skapa mappstruktur (01 - Översikt, etc.)
      const runInBackground = async () => {
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
          console.warn('[useCreateSharePointProjectModal] Background: warning updating SharePoint project properties:', e?.message || e);
        }

        const needsStructure = (structureType === 'system' && systemPhase) || systemPhase === 'kalkyl' || systemPhase === 'kalkylskede';
        if (!needsStructure) return;

        const phaseKey =
          systemPhase === 'produktion'
            ? 'produktion'
            : systemPhase === 'avslut'
            ? 'avslut'
            : systemPhase === 'eftermarknad'
            ? 'eftermarknad'
            : (systemPhase === 'kalkyl' || systemPhase === 'kalkylskede')
            ? 'kalkylskede'
            : 'kalkylskede';

        try {
          if (phaseKey === 'kalkylskede') {
            await ensureKalkylskedeProjectFolderStructure(projectPath, companyId, siteId, 'v2', tenantToken || undefined);
            try {
              const { copyChecklistMallToProject } = await import('../lib/mallarDkBasService');
              await copyChecklistMallToProject(companyId, siteId, projectPath);
              // eslint-disable-next-line no-console
              console.log('[useCreateSharePointProjectModal] Background: checklista Excel-mall kopierad till projekt');
            } catch (excelErr) {
              // eslint-disable-next-line no-console
              console.warn('[useCreateSharePointProjectModal] Background: kopiera checklista-mall (Excel) till projekt:', excelErr?.message || excelErr);
            }
            try {
              await seedProjectChecklistFromTemplate(companyId, String(projectNumber), 'kalkylskede');
            } catch (checklistErr) {
              // eslint-disable-next-line no-console
              console.warn('[useCreateSharePointProjectModal] Background: checklist seed warning', checklistErr?.message || checklistErr);
            }
            // eslint-disable-next-line no-console
            console.log('[useCreateSharePointProjectModal] Background: kalkylskede structure complete');
            return;
          }

          const { getDefaultNavigation } = await import('../features/project-phases/constants');
          const navigation = getDefaultNavigation(phaseKey);
          if (!navigation || !Array.isArray(navigation.sections)) return;

          for (const section of navigation.sections || []) {
            const sectionPath = `${projectPath}/${section.name}`;
            try {
              await ensureFolderPath(sectionPath, companyId, siteId, { siteRole: 'projects', accessTokenOverride: tenantToken || undefined });
              if (section.items && Array.isArray(section.items)) {
                const enabled = section.items.filter((i) => i && i.enabled !== false);
                for (const item of enabled) {
                  try {
                    await ensureFolderPath(`${sectionPath}/${item.name}`, companyId, siteId, { siteRole: 'projects', accessTokenOverride: tenantToken || undefined });
                  } catch (_itemErr) {}
                }
              }
            } catch (_sectionErr) {}
          }
        } catch (error) {
          // eslint-disable-next-line no-console
          console.warn('[useCreateSharePointProjectModal] Background: structure creation failed:', error?.message || error);
        }
      };
      runInBackground();
      return;
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
