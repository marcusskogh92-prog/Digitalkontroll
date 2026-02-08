const functions = require('firebase-functions');

const { db, FieldValue } = require('./sharedFirebase');
const { logAdminAuditEvent } = require('./adminAudit');
const { getSharePointGraphAccessToken, getSharePointGraphConfigPresence } = require('./sharedConfig');
const {
  graphGetDriveItemByPath,
  graphGetDefaultDrive,
  graphGetChildrenById,
  graphDeleteItemByDriveId,
  deleteDriveTreeByIdAdmin,
} = require('./sharepointGraph');

const GRAPH_TOKEN_MISSING_MSG = 'SharePoint Graph access token is not configured';

function asString(v) {
  return v != null ? String(v) : '';
}

function normalizePath(p) {
  return asString(p).replace(/^\/+/, '').replace(/\/+$/, '').trim().replace(/\/+/, '/');
}

function logGraphConfigCheck(op) {
  try {
    const presence = getSharePointGraphConfigPresence();
    functions.logger.info(`[${op}] GRAPH CONFIG CHECK`, {
      hasTenantId: presence?.hasTenantId === true,
      hasClientId: presence?.hasClientId === true,
      hasClientSecret: presence?.hasClientSecret === true,
      hasStaticToken: presence?.hasStaticToken === true,
      isEmulator: !!process.env.FUNCTIONS_EMULATOR,
    });
  } catch (_e) {}
}

function assertGraphTokenConfiguredIfNeeded({ siteId, folderPath }) {
  const sid = asString(siteId).trim();
  const path = normalizePath(folderPath);
  if (!sid || !path) return;

  const presence = getSharePointGraphConfigPresence();
  const canMint = presence?.hasTenantId && presence?.hasClientId && presence?.hasClientSecret;
  const hasStatic = presence?.hasStaticToken;
  if (!hasStatic && !canMint) {
    throw new functions.https.HttpsError('failed-precondition', GRAPH_TOKEN_MISSING_MSG);
  }
}

function getAuthClaims(context) {
  return (context && context.auth && context.auth.token) ? (context.auth.token || {}) : {};
}

function getActor(context) {
  return {
    uid: context?.auth?.uid || null,
    email: context?.auth?.token?.email || null,
  };
}

function assertAuthenticated(context) {
  if (!context || !context.auth || !context.auth.uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Authentication required');
  }
}

function assertCanManageCompany(context, companyId) {
  const cid = asString(companyId).trim();
  if (!cid) {
    throw new functions.https.HttpsError('invalid-argument', 'companyId is required');
  }

  const claims = getAuthClaims(context);
  const role = asString(claims.role).trim().toLowerCase();
  const isSuper = claims.superadmin === true || claims.globalAdmin === true || role === 'superadmin';
  const sameCompany = asString(claims.companyId).trim() === cid;
  const isCompanyAdmin = sameCompany && (claims.admin === true || role === 'admin');

  if (!isSuper && !isCompanyAdmin) {
    throw new functions.https.HttpsError('permission-denied', 'Not allowed');
  }

  return { isSuper, isCompanyAdmin };
}

async function deleteQueryInBatches(query, { batchSize = 250 } = {}) {
  let total = 0;
  while (true) {
    const snap = await query.limit(batchSize).get();
    if (snap.empty) break;

    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    total += snap.size;

    if (snap.size < batchSize) break;
  }
  return total;
}

async function recursiveDeleteDoc(docRef, { maxDepth = 8 } = {}) {
  // Depth safety: avoid runaway recursion on accidental cycles.
  const walk = async (ref, depth) => {
    if (!ref) return;
    if (depth > maxDepth) {
      throw new Error('recursiveDeleteDoc exceeded maxDepth');
    }

    const subcols = await ref.listCollections();
    for (const col of subcols || []) {
      const snap = await col.get();
      for (const d of snap.docs || []) {
        await walk(d.ref, depth + 1);
      }
    }

    await ref.delete().catch((e) => {
      // If it already vanished during recursion, treat as ok.
      const msg = asString(e?.message).toLowerCase();
      if (msg.includes('not found') || msg.includes('no document') || msg.includes('404')) return null;
      throw e;
    });
  };

  await walk(docRef, 0);
}

function isProjectNode(node) {
  if (!node) return false;
  const t = asString(node.type || node.kind || node.nodeType).trim().toLowerCase();
  if (t) return t === 'project';
  // Heuristic: leaf nodes without children are projects in legacy hierarki.
  const hasChildren = Array.isArray(node.children) && node.children.length > 0;
  if (hasChildren) return false;
  return !!asString(node.id).trim();
}

function removeProjectsFromHierarchyItems(items, projectIdsSet) {
  const ids = projectIdsSet instanceof Set ? projectIdsSet : new Set();

  const walk = (nodes) => {
    if (!Array.isArray(nodes)) return nodes;
    const out = [];
    for (const n of nodes) {
      if (!n) continue;
      const id = asString(n.id).trim();
      if (id && ids.has(id) && isProjectNode(n)) {
        continue;
      }
      if (Array.isArray(n.children) && n.children.length > 0) {
        out.push({ ...n, children: walk(n.children) });
      } else {
        out.push(n);
      }
    }
    return out;
  };

  return walk(items);
}

async function updateHierarchyRemoveProjects(companyId, projectIdsSet) {
  const cid = asString(companyId).trim();
  if (!cid) return { updated: false, removed: 0 };

  const ref = db.doc(`foretag/${cid}/hierarki/state`);
  const snap = await ref.get().catch(() => null);
  if (!snap || !snap.exists) return { updated: false, removed: 0 };

  const data = snap.data() || {};
  const items = Array.isArray(data.items) ? data.items : [];
  const next = removeProjectsFromHierarchyItems(items, projectIdsSet);

  // Rough removed count for logging.
  const countProjects = (nodes) => {
    let c = 0;
    const stack = Array.isArray(nodes) ? [...nodes] : [];
    while (stack.length) {
      const n = stack.pop();
      if (!n) continue;
      if (isProjectNode(n)) c++;
      if (Array.isArray(n.children)) stack.push(...n.children);
    }
    return c;
  };

  const beforeCount = countProjects(items);
  const afterCount = countProjects(next);
  const removed = Math.max(0, beforeCount - afterCount);

  // If nothing changed, avoid write.
  const changed = removed > 0;
  if (!changed) return { updated: false, removed: 0 };

  await ref.set(
    {
      items: next,
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: null,
    },
    { merge: true },
  );

  return { updated: true, removed };
}

async function cleanupProjectCrossCollections({ companyId, projectId }) {
  const cid = asString(companyId).trim();
  const pid = asString(projectId).trim();
  if (!cid || !pid) return { deletedDocs: 0 };

  let deletedDocs = 0;

  // controls
  const controlsRef = db.collection(`foretag/${cid}/controls`);
  deletedDocs += await deleteQueryInBatches(controlsRef.where('projectId', '==', pid)).catch(() => 0);
  deletedDocs += await deleteQueryInBatches(controlsRef.where('project.id', '==', pid)).catch(() => 0);

  // draft_controls
  const draftsRef = db.collection(`foretag/${cid}/draft_controls`);
  deletedDocs += await deleteQueryInBatches(draftsRef.where('projectId', '==', pid)).catch(() => 0);
  deletedDocs += await deleteQueryInBatches(draftsRef.where('project.id', '==', pid)).catch(() => 0);

  // activity (best-effort)
  const activityRef = db.collection(`foretag/${cid}/activity`);
  deletedDocs += await deleteQueryInBatches(activityRef.where('projectId', '==', pid)).catch(() => 0);
  deletedDocs += await deleteQueryInBatches(activityRef.where('project.id', '==', pid)).catch(() => 0);

  // per-project docs
  await db.doc(`foretag/${cid}/project_timeline/${pid}`).delete().catch(() => null);
  await db.doc(`foretag/${cid}/project_organisation/${pid}`).delete().catch(() => null);

  return { deletedDocs };
}

async function deleteSharePointFolderTreeById({ siteId, driveId, folderId }) {
  const sid = asString(siteId).trim();
  const didInput = asString(driveId).trim();
  const iid = asString(folderId).trim();
  if (!sid) throw new Error('siteId is required');
  if (!iid) throw new Error('folderId is required');

  let accessToken;
  try {
    accessToken = await getSharePointGraphAccessToken();
  } catch (e) {
    const msg = asString(e?.message);
    if (msg.toLowerCase().includes('missing graph client credentials') || msg.toLowerCase().includes('not configured')) {
      throw new functions.https.HttpsError('failed-precondition', GRAPH_TOKEN_MISSING_MSG);
    }
    throw e;
  }

  let did = didInput;
  if (!did) {
    const drive = await graphGetDefaultDrive({ siteId: sid, accessToken });
    did = asString(drive?.driveId).trim();
  }
  if (!did) {
    throw new Error('SharePoint driveId could not be resolved');
  }

  // If folder already gone, treat as already deleted.
  const children = await graphGetChildrenById({ driveId: did, itemId: iid, accessToken });
  if (children === null) {
    return { ok: true, sharepoint: 'not_found' };
  }

  await deleteDriveTreeByIdAdmin({ driveId: did, itemId: iid, accessToken });
  const del = await graphDeleteItemByDriveId({ driveId: did, itemId: iid, accessToken });
  if (del?.notFound) {
    return { ok: true, sharepoint: 'not_found' };
  }
  return { ok: true, sharepoint: 'deleted' };
}

async function deleteSharePointProjectFolder({ project }) {
  const siteId = asString(project?.sharePointSiteId).trim();
  const folderId = asString(project?.sharePointFolderId || project?.folderId || project?.driveItemId).trim();
  const driveId = asString(project?.sharePointDriveId || project?.driveId).trim();
  const path = normalizePath(project?.rootFolderPath || project?.sharePointRootPath || project?.sharePointPath || project?.projectPath || '');
  if (!siteId) {
    return { ok: true, skipped: true, reason: 'missing_site', sharepoint: 'deleted' };
  }

  // Prefer stable IDs. Fallback to resolving by path (lookup only) if needed.
  let resolvedFolderId = folderId;
  let resolvedDriveId = driveId;
  if (!resolvedFolderId && path) {
    const accessToken = await getSharePointGraphAccessToken();
    const item = await graphGetDriveItemByPath({ siteId, path, accessToken });
    resolvedFolderId = asString(item?.id).trim();
    resolvedDriveId = asString(item?.parentReference?.driveId).trim();
  }

  if (!resolvedFolderId) {
    return { ok: true, skipped: true, reason: 'missing_folder_id', sharepoint: 'deleted' };
  }

  const sp = await deleteSharePointFolderTreeById({ siteId, driveId: resolvedDriveId, folderId: resolvedFolderId });
  return { ok: true, skipped: false, sharepoint: sp?.sharepoint || 'deleted' };
}

async function deleteProjectFirestore({ companyId, projectId, projectDoc }) {
  const cid = asString(companyId).trim();
  const pid = asString(projectId).trim();
  if (!cid || !pid) throw new functions.https.HttpsError('invalid-argument', 'companyId and projectId are required');

  // Delete sharepoint_project_metadata doc if it matches.
  try {
    const siteId = asString(projectDoc?.sharePointSiteId).trim();
    const pPath = normalizePath(projectDoc?.rootFolderPath || projectDoc?.sharePointRootPath || '');
    if (siteId && pPath) {
      const metaRef = db.collection(`foretag/${cid}/sharepoint_project_metadata`);
      const metaSnap = await metaRef.where('siteId', '==', siteId).where('projectPath', '==', pPath).limit(5).get();
      if (!metaSnap.empty) {
        const batch = db.batch();
        metaSnap.docs.forEach((d) => batch.delete(d.ref));
        await batch.commit();
      }
    }
  } catch (_e) {}

  // Cross-collection cleanup.
  const cross = await cleanupProjectCrossCollections({ companyId: cid, projectId: pid });

  // Remove from hierarki tree mappings.
  const hier = await updateHierarchyRemoveProjects(cid, new Set([pid])).catch(() => ({ updated: false, removed: 0 }));

  // Remove uniqueness index doc if owned by this project.
  try {
    const idxId = asString(projectDoc?.projectNumberIndexId).trim();
    if (idxId) {
      const idxRef = db.doc(`foretag/${cid}/project_number_index/${idxId}`);
      const idxSnap = await idxRef.get().catch(() => null);
      if (idxSnap && idxSnap.exists) {
        const owner = asString(idxSnap.data()?.projectId).trim();
        if (owner === pid) {
          await idxRef.delete().catch(() => null);
        }
      }
    }
  } catch (_e) {}

  // Finally delete the project doc (including subcollections).
  const projRef = db.doc(`foretag/${cid}/projects/${pid}`);
  await recursiveDeleteDoc(projRef);

  return {
    ok: true,
    crossDeletedDocs: cross?.deletedDocs || 0,
    hierarchyRemoved: hier?.removed || 0,
  };
}

exports.deleteProject = async (data, context) => {
  assertAuthenticated(context);

  logGraphConfigCheck('deleteProject');

  const companyId = asString(data?.companyId || getAuthClaims(context)?.companyId).trim();
  const projectId = asString(data?.projectId).trim();

  assertCanManageCompany(context, companyId);

  if (!projectId) {
    throw new functions.https.HttpsError('invalid-argument', 'projectId is required');
  }

  const actor = getActor(context);

  const projRef = db.doc(`foretag/${companyId}/projects/${projectId}`);
  const projSnap = await projRef.get().catch(() => null);
  if (!projSnap || !projSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Project not found');
  }

  const projectDoc = projSnap.data() || {};

  await logAdminAuditEvent({
    companyId,
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'delete_project_requested',
    targetType: 'project',
    targetId: projectId,
    sharePointSiteId: asString(projectDoc?.sharePointSiteId).trim() || null,
    sharePointRootPath: normalizePath(projectDoc?.rootFolderPath || projectDoc?.sharePointRootPath || '' ) || null,
    ts: FieldValue.serverTimestamp(),
  });

  // 1) SharePoint delete first (ID-based). 404 => already deleted.
  try {
    const spSiteId = asString(projectDoc?.sharePointSiteId).trim();
    const spPath = normalizePath(projectDoc?.rootFolderPath || projectDoc?.sharePointRootPath || projectDoc?.sharePointPath || projectDoc?.projectPath || '');
    if (spSiteId && (spPath || asString(projectDoc?.sharePointFolderId).trim())) {
      assertGraphTokenConfiguredIfNeeded({ siteId: spSiteId, folderPath: spPath || 'x' });
    }

    // If IDs are missing, try to load them from sharepoint_project_metadata.
    let projectForDelete = projectDoc;
    try {
      const needFolderId = !asString(projectDoc?.sharePointFolderId || projectDoc?.folderId).trim();
      if (needFolderId && spSiteId && spPath) {
        const metaRef = db.collection(`foretag/${companyId}/sharepoint_project_metadata`);
        const metaSnap = await metaRef.where('siteId', '==', spSiteId).where('projectPath', '==', spPath).limit(1).get();
        if (!metaSnap.empty) {
          const m = metaSnap.docs[0].data() || {};
          projectForDelete = {
            ...projectDoc,
            sharePointDriveId: projectDoc?.sharePointDriveId || m?.driveId || null,
            sharePointFolderId: projectDoc?.sharePointFolderId || m?.folderId || null,
          };
        }
      }
    } catch (_e) {}

    const sp = await deleteSharePointProjectFolder({ project: projectForDelete });
    if (sp?.sharepoint === 'not_found') {
      functions.logger.info('[deleteProject] SharePoint folder not found – treating as already deleted');
    }

    // 2) Firestore cleanup last.
    const firestore = await deleteProjectFirestore({ companyId, projectId, projectDoc });

    await logAdminAuditEvent({
      companyId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'delete_project_completed',
      targetType: 'project',
      targetId: projectId,
      sharePointDeleted: sp?.sharepoint === 'deleted',
      sharePointNotFound: sp?.sharepoint === 'not_found',
      sharePointSkipped: !!sp?.skipped,
      sharePointSkipReason: sp?.reason || null,
      ts: FieldValue.serverTimestamp(),
    });

    return { status: 'success', sharepoint: sp?.sharepoint === 'not_found' ? 'not_found' : 'deleted' };
  } catch (e) {
    if (e instanceof functions.https.HttpsError && e.code === 'failed-precondition' && e.message === GRAPH_TOKEN_MISSING_MSG) {
      await logAdminAuditEvent({
        companyId,
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: 'delete_project_sharepoint_failed',
        targetType: 'project',
        targetId: projectId,
        error: GRAPH_TOKEN_MISSING_MSG,
        ts: FieldValue.serverTimestamp(),
      });
      throw new functions.https.HttpsError('failed-precondition', GRAPH_TOKEN_MISSING_MSG);
    }

    const msg = e?.message || String(e);
    await logAdminAuditEvent({
      companyId,
      actorUid: actor.uid,
      actorEmail: actor.email,
      action: 'delete_project_sharepoint_failed',
      targetType: 'project',
      targetId: projectId,
      error: msg,
      ts: FieldValue.serverTimestamp(),
    });

    // SharePoint failed => do NOT delete Firestore.
    throw new functions.https.HttpsError('internal', `SharePoint folder deletion failed: ${msg}`);
  }
};

exports.deleteFolder = async (data, context) => {
  assertAuthenticated(context);

  logGraphConfigCheck('deleteFolder');

  const companyId = asString(data?.companyId || getAuthClaims(context)?.companyId).trim();
  assertCanManageCompany(context, companyId);

  const siteId = asString(data?.siteId).trim();
  const folderId = asString(data?.folderId || data?.itemId || data?.driveItemId).trim();
  const driveId = asString(data?.driveId).trim();
  const folderPathRaw = asString(data?.folderPath || data?.itemPath).trim();
  const folderPath = normalizePath(folderPathRaw);

  if (!siteId) throw new functions.https.HttpsError('invalid-argument', 'siteId is required');
  if (!folderPath) throw new functions.https.HttpsError('invalid-argument', 'folderPath is required');

  // Basic protection: never delete obvious roots.
  const blockedRoots = new Set(['projekt', 'mappar', 'arkiv', 'metadata', 'system']);
  const rootSeg = folderPath.split('/')[0]?.toLowerCase() || '';
  if (!rootSeg || (folderPath.indexOf('/') === -1 && blockedRoots.has(rootSeg))) {
    throw new functions.https.HttpsError('failed-precondition', 'Refusing to delete a root/system folder');
  }

  const actor = getActor(context);

  // SharePoint delete first (ID-based). If folderId missing, resolve by path (lookup only).
  let sharepointStatus = 'deleted';
  try {
    assertGraphTokenConfiguredIfNeeded({ siteId, folderPath });

    let resolvedFolderId = folderId;
    let resolvedDriveId = driveId;
    if (!resolvedFolderId) {
      const accessToken = await getSharePointGraphAccessToken();
      const item = await graphGetDriveItemByPath({ siteId, path: folderPath, accessToken });
      resolvedFolderId = asString(item?.id).trim();
      resolvedDriveId = asString(item?.parentReference?.driveId).trim();
      if (!resolvedFolderId) {
        sharepointStatus = 'not_found';
        functions.logger.info('[deleteFolder] SharePoint folder not found – treating as already deleted');
      }
    }

    if (resolvedFolderId) {
      const sp = await deleteSharePointFolderTreeById({ siteId, driveId: resolvedDriveId, folderId: resolvedFolderId });
      if (sp?.sharepoint === 'not_found') {
        sharepointStatus = 'not_found';
        functions.logger.info('[deleteFolder] SharePoint folder not found – treating as already deleted');
      }
    }
  } catch (e) {
    if (e instanceof functions.https.HttpsError && e.code === 'failed-precondition' && e.message === GRAPH_TOKEN_MISSING_MSG) {
      throw e;
    }
    const msg = e?.message || String(e);
    throw new functions.https.HttpsError('internal', `SharePoint folder deletion failed: ${msg}`);
  }

  // Find Firestore projects that live under this folder (path used only for Firestore selection).
  const projectsCol = db.collection(`foretag/${companyId}/projects`);
  const start = folderPath;
  const end = `${folderPath}\uf8ff`;

  const snap = await projectsCol
    .where('sharePointSiteId', '==', siteId)
    .where('rootFolderPath', '>=', start)
    .where('rootFolderPath', '<=', end)
    .get()
    .catch(() => null);

  const projectIds = [];
  if (snap && !snap.empty) {
    snap.docs.forEach((d) => {
      const pid = asString(d.id).trim();
      if (pid) projectIds.push(pid);
    });
  }

  await logAdminAuditEvent({
    companyId,
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'delete_folder_requested',
    targetType: 'folder',
    targetId: asString(data?.folderId || folderPath).trim() || folderPath,
    sharePointSiteId: siteId,
    sharePointPath: folderPath,
    projectCount: projectIds.length,
    ts: FieldValue.serverTimestamp(),
  });

  // Firestore cleanup last: delete projects and related docs, then metadata.
  const deletedProjects = [];
  for (const pid of projectIds) {
    try {
      const projRef = db.doc(`foretag/${companyId}/projects/${pid}`);
      const projSnap = await projRef.get().catch(() => null);
      const projDoc = projSnap && projSnap.exists ? (projSnap.data() || {}) : {};
      await deleteProjectFirestore({ companyId, projectId: pid, projectDoc: projDoc });
      deletedProjects.push(pid);
    } catch (e) {
      // Fail fast: no silent partial deletes.
      const msg = e?.message || String(e);
      await logAdminAuditEvent({
        companyId,
        actorUid: actor.uid,
        actorEmail: actor.email,
        action: 'delete_folder_firestore_failed',
        targetType: 'folder',
        targetId: folderPath,
        error: msg,
        ts: FieldValue.serverTimestamp(),
      });
      throw new functions.https.HttpsError('internal', `Firestore cleanup failed while deleting folder: ${msg}`);
    }
  }

  // Also delete sharepoint metadata under this folder path (best-effort).
  try {
    const metaCol = db.collection(`foretag/${companyId}/sharepoint_project_metadata`);
    const metaSnap = await metaCol
      .where('siteId', '==', siteId)
      .where('projectPath', '>=', start)
      .where('projectPath', '<=', end)
      .get();

    if (!metaSnap.empty) {
      const batch = db.batch();
      metaSnap.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  } catch (_e) {}

  // Remove project references from hierarki/state (in case some projects were stored there).
  if (deletedProjects.length > 0) {
    await updateHierarchyRemoveProjects(companyId, new Set(deletedProjects)).catch(() => null);
  }

  await logAdminAuditEvent({
    companyId,
    actorUid: actor.uid,
    actorEmail: actor.email,
    action: 'delete_folder_completed',
    targetType: 'folder',
    targetId: folderPath,
    deletedProjects,
    ts: FieldValue.serverTimestamp(),
  });

  // We treat SharePoint already-deleted as success.
  return { status: 'success', sharepoint: sharepointStatus === 'not_found' ? 'not_found' : 'deleted' };
};
