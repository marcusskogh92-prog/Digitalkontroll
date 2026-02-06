const functions = require('firebase-functions');
const { db, FieldValue } = require('./sharedFirebase');
const {
  getSharePointHostname,
  getSharePointProvisioningAccessToken,
  getSharePointProvisioningOwnerEmail,
} = require('./sharedConfig');
const { sleep, normalizeSharePointSiteSlug } = require('./sharedUtils');
const { graphGetSiteByUrl, graphCreateTeamSite } = require('./sharepointGraph');

async function ensureSharePointSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail }) {
  const existing = await graphGetSiteByUrl({ hostname, siteSlug, accessToken });
  if (existing) return existing;

  await graphCreateTeamSite({ hostname, siteSlug, displayName, description, accessToken, ownerEmail });

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
};
