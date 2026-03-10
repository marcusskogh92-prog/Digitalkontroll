/**
 * useMergedSectionItems - Slår ihop bas-items med projekt-specifik sectionStructure från Firestore.
 * För redigerbara sektioner: hämta sectionStructure, applicera overrides (displayName, order, removed),
 * lägg till custom items.
 *
 * Persisterar till: modulnivå-cache + sessionStorage (överlever sektionsbyte, HMR, remounts).
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
import { getProjectSectionStructure, saveProjectSectionStructure, subscribeSectionStructure } from '../../services/sectionStructureService';
import { SECTIONS_EDITABLE } from '../../constants';

const structureCache = new Map();
const STORAGE_PREFIX = 'dk_section_structure_';

function getFromStorage(key) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed && Array.isArray(parsed.items) ? { items: parsed.items } : null;
  } catch {
    return null;
  }
}

function setToStorage(key, data) {
  if (Platform.OS !== 'web' || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_PREFIX + key, JSON.stringify(data || { items: [] }));
  } catch (_e) {}
}

function safeText(v) {
  return String(v ?? '').trim();
}

function buildRootPath(projectRootPath, sectionFolderName, sharePointName) {
  if (!projectRootPath || !sectionFolderName || !sharePointName) return undefined;
  return [projectRootPath, sectionFolderName, sharePointName].filter(Boolean).join('/').replace(/\/+/g, '/');
}

/**
 * Mergar bas-items med sectionStructure. Custom items får component: 'DigitalkontrollsUtforskare'.
 * Bas-items med component 'DigitalkontrollsUtforskare' får rootPath för att visas i utforskaren.
 */
function mergeItems(baseItems, structureItems, projectRootPath, sectionFolderName) {
  const base = Array.isArray(baseItems) ? baseItems.filter(Boolean) : [];
  const structure = Array.isArray(structureItems) ? structureItems.filter(Boolean) : [];

  const structById = new Map();
  for (const s of structure) {
    const id = safeText(s?.id);
    if (!id) continue;
    structById.set(id, s);
  }

  const result = [];
  const seen = new Set();

  for (const b of base) {
    const id = safeText(b?.id);
    if (!id) continue;
    const st = structById.get(id);
    if (st?.removed === true) continue;
    seen.add(id);
    const sharePointName = st?.sharePointName ?? b?.sharePointName ?? b?.name;
    const displayName = safeText(st?.displayName) || safeText(b?.name) || id;
    const order = typeof st?.order === 'number' ? st.order : (Number(b?.order) || 0);
    const rootPath = buildRootPath(projectRootPath, sectionFolderName, sharePointName);
    const item = {
      ...b,
      name: displayName,
      displayName,
      order,
      sharePointName,
      ...(rootPath ? { rootPath } : {}),
    };
    result.push(item);
  }

  for (const st of structure) {
    if (!st?.isCustom) continue;
    const id = safeText(st?.id);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    const sharePointName = safeText(st?.sharePointName) || 'Ny mapp';
    const displayName = safeText(st?.displayName) || sharePointName.replace(/^\d{1,2}\s*[-–—.]\s*/, '');
    const rootPath = buildRootPath(projectRootPath, sectionFolderName, sharePointName);
    result.push({
      id,
      name: displayName,
      displayName,
      sharePointName,
      order: typeof st?.order === 'number' ? st.order : 999,
      isCustom: true,
      component: 'DigitalkontrollsUtforskare',
      rootPath,
    });
  }

  result.sort((a, b) => (Number(a?.order) || 0) - (Number(b?.order) || 0));
  return result;
}

/**
 * @param {string} companyId
 * @param {string} projectId
 * @param {string} activeSection
 * @param {Array} baseSubMenuItems - From useProjectNavigation
 * @param {object} activeSectionConfig - { name, items }
 * @param {string} projectRootPath - project.rootFolderPath etc
 */
function cacheKey(cid, pid, sid) {
  return `${cid}::${pid}::${sid}`;
}

export function useMergedSectionItems(companyId, projectId, activeSection, baseSubMenuItems, activeSectionConfig, projectRootPath = '') {
  const [structure, setStructure] = useState(null);
  const [loading, setLoading] = useState(false);
  const activeSectionRef = useRef(activeSection);
  activeSectionRef.current = activeSection;

  const isEditable = SECTIONS_EDITABLE.has(String(activeSection || ''));
  const sectionFolderName = activeSectionConfig?.name || '';

  useEffect(() => {
    const cid = safeText(companyId);
    const pid = safeText(projectId);
    const sid = safeText(activeSection);
    const key = cacheKey(cid, pid, sid);
    const sectionSubscribed = activeSection;
    const fromCache = structureCache.get(key) ?? getFromStorage(key);
    if (fromCache != null) {
      if (!structureCache.has(key)) structureCache.set(key, fromCache);
      setStructure(fromCache);
      setLoading(false);
    } else {
      setLoading(true);
    }
    if (!companyId || !projectId || !activeSection || !isEditable) return;
    const unsub = subscribeSectionStructure(companyId, projectId, activeSection, (data) => {
      const resolved = data ?? { items: [] };
      const existing = structureCache.get(key) ?? getFromStorage(key);
      const existingCount = (existing?.items || []).length;
      const newCount = (resolved?.items || []).length;
      if (newCount === 0 && existingCount > 0) {
        return;
      }
      structureCache.set(key, resolved);
      setToStorage(key, resolved);
      if (activeSectionRef.current === sectionSubscribed) {
        setStructure(resolved);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [companyId, projectId, activeSection, isEditable]);

  const key = cacheKey(safeText(companyId), safeText(projectId), safeText(activeSection));
  const cached = structureCache.get(key) ?? getFromStorage(key) ?? null;
  const effectiveStructure = cached ?? structure ?? null;

  const subMenuItems = isEditable
    ? mergeItems(baseSubMenuItems || [], effectiveStructure?.items || [], projectRootPath, sectionFolderName)
    : (baseSubMenuItems || []);

  const toStructureItems = useCallback((items) => {
    return (items || []).filter(Boolean).map((it, idx) => ({
      id: safeText(it?.id) || `item-${idx}`,
      sharePointName: safeText(it?.sharePointName) || safeText(it?.name),
      displayName: safeText(it?.displayName) || safeText(it?.name).replace(/^\d{1,2}\s*[-–—.]\s*/, '').trim(),
      order: typeof it?.order === 'number' ? it.order : idx,
      isCustom: !!it?.isCustom,
      ...(it?.removed === true ? { removed: true } : {}),
    }));
  }, []);

  const saveItems = useCallback(async (items, opts = {}) => {
    if (!companyId || !projectId || !activeSection || !isEditable) return false;
    const removedBaseIds = Array.isArray(opts.removedBaseIds) ? opts.removedBaseIds : [];
    let structureItems = toStructureItems(items);
    const seen = new Set(structureItems.map((s) => safeText(s?.id)).filter(Boolean));
    for (const s of effectiveStructure?.items || []) {
      if (s?.removed === true && safeText(s?.id) && !seen.has(safeText(s.id))) {
        structureItems.push({ id: s.id, removed: true });
        seen.add(safeText(s.id));
      }
    }
    for (const id of removedBaseIds) {
      const sid = safeText(id);
      if (sid && !seen.has(sid)) {
        structureItems.push({ id: sid, removed: true });
        seen.add(sid);
      }
    }
    const saved = { items: structureItems };
    const cacheKeyVal = cacheKey(safeText(companyId), safeText(projectId), safeText(activeSection));
    structureCache.set(cacheKeyVal, saved);
    setToStorage(cacheKeyVal, saved);
    setStructure((prev) => ({ ...(prev || {}), items: structureItems }));
    try {
      await saveProjectSectionStructure(companyId, projectId, activeSection, { items: structureItems });
      return true;
    } catch (e) {
      console.warn('[useMergedSectionItems] save error:', e?.message);
      return false;
    }
  }, [companyId, projectId, activeSection, isEditable, toStructureItems, effectiveStructure]);

  const refresh = useCallback(async () => {
    if (!companyId || !projectId || !activeSection || !isEditable) return;
    const data = await getProjectSectionStructure(companyId, projectId, activeSection, { source: 'server' });
    const resolved = data ?? { items: [] };
    const key = cacheKey(safeText(companyId), safeText(projectId), safeText(activeSection));
    structureCache.set(key, resolved);
    setStructure(resolved);
  }, [companyId, projectId, activeSection, isEditable]);

  return {
    subMenuItems,
    structure: effectiveStructure,
    isLoading: loading,
    refresh,
    saveItems,
    isEditable,
  };
}
