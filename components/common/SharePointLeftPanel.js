import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native';
import { DEFAULT_PHASE, getPhaseConfig } from '../../features/projects/constants';
import { ensureFolderPath } from '../../services/azure/fileService';
import { folderHasFilesDeep, loadFolderChildren } from '../../services/azure/hierarchyService';
import { filterHierarchyByConfig } from '../../utils/filterSharePointHierarchy';
import { extractProjectMetadata, isProjectFolder } from '../../utils/isProjectFolder';
import ContextMenu from '../ContextMenu';
import { fetchSharePointProjectMetadataMap, getSharePointNavigationConfig } from '../firebase';
import { ProjectTree } from './ProjectTree';
import SharePointSiteIcon from './SharePointSiteIcon';

const PRIMARY_BLUE = '#1976D2';
const HOVER_BG = 'rgba(25, 118, 210, 0.10)';

function RecursiveFolderView({
  folder,
  level = 0,
  expandedSubs,
  spinSubs,
  onToggle,
  companyId,
  hierarchy,
  setHierarchy,
  parentPath = '',
  isProject = false,
  onSelectProject = null,
  navigation = null,
  projectMetadataMap = null,
  fallbackPhaseKey = null,
}) {
  const [isHovered, setIsHovered] = useState(false);

  if (!folder) return null;

  const safeName = folder.name || folder.id || '';
  const marginLeft = 12 + level * 8;
  const folderSpin = spinSubs?.[folder.id] || 0;
  const folderChevronAngle = folderSpin * 360;
  const visibleChildren = Array.isArray(folder.children)
    ? folder.children
        .filter(child => child && (child.type === 'folder' || !child.type))
        .sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    : [];
  
  // Check if this folder is a project (if not already determined)
  const folderIsProject = isProject || isProjectFolder(folder);

  const extractedMeta = folderIsProject ? extractProjectMetadata(folder) : null;
  const projectPath = extractedMeta?.path || folder.path || folder.name || '';
  const siteId =
    String(
      folder.siteId ||
      folder.siteID ||
      folder?.site?.id ||
      folder?.site?.siteId ||
      hierarchy?.siteId ||
      hierarchy?.siteID ||
      ''
    ).trim();
  const projectMetaKey = siteId && projectPath ? `${siteId}|${projectPath}` : null;
  const savedMeta = projectMetaKey && projectMetadataMap ? projectMetadataMap.get(projectMetaKey) : null;
  const effectivePhaseKey =
    (savedMeta?.phaseKey && String(savedMeta.phaseKey).trim()) ||
    (folder?.phase && String(folder.phase).trim()) ||
    (fallbackPhaseKey && fallbackPhaseKey !== 'all' ? String(fallbackPhaseKey).trim() : null) ||
    DEFAULT_PHASE;
  const indicatorColor = getPhaseConfig(effectivePhaseKey)?.color || '#43A047';
  
  const handlePress = () => {
    try {
      if (folderIsProject) {
        // Project folder: navigate to project view
        const projectMetadata = extractedMeta;
        if (projectMetadata) {
          const projectData = {
            ...folder,
            // Display identity
            id: projectMetadata.id || projectMetadata.number || folder.name,
            number: projectMetadata.number || projectMetadata.id || '',
            name: projectMetadata.name || projectMetadata.fullName || folder.name,
            projectNumber: projectMetadata.number || projectMetadata.id || '',
            projectName: projectMetadata.name || '',
            fullName: projectMetadata.fullName || folder.name,
            // SharePoint identity (internal)
            sharePointId: projectMetadata.sharePointId || folder.id || null,
            // Location
            path: projectMetadata.path || folder.path || folder.name,
            siteId,
            // Project context
            type: 'project',
            phase: effectivePhaseKey,
            status: savedMeta?.status || (effectivePhaseKey === 'avslut' ? 'completed' : 'ongoing'),
          };
          
          if (onSelectProject) {
            onSelectProject(projectData);
          } else if (navigation) {
            navigation.navigate('ProjectDetails', {
              project: projectData,
              companyId,
            });
          }
        }
      } else {
        // Regular folder: expand/collapse
        if (onToggle) {
          onToggle(folder.id);
        }
      }
    } catch (error) {
      console.error('[RecursiveFolderView] Error handling folder press:', error);
    }
  };

  if (Platform.OS === 'web') {
    return (
      <div style={{ marginLeft, marginTop: 4 }}>
        <div
          onClick={handlePress}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '4px 8px',
            cursor: 'pointer',
            borderRadius: 4,
            backgroundColor: isHovered ? HOVER_BG : 'transparent',
            transition: 'background-color 0.15s ease',
          }}
        >
          {!folderIsProject && (
            <Ionicons
              name={expandedSubs?.[folder.id] ? 'chevron-down' : 'chevron-forward'}
              size={Math.max(12, 16 - level)}
              color={isHovered ? PRIMARY_BLUE : '#222'}
              style={{
                marginRight: 6,
                transform: [{ rotate: `${folderChevronAngle}deg` }],
                transitionProperty: 'transform',
                transitionDuration: '0.4s',
                transitionTimingFunction: 'ease',
              }}
            />
          )}
          {folderIsProject && (
            <div
              style={{
                width: 10,
                height: 10,
                borderRadius: 5,
                backgroundColor: indicatorColor,
                marginRight: 8,
                border: '1px solid #bbb',
                display: 'inline-block',
              }}
            />
          )}
          <span
            style={{
              fontSize: 14,
              color: PRIMARY_BLUE,
              fontWeight: isHovered ? '700' : '600',
              fontFamily: 'Inter_400Regular, Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
            }}
          >
            {safeName}
          </span>
        </div>

        {!folderIsProject && expandedSubs?.[folder.id] && visibleChildren.length > 0 && (
          <div style={{ marginLeft: 8, marginTop: 2 }}>
            {visibleChildren.map(child => {
              const childIsProject = isProjectFolder(child);
              return (
                <RecursiveFolderView
                  key={child.id || `${safeName}-${level}`}
                  folder={child}
                  level={level + 1}
                  expandedSubs={expandedSubs}
                  spinSubs={spinSubs}
                  onToggle={onToggle}
                  companyId={companyId}
                  hierarchy={hierarchy}
                  setHierarchy={setHierarchy}
                  parentPath={parentPath}
                  isProject={childIsProject}
                  onSelectProject={onSelectProject}
                  navigation={navigation}
                  projectMetadataMap={projectMetadataMap}
                  fallbackPhaseKey={fallbackPhaseKey}
                />
              );
            })}
          </div>
        )}
        {!folderIsProject && expandedSubs?.[folder.id] && visibleChildren.length === 0 && (
          <div style={{ marginLeft: 20, marginTop: 2 }}>
            <span
              style={{
                fontSize: 12,
                color: '#888',
                fontStyle: 'italic',
              }}
            >
              Mappen är tom
            </span>
          </div>
        )}
      </div>
    );
  }

  return (
    <View style={{ marginLeft, marginTop: 4 }}>
      <TouchableOpacity
        style={{ 
          flexDirection: 'row', 
          alignItems: 'center', 
          paddingVertical: 2, 
          paddingHorizontal: 4,
          backgroundColor: folderIsProject ? 'transparent' : 'transparent',
        }}
        onPress={handlePress}
      >
        {!folderIsProject && (
          <Ionicons
            name={expandedSubs?.[folder.id] ? 'chevron-down' : 'chevron-forward'}
            size={Math.max(12, 16 - level)}
            color="#222"
            style={{
              marginRight: 4,
              transform: [{ rotate: `${folderChevronAngle}deg` }],
            }}
          />
        )}
        {folderIsProject && (
          <View
            style={{
              width: 10,
              height: 10,
              borderRadius: 5,
              backgroundColor: indicatorColor,
              marginRight: 6,
              borderWidth: 1,
              borderColor: '#bbb',
            }}
          />
        )}
        <Text
          style={{
            fontSize: 14,
            color: '#1976D2',
            fontWeight: '600',
          }}
        >
          {safeName}
        </Text>
      </TouchableOpacity>

      {!folderIsProject && expandedSubs?.[folder.id] && visibleChildren.length > 0 && (
        <View style={{ marginLeft: 8, marginTop: 2 }}>
          {visibleChildren.map(child => {
            const childIsProject = isProjectFolder(child);
            return (
              <RecursiveFolderView
                key={child.id || `${safeName}-${level}`}
                folder={child}
                level={level + 1}
                expandedSubs={expandedSubs}
                spinSubs={spinSubs}
                onToggle={onToggle}
                companyId={companyId}
                hierarchy={hierarchy}
                setHierarchy={setHierarchy}
                parentPath={parentPath}
                isProject={childIsProject}
                onSelectProject={onSelectProject}
                navigation={navigation}
                projectMetadataMap={projectMetadataMap}
                fallbackPhaseKey={fallbackPhaseKey}
              />
            );
          })}
        </View>
      )}
      {!folderIsProject && expandedSubs?.[folder.id] && visibleChildren.length === 0 && (
        <Text
          style={{
            fontSize: 12,
            color: '#888',
            fontStyle: 'italic',
            marginLeft: 16,
            paddingLeft: 4,
          }}
        >
          Mappen är tom
        </Text>
      )}
    </View>
  );
}

export function SharePointLeftPanel({
  leftWidth,
  webPaneHeight,
  panResponder,
  spinSidebarHome,
  spinSidebarRefresh,
  onPressHome,
  onPressRefresh,
  leftTreeScrollRef,
  selectedProject,
  projectPhaseKey,
  phaseNavigation,
  phaseNavigationLoading,
  selectedProjectFolders,
  navigation,
  companyId,
    reloadKey,
  handleSelectFunction,
  projectStatusFilter,
  loadingHierarchy,
  phaseChangeSpinAnim,
  hierarchy,
  expandedSubs,
  spinSub,
  handleToggleSubFolder,
  setHierarchy,
  contextMenu,
  contextMenuItems,
  handleContextMenuSelect,
  closeContextMenu,
  syncStatus,
  appVersion,
  buildStamp,
  scrollToEndSafe,
  createPortal,
  onSelectProject, // Optional callback for project selection (from HomeScreen)
  onOpenPhaseItem, // Optional callback to open a phase navigation item
}) {
  const isWeb = Platform.OS === 'web';
  const [filteredHierarchy, setFilteredHierarchy] = useState([]);
  const [navConfig, setNavConfig] = useState(null);
  const [navLoading, setNavLoading] = useState(false);
  const [expandedSites, setExpandedSites] = useState({}); // siteId -> boolean
  const [spinSites, setSpinSites] = useState({}); // siteId -> spin counter for chevron animation
  const [projectMetadataMap, setProjectMetadataMap] = useState(null);
  const [projectFolderTree, setProjectFolderTree] = useState([]);
  const [lastProjectId, setLastProjectId] = useState(null);
  const contentCacheRef = useRef(new Map()); // path -> boolean
  const contentPendingRef = useRef(new Set()); // path

  useEffect(() => {
    const isLocalWeb =
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      typeof window.location?.hostname === 'string' &&
      /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);
    if (isLocalWeb) {
      console.warn('[SharePointLeftPanel] debug banner (section repair enabled)');
    }
  }, []);
  // Throttle section auto-repair so we don't spam create calls, but also don't get stuck
  // permanently empty due to transient Graph/load failures.
  // Map: sharePointPath -> lastAttemptMs
  const sectionRepairAttemptedRef = useRef(new Map());

  const openOverviewPageFromFolder = (folderNode, ctx) => {
    if (typeof onOpenPhaseItem !== 'function') return;

    const parentName = String(ctx?.parent?.name || '').trim().toLowerCase();
    const isOverviewParent = parentName.startsWith('01 - översikt') || parentName.startsWith('01 - oversikt');
    if (!isOverviewParent) return;

    const name = String(folderNode?.name || '').trim();
    const m = name.match(/^([0-9]{2})\s*[-–—]/);
    const prefix = m ? m[1] : null;
    if (!prefix || !['01', '02', '03', '04'].includes(prefix)) return;

    const section = phaseNavigation?.sections?.find((s) => s?.id === 'oversikt');
    const items = Array.isArray(section?.items) ? section.items : [];
    const item = items.find((i) => String(i?.name || '').trim().startsWith(`${prefix} -`));
    if (!item?.id) return;

    onOpenPhaseItem('oversikt', item.id, { folderNode });
  };

  useEffect(() => {
    if (!companyId || !selectedProject) return;
    if (!Array.isArray(projectFolderTree) || projectFolderTree.length === 0) return;

    const targets = [];
    const collect = (nodes) => {
      (nodes || []).forEach((n) => {
        if (!n) return;
        const p = String(n.path || n.sharePointPath || '').trim();
        if (p) {
          const cached = contentCacheRef.current.get(p);
          if (typeof cached === 'boolean' && n.hasFilesDeep !== cached) {
            targets.push({ path: p, value: cached });
          } else if (typeof cached !== 'boolean' && n.hasFilesDeep === undefined && !contentPendingRef.current.has(p)) {
            targets.push({ path: p, value: null });
          }
        }
        if (Array.isArray(n.children) && n.children.length > 0) collect(n.children);
      });
    };
    collect(projectFolderTree);

    // Apply any cached values immediately.
    const cachedUpdates = targets.filter((t) => typeof t.value === 'boolean');
    if (cachedUpdates.length > 0) {
      setProjectFolderTree((prev) => {
        const apply = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            const p = String(n.path || n.sharePointPath || '').trim();
            const match = cachedUpdates.find((u) => u.path === p);
            const next = match ? { ...n, hasFilesDeep: match.value } : n;
            if (Array.isArray(next.children) && next.children.length > 0) {
              return { ...next, children: apply(next.children) };
            }
            return next;
          });
        return apply(prev);
      });
    }

    const toCheck = targets
      .filter((t) => t.value === null)
      .map((t) => t.path)
      .filter((p) => !contentPendingRef.current.has(p))
      .slice(0, 12);

    if (toCheck.length === 0) return;

    let cancelled = false;
    (async () => {
      for (const path of toCheck) {
        if (cancelled) return;
        contentPendingRef.current.add(path);
        try {
          const hasFiles = await folderHasFilesDeep(companyId, path, 4);
          contentCacheRef.current.set(path, hasFiles);
          if (cancelled) return;
          setProjectFolderTree((prev) => {
            const apply = (nodes) =>
              (nodes || []).map((n) => {
                if (!n) return n;
                const p = String(n.path || n.sharePointPath || '').trim();
                const next = p === path ? { ...n, hasFilesDeep: hasFiles } : n;
                if (Array.isArray(next.children) && next.children.length > 0) {
                  return { ...next, children: apply(next.children) };
                }
                return next;
              });
            return apply(prev);
          });
        } catch (_e) {
          contentCacheRef.current.set(path, false);
        } finally {
          contentPendingRef.current.delete(path);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [companyId, selectedProject, projectFolderTree]);

  useEffect(() => {
    if (!selectedProject || !Array.isArray(selectedProjectFolders)) {
      setProjectFolderTree([]);
      setLastProjectId(null);
      return;
    }

    const currentProjectId = String(selectedProject?.id || '').trim() || null;

    const projectRootPathRaw = String(
      selectedProject?.path || selectedProject?.projectPath || selectedProject?.sharePointPath || ''
    ).trim();

    const normalizeAscii = (value) =>
      String(value || '')
        .trim()
        .toLowerCase()
        .replace(/[\u00c5\u00c4]/g, 'a')
        .replace(/[\u00e5\u00e4]/g, 'a')
        .replace(/[\u00d6]/g, 'o')
        .replace(/[\u00f6]/g, 'o')
        .replace(/\s+/g, ' ');

    const resolveProjectRootPathFromHierarchy = () => {
      try {
        const targetNumber = String(
          selectedProject?.projectNumber || selectedProject?.number || selectedProject?.id || ''
        ).trim();
        const targetName = String(selectedProject?.projectName || selectedProject?.name || selectedProject?.fullName || '').trim();
        const targetNumberNorm = normalizeAscii(targetNumber);
        const targetNameNorm = normalizeAscii(targetName);
        if (!targetNumberNorm && !targetNameNorm) return '';

        const stack = Array.isArray(hierarchy) ? [...hierarchy] : Array.isArray(hierarchy?.children) ? [...hierarchy.children] : [];

        while (stack.length > 0) {
          const node = stack.shift();
          if (!node) continue;

          if (isProjectFolder(node)) {
            const meta = extractProjectMetadata(node);
            const numberNorm = normalizeAscii(meta?.number || meta?.id || node?.projectNumber || node?.number || '');
            const nameNorm = normalizeAscii(meta?.name || meta?.fullName || node?.projectName || node?.name || '');

            const numberMatches = Boolean(targetNumberNorm && numberNorm && numberNorm === targetNumberNorm);
            const nameMatches = Boolean(targetNameNorm && nameNorm && nameNorm.includes(targetNameNorm));

            if (numberMatches || (targetNumberNorm && nameMatches)) {
              return String(meta?.path || node?.path || node?.sharePointPath || node?.name || '').trim();
            }
          }

          if (Array.isArray(node.children) && node.children.length > 0) {
            stack.push(...node.children);
          }
        }

        return '';
      } catch (_e) {
        return '';
      }
    };

    let projectRootPath = projectRootPathRaw || resolveProjectRootPathFromHierarchy();

    if (!projectRootPath) {
      const targetNumber = String(selectedProject?.projectNumber || selectedProject?.number || selectedProject?.id || '').trim();
      const targetNumberNorm = normalizeAscii(targetNumber);
      const fullName = String(selectedProject?.fullName || '').trim();
      if (fullName && targetNumberNorm && normalizeAscii(fullName).includes(targetNumberNorm)) {
        projectRootPath = fullName;
      }
    }

    const normalizeNode = (node) => {
      const safeName = String(node?.name || '').trim();
      const basePath = String(node?.path || node?.sharePointPath || '').trim();
      const derivedPath =
        !basePath && projectRootPath && safeName
          ? `${projectRootPath}/${safeName}`.replace(/^\/+/, '').replace(/\/+$/, '')
          : basePath.replace(/^\/+/, '').replace(/\/+$/, '');

      return {
        ...node,
        id: node?.id || derivedPath || safeName,
        name: node?.name || safeName,
        type: 'folder',
        path: derivedPath,
        sharePointPath: derivedPath,
        expanded: Boolean(node?.expanded),
        loading: Boolean(node?.loading),
        error: node?.error || null,
        children: Array.isArray(node?.children) ? node.children : [],
      };
    };

    const mergeTrees = (incomingNodes, existingNodes) => {
      const existingById = new Map((existingNodes || []).filter(Boolean).map((n) => [n.id, n]));

      return (incomingNodes || []).filter(Boolean).map((incoming) => {
        const existing = existingById.get(incoming.id);
        if (!existing) return incoming;

        const incomingChildren = Array.isArray(incoming.children) ? incoming.children : [];
        const existingChildren = Array.isArray(existing.children) ? existing.children : [];
        const childrenToUse = incomingChildren.length > 0 ? incomingChildren : existingChildren;

        return {
          ...incoming,
          expanded: typeof existing.expanded === 'boolean' ? existing.expanded : Boolean(incoming.expanded),
          loading: typeof existing.loading === 'boolean' ? existing.loading : Boolean(incoming.loading),
          error: existing.error || incoming.error || null,
          children: mergeTrees(childrenToUse, existingChildren),
        };
      });
    };

    const incoming = selectedProjectFolders.map(normalizeNode);

    // If we switched projects, reset to incoming (even if empty) to avoid leaking old state.
    if (currentProjectId && currentProjectId !== lastProjectId) {
      setLastProjectId(currentProjectId);
      setProjectFolderTree(incoming);
      return;
    }

    // If incoming is temporarily empty, keep existing local tree so expand/collapse works.
    if (incoming.length === 0) {
      return;
    }

    setProjectFolderTree((prev) => mergeTrees(incoming, prev));
  }, [
    selectedProject,
    selectedProject?.id,
    selectedProject?.path,
    selectedProject?.projectPath,
    selectedProject?.sharePointPath,
    selectedProjectFolders,
    lastProjectId,
    hierarchy,
  ]);

  const handleToggleProjectFolder = async (folderId) => {
    if (!folderId) return;

    let pathToLoad = null;
    let shouldDispatch = null;
    let toggledFolderName = null;

    setProjectFolderTree((prev) => {
      const walk = (nodes) =>
        (nodes || []).map((n) => {
          if (!n) return n;
          if (n.id === folderId) {
            const nextExpanded = !n.expanded;
            toggledFolderName = String(n.name || '').trim();
            const folderPathRaw = String(n.path || n.sharePointPath || '').trim();
            const normalizedPath = folderPathRaw
              .replace(/:/g, '')
              .replace(/^\/+/, '')
              .replace(/\/+/, '/')
              .trim()
              .replace(/\/+$/, '');

            const shouldLoad =
              nextExpanded && !n.loading && !n.error && (!Array.isArray(n.children) || n.children.length === 0);

            if (shouldLoad && normalizedPath) {
              pathToLoad = normalizedPath;
            }
            if (normalizedPath) {
              shouldDispatch = { folderPath: normalizedPath, folderName: n.name };
            }

            return {
              ...n,
              expanded: nextExpanded,
              ...(shouldLoad ? { loading: true, error: null } : null),
            };
          }
          if (Array.isArray(n.children) && n.children.length > 0) {
            return { ...n, children: walk(n.children) };
          }
          return n;
        });

      return walk(prev);
    });

    if (shouldDispatch && typeof window !== 'undefined') {
      try {
        window.dispatchEvent(new CustomEvent('dkFolderSelected', { detail: shouldDispatch }));
      } catch (_e) {}
    }

    if (!companyId || !pathToLoad) {
      const isLocalWeb =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.location?.hostname === 'string' &&
        /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

      if (isLocalWeb && String(toggledFolderName || '').toLowerCase().includes('översikt')) {
        console.warn('[SharePointLeftPanel] Overview click: missing companyId/pathToLoad', {
          companyId,
          folderId,
          toggledFolderName,
          pathToLoad,
        });
      }

      setProjectFolderTree((prev) => {
        const clearLoadingIfNeeded = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            if (n.id === folderId) {
              return { ...n, loading: false };
            }
            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: clearLoadingIfNeeded(n.children) };
            }
            return n;
          });
        return clearLoadingIfNeeded(prev);
      });
      return;
    }

    try {
      const normalizeAscii = (value) =>
        String(value || '')
          .trim()
          .toLowerCase()
          .replace(/[\u00c5\u00c4]/g, 'a')
          .replace(/[\u00e5\u00e4]/g, 'a')
          .replace(/[\u00d6]/g, 'o')
          .replace(/[\u00f6]/g, 'o')
          .replace(/\s+/g, ' ');

      const stripNumericPrefix = (value) => String(value || '').replace(/^\s*\d+\s*[-–—]\s*/u, '').trim();

      const replaceLastPathSegment = (path, newLastSegment) => {
        const p = String(path || '').replace(/^\/+/, '').replace(/\/+$/, '');
        const parts = p.split('/').filter(Boolean);
        if (parts.length === 0) return String(newLastSegment || '').trim();
        parts[parts.length - 1] = String(newLastSegment || '').trim();
        return parts.join('/');
      };

      const getMatchedSectionForToggle = () => {
        const lastSeg = String(pathToLoad || '').split('/').filter(Boolean).pop() || '';
        const toggledBase = normalizeAscii(stripNumericPrefix(toggledFolderName || lastSeg));
        if (!toggledBase) return null;

        const fallbackByBase = {
          oversikt: {
            id: 'oversikt',
            name: '01 - Översikt',
          },
          forfragningsunderlag: {
            id: 'forfragningsunderlag',
            name: '02 - Förfrågningsunderlag',
          },
        };

        const sections = Array.isArray(phaseNavigation?.sections) ? phaseNavigation.sections : [];
        if (sections.length === 0) {
          return fallbackByBase[toggledBase] || null;
        }

        const matched = sections.find((s) => {
          const sectionBase = normalizeAscii(stripNumericPrefix(s?.name || s?.id || ''));
          return sectionBase && sectionBase === toggledBase;
        });

        return matched || fallbackByBase[toggledBase] || null;
      };

      const matchedSection = getMatchedSectionForToggle();
      const isSectionFolder = Boolean(matchedSection);
      const isOverviewFolder = matchedSection?.id === 'oversikt';

      const loadChildrenWithFallback = async () => {
        const first = await loadFolderChildren(companyId, pathToLoad);
        const firstChildren = Array.isArray(first) ? first : [];
        if (firstChildren.length > 0 || !isSectionFolder) return { pathUsed: pathToLoad, children: firstChildren };

        const lastSeg = String(pathToLoad || '').split('/').filter(Boolean).pop() || '';
        const baseName = stripNumericPrefix(lastSeg);
        const targetBase = normalizeAscii(stripNumericPrefix(toggledFolderName || lastSeg));

        // 0) Try to resolve the actual folder name by listing the parent path.
        // This catches subtle naming differences (dash variants, extra spaces, etc.).
        const parts = String(pathToLoad || '').split('/').filter(Boolean);
        const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : '';
        if (parentPath) {
          try {
            const siblings = await loadFolderChildren(companyId, parentPath);
            const siblingList = Array.isArray(siblings) ? siblings : [];
            const sectionSibling = siblingList.find((s) => {
              const name = String(s?.name || '').trim();
              return normalizeAscii(stripNumericPrefix(name)) === targetBase;
            });
            const resolvedName = String(sectionSibling?.name || '').trim();
            if (resolvedName && resolvedName !== lastSeg) {
              const siblingPath = replaceLastPathSegment(pathToLoad, resolvedName);
              const siblingChildren = await loadFolderChildren(companyId, siblingPath);
              const list = Array.isArray(siblingChildren) ? siblingChildren : [];
              if (list.length > 0) return { pathUsed: siblingPath, children: list };
              // Even if empty, prefer the resolved sibling path so auto-repair uses the correct name.
              return { pathUsed: siblingPath, children: firstChildren };
            }
          } catch (_e) {
            // ignore and continue
          }
        }

        const candidates = [];
        // 1) Try stripping numeric prefix if present.
        if (baseName && baseName !== lastSeg) {
          candidates.push(replaceLastPathSegment(pathToLoad, baseName));
        }
        // 2) Try adding numeric prefix if missing.
        if (baseName && baseName === lastSeg) {
          const sectionName = String(matchedSection?.name || '').trim();
          if (sectionName) {
            candidates.push(replaceLastPathSegment(pathToLoad, sectionName));
          }

          // common Swedish variants
          if (normalizeAscii(baseName) === 'oversikt') {
            candidates.push(replaceLastPathSegment(pathToLoad, `01 - ${baseName}`));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 - Översikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 - Oversikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 – Översikt'));
            candidates.push(replaceLastPathSegment(pathToLoad, '01 — Översikt'));
          }
        }

        const uniqueCandidates = [...new Set(candidates.filter(Boolean))].filter((p) => p !== pathToLoad);
        for (const candidatePath of uniqueCandidates) {
          try {
            const candidateChildren = await loadFolderChildren(companyId, candidatePath);
            const list = Array.isArray(candidateChildren) ? candidateChildren : [];
            if (list.length > 0) {
              return { pathUsed: candidatePath, children: list };
            }
          } catch (_e) {
            // ignore and continue
          }
        }

        return { pathUsed: pathToLoad, children: firstChildren };
      };

      let { pathUsed, children } = await loadChildrenWithFallback();

      const isLocalWeb =
        Platform.OS === 'web' &&
        typeof window !== 'undefined' &&
        typeof window.location?.hostname === 'string' &&
        /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

      if (isLocalWeb && (isOverviewFolder || matchedSection?.id === 'forfragningsunderlag')) {
        console.warn('[SharePointLeftPanel] Section expand', {
          toggledFolderName,
          pathToLoad,
          pathUsed,
          childrenCount: Array.isArray(children) ? children.length : 0,
          matchedSectionId: matchedSection?.id,
        });
      }

      let sectionRepairTriedThisTime = false;
      let sectionRepairFailedThisTime = false;

      // Auto-repair: if a phase section folder is empty, create expected subfolders (once) and reload.
      if (isSectionFolder) {
        const key = String(pathUsed || '').trim();
        const currentList = Array.isArray(children) ? children : [];

        const now = Date.now();
        const lastAttempt = key ? sectionRepairAttemptedRef.current.get(key) : null;
        const alreadyAttempted = typeof lastAttempt === 'number';

        // Allow re-attempt after a short cooldown to recover from intermittent empty reads.
        const cooldownMs = 30_000;

        // Retry on localhost so we can recover from earlier failed attempts in the same session.
        const shouldAttemptRepair = Boolean(
          key &&
            currentList.length === 0 &&
            (!alreadyAttempted || now - lastAttempt > cooldownMs || isLocalWeb)
        );

        if (shouldAttemptRepair) {
          const items = Array.isArray(matchedSection?.items) ? matchedSection.items : [];

          // If phaseNavigation isn't loaded yet (or items missing), we still want to be able to repair.
          // Use known defaults for the most important sections.
          const fallbackBySectionId = {
            oversikt: ['01 - Projektinformation', '02 - Organisation och roller', '03 - Tidsplan och viktiga datum', '04 - FrågaSvar'],
            forfragningsunderlag: [
              '01 - Administrativa föreskrifter (AF)',
              '02 - Tekniska beskrivningar',
              '03 - Ritningar',
              '04 - Kompletteringar och ändringar',
              '05 - Referenshandlingar',
              '06 - AI-analys och sammanställning',
            ],
          };

          const fallbackFolderNames = fallbackBySectionId[String(matchedSection?.id || '')] || [];

          const folderNames = (
            items.length > 0
              ? items.map((it) => String(it?.name || '').trim()).filter(Boolean)
              : fallbackFolderNames
          ).filter(Boolean);

          if (folderNames.length > 0) {
            sectionRepairAttemptedRef.current.set(key, now);
            sectionRepairTriedThisTime = true;

            if (isLocalWeb) {
              console.warn('[SharePointLeftPanel] Section auto-repair creating folders', {
                key,
                folderNames,
                matchedSectionId: matchedSection?.id,
              });
            }
            await Promise.all(folderNames.map((folderName) => ensureFolderPath(`${key}/${folderName}`, companyId)));
            const repaired = await loadFolderChildren(companyId, key);
            children = Array.isArray(repaired) ? repaired : [];

            if (isLocalWeb) {
              console.warn('[SharePointLeftPanel] Section auto-repair reload result', {
                key,
                childrenCount: Array.isArray(children) ? children.length : 0,
                matchedSectionId: matchedSection?.id,
              });
            }

            if (Array.isArray(children) && children.length === 0) {
              sectionRepairFailedThisTime = true;
            }
          }
        }
      }

      setProjectFolderTree((prev) => {
        const normalizePathKey = (value) =>
          String(value || '')
            .replace(/:/g, '')
            .replace(/^\/+/, '')
            .replace(/\/+$/g, '')
            .replace(/\/+?/g, '/')
            .trim();

        // NOTE: We prefer id match, but fall back to normalized path match.
        // This protects against transient data-shape differences where ids are prefixed/synthesized.
        const targetIds = new Set([folderId].filter(Boolean));
        const targetPaths = new Set(
          [pathUsed, pathToLoad]
            .map(normalizePathKey)
            .filter(Boolean)
        );

        let applied = false;

        const applyChildren = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;

            const nodePath = normalizePathKey(n.path || n.sharePointPath);
            const isTarget = targetIds.has(n.id) || (nodePath && targetPaths.has(nodePath));

            if (isTarget) {
              applied = true;
              const sectionLabel = String(matchedSection?.name || '').trim();
              return {
                ...n,
                loading: false,
                error:
                  isSectionFolder && sectionRepairTriedThisTime && sectionRepairFailedThisTime
                    ? `Kunde inte skapa undermappar i ${sectionLabel || 'sektionen'} (kontrollera behörighet i SharePoint)`
                    : null,
                ...(pathUsed && (n.path !== pathUsed || n.sharePointPath !== pathUsed)
                  ? { path: pathUsed, sharePointPath: pathUsed }
                  : null),
                children: Array.isArray(children) ? children : [],
              };
            }

            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: applyChildren(n.children) };
            }
            return n;
          });

        const next = applyChildren(prev);

        const isLocalWeb =
          Platform.OS === 'web' &&
          typeof window !== 'undefined' &&
          typeof window.location?.hostname === 'string' &&
          /^(localhost|127\.0\.0\.1)$/i.test(window.location.hostname);

        if (isLocalWeb && !applied) {
          console.warn('[SharePointLeftPanel] applyChildren: target not found', {
            folderId,
            pathToLoad,
            pathUsed,
            targetPaths: [...targetPaths],
          });
        }

        return next;
      });
    } catch (err) {
      const message = err?.message || 'Kunde inte ladda undermappar';
      setProjectFolderTree((prev) => {
        const applyError = (nodes) =>
          (nodes || []).map((n) => {
            if (!n) return n;
            if (n.id === folderId) {
              return { ...n, loading: false, error: message };
            }
            if (Array.isArray(n.children) && n.children.length > 0) {
              return { ...n, children: applyError(n.children) };
            }
            return n;
          });
        return applyError(prev);
      });
    }
  };

  // Load navigation config and build hierarchy from enabled sites
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setFilteredHierarchy([]);
        return;
      }

      try {
        setNavLoading(true);
        const config = await getSharePointNavigationConfig(companyId);
        if (!mounted) return;
        setNavConfig(config);

        // Check if any sites are enabled
        const enabledSites = config?.enabledSites || [];
        if (enabledSites.length === 0) {
          // No sites enabled - show empty (admin must configure)
          if (mounted) setFilteredHierarchy([]);
          return;
        }

        // Build hierarchy from enabled sites (filterHierarchyByConfig now builds from sites, not filters existing hierarchy)
        const filtered = await filterHierarchyByConfig([], companyId, config);
        if (mounted) {
          setFilteredHierarchy(filtered);
        }
      } catch (error) {
        console.error('[SharePointLeftPanel] Error loading/filtering hierarchy:', error);
        // On error, show empty (admin must configure properly)
        if (mounted) setFilteredHierarchy([]);
      }
      finally {
        if (mounted) setNavLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [companyId, reloadKey]);

  // Load saved phase/structure metadata so we can color projects consistently.
  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!companyId) {
        if (mounted) setProjectMetadataMap(null);
        return;
      }

      try {
        const map = await fetchSharePointProjectMetadataMap(companyId);
        if (mounted) setProjectMetadataMap(map);
      } catch (error) {
        console.error('[SharePointLeftPanel] Error loading project metadata map:', error);
        if (mounted) setProjectMetadataMap(null);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [companyId, reloadKey]);

  return (
    <>
      <View
        style={{
          width: leftWidth,
          padding: 8,
          borderRightWidth: 0,
          borderColor: '#e6e6e6',
          backgroundColor: '#f5f6f7',
          flexShrink: 0,
          alignSelf: 'stretch',
          minHeight: 0,
          position: 'relative',
        }}
      >
        <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: 1, backgroundColor: '#e6e6e6' }} />
        <View
          {...(panResponder && panResponder.panHandlers)}
          style={
            isWeb
              ? {
                  position: 'absolute',
                  right: -8,
                  top: 0,
                  bottom: 0,
                  width: 16,
                  cursor: 'col-resize',
                  zIndex: 9,
                  pointerEvents: 'auto',
                }
              : {
                  position: 'absolute',
                  right: -12,
                  top: 0,
                  bottom: 0,
                  width: 24,
                  zIndex: 9,
                }
          }
        />

        <View
          style={{
            paddingVertical: 8,
            paddingHorizontal: 6,
            borderBottomWidth: 1,
            borderColor: '#e0e0e0',
            marginBottom: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'flex-end',
            gap: 8,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressHome}
              activeOpacity={0.7}
              accessibilityLabel="Hem"
            >
              <Ionicons
                name="home-outline"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarHome * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={{ padding: 6, borderRadius: 8, marginRight: 6 }}
              onPress={onPressRefresh}
              activeOpacity={0.7}
              accessibilityLabel="Uppdatera"
            >
              <Ionicons
                name="refresh"
                size={18}
                color="#1976D2"
                style={{
                  transform: [{ rotate: `${spinSidebarRefresh * 360}deg` }],
                  transitionProperty: 'transform',
                  transitionDuration: '0.4s',
                  transitionTimingFunction: 'ease',
                }}
              />
            </TouchableOpacity>
          </View>
        </View>

        <ScrollView
          ref={leftTreeScrollRef}
          style={{ flex: 1 }}
          scrollEnabled
          nestedScrollEnabled
        >
          {(() => {
            if (selectedProject && projectPhaseKey) {
              if (phaseNavigationLoading) {
                return (
                  <View style={{ padding: 20, alignItems: 'center' }}>
                    <Text style={{ color: '#888', fontSize: 14 }}>Laddar...</Text>
                  </View>
                );
              }

              const projectHierarchy = selectedProject
                ? [
                    {
                      ...selectedProject,
                      id: selectedProject.id,
                      name: (() => {
                        const rawName = String(
                          selectedProject.projectName || selectedProject.name || selectedProject.fullName || ''
                        ).trim();

                        let number = String(
                          selectedProject.projectNumber || selectedProject.number || ''
                        ).trim();

                        // Fallback: some callers might set `id` to a non-human identifier.
                        // If number is missing, try to parse it from the beginning of name/fullName.
                        if (!number) {
                          const firstToken = String(rawName.split(/\s+/)[0] || '').trim();
                          if (firstToken && firstToken.includes('-')) {
                            number = firstToken;
                          }
                        }

                        const cleanedName = (() => {
                          if (!rawName) return '';
                          if (selectedProject.projectName) return rawName;
                          if (number && rawName.startsWith(number)) {
                            let rest = rawName.slice(number.length).trim();
                            if (rest.startsWith('-') || rest.startsWith('–') || rest.startsWith('—')) {
                              rest = rest.slice(1).trim();
                            }
                            return rest || rawName;
                          }
                          return rawName;
                        })();

                        if (number && cleanedName) return `${number} — ${cleanedName}`;
                        return number || cleanedName || selectedProject.id;
                      })(),
                      type: 'project',
                      expanded: true,
                      children: projectFolderTree,
                    },
                  ]
                : [];

              return (
                <ProjectTree
                  hierarchy={projectHierarchy}
                  selectedProject={selectedProject}
                  selectedPhase={projectPhaseKey}
                  compact={isWeb}
                  hideFolderIcons
                  staticRootHeader
                  onToggleSubFolder={handleToggleProjectFolder}
                  onPressFolder={openOverviewPageFromFolder}
                  onSelectProject={project => {
                    if (isWeb) {
                      // On web, keep navigation inline
                      // The caller is responsible for updating selectedProject
                      if (project && project.id) {
                        // noop here; HomeScreen handles selection via requestProjectSwitch
                      }
                    } else {
                      navigation.navigate('ProjectDetails', {
                        project: {
                          id: project.id,
                          name: project.name,
                          ansvarig: project.ansvarig || '',
                          adress: project.adress || '',
                          fastighetsbeteckning: project.fastighetsbeteckning || '',
                          client: project.client || '',
                          status: project.status || 'ongoing',
                          createdAt: project.createdAt || '',
                          createdBy: project.createdBy || '',
                        },
                        companyId,
                      });
                    }
                  }}
                  onSelectFunction={handleSelectFunction}
                  navigation={navigation}
                  companyId={companyId}
                  projectStatusFilter={projectStatusFilter}
                />
              );
            }

            if (loadingHierarchy) {
              const spin = phaseChangeSpinAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0deg', '360deg'],
              });
              return (
                <View
                  style={{
                    padding: 20,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minHeight: 200,
                  }}
                >
                  <View style={{ alignItems: 'center' }}>
                    <Animated.View
                      style={{
                        width: 32,
                        height: 32,
                        borderWidth: 3,
                        borderColor: '#e0e0e0',
                        borderTopColor: '#1976D2',
                        borderRadius: 16,
                        transform: [{ rotate: spin }],
                      }}
                    />
                    <Text
                      style={{
                        color: '#888',
                        fontSize: 14,
                        marginTop: 16,
                        textAlign: 'center',
                      }}
                    >
                      Laddar projektstruktur...
                    </Text>
                  </View>
                </View>
              );
            }

            // Always use filteredHierarchy - never fallback to raw hierarchy
            // If no config exists or no sites enabled, filteredHierarchy will be empty
            const displayHierarchy = filteredHierarchy || [];
            if (navLoading) {
              return (
                <View
                  style={{ paddingHorizontal: 4 }}
                  nativeID={isWeb ? 'dk-tree-root' : undefined}
                >
                  <View style={{ paddingVertical: 16 }}>
                    <Text
                      style={{
                        paddingHorizontal: 4,
                        color: '#666',
                        fontSize: 14,
                      }}
                    >
                      Laddar SharePoint-mappar...
                    </Text>
                  </View>
                </View>
              );
            }

            if (!displayHierarchy.length) {
              return (
                <View
                  style={{ paddingHorizontal: 4 }}
                  nativeID={isWeb ? 'dk-tree-root' : undefined}
                >
                  <Text
                    style={{
                      paddingVertical: 8,
                      paddingHorizontal: 4,
                      color: '#666',
                      fontSize: 14,
                    }}
                  >
                    {navConfig && (!navConfig.enabledSites || navConfig.enabledSites.length === 0)
                      ? 'Inga SharePoint-sites är aktiverade. Konfigurera i Admin → SharePoint Navigation.'
                      : 'Inga mappar hittades. Konfigurera SharePoint Navigation i Admin-vyn eller skapa projektstruktur i SharePoint.'}
                  </Text>
                </View>
              );
            }

            // Show sites as root level, with their folders as children
            return (
              <View
                style={{ paddingHorizontal: 4 }}
                nativeID={isWeb ? 'dk-tree-root' : undefined}
              >
                {displayHierarchy.map(siteItem => {
                  // Site items have type 'site' and contain folders as children
                  if (siteItem.type === 'site') {
                    const isExpanded = expandedSites[siteItem.siteId] !== false; // default: expanded
                    const siteSpin = spinSites[siteItem.siteId] || 0;
                    const siteChevronAngle = siteSpin * 360;

                    return (
                      <View key={siteItem.id} style={{ marginBottom: 8 }}>
                        {/* Site header */}
                        <TouchableOpacity
                          onPress={() => {
                            setExpandedSites(prev => ({
                              ...prev,
                              [siteItem.siteId]: !isExpanded,
                            }));
                            setSpinSites(prev => ({
                              ...prev,
                              [siteItem.siteId]: (prev[siteItem.siteId] || 0) + 1,
                            }));
                          }}
                          activeOpacity={0.8}
                          style={{ 
                            flexDirection: 'row', 
                            alignItems: 'center', 
                            paddingVertical: 8,
                            paddingHorizontal: 8,
                            backgroundColor: '#f0f7ff',
                            borderRadius: 4,
                            marginBottom: 4,
                            ...(isWeb ? { cursor: 'pointer' } : {}),
                          }}
                        >
                          <Ionicons
                            name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                            size={16}
                            color="#1976D2"
                            style={{
                              marginRight: 4,
                              transform: [{ rotate: `${siteChevronAngle}deg` }],
                              transitionProperty: 'transform',
                              transitionDuration: '0.4s',
                              transitionTimingFunction: 'ease',
                            }}
                          />
                          <SharePointSiteIcon size={18} color="#1976D2" style={{ marginRight: 6 }} />
                          <Text style={{ 
                            fontSize: 14, 
                            fontWeight: '600', 
                            color: '#1976D2',
                            flex: 1,
                          }}>
                            {siteItem.name}
                          </Text>
                        </TouchableOpacity>
                        
                        {/* Site folders */}
                        {isExpanded && siteItem.children && siteItem.children.length > 0 && (
                          <View style={{ marginLeft: 12 }}>
                            {siteItem.children.map(folder => {
                              const folderIsProject = isProjectFolder(folder);
                              
                              return (
                                <RecursiveFolderView
                                  key={folder.id}
                                  folder={folder}
                                  level={0}
                                  expandedSubs={expandedSubs}
                                  spinSubs={spinSub}
                                  onToggle={handleToggleSubFolder}
                                  companyId={companyId}
                                  hierarchy={hierarchy}
                                  setHierarchy={setHierarchy}
                                  parentPath=""
                                  isProject={folderIsProject}
                                  onSelectProject={onSelectProject}
                                  navigation={navigation}
                                  projectMetadataMap={projectMetadataMap}
                                  fallbackPhaseKey={projectPhaseKey}
                                />
                              );
                            })}
                          </View>
                        )}
                        {isExpanded && (!siteItem.children || siteItem.children.length === 0) && (
                          <Text style={{ 
                            fontSize: 12, 
                            color: '#888', 
                            fontStyle: 'italic',
                            marginLeft: 12,
                            paddingLeft: 8,
                          }}>
                            Inga mappar
                          </Text>
                        )}
                      </View>
                    );
                  }
                  
                  // Fallback for old structure (direct folders)
                  const folderIsProject = isProjectFolder(siteItem);
                  return (
                    <RecursiveFolderView
                      key={siteItem.id}
                      folder={siteItem}
                      level={0}
                      expandedSubs={expandedSubs}
                      spinSubs={spinSub}
                      onToggle={handleToggleSubFolder}
                      companyId={companyId}
                      hierarchy={hierarchy}
                      setHierarchy={setHierarchy}
                      parentPath=""
                      isProject={folderIsProject}
                      onSelectProject={onSelectProject}
                      navigation={navigation}
                      projectMetadataMap={projectMetadataMap}
                      fallbackPhaseKey={projectPhaseKey}
                    />
                  );
                })}
              </View>
            );
          })()}
        </ScrollView>

        {isWeb && (
          <ContextMenu
            visible={contextMenu.visible}
            x={contextMenu.x}
            y={contextMenu.y}
            items={contextMenuItems}
            onSelect={handleContextMenuSelect}
            onClose={closeContextMenu}
          />
        )}

        {!selectedProject && isWeb && createPortal && typeof document !== 'undefined'
          ? (() => {
              try {
                let footerRoot = document.getElementById('dk-footer-portal');
                if (!footerRoot) {
                  footerRoot = document.createElement('div');
                  footerRoot.id = 'dk-footer-portal';
                  document.body.appendChild(footerRoot);
                }

                const FooterBox = (
                  <View
                    style={{
                      position: 'fixed',
                      left: 12,
                      bottom: 12,
                      zIndex: 2147483647,
                      // Don't block interactions in the left tree (hover/click on folders).
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255,255,255,0.96)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      shadowColor: '#000',
                      shadowOffset: { width: 0, height: 6 },
                      shadowOpacity: 0.12,
                      shadowRadius: 12,
                      elevation: 12,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                      </Text>
                    </View>
                  </View>
                );

                return createPortal(FooterBox, footerRoot);
              } catch (_e) {
                return (
                  <View
                    style={{
                      position: 'absolute',
                      left: 8,
                      bottom: 8,
                      zIndex: 9999,
                      // Don't block interactions in the left tree.
                      pointerEvents: 'none',
                      backgroundColor: 'rgba(255,255,255,0.95)',
                      paddingVertical: 6,
                      paddingHorizontal: 10,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: '#e6e6e6',
                      elevation: 8,
                      ...(isWeb
                        ? { boxShadow: '0px 6px 12px rgba(0,0,0,0.12)' }
                        : {}),
                    }}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#666' }}>
                        Version: {appVersion}
                        {buildStamp ? ` (${buildStamp})` : ''}
                      </Text>
                    </View>
                  </View>
                );
              }
            })()
          : null}
      </View>

    </>
  );
}
