/**
 * useProjectChecklist – subscribe to project checklist items, group by category, compute progress.
 */

import { useEffect, useMemo, useState } from 'react';
import { computeChecklistProgress } from '../lib/defaultChecklistTemplate';
import {
  subscribeProjectChecklistItems,
  seedProjectChecklistFromTemplate,
  updateProjectChecklistItem,
  setProjectChecklistItemHidden,
  addCustomChecklistItem,
  addCustomCategoryAndItem,
} from '../features/checklist/checklistService';

/**
 * @param {string} companyId
 * @param {string} projectId
 * @param {string} stage - e.g. 'kalkylskede'
 * @returns {{
 *   items: array,
 *   byCategory: array of { categoryId, categoryName, sortOrder, items },
 *   totalProgress: number (0-100, mandatory only),
 *   categoryProgress: object categoryId -> number,
 *   mandatoryIncomplete: number,
 *   mandatoryTotal: number,
 *   loading: boolean,
 *   ensureSeeded: function,
 *   updateItem: function,
 *   addCustomItem: function,
 *   addCategoryAndItem: function,
 * }}
 */
const LOAD_TIMEOUT_MS = 12000;

export function useProjectChecklist(companyId, projectId, stage = 'kalkylskede') {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid) {
      setItems([]);
      setLoading(false);
      setLoadError(null);
      return () => {};
    }

    setLoading(true);
    setLoadError(null);
    let timeoutId = setTimeout(() => {
      setLoading(false);
      timeoutId = null;
    }, LOAD_TIMEOUT_MS);

    const handleUpdate = (list) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setItems(list || []);
      setLoading(false);
      setLoadError(null);
    };

    const handleError = (err) => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      setLoadError(err?.message || 'Kunde inte ladda checklista');
      setItems([]);
      setLoading(false);
    };

    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeProjectChecklistItems(cid, pid, handleUpdate, handleError);
    } catch (err) {
      handleError(err);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      unsubscribe();
    };
  }, [companyId, projectId]);

  const byCategory = useMemo(() => {
    const visible = (items || []).filter((i) => !i.isHidden);
    const byCat = new Map();
    for (const it of visible) {
      const key = it.categoryId || 'other';
      if (!byCat.has(key)) {
        byCat.set(key, {
          categoryId: it.categoryId,
          categoryName: it.categoryName || 'Övrigt',
          categorySortOrder: it.categorySortOrder ?? 999,
          items: [],
        });
      }
      byCat.get(key).items.push(it);
    }
    for (const g of byCat.values()) {
      g.items.sort((a, b) => (a.sortOrder ?? 999) - (b.sortOrder ?? 999));
    }
    return Array.from(byCat.values()).sort((a, b) => a.categorySortOrder - b.categorySortOrder);
  }, [items]);

  const {
    totalProgress,
    categoryProgress,
    mandatoryTotal,
    mandatoryIncomplete,
    totalRequired,
    completedRequired,
    progressPercent,
    isReadyForAnbud,
  } = useMemo(() => {
    const visible = (items || []).filter((i) => !i.isHidden);
    const isCompleted = (i) =>
      i.status === 'done' || i.status === 'Done' || i.status === 'not_applicable' || i.status === 'NotRelevant';
    const isNotApplicable = (i) => i.status === 'not_applicable' || i.status === 'NotRelevant';

    const { totalRequired: tr, completedRequired: cr, progressPercent: pct, isReadyForAnbud: ready } = computeChecklistProgress(visible);
    const mandatory = visible.filter((i) => i.required === true || i.isMandatory === true);
    const mandatoryExclNA = mandatory.filter((i) => !isNotApplicable(i));
    const mandatoryDone = mandatoryExclNA.filter((i) => isCompleted(i));
    const totalMandatory = mandatoryExclNA.length;
    const incomplete = totalMandatory - mandatoryDone.length;
    const totalProgressPct = totalMandatory === 0 ? 100 : Math.round((mandatoryDone.length / totalMandatory) * 100);

    const catProgress = {};
    for (const g of byCategory) {
      const catItems = g.items.filter((i) => !isNotApplicable(i));
      const catDone = catItems.filter((i) => isCompleted(i)).length;
      catProgress[g.categoryId] = catItems.length === 0 ? 100 : Math.round((catDone / catItems.length) * 100);
    }

    return {
      totalProgress: totalProgressPct,
      categoryProgress: catProgress,
      mandatoryTotal: totalMandatory,
      mandatoryIncomplete: incomplete,
      totalRequired: tr,
      completedRequired: cr,
      progressPercent: pct,
      isReadyForAnbud: ready,
    };
  }, [items, byCategory]);

  const ensureSeeded = async () => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid) return;
    await seedProjectChecklistFromTemplate(cid, pid, stage);
  };

  const updateItem = async (itemId, data) => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid || !itemId) return;
    await updateProjectChecklistItem(cid, pid, itemId, data);
  };

  const addCustomItem = async (opts) => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid) return null;
    return addCustomChecklistItem(cid, pid, opts);
  };

  const addCategoryAndItem = async (categoryName, firstItemTitle) => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid) return null;
    return addCustomCategoryAndItem(cid, pid, categoryName, firstItemTitle);
  };

  const setItemHidden = async (itemId, isHidden) => {
    const cid = String(companyId || '').trim();
    const pid = String(projectId || '').trim();
    if (!cid || !pid || !itemId) return;
    await setProjectChecklistItemHidden(cid, pid, itemId, isHidden);
  };

  return {
    items,
    byCategory,
    totalProgress,
    categoryProgress,
    mandatoryTotal,
    mandatoryIncomplete,
    totalRequired,
    completedRequired,
    progressPercent,
    isReadyForAnbud,
    loading,
    loadError,
    ensureSeeded,
    updateItem,
    setItemHidden,
    addCustomItem,
    addCategoryAndItem,
  };
}
