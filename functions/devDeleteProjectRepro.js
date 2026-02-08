// Repro script for deleteProject callable (run via firebase emulators:exec).
// Usage:
//   npx firebase emulators:exec --only functions,firestore,auth "node functions/devDeleteProjectRepro.js"

const { db } = require('./sharedFirebase');
const { deleteProject } = require('./deleteOperations');

async function seedTestData({ companyId, projectId }) {
  await db.doc(`foretag/${companyId}/projects/${projectId}`).set({
    name: 'Test Project',
    sharePointSiteId: '',
    rootFolderPath: '',
    createdAt: new Date(),
  });

  // Add a couple of cross-collection docs that cleanupProjectCrossCollections will remove.
  await db.collection(`foretag/${companyId}/controls`).add({ projectId, title: 'C1' });
  await db.collection(`foretag/${companyId}/draft_controls`).add({ project: { id: projectId }, title: 'D1' });

  // Hierarki/state containing a project node.
  await db.doc(`foretag/${companyId}/hierarki/state`).set({
    items: [{ id: projectId, type: 'project', children: [] }],
  });
}

(async () => {
  const companyId = 'testco_tx';
  const projectId = `p_${Date.now()}`;

  try {
    console.log('[repro] seeding...');
    await seedTestData({ companyId, projectId });

    console.log('[repro] calling deleteProject...');
    const res = await deleteProject(
      { companyId, projectId },
      { auth: { uid: 'local_admin', token: { superadmin: true, email: 'local@local', companyId } } }
    );

    console.log('[repro] deleteProject result:', JSON.stringify(res, null, 2));
    console.log('[repro] done');
    process.exit(0);
  } catch (e) {
    console.error('[repro] error:', e);
    process.exit(1);
  }
})();
