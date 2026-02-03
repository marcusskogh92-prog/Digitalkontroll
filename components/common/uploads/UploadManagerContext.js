import React from 'react';

const UploadManagerContext = React.createContext(null);

function makeId(prefix = 'up') {
  return `${prefix}_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function safeText(value) {
  const s = String(value ?? '').trim();
  return s;
}

function summarizeError(value) {
  const s = safeText(value);
  if (!s) return 'Okänt fel';
  return s.length > 240 ? `${s.slice(0, 240)}…` : s;
}

function computeBatchStats(batch) {
  const items = Array.isArray(batch?.items) ? batch.items : [];
  let total = 0;
  let loaded = 0;
  let active = 0;
  let errors = 0;

  for (const it of items) {
    const st = safeText(it?.status);
    if (st === 'queued' || st === 'uploading') active += 1;
    if (st === 'error') errors += 1;

    const t = Number(it?.total ?? 0);
    const l = Number(it?.loaded ?? 0);
    if (Number.isFinite(t) && t > 0) total += t;
    if (Number.isFinite(l) && l > 0) loaded += l;
  }

  const progress = total > 0 ? Math.max(0, Math.min(1, loaded / total)) : 0;
  return { totalBytes: total, loadedBytes: loaded, progress, activeCount: active, errorCount: errors };
}

export function UploadManagerProvider({ children }) {
  const [panelOpen, setPanelOpen] = React.useState(false);
  const [batches, setBatches] = React.useState([]);

  const autoRemoveTimersRef = React.useRef(new Map());

  React.useEffect(() => {
    return () => {
      try {
        for (const t of autoRemoveTimersRef.current.values()) clearTimeout(t);
      } catch (_e) {}
      autoRemoveTimersRef.current = new Map();
    };
  }, []);

  const removeBatch = React.useCallback((batchId) => {
    const id = safeText(batchId);
    if (!id) return;

    setBatches((prev) => (Array.isArray(prev) ? prev : []).filter((b) => b?.id !== id));

    try {
      const t = autoRemoveTimersRef.current.get(id);
      if (t) clearTimeout(t);
      autoRemoveTimersRef.current.delete(id);
    } catch (_e) {}
  }, []);

  const scheduleAutoRemove = React.useCallback((batchId, delayMs) => {
    const id = safeText(batchId);
    const delay = Math.max(0, Number(delayMs) || 0);
    if (!id) return;

    try {
      const existing = autoRemoveTimersRef.current.get(id);
      if (existing) clearTimeout(existing);
    } catch (_e) {}

    const t = setTimeout(() => {
      removeBatch(id);
    }, delay);

    autoRemoveTimersRef.current.set(id, t);
  }, [removeBatch]);

  const createBatch = React.useCallback((spec) => {
    const title = safeText(spec?.title) || 'Uppladdning';
    const rawItems = Array.isArray(spec?.items) ? spec.items : [];

    const batchId = makeId('batch');
    const items = rawItems.map((it) => {
      const itemId = safeText(it?.id) || makeId('file');
      return {
        id: itemId,
        name: safeText(it?.name) || 'Fil',
        path: safeText(it?.path) || '',
        status: 'queued',
        loaded: 0,
        total: Number(it?.total ?? 0) || 0,
        error: '',
        createdAt: Date.now(),
      };
    });

    const batch = {
      id: batchId,
      title,
      message: safeText(spec?.message) || '',
      createdAt: Date.now(),
      doneAt: null,
      items,
    };

    setBatches((prev) => [batch, ...(Array.isArray(prev) ? prev : [])].slice(0, 40));

    // Show the compact indicator immediately; keep panel closed unless user opened it.
    return { batchId, itemIds: items.map((i) => i.id) };
  }, []);

  const setBatchMessage = React.useCallback((batchId, message) => {
    const id = safeText(batchId);
    const msg = safeText(message);
    if (!id) return;

    setBatches((prev) =>
      (Array.isArray(prev) ? prev : []).map((b) => (b?.id === id ? { ...b, message: msg } : b))
    );
  }, []);

  const patchItem = React.useCallback((batchId, itemId, patch) => {
    const bid = safeText(batchId);
    const iid = safeText(itemId);
    if (!bid || !iid) return;

    setBatches((prev) =>
      (Array.isArray(prev) ? prev : []).map((b) => {
        if (b?.id !== bid) return b;
        const nextItems = (Array.isArray(b?.items) ? b.items : []).map((it) => {
          if (it?.id !== iid) return it;
          const next = { ...it, ...(patch || {}) };
          if (next?.status === 'error') next.error = summarizeError(next?.error);
          return next;
        });
        return { ...b, items: nextItems };
      })
    );
  }, []);

  const updateItemAndMaybeFinalize = React.useCallback((batchId, itemId, updater) => {
    const bid = safeText(batchId);
    const iid = safeText(itemId);
    if (!bid || !iid) return;

    let becameDoneThisUpdate = false;
    let shouldAutoRemove = false;
    let hadErrors = false;

    setBatches((prev) =>
      (Array.isArray(prev) ? prev : []).map((b) => {
        if (b?.id !== bid) return b;
        const items = (Array.isArray(b?.items) ? b.items : []).map((it) => {
          if (it?.id !== iid) return it;
          const next = typeof updater === 'function' ? updater(it) : { ...it };
          if (safeText(next?.status) === 'error') next.error = summarizeError(next?.error);
          return next;
        });

        const allDone = items.length > 0 && items.every((it) => {
          const st = safeText(it?.status);
          return st === 'success' || st === 'error';
        });

        if (allDone && !b?.doneAt) {
          hadErrors = items.some((it) => safeText(it?.status) === 'error');
          shouldAutoRemove = !hadErrors;
          becameDoneThisUpdate = true;
          return { ...b, items, doneAt: Date.now() };
        }

        return { ...b, items };
      })
    );

    if (becameDoneThisUpdate) {
      if (shouldAutoRemove) {
        scheduleAutoRemove(bid, 4000);
        setTimeout(() => {
          try { setPanelOpen(false); } catch (_e) {}
        }, 4000);
      } else if (hadErrors) {
        try { setPanelOpen(true); } catch (_e) {}
      }
    }
  }, [scheduleAutoRemove]);

  const setItemQueued = React.useCallback((batchId, itemId) => {
    patchItem(batchId, itemId, { status: 'queued' });
  }, [patchItem]);

  const setItemUploading = React.useCallback((batchId, itemId) => {
    patchItem(batchId, itemId, { status: 'uploading' });
  }, [patchItem]);

  const setItemProgress = React.useCallback((batchId, itemId, loaded, total) => {
    const l = Number(loaded ?? 0);
    const t = Number(total ?? 0);
    patchItem(batchId, itemId, {
      loaded: Number.isFinite(l) ? l : 0,
      total: Number.isFinite(t) ? t : 0,
    });
  }, [patchItem]);

  const setItemSuccess = React.useCallback((batchId, itemId) => {
    updateItemAndMaybeFinalize(batchId, itemId, (it) => {
      const total = Number(it?.total ?? 0);
      const loaded = Number(it?.loaded ?? 0);
      return {
        ...it,
        status: 'success',
        loaded: total > 0 ? total : loaded,
        error: '',
      };
    });
  }, [updateItemAndMaybeFinalize]);

  const setItemError = React.useCallback((batchId, itemId, error) => {
    updateItemAndMaybeFinalize(batchId, itemId, (it) => ({
      ...it,
      status: 'error',
      error: summarizeError(error),
    }));
  }, [updateItemAndMaybeFinalize]);

  const setItemNameAndPath = React.useCallback((batchId, itemId, name, path) => {
    patchItem(batchId, itemId, { name: safeText(name), path: safeText(path) });
  }, [patchItem]);

  const togglePanel = React.useCallback(() => {
    setPanelOpen((v) => !v);
  }, []);

  const closePanel = React.useCallback(() => {
    setPanelOpen(false);
  }, []);

  const clearAll = React.useCallback(() => {
    setBatches([]);
    setPanelOpen(false);
    try {
      for (const t of autoRemoveTimersRef.current.values()) clearTimeout(t);
    } catch (_e) {}
    autoRemoveTimersRef.current = new Map();
  }, []);

  const derived = React.useMemo(() => {
    const list = Array.isArray(batches) ? batches : [];

    let activeCount = 0;
    let errorCount = 0;
    let totalBytes = 0;
    let loadedBytes = 0;

    for (const b of list) {
      const stats = computeBatchStats(b);
      activeCount += stats.activeCount;
      errorCount += stats.errorCount;
      totalBytes += stats.totalBytes;
      loadedBytes += stats.loadedBytes;
    }

    const progress = totalBytes > 0 ? Math.max(0, Math.min(1, loadedBytes / totalBytes)) : 0;

    return {
      activeCount,
      errorCount,
      totalBytes,
      loadedBytes,
      progress,
    };
  }, [batches]);

  const value = React.useMemo(() => {
    return {
      panelOpen,
      batches,
      stats: derived,
      createBatch,
      setBatchMessage,
      setItemQueued,
      setItemUploading,
      setItemProgress,
      setItemSuccess,
      setItemError,
      setItemNameAndPath,
      togglePanel,
      closePanel,
      removeBatch,
      clearAll,
    };
  }, [
    panelOpen,
    batches,
    derived,
    createBatch,
    setBatchMessage,
    setItemQueued,
    setItemUploading,
    setItemProgress,
    setItemSuccess,
    setItemError,
    setItemNameAndPath,
    togglePanel,
    closePanel,
    removeBatch,
    clearAll,
  ]);

  return <UploadManagerContext.Provider value={value}>{children}</UploadManagerContext.Provider>;
}

export function useUploadManager() {
  const ctx = React.useContext(UploadManagerContext);
  if (!ctx) {
    throw new Error('useUploadManager must be used within an UploadManagerProvider');
  }
  return ctx;
}
