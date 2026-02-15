/**
 * useInlineRename – Inline rename on double-click (files/folders).
 * Enter = save, Esc = cancel, click outside = save.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

export function useInlineRename({ onRename, existingNames = new Set() }) {
  const [editingId, setEditingId] = useState(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const commitEdit = useCallback(
    async (item) => {
      if (!item?.id || !onRename) return;
      const val = String(editValue || '').trim();
      if (!val) {
        setError('Ange ett namn.');
        return;
      }
      const valLower = val.toLowerCase();
      const existing = Array.from(existingNames || []).map((n) =>
        String(n || '').toLowerCase()
      );
      const isDuplicate = existing.some(
        (n) => n && n === valLower && valLower !== String(item?.name || '').toLowerCase()
      );
      if (isDuplicate) {
        setError('Ett objekt med detta namn finns redan.');
        return;
      }
      setError('');
      setIsSaving(true);
      try {
        await onRename(item, val);
        setEditingId(null);
        setEditValue('');
      } catch (e) {
        setError(String(e?.message || e || 'Kunde inte byta namn.'));
      } finally {
        setIsSaving(false);
      }
    },
    [editValue, onRename, existingNames]
  );

  const cancelEdit = useCallback(() => {
    setEditingId(null);
    setEditValue('');
    setError('');
  }, []);

  const startEdit = useCallback((item, initialValue) => {
    if (!item?.id) return;
    setEditingId(item.id);
    const val = initialValue !== undefined ? String(initialValue) : String(item?.name || '').trim();
    setEditValue(val);
    setError('');
    if (Platform.OS === 'web' && inputRef.current) {
      setTimeout(() => {
        try {
          inputRef.current?.focus?.();
          inputRef.current?.select?.();
        } catch (_e) {}
      }, 0);
    }
  }, []);

  const handleKeyDown = useCallback(
    (e, item) => {
      if (e?.key === 'Escape') {
        e.preventDefault();
        cancelEdit();
      }
      if (e?.key === 'Enter') {
        e.preventDefault();
        if (item) commitEdit(item);
      }
    },
    [cancelEdit, commitEdit]
  );

  return {
    editingId,
    editValue,
    setEditValue,
    isSaving,
    error,
    inputRef,
    startEdit,
    commitEdit,
    cancelEdit,
    handleKeyDown,
    isEditing: (id) => editingId === id,
  };
}
