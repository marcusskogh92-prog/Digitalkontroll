/**
 * useBreadcrumbNavigation - Hook for breadcrumb navigation logic
 * Extracted from HomeScreen.js to improve code organization
 */

import { useCallback } from 'react';
import { Platform } from 'react-native';
import { collapseHierarchy } from './useHierarchy';

export function useBreadcrumbNavigation({
  hierarchy,
  setHierarchy,
  findProjectPathById,
  setSelectedProject,
  setSelectedProjectPath,
  setInlineControlEditor,
  setProjectSelectedAction,
  isInlineLocked,
  pendingBreadcrumbNavRef,
  requestProjectSwitch,
}) {
  const applyBreadcrumbTarget = useCallback((target) => {
    const t = target || {};
    const kind = String(t.kind || '').trim();

    const setTree = (updater) => {
      try { setHierarchy((prev) => updater(prev)); } catch (_e) {}
    };

    const closeProjectAndInline = () => {
      try { setInlineControlEditor(null); } catch (_e) {}
      try { setProjectSelectedAction(null); } catch (_e) {}
      try { setSelectedProjectPath(null); } catch (_e) {}
      try { setSelectedProject(null); } catch (_e) {}
    };

    if (kind === 'dashboard') {
      closeProjectAndInline();
      setTree((prev) => collapseHierarchy(prev));
      return;
    }

    if (kind === 'projectHome') {
      // Stay in the current project but close any inline control view.
      try { setInlineControlEditor(null); } catch (_e) {}
      try {
        setProjectSelectedAction({ id: `closeInline:${Date.now()}`, kind: 'closeInline' });
        setTimeout(() => {
          try { setProjectSelectedAction(null); } catch (_e2) {}
        }, 0);
      } catch (_e) {}
      return;
    }

    if (kind === 'main') {
      const mainId = String(t.mainId || '');
      closeProjectAndInline();
      if (!mainId) return;
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === mainId,
        children: Array.isArray(m.children) ? m.children.map((s) => ({ ...s, expanded: false })) : [],
      })) : prev));
      return;
    }

    if (kind === 'sub') {
      const mainId = String(t.mainId || '');
      const subId = String(t.subId || '');
      closeProjectAndInline();
      if (!mainId || !subId) return;
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === mainId,
        children: Array.isArray(m.children) ? m.children.map((s) => ({
          ...s,
          expanded: String(m.id) === mainId && String(s.id) === subId,
        })) : [],
      })) : prev));
      return;
    }

    if (kind === 'project') {
      const projectId = String(t.projectId || '');
      if (!projectId) return;
      const path = findProjectPathById(projectId);
      if (!path || !path.project) return;

      // Ensure left tree reflects the path
      setTree((prev) => (Array.isArray(prev) ? prev.map((m) => ({
        ...m,
        expanded: String(m.id) === String(path.main?.id),
        children: Array.isArray(m.children) ? m.children.map((s) => ({
          ...s,
          expanded: String(m.id) === String(path.main?.id) && String(s.id) === String(path.sub?.id),
        })) : [],
      })) : prev));

      try { setInlineControlEditor(null); } catch (_e) {}
      try { setProjectSelectedAction(null); } catch (_e) {}
      try {
        setSelectedProjectPath({
          mainId: String(path.main?.id || ''),
          subId: String(path.sub?.id || ''),
          mainName: String(path.main?.name || ''),
          subName: String(path.sub?.name || ''),
          projectId,
        });
      } catch (_e) {}
      try { setSelectedProject({ ...path.project }); } catch (_e) {}
    }
  }, [findProjectPathById, setHierarchy, setSelectedProject, setSelectedProjectPath, setInlineControlEditor, setProjectSelectedAction]);

  const navigateViaBreadcrumb = useCallback((target) => {
    // If an inline form is open/locked, route through exit-confirm first.
    if (Platform.OS === 'web' && isInlineLocked) {
      pendingBreadcrumbNavRef.current = target;
      try {
        window.dispatchEvent(new CustomEvent('dkInlineAttemptExit', { detail: { reason: 'breadcrumb' } }));
      } catch (_e) {
        // Fallback: if event dispatch fails, proceed immediately.
        applyBreadcrumbTarget(target);
      }
      return;
    }

    applyBreadcrumbTarget(target);
  }, [isInlineLocked, pendingBreadcrumbNavRef, applyBreadcrumbTarget]);

  return {
    applyBreadcrumbTarget,
    navigateViaBreadcrumb,
  };
}
