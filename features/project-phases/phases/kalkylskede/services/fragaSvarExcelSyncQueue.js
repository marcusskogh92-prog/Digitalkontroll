/**
 * Fråga/Svar Excel sync queue (per project).
 *
 * Goal: Digitalkontroll is always source of truth.
 * All FS mutations enqueue an async rebuild-based Excel sync.
 * If the Excel file is locked in SharePoint/Excel Online (423 resourceLocked),
 * we keep the job pending and retry automatically with backoff.
 */

import {
    collection,
    doc,
    getDocs,
    orderBy,
    query,
} from 'firebase/firestore';

import { db } from '../../../../../components/firebase';

import { resolveExcelSyncContext, upsertFsLogXlsx } from './fragaSvarExcelLogService';

const BACKOFF_MS = [2000, 5000, 15000, 30000, 30000];
const MAX_ATTEMPTS = 5;

function safeText(s) {
  return String(s || '').trim();
}

function getDebugEnabled() {
  try {
    // Expo web injects EXPO_PUBLIC_* at build time.
    return String(process?.env?.EXPO_PUBLIC_FS_LOG_DEBUG || '') === '1';
  } catch (_e) {
    return false;
  }
}

function debugLog(...args) {
  if (!getDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.info('[FS Excel Queue]', ...args);
}

function debugWarn(...args) {
  if (!getDebugEnabled()) return;
  // eslint-disable-next-line no-console
  console.warn('[FS Excel Queue]', ...args);
}

function projectKey(companyId, projectId) {
  return `${safeText(companyId)}::${safeText(projectId)}`;
}

function getFragaSvarCollectionRef(companyId, projectId) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) throw new Error('companyId och projectId krävs');
  const phaseDocRef = doc(db, 'foretag', cid, 'projects', pid, 'phaseData', 'kalkylskede');
  return collection(phaseDocRef, 'fragaSvar');
}

async function fetchCurrentFsList(companyId, projectId) {
  const colRef = getFragaSvarCollectionRef(companyId, projectId);
  const q = query(colRef, orderBy('createdAt', 'asc'));
  const snap = await getDocs(q);
  const items = [];
  snap.forEach((d) => items.push({ id: d.id, ...(d.data() || {}) }));
  return items.filter((it) => it?.deleted !== true);
}

function isResourceLocked(err) {
  const status = Number(err?.status || err?.httpStatus || err?.response?.status || 0);
  if (status === 423) return true;

  const code = safeText(err?.code).toLowerCase();
  if (code === 'resourcelocked' || code === 'resource_locked') return true;

  const message = safeText(err?.message).toLowerCase();
  return message.includes('423') || message.includes('resourcelocked') || message.includes('resource locked');
}

// In-memory queue state per project.
const queueByProjectKey = new Map();

function emit(key) {
  const entry = queueByProjectKey.get(key);
  if (!entry) return;
  for (const fn of entry.listeners) {
    try { fn(entry.publicState()); } catch (_e) {}
  }
}

function createEntry(companyId, projectId) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);

  const entry = {
    companyId: cid,
    projectId: pid,

    pending: false,
    running: false,
    attempts: 0,

    state: 'idle', // idle | running | locked | error
    lastError: null,
    nextRetryAt: null,

    timerId: null,
    listeners: new Set(),

    publicState() {
      return {
        companyId: cid,
        projectId: pid,
        state: this.state,
        pending: !!this.pending,
        running: !!this.running,
        attempts: Number(this.attempts || 0),
        nextRetryAt: this.nextRetryAt,
        lastErrorCode: safeText(this.lastError?.code) || null,
        lastErrorMessage: safeText(this.lastError?.message) || null,
      };
    },
  };

  return entry;
}

async function runOnce(key) {
  const entry = queueByProjectKey.get(key);
  if (!entry) return;

  if (entry.running) return;
  if (!entry.pending) return;

  entry.running = true;
  entry.state = 'running';
  entry.lastError = null;
  entry.nextRetryAt = null;
  // Consume the current pending flag. If new mutations enqueue during this run,
  // they will set pending=true again and we will run another round afterward.
  entry.pending = false;
  emit(key);

  const { companyId, projectId } = entry;

  try {
    debugLog('sync-start', { companyId, projectId, attempts: entry.attempts });

    const { siteId } = await resolveExcelSyncContext(companyId, projectId);
    const fsList = await fetchCurrentFsList(companyId, projectId);

    await upsertFsLogXlsx({ companyId, projectId, siteId, fsList });

    debugLog('sync-done', { companyId, projectId, count: fsList.length });

    entry.attempts = 0;
    entry.running = false;
    entry.state = 'idle';
    emit(key);

    // If something was enqueued while we ran, go again immediately.
    if (entry.pending) {
      void runOnce(key);
    }
  } catch (e) {
    entry.running = false;
    entry.lastError = e;

    if (isResourceLocked(e) && entry.attempts < MAX_ATTEMPTS) {
      entry.attempts += 1;
      entry.pending = true;
      entry.state = 'locked';

      const delay = BACKOFF_MS[Math.min(entry.attempts - 1, BACKOFF_MS.length - 1)];
      entry.nextRetryAt = Date.now() + delay;

      debugWarn('sync-locked-retry', { companyId, projectId, attempt: entry.attempts, delayMs: delay, message: safeText(e?.message) });

      if (entry.timerId) {
        try { clearTimeout(entry.timerId); } catch (_e) {}
        entry.timerId = null;
      }

      entry.timerId = setTimeout(() => {
        entry.timerId = null;
        void runOnce(key);
      }, delay);

      emit(key);
      return;
    }

    // Non-lock errors: do not loop forever. Next enqueue will try again.
    entry.pending = false;
    entry.state = 'error';
    emit(key);

    debugWarn('sync-failed', { companyId, projectId, locked: false, message: safeText(e?.message) || String(e) });
  }
}

export function enqueueFsExcelSync(companyId, projectId, meta = {}) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  if (!cid || !pid) return;

  const key = projectKey(cid, pid);
  let entry = queueByProjectKey.get(key);
  if (!entry) {
    entry = createEntry(cid, pid);
    queueByProjectKey.set(key, entry);
  }

  entry.pending = true;
  if (!entry.running && !entry.timerId) {
    entry.state = 'pending';
  }

  debugLog('enqueue', { companyId: cid, projectId: pid, reason: safeText(meta?.reason) || null });
  emit(key);

  // Fire-and-forget: start processing.
  if (!entry.running && !entry.timerId) {
    void runOnce(key);
  }
}

export function subscribeFsExcelSyncState(companyId, projectId, onState) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const key = projectKey(cid, pid);

  let entry = queueByProjectKey.get(key);
  if (!entry) {
    entry = createEntry(cid, pid);
    queueByProjectKey.set(key, entry);
  }

  if (typeof onState === 'function') {
    entry.listeners.add(onState);
    try { onState(entry.publicState()); } catch (_e) {}
  }

  return () => {
    const current = queueByProjectKey.get(key);
    if (!current) return;
    try { current.listeners.delete(onState); } catch (_e) {}
  };
}

export function getFsExcelSyncState(companyId, projectId) {
  const cid = safeText(companyId);
  const pid = safeText(projectId);
  const key = projectKey(cid, pid);
  const entry = queueByProjectKey.get(key);
  return entry ? entry.publicState() : null;
}
