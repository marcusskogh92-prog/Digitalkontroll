const functions = require('firebase-functions');
const { db, FieldValue } = require('./sharedFirebase');
const { callerIsAdmin } = require('./sharedUtils');
const { logAdminAuditEvent } = require('./adminAudit');

async function adminFetchCompanyMembers(data, context) {
  const runningInEmulator = !!process.env.FUNCTIONS_EMULATOR || !!process.env.FIREBASE_EMULATOR_HUB;
  if (!context.auth && !runningInEmulator) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  const userEmail = (context.auth && context.auth.token && context.auth.token.email) ? String(context.auth.token.email).toLowerCase() : '';
  const isSuperadminEmail = userEmail === 'marcus@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem';
  const isAdminCall = callerIsAdmin(context) || isSuperadminEmail;
  if (!isAdminCall && !runningInEmulator) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const companyId = (data && data.companyId) || null;
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    const out = [];

    const membersRef = db.collection(`foretag/${companyId}/members`);
    const snap = await membersRef.get();
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));

    if (out.length === 0) {
      try {
        const usersRef = db.collection('users').where('companyId', '==', companyId);
        const usnap = await usersRef.get();
        usnap.forEach(d => {
          const data = d.data() || {};
          out.push({
            id: d.id,
            uid: d.id,
            companyId,
            displayName: data.displayName || null,
            email: data.email || null,
            role: data.role || null,
          });
        });
      } catch (e) {
        console.warn('adminFetchCompanyMembers fallback users query failed for company', companyId, e && e.message ? e.message : e);
      }
    }

    return { ok: true, members: out };
  } catch (err) {
    console.error('adminFetchCompanyMembers error', err);
    throw new functions.https.HttpsError('internal', err && err.message ? String(err.message) : String(err));
  }
}

async function setCompanyStatus(data, context) {
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
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan ändra företagsstatus');
  }

  const companyId = data && data.companyId ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  if (String(companyId).trim() === 'MS Byggsystem' && Object.prototype.hasOwnProperty.call(data || {}, 'deleted') && !!data.deleted) {
    throw new functions.https.HttpsError('failed-precondition', 'MS Byggsystem is protected and cannot be deleted');
  }

  const update = {};
  if (Object.prototype.hasOwnProperty.call(data || {}, 'enabled')) {
    update.enabled = !!data.enabled;
  }
  if (Object.prototype.hasOwnProperty.call(data || {}, 'deleted')) {
    update.deleted = !!data.deleted;
    if (update.deleted && !Object.prototype.hasOwnProperty.call(update, 'enabled')) {
      update.enabled = false;
    }
  }

  if (Object.keys(update).length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'No status fields provided to update');
  }

  try {
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set(update, { merge: true });
  } catch (err) {
    console.error('setCompanyStatus profile write error', { companyId, update, err: err && err.message ? err.message : err });
    throw new functions.https.HttpsError(
      'internal',
      `[profile-write] companyId=${companyId}, update=${JSON.stringify(update)}: ${err && err.message ? String(err.message) : String(err)}`
    );
  }

  try {
    await db.collection(`foretag/${companyId}/activity`).add({
      type: 'setCompanyStatus',
      actorUid: context.auth.uid || null,
      update,
      ts: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('setCompanyStatus activity log failed', { companyId, update, err: e && e.message ? e.message : e });
  }

  return { ok: true };
}

async function setCompanyUserLimit(data, context) {
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
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan ändra userLimit');
  }

  const companyId = data && data.companyId ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  const rawLimit = (data && Object.prototype.hasOwnProperty.call(data, 'userLimit')) ? data.userLimit : null;
  if (rawLimit === null || rawLimit === undefined || rawLimit === '') {
    throw new functions.https.HttpsError('invalid-argument', 'userLimit is required');
  }

  let userLimit = null;
  if (typeof rawLimit === 'number') {
    userLimit = rawLimit;
  } else if (typeof rawLimit === 'string') {
    const m = rawLimit.trim().match(/-?\d+/);
    if (m && m[0]) {
      const n = parseInt(m[0], 10);
      if (!Number.isNaN(n) && Number.isFinite(n)) userLimit = n;
    }
  }

  if (typeof userLimit !== 'number' || !Number.isFinite(userLimit) || userLimit < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'userLimit must be a non-negative number');
  }

  const update = { userLimit };

  try {
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set(update, { merge: true });
  } catch (err) {
    console.error('setCompanyUserLimit profile write error', { companyId, update, err: err && err.message ? err.message : err });
    throw new functions.https.HttpsError(
      'internal',
      `[profile-write] companyId=${companyId}, update=${JSON.stringify(update)}: ${err && err.message ? String(err.message) : String(err)}`
    );
  }

  try {
    await db.collection(`foretag/${companyId}/activity`).add({
      type: 'setCompanyUserLimit',
      actorUid: context.auth.uid || null,
      update,
      ts: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('setCompanyUserLimit activity log failed', { companyId, update, err: e && e.message ? e.message : e });
  }

  try {
    await logAdminAuditEvent({
      type: 'setCompanyUserLimit',
      companyId,
      actorUid: context.auth.uid || null,
      payload: update,
    });
  } catch (_e) {}

  return { ok: true, userLimit };
}

async function setCompanyName(data, context) {
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
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan ändra företagsnamn');
  }

  const companyId = data && data.companyId ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  const rawName = data && data.companyName ? String(data.companyName).trim() : '';
  if (!rawName) {
    throw new functions.https.HttpsError('invalid-argument', 'companyName is required');
  }

  const update = { companyName: rawName };

  try {
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set(update, { merge: true });
  } catch (err) {
    console.error('setCompanyName profile write error', { companyId, update, err: err && err.message ? err.message : err });
    throw new functions.https.HttpsError(
      'internal',
      `[profile-write] companyId=${companyId}, update=${JSON.stringify(update)}: ${err && err.message ? String(err.message) : String(err)}`
    );
  }

  try {
    await db.collection(`foretag/${companyId}/activity`).add({
      type: 'setCompanyName',
      actorUid: context.auth.uid || null,
      update,
      ts: FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('setCompanyName activity log failed', { companyId, update, err: e && e.message ? e.message : e });
  }

  try {
    await logAdminAuditEvent({
      type: 'setCompanyName',
      companyId,
      actorUid: context.auth.uid || null,
      payload: update,
    });
  } catch (_e) {}

  return { ok: true, companyName: rawName };
}

module.exports = {
  adminFetchCompanyMembers,
  setCompanyStatus,
  setCompanyUserLimit,
  setCompanyName,
};
