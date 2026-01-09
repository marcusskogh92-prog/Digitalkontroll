const functions = require('firebase-functions');
const admin = require('firebase-admin');

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
  if (!isSuperadmin && !(callerCompanyId === allowedMsCompanyId && callerIsCompanyAdmin)) {
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

    // 4) Add caller as member and ensure users/{uid} exists
    let callerUser = null;
    try { callerUser = await admin.auth().getUser(callerUid); } catch (e) { callerUser = null; }

    const memberRef = firestore.doc(`foretag/${companyId}/members/${callerUid}`);
    await memberRef.set({
      uid: callerUid,
      companyId,
      displayName: callerUser && callerUser.displayName ? callerUser.displayName : null,
      email: callerUser && callerUser.email ? callerUser.email : null,
      role: 'admin',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    const userDocRef = firestore.doc(`users/${callerUid}`);
    await userDocRef.set({ uid: callerUid, companyId, email: callerUser && callerUser.email ? callerUser.email : null, displayName: callerUser && callerUser.displayName ? callerUser.displayName : null }, { merge: true });

    // 5) Set custom claims for the caller (grant admin role for this company)
    try {
      // Merge existing custom claims so we don't wipe e.g. superadmin flag
      let existingClaims = {};
      try {
        const existingUser = await admin.auth().getUser(callerUid);
        existingClaims = existingUser.customClaims || {};
      } catch (e) { existingClaims = {}; }
      const claims = Object.assign({}, existingClaims, { companyId, role: 'admin', admin: true });
      // If caller was previously a global superadmin, keep that flag
      if (existingClaims.superadmin) claims.superadmin = true;
      // If caller belongs to MS Byggsystem and is admin, ensure superadmin
      if (claims.companyId === 'MS Byggsystem' && claims.role === 'admin') claims.superadmin = true;
      await admin.auth().setCustomUserClaims(callerUid, claims);
    } catch (e) {
      // Non-fatal: claim setting may fail if not permitted, but provisioning still succeeded.
      console.warn('Could not set custom claims:', e?.message || e);
    }

    return { ok: true, companyId, uid: callerUid };
  } catch (err) {
    console.error('provisionCompany failed', err);
    throw new functions.https.HttpsError('internal', String(err?.message || err));
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

    const role = (data && data.role) || 'user';

    const userRecord = await admin.auth().createUser({
      email,
      password: tempPassword,
      displayName,
    });

    // Set custom claims so client and other functions can resolve company membership
    try {
      const claims = { companyId, admin: role === 'admin', role };
      // If company is MS Byggsystem and role is admin, grant superadmin
      if (companyId === 'MS Byggsystem' && role === 'admin') claims.superadmin = true;
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
      email: email || null,
      role: role,
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
        try {
          // Merge with existing claims to avoid wiping unrelated flags (like superadmin)
          let existing = {};
          try { const urec = await admin.auth().getUser(uid); existing = urec.customClaims || {}; } catch(e) { existing = {}; }
          const claims = Object.assign({}, existing, { role: role, admin: role === 'admin' });
          claims.companyId = companyId;
          // Enforce MS Byggsystem => admin implies superadmin
          if (companyId === 'MS Byggsystem' && role === 'admin') claims.superadmin = true;
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
  const userEmail = (context.auth && context.auth.token && context.auth.token.email) ? String(context.auth.token.email).toLowerCase() : '';
  const isSuperadminEmail = userEmail === 'marcus.skogh@msbyggsystem.se' || userEmail === 'marcus.skogh@msbyggsystem';
  const isAdminCall = callerIsAdmin(context) || isSuperadminEmail;
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
