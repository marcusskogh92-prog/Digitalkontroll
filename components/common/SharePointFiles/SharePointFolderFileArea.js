import { Ionicons } from '@expo/vector-icons';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Dimensions, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ensureFolderPath, uploadFile } from '../../../services/azure/fileService';
import { deleteDriveItemById, getDriveItemByPath, moveDriveItemById, renameDriveItemById } from '../../../services/azure/hierarchyService';
import { getSiteByUrl } from '../../../services/azure/siteService';
import { getSharePointFolderItems } from '../../../services/sharepoint/sharePointStructureService';
import ContextMenu from '../../ContextMenu';
import FileActionModal from '../Modals/FileActionModal';
import FilePreviewModal from '../Modals/FilePreviewModal';
import SharePointFilePreviewPane from './SharePointFilePreviewPane';
import { ALLOWED_UPLOAD_EXTENSIONS, classifyFileType, dedupeFileName, fileExtFromName, formatBytes, isAllowedUploadFile, safeText } from './sharePointFileUtils';

function joinPath(a, b) {
  const left = safeText(a).replace(/^\/+/, '').replace(/\/+$/, '');
  const right = safeText(b).replace(/^\/+/, '').replace(/\/+$/, '');
  if (!left) return right;
  if (!right) return left;
  return `${left}/${right}`;
}

function toIsoDateText(value) {
  const s = safeText(value);
  if (!s) return '—';
  try {
    const d = new Date(s);
    const t = d.getTime();
    if (!Number.isFinite(t)) return '—';
    return d.toLocaleString('sv-SE', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  } catch (_e) {
    return '—';
  }
}

function buildAcceptAttr() {
  // Helps the file picker, but we still validate extensions.
  const ext = Array.from(ALLOWED_UPLOAD_EXTENSIONS);
  return ext.map((e) => `.${e}`).join(',');
}

function stripNumericPrefix(name) {
  const s = safeText(name);
  if (!s) return '';
  return s.replace(/^\s*\d+\s*-\s*/g, '').trim();
}

export default function SharePointFolderFileArea({
  companyId,
  project,
  title,
  subtitle,
  iconName = 'folder-outline',

  // Optional breadcrumb base segments shown before the current folder path.
  // Example (AF): ['Förfrågningsunderlag', 'Administrativa föreskrifter (AF)']
  breadcrumbBaseSegments = null,

  // AF-only (opt-in): keep file list visible and show a preview pane for clicked/selected files.
  enableInlinePreview = false,

  // Root folder for this view (e.g. ".../02 - Förfrågningsunderlag/01 - Administrativa föreskrifter (AF)")
  rootPath,

  // Allowed move scope root (e.g. ".../02 - Förfrågningsunderlag")
  scopeRootPath,

  // Optional controlled folder navigation + selection (used by AF mirror in left panel)
  relativePath: relativePathProp = null,
  onRelativePathChange = null,
  selectedItemId: selectedItemIdProp = null,
  onSelectedItemIdChange = null,
  refreshNonce = 0,
  onDidMutate = null,
}) {
  // Keep "Senast ändrad" anchored to the right, while letting other columns share space closer to Filnamn.
  const COL_MOD_W = 140;
  const COL_MENU_W = 46;

  const cid = safeText(companyId);
  const hasContext = Boolean(cid && safeText(rootPath));

  const [siteId, setSiteId] = useState('');
  const [siteError, setSiteError] = useState('');

  const [internalRelativePath, setInternalRelativePath] = useState('');
  const relativePath = (relativePathProp !== null && relativePathProp !== undefined)
    ? String(relativePathProp || '')
    : internalRelativePath;
  const setRelativePath = useCallback((next) => {
    const v = String(next || '');
    if (typeof onRelativePathChange === 'function') {
      onRelativePathChange(v);
    } else {
      setInternalRelativePath(v);
    }
  }, [onRelativePathChange]);

  const [internalSelectedItemId, setInternalSelectedItemId] = useState(null);
  const selectedItemId = (selectedItemIdProp !== null && selectedItemIdProp !== undefined)
    ? (selectedItemIdProp ? String(selectedItemIdProp) : null)
    : internalSelectedItemId;
  const setSelectedItemId = useCallback((next) => {
    const v = next ? String(next) : null;
    if (typeof onSelectedItemIdChange === 'function') {
      onSelectedItemIdChange(v);
    } else {
      setInternalSelectedItemId(v);
    }
  }, [onSelectedItemIdChange]);

  const breadcrumbParts = useMemo(() => {
    const base = Array.isArray(breadcrumbBaseSegments) ? breadcrumbBaseSegments : [];
    const baseParts = base.map((x) => ({
      label: stripNumericPrefix(x) || safeText(x) || '',
      relativePath: '',
    })).filter((x) => safeText(x.label));

    const relParts = safeText(relativePath).split('/').filter(Boolean);
    const relCrumbs = relParts.map((p, idx) => ({
      label: stripNumericPrefix(p) || p,
      relativePath: relParts.slice(0, idx + 1).join('/'),
    }));

    // Always include the current root/title as a clickable "home" if no base segments are provided.
    if (baseParts.length === 0 && safeText(title)) {
      baseParts.push({ label: stripNumericPrefix(title) || safeText(title), relativePath: '' });
    }

    return [...baseParts, ...relCrumbs];
  }, [breadcrumbBaseSegments, relativePath, title]);

  const currentPath = useMemo(() => joinPath(rootPath, relativePath), [rootPath, relativePath]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [items, setItems] = useState([]);

  const [previewItemId, setPreviewItemId] = useState(null);
  const [previewModalOpen, setPreviewModalOpen] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(1);
  const [previewPage, setPreviewPage] = useState(1);
  const [previewNumPages, setPreviewNumPages] = useState(null);

  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef(null);

  const [menuVisible, setMenuVisible] = useState(false);
  const [menuPos, setMenuPos] = useState({ x: 20, y: 64 });
  const [menuTarget, setMenuTarget] = useState(null);

  const [createFolderOpen, setCreateFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const [renameOpen, setRenameOpen] = useState(false);
  const [renameTarget, setRenameTarget] = useState(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameError, setRenameError] = useState('');

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleteError, setDeleteError] = useState('');

  const [moveOpen, setMoveOpen] = useState(false);
  const [moveTarget, setMoveTarget] = useState(null);
  const [moveSelectedPath, setMoveSelectedPath] = useState('');
  const [folderChildrenByPath, setFolderChildrenByPath] = useState({}); // path -> [{id,name,type}]
  const [folderExpanded, setFolderExpanded] = useState({});
  const [folderLoading, setFolderLoading] = useState({});
  const [moveError, setMoveError] = useState('');

  const isListEmpty = useMemo(() => !loading && Array.isArray(items) && items.length === 0, [loading, items]);

  const isWidePreviewLayout = useMemo(() => {
    const w = Dimensions.get('window')?.width || 1200;
    return Platform.OS === 'web' && w >= 1180;
  }, []);

  const previewItem = useMemo(() => {
    if (!enableInlinePreview) return null;
    const id = safeText(previewItemId);
    if (!id) return null;
    return (Array.isArray(items) ? items : []).find((x) => x?.type === 'file' && safeText(x?.id) === id) || null;
  }, [enableInlinePreview, items, previewItemId]);

  const resolveSiteId = useCallback(async () => {
    const fromProject = safeText(project?.sharePointSiteId || project?.siteId || project?.siteID);
    if (fromProject) return fromProject;

    const siteUrl = safeText(project?.sharePointSiteUrl);
    if (siteUrl) {
      const site = await getSiteByUrl(siteUrl);
      const id = safeText(site?.id);
      if (id) return id;
    }

    // Fallback: company profile
    try {
      const { getCompanySharePointSiteId } = await import('../../firebase');
      const id = await getCompanySharePointSiteId(cid);
      return safeText(id);
    } catch (_e) {
      return '';
    }
  }, [cid, project]);

  const moveModalMaxHeight = useMemo(() => {
    const h = Dimensions.get('window')?.height || 800;
    return Math.max(320, Math.floor(h * 0.8));
  }, []);

  const refresh = useCallback(async () => {
    if (!hasContext) return;
    if (!safeText(siteId)) return;

    setLoading(true);
    setError('');

    try {
      // Ensure folder exists (strict)
      await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });
      const next = await getSharePointFolderItems(siteId, `/${currentPath}`);

      const folders = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'folder');
      const files = (Array.isArray(next) ? next : []).filter((x) => x?.type === 'file');

      folders.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));
      files.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));

      setItems([...folders, ...files]);
    } catch (e) {
      setError(String(e?.message || e || 'Kunde inte läsa filer från SharePoint.'));
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [hasContext, siteId, currentPath, cid]);

  useEffect(() => {
    if (!hasContext) {
      setSiteId('');
      setSiteError('');
      return;
    }

    let cancelled = false;
    (async () => {
      setSiteError('');
      try {
        const id = await resolveSiteId();
        if (cancelled) return;
        if (!id) {
          setSiteError('SharePoint-siteId saknas för projektet.');
          setSiteId('');
          return;
        }
        setSiteId(id);
      } catch (e) {
        if (cancelled) return;
        setSiteError(String(e?.message || e || 'Kunde inte ansluta till SharePoint.'));
        setSiteId('');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [hasContext, resolveSiteId]);

  useEffect(() => {
    if (!safeText(siteId)) return;
    refresh();
  }, [siteId, refresh, refreshNonce]);

  // Keep preview in sync with shared selection state (so left tree click also previews).
  useEffect(() => {
    if (!enableInlinePreview) return;
    const id = safeText(selectedItemId);
    if (!id) {
      setPreviewItemId(null);
      return;
    }
    const exists = (Array.isArray(items) ? items : []).some((x) => x?.type === 'file' && safeText(x?.id) === id);
    if (exists) setPreviewItemId(id);
  }, [enableInlinePreview, items, selectedItemId]);

  // Navigating to another folder should clear file preview.
  useEffect(() => {
    if (!enableInlinePreview) return;
    setPreviewModalOpen(false);
    setPreviewItemId(null);
  }, [enableInlinePreview, relativePath]);

  // Changing the preview target resets viewer state.
  useEffect(() => {
    if (!enableInlinePreview) return;
    setPreviewZoom(1);
    setPreviewPage(1);
    setPreviewNumPages(null);
  }, [enableInlinePreview, previewItemId]);

  const existingFileNamesLower = useMemo(() => {
    const set = new Set();
    (Array.isArray(items) ? items : []).forEach((it) => {
      if (it?.type !== 'file') return;
      const name = safeText(it?.name);
      if (!name) return;
      set.add(name.toLowerCase());
    });
    return set;
  }, [items]);

  const openUrl = async (url) => {
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
  };

  const uploadFiles = useCallback(async (files) => {
    const arr = Array.isArray(files) ? files : [];
    if (arr.length === 0) return;

    if (!hasContext || !safeText(siteId)) {
      setError('Saknar SharePoint-koppling (siteId).');
      return;
    }

    setError('');

    // Validate types first
    const invalid = arr.filter((f) => !isAllowedUploadFile(f));
    if (invalid.length > 0) {
      const names = invalid.map((f) => safeText(f?.name) || 'fil').slice(0, 8);
      setError(`Otillåten filtyp: ${names.join(', ')}${invalid.length > 8 ? '…' : ''}`);
      return;
    }

    const nextExisting = new Set(existingFileNamesLower);

    const failures = [];

    try {
      await ensureFolderPath(currentPath, cid, siteId, { siteRole: 'projects', strict: true });

      for (const file of arr) {
        const originalName = safeText(file?.name) || `fil_${Date.now()}`;
        const targetName = dedupeFileName(originalName, nextExisting);
        nextExisting.add(targetName.toLowerCase());

        const path = joinPath(currentPath, targetName);

        try {
          await uploadFile({
            file,
            path,
            companyId: cid,
            siteId,
            siteRole: 'projects',
            strictEnsure: true,
          });

          // The list is the source of truth: refresh so the file appears directly in the table.
          await refresh();
        } catch (e) {
          failures.push({
            name: targetName,
            error: String(e?.message || e || 'Fel vid uppladdning'),
          });
        }
      }

      if (failures.length > 0) {
        const preview = failures.slice(0, 3).map((f) => `${safeText(f.name)} (${safeText(f.error)})`).join(' · ');
        setError(`Kunde inte ladda upp ${failures.length} fil(er). ${preview}${failures.length > 3 ? ' …' : ''}`);
      }
    } finally {
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    }
  }, [hasContext, siteId, currentPath, cid, refresh, existingFileNamesLower, onDidMutate]);

  const openMenuFor = (it, e) => {
    const ne = e?.nativeEvent || e || {};
    const x = Number(ne?.pageX ?? ne?.clientX ?? 20);
    const y = Number(ne?.pageY ?? ne?.clientY ?? 64);
    setMenuPos({ x: Number.isFinite(x) ? x : 20, y: Number.isFinite(y) ? y : 64 });
    setMenuTarget(it);
    setMenuVisible(true);
  };

  const openFolder = (name) => {
    const n = safeText(name);
    if (!n) return;
    const next = joinPath(relativePath, n);
    setSelectedItemId(null);
    setRelativePath(next);
  };

  const startMove = (it) => {
    setMoveError('');
    setMoveTarget(it);
    setMoveSelectedPath('');
    setFolderChildrenByPath({});
    setFolderExpanded({});
    setFolderLoading({});
    setMoveOpen(true);

    // Preload root folders in scope
    (async () => {
      const scope = safeText(scopeRootPath);
      if (!scope || !safeText(siteId)) return;
      await loadFolderChildren(scope);
      setFolderExpanded((prev) => ({ ...(prev || {}), [scope]: true }));
    })();
  };

  const loadFolderChildren = async (path) => {
    const p = safeText(path);
    if (!p || !safeText(siteId)) return;

    setFolderLoading((prev) => ({ ...(prev || {}), [p]: true }));
    try {
      const list = await getSharePointFolderItems(siteId, `/${p}`);
      const folders = (Array.isArray(list) ? list : []).filter((x) => x?.type === 'folder');
      folders.sort((a, b) => safeText(a?.name).localeCompare(safeText(b?.name), 'sv', { numeric: true, sensitivity: 'base' }));
      setFolderChildrenByPath((prev) => ({ ...(prev || {}), [p]: folders }));
    } catch (_e) {
      // keep empty
      setFolderChildrenByPath((prev) => ({ ...(prev || {}), [p]: [] }));
    } finally {
      setFolderLoading((prev) => ({ ...(prev || {}), [p]: false }));
    }
  };

  const toggleFolderExpanded = async (path) => {
    const p = safeText(path);
    if (!p) return;

    const willExpand = !(folderExpanded && folderExpanded[p]);
    setFolderExpanded((prev) => ({ ...(prev || {}), [p]: willExpand }));

    if (willExpand && !Object.prototype.hasOwnProperty.call(folderChildrenByPath || {}, p)) {
      await loadFolderChildren(p);
    }
  };

  const performMove = async () => {
    const it = moveTarget;
    if (!it || it?.type !== 'file') return;

    const dest = safeText(moveSelectedPath);
    if (!dest) {
      setMoveError('Välj en målmapp.');
      return;
    }

    if (!safeText(siteId)) {
      setMoveError('Saknar SharePoint siteId.');
      return;
    }

    setMoveError('');
    try {
      const destItem = await getDriveItemByPath(siteId, dest);
      const destId = safeText(destItem?.id);
      if (!destId) throw new Error('Kunde inte identifiera målmappen i SharePoint.');

      await moveDriveItemById(siteId, it.id, destId);
      setMoveOpen(false);
      setMoveTarget(null);
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setMoveError(String(e?.message || e || 'Kunde inte flytta filen.'));
    }
  };

  const menuItems = useMemo(() => {
    const it = menuTarget;
    if (!it) return [];

    const isFile = it?.type === 'file';
    const isFolder = it?.type === 'folder';

    return [
      {
        key: 'open',
        label: 'Öppna',
        iconName: 'open-outline',
        disabled: !safeText(it?.webUrl),
      },
      {
        key: 'download',
        label: 'Ladda ner',
        iconName: 'download-outline',
        disabled: !safeText(it?.downloadUrl || it?.webUrl),
      },
      { isSeparator: true, key: 'sep1' },
      {
        key: 'rename',
        label: 'Byt namn',
        iconName: 'pencil-outline',
        disabled: !(isFile || isFolder),
      },
      {
        key: 'move',
        label: 'Flytta…',
        iconName: 'return-up-forward-outline',
        disabled: !isFile,
        subtitle: 'Inom Förfrågningsunderlag',
      },
      { isSeparator: true, key: 'sep2' },
      {
        key: 'delete',
        label: 'Ta bort',
        iconName: 'trash-outline',
        danger: true,
        disabled: !(isFile || isFolder),
      },
    ];
  }, [menuTarget]);

  const onSelectMenuItem = async (item) => {
    const key = safeText(item?.key);
    const it = menuTarget;
    if (!key || !it) return;

    if (key === 'open') {
      await openUrl(it?.webUrl);
      return;
    }

    if (key === 'download') {
      await openUrl(it?.downloadUrl || it?.webUrl);
      return;
    }

    if (key === 'rename') {
      setRenameError('');
      setRenameTarget(it);
      setRenameValue(safeText(it?.name));
      setRenameOpen(true);
      return;
    }

    if (key === 'move') {
      startMove(it);
      return;
    }

    if (key === 'delete') {
      setDeleteError('');
      setDeleteTarget(it);
      setDeleteOpen(true);
      return;
    }
  };

  const performRename = async () => {
    const it = renameTarget;
    const nextName = safeText(renameValue);
    if (!it) return;
    if (!nextName) {
      setRenameError('Ange ett namn.');
      return;
    }
    if (!safeText(siteId)) {
      setRenameError('Saknar SharePoint siteId.');
      return;
    }

    try {
      setRenameError('');
      await renameDriveItemById(siteId, it.id, nextName);
      setRenameOpen(false);
      setRenameTarget(null);
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setRenameError(String(e?.message || e || 'Kunde inte byta namn.'));
    }
  };

  const performDelete = async () => {
    const it = deleteTarget;
    if (!it) return;
    if (!safeText(siteId)) {
      setDeleteError('Saknar SharePoint siteId.');
      return;
    }

    try {
      setDeleteError('');
      await deleteDriveItemById(siteId, it.id);
      setDeleteOpen(false);
      setDeleteTarget(null);
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      setDeleteError(String(e?.message || e || 'Kunde inte ta bort.'));
    }
  };

  const createFolder = async () => {
    const name = safeText(newFolderName);
    if (!name) return;
    if (!hasContext || !safeText(siteId)) return;

    // Basic sanitization for SharePoint folder names
    const safeName = name.replace(/[\\/:*?"<>|]/g, '-').trim();
    if (!safeName) return;

    try {
      setCreateFolderOpen(false);
      setNewFolderName('');
      await ensureFolderPath(joinPath(currentPath, safeName), cid, siteId, { siteRole: 'projects', strict: true });
      await refresh();
      try {
        if (typeof onDidMutate === 'function') onDidMutate();
      } catch (_e) {}
    } catch (e) {
      Alert.alert('Fel', String(e?.message || e || 'Kunde inte skapa mapp.'));
    }
  };

  const folderRow = (folder, level, parentPath) => {
    const name = safeText(folder?.name);
    const p = joinPath(parentPath, name);
    const expanded = Boolean(folderExpanded && folderExpanded[p]);
    const loadingChildren = Boolean(folderLoading && folderLoading[p]);
    const children = folderChildrenByPath && folderChildrenByPath[p];

    return (
      <View key={p}>
        <Pressable
          onPress={() => setMoveSelectedPath(p)}
          style={({ hovered, pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            paddingVertical: 8,
            paddingHorizontal: 10,
            borderRadius: 10,
            backgroundColor: (moveSelectedPath === p)
              ? 'rgba(25, 118, 210, 0.12)'
              : (hovered || pressed ? 'rgba(0,0,0,0.03)' : 'transparent'),
            ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
          })}
        >
          <Pressable
            onPress={() => toggleFolderExpanded(p)}
            style={({ hovered, pressed }) => ({
              width: 26,
              height: 26,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: 8,
              marginLeft: level * 14,
              backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
              ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
            })}
          >
            <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={16} color="#64748b" />
          </Pressable>

          <Ionicons name="folder-outline" size={16} color="#475569" style={{ marginRight: 8 }} />
          <Text style={{ flex: 1, fontSize: 13, color: '#111' }} numberOfLines={1}>
            {name || 'Mapp'}
          </Text>
          {loadingChildren ? (
            <Text style={{ fontSize: 12, color: '#64748b' }}>Laddar…</Text>
          ) : null}
        </Pressable>

        {expanded ? (
          <View style={{ marginTop: 2 }}>
            {(Array.isArray(children) ? children : []).map((ch) => folderRow(ch, level + 1, p))}
            {Array.isArray(children) && children.length === 0 && !loadingChildren ? (
              <Text style={{ marginLeft: (level + 1) * 14 + 44, fontSize: 12, color: '#64748b', paddingVertical: 6 }}>
                Inga undermappar.
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    );
  };

  if (!hasContext) {
    return (
      <View style={{ flex: 1, padding: 18 }}>
        <Text style={{ color: '#64748b' }}>Saknar project/company-kontext.</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Hidden file input (web) */}
      {Platform.OS === 'web' ? (
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={buildAcceptAttr()}
          style={{ display: 'none' }}
          onChange={(e) => {
            const list = Array.from(e?.target?.files || []);
            if (e?.target) e.target.value = '';
            uploadFiles(list);
          }}
        />
      ) : null}

      {siteError ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{siteError}</Text>
        </View>
      ) : null}

      {error ? (
        <View style={styles.errorBox}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}

      {/* Drop zone (web: drag & drop + click to upload) */}
      <Pressable
        onPress={() => {
          if (Platform.OS !== 'web') {
            Alert.alert('Lägg till filer', 'Uppladdning är tillgängligt i webbläget (drag & drop).');
            return;
          }
          try { fileInputRef.current?.click?.(); } catch (_e) {}
        }}
        style={({ hovered, pressed }) => ([
          styles.dropZone,
          isListEmpty ? styles.dropZoneEmpty : styles.dropZoneSubtle,
          dragOver ? styles.dropZoneActive : null,
          hovered || pressed ? styles.dropZoneHover : null,
          ...(Platform.OS === 'web' ? [{ cursor: 'pointer' }] : []),
        ])}
        onDragOver={(e) => {
          if (Platform.OS !== 'web') return;
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (_e) {}
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          if (Platform.OS !== 'web') return;
          try {
            e.preventDefault();
            e.stopPropagation();
          } catch (_e) {}

          setDragOver(false);
          const list = Array.from(e?.dataTransfer?.files || []);
          uploadFiles(list);
        }}
      >
        <Ionicons
          name="cloud-upload-outline"
          size={16}
          color={dragOver ? '#1976D2' : (isListEmpty ? '#64748b' : '#94A3B8')}
          style={{ marginRight: 10 }}
        />
        <Text style={[styles.dropZoneText, !isListEmpty ? styles.dropZoneTextSubtle : null, dragOver ? styles.dropZoneTextActive : null]}>
          Dra och släpp filer här eller klicka för att ladda upp
        </Text>
        <Text style={[styles.dropZoneHint, !isListEmpty ? styles.dropZoneHintSubtle : null]} numberOfLines={1}>
          Tillåtna: PDF, Word, Excel, DWG, IFC, bilder, ZIP
        </Text>
      </Pressable>

      {Array.isArray(breadcrumbParts) && breadcrumbParts.length > 0 ? (
        <View style={styles.breadcrumbRow}>
          {breadcrumbParts.map((part, idx) => {
            const isLast = idx === breadcrumbParts.length - 1;
            const isActive = safeText(relativePath) === safeText(part.relativePath);
            const canNavigate = !isLast || !isActive;

            return (
              <View key={`${idx}-${part.label}`} style={styles.breadcrumbPart}>
                <Pressable
                  disabled={!canNavigate}
                  onPress={() => {
                    setSelectedItemId(null);
                    setRelativePath(part.relativePath || '');
                  }}
                  style={({ hovered, pressed }) => ({
                    paddingVertical: 2,
                    paddingHorizontal: 4,
                    borderRadius: 8,
                    backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: canNavigate ? 'pointer' : 'default' } : null),
                  })}
                >
                  <Text style={[styles.breadcrumbText, isLast ? styles.breadcrumbTextActive : null]} numberOfLines={1}>
                    {part.label}
                  </Text>
                </Pressable>

                {!isLast ? <Text style={styles.breadcrumbSep}>/</Text> : null}
              </View>
            );
          })}
        </View>
      ) : null}

      <View style={[styles.splitRow, !enableInlinePreview ? styles.splitRowSingle : null]}>
        <View style={[styles.listPane, enableInlinePreview && isWidePreviewLayout ? { flex: 1 } : null]}>
          {/* Table */}
          <View style={styles.table}>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, styles.colName]} numberOfLines={1}>Filnamn</Text>
              <Text style={[styles.th, styles.colType]} numberOfLines={1}>Typ</Text>
              <Text style={[styles.th, styles.colUploadedBy]} numberOfLines={1}>Uppladdad av</Text>
              <Text style={[styles.th, styles.colSize]} numberOfLines={1}>Storlek</Text>
              <Text style={[styles.th, styles.colModified, { width: COL_MOD_W }]} numberOfLines={1}>Senast ändrad</Text>
              <Text style={[styles.th, styles.colMenu, { width: COL_MENU_W }]} numberOfLines={1}>⋮</Text>
            </View>

            <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
              {loading ? (
                <Text style={{ padding: 12, fontSize: 12, color: '#64748b' }}>Laddar…</Text>
              ) : null}

              {!loading && Array.isArray(items) && items.length === 0 ? (
                <Text style={{ padding: 12, fontSize: 12, color: '#64748b' }}>Inga filer eller mappar ännu.</Text>
              ) : null}

              {(Array.isArray(items) ? items : []).map((it) => {
            const name = safeText(it?.name) || (it?.type === 'folder' ? 'Mapp' : 'Fil');
            const isFolder = it?.type === 'folder';
            const isSelected = !isFolder && safeText(it?.id) && safeText(selectedItemId) === safeText(it?.id);
            const ext = fileExtFromName(name);
            const typeMeta = isFolder
              ? { label: 'MAPP', icon: 'folder-outline' }
              : classifyFileType(name);

            return (
              <Pressable
                key={safeText(it?.id) || name}
                onPress={() => {
                  if (isFolder) {
                    setSelectedItemId(null);
                    openFolder(name);
                    return;
                  }
                  setSelectedItemId(it?.id || null);
                  if (enableInlinePreview) {
                    setPreviewItemId(safeText(it?.id) || null);
                    return;
                  }
                  openUrl(it?.webUrl);
                }}
                style={({ hovered, pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 14,
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: 1,
                  borderBottomColor: '#EEF2F7',
                  backgroundColor: isSelected ? 'rgba(25, 118, 210, 0.08)' : (hovered || pressed ? '#F8FAFC' : '#fff'),
                  ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
                })}
              >
                <View style={[styles.colName, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                  <Ionicons name={typeMeta.icon} size={16} color={isFolder ? '#475569' : '#64748b'} />
                  <Text style={styles.tdName} numberOfLines={1}>{name}</Text>
                </View>

                <View style={[styles.colType, { flexDirection: 'row', alignItems: 'center', gap: 6 }]}>
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeBadgeText} numberOfLines={1}>
                      {(isFolder ? 'MAPP' : (typeMeta?.label || (ext ? ext.toUpperCase() : 'FIL'))).toUpperCase()}
                    </Text>
                  </View>
                </View>

                <Text style={[styles.tdUploader, styles.colUploadedBy]} numberOfLines={1}>
                  {safeText(it?.createdBy) || '—'}
                </Text>

                <Text style={[styles.td, styles.colSize]} numberOfLines={1}>
                  {isFolder ? '—' : formatBytes(it?.size)}
                </Text>

                <Text style={[styles.td, styles.colModified, { width: COL_MOD_W }]} numberOfLines={1}>
                  {toIsoDateText(it?.lastModified)}
                </Text>

                <Pressable
                  onPress={(e) => {
                    try { e.stopPropagation?.(); } catch (_e2) {}
                    openMenuFor(it, e);
                  }}
                  style={({ hovered, pressed }) => ({
                    width: COL_MENU_W,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: hovered || pressed ? 'rgba(0,0,0,0.04)' : 'transparent',
                    ...(Platform.OS === 'web' ? { cursor: 'pointer' } : null),
                  })}
                >
                  <Ionicons name="ellipsis-vertical" size={16} color="#64748b" />
                </Pressable>
              </Pressable>
                );
              })}
            </ScrollView>
          </View>
        </View>

        {enableInlinePreview ? (
          <View style={[styles.previewPane, isWidePreviewLayout ? null : styles.previewPaneStacked]}>
            <SharePointFilePreviewPane
              item={previewItem}
              variant="panel"
              siteId={siteId}
              onClose={() => {
                setPreviewModalOpen(false);
                setPreviewItemId(null);
                setSelectedItemId(null);
              }}
              onOpenInModal={() => {
                if (!previewItem) return;
                if (Platform.OS !== 'web') return;
                setPreviewModalOpen(true);
              }}
              onOpenInNewTab={(url) => openUrl(url)}
            />
          </View>
        ) : null}
      </View>

      {enableInlinePreview && Platform.OS === 'web' ? (
        <FilePreviewModal
          visible={previewModalOpen && !!previewItem}
          onClose={() => setPreviewModalOpen(false)}
          maxWidth={1500}
        >
          <SharePointFilePreviewPane
            item={previewItem}
            variant="modal"
            siteId={siteId}
            zoom={previewZoom}
            onZoomChange={setPreviewZoom}
            page={previewPage}
            numPages={previewNumPages}
            onNumPages={setPreviewNumPages}
            onPageChange={setPreviewPage}
            onClose={() => setPreviewModalOpen(false)}
            onOpenInNewTab={(url) => openUrl(url)}
          />
        </FilePreviewModal>
      ) : null}

      <ContextMenu
        visible={menuVisible}
        x={menuPos.x}
        y={menuPos.y}
        items={menuItems}
        onSelect={onSelectMenuItem}
        onClose={() => setMenuVisible(false)}
      />

      {/* Create folder modal */}
      <FileActionModal
        visible={createFolderOpen}
        title="Ny undermapp"
        description="Skapar mapp i SharePoint och uppdaterar listan direkt."
        onClose={() => setCreateFolderOpen(false)}
        primaryLabel="Skapa"
        onPrimary={createFolder}
        primaryDisabled={!safeText(newFolderName)}
      >
        <TextInput
          value={newFolderName}
          onChangeText={setNewFolderName}
          placeholder="Mappnamn"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          autoFocus
          onSubmitEditing={() => {
            if (safeText(newFolderName)) createFolder();
          }}
          returnKeyType="done"
        />
      </FileActionModal>

      <FileActionModal
        visible={renameOpen}
        title="Byt namn"
        description={renameTarget ? `Byter namn på "${safeText(renameTarget?.name) || 'objekt'}".` : ''}
        onClose={() => {
          setRenameOpen(false);
          setRenameTarget(null);
          setRenameError('');
        }}
        primaryLabel="Spara"
        onPrimary={performRename}
        primaryDisabled={!renameTarget || !safeText(renameValue)}
      >
        {renameError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{renameError}</Text>
          </View>
        ) : null}

        <TextInput
          value={renameValue}
          onChangeText={setRenameValue}
          placeholder="Nytt namn"
          placeholderTextColor="#9CA3AF"
          style={styles.input}
          autoFocus
          onSubmitEditing={() => {
            if (renameTarget && safeText(renameValue)) performRename();
          }}
          returnKeyType="done"
        />
      </FileActionModal>

      <FileActionModal
        visible={deleteOpen}
        title="Ta bort"
        description={deleteTarget ? `Tar bort "${safeText(deleteTarget?.name) || 'objekt'}" från SharePoint.` : ''}
        onClose={() => {
          setDeleteOpen(false);
          setDeleteTarget(null);
          setDeleteError('');
        }}
        primaryLabel="Ta bort"
        onPrimary={performDelete}
        primaryDisabled={!deleteTarget}
      >
        {deleteError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{deleteError}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: 12, fontWeight: '400', color: '#64748b' }}>
            Åtgärden kan inte ångras.
          </Text>
        )}
      </FileActionModal>

      <FileActionModal
        visible={moveOpen}
        title="Flytta fil"
        description="Välj en målmapp inom Förfrågningsunderlag."
        onClose={() => setMoveOpen(false)}
        primaryLabel="Flytta"
        onPrimary={performMove}
        primaryDisabled={!moveTarget || !safeText(moveSelectedPath)}
        maxHeight={moveModalMaxHeight}
      >
        {moveError ? (
          <View style={styles.errorBox}>
            <Text style={styles.errorText}>{moveError}</Text>
          </View>
        ) : null}

        <ScrollView style={{ borderWidth: 1, borderColor: '#E6E8EC', borderRadius: 12, backgroundColor: '#fff', maxHeight: moveModalMaxHeight ? Math.max(200, moveModalMaxHeight - 220) : 360 }} contentContainerStyle={{ padding: 10 }}>
          {safeText(scopeRootPath) ? (
            <>
              <Text style={{ fontSize: 11, color: '#64748b', fontWeight: '500', marginBottom: 8 }}>
                {`Rot: /${safeText(scopeRootPath)}`}
              </Text>
              {(Array.isArray(folderChildrenByPath[safeText(scopeRootPath)]) ? folderChildrenByPath[safeText(scopeRootPath)] : []).map((f) =>
                folderRow(f, 0, safeText(scopeRootPath))
              )}
              {Boolean(folderLoading[safeText(scopeRootPath)]) ? (
                <Text style={{ fontSize: 12, color: '#64748b', paddingVertical: 6 }}>Laddar…</Text>
              ) : null}
            </>
          ) : (
            <Text style={{ fontSize: 12, color: '#64748b' }}>Saknar scopeRootPath.</Text>
          )}
        </ScrollView>

        <Text style={{ marginTop: 12, fontSize: 12, fontWeight: '400', color: '#64748b' }} numberOfLines={2}>
          {moveSelectedPath ? `Mål: /${moveSelectedPath}` : 'Välj målmapp…'}
        </Text>
      </FileActionModal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    padding: 18,
    backgroundColor: '#fff',
  },

  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 12,
  },

  dropZoneHover: {
    backgroundColor: '#F8FAFC',
  },

  dropZoneText: {
    fontSize: 11,
    fontWeight: '400',
    color: '#6B7280',
  },

  dropZoneTextSubtle: {
    color: '#94A3B8',
  },

  dropZoneTextActive: {
    color: '#1976D2',
  },

  dropZoneHint: {
    marginLeft: 10,
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '400',
  },

  dropZoneHintSubtle: {
    color: '#CBD5E1',
  },

  dropZoneSubtle: {
    borderColor: '#EDF2F7',
  },

  dropZoneEmpty: {
    backgroundColor: '#F8FAFC',
    borderColor: '#D7DEE8',
  },

  dropZoneActive: {
    borderColor: '#1976D2',
    backgroundColor: 'rgba(25, 118, 210, 0.06)',
  },

  typeBadge: {
    paddingVertical: 2,
    paddingHorizontal: 8,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  typeBadgeText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#475569',
  },

  table: {
    flex: 1,
    minHeight: 0,
    borderWidth: 1,
    borderColor: '#E6E8EC',
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 12,
  },

  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },

  colName: {
    flexGrow: 4,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 0,
  },
  colType: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 74,
    maxWidth: 140,
  },
  colUploadedBy: {
    flexGrow: 2,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 110,
    maxWidth: 220,
  },
  colSize: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: 0,
    minWidth: 70,
    maxWidth: 120,
    textAlign: 'right',
  },
  colModified: {
    flexShrink: 0,
  },
  colMenu: {
    flexShrink: 0,
    textAlign: 'center',
  },

  th: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748b',
    textTransform: 'none',
  },

  tdName: {
    fontSize: 12,
    fontWeight: '400',
    color: '#111',
    flex: 1,
    minWidth: 0,
  },

  tdUploader: {
    fontSize: 12,
    color: '#475569',
  },

  td: {
    fontSize: 12,
    color: '#475569',
  },

  breadcrumbRow: {
    marginTop: 10,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 2,
  },
  breadcrumbPart: {
    flexDirection: 'row',
    alignItems: 'center',
    minWidth: 0,
  },
  breadcrumbText: {
    fontSize: 12,
    fontWeight: '400',
    color: '#64748b',
    maxWidth: 240,
  },
  breadcrumbTextActive: {
    color: '#0F172A',
    fontWeight: '500',
  },
  breadcrumbSep: {
    marginHorizontal: 2,
    fontSize: 12,
    color: '#CBD5E1',
  },

  splitRow: {
    flex: 1,
    minHeight: 0,
    marginTop: 10,
    flexDirection: Platform.OS === 'web' ? 'row' : 'column',
    alignItems: 'stretch',
    gap: 12,
  },
  splitRowSingle: {
    marginTop: 0,
  },
  listPane: {
    flex: 1,
    minHeight: 0,
  },
  previewPane: {
    width: Platform.OS === 'web' ? 520 : '100%',
    minHeight: 0,
  },
  previewPaneStacked: {
    width: '100%',
    height: 420,
  },

  errorBox: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#FCA5A5',
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    padding: 10,
  },

  errorText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '700',
  },

  input: {
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
    fontSize: 14,
    color: '#111',
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { outlineStyle: 'none' } : null),
  },
});
