import { useCallback, useRef, useState } from 'react';
import { DEFAULT_PHASE } from '../features/projects/constants';

/**
 * Hanterar träd-/mappinteraktioner för HomeScreen (SharePoint-hierarkin).
 * Samlar ihop:
 * - expand/collapse av mappar
 * - inline-skapande av huvud-/undermappar
 * - hjälpmetoder för att kollapsa hierarki, räkna projekt m.m.
 */
export function useHomeTreeInteraction({ hierarchy, setHierarchy, selectedPhase }) {
  const [isCreatingMainFolder, setIsCreatingMainFolder] = useState(false);
  const [creatingSubFolderForMainId, setCreatingSubFolderForMainId] = useState(null);
  const [newSubFolderName, setNewSubFolderName] = useState('');
  const [newMainFolderName, setNewMainFolderName] = useState('');

  const [spinMain, setSpinMain] = useState({});
  const [spinSub, setSpinSub] = useState({});
  const [expandedSubs, setExpandedSubs] = useState({});
  const [expandedProjects, setExpandedProjects] = useState({});

  // Legacy long-press timers for mobile tree
  const mainTimersRef = useRef({});
  const projektLongPressTimer = useRef(null);

  const collapseHierarchy = useCallback((items) => {
    if (!Array.isArray(items)) return [];
    return items.map((m) => {
      const mainPhase = m?.phase || DEFAULT_PHASE;
      return {
        ...m,
        type: m?.type || 'main',
        phase: mainPhase,
        expanded: false,
        children: Array.isArray(m.children)
          ? m.children.map((s) => {
              const subPhase = s?.phase || mainPhase;
              return {
                ...s,
                type: s?.type || 'sub',
                phase: subPhase,
                expanded: false,
                children: Array.isArray(s.children)
                  ? s.children.map((ch) => {
                      const projectPhase = ch?.phase || subPhase || mainPhase;
                      return { ...ch, phase: projectPhase };
                    })
                  : [],
              };
            })
          : [],
      };
    });
  }, []);

  const isFolderNameUnique = useCallback(
    (name) => {
      if (!name) return true;
      return !hierarchy.some((folder) => {
        const folderPhase = folder?.phase || DEFAULT_PHASE;
        return (
          folderPhase === selectedPhase &&
          String(folder.name || '').trim().toLowerCase() === String(name).trim().toLowerCase()
        );
      });
    },
    [hierarchy, selectedPhase],
  );

  const removeLastMainFolder = useCallback(() => {
    setHierarchy((prev) => (prev.length > 0 ? prev.slice(0, -1) : prev));
  }, [setHierarchy]);

  const countProjects = useCallback((tree) => {
    let count = 0;
    if (!Array.isArray(tree)) return count;
    const walk = (nodes) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach((node) => {
        if (node && node.type === 'project') {
          count++;
        }
        if (node && node.children && Array.isArray(node.children)) {
          walk(node.children);
        }
      });
    };
    walk(tree);
    return count;
  }, []);

  const countProjectStatus = useCallback((tree) => {
    let ongoing = 0;
    let completed = 0;
    if (!Array.isArray(tree)) return { ongoing, completed };
    const walk = (nodes) => {
      if (!Array.isArray(nodes)) return;
      nodes.forEach((node) => {
        if (node && node.type === 'project') {
          if (node.status === 'completed') completed++;
          else ongoing++;
        }
        if (node && node.children && Array.isArray(node.children)) {
          walk(node.children);
        }
      });
    };
    walk(tree);
    return { ongoing, completed };
  }, []);

  const handleToggleMainFolder = useCallback(
    (mainId) => {
      setHierarchy((prev) =>
        (prev || []).map((m) =>
          m && m.id === mainId ? { ...m, expanded: !m.expanded } : { ...m, expanded: false },
        ),
      );
      setSpinMain((prev) => ({ ...prev, [mainId]: (prev[mainId] || 0) + 1 }));
    },
    [setHierarchy],
  );

  const handleToggleSubFolder = useCallback((folderId) => {
    setExpandedSubs((prev) => ({ ...prev, [folderId]: !prev[folderId] }));
    setSpinSub((prev) => ({ ...prev, [folderId]: (prev[folderId] || 0) + 1 }));
  }, []);

  return {
    // state
    isCreatingMainFolder,
    setIsCreatingMainFolder,
    creatingSubFolderForMainId,
    setCreatingSubFolderForMainId,
    newSubFolderName,
    setNewSubFolderName,
    newMainFolderName,
    setNewMainFolderName,
    spinMain,
    setSpinMain,
    spinSub,
    setSpinSub,
    expandedSubs,
    setExpandedSubs,
    expandedProjects,
    setExpandedProjects,
    mainTimersRef,
    projektLongPressTimer,

    // helpers
    collapseHierarchy,
    isFolderNameUnique,
    removeLastMainFolder,
    countProjects,
    countProjectStatus,

    // handlers
    handleToggleMainFolder,
    handleToggleSubFolder,
  };
}
