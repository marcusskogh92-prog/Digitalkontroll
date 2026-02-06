const functions = require('firebase-functions');
const { db, KEEP_COMPANY_ID } = require('./sharedFirebase');
const { getSharePointProvisioningAccessToken } = require('./sharedConfig');
const { getCompanySiteIdsFromConfig, purgeCompanyFirestore } = require('./companyPurgeHelpers');
const { graphDeleteSite, deleteDriveTreeByPathAdmin, ensureDkBasStructureAdmin } = require('./sharepointGraph');

async function devResetAdmin(data, context) {
  console.log('[DEV-RESET][ADMIN] start');

  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const projectId = (() => {
    const raw = String(process.env.FIREBASE_CONFIG || '').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.projectId) return String(parsed.projectId);
      } catch (_e) {}
    }
    return String(process.env.GCLOUD_PROJECT || '');
  })();
  const isDevEnv = String(process.env.FUNCTIONS_EMULATOR || '') === 'true' || projectId === 'digitalkontroll-8fd05';
  if (!isDevEnv) {
    throw new functions.https.HttpsError('failed-precondition', 'DEV-reset only allowed in development');
  }

  const token = context.auth.token || {};
  const callerIsSuper = !!token.superadmin || token.role === 'superadmin';
  if (!callerIsSuper) {
    throw new functions.https.HttpsError('permission-denied', 'Superadmin required');
  }

  const accessToken = getSharePointProvisioningAccessToken();
  if (!accessToken) {
    throw new functions.https.HttpsError('failed-precondition', 'SharePoint provisioning access token missing');
  }

  const companiesSnap = await db.collection('foretag').get();
  const companies = companiesSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  for (const company of companies) {
    const companyId = String(company?.id || '').trim();
    if (!companyId) continue;
    if (companyId === KEEP_COMPANY_ID) continue;

    console.log('[DEV-RESET][ADMIN] deleting company', companyId);

    const { workspaceSiteId, baseSiteId } = await getCompanySiteIdsFromConfig(companyId);

    try {
      await purgeCompanyFirestore(companyId);
    } catch (e) {
      console.error('[DEV-RESET][ADMIN] Firestore purge failed', companyId, e?.message || e);
      throw new functions.https.HttpsError('internal', `Firestore purge failed for ${companyId}: ${e?.message || e}`);
    }

    try {
      if (workspaceSiteId) await graphDeleteSite({ siteId: workspaceSiteId, accessToken });
      if (baseSiteId) await graphDeleteSite({ siteId: baseSiteId, accessToken });
    } catch (e) {
      console.error('[DEV-RESET][ADMIN] SharePoint delete failed', companyId, e?.message || e);
      throw new functions.https.HttpsError('internal', `SharePoint delete failed for ${companyId}: ${e?.message || e}`);
    }

    console.log('[DEV-RESET][ADMIN] company done', companyId);
  }

  const msSites = await getCompanySiteIdsFromConfig(KEEP_COMPANY_ID);
  if (msSites.workspaceSiteId) {
    console.log('[DEV-RESET][ADMIN] cleaning MS DK Site');
    await deleteDriveTreeByPathAdmin({ siteId: msSites.workspaceSiteId, path: '', accessToken });
  }

  if (msSites.baseSiteId) {
    console.log('[DEV-RESET][ADMIN] cleaning MS DK Bas Arkiv');
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Projekt', accessToken });
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Mappar', accessToken });
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Filer', accessToken });
    console.log('[DEV-RESET][ADMIN] ensuring MS DK Bas');
    await ensureDkBasStructureAdmin({ siteId: msSites.baseSiteId, accessToken });
  }

  console.log('[DEV-RESET][ADMIN] completed');
  return { ok: true };
}

module.exports = {
  devResetAdmin,
};
