const functions = require('firebase-functions');
const { db, FieldValue, IS_EMULATOR } = require('./sharedFirebase');
const { normalizeCompanyIdToSlug } = require('./sharedUtils');
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
  const rawCompanyId = (data && data.companyId) ? String(data.companyId).trim() : null;
  const companyName = (data && data.companyName) ? String(data.companyName).trim() : (rawCompanyId || null);
  if (!rawCompanyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId saknas');
  }
  const companyId = normalizeCompanyIdToSlug(rawCompanyId) || rawCompanyId;

  try {
    const companyRef = db.doc(`foretag/${companyId}`);
    await companyRef.set(
      { companyName, createdAt: FieldValue.serverTimestamp(), enabled: true },
      { merge: true }
    );

    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set({ companyName, createdAt: FieldValue.serverTimestamp(), enabled: true, enabledPhases: [] }, { merge: true });

    const hierRef = db.doc(`foretag/${companyId}/hierarki/state`);
    await hierRef.set({ items: [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    const mallarRef = db.doc(`foretag/${companyId}/mallar/defaults`);
    await mallarRef.set({ createdAt: FieldValue.serverTimestamp(), templates: [] }, { merge: true });
  } catch (err) {
    console.error('provisionCompany: Firestore write failed', err);
    if (err instanceof functions.https.HttpsError) throw err;
    throw new functions.https.HttpsError('internal', 'Kunde inte skapa företagsdokument: ' + (err?.message || String(err)));
  }

  // Efter företagsskapande: returnera alltid 200. SharePoint-fel fångas så att klienten inte får "internal error".
  let spResult = null;
  let sharePointError = false;
  let sharePointMessage = null;

  if (IS_EMULATOR === true) {
    console.log('Emulator mode: skipping SharePoint provisioning');
    return { success: true, skippedSharePoint: true, ok: true, companyId };
  }

  try {
    spResult = await ensureCompanySharePointSites({
      companyId,
      companyName,
      actorUid: callerUid,
      actorEmail: callerEmail,
    });
  } catch (spErr) {
    sharePointError = true;
    sharePointMessage = (spErr && spErr.message) ? String(spErr.message) : String(spErr);
    console.error('provisionCompany: SharePoint provisioning failed (company created, returning 200)', spErr);
  }

  try {
    await logAdminAuditEvent({
      type: 'provisionCompany',
      companyId,
      actorUid: callerUid,
      payload: { companyName, sharePointError: sharePointError || undefined },
    });
  } catch (_e) {}

  const baseSiteCreated = !!(spResult && spResult.baseSite && spResult.baseSite.siteId);
  const workspaceSiteCreated = !!(spResult && spResult.workspaceSite && spResult.workspaceSite.siteId);
  return {
    ok: true,
    companyId,
    uid: callerUid,
    baseSiteCreated,
    workspaceSiteCreated,
    sharePointError: sharePointError || undefined,
    sharePointMessage: sharePointMessage || undefined,
  };
}

/** Callable: etablera SharePoint (Site + Bas) för ett befintligt företag som har 0 siter. Anropas t.ex. från SharePoint Nav. */
async function provisionCompanySharePointImpl(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Du måste vara inloggad');
  }
  const token = context.auth.token || {};
  const isSuperadmin = !!token.superadmin || token.role === 'superadmin' || token.admin === true;
  const callerCompanyId = token.companyId || null;
  const callerIsCompanyAdmin = !!(token.admin === true || token.role === 'admin');
  const companyId = (data && data.companyId) ? String(data.companyId).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId saknas');
  }
  const canAct = isSuperadmin || (callerCompanyId === companyId && callerIsCompanyAdmin);
  if (!canAct) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller företagsadmin för det valda företaget kan etablera SharePoint.');
  }

  const callerEmail = (token.email || (context.auth.token && context.auth.token.email)) || null;
  try {
    const spResult = await ensureCompanySharePointSites({
      companyId,
      companyName: (data && data.companyName) ? String(data.companyName).trim() : companyId,
      actorUid: context.auth.uid,
      actorEmail: callerEmail,
    });
    const baseSiteCreated = !!(spResult && spResult.baseSite && spResult.baseSite.siteId);
    const workspaceSiteCreated = !!(spResult && spResult.workspaceSite && spResult.workspaceSite.siteId);
    return { ok: true, companyId, baseSiteCreated, workspaceSiteCreated };
  } catch (err) {
    console.error('provisionCompanySharePoint failed', err);
    const message = (err && err.message) ? String(err.message) : String(err);
    throw new functions.https.HttpsError('internal', `SharePoint-etablering misslyckades: ${message}`);
  }
}

module.exports = {
  provisionCompanyImpl,
  provisionCompanySharePointImpl,
};
