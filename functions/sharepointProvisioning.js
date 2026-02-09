const functions = require('firebase-functions');
const { db, FieldValue } = require('./sharedFirebase');
const {
  getSharePointHostname,
  getSharePointGraphAccessToken,
  getSharePointProvisioningOwnerEmail,
} = require('./sharedConfig');
const { sleep, normalizeSharePointSiteSlug } = require('./sharedUtils');
const { graphGetSiteByUrl, graphCreateTeamSite } = require('./sharepointGraph');

const IS_EMULATOR = process.env.FUNCTIONS_EMULATOR === 'true';

/** Callable: create a single SharePoint site and return siteId/webUrl/siteName. Client then calls upsertCompanySharePointSiteMeta. */
async function createSharePointSiteImpl(data, context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Du måste vara inloggad för att skapa en site.');
  }
  const token = context.auth.token || {};
  const isSuperadmin = !!token.superadmin || token.role === 'superadmin';
  const callerCompanyId = token.companyId || null;
  const callerIsCompanyAdmin = !!(token.admin === true || token.role === 'admin');
  const companyId = (data && data.companyId) ? String(data.companyId).trim() : null;
  const companyName = (data && data.companyName) ? String(data.companyName).trim() : (companyId || '');
  const siteNamePart = (data && data.siteNamePart) ? String(data.siteNamePart).trim() : null;
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId saknas');
  }
  if (!siteNamePart || siteNamePart.length < 1) {
    throw new functions.https.HttpsError('invalid-argument', 'siteNamePart (namn på site) saknas');
  }
  const canAct = isSuperadmin || (callerCompanyId === companyId && callerIsCompanyAdmin);
  if (!canAct) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin eller företagsadmin för det valda företaget kan skapa siter.');
  }

  const baseName = companyName || companyId;
  const displayName = `${baseName} – DK ${siteNamePart}`;
  const slug = normalizeSharePointSiteSlug(displayName);
  if (!slug || slug.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Namnet gav en ogiltig site-URL. Använd minst två bokstaver eller siffror.');
  }

  const hostname = getSharePointHostname();
  let accessToken;
  try {
    accessToken = await getSharePointGraphAccessToken();
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e);
    throw new functions.https.HttpsError(
      'failed-precondition',
      `SharePoint-token kunde inte hämtas: ${msg}. Sätt antingen sharepoint.provision_access_token eller sharepoint.tenant_id + sharepoint.client_id + sharepoint.client_secret.`
    );
  }
  if (!accessToken) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint-token saknas. Sätt sharepoint.provision_access_token eller tenant_id, client_id och client_secret (Azure App).'
    );
  }
  const actorEmail = token.email || null;
  const ownerEmail = getSharePointProvisioningOwnerEmail(actorEmail);
  if (!hostname) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint hostname är inte konfigurerat (SHAREPOINT_SITE_URL eller sharepoint.site_url).'
    );
  }

  if (IS_EMULATOR) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'Skapande av SharePoint-site stöds inte i emulator. Kör mot riktig Firebase.'
    );
  }

  try {
    const created = await ensureSharePointSite({
      hostname,
      siteSlug: slug,
      displayName,
      description: `Digitalkontroll site för ${baseName}`,
      accessToken,
      ownerEmail,
    });
    return {
      ok: true,
      siteId: created.siteId,
      webUrl: created.webUrl || null,
      siteName: displayName,
    };
  } catch (err) {
    if (err instanceof functions.https.HttpsError) throw err;
    const msg = (err && err.message) ? String(err.message) : String(err);
    throw new functions.https.HttpsError('failed-precondition', `SharePoint: ${msg}`);
  }
}

async function ensureSharePointSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail }) {
  const existing = await graphGetSiteByUrl({ hostname, siteSlug, accessToken });
  if (existing) return existing;

  const created = await graphCreateTeamSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail });
  if (created) return created;
  throw new Error('SharePoint accepterade inte skapandet (site finns kanske redan eller ogiltigt namn). Kontrollera konfiguration och Graph-behörigheter.');
}

async function ensureCompanySharePointSites({ companyId, companyName, actorUid, actorEmail }) {
  const hostname = getSharePointHostname();
  if (!hostname) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint hostname is not configured (set SHAREPOINT_SITE_URL or sharepoint.site_url in functions config)'
    );
  }
  let accessToken;
  try {
    accessToken = await getSharePointGraphAccessToken();
  } catch (e) {
    const msg = (e && e.message) ? String(e.message) : String(e);
    throw new functions.https.HttpsError(
      'failed-precondition',
      `SharePoint token could not be obtained: ${msg}. Set sharepoint.provision_access_token or sharepoint.tenant_id, client_id and client_secret.`
    );
  }
  if (!accessToken) {
    throw new functions.https.HttpsError(
      'failed-precondition',
      'SharePoint token is missing. Set sharepoint.provision_access_token or tenant_id, client_id and client_secret (Azure App).'
    );
  }
  const ownerEmail = getSharePointProvisioningOwnerEmail(actorEmail);

  const cfgRef = db.doc(`foretag/${companyId}/sharepoint_system/config`);
  const navRef = db.doc(`foretag/${companyId}/sharepoint_navigation/config`);
  const profRef = db.doc(`foretag/${companyId}/profil/public`);
  const metaCol = db.collection(`foretag/${companyId}/sharepoint_sites`);

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

    const navSnap = await navRef.get();
    const nav = navSnap.exists ? (navSnap.data() || {}) : {};
    const existingEnabled = Array.isArray(nav.enabledSites) ? nav.enabledSites.map((x) => String(x || '').trim()).filter(Boolean) : [];

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
    if (baseSite && baseSite.siteId && nextSiteConfigs[baseSite.siteId]) {
      delete nextSiteConfigs[baseSite.siteId];
    }

    await navRef.set({
      enabledSites,
      siteConfigs: nextSiteConfigs,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: actorUid || null,
    }, { merge: true });

    await profRef.set({
      sharePointSiteId: workspaceSite.siteId,
      sharePointSiteWebUrl: workspaceSite.webUrl || null,
      primarySharePointSite: {
        siteId: workspaceSite.siteId,
        siteUrl: workspaceSite.webUrl || null,
        linkedAt: FieldValue.serverTimestamp(),
        linkedBy: actorUid || null,
      },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

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
      // Non-fatal
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

module.exports = {
  ensureCompanySharePointSites,
  createSharePointSiteImpl,
};
