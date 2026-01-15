const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

// Ensure a project id is available when running locally or against the emulator.
// Prefer existing env vars (set by firebase emulators or CI), otherwise fall back
// to the known project id for local testing.
const resolvedProjectId = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || process.env.FIREBASE_PROJECT || process.env.FIREBASE_CONFIG && (() => {
  try {
    const cfg = JSON.parse(process.env.FIREBASE_CONFIG);
    return cfg.projectId;
  } catch (e) { return null; }
})() || 'digitalkontroll-8fd05';

admin.initializeApp({ projectId: resolvedProjectId });

const firestore = admin.firestore();
const db = admin.firestore();

// Helper to write a global admin audit event. This is separate from the
// per-company /foretag/{company}/activity feed and is intended for
// superadmin/verktyg-översikt i webbgränssnittet.
async function logAdminAuditEvent(event) {
  try {
    const payload = Object.assign(
      {
        ts: admin.firestore.FieldValue.serverTimestamp(),
      },
      event || {}
    );
    await db.collection('admin_audit').add(payload);
  } catch (e) {
    console.warn('logAdminAuditEvent failed', e && e.message ? e.message : e);
  }
}

/**
 * Callable function to provision a new company (foretag).
 * - Creates minimal profile document
 * - Initializes hierarki state and a minimal mallar document
 * - Adds the calling user as an admin member and sets custom claims
 * Requires the caller to be authenticated.
 */
async function provisionCompanyImpl(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Du måste vara inloggad för att skapa företag');
  }
  // Authorization: only superadmins or MS Byggsystem admins may provision new companies
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
    // 1) Create/merge profile
    const profRef = firestore.doc(`foretag/${companyId}/profil/public`);
    await profRef.set({ companyName, createdAt: admin.firestore.FieldValue.serverTimestamp(), enabled: true }, { merge: true });

    // 2) Initialize hierarchy state
    const hierRef = firestore.doc(`foretag/${companyId}/hierarki/state`);
    await hierRef.set({ items: [], updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

    // 3) Minimal 'mallar' placeholder so UI won't break
    const mallarRef = firestore.doc(`foretag/${companyId}/mallar/defaults`);
    await mallarRef.set({ createdAt: admin.firestore.FieldValue.serverTimestamp(), templates: [] }, { merge: true });

    // 4) Do NOT automatically add the caller as a member or change their
    //    custom claims. Superadmins/MS Byggsystem-admins manage the new
    //    company's users via the separate user management functions instead.

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
    // If this is already an HttpsError, propagate as-is so the client
    // sees the real error code (e.g. permission-denied, unauthenticated).
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }
    const code = (err && typeof err.code === 'string' && err.code) ? err.code : 'internal';
    throw new functions.https.HttpsError(code, String(err?.message || err));
  }
}

exports.provisionCompany = functions.https.onCall(provisionCompanyImpl);
// Export impl for direct local testing
exports.provisionCompanyImpl = provisionCompanyImpl;
// Note: additional functions below use `db` and `admin` which are already initialized above.

function generateTempPassword() {
  // 12-char temp password with letters + digits
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

function callerIsAdmin(context) {
  const token = context.auth && context.auth.token ? context.auth.token : {};
  return token.admin === true || token.role === 'admin' || token.globalAdmin === true;
}

function readFunctionsConfigValue(path, fallback = null) {
  try {
    const cfg = functions.config && typeof functions.config === 'function' ? functions.config() : {};
    const parts = String(path || '').split('.').filter(Boolean);
    let cur = cfg;
    for (const p of parts) {
      if (!cur || typeof cur !== 'object') return fallback;
      cur = cur[p];
    }
    if (cur === undefined || cur === null || cur === '') return fallback;
    return cur;
  } catch (_e) {
    return fallback;
  }
}

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || readFunctionsConfigValue('smtp.host', null);
  const portRaw = process.env.SMTP_PORT || readFunctionsConfigValue('smtp.port', null);
  const user = process.env.SMTP_USER || readFunctionsConfigValue('smtp.user', null);
  const pass = process.env.SMTP_PASS || readFunctionsConfigValue('smtp.pass', null);
  const secureRaw = process.env.SMTP_SECURE || readFunctionsConfigValue('smtp.secure', null);
  const from = process.env.SMTP_FROM || readFunctionsConfigValue('smtp.from', null) || user;

  const port = portRaw !== null && portRaw !== undefined && String(portRaw).trim() !== '' ? parseInt(String(portRaw).trim(), 10) : null;
  const secure = String(secureRaw).toLowerCase() === 'true' || secureRaw === true;

  return {
    host: host ? String(host).trim() : null,
    port: Number.isFinite(port) ? port : null,
    user: user ? String(user).trim() : null,
    pass: pass ? String(pass).trim() : null,
    secure,
    from: from ? String(from).trim() : null,
  };
}

async function sendSupportEmail({ to, subject, text }) {
  const smtp = getSmtpConfig();
  if (!smtp.host || !smtp.port || !smtp.user || !smtp.pass || !smtp.from) {
    return { ok: false, skipped: true, reason: 'SMTP not configured' };
  }
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: !!smtp.secure,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  await transport.sendMail({ from: smtp.from, to, subject, text });
  return { ok: true };
}

// Delete all Firebase Auth users that belong to a specific companyId
// (based on custom claims). This scans users in pages of 1000 which is
// fine for the expected scale of this project.
async function deleteAuthUsersForCompany(companyId) {
  const PROTECTED_USER_EMAILS = new Set([
    'marcus@msbyggsystem.se',
  ]);

  let nextPageToken = undefined;
  let deletedCount = 0;
  let failedCount = 0;
  const failures = [];

  do {
    // listUsers returns up to 1000 users at a time
    const res = await admin.auth().listUsers(1000, nextPageToken);
    const users = res && Array.isArray(res.users) ? res.users : [];

    const targets = users.filter((u) => {
      try {
        const claims = u && u.customClaims ? u.customClaims : {};
        if (!(claims && claims.companyId === companyId)) return false;
        const email = u && u.email ? String(u.email).toLowerCase() : '';
        if (email && PROTECTED_USER_EMAILS.has(email)) return false;
        return true;
      } catch (e) {
        return false;
      }
    });

    await Promise.all(targets.map(async (u) => {
      try {
        await admin.auth().deleteUser(u.uid);
        deletedCount += 1;
      } catch (e) {
        failedCount += 1;
        failures.push({ uid: u.uid, error: e && e.message ? e.message : e });
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

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (!callerIsAdmin(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');
  }

  const email = String((data && data.email) || '').trim().toLowerCase();
  const firstName = String((data && data.firstName) || '').trim();
  const lastName = String((data && data.lastName) || '').trim();
  const displayName = (data && (data.displayName || data.name)) || `${firstName} ${lastName}`.trim() || (email ? email.split('@')[0] : '');
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;
  const avatarPreset = String((data && data.avatarPreset) || '').trim() || null;
  const providedPassword = String((data && data.password) || '').trim();

  if (!email) throw new functions.https.HttpsError('invalid-argument', 'email is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    // Read company profile for userLimit
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    const profSnap = await profRef.get();
    const rawUserLimit = profSnap.exists ? profSnap.data().userLimit : null;

    // Normalisera userLimit till ett tal om det ligger som sträng i Firestore
    let userLimit = null;
    if (typeof rawUserLimit === 'number') {
      userLimit = rawUserLimit;
    } else if (typeof rawUserLimit === 'string') {
      const m = rawUserLimit.trim().match(/-?\d+/);
      if (m && m[0]) {
        const n = parseInt(m[0], 10);
        if (!Number.isNaN(n) && Number.isFinite(n)) userLimit = n;
      }
    }

    // Count current members
    const membersRef = db.collection(`foretag/${companyId}/members`);
    const membersSnap = await membersRef.get();
    const currentCount = membersSnap.size || 0;

    if (typeof userLimit === 'number' && userLimit >= 0 && currentCount >= userLimit) {
      throw new functions.https.HttpsError('failed-precondition', 'User limit reached for company');
    }

    const tempPassword = providedPassword ? null : generateTempPassword();
    const passwordToUse = providedPassword || tempPassword;

    const role = (data && data.role) || 'user';

    let userRecord = null;
    try {
      userRecord = await admin.auth().createUser({
        email,
        password: passwordToUse,
        displayName,
      });
    } catch (createErr) {
      // Om kontot redan finns, återanvänd befintlig användare istället för att kasta fel.
      if (createErr && createErr.code === 'auth/email-already-exists') {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        throw createErr;
      }
    }

    // Set custom claims so client and other functions can resolve company membership
    try {
      const isAdminRole = role === 'admin' || role === 'superadmin';
      const claims = { companyId, admin: isAdminRole, role };
      // If company is MS Byggsystem and role is admin/superadmin, grant superadmin
      if (companyId === 'MS Byggsystem' && isAdminRole) claims.superadmin = true;
      await admin.auth().setCustomUserClaims(userRecord.uid, claims);
    } catch (e) {
      console.warn('Could not set custom claims for new user:', e?.message || e);
    }

    // Write member doc
    const memberRef = db.doc(`foretag/${companyId}/members/${userRecord.uid}`);
    await memberRef.set({
      uid: userRecord.uid,
      companyId,
      displayName: displayName || null,
      firstName: firstName || null,
      lastName: lastName || null,
      email: email || null,
      role: role,
      avatarPreset,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'createUser',
        actorUid: context.auth.uid || null,
        targetUid: userRecord.uid,
        email,
        displayName,
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { /* non-blocking */ }

    try {
      await logAdminAuditEvent({
        type: 'createUser',
        companyId,
        actorUid: context.auth.uid || null,
        targetUid: userRecord.uid,
        payload: { email, displayName, role },
      });
    } catch (_e) {}

    return { ok: true, uid: userRecord.uid, tempPassword, usedProvidedPassword: !!providedPassword };
  } catch (err) {
    console.error('createUser error', err);

    const rawCode = (err && typeof err.code === 'string') ? err.code : '';
    const msg = err && err.message ? String(err.message) : String(err || '');
    const baseMessage = `[createUser:${rawCode || 'unknown'}] ${msg || 'Okänt fel'}`;

    // Om det redan är en HttpsError, behåll koden men berika med mer info
    if (err instanceof functions.https.HttpsError) {
      const effectiveCode = err.code || 'internal';
      throw new functions.https.HttpsError(effectiveCode, baseMessage);
    }

    // Vanliga fel från Firebase Auth – mappa till mer begripliga HttpsErrors
    if (rawCode === 'auth/email-already-exists') {
      throw new functions.https.HttpsError(
        'already-exists',
        'Det finns redan ett konto med denna e-postadress.'
      );
    }
    if (rawCode === 'auth/invalid-email') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Ogiltig e-postadress. Kontrollera stavningen och försök igen.'
      );
    }
    if (rawCode === 'auth/invalid-password') {
      throw new functions.https.HttpsError(
        'invalid-argument',
        'Lösenordet uppfyller inte säkerhetskraven.'
      );
    }

    // Fallback: skicka tillbaka intern-kod med mer detaljerad text
    throw new functions.https.HttpsError('internal', baseMessage);
  }
});

// Callable: request subscription upgrade. Logs a support request and sends an email to configured recipient.
exports.requestSubscriptionUpgrade = functions.https.onCall(async (data, context) => {
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

  // Compute current usage from Firestore for accuracy
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
    ts: admin.firestore.FieldValue.serverTimestamp(),
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
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
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
});

// Allow existing superadmins to promote another user to superadmin.
// Caller must already have `superadmin` claim.
exports.setSuperadmin = functions.https.onCall(async (data, context) => {
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
});

exports.deleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  if (!callerIsAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const uid = (data && data.uid) || null;
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;

  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  // Safety: protect key accounts from deletion
  const PROTECTED_USER_EMAILS = new Set([
    'marcus@msbyggsystem.se',
  ]);

  try {
    // Optional: verify member belongs to company
    const memberRef = db.doc(`foretag/${companyId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      // allow delete but warn
    }

    // Hard block protected accounts
    try {
      const target = await admin.auth().getUser(uid);
      const email = target && target.email ? String(target.email).toLowerCase() : '';
      if (email && PROTECTED_USER_EMAILS.has(email)) {
        throw new functions.https.HttpsError('failed-precondition', 'This user account is protected and cannot be deleted');
      }
    } catch (e) {
      // If we threw an HttpsError above, rethrow. Otherwise continue to delete.
      if (e instanceof functions.https.HttpsError) throw e;
    }

    // Delete auth user
    await admin.auth().deleteUser(uid);

    // Remove member doc
    try { await memberRef.delete(); } catch (e) { /* ignore */ }

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'deleteUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) {}

    try {
      await logAdminAuditEvent({
        type: 'deleteUser',
        companyId,
        actorUid: context.auth.uid || null,
        targetUid: uid,
      });
    } catch (_e) {}

    return { ok: true };
  } catch (err) {
    console.error('deleteUser error', err);
    throw new functions.https.HttpsError('internal', err && err.message ? String(err.message) : String(err));
  }
});

// Update user details: password, email, displayName, role
exports.updateUser = functions.https.onCall(async (data, context) => {
  // Allow unauthenticated calls when running in the local emulator for testing.
  const runningInEmulator = !!process.env.FUNCTIONS_EMULATOR || !!process.env.FIREBASE_EMULATOR_HUB;
  if (!context.auth && !runningInEmulator) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  if (!runningInEmulator && !callerIsAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const uid = (data && data.uid) || null;
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;
  const password = (data && data.password) || null;
  const email = (data && data.email) || null;
  const displayName = (data && (data.displayName || data.name)) || null;
  const role = (data && data.role) || null; // 'admin' | 'user' | null
  const disabled = (data && Object.prototype.hasOwnProperty.call(data, 'disabled')) ? !!data.disabled : null;
  const photoURL = (data && Object.prototype.hasOwnProperty.call(data, 'photoURL')) ? (data.photoURL ? String(data.photoURL) : '') : null;
  const avatarPreset = (data && Object.prototype.hasOwnProperty.call(data, 'avatarPreset')) ? (data.avatarPreset ? String(data.avatarPreset) : '') : null;

  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    // Optionally verify that member doc exists under the company
    const memberRef = db.doc(`foretag/${companyId}/members/${uid}`);
    const memberSnap = await memberRef.get();

    // Update auth record (password/email/displayName)
    const updatePayload = {};
    if (password) updatePayload.password = String(password);
    if (email) updatePayload.email = String(email).toLowerCase();
    if (displayName) updatePayload.displayName = String(displayName);
    if (typeof disabled === 'boolean') updatePayload.disabled = disabled;
    if (photoURL !== null) updatePayload.photoURL = photoURL || null;
    if (Object.keys(updatePayload).length > 0) {
      await admin.auth().updateUser(uid, updatePayload);
    }

    // Update custom claims if role provided
      if (role) {
        try {
          // Merge with existing claims to avoid wiping unrelated flags (like superadmin)
          let existing = {};
          try { const urec = await admin.auth().getUser(uid); existing = urec.customClaims || {}; } catch(e) { existing = {}; }
          const isAdminRole = role === 'admin' || role === 'superadmin';
          const claims = Object.assign({}, existing, { role, admin: isAdminRole });
          claims.companyId = companyId;
          // Enforce MS Byggsystem => admin/superadmin implies superadmin claim
          if (companyId === 'MS Byggsystem' && isAdminRole) claims.superadmin = true;
          else if (claims.superadmin && companyId !== 'MS Byggsystem') delete claims.superadmin;
          await admin.auth().setCustomUserClaims(uid, claims);
        } catch (e) {
          console.warn('Could not update custom claims:', e?.message || e);
        }
      }

    // Update member doc
    const memberUpdate = {};
    if (displayName) memberUpdate.displayName = displayName;
    if (email) memberUpdate.email = email;
    if (role) memberUpdate.role = role;
    if (typeof disabled === 'boolean') memberUpdate.disabled = disabled;
    if (photoURL !== null) memberUpdate.photoURL = photoURL || null;
    if (avatarPreset !== null) memberUpdate.avatarPreset = avatarPreset || null;
    if (Object.keys(memberUpdate).length > 0) {
      await memberRef.set(Object.assign({}, memberUpdate, { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
    }

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'updateUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        changes: { password: !!password, role: role || null, email: email || null, disabled: (typeof disabled === 'boolean') ? disabled : null, photoURL: (photoURL !== null) ? (photoURL || null) : null, avatarPreset: (avatarPreset !== null) ? (avatarPreset || null) : null },
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { /* non-blocking */ }

    try {
      await logAdminAuditEvent({
        type: 'updateUser',
        companyId,
        actorUid: context.auth.uid || null,
        targetUid: uid,
        payload: { role: role || null, email: email || null, passwordChanged: !!password, disabled: (typeof disabled === 'boolean') ? disabled : null, photoURL: (photoURL !== null) ? (photoURL || null) : null, avatarPreset: (avatarPreset !== null) ? (avatarPreset || null) : null },
      });
    } catch (_e) {}

    return { ok: true };
  } catch (err) {
    console.error('updateUser error', err);
    if (err && err.code && err.code.startsWith('functions.https')) throw err;
    throw new functions.https.HttpsError('internal', err && err.message ? String(err.message) : String(err));
  }
});

// Admin helper: fetch members for a company (bypasses client-side Firestore rules)
exports.adminFetchCompanyMembers = functions.https.onCall(async (data, context) => {
  const runningInEmulator = !!process.env.FUNCTIONS_EMULATOR || !!process.env.FIREBASE_EMULATOR_HUB;
  if (!context.auth && !runningInEmulator) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  // Allow if caller is admin according to token, or if email matches known superadmin(s)
  const userEmail = (context.auth && context.auth.token && context.auth.token.email) ? String(context.auth.token.email).toLowerCase() : '';
  const isSuperadminEmail = userEmail === 'marcus@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem';
  const isAdminCall = callerIsAdmin(context) || isSuperadminEmail;
  if (!isAdminCall && !runningInEmulator) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const companyId = (data && data.companyId) || null;
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    const out = [];

    // Primary source: company-scoped members directory
    const membersRef = db.collection(`foretag/${companyId}/members`);
    const snap = await membersRef.get();
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));

    // Fallback: if no members docs exist yet, look in global users collection
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
});

// Update company status (enabled/paused/deleted) in profile.public.
// Only allowed for superadmins, MS Byggsystem-admins, or known superadmin emails.
exports.setCompanyStatus = functions.https.onCall(async (data, context) => {
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

  // Safety: MS Byggsystem must never be deleted.
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
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (e) {
    console.warn('setCompanyStatus activity log failed', { companyId, update, err: e && e.message ? e.message : e });
    // non-blocking: do not fail the function if logging fails
  }

  return { ok: true };
});

// Set or update company userLimit (max antal användare).
// Samma behörighetsmodell som setCompanyStatus: superadmin eller MS Byggsystem-admin.
exports.setCompanyUserLimit = functions.https.onCall(async (data, context) => {
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
      ts: admin.firestore.FieldValue.serverTimestamp(),
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
});

// Update company display name (companyName) in profile.public.
// Same permissions as setCompanyStatus/userLimit.
exports.setCompanyName = functions.https.onCall(async (data, context) => {
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
      ts: admin.firestore.FieldValue.serverTimestamp(),
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
});

// Permanently delete a company and its main subcollections.
// Only for superadmin / MS Byggsystem-admin. Use with care.
exports.purgeCompany = functions.https.onCall(async (data, context) => {
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

  // Safety: MS Byggsystem must never be purged.
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
    // 1) Delete Auth users that belong to this company (based on custom claims).
    try {
      await deleteAuthUsersForCompany(companyId);
    } catch (authErr) {
      console.warn('purgeCompany auth delete failed', { companyId, err: authErr && authErr.message ? authErr.message : authErr });
      // Fortsätt ändå med att radera Firestore-data, så att företaget inte fastnar halvvägs.
    }

    // 2) Delete known subcollections under the company document.
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

    // 3) Finally delete the company doc itself.
    await companyRef.delete();
  } catch (err) {
    const rawCode = err && typeof err.code === 'string' ? err.code : '';
    const msg = err && err.message ? String(err.message) : String(err || '');
    console.error('purgeCompany error', { companyId, code: rawCode, message: msg, raw: err });

    // Om det redan är en HttpsError, skicka vidare som den är.
    if (err instanceof functions.https.HttpsError) {
      throw err;
    }

    // Försök bevara ursprunglig felkod från Firestore etc, annars använd 'internal'.
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
});
