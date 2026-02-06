const functions = require('firebase-functions');
const { admin } = require('./sharedFirebase');
const { logAdminAuditEvent } = require('./adminAudit');

async function setSuperadmin(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  const token = context.auth.token || {};
  const callerIsSuper = !!(token.superadmin || token.role === 'superadmin');
  if (!callerIsSuper) {
    throw new functions.https.HttpsError('permission-denied', 'Only superadmins may promote other users');
  }

  const targetEmail = data && data.email ? String(data.email).trim().toLowerCase() : null;
  const targetUid = data && data.uid ? String(data.uid).trim() : null;
  if (!targetEmail && !targetUid) throw new functions.https.HttpsError('invalid-argument', 'Provide email or uid of the user to promote');

  try {
    let userRecord = null;
    if (targetUid) {
      userRecord = await admin.auth().getUser(targetUid);
    } else {
      userRecord = await admin.auth().getUserByEmail(targetEmail);
    }

    if (!userRecord || !userRecord.uid) throw new functions.https.HttpsError('not-found', 'Target user not found');

    const claims = Object.assign({}, (userRecord.customClaims || {}), { superadmin: true });
    await admin.auth().setCustomUserClaims(userRecord.uid, claims);
    try {
      await logAdminAuditEvent({
        type: 'setSuperadmin',
        actorUid: context.auth.uid || null,
        targetUid: userRecord.uid,
        payload: { email: userRecord.email },
      });
    } catch (_e) {}

    return { ok: true, uid: userRecord.uid };
  } catch (err) {
    console.error('setSuperadmin error', err);
    if (err && err.code && err.code.startsWith('functions.https')) throw err;
    throw new functions.https.HttpsError('internal', String(err?.message || err));
  }
}

module.exports = {
  setSuperadmin,
};
