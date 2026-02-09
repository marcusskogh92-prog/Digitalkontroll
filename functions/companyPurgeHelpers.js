const { db } = require('./sharedFirebase');

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
    `foretag/${companyId}/byggdelar`,
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

module.exports = {
  getCompanySiteIdsFromConfig,
  purgeCompanyFirestore,
};
