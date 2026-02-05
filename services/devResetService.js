import { collection, getDocs } from 'firebase/firestore';
import { Platform } from 'react-native';
import { auth, db, getCompanySharePointSiteIdByRole, purgeCompanyRemote } from '../components/firebase';
import { ensureDkBasStructure } from './azure/fileService';
import { deleteDriveItemById, getDriveItems } from './azure/hierarchyService';
import { getAccessToken } from './azure/authService';

const GRAPH_API_BASE = 'https://graph.microsoft.com/v1.0';
const KEEP_COMPANY_ID = 'MS Byggsystem';
const SUPERADMIN_EMAILS = new Set([
  'marcus@msbyggsystem.se',
  'marcus.skogh@msbyggsystem.se',
]);

function isDevEnvironment() {
  return String(process?.env?.NODE_ENV || '').toLowerCase() === 'development';
}

async function assertSuperadmin(currentUser) {
  const user = currentUser || auth?.currentUser || null;
  if (!user) throw new Error('Not authenticated');

  let claims = {};
  try {
    const tokenRes = await user.getIdTokenResult(false).catch(() => null);
    claims = tokenRes?.claims || {};
  } catch (_e) {
    claims = {};
  }

  const email = String(user?.email || '').toLowerCase();
  const role = String(claims?.role || '').toLowerCase();
  const isSuper =
    claims.superadmin === true ||
    claims.globalAdmin === true ||
    role === 'superadmin' ||
    SUPERADMIN_EMAILS.has(email);

  if (!isSuper) throw new Error('Superadmin required');
}

async function deleteSharePointSite(siteId) {
  const sid = String(siteId || '').trim();
  if (!sid) return;

  const accessToken = await getAccessToken({ allowRedirect: false });
  if (!accessToken) throw new Error('Missing access token for SharePoint delete');

  const endpoint = `${GRAPH_API_BASE}/sites/${sid}`;
  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!res.ok && res.status !== 404) {
    const errorText = await res.text();
    throw new Error(`Failed to delete site: ${res.status} ${res.statusText} - ${errorText}`);
  }
}

async function deleteDriveTreeByPath(siteId, path = '') {
  const sid = String(siteId || '').trim();
  if (!sid) return;

  const cleanPath = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const children = await getDriveItems(sid, cleanPath);
  for (const item of children || []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const isFolder = !!item?.folder;
    const childPath = cleanPath ? `${cleanPath}/${name}` : name;
    if (isFolder) {
      await deleteDriveTreeByPath(sid, childPath);
    }
    if (item?.id) {
      await deleteDriveItemById(sid, item.id);
    }
  }
}

async function fetchCompaniesLocal() {
  console.log('[DEV-RESET][DEBUG] db instance', db);
  let companiesSnap;
  try {
    companiesSnap = await Promise.race([
      getDocs(collection(db, 'companies')),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('getDocs timeout after 10s')), 10000)
      ),
    ]);
  } catch (e) {
    console.error('[DEV-RESET][1] companies fetch failed', e?.message || e);
    throw e;
  }
  console.log('[DEV-RESET][1] fetched companies count', companiesSnap?.size || 0);
  return companiesSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));
}

/**
 * DEV-RESET: controlled reset for development only.
 * This is manual-only and must be invoked explicitly.
 */
export async function runDevReset(currentUser = null) {
  setTimeout(() => {
    console.warn('[DEV-RESET][WATCHDOG] still running after 30s');
  }, 30000);

  console.log('[DEV-RESET] entered', {
    hasUser: !!currentUser,
    uid: currentUser?.uid || null,
    email: currentUser?.email || null,
    nodeEnv: process?.env?.NODE_ENV,
  });
  if (!isDevEnvironment()) {
    console.warn('[DEV-RESET] blocked: not development', process?.env?.NODE_ENV);
    throw new Error('DEV-RESET is only allowed in development');
  }
  try {
    await assertSuperadmin(currentUser);
  } catch (e) {
    console.warn('[DEV-RESET] blocked: not superadmin');
    throw e;
  }

  if (!db) {
    console.warn('[DEV-RESET] blocked: firestore not initialized');
    throw new Error('Firestore not initialized');
  }

  console.log('[DEV-RESET] starting destructive operations');

  console.log('[DEV-RESET][1] fetching companies');
  const companies = await fetchCompaniesLocal();
  console.log('[DEV-RESET][1] fetched X companies', companies.length);

  // Step 1: delete all companies except MS Byggsystem.
  for (const company of companies) {
    const companyId = String(company?.id || '').trim();
    if (!companyId) continue;
    if (companyId === KEEP_COMPANY_ID) continue;

    console.log('[DEV-RESET][1.1] deleting company', companyId);

    console.log('[DEV-RESET][1.2] resolving SharePoint sites', companyId);
    const dkSiteId = await getCompanySharePointSiteIdByRole(companyId, 'projects', { syncIfMissing: false });
    const dkBasId = await getCompanySharePointSiteIdByRole(companyId, 'system', { syncIfMissing: false });
    console.log('[DEV-RESET][1.2] sites resolved', { companyId, dkSiteId, dkBasId });

    try {
      console.log('[DEV-RESET][1.3] purging Firestore company', companyId);
      await purgeCompanyRemote({ companyId });
      console.log('[DEV-RESET][1.3] purged Firestore company', companyId);
    } catch (e) {
      console.error('[DEV-RESET][Company] Firestore purge failed', companyId, e?.message || e);
      throw e;
    }

    try {
      if (dkSiteId) {
        console.log('[DEV-RESET][1.4] deleting DK Site', dkSiteId);
        await deleteSharePointSite(dkSiteId);
        console.log('[DEV-RESET][1.4] deleted DK Site', dkSiteId);
      }
      if (dkBasId) {
        console.log('[DEV-RESET][1.5] deleting DK Bas', dkBasId);
        await deleteSharePointSite(dkBasId);
        console.log('[DEV-RESET][1.5] deleted DK Bas', dkBasId);
      }
    } catch (e) {
      console.error('[DEV-RESET][Company] SharePoint delete failed', companyId, e?.message || e);
      throw e;
    }

    console.log('[DEV-RESET][1.6] company done', companyId);
  }

  // Step 2: MS Byggsystem DK Site - hard delete all content.
  console.log('[DEV-RESET][2] resolving MS DK Site');
  const msDkSiteId = await getCompanySharePointSiteIdByRole(KEEP_COMPANY_ID, 'projects', { syncIfMissing: false });
  console.log('[DEV-RESET][2] MS DK Site resolved', msDkSiteId || null);
  if (msDkSiteId) {
    console.log('[DEV-RESET][2.1] deleting MS DK Site content');
    await deleteDriveTreeByPath(msDkSiteId, '');
    console.log('[DEV-RESET][2.2] deleted MS DK Site content');
  }

  // Step 3: MS Byggsystem DK Bas - clear Arkiv contents, then ensure structure.
  console.log('[DEV-RESET][3] resolving MS DK Bas');
  const msDkBasId = await getCompanySharePointSiteIdByRole(KEEP_COMPANY_ID, 'system', { syncIfMissing: false });
  console.log('[DEV-RESET][3] MS DK Bas resolved', msDkBasId || null);
  if (msDkBasId) {
    try {
      console.log('[DEV-RESET][3.1] clearing DK Bas Arkiv/Projekt');
      await deleteDriveTreeByPath(msDkBasId, 'Arkiv/Projekt');
      console.log('[DEV-RESET][3.1] cleared DK Bas Arkiv/Projekt');
      console.log('[DEV-RESET][3.2] clearing DK Bas Arkiv/Mappar');
      await deleteDriveTreeByPath(msDkBasId, 'Arkiv/Mappar');
      console.log('[DEV-RESET][3.2] cleared DK Bas Arkiv/Mappar');
      console.log('[DEV-RESET][3.3] clearing DK Bas Arkiv/Filer');
      await deleteDriveTreeByPath(msDkBasId, 'Arkiv/Filer');
      console.log('[DEV-RESET][3.3] cleared DK Bas Arkiv/Filer');
    } catch (e) {
      console.error('[DEV-RESET][MS][DK-BAS] Arkiv clear failed', e?.message || e);
      throw e;
    }
    console.log('[DEV-RESET][3.4] ensuring DK Bas structure');
    await ensureDkBasStructure(msDkBasId);
    console.log('[DEV-RESET][3.4] ensured DK Bas structure');
  }

  console.log('[DEV-RESET] completed successfully');
}
