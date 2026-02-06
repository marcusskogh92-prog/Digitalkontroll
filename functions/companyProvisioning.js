const functions = require('firebase-functions');
const { db, FieldValue, IS_EMULATOR } = require('./sharedFirebase');
const { ensureCompanySharePointSites } = require('./sharepointProvisioning');
const { logAdminAuditEvent } = require('./adminAudit');

async function provisionCompanyImpl(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Du måste vara inloggad för att skapa företag');
  }
  const token = context.auth.token || {};
  const callerEmail = (token.email || (context.auth.token && context.auth.token.email)) || null;
  const isSuperadmin = !!token.superadmin || token.role === 'superadmin' || token.admin === true;
  const callerCompanyId = token.companyId || null;
  const callerIsCompanyAdmin = !!(token.admin === true || token.role === 'admin');
  const allowedMsCompanyId = 'MS Byggsystem';
  const callerEmailLower = callerEmail ? String(callerEmail).toLowerCase() : '';
  const isEmailSuperadmin = callerEmailLower === 'marcus@msbyggsystem.se' || callerEmailLower === 'marcus.skogh@msbyggsystem.se' || callerEmailLower === 'marcus.skogh@msbyggsystem';
  if (!isSuperadmin && !(callerCompanyId === allowedMsCompanyId && callerIsCompanyAdmin) && !isEmailSuperadmin) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller MS Byggsystem-admin kan skapa företag');
  }
  const callerUid = context.auth.uid;
  const companyId = (data && data.companyId) ? String(data.companyId).trim() : null;
  const companyName = (data && data.companyName) ? String(data.companyName).trim() : (companyId || null);
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId saknas');
  }

  try {
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set({ companyName, createdAt: FieldValue.serverTimestamp(), enabled: true }, { merge: true });

    const hierRef = db.doc(`foretag/${companyId}/hierarki/state`);
    await hierRef.set({ items: [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const mallarRef = db.doc(`foretag/${companyId}/mallar/defaults`);
    await mallarRef.set({ createdAt: FieldValue.serverTimestamp(), templates: [] }, { merge: true });

    if (IS_EMULATOR === true) {
      console.log('Emulator mode: skipping SharePoint provisioning');
      return { success: true, skippedSharePoint: true };
    }

    await ensureCompanySharePointSites({
      companyId,
      companyName,
      actorUid: callerUid,
      actorEmail: callerEmail,
    });

    try {
      await logAdminAuditEvent({
        type: 'provisionCompany',
        companyId,
        actorUid: callerUid,
        payload: { companyName },
      });
    } catch (_e) {}

    return { ok: true, companyId, uid: callerUid };
  } catch (err) {
    console.error('provisionCompany failed', err);
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    const code = (err && typeof err.code === 'string' && err.code) ? err.code : 'internal';
    throw new functions.https.HttpsError(code, String(err?.message || err));
  }
}

module.exports = {
  provisionCompanyImpl,
};
