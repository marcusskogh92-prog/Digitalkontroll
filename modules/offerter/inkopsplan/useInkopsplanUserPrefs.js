import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { auth } from '../../../components/firebase';

function safeText(v) {
  const s = String(v ?? '').trim();
  return s || '';
}

const ALL_TYPES = ['building_part', 'account', 'category', 'manual'];
const ALL_COLUMNS = ['bd', 'name', 'type', 'suppliers', 'request', 'status'];

const DEFAULT_PREFS = {
  visibleColumns: ALL_COLUMNS,
  sortKey: 'type', // 'type' | 'nr' | 'name'
  sortDir: 'asc', // 'asc' | 'desc'
  typeFilter: ALL_TYPES, // empty means "all" in UI, but we keep full list
};

function makeStorageKey({ uid, companyId, projectId }) {
  const u = safeText(uid) || 'anon';
  const c = safeText(companyId) || 'no_company';
  const p = safeText(projectId) || 'no_project';
  return `dk_inkopsplan_userprefs:${u}:${c}:${p}`;
}

async function readJson(key) {
  if (!key) return null;
  try {
    const raw = await AsyncStorage.getItem(key);
    if (raw) return JSON.parse(raw);
  } catch (_e) {}

  // Best-effort web fallback (in case AsyncStorage web shim fails)
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.localStorage) {
      const raw = window.localStorage.getItem(key);
      if (raw) return JSON.parse(raw);
    }
  } catch (_e) {}
  return null;
}

async function writeJson(key, value) {
  if (!key) return;
  const raw = JSON.stringify(value ?? {});
  try {
    await AsyncStorage.setItem(key, raw);
  } catch (_e) {}
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && window?.localStorage) {
      window.localStorage.setItem(key, raw);
    }
  } catch (_e) {}
}

function normalizePrefs(prefs) {
  const inObj = prefs && typeof prefs === 'object' ? prefs : {};

  const cols = Array.isArray(inObj.visibleColumns) ? inObj.visibleColumns.map(safeText).filter(Boolean) : [];
  const visibleColumns = cols.length ? cols.filter((c) => ALL_COLUMNS.includes(c)) : DEFAULT_PREFS.visibleColumns;

  const sortKey = ['type', 'nr', 'name'].includes(safeText(inObj.sortKey)) ? safeText(inObj.sortKey) : DEFAULT_PREFS.sortKey;
  const sortDir = ['asc', 'desc'].includes(safeText(inObj.sortDir)) ? safeText(inObj.sortDir) : DEFAULT_PREFS.sortDir;

  const typesRaw = Array.isArray(inObj.typeFilter) ? inObj.typeFilter.map(safeText).filter(Boolean) : [];
  const filteredTypes = typesRaw.filter((t) => ALL_TYPES.includes(t));
  const typeFilter = filteredTypes.length ? filteredTypes : DEFAULT_PREFS.typeFilter;

  return { visibleColumns, sortKey, sortDir, typeFilter };
}

export function useInkopsplanUserPrefs({ companyId, projectId }) {
  const uid = auth?.currentUser?.uid || '';
  const storageKey = useMemo(() => makeStorageKey({ uid, companyId, projectId }), [uid, companyId, projectId]);

  const [prefs, setPrefsState] = useState(DEFAULT_PREFS);
  const [loading, setLoading] = useState(true);
  const lastSavedRef = useRef('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const stored = await readJson(storageKey);
      if (!alive) return;
      setPrefsState(normalizePrefs(stored || DEFAULT_PREFS));
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [storageKey]);

  const setPrefs = useCallback((next) => {
    setPrefsState((prev) => {
      const candidate = typeof next === 'function' ? next(prev) : { ...(prev || {}), ...(next || {}) };
      return normalizePrefs(candidate);
    });
  }, []);

  useEffect(() => {
    if (loading) return;
    const raw = JSON.stringify(prefs || {});
    if (!storageKey || raw === lastSavedRef.current) return;
    lastSavedRef.current = raw;
    void writeJson(storageKey, prefs);
  }, [prefs, storageKey, loading]);

  return { prefs, setPrefs, loadingPrefs: loading, DEFAULT_PREFS };
}

