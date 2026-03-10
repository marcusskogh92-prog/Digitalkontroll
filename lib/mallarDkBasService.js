/**
 * Mallar (templates) i DK Bas – lista, ladda upp, flytta till arkiv.
 * Använder befintlig struktur: Företagsmallar/01 - Kalkylskede/Översikt/Checklista (och .../Arkiv).
 */

import {
  getCompanySharePointSiteIdByRole,
  fetchCompanySharePointSiteMetas,
} from '../components/firebase';
import { getDriveItems, moveDriveItemByPath, renameDriveItemByPath, deleteDriveItemByPath, downloadDriveFileContent } from '../services/azure/hierarchyService';
import { ensureFolderPath, uploadFile as uploadFileToSharePoint } from '../services/azure/fileService';

/** Mappnamn per fas – samma som i DK Bas (01 - Kalkylskede osv). */
const PHASE_FOLDER_NAMES = {
  kalkylskede: '01 - Kalkylskede',
  produktion: '02 - Produktion',
  avslut: '03 - Avslutat',
  eftermarknad: '04 - Eftermarknad',
};

function getPhaseFolderName(phaseKey) {
  return PHASE_FOLDER_NAMES[String(phaseKey || '').toLowerCase()] || '01 - Kalkylskede';
}

/** Sökväg till aktiv checklista-mall (filer). */
export function getChecklistTemplateActivePath(phaseKey) {
  const phase = getPhaseFolderName(phaseKey);
  return `Företagsmallar/${phase}/Översikt/Checklista`;
}

/** Sökväg till arkiv (gamla versioner). */
export function getChecklistTemplateArchivePath(phaseKey) {
  return `${getChecklistTemplateActivePath(phaseKey)}/Arkiv`;
}

/**
 * Hämta DK Bas siteId för företaget.
 * Använder först roll "system"; om ingen finns, första site vars namn innehåller "DK Bas" (samma logik som i SharePoint-fliken).
 * @returns {Promise<string|null>}
 */
export async function getDkBasSiteId(companyId) {
  const cid = String(companyId || '').trim();
  if (!cid) return null;
  try {
    let siteId = await getCompanySharePointSiteIdByRole(cid, 'system', { syncIfMissing: true });
    if (siteId) return String(siteId).trim();
    const metas = await fetchCompanySharePointSiteMetas(cid).catch(() => []);
    const dkBas = (metas || []).find(
      (m) =>
        /dk\s*bas/i.test(String(m?.siteName || '')) ||
        /dk\s*bas/i.test(String(m?.siteUrl || ''))
    );
    siteId = dkBas ? String(dkBas.siteId || dkBas.id || '').trim() : null;
    return siteId || null;
  } catch (_e) {
    return null;
  }
}

/**
 * Säkerställ att mapparna för checklista-mall finns i DK Bas.
 */
export async function ensureChecklistTemplateFolders(companyId, phaseKey) {
  const siteId = await getDkBasSiteId(companyId);
  if (!siteId) throw new Error('Ingen DK Bas-site kopplad. Koppla DK Bas under Företagsinställningar → SharePoint.');

  const activePath = getChecklistTemplateActivePath(phaseKey);
  const archivePath = getChecklistTemplateArchivePath(phaseKey);

  await ensureFolderPath(activePath, companyId, siteId, { siteRole: 'system' });
  await ensureFolderPath(archivePath, companyId, siteId, { siteRole: 'system' });
}

/**
 * Lista mallar för checklista: aktiva (i Checklista) och arkiverade (i Checklista/Arkiv).
 * @returns {Promise<{ active: Array<{ name, id, webUrl, lastModified }>, archive: Array<...> }>}
 */
export async function listChecklistMallar(companyId, phaseKey) {
  const siteId = await getDkBasSiteId(companyId);
  if (!siteId) return { active: [], archive: [] };

  const activePath = getChecklistTemplateActivePath(phaseKey);
  const archivePath = getChecklistTemplateArchivePath(phaseKey);

  const toItems = (raw) =>
    (raw || [])
      .filter((item) => item && !item.folder)
      .map((item) => ({
        name: item.name,
        id: item.id,
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime || item.lastModified,
      }));

  let active = [];
  let archive = [];
  try {
    const activeRaw = await getDriveItems(siteId, activePath);
    active = toItems(activeRaw);
  } catch (_e) {
    // Folder may not exist yet
  }
  try {
    const archiveRaw = await getDriveItems(siteId, archivePath);
    archive = toItems(archiveRaw);
  } catch (_e) {}

  return { active, archive };
}

/**
 * Ladda upp en mallfil till DK Bas (aktiv mapp).
 * Om moveCurrentToArchive är true flyttas befintliga filer i aktiv mapp till Arkiv (döp om med datum).
 * Om replaceOnlyItemName anges flyttas endast den filen till arkiv (för "Byt mall" på en rad).
 */
export async function uploadChecklistMall(companyId, phaseKey, file, options = {}) {
  const { moveCurrentToArchive = false, replaceOnlyItemName = null } = options;
  const siteId = await getDkBasSiteId(companyId);
  if (!siteId) throw new Error('Ingen DK Bas-site kopplad. Koppla DK Bas under Företagsinställningar → SharePoint.');

  await ensureChecklistTemplateFolders(companyId, phaseKey);

  const activePath = getChecklistTemplateActivePath(phaseKey);
  const archivePath = getChecklistTemplateArchivePath(phaseKey);

  if (moveCurrentToArchive) {
    const { active: currentActive } = await listChecklistMallar(companyId, phaseKey);
    const toMove = replaceOnlyItemName
      ? currentActive.filter((item) => String(item.name || '').toLowerCase() === String(replaceOnlyItemName || '').toLowerCase())
      : currentActive;
    const dateOnly = new Date().toISOString().slice(0, 10);
    for (const item of toMove) {
      try {
        const fullPath = `${activePath}/${item.name}`;
        const base = item.name.replace(/\.[^.]+$/, '');
        const ext = item.name.includes('.') ? item.name.slice(item.name.lastIndexOf('.')) : '';
        const newName = `${base} ${dateOnly}${ext}`;
        await moveDriveItemByPath(siteId, fullPath, archivePath);
        await renameDriveItemByPath(siteId, `${archivePath}/${item.name}`, newName);
      } catch (e) {
        console.warn('[mallarDkBasService] move to archive failed:', item.name, e?.message || e);
      }
    }
  }

  const fileName = file?.name || `Mall checklista ${Date.now()}.xlsx`;
  const path = `${activePath}/${fileName}`;

  const url = await uploadFileToSharePoint({
    file,
    path,
    companyId: String(companyId).trim(),
    siteId,
    siteRole: 'system',
  });
  return { url, fileName };
}

/**
 * Byt namn på en mallfil i aktiv Checklista-mapp (både i systemet och SharePoint).
 * Använd t.ex. för Mallnamn + versionsnummer + datum: "Mall checklista v2 2026-02-14.xlsx".
 */
export async function renameChecklistMall(companyId, phaseKey, currentFileName, newFileName) {
  const siteId = await getDkBasSiteId(companyId);
  if (!siteId) throw new Error('Ingen DK Bas-site kopplad. Koppla DK Bas under Företagsinställningar → SharePoint.');
  const activePath = getChecklistTemplateActivePath(phaseKey);
  const itemPath = `${activePath}/${currentFileName}`;
  const trimmed = String(newFileName || '').trim();
  if (!trimmed) throw new Error('Ange ett filnamn.');
  await renameDriveItemByPath(siteId, itemPath, trimmed);
  return { newFileName: trimmed };
}

/**
 * Ta bort en mallfil från aktiv Checklista-mapp (filen tas bort från SharePoint).
 */
export async function deleteChecklistMall(companyId, phaseKey, fileName) {
  const siteId = await getDkBasSiteId(companyId);
  if (!siteId) throw new Error('Ingen DK Bas-site kopplad. Koppla DK Bas under Företagsinställningar → SharePoint.');
  const activePath = getChecklistTemplateActivePath(phaseKey);
  const itemPath = `${activePath}/${fileName}`;
  await deleteDriveItemByPath(siteId, itemPath);
}

/** Relativ sökväg till projektets checklista-mapp (under Kalkylskede Översikt). */
const PROJECT_CHECKLISTA_FOLDER = '01 - Översikt/01 - Checklista';

/** Basfilnamn om projektprefix inte kan användas. */
const FALLBACK_CHECKLISTA_FILE_NAME = 'Checklista.xlsx';

/**
 * Säker filnamnsdel: projektnummer + projektnamn (t.ex. "2026-02-16 Bokbindaren") → "2026-02-16 Bokbindaren Checklista.xlsx"
 */
function getProjectChecklistFileName(projectRootPath) {
  const raw = String(projectRootPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const safe = raw.replace(/[/\\:*?"<>|]/g, ' ').replace(/\s+/g, ' ').trim();
  if (!safe) return FALLBACK_CHECKLISTA_FILE_NAME;
  return `${safe} Checklista.xlsx`;
}

/**
 * Lista filer i projektets checklista-mapp (för att visa projektets egen checklista).
 * @param {string} projectSiteId - Projektets SharePoint site ID
 * @param {string} projectRootPath - Projektets rotmapp (t.ex. "2026 – Bokbindaren")
 * @returns {Promise<Array<{ name, id, webUrl, lastModified }>>}
 */
export async function listProjectChecklistFiles(projectSiteId, projectRootPath) {
  if (!projectSiteId || !projectRootPath) return [];
  const path = `${String(projectRootPath).replace(/^\/+/, '').replace(/\/+$/, '')}/${PROJECT_CHECKLISTA_FOLDER}`;
  try {
    const raw = await getDriveItems(projectSiteId, path);
    return (raw || [])
      .filter((item) => item && !item.folder)
      .map((item) => ({
        name: item.name,
        id: item.id,
        webUrl: item.webUrl,
        lastModified: item.lastModifiedDateTime || item.lastModified,
      }));
  } catch (_e) {
    return [];
  }
}

/**
 * Kopiera företagets aktiva checklista-mall (från DK Bas) till projektets checklista-mapp.
 * Används vid "Skapa checklista" för ett projekt och vid skapande av nya projekt.
 * @param {string} companyId
 * @param {string} projectSiteId - Projektets SharePoint site ID
 * @param {string} projectRootPath - Projektets rotmapp
 * @returns {Promise<{ fileName, webUrl }>}
 */
export async function copyChecklistMallToProject(companyId, projectSiteId, projectRootPath) {
  const cid = String(companyId || '').trim();
  const pidSite = String(projectSiteId || '').trim();
  const root = String(projectRootPath || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  if (!cid || !pidSite || !root) throw new Error('Företag, projektsite och projektmapp krävs.');

  const { active } = await listChecklistMallar(cid, 'kalkylskede');
  const mall = active && active[0];
  if (!mall?.name) throw new Error('Företaget har ingen aktiv checklista-mall. Lägg till en under Mallar (Kalkylskede → Checklista).');

  const dkSiteId = await getDkBasSiteId(cid);
  if (!dkSiteId) throw new Error('Ingen DK Bas-site kopplad.');

  const activePath = getChecklistTemplateActivePath('kalkylskede');
  const sourcePath = `${activePath}/${mall.name}`;
  const blob = await downloadDriveFileContent(dkSiteId, sourcePath);

  const folderPath = `${root}/${PROJECT_CHECKLISTA_FOLDER}`;
  await ensureFolderPath(folderPath, cid, pidSite, { siteRole: 'projects' });

  // Projektets fil: "projektnummer Projektnamn Checklista.xlsx" (t.ex. "2026-02-16 Bokbindaren Checklista.xlsx").
  const projectFileName = getProjectChecklistFileName(projectRootPath);
  const file = new File([blob], projectFileName, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const destPath = `${folderPath}/${projectFileName}`;
  const webUrl = await uploadFileToSharePoint({
    file,
    path: destPath,
    companyId: cid,
    siteId: pidSite,
    siteRole: 'projects',
  });
  return { fileName: projectFileName, webUrl };
}
