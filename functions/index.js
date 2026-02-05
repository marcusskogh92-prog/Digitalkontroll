const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const nodemailer = require('nodemailer');

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === "true";

if (!admin.apps.length) { admin.initializeApp(); }

const db = getFirestore();
const KEEP_COMPANY_ID = 'MS Byggsystem';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeSharePointSiteSlug(rawName) {
  const s = String(rawName || '').trim();
  if (!s) return '';
  // SharePoint site "name" must be URL-friendly. Keep alnum only.
  // NOTE: this mirrors the client-side sanitization style in services/azure/siteService.js.
  return s
    .replace(/[^a-zA-Z0-9]/g, '')
    .replace(/\s+/g, '')
    .substring(0, 50)
    .toLowerCase();
}

function getSharePointHostname() {
  // Prefer a full URL when available so we can reliably extract hostname.
  const url =
    process.env.SHAREPOINT_SITE_URL ||
    process.env.EXPO_PUBLIC_SHAREPOINT_SITE_URL ||
    readFunctionsConfigValue('sharepoint.site_url', null) ||
    readFunctionsConfigValue('sharepoint.siteUrl', null) ||
    readFunctionsConfigValue('azure.sharepoint_site_url', null) ||
    readFunctionsConfigValue('azure.sharepointSiteUrl', null);
  if (url) {
    try {
      return new URL(String(url)).hostname;
    } catch (_e) {
      // fall through
    }
  }

  // As a fallback allow directly configured hostname.
  const host =
    process.env.SHAREPOINT_HOSTNAME ||
    readFunctionsConfigValue('sharepoint.hostname', null) ||
    readFunctionsConfigValue('azure.sharepoint_hostname', null);
  return host ? String(host).trim() : null;
}

function getSharePointProvisioningAccessToken() {
  const token =
    process.env.SHAREPOINT_PROVISION_ACCESS_TOKEN ||
    process.env.SHAREPOINT_GRAPH_ACCESS_TOKEN ||
    readFunctionsConfigValue('sharepoint.provision_access_token', null) ||
    readFunctionsConfigValue('sharepoint.provisionAccessToken', null) ||
    readFunctionsConfigValue('sharepoint.access_token', null) ||
    readFunctionsConfigValue('sharepoint.accessToken', null);
  return token ? String(token).trim() : null;
}

function getSharePointProvisioningOwnerEmail(actorEmail) {
  const configured =
    process.env.SHAREPOINT_OWNER_EMAIL ||
    readFunctionsConfigValue('sharepoint.owner_email', null) ||
    readFunctionsConfigValue('sharepoint.ownerEmail', null);
  const fallback = 'marcus@msbyggsystem.se';
  const actor = actorEmail ? String(actorEmail).trim() : '';
  return (configured ? String(configured).trim() : null) || (actor || null) || fallback;
}

async function graphGetSiteByUrl({ hostname, siteSlug, accessToken }) {
  const slug = String(siteSlug || '').trim();
  const host = String(hostname || '').trim();
  if (!slug || !host) throw new Error('hostname and siteSlug are required');
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${host}:/sites/${slug}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  if (!res.ok) {
    if (res.status === 404) return null;
    const txt = await res.text();
    throw new Error(`Graph getSiteByUrl failed: ${res.status} - ${txt}`);
  }
  const data = await res.json();
  return { siteId: data.id, webUrl: data.webUrl };
}

async function graphCreateTeamSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail }) {
  const payload = {
    displayName: String(displayName || '').trim(),
    name: String(siteSlug || '').trim(),
    description: String(description || '').trim(),
    siteCollection: { hostname: String(hostname || '').trim() },
    template: 'teamSite',
    ownerIdentityToResolve: { email: String(ownerEmail || '').trim() },
  };

  const res = await fetch('https://graph.microsoft.com/beta/sites', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    // Common outcomes when slug exists/URL conflicts.
    if (res.status === 409 || res.status === 400) {
      return null;
    }
    throw new Error(`Graph createSite failed: ${res.status} - ${txt}`);
  }

  const data = await res.json();
  return { siteId: data.id, webUrl: data.webUrl };
}

async function ensureSharePointSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail }) {
  const existing = await graphGetSiteByUrl({ hostname, siteSlug, accessToken });
  if (existing) return existing;

  await graphCreateTeamSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail });

  // Newly created sites can take a moment before they are resolvable via /sites/{hostname}:/sites/{slug}
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await sleep(1500);
    const after = await graphGetSiteByUrl({ hostname, siteSlug, accessToken });
    if (after) return after;
  }
  throw new Error(`SharePoint site created but not yet resolvable: ${siteSlug}`);
}

async function ensureCompanySharePointSites({ companyId, companyName, actorUid, actorEmail }) {
  const hostname = getSharePointHostname();
  const accessToken = getSharePointProvisioningAccessToken();
  const ownerEmail = getSharePointProvisioningOwnerEmail(actorEmail);
  if (!hostname) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint hostname is not configured (set SHAREPOINT_SITE_URL/EXPO_PUBLIC_SHAREPOINT_SITE_URL or sharepoint.hostname in functions config)'
    );
  }
  if (!accessToken) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint provisioning access token is not configured (set SHAREPOINT_PROVISION_ACCESS_TOKEN or sharepoint.provision_access_token in functions config)'
    );
  }

  const cfgRef = db.doc(`foretag/${companyId}/sharepoint_system/config`);
  const navRef = db.doc(`foretag/${companyId}/sharepoint_navigation/config`);
  const profRef = db.doc(`foretag/${companyId}/profil/public`);
  const metaCol = db.collection(`foretag/${companyId}/sharepoint_sites`);

  // Acquire a lightweight lock in Firestore so re-runs are safe and concurrent calls won't create duplicates.
  const lockId = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
  await db.runTransaction(async (tx) => {
    const snap = await tx.get(cfgRef);
    const cur = snap.exists ? (snap.data() || {}) : {};
    const sp = cur.sharepoint && typeof cur.sharepoint === 'object' ? cur.sharepoint : {};
    const baseOk = !!(sp.baseSite && sp.baseSite.siteId);
    const workOk = !!(sp.workspaceSite && sp.workspaceSite.siteId);
    if (baseOk && workOk) {
      return;
    }
    const inProg = sp.provisioning && sp.provisioning.state === 'in_progress';
    const startedAtMs = sp.provisioning && sp.provisioning.startedAtMs ? Number(sp.provisioning.startedAtMs) : null;
    const stale = startedAtMs && Number.isFinite(startedAtMs) ? (Date.now() - startedAtMs > 15 * 60 * 1000) : true;
    if (inProg && !stale) {
      // Another call is provisioning; let it finish.
      throw new functions.https.HttpsError('aborted', 'SharePoint provisioning already in progress');
    }

    tx.set(cfgRef, {
      sharepoint: {
        ...(sp || {}),
        provisioning: {
          state: 'in_progress',
          lockId,
          startedAt: FieldValue.serverTimestamp(),
          startedAtMs: Date.now(),
          startedBy: actorUid || null,
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid || null,
    }, { merge: true });
  });

  // Read current config (after lock)
  const cfgSnap = await cfgRef.get();
  const cfg = cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const spCfg = cfg.sharepoint && typeof cfg.sharepoint === 'object' ? cfg.sharepoint : {};

  const baseDisplayName = `${companyName}-bas`;
  const workspaceDisplayName = `${companyName}`;
  const baseSlug = normalizeSharePointSiteSlug(baseDisplayName);
  const workspaceSlug = normalizeSharePointSiteSlug(workspaceDisplayName);
  if (!baseSlug || !workspaceSlug) {
    throw new functions.https.HttpsError('invalid-argument', 'Company name could not be converted to a valid SharePoint site slug');
  }

  let baseSite = spCfg.baseSite && spCfg.baseSite.siteId ? spCfg.baseSite : null;
  let workspaceSite = spCfg.workspaceSite && spCfg.workspaceSite.siteId ? spCfg.workspaceSite : null;

  try {
    if (!baseSite) {
      const created = await ensureSharePointSite({
        hostname,
        siteSlug: baseSlug,
        displayName: baseDisplayName,
        description: `Digitalkontroll system site for ${companyName}`,
        accessToken,
        ownerEmail,
      });
      baseSite = {
        siteId: created.siteId,
        webUrl: created.webUrl,
        type: 'base',
        visibility: 'hidden',
        siteName: baseDisplayName,
        siteSlug: baseSlug,
      };
    }

    if (!workspaceSite) {
      const created = await ensureSharePointSite({
        hostname,
        siteSlug: workspaceSlug,
        displayName: workspaceDisplayName,
        description: `Digitalkontroll workspace site for ${companyName}`,
        accessToken,
        ownerEmail,
      });
      workspaceSite = {
        siteId: created.siteId,
        webUrl: created.webUrl,
        type: 'workspace',
        visibility: 'company',
        siteName: workspaceDisplayName,
        siteSlug: workspaceSlug,
      };
    }

    // Persist system-level SharePoint metadata (global-admin only).
    await cfgRef.set({
      sharepoint: {
        baseSite,
        workspaceSite,
        enabledSites: [workspaceSite.siteId],
        provisioning: {
          state: 'complete',
          lockId,
          completedAt: FieldValue.serverTimestamp(),
          completedBy: actorUid || null,
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid || null,
    }, { merge: true });

    // Seed SharePoint Navigation so the UI immediately shows exactly one site.
    const navSnap = await navRef.get();
    const nav = navSnap.exists ? (navSnap.data() || {}) : {};
    const existingEnabled = Array.isArray(nav.enabledSites) ? nav.enabledSites.map((x) => String(x || '').trim()).filter(Boolean) : [];

    // Only auto-seed if empty (new companies). Never include base site.
    let enabledSites = existingEnabled;
    if (enabledSites.length === 0) {
      enabledSites = [workspaceSite.siteId];
    } else {
      enabledSites = enabledSites.filter((sid) => sid !== baseSite.siteId);
      if (!enabledSites.includes(workspaceSite.siteId)) enabledSites = [...enabledSites, workspaceSite.siteId];
    }

    const siteConfigs = (nav.siteConfigs && typeof nav.siteConfigs === 'object') ? nav.siteConfigs : {};
    const nextSiteConfigs = {
      ...siteConfigs,
      [workspaceSite.siteId]: {
        ...(siteConfigs[workspaceSite.siteId] || {}),
        siteId: workspaceSite.siteId,
        webUrl: workspaceSite.webUrl || null,
        siteName: workspaceSite.siteName || companyName,
      },
    };
    // Ensure base site never exists in configs.
    if (baseSite && baseSite.siteId && nextSiteConfigs[baseSite.siteId]) {
      delete nextSiteConfigs[baseSite.siteId];
    }

    await navRef.set({
      enabledSites,
      siteConfigs: nextSiteConfigs,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid || null,
    }, { merge: true });

    // Backwards-compatible fields used in other parts of the app.
    await profRef.set({
      sharePointSiteId: workspaceSite.siteId,
      sharePointSiteWebUrl: workspaceSite.webUrl || null,
      // New canonical linkage object
      primarySharePointSite: {
        siteId: workspaceSite.siteId,
        siteUrl: workspaceSite.webUrl || null,
        linkedAt: FieldValue.serverTimestamp(),
        linkedBy: actorUid || null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    // Seed Digitalkontroll-owned visibility metadata
    try {
      if (workspaceSite && workspaceSite.siteId) {
        await metaCol.doc(workspaceSite.siteId).set({
          siteId: workspaceSite.siteId,
          siteUrl: workspaceSite.webUrl || null,
          siteName: workspaceSite.siteName || companyName,
          role: 'projects',
          visibleInLeftPanel: true,
          systemManaged: true,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actorUid || null,
        }, { merge: true });
      }
      if (baseSite && baseSite.siteId) {
        await metaCol.doc(baseSite.siteId).set({
          siteId: baseSite.siteId,
          siteUrl: baseSite.webUrl || null,
          siteName: baseSite.siteName || baseDisplayName,
          role: 'system',
          visibleInLeftPanel: false,
          systemManaged: true,
          updatedAt: FieldValue.serverTimestamp(),
          updatedBy: actorUid || null,
        }, { merge: true });
      }
    } catch (_e) {
      // Non-fatal: UI will attempt to sync later.
    }

    return { baseSite, workspaceSite };
  } catch (e) {
    await cfgRef.set({
      sharepoint: {
        ...(spCfg || {}),
        provisioning: {
          state: 'error',
          lockId,
          errorAt: FieldValue.serverTimestamp(),
          errorBy: actorUid || null,
          errorMessage: String(e && e.message ? e.message : e),
        },
      },
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid || null,
    }, { merge: true });
    throw e;
  }
}

// Callable: ensure sharepoint_sites visibility metadata is correct for a company.
// This enables the UI to filter left-panel sites without relying on SharePoint Navigation.
exports.syncSharePointSiteVisibility = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const companyId = (data && data.companyId) ? String(data.companyId).trim() : '';
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  // Allow company members or global admins to trigger the sync.
  const token = context.auth.token || {};
  const isGlobal = !!token.globalAdmin || !!token.superadmin || token.role === 'superadmin' || (token.companyId === 'MS Byggsystem' && (token.admin === true || token.role === 'admin'));
  const isMember = token.companyId === companyId;
  if (!isMember && !isGlobal) {
    throw new functions.https.HttpsError('permission-denied', 'Not allowed');
  }

  const cfgRef = db.doc(`foretag/${companyId}/sharepoint_system/config`);
  const profRef = db.doc(`foretag/${companyId}/profil/public`);
  const navRef = db.doc(`foretag/${companyId}/sharepoint_navigation/config`);
  const metaCol = db.collection(`foretag/${companyId}/sharepoint_sites`);

  const cfgSnap = await cfgRef.get().catch(() => null);
  const cfg = cfgSnap && cfgSnap.exists ? (cfgSnap.data() || {}) : {};
  const sp = cfg.sharepoint && typeof cfg.sharepoint === 'object' ? cfg.sharepoint : {};
  const baseSite = sp.baseSite && sp.baseSite.siteId ? sp.baseSite : null;
  const workspaceSite = sp.workspaceSite && sp.workspaceSite.siteId ? sp.workspaceSite : null;

  // Write metadata for known system sites
  const writes = [];
  if (workspaceSite && workspaceSite.siteId) {
    writes.push(
      metaCol.doc(workspaceSite.siteId).set({
        siteId: workspaceSite.siteId,
        siteUrl: workspaceSite.webUrl || null,
        siteName: workspaceSite.siteName || null,
        role: 'projects',
        visibleInLeftPanel: true,
        systemManaged: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true })
    );
  }
  if (baseSite && baseSite.siteId) {
    writes.push(
      metaCol.doc(baseSite.siteId).set({
        siteId: baseSite.siteId,
        siteUrl: baseSite.webUrl || null,
        siteName: baseSite.siteName || null,
        role: 'system',
        visibleInLeftPanel: false,
        systemManaged: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true })
    );
  }

  await Promise.all(writes);

  // Ensure any existing metadata docs have a role field.
  // Default is 'system' unless it's the known workspace site.
  try {
    const snap = await metaCol.get();
    const batch = db.batch();
    let changed = 0;
    snap.forEach((docSnap) => {
      const d = docSnap.data() || {};
      const rid = docSnap.id;
      const roleRaw = (d.role !== undefined && d.role !== null) ? String(d.role).trim() : '';
      if (roleRaw) return;

      const inferred = (workspaceSite && workspaceSite.siteId && rid === workspaceSite.siteId)
        ? 'projects'
        : 'system';
      batch.set(metaCol.doc(rid), {
        role: inferred,
        // Never allow system sites to become visible by mistake
        visibleInLeftPanel: inferred === 'projects' ? (d.visibleInLeftPanel === true) : false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true });
      changed += 1;
    });
    if (changed > 0) await batch.commit();
  } catch (_e) {}

  // Ensure legacy nav config never includes base site, and includes workspace.
  if (workspaceSite && workspaceSite.siteId) {
    try {
      const navSnap = await navRef.get();
      const nav = navSnap.exists ? (navSnap.data() || {}) : {};
      const enabled = Array.isArray(nav.enabledSites) ? nav.enabledSites.map((x) => String(x || '').trim()).filter(Boolean) : [];
      let nextEnabled = enabled;
      if (baseSite && baseSite.siteId) nextEnabled = nextEnabled.filter((sid) => sid !== baseSite.siteId);
      if (!nextEnabled.includes(workspaceSite.siteId)) nextEnabled = [...nextEnabled, workspaceSite.siteId];
      if (nextEnabled.length === 0) nextEnabled = [workspaceSite.siteId];
      await navRef.set({ enabledSites: nextEnabled, updatedAt: FieldValue.serverTimestamp(), updatedBy: context.auth.uid }, { merge: true });
    } catch (_e) {}
  }

  // Ensure profile has primarySharePointSite for workspace if available
  if (workspaceSite && workspaceSite.siteId) {
    try {
      await profRef.set({
        primarySharePointSite: {
          siteId: workspaceSite.siteId,
          siteUrl: workspaceSite.webUrl || null,
          linkedAt: FieldValue.serverTimestamp(),
          linkedBy: context.auth.uid,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch (_e) {}
  }

  return { ok: true, companyId, workspaceSiteId: workspaceSite?.siteId || null, baseSiteId: baseSite?.siteId || null };
});

// Helper to write a global admin audit event. This is separate from the
// per-company /foretag/{company}/activity feed and is intended for
// superadmin/verktyg-översikt i webbgränssnittet.
async function logAdminAuditEvent(event) {
  try {
    const payload = Object.assign(
      {
        ts: FieldValue.serverTimestamp(),
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
    const profRef = db.doc(`foretag/${companyId}/profil/public`);
    await profRef.set({ companyName, createdAt: FieldValue.serverTimestamp(), enabled: true }, { merge: true });

    // 2) Initialize hierarchy state
    const hierRef = db.doc(`foretag/${companyId}/hierarki/state`);
    await hierRef.set({ items: [], updatedAt: FieldValue.serverTimestamp() }, { merge: true });

    // 3) Minimal 'mallar' placeholder so UI won't break
    const mallarRef = db.doc(`foretag/${companyId}/mallar/defaults`);
    await mallarRef.set({ createdAt: FieldValue.serverTimestamp(), templates: [] }, { merge: true });

    if (IS_EMULATOR === true) {
      console.log('Emulator mode: skipping SharePoint provisioning');
      return { success: true, skippedSharePoint: true };
    }

    // 4) SharePoint provisioning (Step 1): ensure base + workspace sites exist.
    //    This is idempotent and safe to re-run.
    await ensureCompanySharePointSites({
      companyId,
      companyName,
      actorUid: callerUid,
      actorEmail: callerEmail,
    });

    // 5) Do NOT automatically add the caller as a member or change their
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

function encodeGraphPath(path) {
  const clean = String(path || '')
    .replace(/^\/+/, '')
    .replace(/\/+$/, '')
    .trim();
  if (!clean) return '';
  return clean
    .split('/')
    .map((seg) => encodeURIComponent(seg))
    .join('/');
}

async function graphDeleteSite({ siteId, accessToken }) {
  const sid = String(siteId || '').trim();
  if (!sid) return;
  const res = await fetch(`https://graph.microsoft.com/v1.0/sites/${sid}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Graph delete site failed: ${res.status} - ${txt}`);
  }
}

async function graphGetChildren({ siteId, path, accessToken }) {
  const sid = String(siteId || '').trim();
  if (!sid) throw new Error('siteId is required');
  const clean = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '').trim();
  const endpoint = clean
    ? `https://graph.microsoft.com/v1.0/sites/${sid}/drive/root:/${encodeGraphPath(clean)}:/children`
    : `https://graph.microsoft.com/v1.0/sites/${sid}/drive/root/children`;
  const res = await fetch(endpoint, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });
  if (res.status === 404) {
    return [];
  }
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Graph list children failed: ${res.status} - ${txt}`);
  }
  const data = await res.json();
  return data?.value || [];
}

async function graphDeleteItem({ siteId, itemId, accessToken }) {
  const sid = String(siteId || '').trim();
  const iid = String(itemId || '').trim();
  if (!sid || !iid) throw new Error('siteId and itemId are required');
  const endpoint = `https://graph.microsoft.com/v1.0/sites/${sid}/drive/items/${iid}`;
  const res = await fetch(endpoint, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok && res.status !== 404) {
    const txt = await res.text();
    throw new Error(`Graph delete item failed: ${res.status} - ${txt}`);
  }
}

async function deleteDriveTreeByPathAdmin({ siteId, path, accessToken }) {
  const children = await graphGetChildren({ siteId, path, accessToken });
  for (const item of children || []) {
    const name = String(item?.name || '').trim();
    if (!name) continue;
    const isFolder = !!item?.folder;
    const childPath = path ? `${path}/${name}` : name;
    if (isFolder) {
      await deleteDriveTreeByPathAdmin({ siteId, path: childPath, accessToken });
    }
    if (item?.id) {
      await graphDeleteItem({ siteId, itemId: item.id, accessToken });
    }
  }
}

async function ensureFolderPathAdmin({ siteId, path, accessToken }) {
  const parts = String(path || '').split('/').map((p) => String(p || '').trim()).filter(Boolean);
  if (parts.length === 0) return;
  let current = '';
  for (const part of parts) {
    current = current ? `${current}/${part}` : part;
    const encoded = encodeGraphPath(current);
    const checkEndpoint = `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encoded}:`;
    const checkRes = await fetch(checkEndpoint, {
      method: 'GET',
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (checkRes.ok) {
      continue;
    }
    const parentPath = current.split('/').slice(0, -1).join('/');
    const createEndpoint = parentPath
      ? `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root:/${encodeGraphPath(parentPath)}:/children`
      : `https://graph.microsoft.com/v1.0/sites/${siteId}/drive/root/children`;
    const createRes = await fetch(createEndpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: part,
        folder: {},
        '@microsoft.graph.conflictBehavior': 'replace',
      }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text();
      throw new Error(`Graph create folder failed: ${createRes.status} - ${txt}`);
    }
  }
}

async function ensureDkBasStructureAdmin({ siteId, accessToken }) {
  const folders = [
    'Arkiv',
    'Arkiv/Projekt',
    'Arkiv/Mappar',
    'Arkiv/Filer',
    'Metadata',
    'System',
  ];
  for (const folder of folders) {
    await ensureFolderPathAdmin({ siteId, path: folder, accessToken });
  }
}

async function getCompanySiteIdsFromConfig(companyId) {
  const cfgRef = db.doc(`foretag/${companyId}/sharepoint_system/config`);
  const snap = await cfgRef.get().catch(() => null);
  const cfg = snap && snap.exists ? (snap.data() || {}) : {};
  const sp = cfg.sharepoint && typeof cfg.sharepoint === 'object' ? cfg.sharepoint : {};
  const baseSiteId = sp.baseSite && sp.baseSite.siteId ? String(sp.baseSite.siteId).trim() : '';
  const workspaceSiteId = sp.workspaceSite && sp.workspaceSite.siteId ? String(sp.workspaceSite.siteId).trim() : '';
  return { baseSiteId: baseSiteId || null, workspaceSiteId: workspaceSiteId || null };
}

async function purgeCompanyFirestore(companyId) {
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
    `foretag/${companyId}/sharepoint_sites`,
    `foretag/${companyId}/sharepoint_navigation`,
    `foretag/${companyId}/sharepoint_system`,
  ];
  for (const path of subcollections) {
    await deleteCollection(path);
  }
  await companyRef.delete();
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
      createdAt: FieldValue.serverTimestamp(),
    });

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'createUser',
        actorUid: context.auth.uid || null,
        targetUid: userRecord.uid,
        email,
        displayName,
        ts: FieldValue.serverTimestamp(),
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
        ts: FieldValue.serverTimestamp(),
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
      await memberRef.set(Object.assign({}, memberUpdate, { updatedAt: FieldValue.serverTimestamp() }), { merge: true });
    }

    // Log activity
    try {
      await db.collection(`foretag/${companyId}/activity`).add({
        type: 'updateUser',
        actorUid: context.auth.uid || null,
        targetUid: uid,
        changes: { password: !!password, role: role || null, email: email || null, disabled: (typeof disabled === 'boolean') ? disabled : null, photoURL: (photoURL !== null) ? (photoURL || null) : null, avatarPreset: (avatarPreset !== null) ? (avatarPreset || null) : null },
        ts: FieldValue.serverTimestamp(),
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
      ts: FieldValue.serverTimestamp(),
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

// DEV-only: reset all non-MS Byggsystem companies and clean SharePoint.
exports.devResetAdmin = functions.https.onCall(async (data, context) => {
  console.log('[DEV-RESET][ADMIN] start');

  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const projectId = (() => {
    const raw = String(process.env.FIREBASE_CONFIG || '').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        if (parsed && parsed.projectId) return String(parsed.projectId);
      } catch (_e) {}
    }
    return String(process.env.GCLOUD_PROJECT || '');
  })();
  const isDevEnv = String(process.env.FUNCTIONS_EMULATOR || '') === 'true' || projectId === 'digitalkontroll-8fd05';
  if (!isDevEnv) {
    throw new functions.https.HttpsError('failed-precondition', 'DEV-reset only allowed in development');
  }

  const token = context.auth.token || {};
  const callerIsSuper = !!token.superadmin || token.role === 'superadmin';
  if (!callerIsSuper) {
    throw new functions.https.HttpsError('permission-denied', 'Superadmin required');
  }

  const accessToken = getSharePointProvisioningAccessToken();
  if (!accessToken) {
    throw new functions.https.HttpsError('failed-precondition', 'SharePoint provisioning access token missing');
  }

  const companiesSnap = await db.collection('foretag').get();
  const companies = companiesSnap.docs.map((docSnap) => ({
    id: docSnap.id,
    ...docSnap.data(),
  }));

  // Step 1: delete all companies except MS Byggsystem.
  for (const company of companies) {
    const companyId = String(company?.id || '').trim();
    if (!companyId) continue;
    if (companyId === KEEP_COMPANY_ID) continue;

    console.log('[DEV-RESET][ADMIN] deleting company', companyId);

    const { workspaceSiteId, baseSiteId } = await getCompanySiteIdsFromConfig(companyId);

    try {
      await purgeCompanyFirestore(companyId);
    } catch (e) {
      console.error('[DEV-RESET][ADMIN] Firestore purge failed', companyId, e?.message || e);
      throw new functions.https.HttpsError('internal', `Firestore purge failed for ${companyId}: ${e?.message || e}`);
    }

    try {
      if (workspaceSiteId) await graphDeleteSite({ siteId: workspaceSiteId, accessToken });
      if (baseSiteId) await graphDeleteSite({ siteId: baseSiteId, accessToken });
    } catch (e) {
      console.error('[DEV-RESET][ADMIN] SharePoint delete failed', companyId, e?.message || e);
      throw new functions.https.HttpsError('internal', `SharePoint delete failed for ${companyId}: ${e?.message || e}`);
    }

    console.log('[DEV-RESET][ADMIN] company done', companyId);
  }

  // Step 2: MS Byggsystem DK Site - hard delete all content.
  const msSites = await getCompanySiteIdsFromConfig(KEEP_COMPANY_ID);
  if (msSites.workspaceSiteId) {
    console.log('[DEV-RESET][ADMIN] cleaning MS DK Site');
    await deleteDriveTreeByPathAdmin({ siteId: msSites.workspaceSiteId, path: '', accessToken });
  }

  // Step 3: MS Byggsystem DK Bas - clear Arkiv contents, then ensure structure.
  if (msSites.baseSiteId) {
    console.log('[DEV-RESET][ADMIN] cleaning MS DK Bas Arkiv');
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Projekt', accessToken });
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Mappar', accessToken });
    await deleteDriveTreeByPathAdmin({ siteId: msSites.baseSiteId, path: 'Arkiv/Filer', accessToken });
    console.log('[DEV-RESET][ADMIN] ensuring MS DK Bas');
    await ensureDkBasStructureAdmin({ siteId: msSites.baseSiteId, accessToken });
  }

  console.log('[DEV-RESET][ADMIN] completed');
  return { ok: true };
});
