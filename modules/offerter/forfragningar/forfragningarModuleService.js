import { doc, onSnapshot, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';

import { auth, createCompanySupplier, getCompanySharePointSiteId } from '../../../components/firebase';
import { ensureFolderPath } from '../../../services/azure/fileService';

import {
    createRfqByggdel,
    createRfqPackage,
    getForfragningarDocRef,
    getRfqByggdelarCollectionRef,
    seedInquiryBuildParts,
    updateRfqPackage
} from '../../../features/project-phases/phases/kalkylskede/services/forfragningarService';

export const RFQ_STRUCTURE_MODES = {
  COMPLETE_TABLE: 'complete_byggdel_table',
  MANUAL_FOLDERS: 'manual_folders',
};

function safeText(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

function normalizePath(path) {
  const s = safeText(path);
  if (!s) return '';
  return s.replace(/^\/+/, '').replace(/\/+$/, '').replace(/\/+/, '/');
}

function sanitizeFolderSegment(value) {
  const s = safeText(value);
  if (!s) return '';
  return s
    .replace(/[\\/:*?"<>|]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function buildByggdelFolderName(byggdel) {
  const code = sanitizeFolderSegment(byggdel?.code);
  const label = sanitizeFolderSegment(byggdel?.label);
  const group = sanitizeFolderSegment(byggdel?.group);

  const left = [code, label].filter(Boolean).join(' – ');
  if (!left) return '';
  if (!group) return left;
  return `${left} – ${group}`;
}

function buildSupplierFolderName(supplierName) {
  return sanitizeFolderSegment(supplierName);
}

function getProjectBasePath(project) {
  const raw =
    project?.rootFolderPath ||
    project?.rootPath ||
    project?.sharePointPath ||
    project?.sharepointPath ||
    project?.sharePointBasePath ||
    project?.sharepointBasePath ||
    project?.basePath ||
    project?.path ||
    project?.projectPath ||
    project?.sharePointProjectPath ||
    '';
  return normalizePath(raw);
}

/** SharePoint root for Inköp & offerter: single folder "03 - Inköp och offerter". Byggdelar sync as subfolders. */
export function getForfragningarRootPath(project) {
  const base = getProjectBasePath(project);
  if (!base) return '';
  return normalizePath(`${base}/03 - Inköp och offerter`);
}

export async function ensureForfragningarRootBestEffort({ companyId, project }) {
  try {
    const cid = safeText(companyId);
    if (!cid) return null;
    const root = getForfragningarRootPath(project);
    if (!root) return null;
    await ensureFolderPath(root, cid, null, { siteRole: 'projects', strict: false });
    return root;
  } catch (_e) {
    return null;
  }
}

function nowUserMeta() {
  const user = auth?.currentUser || null;
  const uid = user?.uid || null;
  const name = safeText(user?.displayName || user?.email) || null;
  return { uid, name };
}

export async function setRfqStructureMode(companyId, projectId, mode) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) return false;

  const next = Object.values(RFQ_STRUCTURE_MODES).includes(mode) ? mode : RFQ_STRUCTURE_MODES.COMPLETE_TABLE;
  const ref = getForfragningarDocRef(cid, pid);
  const { uid, name } = nowUserMeta();

  await setDoc(ref, {
    settings: {
      structureMode: next,
      updatedAt: serverTimestamp(),
      updatedByUid: uid,
      updatedByName: name,
    },
  }, { merge: true });

  return true;
}

export function listenRfqForfragningarSettings(companyId, projectId, onSettings, onError) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) return () => {};

  const ref = getForfragningarDocRef(cid, pid);
  return onSnapshot(
    ref,
    (snap) => {
      const data = snap?.data?.() || {};
      const settings = data?.settings || {};
      onSettings?.(settings);
    },
    (err) => onError?.(err),
  );
}

export async function createByggdelWithBestEffortFolders({ companyId, projectId, project, byggdel }) {
  const created = await createRfqByggdel(companyId, projectId, byggdel);

  void ensureByggdelFolderBestEffort({ companyId, projectId, project, byggdel: { id: created?.id, ...byggdel } });

  return created;
}

export async function createPackageWithBestEffortFolders({ companyId, projectId, project, byggdel, supplier }) {
  const supplierId = safeText(supplier?.id) || null;
  const supplierName = safeText(supplier?.companyName || supplier?.name || supplier?.supplierName);

  const pkg = await createRfqPackage(companyId, projectId, {
    byggdelId: safeText(byggdel?.id),
    byggdelLabel: safeText(byggdel?.label),
    supplierId,
    supplierName,
    status: 'Ej skickad',
    sharePointFolderPath: null,
  });

  void ensurePackageFolderBestEffort({ companyId, projectId, project, byggdel, packageId: pkg?.id, supplierName });

  return pkg;
}

export async function ensureByggdelFolderBestEffort({ companyId, projectId, project, byggdel }) {
  try {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    const bid = safeText(byggdel?.id);
    if (!cid || !pid || !bid) return null;

    const root = getForfragningarRootPath(project);
    const folderName = buildByggdelFolderName(byggdel);
    if (!root || !folderName) return null;

    const fullPath = normalizePath(`${root}/${folderName}`);
    await ensureFolderPath(fullPath, cid, null, { siteRole: 'projects', strict: false });

    const colRef = getRfqByggdelarCollectionRef(cid, pid);
    await updateDoc(doc(colRef, bid), {
      sharePointFolderPath: fullPath,
      sharePointFolderEnsuredAt: serverTimestamp(),
    });

    return fullPath;
  } catch (_e) {
    return null;
  }
}

export async function ensurePackageFolderBestEffort({ companyId, projectId, project, byggdel, packageId, supplierName }) {
  try {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    const pkgId = safeText(packageId);
    if (!cid || !pid || !pkgId) return null;

    const root = getForfragningarRootPath(project);
    const byggdelFolder = buildByggdelFolderName(byggdel);
    const supplierFolder = buildSupplierFolderName(supplierName);
    if (!root || !byggdelFolder || !supplierFolder) return null;

    const fullPath = normalizePath(`${root}/${byggdelFolder}/${supplierFolder}`);
    await ensureFolderPath(fullPath, cid, null, { siteRole: 'projects', strict: false });

    await updateRfqPackage(cid, pid, pkgId, { sharePointFolderPath: fullPath });
    return fullPath;
  } catch (_e) {
    return null;
  }
}

/**
 * Delete byggdel folder in SharePoint (best-effort). Item goes to site recycle bin.
 * Call after soft-deleting byggdel in Firestore so SharePoint stays in sync.
 */
export async function deleteByggdelFolderInSharePointBestEffort({ companyId, byggdel }) {
  const path = safeText(byggdel?.sharePointFolderPath);
  if (!path) return null;
  try {
    const cid = safeText(companyId);
    if (!cid) return null;
    const siteId = await getCompanySharePointSiteId(cid);
    if (!siteId) return null;
    const { deleteDriveItemByPath } = await import('../../../services/azure/hierarchyService');
    await deleteDriveItemByPath(siteId, path);
    return path;
  } catch (_e) {
    return null;
  }
}

export async function seedDefaultByggdelTable({ companyId, projectId, existingByggdelCount }) {
  const count = Number(existingByggdelCount) || 0;
  if (count > 0) return { created: 0 };

  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) return { created: 0 };

  const forfragningarRef = getForfragningarDocRef(cid, pid);
  await setDoc(forfragningarRef, { seededAt: serverTimestamp() }, { merge: true });

  return seedInquiryBuildParts(cid, pid);
}

export async function createSupplierInRegistry({ companyId, supplierName, category }) {
  const cid = safeText(companyId);
  const name = safeText(supplierName);
  if (!cid || !name) throw new Error('Företagsnamn är obligatoriskt');

  const id = await createCompanySupplier(
    { companyName: name, organizationNumber: '', vatNumber: '', address: '', category: safeText(category) },
    cid,
  );
  return { id, companyName: name, category: safeText(category) };
}
