import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Platform } from 'react-native';

import { fetchCompanyMallar } from '../components/firebase';
import { DEFAULT_PHASE } from '../features/projects/constants';

// Hanterar högerklicksmenyn i projekträdet (endast web):
// - fångar contextmenu-event i DOM
// - visar meny för projekt (öppna / skapa kontroll)
// - innehåller legacy-stöd för mappar (main/sub), även om inga items exponeras
export function useTreeContextMenu({
  hierarchy,
  setHierarchy,
  companyId,
  routeCompanyId,
  authClaims,
  controlTypeOptions,
  requestProjectSwitch,
  setSimpleProjectModal,
  setNewProjectName,
  setNewProjectNumber,
  setNewProjectModal,
  setIsCreatingMainFolder,
  setNewMainFolderName,
  handleToggleMainFolder,
  setCreatingSubFolderForMainId,
  setNewSubFolderName,
  setProjectControlSelectedType,
  setProjectControlTypePickerOpen,
  setProjectControlTemplates,
  setProjectControlSelectedTemplateId,
  setProjectControlTemplatePickerOpen,
  setProjectControlTemplateSearch,
  setProjectControlModal,
}) {
  const [contextMenu, setContextMenu] = useState({
    visible: false,
    x: 0,
    y: 0,
    target: null,
  });

  const ensuredDefaultMainRef = useRef(false);

  const [hoveredRowKey, setHoveredRowKey] = useState(null);
  const getRowKey = useCallback((type, mainId, subId, projectId) => {
    return [type, mainId ?? '', subId ?? '', projectId ?? ''].join(':');
  }, []);

  const closeContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false, target: null }));
  }, []);

  const getContextCoords = useCallback((e) => {
    const ne = e?.nativeEvent || e;
    const rawX = ne?.pageX ?? ne?.clientX ?? 0;
    const rawY = ne?.pageY ?? ne?.clientY ?? 0;
    const menuWidth = 220;
    const menuHeight = 220;
    if (typeof window !== 'undefined') {
      const maxX = Math.max(8, (window.innerWidth || rawX) - menuWidth - 8);
      const maxY = Math.max(8, (window.innerHeight || rawY) - menuHeight - 8);
      return { x: Math.min(rawX, maxX), y: Math.min(rawY, maxY) };
    }
    return { x: rawX, y: rawY };
  }, []);

  const openContextMenu = useCallback(
    (e, target) => {
      if (Platform.OS !== 'web') return;
      try {
        e?.preventDefault?.();
      } catch (_e) {}
      const { x, y } = getContextCoords(e);
      setContextMenu({ visible: true, x, y, target });
    },
    [getContextCoords],
  );

  // Fångar native contextmenu-event i webbläsaren inom trädets root-element
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;

    const handler = (ev) => {
      const rootEl = document.getElementById('dk-tree-root');
      if (!rootEl) return;
      if (!rootEl.contains(ev.target)) return;

      // Only intercept right-clicks for rows that explicitly participate in the legacy tree menu.
      // Otherwise, let the browser/default handlers or other UI menus (e.g. SharePointLeftPanel) handle it.
      const rowEl = ev.target?.closest?.('[data-dk-type]');
      if (!rowEl) return;

      ev.preventDefault();
      ev.stopPropagation();

      const dkType = rowEl.getAttribute('data-dk-type');
      const mainId = rowEl.getAttribute('data-dk-mainid');
      const subId = rowEl.getAttribute('data-dk-subid');
      const projectId = rowEl.getAttribute('data-dk-projectid');

      let target = null;
      if (dkType === 'main') {
        target = { type: 'main', mainId };
      } else if (dkType === 'sub') {
        target = { type: 'sub', mainId, subId };
      } else if (dkType === 'project') {
        const findProjectRecursive = (nodes) => {
          if (!Array.isArray(nodes)) return null;
          for (const node of nodes) {
            if (node && node.type === 'project' && String(node.id) === String(projectId)) {
              return node;
            }
            if (node && node.children && Array.isArray(node.children)) {
              const result = findProjectRecursive(node.children);
              if (result) return result;
            }
          }
          return null;
        };
        const project = findProjectRecursive(hierarchy || []);
        target = { type: 'project', mainId, subId, project };
      }

      if (!target) return;
      openContextMenu(ev, target);
    };

    document.addEventListener('contextmenu', handler, { capture: true });
    return () => document.removeEventListener('contextmenu', handler, { capture: true });
  }, [hierarchy, openContextMenu]);

  // Säkerställ minst en huvudmapp (legacy-stöd)
  useEffect(() => {
    if (!companyId) return;
    if (ensuredDefaultMainRef.current) return;
    if (Array.isArray(hierarchy) && hierarchy.length === 0) {
      ensuredDefaultMainRef.current = true;
      setHierarchy([
        {
          id: (Math.random() * 100000).toFixed(0),
          name: 'Huvudmapp',
          type: 'main',
          phase: DEFAULT_PHASE,
          expanded: false,
          children: [],
        },
      ]);
    }
  }, [hierarchy, companyId, setHierarchy]);

  const renameMainFolderWeb = useCallback(
    (mainId) => {
      const current = hierarchy.find((m) => m.id === mainId);
      const currentName = current?.name || '';
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const nextName = (window.prompt('Byt namn på huvudmapp', currentName) || '').trim();
        if (!nextName) return;
        setHierarchy((prev) => prev.map((m) => (m.id === mainId ? { ...m, name: nextName } : m)));
        return;
      }
    },
    [hierarchy, setHierarchy],
  );

  const renameSubFolderWeb = useCallback(
    (subId) => {
      let currentName = '';
      hierarchy.forEach((m) => {
        (m.children || []).forEach((s) => {
          if (s.id === subId) currentName = s.name || '';
        });
      });
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const nextName = (window.prompt('Byt namn på undermapp', currentName) || '').trim();
        if (!nextName) return;
        setHierarchy((prev) =>
          prev.map((m) => ({
            ...m,
            children: (m.children || []).map((s) => (s.id === subId ? { ...s, name: nextName } : s)),
          })),
        );
      }
    },
    [hierarchy, setHierarchy],
  );

  const deleteMainFolderGuarded = useCallback(
    (mainId) => {
      const mainName = (hierarchy || []).find((m) => m.id === mainId)?.name || '';
      if ((hierarchy || []).length <= 1) {
        if (Platform.OS === 'web' && typeof window !== 'undefined') {
          window.alert('Kan inte radera.\n\nDet måste finnas minst en huvudmapp.');
        } else {
          Alert.alert('Kan inte radera', 'Det måste finnas minst en huvudmapp.');
        }
        return;
      }
      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(
          `Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`,
        );
        if (!ok) return;
        setHierarchy((prev) => prev.filter((m) => m.id !== mainId));
        return;
      }

      Alert.alert(
        'Radera huvudmapp',
        `Vill du verkligen radera huvudmappen${mainName ? ` "${mainName}"` : ''}?`,
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Radera',
            style: 'destructive',
            onPress: () => setHierarchy((prev) => prev.filter((m) => m.id !== mainId)),
          },
        ],
      );
    },
    [hierarchy, setHierarchy],
  );

  const deleteSubFolder = useCallback(
    (mainId, subId) => {
      const main = (hierarchy || []).find((m) => m.id === mainId);
      const subName = (main?.children || []).find((s) => s.id === subId)?.name || '';

      if (Platform.OS === 'web' && typeof window !== 'undefined') {
        const ok = window.confirm(
          `Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`,
        );
        if (!ok) return;
        setHierarchy((prev) =>
          prev.map((m) =>
            m.id === mainId
              ? { ...m, children: (m.children || []).filter((s) => s.id !== subId) }
              : m,
          ),
        );
        return;
      }

      Alert.alert(
        'Radera undermapp',
        `Vill du verkligen radera undermappen${subName ? ` "${subName}"` : ''}?`,
        [
          { text: 'Avbryt', style: 'cancel' },
          {
            text: 'Radera',
            style: 'destructive',
            onPress: () =>
              setHierarchy((prev) =>
                prev.map((m) =>
                  m.id === mainId
                    ? { ...m, children: (m.children || []).filter((s) => s.id !== subId) }
                    : m,
                ),
              ),
          },
        ],
      );
    },
    [hierarchy, setHierarchy],
  );

  const deleteMainFolderGuardedCallback = useCallback(
    (mainId) => {
      deleteMainFolderGuarded(mainId, hierarchy, setHierarchy);
    },
    [hierarchy, deleteMainFolderGuarded, setHierarchy],
  );

  const deleteSubFolderCallback = useCallback(
    (mainId, subId) => {
      deleteSubFolder(mainId, subId, hierarchy, setHierarchy);
    },
    [hierarchy, deleteSubFolder, setHierarchy],
  );

  const contextMenuItems = useMemo(() => {
    const t = contextMenu.target;
    if (!t) return [];
    if (t.type === 'main' || t.type === 'sub' || t.type === 'folder') return [];
    if (t.type === 'project') {
      return [
        {
          key: 'open',
          label: 'Öppna projekt',
          iconName: 'document-text-outline',
          icon: null,
        },
        {
          key: 'addControl',
          label: 'Skapa ny kontroll',
          iconName: 'checkmark-circle-outline',
          icon: null,
        },
      ];
    }
    return [];
  }, [contextMenu.target]);

  const handleContextMenuSelect = useCallback(
    (item) => {
      const t = contextMenu.target;
      if (!t) return;

      if (t.type === 'main') {
        const mainId = t.mainId;
        switch (item.key) {
          case 'addMain':
            setIsCreatingMainFolder(true);
            setNewMainFolderName('');
            break;
          case 'addSub': {
            const mainFolderForSub = hierarchy.find(
              (m) => String(m.id) === String(mainId),
            );
            if (!mainFolderForSub) {
              console.warn(
                '[addSub] Main folder not found:',
                mainId,
                'in hierarchy:',
                hierarchy.map((m) => m.id),
              );
              break;
            }
            const mainIdStr = String(mainId);

            if (!mainFolderForSub.expanded) {
              handleToggleMainFolder(mainIdStr);
              setTimeout(() => {
                setCreatingSubFolderForMainId(mainIdStr);
                setNewSubFolderName('');
              }, 150);
            } else {
              setTimeout(() => {
                setCreatingSubFolderForMainId(mainIdStr);
                setNewSubFolderName('');
              }, 50);
            }
            break;
          }
          case 'addProject':
            if (Platform.OS === 'web' && typeof window !== 'undefined') {
              window.alert(
                'Projekt måste skapas i en undermapp. Skapa en undermapp först genom att högerklicka på huvudmappen och välja "Lägg till undermapp".',
              );
            } else {
              Alert.alert(
                'Information',
                'Projekt måste skapas i en undermapp. Skapa en undermapp först.',
              );
            }
            break;
          case 'rename':
            renameMainFolderWeb(mainId);
            break;
          case 'delete':
            deleteMainFolderGuardedCallback(mainId);
            break;
        }
      }

      if (t.type === 'sub') {
        const mainId = t.mainId;
        const subId = t.subId;
        switch (item.key) {
          case 'addProject':
            setSimpleProjectModal({ visible: true, parentSubId: subId, parentMainId: mainId });
            setNewProjectName('');
            setNewProjectNumber('');
            break;
          case 'rename':
            renameSubFolderWeb(subId);
            break;
          case 'delete':
            deleteSubFolderCallback(mainId, subId);
            break;
        }
      }

      if (t.type === 'project') {
        const project = t.project;
        switch (item.key) {
          case 'open':
            if (project && Platform.OS === 'web') {
              requestProjectSwitch(project, { selectedAction: null, path: null });
            }
            break;
          case 'addControl':
            if (project) {
              setProjectControlSelectedType(controlTypeOptions[0]?.type || '');
              setProjectControlTypePickerOpen(false);
              setProjectControlTemplates([]);
              setProjectControlSelectedTemplateId('');
              setProjectControlTemplatePickerOpen(false);
              setProjectControlTemplateSearch('');
              (async () => {
                try {
                  const cid = String(
                    companyId || routeCompanyId || authClaims?.companyId || '',
                  ).trim();
                  if (cid) {
                    const items = await fetchCompanyMallar(cid).catch(() => []);
                    const list = Array.isArray(items) ? items : [];
                    setProjectControlTemplates(list);
                  }
                } catch (_e) {}
                setProjectControlModal({ visible: true, project });
              })();
            }
            break;
        }
      }
    },
    [
      authClaims?.companyId,
      companyId,
      contextMenu.target,
      controlTypeOptions,
      deleteMainFolderGuardedCallback,
      deleteSubFolderCallback,
      handleToggleMainFolder,
      hierarchy,
      requestProjectSwitch,
      routeCompanyId,
      setCreatingSubFolderForMainId,
      setIsCreatingMainFolder,
      setNewMainFolderName,
      setNewProjectModal,
      setNewProjectName,
      setNewProjectNumber,
      setNewSubFolderName,
      setProjectControlModal,
      setProjectControlSelectedType,
      setProjectControlTemplatePickerOpen,
      setProjectControlTemplateSearch,
      setProjectControlTemplates,
      setProjectControlTypePickerOpen,
      setProjectControlSelectedTemplateId,
      setSimpleProjectModal,
      renameMainFolderWeb,
      renameSubFolderWeb,
    ],
  );

  return {
    contextMenu,
    contextMenuItems,
    handleContextMenuSelect,
    closeContextMenu,
    hoveredRowKey,
    setHoveredRowKey,
    getRowKey,
    openContextMenu,
  };
}
