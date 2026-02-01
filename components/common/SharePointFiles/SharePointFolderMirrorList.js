import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { ensureFolderPath } from '../../../services/azure/fileService';
import { getSiteByUrl } from '../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import { safeText } from './sharePointFileUtils';

function joinPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function getFolderChildCount(item) {
  const direct = item?.childCount;
  if (Number.isFinite(direct)) return direct;
  const fromGraph = item?.folder?.childCount;
  if (Number.isFinite(fromGraph)) return fromGraph;
  return null;
}

async function openUrl(url) {
  const u = safeText(url);
  if (!u) return;
  try {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof window.open === 'function') {
      window.open(u, '_blank', 'noopener');
      return;
    }
  } catch (_e) {}

  try {
    const can = await Linking.canOpenURL(u).catch(() => false);
    if (can) await Linking.openURL(u);
  } catch (_e) {}
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

export default function SharePointFolderMirrorList({
  mode = 'panel', // 'panel' (default) | 'tree'
  indentLevel = 0,
  compact = false,
  companyId,
  project,
  rootPath,
  relativePath,
  onRelativePathChange,
  selectedItemId,
  onSelectedItemIdChange,
  refreshNonce,
}) {
  const cid = safeText(companyId);
  const base = safeText(rootPath);
  const rel = safeText(relativePath);

  const [siteId, setSiteId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const currentPath = useMemo(() => joinPath(base, rel), [base, rel]);

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

  const refresh = useCallback(async () => {
    if (!cid || !base || !siteId) return;

    setLoading(true);
    setError('');

    try {
      await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });
      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const folders = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'folder');
      const files = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file');

      folders.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));
      files.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));

      setItems([...folders, ...files]);
    } catch (e) {
      setItems([]);
      setError(String(e?.message || e || 'Kunde inte läsa innehåll.'));
    } finally {
      setLoading(false);
    }
  }, [cid, base, siteId, currentPath]);

  useEffect(() => {
    if (!siteId) return;
    refresh();
  }, [siteId, refresh]);

  useEffect(() => {
    if (!siteId) return;
    refresh();
  }, [refreshNonce, siteId, refresh]);

  const goUp = () => {
    const p = safeText(rel);
    if (!p) return;
    const parts = p.split('/').filter(Boolean);
    parts.pop();
    onRelativePathChange(parts.join('/'));
    if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(null);
  };

  const canGoUp = Boolean(rel);

  const rowMarginLeft = Math.max(0, Number(indentLevel) || 0) * 12;

  const renderRow = ({
    key,
    iconName,
    iconColor,
    text,
    subtext,
    onPress,
    selected,
    muted,
    isFolder,
  }) => (
    <Pressable
      key={key}
      onPress={onPress}
      style={({ hovered, pressed }) => ({
        paddingVertical: compact ? 4 : 6,
        paddingHorizontal: compact ? 8 : 10,
        borderRadius: 8,
        marginVertical: 1,
        marginLeft: rowMarginLeft,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: selected
          ? 'rgba(25, 118, 210, 0.12)'
          : hovered || pressed
            ? 'rgba(0,0,0,0.04)'
            : 'transparent',
        ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
      })}
    >
      <Ionicons name={iconName} size={compact ? 16 : 18} color={iconColor} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text
          style={{
            fontSize: compact ? 12 : 13,
            color: muted ? '#64748b' : selected ? '#0F172A' : '#111827',
            fontWeight: selected ? '600' : '400',
          }}
          numberOfLines={1}
        >
          {text}
        </Text>
        {safeText(subtext) ? (
          <Text style={[styles.metaText, compact ? styles.metaTextCompact : null]} numberOfLines={1}>
            {subtext}
          </Text>
        ) : null}
      </View>
      {Platform.OS === 'web' && !isFolder ? (
        <Ionicons name="open-outline" size={compact ? 14 : 16} color="#1976D2" />
      ) : null}
    </Pressable>
  );

  if (mode === 'tree') {
    const rows = [];

    if (canGoUp) {
      rows.push(
        renderRow({
          key: '__up__',
          iconName: 'arrow-up-outline',
          iconColor: '#64748b',
          text: 'Upp',
          onPress: () => goUp(),
          selected: false,
          muted: true,
          isFolder: true,
        }),
      );
    }

    if (error) {
      rows.push(
        <Text
          key="__error__"
          style={{
            color: '#D32F2F',
            fontSize: compact ? 12 : 13,
            marginLeft: rowMarginLeft + 10,
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
          key="__loading__"
          style={{
            color: '#64748b',
            fontSize: compact ? 12 : 13,
            marginLeft: rowMarginLeft + 10,
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
      const id = safeText(it?.id) || safeText(it?.webUrl) || safeText(it?.name);
      const name = safeText(it?.name) || (isFolder ? 'Mapp' : 'Fil');
      const uploadedBy = safeText(it?.createdBy) || '—';
      const isSelected = !isFolder && selectedItemId && String(selectedItemId) === String(it?.id);
      const childCount = isFolder ? getFolderChildCount(it) : null;
      const isEmptyFolder = isFolder && childCount === 0;

      rows.push(
        renderRow({
          key: id,
          iconName: isFolder ? 'folder-outline' : 'document-outline',
          iconColor: isFolder ? (isEmptyFolder ? '#CBD5E1' : '#64748b') : '#94A3B8',
          text: name,
          subtext: isFolder ? '' : uploadedBy,
          selected: isSelected,
          muted: isEmptyFolder,
          isFolder,
          onPress: async () => {
            if (isFolder) {
              const next = joinPath(rel, name);
              onRelativePathChange(next);
              if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(null);
              return;
            }

            if (typeof onSelectedItemIdChange === 'function') {
              onSelectedItemIdChange(it?.id || null);
            }

            await openUrl(it?.webUrl);
          },
        }),
      );
    });

    return <View style={{ marginTop: 4 }}>{rows}</View>;
  }

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="folder-outline" size={16} color="#64748b" style={{ marginRight: 8 }} />
        <Text style={styles.headerText} numberOfLines={1}>
          {rel ? `/${rel}` : '/'}
        </Text>
      </View>

      {canGoUp ? (
        <Pressable
          onPress={goUp}
          style={({ hovered, pressed }) => ({
            paddingVertical: 6,
            paddingHorizontal: 8,
            borderRadius: 8,
            backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
            flexDirection: 'row',
            alignItems: 'center',
            gap: 6,
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
          })}
        >
          <Ionicons name="arrow-up-outline" size={14} color="#64748b" />
          <Text style={styles.upText}>Upp</Text>
        </Pressable>
      ) : null}

      {error ? (
        <Text style={styles.errorText} numberOfLines={2}>
          {error}
        </Text>
      ) : null}

      {loading ? <Text style={styles.mutedText}>Laddar…</Text> : null}

      {(Array.isArray(items) ? items : []).map((it) => {
        const isFolder = it?.type === 'folder';
        const id = safeText(it?.id) || safeText(it?.webUrl) || safeText(it?.name);
        const name = safeText(it?.name) || (isFolder ? 'Mapp' : 'Fil');
        const uploadedBy = safeText(it?.createdBy) || '—';
        const isSelected = !isFolder && selectedItemId && String(selectedItemId) === String(it?.id);
        const childCount = isFolder ? getFolderChildCount(it) : null;
        const isEmptyFolder = isFolder && childCount === 0;

        return (
          <Pressable
            key={id}
            onPress={async () => {
              if (isFolder) {
                const next = joinPath(rel, name);
                onRelativePathChange(next);
                if (typeof onSelectedItemIdChange === 'function') onSelectedItemIdChange(null);
                return;
              }

              if (typeof onSelectedItemIdChange === 'function') {
                onSelectedItemIdChange(it?.id || null);
              }

              await openUrl(it?.webUrl);
            }}
            style={({ hovered, pressed }) => ({
              paddingVertical: 6,
              paddingHorizontal: 8,
              borderRadius: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              backgroundColor: isSelected
                ? 'rgba(25, 118, 210, 0.10)'
                : hovered || pressed
                  ? 'rgba(0,0,0,0.04)'
                  : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
            })}
          >
            <Ionicons
              name={isFolder ? 'folder-outline' : 'document-outline'}
              size={16}
              color={isFolder ? (isEmptyFolder ? '#CBD5E1' : '#64748b') : '#94A3B8'}
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={[styles.itemText, isEmptyFolder ? styles.itemTextEmpty : null, isSelected ? styles.itemTextSelected : null]} numberOfLines={1}>
                {name}
              </Text>
              {isFolder ? null : (
                <Text style={styles.metaText} numberOfLines={1}>
                  {uploadedBy}
                </Text>
              )}
            </View>
          </Pressable>
        );
      })}

      {Platform.OS !== 'web' ? null : (
        <Pressable
          onPress={() => {
            try {
              // no-op here; uploads happen in the middle panel
            } catch (_e) {}
          }}
          style={{ height: 1 }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F7',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '500',
    color: '#64748b',
  },
  upText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
  },
  itemText: {
    flex: 1,
    minWidth: 0,
    fontSize: 12,
    fontWeight: '400',
    color: '#111',
  },
  itemTextEmpty: {
    color: '#94A3B8',
  },
  itemTextSelected: {
    color: '#1976D2',
    fontWeight: '500',
  },
  metaText: {
    marginTop: 1,
    fontSize: 10,
    fontWeight: '400',
    color: '#94A3B8',
  },
  metaTextCompact: {
    fontSize: 9,
  },
  mutedText: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    color: '#94A3B8',
  },
  errorText: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '400',
    color: '#B91C1C',
  },
});
