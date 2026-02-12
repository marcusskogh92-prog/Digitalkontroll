/**
 * useModalKeyboard – Golden rule: Esc stänger, Enter sparar (när fokus inte är i input/textarea).
 * Tab och piltangenter fungerar normalt inom modalen (naturlig fokusordning).
 * Använd i alla modaler som ska följa modal golden rule.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

export function useModalKeyboard(visible, onClose, onSave, options = {}) {
  const { canSave = true, saving = false, disabled = false } = options;

  useEffect(() => {
    if (!visible || Platform.OS !== 'web' || typeof document === 'undefined') return;

    const handleKeyDown = (e) => {
      if (disabled) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        onClose?.();
        return;
      }

      if (e.key === 'Enter' && !saving && canSave) {
        const el = document.activeElement;
        const tag = el?.tagName ? String(el.tagName).toUpperCase() : '';
        const role = (el?.getAttribute?.('role') || '').toLowerCase();
        const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
        const isContentEditable = el?.isContentEditable;
        if (!isInput && !isContentEditable && role !== 'combobox') {
          e.preventDefault();
          onSave?.();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, onClose, onSave, canSave, saving, disabled]);
}
