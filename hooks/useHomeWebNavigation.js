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
  projectModuleRoute,
  setProjectModuleRoute,
  findProjectById,
}) {
  const didApplyInitialUrlRef = React.useRef(false);

  const normalizeOfferterItemId = React.useCallback((raw) => {
    const v = String(raw || '').trim();
    if (!v) return 'forfragningar';
    if (v === 'inkomna-offerter' || v === '02-offerter' || v === '02_offerter') return 'offerter';
    return v;
  }, []);

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
      if (!st.dkView) window.history.replaceState({ ...st, dkView: 'home' }, '', window.location.pathname + (window.location.search || ''));
    } catch(_e) {}

    const onPopState = (e) => {
      try {
        const st = e?.state || window.history.state || {};
        const view = st?.dkView;
        const pid = st?.projectId ? String(st.projectId) : '';

        if (view === 'offerter' && pid) {
          const itemId = normalizeOfferterItemId(st?.itemId || 'forfragningar');
          try {
            if (typeof setProjectModuleRoute === 'function') {
              setProjectModuleRoute({ moduleId: 'offerter', itemId });
            }
          } catch (_e) {}

          if (typeof openProject === 'function') {
            openProject(pid, { selectedAction: null, keepModuleRoute: true });
            return;
          }

          const proj = findProjectById(pid);
          requestProjectSwitch(proj || { id: pid, name: pid }, { selectedAction: null, path: null });
          return;
        }

        if (view === 'project' && pid) {
          try {
            if (typeof setProjectModuleRoute === 'function') setProjectModuleRoute(null);
          } catch (_e) {}

          if (typeof openProject === 'function') {
            openProject(pid, { selectedAction: null });
            return;
          }

          const proj = findProjectById(pid);
          requestProjectSwitch(proj || { id: pid, name: pid }, { selectedAction: null, path: null });
          return;
        }

        try {
          if (typeof setProjectModuleRoute === 'function') setProjectModuleRoute(null);
        } catch (_e) {}
        requestProjectSwitch(null, { selectedAction: null, path: null });
      } catch(_e) {
        try {
          if (typeof setProjectModuleRoute === 'function') setProjectModuleRoute(null);
        } catch (_e2) {}
        requestProjectSwitch(null, { selectedAction: null, path: null });
      }
    };

    window.addEventListener('popstate', onPopState);
    return () => {
      try { window.removeEventListener('popstate', onPopState); } catch(_e) {}
    };
  }, [findProjectById, openProject, requestProjectSwitch, normalizeOfferterItemId, setProjectModuleRoute]);

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

      const pathname = String(url.pathname || '');
      const mOfferter = pathname.match(/^\/projects\/([^/]+)\/offerter(?:\/([^/]+))?\/?$/i);
      const mProjectPlural = pathname.match(/^\/projects\/([^/]+)\/?$/i);
      const mProjectLegacy = pathname.match(/\/project\/(.+)$/i);

      const projectIdFromOfferter = mOfferter && mOfferter[1] ? String(decodeURIComponent(mOfferter[1])).trim() : '';
      const offerterItem = mOfferter && mOfferter[2] ? String(decodeURIComponent(mOfferter[2])).trim() : '';
      const projectIdFromPlural = mProjectPlural && mProjectPlural[1] ? String(decodeURIComponent(mProjectPlural[1])).trim() : '';
      const projectIdFromLegacy = mProjectLegacy && mProjectLegacy[1] ? String(decodeURIComponent(mProjectLegacy[1])).trim() : '';

      const projectId = fromQuery || projectIdFromOfferter || projectIdFromPlural || projectIdFromLegacy;
      if (!projectId) return;

      if (projectIdFromOfferter) {
        try {
          if (typeof setProjectModuleRoute === 'function') {
            setProjectModuleRoute({ moduleId: 'offerter', itemId: normalizeOfferterItemId(offerterItem || 'forfragningar') });
          }
        } catch (_e) {}
      } else {
        try {
          if (typeof setProjectModuleRoute === 'function') setProjectModuleRoute(null);
        } catch (_e) {}
      }

      openProject(projectId, { selectedAction: null, keepModuleRoute: Boolean(projectIdFromOfferter) });
    } catch (_e) {}
  }, [openProject, normalizeOfferterItemId, setProjectModuleRoute]);

  // Web: pusha nytt state när selectedProject ändras
  React.useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof window === 'undefined') return;
    if (!window.history || typeof window.history.pushState !== 'function') return;

    const proj = selectedProject;
    if (!proj || !proj.id) return;

    const pid = String(proj.id);
    const mod = String(projectModuleRoute?.moduleId || '').trim();
    const item = String(projectModuleRoute?.itemId || '').trim();

    const next = (() => {
      if (mod === 'offerter') {
        const safeItem = normalizeOfferterItemId(item || 'forfragningar');
        return {
          state: { dkView: 'offerter', projectId: pid, moduleId: 'offerter', itemId: safeItem },
          url: `/projects/${encodeURIComponent(pid)}/offerter/${encodeURIComponent(safeItem)}`,
        };
      }
      return {
        state: { dkView: 'project', projectId: pid },
        url: `/projects/${encodeURIComponent(pid)}`,
      };
    })();

    try {
      const st = window.history.state || {};
      const sameView = st.dkView === next.state.dkView;
      const samePid = String(st.projectId || '') === pid;
      const sameItem = next.state.dkView !== 'offerter' || String(st.itemId || '') === String(next.state.itemId || '');
      const sameUrl = String(window.location.pathname || '') === String(next.url);
      if (sameView && samePid && sameItem && sameUrl) return;

      window.history.pushState({ ...st, ...next.state }, '', next.url);
    } catch(_e) {}
  }, [selectedProject, projectModuleRoute, normalizeOfferterItemId]);

  return { applyBreadcrumbTarget, navigateViaBreadcrumb };
}
