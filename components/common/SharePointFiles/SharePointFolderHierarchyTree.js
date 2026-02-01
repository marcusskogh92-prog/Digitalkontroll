import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';

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
}) {
  const cid = safeText(companyId);
  const base = safeText(rootPath);

  const [siteId, setSiteId] = useState('');
  const [expandedByPath, setExpandedByPath] = useState({ '': true });
  const [childrenByPath, setChildrenByPath] = useState({});
  const [loadingByPath, setLoadingByPath] = useState({});
  const [errorByPath, setErrorByPath] = useState({});

  const inflightRef = useRef(new Set());

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
    const chain = buildAncestorPaths(relativePath);
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
      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const folders = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'folder');
      const files = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file');

      folders.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));
      files.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));

      setChildrenByPath((prev) => ({ ...prev, [key]: [...folders, ...files] }));
    } catch (e) {
      setChildrenByPath((prev) => ({ ...prev, [key]: [] }));
      setErrorByPath((prev) => ({ ...prev, [key]: String(e?.message || e || 'Kunde inte läsa innehåll.') }));
    } finally {
      setLoadingByPath((prev) => ({ ...prev, [key]: false }));
      inflightRef.current.delete(key);
    }
  }, [cid, base, siteId]);

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
    setExpandedByPath((prev) => ({ ...prev, [key]: !prev?.[key] }));
  };

  const renderLevel = (parentRelPath, level) => {
    const key = safeText(parentRelPath);
    const rows = [];

    const error = safeText(errorByPath?.[key]);
    const loading = Boolean(loadingByPath?.[key]);
    const items = childrenByPath?.[key];

    if (error) {
      rows.push(
        <Text
          key={`${key}.__error__`}
          style={{
            color: '#B91C1C',
            fontSize: compact ? 11 : 12,
            marginLeft: baseIndent + level * 12 + 26,
            marginTop: 4,
          }}
          numberOfLines={2}
        >
          {error}
        </Text>,
      );
    }

    if (loading) {
      rows.push(
        <Text
          key={`${key}.__loading__`}
          style={{
            color: '#94A3B8',
            fontSize: compact ? 11 : 12,
            marginLeft: baseIndent + level * 12 + 26,
            marginTop: 4,
            fontStyle: 'italic',
          }}
        >
          Laddar…
        </Text>,
      );
    }

    if (Array.isArray(items) && items.length === 0 && !loading && !error) {
      rows.push(
        <Text
          key={`${key}.__empty__`}
          style={{
            color: '#CBD5E1',
            fontSize: compact ? 11 : 12,
            marginLeft: baseIndent + level * 12 + 26,
            marginTop: 4,
            fontStyle: 'italic',
          }}
        >
          Inga objekt
        </Text>,
      );
    }

    (Array.isArray(items) ? items : []).forEach((it) => {
      const isFolder = it?.type === 'folder';
      const name = safeText(it?.name) || (isFolder ? 'Mapp' : 'Fil');
      const id = safeText(it?.id) || safeText(it?.webUrl) || name;

      const rowIndent = baseIndent + level * 12;

      const folderRelPath = isFolder ? joinPath(key, name) : '';
      const isActiveFolder = isFolder && safeText(relativePath) === folderRelPath;
      const isInActiveChain = isFolder && safeText(relativePath).startsWith(folderRelPath ? `${folderRelPath}/` : '');
      const isSelectedFile = !isFolder && selectedItemId && String(selectedItemId) === String(it?.id);

      const isExpanded = isFolder ? Boolean(expandedByPath?.[folderRelPath]) : false;

      const typeMeta = isFolder ? { icon: 'folder-outline' } : classifyFileType(name);
      const iconName = typeMeta?.icon || (isFolder ? 'folder-outline' : 'document-outline');

      rows.push(
        <Pressable
          key={id}
          onPress={async () => {
            if (isFolder) {
              if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(null);
              if (typeof onRelativePathChange === 'function') onRelativePathChange(folderRelPath);
              setExpandedByPath((prev) => ({ ...prev, [folderRelPath]: true, '': true }));
              return;
            }

            if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(it?.id || null);
          }}
          style={({ hovered, pressed }) => ({
            marginLeft: rowIndent,
            paddingVertical: compact ? 4 : 6,
            paddingHorizontal: compact ? 6 : 8,
            borderRadius: 8,
            marginVertical: 1,
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            backgroundColor: isActiveFolder || isSelectedFile
              ? 'rgba(25, 118, 210, 0.12)'
              : hovered || pressed
                ? 'rgba(0,0,0,0.04)'
                : 'transparent',
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
          })}
        >
          {isFolder ? (
            <Pressable
              onPress={(e) => {
                try { e.stopPropagation?.(); } catch (_e) {}
                toggleExpanded(folderRelPath);
              }}
              style={({ hovered, pressed }) => ({
                width: compact ? 18 : 20,
                height: compact ? 18 : 20,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6,
                backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
              })}
            >
              <Ionicons
                name={isExpanded ? 'chevron-down' : 'chevron-forward'}
                size={compact ? 14 : 16}
                color={isInActiveChain || isActiveFolder ? '#475569' : '#94A3B8'}
              />
            </Pressable>
          ) : (
            <View style={{ width: compact ? 18 : 20 }} />
          )}

          <Ionicons
            name={iconName}
            size={compact ? 16 : 18}
            color={isFolder ? (isInActiveChain || isActiveFolder ? '#475569' : '#64748b') : '#94A3B8'}
          />

          <Text
            style={{
              fontSize: compact ? 12 : 13,
              fontWeight: '400',
              color: isActiveFolder || isSelectedFile ? '#0F172A' : '#111827',
              flex: 1,
              minWidth: 0,
            }}
            numberOfLines={1}
          >
            {name}
          </Text>

          {!isFolder ? (
            <Ionicons
              name="eye-outline"
              size={compact ? 16 : 18}
              color={isSelectedFile ? '#1976D2' : '#94A3B8'}
            />
          ) : null}
        </Pressable>,
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
    color: '#94A3B8',
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
