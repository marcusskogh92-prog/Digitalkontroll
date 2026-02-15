/**
 * Section Folder Operations – Skapa, byta namn, radera undermappar i SharePoint.
 * Används för dynamisk mappstruktur i lower topbar.
 */

import { ensureFolderPath } from '../../../services/azure/fileService';
import { deleteDriveItemById, getDriveItemByPath, renameDriveItemById } from '../../../services/azure/hierarchyService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { sanitizeSharePointFolderName } from '../../../components/firebase';

function safeText(v) {
  return String(v ?? '').trim();
}

function joinPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

/**
 * Hämta nästa lediga mappnummer för en sektion (01, 02... 09, 10...).
 * @param {string} siteId
 * @param {string} sectionPath - T.ex. "projekt/04 - Konstruktion och beräkningar"
 * @returns {Promise<number>} Nästa nummer (9 om 01-08 finns)
 */
export async function getNextFolderNumber(siteId, sectionPath) {
  const items = await getSharePointFolderItems(siteId, `/${sectionPath}`);
  const folders = (items || []).filter((it) => it?.type === 'folder');
  let maxNum = 0;
  for (const f of folders) {
    const name = safeText(f?.name);
    const m = name.match(/^(\d{1,2})\s*[-–—.]\s*/);
    if (m) {
      const n = parseInt(m[1], 10);
      if (Number.isFinite(n)) maxNum = Math.max(maxNum, n);
    }
  }
  return maxNum + 1;
}

/**
 * Skapa ny mapp i sektionen.
 * @returns {Promise<{sharePointName: string, displayName: string}>}
 */
export async function createSectionFolder({
  siteId,
  companyId,
  projectRootPath,
  sectionFolderName,
  folderDisplayName,
}) {
  const safe = sanitizeSharePointFolderName(folderDisplayName) || 'Ny mapp';
  const sectionPath = joinPath(projectRootPath, sectionFolderName);
  const nextNum = await getNextFolderNumber(siteId, sectionPath);
  const sharePointName = `${String(nextNum).padStart(2, '0')} - ${safe}`;
  const fullPath = joinPath(sectionPath, sharePointName);
  await ensureFolderPath(fullPath, companyId, siteId, { siteRole: 'projects', strict: true });
  return { sharePointName, displayName: safe };
}

/**
 * Byta namn på mapp i SharePoint.
 */
export async function renameSectionFolder({
  siteId,
  projectRootPath,
  sectionFolderName,
  currentSharePointName,
  newDisplayName,
}) {
  const sectionPath = joinPath(projectRootPath, sectionFolderName);
  const currentPath = joinPath(sectionPath, currentSharePointName);
  const safe = sanitizeSharePointFolderName(newDisplayName) || 'Mapp';
  const m = currentSharePointName.match(/^(\d{1,2})\s*[-–—.]\s*/);
  const prefix = m ? `${m[1]} - ` : '';
  const newSharePointName = `${prefix}${safe}`;
  const item = await getDriveItemByPath(siteId, currentPath);
  if (!item?.id) throw new Error('Mappen hittades inte');
  await renameDriveItemById(siteId, item.id, newSharePointName);
  return { sharePointName: newSharePointName, displayName: safe };
}

/**
 * Ta bort mapp från SharePoint.
 * Om mappen inte finns returneras { hasFiles: false, deleted: false } utan fel.
 * @returns {Promise<{hasFiles: boolean, deleted: boolean}>}
 */
export async function deleteSectionFolder({
  siteId,
  projectRootPath,
  sectionFolderName,
  sharePointName,
}) {
  const sectionPath = joinPath(projectRootPath, sectionFolderName);
  const folderPath = joinPath(sectionPath, sharePointName);
  let item;
  try {
    item = await getDriveItemByPath(siteId, folderPath);
  } catch (_e) {
    return { hasFiles: false, deleted: false };
  }
  if (!item?.id) return { hasFiles: false, deleted: false };
  const items = await getSharePointFolderItems(siteId, `/${folderPath}`);
  const hasFiles = (items || []).some((it) => it?.type === 'file');
  await deleteDriveItemById(siteId, item.id);
  return { hasFiles, deleted: true };
}
