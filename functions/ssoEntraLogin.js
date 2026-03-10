/**
 * SSO login via Microsoft Entra (Azure AD) – Alternativ A.
 * Endast befintliga användare: verifierar id_token, hittar företag via azureTenantId,
 * hittar användare via e-post i företaget, returnerar Firebase custom token.
 */

const functions = require('firebase-functions');
const jwt = require('jsonwebtoken');
const jwksClient = require('jwks-rsa');
const { admin, db } = require('./sharedFirebase');

function getAzureClientId() {
  // Läs Firebase config först (azure.client_id) – det är det som sätts med firebase functions:config:set
  try {
    const cfg = functions.config && typeof functions.config === 'function' ? functions.config() : {};
    const fromAzure = cfg.azure && (cfg.azure.client_id || cfg.azure.clientId);
    if (fromAzure && String(fromAzure).trim()) return String(fromAzure).trim();
    const fromSharepoint = cfg.sharepoint && (cfg.sharepoint.client_id || cfg.sharepoint.clientId);
    if (fromSharepoint && String(fromSharepoint).trim()) return String(fromSharepoint).trim();
  } catch (e) {
    console.warn('[ssoEntraLogin] functions.config() failed', e && e.message);
  }
  // Fallback: miljövariabler (t.ex. satt i Cloud Console)
  const id =
    process.env.AZURE_CLIENT_ID ||
    process.env.SHAREPOINT_CLIENT_ID ||
    process.env.EXPO_PUBLIC_AZURE_CLIENT_ID;
  if (id && String(id).trim()) return String(id).trim();
  console.warn('[ssoEntraLogin] getAzureClientId: no client_id in config or env');
  return null;
}

/**
 * Return JWKS client for Azure tenant (v2.0 endpoint).
 * @param {string} tenantId - Azure AD tenant ID (tid from token).
 */
function getJwksClient(tenantId) {
  const tid = String(tenantId || '').trim();
  if (!tid) throw new Error('tenantId required for JWKS');
  return jwksClient({
    jwksUri: `https://login.microsoftonline.com/${tid}/discovery/v2.0/keys`,
    cache: true,
    cacheMaxAge: 600000,
  });
}

/**
 * Verify Azure AD v2.0 id_token and return decoded payload.
 * @param {string} idToken - Raw id_token from Azure.
 * @param {string} clientId - Our app's client_id (audience).
 */
async function verifyEntraIdToken(idToken, clientId) {
  if (!idToken || typeof idToken !== 'string') throw new Error('idToken is required');
  if (!clientId || !clientId.trim()) throw new Error('Azure client_id not configured');

  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded || !decoded.payload) throw new Error('Invalid id_token format');
  const tid = decoded.payload.tid || decoded.payload.iss && decoded.payload.iss.split('/')[2];
  if (!tid) throw new Error('id_token missing tenant id (tid)');

  const jwks = getJwksClient(tid);
  const getKey = (header, cb) => {
    jwks.getSigningKey(header.kid, (err, key) => {
      if (err) return cb(err);
      try {
        const pub = key.getPublicKey();
        return cb(null, pub);
      } catch (e) {
        return cb(e);
      }
    });
  };

  return new Promise((resolve, reject) => {
    const issuerBase = `https://login.microsoftonline.com/${tid}/v2.0`;
    jwt.verify(idToken, getKey, {
      algorithms: ['RS256'],
      audience: clientId,
      issuer: [issuerBase, issuerBase + '/'],
      ignoreExpiration: false,
    }, (err, payload) => {
      if (err) return reject(new Error(`Token verification failed: ${err.message}`));
      return resolve(payload);
    });
  });
}

/**
 * Find companyId that has this Azure tenant ID in profil.
 * Tries collection group query first; if that fails (e.g. missing index), falls back to listing foretag and checking profil.
 */
async function findCompanyIdByTenantId(tid) {
  const t = String(tid || '').trim();
  if (!t) return null;
  try {
    const snap = await db.collectionGroup('profil')
      .where('azureTenantId', '==', t)
      .limit(1)
      .get();
    if (!snap.empty) {
      const ref = snap.docs[0].ref;
      return ref.parent.parent.id || null;
    }
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e);
    if (e && (e.code === 9 || msg.includes('FAILED_PRECONDITION') || msg.includes('index'))) {
      console.warn('[ssoEntraLogin] collection group query failed (index?), falling back to foretag list', msg);
    } else {
      throw e;
    }
  }
  const foretagSnap = await db.collection('foretag').limit(200).get();
  for (const doc of foretagSnap.docs) {
    const companyId = doc.id;
    const profilSnap = await db.collection('foretag').doc(companyId).collection('profil').doc('public').get();
    if (profilSnap.exists && profilSnap.data() && String(profilSnap.data().azureTenantId || '').trim() === t) {
      return companyId;
    }
  }
  return null;
}

/**
 * Find Firebase Auth uid for user with this email in this company.
 * Looks in: 1) top-level users collection, 2) foretag/{companyId}/members (admin-UI users).
 * Tries lowercase first, then exact token email (DB may store mixed case).
 */
async function findUserUidByEmailAndCompany(email, companyId) {
  const raw = String((email || '').trim());
  const e = raw.toLowerCase();
  const c = String((companyId || '').trim());
  if (!e || !c) return null;

  // 1) Top-level users (script-created / legacy)
  let snap = await db.collection('users')
    .where('companyId', '==', c)
    .where('email', '==', e)
    .limit(1)
    .get();
  if (!snap.empty) return snap.docs[0].id;
  if (raw !== e) {
    snap = await db.collection('users')
      .where('companyId', '==', c)
      .where('email', '==', raw)
      .limit(1)
      .get();
    if (!snap.empty) return snap.docs[0].id;
  }

  // 2) Company members (admin-UI: Företagsinställningar → Användare)
  const membersRef = db.collection('foretag').doc(c).collection('members');
  snap = await membersRef.where('email', '==', e).limit(1).get();
  if (!snap.empty) {
    const doc = snap.docs[0];
    return (doc.data() && doc.data().uid) || doc.id;
  }
  if (raw !== e) {
    snap = await membersRef.where('email', '==', raw).limit(1).get();
    if (!snap.empty) {
      const doc = snap.docs[0];
      return (doc.data() && doc.data().uid) || doc.id;
    }
  }

  return null;
}

/**
 * Callable: exchange Entra id_token for Firebase custom token (Alternativ A – endast befintliga användare).
 * Body: { idToken: string }
 * Returns: { customToken: string } or throws HttpsError with user-facing message.
 */
async function ssoEntraLoginImpl(data, context) {
  try {
    const idToken = (data && data.idToken) ? String(data.idToken).trim() : null;
    if (!idToken) {
      throw new functions.https.HttpsError('invalid-argument', 'idToken krävs.');
    }

    const clientId = getAzureClientId();
    if (!clientId) {
      throw new functions.https.HttpsError('failed-precondition', 'SSO är inte konfigurerat (saknar Azure client_id).');
    }

    let payload;
    try {
      payload = await verifyEntraIdToken(idToken, clientId);
    } catch (e) {
      const msg = (e && e.message) ? e.message : String(e);
      if (msg.includes('expired') || msg.includes('jwt expired')) {
        throw new functions.https.HttpsError('unauthenticated', 'Inloggningen har gått ut. Försök igen.');
      }
      throw new functions.https.HttpsError('unauthenticated', `Ogiltig inloggning: ${msg}`);
    }

    const tid = payload.tid || null;
    const email = (payload.preferred_username || payload.email || payload.upn || '').trim();
    if (!email) {
      throw new functions.https.HttpsError('unauthenticated', 'Kunde inte läsa e-post från inloggningen.');
    }
    const emailNormalized = email.toLowerCase();

    const companyId = await findCompanyIdByTenantId(tid);
    if (!companyId) {
      throw new functions.https.HttpsError('permission-denied', 'Företaget är inte kopplat till DigitalKontroll. Kontakta din administratör.');
    }

    let uid = await findUserUidByEmailAndCompany(emailNormalized, companyId);
    if (!uid) {
      throw new functions.https.HttpsError('permission-denied', 'Du har inget konto. Kontakta din administratör för att bli tillagd.');
    }
    uid = String(uid).trim();
    if (!uid || uid.length > 128) {
      console.error('[ssoEntraLogin] invalid uid format', { uidLength: (uid && uid.length) || 0 });
      throw new functions.https.HttpsError('internal', 'Kunde inte skapa session. Försök igen.');
    }

    let customToken;
    try {
      customToken = await admin.auth().createCustomToken(uid);
    } catch (e) {
      const errMsg = (e && e.message) ? e.message : String(e);
      const errCode = (e && e.code) ? e.code : '';
      console.error('[ssoEntraLogin] createCustomToken failed', { code: errCode, message: errMsg });
      throw new functions.https.HttpsError('internal', 'Kunde inte skapa session. Försök igen.');
    }

    return { customToken };
  } catch (e) {
    if (e && e.constructor && e.constructor.name === 'HttpsError') throw e;
    console.error('[ssoEntraLogin] unexpected error', e);
    throw new functions.https.HttpsError('internal', 'Inloggning med arbetskonto misslyckades. Kontrollera att företaget har Azure Tenant ID och att användaren finns. Detaljer i Firebase Functions-loggar.');
  }
}

exports.ssoEntraLoginImpl = ssoEntraLoginImpl;
