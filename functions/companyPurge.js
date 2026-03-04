const functions = require('firebase-functions');
const { admin, db } = require('./sharedFirebase');
const { logAdminAuditEvent } = require('./adminAudit');
const { getCompanySiteIdsFromConfig } = require('./companyPurgeHelpers');
const { getSharePointGraphAccessToken } = require('./sharedConfig');
const { graphDeleteSite } = require('./sharepointGraph');

async function deleteAuthUsersForCompany(companyId) {
  const PROTECTED_USER_EMAILS = new Set([
    'marcus@msbyggsystem.se',
  ]);

  let nextPageToken = undefined;
  let deletedCount = 0;
  let failedCount = 0;
  const failures = [];

  do {
    const res = await admin.auth().listUsers(1000, nextPageToken);
    const users = res && Array.isArray(res.users) ? res.users : [];

    const targets = users.filter((u) => {
      try {
        const claims = u && u.customClaims ? u.customClaims : {};
        if (!(claims && claims.companyId === companyId)) return false;
        const email = u && u.email ? String(u.email).toLowerCase() : '';
        if (email && PROTECTED_USER_EMAILS.has(email)) return false;
        return true;
      } catch (_e) {
        return false;
      }
    });

    await Promise.all(targets.map(async (u) => {
      try {
        await admin.auth().deleteUser(u.uid);
        deletedCount += 1;
      } catch (_e) {
        failedCount += 1;
        failures.push({ uid: u.uid, error: _e && _e.message ? _e.message : _e });
      }
    }));

    nextPageToken = res.pageToken;
  } while (nextPageToken);

  if (failedCount > 0) {
    console.warn('deleteAuthUsersForCompany: some deletes failed', { companyId, deletedCount, failedCount, failures });
  } else {
    console.log('deleteAuthUsersForCompany: completed', { companyId, deletedCount });
  }

  return { deletedCount, failedCount };
}

const PROTECTED_COMPANY_ID = 'MS Byggsystem';

/** Subcollections to delete when purging a company (foretag/{companyId}/...) */
const COMPANY_SUBCOLLECTIONS = [
  'profil',
  'members',
  'activity',
  'controls',
  'draft_controls',
  'hierarki',
  'mallar',
  'byggdel_mallar',
  'byggdelar',
  'byggdel_hierarki',
  'planering_plans',
  'planering_presence',
  'sharepoint_sites',
  'sharepoint_navigation',
  'sharepoint_system',
  'projects',
];

/**
 * Permanently delete one company from Firebase (and optionally its SharePoint sites in M365).
 * Does NOT check auth – caller must enforce superadmin / protect MS Byggsystem.
 * @param {string} companyId
 * @returns {{ ok: boolean, sharePointSitesDeleted: number }}
 */
async function doPurgeCompany(companyId) {
  const companyRef = db.doc(`foretag/${companyId}`);

  async function deleteCollection(colPath) {
    const colRef = db.collection(colPath);
    const snap = await colRef.get();
    const deletions = [];
    snap.forEach((d) => {
      deletions.push(d.ref.delete().catch(() => null));
    });
    await Promise.all(deletions);
  }

  let sharePointDeleted = 0;
  try {
    const { baseSiteId, workspaceSiteId } = await getCompanySiteIdsFromConfig(companyId);
    const accessToken = await getSharePointGraphAccessToken().catch(() => null);
    if (accessToken) {
      if (workspaceSiteId) {
        try {
          await graphDeleteSite({ siteId: workspaceSiteId, accessToken });
          sharePointDeleted += 1;
        } catch (_e) {}
      }
      if (baseSiteId) {
        try {
          await graphDeleteSite({ siteId: baseSiteId, accessToken });
          sharePointDeleted += 1;
        } catch (_e) {}
      }
      if (sharePointDeleted > 0) {
        console.log('doPurgeCompany SharePoint sites deleted', { companyId, count: sharePointDeleted });
      }
    }
  } catch (spErr) {
    console.warn('doPurgeCompany SharePoint delete failed (continuing)', { companyId, err: spErr && spErr.message ? spErr.message : spErr });
  }

  try {
    await deleteAuthUsersForCompany(companyId);
  } catch (authErr) {
    console.warn('doPurgeCompany auth delete failed', { companyId, err: authErr && authErr.message ? authErr.message : authErr });
  }

  const presenceRef = db.collection(`foretag/${companyId}/planering_presence`);
  const presenceSnap = await presenceRef.get();
  for (const tabDoc of presenceSnap.docs) {
    try {
      await deleteCollection(`foretag/${companyId}/planering_presence/${tabDoc.id}/users`);
    } catch (e) {
      console.warn('doPurgeCompany planering_presence users delete failed', { companyId, tabId: tabDoc.id });
    }
  }

  for (const subName of COMPANY_SUBCOLLECTIONS) {
    const path = `foretag/${companyId}/${subName}`;
    try {
      await deleteCollection(path);
    } catch (e) {
      console.warn('doPurgeCompany subcollection delete failed', { companyId, path, err: e && e.message ? e.message : e });
    }
  }

  await companyRef.delete();
  return { ok: true, sharePointSitesDeleted: sharePointDeleted };
}

async function purgeCompany(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const token = context.auth.token || {};
  const callerEmail = token.email ? String(token.email).toLowerCase() : '';
  const isSuperadmin = !!token.superadmin || token.role === 'superadmin';
  const callerCompanyId = token.companyId || null;
  const callerIsCompanyAdmin = !!(token.admin === true || token.role === 'admin');
  const isEmailSuperadmin = callerEmail === 'marcus@msbyggsystem.se' || callerEmail === 'marcus.skogh@msbyggsystem.se' || callerEmail === 'marcus.skogh@msbyggsystem';

  if (!isSuperadmin && !(callerCompanyId === PROTECTED_COMPANY_ID && callerIsCompanyAdmin) && !isEmailSuperadmin) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan radera företag permanent');
  }

  const companyId = data && data.companyId ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  if (companyId === PROTECTED_COMPANY_ID) {
    throw new functions.https.HttpsError('failed-precondition', 'MS Byggsystem is protected and cannot be deleted');
  }

  let result;
  try {
    result = await doPurgeCompany(companyId);
  } catch (err) {
    const rawCode = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? String(err.message) : String(err || '');
    console.error('purgeCompany error', { companyId, code: rawCode, message: msg, raw: err });

    if (err instanceof functions.https.HttpsError) throw err;

    const allowedCodes = [
      'cancelled', 'unknown', 'invalid-argument', 'deadline-exceeded', 'not-found', 'already-exists',
      'permission-denied', 'resource-exhausted', 'failed-precondition', 'aborted', 'out-of-range',
      'unimplemented', 'internal', 'unavailable', 'data-loss', 'unauthenticated',
    ];
    const effectiveCode = allowedCodes.includes(rawCode) ? rawCode : 'internal';

    throw new functions.https.HttpsError(
      effectiveCode,
      `Kunde inte radera företag permanent (code=${effectiveCode}${rawCode && effectiveCode !== rawCode ? ', raw=' + rawCode : ''}): ${msg || 'Okänt fel'}`
    );
  }

  try {
    await logAdminAuditEvent({
      type: 'purgeCompany',
      companyId,
      actorUid: context.auth.uid || null,
    });
  } catch (_e) {}

  return { ok: true, sharePointSitesDeleted: result.sharePointSitesDeleted };
}

/**
 * Remove ALL companies from Firebase except MS Byggsystem.
 * Superadmin only. Use with care.
 */
async function purgeAllCompaniesExceptMSByggsystem(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const token = context.auth.token || {};
  const callerEmail = (token.email && String(token.email).toLowerCase()) || '';
  const isSuperadmin = !!token.superadmin || token.role === 'superadmin';
  const isEmailSuperadmin = callerEmail === 'marcus@msbyggsystem.se' || callerEmail === 'marcus.skogh@msbyggsystem.se' || callerEmail === 'marcus.skogh@msbyggsystem';

  if (!isSuperadmin && !isEmailSuperadmin) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin kan köra "radera alla företag utom MS Byggsystem".');
  }

  const foretagRef = db.collection('foretag');
  const snap = await foretagRef.get();
  const ids = [];
  snap.forEach((doc) => {
    const id = doc.id;
    if (id && id !== PROTECTED_COMPANY_ID) ids.push(id);
  });

  const deleted = [];
  const errors = [];

  for (const companyId of ids) {
    try {
      await doPurgeCompany(companyId);
      deleted.push(companyId);
      console.log('purgeAllCompaniesExceptMSByggsystem: deleted', companyId);
    } catch (err) {
      const msg = err && err.message ? String(err.message) : String(err);
      errors.push({ companyId, error: msg });
      console.error('purgeAllCompaniesExceptMSByggsystem: failed for', companyId, err);
    }
  }

  try {
    await logAdminAuditEvent({
      type: 'purgeAllCompaniesExceptMSByggsystem',
      actorUid: context.auth.uid || null,
      payload: { deleted: deleted.length, kept: PROTECTED_COMPANY_ID, errors: errors.length },
    });
  } catch (_e) {}

  return {
    ok: true,
    deleted,
    errorCount: errors.length,
    errors: errors.length > 0 ? errors : undefined,
  };
}

module.exports = {
  purgeCompany,
  purgeAllCompaniesExceptMSByggsystem,
  doPurgeCompany,
};
