const functions = require('firebase-functions');
const { admin, db } = require('./sharedFirebase');
const { logAdminAuditEvent } = require('./adminAudit');

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

  if (!isSuperadmin && !(callerCompanyId === 'MS Byggsystem' && callerIsCompanyAdmin) && !isEmailSuperadmin) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan radera företag permanent');
  }

  const companyId = data && data.companyId ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  if (String(companyId).trim() === 'MS Byggsystem') {
    throw new functions.https.HttpsError('failed-precondition', 'MS Byggsystem is protected and cannot be deleted');
  }

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

  try {
    try {
      await deleteAuthUsersForCompany(companyId);
    } catch (authErr) {
      console.warn('purgeCompany auth delete failed', { companyId, err: authErr && authErr.message ? authErr.message : authErr });
    }

    const subcollections = [
      `foretag/${companyId}/profil`,
      `foretag/${companyId}/members`,
      `foretag/${companyId}/activity`,
      `foretag/${companyId}/controls`,
      `foretag/${companyId}/draft_controls`,
      `foretag/${companyId}/hierarki`,
      `foretag/${companyId}/mallar`,
      `foretag/${companyId}/byggdel_mallar`,
      `foretag/${companyId}/byggdel_hierarki`,
    ];

    for (const path of subcollections) {
      try {
        await deleteCollection(path);
      } catch (e) {
        console.warn('purgeCompany subcollection delete failed', { companyId, path, err: e && e.message ? e.message : e });
      }
    }

    await companyRef.delete();
  } catch (err) {
    const rawCode = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? String(err.message) : String(err || '');
    console.error('purgeCompany error', { companyId, code: rawCode, message: msg, raw: err });

    if (err instanceof functions.https.HttpsError) {
      throw err;
    }

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

  return { ok: true };
}

module.exports = {
  purgeCompany,
};
