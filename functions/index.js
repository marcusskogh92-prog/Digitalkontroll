const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

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

exports.createUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (!callerIsAdmin(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');
  }

  const email = String((data && data.email) || '').trim().toLowerCase();
  const displayName = (data && (data.displayName || data.name)) || (email ? email.split('@')[0] : '');
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;

  if (!email) throw new functions.https.HttpsError('invalid-argument', 'email is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    // Read company profile for userLimit
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    const profSnap = await profRef.get();
    const userLimit = profSnap.exists ? profSnap.data().userLimit : null;

    // Count current members
    const membersRef = db.collection(`foretag/${companyId}/members`);
    const membersSnap = await membersRef.get();
    const currentCount = membersSnap.size || 0;

    if (typeof userLimit === 'number' && userLimit >= 0 && currentCount >= userLimit) {
      throw new functions.https.HttpsError('failed-precondition', 'User limit reached for company');
    }

    const tempPassword = generateTempPassword();

    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName,
    });

    // Set custom claims so client and other functions can resolve company membership
    await admin.auth().setCustomUserClaims(userRecord.uid, { companyId, admin: false, role: 'user' });

    // Write member doc
    const memberRef = db.doc(`foretag/${companyId}/members/${userRecord.uid}`);
    await memberRef.set({
      uid: userRecord.uid,
      companyId,
      displayName: displayName || null,
      email: email || null,
      role: 'user',
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

    return { ok: true, uid: userRecord.uid, tempPassword };
  } catch (err) {
    console.error('createUser error', err);
    const msg = err && err.message ? String(err.message) : String(err);
    if (err && err.code && err.code.startsWith('functions.https')) {
      throw err; // already thrown HttpsError
    }
    throw new functions.https.HttpsError('internal', msg);
  }
});

exports.deleteUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  if (!callerIsAdmin(context)) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const uid = (data && data.uid) || null;
  const companyId = (data && data.companyId) || (context.auth.token && context.auth.token.companyId) || null;

  if (!uid) throw new functions.https.HttpsError('invalid-argument', 'uid is required');
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    // Optional: verify member belongs to company
    const memberRef = db.doc(`foretag/${companyId}/members/${uid}`);
    const memberSnap = await memberRef.get();
    if (!memberSnap.exists) {
      // allow delete but warn
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
    if (Object.keys(updatePayload).length > 0) {
      await admin.auth().updateUser(uid, updatePayload);
    }

    // Update custom claims if role provided
    if (role) {
      const claims = { role: role, admin: role === 'admin' };
      // Keep companyId claim
      claims.companyId = companyId;
      await admin.auth().setCustomUserClaims(uid, claims);
    }

    // Update member doc
    const memberUpdate = {};
    if (displayName) memberUpdate.displayName = displayName;
    if (email) memberUpdate.email = email;
    if (role) memberUpdate.role = role;
    if (Object.keys(memberUpdate).length > 0) {
      await memberRef.set(Object.assign({}, memberUpdate, { updatedAt: admin.firestore.FieldValue.serverTimestamp() }), { merge: true });
    }

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'updateUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        changes: { password: !!password, role: role || null, email: email || null },
        ts: admin.firestore.FieldValue.serverTimestamp(),
      });
    } catch (e) { /* non-blocking */ }

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
  const isAdminCall = callerIsAdmin(context) || (context.auth && context.auth.token && (context.auth.token.email || '').toLowerCase() === 'marcus.skogh@msbyggsystem');
  if (!isAdminCall && !runningInEmulator) throw new functions.https.HttpsError('permission-denied', 'Caller must be an admin');

  const companyId = (data && data.companyId) || null;
  if (!companyId) throw new functions.https.HttpsError('invalid-argument', 'companyId is required');

  try {
    const membersRef = db.collection(`foretag/${companyId}/members`);
    const snap = await membersRef.get();
    const out = [];
    snap.forEach(d => out.push(Object.assign({ id: d.id }, d.data())));
    return { ok: true, members: out };
  } catch (err) {
    console.error('adminFetchCompanyMembers error', err);
    throw new functions.https.HttpsError('internal', err && err.message ? String(err.message) : String(err));
  }
});
