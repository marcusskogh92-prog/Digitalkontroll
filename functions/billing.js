const functions = require('firebase-functions');
const { db, FieldValue } = require('./sharedFirebase');
const { readFunctionsConfigValue } = require('./sharedConfig');
const { callerIsAdmin } = require('./sharedUtils');
const { sendSupportEmail } = require('./supportEmail');
const { logAdminAuditEvent } = require('./adminAudit');

async function requestSubscriptionUpgrade(data, context) {
  if (!context || !context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (!callerIsAdmin(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');
  }

  const token = context.auth.token || {};
  const companyId = String((data && data.companyId) || token.companyId || '').trim();
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  const actorUid = context.auth.uid;
  const actorEmail = token.email ? String(token.email).trim().toLowerCase() : null;
  const actorName = token.name ? String(token.name).trim() : null;

  let userLimit = null;
  let membersCount = null;
  let seatsLeft = null;
  try {
    const profSnap = await db.doc(`foretag/${companyId}/profil/public`).get();
    const rawUserLimit = profSnap.exists ? profSnap.data().userLimit : null;
    if (typeof rawUserLimit === 'number') {
      userLimit = rawUserLimit;
    } else if (typeof rawUserLimit === 'string') {
      const m = rawUserLimit.trim().match(/-?\d+/);
      if (m && m[0]) {
        const n = parseInt(m[0], 10);
        if (!Number.isNaN(n) && Number.isFinite(n)) userLimit = n;
      }
    }
  } catch (_e) {}
  try {
    const membersSnap = await db.collection(`foretag/${companyId}/members`).get();
    membersCount = membersSnap.size || 0;
  } catch (_e) {}
  if (typeof userLimit === 'number' && typeof membersCount === 'number') {
    seatsLeft = Math.max(0, userLimit - membersCount);
  }

  const request = {
    type: 'upgrade_subscription',
    companyId,
    actorUid,
    actorEmail,
    actorName,
    membersCount,
    userLimit,
    seatsLeft,
    status: 'new',
    ts: FieldValue.serverTimestamp(),
  };

  const reqRef = await db.collection(`foretag/${companyId}/support_requests`).add(request);

  const defaultTo = 'marcus@msbyggsystem.se';
  const to = String(process.env.UPGRADE_REQUEST_TO || readFunctionsConfigValue('upgrade.to', null) || defaultTo).trim();
  const subject = `Uppgradera abonnemang – ${companyId}`;
  const lines = [
    'En kund vill utöka sitt abonnemang i Digitalkontroll.',
    '',
    `Företag: ${companyId}`,
    `Medlemmar (nu): ${membersCount === null ? 'okänt' : membersCount}`,
    `UserLimit: ${userLimit === null ? 'okänt' : userLimit}`,
    `Platser kvar: ${seatsLeft === null ? 'okänt' : seatsLeft}`,
    '',
    `Skickat av: ${actorEmail || actorUid}`,
    actorName ? `Namn: ${actorName}` : null,
    `Ärende-id: ${reqRef.id}`,
  ].filter(Boolean);
  const text = lines.join('\n');

  let emailSent = false;
  let emailSkipped = false;
  let emailError = null;
  try {
    const res = await sendSupportEmail({ to, subject, text });
    emailSent = !!res.ok;
    emailSkipped = !!res.skipped;
    if (!res.ok && res.reason) emailError = res.reason;
  } catch (e) {
    emailError = String(e?.message || e);
  }

  try {
    await reqRef.update({
      email: { to, subject, sent: emailSent, skipped: emailSkipped, error: emailError || null },
      updatedAt: FieldValue.serverTimestamp(),
    });
  } catch (_e) {}

  try {
    await logAdminAuditEvent({
      type: 'requestSubscriptionUpgrade',
      companyId,
      actorUid,
      payload: { requestId: reqRef.id, emailSent, emailSkipped },
    });
  } catch (_e) {}

  return { ok: true, requestId: reqRef.id, emailSent, emailSkipped };
}

module.exports = {
  requestSubscriptionUpgrade,
};
