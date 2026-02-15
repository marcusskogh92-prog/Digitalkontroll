/**
 * useProjectChecklist – lista + progress för projektets checklista.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { onSnapshot, query, orderBy, collection } from 'firebase/firestore';
import { db } from '../../components/firebase';
import {
  getProjectChecklistItems,
  updateProjectChecklistItem,
  setProjectChecklistItemHidden,
} from './checklistService';
import { CHECKLIST_STATUS } from './checklistConstants';

function itemsRef(companyId, projectId) {
  return collection(db, 'foretag', String(companyId), 'projects', String(projectId), 'checklist_items');
}

/**
 * Progress: obligatoriska punkter (exkl. NotRelevant). Grön >80%, gul 40–80%, röd <40%.
 */
export function calcMandatoryProgress(items) {
  const mandatory = (items || []).filter((i) => i.isMandatory && i.status !== CHECKLIST_STATUS.NotRelevant);
  if (mandatory.length === 0) return { percent: 100, done: 0, total: 0 };
  const done = mandatory.filter((i) => i.status === CHECKLIST_STATUS.Done).length;
  return { percent: Math.round((done / mandatory.length) * 100), done, total: mandatory.length };
}

/**
 * Progress per kategori: klara / (alla exkl. NotRelevant).
 */
export function calcCategoryProgress(itemsInCategory) {
  const relevant = (itemsInCategory || []).filter((i) => i.status !== CHECKLIST_STATUS.NotRelevant);
  if (relevant.length === 0) return { percent: 0, done: 0, total: 0 };
  const done = relevant.filter((i) => i.status === CHECKLIST_STATUS.Done).length;
  return { percent: Math.round((done / relevant.length) * 100), done, total: relevant.length };
}

export function useProjectChecklist(companyId, projectId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!companyId || !projectId) {
      setItems([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const ref = itemsRef(companyId, projectId);
    const q = query(ref, orderBy('sortOrder', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        list.sort((a, b) => (a.categorySortOrder || 0) - (b.categorySortOrder || 0) || (a.sortOrder || 0) - (b.sortOrder || 0));
        setItems(list);
        setLoading(false);
        setError(null);
      },
      (err) => {
        setError(err?.message || 'Kunde inte ladda checklista');
        setLoading(false);
      }
    );
    return () => unsub();
  }, [companyId, projectId]);

  const updateItem = useCallback(
    async (itemId, data) => {
      if (!companyId || !projectId) return;
      await updateProjectChecklistItem(companyId, projectId, itemId, data);
    },
    [companyId, projectId]
  );

  const setItemHidden = useCallback(
    async (itemId, isHidden) => {
      if (!companyId || !projectId) return;
      await setProjectChecklistItemHidden(companyId, projectId, itemId, isHidden);
    },
    [companyId, projectId]
  );

  const visibleItems = useMemo(() => items.filter((i) => !i.isHidden), [items]);
  const byCategory = useMemo(() => {
    const map = new Map();
    visibleItems.forEach((i) => {
      const key = i.categoryId || 'other';
      if (!map.has(key)) map.set(key, { name: i.categoryName || 'Övrigt', items: [] });
      map.get(key).items.push(i);
    });
    return Array.from(map.entries()).map(([id, v]) => ({ id, ...v }));
  }, [visibleItems]);

  const mandatoryProgress = useMemo(() => calcMandatoryProgress(visibleItems), [visibleItems]);
  const hasMandatoryIncomplete =
    mandatoryProgress.total > 0 && mandatoryProgress.done < mandatoryProgress.total;

  return {
    items: visibleItems,
    byCategory,
    loading,
    error,
    updateItem,
    setItemHidden,
    mandatoryProgress,
    hasMandatoryIncomplete,
  };
}
