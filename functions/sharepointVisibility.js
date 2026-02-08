const functions = require('firebase-functions');
const { db, FieldValue } = require('./sharedFirebase');

function isGlobalAdmin(context) {
  if (!context || !context.auth) return false;
  const token = context.auth.token || {};
  const email = (token.email && String(token.email).toLowerCase()) || '';
  const emailSuperadmin = email === 'marcus@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem.se' || email === 'marcus.skogh@msbyggsystem';
  return (
    !!token.globalAdmin ||
    !!token.superadmin ||
    token.role === 'superadmin' ||
    (token.companyId === 'MS Byggsystem' && (token.admin === true || token.role === 'admin')) ||
    emailSuperadmin
  );
}

async function upsertCompanySharePointSiteMeta(data, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
  if (!isGlobalAdmin(context)) {
    throw new functions.https.HttpsError('permission-denied', 'Endast superadmin kan koppla site till företag.');
  }

  const companyId = (data && data.companyId) ? String(data.companyId).trim() : '';
  const meta = (data && data.meta && typeof data.meta === 'object') ? data.meta : {};
  const siteId = (meta.siteId && String(meta.siteId).trim()) || '';
  if (!companyId || !siteId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId and meta.siteId are required');
  }

  const role = (meta.role && String(meta.role).trim()) || 'custom';
  const allowedRoles = ['system', 'projects', 'custom'];
  const roleNorm = allowedRoles.includes(role) ? role : 'custom';
  const visibleInLeftPanel = (roleNorm === 'projects' || roleNorm === 'custom') && meta.visibleInLeftPanel === true;

  const payload = {
    siteId,
    siteUrl: (meta.siteUrl && String(meta.siteUrl).trim()) || (meta.webUrl && String(meta.webUrl).trim()) || null,
    siteName: (meta.siteName && String(meta.siteName).trim()) || (meta.name && String(meta.name).trim()) || null,
    role: roleNorm,
    visibleInLeftPanel: !!visibleInLeftPanel,
    updatedAt: FieldValue.serverTimestamp(),
    updatedBy: context.auth.uid || null,
  };

  const ref = db.doc(`foretag/${companyId}/sharepoint_sites/${siteId}`);
  await ref.set(payload, { merge: true });
  return { ok: true, companyId, siteId };
}

async function syncSharePointSiteVisibility(data, context) {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }

  const companyId = (data && data.companyId) ? String(data.companyId).trim() : '';
  if (!companyId) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

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

  const writes = [];
  if (workspaceSite && workspaceSite.siteId) {
    const existingSnap = await metaCol.doc(workspaceSite.siteId).get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
    const siteName = (workspaceSite.siteName && String(workspaceSite.siteName).trim()) || (existing.siteName && String(existing.siteName).trim()) || null;
    writes.push(
      metaCol.doc(workspaceSite.siteId).set({
        siteId: workspaceSite.siteId,
        siteUrl: workspaceSite.webUrl || null,
        siteName,
        role: 'projects',
        visibleInLeftPanel: true,
        systemManaged: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true })
    );
  }
  if (baseSite && baseSite.siteId) {
    const existingSnap = await metaCol.doc(baseSite.siteId).get();
    const existing = existingSnap.exists ? (existingSnap.data() || {}) : {};
    const siteName = (baseSite.siteName && String(baseSite.siteName).trim()) || (existing.siteName && String(existing.siteName).trim()) || null;
    writes.push(
      metaCol.doc(baseSite.siteId).set({
        siteId: baseSite.siteId,
        siteUrl: baseSite.webUrl || null,
        siteName,
        role: 'system',
        visibleInLeftPanel: false,
        systemManaged: true,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true })
    );
  }

  await Promise.all(writes);

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
        visibleInLeftPanel: inferred === 'projects' ? (d.visibleInLeftPanel === true) : false,
        updatedAt: FieldValue.serverTimestamp(),
        updatedBy: context.auth.uid,
      }, { merge: true });
      changed += 1;
    });
    if (changed > 0) await batch.commit();
  } catch (_e) {}

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
}

module.exports = {
  syncSharePointSiteVisibility,
  upsertCompanySharePointSiteMeta,
};
