import React from 'react';
import { Platform } from 'react-native';
import { useBreadcrumbNavigation } from './common/useBreadcrumbNavigation';

/**
 * Samlar all web-specifik navigationslogik för HomeScreen:
 * - Breadcrumb-navigering (dkBreadcrumbNavigate)
 * - Publicering av aktuella breadcrumb-segment (dkBreadcrumbUpdate)
 * - Synk med browserns back/forward-historik
 */
export function useHomeWebNavigation({
  hierarchy,
  setHierarchy,
  hierarchyRef,
  selectedProject,
  selectedProjectPath,
  inlineControlEditor,
  projectInlineViewLabel,
  isInlineLocked,
  pendingBreadcrumbNavRef,
  requestProjectSwitch,
  openProject,
  setSelectedProject,
  setSelectedProjectPath,
  setInlineControlEditor,
  setProjectSelectedAction,
  findProjectById,
}) {
  const didApplyInitialUrlRef = React.useRef(false);
  // Hitta projektets main/sub-path utifrån ID (använder hierarki-ref för alltid färsk data)
  const findProjectPathById = React.useCallback((projectId) => {
    if (!projectId) return null;
    const targetId = String(projectId);
    try {
      const tree = hierarchyRef.current || [];
      const isProjectNode = (node) => {
        try {
          if (!node) return false;
          const t = String(node?.type || node?.kind || node?.nodeType || '').toLowerCase();
          if (t) return t === 'project';
          if (node.id == null) return false;
          if (typeof node.name !== 'string') return false;
          if (Array.isArray(node.children)) return false;
          return true;
        } catch (_e) {
          return false;
        }
      };

      for (const main of tree) {
        for (const sub of (main?.children || [])) {
          const proj = (sub?.children || []).find((ch) => ch && String(ch.id) === targetId && isProjectNode(ch));
          if (proj) return { main, sub, project: proj };
        }
      }
    } catch (_e) {}
    return null;
  }, [hierarchyRef]);

  // Breadcrumb-navigation inuti Home (App-header -> Home)
  const { applyBreadcrumbTarget, navigateViaBreadcrumb } = useBreadcrumbNavigation({
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
  });

  // Tillåt global header-breadcrumb (App.js) att styra navigationen i Home
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    const onNav = (event) => {
      try {
        const target = event?.detail?.target ?? event?.detail;
        if (!target) return;
        navigateViaBreadcrumb(target);
      } catch (_e) {}
    };

    try { window.addEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    return () => {
      try { window.removeEventListener('dkBreadcrumbNavigate', onNav); } catch (_e) {}
    };
  }, [navigateViaBreadcrumb]);

  // Publicera aktuella breadcrumb-segment (Dashboard / main / sub / project / control)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;

    try {
      const selectedProjectId = selectedProject?.id ? String(selectedProject.id) : null;

      const resolveFolderLabel = (node, fallback) => {
        try {
          const text = String(node?.name || node?.title || node?.label || '').trim();
          if (text) return text;
          const idText = String(node?.id || '').trim();
          return idText || fallback;
        } catch (_e) {
          return fallback;
        }
      };

      let path = null;
      try {
        if (selectedProjectId && selectedProjectPath?.mainId && selectedProjectPath?.subId) {
          const main = (hierarchy || []).find((m) => m && String(m.id) === String(selectedProjectPath.mainId)) || null;
          const sub = main && Array.isArray(main.children)
            ? (main.children || []).find((s) => s && String(s.id) === String(selectedProjectPath.subId))
            : null;
          path = {
            main: main || { id: selectedProjectPath.mainId, name: selectedProjectPath.mainName || '' },
            sub: sub || { id: selectedProjectPath.subId, name: selectedProjectPath.subName || '' },
            project: null,
          };
        }
      } catch (_e) { path = null; }
      try {
        if (!path && selectedProjectId) path = findProjectPathById(selectedProjectId);
      } catch (_e) { /* ignore */ }

      const expandedMain = (path && path.main) ? path.main : (hierarchy || []).find((m) => m && m.expanded);
      const expandedSub = (path && path.sub)
        ? path.sub
        : (expandedMain && Array.isArray(expandedMain.children)
          ? expandedMain.children.find((s) => s && s.expanded)
          : null);

      const projectId = selectedProjectId;
      const projectLabel = selectedProject
        ? `${String(selectedProject?.id || '').trim()} — ${String(selectedProject?.name || '').trim()}`.trim().replace(/^—\s*/, '')
        : '';

      const leafLabel = inlineControlEditor && inlineControlEditor.controlType
        ? String(inlineControlEditor.controlType).trim()
        : (projectInlineViewLabel ? String(projectInlineViewLabel).trim() : '');

      const segments = [];
      segments.push({ label: 'Startsida', target: { kind: 'dashboard' } });
      if (expandedMain) segments.push({ label: resolveFolderLabel(expandedMain, 'Huvudmapp'), target: { kind: 'main', mainId: expandedMain.id } });
      if (expandedMain && expandedSub) segments.push({ label: resolveFolderLabel(expandedSub, 'Undermapp'), target: { kind: 'sub', mainId: expandedMain.id, subId: expandedSub.id } });
      if (projectId) segments.push({ label: projectLabel || 'Projekt', target: { kind: 'project', projectId } });
      if (projectId && leafLabel) segments.push({ label: leafLabel, target: { kind: 'noop' } });

      try { window.__dkBreadcrumbHomeSegments = segments; } catch (_e) {}

      try {
        const detail = { scope: 'home', segments };
        const evt = (typeof CustomEvent === 'function')
          ? new CustomEvent('dkBreadcrumbUpdate', { detail })
          : (() => {
            const e = document.createEvent('Event');
            e.initEvent('dkBreadcrumbUpdate', true, true);
            e.detail = detail;
            return e;
          })();
        window.dispatchEvent(evt);
      } catch (_e) {}
    } catch (_e) {}
  }, [hierarchy, selectedProject, selectedProjectPath, projectInlineViewLabel, inlineControlEditor, findProjectPathById]);

  // Web: håll browserns back/forward i synk med selectedProject
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history) return;

    try {
      const st = window.history.state || {};
      if (!st.dkView) window.history.replaceState({ ...st, dkView: 'home' }, '');
    } catch(_e) {}

    const onPopState = (e) => {
      try {
        const st = e?.state || window.history.state || {};
        if (st && st.dkView === 'project' && st.projectId) {
          if (typeof openProject === 'function') {
            openProject(String(st.projectId), { selectedAction: null });
            return;
          }

          const proj = findProjectById(st.projectId);
          requestProjectSwitch(proj || { id: String(st.projectId), name: String(st.projectId) }, {
            selectedAction: null,
            path: null,
          });
        } else {
          requestProjectSwitch(null, { selectedAction: null, path: null });
        }
      } catch(_e) {
        requestProjectSwitch(null, { selectedAction: null, path: null });
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      try { window.removeEventListener('popstate', onPopState); } catch(_e) {}
    };
  }, [findProjectById, openProject, requestProjectSwitch]);

  // Web: support direct URL opens (best-effort)
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (didApplyInitialUrlRef.current) return;
    if (typeof openProject !== 'function') return;

    didApplyInitialUrlRef.current = true;

    try {
      const url = new URL(window.location.href);
      const qp = url.searchParams;
      const fromQuery = String(qp.get('projectId') || qp.get('project') || qp.get('pid') || '').trim();
      const m = String(url.pathname || '').match(/\/project\/(.+)$/);
      const fromPath = m && m[1] ? String(decodeURIComponent(m[1])).trim() : '';
      const projectId = fromQuery || fromPath;
      if (!projectId) return;

      openProject(projectId, { selectedAction: null });
    } catch (_e) {}
  }, [openProject]);

  // Web: pusha nytt state när selectedProject ändras
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history || typeof window.history.pushState !== 'function') return;

    const proj = selectedProject;
    if (proj && proj.id) {
      try {
        const st = window.history.state || {};
        if (st.dkView === 'project' && String(st.projectId || '') === String(proj.id)) return;
        window.history.pushState({ ...st, dkView: 'project', projectId: String(proj.id) }, '');
      } catch(_e) {}
    }
  }, [selectedProject]);

  return { applyBreadcrumbTarget, navigateViaBreadcrumb };
}
