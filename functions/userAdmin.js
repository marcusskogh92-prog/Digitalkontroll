const functions = require('firebase-functions');
const { admin, db, FieldValue } = require('./sharedFirebase');
const { callerIsAdmin, generateTempPassword } = require('./sharedUtils');
const { logAdminAuditEvent } = require('./adminAudit');

async function createUser(data, context) {
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
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    const profSnap = await profRef.get();
    const rawUserLimit = profSnap.exists ? profSnap.data().userLimit : null;

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
      if (createErr && createErr.code === 'auth/email-already-exists') {
        userRecord = await admin.auth().getUserByEmail(email);
      } else {
        throw createErr;
      }
    }

    try {
      const isAdminRole = role === 'admin' || role === 'superadmin';
      const claims = { companyId, admin: isAdminRole, role };
      if (companyId === 'MS Byggsystem' && isAdminRole) claims.superadmin = true;
      await admin.auth().setCustomUserClaims(userRecord.uid, claims);
    } catch (e) {
      console.warn('Could not set custom claims for new user:', e?.message || e);
    }

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
      createdAt: FieldValue.serverTimestamp(),
    });

    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'createUser',
        actorUid: context.auth.uid || null,
        targetUid: userRecord.uid,
        email,
        displayName,
        ts: FieldValue.serverTimestamp(),
      });
    } catch (_e) { /* non-blocking */ }

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

    if (err instanceof functions.https.HttpsError) {
      const effectiveCode = err.code || 'internal';
      throw new functions.https.HttpsError(effectiveCode, baseMessage);
    }

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

    throw new functions.https.HttpsError('internal', baseMessage);
  }
}

async function deleteUser(data, context) {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  if (!callerIsAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const uid = (data && data.uid) || null;
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;

  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  const PROTECTED_USER_EMAILS = new Set([
    'marcus@msbyggsystem.se',
  ]);

  try {
    const memberRef = db.doc(`foretag/${companyId}/members/${uid}`);
    try { await memberRef.get(); } catch (_e) { /* ignore */ }

    try {
      const target = await admin.auth().getUser(uid);
      const email = target && target.email ? String(target.email).toLowerCase() : '';
      if (email && PROTECTED_USER_EMAILS.has(email)) {
        throw new functions.https.HttpsError('failed-precondition', 'This user account is protected and cannot be deleted');
      }
    } catch (_e) {
      if (_e instanceof functions.https.HttpsError) throw _e;
    }

    await admin.auth().deleteUser(uid);

    try { await memberRef.delete(); } catch (_e) { /* ignore */ }

    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'deleteUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        ts: FieldValue.serverTimestamp(),
      });
    } catch (_e) {}

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
}

async function updateUser(data, context) {
  const runningInEmulator = !!process.env.FUNCTIONS_EMULATOR || !!process.env.FIREBASE_EMULATOR_HUB;
  if (!context.auth && !runningInEmulator) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  if (!runningInEmulator && !callerIsAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const uid = (data && data.uid) || null;
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;
  const password = (data && data.password) || null;
  const email = (data && data.email) || null;
  const displayName = (data && (data.displayName || data.name)) || null;
  const role = (data && data.role) || null;
  const disabled = (data && Object.prototype.hasOwnProperty.call(data, 'disabled')) ? !!data.disabled : null;
  const photoURL = (data && Object.prototype.hasOwnProperty.call(data, 'photoURL')) ? (data.photoURL ? String(data.photoURL) : '') : null;
  const avatarPreset = (data && Object.prototype.hasOwnProperty.call(data, 'avatarPreset')) ? (data.avatarPreset ? String(data.avatarPreset) : '') : null;

  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    const memberRef = db.doc(`foretag/${companyId}/members/${uid}`);
    try { await memberRef.get(); } catch (_e) {}

    const updatePayload = {};
    if (password) updatePayload.password = String(password);
    if (email) updatePayload.email = String(email).toLowerCase();
    if (displayName) updatePayload.displayName = String(displayName);
    if (typeof disabled === 'boolean') updatePayload.disabled = disabled;
    if (photoURL !== null) updatePayload.photoURL = photoURL || null;
    if (Object.keys(updatePayload).length > 0) {
      await admin.auth().updateUser(uid, updatePayload);
    }

    if (role) {
      try {
        let existing = {};
        try { const urec = await admin.auth().getUser(uid); existing = urec.customClaims || {}; } catch (_e) { existing = {}; }
        const isAdminRole = role === 'admin' || role === 'superadmin';
        const claims = Object.assign({}, existing, { role, admin: isAdminRole });
        claims.companyId = companyId;
        if (companyId === 'MS Byggsystem' && isAdminRole) claims.superadmin = true;
        else if (claims.superadmin && companyId !== 'MS Byggsystem') delete claims.superadmin;
        await admin.auth().setCustomUserClaims(uid, claims);
      } catch (_e) {
        console.warn('Could not update custom claims:', _e?.message || _e);
      }
    }

    const memberUpdate = {};
    if (displayName) memberUpdate.displayName = displayName;
    if (email) memberUpdate.email = email;
    if (role) memberUpdate.role = role;
    if (typeof disabled === 'boolean') memberUpdate.disabled = disabled;
    if (photoURL !== null) memberUpdate.photoURL = photoURL || null;
    if (avatarPreset !== null) memberUpdate.avatarPreset = avatarPreset || null;
    if (Object.keys(memberUpdate).length > 0) {
      await memberRef.set(Object.assign({}, memberUpdate, { updatedAt: FieldValue.serverTimestamp() }), { merge: true });
    }

    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'updateUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        changes: { password: !!password, role: role || null, email: email || null, disabled: (typeof disabled === 'boolean') ? disabled : null, photoURL: (photoURL !== null) ? (photoURL || null) : null, avatarPreset: (avatarPreset !== null) ? (avatarPreset || null) : null },
        ts: FieldValue.serverTimestamp(),
      });
    } catch (_e) { /* non-blocking */ }

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
}

module.exports = {
  createUser,
  deleteUser,
  updateUser,
};
