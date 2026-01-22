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
import { Platform } from 'react-native';

import { fetchCompanyProfile, getAllPhaseSharePointConfigs, getCompanySharePointSiteId } from '../components/firebase';

export function useCreateSharePointProjectModal({ companyId }) {
  const [visible, setVisible] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [availableSites, setAvailableSites] = useState([]);

  // Hämta verkliga SharePoint-ytor för företaget:
  // - Primär site från company profile
  // - Eventuella externa sites per fas (kalkyl, produktion, osv.)
  useEffect(() => {
    let cancelled = false;

    async function loadSites() {
      if (!companyId) {
        setAvailableSites([]);
        return;
      }

      try {
        const [primarySiteId, profile, phaseConfigs] = await Promise.all([
          getCompanySharePointSiteId(companyId),
          fetchCompanyProfile(companyId),
          getAllPhaseSharePointConfigs(companyId),
        ]);

        if (cancelled) return;

        const sites = [];

        if (primarySiteId) {
          sites.push({
            id: primarySiteId,
            name:
              profile?.sharePointSiteName ||
              profile?.sharePointWebUrl ||
              'Primär SharePoint-site',
            type: 'primary',
            webUrl: profile?.sharePointWebUrl || null,
          });
        }

        if (phaseConfigs && typeof phaseConfigs === 'object') {
          Object.keys(phaseConfigs).forEach((phaseKey) => {
            const cfg = phaseConfigs[phaseKey];
            if (!cfg || !cfg.siteId) return;

            sites.push({
              id: cfg.siteId,
              name:
                cfg.siteName ||
                cfg.webUrl ||
                `Extern site (${phaseKey})`,
              type: 'phase',
              phaseKey: cfg.phaseKey || phaseKey,
              webUrl: cfg.webUrl || null,
            });
          });
        }

        // Fallback om inget är konfigurerat ännu – visa en enkel "standardyta"
        if (sites.length === 0) {
          const name = String(companyId || '').trim() || 'Standardyta';
          sites.push({ id: name, name, type: 'placeholder' });
        }

        setAvailableSites(sites);
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('[useCreateSharePointProjectModal] Failed to load SharePoint sites', error);
        if (cancelled) return;
        const name = String(companyId || '').trim() || 'Standardyta';
        setAvailableSites([{ id: name, name, type: 'placeholder' }]);
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
    } = payload;

    if (!companyId || !projectNumber || !projectName || !siteId) {
      // eslint-disable-next-line no-console
      console.warn('[useCreateSharePointProjectModal] Missing required fields for project creation', {
        companyId,
        projectNumber,
        projectName,
        siteId,
      });
      return;
    }

    setIsCreating(true);
    try {
      const phaseKey =
        structureType === 'system'
          ? systemPhase === 'produktion'
            ? 'produktion'
            : systemPhase === 'avslut'
            ? 'avslut'
            : systemPhase === 'eftermarknad'
            ? 'eftermarknad'
            : 'kalkylskede'
          : null;

      if (structureType === 'system' && phaseKey) {
        const { ensureProjectStructure } = await import('../services/azure/fileService');

        // Om användaren har valt en mapp (t.ex. "Anbud"), använd den som mainFolder
        // och ev. nästa segment som subFolder.
        let mainFolder = null;
        let subFolder = null;
        if (parentFolderPath && typeof parentFolderPath === 'string') {
          const cleaned = parentFolderPath.replace(/^\/+/, '').replace(/\/+$/, '');
          const segments = cleaned.split('/');
          // Ta bort ev. "Projects"-prefix
          if (segments[0] && segments[0].toLowerCase() === 'projects') {
            segments.shift();
          }
          if (segments.length >= 1) mainFolder = segments[0];
          if (segments.length >= 2) subFolder = segments[1];
        }

        await ensureProjectStructure(
          companyId,
          String(projectNumber),
          String(projectName),
          phaseKey,
          mainFolder,
          subFolder,
          siteId,
        );
      } else {
        // Fri mappstruktur: skapa bara en enkel projektmapp utan systemstruktur
        const { ensureFolderPath } = await import('../services/azure/fileService');
        const safeProjectName = `${String(projectNumber)}-${String(projectName)}`;
        const basePathRaw = parentFolderPath && typeof parentFolderPath === 'string'
          ? parentFolderPath
          : 'Projects/Fristående';
        const basePath = basePathRaw.replace(/^\/+/, '').replace(/\/+$/, '');
        const projectPath = `${basePath}/${safeProjectName}`;
        await ensureFolderPath(projectPath, companyId, siteId);
      }

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          const typeLabel =
            structureType === 'system'
              ? 'Digitalkontroll systemstruktur'
              : 'Valfri mappstruktur';
          // eslint-disable-next-line no-alert
          window.alert(
            `Projektet "${projectNumber} – ${projectName}" skapades i SharePoint.\n\nSite: ${siteId}\nStruktur: ${typeLabel}`,
          );
        } catch (_e) {}
      }

      setVisible(false);
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[useCreateSharePointProjectModal] Error creating project', error);
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        try {
          // eslint-disable-next-line no-alert
          window.alert('Kunde inte skapa projektmapp i SharePoint. Se logg för detaljer.');
        } catch (_e) {}
      }
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
