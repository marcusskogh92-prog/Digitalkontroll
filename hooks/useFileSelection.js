/**
 * useFileSelection – Multi-select with Cmd/Ctrl + click (toggle) and Shift + click (range).
 * Used in file explorer for bulk actions (Flytta, Ladda ner, Ta bort).
 */

import { useCallback, useRef, useState } from 'react';
import { Platform } from 'react-native';

export function useFileSelection({ items = [], selectableFilter }) {
  const [selectedIds, setSelectedIds] = useState([]);
  const lastClickedIndexRef = useRef(-1);

  const selectableItems = Array.isArray(items)
    ? items.filter((it) => {
        if (!it?.id) return false;
        if (typeof selectableFilter === 'function' && !selectableFilter(it)) return false;
        return true;
      })
    : [];

  const selectedItems = selectableItems.filter((it) =>
    selectedIds.includes(String(it?.id || ''))
  );

  const isIdSelected = useCallback(
    (id) => selectedIds.includes(String(id || '')),
    [selectedIds]
  );

  const toggleSelection = useCallback((id) => {
    const s = String(id || '');
    if (!s) return;
    setSelectedIds((prev) => {
      const set = new Set(prev.map(String));
      if (set.has(s)) set.delete(s);
      else set.add(s);
      return Array.from(set);
    });
  }, []);

  const selectRange = useCallback((fromIndex, toIndex) => {
    const list = selectableItems;
    if (list.length === 0) return;
    const lo = Math.max(0, Math.min(fromIndex, toIndex));
    const hi = Math.min(list.length - 1, Math.max(fromIndex, toIndex));
    const ids = new Set();
    for (let i = lo; i <= hi; i++) {
      const id = list[i]?.id;
      if (id) ids.add(String(id));
    }
    setSelectedIds(Array.from(ids));
  }, [selectableItems]);

  const selectAll = useCallback(() => {
    setSelectedIds(selectableItems.map((it) => String(it?.id)).filter(Boolean));
  }, [selectableItems]);

  const clearSelection = useCallback(() => setSelectedIds([]), []);

  /** Handle row click with Cmd/Ctrl (toggle) and Shift (range) support. Returns true if selection was handled (caller should not navigate). */
  const handleRowClick = useCallback(
    (item, index, e, onDefaultClick) => {
      if (Platform.OS !== 'web' || !item?.id) {
        onDefaultClick?.();
        return false;
      }
      const meta = e?.nativeEvent?.metaKey || e?.nativeEvent?.ctrlKey;
      const shift = e?.nativeEvent?.shiftKey;
      const idx = selectableItems.findIndex((x) => String(x?.id) === String(item.id));
      const safeIdx = idx >= 0 ? idx : index;

      if (meta) {
        toggleSelection(item.id);
        lastClickedIndexRef.current = safeIdx;
        return true;
      }
      if (shift) {
        const last = lastClickedIndexRef.current >= 0 ? lastClickedIndexRef.current : safeIdx;
        selectRange(last, safeIdx);
        return true;
      }

      lastClickedIndexRef.current = safeIdx;
      onDefaultClick?.();
      return false;
    },
    [selectableItems, toggleSelection, selectRange]
  );

  const allSelected =
    selectableItems.length > 0 && selectedIds.length >= selectableItems.length;
  const someSelected = selectedIds.length > 0;

  return {
    selectedIds,
    selectedItems,
    selectableItems,
    isIdSelected,
    toggleSelection,
    selectRange,
    selectAll,
    clearSelection,
    handleRowClick,
    allSelected,
    someSelected,
  };
}
