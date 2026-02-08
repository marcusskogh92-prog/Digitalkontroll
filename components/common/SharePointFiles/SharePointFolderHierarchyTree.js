import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { LEFT_NAV } from '../../../constants/leftNavTheme';
import { AnimatedChevron, MicroPulse, MicroShake } from '../leftNavMicroAnimations';
import SidebarItem from '../SidebarItem';

import { ensureFolderPath } from '../../../services/azure/fileService';
import { getSiteByUrl } from '../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { classifyFileType, safeText } from './sharePointFileUtils';

function joinPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

async function resolveSiteIdForProject(companyId, project) {
  const cid = safeText(companyId);
  const fromProject = safeText(project?.sharePointSiteId || project?.siteId || project?.siteID);
  if (fromProject) return fromProject;

  const siteUrl = safeText(project?.sharePointSiteUrl);
  if (siteUrl) {
    const site = await getSiteByUrl(siteUrl);
    const id = safeText(site?.id);
    if (id) return id;
  }

  try {
    const { getCompanySharePointSiteId } = await import('../../firebase');
    const id = await getCompanySharePointSiteId(cid);
    return safeText(id);
  } catch (_e) {
    return '';
  }
}

function buildAncestorPaths(relativePath) {
  const rel = safeText(relativePath);
  const parts = rel.split('/').filter(Boolean);
  const out = [''];
  let acc = '';
  parts.forEach((p) => {
    acc = joinPath(acc, p);
    out.push(acc);
  });
  return out;
}

function buildAncestorPathsExcludingLeaf(relativePath) {
  const rel = safeText(relativePath);
  const parts = rel.split('/').filter(Boolean);
  if (parts.length === 0) return [''];
  return buildAncestorPaths(parts.slice(0, -1).join('/'));
}

export default function SharePointFolderHierarchyTree({
  indentLevel = 0,
  compact = false,
  companyId,
  project,
  rootPath,
  relativePath,
  onRelativePathChange,
  selectedItemId,
  onSelectedItemIdChange,
  refreshNonce = 0,

  // When rendered inside the project-mode left panel, rows should be edge-to-edge
  // (no margin-based indentation that makes hover/active look inset/pill-like).
  edgeToEdge = false,

  // Optional (FFU): ensure/pin a system folder in the root.
  systemFolderName = null,
  ensureSystemFolder = false,
  pinSystemFolderLast = false,
  systemFolderRootOnly = true,

  // Optional: hide specific folders by name (case-insensitive).
  hiddenFolderNames = null,
}) {
  const cid = safeText(companyId);
  const base = safeText(rootPath);

  const [siteId, setSiteId] = useState('');
  const [expandedByPath, setExpandedByPath] = useState({ '': true });
  const [toggleTickByPath, setToggleTickByPath] = useState({});
  const [nudgeTickByPath, setNudgeTickByPath] = useState({});
  const [childrenByPath, setChildrenByPath] = useState({});
  const [fileCountByPath, setFileCountByPath] = useState({});
  const [loadingByPath, setLoadingByPath] = useState({});
  const [errorByPath, setErrorByPath] = useState({});

  const inflightRef = useRef(new Set());

  const hiddenFolderKeySet = useMemo(() => {
    const raw = Array.isArray(hiddenFolderNames) ? hiddenFolderNames : [];
    const norm = (name) => safeText(name).trim().toLowerCase();
    const keys = raw.map(norm).filter(Boolean);
    return new Set(keys);
  }, [hiddenFolderNames]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!cid || !base) {
        setSiteId('');
        return;
      }
      try {
        const id = await resolveSiteIdForProject(cid, project);
        if (cancelled) return;
        setSiteId(safeText(id));
      } catch (_e) {
        if (cancelled) return;
        setSiteId('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cid, base, project]);

  // Keep tree expanded to the current active folder path.
  useEffect(() => {
    // Only expand ancestors (not the leaf) so single-click navigation never expands/collapses.
    const chain = buildAncestorPathsExcludingLeaf(relativePath);
    setExpandedByPath((prev) => {
      const next = { ...prev };
      chain.forEach((p) => {
        next[p] = true;
      });
      // Root is always expanded.
      next[''] = true;
      return next;
    });
  }, [relativePath]);

  // When something mutates in SharePoint, reload cached children.
  useEffect(() => {
    setChildrenByPath({});
    setFileCountByPath({});
    setLoadingByPath({});
    setErrorByPath({});
    inflightRef.current = new Set();
  }, [refreshNonce, siteId]);

  const fetchChildren = useCallback(async (relPath) => {
    if (!cid || !base || !siteId) return;

    const key = safeText(relPath);
    if (inflightRef.current.has(key)) return;
    inflightRef.current.add(key);

    setLoadingByPath((prev) => ({ ...prev, [key]: true }));
    setErrorByPath((prev) => ({ ...prev, [key]: '' }));

    const currentPath = joinPath(base, key);

    try {
      await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });

      if (ensureSystemFolder && safeText(systemFolderName) && (!systemFolderRootOnly || key === '')) {
        await ensureFolderPath(joinPath(base, safeText(systemFolderName)), cid, siteId, { siteRole: 'projects', strict: true });
      }

      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const fileCount = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file').length;

      // GOLDEN RULE: navigation tree shows folders only (never files).
      const folders = (Array.isArray(next) ? next : [])
        .filter((x) => x?.type === 'folder')
        .filter((x) => {
          if (!hiddenFolderKeySet || hiddenFolderKeySet.size === 0) return true;
          const key = safeText(x?.name).trim().toLowerCase();
          return !hiddenFolderKeySet.has(key);
        })
        .sort((a, b) => {
          if (pinSystemFolderLast && safeText(systemFolderName) && (!systemFolderRootOnly || key === '')) {
            const aSys = safeText(a?.name).trim().toLowerCase() === safeText(systemFolderName).trim().toLowerCase();
            const bSys = safeText(b?.name).trim().toLowerCase() === safeText(systemFolderName).trim().toLowerCase();
            if (aSys && !bSys) return 1;
            if (!aSys && bSys) return -1;
          }
          return safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' });
        });

      setChildrenByPath((prev) => ({ ...prev, [key]: folders }));
      setFileCountByPath((prev) => ({ ...prev, [key]: fileCount }));
    } catch (e) {
      setChildrenByPath((prev) => ({ ...prev, [key]: [] }));
      setFileCountByPath((prev) => ({ ...prev, [key]: 0 }));
      setErrorByPath((prev) => ({ ...prev, [key]: String(e?.message || e || 'Kunde inte läsa innehåll.') }));
    } finally {
      setLoadingByPath((prev) => ({ ...prev, [key]: false }));
      inflightRef.current.delete(key);
    }
  }, [cid, base, siteId, ensureSystemFolder, systemFolderName, pinSystemFolderLast, systemFolderRootOnly, hiddenFolderKeySet]);

  const expandedKey = useMemo(() => {
    const keys = Object.keys(expandedByPath || {}).filter((k) => expandedByPath?.[k]);
    keys.sort();
    return keys.join('|');
  }, [expandedByPath]);

  useEffect(() => {
    if (!cid || !base || !siteId) return;

    const expandedPaths = safeText(expandedKey)
      ? safeText(expandedKey).split('|').filter((x) => x !== null && x !== undefined)
      : [''];
    expandedPaths.forEach((p) => {
      if (!Object.prototype.hasOwnProperty.call(childrenByPath, p)) {
        fetchChildren(p);
      }
    });
  }, [cid, base, siteId, expandedKey, childrenByPath, fetchChildren]);

  const baseIndent = Math.max(0, Number(indentLevel) || 0) * 12;

  const toggleExpanded = (folderRelPath) => {
    const key = safeText(folderRelPath);
    setExpandedByPath((prev) => ({ ...prev, [key]: !prev?.[key], '': true }));
    setToggleTickByPath((prev) => ({ ...(prev || {}), [key]: (prev?.[key] || 0) + 1 }));
  };

  const toggleExpandedOrCollapseSubtree = (folderRelPath) => {
    const key = safeText(folderRelPath);
    if (!key) return;

    const isExpandedNow = Boolean(expandedByPath?.[key]);
    if (isExpandedNow) {
      collapseSubtree(key);
      setToggleTickByPath((prev) => ({ ...(prev || {}), [key]: (prev?.[key] || 0) + 1 }));
      return;
    }

    toggleExpanded(key);
  };

  const collapseSubtree = (folderRelPath) => {
    const root = safeText(folderRelPath);
    if (!root || root === '') return;
    setExpandedByPath((prev) => {
      const next = { ...(prev || {}) };
      Object.keys(next).forEach((k) => {
        if (k === root || k.startsWith(`${root}/`)) {
          next[k] = false;
        }
      });
      next[''] = true;
      return next;
    });
  };

  // If a folder ends up having no subfolders, collapse it so we never render an "empty" row.
  useEffect(() => {
    setExpandedByPath((prev) => {
      const next = { ...(prev || {}) };
      Object.keys(next).forEach((k) => {
        if (k === '') return;
        if (!next[k]) return;
        if (!Object.prototype.hasOwnProperty.call(childrenByPath || {}, k)) return;
        const folders = childrenByPath?.[k];
        const hasSubfolders = Array.isArray(folders) && folders.length > 0;
        if (!hasSubfolders) next[k] = false;
      });
      return next;
    });
  }, [childrenByPath]);

  const renderLevel = (parentRelPath, level) => {
    const key = safeText(parentRelPath);
    const rows = [];

    const error = safeText(errorByPath?.[key]);
    const loading = Boolean(loadingByPath?.[key]);
    const items = childrenByPath?.[key];

    if (error) {
      const messageIndent = baseIndent + level * 12 + 24;
      rows.push(
        <Text
          key={`${key}.__error__`}
          style={{
            color: LEFT_NAV.errorText,
            fontSize: compact ? 11 : 12,
            ...(edgeToEdge
              ? { marginLeft: 0, paddingLeft: LEFT_NAV.rowPaddingHorizontal + messageIndent }
              : { marginLeft: messageIndent }),
            marginTop: 4,
          }}
          numberOfLines={2}
        >
          {error}
        </Text>,
      );
    }

    if (loading) {
      const messageIndent = baseIndent + level * 12 + 24;
      rows.push(
        <Text
          key={`${key}.__loading__`}
          style={{
            color: LEFT_NAV.subtleText,
            fontSize: compact ? 11 : 12,
            ...(edgeToEdge
              ? { marginLeft: 0, paddingLeft: LEFT_NAV.rowPaddingHorizontal + messageIndent }
              : { marginLeft: messageIndent }),
            marginTop: 4,
            fontStyle: 'italic',
          }}
        >
          Laddar…
        </Text>,
      );
    }

    (Array.isArray(items) ? items : []).forEach((it) => {
      const isFolder = it?.type === 'folder';
      if (!isFolder) return;
      const name = safeText(it?.name) || (isFolder ? 'Mapp' : 'Fil');
      const id = safeText(it?.id) || safeText(it?.webUrl) || name;

      const rowIndent = baseIndent + level * 12;

      const folderRelPath = isFolder ? joinPath(key, name) : '';
      const isActiveFolder = isFolder && safeText(relativePath) === folderRelPath;
      const isSelectedFile = !isFolder && selectedItemId && String(selectedItemId) === String(it?.id);

      const isExpanded = isFolder ? Boolean(expandedByPath?.[folderRelPath]) : false;

      const knownChildren = Object.prototype.hasOwnProperty.call(childrenByPath || {}, folderRelPath);
      const childFolders = knownChildren ? childrenByPath?.[folderRelPath] : undefined;
      const hasSubfolders = Array.isArray(childFolders) && childFolders.length > 0;
      const hasFiles = Number(fileCountByPath?.[folderRelPath] || 0) > 0;
      const hasContent = Boolean(hasFiles || hasSubfolders);
      const canExpand = Boolean(!knownChildren || hasSubfolders);
      const isLeafNoSubfolders = Boolean(knownChildren && !hasSubfolders);

      const typeMeta = isFolder ? { icon: 'folder-outline' } : classifyFileType(name);
      const iconName = typeMeta?.icon || (isFolder ? 'folder-outline' : 'document-outline');

      const isRowActive = Boolean(isActiveFolder || isSelectedFile);

      rows.push(
        <SidebarItem
          key={id}
          fullWidth={Boolean(edgeToEdge)}
          squareCorners={Boolean(edgeToEdge)}
          indentMode={edgeToEdge ? 'padding' : 'margin'}
          indent={rowIndent}
          active={isRowActive}
          onPress={async () => {
            if (isFolder) {
              if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(null);
              if (typeof onRelativePathChange === 'function') onRelativePathChange(folderRelPath);
              // Single click must ONLY navigate; never expand/collapse.
              if (isLeafNoSubfolders) {
                setNudgeTickByPath((prev) => ({ ...(prev || {}), [folderRelPath]: (prev?.[folderRelPath] || 0) + 1 }));
              }
              return;
            }

            if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(it?.id || null);
          }}
          onDoubleClick={
            isFolder && canExpand
              ? () => {
                  toggleExpandedOrCollapseSubtree(folderRelPath);
                }
              : undefined
          }
          left={(state) => (
            <>
              {isFolder ? (
                canExpand ? (
                  <Pressable
                    onPress={(e) => {
                      try {
                        e?.stopPropagation?.();
                      } catch (_e) {}
                      toggleExpandedOrCollapseSubtree(folderRelPath);
                    }}
                    style={({ hovered, pressed }) => [
                      {
                        width: compact ? 18 : 20,
                        height: compact ? 18 : 20,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: 6,
                      },
                      Platform.OS === 'web' ? { cursor: 'pointer' } : null,
                      (hovered || pressed) ? { opacity: 0.9 } : null,
                    ]}
                  >
                    <AnimatedChevron
                      expanded={isExpanded}
                      size={compact ? 14 : 16}
                      color={(state.active || state.hovered) ? LEFT_NAV.accent : LEFT_NAV.iconMuted}
                      style={null}
                    />
                  </Pressable>
                ) : (
                  <View style={{ width: compact ? 18 : 20 }} />
                )
              ) : (
                <View style={{ width: compact ? 18 : 20 }} />
              )}

              <MicroShake trigger={nudgeTickByPath?.[folderRelPath] || 0} durationMs={90} amplitude={3}>
                <MicroPulse trigger={toggleTickByPath?.[folderRelPath] || 0}>
                  <Ionicons
                    name={iconName}
                    size={compact ? 16 : 18}
                    color={(state.active || state.hovered) ? LEFT_NAV.accent : LEFT_NAV.iconMuted}
                  />
                </MicroPulse>
              </MicroShake>
            </>
          )}
          label={name}
          labelWeight={isRowActive ? '600' : (hasContent ? '600' : '500')}
        />,
      );

      if (isFolder && isExpanded) {
        rows.push(
          <View key={`${id}.__children__`} style={{ marginTop: 2 }}>
            {renderLevel(folderRelPath, level + 1)}
          </View>,
        );
      }
    });

    return rows;
  };

  if (!cid || !base) {
    return (
      <Text style={[styles.mutedText, compact ? styles.mutedTextCompact : null]}>
        Saknar SharePoint-koppling.
      </Text>
    );
  }

  return <View style={styles.container}>{renderLevel('', 0)}</View>;
}

const styles = StyleSheet.create({
  container: {
    marginTop: 4,
  },
  mutedText: {
    color: LEFT_NAV.subtleText,
    fontSize: 12,
    fontWeight: '400',
    marginLeft: 14,
    marginTop: 4,
  },
  mutedTextCompact: {
    fontSize: 11,
    marginLeft: 10,
  },
});
