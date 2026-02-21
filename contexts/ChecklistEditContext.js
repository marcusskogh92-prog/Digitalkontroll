import {
    createContext,
    forwardRef,
    useCallback,
    useContext,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from 'react';

function isObject(value) {
  return value != null && typeof value === 'object' && !Array.isArray(value);
}

function deepEqual(a, b) {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a == null || b == null) return a === b;

  if (Array.isArray(a)) {
    if (!Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i += 1) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (isObject(a)) {
    if (!isObject(b)) return false;
    const aKeys = Object.keys(a);
    const bKeys = Object.keys(b);
    if (aKeys.length !== bKeys.length) return false;
    for (const k of aKeys) {
      if (!Object.prototype.hasOwnProperty.call(b, k)) return false;
      if (!deepEqual(a[k], b[k])) return false;
    }
    return true;
  }

  return false;
}

function computeItemDiff(persistedData, draftData) {
  const p = persistedData && typeof persistedData === 'object' ? persistedData : {};
  const d = draftData && typeof draftData === 'object' ? draftData : {};
  const itemIds = new Set([...Object.keys(p), ...Object.keys(d)]);

  const diff = {};
  for (const itemId of itemIds) {
    const pItem = p[itemId] || {};
    const dItem = d[itemId] || {};
    const fields = new Set([...Object.keys(pItem), ...Object.keys(dItem)]);

    const patch = {};
    let hasAny = false;
    for (const field of fields) {
      if (!deepEqual(pItem[field], dItem[field])) {
        patch[field] = dItem[field];
        hasAny = true;
      }
    }

    if (hasAny) diff[itemId] = patch;
  }

  return diff;
}

const ChecklistEditContext = createContext(null);

export const ChecklistEditProvider = forwardRef(function ChecklistEditProvider(
  {
    children,
    onDirtyChange,
  },
  ref
) {
  const [persistedData, setPersistedData] = useState({});
  const [draftData, setDraftData] = useState({});

  const persistedRef = useRef(persistedData);
  useEffect(() => {
    persistedRef.current = persistedData;
  }, [persistedData]);

  const commitItemAdapterRef = useRef(null);

  const isDirty = useMemo(() => !deepEqual(persistedData, draftData), [persistedData, draftData]);

  useEffect(() => {
    if (typeof onDirtyChange === 'function') onDirtyChange(isDirty);
  }, [isDirty, onDirtyChange]);

  const markDirty = useCallback((updater) => {
    setDraftData((prev) => {
      const next = typeof updater === 'function' ? updater(prev || {}) : (updater || {});
      return next;
    });
  }, []);

  const resetDirty = useCallback(() => {
    setDraftData(persistedData || {});
  }, [persistedData]);

  const setPersistedFromBackend = useCallback((nextPersisted) => {
    const normalized = nextPersisted && typeof nextPersisted === 'object' ? nextPersisted : {};
    const prevPersisted = persistedRef.current || {};

    setPersistedData(normalized);
    setDraftData((prevDraft) => {
      // If draft still matches the previously persisted baseline, we're safe to
      // replace it with the new backend snapshot.
      if (!prevDraft || deepEqual(prevDraft, prevPersisted)) return normalized;
      // Otherwise keep the user's in-progress edits.
      return prevDraft;
    });
  }, []);

  const registerCommitAdapter = useCallback((fn) => {
    commitItemAdapterRef.current = typeof fn === 'function' ? fn : null;
  }, []);

  const commitItemPatch = useCallback(async (itemId, patch) => {
    const id = String(itemId || '').trim();
    if (!id) return;
    const patchObj = patch && typeof patch === 'object' ? patch : {};

    // Always update draft immediately so UI feels responsive.
    setDraftData((prev) => ({
      ...(prev || {}),
      [id]: {
        ...((prev && prev[id]) || {}),
        ...patchObj,
      },
    }));

    const commitFn = commitItemAdapterRef.current;
    if (typeof commitFn !== 'function') return;

    await commitFn(id, patchObj);

    // If commit succeeded, treat patch as persisted.
    setPersistedData((prev) => ({
      ...(prev || {}),
      [id]: {
        ...((prev && prev[id]) || {}),
        ...patchObj,
      },
    }));

    // Keep draft in sync to clear dirty for that patch.
    setDraftData((prev) => ({
      ...(prev || {}),
      [id]: {
        ...((prev && prev[id]) || {}),
        ...patchObj,
      },
    }));
  }, []);

  const commitChanges = useCallback(async () => {
    const commitFn = commitItemAdapterRef.current;
    if (typeof commitFn !== 'function') {
      // No backend adapter registered (e.g. not in checklist view).
      setPersistedData(draftData || {});
      setDraftData(draftData || {});
      return;
    }

    const diff = computeItemDiff(persistedData, draftData);
    const ids = Object.keys(diff);
    for (const id of ids) {
      const patch = diff[id];
      await commitFn(id, patch);
    }

    setPersistedData(draftData || {});
    setDraftData(draftData || {});
  }, [draftData, persistedData]);

  const value = useMemo(
    () => ({
      persistedData,
      draftData,
      isDirty,
      markDirty,
      resetDirty,
      commitChanges,
      // extra helpers used by checklist
      setPersistedFromBackend,
      registerCommitAdapter,
      commitItemPatch,
    }),
    [persistedData, draftData, isDirty, markDirty, resetDirty, commitChanges, setPersistedFromBackend, registerCommitAdapter, commitItemPatch]
  );

  useImperativeHandle(ref, () => ({
    getState: () => ({ persistedData, draftData, isDirty }),
    markDirty,
    resetDirty,
    commitChanges,
  }), [persistedData, draftData, isDirty, markDirty, resetDirty, commitChanges]);

  return <ChecklistEditContext.Provider value={value}>{children}</ChecklistEditContext.Provider>;
});

export function useChecklistEdit() {
  const ctx = useContext(ChecklistEditContext);
  if (!ctx) {
    throw new Error('useChecklistEdit must be used within ChecklistEditProvider');
  }
  return ctx;
}
